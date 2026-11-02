/**
 * 骰子：三维观感全部由 CSS 3D 完成，不加载 Three.js。
 *
 * 服务端（将来）已经决定了点数，动画只负责把结果演出来并停在该点数上。
 * 用 CSS 而不是 WebGL：一个骰子的画面里，WebGL 的收益不抵它带来的体积与
 * 设备兼容成本，而静止时这里完全不做任何计算。
 */

import type { JSX } from "react";

/** 每个面的点数布局，坐标在 0–1 的方框里。 */
const PIPS: Record<number, readonly [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.24, 0.24], [0.5, 0.5], [0.76, 0.76]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]]
};

/**
 * 让某一面朝前、朝上、朝右所需的旋转。
 * 六个面分别是：1 前、6 后、5 上、2 下、3 右、4 左。
 */
const FACE_ROTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 180, y: 0 }
};

function Face({ value }: { value: number }): JSX.Element {
  return (
    <span className="die-face">
      {(PIPS[value] ?? PIPS[1]!).map(([cx, cy], index) => (
        <i key={index} style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }} />
      ))}
    </span>
  );
}

export function Dice({ value, rolling, onRoll, disabled }: {
  value: number | null;
  rolling: boolean;
  onRoll: () => void;
  disabled?: boolean;
}): JSX.Element {
  const shown = value ?? 1;
  const rot = FACE_ROTATION[shown]!;
  // 翻滚时多转几圈再停下来，落点角度就是目标面的角度。
  const spin = rolling ? 720 : 0;

  return (
    <button
      type="button"
      className={`dice ${disabled ? "is-idle" : ""}`}
      onClick={onRoll}
      disabled={disabled}
      aria-label={value ? `骰子 ${value} 点` : "掷骰"}
    >
      <span className="dice-scene">
        <span
          className={`dice-cube ${rolling ? "is-rolling" : ""}`}
          style={{ transform: `rotateX(${rot.x - spin}deg) rotateY(${rot.y + spin}deg)` }}
        >
          <span className="die-face f1"><Face value={1} /></span>
          <span className="die-face f2"><Face value={2} /></span>
          <span className="die-face f3"><Face value={3} /></span>
          <span className="die-face f4"><Face value={4} /></span>
          <span className="die-face f5"><Face value={5} /></span>
          <span className="die-face f6"><Face value={6} /></span>
        </span>
      </span>
      <span className="dice-shadow" />
    </button>
  );
}
