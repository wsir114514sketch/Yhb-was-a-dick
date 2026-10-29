import { randomInt } from "node:crypto";
import type { Namespace, Server, Socket } from "socket.io";
import * as gomoku from "../../../Gomoku&Weiqi/Gomoku&Weiqi WorkSpace/src/gomokuEngine.ts";
import * as go from "../../../Gomoku&Weiqi/Gomoku&Weiqi WorkSpace/src/goEngine.ts";
import {
  GW_DEFAULT_CONFIG,
  GW_SIZES,
  type GwAck,
  type GwClientToServer,
  type GwConfig,
  type GwGameView,
  type GwMode,
  type GwPoint,
  type GwResultView,
  type GwRoomState,
  type GwSeatView,
  type GwServerToClient,
  type GwStone
} from "../../../Gomoku&Weiqi/Gomoku&Weiqi WorkSpace/src/protocol.ts";

/** What this service needs from the site's account system. */
export interface GwAccount { id: string; username: string; avatarUrl: string | null }
export interface GwAuthProvider {
  verifyToken(token: unknown): GwAccount | null;
  findAccount(accountId: string | undefined): GwAccount | null;
}

type GwSocket = Socket<GwClientToServer, GwServerToClient>;

/** A seat that stays away this long in the lobby, or after a game, gives its place up. */
export const LOBBY_GRACE_MS = 30_000;
/** A player who stays disconnected this long in a running game loses it (same as the shogi service). */
export const SURRENDER_AFTER_MS = 180_000;

export interface GwTiming { lobbyGraceMs: number; surrenderAfterMs: number }

interface Seat {
  accountId: string;
  username: string;
  avatarUrl: string | null;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
  stone: GwStone | null;
  timer: ReturnType<typeof setTimeout> | null;
}

type Game = { mode: "gomoku"; state: gomoku.GomokuState } | { mode: "go"; state: go.GoState };

function isStone(value: unknown): value is GwStone {
  return value === "black" || value === "white";
}

function other(stone: GwStone): GwStone {
  return stone === "black" ? "white" : "black";
}

/** Reads and checks the host's settings; throws a message the client can show. */
export function normalizeConfig(input: Partial<GwConfig> | undefined, base: GwConfig = GW_DEFAULT_CONFIG): GwConfig {
  const mode: GwMode = input?.mode === undefined ? base.mode : input.mode;
  if (mode !== "gomoku" && mode !== "go") throw new Error("请选择五子棋或围棋");
  const modeChanged = mode !== base.mode;
  const defaultSize = mode === "gomoku" ? 15 : 19;
  const size = input?.size ?? (modeChanged ? defaultSize : base.size);
  if (!GW_SIZES[mode].includes(size)) throw new Error("不支持这个棋盘大小");
  const komi = input?.komi ?? base.komi;
  if (typeof komi !== "number" || !Number.isFinite(komi) || komi < 0 || komi > 30 || (komi * 2) % 1 !== 0) throw new Error("贴目只能是 0 到 30 之间、以 0.5 为单位的数");
  const renju = input?.renju ?? base.renju;
  if (typeof renju !== "boolean") throw new Error("禁手设置无效");
  const hostColor = input?.hostColor ?? base.hostColor;
  if (hostColor !== "random" && !isStone(hostColor)) throw new Error("执子颜色无效");
  return { mode, size, renju: mode === "gomoku" ? renju : false, komi, hostColor };
}

export class GwRoom {
  readonly seats: Seat[] = [];
  readonly spectators = new Map<string, { id: string; username: string; socketId: string; connected: boolean; avatarUrl: string | null }>();
  phase: "lobby" | "playing" | "finished" = "lobby";
  hostId = "";
  game: Game | null = null;
  undoRequest: { from: GwStone } | null = null;
  drawRequest: { from: GwStone } | null = null;
  /** Set when the game ended because a player stayed away too long. */
  endedByDisconnect = false;

  constructor(readonly code: string, public config: GwConfig) {}

  seatOf(accountId: string): Seat | undefined {
    return this.seats.find((seat) => seat.accountId === accountId);
  }

  seatByStone(stone: GwStone): Seat | undefined {
    return this.seats.find((seat) => seat.stone === stone);
  }

  /** The finished game's result in the shape the clients read. */
  private resultView(): GwResultView | null {
    const game = this.game;
    if (!game?.state.result) return null;
    if (game.mode === "gomoku") {
      const result = game.state.result;
      return { winner: result.winner, reason: this.endedByDisconnect ? "disconnected" : result.reason, line: result.line, score: null, margin: null };
    }
    const result = game.state.result;
    return { winner: result.winner, reason: this.endedByDisconnect ? "disconnected" : result.reason, line: [], score: result.score, margin: result.margin };
  }

  private gameView(): GwGameView | null {
    const game = this.game;
    if (!game) return null;
    if (game.mode === "gomoku") {
      const state = game.state;
      return {
        mode: "gomoku", size: state.size, board: state.board, turn: state.turn, moveCount: state.moves.length,
        lastMove: gomoku.lastMove(state), lastWasPass: false, status: state.status,
        captures: { black: 0, white: 0 }, dead: [], confirmed: [], preview: null, result: this.resultView()
      };
    }
    const state = game.state;
    const last = state.moves.at(-1);
    return {
      mode: "go", size: state.size, board: state.board, turn: state.turn, moveCount: state.moves.length,
      lastMove: go.lastMove(state), lastWasPass: last?.move.kind === "pass", status: state.phase === "playing" ? "playing" : state.phase,
      captures: state.captures, dead: state.dead, confirmed: state.confirmed,
      preview: state.phase === "scoring" ? go.scoreOf(state) : null, result: this.resultView()
    };
  }

  seatViews(): GwSeatView[] {
    return this.seats.map((seat) => ({
      accountId: seat.accountId, username: seat.username, avatarUrl: seat.avatarUrl, connected: seat.connected,
      ready: seat.ready, isHost: seat.accountId === this.hostId, stone: seat.stone
    }));
  }

  stateFor(accountId: string): GwRoomState {
    const seat = this.seatOf(accountId);
    return {
      roomCode: this.code,
      config: this.config,
      phase: this.phase,
      players: this.seatViews(),
      spectators: [...this.spectators.values()].map((person) => ({ id: person.id, name: person.username, connected: person.connected, avatarUrl: person.avatarUrl })),
      you: { accountId, stone: seat?.stone ?? null, spectator: !seat, isHost: accountId === this.hostId },
      game: this.gameView(),
      undoRequest: this.undoRequest,
      drawRequest: this.drawRequest,
      serverNow: Date.now()
    };
  }

  /** Draws the colours and starts the game. */
  start(): void {
    const hostColor = this.config.hostColor === "random" ? (randomInt(2) === 0 ? "black" : "white") : this.config.hostColor;
    for (const seat of this.seats) seat.stone = seat.accountId === this.hostId ? hostColor : other(hostColor);
    this.game = this.config.mode === "gomoku"
      ? { mode: "gomoku", state: gomoku.createGame({ size: this.config.size as gomoku.GomokuSize, renju: this.config.renju }) }
      : { mode: "go", state: go.createGame({ size: this.config.size as go.GoSize, komi: this.config.komi }) };
    this.phase = "playing";
    this.undoRequest = null;
    this.drawRequest = null;
    this.endedByDisconnect = false;
  }

  isOver(): boolean {
    const game = this.game;
    if (!game) return false;
    return game.mode === "gomoku" ? game.state.status === "finished" : game.state.phase === "finished";
  }

  /** Moves to "finished" when the engine says the game is over. */
  settle(): void {
    if (this.isOver()) {
      this.phase = "finished";
      this.undoRequest = null;
      this.drawRequest = null;
    }
  }

  /** The move list in a form both engines' `replay` take. */
  takeBack(requester: GwStone): void {
    const game = this.game;
    if (!game) throw new Error("对局还没有开始");
    if (game.mode === "gomoku") {
      const moves = game.state.moves;
      let index = -1;
      moves.forEach((move, at) => { if (move.stone === requester) index = at; });
      if (index < 0) throw new Error("你还没有落过子");
      game.state = gomoku.replay({ size: game.state.size, renju: game.state.renju }, moves.slice(0, index));
    } else {
      const moves = game.state.moves;
      let index = -1;
      moves.forEach((move, at) => { if (move.stone === requester) index = at; });
      if (index < 0) throw new Error("你还没有落过子");
      game.state = go.replay({ size: game.state.size, komi: game.state.komi }, moves.slice(0, index));
    }
  }

  resign(stone: GwStone): void {
    const game = this.game;
    if (!game) throw new Error("对局还没有开始");
    if (game.mode === "gomoku") game.state = gomoku.resign(game.state, stone);
    else game.state = go.resign(game.state, stone);
  }
}

/** Socket.io namespace `/gomoku-weiqi`: rooms for two players and any number of spectators, for gomoku and for Go. */
export class GwRoomManager {
  readonly rooms = new Map<string, GwRoom>();
  private readonly namespace: Namespace<GwClientToServer, GwServerToClient>;
  private readonly activeByAccount = new Map<string, string>();
  private readonly watchingByAccount = new Map<string, string>();

  constructor(
    io: Server,
    private readonly auth: GwAuthProvider,
    private readonly timing: GwTiming = { lobbyGraceMs: LOBBY_GRACE_MS, surrenderAfterMs: SURRENDER_AFTER_MS },
    /** Called whenever an account's room membership may have changed (for the friends list). */
    private readonly onMembershipChange: (accountId: string) => void = () => undefined
  ) {
    this.namespace = io.of("/gomoku-weiqi") as unknown as Namespace<GwClientToServer, GwServerToClient>;
    this.namespace.use((socket, next) => {
      const account = auth.verifyToken(socket.handshake.auth?.token);
      if (!account) { next(new Error("AUTH_REQUIRED")); return; }
      socket.data.accountId = account.id;
      next();
    });
    this.namespace.on("connection", (socket) => this.handleConnection(socket));
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = String(randomInt(100_000, 1_000_000));
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("房间号用尽，请稍后再试");
  }

  // `ack` comes straight from the client and may be missing; an unguarded call would throw inside the handler.
  private respond<T>(ack: ((result: GwAck<T>) => void) | undefined, action: () => T): void {
    let result: GwAck<T>;
    try { result = { ok: true, data: action() }; }
    catch (error) {
      const message = error instanceof Error ? error.message : "操作失败";
      result = { ok: false, code: "REJECTED", message };
    }
    if (typeof ack === "function") ack(result);
  }

  private socketOf(socketId: string | null): GwSocket | undefined {
    return socketId ? (this.namespace.sockets.get(socketId) as GwSocket | undefined) : undefined;
  }

  broadcast(room: GwRoom): void {
    for (const seat of room.seats) this.socketOf(seat.socketId)?.emit("gw:state", room.stateFor(seat.accountId));
    for (const person of room.spectators.values()) this.socketOf(person.socketId)?.emit("gw:state", room.stateFor(person.id));
  }

  private account(socket: GwSocket): GwAccount {
    const account = this.auth.findAccount(socket.data.accountId);
    if (!account) throw new Error("请先登录");
    return account;
  }

  /** The room and seat of the socket's account; a spectator or a stranger is refused. */
  private current(socket: GwSocket): { room: GwRoom; seat: Seat } {
    const code = this.activeByAccount.get(socket.data.accountId as string);
    const room = code ? this.rooms.get(code) : undefined;
    const seat = room?.seatOf(socket.data.accountId as string);
    if (!room || !seat) throw new Error("你不在这个房间的对战席上");
    return { room, seat };
  }

  private currentGame(socket: GwSocket): { room: GwRoom; seat: Seat; stone: GwStone } {
    const { room, seat } = this.current(socket);
    if (room.phase !== "playing" || !room.game || !seat.stone) throw new Error("对局还没有开始");
    return { room, seat, stone: seat.stone };
  }

  private touch(accountId: string): void {
    this.onMembershipChange(accountId);
  }

  private handleConnection(socket: GwSocket): void {
    const accountId = socket.data.accountId as string;

    socket.on("gw:create_room", (payload, ack) => this.respond(ack, () => {
      const account = this.account(socket);
      if (this.activeByAccount.has(account.id) || this.watchingByAccount.has(account.id)) throw new Error("你已经在一个房间里了");
      const config = normalizeConfig(payload);
      const room = new GwRoom(this.generateCode(), config);
      this.rooms.set(room.code, room);
      this.addSeat(room, account, socket);
      room.hostId = account.id;
      this.broadcast(room);
      return { roomCode: room.code };
    }));

    socket.on("gw:join_room", (payload, ack) => this.respond(ack, () => {
      const account = this.account(socket);
      if (this.activeByAccount.has(account.id) || this.watchingByAccount.has(account.id)) throw new Error("你已经在一个房间里了");
      const room = this.rooms.get(typeof payload?.roomCode === "string" ? payload.roomCode.trim() : "");
      if (!room) throw new Error("房间不存在");
      if (room.phase !== "lobby") throw new Error("对局已经开始，可以进入观战席观看");
      if (room.seats.length >= 2) throw new Error("房间已满，可以进入观战席观看");
      this.addSeat(room, account, socket);
      this.broadcast(room);
      return { roomCode: room.code };
    }));

    socket.on("gw:spectate_room", (payload, ack) => this.respond(ack, () => {
      const account = this.account(socket);
      if (this.activeByAccount.has(account.id)) throw new Error("你已经在一个房间的对战席上了");
      const room = this.rooms.get(typeof payload?.roomCode === "string" ? payload.roomCode.trim() : "");
      if (!room) throw new Error("房间不存在");
      const previous = this.watchingByAccount.get(account.id);
      if (previous && previous !== room.code) this.removeSpectator(account.id);
      // A second tab of the same spectator replaces the first.
      const existing = room.spectators.get(account.id);
      if (existing && existing.socketId !== socket.id) this.socketOf(existing.socketId)?.disconnect(true);
      room.spectators.set(account.id, { id: account.id, username: account.username, socketId: socket.id, connected: true, avatarUrl: account.avatarUrl });
      this.watchingByAccount.set(account.id, room.code);
      socket.join(room.code);
      this.broadcast(room);
      this.touch(account.id);
      return { roomCode: room.code };
    }));

    socket.on("gw:resume_room", (_payload, ack) => this.respond(ack, () => {
      const code = this.activeByAccount.get(accountId);
      const room = code ? this.rooms.get(code) : undefined;
      const seat = room?.seatOf(accountId);
      if (!room || !seat) throw new Error("没有可以恢复的房间");
      this.attach(room, seat, socket);
      this.broadcast(room);
      return { roomCode: room.code };
    }));

    socket.on("gw:leave_room", (_payload, ack) => this.respond(ack, () => {
      if (this.watchingByAccount.has(accountId)) { this.removeSpectator(accountId); return undefined; }
      const { room, seat } = this.current(socket);
      this.leave(room, seat, true);
      return undefined;
    }));

    socket.on("gw:configure", (payload, ack) => this.respond(ack, () => {
      const { room } = this.current(socket);
      if (accountId !== room.hostId) throw new Error("只有房主可以修改设置");
      if (room.phase !== "lobby") throw new Error("对局开始后不能修改设置");
      room.config = normalizeConfig(payload, room.config);
      for (const seat of room.seats) seat.ready = false;
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:ready", (payload, ack) => this.respond(ack, () => {
      const { room, seat } = this.current(socket);
      if (room.phase !== "lobby") throw new Error("对局已经开始");
      if (typeof payload?.ready !== "boolean") throw new Error("准备状态无效");
      seat.ready = payload.ready;
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:start", (_payload, ack) => this.respond(ack, () => {
      const { room } = this.current(socket);
      if (accountId !== room.hostId) throw new Error("只有房主可以开始游戏");
      if (room.phase !== "lobby") throw new Error("对局已经开始");
      if (room.seats.length !== 2 || room.seats.some((seat) => !seat.connected)) throw new Error("需要两名在线玩家才能开始");
      if (room.seats.some((seat) => seat.accountId !== room.hostId && !seat.ready)) throw new Error("对方还没有准备");
      room.start();
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:move", (payload, ack) => this.respond(ack, () => {
      const { room, stone } = this.currentGame(socket);
      const game = room.game!;
      const point = payload?.point;
      if (!point || !Number.isInteger(point.row) || !Number.isInteger(point.col)) throw new Error("落点无效");
      if (game.mode === "gomoku") game.state = gomoku.applyMove(game.state, stone, point);
      else game.state = go.applyMove(game.state, stone, { kind: "place", point });
      // Any move answers the requests that were open.
      room.undoRequest = null;
      room.drawRequest = null;
      room.settle();
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:pass", (_payload, ack) => this.respond(ack, () => {
      const { room, stone } = this.currentGame(socket);
      const game = room.game!;
      if (game.mode !== "go") throw new Error("五子棋没有虚着");
      game.state = go.applyMove(game.state, stone, { kind: "pass" });
      room.undoRequest = null;
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:resign", (_payload, ack) => this.respond(ack, () => {
      const { room, stone } = this.currentGame(socket);
      room.resign(stone);
      room.settle();
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:undo_request", (_payload, ack) => this.respond(ack, () => {
      const { room, stone } = this.currentGame(socket);
      const game = room.game!;
      if (game.mode === "go" && game.state.phase !== "playing") throw new Error("点目阶段不能悔棋");
      if (room.undoRequest) throw new Error("已经有一个悔棋请求在等待回应");
      const mine = game.state.moves.some((move) => move.stone === stone);
      if (!mine) throw new Error("你还没有落过子");
      room.undoRequest = { from: stone };
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:undo_respond", (payload, ack) => this.respond(ack, () => {
      const { room, stone } = this.currentGame(socket);
      const request = room.undoRequest;
      if (!request) throw new Error("没有悔棋请求");
      if (request.from === stone) throw new Error("不能回应自己的请求");
      room.undoRequest = null;
      if (payload?.accept === true) room.takeBack(request.from);
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:draw_request", (_payload, ack) => this.respond(ack, () => {
      const { room, stone } = this.currentGame(socket);
      if (room.game!.mode !== "gomoku") throw new Error("围棋不能请求和棋");
      if (room.drawRequest) throw new Error("已经有一个和棋请求在等待回应");
      room.drawRequest = { from: stone };
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:draw_respond", (payload, ack) => this.respond(ack, () => {
      const { room, stone } = this.currentGame(socket);
      const request = room.drawRequest;
      if (!request) throw new Error("没有和棋请求");
      if (request.from === stone) throw new Error("不能回应自己的请求");
      room.drawRequest = null;
      const game = room.game!;
      if (payload?.accept === true && game.mode === "gomoku") { game.state = gomoku.agreeDraw(game.state); room.settle(); }
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:toggle_dead", (payload, ack) => this.respond(ack, () => {
      const { room } = this.currentGame(socket);
      const game = room.game!;
      if (game.mode !== "go") throw new Error("五子棋没有点目");
      game.state = go.toggleDead(game.state, payload?.point as GwPoint);
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:confirm_score", (_payload, ack) => this.respond(ack, () => {
      const { room, stone } = this.currentGame(socket);
      const game = room.game!;
      if (game.mode !== "go") throw new Error("五子棋没有点目");
      game.state = go.confirmScoring(game.state, stone);
      room.settle();
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:resume_play", (_payload, ack) => this.respond(ack, () => {
      const { room } = this.currentGame(socket);
      const game = room.game!;
      if (game.mode !== "go") throw new Error("五子棋没有点目");
      game.state = go.resumePlay(game.state);
      this.broadcast(room);
      return undefined;
    }));

    socket.on("gw:back_to_lobby", (_payload, ack) => this.respond(ack, () => {
      const { room } = this.current(socket);
      if (room.phase !== "finished") throw new Error("对局还没有结束");
      room.phase = "lobby";
      room.game = null;
      room.undoRequest = null;
      room.drawRequest = null;
      room.endedByDisconnect = false;
      for (const seat of room.seats) { seat.ready = false; seat.stone = null; }
      this.broadcast(room);
      return undefined;
    }));

    socket.on("disconnect", () => this.handleDisconnect(socket));
  }

  private addSeat(room: GwRoom, account: GwAccount, socket: GwSocket): Seat {
    const seat: Seat = {
      accountId: account.id, username: account.username, avatarUrl: account.avatarUrl, socketId: socket.id,
      connected: true, ready: false, stone: null, timer: null
    };
    room.seats.push(seat);
    if (!room.hostId) room.hostId = account.id;
    this.activeByAccount.set(account.id, room.code);
    socket.join(room.code);
    this.touch(account.id);
    return seat;
  }

  private attach(room: GwRoom, seat: Seat, socket: GwSocket): void {
    if (seat.timer) clearTimeout(seat.timer);
    seat.timer = null;
    if (seat.socketId && seat.socketId !== socket.id) this.socketOf(seat.socketId)?.disconnect(true);
    seat.socketId = socket.id;
    seat.connected = true;
    const account = this.auth.findAccount(seat.accountId);
    if (account) { seat.username = account.username; seat.avatarUrl = account.avatarUrl; }
    socket.join(room.code);
    this.touch(seat.accountId);
  }

  private removeSpectator(accountId: string): void {
    const code = this.watchingByAccount.get(accountId);
    const room = code ? this.rooms.get(code) : undefined;
    this.watchingByAccount.delete(accountId);
    const person = room?.spectators.get(accountId);
    if (room && person) {
      this.socketOf(person.socketId)?.leave(room.code);
      room.spectators.delete(accountId);
      this.broadcast(room);
    }
    this.touch(accountId);
  }

  /**
   * A player takes their seat away. In a running game that is a resignation. The host role passes to the other player;
   * a room nobody sits in any more closes.
   */
  private leave(room: GwRoom, seat: Seat, voluntary: boolean): void {
    if (seat.timer) clearTimeout(seat.timer);
    if (room.phase === "playing" && seat.stone) {
      room.resign(seat.stone);
      room.endedByDisconnect = !voluntary;
      room.settle();
    }
    this.socketOf(seat.socketId)?.leave(room.code);
    room.seats.splice(room.seats.indexOf(seat), 1);
    this.activeByAccount.delete(seat.accountId);
    this.touch(seat.accountId);
    if (room.hostId === seat.accountId) room.hostId = room.seats[0]?.accountId ?? "";
    if (room.phase === "lobby") for (const left of room.seats) left.ready = false;
    if (room.seats.length === 0) { this.closeRoom(room, "房间已解散"); return; }
    this.broadcast(room);
  }

  private closeRoom(room: GwRoom, message: string): void {
    for (const seat of room.seats) { if (seat.timer) clearTimeout(seat.timer); this.activeByAccount.delete(seat.accountId); this.touch(seat.accountId); }
    for (const person of room.spectators.values()) {
      this.socketOf(person.socketId)?.emit("gw:closed", { message });
      this.watchingByAccount.delete(person.id);
      this.touch(person.id);
    }
    this.rooms.delete(room.code);
  }

  private handleDisconnect(socket: GwSocket): void {
    const accountId = socket.data.accountId as string | undefined;
    if (!accountId) return;
    const watching = this.watchingByAccount.get(accountId);
    if (watching) {
      const person = this.rooms.get(watching)?.spectators.get(accountId);
      if (person?.socketId === socket.id) this.removeSpectator(accountId);
    }
    const code = this.activeByAccount.get(accountId);
    const room = code ? this.rooms.get(code) : undefined;
    const seat = room?.seatOf(accountId);
    if (!room || !seat || seat.socketId !== socket.id) return;
    seat.socketId = null;
    seat.connected = false;
    if (seat.timer) clearTimeout(seat.timer);
    const wait = room.phase === "playing" ? this.timing.surrenderAfterMs : this.timing.lobbyGraceMs;
    seat.timer = setTimeout(() => {
      seat.timer = null;
      if (!seat.connected && this.rooms.get(room.code) === room) this.leave(room, seat, false);
    }, wait);
    seat.timer.unref?.();
    this.broadcast(room);
    this.touch(accountId);
  }

  /** Where an account is: seated in a room, or watching one (for presence). */
  locate(accountId: string): { game: "gomoku-weiqi"; roomCode: string; watching: boolean } | null {
    const code = this.activeByAccount.get(accountId);
    if (code && this.rooms.get(code)?.seatOf(accountId)) return { game: "gomoku-weiqi", roomCode: code, watching: false };
    const watching = this.watchingByAccount.get(accountId);
    if (watching && this.rooms.get(watching)?.spectators.get(accountId)?.connected) return { game: "gomoku-weiqi", roomCode: watching, watching: true };
    return null;
  }

  /** True when the account sits in the room (only seated players may send invitations). */
  isSeated(accountId: string, roomCode: string): boolean {
    return !!this.rooms.get(roomCode)?.seatOf(accountId);
  }

  /** Accounts with a live socket in this namespace. */
  connectedAccounts(): string[] {
    const ids: string[] = [];
    for (const socket of this.namespace.sockets.values()) if (typeof socket.data.accountId === "string") ids.push(socket.data.accountId);
    return ids;
  }

  close(): void {
    for (const room of this.rooms.values()) for (const seat of room.seats) if (seat.timer) clearTimeout(seat.timer);
    this.rooms.clear();
    this.activeByAccount.clear();
    this.watchingByAccount.clear();
    this.namespace.disconnectSockets(true);
  }
}
