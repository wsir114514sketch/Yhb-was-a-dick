/**
 * Board crests: one monochrome mark per city, drawn as if with the same pen.
 *
 * A board tile is about 60px on a desktop and far less on a phone, so a full scene would be mud there. What survives at
 * that size is a *silhouette*: two or three strokes that name a place — a tower's profile, a bridge's span, a pyramid's
 * slope. Every mark here is drawn on the same 24×24 grid, in one ink (`currentColor`), with no outline and no shading, so
 * the ring reads as one hand rather than a clip-art collection.
 *
 * The full illustrated scenes live in `scenes.tsx`, for the detail card where there is room for them.
 */

import type { JSX } from "react";

/**
 * One mark per purchasable tile, keyed by the tile's index on the board — the only identifier that never changes when a
 * city's Chinese or English name is edited.
 *
 * 29 properties, 4 transports and 2 utilities, so every tile that can be bought has a mark.
 */
const SHAPES: Record<number, JSX.Element> = {
  /* ---- 南美洲 ---- */
  // 里约热内卢: two peaks with the cable car strung between them.
  1: (
    <g>
      <path d="M2 19 7 8l3.4 6.4L13 9l4.4 10Z" />
      <path d="M9 6.6 6.6 11" stroke="currentColor" strokeWidth="1.1" />
      <rect x="10.2" y="5.6" width="3.2" height="2.2" rx=".5" />
      <path d="M16 12.4 21 5l2.6 14H15.6Z" opacity=".55" />
    </g>
  ),
  // 布宜诺斯艾利斯: the obelisk on a wide avenue, blocks receding.
  2: (
    <g>
      <path d="M11 3.6 13.2 3.6 12.9 16 11.3 16Z" />
      <path d="M3 16h18v2.4H3ZM3 20h18v1.6H3Z" opacity=".5" />
      <path d="M4 9h3v5H4ZM17 9h3v5h-3Z" opacity=".4" />
    </g>
  ),
  // 滨港铁路: a locomotive on its rails.
  5: (
    <g>
      <rect x="4" y="7" width="16" height="8.4" rx="1.6" />
      <rect x="6.4" y="9" width="4.6" height="3.6" rx=".6" fill="var(--tile-bg)" />
      <path d="M13.4 9.6h4v2h-4Z" fill="var(--tile-bg)" opacity=".8" />
      <circle cx="8" cy="17.2" r="1.8" />
      <circle cx="16" cy="17.2" r="1.8" />
    </g>
  ),
  // 圣保罗: an avenue between two ranks of towers.
  6: (
    <g>
      <path d="M2 20V9.4h3.4V20ZM6.4 20V6h3.4v14Z" />
      <path d="M14.2 20V6h3.4v14ZM18.6 20V9.4H22V20Z" opacity=".55" />
      <path d="M10.6 20 12 12l1.4 8Z" opacity=".7" />
    </g>
  ),
  // 利马: cliffs over the sea, the coast road along the top.
  7: (
    <g>
      <path d="M2 9h20v5H2Z" opacity=".55" />
      <path d="M2 14h20v3H2Z" />
      <path d="M4 17q2 2 4 0t4 0 4 0 4 0v3H4Z" opacity=".45" />
      <path d="M7 4.6h2v4H7ZM12 3h2v5.6h-2ZM17 4.6h2v4h-2Z" opacity=".8" />
    </g>
  ),

  /* ---- 非洲 ---- */
  // 开罗: two pyramids, the larger catching the light on one face.
  10: (
    <g>
      <path d="M2 19 9 7l7 12Z" />
      <path d="M9 7l7 12h-3.6Z" opacity=".45" />
      <path d="M15 19l4.2-7 4.4 7Z" opacity=".62" />
    </g>
  ),
  // 开普敦: the flat-topped mountain with its cableway.
  12: (
    <g>
      <path d="M3 19 8 8h8l5 11Z" />
      <path d="M8 8h8v1.6H8Z" opacity=".5" />
      <path d="M11.2 8 13 4.8 14.8 8Z" opacity=".7" />
      <path d="M3 19h18v1.4H3Z" opacity=".4" />
    </g>
  ),
  // 马拉喀什: a minaret above the market awnings.
  13: (
    <g>
      <path d="M10 19V8h4v11Z" />
      <path d="M9.4 8 12 4l2.6 4Z" />
      <path d="M2 19h3.4l.8-3.4H2Zm5.8 0h3.4l.8-3.4H7.8Z" opacity=".45" />
      <path d="M14.6 19h3.4l.8-3.4h-4.2Zm5.2 0h2.2v-3.4h-3Z" opacity=".45" />
      <path d="M2 19h20v1.6H2Z" opacity=".35" />
    </g>
  ),
  // 电力公司: a pylon with its lines.
  14: (
    <g>
      <path d="M12 3.4 6.4 19h3.2L12 12l2.4 7h3.2Z" />
      <path d="M7.6 13.6h8.8M8.6 10.2h6.8" stroke="currentColor" strokeWidth="1.1" opacity=".7" />
    </g>
  ),

  /* ---- 南亚与东南亚 ---- */
  // 孟买: the great arch gateway on the waterfront.
  15: (
    <g>
      <path d="M3 19V9h18v10H14v-4.4a2 2 0 0 0-4 0V19Z" />
      <path d="M3 8.4 12 3.4l9 5Z" />
      <path d="M3 19h18v1.4H3Z" opacity=".4" />
    </g>
  ),
  // 雅加达: a long-tail boat on the canal, houses behind.
  16: (
    <g>
      <path d="M2 12h20v3.4H2Z" opacity=".45" />
      <path d="M6 15.4 8.6 20h7.6l2.2-4.6Z" />
      <path d="M12 15.4V8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M12 8 6.4 12H12Z" opacity=".6" />
    </g>
  ),
  // 新加坡: three towers under one sky bridge.
  18: (
    <g>
      <path d="M4 19V8.4h3.6V19ZM10.2 19V8.4h3.6V19ZM16.4 19V8.4H20V19Z" />
      <path d="M4 8.4h16v2H4Z" opacity=".55" />
      <path d="M6 3.6 12 5.4 18 3.6" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </g>
  ),
  // 曼谷: the tiered temple spire on its stepped base.
  19: (
    <g>
      <path d="M10 19V14h4v5Z" />
      <path d="M11 14 12 6l1 8Z" />
      <path d="M12 6V3.4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 19h8v1.6H8Z" opacity=".5" />
      <path d="M6 16.6h12v1.2H6Z" opacity=".35" />
    </g>
  ),
  // 环城地铁: a loop line with its station mark.
  20: (
    <g>
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="4.6" r="1.7" />
      <path d="M8 12h8" stroke="currentColor" strokeWidth="1.6" />
    </g>
  ),

  /* ---- 东亚 ---- */
  // 上海: the tapered tower with its round crown.
  21: (
    <g>
      <path d="M10.4 19V9.4h3.2V19Z" />
      <circle cx="12" cy="6.6" r="2" />
      <path d="M12 2.4v2.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 19V13h3v6ZM17 19v-6h3v6Z" opacity=".45" />
      <path d="M3 19h18v1.5H3Z" opacity=".4" />
    </g>
  ),
  // 北京: a gate tower with a flared roof on the central axis.
  22: (
    <g>
      <path d="M7 19v-5.6h10V19Z" />
      <path d="M4.6 13.4h14.8l-1.6-2.8H6.2Z" />
      <path d="M6.8 10.6h10.4L16.2 8H7.8Z" opacity=".7" />
      <path d="M11.2 8V4.6h1.6V8Z" opacity=".8" />
      <path d="M2 19h20v1.6H2Z" opacity=".4" />
    </g>
  ),
  // 东京: a lattice tower tapering to a fine point.
  24: (
    <g>
      <path d="M11.2 19 10.6 8.4h2.8L12.8 19Z" />
      <path d="M8.8 8.4h6.4l-.6-2.2H9.4Z" opacity=".8" />
      <path d="M12 6.2V2.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M10.4 13.6h3.2M10 16.6h4" stroke="currentColor" strokeWidth=".9" opacity=".6" />
      <path d="M3 19h18v1.4H3Z" opacity=".4" />
    </g>
  ),
  // 首尔: the palace gate with its curved eave, a modern tower behind.
  25: (
    <g>
      <path d="M4 19v-5h16v5H14v-2.6h-4V19Z" />
      <path d="M2.6 14 12 10.6 21.4 14Z" />
      <path d="M17.4 10.6V3.4h2.4v7.2Z" opacity=".5" />
    </g>
  ),

  /* ---- 台湾地区 ---- */
  // 台北: the tall stepped tower.
  27: (
    <g>
      <path d="M10.6 19V10h2.8v9Z" />
      <path d="M9.8 10h4.4l-.6-2.2H10.4Z" />
      <path d="M10.4 7.8h3.2l-.5-1.8h-2.2Z" opacity=".7" />
      <path d="M12 6V3.2" stroke="currentColor" strokeWidth="1.1" />
      <path d="M4 19v-4.4h3.2V19ZM16.8 19v-4.4H20V19Z" opacity=".4" />
    </g>
  ),
  // 高速铁路: a speeding train.
  28: (
    <g>
      <path d="M3 15 13 7h5.4c1.6 0 2.6 1.4 2.6 3.2V15Z" />
      <path d="M6 15 12.4 9.4" stroke="currentColor" strokeWidth="1" opacity=".5" />
      <circle cx="8.4" cy="16.6" r="1.6" />
      <circle cx="16.4" cy="16.6" r="1.6" />
    </g>
  ),
  // 高雄: harbour cranes over the water.
  29: (
    <g>
      <path d="M5 19V9h1.6v10Z" />
      <path d="M6.6 9.4h9.6v1.6H6.6Z" />
      <path d="M15 11v4.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 16.4h20v1.4H2Z" opacity=".5" />
      <path d="M2 19q2.4-1.6 4.8 0t4.8 0 4.8 0 4.8 0v2H2Z" opacity=".4" />
    </g>
  ),
  // 台中: the green parkway running between the city blocks.
  30: (
    <g>
      <path d="M2 19V8h4v11Z" opacity=".55" />
      <path d="M18 19V8h4v11Z" opacity=".55" />
      <path d="M10.2 19 12 9.4 13.8 19Z" />
      <path d="M8.4 13h7.2" stroke="currentColor" strokeWidth="1" opacity=".5" />
      <path d="M6.4 19h11.2v1.4H6.4Z" opacity=".4" />
    </g>
  ),
  // 台南: the old city gate with its arched opening.
  32: (
    <g>
      <path d="M4 19V8.6h16V19h-5.4v-3.4a2.6 2.6 0 0 0-5.2 0V19Z" />
      <path d="M3 8.2 12 4.6l9 3.6Z" />
      <path d="M2 19h20v1.6H2Z" opacity=".4" />
    </g>
  ),

  /* ---- 大洋洲及西亚 ---- */
  // 悉尼: the shell sails of the opera house.
  34: (
    <g>
      <path d="M4 19V7.4c4.2 2.6 6.4 6.6 6.4 11.6Z" />
      <path d="M11.8 19V10c3.4 1.6 5 4.8 5 9Z" opacity=".62" />
      <path d="M18.4 19v-4.6c1.8.8 2.6 2.4 2.6 4.6Z" opacity=".45" />
      <path d="M2 19h20v1.6H2Z" opacity=".4" />
    </g>
  ),
  // 奥克兰: a volcano cone beside the needle tower.
  35: (
    <g>
      <path d="M2 19 8.4 10l6.4 9Z" opacity=".6" />
      <path d="M16.4 19V6.4h1.8V19Z" />
      <path d="M15.4 6.4h3.8l-1-2.6h-1.8Z" opacity=".8" />
      <path d="M2 19h20v1.5H2Z" opacity=".4" />
    </g>
  ),
  // 自来水厂: a drop under the tap.
  36: (
    <g>
      <path d="M12 3.6c3 3.6 4.8 6.2 4.8 8.4a4.8 4.8 0 0 1-9.6 0c0-2.2 1.8-4.8 4.8-8.4Z" />
      <path d="M9.6 12.4a2.4 2.4 0 0 0 2.4 2.4" stroke="var(--tile-bg)" strokeWidth="1.2" fill="none" />
    </g>
  ),
  // 迪拜: the very tall stepped tower.
  37: (
    <g>
      <path d="M11.4 19V8.6h1.6V19Z" />
      <path d="M11.8 8.6V3.2" stroke="currentColor" strokeWidth="1" />
      <path d="M9.6 19V12h5.2v7Z" opacity=".45" />
      <path d="M11 12.4h3.2M11 15h3.2" stroke="currentColor" strokeWidth=".8" opacity=".5" />
      <path d="M3 19h18v1.4H3Z" opacity=".4" />
    </g>
  ),

  /* ---- 欧洲 ---- */
  // 巴黎: the iron tower's profile.
  39: (
    <g>
      <path d="M10.4 19 11.4 9.4h1.2L13.6 19h-1.5l-.2-3.4h-.8L10.9 19Z" />
      <path d="M10.9 9.4h2.2l-.4-2.4h-1.4Z" opacity=".8" />
      <path d="M12 7V3.4" stroke="currentColor" strokeWidth="1.1" />
      <path d="M10.6 14.6h2.8" stroke="currentColor" strokeWidth=".9" opacity=".55" />
      <path d="M5 19h14v1.5H5Z" opacity=".4" />
    </g>
  ),
  // 伦敦: the clock tower with its pointed roof.
  40: (
    <g>
      <path d="M10 19V9.4h4V19Z" />
      <path d="M9.4 9.4 12 4.6l2.6 4.8Z" />
      <circle cx="12" cy="13" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M4 19v-4h3.4v4ZM16.6 19v-4H20v4Z" opacity=".45" />
      <path d="M3 19h18v1.5H3Z" opacity=".4" />
    </g>
  ),
  // 苏黎世: two church spires over the lake.
  41: (
    <g>
      <path d="M7 19V9h3v10Z" />
      <path d="M6.4 9 8.5 5 10.6 9Z" />
      <path d="M14 19V11h3v8Z" opacity=".62" />
      <path d="M13.4 11 15.5 7.4 17.6 11Z" opacity=".62" />
      <path d="M2 19h20v1.4H2Z" opacity=".35" />
      <path d="M2 17.2q3-1.4 6 0t6 0 6 0" stroke="currentColor" strokeWidth="1" fill="none" opacity=".45" />
    </g>
  ),
  // 罗马: the arena arch beside a dome.
  42: (
    <g>
      <path d="M2 19V10h8v9h-2.4v-3a1.6 1.6 0 0 0-3.2 0v3Zm5 0v-3a1.6 1.6 0 0 1 3.2 0v3Z" opacity=".7" />
      <path d="M10 19V13a1.6 1.6 0 0 1 3.2 0v6Z" opacity=".4" />
      <path d="M15.4 19v-4.6h5.2V19Z" />
      <path d="M14.8 14.4a3.2 3.2 0 0 1 6.4 0Z" />
      <path d="M2 19h20v1.5H2Z" opacity=".4" />
    </g>
  ),

  /* ---- 北美洲 ---- */
  // 跨海渡轮: a ferry on the crossing.
  44: (
    <g>
      <path d="M3 14h18l-2.4 4.6H5.4Z" />
      <rect x="7" y="8" width="8" height="6" rx=".8" />
      <path d="M11 5.6V8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 20q2.4-1.4 4.8 0t4.8 0 4.8 0 4.8 0" stroke="currentColor" strokeWidth="1" fill="none" opacity=".5" />
    </g>
  ),
  // 洛杉矶: palms along a hill ridge.
  45: (
    <g>
      <path d="M2 19 7 12l5 4 4-7 6 10Z" opacity=".5" />
      <path d="M7.6 19V9.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.6 9.6C6 8.4 4.6 8.4 3.6 9.2M7.6 9.6c1.6-1.2 3-1.2 4 0M7.6 9.6C6.8 7.8 6.8 6.4 7.6 5.4M7.6 9.6c.8-1.8.8-3.2 0-4.2" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M2 19h20v1.5H2Z" opacity=".4" />
    </g>
  ),
  // 纽约: a stepped skyline of towers.
  46: (
    <g>
      <path d="M2 19V11h3v8ZM6 19V7.4h3V19Z" />
      <path d="M10 19V4.6h4V19Z" />
      <path d="M15 19V9h3v10ZM19 19v-6h3v6Z" opacity=".55" />
    </g>
  ),
  // 旧金山: a suspension span between two towers.
  47: (
    <g>
      <path d="M4.4 19V8h1.6v11ZM18 19V8h1.6v11Z" />
      <path d="M4.4 9.4c4.4 4 10.8 4 15.2 0" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M8 11.6v2.6M12 12.6v2.6M16 11.6v2.6" stroke="currentColor" strokeWidth=".9" opacity=".6" />
      <path d="M2 19h20v1.5H2Z" opacity=".4" />
    </g>
  )
};

/** The mark for a tile at `index`, or undefined when it has none. */
export function crestFor(index: number): JSX.Element | undefined {
  return SHAPES[index];
}

/**
 * Renders a tile's crest. It is drawn in one ink, taken from `color` so it sits in step with whichever theme is active.
 */
export function Crest({ index, size = 16, color }: {
  index: number; size?: number; color?: string;
}): JSX.Element | null {
  const shape = crestFor(index);
  if (!shape) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color ?? "currentColor"}
      style={{ display: "block", color: color ?? "currentColor" }} aria-hidden="true" focusable="false">
      {shape}
    </svg>
  );
}

/** True when a mark exists, so a test can assert full coverage of the board. */
export const hasCrest = (index: number): boolean => !!crestFor(index);
