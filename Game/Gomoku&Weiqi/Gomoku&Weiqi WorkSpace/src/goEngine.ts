/**
 * The Go (围棋) rule engine. Pure data in, pure data out: no I/O, no clock, no shared code with the gomoku engine.
 *
 * Rules
 *  - Black moves first. A move places a stone or passes. After a stone is placed, the opponent groups left without a
 *    liberty are captured first; then, if the placed stone's own group has no liberty, the move is suicide and is
 *    rejected (a move that captures and so gains a liberty is legal).
 *  - Ko: positional superko. Every board position that has appeared in the game (the empty board included) is
 *    remembered, and a move that would recreate any of them is rejected. This covers the simple ko (immediate
 *    recapture) and also long cycles such as triple ko. Only the board is compared, not whose turn it is.
 *  - Two passes in a row end the play and open the scoring phase. Scoring is simplified: the players agree on which
 *    chains are dead by clicking them, each side confirms, and the engine then counts. There is no automatic life-and-
 *    death analysis. Either side may reject the marking and resume play instead.
 *  - Scoring is area scoring (Chinese rules, 数子法): a side's score is its living stones plus the empty regions that
 *    touch only its stones. White gets the komi (default 7.5, so there is no draw).
 *  - A side may resign at any time.
 */

export type Stone = "black" | "white";
export interface Point { row: number; col: number }
export type GoSize = 9 | 13 | 19;
export type GoMove = { kind: "place"; point: Point } | { kind: "pass" };

export interface GoOptions { size: GoSize; komi: number }

export interface GoResult {
  winner: Stone | null;
  reason: "score" | "resigned";
  /** Area points of each side; White's includes the komi. Null when the game ended by resignation. */
  score: { black: number; white: number; komi: number } | null;
  /** How many points the winner leads by (null for a resignation). */
  margin: number | null;
}

export interface GoState {
  size: GoSize;
  komi: number;
  board: Array<Array<Stone | null>>;
  turn: Stone;
  /** Stones each side has captured so far. */
  captures: Record<Stone, number>;
  moves: Array<{ stone: Stone; move: GoMove }>;
  /** Every board position seen so far (as a string), for the superko check. */
  seen: string[];
  consecutivePasses: number;
  phase: "playing" | "scoring" | "finished";
  /** Stones marked dead in the scoring phase, as "row,col". */
  dead: string[];
  /** Who has confirmed the current marking. */
  confirmed: Stone[];
  result: GoResult | null;
}

export type MoveCheck = { ok: true } | { ok: false; code: string; message: string };

export const GO_SIZES: readonly GoSize[] = [9, 13, 19];
export const DEFAULT_KOMI = 7.5;

type Board = Array<Array<Stone | null>>;

export function opponent(stone: Stone): Stone {
  return stone === "black" ? "white" : "black";
}

function positionKey(board: Board): string {
  return board.map((line) => line.map((stone) => (stone === "black" ? "b" : stone === "white" ? "w" : ".")).join("")).join("/");
}

export function createGame(options: Partial<GoOptions> = {}): GoState {
  const size = options.size ?? 19;
  if (!GO_SIZES.includes(size)) throw new Error("棋盘大小只能是 9×9、13×13 或 19×19");
  const komi = options.komi ?? DEFAULT_KOMI;
  if (!Number.isFinite(komi) || komi < -50 || komi > 50) throw new Error("贴目数不合理");
  const board: Board = Array.from({ length: size }, () => Array<Stone | null>(size).fill(null));
  return {
    size,
    komi,
    board,
    turn: "black",
    captures: { black: 0, white: 0 },
    moves: [],
    seen: [positionKey(board)],
    consecutivePasses: 0,
    phase: "playing",
    dead: [],
    confirmed: [],
    result: null
  };
}

function inside(size: number, row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < size && col < size;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** The connected stones of one colour containing (row, col), and the empty points next to them. */
function chainAt(board: Board, row: number, col: number): { stones: Point[]; liberties: Set<string> } {
  const colour = board[row]![col]!;
  const stones: Point[] = [];
  const liberties = new Set<string>();
  const visited = new Set<string>([`${row},${col}`]);
  const stack: Point[] = [{ row, col }];
  while (stack.length > 0) {
    const point = stack.pop()!;
    stones.push(point);
    for (const [dr, dc] of NEIGHBOURS) {
      const r = point.row + dr;
      const c = point.col + dc;
      if (!inside(board.length, r, c)) continue;
      const here = board[r]![c];
      if (here === null) liberties.add(`${r},${c}`);
      else if (here === colour && !visited.has(`${r},${c}`)) { visited.add(`${r},${c}`); stack.push({ row: r, col: c }); }
    }
  }
  return { stones, liberties };
}

interface Placement { board: Board; captured: number }

/** Places the stone and removes what it captures; null when the move is suicide. Does not look at ko. */
function place(board: Board, stone: Stone, point: Point): Placement | null {
  const next = board.map((line) => line.slice());
  next[point.row]![point.col] = stone;
  let captured = 0;
  for (const [dr, dc] of NEIGHBOURS) {
    const r = point.row + dr;
    const c = point.col + dc;
    if (!inside(next.length, r, c) || next[r]![c] !== opponent(stone)) continue;
    const chain = chainAt(next, r, c);
    if (chain.liberties.size === 0) {
      for (const dead of chain.stones) { next[dead.row]![dead.col] = null; captured += 1; }
    }
  }
  if (chainAt(next, point.row, point.col).liberties.size === 0) return null;
  return { board: next, captured };
}

export function validateMove(state: GoState, stone: Stone, move: GoMove): MoveCheck {
  if (state.phase !== "playing") return { ok: false, code: "NOT_PLAYING", message: state.phase === "scoring" ? "正在点目，不能落子" : "对局已经结束" };
  if (state.turn !== stone) return { ok: false, code: "NOT_YOUR_TURN", message: "还没有轮到你" };
  if (move?.kind === "pass") return { ok: true };
  if (move?.kind !== "place") return { ok: false, code: "BAD_MOVE", message: "无法识别这一步" };
  const { point } = move;
  if (!Number.isInteger(point?.row) || !Number.isInteger(point?.col) || !inside(state.size, point.row, point.col)) {
    return { ok: false, code: "OUT_OF_BOARD", message: "落点不在棋盘上" };
  }
  if (state.board[point.row]![point.col] !== null) return { ok: false, code: "OCCUPIED", message: "这个位置已经有棋子" };
  const placed = place(state.board, stone, point);
  if (!placed) return { ok: false, code: "SUICIDE", message: "禁止自杀：落子后这块棋没有气" };
  if (state.seen.includes(positionKey(placed.board))) return { ok: false, code: "KO", message: "打劫：不能重复之前出现过的局面" };
  return { ok: true };
}

/** Plays the move and returns the new state; throws the validation message when the move is not allowed. */
export function applyMove(state: GoState, stone: Stone, move: GoMove): GoState {
  const check = validateMove(state, stone, move);
  if (!check.ok) throw new Error(check.message);
  const moves = [...state.moves, { stone, move }];
  if (move.kind === "pass") {
    const passes = state.consecutivePasses + 1;
    return {
      ...state,
      moves,
      turn: opponent(stone),
      consecutivePasses: passes,
      phase: passes >= 2 ? "scoring" : "playing",
      dead: [],
      confirmed: []
    };
  }
  const placed = place(state.board, stone, move.point)!;
  return {
    ...state,
    board: placed.board,
    turn: opponent(stone),
    captures: { ...state.captures, [stone]: state.captures[stone] + placed.captured },
    moves,
    seen: [...state.seen, positionKey(placed.board)],
    consecutivePasses: 0
  };
}

/** Marks or unmarks the whole chain at the point as dead. Only in the scoring phase; any change clears the confirmations. */
export function toggleDead(state: GoState, point: Point): GoState {
  if (state.phase !== "scoring") throw new Error("现在不是点目阶段");
  if (!Number.isInteger(point?.row) || !Number.isInteger(point?.col) || !inside(state.size, point.row, point.col)) throw new Error("落点不在棋盘上");
  if (state.board[point.row]![point.col] === null) throw new Error("请点击棋子来标记死子");
  const { stones } = chainAt(state.board, point.row, point.col);
  const keys = stones.map((stone) => `${stone.row},${stone.col}`);
  const marked = state.dead.includes(keys[0]!);
  const dead = marked ? state.dead.filter((key) => !keys.includes(key)) : [...state.dead, ...keys];
  return { ...state, dead, confirmed: [] };
}

/** One side agrees with the current marking; when both have, the game is scored and finished. */
export function confirmScoring(state: GoState, stone: Stone): GoState {
  if (state.phase !== "scoring") throw new Error("现在不是点目阶段");
  const confirmed = state.confirmed.includes(stone) ? state.confirmed : [...state.confirmed, stone];
  if (confirmed.length < 2) return { ...state, confirmed };
  const score = scoreOf(state);
  const winner: Stone = score.black > score.white ? "black" : "white";
  return {
    ...state,
    confirmed,
    phase: "finished",
    result: { winner, reason: "score", score, margin: Math.abs(score.black - score.white) }
  };
}

/** Rejects the marking and goes back to playing; the side that did not pass last moves next. */
export function resumePlay(state: GoState): GoState {
  if (state.phase !== "scoring") throw new Error("现在不是点目阶段");
  return { ...state, phase: "playing", consecutivePasses: 0, dead: [], confirmed: [] };
}

/** Area score of the current board with the marked dead stones taken off, komi added to White. */
export function scoreOf(state: GoState): { black: number; white: number; komi: number } {
  const board = state.board.map((line) => line.slice());
  for (const key of state.dead) {
    const [row, col] = key.split(",").map(Number) as [number, number];
    board[row]![col] = null;
  }
  const size = board.length;
  let black = 0;
  let white = 0;
  const seen = new Set<string>();
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const here = board[row]![col];
      if (here === "black") { black += 1; continue; }
      if (here === "white") { white += 1; continue; }
      if (seen.has(`${row},${col}`)) continue;
      // An empty region counts for a side only when every stone it touches is that side's.
      let area = 0;
      const touches = new Set<Stone>();
      const stack: Point[] = [{ row, col }];
      seen.add(`${row},${col}`);
      while (stack.length > 0) {
        const point = stack.pop()!;
        area += 1;
        for (const [dr, dc] of NEIGHBOURS) {
          const r = point.row + dr;
          const c = point.col + dc;
          if (!inside(size, r, c)) continue;
          const next = board[r]![c];
          if (next) touches.add(next);
          else if (!seen.has(`${r},${c}`)) { seen.add(`${r},${c}`); stack.push({ row: r, col: c }); }
        }
      }
      if (touches.size === 1) { if (touches.has("black")) black += area; else white += area; }
    }
  }
  return { black, white: white + state.komi, komi: state.komi };
}

export function getResult(state: GoState): GoResult | null {
  return state.result;
}

export function resign(state: GoState, stone: Stone): GoState {
  if (state.phase === "finished") throw new Error("对局已经结束");
  return { ...state, phase: "finished", result: { winner: opponent(stone), reason: "resigned", score: null, margin: null } };
}

/** Rebuilds a game from its move list; the way to take moves back (悔棋) is to replay all but the last ones. */
export function replay(options: Partial<GoOptions>, moves: ReadonlyArray<{ stone: Stone; move: GoMove }>): GoState {
  let state = createGame(options);
  for (const entry of moves) state = applyMove(state, entry.stone, entry.move);
  return state;
}

export function lastMove(state: GoState): Point | null {
  const last = state.moves.at(-1);
  return last && last.move.kind === "place" ? last.move.point : null;
}

export function serialize(state: GoState): string {
  return JSON.stringify(state);
}

export function deserialize(text: string): GoState {
  const state = JSON.parse(text) as GoState;
  if (!GO_SIZES.includes(state.size) || !Array.isArray(state.board) || state.board.length !== state.size) {
    throw new Error("棋局数据不完整");
  }
  return state;
}
