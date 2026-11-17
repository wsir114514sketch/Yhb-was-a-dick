/**
 * One tile of the board.
 *
 * A purchasable tile carries three independent signals, so the ring is readable without colour: the region's colour bar,
 * the region's letter (A–H), and the city's name. A small crest adds the fourth — a two-or-three-stroke silhouette that
 * names the place at the size a board tile actually is.
 *
 * The look is a light paper chip with a hairline edge, as in the other LayUDown games: no gradient, no glow, no shadow
 * stack. Ownership is a solid bar in the owner's seat colour along the outer edge, which is the one place a player's colour
 * appears on the board.
 */

import type { JSX } from "react";
import { REGIONS, isCommercial, tileName, type Tile } from "../../shared/board.ts";
import { formatMoney } from "../../shared/economy.ts";
import type { Ownership, PlayerState } from "../../shared/protocol.ts";
import { Crest } from "../art/crests.tsx";
import { seatColor } from "../art/tokens.tsx";
import { layoutOf } from "./geometry.ts";

/** What a non-purchasable square says, and the icon it shows. */
const META: Record<string, { label: string; icon: JSX.Element }> = {
  go: {
    label: "起点",
    icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 19V6l12 4-12 4" /></svg>
  },
  chance: {
    label: "机会",
    icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 8h12M6 13h9M6 18h6" /></svg>
  },
  fund: {
    label: "公共基金",
    icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="4" y="7" width="16" height="11" rx="2" /><path d="M8 7V5h8v2" /></svg>
  },
  tax: {
    label: "税",
    icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="7" /><path d="M12 8v8M9.5 10h5M9.5 14h5" /></svg>
  },
  jail: {
    label: "监狱",
    icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 5v14M12 5v14M18 5v14M4 12h16" /></svg>
  },
  gotojail: {
    label: "前往监狱",
    icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 7v10M13 7v10M19 7v10" /><path d="M3 12h3" /></svg>
  },
  rest: {
    label: "免费停留",
    icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 18V8h4l2 4h6v6" /></svg>
  }
};

const regionOf = (id: string) => REGIONS.find((region) => region.id === id);

/** Buildings: 1–4 houses, then one hotel. Only the look changes with level; the rules do not. */
function Buildings({ level, color }: { level: number; color: string }): JSX.Element | null {
  if (level <= 0) return null;
  if (level >= 5) {
    return (
      <svg viewBox="0 0 14 11" width="13" height="10" style={{ display: "block" }} aria-label="酒店">
        <rect x="2" y="0.5" width="10" height="10" rx="1.2" fill={color} />
        <rect x="5.6" y="6.4" width="2.8" height="4.1" rx=".4" fill="var(--tile-bg)" />
      </svg>
    );
  }
  return (
    <span style={{ display: "flex", gap: "1.5px" }} aria-label={`${level} 栋房屋`}>
      {Array.from({ length: level }, (_, index) => (
        <svg key={index} viewBox="0 0 10 9" width="6" height="5.5" style={{ display: "block" }}>
          <path d="M5 0.4 9.3 3.6H8.1v4.9H1.9V3.6H0.7Z" fill={color} />
        </svg>
      ))}
    </span>
  );
}

export interface TileViewProps {
  tile: Tile;
  ownership?: Ownership;
  owner?: PlayerState;
  /** True while the tile's detail card is open. */
  highlight?: boolean;
  /** True when this region is fully held by one owner. */
  monopoly?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export function TileView({ tile, ownership, owner, highlight, monopoly, onClick, compact }: TileViewProps): JSX.Element {
  const cell = layoutOf(tile.index);
  const commercial = isCommercial(tile);
  const region = commercial ? regionOf(tile.region) : undefined;
  const meta = META[tile.kind];
  const name = tileName(tile);
  const narrow = cell.side === "left" || cell.side === "right";
  const corner = cell.side === "corner";

  const specialBg: Record<string, string> = {
    go: "var(--tile-go)", jail: "var(--tile-jail)", gotojail: "var(--tile-gotojail)",
    chance: "var(--tile-chance)", fund: "var(--tile-fund)", tax: "var(--tile-tax)", rest: "var(--tile-rest)"
  };
  const bg = commercial ? "var(--tile-bg)" : specialBg[tile.kind] ?? "var(--tile-bg-alt)";

  /** The region colour bar, on the inner edge so the city name keeps the outer edge. */
  const bar = ((): React.CSSProperties => {
    const base: React.CSSProperties = { position: "absolute", background: region?.color ?? "var(--tile-muted)" };
    switch (cell.bar) {
      case "up": return { ...base, left: 0, right: 0, top: 0, height: "16%" };
      case "down": return { ...base, left: 0, right: 0, bottom: 0, height: "16%" };
      case "left": return { ...base, top: 0, bottom: 0, left: 0, width: "16%" };
      case "right": return { ...base, top: 0, bottom: 0, right: 0, width: "16%" };
      default: return { ...base, display: "none" };
    }
  })();

  /** The owner's seat colour, on the outer edge — the one place a player's colour is on the board. */
  const strip = ((): React.CSSProperties | null => {
    if (!ownership || !owner) return null;
    const base: React.CSSProperties = {
      position: "absolute", background: seatColor(owner.seat), opacity: ownership.mortgaged ? 0.3 : 1
    };
    switch (cell.bar) {
      case "up": return { ...base, left: 0, right: 0, bottom: 0, height: "7%" };
      case "down": return { ...base, left: 0, right: 0, top: 0, height: "7%" };
      case "left": return { ...base, top: 0, bottom: 0, right: 0, width: "7%" };
      case "right": return { ...base, top: 0, bottom: 0, left: 0, width: "7%" };
      default: return { ...base, left: 0, right: 0, bottom: 0, height: "7%" };
    }
  })();

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${name}${commercial ? ` · ${formatMoney(tile.price)}` : ""}${owner ? ` · ${owner.username}` : ""}`}
      style={{
        position: "absolute",
        left: `${cell.x}%`, top: `${cell.y}%`, width: `${cell.w}%`, height: `${cell.h}%`,
        padding: 0, minHeight: 0, minWidth: 0, borderRadius: "var(--radius-sm)",
        background: bg,
        color: "var(--tile-text)",
        border: highlight ? "2px solid var(--accent)" : "1px solid var(--board-line)",
        // A completed group gets a thin gold edge; it is a state, not a decoration, so it does not animate.
        boxShadow: monopoly ? "inset 0 0 0 1px #b08d2e" : "none",
        overflow: "hidden",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: corner ? "center" : "flex-start",
        transform: highlight ? "scale(1.03)" : "none",
        zIndex: highlight ? 3 : 1,
        transition: "transform 140ms ease, border-color 140ms ease",
        textAlign: "center"
      }}
    >
      <span style={bar} aria-hidden="true" />
      {strip ? <span style={strip} aria-hidden="true" /> : null}

      {/* The region letter, so the group is never told apart by colour alone. */}
      {commercial && region && !narrow ? (
        <span style={{
          position: "absolute", top: cell.bar === "up" ? "18%" : "3%", right: "4%",
          fontSize: "8px", fontWeight: 700, color: region.color, lineHeight: 1
        }}>{region.mark}</span>
      ) : null}

      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: "1px", width: "100%", minHeight: 0,
        // The content is inset away from the colour bar so nothing sits on it.
        padding: corner ? "3px" : cell.bar === "up" ? "18% 2px 8%" : cell.bar === "down" ? "2px 2px 18%"
          : cell.bar === "left" ? "2px 2px 2px 18%" : "2px 18% 2px 2px"
      }}>
        {commercial ? (
          <Crest index={tile.index} size={compact ? 12 : narrow ? 12 : 19} color="var(--crest)" />
        ) : meta ? (
          <span style={{ color: "var(--tile-muted)", lineHeight: 0 }}>{meta.icon}</span>
        ) : null}

        <span style={{
          fontSize: corner ? "10px" : narrow ? "8px" : "9px", fontWeight: 650, lineHeight: 1.05,
          wordBreak: "break-word", maxWidth: "100%", overflow: "hidden",
          color: "var(--tile-text)"
        }}>{name}</span>

        {/* A side tile is 42px wide: the price would force the name onto three lines and still be unreadable, so it lives
            in the detail card there. Bottom and top tiles have the room for it. */}
        {commercial && !narrow ? (
          <span className="num" style={{ fontSize: "8px", color: "var(--tile-muted)", lineHeight: 1 }}>
            {formatMoney(tile.price)}
          </span>
        ) : null}

        {commercial && region && narrow ? (
          <span style={{ fontSize: "7px", fontWeight: 700, color: region.color, lineHeight: 1 }}>{region.mark}</span>
        ) : null}

        {ownership && ownership.level > 0 ? (
          <Buildings level={ownership.level} color={region?.color ?? "var(--tile-muted)"} />
        ) : null}
        {ownership?.mortgaged ? (
          <span style={{ fontSize: "7px", fontWeight: 700, color: "var(--danger)", lineHeight: 1 }}>押</span>
        ) : null}
      </div>

      {/* 棋子不再画在格子里：它们在 fx/FxLayer 的独立图层上，才能沿环移动而不触发 48 格重绘。 */}
    </button>
  );
}
