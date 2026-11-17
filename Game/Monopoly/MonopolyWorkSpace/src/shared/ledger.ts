/**
 * 账本：每一笔记在账上的钱都留下一条不可改的记录。
 *
 * 单独成文件是为了不让规则文件与银行文件互相引用：`rules.ts`（租金、税款、破产）、`bank.ts`（贷款、利息）和
 * `turn.ts`（购买、拍卖、建造、抵押、交易）都往这里写，而它只依赖协议里的类型。
 *
 * 每条记录带唯一编号（就是它在数组里的位置）、房间、玩家、类型、金额、游戏时间以及交易前后余额，一局结束后可以从
 * 头核对每一笔。
 */

import type { LedgerEntry, MonopolyGame } from "./protocol.ts";

/** 游戏时间，从第 0 天 00:00 起算的分钟数。 */
export const gameMinuteOf = (game: MonopolyGame): number => game.clock.day * 1440 + game.clock.minute;

/** 追加一条账本记录。`before` / `after` 是这次操作前后的现金。 */
export function recordLedger(
  game: MonopolyGame,
  playerId: string,
  kind: LedgerEntry["kind"],
  amount: number,
  before: number,
  after: number
): void {
  game.ledger.push({
    id: game.ledger.length + 1,
    room: game.roomCode,
    playerId,
    kind,
    amount,
    gameMinute: gameMinuteOf(game),
    before,
    after,
    status: "ok"
  });
}
