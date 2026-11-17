/**
 * 棋子移动动画：只在"位置已经变了"之后补一段飞行，不改规则引擎也不改协议。
 * 单机是本地立即落子、联机是等服务端快照，两者因此共用同一段表现。
 */

import { useEffect, useRef, useState } from "react";
import { positionFor } from "../game/board.ts";
import type { Color } from "../game/board.ts";

export type BoardMotion = { color: Color; planeIndex: number; x: number; y: number };

type PlayerLike = { color: Color; planes: { step: number }[] };

/** 每格 90ms；总时长夹在区间内，长距离不拖沓，短距离也看得见。 */
const STEP_MS = 90;
const MIN_MS = 240;
const MAX_MS = 900;

const keyOf = (color: Color, index: number): string => `${color}:${index}`;

export function useMoveAnimation(players: PlayerLike[]): BoardMotion | null {
  const seen = useRef<Map<string, number> | null>(null);
  const frame = useRef<number | null>(null);
  const [motion, setMotion] = useState<BoardMotion | null>(null);

  useEffect(() => {
    const steps = new Map<string, number>();
    for (const player of players) {
      player.planes.forEach((plane, index) => steps.set(keyOf(player.color, index), plane.step));
    }
    const before = seen.current;
    seen.current = steps;
    if (!before) return;

    // 一次快照里可能有多架变化（撞机把对方送回基地）：只给前进得最多的那架做动画，
    // 被撞回基地的棋子直接归位。
    let mover: { color: Color; planeIndex: number; from: number; to: number } | null = null;
    for (const player of players) {
      for (let index = 0; index < player.planes.length; index++) {
        const to = player.planes[index]!.step;
        const from = before.get(keyOf(player.color, index));
        if (from === undefined || to <= from) continue;
        if (!mover || to - from > mover.to - mover.from) {
          mover = { color: player.color, planeIndex: index, from, to };
        }
      }
    }
    if (!mover) return;

    const { color, planeIndex, from, to } = mover;
    const points = [positionFor(color, from, planeIndex)];
    for (let step = from + 1; step <= to; step++) points.push(positionFor(color, step, planeIndex));

    const duration = Math.min(MAX_MS, Math.max(MIN_MS, (points.length - 1) * STEP_MS));
    if (frame.current !== null) cancelAnimationFrame(frame.current);

    const started = performance.now();
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - started) / duration);
      const scaled = progress * (points.length - 1);
      const index = Math.min(points.length - 2, Math.floor(scaled));
      const t = scaled - index;
      const a = points[index]!;
      const b = points[index + 1]!;
      setMotion({ color, planeIndex, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        frame.current = null;
        setMotion(null);
      }
    };
    frame.current = requestAnimationFrame(tick);
  }, [players]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  return motion;
}
