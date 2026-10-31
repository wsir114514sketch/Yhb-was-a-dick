import { describe, expect, it } from "vitest";
import { playGame, runBalance } from "../../tools/balance.ts";
import { chooseAction, tileWorth } from "../../src/shared/bot.ts";
import { answerActions, legalActions, manageActions } from "../../src/shared/legal.ts";
import { applyAction } from "../../src/shared/turn.ts";
import { activePlayer, findPlayer, newGame } from "../../src/shared/rules.ts";
import { REGION_PROPERTIES } from "../../src/shared/board.ts";
import type { MonopolyGame, RoomConfig } from "../../src/shared/protocol.ts";

const people = new Map([["a", { username: "甲", avatarUrl: null }], ["b", { username: "乙", avatarUrl: null }], ["c", { username: "丙", avatarUrl: null }]]);
const config = (over: Partial<RoomConfig> = {}): RoomConfig => ({ maxPlayers: 8, allowSpectators: true, ...over });

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state >>>= 0; state ^= state >> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
}

describe("大富翁：合法操作枚举", () => {
  it("offers a roll to the player whose turn it is, and nothing to anyone else", () => {
    const game = newGame(["a", "b"], people, config(), seeded(1), 1_000);
    const mine = legalActions(game, "a").filter((action) => action.type === "roll");
    expect(mine).toHaveLength(1);
    // Out of turn there is no roll, though money moves are still open.
    expect(legalActions(game, "b").some((action) => action.type === "roll")).toBe(false);
  });

  it("offers endTurn only once the turn's own actions are done", () => {
    const game = newGame(["a", "b"], people, config(), seeded(2), 1_000);
    expect(legalActions(game, "a").some((action) => action.type === "endTurn")).toBe(false);
    applyAction(game, "a", { type: "roll" }, 2_000, seeded(3));
    // Whatever the roll opened, the turn cannot be ended while a question is on the table.
    if (!game.pending) expect(legalActions(game, "a").some((action) => action.type === "endTurn")).toBe(true);
  });

  it("offers a buy only when it can be paid for", () => {
    const game = newGame(["a"], people, config({ startingCash: 10 }), seeded(4), 1_000);
    // 1 + 2 lands on 机会, which is not buyable; walk onto a property directly instead.
    const player = findPlayer(game, "a")!;
    player.position = 9;
    applyAction(game, "a", { type: "roll" }, 2_000, seeded(5));
    if (game.pending?.kind === "buy") {
      // With $10 in hand the price cannot be met, so only the decline is offered.
      const actions = legalActions(game, "a").map((action) => action.type);
      expect(actions).not.toContain("buy");
      expect(actions).toContain("decline");
    }
  });

  it("never offers a build that the even-build rule or a missing group would refuse", () => {
    const game = newGame(["a", "b"], people, config(), seeded(6), 1_000);
    const group = REGION_PROPERTIES["af"]!;
    // Holding one tile of the group is not a monopoly, so no build is offered at all.
    game.ownership.push({ tile: group[0]!.index, ownerId: "a", level: 0, mortgaged: false });
    expect(manageActions(game, "a").some((action) => action.type === "build")).toBe(false);

    // With the whole group held, every unbuilt tile is offered.
    for (const member of group) {
      if (member.index === group[0]!.index) continue;
      game.ownership.push({ tile: member.index, ownerId: "a", level: 0, mortgaged: false });
    }
    const builds = manageActions(game, "a").filter((action) => action.type === "build");
    expect(builds.length).toBe(group.length);
    // And every one of them is actually accepted by the engine.
    for (const action of builds) expect(() => applyAction(game, "a", action, 2_000, seeded(7))).not.toThrow();
  });

  it("offers no action at all to a bankrupt player or after the game has ended", () => {
    const game = newGame(["a", "b"], people, config(), seeded(8), 1_000);
    findPlayer(game, "b")!.bankrupt = true;
    expect(legalActions(game, "b")).toEqual([]);
    game.winner = { playerId: "a", reason: "测试", standings: [] };
    expect(legalActions(game, "a")).toEqual([]);
  });
});

describe("大富翁：机器人", () => {
  it("declines instead of buying when it cannot afford the tile", () => {
    // A tile that would complete a group (worth a premium) but the wallet cannot cover it: the bot must decline, because a
    // refused buy is what used to wedge self-play.
    const game = newGame(["a"], people, config({ startingCash: 100 }), seeded(9), 1_000);
    const group = REGION_PROPERTIES["af"]!;
    // Hold every tile but the first, so that one is the group-completing piece.
    for (const member of group.slice(1)) game.ownership.push({ tile: member.index, ownerId: "a", level: 0, mortgaged: false });
    const target = group[0]!;
    game.pending = { kind: "buy", playerId: "a", tile: target.index, price: target.price };
    expect(findPlayer(game, "a")!.cash).toBeLessThan(target.price);
    // It wants this tile badly, but wanting it is not the same as being able to pay for it.
    expect(chooseAction(game, "a", seeded(11))).toEqual({ type: "decline" });
  });

  it("values a group-completing tile above a lone tile", () => {
    // The premium is what makes the bot finish a group; if it were never applied, the bot would never stretch for one.
    const game = newGame(["a", "b"], people, config(), seeded(30), 1_000);
    const group = REGION_PROPERTIES["af"]!;
    const completing = group[0]!;
    // Holding none of the group: a lone tile is worth just its price.
    expect(tileWorth(game, findPlayer(game, "a")!, completing.index)).toBe(completing.price);
    // Hold every other tile of the group, leaving `completing` as the one piece missing.
    for (const member of group) {
      if (member.index === completing.index) continue;
      game.ownership.push({ tile: member.index, ownerId: "a", level: 0, mortgaged: false });
    }
    expect(tileWorth(game, findPlayer(game, "a")!, completing.index)).toBeGreaterThan(completing.price);
  });

  it("plays a complete game without ever being refused into a dead end", () => {
    const result = playGame(4, seeded(12), {});
    expect(result.turns).toBeGreaterThan(0);
    expect(result.cashNeverNegative).toBe(true);
  });
});

describe("大富翁：自对弈平衡", () => {
  it("finishes every game and never pushes a player below zero", () => {
    // A small sample so the suite stays fast; `npm run balance` runs a larger one.
    const report = runBalance(8, 4, 21);
    expect(report.finished).toBe(report.games);
    expect(report.negativeCashGames).toBe(0);
    // A game has to last long enough to be a game, and not so long the whole table is waiting on the clock.
    expect(report.avgTurns).toBeGreaterThan(20);
  });

  it("makes the expensive side of the board worth more than the cheap side", () => {
    const report = runBalance(8, 4, 33);
    // 北美洲 is the far, dearest group; 南美洲 the cheap corner. Rent has to reward reaching the far side.
    expect(report.regionRent["na"]!).toBeGreaterThan(report.regionRent["sa"]!);
  });
});
