/**
 * 成就徽章：只存在这台设备的 localStorage 里，不进协议，也不影响对局。
 */

import { REGIONS, REGION_PROPERTIES } from "../shared/board.ts";
import type { MonopolyGame } from "../shared/protocol.ts";
import { standingsOf } from "../shared/rules.ts";

export interface Achievement { id: string; name: string; text: string }

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "first-monopoly", name: "首次垄断", text: "集齐一整个区域的地产" },
  { id: "first-auction", name: "首次拍卖中标", text: "在拍卖中拍下一块地" },
  { id: "net-5000", name: "净资产破 5000", text: "净资产达到 $5,000" }
];

const KEY = "monopoly.achievements";

export function unlockedAchievements(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>; } catch { return {}; }
}

/** 检查这一帧有没有新解锁的成就；新解锁的写入存储并返回。 */
export function checkAchievements(game: MonopolyGame, meId: string): Achievement[] {
  const have = unlockedAchievements();
  const fresh: Achievement[] = [];
  const hit = (id: string, condition: () => boolean): void => {
    if (have[id] || !condition()) return;
    have[id] = Date.now();
    const found = ACHIEVEMENTS.find((entry) => entry.id === id);
    if (found) fresh.push(found);
  };
  hit("first-monopoly", () => REGIONS.some((region) => {
    const members = REGION_PROPERTIES[region.id] ?? [];
    return members.length > 0 && members.every((member) => game.ownership.find((entry) => entry.tile === member.index)?.ownerId === meId);
  }));
  hit("first-auction", () => game.log.some((entry) => entry.kind === "auction" && entry.actorId === meId && (entry.amount ?? 0) < 0));
  hit("net-5000", () => (standingsOf(game).find((entry) => entry.playerId === meId)?.netWorth ?? 0) >= 5000);
  if (fresh.length) {
    try { localStorage.setItem(KEY, JSON.stringify(have)); } catch { /* 隐私模式：不记录 */ }
  }
  return fresh;
}
