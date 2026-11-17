/**
 * 飞行棋模块：`registerFlyingChess(app, io, deps)`。
 *
 * 按游戏接入规范并入主服务：自己的 Socket.IO namespace（`/flying-chess`）、自己的 HTTP 路由、
 * 自己的数据目录，账号复用主服务的 `verifyToken`，不新建账号体系。
 *
 * 每个 socket 处理器与定时器回调都被包住：一个房间出问题只影响这个房间，不会带走服务其它部分。
 */

import type { Express, Request, Response } from "express";
import type { Namespace, Server as SocketServer, Socket } from "socket.io";
import { Room, RoomError } from "./room.ts";
import { RoomManager } from "./rooms.ts";
import type { FcAccount, FcErrorCode, FcPublicState, FcRoomSummary } from "../shared/protocol.ts";

export interface FlyingChessDeps {
  /** 从连接 token 解析账号；为 null 表示未登录。注入进来，本模块不碰 accounts.json。 */
  resolveAccount?: (token: string | undefined) => FcAccount | null;
  /** 房间落盘目录，默认 `server/data/flying-chess`。 */
  dataDir?: string;
  onReady?: () => void;
}

export interface FlyingChessHandle {
  rooms: RoomManager;
  namespace: Namespace;
  health: () => { ok: boolean; service: "flying-chess"; rooms: number; players: number };
  close: () => void;
}

export const NAMESPACE = "/flying-chess";

type Ack = (result: { ok: boolean; error?: string; message?: string; roomCode?: string }) => void;

export function registerFlyingChess(
  app: Express,
  io: SocketServer,
  deps: FlyingChessDeps = {}
): FlyingChessHandle {
  const dataDir = deps.dataDir ?? defaultDataDir();
  const rooms = new RoomManager(dataDir);
  void rooms.start().catch((error) => {
    console.error("[flying-chess] could not start the room store; running without restored rooms", error);
  });

  const namespace = io.of(NAMESPACE);

  /**
   * 连接对应的账号。主服务在 `resolveAccount` 里用 `auth.verifyToken` 解析；
   * 没有有效 token 的连接在中间件阶段就被拒绝，这里不会凭空造游客身份。
   */
  const accountFor = (socket: Socket): FcAccount | null => {
    const cached = (socket.data as { fcAccount?: FcAccount }).fcAccount;
    if (cached) return cached;
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
    return deps.resolveAccount?.(token) ?? null;
  };

  // ---- 广播 ----

  /** 把房间完整快照发给房间内每个连接；每人的 `active` 字段按自己的连接计算。 */
  const broadcast = (room: Room): void => {
    try {
      // 只遍历这个房间里的人（socket.join 的 adapter room），不扫描整个 namespace，
      // 房间与连接数增长时单次广播仍是 O(房间人数)。
      const ids = namespace.adapter.rooms.get(room.code);
      if (!ids) return;
      for (const id of ids) {
        const socket = namespace.sockets.get(id);
        if (!socket) continue;
        const account = accountFor(socket);
        if (!account || !room.isMember(account.id)) continue;
        socket.emit("fc:state", room.publicState(account.id, socket.id));
      }
    } catch (error) {
      console.error(`[flying-chess] broadcast for ${room.code} failed`, error);
    }
  };
  rooms.onChange = broadcast;

  /** 大厅列表广播给所有在线连接，房间变动无需刷新。 */
  const broadcastRooms = (): void => {
    try {
      const list: FcRoomSummary[] = rooms.list();
      for (const socket of namespace.sockets.values()) socket.emit("fc:rooms", list);
    } catch (error) {
      console.error("[flying-chess] room list broadcast failed", error);
    }
  };

  // ---- 连接 ----

  namespace.use((socket, next) => {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
    const account = deps.resolveAccount?.(token) ?? null;
    if (!account) {
      next(new Error("AUTH_REQUIRED"));
      return;
    }
    (socket.data as { fcAccount?: FcAccount }).fcAccount = account;
    // 主服务的 presence/在线统计读取这个字段。
    (socket.data as { accountId?: string }).accountId = account.id;
    next();
  });

  namespace.on("connection", (socket: Socket) => {
    const account = accountFor(socket);
    if (!account) {
      socket.disconnect(true);
      return;
    }
    /** 这个连接当前所在的房间号；断开时据此标记对应座位离线。 */
    let currentCode: string | null = null;

    const fail = (error: unknown, ack?: Ack): void => {
      const code = error instanceof RoomError
        ? error.code
        : (error as { code?: string }).code ?? (error as { message?: string }).message ?? "INVALID_ACTION";
      const payload = { ok: false, error: code, message: messageFor(code) };
      if (ack) ack(payload);
      else socket.emit("fc:error", { code, message: payload.message });
    };

    const guard = <T extends unknown[]>(name: string, handler: (...args: T) => void): ((...args: T) => void) => {
      return (...args: T): void => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`[flying-chess] ${name} failed`, error);
          fail(error, typeof args[args.length - 1] === "function" ? (args[args.length - 1] as Ack) : undefined);
        }
      };
    };

    const roomOf = (): Room => {
      const room = currentCode ? rooms.get(currentCode) : undefined;
      if (!room) throw new RoomError("ROOM_NOT_FOUND");
      return room;
    };

    socket.on("fc:rooms:request", guard("rooms:request", () => {
      socket.emit("fc:rooms", rooms.list());
    }));

    socket.on("fc:create", guard("create", (payload: { maxPlayers?: number; sixOnly?: boolean }, ack?: Ack) => {
      const room = rooms.create(payload ?? {});
      socket.join(room.code);
      room.join(account, socket.id);
      currentCode = room.code;
      ack?.({ ok: true, roomCode: room.code });
      broadcastRooms();
    }));

    socket.on("fc:join", guard("join", (payload: { roomCode?: string; asSpectator?: boolean }, ack?: Ack) => {
      const room = rooms.get(String(payload?.roomCode ?? ""));
      if (!room) throw new RoomError("ROOM_NOT_FOUND");
      const seat = room.locate(account.id);
      socket.join(room.code);
      try {
        if (seat && !seat.watching) room.join(account, socket.id);
        else if (payload?.asSpectator && !room.isMember(account.id)) room.spectate(account, socket.id);
        else room.join(account, socket.id);
      } catch (error) {
        // 加入失败就不要留在这个 adapter room 里。
        socket.leave(room.code);
        throw error;
      }
      currentCode = room.code;
      ack?.({ ok: true, roomCode: room.code });
      broadcastRooms();
    }));

    socket.on("fc:leave", guard("leave", (ack?: Ack) => {
      const room = currentCode ? rooms.get(currentCode) : undefined;
      if (room) {
        const code = room.code;
        room.leave(account.id, socket.id);
        socket.leave(code);
        currentCode = null;
      }
      ack?.({ ok: true });
      broadcastRooms();
    }));

    socket.on("fc:config", guard("config", (payload: { maxPlayers?: number; sixOnly?: boolean }, ack?: Ack) => {
      const room = roomOf();
      room.configure(account.id, payload ?? {});
      ack?.({ ok: true });
      broadcastRooms();
    }));

    socket.on("fc:seats", guard("seats", (payload: { color?: string | null }, ack?: Ack) => {
      const room = roomOf();
      room.chooseColor(account.id, (payload?.color ?? null) as never);
      ack?.({ ok: true });
    }));

    socket.on("fc:ready", guard("ready", (payload: { ready?: boolean }, ack?: Ack) => {
      const room = roomOf();
      room.setReady(account.id, !!payload?.ready);
      ack?.({ ok: true });
      broadcastRooms();
    }));

    socket.on("fc:start", guard("start", (ack?: Ack) => {
      const room = roomOf();
      room.start(account.id);
      ack?.({ ok: true });
      broadcastRooms();
    }));

    socket.on("fc:roll", guard("roll", (ack?: Ack) => {
      const room = roomOf();
      room.roll(account.id, socket.id);
      ack?.({ ok: true });
    }));

    socket.on("fc:move", guard("move", (payload: { planeIndex?: number }, ack?: Ack) => {
      const room = roomOf();
      const planeIndex = Number(payload?.planeIndex);
      if (!Number.isInteger(planeIndex) || planeIndex < 0 || planeIndex > 3) throw new RoomError("INVALID_MOVE");
      room.move(account.id, planeIndex, socket.id);
      ack?.({ ok: true });
    }));

    socket.on("fc:bot", guard("bot", (payload: { color?: string; enabled?: boolean }, ack?: Ack) => {
      const room = roomOf();
      room.toggleBot(account.id, payload?.color as never, !!payload?.enabled);
      ack?.({ ok: true });
      broadcastRooms();
    }));

    /** 刷新/重连后回到原座位；必须是这个账号本来就坐着或看着的房间。 */
    socket.on("fc:rejoin", guard("rejoin", (payload: { roomCode?: string }, ack?: Ack) => {
      const room = rooms.get(String(payload?.roomCode ?? ""));
      if (!room) {
        ack?.({ ok: false, error: "ROOM_NOT_FOUND", message: messageFor("ROOM_NOT_FOUND") });
        return;
      }
      const where = room.locate(account.id);
      if (!where) {
        ack?.({ ok: false, error: "NOT_IN_ROOM", message: messageFor("NOT_IN_ROOM") });
        return;
      }
      socket.join(room.code);
      if (where.watching) room.spectate(account, socket.id);
      else room.join(account, socket.id);
      currentCode = room.code;
      ack?.({ ok: true, roomCode: room.code });
      broadcastRooms();
    }));

    socket.on("fc:health", guard("health", (ack?: Ack) => {
      ack?.({ ok: true });
    }));

    socket.on("disconnect", () => {
      try {
        const room = currentCode ? rooms.get(currentCode) : undefined;
        if (!room) return;
        // 断开只标记离线并开始宽限，不立刻丢座位。
        room.disconnect(account.id, socket.id);
        broadcastRooms();
      } catch (error) {
        console.error("[flying-chess] disconnect cleanup failed", error);
      }
    });

    // 新连接立刻拿到大厅列表，加入页不会是空的。
    socket.emit("fc:rooms", rooms.list());
  });

  // ---- HTTP ----

  app.get("/api/flying-chess/health", (_request: Request, response: Response) => {
    response.json(handle.health());
  });

  app.get("/api/flying-chess/rooms", (_request: Request, response: Response) => {
    response.json({ ok: true, rooms: rooms.list() });
  });

  const handle: FlyingChessHandle = {
    rooms,
    namespace,
    health: () => ({
      ok: true,
      service: "flying-chess",
      rooms: rooms.size,
      players: rooms.playerCount
    }),
    close: () => {
      rooms.dispose();
      namespace.removeAllListeners();
    }
  };

  deps.onReady?.();
  return handle;
}

function defaultDataDir(): string {
  const env = process.env.FLYING_CHESS_DATA_DIR;
  if (env) return env;
  const here = new URL(".", import.meta.url).pathname;
  return new URL("../data/flying-chess", `file://${here}`).pathname;
}

/** 错误码的中文兜底；客户端有自己的文案表。 */
export function messageFor(code: string): string {
  switch (code as FcErrorCode) {
    case "ROOM_NOT_FOUND": return "房间不存在，或已经结束。";
    case "ROOM_FULL": return "房间已满。";
    case "ROOM_LIMIT": return "服务器上的房间太多，请稍后再试。";
    case "NOT_IN_ROOM": return "你不在这个房间里。";
    case "GAME_STARTED": return "对局已经开始。";
    case "NOT_STARTED": return "对局还没有开始。";
    case "NOT_HOST": return "只有房主可以这样做。";
    case "NOT_YOUR_TURN": return "还没轮到你。";
    case "NOT_NOW": return "现在不能这样做。";
    case "NOT_YET": return "骰子还在转，稍等一下。";
    case "INVALID_MOVE": return "这一步不合法。";
    case "COLOR_TAKEN": return "这个阵营色已经被占了。";
    case "READ_ONLY": return "另一个标签页正在操作，这个页面只能观看。";
    default: return "操作未被接受。";
  }
}

export type { FcAccount, FcPublicState, FcRoomSummary };
