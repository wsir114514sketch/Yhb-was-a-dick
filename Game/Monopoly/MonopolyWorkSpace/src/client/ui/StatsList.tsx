/** 局内统计的展示：菜单里的"局内统计"和结算页共用。 */

import type { JSX } from "react";
import { commercialAt } from "../../shared/board.ts";
import { formatMoney } from "../../shared/economy.ts";
import type { MonopolyGame } from "../../shared/protocol.ts";
import { seatColor } from "../art/tokens.tsx";
import type { GameStats } from "../stats.ts";

export function StatsList({ game, stats }: { game: MonopolyGame; stats: GameStats }): JSX.Element {
  const name = (id?: string) => game.players.find((player) => player.id === id)?.username ?? "—";
  const rent = stats.biggestRent;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "12px", color: "var(--secondary-text)" }}>
        最大单笔租金：{rent ? <><b className="num">{formatMoney(rent.amount)}</b>（{name(rent.payerId)}{rent.tile !== undefined ? ` 在「${commercialAt(rent.tile)?.city ?? "?"}」` : ""}，第 {rent.turn} 回合）</> : "还没有人交过租"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto auto", gap: "4px 12px", fontSize: "11px", alignItems: "center" }}>
        <span style={{ color: "var(--muted)" }}>玩家</span>
        <span style={{ color: "var(--muted)", textAlign: "right" }}>双点</span>
        <span style={{ color: "var(--muted)", textAlign: "right" }}>付租合计</span>
        <span style={{ color: "var(--muted)", textAlign: "right" }}>最富时刻</span>
        {game.order.map((id) => {
          const player = game.players.find((entry) => entry.id === id);
          const peak = stats.peaks[id];
          return [
            <span key={`${id}-n`} style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }}>
              <span style={{ width: "3px", height: "12px", borderRadius: "1px", background: seatColor(player?.seat ?? 0) }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player?.username ?? id}</span>
            </span>,
            <span key={`${id}-d`} className="num" style={{ textAlign: "right" }}>{stats.doubles[id] ?? 0}</span>,
            <span key={`${id}-r`} className="num" style={{ textAlign: "right" }}>{formatMoney(stats.rentPaid[id] ?? 0)}</span>,
            <span key={`${id}-p`} className="num" style={{ textAlign: "right" }}>{peak ? `${formatMoney(peak.netWorth)} · 第${peak.turn}回合` : "—"}</span>
          ];
        })}
      </div>
    </div>
  );
}
