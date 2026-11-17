/**
 * 飞行棋联机房间的行为测试：座位、回合、骰子节奏、断线托管、观战与多标签页。
 *
 * 这些测试直接驱动 `Room`，不经过 Socket.IO —— namespace 只是把 socket 翻译成账号 id，
 * 规则与权限都在房间层，所以这里能覆盖最关键的服务端裁决。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Room, RoomError } from "../../../../Flying Chess/FlyingChessWorkSpace/src/server/room.ts";
import { GOAL_STEP } from "../../../../Flying Chess/FlyingChessWorkSpace/src/game/board.ts";

const alice = { id: "acc-alice", username: "爱丽丝" };
const bob = { id: "acc-bob", username: "鲍勃" };
const carol = { id: "acc-carol", username: "卡罗尔" };

function diceQueue(...values: number[]): { next: () => number; push: (value: number) => void } {
  const queue = [...values];
  return {
    next: () => {
      const value = queue.shift() ?? 4;
      return (value - 0.5) / 6;
    },
    push: (value: number) => { queue.push(value); }
  };
}

function expectCode(fn: () => void, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RoomError);
    expect((error as RoomError).code).toBe(code);
    return;
  }
  throw new Error(`expected RoomError ${code}`);
}

describe("飞行棋房间", () => {
  let room: Room;
  let random: ReturnType<typeof diceQueue>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    random = diceQueue();
    room = new Room({ code: "ABCD", maxPlayers: 2, random: random.next });
  });

  afterEach(() => {
    room.dispose();
    vi.useRealTimers();
  });

  function seatTwoAndStart(): void {
    room.join(alice);
    room.join(bob);
    room.setReady(bob.id, true);
    expect(room.startAllowed).toBe(true);
    room.start(alice.id);
  }

  it("两人满员且准备后开局，座位顺序就是行动顺序", () => {
    room.join(alice);
    expect(room.startAllowed).toBe(false);
    room.join(bob);
    expect(room.startAllowed).toBe(false);
    room.setReady(bob.id, true);
    expect(room.startAllowed).toBe(true);
    room.start(alice.id);

    expect(room.phase).toBe("playing");
    const state = room.publicState(alice.id);
    expect(state.phase).toBe("roll");
    expect(state.players.map((player) => player.color)).toEqual(["red", "green"]);
    expect(state.turn).toBe(0);
    expect(state.players[0]?.isHost).toBe(true);
  });

  it("非房主不能开始，非房主不能改设置", () => {
    room.join(alice);
    room.join(bob);
    room.setReady(bob.id, true);
    expectCode(() => room.start(bob.id), "NOT_HOST");
    expectCode(() => room.configure(bob.id, { sixOnly: true }), "NOT_HOST");
  });

  it("非当前回合玩家不能掷骰；骰子停住期间不能行动", () => {
    seatTwoAndStart();
    expectCode(() => room.roll(bob.id), "NOT_YOUR_TURN");

    random.push(1); // 全员在基地，1 点无合法移动，直接换人
    room.roll(alice.id);
    expect(room.publicState(alice.id).dice).toBe(1);
    expect(room.publicState(alice.id).turn).toBe(1);
    expect(room.publicState(alice.id).event).toContain("跳过");
    // 骰子停住 1.1 秒，下一位不能立刻掷。
    expectCode(() => room.roll(bob.id), "NOT_YET");
    vi.advanceTimersByTime(1100);
    expect(() => room.roll(bob.id)).not.toThrow();
  });

  it("掷出 6 获得额外回合；重复掷骰只结算一次", () => {
    seatTwoAndStart();
    random.push(6);
    room.roll(alice.id);
    const paused = room.publicState(alice.id);
    expect(paused.phase).toBe("move");
    expect(paused.legalPlaneIndices).toEqual([0, 1, 2, 3]);
    expect(paused.notBefore).toBeGreaterThan(Date.now());
    expectCode(() => room.roll(alice.id), "NOT_NOW");
    expectCode(() => room.move(alice.id, 0), "NOT_YET");

    vi.advanceTimersByTime(1100);
    room.move(alice.id, 2);
    const after = room.publicState(alice.id);
    expect(after.players[0]?.planes[2]?.step).toBe(0);
    expect(after.turn).toBe(0);
    expect(after.phase).toBe("roll");
    expectCode(() => room.roll(bob.id), "NOT_YOUR_TURN");
  });

  it("连续三次 6：第三次作废并换人", () => {
    seatTwoAndStart();
    for (let index = 0; index < 2; index += 1) {
      random.push(6);
      room.roll(alice.id);
      vi.advanceTimersByTime(1100);
      room.move(alice.id, 0);
    }
    random.push(6);
    room.roll(alice.id);
    vi.advanceTimersByTime(1100);
    const state = room.publicState(alice.id);
    expect(state.phase).toBe("roll");
    expect(state.turn).toBe(1);
    expect(state.event).toContain("作废");
    expect(state.players[0]?.sixStreak).toBe(0);
  });

  it("机号必须在服务端算出的合法列表里", () => {
    seatTwoAndStart();
    random.push(6);
    room.roll(alice.id);
    vi.advanceTimersByTime(1100);
    expectCode(() => room.move(bob.id, 0), "NOT_YOUR_TURN");
    expectCode(() => room.move(alice.id, 5), "INVALID_MOVE");
    expectCode(() => room.move(alice.id, -1), "INVALID_MOVE");
  });

  it("观战者可以看，不能操作", () => {
    seatTwoAndStart();
    room.spectate(carol);
    const state = room.publicState(carol.id);
    expect(state.youAreSpectator).toBe(true);
    expect(state.onGame).toBe(false);
    expect(state.players).toHaveLength(2);
    expectCode(() => room.roll(carol.id), "NOT_IN_ROOM");
  });

  it("同一账号多开时只有最近的连接能操作", () => {
    room.join(alice, "socket-1");
    room.join(bob);
    room.join(alice, "socket-2"); // 刷新出的新标签页
    room.setReady(bob.id, true);
    room.start(alice.id);

    expectCode(() => room.roll(alice.id, "socket-1"), "READ_ONLY");
    random.push(6);
    expect(() => room.roll(alice.id, "socket-2")).not.toThrow();
    expect(room.publicState(alice.id, "socket-1").active).toBe(false);
    expect(room.publicState(alice.id, "socket-2").active).toBe(true);
  });

  it("断线 90 秒内保留座位，超时对局交给电脑托管", () => {
    seatTwoAndStart();
    room.disconnect(alice.id);
    const offline = room.publicState(alice.id);
    expect(offline.players[0]?.connected).toBe(false);
    expect(offline.players[0]?.isBot).toBe(false);

    vi.advanceTimersByTime(89_000);
    expect(room.publicState(alice.id).players[0]?.isBot).toBe(false);

    random.push(6); // 托管后由服务端自动掷骰
    vi.advanceTimersByTime(2_000);
    const converted = room.publicState(alice.id);
    expect(converted.players[0]?.isBot).toBe(true);
    expect(room.publicState(bob.id).dice).toBe(6);
  });

  it("宽限期内重连回到原座位并收回托管", () => {
    seatTwoAndStart();
    room.disconnect(alice.id);
    vi.advanceTimersByTime(3_000);
    room.join(alice);
    const state = room.publicState(alice.id);
    expect(state.players[0]?.connected).toBe(true);
    expect(state.players[0]?.isBot).toBe(false);
  });

  it("等待室宽限超时释放座位并移交房主", () => {
    room.join(alice);
    room.join(bob);
    room.disconnect(alice.id);
    vi.advanceTimersByTime(91_000);
    const state = room.publicState(bob.id);
    expect(state.players).toHaveLength(1);
    expect(state.players[0]?.id).toBe(bob.id);
    expect(state.hostId).toBe(bob.id);
  });

  it("房主主动离开后移交给最早加入的剩余真人", () => {
    const three = new Room({ code: "EFGH", maxPlayers: 3, random: random.next });
    try {
      three.join(alice);
      three.join(bob);
      three.join(carol);
      three.leave(alice.id);
      expect(three.publicState(bob.id).hostId).toBe(bob.id);
    } finally {
      three.dispose();
    }
  });

  it("电脑座位可托管空位并自动行动", () => {
    room.join(alice);
    room.toggleBot(alice.id, "green", true);
    expect(room.startAllowed).toBe(true);
    room.start(alice.id);

    random.push(1); // 爱丽丝掷 1，无合法移动，轮到电脑
    room.roll(alice.id);
    random.push(6); // 电脑掷 6
    vi.advanceTimersByTime(1_800);
    expect(room.publicState(alice.id).dice).toBe(6);
    expect(room.publicState(alice.id).phase).toBe("move");
  });

  it("所有真人离开后房间立即回收", () => {
    let emptied = false;
    room.onEmpty = () => { emptied = true; };
    room.join(alice);
    room.toggleBot(alice.id, "green", true);
    room.start(alice.id);
    room.leave(alice.id);
    expect(emptied).toBe(true);
  });

  it("四架到终点即获胜，之后不再接受操作", () => {
    seatTwoAndStart();
    const game = room.game!;
    game.players[0]!.planes.forEach((plane, index) => {
      plane.step = index === 3 ? GOAL_STEP - 1 : GOAL_STEP;
    });
    random.push(1);
    room.roll(alice.id);
    vi.advanceTimersByTime(1100);
    room.move(alice.id, 3);
    const state = room.publicState(alice.id);
    expect(state.phase).toBe("over");
    expect(state.winner).toBe("red");
    expectCode(() => room.roll(bob.id), "NOT_STARTED");
  });

  it("落盘快照可以恢复未完成的对局", () => {
    seatTwoAndStart();
    random.push(6);
    room.roll(alice.id);
    vi.advanceTimersByTime(1100);
    room.move(alice.id, 1);

    const stored = room.serialize();
    const restored = new Room({ code: stored.code, maxPlayers: stored.maxPlayers, sixOnly: stored.sixOnly });
    restored.adopt(stored);
    const state = restored.publicState(alice.id);
    expect(state.phase).toBe("roll");
    expect(state.players).toHaveLength(2);
    expect(state.players[0]?.planes[1]?.step).toBe(0);
    expect(state.players[0]?.connected).toBe(false);
    restored.dispose();
  });
});
