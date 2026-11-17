/**
 * 玩家头像：登录账号有头像就显示照片，离线或游客没有，就退回自己的棋子图标——棋子的形状本来就是这张桌上认人的
 * 那件东西，外圈再用座位色，棋盘、座位卡和地产分组就都在说同一个人。
 */

import { useEffect, useState } from "react";
import type { JSX } from "react";
import { seatColor, tokenOf } from "../art/tokens.tsx";

export function Avatar({ seat, avatarUrl, size = 24, ring = true }: {
  seat: number;
  avatarUrl?: string | null;
  /** 数字按像素算，字符串原样交给 CSS（比如 "100%"），用来跟着容器缩放。 */
  size?: number | string;
  /** 外圈座位色；外面已经有一圈自己的边框时（地产分组的小格子）就不必再套一层。 */
  ring?: boolean;
}): JSX.Element {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [avatarUrl]);

  const color = seatColor(seat);
  const frame = { width: size, height: size, flex: "0 0 auto", borderRadius: "50%", border: ring ? `1.5px solid ${color}` : "none" } as const;

  if (avatarUrl && !broken) {
    return <img src={avatarUrl} alt="" onError={() => setBroken(true)}
      style={{ ...frame, objectFit: "cover", background: "var(--surface-raised)" }} />;
  }

  const art = tokenOf(seat);
  const glyph = typeof size === "number" ? Math.round(size * 0.6) : "60%";
  return (
    <span role="img" aria-label={art.name}
      style={{ ...frame, display: "grid", placeItems: "center", background: `${color}1f` }}>
      <svg viewBox="0 0 24 24" width={glyph} height={glyph}
        style={{ color, display: "block" }} fill="currentColor" aria-hidden="true">
        {art.shape}
      </svg>
    </span>
  );
}
