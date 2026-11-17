/**
 * 环形倒计时：一个 conic-gradient 圆环加秒数。每秒只更新一个 CSS 变量 `--p`，不做任何逐帧动画。
 */

import type { JSX } from "react";

export function Countdown({ seconds, total, urgentAt = 10 }: { seconds: number; total: number; urgentAt?: number }): JSX.Element {
  const fraction = Math.max(0, Math.min(1, total > 0 ? seconds / total : 0));
  const urgent = seconds <= urgentAt;
  return (
    <span role="timer" aria-label={`剩余 ${seconds} 秒`} style={{ display: "inline-flex", alignItems: "center", gap: "5px", flex: "0 0 auto" }}>
      <span className="countdown" data-urgent={urgent ? "1" : "0"} aria-hidden="true"
        style={{ "--p": fraction.toFixed(3) } as React.CSSProperties} />
      <span className="num" style={{ fontSize: "11px", minWidth: "22px", color: urgent ? "var(--danger)" : "var(--muted)" }}>{seconds}s</span>
    </span>
  );
}
