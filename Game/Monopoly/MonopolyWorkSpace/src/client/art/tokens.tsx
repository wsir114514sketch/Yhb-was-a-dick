/**
 * The eight play pieces. Each is a simple self-drawn glyph, and each is also visually distinct by *shape* — a suitcase, a
 * sail, a balloon — so the board is readable without relying on colour, which matters for colour-blind players and on a
 * small screen where eight coloured dots would blur together.
 *
 * All of them are drawn in a 24×24 box so they can be dropped in at any size.
 */

import type { JSX } from "react";

export interface TokenArt { id: string; name: string; shape: JSX.Element; }

const S = { fill: "currentColor", stroke: "none" } as const;

const suitcase = (
  <g {...S}>
    <rect x="3" y="8" width="18" height="12" rx="2.4" />
    <rect x="9" y="5" width="6" height="3.6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <rect x="5.5" y="11" width="2" height="6" rx="1" fill="#00000038" />
    <rect x="16.5" y="11" width="2" height="6" rx="1" fill="#00000038" />
  </g>
);
const camera = (
  <g {...S}>
    <path d="M3 9.5h4l1.6-2.4h6.8L17 9.5h4v9H3z" />
    <circle cx="12" cy="13.6" r="3.4" fill="#00000040" />
    <circle cx="12" cy="13.6" r="1.6" fill="#ffffffb0" />
  </g>
);
const balloon = (
  <g {...S}>
    <path d="M12 3c4 0 6.4 2.9 6.4 6.2S15.8 15 12 15s-6.4-2.5-6.4-5.8S8 3 12 3z" />
    <path d="M10 15h4l-2 2.6z" />
    <rect x="11.2" y="17.2" width="1.6" height="3.4" rx=".8" />
  </g>
);
const sailboat = (
  <g {...S}>
    <path d="M12 3.5 12 14.5 5.5 14.5z" />
    <path d="M13.4 6.4 13.4 14.5 18.6 14.5z" opacity=".72" />
    <path d="M3.5 16h17l-2.4 4H5.9z" />
  </g>
);
const train = (
  <g {...S}>
    <rect x="4" y="5" width="16" height="9.5" rx="2" />
    <rect x="6.4" y="7.4" width="5" height="4.2" rx="1" fill="#00000040" />
    <rect x="13" y="7.4" width="4.6" height="2" rx="1" fill="#ffffff70" />
    <circle cx="7.6" cy="17.4" r="2.1" />
    <circle cx="16.4" cy="17.4" r="2.1" />
  </g>
);
const plane = (
  <g {...S}>
    <path d="M12 2.6c1.1 0 1.8 1 1.8 2.4v4.2l7 3.6v2.2l-7-1.8v3.2l2.4 1.7v1.9L12 20.6l-4.2 .4v-1.9l2.4-1.7v-3.2l-7 1.8v-2.2l7-3.6V5c0-1.4.7-2.4 1.8-2.4z" />
  </g>
);
const compass = (
  <g {...S}>
    <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M15.4 8.6 13.3 13.3 8.6 15.4 10.7 10.7z" />
  </g>
);
const globe = (
  <g {...S}>
    <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="2" />
    <ellipse cx="12" cy="12" rx="4" ry="8.6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".8" />
    <path d="M3.6 12h16.8" stroke="currentColor" strokeWidth="1.5" opacity=".8" />
  </g>
);

/** In a fixed order, so seat 0 always gets the suitcase and a player can recognise their seat at a glance. */
export const TOKENS: readonly TokenArt[] = [
  { id: "suitcase", name: "行李箱", shape: suitcase },
  { id: "camera", name: "相机", shape: camera },
  { id: "balloon", name: "热气球", shape: balloon },
  { id: "sailboat", name: "帆船", shape: sailboat },
  { id: "train", name: "火车头", shape: train },
  { id: "plane", name: "飞机", shape: plane },
  { id: "compass", name: "指南针", shape: compass },
  { id: "globe", name: "地球仪", shape: globe }
];

/**
 * The eight seat colours. They have to work on two surfaces at once — the light paper of a tile and the dark plate of the
 * board — so they are mid-tone and slightly desaturated: deep enough to read on paper, bright enough to read on the board.
 * Each is paired with a distinct shape above, which is what actually carries identity; the colour only reinforces it.
 */
export const SEAT_COLORS: readonly string[] = [
  "#c0392f", "#2c6fc4", "#1f8f57", "#b9861a", "#7048b8", "#0d7d89", "#bb4675", "#5b6878"
];

export const tokenOf = (seat: number): TokenArt => TOKENS[seat % TOKENS.length]!;
export const seatColor = (seat: number): string => SEAT_COLORS[seat % SEAT_COLORS.length]!;

/** Renders one piece at a given size, in a given seat colour. */
export function Token({ seat, size = 20, className }: { seat: number; size?: number; className?: string }): JSX.Element {
  const art = tokenOf(seat);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}
      style={{ color: seatColor(seat), display: "block" }} aria-label={art.name} role="img">
      {art.shape}
    </svg>
  );
}
