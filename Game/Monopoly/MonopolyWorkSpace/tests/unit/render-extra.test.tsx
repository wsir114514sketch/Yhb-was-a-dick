import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newGame } from "../../src/shared/rules.ts";
import type { MonopolyGame, RoomConfig } from "../../src/shared/protocol.ts";
import { RegionPanel } from "../../src/client/ui/RegionPanel.tsx";
import { DebtDialog } from "../../src/client/ui/DebtDialog.tsx";
import { StatsList } from "../../src/client/ui/StatsList.tsx";
import { StartCityCard, startCityOf } from "../../src/client/ui/StartCityCard.tsx";
import { Countdown } from "../../src/client/ui/Countdown.tsx";
import { EventLog } from "../../src/client/ui/EventLog.tsx";
import { SettlementDialog } from "../../src/client/ui/SettlementDialog.tsx";
import { statsOf } from "../../src/client/stats.ts";
import { seededRandom } from "../../src/client/daily.ts";
import { ActionBar } from "../../src/client/ui/ActionBar.tsx";
import { TradeDialog } from "../../src/client/ui/TradeDialog.tsx";
import { TradeReviewDialog } from "../../src/client/ui/TradeReviewDialog.tsx";
import { TileView } from "../../src/client/board/Tile.tsx";
import { BOARD_TILES } from "../../src/shared/board.ts";
import { seatColor } from "../../src/client/art/tokens.tsx";

const people = new Map([["you", { username: "你", avatarUrl: null }], ["b", { username: "玩家 2", avatarUrl: null }]]);
const base = (): MonopolyGame => newGame(["you", "b"], people, { maxPlayers: 2, allowSpectators: false } as RoomConfig, () => 0.5, 1000);
const noop = (): void => {};
const clean = (html: string): void => {
  expect(html.length).toBeGreaterThan(0);
  expect(html).not.toContain("undefined");
  expect(html).not.toContain("NaN");
};

describe("大富翁：新增界面", () => {
  it("地产分组：8 个区域，业主格涂色", () => {
    const game = base();
    game.ownership.push({ tile: 1, ownerId: "you", level: 2, mortgaged: false });
    const html = renderToStaticMarkup(<RegionPanel game={game} meId="you" onSelect={noop} />);
    clean(html);
    expect(html).toContain("地产分组");
    expect(html).toContain("2 栋");
  });

  it("破产筹款：三步齐全，凑不够时提示只能破产", () => {
    const game = base();
    game.ownership.push({ tile: 1, ownerId: "you", level: 0, mortgaged: false });
    game.players[0]!.cash = 10;
    game.pending = { kind: "debt", playerId: "you", creditorId: "b", amount: 5000 };
    const html = renderToStaticMarkup(<DebtDialog game={game} meId="you" onAct={noop} onClose={noop} />);
    clean(html);
    for (const word of ["抵押地产", "变卖建筑", "偿还", "只能宣告破产"]) expect(html).toContain(word);
  });

  it("局内统计与结算页的本局数据", () => {
    const game = base();
    game.log.push({ id: game.log.length + 1, turn: 3, actorId: "b", text: "玩家 2 向你支付「里约」租金 $120。", kind: "rent", amount: -120, tile: 1 });
    game.log.push({ id: game.log.length + 1, turn: 3, actorId: "you", text: "你 掷出 3 + 3 = 6（双骰）。", kind: "roll" });
    const stats = statsOf(game, { you: { netWorth: 1800, turn: 2 } });
    expect(stats.biggestRent?.amount).toBe(120);
    expect(stats.doubles.you).toBe(1);
    clean(renderToStaticMarkup(<StatsList game={game} stats={stats} />));
    const finished: MonopolyGame = { ...game, winner: { playerId: "you", reason: "测试", standings: [
      { playerId: "you", username: "你", cash: 1500, propertyValue: 60, buildingValue: 0, mortgageDebt: 0, netWorth: 1560, bankrupt: false },
      { playerId: "b", username: "玩家 2", cash: 0, propertyValue: 0, buildingValue: 0, mortgageDebt: 0, netWorth: 0, bankrupt: true }
    ] } };
    const settlement = renderToStaticMarkup(<SettlementDialog game={finished} meId="you" stats={stats} onClose={noop} onRestart={noop} />);
    clean(settlement);
    expect(settlement).toContain("本局数据");
  });

  it("起始城市卡、环形倒计时、可点击的日志行", () => {
    const tile = startCityOf(1000, "you");
    expect(startCityOf(1000, "you")).toBe(tile);
    clean(renderToStaticMarkup(<StartCityCard tile={tile} onClose={noop} />));
    const ring = renderToStaticMarkup(<Countdown seconds={4} total={20} urgentAt={5} />);
    expect(ring).toContain('data-urgent="1"');
    const log = renderToStaticMarkup(<EventLog log={[{ id: 1, turn: 1, text: "走到", kind: "move", tile: 7 }, { id: 2, turn: 1, text: "掷骰", kind: "roll" }]} onLocate={noop} />);
    expect((log.match(/<button/g) ?? []).length).toBe(1);
  });

  it("每日挑战的种子可复现", () => {
    const a = seededRandom("monopoly-daily-2026-11-17");
    const b = seededRandom("monopoly-daily-2026-11-17");
    const c = seededRandom("monopoly-daily-2026-11-18");
    const seq = (r: () => number) => Array.from({ length: 5 }, r);
    expect(seq(a)).toEqual(seq(b));
    expect(seq(c)).not.toEqual(seq(seededRandom("monopoly-daily-2026-11-17")));
  });

  it("拍卖：+5% / +10% / 自定，最后 5 秒圆环转红", () => {
    const game = base();
    game.pending = { kind: "auction", tile: 39, highBid: 200, highBidderId: "b", bidders: ["you", "b"], endsAt: Date.now() + 3000 };
    const html = renderToStaticMarkup(<ActionBar game={game} meId="you" onAct={noop} onTrade={noop} bidInput="" onBidInput={noop} secondsLeft={30} />);
    clean(html);
    expect(html).toContain("+5%");
    expect(html).toContain("+10%");
    expect(html).toContain('data-urgent="1"');
    expect(html).toContain("$219");
  });

  it("交易面板：我出 / 我要 与净价值差", () => {
    const game = base();
    game.players[0]!.jailCards = 1;
    const html = renderToStaticMarkup(<TradeDialog game={game} meId="you" onClose={noop} onOffer={noop} />);
    clean(html);
    for (const word of ["我出", "我要", "免费出狱卡", "按地价对你"]) expect(html).toContain(word);
  });

  it("交易详情：收到提议的人能看到双方给什么、要什么", () => {
    const game = base();
    game.ownership.push({ tile: 1, ownerId: "b", level: 0, mortgaged: false });
    game.ownership.push({ tile: 10, ownerId: "you", level: 0, mortgaged: false });
    game.pending = {
      kind: "trade", fromId: "b", toId: "you", status: "pending",
      offer: { give: [1], take: [10], money: 50, jailCards: 0 }
    };
    const html = renderToStaticMarkup(<TradeReviewDialog game={game} meId="you" onAct={noop} onClose={noop} />);
    clean(html);
    for (const word of ["里约热内卢", "开罗", "$50", "接受", "拒绝"]) expect(html).toContain(word);
  });

  it("站在格子上的玩家用座位色边框表示，地名不被棋子挡住", () => {
    const occupant = base().players[1]!;
    const html = renderToStaticMarkup(<TileView tile={BOARD_TILES[10]!} occupants={[occupant]} />);
    clean(html);
    expect(html).toContain(seatColor(occupant.seat));
    expect(html).toContain("在此");
  });
});
