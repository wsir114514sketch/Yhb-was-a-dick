import { describe, expect, it } from "vitest";
import { Room } from "../../src/server/room.ts";
import type { MonopolyGame } from "../../src/shared/protocol.ts";

const account = (id: string) => ({ id, username: id, avatarUrl: null });

function started() {
  let now = 1_000;
  const room = new Room({ code: "TEST", maxPlayers: 4, allowSpectators: true, random: () => 0.5, now: () => now });
  room.join(account("a"));
  room.join(account("b"));
  room.start("a");
  return {
    room,
    now: () => now,
    advance(ms: number): void { now += ms; },
    /** 像服务器的每秒计时器那样走：一次一秒，避免被当成进程停顿。 */
    tick(seconds: number): boolean {
      let changed = false;
      for (let second = 0; second < seconds; second += 1) {
        now += 1_000;
        if (room.tickClock()) changed = true;
      }
      return changed;
    }
  };
}

const codeOf = (run: () => void): string | undefined => {
  try { run(); return undefined; } catch (error) { return (error as { code?: string }).code; }
};

describe("房间：游戏时钟", () => {
  it("开局 08:00，每秒检查一次，每 30 秒推进半小时", () => {
    const { room, tick } = started();
    expect(room.game!.clock.minute).toBe(8 * 60);
    expect(tick(29)).toBe(false);
    expect(room.game!.clock.minute).toBe(8 * 60);
    expect(tick(1)).toBe(true);
    expect(room.game!.clock.minute).toBe(8 * 60 + 30);
    expect(tick(30)).toBe(true);
    expect(room.game!.clock.minute).toBe(9 * 60);
  });

  it("只有房主能暂停与恢复；暂停期间时钟不动", () => {
    const { room, tick } = started();
    expect(codeOf(() => room.act("b", { type: "pauseClock" }))).toBe("NOT_HOST");

    room.act("a", { type: "pauseClock" });
    expect(room.game!.clock.paused).toBe(true);
    expect(tick(120)).toBe(false);
    expect(room.game!.clock.minute).toBe(8 * 60);

    expect(codeOf(() => room.act("b", { type: "resumeClock" }))).toBe("NOT_HOST");
    room.act("a", { type: "resumeClock" });
    expect(room.game!.clock.paused).toBe(false);
    expect(tick(30)).toBe(true);
    expect(room.game!.clock.minute).toBe(8 * 60 + 30);
  });

  it("暂停期间不会因为现实时间走完 60 分钟而结束对局", () => {
    const { room, tick } = started();
    room.act("a", { type: "pauseClock" });
    tick(61 * 60);
    expect(room.phase).toBe("playing");
    room.act("a", { type: "resumeClock" });
    tick(1);
    expect(room.phase).toBe("playing");
    expect(room.game!.winner).toBeNull();
  });

  it("进程停顿（超过 5 秒的空档）不计入游戏时间", () => {
    const { room, advance, tick } = started();
    room.tickClock();
    const before = room.game!.clock.minute;
    // 计时器十分钟没有跑：恢复后只补最近一秒，其余算作停机。
    advance(10 * 60_000);
    room.tickClock();
    expect(room.game!.clock.minute).toBe(before);

    tick(30);
    expect(room.game!.clock.minute).toBe(before + 30);
  });

  it("重启恢复时保留暂停状态和时间，并把锚点挪到恢复时刻", () => {
    const { room } = started();
    room.act("a", { type: "pauseClock" });
    const saved = JSON.parse(JSON.stringify(room.game)) as MonopolyGame;

    let restoredAt = 5_000_000;
    const restored = new Room({ code: "TEST", maxPlayers: 4, allowSpectators: true, now: () => restoredAt });
    restored.adopt(saved);
    expect(restored.game!.clock.paused).toBe(true);
    expect(restored.game!.clock.minute).toBe(room.game!.clock.minute);
    expect(restored.game!.clock.anchorAt).toBe(restoredAt);

    restored.act("a", { type: "resumeClock" });
    for (let second = 0; second < 30; second += 1) {
      restoredAt += 1_000;
      restored.tickClock();
    }
    expect(restored.game!.clock.minute).toBe(room.game!.clock.minute + 30);
  });

  it("旧存档缺银行与时钟字段时补齐默认值", () => {
    const { room } = started();
    const legacy = JSON.parse(JSON.stringify(room.game)) as Record<string, unknown>;
    delete legacy.clock;
    delete legacy.ledger;
    delete legacy.bankAuctions;
    delete legacy.seenRequests;
    for (const player of legacy.players as Record<string, unknown>[]) delete player.bank;

    const restored = new Room({ code: "TEST", maxPlayers: 4, allowSpectators: true });
    restored.adopt(legacy as unknown as MonopolyGame);
    expect(restored.game!.clock.minute).toBe(8 * 60);
    expect(restored.game!.ledger).toEqual([]);
    expect(restored.game!.players.every((player) => player.bank.principal === 0 && player.bank.interest === 0)).toBe(true);
  });
});

describe("房间：银行动作", () => {
  it("非房主也能借款，且同一请求只受理一次", () => {
    const { room } = started();
    const before = room.game!.players.find((player) => player.id === "b")!.cash;
    room.act("b", { type: "takeLoan", amount: 500, requestId: "req-1" });
    const after = room.game!.players.find((player) => player.id === "b")!.cash;
    expect(after).toBe(before + 500);
    expect(codeOf(() => room.act("b", { type: "takeLoan", amount: 500, requestId: "req-1" }))).toBe("DUPLICATE_REQUEST");
    expect(room.game!.players.find((player) => player.id === "b")!.cash).toBe(after);
  });
});
