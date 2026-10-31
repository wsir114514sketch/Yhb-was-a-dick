/**
 * Renders the interface's static pieces to a string.
 *
 * A typecheck proves the shapes line up; it does not prove a component tree can actually be built. This catches an import
 * that resolves but is `undefined` at runtime, a component that throws on a real game state, and the class of bug where a
 * missing field prints "undefined" into the page — none of which a type error would surface.
 *
 * Run with `npx tsx tools/smoke.tsx`. It is a development check, not part of the game.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { BoardView } from "../src/client/board/Board.tsx";
import { Seats } from "../src/client/board/Seats.tsx";
import { TileDialog } from "../src/client/ui/TileDialog.tsx";
import { CardDialog } from "../src/client/ui/CardDialog.tsx";
import { SettlementDialog } from "../src/client/ui/SettlementDialog.tsx";
import { TradeDialog } from "../src/client/ui/TradeDialog.tsx";
import { ActionBar } from "../src/client/ui/ActionBar.tsx";
import { newGame } from "../src/shared/rules.ts";
import { BOARD_TILES } from "../src/shared/board.ts";
import type { MonopolyGame, RoomConfig } from "../src/shared/protocol.ts";

const people = new Map([
  ["you", { username: "你", avatarUrl: null }],
  ["b", { username: "玩家 2", avatarUrl: null }]
]);
const base: MonopolyGame = newGame(["you", "b"], people, { maxPlayers: 2, allowSpectators: false } as RoomConfig, () => 0.5, 1000);

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

const noop = (): void => {};

const parts: Record<string, string> = {
  board: renderToStaticMarkup(<BoardView game={base} meId="you" selected={null} onSelect={noop} compact={false} />),
  boardDense: renderToStaticMarkup(<BoardView game={base} meId="you" selected={10} onSelect={noop} compact dense />),
  seats: renderToStaticMarkup(<Seats game={base} meId="you" />),
  seatsStrip: renderToStaticMarkup(<Seats game={base} meId="you" horizontal />),
  actionBar: renderToStaticMarkup(<ActionBar game={base} meId="you" onAct={noop} onTrade={noop} bidInput="" onBidInput={noop} secondsLeft={42} />),
  tileDialog: renderToStaticMarkup(
    <TileDialog tile={BOARD_TILES[39]!} game={base} meId="you" onClose={noop} onBuild={noop} onSell={noop} onMortgage={noop} onUnmortgage={noop} />
  ),
  cardDialog: renderToStaticMarkup(<CardDialog deck="chance" cardId="c-bank" onAck={noop} />),
  tradeDialog: renderToStaticMarkup(<TradeDialog game={base} meId="you" onClose={noop} onOffer={noop} />),
  settlement: renderToStaticMarkup(<SettlementDialog game={finished} meId="you" onClose={noop} onRestart={noop} />)
};

let failed = false;
for (const [name, html] of Object.entries(parts)) {
  const problems: string[] = [];
  if (!html.length) problems.push("empty output");
  if (html.includes("undefined")) problems.push("printed 'undefined'");
  if (html.includes("NaN")) problems.push("printed 'NaN'");
  if (problems.length) failed = true;
  console.log(`${name.padEnd(12)} ${String(html.length).padStart(7)} chars  ${problems.length ? `FAIL: ${problems.join(", ")}` : "ok"}`);
}

// The board must still render all 48 tiles, with the centre drawn over them.
const tiles = (parts.board!.match(/<button/g) ?? []).length;
console.log(`\nboard tiles rendered: ${tiles}`);
if (tiles < 48) { console.log("FAIL: the board did not render 48 tiles"); failed = true; }

// The city scene must actually be in the detail card, not a blank header.
if (!parts.tileDialog!.includes("<svg")) { console.log("FAIL: the detail card has no drawing"); failed = true; }

if (failed) process.exit(1);
console.log("\nall interface pieces rendered cleanly");