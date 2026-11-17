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
type Move = Extract<FxIntent, { type: "movePath" }>;
const moves = (intents: FxIntent[]): Move[] => intents.filter((intent): intent is Move => intent.type === "movePath");
const only = (intents: FxIntent[]): Move => { const list = moves(intents); expect(list).toHaveLength(1); return list[0]!; };

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
    // 金币与数字滚动也只给一份：从旧现金直接滚到新现金。
    const rolls = diffGames(before, game).intents.filter((intent) => intent.type === "cashRoll");
    expect(rolls).toEqual([{ type: "cashRoll", playerId: "a", from: 1500, to: player(game, "a").cash }]);
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
    expect(moves(diffGames(before, game).intents).map((intent) => intent.playerId)).toEqual(["a"]);
  });
});

describe("日志的格子字段", () => {
  it("落地、购买、监狱这些行带上格子编号，掷骰行不带", () => {
    const game = newGame(["a", "b"], people, { maxPlayers: 2, allowSpectators: false }, () => 0.5, 1000);
    roll(game, 3, 4);
    applyAction(game, "a", { type: "buy" }, 2100, () => 0.5);
    const byKind = (kind: string) => game.log.filter((entry) => entry.kind === kind);
    expect(byKind("roll").every((entry) => entry.tile === undefined)).toBe(true);
    expect(byKind("move").at(-1)?.tile).toBe(7);
    expect(byKind("buy").map((entry) => entry.tile)).toEqual([7, 7]);
    const jailed = fresh();
    player(jailed, "a").position = 40;
    roll(jailed, 1, 2);
    expect(jailed.log.filter((entry) => entry.kind === "jail").at(-1)?.tile).toBe(JAIL_TILE);
  });
});

describe("动效差分器：其余意图", () => {
  const types = (intents: FxIntent[]) => intents.map((intent) => intent.type);

  it("付租：金币从付款人的席位飞向业主的席位，两人的现金各滚一次", () => {
    const game = fresh();
    game.ownership.push({ tile: 7, ownerId: "b", level: 0, mortgaged: false });
    const before = digestOf(game);
    roll(game, 3, 4);
    const { intents } = diffGames(before, game);
    const flight = intents.find((intent) => intent.type === "moneyFlight");
    expect(flight).toMatchObject({ actorId: "a", from: { kind: "seat", playerId: "a" }, to: { kind: "seat", playerId: "b" } });
    expect(intents.filter((intent) => intent.type === "cashRoll").map((intent) => (intent as { playerId: string }).playerId).sort()).toEqual(["a", "b"]);
  });

  it("建造与酒店、垄断、破产、回合交接、拍卖出价", () => {
    const game = fresh();
    game.ownership.push({ tile: 1, ownerId: "a", level: 4, mortgaged: false });
    const before = digestOf(game);
    game.ownership[0]!.level = 5;
    game.ownership.push({ tile: 2, ownerId: "a", level: 0, mortgaged: false });
    for (const tile of [6, 7]) game.ownership.push({ tile, ownerId: "a", level: 0, mortgaged: false });
    player(game, "b").bankrupt = true;
    game.turnIndex = 1;
    game.pending = { kind: "auction", tile: 10, highBid: 50, highBidderId: "a", bidders: ["a"], endsAt: 9e12 };
    game.log.push({ id: game.log.length + 1, turn: 1, text: "变化", kind: "text" });
    const { intents } = diffGames(before, game);
    expect(intents).toContainEqual({ type: "buildRise", tile: 1, level: 5, hotel: true });
    expect(types(intents)).toEqual(expect.arrayContaining(["monopoly", "bankruptcy", "turnHandoff", "auctionBid"]));
  });

  it("交易成交：地契按方向分组滑动；抽牌带上卡名", () => {    const game = fresh();
    game.ownership.push({ tile: 1, ownerId: "a", level: 0, mortgaged: false }, { tile: 2, ownerId: "b", level: 0, mortgaged: false });
    const before = digestOf(game);
    game.ownership[0]!.ownerId = "b";
    game.ownership[1]!.ownerId = "a";
    game.log.push({ id: game.log.length + 1, turn: 1, actorId: "a", text: "交易达成：甲 与乙 交换了资产。", kind: "trade", amount: 0 });
    game.drawnCard = { deck: "chance", cardId: "c-move3", byId: "a" };
    game.log.push({ id: game.log.length + 1, turn: 1, actorId: "a", text: "甲 抽到一张机会卡。", kind: "card", tile: 3 });
    const { intents } = diffGames(before, game);
    expect(intents).toContainEqual({ type: "tradeSlide", fromId: "a", toId: "b", tiles: [1] });
    expect(intents).toContainEqual({ type: "tradeSlide", fromId: "b", toId: "a", tiles: [2] });
    expect(intents).toContainEqual({ type: "cardDraw", deck: "chance", playerId: "a", title: "临时的差事" });
  });

  it("交易成交：横幅带上双方名字、各自给出的地块与现金", () => {
    const game = fresh();
    game.ownership.push(
      { tile: 1, ownerId: "a", level: 0, mortgaged: false },
      { tile: 2, ownerId: "b", level: 0, mortgaged: false },
      { tile: 6, ownerId: "a", level: 0, mortgaged: false }
    );
    const before = digestOf(game);
    game.ownership[0]!.ownerId = "b";
    game.ownership[1]!.ownerId = "a";
    game.ownership[2]!.ownerId = "b";
    game.log.push({ id: game.log.length + 1, turn: 1, actorId: "a", text: "交易达成：甲 与乙 交换了资产，甲 支付 $150。", kind: "trade", amount: -150 });
    const { intents } = diffGames(before, game);
    expect(intents).toContainEqual({
      type: "tradeBanner",
      fromId: "a", toId: "b", fromName: "甲", toName: "乙", fromSeat: 0, toSeat: 1,
      give: ["里约热内卢", "圣保罗"], take: ["布宜诺斯艾利斯"], money: 150
    });
  });

  it("进监狱：栏栅落下一次", () => {
    const game = fresh();
    player(game, "a").position = 40;
    const before = digestOf(game);
    roll(game, 1, 2);
    expect(types(diffGames(before, game).intents)).toContain("jailSlam");
  });
});
