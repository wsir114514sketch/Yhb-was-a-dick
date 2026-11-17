/**
 * The property detail card: the city scene, the full rent table, what it costs to build and mortgage, and one neutral line
 * about the place.
 *
 * This is where a player decides whether a tile is worth keeping, so the whole table is shown rather than a summary — with
 * the *current* level marked, so the number that applies right now is never in doubt.
 *
 * The header is the illustrated scene (`scenes.tsx`), which is where the travel theme actually lives: a tile is too small
 * for a picture, a card is not.
 */

import { useRef } from "react";
import type { JSX } from "react";
import { useParallax } from "../fx/parallax.ts";
import { REGIONS, isCommercial, tileName, type Tile } from "../../shared/board.ts";
import { formatMoney } from "../../shared/economy.ts";
import type { MonopolyGame } from "../../shared/protocol.ts";
import { tilePhoto } from "../photos.ts";
import { Scene } from "../art/scenes.tsx";
import { seatColor } from "../art/tokens.tsx";
import { Dialog } from "./Dialog.tsx";

export function TileDialog({ tile, game, onClose, onBuild, onSell, onMortgage, onUnmortgage, meId }: {
  tile: Tile;
  game: MonopolyGame;
  onClose: () => void;
  onBuild: () => void;
  onSell: () => void;
  onMortgage: () => void;
  onUnmortgage: () => void;
  meId: string;
}): JSX.Element {
  const region = isCommercial(tile) ? REGIONS.find((entry) => entry.id === tile.region) : undefined;
  const photo = isCommercial(tile) ? tilePhoto(tile.index) : undefined;
  const ownership = game.ownership.find((entry) => entry.tile === tile.index);
  const owner = game.players.find((player) => player.id === ownership?.ownerId);
  const mine = ownership?.ownerId === meId;
  const name = tileName(tile);
  const header = useRef<HTMLDivElement | null>(null);
  const picture = useRef<HTMLDivElement | null>(null);
  useParallax(header, picture);

  return (
    <Dialog onClose={onClose} label={`${name} 详情`}>
      {/* The header: the real photo when the tile has one, else the drawn scene. The region colour stays in the
          title bar's edge, so the group is still legible without a tinted sky. */}
      <div style={{ position: "relative" }}>
        <div ref={header} style={{ height: "150px", overflow: "hidden", background: "var(--surface-soft)", position: "relative" }}>
          <div ref={picture} style={{ width: "100%", height: "100%" }}>
            {photo ? (
              <img src={photo.src} alt={name} loading="lazy" decoding="async" draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : isCommercial(tile) && region ? (
              <Scene index={tile.index} tint={region.color} height={150} />
            ) : null}
          </div>
          {/* 12% 的暗化层：照片在深色界面里不刺眼，署名与关闭按钮也始终看得清。 */}
          {photo ? <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.12)", pointerEvents: "none" }} /> : null}
          {photo ? (
            <span style={{
              position: "absolute", left: "8px", bottom: "6px", fontSize: "9px", lineHeight: 1,
              color: "rgba(255, 255, 255, 0.85)", background: "rgba(0, 0, 0, 0.35)",
              padding: "2px 6px", borderRadius: "var(--radius-sm)", pointerEvents: "none"
            }}>
              © {photo.artist} · {photo.license}
            </span>
          ) : null}
        </div>

        {/* The title plate is a solid bar under the drawing, not a scrim over it: text over a gradient is the exact
            pattern the design brief asks to avoid, and a solid bar is always readable whatever the sky is doing. */}
        <div style={{
          padding: "9px 14px",
          background: "var(--surface-raised)",
          borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: "8px"
        }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "17px", fontWeight: 700, color: "var(--text)", lineHeight: 1.25 }}>{name}</span>
            <span style={{ display: "block", fontSize: "11px", color: "var(--muted)" }}>
              {isCommercial(tile) && tile.cityEn ? tile.cityEn : null}
              {region ? `${isCommercial(tile) && tile.cityEn ? " · " : ""}${region.name}` : ""}
            </span>
          </span>
          {ownership && owner ? (
            <span className="tag">
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: seatColor(owner.seat), marginRight: "5px" }} />
              {owner.username}
              {ownership.mortgaged ? " · 已抵押" : ownership.level >= 5 ? " · 酒店" : ownership.level > 0 ? ` · ${ownership.level} 栋` : ""}
            </span>
          ) : null}
        </div>

        <button type="button" onClick={onClose} aria-label="关闭"
          style={{
            position: "absolute", top: "8px", right: "8px", width: "28px", height: "28px", minWidth: "28px", minHeight: "28px",
            padding: 0, borderRadius: "var(--radius)", background: "rgba(0, 0, 0, 0.4)", color: "#fff",
            fontSize: "15px", lineHeight: 1, display: "grid", placeItems: "center"
          }}>×</button>
      </div>

      <div style={{ padding: "12px 14px 15px", display: "flex", flexDirection: "column", gap: "11px" }}>
        {isCommercial(tile) ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px" }}>
              <Stat label="价格" value={formatMoney(tile.price)} />
              <Stat label="抵押价" value={formatMoney(tile.mortgage)} />
              {tile.kind === "property" ? <Stat label="每级建造成本" value={formatMoney(tile.buildCost)} /> : null}
              <Stat label="无建筑租金" value={formatMoney(tile.rent)} />
            </div>

            {tile.kind === "property" ? (
              <div>
                <SectionTitle>租金表</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "4px" }}>
                  {tile.rents.map((rent, index) => {
                    const level = index + 1;
                    const current = ownership?.level === level;
                    return (
                      <div key={level} style={{
                        padding: "5px 2px", borderRadius: "var(--radius-sm)", textAlign: "center",
                        background: current ? "var(--surface-soft)" : "transparent",
                        border: current ? "1px solid var(--border-strong)" : "1px solid var(--border)"
                      }}>
                        <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "2px" }}>
                          {level >= 5 ? "酒店" : `${level} 栋`}
                        </div>
                        <div className="num" style={{ fontSize: "11px", fontWeight: 650 }}>
                          {formatMoney(rent)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--muted)" }}>
                  集齐整组时无建筑租金翻倍，并可开始建造。
                </p>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
                {tile.kind === "transport"
                  ? "租金随持有条数提高：25 / 50 / 100 / 200。"
                  : "租金为骰子点数 × 4（持一家）或 × 10（持两家）。"}
              </p>
            )}

            <div style={{ padding: "8px 10px", borderRadius: "var(--radius)", background: "var(--surface-raised)" }}>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--secondary-text)", lineHeight: 1.55 }}>{tile.about}</p>
            </div>

            {mine ? (
              <div className="button-row">
                {ownership && !ownership.mortgaged ? (
                  <>
                    <button type="button" className="primary" onClick={onBuild} disabled={!!game.pending}>建造</button>
                    <button type="button" className="secondary" onClick={onSell} disabled={!!game.pending}>拆除一级</button>
                    <button type="button" className="secondary" onClick={onMortgage} disabled={!!game.pending}>抵押</button>
                  </>
                ) : null}
                {ownership?.mortgaged ? <button type="button" className="primary" onClick={onUnmortgage} disabled={!!game.pending}>赎回</button> : null}
              </div>
            ) : null}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: "12px", color: "var(--secondary-text)", lineHeight: 1.6 }}>
            {("blurb" in tile ? tile.blurb : null) ?? "这一格不能购买。"}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ padding: "6px 9px", borderRadius: "var(--radius)", background: "var(--surface-raised)" }}>
      <div style={{ fontSize: "10px", color: "var(--muted)" }}>{label}</div>
      <div className="num" style={{ fontSize: "13px", fontWeight: 650 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="eyebrow" style={{ marginBottom: "5px" }}>{children}</div>;
}
