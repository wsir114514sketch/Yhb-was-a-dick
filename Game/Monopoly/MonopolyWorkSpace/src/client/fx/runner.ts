/**
 * 执行器：把意图演成 WAAPI 动画。
 *
 * 采用 FLIP：React 已经把棋子画在真相位置（终点），这里只在棋子上叠一段"从旧位置回到 0 偏移"的 transform 动画。
 * 因此动画从不参与状态——跳过就是 `finish()`，取消就是回到真相；新快照到达时，同一玩家仍在播放的动画先直落终态，
 * 再从新的起点开演，不会倒退、也不会重复。
 *
 * 每帧只改 transform / opacity。棋盘尺寸由 ResizeObserver 异步缓存：在 commit 之后同步读 offsetWidth 会强制整页重排，
 * 6× 降速下实测要几十毫秒，所以开演时不读任何布局。
 */

import { formatMoney } from "../../shared/economy.ts";
import { centerOf, layoutOf } from "../board/geometry.ts";
import type { FxIntent } from "./diff.ts";
import { TIMING } from "./timing.ts";

/** 棋子在棋盘上的位置（占棋盘宽高的百分比）与绘制尺寸（px）。 */
export interface PieceSpot { x: number; y: number; size: number }

/** 同时播放的动画组上限；超出时最早的一组直落终态。 */
const MAX_PARALLEL = 3;

interface Group { animations: Animation[]; nodes: HTMLElement[] }

export interface FxHosts {
  /** 棋子下方的瞬时层（落地脉冲）。 */
  under: HTMLElement;
  /** 棋子上方的瞬时层（金额上浮）。 */
  over: HTMLElement;
  /** 按玩家 id 取棋子的 DOM 节点。 */
  piece: (playerId: string) => HTMLElement | null;
  /** 有无动画在播发生变化时调用，用来显示/隐藏"跳过动画"按钮。 */
  onBusy?: (busy: boolean) => void;
}

export class FxRunner {
  private readonly groups = new Map<string, Group>();
  private listening = false;
  private size = { width: 0, height: 0 };
  private readonly observer: ResizeObserver | null;

  constructor(private readonly hosts: FxHosts) {
    this.observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(([entry]) => { if (entry) this.size = { width: entry.contentRect.width, height: entry.contentRect.height }; })
      : null;
    this.observer?.observe(hosts.under);
  }

  /** `from` 是上一帧各棋子的位置，`to` 是这一帧（真相）的位置。 */
  run(intents: readonly FxIntent[], from: Readonly<Record<string, PieceSpot>>, to: Readonly<Record<string, PieceSpot>>, scale: number): void {
    if (scale <= 0 || !intents.length) return;
    // 百分比坐标换算成像素。contentRect 与 offsetWidth 一样不受外层缩放（ZoomPane）的 transform 影响。
    const { width, height } = this.size;
    if (!width || !height) return;
    const px = (dx: number, dy: number): [number, number] => [(dx / 100) * width, (dy / 100) * height];

    for (const intent of intents) {
      const start = from[intent.playerId];
      const end = to[intent.playerId];
      const element = this.hosts.piece(intent.playerId);
      if (!start || !end || !element || typeof element.animate !== "function") continue;
      // 同一玩家的旧动画直落终态，再从新起点开演。
      this.finish(intent.playerId);
      while (this.groups.size >= MAX_PARALLEL) this.finish(this.groups.keys().next().value as string);

      const delay = intent.afterRoll ? (TIMING.dice + TIMING.diceStagger) * scale : 0;
      const group: Group = { animations: [], nodes: [] };

      // 每一段的终点：中途的格子取格心，最后一步取棋子在终点格的真实站位。
      const points = intent.steps.map((step, index) => (index === intent.steps.length - 1 ? end : centerOf(step.tile)));
      const durations = intent.steps.map((step) => (step.hop ? TIMING.hop : TIMING.step) * scale);
      const total = durations.reduce((sum, value) => sum + value, 0);

      const frames: Keyframe[] = [];
      const at = (point: { x: number; y: number }, lift: number, grow: number, offset: number, easing: string): Keyframe => {
        const [dx, dy] = px(point.x - end.x, point.y - end.y);
        return { transform: `translate(${dx.toFixed(2)}px, ${(dy - lift).toFixed(2)}px) scale(${grow})`, offset, easing };
      };
      frames.push(at(start, 0, 1, 0, "ease-out"));
      let elapsed = 0;
      let previous: { x: number; y: number } = start;
      intent.steps.forEach((step, index) => {
        const point = points[index]!;
        const span = durations[index]!;
        const [ddx, ddy] = px(point.x - previous.x, point.y - previous.y);
        // 步行是一次贴地小跳；跳跃的弧高随距离增长，但封顶，避免飞出棋盘。
        const lift = step.hop ? Math.min(height * 0.18, Math.max(18, Math.hypot(ddx, ddy) * 0.3)) : end.size * 0.4;
        const middle = { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 };
        frames.push(at(middle, lift, 1.05, (elapsed + span / 2) / total, "ease-in"));
        elapsed += span;
        frames.push(at(point, 0, 1, Math.min(1, elapsed / total), "ease-out"));
        previous = point;
      });
      // fill: backwards —— 等骰子落定期间，棋子停在起点，而不是先闪到终点。
      group.animations.push(element.animate(frames, { duration: total, delay, fill: "backwards" }));

      const last = intent.steps[intent.steps.length - 1]!;
      this.pulse(group, last.tile, delay + total, scale);
      if (intent.bonus) {
        const reached = durations.slice(0, intent.bonus.step + 1).reduce((sum, value) => sum + value, 0);
        this.float(group, 0, `+${formatMoney(intent.bonus.amount)}`, delay + reached, scale);
      }

      this.groups.set(intent.playerId, group);
      void Promise.allSettled(group.animations.map((animation) => animation.finished)).then(() => {
        if (this.groups.get(intent.playerId) === group) this.groups.delete(intent.playerId);
        for (const node of group.nodes) node.remove();
        this.listen();
      });
    }
    this.listen();
  }

  /** 落地格的一次内描边脉冲：只动一个半透明层的 opacity，不动 box-shadow。 */
  private pulse(group: Group, tile: number, delay: number, scale: number): void {
    const cell = layoutOf(tile);
    const node = document.createElement("div");
    node.className = "fx-land";
    Object.assign(node.style, { left: `${cell.x}%`, top: `${cell.y}%`, width: `${cell.w}%`, height: `${cell.h}%` });
    this.hosts.under.append(node);
    group.nodes.push(node);
    group.animations.push(node.animate(
      [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }],
      { duration: TIMING.land * scale, delay, fill: "backwards", easing: "ease-out" }
    ));
  }

  /** 金额上浮。同一笔钱在日志里也有一行，动画关闭时信息不丢。 */
  private float(group: Group, tile: number, text: string, delay: number, scale: number): void {
    const center = centerOf(tile);
    const node = document.createElement("div");
    node.className = "fx-float num";
    node.textContent = text;
    Object.assign(node.style, { left: `${center.x}%`, top: `${center.y}%` });
    this.hosts.over.append(node);
    group.nodes.push(node);
    group.animations.push(node.animate(
      [
        { transform: "translate(-50%, -30%)", opacity: 0 },
        { transform: "translate(-50%, -110%)", opacity: 1, offset: 0.3 },
        { transform: "translate(-50%, -190%)", opacity: 0 }
      ],
      { duration: TIMING.bonus * scale, delay, fill: "backwards", easing: "ease-out" }
    ));
  }

  /** 某一组直落终态。 */
  private finish(key: string): void {
    const group = this.groups.get(key);
    if (!group) return;
    this.groups.delete(key);
    for (const animation of group.animations) animation.finish();
  }

  /** 跳过：所有动画直落终态。 */
  finishAll = (): void => {
    for (const key of [...this.groups.keys()]) this.finish(key);
  };

  private readonly onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") this.finishAll(); };

  /** 只在有动画在播时监听"点任意处跳过"；不拦截事件，点击照常落到按钮上。 */
  private listen(): void {
    const want = this.groups.size > 0;
    if (want === this.listening || typeof window === "undefined") return;
    this.listening = want;
    this.hosts.onBusy?.(want);
    if (want) {
      window.addEventListener("pointerdown", this.finishAll, { capture: true, passive: true });
      window.addEventListener("keydown", this.onKey, { capture: true });
    } else {
      window.removeEventListener("pointerdown", this.finishAll, { capture: true });
      window.removeEventListener("keydown", this.onKey, { capture: true });
    }
  }

  get busy(): boolean { return this.groups.size > 0; }

  dispose(): void {
    this.observer?.disconnect();
    for (const group of this.groups.values()) {
      for (const animation of group.animations) animation.cancel();
      for (const node of group.nodes) node.remove();
    }
    this.groups.clear();
    this.listen();
  }
}
