/**
 * Every number the game's economy runs on, in one file, so a room's rules version can be recorded and a balance change is
 * one edit rather than a hunt through the engine. The engine reads these and never hard-codes a price.
 */

/** The one currency the game uses. Every amount is in this currency and nothing formats money any other way. */
export const CURRENCY_SYMBOL = "$";

/** Formats a whole amount as `$1,500`: thousands separated, no decimal place. */
export function formatMoney(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${CURRENCY_SYMBOL}${digits}`;
}

export interface EconomyRules {
  /** Money each player starts with. */
  startingCash: number;
  /** Paid for passing or landing on 起点. */
  goSalary: number;
  /** 所得税 / 奢侈税 amounts. */
  incomeTax: number;
  luxuryTax: number;
  /** Rent for holding 1, 2, 3 or 4 交通运输 tiles: the classic 25 / 50 / 100 / 200 ladder. */
  transportRent: readonly [number, number, number, number];
  /** Rent for a 公共事业 is the dice roll times the first value when one is held, the second when both are. */
  utilityMultiplier: readonly [number, number];
  /** Building levels: 1–4 are homes, 5 is the hotel. */
  maxBuildLevel: number;
  /** Rent multiplier on an unbuilt property when one owner holds the whole group. */
  groupRentBonus: number;
  /** Money needed to leave jail by paying. */
  jailFine: number;
  /** Turns a player may stay in jail before they must pay and leave. */
  jailMaxTurns: number;
  /** Three doubles in a row sends the player to jail (classic rule, on by default). */
  tripleDoubleJail: boolean;
  /** An auction is offered instead of a plain refusal when a player lands on an unowned tile. */
  auctionsEnabled: boolean;
  /** Seconds an auction stays open after the last bid. */
  auctionSeconds: number;
  /** The smallest raise a bid must make over the current price. */
  auctionMinRaise: number;
  /** The building rule: `even` requires every property in the group to be within one level of the others. */
  buildEvenly: boolean;
  /** Share of a building's cost returned when it is sold. */
  buildingSellRate: number;
  /** Mortgage pays this share of the price, and costs this share to lift (plus the interest below). */
  mortgageRate: number;
  /** Extra share charged to lift a mortgage; 0.1 means 解押 costs 抵押价值 × 1.1. */
  mortgageInterest: number;
  /** Rent is not collected on a mortgaged tile. */
  mortgageStopsRent: boolean;
  /** Time limit in minutes; 0 means "play until one player is left". */
  timeLimitMinutes: number;
  /** How the winner is decided when the game ends: last one standing, or the highest assets after the limit. */
  winCondition: "lastStanding" | "assets";
  /** Cash-per-asset valuations used by the assets win condition and the final settlement. */
  assetValue: { cash: number; property: number; building: number; mortgagedDiscount: number };
  /** Money a bankrupt player's creditor receives per mortgaged property they take over. */
  bankruptcyInterestRate: number;
}

export const DEFAULT_RULES: EconomyRules = {
  startingCash: 1500,
  goSalary: 200,
  incomeTax: 200,
  luxuryTax: 100,
  transportRent: [25, 50, 100, 200],
  utilityMultiplier: [4, 10],
  maxBuildLevel: 5,
  groupRentBonus: 2,
  jailFine: 50,
  jailMaxTurns: 3,
  tripleDoubleJail: true,
  auctionsEnabled: true,
  auctionSeconds: 20,
  auctionMinRaise: 10,
  buildEvenly: true,
  buildingSellRate: .5,
  mortgageRate: .5,
  mortgageInterest: .1,
  mortgageStopsRent: true,
  /**
   * The default room is a 快速局: it ends on the clock and ranks by net worth, so a table always finishes in about an hour
   * rather than waiting for everyone but one to go bankrupt (which a bot self-play puts at ~1000 turns). A 标准局 sets
   * `timeLimitMinutes: 0` and `winCondition: "lastStanding"` and plays until one player is left.
   */
  timeLimitMinutes: 60,
  winCondition: "assets",
  assetValue: { cash: 1, property: 1, building: 1, mortgagedDiscount: .5 },
  bankruptcyInterestRate: .1
};

/**
 * The rules version recorded on every room. Bump it whenever DEFAULT_RULES, the board or the tile set changes, so a
 * finished game's settlement can be traced to the numbers it was played with, and an old room is never re-priced by a
 * server update.
 */
export const RULES_VERSION = "monopoly-1.0.0";

/** A room's own copy of the rules: the defaults with whatever the host changed before the game started. */
export type RoomRules = EconomyRules;
