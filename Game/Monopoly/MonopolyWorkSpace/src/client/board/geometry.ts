/**
 * Where each of the 48 tiles sits on the ring, as a 0–1 fraction of the board's width and height.
 *
 * The ring is drawn as a 3-D-looking board: 14 cells along the bottom, 10 up each side, 14 along the top — 2×14 + 2×10 = 48.
 * A tile is placed by its cell, and the whole layout is expressed in percentages so it scales with the board without any
 * measurement in JavaScript. That keeps the board correct on every screen size and on a rotation, with no resize listener.
 *
 * Walking order is clockwise from the start cell. Tile 0 (起点) is the bottom-right corner; the board proceeds leftward
 * along the bottom edge, up the left side, rightward along the top, and down the right side.
 */

/** How many cells run along each edge of the ring. Corners are shared by their two edges. */
export const EDGE = 14;
/** How many tiles fit between two corners on a side edge. */
const SIDE = 10;

export interface CellLayout {
  /** Left edge as a percentage of board width. */
  x: number;
  /** Top edge as a percentage of board height. */
  y: number;
  /** Width and height as percentages. Side tiles are narrower than bottom/top tiles, as on a real board. */
  w: number;
  h: number;
  /** Which edge the tile belongs to, so its colour bar can sit on the inner side. */
  side: "bottom" | "top" | "left" | "right" | "corner";
  /** Which way the colour bar faces. On a bottom tile it opens upward, on a top tile downward. */
  bar: "up" | "down" | "left" | "right" | "none";
}

/**
 * The board ring is 14 columns wide and 12 rows tall: 14 tiles along the bottom, 10 per side, 14 along the top.
 *
 * The two side columns are deliberately *narrower* than a bottom tile, as on a real board: a side tile only has to fit a
 * rotated label, so giving it a full column would steal width from the centre for nothing. The four corner cells are the
 * same rectangle as a bottom tile, which keeps the ring square at the corners.
 *
 * The ring shape is fixed by the *number* of tiles, not by the screen: 14 / 10 / 14 / 10 always totals 48. What changes on a
 * small screen is how much of the board the centre takes — see `CentreInsets` — because a phone needs every pixel of tile
 * it can get.
 */
const COLS = 14;
const ROWS = 12;

/** A bottom/top tile is one column wide and one row tall. */
const LONG_W = 100 / COLS;
const LONG_H = 100 / ROWS;
/** A side tile is narrower than a column: 62% of one, which is enough for a stacked label on its edge. */
const SIDE_W = (100 / COLS) * 0.62;
const SIDE_H = 100 / ROWS;

/** The cell for tile `index`, in walking order from 起点. */
export function layoutOf(index: number): CellLayout {
  // Bottom edge: tiles 0..13, running right to left (0 is the bottom-right corner of the ring).
  if (index <= 13) {
    return {
      x: 100 - (index + 1) * LONG_W,
      y: 100 - LONG_H,
      w: LONG_W, h: LONG_H,
      side: index === 0 || index === 13 ? "corner" : "bottom",
      bar: index === 0 || index === 13 ? "none" : "up"
    };
  }
  // Left edge: tiles 14..23, running bottom to top, between the two corner rows.
  if (index <= 23) {
    const step = index - 13;
    return {
      x: 0,
      y: 100 - LONG_H - step * SIDE_H,
      w: SIDE_W, h: SIDE_H,
      side: "left",
      bar: "right"
    };
  }
  // Top edge: tiles 24..37, running left to right.
  if (index <= 37) {
    const step = index - 23;
    return {
      x: (step - 1) * LONG_W,
      y: 0,
      w: LONG_W, h: LONG_H,
      side: step === 14 ? "corner" : "top",
      bar: step === 14 ? "none" : "down"
    };
  }
  // Right edge: tiles 38..47, running top to bottom, between the two corner rows.
  const step = index - 37;
  return {
    x: 100 - SIDE_W,
    y: LONG_H + (step - 1) * SIDE_H,
    w: SIDE_W, h: SIDE_H,
    side: "right",
    bar: "left"
  };
}

/** The centre of a tile in board-relative percentages, for placing a piece or a floating label. */
export function centerOf(index: number): { x: number; y: number } {
  const cell = layoutOf(index);
  return { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 };
}

/** Where a piece stands on a tile, offset by its slot so several pieces on one tile do not overlap completely. */
export function tokenSpot(index: number, slot: number, total: number): { x: number; y: number } {
  const center = centerOf(index);
  const cell = layoutOf(index);
  // Up to 8 pieces cluster in a small ring inside the tile.
  if (total <= 1) return center;
  const angle = (slot / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const radius = Math.min(cell.w, cell.h) * 0.26;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

export { COLS as BOARD_COLS, ROWS as BOARD_ROWS, SIDE as BOARD_SIDE };
