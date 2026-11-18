/**
 * The room table: creating, finding and reaping rooms, and the one timer that drives every game's clock.
 *
 * One interval serves every room rather than one timer per room. With at most `MAX_ROOMS` rooms and a one-second tick that
 * is a single cheap loop, where per-room timers would be dozens of objects to create, track and (the usual bug) forget to
 * clear. Everything the ticker touches is wrapped, so one broken room cannot stop the loop for the others.
 */

import { Room } from "./room.ts";
import { Persistence, type StoredRoom } from "./persist.ts";
import type { RoomSummary } from "../shared/protocol.ts";

/** A hard cap on concurrent rooms: a runaway client must not be able to allocate the server's memory. */
export const MAX_ROOMS = 200;

/** How long an empty room lingers before it is reaped, so a brief disconnect does not destroy the table. */
const ABANDON_GRACE_MS = 5 * 60_000;

/** How often the clock ticks. One second is the resolution of every timer the rules mention. */
const TICK_MS = 1_000;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly abandonedSince = new Map<string, number>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private readonly persistence: Persistence;
  /** Called when a room's state changes, so the namespace can broadcast. */
  onChange: (room: Room) => void = () => {};
  /** Called when a room's game ends, for logging. */
  onEnd: (room: Room) => void = () => {};

  constructor(dataDir: string) {
    this.persistence = new Persistence(dataDir);
  }

  /** Restores saved rooms, then starts the clock. Failure to read saves never stops the server. */
  async start(): Promise<void> {
    await this.persistence.init();
    const saved = await this.persistence.loadAll();
    for (const stored of saved) {
      try {
        const room = new Room({
          code: stored.code,
          maxPlayers: stored.maxPlayers,
          allowSpectators: stored.allowSpectators,
          config: stored.config as never
        });
        // Put the seats back first, then adopt the game, so players keep their identity across a restart.
        for (const seat of stored.seats) {
          room.join({ id: seat.id, username: seat.username, avatarUrl: seat.avatarUrl });
          room.disconnect(seat.id);
        }
        if (stored.hostId) (room as unknown as { hostId: string }).hostId = stored.hostId;
        if (stored.game) room.adopt(stored.game);
        this.rooms.set(room.code, room);
      } catch (error) {
        console.error(`[monopoly] could not restore room ${stored.code}`, error);
      }
    }
    if (this.rooms.size) console.log(`[monopoly] restored ${this.rooms.size} room(s) from disk`);
    this.ticker = setInterval(() => this.tick(), TICK_MS);
  }

  /** One pass of the clock: every room's auction deadline and time limit. */
  private tick(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      try {
        // The clock can end an auction or the whole game with nobody pressing anything, so a change here is broadcast
        // and saved exactly like an action would be: otherwise the table would sit on a stale deadline forever.
        const wasOver = room.phase === "over";
        const auctionSettled = room.tickAuction();
        const tradeExpired = room.tickTrade();
        const clockEnded = room.tickClock();
        if (auctionSettled || tradeExpired || clockEnded) {
          this.onChange(room);
          this.persist(room);
        }
        // Reported once, on the tick the game actually ended, not every second after.
        if (room.phase === "over" && !wasOver) this.onEnd(room);
        // Reap rooms nobody is in, after the grace period, so a reconnect can still find them.
        if (room.isAbandoned) {
          const since = this.abandonedSince.get(room.code) ?? now;
          this.abandonedSince.set(room.code, since);
          if (now - since > ABANDON_GRACE_MS) this.destroy(room.code);
        } else {
          this.abandonedSince.delete(room.code);
        }
      } catch (error) {
        // One bad room must not stop the clock for the rest of the table.
        console.error(`[monopoly] room ${room.code} failed a tick`, error);
      }
    }
  }

  /** Creates a room with a code that is not already in use. */
  create(options: { maxPlayers?: number; allowSpectators?: boolean }): Room {
    if (this.rooms.size >= MAX_ROOMS) throw new Error("ROOM_LIMIT");
    let code = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      code = randomCode();
      if (!this.rooms.has(code)) break;
      code = "";
    }
    if (!code) throw new Error("ROOM_LIMIT");
    const room = new Room({
      code,
      maxPlayers: options.maxPlayers ?? 4,
      allowSpectators: options.allowSpectators ?? true
    });
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Removes a room and forgets anything on disk for it. */
  destroy(code: string): void {
    this.rooms.delete(code);
    this.abandonedSince.delete(code);
    void this.persistence.remove(code);
  }

  /** Writes a room to disk. Called after a change; the persistence layer throttles it. */
  persist(room: Room): void {
    const stored: StoredRoom = {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      savedAt: Date.now(),
      maxPlayers: room.stateFor("").config.maxPlayers,
      allowSpectators: room.stateFor("").config.allowSpectators,
      config: room.stateFor("").config as unknown as Record<string, unknown>,
      seats: room.playerList().map((player) => ({ id: player.id, username: player.username, avatarUrl: player.avatarUrl })),
      game: room.game
    };
    this.persistence.save(stored);
  }

  /** Every room that should appear in the lobby list: open tables and games in progress. */
  list(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((room) => room.phase !== "over")
      .map((room) => room.summary());
  }

  /** Where an account is, for the friends list: seated, watching, or nowhere. */
  locate(accountId: string): { game: "monopoly"; roomCode: string; watching: boolean } | null {
    for (const room of this.rooms.values()) {
      if (room.phase === "over") continue;
      if (room.playerList().some((player) => player.id === accountId)) {
        return { game: "monopoly", roomCode: room.code, watching: false };
      }
      if (room.stateFor(accountId).spectators.some((spectator) => spectator.id === accountId)) {
        return { game: "monopoly", roomCode: room.code, watching: true };
      }
    }
    return null;
  }

  /** Stops the clock and flushes timers, for a clean shutdown. */
  dispose(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.persistence.dispose();
  }

  get size(): number {
    return this.rooms.size;
  }
}

/** A four-letter room code, from an alphabet with no look-alike characters, so it can be read aloud. */
function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
