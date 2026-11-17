/**
 * 局内统计，全部从 `game.log` 派生，不进协议。
 *
 * 唯一的例外是"最富时刻"：日志只记付款方的那一行，收款方的现金变化无法从日志精确还原，所以它由客户端在观看过程中
 * 记录（`trackPeaks`）——中途加入或刷新页面时，只从那一刻开始算。
 */

import type { MonopolyGame } from "../shared/protocol.ts";
import { standingsOf } from "../shared/rules.ts";

export interface GameStats {
  biggestRent: { amount: number; payerId?: string; tile?: number; turn: number } | null;
  doubles: Record<string, number>;
  rentPaid: Record<string, number>;
  peaks: Record<string, { netWorth: number; turn: number }>;
}

export function statsOf(game: MonopolyGame, peaks: GameStats["peaks"] = {}): GameStats {
  let biggestRent: GameStats["biggestRent"] = null;
  const doubles: Record<string, number> = {};
  const rentPaid: Record<string, number> = {};
  for (const entry of game.log) {
    if (entry.kind === "rent" && entry.amount && entry.actorId && entry.text.includes("租金")) {
      const paid = -entry.amount;
      rentPaid[entry.actorId] = (rentPaid[entry.actorId] ?? 0) + paid;
      if (!biggestRent || paid > biggestRent.amount) biggestRent = { amount: paid, payerId: entry.actorId, tile: entry.tile, turn: entry.turn };
    }
    if (entry.kind === "roll" && entry.actorId && entry.text.includes("双骰")) doubles[entry.actorId] = (doubles[entry.actorId] ?? 0) + 1;
  }
  return { biggestRent, doubles, rentPaid, peaks };
}

/** 把这一帧的净资产并入观测到的峰值。返回同一个对象，便于放在 ref 里累计。 */
export function trackPeaks(game: MonopolyGame, peaks: GameStats["peaks"]): GameStats["peaks"] {
  for (const standing of standingsOf(game)) {
    const best = peaks[standing.playerId];
    if (!best || standing.netWorth > best.netWorth) peaks[standing.playerId] = { netWorth: standing.netWorth, turn: game.turn };
  }
  return peaks;
}
