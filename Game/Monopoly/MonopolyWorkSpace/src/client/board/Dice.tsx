/**
 * The dice: two cubes that settle onto the felt.
 *
 * The throw is a short drop and a small settle, not a tumble — the result is already decided by the engine, so a long
 * animation would only make the player wait to learn something the server knows. One pass, no loop, and nothing that
 * continues after the numbers land.
 *
 * The pips are drawn per face so a die is readable at 26px, and the total is stated underneath because reading two dice
 * at a glance is exactly the thing a small screen makes hard.
 */

import type { JSX } from "react";

/** Where the pips sit on each face, in a 0–1 box. */
const PIPS: Record<number, readonly [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]]
};

function Face({ value, size }: { value: number; size: string }): JSX.Element {
  return (
    <svg viewBox="0 0 1 1" width={size} height={size} aria-hidden="true" style={{ display: "block" }}>
      <rect x="0.04" y="0.04" width="0.92" height="0.92" rx="0.16" fill="var(--surface)" />
      <rect x="0.04" y="0.04" width="0.92" height="0.92" rx="0.16" fill="none" stroke="var(--border-strong)" strokeWidth="0.02" />
      {(PIPS[value] ?? PIPS[1]!).map(([cx, cy], index) => (
        <circle key={index} cx={cx} cy={cy} r={value === 1 ? 0.11 : 0.082} fill="var(--text)" />
      ))}
    </svg>
  );
}

export function Dice({ dice, doubles, compact }: {
  dice: readonly [number, number] | undefined;
  doubles: boolean | undefined;
  compact: boolean;
}): JSX.Element {
  // The dice are sized against the board (`cqw`), so they are a real pair of dice on a desktop board and a small mark on a
  // phone, without asking what the screen is.
  const size = compact ? "clamp(20px, 4cqw, 40px)" : "clamp(24px, 5.4cqw, 58px)";
  const total = dice ? dice[0] + dice[1] : null;
  // `key` on the faces restarts the settle on every roll, without a timer of our own.
  const key = dice ? `${dice[0]}-${dice[1]}` : "rest";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(3px, .8cqw, 7px)" }}>
      <div style={{ display: "flex", gap: "clamp(4px, 1.1cqw, 12px)" }}>
        {[0, 1].map((index) => (
          <div key={`${key}-${index}`} style={{
            borderRadius: "var(--radius-sm)",
            animation: dice ? "dice-settle 380ms cubic-bezier(.2, .8, .3, 1) both" : "none",
            animationDelay: `${index * 50}ms`
          }}>
            <Face value={dice?.[index] ?? 1} size={size} />
          </div>
        ))}
      </div>
      <span className="num" style={{
        fontSize: "clamp(9px, 1.1cqw, 13px)", fontWeight: 650, minHeight: "1em",
        color: doubles ? "var(--text)" : "var(--muted)"
      }}>
        {total !== null ? `${total}${doubles ? " 双骰" : ""}` : "—"}
      </span>
    </div>
  );
}
