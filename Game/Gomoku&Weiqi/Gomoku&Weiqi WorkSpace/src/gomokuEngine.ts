/**
 * The gomoku (五子棋) rule engine. Pure data in, pure data out: no I/O, no clock, no shared code with the Go engine.
 *
 * Rules
 *  - Black moves first. Free rule (default): five or more in a row, horizontally, vertically or diagonally, wins.
 *  - Renju option (禁手): only Black is restricted. Exactly five wins; a move that makes an overline (six or more), a
 *    double four (四四) or a double three (三三) is not allowed, unless the same move also makes exactly five.
 *    White is never restricted and wins with five or more.
 *  - A full board with no winner is a draw.
 *
 * A forbidden move is rejected (not a loss): the server answers with the reason and the same player moves again.
 * Every function takes the state and returns a new one; a state is plain JSON so it can be stored and sent as is.
 */

export type Stone = "black" | "white";
export interface Point { row: number; col: number }
export type GomokuSize = 15 | 19;

export interface GomokuOptions { size: GomokuSize; renju: boolean }

export interface GomokuResult {
  winner: Stone | null;
  reason: "five" | "full" | "resigned" | "agreed-draw";
  /** The five (or more) stones that decided the game, for highlighting; empty when there was no line. */
  line: Point[];
}

export interface GomokuState {
  size: GomokuSize;
  renju: boolean;
  board: Array<Array<Stone | null>>;
  turn: Stone;
  moves: Array<{ stone: Stone; point: Point }>;
  status: "playing" | "finished";
  result: GomokuResult | null;
}

export type MoveCheck = { ok: true } | { ok: false; code: string; message: string };

export const GOMOKU_SIZES: readonly GomokuSize[] = [15, 19];

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [1, 1], [1, -1]];

export function opponent(stone: Stone): Stone {
  return stone === "black" ? "white" : "black";
}

export function createGame(options: Partial<GomokuOptions> = {}): GomokuState {
  const size = options.size ?? 15;
  if (!GOMOKU_SIZES.includes(size)) throw new Error("棋盘大小只能是 15×15 或 19×19");
  return {
    size,
    renju: options.renju === true,
    board: Array.from({ length: size }, () => Array<Stone | null>(size).fill(null)),
    turn: "black",
    moves: [],
    status: "playing",
    result: null
  };
}

type Board = Array<Array<Stone | null>>;

function inside(board: Board, row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < board.length && col < board.length;
}

function cell(board: Board, row: number, col: number): Stone | null | undefined {
  return inside(board, row, col) ? board[row]![col]! : undefined;
}

/** How many stones of `stone` run through (row, col) along the direction, counting the cell itself. */
function runLength(board: Board, row: number, col: number, [dr, dc]: readonly [number, number], stone: Stone): number {
  let count = 1;
  for (let r = row + dr, c = col + dc; cell(board, r, c) === stone; r += dr, c += dc) count += 1;
  for (let r = row - dr, c = col - dc; cell(board, r, c) === stone; r -= dr, c -= dc) count += 1;
  return count;
}

/** The cells of that run, for highlighting. */
function runCells(board: Board, row: number, col: number, [dr, dc]: readonly [number, number], stone: Stone): Point[] {
  const cells: Point[] = [{ row, col }];
  for (let r = row + dr, c = col + dc; cell(board, r, c) === stone; r += dr, c += dc) cells.push({ row: r, col: c });
  for (let r = row - dr, c = col - dc; cell(board, r, c) === stone; r -= dr, c -= dc) cells.unshift({ row: r, col: c });
  return cells;
}

interface Analysis { five: boolean; overline: boolean; fours: number; threes: number }

/**
 * What Black's stone just placed at (row, col) makes. The board already holds the stone.
 * `depth` bounds the look-ahead used to decide whether a three is a real (open) three.
 */
function analyze(board: Board, row: number, col: number, depth: number): Analysis {
  let five = false;
  let overline = false;
  let fours = 0;
  let threes = 0;
  for (const direction of DIRECTIONS) {
    const run = runLength(board, row, col, direction, "black");
    if (run === 5) five = true;
    else if (run > 5) overline = true;
  }
  if (five) return { five, overline, fours, threes };

  for (const direction of DIRECTIONS) {
    const [dr, dc] = direction;
    // A four: an empty cell on this line where one more Black stone makes exactly five through (row, col).
    const completions: Array<[number, number]> = [];
    for (let step = -4; step <= 4; step += 1) {
      if (step === 0) continue;
      const r = row + dr * step;
      const c = col + dc * step;
      if (cell(board, r, c) !== null) continue;
      board[r]![c] = "black";
      if (runLength(board, row, col, direction, "black") === 5) completions.push([r, c]);
      board[r]![c] = null;
    }
    if (completions.length > 0) {
      // ●●●● with both ends open is one four, not two; separate fours on one line (●●●_●●●) are two.
      const straight = completions.length === 2 && runLength(board, row, col, direction, "black") === 4;
      fours += straight ? 1 : completions.length;
      continue;
    }
    if (depth >= 2) continue;
    // An open three: one more stone makes a straight four (open at both ends, both ends really completing to five),
    // and that stone is itself not a forbidden move.
    let open = false;
    for (let step = -3; step <= 3 && !open; step += 1) {
      if (step === 0) continue;
      const r = row + dr * step;
      const c = col + dc * step;
      if (cell(board, r, c) !== null) continue;
      board[r]![c] = "black";
      if (makesStraightFour(board, row, col, direction)) {
        const next = analyze(board, r, c, depth + 1);
        const forbidden = !next.five && (next.overline || next.fours >= 2 || next.threes >= 2);
        if (!forbidden) open = true;
      }
      board[r]![c] = null;
    }
    if (open) threes += 1;
  }
  return { five, overline, fours, threes };
}

/** Exactly four in a row through the cell with both end cells empty and each end completing to exactly five. */
function makesStraightFour(board: Board, row: number, col: number, direction: readonly [number, number]): boolean {
  if (runLength(board, row, col, direction, "black") !== 4) return false;
  const [dr, dc] = direction;
  let r1 = row;
  let c1 = col;
  while (cell(board, r1 + dr, c1 + dc) === "black") { r1 += dr; c1 += dc; }
  let r2 = row;
  let c2 = col;
  while (cell(board, r2 - dr, c2 - dc) === "black") { r2 -= dr; c2 -= dc; }
  const e1: [number, number] = [r1 + dr, c1 + dc];
  const e2: [number, number] = [r2 - dr, c2 - dc];
  if (cell(board, e1[0], e1[1]) !== null || cell(board, e2[0], e2[1]) !== null) return false;
  // Filling an end must give exactly five, so the cell beyond it must not be Black.
  return cell(board, e1[0] + dr, e1[1] + dc) !== "black" && cell(board, e2[0] - dr, e2[1] - dc) !== "black";
}

/** Why Black may not play (row, col) under renju, or null when the move is allowed. */
export function forbiddenReason(state: GomokuState, point: Point): "overline" | "double-four" | "double-three" | null {
  if (!state.renju || cell(state.board, point.row, point.col) !== null) return null;
  const board = state.board.map((line) => line.slice());
  board[point.row]![point.col] = "black";
  const result = analyze(board, point.row, point.col, 0);
  if (result.five) return null;
  if (result.overline) return "overline";
  if (result.fours >= 2) return "double-four";
  if (result.threes >= 2) return "double-three";
  return null;
}

const FORBIDDEN_TEXT = { overline: "长连禁手", "double-four": "四四禁手", "double-three": "三三禁手" } as const;

export function validateMove(state: GomokuState, stone: Stone, point: Point): MoveCheck {
  if (state.status !== "playing") return { ok: false, code: "FINISHED", message: "对局已经结束" };
  if (state.turn !== stone) return { ok: false, code: "NOT_YOUR_TURN", message: "还没有轮到你" };
  if (!Number.isInteger(point?.row) || !Number.isInteger(point?.col) || !inside(state.board, point.row, point.col)) {
    return { ok: false, code: "OUT_OF_BOARD", message: "落点不在棋盘上" };
  }
  if (state.board[point.row]![point.col] !== null) return { ok: false, code: "OCCUPIED", message: "这个位置已经有棋子" };
  if (stone === "black") {
    const reason = forbiddenReason(state, point);
    if (reason) return { ok: false, code: "FORBIDDEN", message: `黑棋不能在这里落子：${FORBIDDEN_TEXT[reason]}` };
  }
  return { ok: true };
}

/** Plays the move and returns the new state; throws the validation message when the move is not allowed. */
export function applyMove(state: GomokuState, stone: Stone, point: Point): GomokuState {
  const check = validateMove(state, stone, point);
  if (!check.ok) throw new Error(check.message);
  const board = state.board.map((line) => line.slice());
  board[point.row]![point.col] = stone;
  const next: GomokuState = {
    ...state,
    board,
    turn: opponent(stone),
    moves: [...state.moves, { stone, point: { row: point.row, col: point.col } }],
    status: "playing",
    result: null
  };

  let line: Point[] = [];
  for (const direction of DIRECTIONS) {
    const run = runLength(board, point.row, point.col, direction, stone);
    const wins = stone === "black" && state.renju ? run === 5 : run >= 5;
    if (wins && runCells(board, point.row, point.col, direction, stone).length > line.length) {
      line = runCells(board, point.row, point.col, direction, stone);
    }
  }
  if (line.length > 0) {
    next.status = "finished";
    next.result = { winner: stone, reason: "five", line };
  } else if (next.moves.length === state.size * state.size) {
    next.status = "finished";
    next.result = { winner: null, reason: "full", line: [] };
  }
  return next;
}

export function getResult(state: GomokuState): GomokuResult | null {
  return state.result;
}

export function resign(state: GomokuState, stone: Stone): GomokuState {
  if (state.status !== "playing") throw new Error("对局已经结束");
  return { ...state, status: "finished", result: { winner: opponent(stone), reason: "resigned", line: [] } };
}

export function agreeDraw(state: GomokuState): GomokuState {
  if (state.status !== "playing") throw new Error("对局已经结束");
  return { ...state, status: "finished", result: { winner: null, reason: "agreed-draw", line: [] } };
}

/** Rebuilds a game from its move list; the way to take moves back (悔棋) is to replay all but the last ones. */
export function replay(options: Partial<GomokuOptions>, moves: ReadonlyArray<{ stone: Stone; point: Point }>): GomokuState {
  let state = createGame(options);
  for (const move of moves) state = applyMove(state, move.stone, move.point);
  return state;
}

/** Whose turn it is after the last move, and where the last stone went. */
export function lastMove(state: GomokuState): Point | null {
  return state.moves.at(-1)?.point ?? null;
}

export function serialize(state: GomokuState): string {
  return JSON.stringify(state);
}

export function deserialize(text: string): GomokuState {
  const state = JSON.parse(text) as GomokuState;
  if (!GOMOKU_SIZES.includes(state.size) || !Array.isArray(state.board) || state.board.length !== state.size) {
    throw new Error("棋局数据不完整");
  }
  return state;
}
