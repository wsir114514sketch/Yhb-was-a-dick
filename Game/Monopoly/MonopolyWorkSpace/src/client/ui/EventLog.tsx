/**
 * The event log: the record of what has happened, newest at the bottom.
 *
 * Every money movement the engine makes writes one line here, so this is not decoration — it is the audit trail that lets a
 * player reconstruct a game, and it is what makes a payment they missed explicable.
 *
 * It is styled as a plain list with a small kind marker per row. No icons per line, no colour wash: the money column is
 * already doing the colour work, and two coloured things per row would fight.
 */

import { useEffect, useRef } from "react";
import type { JSX } from "react";
import type { LogEntry } from "../../shared/protocol.ts";
import { formatMoney } from "../../shared/economy.ts";

/** The one-letter marker and tint per kind of event. Tint is a text colour, never a background. */
const KIND: Record<LogEntry["kind"], { tint: string; mark: string }> = {
  roll: { tint: "var(--muted)", mark: "骰" },
  move: { tint: "var(--text)", mark: "行" },
  buy: { tint: "var(--ok)", mark: "买" },
  rent: { tint: "var(--danger)", mark: "租" },
  build: { tint: "var(--warning-text)", mark: "建" },
  sell: { tint: "var(--muted)", mark: "拆" },
  mortgage: { tint: "var(--warning-text)", mark: "押" },
  unmortgage: { tint: "var(--ok)", mark: "赎" },
  trade: { tint: "var(--text)", mark: "易" },
  auction: { tint: "var(--text)", mark: "拍" },
  card: { tint: "var(--warning-text)", mark: "卡" },
  jail: { tint: "var(--warning-text)", mark: "狱" },
  tax: { tint: "var(--danger)", mark: "税" },
  bankrupt: { tint: "var(--danger)", mark: "破" },
  end: { tint: "var(--text)", mark: "终" },
  text: { tint: "var(--faint)", mark: "·" }
};

export function EventLog({ log }: { log: readonly LogEntry[] }): JSX.Element {
  const bottom = useRef<HTMLDivElement | null>(null);

  // Keep the newest line in view as it arrives, without jumping the reader while they scroll back.
  useEffect(() => {
    const node = bottom.current;
    if (!node) return;
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [log.length]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", minHeight: 0, flex: 1,
      background: "var(--surface)", borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)", overflow: "hidden"
    }}>
      <div className="eyebrow" style={{
        padding: "7px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0
      }}>
        对局记录
      </div>
      <div style={{ overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: "2px", minHeight: 0, flex: 1 }}>
        {log.map((entry) => {
          const kind = KIND[entry.kind];
          return (
            <div key={entry.id} style={{ display: "flex", alignItems: "baseline", gap: "6px", fontSize: "12px", lineHeight: 1.4 }}>
              <span style={{
                flexShrink: 0, color: kind.tint, fontWeight: 700, fontSize: "10px",
                width: "11px", textAlign: "center"
              }}>{kind.mark}</span>
              <span style={{ color: "var(--secondary-text)", flex: 1, minWidth: 0, wordBreak: "break-word" }}>{entry.text}</span>
              {typeof entry.amount === "number" && entry.amount !== 0 ? (
                <span className="num" style={{
                  flexShrink: 0, fontSize: "11px", fontWeight: 650,
                  color: entry.amount > 0 ? "var(--ok)" : "var(--danger)"
                }}>
                  {entry.amount > 0 ? "+" : ""}{formatMoney(entry.amount)}
                </span>
              ) : null}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
    </div>
  );
}
