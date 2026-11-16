/**
 * 联机对局层：一条到主服务 `/flying-chess` namespace 的 Socket.IO 连接。
 *
 * 服务端是唯一权威。这里从不运行规则、不自己推进回合：发出意图，等服务器广播新的完整快照。
 * 刷新页面等同于断线重连——连接建立后会自动 `fc:rejoin` 回原座位。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { Color } from "../game/board.ts";
import type { FcPublicState, FcRoomSummary } from "../shared/protocol.ts";

export type OnlineStatus = "idle" | "connecting" | "connected" | "reconnecting" | "failed" | "auth-required";

export type OnlineAccount = { id: string; username: string; avatarUrl?: string | null };

/** 这个标签页上次所在的房间，用于刷新后走回原座位。 */
const LAST_ROOM_KEY = "flying-chess.room";

type ActionResult = { ok: boolean; error?: string; message?: string; roomCode?: string };

export function useFlyingChessOnline(
  account: OnlineAccount,
  token: string | null,
  options: { autoRoom?: { code: string; watch: boolean } | null } = {}
): {
  status: OnlineStatus;
  state: FcPublicState | null;
  rooms: FcRoomSummary[];
  error: string | null;
  createRoom: (options: { maxPlayers?: number; sixOnly?: boolean }) => Promise<boolean>;
  joinRoom: (code: string, asSpectator?: boolean) => Promise<boolean>;
  leave: () => Promise<void>;
  setReady: (ready: boolean) => void;
  configure: (patch: { maxPlayers?: number; sixOnly?: boolean }) => void;
  chooseColor: (color: Color | null) => void;
  toggleBot: (color: Color, enabled: boolean) => void;
  start: () => void;
  roll: () => void;
  move: (planeIndex: number) => void;
  refreshRooms: () => void;
  clearError: () => void;
} {
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef<FcPublicState | null>(null);
  const autoRoomRef = useRef(options.autoRoom ?? null);
  const errorTimer = useRef<number | null>(null);

  const [status, setStatus] = useState<OnlineStatus>("idle");
  const [state, setState] = useState<FcPublicState | null>(null);
  const [rooms, setRooms] = useState<FcRoomSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  stateRef.current = state;

  const fail = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current !== null) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(null), 4_500);
  }, []);

  /** 带 ack 的 emit；无载荷事件必须把回调作为第一个参数，否则 ack 永远不回来。 */
  const ack = useCallback((event: string, payload?: unknown, withPayload = payload !== undefined): Promise<ActionResult> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket) {
        resolve({ ok: false, error: "OFFLINE", message: "还没有连接到服务器。" });
        return;
      }
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: "TIMEOUT", message: "服务器没有响应，请检查网络。" });
      }, 8_000);
      const done = (result: ActionResult): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(result ?? { ok: false, error: "INVALID_ACTION" });
      };
      if (withPayload) socket.emit(event, payload, done);
      else socket.emit(event, done);
    });
  }, []);

  const resume = useCallback(async (code: string) => {
    const result = await ack("fc:rejoin", { roomCode: code });
    if (result.ok) return;
    // 网络抖动导致的超时不清状态；下一次 connect 会再 rejoin。
    if (result.error === "TIMEOUT" || result.error === "OFFLINE") return;
    // 另一次重连已经把座位找回来了，别因为旧请求失败而退回大厅。
    if (stateRef.current?.roomCode === code) return;
    try { localStorage.removeItem(LAST_ROOM_KEY); } catch { /* 无痕模式可能禁用存储 */ }
    setState(null);
    stateRef.current = null;
  }, [ack]);

  useEffect(() => {
    const socket = io("/flying-chess", {
      auth: { token: token ?? "" },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connected");
      // 每次连接（包括 StrictMode 的第二次挂载和自动重连）都要 rejoin：
      // 旧 socket 的断开会让服务端进入宽限，新 socket 必须重新登记为当前连接。
      const link = autoRoomRef.current;
      if (link) {
        autoRoomRef.current = null;
        void ack("fc:join", { roomCode: link.code, asSpectator: link.watch })
          .then((result) => { if (!result.ok) fail(result.message ?? "无法加入这个房间。"); });
        return;
      }
      let last: string | null = stateRef.current?.roomCode ?? null;
      if (!last) {
        try { last = localStorage.getItem(LAST_ROOM_KEY); } catch { last = null; }
      }
      if (!last) return;
      void resume(last);
    });
    socket.on("disconnect", () => setStatus("reconnecting"));
    socket.on("connect_error", (cause: Error) => {
      setStatus(cause.message === "AUTH_REQUIRED" ? "auth-required" : "failed");
    });
    socket.on("fc:state", (next: FcPublicState) => {
      stateRef.current = next;
      setState(next);
      try { localStorage.setItem(LAST_ROOM_KEY, next.roomCode); } catch { /* ignore */ }
    });
    socket.on("fc:rooms", (list: FcRoomSummary[]) => setRooms(Array.isArray(list) ? list : []));
    socket.on("fc:error", ({ message }: { message?: string }) => fail(message ?? "操作未被接受。"));

    setStatus("connecting");
    // 站点的 socket 用 autoConnect: false 建立 Manager；本 namespace 复用它时不会自动打开，
    // 必须显式连接（否则状态会永远停在 connecting）。
    socket.connect();
    return () => {
      socket.disconnect();
      socketRef.current = null;
      if (errorTimer.current !== null) window.clearTimeout(errorTimer.current);
    };
  }, [token, ack, resume, fail]);

  const report = (result: ActionResult): boolean => {
    if (result.ok) {
      setError(null);
      return true;
    }
    fail(result.message ?? errorText(result.error));
    return false;
  };

  const createRoom = useCallback(async (patch: { maxPlayers?: number; sixOnly?: boolean }) => {
    return report(await ack("fc:create", patch));
  }, [ack]);

  const joinRoom = useCallback(async (code: string, asSpectator = false) => {
    return report(await ack("fc:join", { roomCode: code.trim().toUpperCase(), asSpectator }));
  }, [ack]);

  const leave = useCallback(async () => {
    await ack("fc:leave");
    try { localStorage.removeItem(LAST_ROOM_KEY); } catch { /* ignore */ }
    stateRef.current = null;
    setState(null);
  }, [ack]);

  const setReady = useCallback((ready: boolean) => {
    void ack("fc:ready", { ready }).then(report);
  }, [ack]);

  const configure = useCallback((patch: { maxPlayers?: number; sixOnly?: boolean }) => {
    void ack("fc:config", patch).then(report);
  }, [ack]);

  const chooseColor = useCallback((color: Color | null) => {
    void ack("fc:seats", { color }).then(report);
  }, [ack]);

  const toggleBot = useCallback((color: Color, enabled: boolean) => {
    void ack("fc:bot", { color, enabled }).then(report);
  }, [ack]);

  const start = useCallback(() => {
    void ack("fc:start").then(report);
  }, [ack]);

  const roll = useCallback(() => {
    void ack("fc:roll").then(report);
  }, [ack]);

  const move = useCallback((planeIndex: number) => {
    void ack("fc:move", { planeIndex }).then(report);
  }, [ack]);

  const refreshRooms = useCallback(() => {
    socketRef.current?.emit("fc:rooms:request");
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    status,
    state,
    rooms,
    error,
    createRoom,
    joinRoom,
    leave,
    setReady,
    configure,
    chooseColor,
    toggleBot,
    start,
    roll,
    move,
    refreshRooms,
    clearError
  };
}

export function errorText(code: string | undefined): string {
  switch (code) {
    case "ROOM_NOT_FOUND": return "房间不存在，或已经结束。";
    case "ROOM_FULL": return "房间已满。";
    case "ROOM_LIMIT": return "服务器上的房间太多，请稍后再试。";
    case "GAME_STARTED": return "对局已经开始。";
    case "NOT_STARTED": return "对局还没有开始。";
    case "NOT_HOST": return "只有房主可以这样做。";
    case "NOT_YOUR_TURN": return "还没轮到你。";
    case "NOT_NOW": return "现在不能这样做。";
    case "NOT_YET": return "骰子还在转，稍等一下。";
    case "INVALID_MOVE": return "这一步不合法。";
    case "COLOR_TAKEN": return "这个阵营色已经被占了。";
    case "READ_ONLY": return "另一个标签页正在操作，这个页面只能观看。";
    case "TIMEOUT": return "服务器没有响应，请检查网络。";
    default: return "操作未被接受。";
  }
}

/** `?room=ABCD` 与 `&watch=1`：好友链接直接进房观战。 */
export function roomFromUrl(): { code: string; watch: boolean } | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("room")?.trim().toUpperCase();
    if (!code) return null;
    return { code, watch: params.get("watch") === "1" };
  } catch {
    return null;
  }
}
