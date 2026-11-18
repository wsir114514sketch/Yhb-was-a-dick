/**
 * The action bar: the one place a player presses something to advance the game.
 *
 * It shows only what is legal right now, taken from the engine's own `legalActions`, so there are no dead buttons and no
 * guessing. When the engine is waiting on a question, the bar becomes that question — buy or pass, bid or fold, read the
 * card — because at that moment it is the only thing that matters.
 *
 * Buttons use the shared `.primary` / `.secondary` / `.quiet` / `.danger-quiet` classes, so they are literally the same
 * controls as in the other LayUDown games.
 */

import { useState, type JSX } from "react";
import type { MonopolyAction, MonopolyGame } from "../../shared/protocol.ts";
import { formatMoney } from "../../shared/economy.ts";
import { legalActions } from "../../shared/legal.ts";
import { describeOffer, minimumBidFor } from "../../shared/turn.ts";
import { commercialAt } from "../../shared/board.ts";
import { rulesOf } from "../../shared/rules.ts";
import { Countdown } from "./Countdown.tsx";

export interface ActionBarProps {
  game: MonopolyGame;
  meId: string;
  onAct: (action: MonopolyAction) => void;
  /** Opens the trade builder. */
  onTrade: () => void;
  bidInput: string;
  onBidInput: (value: string) => void;
  /** Seconds left in the current turn. */
  secondsLeft: number;
  /** 打开筹款面板（资金不足时）。 */
  onDebt?: () => void;
  /** 跳转到银行面板，买不起了可以直接去借。 */
  onBank?: () => void;
  /** 打开交易提议的详情。 */
  onReviewTrade?: () => void;
}

export function ActionBar({ game, meId, onAct, onTrade, bidInput, onBidInput, secondsLeft, onDebt, onBank, onReviewTrade }: ActionBarProps): JSX.Element {
  const me = game.players.find((player) => player.id === meId);
  const pending = game.pending;
  // 退出拍卖是一次性的（离开后不能回来），所以按钮要再点一次确认；按地块记住，下一场拍卖自然复位。
  const [exitArmedTile, setExitArmedTile] = useState<number | null>(null);
  const can = (action: MonopolyAction): boolean =>
    legalActions(game, meId).some((candidate) => candidate.type === action.type
      && (candidate.type !== "build" || action.type !== "build" || candidate.tile === action.tile));

  if (!me || me.bankrupt) {
    return <Bar><Note>你已破产，对局仍在继续。</Note></Bar>;
  }

  // ---- The open question takes the whole bar ----
  if (pending && isMineToAnswer(pending, meId)) {
    if (pending.kind === "buy") {
      const info = commercialAt(pending.tile);
      const short = me.cash < pending.price;
      return (
        <Bar>
          <Note>
            停在「{info?.city ?? "这块地"}」 <span className="num">{formatMoney(pending.price)}</span>
            {short ? ` · 现金不足，还差 ${formatMoney(pending.price - me.cash)}` : ""}
          </Note>
          {onBank && short ? <button type="button" className="secondary" onClick={onBank}>去银行借款</button> : null}
          <button type="button" className="primary" onClick={() => onAct({ type: "buy" })} disabled={!can({ type: "buy" })}>购买</button>
          <button type="button" className="secondary" onClick={() => onAct({ type: "decline" })}>放弃（拍卖）</button>
        </Bar>
      );
    }
    if (pending.kind === "card") {
      return <Bar><Note>抽到一张卡，读完继续。</Note><button type="button" className="primary" onClick={() => onAct({ type: "ackCard" })}>知道了</button></Bar>;
    }
    if (pending.kind === "debt") {
      return (
        <Bar>
          <Note tone="danger">现金不足，还欠 <span className="num">{formatMoney(pending.amount)}</span>：变卖或抵押地产，或宣告破产。</Note>
          {onDebt ? <button type="button" className="primary" onClick={onDebt}>筹款</button> : null}
          <button type="button" className="danger-quiet" onClick={() => onAct({ type: "declareBankrupt" })}>宣告破产</button>
        </Bar>
      );
    }
    if (pending.kind === "auction") {
      const info = commercialAt(pending.tile);
      const rules = rulesOf(game);
      const minimum = minimumBidFor(game, pending);
      const closing = Math.max(0, Math.ceil((pending.endsAt - Date.now()) / 1000));
      const leading = pending.highBidderId === meId;
      const armed = exitArmedTile === pending.tile;
      // 按比例加价：以当前出价为基数；还没人出价时以地价为基数。不低于最小出价，也不超过自己的现金。
      const base = Math.max(pending.highBid, info?.price ?? 0);
      const raise = (share: number): number => Math.max(minimum, pending.highBid + Math.ceil(base * share));
      const custom = Number(bidInput || minimum);
      return (
        <Bar>
          <Note>
            拍卖「{info?.city ?? "这块地"}」 <span className="num" data-fx="auction-price" style={{ display: "inline-block" }} title="价高者得；每次出价都会把倒计时重新计时">
              {formatMoney(pending.highBid)}
            </span>
            {leading ? "（你领先）" : pending.highBid === 0 ? `（起拍 ${formatMoney(minimum)}）` : ""}
          </Note>
          {/* 最后 5 秒圆环转红；无人出价到时流拍，地留在银行。 */}
          <Countdown seconds={closing} total={rules.auctionSeconds} urgentAt={5} />
          <Bidders game={game} bidders={pending.bidders} highBidderId={pending.highBidderId} />
          <input
            className="field" value={bidInput} inputMode="numeric" aria-label="出价金额"
            onChange={(event) => onBidInput(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder={String(minimum)}
            style={{ width: "76px", height: "var(--touch)", padding: "0 8px" }}
          />
          <button type="button" className="primary" onClick={() => onAct({ type: "bid", amount: custom })}
            disabled={leading || custom < minimum || custom > me.cash}>出价</button>
          {[0.05, 0.1].map((share) => {
            const amount = raise(share);
            return (
              <button key={share} type="button" className="secondary" onClick={() => onAct({ type: "bid", amount })}
                disabled={leading || amount > me.cash} title={`出价 ${formatMoney(amount)}`}>
                +{Math.round(share * 100)}% <span className="num" style={{ color: "var(--muted)", fontSize: "11px" }}>{formatMoney(amount)}</span>
              </button>
            );
          })}
          {armed ? (
            <>
              <button type="button" className="danger-quiet" onClick={() => { setExitArmedTile(null); onAct({ type: "pass" }); }}>确认退出</button>
              <button type="button" className="quiet" onClick={() => setExitArmedTile(null)}>取消</button>
            </>
          ) : (
            <button type="button" className="secondary" onClick={() => setExitArmedTile(pending.tile)} title="退出后这场拍卖里不能再出价">退出</button>
          )}
        </Bar>
      );
    }
    if (pending.kind === "trade") {
      const from = game.players.find((player) => player.id === pending.fromId);
      const summary = describeOffer(pending.offer);
      if (pending.toId === meId) {
        return (
          <Bar>
            <Note>{from?.username ?? "对方"} 想与你交易{summary}。</Note>
            {onReviewTrade ? <button type="button" className="secondary" onClick={onReviewTrade}>查看详情</button> : null}
            <button type="button" className="primary" onClick={() => onAct({ type: "answerTrade", accept: true })}>接受</button>
            <button type="button" className="secondary" onClick={() => onAct({ type: "answerTrade", accept: false })}>拒绝</button>
          </Bar>
        );
      }
      return (
        <Bar>
          <Note>交易提议已送出{summary}，等待对方回应 · {Math.max(0, Math.ceil((pending.endsAt - Date.now()) / 1000))} 秒后自动取消。</Note>
          {onReviewTrade ? <button type="button" className="secondary" onClick={onReviewTrade}>查看详情</button> : null}
          <button type="button" className="secondary" onClick={() => onAct({ type: "cancelTrade" })}>撤回</button>
        </Bar>
      );
    }
  }

  // ---- Otherwise: the turn's own moves ----
  const myTurn = game.order[game.turnIndex] === meId;
  if (!myTurn) {
    return (
      <Bar>
        <Note>等待 {game.players.find((player) => player.id === game.order[game.turnIndex])?.username ?? "对手"} 行动…</Note>
        <button type="button" className="secondary" onClick={onTrade} disabled={!!pending}>交易</button>
      </Bar>
    );
  }

  if (game.stage === "roll") {
    // The roll itself and the jail answer live on the board's dice now; the bar only says so.
    return (
      <Bar>
        {me.inJail ? <Note tone="warn">在监狱中 · 剩余 {me.jailTurns} 次 · 在棋盘中央掷骰或缴费出狱</Note> : <TurnClock secondsLeft={secondsLeft} />}
        <Note>点击棋盘中央的骰子掷骰</Note>
        <button type="button" className="secondary" onClick={onTrade} disabled={!!pending}>交易</button>
      </Bar>
    );
  }

  return (
    <Bar>
      <TurnClock secondsLeft={secondsLeft} />
      <button type="button" className="primary" onClick={() => onAct({ type: "endTurn" })}>结束回合</button>
      <button type="button" className="secondary" onClick={onTrade} disabled={!!pending}>交易</button>
    </Bar>
  );
}

/** 竞价者名单：谁还在竞价、谁已经退出、谁握着当前最高价。 */
function Bidders({ game, bidders, highBidderId }: { game: MonopolyGame; bidders: string[]; highBidderId: string | null }): JSX.Element {
  return (
    <span aria-label="竞价者" style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
      {game.players.filter((player) => !player.bankrupt).map((player) => {
        const staying = bidders.includes(player.id);
        const leading = highBidderId === player.id;
        return (
          <span key={player.id} title={leading ? "当前最高价" : staying ? "竞价中" : "已退出"} style={{
            fontSize: "10px", lineHeight: 1, padding: "3px 6px", borderRadius: "999px",
            background: leading ? "var(--accent)" : "var(--surface-soft)",
            color: leading ? "var(--accent-text)" : staying ? "var(--text)" : "var(--faint)",
            border: `1px solid ${staying ? "var(--border)" : "transparent"}`,
            textDecoration: staying ? "none" : "line-through", opacity: staying ? 1 : .65
          }}>{player.username}</span>
        );
      })}
    </span>
  );
}

/** True when the open question is addressed to the human. */
function isMineToAnswer(pending: NonNullable<MonopolyGame["pending"]>, meId: string): boolean {
  if (pending.kind === "auction") return pending.bidders.includes(meId);
  if (pending.kind === "trade") return pending.toId === meId || pending.fromId === meId;
  return pending.playerId === meId;
}

function Bar({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
      padding: "7px 10px", borderRadius: "var(--radius-lg)",
      background: "var(--surface)", border: "1px solid var(--border)",
      minHeight: "54px"
    }}>
      {children}
    </div>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone?: "danger" | "warn" }): JSX.Element {
  return (
    <span style={{
      fontSize: "12px", flex: 1, minWidth: "110px",
      color: tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warning-text)" : "var(--muted)"
    }}>{children}</span>
  );
}

/** The turn clock: 环形倒计时，最后 10 秒转红。It does not pulse. */
function TurnClock({ secondsLeft }: { secondsLeft: number }): JSX.Element {
  return <Countdown seconds={secondsLeft} total={60} urgentAt={10} />;
}
