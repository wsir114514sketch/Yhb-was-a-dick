/**
 * 房间表：创建、查找、回收房间，以及一个统一的回收时钟。
 *
 * 房间自己的掷骰/托管定时器在 `room.ts`；这里只负责"没人了的房间"——等待室 5 分钟、
 * 对局中所有人断线也按同一宽限回收，避免进程里堆着永远不会有人回来的桌子。
 */

import { Room } from "./room.ts";
import { Persistence } from "./persist.ts";
import type { FcRoomSummary } from "../shared/protocol.ts";

/** 同时存在的房间上限：失控客户端不能一直申请内存。 */
export const MAX_ROOMS = 200;

/** 没人在线的房间保留多久，给刷新/断线重连留出时间。 */
const ABANDON_GRACE_MS = 5 * 60_000;

const TICK_MS = 5_000;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly abandonedSince = new Map<string, number>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private readonly persistence: Persistence;
  /** 房间状态变化时调用，由 namespace 广播并落盘。 */
  onChange: (room: Room) => void = () => {};

  constructor(dataDir: string) {
    this.persistence = new Persistence(dataDir);
  }

  /** 恢复落盘房间，然后启动回收时钟。读盘失败不阻止服务启动。 */
  async start(): Promise<void> {
    await this.persistence.init();
    const saved = await this.persistence.loadAll();
    for (const stored of saved) {
      try {
        const room = new Room({
          code: stored.code,
          maxPlayers: stored.maxPlayers,
          sixOnly: stored.sixOnly
        });
        room.adopt(stored);
        this.wire(room);
        this.rooms.set(room.code, room);
      } catch (error) {
        console.error(`[flying-chess] could not restore room ${stored.code}`, error);
      }
    }
    if (this.rooms.size) console.log(`[flying-chess] restored ${this.rooms.size} room(s) from disk`);
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    (this.ticker as { unref?: () => void }).unref?.();
  }

  private wire(room: Room): void {
    room.onChange = (changed) => {
      this.onChange(changed);
      this.persist(changed);
    };
    room.onEmpty = (code) => this.destroy(code);
  }

  private tick(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      try {
        if (room.isAbandoned) {
          const since = this.abandonedSince.get(room.code) ?? now;
          this.abandonedSince.set(room.code, since);
          if (now - since > ABANDON_GRACE_MS) this.destroy(room.code);
        } else {
          this.abandonedSince.delete(room.code);
        }
      } catch (error) {
        console.error(`[flying-chess] room ${room.code} failed a tick`, error);
      }
    }
  }

  create(options: { maxPlayers?: number; sixOnly?: boolean }): Room {
    if (this.rooms.size >= MAX_ROOMS) throw new Error("ROOM_LIMIT");
    let code = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = randomCode();
      if (!this.rooms.has(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error("ROOM_LIMIT");
    const room = new Room({
      code,
      maxPlayers: options.maxPlayers ?? 4,
      sixOnly: options.sixOnly ?? false
    });
    this.wire(room);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  destroy(code: string): void {
    const room = this.rooms.get(code);
    if (room) room.dispose();
    this.rooms.delete(code);
    this.abandonedSince.delete(code);
    void this.persistence.remove(code);
  }

  persist(room: Room): void {
    this.persistence.save(room.serialize());
  }

  /** 大厅列表：等待室与进行中的对局。 */
  list(): FcRoomSummary[] {
    return [...this.rooms.values()]
      .filter((room) => room.phase !== "over")
      .map((room) => room.summary());
  }

  /** 好友列表用：某人在这款游戏的哪个房间，坐着还是观战。 */
  locate(accountId: string): { game: "flying-chess"; roomCode: string; watching: boolean } | null {
    for (const room of this.rooms.values()) {
      const where = room.locate(accountId);
      if (where) return where;
    }
    return null;
  }

  isMember(code: string, accountId: string): boolean {
    return this.get(code)?.isMember(accountId) ?? false;
  }

  dispose(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    for (const room of this.rooms.values()) room.dispose();
    this.persistence.dispose();
  }

  get size(): number {
    return this.rooms.size;
  }

  get playerCount(): number {
    return this.list().reduce((sum, room) => sum + room.players, 0);
  }
}

/** 4 位房间号，避开易混淆字符，与现有游戏一致。 */
function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
