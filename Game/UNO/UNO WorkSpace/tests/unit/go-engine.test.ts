import { describe, expect, it } from "vitest";
import {
  applyMove, confirmScoring, createGame, deserialize, replay, resign, resumePlay, scoreOf, serialize, toggleDead, validateMove,
  type GoMove, type GoState, type Stone
} from "../../../../Gomoku&Weiqi/Gomoku&Weiqi WorkSpace/src/goEngine.ts";

const at = (row: number, col: number): GoMove => ({ kind: "place", point: { row, col } });
const pass: GoMove = { kind: "pass" };

/** Plays a list of moves from the start, alternating Black and White, in the order given. */
function playMoves(moves: GoMove[], options = {}): GoState {
  let state = createGame({ size: 9, ...options });
  for (const move of moves) state = applyMove(state, state.turn, move);
  return state;
}

/** A state whose board is the picture: "b" black, "w" white, "." empty. Turn and phase are as given. */
function fromPicture(rows: string[], extra: Partial<GoState> = {}): GoState {
  const base = createGame({ size: rows.length as 9 });
  const board = rows.map((line) => [...line].map((ch) => (ch === "b" ? "black" : ch === "w" ? "white" : null) as Stone | null));
  return { ...base, board, ...extra };
}

describe("go engine: placing and capturing", () => {
  it("starts empty, Black first, and rejects wrong turn, off-board and occupied points", () => {
    const game = createGame({ size: 9 });
    expect(game.turn).toBe("black");
    expect(validateMove(game, "white", at(4, 4))).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
    expect(validateMove(game, "black", at(9, 0))).toMatchObject({ ok: false, code: "OUT_OF_BOARD" });
    expect(validateMove(game, "black", at(-1, 0))).toMatchObject({ ok: false, code: "OUT_OF_BOARD" });
    const next = applyMove(game, "black", at(4, 4));
    expect(next.turn).toBe("white");
    expect(validateMove(next, "white", at(4, 4))).toMatchObject({ ok: false, code: "OCCUPIED" });
    expect(() => createGame({ size: 10 as never })).toThrow();
    expect(createGame({}).size).toBe(19);
    expect(createGame({ size: 9 }).komi).toBe(7.5);
  });

  it("captures a single stone in the centre when its last liberty is taken", () => {
    // White at (4,4); Black surrounds it, White plays elsewhere in between.
    const state = playMoves([at(3, 4), at(4, 4), at(5, 4), at(0, 0), at(4, 3), at(0, 1), at(4, 5)]);
    expect(state.board[4]![4]).toBeNull();
    expect(state.captures.black).toBe(1);
  });

  it("captures in the corner and along the edge", () => {
    const corner = playMoves([at(0, 1), at(0, 0), at(1, 0)]);
    expect(corner.board[0]![0]).toBeNull();
    expect(corner.captures.black).toBe(1);
    // A pair of White stones on the edge, needing three Black stones.
    const edge = playMoves([at(0, 2), at(0, 3), at(1, 3), at(0, 4), at(1, 4), at(8, 8), at(0, 5)]);
    expect(edge.board[0]![3]).toBeNull();
    expect(edge.board[0]![4]).toBeNull();
    expect(edge.captures.black).toBe(2);
  });

  it("captures a whole group at once and counts every stone", () => {
    const state = fromPicture([
      ".bb......",
      "bww......",
      ".bb......",
      ".........", ".........", ".........", ".........", ".........", "........."
    ], { turn: "black" });
    // White pair at (1,1),(1,2); Black to play (1,3) closes the last liberty.
    const done = applyMove(state, "black", at(1, 3));
    expect(done.board[1]![1]).toBeNull();
    expect(done.board[1]![2]).toBeNull();
    expect(done.captures.black).toBe(2);
  });
});

describe("go engine: suicide", () => {
  it("rejects a move that leaves its own group without liberties", () => {
    const state = fromPicture([
      ".w.......",
      "w........",
      ".........", ".........", ".........", ".........", ".........", ".........", "........."
    ], { turn: "black" });
    expect(validateMove(state, "black", at(0, 0))).toMatchObject({ ok: false, code: "SUICIDE" });
    expect(() => applyMove(state, "black", at(0, 0))).toThrow("禁止自杀");
  });

  it("rejects suicide of a bigger group, filling its own last liberty", () => {
    // Black (0,0),(0,1) has one liberty, (0,2). Playing it would join a group with no liberty left.
    const state = fromPicture([
      "bb.w.....",
      "www......",
      ".........", ".........", ".........", ".........", ".........", ".........", "........."
    ], { turn: "black" });
    expect(validateMove(state, "black", at(0, 2))).toMatchObject({ ok: false, code: "SUICIDE" });
  });

  it("allows a move into an eye-like point when it captures (so it gains a liberty)", () => {
    const state = fromPicture([
      ".b.......",
      "b........",
      ".........", ".........", ".........", ".........", ".........", ".........", "........."
    ], { turn: "white" });
    // White at (0,0): neighbours (0,1) black, (1,0) black. Without a capture it would be suicide.
    expect(validateMove(state, "white", at(0, 0))).toMatchObject({ ok: false, code: "SUICIDE" });
    // Give Black's (0,1) stone only that liberty: now White's (0,0) captures it and is legal.
    const capturing = fromPicture([
      ".bw......",
      "bw.......",
      ".........", ".........", ".........", ".........", ".........", ".........", "........."
    ], { turn: "white" });
    const moved = applyMove(capturing, "white", at(0, 0));
    expect(moved.board[0]![0]).toBe("white");
    expect(moved.board[0]![1]).toBeNull();
    expect(moved.captures.white).toBe(1);
  });
});

describe("go engine: ko", () => {
  // Black (0,1)(1,0)(2,1) and White (0,2)(1,3)(2,2) around the ko points (1,1) and (1,2).
  const opening = [at(0, 1), at(0, 2), at(1, 0), at(2, 2), at(2, 1), at(1, 3), at(8, 8), at(1, 1)];

  it("forbids the immediate recapture, and allows it after the position has changed", () => {
    let state = playMoves(opening);
    state = applyMove(state, "black", at(1, 2)); // Black captures the White stone at (1,1)
    expect(state.board[1]![1]).toBeNull();
    expect(validateMove(state, "white", at(1, 1))).toMatchObject({ ok: false, code: "KO" });
    expect(() => applyMove(state, "white", at(1, 1))).toThrow("打劫");
    // White plays a ko threat elsewhere, Black answers: the board now differs, so the recapture is legal.
    state = applyMove(state, "white", at(7, 7));
    state = applyMove(state, "black", at(7, 6));
    expect(validateMove(state, "white", at(1, 1))).toEqual({ ok: true });
    const recaptured = applyMove(state, "white", at(1, 1));
    expect(recaptured.board[1]![2]).toBeNull();
    // And now Black may not retake at once.
    expect(validateMove(recaptured, "black", at(1, 2))).toMatchObject({ ok: false, code: "KO" });
  });

  it("is a superko: any earlier position is forbidden, not only the one just before", () => {
    const state = playMoves(opening);
    // The position reached after White's (1,1) was already seen; a stone placed to rebuild it later is rejected too.
    expect(state.seen.length).toBe(opening.length + 1);
    const after = applyMove(state, "black", at(1, 2));
    expect(after.seen).toContain(state.seen.at(-1));
    expect(validateMove(after, "white", at(1, 1)).ok).toBe(false);
  });

  it("a pass is always allowed, even in a ko", () => {
    const state = applyMove(playMoves(opening), "black", at(1, 2));
    expect(validateMove(state, "white", pass)).toEqual({ ok: true });
  });
});

describe("go engine: passing and scoring", () => {
  it("two passes in a row start the scoring phase and stop play; a stone in between resets the count", () => {
    let state = playMoves([at(4, 4), pass]);
    expect(state.phase).toBe("playing");
    state = applyMove(state, "black", at(2, 2));
    expect(state.consecutivePasses).toBe(0);
    state = applyMove(state, "white", pass);
    state = applyMove(state, "black", pass);
    expect(state.phase).toBe("scoring");
    expect(validateMove(state, "white", at(6, 6))).toMatchObject({ ok: false, code: "NOT_PLAYING" });
  });

  // Black wall on column 3, White wall on column 5, column 4 neutral.
  const walls = (extra: string[] = []): string[] => {
    const rows = Array.from({ length: 9 }, () => "...b.w...");
    rows.splice(0, rows.length, ...rows.map((row) => row.slice(0, 9)));
    return rows.map((row, index) => extra[index] ?? row);
  };

  it("counts area: stones plus the territory only one side touches; neutral points count for nobody", () => {
    const state = fromPicture(walls(), { phase: "scoring" });
    // Black: column 3 (9) + columns 0-2 (27) = 36. White: column 5 (9) + columns 6-8 (27) = 36 + 7.5 komi.
    expect(scoreOf(state)).toEqual({ black: 36, white: 43.5, komi: 7.5 });
  });

  it("dead stones come off the board, giving the area back to the side that owns it", () => {
    // A lone Black stone at (4,7) inside White's side makes that region touch both colours: no one's territory.
    const rows = walls(); rows[4] = "...b.w.b.";
    let state = fromPicture(rows, { phase: "scoring", consecutivePasses: 2 });
    const before = scoreOf(state);
    expect(before.white).toBeLessThan(43.5);
    state = toggleDead(state, { row: 4, col: 7 });
    expect(state.dead).toEqual(["4,7"]);
    expect(scoreOf(state)).toEqual({ black: 36, white: 43.5, komi: 7.5 });
    // Clicking again takes the mark off.
    expect(toggleDead(state, { row: 4, col: 7 }).dead).toEqual([]);
  });

  it("marking a stone marks its whole chain, and an empty point is refused", () => {
    const rows = walls(); rows[3] = "...b.w.bb"; rows[4] = "...b.w..b";
    const state = fromPicture(rows, { phase: "scoring" });
    expect(toggleDead(state, { row: 3, col: 7 }).dead.sort()).toEqual(["3,7", "3,8", "4,8"]);
    expect(() => toggleDead(state, { row: 0, col: 0 })).toThrow("标记死子");
    expect(() => toggleDead({ ...state, phase: "playing" }, { row: 3, col: 7 })).toThrow("点目");
  });

  it("the game ends when both sides confirm; changing the marking asks for confirmation again", () => {
    const rows = walls(); rows[3] = "...b.w.b.";
    let state = fromPicture(rows, { phase: "scoring" });
    state = confirmScoring(state, "black");
    expect(state.phase).toBe("scoring");
    expect(state.confirmed).toEqual(["black"]);
    state = toggleDead(state, { row: 3, col: 7 });
    expect(state.confirmed).toEqual([]);
    state = confirmScoring(confirmScoring(state, "black"), "white");
    expect(state.phase).toBe("finished");
    expect(state.result).toMatchObject({ winner: "white", reason: "score", margin: 7.5 });
    expect(state.result!.score).toEqual({ black: 36, white: 43.5, komi: 7.5 });
  });

  it("a different komi can hand the win to Black", () => {
    let state = fromPicture(walls(), { phase: "scoring", komi: 0.5 });
    state = confirmScoring(confirmScoring(state, "black"), "white");
    expect(state.result).toMatchObject({ winner: "white", margin: 0.5 });
    const blackLead = fromPicture(walls(["...b.w...", "...b.w...", "...b.w...", "...b.w...", "...b.w...", "...b.w...", "...b.w...", "...b.w...", "...bbw..."]), { phase: "scoring", komi: 0.5 });
    const done = confirmScoring(confirmScoring(blackLead, "black"), "white");
    expect(done.result?.winner).toBe("black");
  });

  it("either side can reject the marking and go back to playing", () => {
    const scoring = playMoves([at(4, 4), pass, pass]);
    expect(scoring.phase).toBe("scoring");
    const resumed = resumePlay(scoring);
    expect(resumed.phase).toBe("playing");
    expect(resumed.consecutivePasses).toBe(0);
    expect(validateMove(resumed, resumed.turn, at(0, 0))).toEqual({ ok: true });
  });
});

describe("go engine: resign, replay, storage", () => {
  it("resigning ends the game for the other side", () => {
    const state = resign(createGame({ size: 9 }), "black");
    expect(state.phase).toBe("finished");
    expect(state.result).toMatchObject({ winner: "white", reason: "resigned", score: null });
    expect(() => resign(state, "white")).toThrow();
    expect(validateMove(state, "white", at(0, 0))).toMatchObject({ ok: false });
  });

  it("replay rebuilds a position from its moves (take-back) including captures and ko history", () => {
    const moves = [at(0, 1), at(0, 2), at(1, 0), at(2, 2), at(2, 1), at(1, 3), at(8, 8), at(1, 1), at(1, 2)];
    const full = playMoves(moves);
    const rebuilt = replay({ size: 9 }, full.moves);
    expect(rebuilt).toEqual(full);
    const back = replay({ size: 9 }, full.moves.slice(0, -1));
    expect(back.board[1]![1]).toBe("white");
    expect(back.turn).toBe("black");
  });

  it("serialises to JSON and back unchanged", () => {
    const state = playMoves([at(2, 2), at(6, 6), pass]);
    expect(deserialize(serialize(state))).toEqual(state);
    expect(() => deserialize(JSON.stringify({ size: 5, board: [] }))).toThrow();
  });
});

describe("go engine: random games keep the invariants", () => {
  it("never leaves a stone group without liberties and never repeats a position", () => {
    let seed = 12345;
    const random = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let game = 0; game < 60; game += 1) {
      let state = createGame({ size: 9 });
      for (let step = 0; step < 250 && state.phase === "playing"; step += 1) {
        const candidates: GoMove[] = [];
        for (let tries = 0; tries < 40; tries += 1) candidates.push(at(random(9), random(9)));
        const legal = candidates.find((move) => validateMove(state, state.turn, move).ok) ?? pass;
        state = applyMove(state, state.turn, legal);
        expect(new Set(state.seen).size).toBe(state.seen.length);
        // Every group on the board has a liberty.
        const size = state.size;
        for (let row = 0; row < size; row += 1) for (let col = 0; col < size; col += 1) {
          const colour = state.board[row]![col];
          if (!colour) continue;
          const stack = [[row, col]]; const seen = new Set([`${row},${col}`]); let liberty = false;
          while (stack.length) {
            const [r, c] = stack.pop()!;
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nr = r! + dr!; const nc = c! + dc!;
              if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
              const next = state.board[nr]![nc];
              if (next === null) liberty = true;
              else if (next === colour && !seen.has(`${nr},${nc}`)) { seen.add(`${nr},${nc}`); stack.push([nr, nc]); }
            }
          }
          expect(liberty).toBe(true);
        }
      }
    }
  });
});
