/**
 * The trade builder: pick a partner, pick what each side gives, name a sum, send it.
 *
 * Only unbuilt, un-mortgaged tiles can change hands, which is the engine's rule — the lists here are filtered the same way,
 * so a player is never offered a tile the offer would be refused for.
 *
 * 双栏："我出"（地产、现金、免费出狱卡）对"我要"（对方的地产）。底部实时给出按地价计算的净价值差——出狱卡按出狱费
 * 估价。它只是参考，成交与否由对方决定，规则仍由引擎裁决。
 */

import { useState } from "react";
import type { JSX } from "react";
import { commercialAt } from "../../shared/board.ts";
import { formatMoney } from "../../shared/economy.ts";
import type { MonopolyGame } from "../../shared/protocol.ts";
import { rulesOf } from "../../shared/rules.ts";
import { tradePartners } from "../../shared/legal.ts";
import { seatColor } from "../art/tokens.tsx";
import { Dialog, DialogHeader } from "./Dialog.tsx";

export function TradeDialog({ game, meId, onClose, onOffer }: {
  game: MonopolyGame;
  meId: string;
  onClose: () => void;
  onOffer: (toId: string, give: number[], take: number[], money: number, jailCards: number) => void;
}): JSX.Element {
  const partners = tradePartners(game, meId);
  const [toId, setToId] = useState<string>(partners[0]?.id ?? "");
  const [give, setGive] = useState<number[]>([]);
  const [take, setTake] = useState<number[]>([]);
  const [money, setMoney] = useState("0");
  const [cards, setCards] = useState(0);

  const me = game.players.find((player) => player.id === meId);
  const partner = game.players.find((player) => player.id === toId);
  const cardValue = rulesOf(game).jailFine;

  // A tile may be offered only when it is clear of buildings and mortgages, which is what the engine will accept.
  const tradable = (ownerId: string): number[] =>
    game.ownership
      .filter((entry) => entry.ownerId === ownerId && entry.level === 0 && !entry.mortgaged)
      .map((entry) => entry.tile);

  const mine = tradable(meId);
  const theirs = toId ? tradable(toId) : [];

  const toggle = (list: number[], set: (next: number[]) => void, tile: number): void => {
    set(list.includes(tile) ? list.filter((entry) => entry !== tile) : [...list, tile]);
  };

  const amount = Number(money || 0);
  const worth = (tiles: number[]): number => tiles.reduce((sum, tile) => sum + (commercialAt(tile)?.price ?? 0), 0);
  const outgoing = worth(give) + amount + cards * cardValue;
  const incoming = worth(take);
  const net = incoming - outgoing;
  const empty = !give.length && !take.length && !amount && !cards;
  const valid = !!toId && !empty && amount >= 0 && amount <= (me?.cash ?? 0) && cards <= (me?.jailCards ?? 0);

  return (
    <Dialog onClose={onClose} wide label="发起交易">
      <DialogHeader title="发起交易" subtitle="只能交易无建筑、未抵押的地产" onClose={onClose} />
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <Label>交易对象</Label>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {partners.map((entry) => (
              <button key={entry.id} type="button"
                className={toId === entry.id ? "primary" : "secondary"}
                onClick={() => { setToId(entry.id); setTake([]); }}
                style={{ position: "relative", paddingLeft: "18px" }}>
                <span style={{
                  position: "absolute", left: "7px", top: "50%", transform: "translateY(-50%)",
                  width: "6px", height: "6px", borderRadius: "50%", background: seatColor(entry.seat)
                }} />
                {entry.username}
              </button>
            ))}
            {partners.length === 0 ? <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>没有可交易的对手。</p> : null}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "10px" }}>
          <section style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            <Column title="我出" tiles={mine} selected={give} onToggle={(tile) => toggle(give, setGive, tile)} />
            <div>
              <Label>现金（可用 {formatMoney(me?.cash ?? 0)}）</Label>
              <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="field" value={money} inputMode="numeric" aria-label="我出的现金"
                  onChange={(event) => setMoney(event.target.value.replace(/[^0-9]/g, ""))}
                  style={{ flex: 1, minWidth: "64px", height: "var(--touch)" }}
                />
                {[50, 100, 200].map((step) => (
                  <button key={step} type="button" className="secondary" onClick={() => setMoney(String(step))} style={{ padding: "0 8px" }}>{step}</button>
                ))}
              </div>
            </div>
            {me && me.jailCards > 0 ? (
              <div>
                <Label>免费出狱卡（有 {me.jailCards} 张，每张按 {formatMoney(cardValue)} 估）</Label>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <button type="button" className="secondary" aria-label="少给一张" onClick={() => setCards(Math.max(0, cards - 1))} disabled={cards === 0}>−</button>
                  <span className="num" style={{ minWidth: "18px", textAlign: "center" }}>{cards}</span>
                  <button type="button" className="secondary" aria-label="多给一张" onClick={() => setCards(Math.min(me.jailCards, cards + 1))} disabled={cards >= me.jailCards}>+</button>
                </div>
              </div>
            ) : null}
          </section>
          <section style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            <Column title={`我要${partner ? `（${partner.username}）` : ""}`} tiles={theirs} selected={take} onToggle={(tile) => toggle(take, setTake, tile)} />
          </section>
        </div>

        {/* 净价值差：按地价估，出狱卡按出狱费估。 */}
        <div className="num" role="status" style={{
          display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap",
          padding: "7px 10px", borderRadius: "var(--radius)", background: "var(--surface-raised)", fontSize: "12px"
        }}>
          <span style={{ color: "var(--muted)" }}>我出 {formatMoney(outgoing)} · 我得 {formatMoney(incoming)}</span>
          <span style={{ fontWeight: 700, color: empty ? "var(--muted)" : net > 0 ? "var(--ok)" : net < 0 ? "var(--danger)" : "var(--text)" }}>
            按地价对你 {net > 0 ? "+" : ""}{formatMoney(net)}
          </span>
        </div>

        <div className="button-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="secondary" onClick={onClose}>取消</button>
          <button type="button" className="primary" disabled={!valid} onClick={() => onOffer(toId, give, take, amount, cards)}>
            发送提议
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function Column({ title, tiles, selected, onToggle }: {
  title: string; tiles: number[]; selected: number[]; onToggle: (tile: number) => void;
}): JSX.Element {
  return (
    <div style={{ minWidth: 0 }}>
      <Label>{title}</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px", maxHeight: "170px", overflowY: "auto" }}>
        {tiles.length === 0 ? <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)" }}>无可选地产</p> : null}
        {tiles.map((tile) => {
          const info = commercialAt(tile);
          const on = selected.includes(tile);
          return (
            <button key={tile} type="button" onClick={() => onToggle(tile)}
              style={{
                display: "flex", alignItems: "center", gap: "6px", padding: "5px 8px",
                borderRadius: "var(--radius-sm)", textAlign: "left", minHeight: "34px",
                background: on ? "var(--surface-soft)" : "transparent",
                border: `1px solid ${on ? "var(--border-strong)" : "var(--border)"}`
              }}>
              <span style={{ flex: 1, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {info?.city ?? "—"}
              </span>
              <span className="num" style={{ fontSize: "10px", color: "var(--muted)" }}>
                {info ? formatMoney(info.price) : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="eyebrow" style={{ marginBottom: "6px" }}>{children}</div>;
}
