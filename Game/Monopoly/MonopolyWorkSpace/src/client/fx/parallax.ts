/**
 * 详情卡顶图的鼠标视差：±2° 的倾斜加一点反向平移。
 *
 * 只在详情卡里用；触摸设备、低端模式、动画关闭时不启用。pointermove 用 rAF 节流，每帧只写一次 transform；
 * 唯一的布局读取发生在 pointerenter（缓存宿主矩形）。
 */

import { useEffect, type RefObject } from "react";
import { currentMotion, isLowEnd, motionScale } from "./timing.ts";

const TILT = 2;

export function useParallax(host: RefObject<HTMLElement | null>, target: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const box = host.current;
    const layer = target.current;
    if (!box || !layer || typeof window === "undefined") return undefined;
    const fine = typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine || isLowEnd() || motionScale(currentMotion()) === 0) return undefined;

    const rest = "scale(1.06)";
    layer.style.transform = rest;
    layer.style.transition = "transform 180ms ease-out";
    let rect: DOMRect | null = null;
    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = (): void => {
      frame = 0;
      layer.style.transform = `perspective(700px) rotateX(${(-y * TILT).toFixed(2)}deg) rotateY(${(x * TILT).toFixed(2)}deg) translate3d(${(-x * 5).toFixed(1)}px, ${(-y * 3).toFixed(1)}px, 0) ${rest}`;
    };
    const enter = (): void => { rect = box.getBoundingClientRect(); };
    const move = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse" || !rect) return;
      x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
      y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      rect = null;
      layer.style.transform = rest;
    };
    box.addEventListener("pointerenter", enter);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerleave", leave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      box.removeEventListener("pointerenter", enter);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerleave", leave);
    };
  }, [host, target]);
}
