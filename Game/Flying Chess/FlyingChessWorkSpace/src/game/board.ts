/**
 * 棋盘几何：由 素材/Map/flying_chess.svg 的坐标表提取。
 *
 * 环线 52 格，颜色按 B-G-R-Y 每 4 格循环一轮（13 轮闭合）——这个规律也是环线顺序正确的证据。
 * 每色跑道 5 格 + 中央终点 1 格。
 */

export type Color = "red" | "green" | "blue" | "yellow";

export const COLORS: Color[] = ["red", "green", "blue", "yellow"];

export const COLOR_HEX: Record<Color, string> = {
  red: "#e02b2b",
  green: "#1fa84a",
  blue: "#1d6fd6",
  yellow: "#f6d11a"
};

/** 深一档的阵营色，用于飞机图标与描边。 */
export const COLOR_DARK: Record<Color, string> = {
  red: "#a81e1e",
  green: "#12762f",
  blue: "#124a96",
  yellow: "#b99a00"
};

export const COLOR_NAME: Record<Color, string> = {
  red: "红",
  green: "绿",
  blue: "蓝",
  yellow: "黄"
};

/** 环线一格。rect 用 x/y/w/h，三角形用 points。 */
export type RingCell = {
  readonly shape: "rect" | "tri";
  readonly color: Color;
  /** bbox，用于计算中心与命中区域。 */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly points?: string;
};

const R = (x: number, y: number, w: number, h: number, color: Color): RingCell =>
  ({ shape: "rect", x, y, w, h, color });

const T = (points: string, x: number, y: number, w: number, h: number, color: Color): RingCell =>
  ({ shape: "tri", x, y, w, h, points, color });

/**
 * 顺时针环线，从顶边左起。索引即"绕行步数"的基准。
 * 顺序经过校验：颜色严格 B-G-R-Y 循环 13 轮。
 */
export const RING: readonly RingCell[] = [
  R(324, 25, 52, 100, "blue"),      // 0
  R(374, 25, 52, 100, "green"),     // 1
  R(424, 25, 52, 100, "red"),       // 2
  R(474, 25, 52, 100, "yellow"),    // 3
  R(524, 25, 52, 100, "blue"),      // 4
  T("575,25 675,125 575,125", 575, 25, 100, 100, "green"),   // 5 外侧角
  R(575, 124, 100, 52, "red"),      // 6
  R(575, 174, 100, 52, "yellow"),   // 7
  T("675,225 575,225 575,325", 575, 225, 100, 100, "blue"),  // 8 内侧缺口（蓝捷径起点）
  T("675,225 675,325 575,325", 575, 225, 100, 100, "green"), // 9 内侧缺口（绿捷径起点）
  R(674, 225, 52, 100, "red"),      // 10
  R(724, 225, 52, 100, "yellow"),   // 11
  T("775,225 875,325 775,325", 775, 225, 100, 100, "blue"),  // 12 外侧角
  R(775, 324, 100, 52, "green"),    // 13
  R(775, 374, 100, 52, "red"),      // 14
  R(775, 424, 100, 52, "yellow"),   // 15
  R(775, 474, 100, 52, "blue"),     // 16
  R(775, 524, 100, 52, "green"),    // 17
  T("875,575 775,675 775,575", 775, 575, 100, 100, "red"),   // 18 外侧角
  R(724, 575, 52, 100, "yellow"),   // 19
  R(674, 575, 52, 100, "blue"),     // 20
  T("675,675 675,575 575,575", 575, 575, 100, 100, "green"), // 21 内侧缺口
  T("675,675 575,675 575,575", 575, 575, 100, 100, "red"),   // 22 内侧缺口（红捷径起点）
  R(575, 674, 100, 52, "yellow"),   // 23
  R(575, 724, 100, 52, "blue"),     // 24
  T("675,775 575,875 575,775", 575, 775, 100, 100, "green"), // 25 外侧角
  R(524, 775, 52, 100, "red"),      // 26
  R(474, 775, 52, 100, "yellow"),   // 27
  R(424, 775, 52, 100, "blue"),     // 28
  R(374, 775, 52, 100, "green"),    // 29
  R(324, 775, 52, 100, "red"),      // 30
  T("325,875 225,775 325,775", 225, 775, 100, 100, "yellow"),// 31 外侧角
  R(225, 724, 100, 52, "blue"),     // 32
  R(225, 674, 100, 52, "green"),    // 33
  T("225,675 325,675 325,575", 225, 575, 100, 100, "red"),   // 34 内侧缺口
  T("225,675 225,575 325,575", 225, 575, 100, 100, "yellow"),// 35 内侧缺口（黄捷径起点）
  R(174, 575, 52, 100, "blue"),     // 36
  R(124, 575, 52, 100, "green"),    // 37
  T("125,675 25,575 125,575", 25, 575, 100, 100, "red"),     // 38 外侧角
  R(25, 524, 100, 52, "yellow"),    // 39
  R(25, 474, 100, 52, "blue"),      // 40
  R(25, 424, 100, 52, "green"),     // 41 绿跑道入口
  R(25, 374, 100, 52, "red"),       // 42
  R(25, 324, 100, 52, "yellow"),    // 43
  T("25,325 125,225 125,325", 25, 225, 100, 100, "blue"),    // 44 外侧角
  R(124, 225, 52, 100, "green"),    // 45
  R(174, 225, 52, 100, "red"),      // 46
  T("225,225 225,325 325,325", 225, 225, 100, 100, "yellow"),// 47 内侧缺口
  T("225,225 325,225 325,325", 225, 225, 100, 100, "blue"),  // 48 内侧缺口（蓝捷径起点）
  R(225, 174, 100, 52, "green"),    // 49
  R(225, 124, 100, 52, "red"),      // 50
  T("225,125 325,25 325,125", 225, 25, 100, 100, "yellow")   // 51 外侧角
];

export const RING_SIZE = RING.length;

/** 每色跑道 5 格，从外向内。 */
export const RUNWAYS: Record<Color, readonly { x: number; y: number; w: number; h: number }[]> = {
  red: [150, 200, 250, 300, 350].map((cy) => ({ x: 425, y: cy - 25, w: 50, h: 50 })),
  blue: [750, 700, 650, 600, 550].map((cy) => ({ x: 425, y: cy - 25, w: 50, h: 50 })),
  green: [150, 200, 250, 300, 350].map((cx) => ({ x: cx - 25, y: 425, w: 50, h: 50 })),
  yellow: [750, 700, 650, 600, 550].map((cx) => ({ x: cx - 25, y: 425, w: 50, h: 50 }))
};

/** 中央终点：四个三角，颜色与跑道对应。 */
export const GOAL_POINTS: Record<Color, string> = {
  red: "450,450 375,375 525,375",
  green: "450,450 375,375 375,525",
  yellow: "450,450 525,375 525,525",
  blue: "450,450 375,525 525,525"
};

export const GOAL_CENTER: Record<Color, { x: number; y: number }> = {
  red: { x: 450, y: 400 },
  green: { x: 400, y: 450 },
  yellow: { x: 500, y: 450 },
  blue: { x: 450, y: 500 }
};

/** 四角基地与其中的 4 个停机位。 */
const SLOT_LOCAL: readonly [number, number][] = [[55, 55], [145, 55], [55, 145], [145, 145]];

const baseOf = (x: number, y: number): { x: number; y: number; slots: { x: number; y: number }[] } =>
  ({ x, y, slots: SLOT_LOCAL.map(([dx, dy]) => ({ x: x + dx, y: y + dy })) });

export const BASES: Record<Color, { x: number; y: number; slots: { x: number; y: number }[] }> = {
  green: baseOf(25, 25),
  red: baseOf(675, 25),
  blue: baseOf(25, 675),
  yellow: baseOf(675, 675)
};

/**
 * 每色的起飞格与跑道入口。
 * 起飞格紧邻本方基地；绕行 48 格后落回自己的跑道入口（第 41 / 2 / 28 / 15 格）。
 */
export const START_INDEX: Record<Color, number> = {
  green: 46,
  red: 7,
  yellow: 20,
  blue: 33
};

export const ENTRY_INDEX: Record<Color, number> = {
  green: 41,
  red: 2,
  yellow: 15,
  blue: 28
};

/**
 * 捷径：落在本色的捷径格上，向前跳 12 格。
 * 这里存的是环线格号（与 RING 的下标一致），不是步数——两者差了本方起飞格，混用会算错格子。
 */
export const SHORTCUT_CELL: Record<Color, number> = {
  green: 9,
  red: 22,
  yellow: 35,
  blue: 48
};

/** 捷径格对应的步数，由起飞格反推。 */
export const SHORTCUT_STEP: Record<Color, number> = {
  green: (SHORTCUT_CELL.green - START_INDEX.green + RING_SIZE) % RING_SIZE,
  red: (SHORTCUT_CELL.red - START_INDEX.red + RING_SIZE) % RING_SIZE,
  yellow: (SHORTCUT_CELL.yellow - START_INDEX.yellow + RING_SIZE) % RING_SIZE,
  blue: (SHORTCUT_CELL.blue - START_INDEX.blue + RING_SIZE) % RING_SIZE
};

export const SHORTCUT_JUMP = 12;

/** 捷径格与起飞格是安全格：停在其上的飞机不会被撞回。 */
export const SAFE_INDICES: readonly number[] = [
  START_INDEX.red, START_INDEX.green, START_INDEX.blue, START_INDEX.yellow,
  SHORTCUT_CELL.red, SHORTCUT_CELL.green, SHORTCUT_CELL.blue, SHORTCUT_CELL.yellow
];

/** 跑道之前的最大环线步数；再往后 5 格跑道、1 格终点。 */
export const LAST_RING_STEP = 47;
export const RUNWAY_LEN = 5;
export const GOAL_STEP = LAST_RING_STEP + RUNWAY_LEN + 1; // 53

/** 某一格的中心坐标。 */
export function ringCenter(index: number): { x: number; y: number } {
  const cell = RING[index]!;
  return { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 };
}

export function runwayCenter(color: Color, i: number): { x: number; y: number } {
  const cell = RUNWAYS[color][i]!;
  return { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 };
}

/** 把 step 换算成屏幕坐标，base 表示还在停机坪。 */
export function positionFor(color: Color, step: number, baseIndex: number): { x: number; y: number } {
  if (step < 0) return BASES[color].slots[baseIndex]!;
  if (step <= LAST_RING_STEP) return ringCenter((START_INDEX[color] + step) % RING_SIZE);
  if (step < GOAL_STEP) return runwayCenter(color, step - LAST_RING_STEP - 1);
  return GOAL_CENTER[color];
}
