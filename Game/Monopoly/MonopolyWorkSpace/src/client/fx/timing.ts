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
