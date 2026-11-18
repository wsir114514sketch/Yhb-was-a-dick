/**
 * 游戏时钟：08:00 开局，现实 30 秒走半个游戏小时，一个游戏日 24 分钟。
 *
 * 时间只由服务器推进：这里的函数拿到 `now` 才动，从不自己起定时器。时钟跨过 00:00 时同时结算一次银行贷款利息，
 * 并记下结算的游戏日，因此重启、重连或一次处理多个半小时都不会重复计息。
 *
 * 客户端只读 `clock` 显示，不调用这里的推进函数。
 */

import { settleDailyInterest } from "./bank.ts";
import type { MonopolyGame } from "./protocol.ts";
import { pushLog, rulesOf } from "./rules.ts";

/** 游戏里一小时是 60 分钟，时钟每次走半小时。 */
const STEP_MINUTES = 30;

/** 一次推进最多处理的半小时数；正常每秒调用一次，这只是防止异常参数把服务器卡死的保险。 */
const MAX_STEPS = 240;

/**
 * 把时钟推进到 `now`。返回是否真的推进过——房间据此决定广播和落盘。
 *
 * - 暂停或对局结束时不动。
 * - 现实时间只按完整的半小时步长消费；不足一步的余量留到下一次，剩余偏差永远小于 30 秒。
 * - 每跨过一次 00:00 结算当天利息，一天一次，不会因为一次调用跨了多天而漏掉任何一天。
 */
export function advanceGameClock(game: MonopolyGame, now: number): boolean {
  if (game.winner) return false;
  const clock = game.clock;
  if (clock.paused) { clock.anchorAt = now; return false; }
  // 时钟被拨回或时间源异常时不倒退，只把锚点跟到当前时刻。
  if (now < clock.anchorAt) { clock.anchorAt = now; return false; }
  const stepMs = Math.max(1, rulesOf(game).clockHalfHourSeconds) * 1000;
  let steps = Math.floor((now - clock.anchorAt) / stepMs);
  if (steps <= 0) return false;
  if (steps > MAX_STEPS) {
    // 极端停顿（比如进程被挂起）：只补最近的部分，更早的时间算作停机，不计入游戏。
    clock.anchorAt += (steps - MAX_STEPS) * stepMs;
    steps = MAX_STEPS;
  }
  for (let step = 0; step < steps; step += 1) {
    clock.anchorAt += stepMs;
    clock.minute += STEP_MINUTES;
    if (clock.minute >= 1440) {
      clock.minute = 0;
      clock.day += 1;
      settleDailyInterest(game, clock.day);
    }
  }
  return true;
}

/** 暂停 / 恢复。暂停时先把已经走完的半小时结清，恢复时把锚点挪到此刻，暂停期间不计时也不计息。 */
export function setClockPaused(game: MonopolyGame, paused: boolean, now: number): boolean {
  if (game.winner || game.clock.paused === paused) return false;
  if (paused) {
    advanceGameClock(game, now);
    game.clock.paused = true;
    game.clock.pausedAt = now;
  } else {
    // 暂停的这段现实时间不算进对局时长（60 分钟快速局），也不算进当前回合的读秒。
    const pausedFor = game.clock.pausedAt > 0 ? Math.max(0, now - game.clock.pausedAt) : 0;
    game.startedAt += pausedFor;
    game.turnStartedAt += pausedFor;
    game.clock.paused = false;
    game.clock.pausedAt = 0;
    game.clock.anchorAt = now;
  }
  pushLog(game, undefined, paused ? "游戏时钟已暂停。" : "游戏时钟继续。", "text");
  return true;
}

/**
 * 服务器刚恢复一局时调用：重启期间的现实时间不算进游戏，也不算进对局时长。
 * 恢复时仍在暂停状态的局，暂停从恢复的这一刻重新计时。
 */
export function resumeClockFromDisk(game: MonopolyGame, now: number): void {
  const clock = game.clock;
  const offline = Math.max(0, now - clock.anchorAt);
  clock.anchorAt = now;
  game.startedAt += offline;
  game.turnStartedAt += offline;
  if (clock.paused) clock.pausedAt = now;
}

/** 把分钟数格式化成 24 小时制的 `08:00`。 */
export function formatGameTime(minute: number): string {
  const wrapped = ((Math.floor(minute) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** 昼夜的六个时段，按游戏时间划分。 */
export type DayPart = "predawn" | "sunrise" | "day" | "dusk" | "evening" | "night";

export const DAY_PART_LABEL: Readonly<Record<DayPart, string>> = {
  predawn: "黎明前",
  sunrise: "日出",
  day: "白天",
  dusk: "黄昏",
  evening: "傍晚",
  night: "夜晚"
};

/** 05:00–06:00 黎明前，06:00–08:00 日出，08:00–16:00 白天，16:00–18:00 黄昏，18:00–20:00 傍晚，其余夜晚。 */
export function dayPartAt(minute: number): DayPart {
  const wrapped = ((Math.floor(minute) % 1440) + 1440) % 1440;
  if (wrapped >= 300 && wrapped < 360) return "predawn";
  if (wrapped >= 360 && wrapped < 480) return "sunrise";
  if (wrapped >= 480 && wrapped < 960) return "day";
  if (wrapped >= 960 && wrapped < 1080) return "dusk";
  if (wrapped >= 1080 && wrapped < 1200) return "evening";
  return "night";
}
