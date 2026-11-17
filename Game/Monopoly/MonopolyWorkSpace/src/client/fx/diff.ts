/**
 * 差分器：把两份对局快照的差别翻译成一次性的"动画意图"。
 *
 * 它是纯函数，不碰 DOM，也不参与裁决。动画层只拿意图去演，演的永远是"上一份真相 → 这一份真相"：联机时服务端可能
 * 连发几份快照、跳过中间状态，这里也只给出一条从旧位置到新位置的收敛路径，绝不补放被跳过的中间帧。
 *
 * 本地单机的 `game` 是被引擎原地修改的同一个对象，所以这里保存的是一份独立的摘要，而不是对象引用。
 */

import { BOARD_SIZE } from "../../shared/board.ts";
import type { LogEntry, MonopolyGame } from "../../shared/protocol.ts";

/** 一次掷骰最多走 12 格；超过这个距离的位移不是步行，而是一次跳跃。 */
const MAX_WALK = 12;

export interface FxDigest {
  startedAt: number;
  logLength: number;
  pieces: Record<string, { position: number; inJail: boolean; bankrupt: boolean }>;
}

/** 路径上的一步：`hop` 为 false 是相邻格的一次小跳，为 true 是一段弧线位移。 */
export interface FxStep { tile: number; hop: boolean }

export type FxIntent = {
  type: "movePath";
  playerId: string;
  from: number;
  steps: FxStep[];
  /** 这次位移来自本快照里的一次掷骰：先等骰子落定再走。 */
  afterRoll: boolean;
  /** 过起点（或停在起点）领到的钱，以及在第几步时浮出。 */
  bonus: { amount: number; step: number } | null;
};

export function digestOf(game: MonopolyGame): FxDigest {
  const pieces: FxDigest["pieces"] = {};
  for (const player of game.players) {
    pieces[player.id] = { position: player.position, inJail: player.inJail, bankrupt: player.bankrupt };
  }
  return { startedAt: game.startedAt, logLength: game.log.length, pieces };
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
function bonusFor(playerId: string, steps: readonly FxStep[], fresh: readonly LogEntry[]): FxIntent["bonus"] {
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
  for (const player of game.players) {
    const before = prev.pieces[player.id];
    if (!before || before.bankrupt || player.bankrupt || before.position === player.position) continue;
    const jailed = player.inJail && !before.inJail;
    const { steps, afterRoll } = pathFor(game, player.id, before.position, player.position, fresh, jailed);
    if (!steps.length) continue;
    intents.push({ type: "movePath", playerId: player.id, from: before.position, steps, afterRoll, bonus: bonusFor(player.id, steps, fresh) });
  }
  return { intents, digest };
}
