/**
 * 游戏时间组件：页面左下角的那块小时钟（手机端在信息栏下面）。
 *
 * 显示服务器给的游戏时刻、时段名、下一个整点的倒计时，以及时钟是否被房主暂停。它只读状态：时间推进和利息结算都在
 * 服务器上，这里连"现在几点"都不自己决定，只把两次广播之间的空档平滑地补出来。
 */

import type { JSX } from "react";
import type { MonopolyGame } from "../../shared/protocol.ts";
import { DAY_PART_LABEL, dayPartAt, formatGameTime, type DayPart } from "../../shared/clock.ts";
import { formatCountdown, projectClock } from "./clockDisplay.ts";

export function GameClockChip({ game, receivedAt, now, dense, prominent }: {
  game: MonopolyGame;
  /** 收到当前状态时的本地时刻，用来把两次服务器广播之间的时间补平滑。 */
  receivedAt: number;
  now: number;
  dense?: boolean;
  /** 左栏里的正式组件：更大、带描边和左侧色条，和一块面板同级。 */
  prominent?: boolean;
}): JSX.Element {
  const projected = projectClock(game, receivedAt, now);
  const part = dayPartAt(projected.minute);
  const timeSize = prominent ? (dense ? "15px" : "17px") : dense ? "11px" : "13px";
  const smallSize = prominent ? "10px" : dense ? "8px" : "10px";

  return (
    <div title={projected.paused ? "游戏时钟已暂停" : `第 ${projected.day + 1} 天 · ${DAY_PART_LABEL[part]}`}
      style={{
        display: "flex", alignItems: "center", gap: prominent ? "7px" : "5px",
        padding: prominent ? "6px 9px" : dense ? "2px 5px" : "3px 7px",
        borderRadius: prominent ? "var(--radius)" : "var(--radius-sm)",
        background: "var(--surface)",
        border: `1px solid ${prominent ? "var(--border-strong)" : "var(--border)"}`,
        borderLeft: prominent ? "3px solid var(--accent)" : undefined,
        boxShadow: prominent ? "var(--shadow-raised)" : "var(--shadow-panel)",
        minWidth: 0
      }}>
      <DayIcon part={part} size={prominent ? 19 : 14} />
      <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: "5px", minWidth: 0 }}>
          <span className="num" style={{ fontSize: timeSize, fontWeight: 700, lineHeight: 1.05 }}>
            {formatGameTime(projected.minute)}
          </span>
          <span style={{ fontSize: smallSize, color: "var(--muted)", whiteSpace: "nowrap" }}>
            第 {projected.day + 1} 天
          </span>
        </span>
        <span style={{ fontSize: smallSize, color: "var(--muted)", whiteSpace: "nowrap" }}>
          {projected.paused ? "已暂停" : `${DAY_PART_LABEL[part]} · 下个钟点 ${formatCountdown(projected.msToNextHour)}`}
        </span>
      </span>
    </div>
  );
}

/** 时段的小图标：太阳、日出/黄昏的半日，或月亮（黎明前多一点星光）。 */
function DayIcon({ part, size }: { part: DayPart; size: number }): JSX.Element {
  if (part === "day") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ flex: "0 0 auto" }}>
        <circle cx="12" cy="12" r="4.4" fill="#d9a52b" />
        <g stroke="#d9a52b" strokeWidth="1.7" strokeLinecap="round">
          <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
        </g>
      </svg>
    );
  }
  if (part === "sunrise" || part === "dusk") {
    const warm = part === "sunrise" ? "#d9a52b" : "#c9793a";
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ flex: "0 0 auto" }}>
        <path d="M7.4 16.4a4.6 4.6 0 0 1 9.2 0z" fill={warm} />
        <g stroke={warm} strokeWidth="1.6" strokeLinecap="round" fill="none">
          <path d="M12 5.4v2.2M5.6 8.4l1.6 1.5M18.4 8.4l-1.6 1.5" />
          <path d="M3 16.4h18" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path d="M15.6 3.6a8.2 8.2 0 1 0 4.8 13.2A8.6 8.6 0 0 1 15.6 3.6z" fill="#8a94b8" />
      {part === "predawn" || part === "evening" ? <circle cx="19" cy="5.6" r="1.3" fill="#d3b06a" /> : null}
    </svg>
  );
}
