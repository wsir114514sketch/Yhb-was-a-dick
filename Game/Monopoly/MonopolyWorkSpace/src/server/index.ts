/**
 * The Monopoly module: `registerMonopoly(app, io, deps)`.
 *
 * It owns its own Socket.IO namespace and its own HTTP routes, and touches nothing else. That is what lets it run as a
 * separate process beside the existing games without either side reaching into the other — the plan's isolation
 * requirement, made structural rather than a promise.
 *
 * Every socket handler and every timer callback is wrapped: a bug in a room may disconnect that room and log, but it may
 * never take down the process serving everything else.
 */

import type { Express, Request, Response } from "express";
import type { Namespace, Server as SocketServer, Socket } from "socket.io";
import { Room, RoomError } from "./room.ts";
import { RoomManager } from "./rooms.ts";
import type { MonopolyAction, MonopolyError, RoomConfig } from "../shared/protocol.ts";

export interface MonopolyDeps {
  /** Reads the account for a connection token, or null for a guest. Injected so this module never touches accounts.json. */
  resolveAccount?: (token: string | undefined) => { id: string; username: string; avatarUrl?: string | null } | null;
  /** Where room state is written. Defaults to `server/data/monopoly`, matching the plan's data-directory convention. */
  dataDir?: string;
  /** Called when the module is ready, e.g. to register a health check summary. */
  onReady?: () => void;
}

/** What this module exposes back to whatever hosts it. */
export interface MonopolyHandle {
  rooms: RoomManager;
  namespace: Namespace;
  health: () => { ok: boolean; service: "monopoly"; rooms: number; players: number };
  close: () => void;
}

/** The namespace name, from the plan's convention: one `/socket.io` transport, one namespace per game. */
export const NAMESPACE = "/monopoly";

/**
 * Registers the module. `app` serves the HTTP routes, `io` is the shared Socket.IO server (the namespace is created here),
 * and `deps` carries anything the host wants to inject.
 */
export function registerMonopoly(
  app: Express,
  io: SocketServer,
  deps: MonopolyDeps = {}
): MonopolyHandle {
  const dataDir = deps.dataDir ?? defaultDataDir();
  const rooms = new RoomManager(dataDir);
  // Restoring saved rooms is disk work; it runs in the background so the host's startup (which is synchronous for every
  // other game) does not have to become async just for this module. Until it finishes the lobby is simply empty.
  void rooms.start().catch((error) => {
    console.error("[monopoly] could not start the room store; running without restored rooms", error);
  });

  const namespace = io.of(NAMESPACE);

  /**
   * The account behind a socket. The host resolves it from the connection token, so a reconnect — and a page reload — is
   * the same player again. The local map is only a fallback for a host that injects no resolver; a guest identity is
   * never minted here, because the host is expected to refuse an unauthenticated connection before it gets this far.
   */
  const accountFor = (socket: Socket): { id: string; username: string; avatarUrl?: string | null } => {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
    return deps.resolveAccount?.(token) ?? { id: `guest-${socket.id}`, username: "游客", avatarUrl: null };
  };

  // ---- Broadcasting ----

  /** Sends the current state of a room to everyone in it. Each player gets the same object. */
  const broadcast = (room: RoomManager extends never ? never : import("./room.ts").Room): void => {
    try {
      const sockets = namespace.sockets;
      for (const socket of sockets.values()) {
        const account = accountFor(socket);
        if (!isInRoom(room, account.id)) continue;
        socket.emit("monopoly:state", room.stateFor(account.id));
      }
    } catch (error) {
      console.error(`[monopoly] broadcast for ${room.code} failed`, error);
    }
  };
  rooms.onChange = broadcast;

  /** True when the account holds a seat or is watching this room. */
  const isInRoom = (room: { stateFor: (id: string) => { players: { id: string }[]; spectators: { id: string }[] } }, accountId: string): boolean => {
    const state = room.stateFor(accountId);
    return state.players.some((player) => player.id === accountId)
      || state.spectators.some((spectator) => spectator.id === accountId);
  };

  /** Sends the lobby list to every connected socket, so open tables appear without a refresh. */
  const broadcastRooms = (): void => {
    try {
      const list = rooms.list();
      for (const socket of namespace.sockets.values()) socket.emit("monopoly:rooms", list);
    } catch (error) {
      console.error("[monopoly] room list broadcast failed", error);
    }
  };

  // ---- Socket handlers ----

  namespace.on("connection", (socket: Socket) => {
    const account = accountFor(socket);
    // Each socket remembers which room it is in, so a disconnect knows what to mark offline.
    let currentCode: string | null = null;

    const fail = (error: unknown, ack?: (result: { ok: boolean; error?: string; message?: string }) => void): void => {
      const code = error instanceof RoomError ? error.code : (error as { code?: string }).code ?? "INVALID_ACTION";
      // A rule refusal and a room refusal are reported the same way: a code the client turns into a message.
      if (ack) ack({ ok: false, error: code, message: messageFor(code) });
      else socket.emit("monopoly:error", { message: messageFor(code) });
    };

    /** Wraps a handler so one bad message cannot kill the connection or the process. */
    const guard = <T extends unknown[]>(name: string, handler: (...args: T) => void): ((...args: T) => void) => {
      return (...args: T): void => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`[monopoly] ${name} failed`, error);
          fail(error);
        }
      };
    };

    const syncRoom = (room: import("./room.ts").Room): void => {
      currentCode = room.code;
      broadcast(room);
      broadcastRooms();
      rooms.persist(room);
    };

    socket.on("monopoly:rooms:request", guard("rooms:request", () => {
      socket.emit("monopoly:rooms", rooms.list());
    }));

    socket.on("monopoly:create", guard("create", (payload: { maxPlayers?: number; allowSpectators?: boolean }, ack?: (r: unknown) => void) => {
      const room = rooms.create(payload ?? {});
      room.join(account);
      socket.join(room.code);
      currentCode = room.code;
      ack?.({ ok: true, roomCode: room.code });
      syncRoom(room);
    }));

    socket.on("monopoly:join", guard("join", (payload: { roomCode: string; asSpectator?: boolean }, ack?: (r: unknown) => void) => {
      const room = rooms.get(String(payload?.roomCode ?? ""));
      if (!room) throw new RoomError("ROOM_NOT_FOUND");
      if (payload?.asSpectator) room.spectate(account);
      else room.join(account);
      socket.join(room.code);
      currentCode = room.code;
      ack?.({ ok: true, roomCode: room.code });
      syncRoom(room);
    }));

    socket.on("monopoly:leave", guard("leave", (ack?: (r: unknown) => void) => {
      const room = currentCode ? rooms.get(currentCode) : undefined;
      if (room) {
        room.leave(account.id);
        socket.leave(room.code);
        if (room.isAbandoned) rooms.destroy(room.code);
        else { broadcast(room); rooms.persist(room); }
        currentCode = null;
      }
      ack?.({ ok: true });
      broadcastRooms();
    }));

    socket.on("monopoly:config", guard("config", (payload: Partial<RoomConfig>, ack?: (r: unknown) => void) => {
      const room = currentCode ? rooms.get(currentCode) : undefined;
      if (!room) throw new RoomError("ROOM_NOT_FOUND");
      room.configure(account.id, payload ?? {});
      ack?.({ ok: true });
      syncRoom(room);
    }));

    socket.on("monopoly:ready", guard("ready", (payload: { ready: boolean }, ack?: (r: unknown) => void) => {
      const room = currentCode ? rooms.get(currentCode) : undefined;
      if (!room) throw new RoomError("ROOM_NOT_FOUND");
      room.setReady(account.id, !!payload?.ready);
      ack?.({ ok: true });
      syncRoom(room);
    }));

    socket.on("monopoly:start", guard("start", (ack?: (r: unknown) => void) => {
      const room = currentCode ? rooms.get(currentCode) : undefined;
      if (!room) throw new RoomError("ROOM_NOT_FOUND");
      room.start(account.id);
      ack?.({ ok: true });
      syncRoom(room);
    }));

    socket.on("monopoly:action", guard("action", (action: MonopolyAction, ack?: (r: unknown) => void) => {
      const room = currentCode ? rooms.get(currentCode) : undefined;
      if (!room) throw new RoomError("ROOM_NOT_FOUND");
      room.act(account.id, action);
      ack?.({ ok: true });
      syncRoom(room);
    }));

    socket.on("monopoly:reset", guard("reset", (ack?: (r: unknown) => void) => {
      const room = currentCode ? rooms.get(currentCode) : undefined;
      if (!room) throw new RoomError("ROOM_NOT_FOUND");
      room.reset();
      ack?.({ ok: true });
      syncRoom(room);
    }));

    socket.on("monopoly:health", guard("health", (ack?: (r: unknown) => void) => {
      ack?.({ ok: true, rooms: rooms.size });
    }));

    /** A reconnecting tab asks for the room it was in; the ack says whether it is still there. */
    socket.on("monopoly:rejoin", guard("rejoin", (payload: { roomCode?: string }, ack?: (r: unknown) => void) => {
      const room = rooms.get(String(payload?.roomCode ?? ""));
      if (!room) { ack?.({ ok: false, error: "ROOM_NOT_FOUND" }); return; }
      // Only ever back into a room this account actually sits in (or watches); a stranger is refused, not seated.
      const seat = room.playerList().find((player) => player.id === account.id);
      const watching = room.stateFor(account.id).spectators.some((spectator) => spectator.id === account.id);
      if (!seat && !watching) { ack?.({ ok: false, error: "NOT_IN_ROOM" }); return; }
      socket.join(room.code);
      currentCode = room.code;
      if (seat) room.join(account); else room.spectate(account);
      ack?.({ ok: true, roomCode: room.code });
      broadcast(room);
      broadcastRooms();
    }));

    socket.on("disconnect", () => {
      try {
        const room = currentCode ? rooms.get(currentCode) : undefined;
        if (!room) return;
        // A disconnect only marks the player offline: their seat and game stay for the reconnect grace period.
        room.disconnect(account.id);
        broadcast(room);
        broadcastRooms();
      } catch (error) {
        console.error("[monopoly] disconnect cleanup failed", error);
      }
    });

    // A fresh socket gets the current lobby list immediately, so the join screen is never empty.
    socket.emit("monopoly:rooms", rooms.list());
  });

  // ---- HTTP routes ----

  /** `GET /api/monopoly/health` — this module's own health, summarised into the host's `/api/health`. */
  app.get("/api/monopoly/health", (_request: Request, response: Response) => {
    response.json(handle.health());
  });

  /** `GET /api/monopoly/rooms` — the lobby list, for a client that would rather poll than hold a socket open. */
  app.get("/api/monopoly/rooms", (_request: Request, response: Response) => {
    response.json({ ok: true, rooms: rooms.list() });
  });

  const handle: MonopolyHandle = {
    rooms,
    namespace,
    health: () => ({
      ok: true,
      service: "monopoly",
      rooms: rooms.size,
      players: [...Array(rooms.size).keys()].length === 0 ? 0 : rooms.list().reduce((sum, room) => sum + room.players, 0)
    }),
    close: () => {
      rooms.dispose();
      namespace.removeAllListeners();
    }
  };

  deps.onReady?.();
  return handle;
}

/** The plan's data-directory convention: `server/data/<game-id>/`. */
function defaultDataDir(): string {
  const env = process.env.MONOPOLY_DATA_DIR;
  if (env) return env;
  // Resolved from this file, so it works whatever the process's working directory is.
  const here = new URL(".", import.meta.url).pathname;
  return new URL("../data/monopoly", `file://${here}`).pathname;
}

/** A human message for an error code; the client has its own table, this is the server-side fallback. */
function messageFor(code: string): string {
  switch (code) {
    case "ROOM_FULL": return "房间已满。";
    case "ROOM_NOT_FOUND": return "房间不存在。";
    case "NOT_IN_ROOM": return "你不在这个房间里。";
    case "GAME_STARTED": return "对局已经开始。";
    case "NOT_HOST": return "只有房主可以这样做。";
    case "ROOM_LIMIT": return "房间数量已达上限。";
    default: return "操作未被接受。";
  }
}

export type { MonopolyAction, MonopolyError, RoomConfig };
