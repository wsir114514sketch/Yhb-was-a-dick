/**
 * 房间落盘：进程重启后恢复未完成的对局。
 *
 * 持久化永远不能把游戏弄坏：写失败只记日志，节流写入避免忙桌反复打盘。
 * 丢一局是丢一局；因为写不了盘而让服务器倒下，是丢所有局。
 */

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StoredFlyingChessRoom } from "./room.ts";

/** 同一房间最短写盘间隔。 */
const WRITE_INTERVAL_MS = 4_000;

export class Persistence {
  private readonly dir: string;
  private readonly lastWrite = new Map<string, number>();
  private readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private disabled = false;

  constructor(dir: string) {
    this.dir = dir;
  }

  async init(): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
    } catch (error) {
      console.error(`[flying-chess] persistence disabled: cannot create ${this.dir}`, error);
      this.disabled = true;
    }
  }

  private fileFor(code: string): string {
    const safe = code.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
    return path.join(this.dir, `${safe}.json`);
  }

  save(room: StoredFlyingChessRoom): void {
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
    else {
      const timer = setTimeout(write, wait);
      (timer as { unref?: () => void }).unref?.();
      this.pendingTimers.set(room.code, timer);
    }
  }

  private async writeNow(room: StoredFlyingChessRoom): Promise<void> {
    const file = this.fileFor(room.code);
    const temp = `${file}.tmp`;
    try {
      // 先写旁边再改名，写到一半崩溃也不会留下半个房间。
      await writeFile(temp, JSON.stringify(room), "utf8");
      await rename(temp, file);
    } catch (error) {
      console.error(`[flying-chess] failed to save room ${room.code}`, error);
    }
  }

  async remove(code: string): Promise<void> {
    if (this.disabled) return;
    const timer = this.pendingTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimers.delete(code);
    }
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(this.fileFor(code));
    } catch {
      // 已经不在了，正是想要的结果。
    }
  }

  async loadAll(): Promise<StoredFlyingChessRoom[]> {
    if (this.disabled) return [];
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const rooms: StoredFlyingChessRoom[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await readFile(path.join(this.dir, name), "utf8");
        const parsed = JSON.parse(raw) as StoredFlyingChessRoom;
        if (parsed && typeof parsed.code === "string") rooms.push(parsed);
      } catch (error) {
        console.error(`[flying-chess] skipping unreadable save ${name}`, error);
      }
    }
    return rooms;
  }

  dispose(): void {
    for (const timer of this.pendingTimers.values()) clearTimeout(timer);
    this.pendingTimers.clear();
  }
}
