/**
 * 差分器：把两份对局快照的差别翻译成一次性的"动画意图"。
 *
 * 它是纯函数，不碰 DOM，也不参与裁决。动画层只拿意图去演，演的永远是"上一份真相 → 这一份真相"：联机时服务端可能
 * 连发几份快照、跳过中间状态，这里也只给出一条从旧位置到新位置的收敛路径，绝不补放被跳过的中间帧。
 *
 * 本地单机的 `game` 是被引擎原地修改的同一个对象，所以这里保存的是一份独立的摘要，而不是对象引用。
 */

import { BOARD_SIZE, BOARD_TILES, REGIONS, REGION_PROPERTIES, tileName } from "../../shared/board.ts";
import { DECK_CARDS, type CardDeck } from "../../shared/cards.ts";
import type { LogEntry, MonopolyGame } from "../../shared/protocol.ts";

/** 一次掷骰最多走 12 格；超过这个距离的位移不是步行，而是一次跳跃。 */
const MAX_WALK = 12;

export interface FxDigest {
  startedAt: number;
  logLength: number;
  pieces: Record<string, { position: number; inJail: boolean; bankrupt: boolean; cash: number }>;
  /** 按格子的归属与等级。 */
  owners: Record<number, { ownerId: string; level: number }>;
  /** 当前行动者。 */
  turnId: string | undefined;
  /** 进行中拍卖的最高出价；没有拍卖时为 null。 */
  auctionBid: number | null;
}

/** 金币飞行的起止点：一格、一张席位卡，或棋盘中心（没有具体格子的卡牌收支）。 */
export type FxAnchor = { kind: "tile"; tile: number } | { kind: "seat"; playerId: string } | { kind: "centre" };

/** 路径上的一步：`hop` 为 false 是相邻格的一次小跳，为 true 是一段弧线位移。 */
export interface FxStep { tile: number; hop: boolean }

export type FxIntent =
  | {
    type: "movePath";
    playerId: string;
    from: number;
    steps: FxStep[];
    /** 这次位移来自本快照里的一次掷骰：先等骰子落定再走。 */
    afterRoll: boolean;
    /** 过起点（或停在起点）领到的钱，以及在第几步时浮出。 */
    bonus: { amount: number; step: number } | null;
  }
  /** 收款/付款：金币从 from 飞到 to。actorId 是这笔钱的当事人，若他刚走过，等他落地再飞。 */
  | { type: "moneyFlight"; actorId: string; from: FxAnchor; to: FxAnchor; amount: number }
  /** 席位卡上的现金数字从旧值滚到新值。 */
  | { type: "cashRoll"; playerId: string; from: number; to: number }
  /** 建造：房屋升起；`hotel` 为 true 时四栋收拢成酒店。 */
  | { type: "buildRise"; tile: number; level: number; hotel: boolean }
  /** 某区域刚被一人集齐：整组金色扫光一次。 */
  | { type: "monopoly"; tiles: number[] }
  /** 抽牌：牌堆顶牌飞到中心翻面。 */
  | { type: "cardDraw"; deck: CardDeck; title: string; playerId: string }
  /** 进监狱：栏栅落下一次。 */
  | { type: "jailSlam"; playerId: string }
  /** 破产：席位卡盖章。 */
  | { type: "bankruptcy"; playerId: string }
  /** 拍卖出新价：价格数字弹一下。 */
  | { type: "auctionBid"; amount: number }
  /** 回合交接：新行动者的席位卡边框亮一次。 */
  | { type: "turnHandoff"; playerId: string }
  /** 交易成交：地契从 A 的席位滑到 B 的席位。 */
  | { type: "tradeSlide"; fromId: string; toId: string; tiles: number[] }
  /** 交易成交：一条横贯棋盘的横幅，写清双方各给出什么。金额只在一个方向。 */
  | {
    type: "tradeBanner";
    fromId: string; toId: string;
    fromName: string; toName: string;
    fromSeat: number; toSeat: number;
    /** 地名，由发起方交出 / 由对方交出。 */
    give: string[]; take: string[];
    /** 发起方付给对方的现金，0 表示没有。 */
    money: number;
  };

export function digestOf(game: MonopolyGame): FxDigest {
  const pieces: FxDigest["pieces"] = {};
  for (const player of game.players) {
    pieces[player.id] = { position: player.position, inJail: player.inJail, bankrupt: player.bankrupt, cash: player.cash };
  }
  const owners: FxDigest["owners"] = {};
  for (const entry of game.ownership) owners[entry.tile] = { ownerId: entry.ownerId, level: entry.level };
  return {
    startedAt: game.startedAt, logLength: game.log.length, pieces, owners,
    turnId: game.winner ? undefined : game.order[game.turnIndex],
    auctionBid: game.pending?.kind === "auction" ? game.pending.highBid : null
  };
}

/** 一人集齐的区域，值为持有人。 */
function wholeRegions(owners: FxDigest["owners"]): Map<string, string> {
  const held = new Map<string, string>();
  for (const region of REGIONS) {
    const members = REGION_PROPERTIES[region.id] ?? [];
    const first = members[0] ? owners[members[0].index]?.ownerId : undefined;
    if (first && members.every((member) => owners[member.index]?.ownerId === first)) held.set(region.id, first);
  }
  return held;
}

/** 新增日志里的金钱流向，同一对起止点合并；只保留金额最大的 4 笔，避免一屏金币。 */
function flightsFor(fresh: readonly LogEntry[], prev: FxDigest, game: MonopolyGame): FxIntent[] {
  const merged = new Map<string, Extract<FxIntent, { type: "moneyFlight" }>>();
  const key = (anchor: FxAnchor): string => anchor.kind === "tile" ? `t${anchor.tile}` : anchor.kind === "seat" ? `s${anchor.playerId}` : "c";
  for (const entry of fresh) {
    if (!entry.amount || !entry.actorId || entry.kind === "trade") continue;
    const seat: FxAnchor = { kind: "seat", playerId: entry.actorId };
    let from: FxAnchor;
    let to: FxAnchor;
    const owner = entry.tile !== undefined ? game.ownership.find((own) => own.tile === entry.tile)?.ownerId ?? prev.owners[entry.tile]?.ownerId : undefined;
    if (entry.kind === "rent" && entry.tile !== undefined && owner && owner !== entry.actorId) {
      // 租金：付款人的席位 → 业主的席位。
      from = seat;
      to = { kind: "seat", playerId: owner };
    } else {
      const place: FxAnchor = entry.tile !== undefined ? { kind: "tile", tile: entry.tile } : { kind: "centre" };
      [from, to] = entry.amount > 0 ? [place, seat] : [seat, place];
    }
    const id = `${key(from)}>${key(to)}`;
    const existing = merged.get(id);
    if (existing) existing.amount += Math.abs(entry.amount);
    else merged.set(id, { type: "moneyFlight", actorId: entry.actorId, from, to, amount: Math.abs(entry.amount) });
  }
  return [...merged.values()].sort((left, right) => right.amount - left.amount).slice(0, 4);
}

const forward = (from: number, to: number): number => (to - from + BOARD_SIZE) % BOARD_SIZE;

function walk(from: number, distance: number): FxStep[] {
  return Array.from({ length: distance }, (_, index) => ({ tile: (from + index + 1) % BOARD_SIZE, hop: false }));
}

/** 一名玩家从 `from` 到 `to` 的路径：能用骰子解释的部分逐格走，其余部分（卡牌、进监狱）一跳到位。 */
function pathFor(game: MonopolyGame, playerId: string, from: number, to: number, fresh: readonly LogEntry[], jailed: boolean): { steps: FxStep[]; afterRoll: boolean } {
  const rolls = fresh.filter((entry) => entry.kind === "roll" && entry.actorId === playerId).length;
  const roll = game.lastRoll?.byId === playerId ? game.lastRoll : null;
  const steps: FxStep[] = [];
  let at = from;
  // 只有恰好一次掷骰时，骰子点数才能精确解释这段步行；跳过了多份快照时退回到下面的通用规则。
  if (rolls === 1 && roll) {
    const total = roll.dice[0] + roll.dice[1];
    steps.push(...walk(at, total));
    at = (at + total) % BOARD_SIZE;
  } else if (!jailed && forward(from, to) <= MAX_WALK) {
    // 没有可对照的掷骰（如"往前 3 格"的卡牌）：近距离前进照样逐格走。
    steps.push(...walk(at, forward(from, to)));
    at = to;
  }
  if (at !== to) steps.push({ tile: to, hop: true });
  return { steps, afterRoll: rolls > 0 };
}

/** 本快照里该玩家领到的起点工资之和，及应在路径的哪一步浮出。 */
function bonusFor(playerId: string, steps: readonly FxStep[], fresh: readonly LogEntry[]): Extract<FxIntent, { type: "movePath" }>["bonus"] {
  const amount = fresh
    .filter((entry) => entry.kind === "move" && entry.actorId === playerId && (entry.amount ?? 0) > 0)
    .reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  if (amount <= 0) return null;
  const atGo = steps.findIndex((step) => step.tile === 0);
  const firstHop = steps.findIndex((step) => step.hop);
  return { amount, step: atGo >= 0 ? atGo : Math.max(0, firstHop) };
}

/**
 * 比较上一份摘要与新快照，返回意图与新摘要。
 *
 * 没有上一份、换了一局、或日志变短（新开局/重置）时只记下真相，不产生任何意图：首帧与重连不应该"演"一遍历史。
 */
export function diffGames(prev: FxDigest | null, game: MonopolyGame): { intents: FxIntent[]; digest: FxDigest } {
  const digest = digestOf(game);
  if (!prev || prev.startedAt !== game.startedAt || prev.logLength > game.log.length) return { intents: [], digest };
  const fresh = game.log.slice(prev.logLength);
  const intents: FxIntent[] = [];
  const now = digest;
  for (const player of game.players) {
    const before = prev.pieces[player.id];
    if (!before || before.bankrupt || player.bankrupt || before.position === player.position) continue;
    const jailed = player.inJail && !before.inJail;
    const { steps, afterRoll } = pathFor(game, player.id, before.position, player.position, fresh, jailed);
    if (!steps.length) continue;
    intents.push({ type: "movePath", playerId: player.id, from: before.position, steps, afterRoll, bonus: bonusFor(player.id, steps, fresh) });
  }

  intents.push(...flightsFor(fresh, prev, game));

  for (const player of game.players) {
    const before = prev.pieces[player.id];
    if (!before) continue;
    if (before.cash !== player.cash && !player.bankrupt) intents.push({ type: "cashRoll", playerId: player.id, from: before.cash, to: player.cash });
    if (player.inJail && !before.inJail) intents.push({ type: "jailSlam", playerId: player.id });
    if (player.bankrupt && !before.bankrupt) intents.push({ type: "bankruptcy", playerId: player.id });
  }

  for (const [tileKey, entry] of Object.entries(now.owners)) {
    const tile = Number(tileKey);
    const before = prev.owners[tile];
    if (before && before.ownerId === entry.ownerId && entry.level > before.level) {
      intents.push({ type: "buildRise", tile, level: entry.level, hotel: entry.level >= 5 && before.level < 5 });
    }
  }

  const heldBefore = wholeRegions(prev.owners);
  for (const [regionId, ownerId] of wholeRegions(now.owners)) {
    if (heldBefore.get(regionId) !== ownerId) intents.push({ type: "monopoly", tiles: (REGION_PROPERTIES[regionId] ?? []).map((member) => member.index) });
  }

  for (const entry of fresh) {
    if (entry.kind !== "card" || !entry.actorId || !entry.text.includes("抽到")) continue;
    const deck: CardDeck = entry.text.includes("机会") ? "chance" : "fund";
    const drawn = game.drawnCard?.deck === deck && game.drawnCard.byId === entry.actorId ? game.drawnCard.cardId : null;
    intents.push({ type: "cardDraw", deck, playerId: entry.actorId, title: DECK_CARDS[deck].find((card) => card.id === drawn)?.title ?? "" });
  }

  if (now.auctionBid !== null && now.auctionBid > 0 && now.auctionBid !== prev.auctionBid) intents.push({ type: "auctionBid", amount: now.auctionBid });
  if (now.turnId && now.turnId !== prev.turnId) intents.push({ type: "turnHandoff", playerId: now.turnId });

  // 交易达成：地契滑向新主人，同时在棋盘上飘一条横幅说明换了什么。
  const accepted = fresh.find((entry) => entry.kind === "trade" && entry.text.startsWith("交易达成"));
  if (accepted) {
    const moves = new Map<string, number[]>();
    for (const [tileKey, entry] of Object.entries(now.owners)) {
      const before = prev.owners[Number(tileKey)];
      if (before && before.ownerId !== entry.ownerId) {
        const id = `${before.ownerId}>${entry.ownerId}`;
        moves.set(id, [...(moves.get(id) ?? []), Number(tileKey)]);
      }
    }
    for (const [id, tiles] of moves) {
      const [fromId, toId] = id.split(">") as [string, string];
      intents.push({ type: "tradeSlide", fromId, toId, tiles });
    }

    // 发起方与对手从地块的流向里认出来；纯现金交易没有地块可依，只在日志里留一行。
    const actorId = accepted.actorId;
    let otherId: string | undefined;
    const give: number[] = [];
    const take: number[] = [];
    for (const [id, tiles] of moves) {
      const [fromId, toId] = id.split(">") as [string, string];
      if (fromId === actorId) { otherId = toId; give.push(...tiles); }
      else if (toId === actorId) { otherId = fromId; take.push(...tiles); }
    }
    const from = game.players.find((player) => player.id === actorId);
    const to = game.players.find((player) => player.id === otherId);
    const label = (tile: number): string => (BOARD_TILES[tile] ? tileName(BOARD_TILES[tile]!) : "");
    if (from && to) {
      intents.push({
        type: "tradeBanner",
        fromId: from.id, toId: to.id,
        fromName: from.username, toName: to.username,
        fromSeat: from.seat, toSeat: to.seat,
        give: give.map(label).filter(Boolean),
        take: take.map(label).filter(Boolean),
        money: Math.max(0, -(accepted.amount ?? 0))
      });
    }
  }
  return { intents, digest };
}
