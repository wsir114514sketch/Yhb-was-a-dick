/**
 * The trade builder: pick a partner, pick what each side gives, name a sum, send it.
 *
 * Only unbuilt, un-mortgaged tiles can change hands, which is the engine's rule — the lists here are filtered the same way,
 * so a player is never offered a tile the offer would be refused for.
 */

import { useState } from "react";
import type { JSX } from "react";
import { commercialAt } from "../../shared/board.ts";
import { formatMoney } from "../../shared/economy.ts";
import type { MonopolyGame } from "../../shared/protocol.ts";
import { tradePartners } from "../../shared/legal.ts";
import { seatColor } from "../art/tokens.tsx";
import { Dialog, DialogHeader } from "./Dialog.tsx";

export function TradeDialog({ game, meId, onClose, onOffer }: {
  game: MonopolyGame;
  meId: string;
  onClose: () => void;
  onOffer: (toId: string, give: number[], take: number[], money: number) => void;
}): JSX.Element {
  const partners = tradePartners(game, meId);
  const [toId, setToId] = useState<string>(partners[0]?.id ?? "");
  const [give, setGive] = useState<number[]>([]);
  const [take, setTake] = useState<number[]>([]);
  const [money, setMoney] = useState("0");

  const me = game.players.find((player) => player.id === meId);

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
  const valid = !!toId && amount >= 0 && amount <= (me?.cash ?? 0);

  return (
    <Dialog onClose={onClose} wide label="发起交易">
      <DialogHeader title="发起交易" subtitle="只能交易无建筑、未抵押的地产" onClose={onClose} />
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <Label>交易对象</Label>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {partners.map((partner) => (
              <button key={partner.id} type="button"
                className={toId === partner.id ? "primary" : "secondary"}
                onClick={() => { setToId(partner.id); setTake([]); }}
                style={{ position: "relative", paddingLeft: "18px" }}>
                <span style={{
                  position: "absolute", left: "7px", top: "50%", transform: "translateY(-50%)",
                  width: "6px", height: "6px", borderRadius: "50%", background: seatColor(partner.seat)
                }} />
                {partner.username}
              </button>
            ))}
            {partners.length === 0 ? <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>没有可交易的对手。</p> : null}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "10px" }}>
          <Column title="你给出" tiles={mine} selected={give} onToggle={(tile) => toggle(give, setGive, tile)} />
          <Column title="你索取" tiles={theirs} selected={take} onToggle={(tile) => toggle(take, setTake, tile)} />
        </div>

        <div>
          <Label>你支付的现金（可用 {formatMoney(me?.cash ?? 0)}）</Label>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="field" value={money} inputMode="numeric"
              onChange={(event) => setMoney(event.target.value.replace(/[^0-9]/g, ""))}
              style={{ flex: 1, minWidth: "80px", height: "var(--touch)" }}
            />
            {[0, 50, 100, 200].map((step) => (
              <button key={step} type="button" className="secondary" onClick={() => setMoney(String(step))}>{step}</button>
            ))}
          </div>
        </div>

        <div className="button-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="secondary" onClick={onClose}>取消</button>
          <button type="button" className="primary" disabled={!valid} onClick={() => onOffer(toId, give, take, amount)}>
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
