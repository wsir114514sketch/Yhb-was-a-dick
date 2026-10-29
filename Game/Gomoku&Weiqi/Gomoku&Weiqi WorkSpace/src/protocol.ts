/**
 * What the Gomoku / Go room service and its clients say to each other (socket.io namespace `/gomoku-weiqi`).
 * Pure types plus a few constants, shared by the server (`server/gomoku-weiqi.ts`) and the client.
 */

export type GwMode = "gomoku" | "go";
export type GwStone = "black" | "white";
export interface GwPoint { row: number; col: number }

/** The room settings the host fixes before the game starts; they are locked once it has begun. */
export interface GwConfig {
  mode: GwMode;
  /** Gomoku: 15 or 19. Go: 9, 13 or 19. */
  size: number;
  /** Gomoku only: whether Black is bound by the renju forbidden moves. */
  renju: boolean;
  /** Go only: komi added to White's area score. */
  komi: number;
  /** Which colour the host plays; "random" is decided when the game starts. */
  hostColor: "random" | GwStone;
}

export const GW_SIZES: Record<GwMode, readonly number[]> = { gomoku: [15, 19], go: [9, 13, 19] };
export const GW_DEFAULT_CONFIG: GwConfig = { mode: "gomoku", size: 15, renju: false, komi: 7.5, hostColor: "random" };

export interface GwSeatView {
  accountId: string;
  username: string;
  avatarUrl: string | null;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  /** Null until the colours are drawn at the start of the game. */
  stone: GwStone | null;
}

export interface GwSpectatorView { id: string; name: string; connected: boolean; avatarUrl: string | null }

export interface GwResultView {
  winner: GwStone | null;
  reason: "five" | "full" | "resigned" | "agreed-draw" | "score" | "disconnected";
  /** The winning line of a gomoku game, for highlighting. */
  line: GwPoint[];
  /** Go: area points of each side (White's includes komi). */
  score: { black: number; white: number; komi: number } | null;
  margin: number | null;
}

export interface GwGameView {
  mode: GwMode;
  size: number;
  board: Array<Array<GwStone | null>>;
  turn: GwStone;
  moveCount: number;
  lastMove: GwPoint | null;
  /** True when the last move was a pass (Go). */
  lastWasPass: boolean;
  /** "scoring" is Go's agree-on-dead-stones phase. */
  status: "playing" | "scoring" | "finished";
  captures: Record<GwStone, number>;
  /** Go scoring phase: stones marked dead ("row,col"), who has confirmed, and the live area count. */
  dead: string[];
  confirmed: GwStone[];
  preview: { black: number; white: number; komi: number } | null;
  result: GwResultView | null;
}

export interface GwRoomState {
  roomCode: string;
  config: GwConfig;
  phase: "lobby" | "playing" | "finished";
  players: GwSeatView[];
  spectators: GwSpectatorView[];
  you: { accountId: string; stone: GwStone | null; spectator: boolean; isHost: boolean };
  game: GwGameView | null;
  /** A take-back or draw request waiting for the other side's answer. */
  undoRequest: { from: GwStone } | null;
  drawRequest: { from: GwStone } | null;
  serverNow: number;
}

export type GwAck<T = undefined> = { ok: true; data: T } | { ok: false; code: string; message: string };

export interface GwClientToServer {
  "gw:create_room": (payload: Partial<GwConfig>, ack: (result: GwAck<{ roomCode: string }>) => void) => void;
  "gw:join_room": (payload: { roomCode: string }, ack: (result: GwAck<{ roomCode: string }>) => void) => void;
  "gw:spectate_room": (payload: { roomCode: string }, ack: (result: GwAck<{ roomCode: string }>) => void) => void;
  "gw:resume_room": (payload: undefined, ack: (result: GwAck<{ roomCode: string }>) => void) => void;
  "gw:leave_room": (payload: undefined, ack: (result: GwAck) => void) => void;
  "gw:configure": (payload: Partial<GwConfig>, ack: (result: GwAck) => void) => void;
  "gw:ready": (payload: { ready: boolean }, ack: (result: GwAck) => void) => void;
  "gw:start": (payload: undefined, ack: (result: GwAck) => void) => void;
  "gw:move": (payload: { point: GwPoint }, ack: (result: GwAck) => void) => void;
  "gw:pass": (payload: undefined, ack: (result: GwAck) => void) => void;
  "gw:resign": (payload: undefined, ack: (result: GwAck) => void) => void;
  "gw:undo_request": (payload: undefined, ack: (result: GwAck) => void) => void;
  "gw:undo_respond": (payload: { accept: boolean }, ack: (result: GwAck) => void) => void;
  "gw:draw_request": (payload: undefined, ack: (result: GwAck) => void) => void;
  "gw:draw_respond": (payload: { accept: boolean }, ack: (result: GwAck) => void) => void;
  "gw:toggle_dead": (payload: { point: GwPoint }, ack: (result: GwAck) => void) => void;
  "gw:confirm_score": (payload: undefined, ack: (result: GwAck) => void) => void;
  "gw:resume_play": (payload: undefined, ack: (result: GwAck) => void) => void;
  "gw:back_to_lobby": (payload: undefined, ack: (result: GwAck) => void) => void;
}

export interface GwServerToClient {
  "gw:state": (state: GwRoomState) => void;
  "gw:closed": (payload: { message: string }) => void;
}
