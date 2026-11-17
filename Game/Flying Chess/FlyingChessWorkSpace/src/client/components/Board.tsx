/**
 * 棋盘：全部由 board.ts 的坐标表程序生成，不引用任何图片。
 *
 * 棋子是玩家头像 + 阵营色边框。可以移动的飞机直接在地图上高亮并接受点击，
 * 所以"选哪架"这件事不需要另外的按钮列表。高亮来源由调用方决定（单机规则引擎或服务端）。
 *
 * 基地里只放棋子；玩家资料靠悬停（触屏点一下）弹出的浮卡查看，写进卡片会挤压停机位。
 */

import { useState } from "react";
import type { JSX } from "react";
import {
  BASES, COLOR_DARK, COLOR_HEX, COLOR_NAME, COLORS, GOAL_POINTS, RING, RUNWAYS,
  SHORTCUT_CELL, START_INDEX, ringCenter, positionFor
} from "../../game/board.ts";
import type { Color } from "../../game/board.ts";
import { GOAL_STEP } from "../../game/rules.ts";
import type { BoardMotion } from "../useMoveAnimation.ts";
import { Avatar, AvatarHtml } from "./Avatar.tsx";

/** 棋盘只关心这些字段；单机与联机都把状态投影成它。 */
export type BoardPlayer = {
  color: Color;
  name: string;
  avatarUrl?: string | null;
  planes: { step: number }[];
  isBot?: boolean;
  isHost?: boolean;
  connected?: boolean;
};

/** 场上的飞机，带它在格内的偏移，避免同格完全遮挡。 */
type PlaneOnMap = {
  color: Color;
  name: string;
  avatarUrl: string | null;
  planeIndex: number;
  x: number;
  y: number;
  movable: boolean;
  arrived: boolean;
  /** 停在基地停机位：这一格的圆位比环线上的格子大，棋子跟着放大填满。 */
  inBase: boolean;
};

/** 同格多机时按数量散开：1 架居中，2 架左右，3 架三角，4 架四角。 */
const OFFSETS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-13, 0], [13, 0]],
  3: [[0, -11], [-13, 8], [13, 8]],
  4: [[-11, -11], [11, -11], [-11, 11], [11, 11]]
};

const PLANE_RADIUS = 16;
/** 停在基地时的半径：直接填满 27 半径的停机位。 */
const BASE_PLANE_RADIUS = 25;
/** 头像半径 = 棋子半径减去描边宽度，让头像正好顶到边框内沿，不留白圈。 */
const AVATAR_INSET = 2.5;

/** 浮卡贴在基地朝棋盘中心的那一侧，不会被棋盘外框裁掉。 */
const CORNER: Record<Color, string> = { green: "tl", red: "tr", blue: "bl", yellow: "br" };

function statsOf(player: BoardPlayer): { home: number; done: number; tags: string[] } {
  return {
    home: player.planes.filter((plane) => plane.step < 0).length,
    done: player.planes.filter((plane) => plane.step >= GOAL_STEP).length,
    tags: [
      player.isBot ? "电脑" : "",
      !player.connected && !player.isBot ? "离线" : "",
      player.isHost ? "房主" : ""
    ].filter(Boolean)
  };
}

function PlaneMark({ plane, onClick }: { plane: PlaneOnMap; onClick: (planeIndex: number) => void }): JSX.Element {
  const stroke = COLOR_DARK[plane.color];
  const radius = plane.inBase ? BASE_PLANE_RADIUS : PLANE_RADIUS;
  const body = (
    <>
      {plane.movable && (
        <circle r={radius + 6} fill="none" stroke="#fffdf7" strokeWidth="3.5" opacity="0.95">
          <animate attributeName="r" values={`${radius + 4};${radius + 8};${radius + 4}`} dur="1.1s" repeatCount="indefinite" />
        </circle>
      )}
      <circle r={radius} fill="#fffdf7" stroke={stroke} strokeWidth={plane.movable ? 3.5 : 2.5} />
      <g opacity={plane.arrived ? 0.45 : 1}>
        <Avatar name={plane.name} color={plane.color} size={(radius - AVATAR_INSET) * 2} avatarUrl={plane.avatarUrl} />
      </g>
      {/* 四角小记号：区分同一玩家的四架飞机，不影响头像可读性。 */}
      {Array.from({ length: plane.planeIndex }, (_, i) => (
        <circle
          key={i}
          cx={radius - 4 - i * 4.5}
          cy={radius - 4}
          r="2"
          fill="#fffdf7"
          stroke={stroke}
          strokeWidth="1.2"
        />
      ))}
    </>
  );

  if (!plane.movable) {
    return <g transform={`translate(${plane.x} ${plane.y})`} style={{ pointerEvents: "none" }}>{body}</g>;
  }

  return (
    <g
      transform={`translate(${plane.x} ${plane.y})`}
      role="button"
      tabIndex={0}
      aria-label={`移动第 ${plane.planeIndex + 1} 架飞机`}
      style={{ cursor: "pointer" }}
      onClick={() => onClick(plane.planeIndex)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(plane.planeIndex); }
      }}
    >
      {body}
    </g>
  );
}

export function Board({ players, turn, highlight, onPick, moving }: {
  players: BoardPlayer[];
  turn: number;
  highlight: number[];
  onPick: (planeIndex: number) => void;
  /** 正在飞行的棋子；它按插值坐标画，不参与同格散开。 */
  moving?: BoardMotion | null;
}): JSX.Element {
  const [openBase, setOpenBase] = useState<Color | null>(null);

  // 把所有飞机投影成屏幕坐标，再按落点分组做散开。
  const groups = new Map<string, { plane: Omit<PlaneOnMap, "x" | "y">; x: number; y: number }[]>();
  for (const player of players) {
    player.planes.forEach((plane, planeIndex) => {
      const pos = positionFor(player.color, plane.step, planeIndex);
      const key = `${Math.round(pos.x)},${Math.round(pos.y)}`;
      const list = groups.get(key) ?? [];
      list.push({
        plane: {
          color: player.color,
          name: player.name,
          avatarUrl: player.avatarUrl ?? null,
          planeIndex,
          movable: false,
          arrived: plane.step >= GOAL_STEP,
          inBase: plane.step < 0
        },
        x: pos.x,
        y: pos.y
      });
      groups.set(key, list);
    });
  }

  const current = players[turn];
  const movable = new Set(highlight);

  const planes: PlaneOnMap[] = [];
  for (const list of groups.values()) {
    const offsets = OFFSETS[Math.min(list.length, 4)]!;
    list.forEach((entry, i) => {
      const [dx, dy] = offsets[i] ?? [0, 0];
      const isMine = !!current && current.color === entry.plane.color;
      planes.push({
        ...entry.plane,
        x: entry.x + dx,
        y: entry.y + dy,
        movable: isMine && movable.has(entry.plane.planeIndex)
      });
    });
  }

  // 可移动的飞机最后画，保证高亮不被同格的其他棋子盖住。
  planes.sort((a, b) => Number(a.movable) - Number(b.movable));

  // 飞行中的棋子改画在插值坐标上，也不可点击。
  if (moving) {
    for (const plane of planes) {
      if (plane.color === moving.color && plane.planeIndex === moving.planeIndex) {
        plane.x = moving.x;
        plane.y = moving.y;
        plane.movable = false;
      }
    }
  }

  // 捷径指引线：从本色捷径格指向跳跃落点（+12 格）。
  const shortcuts = COLORS.map((color) => ({
    color,
    from: ringCenter(SHORTCUT_CELL[color]),
    to: ringCenter((SHORTCUT_CELL[color] + 12) % RING.length)
  }));

  const previewPlayer = openBase ? players.find((entry) => entry.color === openBase) : undefined;
  const previewStats = previewPlayer ? statsOf(previewPlayer) : null;

  return (
    <div className="board">
      <svg viewBox="0 0 900 900" role="img" aria-label="飞行棋棋盘">
        <rect x="0" y="0" width="900" height="900" rx="18" fill="#fbf8f2"
          onClick={() => setOpenBase(null)} />

        {/* 捷径箭头：每个阵营一个，颜色跟线一致 */}
        <defs>
          {COLORS.map((color) => (
            <marker key={color} id={`fc-arrow-${color}`} viewBox="0 0 10 10"
              refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L10 5 L0 10 Z" fill={COLOR_DARK[color]} />
            </marker>
          ))}
        </defs>

        {/* 四角基地：悬停 / 点一下弹浮卡，卡片里写玩家资料 */}
        {COLORS.map((color) => {
          const base = BASES[color];
          const occupant = players.find((entry) => entry.color === color);
          const active = !!occupant && players[turn]?.color === color;
          return (
            <g
              key={`base-${color}`}
              className={occupant ? "base-hit" : undefined}
              tabIndex={occupant ? 0 : undefined}
              role={occupant ? "button" : undefined}
              aria-label={occupant ? `${occupant.name} 的基地` : undefined}
              onClick={() => { if (occupant) setOpenBase((cur) => (cur === color ? null : color)); }}
              onKeyDown={(event) => {
                if (!occupant) return;
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenBase((cur) => (cur === color ? null : color)); }
              }}
            >
              <rect x={base.x} y={base.y} width="200" height="200" rx="16"
                fill={COLOR_HEX[color]} fillOpacity={active ? 0.24 : 0.14}
                stroke={COLOR_DARK[color]} strokeWidth={active ? 4 : 2.5} />
              {base.slots.map((slot, i) => (
                <circle key={i} cx={slot.x} cy={slot.y} r="27"
                  fill="#fffdf7" stroke={COLOR_DARK[color]} strokeWidth="2" strokeOpacity="0.55" />
              ))}
            </g>
          );
        })}

        {/* 52 格环线 */}
        {RING.map((cell, index) => (
          cell.shape === "rect" ? (
            <rect key={`ring-${index}`} x={cell.x} y={cell.y} width={cell.w} height={cell.h}
              fill={COLOR_HEX[cell.color]} stroke="#2b2825" strokeWidth="2" />
          ) : (
            <polygon key={`ring-${index}`} points={cell.points} fill={COLOR_HEX[cell.color]}
              stroke="#2b2825" strokeWidth="2" strokeLinejoin="round" />
          )
        ))}

        {/* 起飞格：加一圈白环，让起点一眼可辨 */}
        {COLORS.map((color) => {
          const start = ringCenter(START_INDEX[color]);
          return <circle key={`start-${color}`} cx={start.x} cy={start.y} r="17"
            fill="none" stroke="#fffdf7" strokeWidth="4" opacity="0.9" />;
        })}

        {/* 捷径指引：虚线带箭头，指向 +12 格后的落点 */}
        {shortcuts.map(({ color, from, to }) => (
          <line key={`shortcut-${color}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            stroke={COLOR_DARK[color]} strokeWidth="3" strokeDasharray="9 8" strokeOpacity="0.45" strokeLinecap="round"
            markerEnd={`url(#fc-arrow-${color})`} />
        ))}

        {/* 四条跑道 */}
        {COLORS.map((color) =>
          RUNWAYS[color].map((cell, i) => (
            <rect key={`runway-${color}-${i}`} x={cell.x} y={cell.y} width={cell.w} height={cell.h}
              fill={COLOR_HEX[color]} stroke="#2b2825" strokeWidth="2" strokeOpacity="0.6" fillOpacity="0.85" />
          ))
        )}

        {/* 中央终点 */}
        <rect x="375" y="375" width="150" height="150" fill="#fffdf7" stroke="#2b2825" strokeWidth="2.5" />
        {COLORS.map((color) => (
          <polygon key={`goal-${color}`} points={GOAL_POINTS[color]}
            fill={COLOR_HEX[color]} stroke="#2b2825" strokeWidth="2" strokeLinejoin="round" />
        ))}

        {/* 飞机 */}
        {planes.map((plane) => (
          <PlaneMark key={`${plane.color}-${plane.planeIndex}`} plane={plane} onClick={onPick} />
        ))}
      </svg>

      {previewPlayer && previewStats ? (
        <div className={`base-pop base-pop-${CORNER[previewPlayer.color]}`}>
          <span className="chip chip-lg" style={{ borderColor: COLOR_HEX[previewPlayer.color] }}>
            <AvatarHtml name={previewPlayer.name} color={previewPlayer.color} avatarUrl={previewPlayer.avatarUrl ?? null} />
          </span>
          <div className="base-pop-body">
            <strong style={{ color: COLOR_DARK[previewPlayer.color] }}>{previewPlayer.name}</strong>
            <span className="base-pop-sub">
              {COLOR_NAME[previewPlayer.color]}方 · 基地 {previewStats.home} · 终点 {previewStats.done}
            </span>
            {previewStats.tags.length ? (
              <span className="base-pop-tags">
                {previewStats.tags.map((tag) => <span key={tag} className="fc-badge">{tag}</span>)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
