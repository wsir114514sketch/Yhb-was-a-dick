import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { GwRoomManager, normalizeConfig, type GwAccount } from "../../server/gomoku-weiqi.ts";
import type { GwAck, GwConfig, GwRoomState } from "../../../../Gomoku&Weiqi/Gomoku&Weiqi WorkSpace/src/protocol.ts";

const ACCOUNTS: GwAccount[] = ["a", "b", "c", "d"].map((id) => ({ id, username: id.toUpperCase(), avatarUrl: null }));
const AUTH = {
  verifyToken: (token: unknown) => ACCOUNTS.find((account) => account.id === token) ?? null,
  findAccount: (id: string | undefined) => ACCOUNTS.find((account) => account.id === id) ?? null
};

let http: HttpServer;
let server: Server;
let manager: GwRoomManager;
let url = "";
const sockets: Socket[] = [];

beforeEach(async () => {
  http = createServer();
  server = new Server(http);
  manager = new GwRoomManager(server, AUTH, { lobbyGraceMs: 80, surrenderAfterMs: 120 });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/gomoku-weiqi`;
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  manager.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A client for one account; remembers the latest room state it was sent. */
interface Client { socket: Socket; state: () => GwRoomState | null; call: <T = undefined>(event: string, payload?: unknown) => Promise<GwAck<T>>; until: (check: (state: GwRoomState) => boolean) => Promise<GwRoomState> }

async function client(token: string): Promise<Client> {
  const socket = connect(url, { auth: { token }, transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  let latest: GwRoomState | null = null;
  const waiters: Array<() => void> = [];
  socket.on("gw:state", (state: GwRoomState) => { latest = state; waiters.splice(0).forEach((wake) => wake()); });
  await new Promise<void>((resolve, reject) => { socket.on("connect", () => resolve()); socket.on("connect_error", reject); });
  return {
    socket,
    state: () => latest,
    call: <T,>(event: string, payload?: unknown) => new Promise<GwAck<T>>((resolve) => socket.emit(event, payload, resolve)),
    until: async (check) => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if (latest && check(latest)) return latest;
        await new Promise<void>((resolve) => { waiters.push(resolve); setTimeout(resolve, 25); });
      }
      throw new Error("state never matched");
    }
  };
}

/** Host `a` and guest `b` in a started game; the host plays Black. */
async function startedRoom(config: Partial<GwConfig> = {}): Promise<{ a: Client; b: Client; code: string }> {
  const a = await client("a");
  const b = await client("b");
  const created = await a.call<{ roomCode: string }>("gw:create_room", { hostColor: "black", ...config });
  if (!created.ok) throw new Error(created.message);
  expect((await b.call("gw:join_room", { roomCode: created.data.roomCode })).ok).toBe(true);
  expect((await b.call("gw:ready", { ready: true })).ok).toBe(true);
  expect((await a.call("gw:start")).ok).toBe(true);
  await b.until((state) => state.phase === "playing");
  return { a, b, code: created.data.roomCode };
}

describe("configuration", () => {
  it("accepts valid settings and refuses the rest", () => {
    expect(normalizeConfig({ mode: "go", size: 13, komi: 6.5 })).toMatchObject({ mode: "go", size: 13, komi: 6.5, renju: false });
    expect(normalizeConfig({ mode: "gomoku", size: 19, renju: true })).toMatchObject({ mode: "gomoku", size: 19, renju: true });
    expect(normalizeConfig({ mode: "go" }).size).toBe(19);
    expect(normalizeConfig({ mode: "gomoku" }).size).toBe(15);
    expect(() => normalizeConfig({ mode: "go", size: 15 })).toThrow("棋盘大小");
    expect(() => normalizeConfig({ mode: "gomoku", size: 9 })).toThrow("棋盘大小");
    expect(() => normalizeConfig({ mode: "chess" as never })).toThrow();
    expect(() => normalizeConfig({ mode: "go", komi: 7.3 })).toThrow("贴目");
    expect(() => normalizeConfig({ hostColor: "red" as never })).toThrow("执子颜色");
  });
});

describe("room flow", () => {
  it("creates a room, seats a guest, needs the guest ready, and then deals the colours", async () => {
    const a = await client("a");
    const b = await client("b");
    const created = await a.call<{ roomCode: string }>("gw:create_room", { mode: "gomoku", hostColor: "white" });
    expect(created.ok && /^\d{6}$/.test(created.data.roomCode)).toBe(true);
    const code = (created as { data: { roomCode: string } }).data.roomCode;
    expect((await a.call("gw:start")).ok).toBe(false);
    expect((await b.call("gw:join_room", { roomCode: code })).ok).toBe(true);
    expect(await a.call("gw:start")).toMatchObject({ ok: false, message: expect.stringContaining("准备") });
    expect((await b.call("gw:configure", { size: 19 })).ok).toBe(false);
    expect((await a.call("gw:configure", { size: 19, renju: true })).ok).toBe(true);
    await b.call("gw:ready", { ready: true });
    expect((await a.call("gw:start")).ok).toBe(true);
    const state = await b.until((s) => s.phase === "playing");
    expect(state.config).toMatchObject({ size: 19, renju: true });
    expect(state.you.stone).toBe("black");
    expect((await a.until((s) => s.phase === "playing")).you.stone).toBe("white");
    // Settings are locked once the game has begun.
    expect(await a.call("gw:configure", { size: 15 })).toMatchObject({ ok: false });
    expect(await b.call("gw:join_room", { roomCode: code })).toMatchObject({ ok: false });
  });

  it("refuses a third seat, a second room for one account, and an unknown room", async () => {
    const a = await client("a"); const b = await client("b"); const c = await client("c");
    const created = await a.call<{ roomCode: string }>("gw:create_room", {});
    const code = (created as { data: { roomCode: string } }).data.roomCode;
    await b.call("gw:join_room", { roomCode: code });
    expect(await c.call("gw:join_room", { roomCode: code })).toMatchObject({ ok: false });
    expect(await a.call("gw:create_room", {})).toMatchObject({ ok: false });
    expect(await c.call("gw:join_room", { roomCode: "000000" })).toMatchObject({ ok: false });
    expect(manager.locate("a")).toEqual({ game: "gomoku-weiqi", roomCode: code, watching: false });
    expect(manager.isSeated("a", code)).toBe(true);
    expect(manager.isSeated("c", code)).toBe(false);
  });

  it("the host leaving the lobby hands the room over; the last one leaving closes it", async () => {
    const a = await client("a"); const b = await client("b");
    const code = ((await a.call<{ roomCode: string }>("gw:create_room", {})) as { data: { roomCode: string } }).data.roomCode;
    await b.call("gw:join_room", { roomCode: code });
    await a.call("gw:leave_room");
    expect((await b.until((s) => s.players.length === 1)).you.isHost).toBe(true);
    await b.call("gw:leave_room");
    expect(manager.rooms.size).toBe(0);
    expect(manager.locate("b")).toBeNull();
  });
});

describe("gomoku game", () => {
  it("checks every move on the server: turn, spectators, bounds, occupied points; five in a row wins", async () => {
    const { a, b, code } = await startedRoom({ mode: "gomoku" });
    const watcher = await client("c");
    expect((await watcher.call("gw:spectate_room", { roomCode: code })).ok).toBe(true);
    expect(await b.call("gw:move", { point: { row: 7, col: 7 } })).toMatchObject({ ok: false, message: "还没有轮到你" });
    expect(await watcher.call("gw:move", { point: { row: 7, col: 7 } })).toMatchObject({ ok: false });
    expect(await a.call("gw:move", { point: { row: 99, col: 0 } })).toMatchObject({ ok: false });
    expect(await a.call("gw:move", { point: { row: 7 } })).toMatchObject({ ok: false });
    expect((await a.call("gw:move", { point: { row: 7, col: 7 } })).ok).toBe(true);
    expect(await b.call("gw:move", { point: { row: 7, col: 7 } })).toMatchObject({ ok: false, message: "这个位置已经有棋子" });
    expect(await a.call("gw:pass")).toMatchObject({ ok: false });
    for (let step = 1; step < 5; step += 1) {
      expect((await b.call("gw:move", { point: { row: 0, col: step } })).ok).toBe(true);
      expect((await a.call("gw:move", { point: { row: 7, col: 7 + step } })).ok).toBe(true);
    }
    const over = await watcher.until((s) => s.phase === "finished");
    expect(over.game!.result).toMatchObject({ winner: "black", reason: "five" });
    expect(over.game!.result!.line).toHaveLength(5);
    expect(over.you.spectator).toBe(true);
    expect(await b.call("gw:move", { point: { row: 5, col: 5 } })).toMatchObject({ ok: false });
    // Back to the lobby for another game, with the settings kept.
    expect((await a.call("gw:back_to_lobby")).ok).toBe(true);
    expect((await b.until((s) => s.phase === "lobby")).config.mode).toBe("gomoku");
  });

  it("take-back needs the other side's yes, and removes the requester's last move and everything after it", async () => {
    const { a, b } = await startedRoom({ mode: "gomoku" });
    expect(await a.call("gw:undo_request")).toMatchObject({ ok: false, message: "你还没有落过子" });
    await a.call("gw:move", { point: { row: 1, col: 1 } });
    await b.call("gw:move", { point: { row: 2, col: 2 } });
    expect((await b.call("gw:undo_respond", { accept: true })).ok).toBe(false);
    expect((await a.call("gw:undo_request")).ok).toBe(true);
    expect((await a.call("gw:undo_respond", { accept: true })).ok).toBe(false);
    expect((await b.until((s) => s.undoRequest !== null)).undoRequest).toEqual({ from: "black" });
    expect((await b.call("gw:undo_respond", { accept: false })).ok).toBe(true);
    expect((await a.until((s) => s.undoRequest === null)).game!.moveCount).toBe(2);
    await a.call("gw:undo_request");
    await b.call("gw:undo_respond", { accept: true });
    const state = await a.until((s) => s.game!.moveCount === 0);
    expect(state.game!.turn).toBe("black");
    expect(state.game!.board[1]![1]).toBeNull();
  });

  it("a draw needs agreement; resigning loses", async () => {
    const { a, b } = await startedRoom({ mode: "gomoku" });
    await a.call("gw:draw_request");
    expect((await a.call("gw:draw_respond", { accept: true })).ok).toBe(false);
    await b.call("gw:draw_respond", { accept: true });
    expect((await a.until((s) => s.phase === "finished")).game!.result).toMatchObject({ winner: null, reason: "agreed-draw" });
    await a.call("gw:back_to_lobby");
    await b.call("gw:ready", { ready: true });
    await a.call("gw:start");
    await b.until((s) => s.phase === "playing");
    await b.call("gw:resign");
    expect((await a.until((s) => s.phase === "finished")).game!.result).toMatchObject({ winner: "black", reason: "resigned" });
  });

  it("renju: a forbidden move is refused with its reason", async () => {
    const { a, b } = await startedRoom({ mode: "gomoku", renju: true });
    // Black builds an open two on a row and a column, White plays far away; (7,7) would then be a double three.
    const blackMoves = [[7, 5], [7, 6], [5, 7], [6, 7]];
    const whiteMoves = [[0, 0], [0, 2], [0, 4], [0, 6]];
    for (let i = 0; i < 4; i += 1) {
      await a.call("gw:move", { point: { row: blackMoves[i]![0], col: blackMoves[i]![1] } });
      await b.call("gw:move", { point: { row: whiteMoves[i]![0], col: whiteMoves[i]![1] } });
    }
    expect(await a.call("gw:move", { point: { row: 7, col: 7 } })).toMatchObject({ ok: false, message: expect.stringContaining("三三") });
  });
});

describe("go game", () => {
  it("two passes open scoring; marking and both confirmations finish it with area scoring", async () => {
    const { a, b } = await startedRoom({ mode: "go", size: 9, komi: 7.5 });
    expect(await a.call("gw:draw_request")).toMatchObject({ ok: false });
    await a.call("gw:move", { point: { row: 4, col: 4 } });
    expect(await b.call("gw:move", { point: { row: 4, col: 4 } })).toMatchObject({ ok: false });
    expect((await b.call("gw:pass")).ok).toBe(true);
    expect((await a.call("gw:pass")).ok).toBe(true);
    const scoring = await b.until((s) => s.game!.status === "scoring");
    expect(scoring.game!.preview).toMatchObject({ black: 81, white: 7.5 });
    expect(await a.call("gw:move", { point: { row: 0, col: 0 } })).toMatchObject({ ok: false });
    expect((await a.call("gw:confirm_score")).ok).toBe(true);
    expect((await b.until((s) => s.game!.confirmed.length === 1)).game!.confirmed).toEqual(["black"]);
    expect((await b.call("gw:confirm_score")).ok).toBe(true);
    const done = await a.until((s) => s.phase === "finished");
    expect(done.game!.result).toMatchObject({ winner: "black", reason: "score", margin: 73.5 });
  });

  it("marking a stone as dead clears confirmations; rejecting the marking resumes play", async () => {
    const { a, b } = await startedRoom({ mode: "go", size: 9 });
    await a.call("gw:move", { point: { row: 2, col: 2 } });
    await b.call("gw:pass"); await a.call("gw:pass");
    await b.until((s) => s.game!.status === "scoring");
    await a.call("gw:confirm_score");
    await b.call("gw:toggle_dead", { point: { row: 2, col: 2 } });
    const marked = await a.until((s) => s.game!.dead.length === 1);
    expect(marked.game!.confirmed).toEqual([]);
    expect((await b.call("gw:resume_play")).ok).toBe(true);
    const playing = await a.until((s) => s.game!.status === "playing");
    expect(playing.game!.dead).toEqual([]);
    expect((await a.call("gw:move", { point: { row: 0, col: 0 } })).ok || (await b.call("gw:move", { point: { row: 0, col: 0 } })).ok).toBe(true);
  });

  it("refuses suicide and ko with the rule's reason", async () => {
    const { a, b } = await startedRoom({ mode: "go", size: 9 });
    // Black (0,1)(1,0); White plays (0,0): suicide for White.
    await a.call("gw:move", { point: { row: 0, col: 1 } });
    await b.call("gw:move", { point: { row: 8, col: 8 } });
    await a.call("gw:move", { point: { row: 1, col: 0 } });
    expect(await b.call("gw:move", { point: { row: 0, col: 0 } })).toMatchObject({ ok: false, message: expect.stringContaining("禁止自杀") });
  });
});

describe("spectators, reconnection and disconnects", () => {
  it("a spectator who joins mid-game gets the whole board; leaving removes the seat", async () => {
    const { a, b, code } = await startedRoom({ mode: "gomoku" });
    await a.call("gw:move", { point: { row: 3, col: 3 } });
    await b.call("gw:move", { point: { row: 4, col: 4 } });
    const watcher = await client("c");
    await watcher.call("gw:spectate_room", { roomCode: code });
    const state = await watcher.until((s) => s.game !== null);
    expect(state.game!.board[3]![3]).toBe("black");
    expect(state.game!.board[4]![4]).toBe("white");
    expect(state.you).toMatchObject({ spectator: true, stone: null });
    expect(manager.locate("c")).toEqual({ game: "gomoku-weiqi", roomCode: code, watching: true });
    expect((await a.until((s) => s.spectators.length === 1)).spectators[0]!.name).toBe("C");
    await watcher.call("gw:leave_room");
    await a.until((s) => s.spectators.length === 0);
    expect(manager.locate("c")).toBeNull();
  });

  it("a player who reconnects with the same account gets the running game back", async () => {
    const { a, b, code } = await startedRoom({ mode: "gomoku" });
    await a.call("gw:move", { point: { row: 6, col: 6 } });
    b.socket.close();
    await a.until((s) => s.players.find((p) => p.accountId === "b")!.connected === false);
    const again = await client("b");
    expect((await again.call<{ roomCode: string }>("gw:resume_room")).ok).toBe(true);
    const state = await again.until((s) => s.game !== null);
    expect(state.roomCode).toBe(code);
    expect(state.you.stone).toBe("white");
    expect(state.game!.board[6]![6]).toBe("black");
    expect((await again.call("gw:move", { point: { row: 6, col: 7 } })).ok).toBe(true);
  });

  it("a player who stays away from a running game loses it after the waiting time", async () => {
    const { a, b } = await startedRoom({ mode: "gomoku" });
    b.socket.close();
    const over = await a.until((s) => s.phase === "finished");
    expect(over.game!.result).toMatchObject({ winner: "black", reason: "disconnected" });
    expect(manager.locate("b")).toBeNull();
  });

  it("leaving a running game is a resignation, and the host's room stays for the other player", async () => {
    const { a, b } = await startedRoom({ mode: "go", size: 9 });
    await b.call("gw:leave_room");
    const over = await a.until((s) => s.phase === "finished");
    expect(over.game!.result).toMatchObject({ winner: "black", reason: "resigned" });
    expect(over.players).toHaveLength(1);
    await a.call("gw:back_to_lobby");
    expect((await a.until((s) => s.phase === "lobby")).players).toHaveLength(1);
  });

  it("a lobby seat that stays away is given up", async () => {
    const a = await client("a"); const b = await client("b");
    const code = ((await a.call<{ roomCode: string }>("gw:create_room", {})) as { data: { roomCode: string } }).data.roomCode;
    await b.call("gw:join_room", { roomCode: code });
    b.socket.close();
    await a.until((s) => s.players.length === 1);
    expect(manager.locate("b")).toBeNull();
  });
});
