/**
 * The online layer: one Socket.IO connection to the host's `/monopoly` namespace, and the small amount of state that only
 * exists online.
 *
 * The difference from `GameSession` is ownership. A local session *is* the authority — it applies actions itself. Online,
 * the server is, so this class never calls the engine: it sends an action and waits to be told the new state, exactly as
 * the protocol document specifies. When the server speaks, `game` is simply replaced.
 *
 * Nothing here decides a rule. If a rule needs to be known to draw a screen, it comes from the shared engine in
 * `../shared`, the same code the server runs.
 */

import { io } from "socket.io-client";
import type { MonopolyAction, MonopolyGame, MonopolyError, RoomState, RoomSummary } from "../shared/protocol.ts";

export type OnlineStatus = "idle" | "connecting" | "connected" | "reconnecting" | "failed" | "auth-required";

export interface OnlineAccount { id: string; username: string; avatarUrl?: string | null }

/** The room this tab was last in, so a reload can walk back in instead of starting over. */
const LAST_ROOM_KEY = "monopoly.room";

export class OnlineSession {
  readonly account: OnlineAccount;
  state: RoomState | null = null;
  rooms: RoomSummary[] = [];
  status: OnlineStatus = "idle";
  /** The last refusal, in words. Cleared once the player acts again. */
  error: string | null = null;

  /** Untyped on purpose: the host's socket.io-client and this package's copies have unrelated type identities. */
  private readonly socket: ReturnType<typeof io>;
  private readonly listeners = new Set<() => void>();
  private readonly onError: (message: string) => void;

  constructor(options: { token: string; account: OnlineAccount; onError?: (message: string) => void }) {
    this.account = options.account;
    this.onError = options.onError ?? (() => {});
    this.socket = io("/monopoly", {
      auth: { token: options.token },
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000
    });

    this.socket.on("connect", () => {
      this.setStatus("connected");
      // Back into the room this tab was in, if it still exists and still holds this account.
      const last = lastRoom();
      if (last && !this.state) void this.resume(last);
    });
    this.socket.on("disconnect", () => this.setStatus("reconnecting"));
    this.socket.on("connect_error", (error: Error) => {
      this.setStatus(error.message === "AUTH_REQUIRED" ? "auth-required" : "failed");
    });
    this.socket.on("reconnect_attempt", () => this.setStatus("reconnecting"));
    this.socket.on("monopoly:state", (state: RoomState) => {
      this.state = state;
      localStorage.setItem(LAST_ROOM_KEY, state.roomCode);
      this.emit();
    });
    this.socket.on("monopoly:rooms", (rooms: RoomSummary[]) => { this.rooms = rooms; this.emit(); });
    this.socket.on("monopoly:error", ({ message }: { message: string }) => this.fail(message));
    this.socket.on("monopoly:closed", ({ reason }: { reason: string }) => {
      localStorage.removeItem(LAST_ROOM_KEY);
      this.state = null;
      this.fail(reason);
    });
  }

  connect(): void {
    if (this.socket.connected) return;
    this.setStatus("connecting");
    this.socket.connect();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private setStatus(status: OnlineStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit();
  }

  private fail(message: string): void {
    this.error = message;
    this.onError(message);
    this.emit();
  }

  /**
   * Emits and waits for the acknowledgement. An event with no payload (`start`, `reset`, `leave`) must be emitted with the
   * callback as its *first* argument — passing an explicit `undefined` shifts the callback into the payload slot and the
   * server's ack never arrives.
   */
  private ackOf<T>(event: string, payload?: unknown): Promise<{ ok: boolean; error?: string; message?: string } & T> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve({ ok: false, error: "TIMEOUT", message: "服务器没有响应，请检查网络。" } as never), 8000);
      const done = (result: { ok: boolean; error?: string; message?: string } & T): void => {
        window.clearTimeout(timer);
        resolve(result);
      };
      if (arguments.length >= 2) this.socket.emit(event, payload, done);
      else this.socket.emit(event, done);
    });
  }

  /** Asks the server for the room list again, for the lobby's refresh button. */
  refreshRooms(): void {
    this.socket.emit("monopoly:rooms:request");
  }

  async createRoom(options: { maxPlayers?: number; allowSpectators?: boolean }): Promise<boolean> {
    const result = await this.ackOf("monopoly:create", options);
    if (!result.ok) this.fail(result.message ?? errorText(result.error));
    return result.ok;
  }

  async joinRoom(code: string, asSpectator = false): Promise<boolean> {
    const result = await this.ackOf<{ roomCode: string }>("monopoly:join", { roomCode: code.trim().toUpperCase(), asSpectator });
    if (!result.ok) this.fail(result.message ?? errorText(result.error));
    return result.ok;
  }

  async leave(): Promise<void> {
    await this.ackOf("monopoly:leave");
    localStorage.removeItem(LAST_ROOM_KEY);
    this.state = null;
    this.emit();
  }

  async setReady(ready: boolean): Promise<void> {
    const result = await this.ackOf("monopoly:ready", { ready });
    if (!result.ok) this.fail(result.message ?? errorText(result.error));
  }

  async configure(patch: { maxPlayers?: number; allowSpectators?: boolean }): Promise<void> {
    const result = await this.ackOf("monopoly:config", patch);
    if (!result.ok) this.fail(result.message ?? errorText(result.error));
  }

  async start(): Promise<void> {
    const result = await this.ackOf("monopoly:start");
    if (!result.ok) this.fail(result.message ?? errorText(result.error));
  }

  async reset(): Promise<void> {
    const result = await this.ackOf("monopoly:reset");
    if (!result.ok) this.fail(result.message ?? errorText(result.error));
  }

  /**
   * Sends one action. The server answers with a fresh state (or a refusal); this class never touches `game` itself, so the
   * client can never show a table the server does not agree with.
   */
  act(action: MonopolyAction): void {
    this.socket.emit("monopoly:action", action, (result: { ok: boolean; error?: string; message?: string }) => {
      if (!result.ok) this.fail(result.message ?? errorText(result.error));
    });
  }

  private async resume(code: string): Promise<void> {
    const result = await this.ackOf<{ roomCode: string }>("monopoly:rejoin", { roomCode: code });
    if (!result.ok) {
      // The room is gone, or this account is no longer in it: forget it and show the lobby rather than a stuck screen.
      localStorage.removeItem(LAST_ROOM_KEY);
      this.state = null;
      this.emit();
    }
  }

  /** The game, if one is running. */
  get game(): MonopolyGame | null {
    return this.state?.game ?? null;
  }

  /** True when this account is seated rather than watching. */
  get seated(): boolean {
    return !!this.state && !this.state.youAreSpectator;
  }

  dispose(): void {
    this.socket.disconnect();
    this.listeners.clear();
  }
}

function lastRoom(): string | null {
  try { return localStorage.getItem(LAST_ROOM_KEY); } catch { return null; }
}

/** The server's error codes, in the same words the local game uses. */
export function errorText(code: string | undefined): string {
  switch (code) {
    case "ROOM_NOT_FOUND": return "房间不存在，或已经结束。";
    case "ROOM_FULL": return "房间已满。";
    case "GAME_STARTED": return "对局已经开始。";
    case "NOT_HOST": return "只有房主可以这样做。";
    case "NOT_IN_ROOM": return "你不在这个房间里。";
    case "ROOM_LIMIT": return "服务器上的房间太多，请稍后再试。";
    case "TIMEOUT": return "服务器没有响应，请检查网络。";
    default: return errorCodeText(code as MonopolyError | undefined);
  }
}

function errorCodeText(code: MonopolyError | undefined): string {
  switch (code) {
    case "NOT_YOUR_TURN": return "还没轮到你。";
    case "NOT_NOW": return "现在不能这样做。";
    case "NOT_ENOUGH_CASH": return "现金不足。";
    case "NOT_OWNER": return "这不是你的地产。";
    case "GROUP_INCOMPLETE": return "需要集齐整个地区组。";
    case "BUILD_EVENLY": return "需要均衡建造。";
    case "HAS_BUILDINGS": return "有建筑的地产不能抵押。";
    case "ALREADY_MORTGAGED": return "已经抵押了。";
    case "BUILD_LIMIT": return "已经到上限。";
    case "MORTGAGED": return "该地产处于抵押状态。";
    case "NEED_RAISE_MONEY": return "现金不足，需要先筹钱。";
    case "BID_TOO_LOW": return "出价比最低价还低。";
    case "PENDING_DECISION": return "还有待处理的事情。";
    case "GAME_OVER": return "对局已结束。";
    default: return "操作未被接受。";
  }
}

export { roomLink } from "./roomLink.ts";
