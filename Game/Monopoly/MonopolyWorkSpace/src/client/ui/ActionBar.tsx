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

import type { JSX } from "react";
import type { MonopolyAction, MonopolyGame } from "../../shared/protocol.ts";
import { formatMoney } from "../../shared/economy.ts";
import { legalActions } from "../../shared/legal.ts";
import { commercialAt } from "../../shared/board.ts";

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
}

export function ActionBar({ game, meId, onAct, onTrade, bidInput, onBidInput, secondsLeft }: ActionBarProps): JSX.Element {
  const me = game.players.find((player) => player.id === meId);
  const pending = game.pending;
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
      return (
        <Bar>
          <Note>停在「{info?.city ?? "这块地"}」 <span className="num">{formatMoney(pending.price)}</span></Note>
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
          <button type="button" className="danger-quiet" onClick={() => onAct({ type: "declareBankrupt" })}>宣告破产</button>
        </Bar>
      );
    }
    if (pending.kind === "auction") {
      const info = commercialAt(pending.tile);
      const minimum = pending.highBid === 0 ? 1 : pending.highBid + (game.config.auctionMinRaise ?? 10);
      const closing = Math.max(0, Math.ceil((pending.endsAt - Date.now()) / 1000));
      return (
        <Bar>
          <Note>
            拍卖「{info?.city ?? "这块地"}」 <span className="num">{formatMoney(pending.highBid)}</span>
            {pending.highBidderId === meId ? "（你领先）" : ""} · <span className="num">{closing}s</span>
          </Note>
          <input
            className="field" value={bidInput} inputMode="numeric" aria-label="出价金额"
            onChange={(event) => onBidInput(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder={String(minimum)}
            style={{ width: "76px", height: "var(--touch)", padding: "0 8px" }}
          />
          <button type="button" className="primary" onClick={() => onAct({ type: "bid", amount: Number(bidInput || minimum) })} disabled={pending.highBidderId === meId}>出价</button>
          {[10, 50, 100].map((step) => (
            <button key={step} type="button" className="secondary" onClick={() => onAct({ type: "bid", amount: minimum + step })}>+{step}</button>
          ))}
          <button type="button" className="secondary" onClick={() => onAct({ type: "pass" })}>退出</button>
        </Bar>
      );
    }
    if (pending.kind === "trade") {
      const from = game.players.find((player) => player.id === pending.fromId);
      if (pending.toId === meId) {
        return (
          <Bar>
            <Note>{from?.username ?? "对方"} 想与你交易。</Note>
            <button type="button" className="primary" onClick={() => onAct({ type: "answerTrade", accept: true })}>接受</button>
            <button type="button" className="secondary" onClick={() => onAct({ type: "answerTrade", accept: false })}>拒绝</button>
          </Bar>
        );
      }
      return <Bar><Note>交易提议已送出，等待对方回应。</Note><button type="button" className="secondary" onClick={() => onAct({ type: "cancelTrade" })}>撤回</button></Bar>;
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
    return (
      <Bar>
        {me.inJail ? <Note tone="warn">在监狱中 · 剩余 {me.jailTurns} 次</Note> : <TurnClock secondsLeft={secondsLeft} />}
        {me.inJail && me.jailCards > 0 ? <button type="button" className="secondary" onClick={() => onAct({ type: "useJailCard" })}>出狱卡</button> : null}
        {me.inJail ? <button type="button" className="secondary" onClick={() => onAct({ type: "payJailFine" })}>缴 {game.config.jailFine ?? 50} 出狱</button> : null}
        <button type="button" className="primary" onClick={() => onAct({ type: "roll" })}>掷骰</button>
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

/** The turn clock: a thin bar that drains, and the seconds left. It does not pulse. */
function TurnClock({ secondsLeft }: { secondsLeft: number }): JSX.Element {
  const fraction = Math.max(0, Math.min(1, secondsLeft / 60));
  const urgent = secondsLeft <= 10;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "78px" }}>
      <span style={{ flex: 1, height: "3px", borderRadius: "2px", background: "var(--surface-soft)", overflow: "hidden" }}>
        <span style={{
          display: "block", height: "100%", width: "100%",
          transform: `scaleX(${fraction})`, transformOrigin: "left center",
          background: urgent ? "var(--danger)" : "var(--border-strong)",
          transition: "transform 1s linear, background 200ms ease"
        }} />
      </span>
      <span className="num" style={{ fontSize: "11px", color: urgent ? "var(--danger)" : "var(--muted)", minWidth: "20px" }}>
        {secondsLeft}s
      </span>
    </span>
  );
}
