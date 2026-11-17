/**
 * 玩家头像：没有上传头像时，用昵称首字 + 阵营色生成一个圆形徽记。
 * 棋盘上的棋子就是它——玩家一眼认出自己的飞机，比统一的飞机图标更直接。
 */

import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { Color } from "../../game/board.ts";
import { COLOR_DARK, COLOR_HEX } from "../../game/board.ts";

/** 取昵称的第一个可见字符作为徽记。 */
function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? [...trimmed][0]! : "?";
}

export function Avatar({ name, color, size, avatarUrl }: {
  name: string;
  color: Color;
  size: number;
  avatarUrl?: string | null;
}): JSX.Element {
  const stroke = COLOR_DARK[color];
  if (avatarUrl) {
    return (
      <image
        href={avatarUrl}
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        clipPath={`inset(0 round ${size / 2}px)`}
        preserveAspectRatio="xMidYMid slice"
      />
    );
  }
  return (
    <g>
      <circle r={size / 2} fill={COLOR_HEX[color]} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.56}
        fontWeight="600"
        fill="#fffdf7"
        style={{ userSelect: "none" }}
      >
        {initial(name)}
      </text>
    </g>
  );
}

/** 同一套徽记的 HTML 版本，给棋盘之外的悬浮卡、回合框排版用。 */
export function AvatarHtml({ name, color, avatarUrl }: {
  name: string;
  color: Color;
  avatarUrl: string | null;
}): JSX.Element {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [avatarUrl]);
  if (avatarUrl && !broken) {
    return <img className="chip-avatar" src={avatarUrl} alt="" onError={() => setBroken(true)} />;
  }
  return <span className="chip-initial" style={{ background: COLOR_HEX[color] }}>{initial(name)}</span>;
}
