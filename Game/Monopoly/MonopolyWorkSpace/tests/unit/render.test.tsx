import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardView } from "../../src/client/board/Board.tsx";
import { Seats } from "../../src/client/board/Seats.tsx";
import { TileDialog } from "../../src/client/ui/TileDialog.tsx";
import { CardDialog } from "../../src/client/ui/CardDialog.tsx";
import { SettlementDialog } from "../../src/client/ui/SettlementDialog.tsx";
import { TradeDialog } from "../../src/client/ui/TradeDialog.tsx";
import { ActionBar } from "../../src/client/ui/ActionBar.tsx";
import { newGame } from "../../src/shared/rules.ts";
import { BOARD_TILES } from "../../src/shared/board.ts";
import type { MonopolyGame, RoomConfig } from "../../src/shared/protocol.ts";

/**
 * Renders every interface piece to a string. A typecheck proves the shapes line up; it does not prove a component tree can
 * actually be built, nor that a missing field does not print "undefined" into the page. This does — without a browser.
 */

const people = new Map([
  ["you", { username: "你", avatarUrl: null }],
  ["b", { username: "玩家 2", avatarUrl: null }]
]);
const base: MonopolyGame = newGame(["you", "b"], people, { maxPlayers: 2, allowSpectators: false } as RoomConfig, () => 0.5, 1000);
const noop = (): void => {};

const finished: MonopolyGame = {
  ...base,
  winner: {
    playerId: "you",
    reason: "测试",
    standings: [
      { playerId: "you", username: "你", cash: 1500, propertyValue: 60, buildingValue: 0, mortgageDebt: 0, netWorth: 1560, bankrupt: false },
      { playerId: "b", username: "玩家 2", cash: 0, propertyValue: 0, buildingValue: 0, mortgageDebt: 0, netWorth: 0, bankrupt: true }
    ]
  }
};

describe("大富翁：界面渲染", () => {
  const parts: [string, string][] = [
    ["board", renderToStaticMarkup(<BoardView game={base} meId="you" selected={null} onSelect={noop} compact={false} />)],
    ["boardDense", renderToStaticMarkup(<BoardView game={base} meId="you" selected={10} onSelect={noop} compact dense />)],
    ["seats", renderToStaticMarkup(<Seats game={base} meId="you" />)],
    ["seatsStrip", renderToStaticMarkup(<Seats game={base} meId="you" horizontal />)],
    ["actionBar", renderToStaticMarkup(<ActionBar game={base} meId="you" onAct={noop} onTrade={noop} bidInput="" onBidInput={noop} secondsLeft={42} />)],
    ["tileDialog", renderToStaticMarkup(
      <TileDialog tile={BOARD_TILES[39]!} game={base} meId="you" onClose={noop} onBuild={noop} onSell={noop} onMortgage={noop} onUnmortgage={noop} />
    )],
    ["cardDialog", renderToStaticMarkup(<CardDialog deck="chance" cardId="c-bank" onAck={noop} />)],
    ["tradeDialog", renderToStaticMarkup(<TradeDialog game={base} meId="you" onClose={noop} onOffer={noop} />)],
    ["settlement", renderToStaticMarkup(<SettlementDialog game={finished} meId="you" onClose={noop} onRestart={noop} />)]
  ];

  for (const [name, html] of parts) {
    it(`renders ${name} without printing undefined or NaN`, () => {
      expect(html.length).toBeGreaterThan(0);
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("NaN");
    });
  }

  it("draws all 48 tiles, and the centre over them", () => {
    const board = parts.find(([name]) => name === "board")![1];
    expect((board.match(/<button/g) ?? []).length).toBeGreaterThanOrEqual(48);
  });

  it("puts the city drawing in the detail card, not a blank header", () => {
    const dialog = parts.find(([name]) => name === "tileDialog")![1];
    expect(dialog).toContain("<svg");
    // 巴黎's scene, so the right city is drawn rather than any drawing at all.
    expect(dialog).toContain("巴黎");
  });

  it("shows both deck counts in the board centre", () => {
    const board = parts.find(([name]) => name === "board")![1];
    expect(board).toContain("机会");
    expect(board).toContain("基金");
  });

  it("states the winner and the ranking in the settlement", () => {
    const dialog = parts.find(([name]) => name === "settlement")![1];
    expect(dialog).toContain("对局结束");
    expect(dialog).toContain("测试");
    expect(dialog).toContain("净资产");
  });
});