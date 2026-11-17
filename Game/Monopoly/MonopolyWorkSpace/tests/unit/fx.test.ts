import { describe, expect, it } from "vitest";
import { applyAction, goTo } from "../../src/shared/turn.ts";
import { JAIL_TILE, newGame, type Random } from "../../src/shared/rules.ts";
import type { MonopolyGame, RoomConfig } from "../../src/shared/protocol.ts";
import { diffGames, digestOf, type FxIntent } from "../../src/client/fx/diff.ts";

/** 依次给出骰面；用完后重复最后一个。 */
function dice(...faces: number[]): Random {
  let index = 0;
  return () => {
    const face = faces[Math.min(index, faces.length - 1)]!;
    index += 1;
    return (face - 1) / 6 + 1e-9;
  };
}

const people = new Map([["a", { username: "甲", avatarUrl: null }], ["b", { username: "乙", avatarUrl: null }]]);
const config: RoomConfig = { maxPlayers: 2, allowSpectators: false, auctionsEnabled: false };
const fresh = (startedAt = 1000): MonopolyGame => newGame(["a", "b"], people, config, () => 0.5, startedAt);
const player = (game: MonopolyGame, id: string) => game.players.find((entry) => entry.id === id)!;
const roll = (game: MonopolyGame, ...faces: number[]): void => applyAction(game, "a", { type: "roll" }, 2000, dice(...faces));
const only = (intents: FxIntent[]): FxIntent => { expect(intents).toHaveLength(1); return intents[0]!; };

describe("动效差分器", () => {
  it("首帧与换局只记录真相，不产生意图", () => {
    const game = fresh();
    expect(diffGames(null, game).intents).toEqual([]);
    const before = digestOf(game);
    roll(game, 3, 4);
    expect(diffGames(before, fresh(5000)).intents).toEqual([]);
  });

  it("一次掷骰：从起点逐格走到落点，并等骰子落定", () => {
    const game = fresh();
    const before = digestOf(game);
    roll(game, 3, 4);
    const intent = only(diffGames(before, game).intents);
    expect(intent.steps.map((step) => step.tile)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(intent.steps.every((step) => !step.hop)).toBe(true);
    expect(intent.afterRoll).toBe(true);
    expect(intent.bonus).toBeNull();
  });

  it("过起点：工资在路过 0 号格的那一步浮出", () => {
    const game = fresh();
    player(game, "a").position = 44;
    const before = digestOf(game);
    roll(game, 2, 3);
    const intent = only(diffGames(before, game).intents);
    expect(intent.steps.map((step) => step.tile)).toEqual([45, 46, 47, 0, 1]);
    expect(intent.bonus).toEqual({ amount: 200, step: 3 });
  });

  it("踩到前往监狱：先走到那一格，再一跳进监狱", () => {
    const game = fresh();
    player(game, "a").position = 40;
    const before = digestOf(game);
    roll(game, 1, 2);
    const intent = only(diffGames(before, game).intents);
    expect(intent.steps).toEqual([
      { tile: 41, hop: false }, { tile: 42, hop: false }, { tile: 43, hop: false }, { tile: JAIL_TILE, hop: true }
    ]);
  });

  it("跳过中间快照（双点后再掷一次）：只给一条收敛到真相的路径，不重放", () => {
    const game = fresh();
    const before = digestOf(game);
    roll(game, 2, 2);
    roll(game, 1, 2);
    expect(player(game, "a").position).toBe(7);
    const intent = only(diffGames(before, game).intents);
    expect(intent.from).toBe(0);
    expect(intent.steps.at(-1)?.tile).toBe(7);
    expect(intent.steps).toHaveLength(7);
    // 同一份摘要再比一次：没有新变化，就没有新动画。
    const { digest } = diffGames(before, game);
    expect(diffGames(digest, game).intents).toEqual([]);
  });

  it("卡牌直达远处：一跳到位，路过起点的工资随这一跳浮出", () => {
    const game = fresh();
    player(game, "a").position = 40;
    const before = digestOf(game);
    goTo(game, player(game, "a"), 22, true);
    const intent = only(diffGames(before, game).intents);
    expect(intent.steps).toEqual([{ tile: 22, hop: true }]);
    expect(intent.afterRoll).toBe(false);
    expect(intent.bonus).toEqual({ amount: 200, step: 0 });
  });

  it("位置没变的玩家不动", () => {
    const game = fresh();
    const before = digestOf(game);
    roll(game, 3, 4);
    expect(diffGames(before, game).intents.map((intent) => intent.playerId)).toEqual(["a"]);
  });
});
