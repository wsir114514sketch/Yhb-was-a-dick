import { describe, expect, it } from "vitest";
import {
  agreeDraw, applyMove, createGame, deserialize, forbiddenReason, replay, resign, serialize, validateMove,
  type GomokuState, type Point, type Stone
} from "../../../../Gomoku&Weiqi/Gomoku&Weiqi WorkSpace/src/gomokuEngine.ts";

/** Puts stones on the board without going through the turn order, for set-up. */
function stones(state: GomokuState, black: Array<[number, number]>, white: Array<[number, number]> = []): GomokuState {
  const board = state.board.map((line) => line.slice());
  for (const [row, col] of black) board[row]![col] = "black";
  for (const [row, col] of white) board[row]![col] = "white";
  return { ...state, board };
}

function play(state: GomokuState, stone: Stone, row: number, col: number): GomokuState {
  return applyMove({ ...state, turn: stone }, stone, { row, col });
}

describe("gomoku engine: basics", () => {
  it("starts empty with Black to move on a 15×15 board", () => {
    const game = createGame();
    expect(game.size).toBe(15);
    expect(game.turn).toBe("black");
    expect(game.board.flat().every((cell) => cell === null)).toBe(true);
    expect(createGame({ size: 19 }).board).toHaveLength(19);
    expect(() => createGame({ size: 13 as never })).toThrow();
  });

  it("alternates turns and rejects bad moves", () => {
    let game = createGame();
    expect(validateMove(game, "white", { row: 7, col: 7 })).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
    game = applyMove(game, "black", { row: 7, col: 7 });
    expect(game.turn).toBe("white");
    expect(validateMove(game, "white", { row: 7, col: 7 })).toMatchObject({ ok: false, code: "OCCUPIED" });
    expect(validateMove(game, "white", { row: -1, col: 3 })).toMatchObject({ ok: false, code: "OUT_OF_BOARD" });
    expect(validateMove(game, "white", { row: 15, col: 3 })).toMatchObject({ ok: false, code: "OUT_OF_BOARD" });
    expect(validateMove(game, "white", { row: 1.5, col: 3 })).toMatchObject({ ok: false, code: "OUT_OF_BOARD" });
    expect(() => applyMove(game, "black", { row: 0, col: 0 })).toThrow("还没有轮到你");
  });
});

describe("gomoku engine: winning lines", () => {
  const cases: Array<[string, Array<[number, number]>, [number, number]]> = [
    ["horizontal", [[7, 3], [7, 4], [7, 5], [7, 6]], [7, 7]],
    ["vertical", [[3, 7], [4, 7], [5, 7], [6, 7]], [7, 7]],
    ["diagonal ↘", [[3, 3], [4, 4], [5, 5], [6, 6]], [7, 7]],
    ["diagonal ↙", [[3, 11], [4, 10], [5, 9], [6, 8]], [7, 7]]
  ];
  for (const [name, existing, last] of cases) {
    it(`five in a row wins: ${name}`, () => {
      const game = play(stones(createGame(), existing), "black", last[0], last[1]);
      expect(game.status).toBe("finished");
      expect(game.result).toMatchObject({ winner: "black", reason: "five" });
      expect(game.result!.line).toHaveLength(5);
    });
  }

  it("four in a row does not win, and a gap does not count", () => {
    const four = play(stones(createGame(), [[7, 3], [7, 4], [7, 5]]), "black", 7, 6);
    expect(four.status).toBe("playing");
    const gap = play(stones(createGame(), [[7, 3], [7, 4], [7, 6], [7, 7]]), "black", 7, 8);
    expect(gap.status).toBe("playing");
  });

  it("White wins too, and an opponent stone breaks the line", () => {
    const game = play(stones(createGame(), [], [[2, 2], [2, 3], [2, 4], [2, 5]]), "white", 2, 6);
    expect(game.result).toMatchObject({ winner: "white", reason: "five" });
    const broken = play(stones(createGame(), [[2, 2], [2, 3], [2, 5], [2, 6]], [[2, 4]]), "black", 2, 7);
    expect(broken.status).toBe("playing");
  });

  it("works at the edge of a 19×19 board", () => {
    const game = play(stones(createGame({ size: 19 }), [[18, 14], [18, 15], [18, 16], [18, 17]]), "black", 18, 18);
    expect(game.result?.winner).toBe("black");
  });

  it("no more moves after the game ends", () => {
    const won = play(stones(createGame(), [[7, 3], [7, 4], [7, 5], [7, 6]]), "black", 7, 7);
    expect(validateMove(won, "white", { row: 0, col: 0 })).toMatchObject({ ok: false, code: "FINISHED" });
  });

  it("a full board with no five is a draw", () => {
    // (row + 2·col) mod 4 < 2 colours the board so that no line of five of one colour exists in any direction.
    const size = 15;
    let game = createGame({ size });
    const pattern = (row: number, col: number): Stone => ((row + 2 * col) % 4 < 2 ? "black" : "white");
    const board: GomokuState["board"] = game.board.map((line, row) => line.map((_, col) => pattern(row, col)));
    board[14]![14] = null;
    game = { ...game, board, moves: Array.from({ length: size * size - 1 }, () => ({ stone: "black" as Stone, point: { row: 0, col: 0 } })) };
    const last = pattern(14, 14);
    const finished = play(game, last, 14, 14);
    expect(finished.result).toMatchObject({ winner: null, reason: "full" });
  });
});

describe("gomoku engine: free rule and overline", () => {
  it("six or more wins under the free rule", () => {
    const game = play(stones(createGame(), [[7, 2], [7, 3], [7, 4], [7, 6], [7, 7]]), "black", 7, 5);
    expect(game.result).toMatchObject({ winner: "black" });
    expect(game.result!.line).toHaveLength(6);
  });

  it("under renju six for Black is forbidden, exactly five wins, White may make six", () => {
    const setup = stones(createGame({ renju: true }), [[7, 2], [7, 3], [7, 4], [7, 6], [7, 7]]);
    expect(forbiddenReason(setup, { row: 7, col: 5 })).toBe("overline");
    expect(validateMove(setup, "black", { row: 7, col: 5 })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const five = play(stones(createGame({ renju: true }), [[7, 3], [7, 4], [7, 5], [7, 6]]), "black", 7, 7);
    expect(five.result?.winner).toBe("black");
    const white = play(stones(createGame({ renju: true }), [], [[7, 2], [7, 3], [7, 4], [7, 6], [7, 7]]), "white", 7, 5);
    expect(white.result?.winner).toBe("white");
  });
});

describe("gomoku engine: renju forbidden moves", () => {
  const renju = (black: Array<[number, number]>, white: Array<[number, number]> = []) => stones(createGame({ renju: true }), black, white);

  it("forbids a double three for Black but not for White", () => {
    // Two open threes would meet at (7,7): row 7 has (7,5)(7,6), column 7 has (5,7)(6,7).
    const black = renju([[7, 5], [7, 6], [5, 7], [6, 7]]);
    expect(forbiddenReason(black, { row: 7, col: 7 })).toBe("double-three");
    expect(validateMove(black, "black", { row: 7, col: 7 })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    // The same shape with White stones: no restriction.
    const white = { ...renju([], [[7, 5], [7, 6], [5, 7], [6, 7]]), turn: "white" as Stone };
    expect(validateMove(white, "white", { row: 7, col: 7 })).toEqual({ ok: true });
    // And the free rule has no forbidden moves at all.
    const free = stones(createGame(), [[7, 5], [7, 6], [5, 7], [6, 7]]);
    expect(validateMove(free, "black", { row: 7, col: 7 })).toEqual({ ok: true });
  });

  it("forbids a double four", () => {
    const black = renju([[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]]);
    expect(forbiddenReason(black, { row: 7, col: 7 })).toBe("double-four");
  });

  it("a gap that joins ●●●_●●● into seven is an overline, and a gap that makes five is a win", () => {
    const black = renju([[7, 1], [7, 2], [7, 3], [7, 5], [7, 6], [7, 7]]);
    expect(forbiddenReason(black, { row: 7, col: 4 })).toBe("overline");
    // ●●_●_●● : playing the middle gap makes five, so it is a win, never forbidden.
    const five = renju([[7, 1], [7, 2], [7, 4], [7, 6], [7, 7]]);
    expect(forbiddenReason(five, { row: 7, col: 5 })).toBe(null);
  });

  it("a three closed on one side is not an open three, so no double three", () => {
    // Row three is blocked by White at (7,8) and (7,4)… leaving no way to an open four: the move is allowed.
    const black = renju([[7, 5], [7, 6], [5, 7], [6, 7]], [[7, 8], [7, 4]]);
    expect(forbiddenReason(black, { row: 7, col: 7 })).toBe(null);
  });

  it("a double three that also makes exactly five is allowed", () => {
    const black = renju([[7, 3], [7, 4], [7, 5], [7, 6], [5, 8], [6, 8], [5, 10], [6, 9]]);
    // (7,7) completes five in row 7, whatever else it forms.
    expect(forbiddenReason(black, { row: 7, col: 7 })).toBe(null);
  });

  it("a single open three or a single four is fine", () => {
    expect(forbiddenReason(renju([[7, 5], [7, 6]]), { row: 7, col: 7 })).toBe(null);
    expect(forbiddenReason(renju([[7, 4], [7, 5], [7, 6]]), { row: 7, col: 7 })).toBe(null);
  });
});

describe("gomoku engine: results and storage", () => {
  it("resign and agreed draw finish the game", () => {
    const game = createGame();
    expect(resign(game, "black").result).toMatchObject({ winner: "white", reason: "resigned" });
    expect(agreeDraw(game).result).toMatchObject({ winner: null, reason: "agreed-draw" });
    expect(() => resign(resign(game, "black"), "white")).toThrow();
  });

  it("replay rebuilds the position, which is how a take-back works", () => {
    let game = createGame({ renju: true });
    const moves: Array<{ stone: Stone; point: Point }> = [];
    for (const [i, point] of [{ row: 7, col: 7 }, { row: 7, col: 8 }, { row: 8, col: 8 }].entries()) {
      const stone: Stone = i % 2 === 0 ? "black" : "white";
      game = applyMove(game, stone, point);
      moves.push({ stone, point });
    }
    const undone = replay({ size: 15, renju: true }, moves.slice(0, 2));
    expect(undone.moves).toHaveLength(2);
    expect(undone.turn).toBe("black");
    expect(undone.board[8]![8]).toBeNull();
  });

  it("serialises to JSON and back unchanged", () => {
    const game = applyMove(createGame({ size: 19, renju: true }), "black", { row: 9, col: 9 });
    expect(deserialize(serialize(game))).toEqual(game);
    expect(() => deserialize(JSON.stringify({ size: 7, board: [] }))).toThrow();
  });
});
