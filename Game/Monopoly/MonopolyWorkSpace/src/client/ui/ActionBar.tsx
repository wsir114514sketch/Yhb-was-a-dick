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
}

export function ActionBar({ game, meId, onAct, onTrade, bidInput, onBidInput, secondsLeft, onDebt }: ActionBarProps): JSX.Element {
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
          {onDebt ? <button type="button" className="primary" onClick={onDebt}>筹款</button> : null}
          <button type="button" className="danger-quiet" onClick={() => onAct({ type: "declareBankrupt" })}>宣告破产</button>
        </Bar>
      );
    }
    if (pending.kind === "auction") {
      const info = commercialAt(pending.tile);
      const rules = rulesOf(game);
      const minimum = pending.highBid === 0 ? 1 : pending.highBid + rules.auctionMinRaise;
      const closing = Math.max(0, Math.ceil((pending.endsAt - Date.now()) / 1000));
      const leading = pending.highBidderId === meId;
      // 按比例加价：以当前出价为基数；还没人出价时以地价为基数。不低于最小加价，也不超过自己的现金。
      const base = Math.max(pending.highBid, info?.price ?? 0);
      const raise = (share: number): number => Math.max(minimum, pending.highBid + Math.ceil(base * share));
      const custom = Number(bidInput || minimum);
      return (
        <Bar>
          <Note>
            拍卖「{info?.city ?? "这块地"}」 <span className="num" data-fx="auction-price" style={{ display: "inline-block" }}>{formatMoney(pending.highBid)}</span>
            {leading ? "（你领先）" : pending.highBid === 0 ? "（尚无出价）" : ""}
          </Note>
          {/* 最后 5 秒圆环转红；无人出价到时流拍，地留在银行。 */}
          <Countdown seconds={closing} total={rules.auctionSeconds} urgentAt={5} />
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
