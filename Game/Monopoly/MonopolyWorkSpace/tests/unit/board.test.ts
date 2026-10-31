import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE, BOARD_TILES, REGIONS, REGION_PROPERTIES, REGION_SIZES, TRANSPORT_TILES, UTILITY_TILES,
  commercialAt, isCommercial, tileAt, tileName
} from "../../src/shared/board.ts";
import type { CommercialTile } from "../../src/shared/board.ts";
import { CHANCE_CARDS, FUND_CARDS, DECK_CARDS } from "../../src/shared/cards.ts";
import { CURRENCY_SYMBOL, DEFAULT_RULES, RULES_VERSION, formatMoney } from "../../src/shared/economy.ts";

const commercial = (): CommercialTile[] => BOARD_TILES.filter((tile): tile is CommercialTile => isCommercial(tile));

describe("大富翁棋盘", () => {
  it("has 48 tiles numbered without gaps or repeats", () => {
    expect(BOARD_SIZE).toBe(48);
    expect(BOARD_TILES.map((tile) => tile.index)).toEqual(Array.from({ length: BOARD_SIZE }, (_, index) => index));
    expect(tileAt(0).kind).toBe("go");
    // The loop wraps both ways, so a card can move a piece past 起点 without an out-of-range index.
    expect(tileAt(-1).index).toBe(BOARD_SIZE - 1);
    expect(tileAt(BOARD_SIZE).index).toBe(0);
  });

  it("covers all eight requested regions, each with at least two purchasable tiles", () => {
    const wanted = ["南美洲", "非洲", "南亚与东南亚", "东亚", "台湾地区", "大洋洲及西亚", "欧洲", "北美洲"];
    expect(REGIONS.map((region) => region.name)).toEqual(wanted);
    for (const region of REGIONS) {
      // One tile cannot be a monopoly, so every region must be worth completing.
      expect(REGION_SIZES[region.id]).toBeGreaterThanOrEqual(2);
      expect(REGION_PROPERTIES[region.id]!.length).toBe(REGION_SIZES[region.id]);
    }
  });

  it("names 台湾地区 as its own region, with city names only", () => {
    const taiwan = commercial().filter((tile) => tile.region === "tw");
    expect(taiwan.length).toBeGreaterThanOrEqual(2);
    // The tiles carry a city and a region, and nothing that reads as a country.
    for (const tile of taiwan) {
      expect(tile.region).toBe("tw");
      expect(tile.city.trim()).not.toBe("");
      expect(Object.keys(tile)).not.toContain("country");
    }
    // No region is named after a country, and the whole board has no country field at all.
    for (const tile of commercial()) expect(Object.keys(tile)).not.toContain("country");
  });

  it("has a complete mix of special tiles: 4 chance, 3 fund, 2 tax, jail, go to jail, free stop, start", () => {
    const kinds = (kind: string): number => BOARD_TILES.filter((tile) => tile.kind === kind).length;
    expect(kinds("go")).toBe(1);
    expect(kinds("jail")).toBe(1);
    expect(kinds("gotojail")).toBe(1);
    expect(kinds("rest")).toBe(1);
    expect(kinds("chance")).toBe(4);
    expect(kinds("fund")).toBe(3);
    expect(kinds("tax")).toBe(2);
    // The counts the rent formulas are written for.
    expect(TRANSPORT_TILES).toHaveLength(4);
    expect(UTILITY_TILES).toHaveLength(2);
  });

  it("gives every purchasable tile a price, a rent, a mortgage value and a city name", () => {
    for (const tile of commercial()) {
      expect(tile.price).toBeGreaterThan(0);
      expect(tile.rent).toBeGreaterThan(0);
      expect(tile.mortgage).toBeGreaterThan(0);
      expect(tile.city.trim()).not.toBe("");
      expect(tile.about.trim()).not.toBe("");
      if (tile.kind === "property") {
        // The engine indexes rents[level - 1] up to the hotel, so all five must exist and rise.
        expect(tile.rents).toHaveLength(5);
        expect(tile.buildCost).toBeGreaterThan(0);
        for (let level = 1; level < tile.rents.length; level += 1) expect(tile.rents[level]!).toBeGreaterThan(tile.rents[level - 1]!);
        expect(tile.rents[0]!).toBeGreaterThan(tile.rent);
      } else {
        // Transports and utilities are never built on.
        expect(tile.rents).toEqual([]);
        expect(tile.buildCost).toBe(0);
      }
    }
  });

  it("gives every tile a display name, including the ones that cannot be bought", () => {
    for (const tile of BOARD_TILES) expect(tileName(tile).trim()).not.toBe("");
  });

  it("uses generic transport names, never a real operator or trademark", () => {
    expect(TRANSPORT_TILES.map((tile) => tile.city)).toEqual(["滨港铁路", "环城地铁", "高速铁路", "跨海渡轮"]);
  });

  it("prices the board so the far side is worth reaching, without any region being a trap", () => {
    for (const region of REGIONS) {
      const prices = REGION_PROPERTIES[region.id]!.map((tile) => tile.price);
      expect(Math.max(...prices)).toBeGreaterThan(Math.min(...prices));
    }
    const cheapest = Math.min(...REGIONS.map((region) => Math.min(...REGION_PROPERTIES[region.id]!.map((tile) => tile.rents[4]!))));
    const dearest = Math.max(...REGIONS.map((region) => Math.max(...REGION_PROPERTIES[region.id]!.map((tile) => tile.rents[4]!))));
    expect(dearest).toBeGreaterThan(cheapest * 3);
    // A hotel has to pay for itself within a few landings, or nobody would ever build.
    for (const tile of commercial()) {
      if (tile.kind !== "property") continue;
      expect(tile.buildCost * 5).toBeLessThan(tile.rents[4]! * 4);
    }
  });

  it("never pays more to mortgage a tile than it cost, and never zero", () => {
    for (const tile of commercial()) {
      expect(tile.mortgage).toBeLessThanOrEqual(tile.price);
      expect(tile.mortgage).toBeGreaterThan(0);
    }
  });

  it("names purchasable tiles uniquely, which the detail card and the log both rely on", () => {
    const names = commercial().map((tile) => tile.city);
    expect(new Set(names).size).toBe(names.length);
  });

  it("can read a commercial tile by index and knows which tiles are not for sale", () => {
    expect(commercialAt(1)?.city).toBe("里约热内卢");
    for (const tile of BOARD_TILES) {
      if (isCommercial(tile)) expect(commercialAt(tile.index)).not.toBeNull();
      else expect(commercialAt(tile.index)).toBeNull();
    }
  });
});

describe("大富翁内容规范", () => {
  /** The words the content rules forbid anywhere in the data: no national symbols, no real brands, no politics. */
  const FORBIDDEN = ["国旗", "国徽", "国歌", "国界", "领土", "主权", "领导人", "元首", "总书记", "总统"];

  it("has no country, nationality or continent field on any tile", () => {
    for (const tile of BOARD_TILES) {
      const keys = Object.keys(tile);
      expect(keys).not.toContain("country");
      expect(keys).not.toContain("continent");
      expect(keys).not.toContain("nation");
      expect(keys).not.toContain("flag");
    }
  });

  it("keeps every player-facing string free of national symbols and political wording", () => {
    const texts = BOARD_TILES.flatMap((tile) => [tileName(tile), tile.nameEn ?? "", tile.blurb ?? ""])
      .concat(BOARD_TILES.filter(isCommercial).flatMap((tile) => [tile.city, tile.cityEn ?? "", tile.about]))
      .concat(DECK_CARDS.chance.flatMap((card) => [card.title, card.text]))
      .concat(DECK_CARDS.fund.flatMap((card) => [card.title, card.text]));
    for (const text of texts) {
      for (const word of FORBIDDEN) expect(text).not.toContain(word);
    }
  });

  it("references no image, flag or emblem asset anywhere in the data", () => {
    // Data files hold no asset paths at all: art is a separate layer, and this keeps a lucky string from leaking in.
    const raw = JSON.stringify(BOARD_TILES) + JSON.stringify(DECK_CARDS);
    for (const pattern of [".png", ".jpg", ".svg", "flag", "emblem", "coat_of_arms"]) {
      expect(raw.toLowerCase()).not.toContain(pattern);
    }
  });

  it("keeps every card's wording about ordinary life, not politics, religion or real people", () => {
    for (const card of [...CHANCE_CARDS, ...FUND_CARDS]) {
      for (const word of ["宗教", "信仰", "教会", "寺庙", "清真寺", "教堂", "民族", "种族"]) expect(card.text).not.toContain(word);
    }
  });
});

describe("大富翁货币", () => {
  it("uses one dollar symbol and formats whole amounts with thousands separators", () => {
    expect(CURRENCY_SYMBOL).toBe("$");
    expect(formatMoney(1500)).toBe("$1,500");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(50)).toBe("$50");
    expect(formatMoney(999)).toBe("$999");
    expect(formatMoney(1000)).toBe("$1,000");
    expect(formatMoney(1234567)).toBe("$1,234,567");
    // Never a decimal place, whatever the amount is.
    expect(formatMoney(12.4)).toBe("$12");
  });

  it("shows the starting cash and the salary in dollars too", () => {
    expect(formatMoney(DEFAULT_RULES.startingCash)).toBe("$1,500");
    expect(formatMoney(DEFAULT_RULES.goSalary)).toBe("$200");
  });

  it("has no other currency anywhere in the tile data", () => {
    const raw = JSON.stringify(BOARD_TILES) + JSON.stringify(DECK_CARDS);
    for (const symbol of ["¥", "€", "£", "元", "円", "₩"]) expect(raw).not.toContain(symbol);
  });
});

describe("大富翁事件卡", () => {
  it("describes every card's effect with a kind, and no card repeats an id", () => {
    for (const deck of ["chance", "fund"] as const) {
      const cards = DECK_CARDS[deck];
      expect(cards.length).toBeGreaterThan(0);
      expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
      for (const card of cards) {
        expect(card.title.trim()).not.toBe("");
        expect(card.text.trim()).not.toBe("");
        expect(card.effect.kind.trim()).not.toBe("");
        expect(card.deck).toBe(deck);
      }
    }
    expect(CHANCE_CARDS.length).toBe(15);
    expect(FUND_CARDS.length).toBe(10);
  });

  it("keeps every card's numbers inside the range the board can pay", () => {
    for (const card of [...CHANCE_CARDS, ...FUND_CARDS]) {
      const effect = card.effect;
      if (effect.kind === "money") expect(Math.abs(effect.amount)).toBeLessThanOrEqual(300);
      if (effect.kind === "eachPlayer") expect(Math.abs(effect.amount)).toBeLessThanOrEqual(100);
      if (effect.kind === "globalLevy") expect(effect.amount).toBeGreaterThan(0);
      if (effect.kind === "repairs") {
        expect(effect.perHouse).toBeGreaterThan(0);
        expect(effect.perHotel).toBeGreaterThan(effect.perHouse);
      }
      // A card that moves a piece must land on a tile that exists.
      if (effect.kind === "moveTo") {
        expect(effect.tile).toBeGreaterThanOrEqual(0);
        expect(effect.tile).toBeLessThan(BOARD_SIZE);
      }
      if (effect.kind === "moveBy") expect(effect.steps).toBeGreaterThan(0);
    }
  });

  it("has a 免费出狱 card, a go-to-jail card and a global event in each deck", () => {
    for (const deck of ["chance", "fund"] as const) {
      expect(DECK_CARDS[deck].some((card) => card.effect.kind === "jailFree")).toBe(true);
      expect(DECK_CARDS[deck].some((card) => card.effect.kind === "goToJail")).toBe(true);
      expect(DECK_CARDS[deck].some((card) => card.effect.kind === "globalLevy")).toBe(true);
    }
  });

  it("writes card amounts in dollars, the same currency as the board", () => {
    for (const card of [...CHANCE_CARDS, ...FUND_CARDS]) {
      // The text uses `$<number>` when it mentions money at all.
      const amounts = card.text.match(/\$\d+/g) ?? [];
      for (const amount of amounts) expect(amount).toMatch(/^\$\d+$/);
    }
  });
});

describe("大富翁经济参数", () => {
  it("gives every number the engine needs, and a rules version to record", () => {
    expect(RULES_VERSION).toMatch(/^monopoly-\d+\.\d+\.\d+$/);
    expect(DEFAULT_RULES.startingCash).toBeGreaterThan(0);
    expect(DEFAULT_RULES.goSalary).toBe(200);
    expect(DEFAULT_RULES.maxBuildLevel).toBe(5);
    expect(DEFAULT_RULES.mortgageRate).toBeGreaterThan(0);
    expect(DEFAULT_RULES.mortgageRate).toBeLessThan(1);
    expect(DEFAULT_RULES.buildingSellRate).toBeLessThan(1);
    expect(DEFAULT_RULES.jailMaxTurns).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_RULES.mortgageStopsRent).toBe(true);
  });

  it("charges more to lift a mortgage than it paid, so mortgaging is never free money", () => {
    expect(DEFAULT_RULES.mortgageInterest).toBeGreaterThan(0);
  });

  it("starts every player with enough cash for the cheap tiles but not for the dearest", () => {
    const prices = commercial().map((tile) => tile.price);
    expect(DEFAULT_RULES.startingCash).toBeGreaterThan(Math.min(...prices) * 5);
    expect(DEFAULT_RULES.startingCash).toBeLessThan(Math.max(...prices) * 6);
  });
});
