/**
 * 游戏时间组件：棋盘中央左下角的那块小时钟。
 *
 * 显示服务器给的游戏时刻、时段名、下一个整点的倒计时，以及时钟是否被房主暂停。它只读状态：时间推进和利息结算都在
 * 服务器上，这里连"现在几点"都不自己决定，只把两次广播之间的空档平滑地补出来。
 */

import type { JSX } from "react";
import type { MonopolyGame } from "../../shared/protocol.ts";
import { DAY_PART_LABEL, dayPartAt, formatGameTime } from "../../shared/clock.ts";
import { formatCountdown, projectClock } from "./clockDisplay.ts";

export function GameClockChip({ game, receivedAt, now, dense }: {
  game: MonopolyGame;
  /** 收到当前状态时的本地时刻，用来把两次服务器广播之间的时间补平滑。 */
  receivedAt: number;
  now: number;
  dense?: boolean;
}): JSX.Element {
  const projected = projectClock(game, receivedAt, now);
  const part = dayPartAt(projected.minute);

  return (
    <div title={projected.paused ? "游戏时钟已暂停" : `第 ${projected.day + 1} 天 · ${DAY_PART_LABEL[part]}`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "1px",
        padding: dense ? "2px 5px" : "3px 7px", borderRadius: "var(--radius-sm)",
        background: "var(--surface)", border: "1px solid var(--border)",
        boxShadow: "var(--shadow-panel)", minWidth: 0
      }}>
      <span style={{ display: "flex", alignItems: "baseline", gap: "4px", minWidth: 0 }}>
        <span className="num" style={{ fontSize: dense ? "11px" : "clamp(11px, 1.5cqw, 15px)", fontWeight: 700, lineHeight: 1.1 }}>
          {formatGameTime(projected.minute)}
        </span>
        <span style={{ fontSize: dense ? "8px" : "clamp(8px, .95cqw, 10px)", color: "var(--muted)", whiteSpace: "nowrap" }}>
          第 {projected.day + 1} 天
        </span>
      </span>
      <span style={{ fontSize: dense ? "8px" : "clamp(8px, .95cqw, 10px)", color: "var(--muted)", whiteSpace: "nowrap" }}>
        {projected.paused ? "已暂停" : `${DAY_PART_LABEL[part]} · 下个钟点 ${formatCountdown(projected.msToNextHour)}`}
      </span>
    </div>
  );
}
