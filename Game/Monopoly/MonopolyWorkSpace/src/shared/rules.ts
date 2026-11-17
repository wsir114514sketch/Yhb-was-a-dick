/**
 * The rules. Pure functions over a `MonopolyGame`: no sockets, no timers, no clock of its own (the caller passes `now`),
 * so every rule here is directly testable and only the server can change a game.
 *
 * This file holds the shared machinery — money, movement, landing on a tile, the event-card effects, the turn skeleton and
 * the final standings. `turn.ts` holds the action dispatcher, which is what a client's button ends up calling.
 */

import {
  BOARD_SIZE, REGION_PROPERTIES, REGION_SIZES,
  commercialAt, tileAt, tileName, TRANSPORT_TILES, UTILITY_TILES
} from "./board.ts";
import { DECK_CARDS } from "./cards.ts";
import { DEFAULT_RULES, RULES_VERSION, formatMoney, type EconomyRules } from "./economy.ts";
import {
  MonopolyRuleError, type LogEntry, type MonopolyGame, type Ownership, type PlayerState, type RoomConfig, type Standing
} from "./protocol.ts";

/** A random source, injected so a test can roll exactly what it wants. */
export type Random = () => number;

/** Fisher–Yates with an injected source, so a test can predict the deck. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap]!, out[index]!];
  }
  return out;
}

/** Two dice from the injected source. */
export function rollDice(random: Random): [number, number] {
  const die = (): number => 1 + Math.floor(random() * 6);
  return [die(), die()];
}

/** The index of the 监狱 tile: the box a jailed piece is drawn in. */
export const JAIL_TILE = Array.from({ length: BOARD_SIZE }, (_, index) => index).find((index) => tileAt(index).kind === "jail") ?? 9;

export const rulesOf = (game: MonopolyGame): EconomyRules => ({ ...DEFAULT_RULES, ...game.config });
export const findPlayer = (game: MonopolyGame, id: string): PlayerState | undefined => game.players.find((player) => player.id === id);
/** The player whose turn it is, or undefined after the game has ended. */
export const activePlayer = (game: MonopolyGame): PlayerState | undefined => findPlayer(game, game.order[game.turnIndex] ?? "");
export const owners = (game: MonopolyGame, ownerId: string): Ownership[] => game.ownership.filter((entry) => entry.ownerId === ownerId);
export const ownershipOf = (game: MonopolyGame, tile: number): Ownership | undefined => game.ownership.find((entry) => entry.tile === tile);
export const nameOf = (game: MonopolyGame, id: string | null | undefined): string => (id ? findPlayer(game, id)?.username ?? id : "银行");

/** Writes one line of the public record. Every money movement has one, so a game can be replayed from the log. */
export function pushLog(game: MonopolyGame, actorId: string | undefined, text: string, kind: LogEntry["kind"], amount?: number, tile?: number): void {
  // `tile` 只在这一行确实关于某一格时才写，旧日志与无关格子的行都没有它。
  game.log.push({ id: game.log.length + 1, turn: game.turn, actorId, text, kind, amount, ...(tile === undefined ? {} : { tile }) });
}

/** A fresh game: seats in order, starting cash, and both decks shuffled from the injected source. */
export function newGame(
  order: readonly string[],
  players: ReadonlyMap<string, { username: string; avatarUrl: string | null }>,
  config: RoomConfig,
  random: Random,
  now: number
): MonopolyGame {
  const rules = { ...DEFAULT_RULES, ...config };
  const states: PlayerState[] = order.map((id, seat) => ({
    id,
    username: players.get(id)?.username ?? id,
    avatarUrl: players.get(id)?.avatarUrl ?? null,
    position: 0, cash: rules.startingCash, bankrupt: false, jailTurns: 0, jailCards: 0,
    active: seat === 0, inJail: false, seat
  }));
  const game: MonopolyGame = {
    rulesVersion: RULES_VERSION,
    config: { ...config },
    turn: 1,
    order: [...order],
    turnIndex: 0,
    stage: "roll",
    players: states,
    ownership: [],
    pending: null,
    lastRoll: null,
    decks: {
      chance: shuffle(DECK_CARDS.chance.map((card) => card.id), random),
      fund: shuffle(DECK_CARDS.fund.map((card) => card.id), random)
    },
    drawnCard: null,
    log: [],
    winner: null,
    startedAt: now,
    turnStartedAt: now
  };
  pushLog(game, undefined, `游戏开始，共 ${order.length} 名玩家，起始资金 ${formatMoney(rules.startingCash)}。`, "end");
  pushLog(game, order[0], `${nameOf(game, order[0]!)} 先手。`, "text");
  return game;
}

// ---- Group helpers ----

/** The buildable tiles of `tile`'s group, which is what decides the group bonus and the building rules. */
export function regionMembers(tile: number): readonly { index: number }[] {
  const info = commercialAt(tile);
  return info ? REGION_PROPERTIES[info.region] ?? [] : [];
}

/** True when one owner holds every property of the group: doubles an unbuilt rent and allows building. */
export function holdsWholeRegion(game: MonopolyGame, ownerId: string, tile: number): boolean {
  const members = regionMembers(tile);
  return members.length > 0 && members.every((member) => ownershipOf(game, member.index)?.ownerId === ownerId);
}

/**
 * Rent for one landing: buildings first, then the group bonus, then the transport ladder and the utility dice rule.
 * A mortgaged tile pays nothing while the rules say mortgages stop rent.
 */
export function rentOf(game: MonopolyGame, owner: Ownership, tile: number): number {
  const info = commercialAt(tile);
  if (!info) return 0;
  const rules = rulesOf(game);
  if (owner.mortgaged && rules.mortgageStopsRent) return 0;
  if (info.kind === "property") {
    if (owner.level > 0) return info.rents[owner.level - 1] ?? info.rent;
    return holdsWholeRegion(game, owner.ownerId, tile) ? info.rent * rules.groupRentBonus : info.rent;
  }
  if (info.kind === "transport") {
    const ladder = rules.transportRent;
    const held = TRANSPORT_TILES.filter((member) => ownershipOf(game, member.index)?.ownerId === owner.ownerId).length;
    return ladder[Math.max(0, Math.min(ladder.length - 1, held - 1))]!;
  }
  const held = UTILITY_TILES.filter((member) => ownershipOf(game, member.index)?.ownerId === owner.ownerId).length;
  const multipliers = rules.utilityMultiplier;
  const multiplier = multipliers[Math.max(0, Math.min(multipliers.length - 1, held - 1))]!;
  // The dice that brought the player here are the ones that count; the engine keeps the last roll.
  const dice = game.lastRoll ? game.lastRoll.dice[0] + game.lastRoll.dice[1] : 7;
  return multiplier * dice;
}

// ---- Money ----

/**
 * The only place a payment can leave a player. Money moves when it is covered; otherwise a `debt` pending opens and the
 * payer has to raise the money or go bankrupt before anything else may happen. Returns whether it was paid.
 */
export function charge(game: MonopolyGame, payerId: string, receiverId: string | null, amount: number, note: string): boolean {
  if (amount <= 0) return true;
  const payer = findPlayer(game, payerId);
  if (!payer || payer.bankrupt) return false;
  if (payer.cash < amount) {
    game.pending = { kind: "debt", playerId: payerId, creditorId: receiverId, amount };
    pushLog(game, payerId, `${payer.username} 需要支付 ${formatMoney(amount)}（${note}）但现金不足，必须变卖、抵押或宣告破产。`, "text");
    return false;
  }
  payer.cash -= amount;
  const receiver = receiverId ? findPlayer(game, receiverId) : undefined;
  if (receiver) receiver.cash += amount;
  return true;
}

/** Money from the bank: it can only add, so it is never refused. */
export function receive(game: MonopolyGame, playerId: string, amount: number): void {
  if (amount <= 0) return;
  const player = findPlayer(game, playerId);
  if (player && !player.bankrupt) player.cash += amount;
}

// ---- Movement ----

/** Forward `steps` tiles, paying the salary once per lap passed. */
export function advance(game: MonopolyGame, player: PlayerState, steps: number): void {
  const salary = rulesOf(game).goSalary;
  const total = player.position + steps;
  player.position = ((total % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  const laps = Math.floor(total / BOARD_SIZE);
  if (laps > 0) {
    receive(game, player.id, salary * laps);
    pushLog(game, player.id, `${player.username} 经过起点，领取 ${formatMoney(salary * laps)}。`, "move", salary * laps, 0);
  }
  pushLog(game, player.id, `${player.username} 走到「${tileName(tileAt(player.position))}」。`, "move", undefined, player.position);
}

/** Move to an exact tile; `collectGo` pays the salary when 起点 is passed on the way. */
export function goTo(game: MonopolyGame, player: PlayerState, tile: number, collectGo: boolean): void {
  const salary = rulesOf(game).goSalary;
  const forward = (tile - player.position + BOARD_SIZE) % BOARD_SIZE;
  if (collectGo && forward > 0 && player.position + forward >= BOARD_SIZE) {
    receive(game, player.id, salary);
    pushLog(game, player.id, `${player.username} 经过起点，领取 ${formatMoney(salary)}。`, "move", salary, 0);
  }
  player.position = tile;
  player.inJail = false;
  pushLog(game, player.id, `${player.username} 前往「${tileName(tileAt(tile))}」。`, "move", undefined, tile);
}

/** Into the jail box, without passing 起点. */
export function sendToJail(game: MonopolyGame, player: PlayerState): void {
  player.position = JAIL_TILE;
  player.inJail = true;
  player.jailTurns = rulesOf(game).jailMaxTurns;
  pushLog(game, player.id, `${player.username} 被送进监狱。`, "jail", undefined, JAIL_TILE);
}

// ---- Landing ----

/**
 * What landing on the current tile does. Runs after a roll, and again after a card has moved a piece, so a card that lands
 * the mover on a property asks the very same question a roll would.
 */
export function landOn(game: MonopolyGame, player: PlayerState, random: Random): void {
  const tile = tileAt(player.position);
  const rules = rulesOf(game);
  switch (tile.kind) {
    case "go":
      receive(game, player.id, rules.goSalary);
      pushLog(game, player.id, `${player.username} 停在起点，领取 ${formatMoney(rules.goSalary)}。`, "move", rules.goSalary, 0);
      break;
    case "jail":
      pushLog(game, player.id, `${player.username} 只是路过监狱。`, "jail", undefined, player.position);
      break;
    case "rest":
      pushLog(game, player.id, `${player.username} 在免费停留处什么也不做。`, "text", undefined, player.position);
      break;
    case "gotojail":
      sendToJail(game, player);
      break;
    case "tax": {
      const due = tile.name === "奢侈税" ? rules.luxuryTax : rules.incomeTax;
      pushLog(game, player.id, `${player.username} 缴纳${tile.name} ${formatMoney(due)}。`, "tax", -due, player.position);
      charge(game, player.id, null, due, tile.name);
      break;
    }
    case "chance":
    case "fund":
      drawCard(game, player, tile.kind, random);
      break;
    case "property":
    case "transport":
    case "utility":
      resolveOwnable(game, player, player.position);
      break;
    default:
      break;
  }
}

/** Landing on something that can be owned: buy prompt, own tile, or rent to its owner. */
export function resolveOwnable(game: MonopolyGame, player: PlayerState, tile: number): void {
  const info = commercialAt(tile);
  if (!info) return;
  const entry = ownershipOf(game, tile);
  if (!entry) {
    game.pending = { kind: "buy", playerId: player.id, tile, price: info.price };
    pushLog(game, player.id, `${player.username} 停在无主的「${info.city}」（${formatMoney(info.price)}）。`, "buy", undefined, tile);
    return;
  }
  if (entry.ownerId === player.id) {
    pushLog(game, player.id, `${player.username} 停在自己的「${info.city}」上。`, "text", undefined, tile);
    return;
  }
  const rules = rulesOf(game);
  if (entry.mortgaged && rules.mortgageStopsRent) {
    pushLog(game, player.id, `「${info.city}」已抵押，不收租金。`, "text", undefined, tile);
    return;
  }
  const rent = rentOf(game, entry, tile);
  pushLog(game, player.id, `${player.username} 向${nameOf(game, entry.ownerId)}支付「${info.city}」租金 ${formatMoney(rent)}。`, "rent", -rent, tile);
  charge(game, player.id, entry.ownerId, rent, `${info.city} 租金`);
}

// ---- Cards ----

function drawCard(game: MonopolyGame, player: PlayerState, deck: "chance" | "fund", random: Random): void {
  if (!game.decks[deck].length) {
    // A long game never runs dry: the deck is reshuffled rather than the draw failing.
    game.decks[deck] = shuffle(DECK_CARDS[deck].map((card) => card.id), random);
    pushLog(game, player.id, `${deck === "chance" ? "机会" : "公共基金"}牌堆洗牌。`, "card");
  }
  const cardId = game.decks[deck].shift()!;
  game.decks[deck].push(cardId);
  game.drawnCard = { deck, cardId, byId: player.id };
  game.pending = { kind: "card", playerId: player.id, deck, cardId };
  pushLog(game, player.id, `${player.username} 抽到一张${deck === "chance" ? "机会" : "公共基金"}卡。`, "card", undefined, player.position);
}

/**
 * What a card's effect does. Kept apart from the card's wording, so the printed text can never decide the outcome: the
 * engine switches on `effect.kind`, never on `text`.
 */
export function applyCard(game: MonopolyGame, playerId: string, deck: "chance" | "fund", cardId: string, random: Random): void {
  const card = DECK_CARDS[deck].find((entry) => entry.id === cardId);
  const player = findPlayer(game, playerId);
  if (!card || !player) return;
  const effect = card.effect;
  switch (effect.kind) {
    case "money":
      if (effect.amount >= 0) {
        receive(game, playerId, effect.amount);
        pushLog(game, playerId, `${player.username} 领取 ${formatMoney(effect.amount)}。`, "card", effect.amount);
      } else {
        pushLog(game, playerId, `${player.username} 缴纳 ${formatMoney(-effect.amount)}。`, "card", effect.amount);
        charge(game, playerId, null, -effect.amount, card.title);
      }
      break;
    case "eachPlayer": {
      const others = game.players.filter((entry) => entry.id !== playerId && !entry.bankrupt);
      if (effect.amount < 0) {
        // One at a time, so the debt flow can start at the first payer who cannot cover it.
        for (const other of others) if (!charge(game, playerId, other.id, -effect.amount, card.title)) break;
        pushLog(game, playerId, `${player.username} 向每位其他玩家支付 ${formatMoney(-effect.amount)}。`, "card", effect.amount);
      } else {
        for (const other of others) charge(game, other.id, playerId, effect.amount, card.title);
        pushLog(game, playerId, `${player.username} 向每位其他玩家收取 ${formatMoney(effect.amount)}。`, "card");
      }
      break;
    }
    case "repairs": {
      const mine = owners(game, playerId);
      const houses = mine.filter((entry) => entry.level > 0 && entry.level < 5).reduce((sum, entry) => sum + entry.level, 0);
      const hotels = mine.filter((entry) => entry.level >= 5).length;
      const due = houses * effect.perHouse + hotels * effect.perHotel;
      pushLog(game, playerId, `${player.username} 维修房屋 ${houses} 栋、酒店 ${hotels} 座，缴纳 ${formatMoney(due)}。`, "card", -due);
      charge(game, playerId, null, due, card.title);
      break;
    }
    case "moveTo":
      goTo(game, player, effect.tile, effect.collectGo);
      landOn(game, player, random);
      break;
    case "moveBy":
      advance(game, player, effect.steps);
      landOn(game, player, random);
      break;
    case "goToJail":
      sendToJail(game, player);
      break;
    case "jailFree":
      player.jailCards += 1;
      pushLog(game, playerId, `${player.username} 获得一张免费出狱卡。`, "card");
      break;
    case "globalLevy":
      for (const other of game.players.filter((entry) => !entry.bankrupt)) {
        pushLog(game, other.id, `${other.username} 分摊 ${formatMoney(effect.amount)}。`, "card", -effect.amount);
        charge(game, other.id, null, effect.amount, card.title);
      }
      break;
    default:
      break;
  }
}

// ---- Turn skeleton ----

/** Hands the turn to the next player who is still in the game, and finishes the game if fewer than two are left. */
export function nextTurn(game: MonopolyGame, now: number): void {
  const alive = game.players.filter((player) => !player.bankrupt);
  if (alive.length <= 1) { finishGame(game, now); return; }
  let index = game.turnIndex;
  for (let step = 0; step < game.order.length; step += 1) {
    index = (index + 1) % game.order.length;
    const candidate = findPlayer(game, game.order[index]!);
    if (candidate && !candidate.bankrupt) break;
  }
  game.turnIndex = index;
  game.turn += 1;
  game.stage = "roll";
  game.pending = null;
  game.lastRoll = null;
  game.drawnCard = null;
  game.turnStartedAt = now;
  for (const player of game.players) player.active = player.id === game.order[index];
  pushLog(game, game.order[index], `轮到 ${nameOf(game, game.order[index])}。`, "text");
}

/**
 * Ends the game: where everyone finished, and who won. The assets win condition (and a game stopped by the clock) ranks by
 * net worth; otherwise the last player standing wins.
 */
export function finishGame(game: MonopolyGame, now: number, reason?: string): void {
  if (game.winner) return;
  const rules = rulesOf(game);
  const standings = standingsOf(game);
  const alive = standings.filter((entry) => !entry.bankrupt);
  const byAssets = rules.winCondition === "assets" || reason === "时间到";
  const winner = byAssets
    ? [...alive].sort((left, right) => right.netWorth - left.netWorth)[0] ?? null
    : alive[0] ?? null;
  game.winner = {
    playerId: winner?.playerId ?? null,
    reason: reason ?? (alive.length <= 1 ? "其余玩家均已破产" : `${Math.round((now - game.startedAt) / 60000)} 分钟后结束`),
    standings: [...standings].sort((left, right) => Number(left.bankrupt) - Number(right.bankrupt) || right.netWorth - left.netWorth)
  };
  game.pending = null;
  pushLog(game, winner?.playerId, `游戏结束：${winner ? `${winner.username} 获胜（${game.winner.reason}）` : "无人获胜"}`, "end");
}

/** cash + what the tiles are worth + what is built on them − what is owed on mortgages. */
export function standingsOf(game: MonopolyGame): Standing[] {
  const rules = rulesOf(game);
  return game.players.map((player) => {
    let propertyValue = 0;
    let buildingValue = 0;
    let mortgageDebt = 0;
    for (const entry of owners(game, player.id)) {
      const info = commercialAt(entry.tile);
      if (!info) continue;
      propertyValue += info.price * (entry.mortgaged ? rules.assetValue.mortgagedDiscount : rules.assetValue.property);
      buildingValue += entry.level * info.buildCost * rules.assetValue.building;
      if (entry.mortgaged) mortgageDebt += Math.round(info.mortgage * (1 + rules.mortgageInterest));
    }
    const netWorth = player.cash + propertyValue + buildingValue - mortgageDebt;
    return { playerId: player.id, username: player.username, cash: player.cash, propertyValue, buildingValue, mortgageDebt, netWorth, bankrupt: player.bankrupt };
  });
}

/** The clock: called by the room on a timer. Ends the game at the time limit. */
export function checkClock(game: MonopolyGame, now: number): void {
  const rules = rulesOf(game);
  if (game.winner || rules.timeLimitMinutes <= 0) return;
  if (now - game.startedAt >= rules.timeLimitMinutes * 60_000) finishGame(game, now, "时间到");
}

export { MonopolyRuleError, REGION_SIZES };
