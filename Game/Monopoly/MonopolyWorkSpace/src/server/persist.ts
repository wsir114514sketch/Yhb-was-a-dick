/**
 * Room state on disk, so a restart does not lose a game that is in progress.
 *
 * The rule the plan sets is that persistence must never be able to break a game: a failed write is logged and ignored, and
 * writes are throttled so a busy table cannot hammer the disk. A game that is lost to a crash is a game; a server that
 * dies because a room could not be written is every game.
 */

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MonopolyGame } from "../shared/protocol.ts";

/** What is stored for one room: enough to put the table back, and nothing more. */
export interface StoredRoom {
  code: string;
  hostId: string;
  phase: "lobby" | "playing" | "over";
  savedAt: number;
  maxPlayers: number;
  allowSpectators: boolean;
  config: Record<string, unknown>;
  seats: { id: string; username: string; avatarUrl: string | null }[];
  game: MonopolyGame | null;
}

/** How often a room may write, at most. A turn is not worth a disk write per keystroke. */
const WRITE_INTERVAL_MS = 5_000;

export class Persistence {
  private readonly dir: string;
  private readonly lastWrite = new Map<string, number>();
  private readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Set when the directory cannot be created, so the game keeps running without persistence rather than failing to start. */
  private disabled = false;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** Creates the directory once at startup. Failure is logged and persistence is switched off, not thrown. */
  async init(): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
    } catch (error) {
      console.error(`[monopoly] persistence disabled: cannot create ${this.dir}`, error);
      this.disabled = true;
    }
  }

  private fileFor(code: string): string {
    // Room codes are generated server-side from a safe alphabet, but the path is built defensively anyway.
    const safe = code.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
    return path.join(this.dir, `${safe}.json`);
  }

  /**
   * Queues a save. The first write for a room goes out at once; later ones are coalesced into one write every
   * `WRITE_INTERVAL_MS`, so a room that changes ten times a second still touches the disk twice a second at most.
   */
  save(room: StoredRoom): void {
    if (this.disabled) return;
    const now = Date.now();
    const last = this.lastWrite.get(room.code) ?? 0;
    const wait = WRITE_INTERVAL_MS - (now - last);
    const existing = this.pendingTimers.get(room.code);
    if (existing) clearTimeout(existing);
    const write = (): void => {
      this.pendingTimers.delete(room.code);
      this.lastWrite.set(room.code, Date.now());
      void this.writeNow(room);
    };
    if (wait <= 0) write();
    else this.pendingTimers.set(room.code, setTimeout(write, wait));
  }

  private async writeNow(room: StoredRoom): Promise<void> {
    const file = this.fileFor(room.code);
    const temp = `${file}.tmp`;
    try {
      // Write beside the target and rename, so a crash mid-write cannot leave a half-written room on disk.
      await writeFile(temp, JSON.stringify(room), "utf8");
      await rename(temp, file);
    } catch (error) {
      // Persistence is a convenience; it must never surface as a game error.
      console.error(`[monopoly] failed to save room ${room.code}`, error);
    }
  }

  /** Removes a room's file, when it is finally gone. */
  async remove(code: string): Promise<void> {
    if (this.disabled) return;
    const timer = this.pendingTimers.get(code);
    if (timer) { clearTimeout(timer); this.pendingTimers.delete(code); }
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(this.fileFor(code));
    } catch {
      // Already gone, which is the desired end state.
    }
  }

  /** Reads every saved room at startup. A corrupt file is skipped and reported, never fatal. */
  async loadAll(): Promise<StoredRoom[]> {
    if (this.disabled) return [];
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const rooms: StoredRoom[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await readFile(path.join(this.dir, name), "utf8");
        const parsed = JSON.parse(raw) as StoredRoom;
        if (parsed && typeof parsed.code === "string") rooms.push(parsed);
      } catch (error) {
        console.error(`[monopoly] skipping unreadable save ${name}`, error);
      }
    }
    return rooms;
  }

  /** Clears all pending timers, for a clean shutdown. */
  dispose(): void {
    for (const timer of this.pendingTimers.values()) clearTimeout(timer);
    this.pendingTimers.clear();
  }
}
