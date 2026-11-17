import { describe, expect, it } from "vitest";
import { BOARD_SIZE } from "../../src/shared/board.ts";
import { centerOf, layoutOf, tokenSpot } from "../../src/client/board/geometry.ts";

describe("大富翁棋盘布局", () => {
  it("gives every one of the 48 tiles its own cell, with none outside the board", () => {
    const cells = Array.from({ length: BOARD_SIZE }, (_, index) => layoutOf(index));
    expect(cells).toHaveLength(48);
    for (const cell of cells) {
      // Nothing may hang off the board, or a tile would be clipped on a narrow screen.
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.x + cell.w).toBeLessThanOrEqual(100.001);
      expect(cell.y + cell.h).toBeLessThanOrEqual(100.001);
      expect(cell.w).toBeGreaterThan(0);
      expect(cell.h).toBeGreaterThan(0);
    }
  });

  it("never lets two tiles overlap", () => {
    const cells = Array.from({ length: BOARD_SIZE }, (_, index) => layoutOf(index));
    for (let left = 0; left < cells.length; left += 1) {
      for (let right = left + 1; right < cells.length; right += 1) {
        const a = cells[left]!;
        const b = cells[right]!;
        const separated = a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6
          || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6;
        expect(separated, `tile ${left} overlaps tile ${right}`).toBe(true);
      }
    }
  });

  it("leaves the middle of the board free for the centre area", () => {
    // The centre has to be clear of tiles, since that is where the dice, decks and turn banner go.
    const center = { x: 50, y: 50 };
    for (let index = 0; index < BOARD_SIZE; index += 1) {
      const cell = layoutOf(index);
      const inside = center.x > cell.x && center.x < cell.x + cell.w
        && center.y > cell.y && center.y < cell.y + cell.h;
      expect(inside, `tile ${index} covers the board centre`).toBe(false);
    }
  });

  it("runs clockwise from 起点, which is the bottom-right corner", () => {
    const go = layoutOf(0);
    // 起点 is in the bottom-right corner.
    expect(go.side).toBe("corner");
    expect(go.x).toBeGreaterThan(70);
    expect(go.y).toBeGreaterThan(70);
    // The next tile is to its left along the bottom edge.
    expect(layoutOf(1).x).toBeLessThan(go.x);
    expect(layoutOf(1).side).toBe("bottom");
    // Walking on reaches the left edge, then the top, then the right edge.
    expect(layoutOf(14).side).toBe("left");
    expect(layoutOf(25).side).toBe("top");
    expect(layoutOf(38).side).toBe("right");
    // And the last tile is just above the start corner, closing the loop.
    expect(layoutOf(47).side).toBe("right");
    expect(layoutOf(47).y).toBeLessThan(go.y);
  });

  it("puts the colour bar on the inner edge of every side tile", () => {
    // The bar always faces the middle of the board, so the outer edge keeps its full height for the city name.
    expect(layoutOf(1).bar).toBe("up");
    expect(layoutOf(14).bar).toBe("right");
    expect(layoutOf(25).bar).toBe("down");
    expect(layoutOf(38).bar).toBe("left");
    // A corner has no bar: its colour would have nowhere consistent to sit.
    expect(layoutOf(0).bar).toBe("none");
    expect(layoutOf(13).bar).toBe("none");
  });

  it("centres every tile inside itself, and spreads stacked pieces apart", () => {
    for (let index = 0; index < BOARD_SIZE; index += 1) {
      const cell = layoutOf(index);
      const center = centerOf(index);
      expect(center.x).toBeCloseTo(cell.x + cell.w / 2, 6);
      expect(center.y).toBeCloseTo(cell.y + cell.h / 2, 6);
    }
    // One piece sits toward the tile's inner edge (away from the name); several are spread but stay inside the tile.
    const alone = tokenSpot(10, 0, 1);
    expect(always(alone, layoutOf(10))).toBe(true);
    expect(alone).not.toEqual(centerOf(10));
    for (let slot = 0; slot < 8; slot += 1) {
      expect(always(tokenSpot(10, slot, 8), layoutOf(10))).toBe(true);
    }
    // Two pieces on the same tile must not land on the same spot.
    expect(tokenSpot(10, 0, 2)).not.toEqual(tokenSpot(10, 1, 2));
  });
});

/** True when a point is inside a cell. */
function always(point: { x: number; y: number }, cell: { x: number; y: number; w: number; h: number }): boolean {
  return point.x >= cell.x && point.x <= cell.x + cell.w && point.y >= cell.y && point.y <= cell.y + cell.h;
}
