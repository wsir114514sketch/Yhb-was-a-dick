/**
 * 把服务器时钟换算成这一帧该显示的时间。
 *
 * 服务器每 30 秒广播一次时钟，客户端只在这个广播之间做"显示用"的推算：从收到状态的那一刻起，按现实时间补上已经
 * 走过的半小时。这样倒计时是连续的，但时间本身仍以服务器为准；暂停时完全不推算。
 */

import type { MonopolyGame } from "../../shared/protocol.ts";
import { rulesOf } from "../../shared/rules.ts";

export interface ProjectedClock {
  /** 游戏第几天，0 起。 */
  day: number;
  /** 当天分钟数。 */
  minute: number;
  paused: boolean;
  /** 距离下一个整点的毫秒数，用于倒计时。 */
  msToNextHour: number;
}

export function projectClock(game: MonopolyGame, receivedAt: number, now: number): ProjectedClock {
  const clock = game.clock;
  const stepMs = Math.max(1, rulesOf(game).clockHalfHourSeconds) * 1000;
  const elapsed = clock.paused ? 0 : Math.max(0, now - receivedAt);
  const steps = Math.floor(elapsed / stepMs);
  const total = clock.minute + steps * 30;
  const day = clock.day + Math.floor(total / 1440);
  const minute = ((total % 1440) + 1440) % 1440;
  const intoHour = minute % 60;
  const stepsToHour = intoHour === 0 ? 2 : 1;
  const msToNextHour = Math.max(0, stepMs - (elapsed % stepMs)) + (stepsToHour - 1) * stepMs;
  return { day, minute, paused: clock.paused, msToNextHour };
}

/** 倒计时格式，最大一小时：`00:29`。 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
