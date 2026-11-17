import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/shared/turn.ts";
import { DEFAULT_RULES } from "../../src/shared/economy.ts";
import { advanceGameClock, dayPartAt, formatGameTime, setClockPaused } from "../../src/shared/clock.ts";
import { takeLoan, repayLoan, settleDailyInterest } from "../../src/shared/bank.ts";
import { advance, landOn, newGame, ownershipOf, type Random } from "../../src/shared/rules.ts";
import type { MonopolyGame, PlayerState, RoomConfig } from "../../src/shared/protocol.ts";

const people = new Map([["a", { username: "甲", avatarUrl: null }], ["b", { username: "乙", avatarUrl: null }], ["c", { username: "丙", avatarUrl: null }]]);
const config = (over: Partial<RoomConfig> = {}): RoomConfig => ({ maxPlayers: 8, allowSpectators: true, ...over });
const random: Random = () => 0.5;

function game(order: string[] = ["a", "b"], over: Partial<RoomConfig> = {}): MonopolyGame {
  return newGame(order, people, config(over), random, 1_000);
}

const player = (state: MonopolyGame, id: string): PlayerState => state.players.find((entry) => entry.id === id)!;

/** Puts a tile in someone's hands directly; these tests are about the bank and the clock, not about buying. */
function give(state: MonopolyGame, ownerId: string, tile: number, level = 0, mortgaged = false): void {
  const existing = ownershipOf(state, tile);
  if (existing) { existing.ownerId = ownerId; existing.level = level; existing.mortgaged = mortgaged; return; }
  state.ownership.push({ tile, ownerId, level, mortgaged });
}

const errorCode = (run: () => void): string | undefined => {
  try { run(); return undefined; } catch (error) { return (error as { code?: string }).code; }
};

describe("游戏时钟", () => {
  it("从 08:00 开始，现实 30 秒走半小时，60 秒走一小时", () => {
    const state = game();
    expect(state.clock.day).toBe(0);
    expect(state.clock.minute).toBe(8 * 60);
    expect(formatGameTime(state.clock.minute)).toBe("08:00");

    expect(advanceGameClock(state, 1_000 + 30_000)).toBe(true);
    expect(state.clock.minute).toBe(8 * 60 + 30);
    expect(advanceGameClock(state, 1_000 + 60_000)).toBe(true);
    expect(state.clock.minute).toBe(9 * 60);
  });

  it("不足半步的时间留到下一次，不会自己跳时间", () => {
    const state = game();
    expect(advanceGameClock(state, 1_000 + 29_999)).toBe(false);
    expect(state.clock.minute).toBe(8 * 60);
    expect(advanceGameClock(state, 1_000 + 59_999)).toBe(true);
    expect(state.clock.minute).toBe(8 * 60 + 30);
  });

  it("暂停时完全冻结，恢复后从当前时刻继续，暂停期间不计时", () => {
    const state = game();
    expect(setClockPaused(state, true, 1_000)).toBe(true);
    expect(advanceGameClock(state, 1_000 + 10 * 60_000)).toBe(false);
    expect(state.clock.minute).toBe(8 * 60);

    expect(setClockPaused(state, false, 1_000 + 10 * 60_000)).toBe(true);
    expect(advanceGameClock(state, 1_000 + 10 * 60_000 + 30_000)).toBe(true);
    expect(state.clock.minute).toBe(8 * 60 + 30);
  });

  it("对局结束后时钟不再走", () => {
    const state = game();
    state.winner = { playerId: "a", reason: "测试", standings: [] };
    expect(advanceGameClock(state, 1_000 + 30_000)).toBe(false);
    expect(state.clock.minute).toBe(8 * 60);
  });

  it("把六个时段按游戏时间分开", () => {
    expect(dayPartAt(5 * 60)).toBe("predawn");
    expect(dayPartAt(6 * 60)).toBe("sunrise");
    expect(dayPartAt(8 * 60)).toBe("day");
    expect(dayPartAt(16 * 60)).toBe("dusk");
    expect(dayPartAt(18 * 60)).toBe("evening");
    expect(dayPartAt(23 * 60)).toBe("night");
    expect(dayPartAt(4 * 60)).toBe("night");
  });
});

describe("银行贷款与利息", () => {
  it("借出固定档位，钱立即到账并记进账本与日志", () => {
    const state = game();
    takeLoan(state, "a", 1_000, "r1");
    const a = player(state, "a");
    expect(a.cash).toBe(DEFAULT_RULES.startingCash + 1_000);
    expect(a.bank).toEqual({ principal: 1_000, interest: 0 });
    const entry = state.ledger.at(-1)!;
    expect(entry).toMatchObject({ room: "local", playerId: "a", kind: "loan", amount: 1_000, before: 1_500, after: 2_500 });
    expect(state.log.at(-1)?.kind).toBe("loan");
  });

  it("只有三档金额，未还本金上限 $3,000", () => {
    const state = game();
    expect(errorCode(() => takeLoan(state, "a", 700, "x"))).toBe("LOAN_AMOUNT");
    takeLoan(state, "a", 2_000, "r1");
    expect(errorCode(() => takeLoan(state, "a", 2_000, "r2"))).toBe("LOAN_LIMIT");
    takeLoan(state, "a", 1_000, "r3");
    expect(player(state, "a").bank.principal).toBe(3_000);
  });

  it("同一个请求编号只受理一次，重放不会多借钱", () => {
    const state = game();
    takeLoan(state, "a", 500, "same");
    expect(errorCode(() => takeLoan(state, "a", 500, "same"))).toBe("DUPLICATE_REQUEST");
    expect(player(state, "a").cash).toBe(2_000);
    expect(player(state, "a").bank.principal).toBe(500);
  });

  it("每天 00:00 按未还本金 2% 计息，向上取整，无复利，每个游戏日只结算一次", () => {
    const state = game();
    takeLoan(state, "a", 1_000, "r1");
    // 08:00 到次日 00:00 是 16 个游戏小时 = 32 个半小时步长。
    advanceGameClock(state, 1_000 + 32 * 30_000);
    expect(state.clock.day).toBe(1);
    expect(state.clock.minute).toBe(0);
    expect(player(state, "a").bank.interest).toBe(20);
    expect(state.clock.settledDay).toBe(1);

    // 同一天再结算不会重复计息。
    settleDailyInterest(state, 1);
    expect(player(state, "a").bank.interest).toBe(20);

    // 第二天只对本金计息，利息不滚利息。
    advanceGameClock(state, 1_000 + (32 + 48) * 30_000);
    expect(state.clock.day).toBe(2);
    expect(player(state, "a").bank.interest).toBe(40);
  });

  it("还款先息后本：本金 $1,000、利息 $40，还 $300 → 利息清零，本金剩 $740", () => {
    const state = game();
    const a = player(state, "a");
    a.bank = { principal: 1_000, interest: 40 };
    repayLoan(state, "a", 300, "repay-1");
    expect(a.bank).toEqual({ principal: 740, interest: 0 });
    expect(a.cash).toBe(1_200);
    expect(state.ledger.at(-1)).toMatchObject({ kind: "repay", amount: 300, before: 1_500, after: 1_200 });
  });

  it("不允许超额还款、超过现金还款，也不会自动扣款", () => {
    const state = game();
    const a = player(state, "a");
    expect(errorCode(() => repayLoan(state, "a", 100, "none"))).toBe("NOTHING_TO_REPAY");
    a.bank = { principal: 500, interest: 10 };
    expect(errorCode(() => repayLoan(state, "a", 511, "over"))).toBe("REPAY_TOO_MUCH");
    a.cash = 100;
    expect(errorCode(() => repayLoan(state, "a", 200, "broke"))).toBe("NOT_ENOUGH_CASH");
    expect(a.bank.interest).toBe(10);
    expect(a.cash).toBe(100);
  });

  it("利息结算只是挂账，不动现金、也不会直接破产", () => {
    const state = game();
    const a = player(state, "a");
    a.bank = { principal: 2_000, interest: 0 };
    a.cash = 0;
    settleDailyInterest(state, 1);
    expect(a.bank.interest).toBe(40);
    expect(a.cash).toBe(0);
    expect(a.bankrupt).toBe(false);
    expect(state.winner).toBeNull();
  });
});

describe("经典规则差异", () => {
  it("停在起点只领一次工资", () => {
    const state = game();
    const a = player(state, "a");
    a.position = 44;
    advance(state, a, 4);
    expect(a.cash).toBe(DEFAULT_RULES.startingCash + DEFAULT_RULES.goSalary);
    landOn(state, a, random);
    expect(a.cash).toBe(DEFAULT_RULES.startingCash + DEFAULT_RULES.goSalary);
  });

  it("同组还有建筑时，任何一块都不能抵押", () => {
    const state = game();
    give(state, "a", 1, 0);
    give(state, "a", 2, 1);
    expect(errorCode(() => applyAction(state, "a", { type: "mortgage", tile: 1 }, 2_000, random))).toBe("HAS_BUILDINGS");
    expect(ownershipOf(state, 1)?.mortgaged).toBe(false);
    give(state, "a", 2, 0);
    applyAction(state, "a", { type: "mortgage", tile: 1 }, 2_000, random);
    expect(ownershipOf(state, 1)?.mortgaged).toBe(true);
  });

  it("抵押地产换手时，新业主向银行支付抵押额的 10%", () => {
    const state = game();
    give(state, "a", 1, 0, true);
    const b = player(state, "b");
    const before = b.cash;
    applyAction(state, "a", {
      type: "offerTrade", toId: "b",
      offer: { give: [1], take: [], money: 0, jailCards: 0 }
    }, 2_000, random);
    applyAction(state, "b", { type: "answerTrade", accept: true }, 2_000, random);
    expect(ownershipOf(state, 1)).toMatchObject({ ownerId: "b", mortgaged: true });
    expect(b.cash).toBe(before - 3); // 里约热内卢抵押价值 $30 的 10%
    expect(state.ledger.at(-1)).toMatchObject({ playerId: "b", kind: "trade", amount: 3 });
  });

  it("欠银行破产时地产回到银行，并逐间重新拍卖", () => {
    const state = game(["a", "b", "c"]);
    give(state, "a", 1, 2);
    applyAction(state, "a", { type: "declareBankrupt" }, 2_000, random);
    expect(player(state, "a").bankrupt).toBe(true);
    expect(ownershipOf(state, 1)).toBeUndefined();
    expect(state.pending).toMatchObject({ kind: "auction", tile: 1 });
    expect(state.bankAuctions).toEqual([]);
  });

  it("银行清盘的拍卖结束后，下一位玩家仍然可以掷骰", () => {
    const state = game(["a", "b", "c"]);
    give(state, "a", 1, 2);
    applyAction(state, "a", { type: "declareBankrupt" }, 2_000, random);
    expect(state.order[state.turnIndex]).toBe("b");
    expect(state.stage).toBe("roll");
    for (const bidder of ["b", "c"]) applyAction(state, bidder, { type: "pass" }, 2_000, random);
    expect(state.pending).toBeNull();
    expect(state.stage).toBe("roll");
    applyAction(state, "b", { type: "roll" }, 2_000, () => 0.9);
  });
});
