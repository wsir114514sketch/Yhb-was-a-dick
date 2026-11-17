/**
 * 每日挑战：同一天的单机局用同一个随机种子，牌堆顺序、电脑的骰子与决策都一样，只取决于你自己的操作。
 * 只做离线单机，不改协议。成绩（当天最高净资产）存在 localStorage。
 */

export function todayKey(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** FNV-1a 哈希 + mulberry32：小、快、可复现。 */
export function seededRandom(key: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const bestKey = (day: string): string => `monopoly.daily.${day}`;

export function dailyBest(day = todayKey()): number | null {
  try {
    const value = localStorage.getItem(bestKey(day));
    return value === null ? null : Number(value);
  } catch { return null; }
}

export function recordDaily(netWorth: number, day = todayKey()): void {
  const best = dailyBest(day);
  if (best !== null && best >= netWorth) return;
  try { localStorage.setItem(bestKey(day), String(Math.round(netWorth))); } catch { /* 隐私模式：不记录 */ }
}
