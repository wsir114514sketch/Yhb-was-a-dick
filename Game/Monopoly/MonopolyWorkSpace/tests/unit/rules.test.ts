import { describe, expect, it } from "vitest";
import { BOARD_SIZE, REGION_PROPERTIES, commercialAt } from "../../src/shared/board.ts";
import { DEFAULT_RULES } from "../../src/shared/economy.ts";
import { applyAction, expireTrade, settleAuction } from "../../src/shared/turn.ts";
import { chooseAction } from "../../src/shared/bot.ts";
import { finishGame, newGame, ownershipOf, rentOf, standingsOf, type Random } from "../../src/shared/rules.ts";
import type { MonopolyGame, PlayerState, RoomConfig } from "../../src/shared/protocol.ts";

/** A dice sequence: each pair of calls is one roll, then the last pair repeats. */
function dice(...faces: number[]): Random {
  let index = 0;
  return () => {
    const face = faces[Math.min(index, faces.length - 1)]!;
    index += 1;
    return (face - 1) / 6 + 1e-9;
  };
}

/** A non-double pair that totals `total`, so a landing test never accidentally earns a second roll. */
const FACES: Readonly<Record<number, readonly [number, number]>> = {
  2: [1, 1], 3: [1, 2], 4: [1, 3], 5: [2, 3], 6: [2, 4], 7: [3, 4], 8: [3, 5], 9: [4, 5], 10: [4, 6], 11: [5, 6]
};
function facesFor(total: number): [number, number] {
  const pair = FACES[total];
  if (!pair) throw new Error(`no pair for ${total}`);
  return [pair[0], pair[1]];
}

const config = (over: Partial<RoomConfig> = {}): RoomConfig => ({ maxPlayers: 8, allowSpectators: true, ...over });
const people = new Map([["a", { username: "甲", avatarUrl: null }], ["b", { username: "乙", avatarUrl: null }], ["c", { username: "丙", avatarUrl: null }]]);

function game(over: Partial<RoomConfig> = {}, order: string[] = ["a", "b"]): MonopolyGame {
  return newGame(order, people, config(over), dice(3, 4), 1_000);
}

const player = (state: MonopolyGame, id: string): PlayerState => state.players.find((entry) => entry.id === id)!;

/** Puts `tile` in `ownerId`'s hands directly, for tests about rent and building rather than about buying. */
function give(state: MonopolyGame, ownerId: string, tile: number, level = 0, mortgaged = false): void {
  const existing = ownershipOf(state, tile);
  if (existing) { existing.ownerId = ownerId; existing.level = level; existing.mortgaged = mortgaged; return; }
  state.ownership.push({ tile, ownerId, level, mortgaged });
}

/**
 * Rolls a non-double total that lands the piece exactly on `tile`, starting from a square that does not pass 起点 — so a
 * test about rent or tax never has a salary in it by accident.
 */
function rollOnto(state: MonopolyGame, id: string, tile: number, total = 4): void {
  const start = tile - total;
  if (start < 1) throw new Error(`rollOnto(${tile}, ${total}) would pass 起点`);
  player(state, id).position = start;
  applyAction(state, id, { type: "roll" }, 2_000, dice(...facesFor(total)));
}

/** Answers whatever a landing opened, so a test can get back to rolling: buy, read the card, or clear the auction. */
function answerLanding(state: MonopolyGame, faces: readonly [number, number] = [1, 1]): void {
  for (let guard = 0; guard < 6 && state.pending; guard += 1) {
    const pending = state.pending;
    if (pending.kind === "buy") applyAction(state, pending.playerId, { type: "buy" }, 2_000, dice(...faces));
    else if (pending.kind === "card") applyAction(state, pending.playerId, { type: "ackCard" }, 2_000, dice(...faces));
    else if (pending.kind === "auction") {
      for (const bidder of [...pending.bidders]) applyAction(state, bidder, { type: "pass" }, 2_000, dice(...faces));
    } else break;
  }
}

describe("大富翁：掷骰与移动", () => {
  it("moves the piece exactly as far as the dice say", () => {
    const state = game();
    applyAction(state, "a", { type: "roll" }, 2_000, dice(2, 5));
    expect(player(state, "a").position).toBe(7);
    expect(state.lastRoll?.dice).toEqual([2, 5]);
    expect(state.lastRoll?.doubles).toBe(false);
  });

  it("opens a card and waits for it to be read when the landing draws one", () => {
    const state = game();
    // 1 + 2 from 起点 lands on 机会 (tile 3).
    applyAction(state, "a", { type: "roll" }, 2_000, dice(1, 2));
    expect(player(state, "a").position).toBe(3);
    expect(state.pending).toMatchObject({ kind: "card", playerId: "a" });
    expect(state.stage).toBe("resolve");
    applyAction(state, "a", { type: "ackCard" }, 2_000, dice(1, 2));
    expect(state.pending?.kind).not.toBe("card");
  });

  it("ends the turn when the landing leaves nothing to answer", () => {
    const state = game();
    // 1 + 3 from 起点 lands on 所得税 (tile 4): the tax is charged and nothing is left to decide.
    applyAction(state, "a", { type: "roll" }, 2_000, dice(1, 3));
    expect(player(state, "a").position).toBe(4);
    expect(state.pending).toBeNull();
    expect(state.stage).toBe("end");
  });

  it("refuses a roll from the player whose turn it is not, and a second roll in the same turn", () => {
    const state = game();
    expect(() => applyAction(state, "b", { type: "roll" }, 2_000, dice(1, 1))).toThrow("NOT_YOUR_TURN");
    applyAction(state, "a", { type: "roll" }, 2_000, dice(1, 3));
    expect(() => applyAction(state, "a", { type: "roll" }, 2_000, dice(1, 2))).toThrow("NOT_NOW");
  });

  it("pays the salary for passing 起点", () => {
    const state = game();
    const a = player(state, "a");
    const cash = a.cash;
    // From tile 45, 3 + 3 wraps past 起点 and lands on tile 3.
    a.position = 45;
    applyAction(state, "a", { type: "roll" }, 2_000, dice(3, 3));
    expect(a.position).toBe(3);
    expect(a.cash).toBe(cash + DEFAULT_RULES.goSalary);
  });

  it("sends a player to jail on three doubles in a row", () => {
    const state = game();
    const a = player(state, "a");
    for (const faces of [[4, 4], [3, 3]] as const) {
      applyAction(state, "a", { type: "roll" }, 2_000, dice(...faces));
      answerLanding(state, faces);
      expect(state.stage).toBe("roll");
    }
    applyAction(state, "a", { type: "roll" }, 2_000, dice(4, 4));
    expect(a.inJail).toBe(true);
    expect(state.lastRoll?.doubleCount).toBe(3);
    expect(state.stage).toBe("end");
  });

  it("gives a second roll after doubles, and ends the turn after the second roll is answered", () => {
    const state = game();
    // 1 + 1 from tile 7 lands on 监狱 (tile 9), just visiting: a clean double that earns another roll.
    player(state, "a").position = 7;
    applyAction(state, "a", { type: "roll" }, 2_000, dice(1, 1));
    expect(state.stage).toBe("roll");
    // 1 + 3 doubles are used up: this one lands on 马拉喀什 (tile 13), a property.
    applyAction(state, "a", { type: "roll" }, 2_000, dice(1, 3));
    expect(state.pending).toMatchObject({ kind: "buy", tile: 13 });
    applyAction(state, "a", { type: "buy" }, 2_000, dice(1, 3));
    expect(state.stage).toBe("end");
  });
});

describe("大富翁：购买与租金", () => {
  it("buys an unowned tile, deducts exactly its price, and makes the owner", () => {
    const state = game();
    const a = player(state, "a");
    rollOnto(state, "a", 10);
    expect(state.pending).toMatchObject({ kind: "buy", playerId: "a", tile: 10, price: 140 });
    const before = a.cash;
    applyAction(state, "a", { type: "buy" }, 2_000, dice(1, 3));
    expect(ownershipOf(state, 10)?.ownerId).toBe("a");
    expect(a.cash).toBe(before - 140);
    expect(state.pending).toBeNull();
  });

  it("refuses a purchase without enough cash and leaves the tile unowned", () => {
    const state = game({ startingCash: 10 });
    rollOnto(state, "a", 10);
    expect(state.pending).toMatchObject({ kind: "buy", tile: 10 });
    expect(() => applyAction(state, "a", { type: "buy" }, 2_000, dice(1, 3))).toThrow("NOT_ENOUGH_CASH");
    expect(ownershipOf(state, 10)).toBeUndefined();
  });

  it("charges rent to the other player and pays it to the owner", () => {
    const state = game();
    give(state, "b", 10);
    const [a, b] = [player(state, "a"), player(state, "b")];
    const [aCash, bCash] = [a.cash, b.cash];
    rollOnto(state, "a", 10);
    const rent = commercialAt(10)!.rent;
    expect(a.cash).toBe(aCash - rent);
    expect(b.cash).toBe(bCash + rent);
    // A lone tile inside its group is not a monopoly, so the base rent applies.
    expect(rentOf(state, ownershipOf(state, 10)!, 10)).toBe(rent);
  });

  it("charges nothing on a mortgaged tile", () => {
    const state = game();
    give(state, "b", 10, 0, true);
    const a = player(state, "a");
    const cash = a.cash;
    rollOnto(state, "a", 10);
    expect(a.cash).toBe(cash);
    expect(rentOf(state, ownershipOf(state, 10)!, 10)).toBe(0);
  });

  it("doubles an unbuilt rent once one owner holds the whole group, and then allows building", () => {
    const state = game();
    const group = REGION_PROPERTIES["af"]!;
    const first = group[0]!;
    give(state, "a", first.index);
    expect(rentOf(state, ownershipOf(state, first.index)!, first.index)).toBe(first.rent);
    expect(() => applyAction(state, "a", { type: "build", tile: first.index }, 2_000, dice(1, 1))).toThrow("GROUP_INCOMPLETE");
    for (const member of group) give(state, "a", member.index);
    expect(rentOf(state, ownershipOf(state, first.index)!, first.index)).toBe(first.rent * DEFAULT_RULES.groupRentBonus);
    applyAction(state, "a", { type: "build", tile: first.index }, 2_000, dice(1, 1));
    expect(ownershipOf(state, first.index)?.level).toBe(1);
    expect(rentOf(state, ownershipOf(state, first.index)!, first.index)).toBe(first.rents[0]);
  });

  it("charges the transport ladder by how many are held", () => {
    const state = game();
    // The four transports are 5, 20, 28 and 44; each extra one raises the rent of all of them.
    give(state, "b", 5);
    expect(rentOf(state, ownershipOf(state, 5)!, 5)).toBe(25);
    give(state, "b", 20);
    expect(rentOf(state, ownershipOf(state, 5)!, 5)).toBe(50);
    give(state, "b", 28);
    give(state, "b", 44);
    expect(rentOf(state, ownershipOf(state, 5)!, 5)).toBe(200);
  });

  it("charges a utility by the dice that brought the player there", () => {
    const state = game();
    give(state, "b", 14);
    // One utility: four times the roll.
    expect(rentOf(state, ownershipOf(state, 14)!, 14)).toBe(7 * DEFAULT_RULES.utilityMultiplier[0]!);
    give(state, "b", 36);
    // Both utilities: ten times the roll.
    expect(rentOf(state, ownershipOf(state, 14)!, 14)).toBe(7 * DEFAULT_RULES.utilityMultiplier[1]!);
  });
});

describe("大富翁：拍卖", () => {
  it("opens an auction when a purchase is refused, and sells to the last player in it", () => {
    const state = game();
    rollOnto(state, "a", 10);
    applyAction(state, "a", { type: "decline" }, 2_000, dice(1, 3));
    expect(state.pending).toMatchObject({ kind: "auction", tile: 10 });
    const opening = state.pending;
    expect(opening?.kind === "auction" && opening.bidders).toEqual(["a", "b"]);

    applyAction(state, "b", { type: "bid", amount: 70 }, 2_000, dice(1, 3));
    expect(() => applyAction(state, "a", { type: "bid", amount: 70 }, 2_000, dice(1, 3))).toThrow("BID_TOO_LOW");
    const bCash = player(state, "b").cash;
    applyAction(state, "a", { type: "pass" }, 2_000, dice(1, 3));
    expect(ownershipOf(state, 10)?.ownerId).toBe("b");
    expect(player(state, "b").cash).toBe(bCash - 70);
    expect(state.pending).toBeNull();
    expect(state.stage).toBe("end");
  });

  it("opens the bidding at a share of the tile price instead of a dollar", () => {
    const state = game();
    rollOnto(state, "a", 10);
    applyAction(state, "a", { type: "decline" }, 2_000, dice(1, 3));
    // 开罗报价 140，默认起拍比例 0.5 → 70；低于它不算出价。
    expect(commercialAt(10)?.price).toBe(140);
    expect(() => applyAction(state, "b", { type: "bid", amount: 69 }, 2_000, dice(1, 3))).toThrow("BID_TOO_LOW");
    applyAction(state, "b", { type: "bid", amount: 70 }, 2_000, dice(1, 3));
    expect(state.pending).toMatchObject({ kind: "auction", highBid: 70, highBidderId: "b" });
  });

  it("keeps a leading bot in the auction, and lets a trailing one raise", () => {
    const state = game();
    rollOnto(state, "a", 10);
    applyAction(state, "a", { type: "decline" }, 2_000, dice(1, 3));
    applyAction(state, "a", { type: "bid", amount: 70 }, 2_000, dice(1, 3));
    // 领先时退出就等于离场，机器人应当什么都不做。
    expect(chooseAction(state, "a", dice(1, 1))).toBeNull();
    // 落后的一方仍会加价，直到超出它愿意付的上限。
    expect(chooseAction(state, "b", dice(1, 1))).toEqual({ type: "bid", amount: 80 });
  });

  it("leaves the tile with the bank when nobody bids", () => {
    const state = game();
    rollOnto(state, "a", 10);
    applyAction(state, "a", { type: "decline" }, 2_000, dice(1, 3));
    applyAction(state, "a", { type: "pass" }, 2_000, dice(1, 3));
    applyAction(state, "b", { type: "pass" }, 2_000, dice(1, 3));
    expect(ownershipOf(state, 10)).toBeUndefined();
    expect(state.pending).toBeNull();
    expect(state.stage).toBe("end");
  });

  it("refuses a bid above the bidder's cash, so an auction can never end in a debt", () => {
    const state = game({ startingCash: 100 });
    rollOnto(state, "a", 10);
    applyAction(state, "a", { type: "decline" }, 2_000, dice(1, 3));
    expect(() => applyAction(state, "b", { type: "bid", amount: 500 }, 2_000, dice(1, 3))).toThrow("NOT_ENOUGH_CASH");
  });

  it("closes on time as well as when everyone passes", () => {
    const state = game({ auctionSeconds: 5 });
    rollOnto(state, "a", 10);
    applyAction(state, "a", { type: "decline" }, 2_000, dice(1, 3));
    applyAction(state, "b", { type: "bid", amount: 70 }, 2_000, dice(1, 3));
    settleAuction(state, 3_000);
    expect(state.pending).toMatchObject({ kind: "auction" });
    settleAuction(state, 2_000 + 5_000);
    expect(ownershipOf(state, 10)?.ownerId).toBe("b");
  });
});

describe("大富翁：建筑、抵押与交易", () => {
  it("builds evenly, refuses a jump ahead, and sells back at half cost", () => {
    const state = game();
    const group = REGION_PROPERTIES["af"]!;
    for (const member of group) give(state, "a", member.index);
    const [first, second] = [group[0]!, group[1]!];
    applyAction(state, "a", { type: "build", tile: first.index }, 2_000, dice(1, 1));
    // The second build on the same tile would be two levels above its neighbour.
    expect(() => applyAction(state, "a", { type: "build", tile: first.index }, 2_000, dice(1, 1))).toThrow("BUILD_EVENLY");
    applyAction(state, "a", { type: "build", tile: second.index }, 2_000, dice(1, 1));
    const cash = player(state, "a").cash;
    applyAction(state, "a", { type: "sellBuilding", tile: second.index }, 2_000, dice(1, 1));
    expect(ownershipOf(state, second.index)?.level).toBe(0);
    expect(player(state, "a").cash).toBe(cash + Math.round(second.buildCost * DEFAULT_RULES.buildingSellRate));
  });

  it("mortgages for half the price, and lifting it costs interest", () => {
    const state = game();
    const tile = REGION_PROPERTIES["af"]![0]!;
    give(state, "a", tile.index);
    const cash = player(state, "a").cash;
    applyAction(state, "a", { type: "mortgage", tile: tile.index }, 2_000, dice(1, 1));
    expect(player(state, "a").cash).toBe(cash + tile.mortgage);
    expect(() => applyAction(state, "a", { type: "mortgage", tile: tile.index }, 2_000, dice(1, 1))).toThrow("ALREADY_MORTGAGED");
    const afterMortgage = player(state, "a").cash;
    applyAction(state, "a", { type: "unmortgage", tile: tile.index }, 2_000, dice(1, 1));
    expect(player(state, "a").cash).toBeLessThan(afterMortgage);
    expect(ownershipOf(state, tile.index)?.mortgaged).toBe(false);
  });

  it("refuses to mortgage a tile that has buildings on it", () => {
    const state = game();
    const tile = REGION_PROPERTIES["af"]![0]!;
    for (const member of REGION_PROPERTIES["af"]!) give(state, "a", member.index);
    applyAction(state, "a", { type: "build", tile: tile.index }, 2_000, dice(1, 1));
    expect(() => applyAction(state, "a", { type: "mortgage", tile: tile.index }, 2_000, dice(1, 1))).toThrow("HAS_BUILDINGS");
  });

  it("refuses building or mortgaging somebody else's tile", () => {
    const state = game();
    const tile = REGION_PROPERTIES["af"]![0]!;
    give(state, "b", tile.index);
    expect(() => applyAction(state, "a", { type: "build", tile: tile.index }, 2_000, dice(1, 1))).toThrow("NOT_OWNER");
    expect(() => applyAction(state, "a", { type: "mortgage", tile: tile.index }, 2_000, dice(1, 1))).toThrow("NOT_OWNER");
  });

  it("executes a trade atomically: tiles both ways, money one way", () => {
    const state = game();
    const [aTile, bTile] = [REGION_PROPERTIES["af"]![0]!, REGION_PROPERTIES["na"]![0]!];
    give(state, "a", aTile.index);
    give(state, "b", bTile.index);
    const [aCash, bCash] = [player(state, "a").cash, player(state, "b").cash];
    applyAction(state, "a", { type: "offerTrade", toId: "b", offer: { give: [aTile.index], take: [bTile.index], money: 100, jailCards: 0 } }, 2_000, dice(1, 1));
    expect(state.pending).toMatchObject({ kind: "trade", fromId: "a", toId: "b" });
    // Only the other side can accept; the offerer pressing accept is refused.
    expect(() => applyAction(state, "a", { type: "answerTrade", accept: true }, 2_000, dice(1, 1))).toThrow();
    applyAction(state, "b", { type: "answerTrade", accept: true }, 2_000, dice(1, 1));
    expect(ownershipOf(state, aTile.index)?.ownerId).toBe("b");
    expect(ownershipOf(state, bTile.index)?.ownerId).toBe("a");
    expect(player(state, "a").cash).toBe(aCash - 100);
    expect(player(state, "b").cash).toBe(bCash + 100);
  });

  it("refuses a trade offering a tile the offerer does not hold, and one with a building on it", () => {
    const state = game();
    const group = REGION_PROPERTIES["af"]!;
    give(state, "b", group[0]!.index);
    expect(() => applyAction(state, "a", { type: "offerTrade", toId: "b", offer: { give: [group[0]!.index], take: [], money: 0, jailCards: 0 } }, 2_000, dice(1, 1))).toThrow("TRADE_INVALID");
    for (const member of group) give(state, "a", member.index);
    applyAction(state, "a", { type: "build", tile: group[0]!.index }, 2_000, dice(1, 1));
    expect(() => applyAction(state, "a", { type: "offerTrade", toId: "b", offer: { give: [group[0]!.index], take: [], money: 0, jailCards: 0 } }, 2_000, dice(1, 1))).toThrow("TRADE_INVALID");
  });

  it("refuses a trade from anyone while another question is already on the table", () => {
    const state = game();
    rollOnto(state, "a", 10);
    expect(state.pending).toMatchObject({ kind: "buy", playerId: "a" });
    // B 发起的交易不能把 A 的购买提问顶掉。
    expect(() => applyAction(state, "b", {
      type: "offerTrade", toId: "a", offer: { give: [], take: [], money: 0, jailCards: 0 }
    }, 2_000, dice(1, 3))).toThrow("PENDING_DECISION");
    expect(state.pending).toMatchObject({ kind: "buy" });
    applyAction(state, "a", { type: "buy" }, 2_000, dice(1, 3));
    expect(ownershipOf(state, 10)?.ownerId).toBe("a");
  });

  it("cancels a trade nobody answers, and leaves the turn able to continue", () => {
    const state = game({ tradeSeconds: 10 });
    applyAction(state, "a", { type: "offerTrade", toId: "b", offer: { give: [], take: [], money: 0, jailCards: 0 } }, 2_000, dice(1, 1));
    expect(state.pending).toMatchObject({ kind: "trade", endsAt: 12_000 });
    expect(expireTrade(state, 11_000)).toBe(false);
    expect(expireTrade(state, 12_000)).toBe(true);
    expect(state.pending).toBeNull();
    // 超时之后回合照常往下走：掷骰仍然合法。
    applyAction(state, "a", { type: "roll" }, 13_000, dice(2, 3));
    expect(player(state, "a").position).toBeGreaterThan(0);
  });

  it("puts the turn back on its feet when a trade ends during a landing decision", () => {
    const state = game();
    rollOnto(state, "a", 10);
    expect(state.stage).toBe("resolve");
    // 旧版本留下的状态：购买提问被交易覆盖，阶段停在 resolve，掷骰和结束回合都会被拒。
    state.pending = { kind: "trade", fromId: "b", toId: "a", offer: { give: [], take: [], money: 0, jailCards: 0 }, status: "pending", endsAt: 60_000 };
    applyAction(state, "a", { type: "answerTrade", accept: false }, 2_000, dice(1, 3));
    expect(state.pending).toBeNull();
    expect(state.stage).toBe("end");
  });
});

describe("大富翁：监狱", () => {
  it("takes the fine to get out, or a 免费出狱 card", () => {
    const state = game();
    const a = player(state, "a");
    a.inJail = true;
    a.jailTurns = 3;
    const cash = a.cash;
    applyAction(state, "a", { type: "payJailFine" }, 2_000, dice(1, 1));
    expect(a.inJail).toBe(false);
    expect(a.cash).toBe(cash - DEFAULT_RULES.jailFine);

    const other = game();
    const card = player(other, "a");
    card.inJail = true;
    card.jailCards = 1;
    applyAction(other, "a", { type: "useJailCard" }, 2_000, dice(1, 1));
    expect(card.inJail).toBe(false);
    expect(card.jailCards).toBe(0);
  });

  it("frees a jailed player who rolls doubles, and charges the fine after the last failed try", () => {
    const state = game();
    const a = player(state, "a");
    a.inJail = true;
    a.jailTurns = 3;
    applyAction(state, "a", { type: "roll" }, 2_000, dice(4, 4));
    expect(a.inJail).toBe(false);
    expect(a.position).toBeGreaterThan(0);

    const unlucky = game();
    const b = player(unlucky, "a");
    b.inJail = true;
    b.jailTurns = 1;
    const before = b.cash;
    applyAction(unlucky, "a", { type: "roll" }, 2_000, dice(1, 2));
    expect(b.inJail).toBe(false);
    expect(b.cash).toBeLessThanOrEqual(before - DEFAULT_RULES.jailFine);
  });

  it("refuses the fine from a player who is not in jail", () => {
    const state = game();
    expect(() => applyAction(state, "a", { type: "payJailFine" }, 2_000, dice(1, 1))).toThrow();
  });
});

describe("大富翁：资金不足与破产", () => {
  it("opens a debt instead of going negative", () => {
    const state = game({ startingCash: 100 });
    // b holds the whole 北美洲 group, so 纽约's unbuilt rent is doubled to 120 — more than a's 100.
    for (const member of REGION_PROPERTIES["na"]!) give(state, "b", member.index);
    const target = REGION_PROPERTIES["na"]![1]!;
    const a = player(state, "a");
    const steps = 4;
    a.position = (target.index - steps + BOARD_SIZE) % BOARD_SIZE;
    applyAction(state, "a", { type: "roll" }, 2_000, dice(...facesFor(steps)));
    expect(state.pending).toMatchObject({ kind: "debt", playerId: "a" });
    // The balance never goes negative: the game waits for the debt to be settled.
    expect(a.cash).toBeGreaterThanOrEqual(0);
    expect(a.cash).toBe(100);
  });

  it("lets a debtor mortgage their way out of the debt", () => {
    const state = game({ startingCash: 100 });
    for (const member of REGION_PROPERTIES["na"]!) give(state, "b", member.index);
    const debtTile = REGION_PROPERTIES["af"]![0]!;
    give(state, "a", debtTile.index);
    const target = REGION_PROPERTIES["na"]![1]!;
    const steps = 4;
    player(state, "a").position = (target.index - steps + BOARD_SIZE) % BOARD_SIZE;
    applyAction(state, "a", { type: "roll" }, 2_000, dice(...facesFor(steps)));
    expect(state.pending).toMatchObject({ kind: "debt" });
    // Building the mortgage money lifts the debt; there is nothing left owed afterwards.
    applyAction(state, "a", { type: "mortgage", tile: debtTile.index }, 2_000, dice(1, 1));
    expect(state.pending).toBeNull();
    expect(player(state, "a").cash).toBeGreaterThanOrEqual(0);
  });

  it("moves a bankrupt player's tiles to the creditor and ends the game when one is left", () => {
    const state = game({ startingCash: 50 });
    const tile = REGION_PROPERTIES["na"]![0]!;
    give(state, "a", tile.index);
    give(state, "b", tile.index + 1);
    const a = player(state, "a");
    state.pending = { kind: "debt", playerId: "a", creditorId: "b", amount: 999 };
    applyAction(state, "a", { type: "declareBankrupt" }, 2_000, dice(1, 1));
    expect(a.bankrupt).toBe(true);
    expect(a.cash).toBe(0);
    expect(ownershipOf(state, tile.index)?.ownerId).toBe("b");
    expect(state.winner?.playerId).toBe("b");
  });

  it("ranks by net worth when the assets condition ends the game", () => {
    const state = game({ winCondition: "assets" });
    give(state, "b", REGION_PROPERTIES["na"]![1]!.index);
    finishGame(state, 2_000);
    expect(state.winner?.playerId).toBe("b");
    const ranked = state.winner!.standings;
    expect(ranked[0]!.playerId).toBe("b");
    expect(ranked[0]!.netWorth).toBeGreaterThan(ranked[1]!.netWorth);
    expect(standingsOf(state).find((entry) => entry.playerId === "b")!.netWorth).toBe(ranked[0]!.netWorth);
  });
});

describe("大富翁：回合与顺序", () => {
  it("hands the turn on only when the turn is finished, and skips bankrupt players", () => {
    const state = game({}, ["a", "b", "c"]);
    expect(() => applyAction(state, "a", { type: "endTurn" }, 2_000, dice(1, 1))).toThrow("NOT_NOW");
    applyAction(state, "a", { type: "roll" }, 2_000, dice(1, 3));
    applyAction(state, "a", { type: "endTurn" }, 2_000, dice(1, 3));
    expect(state.order[state.turnIndex]).toBe("b");
    // c drops out, so b's turn is followed by a's.
    player(state, "c").bankrupt = true;
    applyAction(state, "b", { type: "roll" }, 2_000, dice(1, 3));
    applyAction(state, "b", { type: "endTurn" }, 2_000, dice(1, 3));
    expect(state.order[state.turnIndex]).toBe("a");
  });

  it("refuses anything at all once the game is over", () => {
    const state = game();
    state.winner = { playerId: "a", reason: "测试", standings: [] };
    expect(() => applyAction(state, "a", { type: "roll" }, 2_000, dice(1, 1))).toThrow("GAME_OVER");
  });

  it("moves money out of the players' hands by exactly the price of a purchase", () => {
    const state = game();
    const total = (): number => state.players.reduce((sum, entry) => sum + entry.cash, 0);
    const start = total();
    rollOnto(state, "a", 10);
    applyAction(state, "a", { type: "buy" }, 2_000, dice(1, 3));
    expect(total()).toBe(start - commercialAt(10)!.price);
  });

  it("never lets cash go negative after a completed rent payment", () => {
    const state = game();
    give(state, "b", 10);
    rollOnto(state, "a", 10);
    for (const entry of state.players) expect(entry.cash).toBeGreaterThanOrEqual(0);
  });
});

describe("大富翁：记录文案", () => {
  const texts = (state: MonopolyGame): string[] => state.log.map((entry) => entry.text);

  it("writes every amount in dollars, never in another currency", () => {
    const state = game();
    rollOnto(state, "a", 10);
    applyAction(state, "a", { type: "buy" }, 2_000, dice(1, 3));
    for (const text of texts(state)) {
      expect(text).not.toContain("元");
      expect(text).not.toContain("¥");
    }
    // The buy line names the price in the one currency the game uses.
    expect(texts(state).some((text) => text.includes("支付 $140"))).toBe(true);
  });

  it("names the city in every line about a purchasable tile", () => {
    const state = game();
    // Buy it, then sell it back to the bank through an auction nobody bids in.
    rollOnto(state, "a", 10);
    applyAction(state, "a", { type: "buy" }, 2_000, dice(1, 3));
    expect(texts(state).some((text) => text.includes("开罗"))).toBe(true);
    for (const text of texts(state)) {
      // A purchasable tile has a city, so no line may fall back to the placeholder.
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("这块地");
    }
  });

  it("names the city in the refusal and the auction lines", () => {
    // With auctions off the refusal is logged; with them on it goes straight to an auction.
    const refusal = game({ auctionsEnabled: false });
    rollOnto(refusal, "a", 10);
    applyAction(refusal, "a", { type: "decline" }, 2_000, dice(1, 3));
    expect(texts(refusal).some((text) => text.includes("不购买「开罗」"))).toBe(true);

    const auctioned = game();
    rollOnto(auctioned, "a", 10);
    applyAction(auctioned, "a", { type: "decline" }, 2_000, dice(1, 3));
    expect(texts(auctioned).some((text) => text.includes("「开罗」进入拍卖"))).toBe(true);
  });

  it("takes the salary from the room's rules, not from a constant", () => {
    const state = game({ goSalary: 500 });
    const a = player(state, "a");
    const cash = a.cash;
    // From tile 45, 3 + 3 wraps past 起点 and lands on tile 3.
    a.position = 45;
    applyAction(state, "a", { type: "roll" }, 2_000, dice(3, 3));
    expect(a.cash).toBe(cash + 500);
  });

  it("charges a transport ladder the room may override", () => {
    const state = game({ transportRent: [10, 20, 40, 80] });
    give(state, "b", 5);
    give(state, "b", 20);
    expect(rentOf(state, ownershipOf(state, 5)!, 5)).toBe(20);
  });
});
