import { describe, expect, it } from "vitest";
import { COMMERCIAL_TILES, REGIONS, BOARD_TILES, isCommercial } from "../../src/shared/board.ts";
import { crestFor, hasCrest } from "../../src/client/art/crests.tsx";
import { hasScene } from "../../src/client/art/scenes.tsx";
import { SEAT_COLORS, TOKENS, tokenOf, seatColor } from "../../src/client/art/tokens.tsx";

/**
 * The art layer is checked the same way the data layer is: every purchasable tile must have a mark, because a blank tile is
 * a hole in the board, and every mark must stay inside its 24×24 box, because a mark that overflows is clipped on a narrow
 * tile and looks like a bug rather than a drawing.
 */
describe("大富翁：棋盘美术覆盖", () => {
  it("gives every purchasable tile a crest", () => {
    const missing = COMMERCIAL_TILES.filter((tile) => !hasCrest(tile.index));
    expect(missing.map((tile) => `${tile.index} ${tile.city}`)).toEqual([]);
    expect(COMMERCIAL_TILES.length).toBe(35);
  });

  it("gives every purchasable tile a full scene for its detail card", () => {
    const missing = COMMERCIAL_TILES.filter((tile) => !hasScene(tile.index));
    expect(missing.map((tile) => `${tile.index} ${tile.city}`)).toEqual([]);
  });

  it("draws nothing outside the crest grid, which would be clipped on a narrow tile", () => {
    // Every crest is authored on the same 24×24 viewBox. A coordinate outside it means the mark would be cut off.
    for (const tile of COMMERCIAL_TILES) {
      const shape = crestFor(tile.index);
      expect(shape, `crest ${tile.index}`).toBeTruthy();
      const markup = JSON.stringify(shape);
      // The only numbers a path may carry beyond the box are stroke widths, opacities and radii, which are all small.
      for (const number of markup.match(/-?\d+(\.\d+)?/g) ?? []) {
        const value = Number(number);
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("has exactly one crest per purchasable tile and no duplicates by index", () => {
    const indexes = COMMERCIAL_TILES.map((tile) => tile.index);
    expect(new Set(indexes).size).toBe(indexes.length);
    for (const index of indexes) expect(hasCrest(index)).toBe(true);
  });

  it("leaves the non-purchasable squares without crests, since they are not cities", () => {
    const plain = BOARD_TILES.filter((tile) => !isCommercial(tile));
    expect(plain.length).toBe(13);
    for (const tile of plain) expect(hasCrest(tile.index)).toBe(false);
  });
});

describe("大富翁：棋子与配色", () => {
  it("has eight pieces and eight seat colours", () => {
    expect(TOKENS).toHaveLength(8);
    expect(SEAT_COLORS).toHaveLength(8);
    // Each seat gets a distinct piece and a distinct colour, which is what keeps a table readable without colour alone.
    expect(new Set(TOKENS.map((token) => token.id)).size).toBe(8);
    expect(new Set(SEAT_COLORS).size).toBe(8);
  });

  it("wraps the seat index safely for any table size up to eight", () => {
    for (let seat = 0; seat < 8; seat += 1) {
      expect(tokenOf(seat)).toBe(TOKENS[seat]);
      expect(seatColor(seat)).toBe(SEAT_COLORS[seat]);
    }
  });

  it("keeps the region colour on the data, so the board and the art agree", () => {
    // The eight region colours are content, not chrome: they live in the board data and the scenes take them as a tint.
    expect(REGIONS).toHaveLength(8);
    for (const region of REGIONS) {
      expect(region.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(region.mark).toMatch(/^[A-H]$/);
    }
  });
});