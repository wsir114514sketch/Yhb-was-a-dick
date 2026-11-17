/**
 * 开局城市简介卡：每位玩家一张，展示一座有实拍照片的城市。纯展示，不影响规则；由开局时间与玩家 id 决定，
 * 同一局里刷新页面看到的是同一张。
 */

import type { JSX } from "react";
import { REGIONS, commercialAt } from "../../shared/board.ts";
import { TILE_PHOTOS } from "../photos.ts";
import { Dialog } from "./Dialog.tsx";

const CANDIDATES = Object.keys(TILE_PHOTOS).map(Number).filter((tile) => commercialAt(tile)?.kind === "property");

export function startCityOf(startedAt: number, playerId: string): number {
  let hash = startedAt >>> 0;
  for (const char of playerId) hash = (Math.imul(hash ^ char.charCodeAt(0), 2654435761) >>> 0);
  return CANDIDATES[hash % CANDIDATES.length] ?? CANDIDATES[0]!;
}

export function StartCityCard({ tile, onClose }: { tile: number; onClose: () => void }): JSX.Element | null {
  const info = commercialAt(tile);
  const photo = TILE_PHOTOS[tile];
  if (!info || !photo) return null;
  const region = REGIONS.find((entry) => entry.id === info.region);
  return (
    <Dialog onClose={onClose} label="起始城市">
      <div style={{ position: "relative", height: "160px", overflow: "hidden" }}>
        <img src={photo.src} alt={info.city} decoding="async" draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.12)" }} />
        <span style={{
          position: "absolute", left: "8px", bottom: "6px", fontSize: "9px", lineHeight: 1, color: "rgba(255, 255, 255, 0.85)",
          background: "rgba(0, 0, 0, 0.35)", padding: "2px 6px", borderRadius: "var(--radius-sm)"
        }}>© {photo.artist} · {photo.license}</span>
      </div>
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div className="eyebrow">本局你的起始城市</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ fontSize: "18px", fontWeight: 700 }}>{info.city}</span>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>{info.cityEn ? `${info.cityEn} · ` : ""}{region?.name}</span>
        </div>
        <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.6, color: "var(--secondary-text)" }}>{info.about}</p>
        <p style={{ margin: 0, fontSize: "11px", color: "var(--faint)" }}>只是一张明信片，不影响规则。</p>
        <div className="button-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="primary" onClick={onClose}>出发</button>
        </div>
      </div>
    </Dialog>
  );
}
