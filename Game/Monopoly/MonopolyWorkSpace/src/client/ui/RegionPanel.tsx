/**
 * 地产分组：8 个区域各一行，每块地一个小方格——涂业主的座位色，写建筑等级，抵押的变淡。
 * 点一格就在棋盘上选中它并打开详情。桌面放在日志上方，手机放在抽屉里。
 */

import type { JSX } from "react";
import { REGIONS, REGION_PROPERTIES } from "../../shared/board.ts";
import type { MonopolyGame } from "../../shared/protocol.ts";
import { seatColor } from "../art/tokens.tsx";

export function RegionPanel({ game, meId, onSelect }: { game: MonopolyGame; meId: string; onSelect: (tile: number) => void }): JSX.Element {
  const ownerOf = (tile: number) => game.ownership.find((entry) => entry.tile === tile);
  const seatOf = (id: string) => game.players.find((player) => player.id === id)?.seat ?? 0;
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
      padding: "7px 10px 8px", display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0
    }}>
      <div className="eyebrow" style={{ marginBottom: "1px" }}>地产分组</div>
      {REGIONS.map((region) => {
        const members = REGION_PROPERTIES[region.id] ?? [];
        const holders = members.map((member) => ownerOf(member.index)?.ownerId);
        const whole = !!holders[0] && holders.every((id) => id === holders[0]);
        const mineCount = holders.filter((id) => id === meId).length;
        return (
          <div key={region.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: "6px" }}>
            <span title={region.name} style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, fontSize: "11px" }}>
              <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "2px", background: region.color, flex: "0 0 auto" }} />
              <span style={{ fontWeight: 700, color: region.color, fontSize: "10px" }}>{region.mark}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: whole ? "var(--text)" : "var(--secondary-text)" }}>
                {region.name}
              </span>
              {whole ? <span style={{ color: "#b08d2e", fontSize: "10px", flex: "0 0 auto" }}>垄断</span> : null}
              {!whole && mineCount ? <span className="num" style={{ color: "var(--muted)", fontSize: "10px", flex: "0 0 auto" }}>{mineCount}/{members.length}</span> : null}
            </span>
            <span style={{ display: "flex", gap: "3px" }}>
              {members.map((member) => {
                const entry = ownerOf(member.index);
                const owner = entry ? game.players.find((player) => player.id === entry.ownerId) : undefined;
                return (
                  <button key={member.index} type="button" onClick={() => onSelect(member.index)}
                    aria-label={`${member.city}${owner ? `，${owner.username}` : "，无主"}${entry?.level ? `，${entry.level >= 5 ? "酒店" : `${entry.level} 栋`}` : ""}${entry?.mortgaged ? "，已抵押" : ""}`}
                    title={member.city}
                    className="num"
                    style={{
                      width: "16px", height: "16px", minWidth: "16px", minHeight: "16px", padding: 0,
                      borderRadius: "3px", border: `1px solid ${region.color}`,
                      background: entry ? seatColor(seatOf(entry.ownerId)) : "transparent",
                      opacity: entry?.mortgaged ? 0.4 : 1,
                      color: "#fff", fontSize: "9px", fontWeight: 700, lineHeight: 1, display: "grid", placeItems: "center"
                    }}>
                    {entry && entry.level > 0 ? (entry.level >= 5 ? "H" : entry.level) : ""}
                  </button>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
