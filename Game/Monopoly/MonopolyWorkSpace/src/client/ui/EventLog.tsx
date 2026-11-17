/**
 * The event log: the record of what has happened, newest at the bottom.
 *
 * Every money movement the engine makes writes one line here, so this is not decoration — it is the audit trail that lets a
 * player reconstruct a game, and it is what makes a payment they missed explicable.
 *
 * It is styled as a plain list with a small kind marker per row. No icons per line, no colour wash: the money column is
 * already doing the colour work, and two coloured things per row would fight.
 */

import type { JSX } from "react";
import type { LogEntry } from "../../shared/protocol.ts";
import { formatMoney } from "../../shared/economy.ts";

/** The one-letter marker and tint per kind of event. Tint is a text colour, never a background.
 * `bar` 是行首 6px 色条的颜色：一眼扫过去能分出钱进、钱出、建造、监狱这几类。 */
const KIND: Record<LogEntry["kind"], { tint: string; mark: string; bar: string }> = {
  roll: { tint: "var(--muted)", mark: "骰", bar: "var(--border-strong)" },
  move: { tint: "var(--text)", mark: "行", bar: "var(--border)" },
  buy: { tint: "var(--ok)", mark: "买", bar: "var(--ok)" },
  rent: { tint: "var(--danger)", mark: "租", bar: "var(--danger)" },
  build: { tint: "var(--warning-text)", mark: "建", bar: "var(--warning-text)" },
  sell: { tint: "var(--muted)", mark: "拆", bar: "var(--muted)" },
  mortgage: { tint: "var(--warning-text)", mark: "押", bar: "var(--warning-text)" },
  unmortgage: { tint: "var(--ok)", mark: "赎", bar: "var(--ok)" },
  trade: { tint: "var(--text)", mark: "易", bar: "var(--accent)" },
  auction: { tint: "var(--text)", mark: "拍", bar: "#8a5fbf" },
  card: { tint: "var(--warning-text)", mark: "卡", bar: "#b8901f" },
  jail: { tint: "var(--warning-text)", mark: "狱", bar: "var(--warning-text)" },
  tax: { tint: "var(--danger)", mark: "税", bar: "var(--danger)" },
  bankrupt: { tint: "var(--danger)", mark: "破", bar: "var(--danger)" },
  end: { tint: "var(--text)", mark: "终", bar: "var(--accent)" },
  text: { tint: "var(--faint)", mark: "·", bar: "transparent" }
};

export function EventLog({ log, onLocate }: { log: readonly LogEntry[]; onLocate?: (tile: number) => void }): JSX.Element {
  // Keep the newest line in view as it arrives, without jumping the reader while they scroll back.
  // 用 column-reverse 让浏览器原生"贴底"：DOM 里最新的一行在最前，视觉上在最下。原先每来一行就在 effect 里
  // scrollIntoView，会强制整页同步重排，6× 降速下是最大的长任务来源；现在完全不用 JS 读写滚动位置。
  const rows = [...log].reverse();

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
      <div style={{ overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column-reverse", gap: "2px", minHeight: 0, flex: 1 }}>
        {rows.map((entry) => {
          const kind = KIND[entry.kind];
          // 带格子的行是一个按钮：点一下在棋盘上选中那一格并打开详情。
          const locatable = entry.tile !== undefined && !!onLocate;
          const Row = locatable ? "button" : "div";
          return (
            <Row key={entry.id} className="log-row" style={{ borderLeftColor: kind.bar }}
              {...(locatable ? { type: "button" as const, onClick: () => onLocate!(entry.tile!), title: "在棋盘上查看" } : {})}>
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
            </Row>
          );
        })}
      </div>
    </div>
  );
}
