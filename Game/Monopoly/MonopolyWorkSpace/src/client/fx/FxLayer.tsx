/**
 * 棋子与动效的独立图层，盖在 48 格之上。
 *
 * 棋子始终画在真相位置；位移、落地、上浮全部由 `FxRunner` 用 WAAPI 叠加，播放期间 React 不重绘。组件用 `memo`
 * 按 `version`（开局时间 + 日志长度）比较：本地单机的 `game` 是被原地修改的同一个对象，按引用比较会漏掉更新，
 * 而每一次位置变化都必然写一行日志。
 */

import { memo, useLayoutEffect, useRef } from "react";
import type { JSX } from "react";
import type { MonopolyGame } from "../../shared/protocol.ts";
import { Token } from "../art/tokens.tsx";
import { layoutOf, tokenSpot } from "../board/geometry.ts";
import { diffGames, type FxDigest } from "./diff.ts";
import { FxRunner, type PieceSpot } from "./runner.ts";
import { motionScale, type MotionMode } from "./timing.ts";

/** 每名未破产玩家的站位。同格多人时按座位围成一圈，与原先画在格子里的规则一致。 */
export function spotsOf(game: MonopolyGame, compact: boolean): Record<string, PieceSpot & { seat: number }> {
  const spots: Record<string, PieceSpot & { seat: number }> = {};
  const alive = game.players.filter((player) => !player.bankrupt);
  for (const player of alive) {
    const total = alive.filter((other) => other.position === player.position).length;
    const side = layoutOf(player.position).side;
    const spot = tokenSpot(player.position, player.seat, total);
    spots[player.id] = { ...spot, seat: player.seat, size: compact ? 10 : side === "left" || side === "right" ? 11 : 14 };
  }
  return spots;
}

export interface FxLayerProps {
  game: MonopolyGame;
  compact: boolean;
  motion: MotionMode;
  /** 变化即意味着快照变了；见文件头。 */
  version: string;
}

const layer: React.CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };

function FxLayerView({ game, compact, motion }: FxLayerProps): JSX.Element {
  const under = useRef<HTMLDivElement | null>(null);
  const over = useRef<HTMLDivElement | null>(null);
  const pieces = useRef(new Map<string, HTMLElement>());
  const runner = useRef<FxRunner | null>(null);
  const digest = useRef<FxDigest | null>(null);
  const shown = useRef<Record<string, PieceSpot>>({});
  const spots = spotsOf(game, compact);

  useLayoutEffect(() => {
    if (!under.current || !over.current) return undefined;
    const next = new FxRunner({ under: under.current, over: over.current, piece: (id) => pieces.current.get(id) ?? null });
    runner.current = next;
    return () => { next.dispose(); runner.current = null; };
  }, []);

  // 布局阶段开演：棋子在浏览器绘制终点之前就被拉回起点，不会闪一帧。
  useLayoutEffect(() => {
    const { intents, digest: next } = diffGames(digest.current, game);
    digest.current = next;
    runner.current?.run(intents, shown.current, spots, motionScale(motion));
    shown.current = spots;
  });

  return (
    <div style={{ ...layer, zIndex: 5 }}>
      <div ref={under} aria-hidden="true" style={layer} />
      {game.players.filter((player) => !player.bankrupt).map((player) => {
        const spot = spots[player.id]!;
        return (
          <span
            key={player.id}
            ref={(node) => { if (node) pieces.current.set(player.id, node); else pieces.current.delete(player.id); }}
            style={{
              position: "absolute", left: `${spot.x}%`, top: `${spot.y}%`,
              width: spot.size, height: spot.size, marginLeft: -spot.size / 2, marginTop: -spot.size / 2
            }}
          >
            <Token seat={player.seat} size={spot.size} />
          </span>
        );
      })}
      <div ref={over} aria-hidden="true" style={layer} />
    </div>
  );
}

export const FxLayer = memo(FxLayerView, (left, right) =>
  left.version === right.version && left.compact === right.compact && left.motion === right.motion);
