/**
 * The dice: two real cubes with the open-source marble texture from dice-box-threejs (MIT) on
 * their faces, pips drawn over the texture. Clicking a die rolls it — there is no roll button.
 *
 * The throw is a short tumble in place, not a long show: the result is already decided by the
 * engine, so the animation explains, it does not tease. `rolling` spins the cube through a few
 * pips before the face lands, which is what makes the click feel like a throw.
 *
 * When it is the viewer's turn in the roll stage, the dice glow at the edge and take the pointer:
 * the whole interaction lives on the board, the way the table itself would ask.
 */

import { useEffect, useState } from "react";
import type { JSX } from "react";
import textureUrl from "../assets/dice/marble.webp";
import { TIMING } from "../fx/timing.ts";

/** 时长随动画档位缩放：`--fx-scale` 由 GameTable 写到根节点。 */
const ms = (value: number): string => `calc(${value}ms * var(--fx-scale, 1))`;

/** Where the pips sit on each face, in a 0–1 box. */
const PIPS: Record<number, readonly [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]]
};

/** One cube face: the texture as the body, pips in ink over it. */
function Face({ value, texture }: { value: number; texture: string }): JSX.Element {
  return (
    <svg viewBox="0 0 1 1" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <clipPath id="die-face">
          <rect x="0.04" y="0.04" width="0.92" height="0.92" rx="0.16" />
        </clipPath>
      </defs>
      <g clipPath="url(#die-face)">
        {/* Size the image over the whole face; `preserveAspectRatio` keeps the grain from stretching. */}
        <image href={texture} x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid slice" />
        {/* A slight shade so white pips on a pale stone stay readable, in both themes. */}
        <rect x="0" y="0" width="1" height="1" fill="rgba(30, 32, 40, 0.18)" />
      </g>
      <rect x="0.04" y="0.04" width="0.92" height="0.92" rx="0.16" fill="none" stroke="var(--border-strong)" strokeWidth="0.025" />
      {(PIPS[value] ?? PIPS[1]!).map(([cx, cy], index) => (
        <circle key={index} cx={cx} cy={cy} r={value === 1 ? 0.11 : 0.085} fill="var(--text)" stroke="var(--surface)" strokeWidth="0.012" />
      ))}
    </svg>
  );
}

export interface DiceProps {
  dice: readonly [number, number] | undefined;
  doubles: boolean | undefined;
  compact: boolean;
  /** True while it is the viewer's turn and the engine waits for the roll: the dice take the click. */
  canRoll?: boolean;
  /** Sends the roll. Omitted for spectators and out-of-turn viewers: the dice are then just a display. */
  onRoll?: () => void;
  /** 每次掷骰唯一的键（该次掷骰的日志 id）：同样的点数连掷两次也要重新落定。 */
  rollKey?: number;
}

export function Dice({ dice, doubles, compact, canRoll = false, onRoll, rollKey }: DiceProps): JSX.Element {
  // The tumble runs from the click until the engine's answer arrives — the result is decided there, so the
  // animation must not pretend to be deciding it.
  const [rolling, setRolling] = useState(false);
  const [spin, setSpin] = useState<readonly [number, number]>(dice ?? [1, 1]);

  useEffect(() => {
    if (!rolling) return;
    const spinTimer = setInterval(() => {
      setSpin([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 80);
    // A roll that is refused or lost must not leave the dice spinning forever.
    const guard = setTimeout(() => setRolling(false), 4000);
    return () => { clearInterval(spinTimer); clearTimeout(guard); };
  }, [rolling]);

  // The engine has answered when the turn no longer waits for a roll: stop, and show what it decided.
  useEffect(() => {
    if (canRoll) return;
    setRolling(false);
    setSpin(dice ?? [1, 1]);
  }, [canRoll, dice]);

  const click = (): void => {
    if (!canRoll || rolling || !onRoll) return;
    setRolling(true);
    // The hand of the throw is local; the numbers come back from the engine.
    onRoll();
  };

  const size = compact ? "clamp(22px, 4.6cqw, 46px)" : "clamp(26px, 6cqw, 64px)";
  const total = dice ? dice[0] + dice[1] : null;
  const faceValue = rolling ? spin : dice ?? spin;
  const settleKey = dice ? `${rollKey ?? 0}-${dice[0]}-${dice[1]}` : "rest";
  const idle = canRoll && !rolling;
  const label = rolling ? "掷骰中…" : total !== null ? `${total}${doubles ? " 双骰" : ""}` : canRoll ? "点击掷骰" : "—";

  return (
    <button
      type="button"
      onClick={click}
      disabled={!canRoll || !onRoll}
      aria-label={canRoll ? "点击掷骰" : "骰子"}
      title={canRoll ? "点击掷骰" : undefined}
      style={{
        background: "none", border: "none", padding: 0, cursor: idle ? "pointer" : "default",
        display: "flex", flexDirection: "column", alignItems: "center",
        // Re-enable clicks: the board-centre panel passes none through, so the dice must claim them back.
        pointerEvents: "auto",
        gap: "clamp(3px, .8cqw, 7px)"
      }}
    >
      <span key={`${settleKey}-${rolling ? "r" : "s"}`} style={{
        display: "flex", gap: "clamp(4px, 1.1cqw, 12px)",
        borderRadius: "var(--radius-sm)",
        // The invitation: a hairline glow that only exists while the dice want the click. It holds one
        // breath, then stops — nothing loops except the rare tumble itself.
        boxShadow: idle ? "0 0 0 2px var(--accent)" : "none",
        transition: "box-shadow 160ms ease",
        // 双点：两枚都落定之后整体摇一次。
        animation: dice && doubles && !rolling
          ? `dice-wobble ${ms(TIMING.diceWobble)} ease-in-out ${ms(TIMING.dice + TIMING.diceStagger)} both` : "none"
      }}>
        {[0, 1].map((index) => (
          <span key={index} style={{
            width: size, height: size, display: "block", borderRadius: "18%",
            // 落定时两枚错开一点，像是先后落到桌面上。
            animation: rolling ? `dice-tumble 260ms ease-in-out ${index * 60}ms infinite`
              : dice ? `dice-settle ${ms(TIMING.dice)} cubic-bezier(.2, .8, .3, 1) ${ms(index * TIMING.diceStagger)} both` : "none",
            transform: rolling ? "rotate(8deg)" : "none"
          }}>
            <Face value={faceValue[index] ?? 1} texture={textureUrl} />
          </span>
        ))}
      </span>
      <span className="num" style={{
        fontSize: "clamp(9px, 1.1cqw, 13px)", fontWeight: 650, minHeight: "1em",
        color: doubles ? "var(--text)" : "var(--muted)"
      }}>
        {label}
      </span>
    </button>
  );
}
