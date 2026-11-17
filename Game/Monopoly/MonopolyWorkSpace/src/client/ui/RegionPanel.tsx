/**
 * 地产分组：8 个区域各一行，整行套该区域的颜色边框，每块地是一个业主头像——抵押的变淡。
 * 点一格就在棋盘上选中它并打开详情。桌面放在日志上方，手机放在抽屉里。
 */

import type { JSX } from "react";
import { REGIONS, REGION_PROPERTIES } from "../../shared/board.ts";
import type { MonopolyGame } from "../../shared/protocol.ts";
import { Avatar } from "./Avatar.tsx";

export function RegionPanel({ game, meId, onSelect }: { game: MonopolyGame; meId: string; onSelect: (tile: number) => void }): JSX.Element {
  const ownerOf = (tile: number) => game.ownership.find((entry) => entry.tile === tile);
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
          <div key={region.id} style={{
            display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: "6px",
            border: `1px solid ${region.color}66`, borderLeft: `3px solid ${region.color}`,
            borderRadius: "var(--radius-sm)", padding: "3px 6px", background: `${region.color}0d`
          }}>
            <span title={region.name} style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, fontSize: "11px" }}>
              <span style={{ fontWeight: 700, color: region.color, fontSize: "10px" }}>{region.mark}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: whole ? "var(--text)" : "var(--secondary-text)" }}>
                {region.name}
              </span>
              {whole ? <span style={{ color: "#b08d2e", fontSize: "10px", flex: "0 0 auto" }}>垄断</span> : null}
              {!whole && mineCount ? <span className="num" style={{ color: "var(--muted)", fontSize: "10px", flex: "0 0 auto" }}>{mineCount}/{members.length}</span> : null}
            </span>
            <span style={{ display: "flex", gap: "4px" }}>
              {members.map((member) => {
                const entry = ownerOf(member.index);
                const owner = entry ? game.players.find((player) => player.id === entry.ownerId) : undefined;
                const level = entry?.level ?? 0;
                return (
                  <button key={member.index} type="button" onClick={() => onSelect(member.index)}
                    aria-label={`${member.city}${owner ? `，${owner.username}` : "，无主"}${level ? `，${level >= 5 ? "酒店" : `${level} 栋`}` : ""}${entry?.mortgaged ? "，已抵押" : ""}`}
                    title={member.city}
                    className="num"
                    style={{
                      position: "relative", width: "18px", height: "18px", minWidth: "18px", minHeight: "18px", padding: 0,
                      borderRadius: "50%", border: `1px ${owner ? "solid" : "dashed"} ${region.color}`,
                      background: "transparent", opacity: entry?.mortgaged ? 0.4 : 1, display: "grid", placeItems: "center"
                    }}>
                    {owner ? <Avatar seat={owner.seat} avatarUrl={owner.avatarUrl} size="100%" ring={false} /> : null}
                    {level > 0 ? (
                      <span style={{
                        position: "absolute", right: "-3px", bottom: "-3px", minWidth: "10px", height: "10px", padding: "0 1px",
                        borderRadius: "5px", background: "var(--surface)", border: `1px solid ${region.color}`,
                        color: "var(--text)", fontSize: "8px", fontWeight: 700, lineHeight: 1, display: "grid", placeItems: "center"
                      }}>{level >= 5 ? "H" : level}</span>
                    ) : null}
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
