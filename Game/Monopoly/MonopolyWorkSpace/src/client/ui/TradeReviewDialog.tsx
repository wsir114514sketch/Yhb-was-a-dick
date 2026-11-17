/**
 * 交易提议的详情：收到提议的人不用猜，直接看清谁给哪些地、多少现金和出狱卡、要自己拿什么换。
 *
 * 只读视图：数据全部来自 `pending.offer`，接受/拒绝仍走引擎的操作。建造过的地产本来就不能进交易，所以这里不重复
 * 说明，只在底部给出按地价估的价值差，方便判断。
 */

import type { JSX } from "react";
import { commercialAt } from "../../shared/board.ts";
import { formatMoney } from "../../shared/economy.ts";
import type { MonopolyAction, MonopolyGame } from "../../shared/protocol.ts";
import { rulesOf } from "../../shared/rules.ts";
import { seatColor } from "../art/tokens.tsx";
import { Dialog, DialogHeader } from "./Dialog.tsx";

export function TradeReviewDialog({ game, meId, onAct, onClose }: {
  game: MonopolyGame;
  meId: string;
  onAct: (action: MonopolyAction) => void;
  onClose: () => void;
}): JSX.Element | null {
  const pending = game.pending;
  if (pending?.kind !== "trade") return null;
  const from = game.players.find((player) => player.id === pending.fromId);
  const to = game.players.find((player) => player.id === pending.toId);
  const { offer } = pending;
  const cardValue = rulesOf(game).jailFine;
  const worth = (tiles: number[]): number => tiles.reduce((sum, tile) => sum + (commercialAt(tile)?.price ?? 0), 0);
  const fromGives = worth(offer.give) + offer.money + offer.jailCards * cardValue;
  const toGives = worth(offer.take);
  const mine = meId === pending.toId;
  const net = mine ? fromGives - toGives : toGives - fromGives;

  return (
    <Dialog onClose={onClose} wide label="交易详情">
      <DialogHeader title="交易详情" subtitle={`${from?.username ?? "对方"} → ${to?.username ?? "你"}`} onClose={onClose} />
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "10px" }}>
          <Side title={`${from?.username ?? "对方"} 给出`} seat={from?.seat}>
            {offer.give.map((tile) => <TileRow key={tile} tile={tile} />)}
            {offer.money > 0 ? <Row label="现金" value={formatMoney(offer.money)} /> : null}
            {offer.jailCards > 0 ? <Row label="免费出狱卡" value={`${offer.jailCards} 张（约 ${formatMoney(offer.jailCards * cardValue)}）`} /> : null}
            {!offer.give.length && offer.money === 0 && offer.jailCards === 0 ? <Empty>什么也不给</Empty> : null}
          </Side>

          <Side title={`${to?.username ?? "你"} 给出`} seat={to?.seat}>
            {offer.take.map((tile) => <TileRow key={tile} tile={tile} />)}
            {!offer.take.length ? <Empty>什么也不要</Empty> : null}
          </Side>
        </div>

        <div className="num" role="status" style={{
          display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap",
          padding: "7px 10px", borderRadius: "var(--radius)", background: "var(--surface-raised)", fontSize: "12px"
        }}>
          <span style={{ color: "var(--muted)" }}>
            {mine
              ? `你得 ${formatMoney(fromGives)} · 你出 ${formatMoney(toGives)}`
              : `对方出 ${formatMoney(fromGives)} · 对方得 ${formatMoney(toGives)}`}
          </span>
          <span style={{ fontWeight: 700, color: net > 0 ? "var(--ok)" : net < 0 ? "var(--danger)" : "var(--text)" }}>
            {mine ? "按地价对你" : "按地价对对方"} {net > 0 ? "+" : ""}{formatMoney(net)}
          </span>
        </div>

        <div className="button-row" style={{ justifyContent: "flex-end" }}>
          {mine ? (
            <>
              <button type="button" className="secondary" onClick={() => onAct({ type: "answerTrade", accept: false })}>拒绝</button>
              <button type="button" className="primary" onClick={() => onAct({ type: "answerTrade", accept: true })}>接受</button>
            </>
          ) : meId === pending.fromId ? (
            <button type="button" className="secondary" onClick={() => onAct({ type: "cancelTrade" })}>撤回提议</button>
          ) : (
            <button type="button" className="secondary" onClick={onClose}>关闭</button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function Side({ title, seat, children }: { title: string; seat?: number; children: React.ReactNode }): JSX.Element {
  return (
    <section style={{
      minWidth: 0, display: "flex", flexDirection: "column", gap: "5px",
      padding: "8px 9px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--surface-raised)"
    }}>
      <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        {seat !== undefined ? <span style={{ width: "7px", height: "7px", borderRadius: "2px", background: seatColor(seat) }} /> : null}
        {title}
      </div>
      {children}
    </section>
  );
}

function TileRow({ tile }: { tile: number }): JSX.Element {
  const info = commercialAt(tile);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", minWidth: 0 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {info?.city ?? "—"}
      </span>
      <span className="num" style={{ fontSize: "10px", color: "var(--muted)" }}>{info ? formatMoney(info.price) : ""}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
      <span style={{ flex: 1 }}>{label}</span>
      <span className="num" style={{ fontSize: "10px", color: "var(--muted)" }}>{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return <span style={{ fontSize: "11px", color: "var(--faint)" }}>{children}</span>;
}
