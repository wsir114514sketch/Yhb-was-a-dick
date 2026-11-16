/**
 * 一个飞行棋房间：座位、房主、准备状态，以及从"一个 socket 的意图"到规则引擎的接线。
 *
 * 房间不认识 Socket.IO —— namespace（见 `index.ts`）把 socket 翻译成账号 id 再调用这里。
 * 所有会推进对局的写入都走本文件，客户端传来的点数、步数、坐标一律不采信。
 */

import { COLORS, COLOR_NAME } from "../game/board.ts";
import type { Color } from "../game/board.ts";
import {
  afterRoll, applyMove, createGame, currentPlayer, legalMoves, pickAiMove, resolveMove, rollDice
} from "../game/rules.ts";
import type { GameState, Move } from "../game/rules.ts";
import type {
  FcAccount, FcErrorCode, FcPhase, FcPlayerView, FcPublicState, FcRoomSummary, FcSpectatorView
} from "../shared/protocol.ts";

/** 骰子停住后停留多久再允许移动，与单机版的观感一致。 */
export const DICE_READ_MS = 1_100;
/** 超时未操作，由服务端替玩家走一步。 */
export const MOVE_TIMEOUT_MS = 30_000;
/** 电脑托管：掷骰前的停顿。 */
const BOT_ROLL_DELAY_MS = 700;
/** 电脑托管：骰子停留结束后，移动前的额外停顿。 */
const BOT_MOVE_EXTRA_MS = 350;
/** 断线宽限期；期内回到原座位，过了就交给电脑或释放座位。 */
export const DISCONNECT_GRACE_MS = 90_000;

export type Random = () => number;

export class RoomError extends Error {
  readonly code: FcErrorCode;
  constructor(code: FcErrorCode) {
    super(code);
    this.code = code;
  }
}

type Seat = {
  id: string;
  username: string;
  avatarUrl: string | null;
  color: Color;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  order: number;
  sockets: Set<string>;
};

type Spectator = {
  id: string;
  username: string;
  avatarUrl: string | null;
  connected: boolean;
  sockets: Set<string>;
};

export interface RoomOptions {
  code: string;
  maxPlayers: number;
  sixOnly?: boolean;
  random?: Random;
  now?: () => number;
  /** 测试可以缩短宽限期/骰子停顿。 */
  graceMs?: number;
  diceReadMs?: number;
  moveTimeoutMs?: number;
}

/** 落盘时保存的内容。 */
export type StoredFlyingChessRoom = {
  code: string;
  hostId: string;
  phase: "waiting" | "playing" | "over";
  maxPlayers: number;
  sixOnly: boolean;
  seats: {
    id: string; username: string; avatarUrl: string | null; color: Color;
    ready: boolean; isBot: boolean; order: number;
  }[];
  game: GameState | null;
  dice: number | null;
  event: string;
  savedAt: number;
};

export class Room {
  readonly code: string;
  readonly createdAt: number;
  phase: "waiting" | "playing" | "over" = "waiting";
  hostId = "";
  maxPlayers: number;
  sixOnly: boolean;
  game: GameState | null = null;
  /** 最近一次掷出的点数；停住不消失，供界面显示。 */
  dice: number | null = null;
  event = "";
  seq = 0;

  /** 每次状态变化后调用；namespace 在此广播并落盘。 */
  onChange: (room: Room) => void = () => {};
  /** 房间里再没有任何人时调用，由房间表回收。 */
  onEmpty: (code: string) => void = () => {};

  private readonly seats = new Map<string, Seat>();
  private readonly spectators = new Map<string, Spectator>();
  /** 每个账号最近的连接；同一账号多开时只有它能操作。 */
  private readonly activeSocket = new Map<string, string>();
  private readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private dicePauseTimer: ReturnType<typeof setTimeout> | null = null;
  private moveTimer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private notBefore = 0;
  private orderCounter = 0;

  private readonly random: Random;
  private readonly now: () => number;
  private readonly graceMs: number;
  private readonly diceReadMs: number;
  private readonly moveTimeoutMs: number;

  constructor(options: RoomOptions) {
    this.code = options.code;
    this.maxPlayers = clampPlayers(options.maxPlayers);
    this.sixOnly = !!options.sixOnly;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => Date.now());
    this.graceMs = options.graceMs ?? DISCONNECT_GRACE_MS;
    this.diceReadMs = options.diceReadMs ?? DICE_READ_MS;
    this.moveTimeoutMs = options.moveTimeoutMs ?? MOVE_TIMEOUT_MS;
    this.createdAt = this.now();
  }

  // ---------------- 座位 ----------------

  /** 加入或回到原座位。对局开始后陌生人不能再入座，只有本房间的人能重连。 */
  join(account: FcAccount, socketId?: string): void {
    const existing = this.seats.get(account.id);
    if (existing) {
      existing.connected = true;
      existing.username = account.username;
      existing.avatarUrl = account.avatarUrl ?? null;
      // 宽限期内回来，把电脑托管交还给人。
      existing.isBot = false;
      const player = this.game?.players.find((entry) => entry.color === existing.color);
      if (player) player.ai = false;
      this.clearGrace(account.id);
      this.registerSocket(existing, socketId);
      this.publish();
      return;
    }
    if (this.phase !== "waiting") throw new RoomError("GAME_STARTED");
    if (this.seats.size >= this.maxPlayers) throw new RoomError("ROOM_FULL");
    const color = this.freeColor();
    if (!color) throw new RoomError("ROOM_FULL");
    this.spectators.delete(account.id);
    const seat: Seat = {
      id: account.id,
      username: account.username,
      avatarUrl: account.avatarUrl ?? null,
      color,
      ready: false,
      connected: true,
      isBot: false,
      order: ++this.orderCounter,
      sockets: new Set()
    };
    this.registerSocket(seat, socketId);
    this.seats.set(account.id, seat);
    if (!this.hostId) this.hostId = account.id;
    this.publish();
  }

  /** 观战：可以看，不能操作。对局中也可以加入。 */
  spectate(account: FcAccount, socketId?: string): void {
    const existing = this.spectators.get(account.id);
    if (existing) {
      existing.connected = true;
      existing.username = account.username;
      this.clearGrace(account.id);
      this.registerSocket(existing, socketId);
      this.publish();
      return;
    }
    const spectator: Spectator = {
      id: account.id,
      username: account.username,
      avatarUrl: account.avatarUrl ?? null,
      connected: true,
      sockets: new Set()
    };
    this.registerSocket(spectator, socketId);
    this.spectators.set(account.id, spectator);
    this.publish();
  }

  /** 只有最近一条连接可以操作；旧标签页收到只读状态。 */
  private registerSocket(holder: Seat | Spectator, socketId?: string): void {
    if (!socketId) return;
    holder.sockets.add(socketId);
    this.activeSocket.set(holder.id, socketId);
  }

  private unregisterSocket(accountId: string, socketId?: string): void {
    const holder = this.seats.get(accountId) ?? this.spectators.get(accountId);
    if (holder && socketId) holder.sockets.delete(socketId);
    if (!socketId) return;
    if (this.activeSocket.get(accountId) === socketId) {
      const remaining = holder ? [...holder.sockets][0] : undefined;
      if (remaining) this.activeSocket.set(accountId, remaining);
      else this.activeSocket.delete(accountId);
    }
  }

  private isActive(accountId: string, socketId?: string): boolean {
    if (!socketId) return true;
    const active = this.activeSocket.get(accountId);
    return !active || active === socketId;
  }

  /** 断开不立刻移除座位：标记离线并开始宽限期。 */
  disconnect(accountId: string, socketId?: string): void {
    this.unregisterSocket(accountId, socketId);
    const seat = this.seats.get(accountId);
    if (seat) {
      if (seat.sockets.size === 0) {
        seat.connected = false;
        // 电脑座位不会断线；真人座位开始宽限计时。
        if (!seat.isBot) this.scheduleGrace(accountId);
      }
      this.publish();
      return;
    }
    const spectator = this.spectators.get(accountId);
    if (spectator) {
      if (spectator.sockets.size === 0) spectator.connected = false;
      this.publish();
    }
  }

  /** 主动离开：等待室释放座位；对局中保留座位并转托管；结束后直接移除。 */
  leave(accountId: string, socketId?: string): void {
    this.unregisterSocket(accountId, socketId);
    if (this.spectators.delete(accountId)) {
      this.clearGrace(accountId);
      this.afterMembersChanged();
      return;
    }
    const seat = this.seats.get(accountId);
    if (!seat) return;
    if (this.phase === "playing") {
      seat.connected = false;
      if (!seat.isBot) {
        seat.isBot = true;
        const player = this.game?.players.find((entry) => entry.color === seat.color);
        if (player) player.ai = true;
        this.event = `${seat.username} 离开，交给电脑托管`;
      }
      // 真人都走了：电脑之间的对局没有意义，直接回收房间。
      if (this.deserted()) {
        this.onEmpty(this.code);
        return;
      }
      this.scheduleBot();
      this.publish();
      return;
    }
    this.seats.delete(accountId);
    this.clearGrace(accountId);
    if (this.hostId === accountId) this.transferHost();
    this.event = `${seat.username} 离开了房间`;
    this.afterMembersChanged();
  }

  private afterMembersChanged(): void {
    if ((this.seats.size === 0 && this.spectators.size === 0) || this.deserted()) {
      this.onEmpty(this.code);
      return;
    }
    this.publish();
  }

  /** 座位上已经没有真人（可能还剩电脑）。 */
  private deserted(): boolean {
    return ![...this.seats.values()].some((seat) => !seat.isBot);
  }

  private transferHost(): void {
    const next = this.humanSeats()[0] ?? [...this.seats.values()].sort(byOrder)[0];
    this.hostId = next?.id ?? "";
  }

  setReady(accountId: string, ready: boolean): void {
    if (this.phase !== "waiting") throw new RoomError("GAME_STARTED");
    const seat = this.seats.get(accountId);
    if (!seat) throw new RoomError("NOT_IN_ROOM");
    if (seat.isBot) throw new RoomError("INVALID_ACTION");
    seat.ready = !!ready;
    this.publish();
  }

  /** 选择阵营色；传 null 表示交给服务端自动分配一个空位颜色。 */
  chooseColor(accountId: string, color: Color | null): void {
    if (this.phase !== "waiting") throw new RoomError("GAME_STARTED");
    const seat = this.seats.get(accountId);
    if (!seat) throw new RoomError("NOT_IN_ROOM");
    if (color === null) {
      const free = this.freeColor();
      if (!free) throw new RoomError("ROOM_FULL");
      seat.color = free;
    } else {
      if (!COLORS.includes(color)) throw new RoomError("INVALID_ACTION");
      const taken = [...this.seats.values()].some((entry) => entry.id !== accountId && entry.color === color);
      if (taken) throw new RoomError("COLOR_TAKEN");
      seat.color = color;
    }
    this.publish();
  }

  /** 房主把空颜色交给电脑，或收回。 */
  toggleBot(accountId: string, color: Color, enabled: boolean): void {
    this.requireHost(accountId);
    if (this.phase !== "waiting") throw new RoomError("GAME_STARTED");
    if (!COLORS.includes(color)) throw new RoomError("INVALID_ACTION");
    const occupied = [...this.seats.values()].find((entry) => entry.color === color);
    if (enabled) {
      if (occupied) throw new RoomError("COLOR_TAKEN");
      const bot: Seat = {
        id: `bot:${color}`,
        username: `电脑·${COLOR_NAME[color]}`,
        avatarUrl: null,
        color,
        ready: true,
        connected: true,
        isBot: true,
        order: ++this.orderCounter,
        sockets: new Set()
      };
      this.seats.set(bot.id, bot);
    } else {
      if (!occupied?.isBot) throw new RoomError("INVALID_ACTION");
      this.seats.delete(occupied.id);
    }
    this.publish();
  }

  configure(accountId: string, patch: { maxPlayers?: number; sixOnly?: boolean }): void {
    this.requireHost(accountId);
    if (this.phase !== "waiting") throw new RoomError("GAME_STARTED");
    if (typeof patch.maxPlayers === "number") {
      const next = clampPlayers(patch.maxPlayers);
      if (next < this.seats.size) throw new RoomError("ROOM_FULL");
      this.maxPlayers = next;
    }
    if (typeof patch.sixOnly === "boolean") this.sixOnly = patch.sixOnly;
    this.publish();
  }

  get startAllowed(): boolean {
    if (this.phase !== "waiting") return false;
    if (this.seats.size < 2 || this.seats.size !== this.maxPlayers) return false;
    return [...this.seats.values()].every(
      (seat) => seat.connected && (seat.isBot || seat.id === this.hostId || seat.ready)
    );
  }

  /** 开局。房主、满员、除房主外全员准备且在线。 */
  start(accountId: string): void {
    this.requireHost(accountId);
    if (this.phase !== "waiting") throw new RoomError("GAME_STARTED");
    if (!this.startAllowed) throw new RoomError("INVALID_ACTION");
    const seated = [...this.seats.values()].sort(byOrder);
    this.game = createGame({
      players: seated.map((seat) => ({ color: seat.color, name: seat.username, ai: seat.isBot })),
      sixOnly: this.sixOnly
    });
    this.phase = "playing";
    this.dice = null;
    this.notBefore = 0;
    this.event = "对决开始";
    this.publish();
    this.scheduleBot();
  }

  // ---------------- 对局 ----------------

  /** 掷骰：服务端记账；重复掷骰、非本人回合、非掷骰阶段一律拒绝。 */
  roll(accountId: string, socketId?: string): void {
    this.requirePlaying();
    const seat = this.requireSeat(accountId);
    if (seat.isBot) throw new RoomError("NOT_YOUR_TURN");
    if (!this.isActive(accountId, socketId)) throw new RoomError("READ_ONLY");
    const game = this.game!;
    if (game.phase !== "roll") throw new RoomError("NOT_NOW");
    const player = currentPlayer(game);
    if (player.color !== seat.color) throw new RoomError("NOT_YOUR_TURN");
    if (this.now() < this.notBefore) throw new RoomError("NOT_YET");
    this.rollInternal();
  }

  /** 移动：必须轮到本人、处于移动阶段，且机号在服务端算出的合法列表里。 */
  move(accountId: string, planeIndex: number, socketId?: string): void {
    this.requirePlaying();
    const seat = this.requireSeat(accountId);
    if (seat.isBot) throw new RoomError("NOT_YOUR_TURN");
    if (!this.isActive(accountId, socketId)) throw new RoomError("READ_ONLY");
    if (this.now() < this.notBefore) throw new RoomError("NOT_YET");
    const game = this.game!;
    if (game.phase !== "move" || game.dice === null) throw new RoomError("NOT_NOW");
    const player = currentPlayer(game);
    if (player.color !== seat.color) throw new RoomError("NOT_YOUR_TURN");
    const move = legalMoves(game, player, game.dice).find((entry) => entry.planeIndex === planeIndex);
    if (!move) throw new RoomError("INVALID_MOVE");
    this.applyMoveInternal(player, move);
  }

  private rollInternal(): void {
    const game = this.game;
    if (!game) return;
    const player = currentPlayer(game);
    const value = rollDice(this.random);
    this.dice = value;
    this.game = afterRoll(game, value);
    this.notBefore = this.now() + this.diceReadMs;
    this.clearMoveTimer();

    if (this.game.phase === "move") {
      this.event = `${player.name} 掷出 ${value}`;
      this.moveTimer = this.setTimer(this.moveTimeoutMs, () => this.autoMove());
    } else {
      // 三连 6 作废、或没有合法移动：点数仍停住 1.1 秒，然后才让下一位行动。
      this.event = this.game.event || `${player.name} 掷出 ${value}`;
      this.dicePauseTimer = this.setTimer(this.diceReadMs, () => {
        this.dicePauseTimer = null;
        this.notBefore = 0;
        this.publish();
        this.scheduleBot();
      });
    }
    this.publish();
    this.scheduleBot();
  }

  private applyMoveInternal(player: { name: string }, move: Move): void {
    const game = this.game;
    if (!game) return;
    const resolved = resolveMove(game, currentPlayer(game), move);
    const events = [...resolved.events];
    const next = applyMove(game, move);
    this.game = next;
    this.notBefore = 0;
    this.clearMoveTimer();
    this.clearDicePauseTimer();
    this.event = `${player.name} 移动 ${move.planeIndex + 1} 号机`
      + (events.length ? ` · ${events.join(" · ")}` : "");
    if (next.winner) {
      this.phase = "over";
      this.event = `${player.name} 四架飞机全部抵达终点，获胜`;
    }
    this.publish();
    if (this.phase === "playing") this.scheduleBot();
  }

  /** 超时未操作：服务端用同一套 AI 替玩家走一步。 */
  private autoMove(): void {
    this.moveTimer = null;
    const game = this.game;
    if (!game || game.phase !== "move" || game.dice === null || this.phase !== "playing") return;
    const move = pickAiMove(game, game.dice);
    if (!move) return;
    const player = currentPlayer(game);
    this.event = `${player.name} 超时，自动走一步`;
    this.applyMoveInternal(player, move);
  }

  private botRoll(): void {
    this.botTimer = null;
    if (this.phase !== "playing" || !this.game || this.game.phase !== "roll") return;
    if (!this.isBotColor(currentPlayer(this.game).color)) return;
    this.rollInternal();
  }

  private botMove(): void {
    this.botTimer = null;
    const game = this.game;
    if (this.phase !== "playing" || !game || game.phase !== "move" || game.dice === null) return;
    const player = currentPlayer(game);
    if (!this.isBotColor(player.color)) return;
    if (this.now() < this.notBefore) {
      this.scheduleBot();
      return;
    }
    const move = pickAiMove(game, game.dice);
    if (!move) return;
    this.applyMoveInternal(player, move);
  }

  /** 若当前行动方是电脑托管，安排它在骰子停顿结束后行动。 */
  private scheduleBot(): void {
    this.clearBotTimer();
    if (this.phase !== "playing" || !this.game) return;
    const player = currentPlayer(this.game);
    if (!this.isBotColor(player.color)) return;
    const pause = Math.max(this.notBefore - this.now(), 0);
    const delay = this.game.phase === "move"
      ? pause + BOT_MOVE_EXTRA_MS
      : pause + BOT_ROLL_DELAY_MS;
    this.botTimer = this.setTimer(delay, () => {
      try {
        if (this.game?.phase === "move") this.botMove();
        else if (this.game?.phase === "roll") this.botRoll();
      } catch (error) {
        console.error(`[flying-chess] room ${this.code} bot action failed`, error);
      }
    });
  }

  // ---------------- 断线宽限 ----------------

  private scheduleGrace(accountId: string): void {
    this.clearGrace(accountId);
    const timer = this.setTimer(this.graceMs, () => this.expireGrace(accountId));
    this.graceTimers.set(accountId, timer);
  }

  private clearGrace(accountId: string): void {
    const timer = this.graceTimers.get(accountId);
    if (timer) clearTimeout(timer);
    this.graceTimers.delete(accountId);
  }

  private expireGrace(accountId: string): void {
    this.graceTimers.delete(accountId);
    const seat = this.seats.get(accountId);
    if (!seat || seat.connected || seat.isBot) return;
    if (this.phase === "playing") {
      // 对局已经开始：座位保留，交给电脑。
      seat.isBot = true;
      seat.ready = true;
      const player = this.game?.players.find((entry) => entry.color === seat.color);
      if (player) player.ai = true;
      this.event = `${seat.username} 断线超时，交给电脑托管`;
      this.publish();
      this.scheduleBot();
      return;
    }
    // 还在等待室：释放座位。
    this.seats.delete(accountId);
    if (this.hostId === accountId) this.transferHost();
    this.event = `${seat.username} 断线超时，座位已释放`;
    this.afterMembersChanged();
  }

  // ---------------- 查询 ----------------

  publicState(accountId: string, socketId?: string): FcPublicState {
    const seat = this.seats.get(accountId);
    const spectator = this.spectators.get(accountId);
    const players = [...this.seats.values()].sort(byOrder).map((entry): FcPlayerView => {
      const player = this.game?.players.find((candidate) => candidate.color === entry.color);
      return {
        id: entry.id,
        username: entry.username,
        avatarUrl: entry.avatarUrl,
        color: entry.color,
        ready: entry.ready,
        connected: entry.connected,
        isBot: entry.isBot,
        isHost: entry.id === this.hostId,
        planes: (player?.planes ?? [0, 1, 2, 3].map(() => ({ step: -1 }))).map((plane) => ({ step: plane.step })),
        sixStreak: player?.sixStreak ?? 0
      };
    });
    const spectators = [...this.spectators.values()].map((entry): FcSpectatorView => ({
      id: entry.id, username: entry.username, avatarUrl: entry.avatarUrl, connected: entry.connected
    }));
    let phase: FcPhase = "waiting";
    if (this.phase === "over") phase = "over";
    else if (this.phase === "playing") phase = this.game?.phase ?? "roll";

    const legal = this.game && this.game.phase === "move" && this.game.dice !== null
      ? legalMoves(this.game, currentPlayer(this.game), this.game.dice).map((move) => move.planeIndex)
      : [];

    return {
      roomCode: this.code,
      phase,
      players,
      spectators,
      hostId: this.hostId,
      maxPlayers: this.maxPlayers,
      sixOnly: this.sixOnly,
      turn: this.game?.turn ?? 0,
      dice: this.dice,
      winner: this.game?.winner ?? null,
      legalPlaneIndices: legal,
      event: this.event,
      seq: this.seq,
      notBefore: this.notBefore,
      startAllowed: this.startAllowed,
      isHost: accountId === this.hostId,
      onGame: !!seat,
      youAreSpectator: !!spectator && !seat,
      active: this.isActive(accountId, socketId)
    };
  }

  summary(): FcRoomSummary {
    return {
      code: this.code,
      host: this.seats.get(this.hostId)?.username ?? "",
      players: this.seats.size,
      maxPlayers: this.maxPlayers,
      spectators: this.spectators.size,
      phase: this.phase,
      sixOnly: this.sixOnly
    };
  }

  playerList(): FcPlayerView[] {
    return this.publicState("").players;
  }

  isMember(accountId: string): boolean {
    return this.seats.has(accountId) || this.spectators.has(accountId);
  }

  locate(accountId: string): { game: "flying-chess"; roomCode: string; watching: boolean } | null {
    if (this.spectators.has(accountId)) return { game: "flying-chess", roomCode: this.code, watching: true };
    if (this.seats.has(accountId)) return { game: "flying-chess", roomCode: this.code, watching: false };
    return null;
  }

  /** 没有任何在线真人、也没有在线观战者：房间表可以在宽限后回收。 */
  get isAbandoned(): boolean {
    const anyPlayer = [...this.seats.values()].some((seat) => !seat.isBot && seat.connected);
    const anySpectator = [...this.spectators.values()].some((spectator) => spectator.connected);
    return !anyPlayer && !anySpectator;
  }

  // ---------------- 落盘 ----------------

  serialize(): StoredFlyingChessRoom {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      maxPlayers: this.maxPlayers,
      sixOnly: this.sixOnly,
      seats: [...this.seats.values()].sort(byOrder).map((seat) => ({
        id: seat.id,
        username: seat.username,
        avatarUrl: seat.avatarUrl,
        color: seat.color,
        ready: seat.ready,
        isBot: seat.isBot,
        order: seat.order
      })),
      game: this.game,
      dice: this.dice,
      event: this.event,
      savedAt: this.now()
    };
  }

  /** 进程重启后恢复：座位先放回，再接收对局。所有人初始为离线。 */
  adopt(stored: StoredFlyingChessRoom): void {
    this.hostId = stored.hostId;
    this.phase = stored.phase;
    this.maxPlayers = clampPlayers(stored.maxPlayers);
    this.sixOnly = stored.sixOnly;
    this.dice = stored.dice;
    this.event = stored.event || "对局已恢复";
    this.orderCounter = 0;
    for (const entry of [...stored.seats].sort((a, b) => a.order - b.order)) {
      const seat: Seat = {
        id: entry.id,
        username: entry.username,
        avatarUrl: entry.avatarUrl,
        color: entry.color,
        ready: entry.ready,
        connected: entry.isBot,
        isBot: entry.isBot,
        order: entry.order,
        sockets: new Set()
      };
      this.orderCounter = Math.max(this.orderCounter, entry.order);
      this.seats.set(seat.id, seat);
    }
    this.game = stored.game;
    if (this.phase === "playing") {
      // 真人席位从"离线"开始，给 90 秒回来；超时后自动转托管。
      for (const seat of this.seats.values()) {
        if (!seat.isBot) this.scheduleGrace(seat.id);
      }
      this.scheduleBot();
    }
  }

  dispose(): void {
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    this.graceTimers.clear();
    this.clearMoveTimer();
    this.clearDicePauseTimer();
    this.clearBotTimer();
  }

  // ---------------- 工具 ----------------

  private publish(): void {
    this.seq += 1;
    this.onChange(this);
  }

  private requirePlaying(): void {
    if (this.phase !== "playing") throw new RoomError("NOT_STARTED");
  }

  private requireHost(accountId: string): void {
    if (accountId !== this.hostId) throw new RoomError("NOT_HOST");
  }

  private requireSeat(accountId: string): Seat {
    const seat = this.seats.get(accountId);
    if (!seat) throw new RoomError("NOT_IN_ROOM");
    return seat;
  }

  private isBotColor(color: Color): boolean {
    return [...this.seats.values()].some((seat) => seat.color === color && seat.isBot);
  }

  private humanSeats(): Seat[] {
    return [...this.seats.values()].filter((seat) => !seat.isBot).sort(byOrder);
  }

  private freeColor(): Color | null {
    const used = new Set([...this.seats.values()].map((seat) => seat.color));
    return COLORS.find((color) => !used.has(color)) ?? null;
  }

  private clearMoveTimer(): void {
    if (this.moveTimer) clearTimeout(this.moveTimer);
    this.moveTimer = null;
  }

  private clearDicePauseTimer(): void {
    if (this.dicePauseTimer) clearTimeout(this.dicePauseTimer);
    this.dicePauseTimer = null;
  }

  private clearBotTimer(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
  }

  private setTimer(ms: number, callback: () => void): ReturnType<typeof setTimeout> {
    const timer = setTimeout(callback, Math.max(0, ms));
    // 房间定时器不应单独拖住进程退出。
    (timer as { unref?: () => void }).unref?.();
    return timer;
  }
}

function clampPlayers(value: number): number {
  if (!Number.isFinite(value)) return 4;
  return Math.max(2, Math.min(4, Math.floor(value)));
}

function byOrder(left: Seat, right: Seat): number {
  return left.order - right.order;
}
