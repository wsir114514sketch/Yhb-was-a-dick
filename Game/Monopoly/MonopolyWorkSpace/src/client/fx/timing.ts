/**
 * 动效时长的唯一来源。
 *
 * 每个数字都是"正常"档的毫秒数；"快速"档统一乘 0.45，"关闭"档与系统的"减少动态效果"统一为 0——为 0 时动画层不创建
 * 任何动画，棋子直接出现在终点，信息全部留在日志与棋盘本身。
 */

export type MotionMode = "normal" | "fast" | "off";

export const TIMING = {
  /** 骰子落定；双点时之后再摇一次。 */
  dice: 320,
  /** 两枚骰子落定的错开量。 */
  diceStagger: 40,
  /** 双点的一次摇摆。 */
  diceWobble: 220,
  /** 棋子沿环每走一格。 */
  step: 70,
  /** 非步行的位移（卡牌直达、进监狱）：一次弧线跳跃。 */
  hop: 300,
  /** 落地格的一次脉冲。 */
  land: 180,
  /** 过起点的 "+$200" 上浮。 */
  bonus: 640
} as const;

/** 各档位对时长的倍率。 */
const SCALE: Record<MotionMode, number> = { normal: 1, fast: 0.45, off: 0 };

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 当前生效的倍率：菜单设置与系统偏好取更保守的一方。 */
export function motionScale(mode: MotionMode): number {
  return reducedMotion() ? 0 : SCALE[mode];
}

/** 把倍率写到根节点的 `--fx-scale`，让 CSS 关键帧（骰子）与 WAAPI 共用同一张表。 */
export function applyMotionScale(mode: MotionMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--fx-scale", String(motionScale(mode)));
}

/** 低端模式的偏好：自动（按设备判断）/ 强制开 / 强制关。存在 localStorage。 */
export type LowEndPref = "auto" | "on" | "off";
const LOW_END_KEY = "monopoly.lowEnd";

export function lowEndPref(): LowEndPref {
  try {
    const value = localStorage.getItem(LOW_END_KEY);
    return value === "on" || value === "off" ? value : "auto";
  } catch { return "auto"; }
}

export function setLowEndPref(next: LowEndPref): void {
  try { localStorage.setItem(LOW_END_KEY, next); } catch { /* 隐私模式：本次会话内仍按"自动" */ }
}

/**
 * 低端设备：4 核及以下或 4GB 内存及以下。低端模式下关闭视差与"粒子类"动效（飞金币、垄断扫光），
 * 只保留解释事件所必需的位移与脉冲。
 */
export function isLowEnd(): boolean {
  const pref = lowEndPref();
  if (pref !== "auto") return pref === "on";
  if (typeof navigator === "undefined") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return (navigator.hardwareConcurrency ?? 8) <= 4 || (memory !== undefined && memory <= 4);
}

/** 当前根节点上的动画档位（GameTable 写入 data-motion）。 */
export function currentMotion(): MotionMode {
  if (typeof document === "undefined") return "normal";
  const value = document.documentElement.dataset.motion;
  return value === "fast" || value === "off" ? value : "normal";
}
