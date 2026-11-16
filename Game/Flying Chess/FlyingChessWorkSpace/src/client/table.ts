/**
 * 界面消费的统一对局视图。
 *
 * 单机模式由规则引擎直接生成，联机模式由服务端快照生成；`GameTable` / `Board` 只认识这一种形状，
 * 因此两条路径的界面与规则表现完全一致，切换时不需要改渲染代码。
 */

import type { Color } from "../game/board.ts";
import { legalMoves, currentPlayer } from "../game/rules.ts";
import type { GameState } from "../game/rules.ts";
import type { FcPublicState } from "../shared/protocol.ts";

export type TablePlayer = {
  /** 稳定 key：账号 id 或阵营色。 */
  key: string;
  id: string;
  name: string;
  avatarUrl: string | null;
  color: Color;
  connected: boolean;
  isBot: boolean;
  ready: boolean;
  isHost: boolean;
  sixStreak: number;
  planes: { step: number }[];
};

export type TableView = {
  roomCode: string | null;
  players: TablePlayer[];
  spectators: { id: string; username: string }[];
  turn: number;
  dice: number | null;
  phase: "waiting" | "roll" | "move" | "over";
  winner: Color | null;
  sixOnly: boolean;
  maxPlayers: number;
  event: string;
  legalPlaneIndices: number[];
  /** 服务端时间戳；早于它之前骰子还在停住。单机模式恒为 0。 */
  notBefore: number;
  /** 当前账号的阵营色；观战者为 null。 */
  meColor: Color | null;
  canAct: boolean;
  isHost: boolean;
  onGame: boolean;
  youAreSpectator: boolean;
  active: boolean;
  startAllowed: boolean;
  connected: boolean;
  seq: number;
};

/** 单机：规则引擎状态 → 视图。`meColor` 是人坐在哪个颜色（没有真人为 null）。 */
export function viewFromLocal(
  state: GameState,
  options: { meColor: Color | null; seq: number; connected?: boolean; dice?: number | null }
): TableView {
  const players: TablePlayer[] = state.players.map((player) => ({
    key: player.color,
    id: player.color,
    name: player.name,
    avatarUrl: null,
    color: player.color,
    connected: true,
    isBot: player.ai,
    ready: true,
    isHost: false,
    sixStreak: player.sixStreak,
    planes: player.planes.map((plane) => ({ step: plane.step }))
  }));
  const current = players[state.turn];
  const canAct = !!current && !current.isBot && current.color === options.meColor && !state.winner;
  const legal = canAct && state.phase === "move" && state.dice !== null
    ? legalMoves(state, currentPlayer(state), state.dice).map((move) => move.planeIndex)
    : [];
  return {
    roomCode: null,
    players,
    spectators: [],
    turn: state.turn,
    dice: options.dice !== undefined ? options.dice : state.dice,
    phase: state.phase,
    winner: state.winner,
    sixOnly: state.sixOnly,
    maxPlayers: players.length,
    event: state.event,
    legalPlaneIndices: legal,
    notBefore: 0,
    meColor: options.meColor,
    canAct,
    isHost: false,
    onGame: options.meColor !== null,
    youAreSpectator: false,
    active: true,
    startAllowed: false,
    connected: options.connected ?? true,
    seq: options.seq
  };
}

/** 联机：服务端快照 → 视图。客户端不推导任何规则，可移动机号直接用服务端给的列表。 */
export function viewFromPublic(state: FcPublicState, accountId: string): TableView {
  const players: TablePlayer[] = state.players.map((player) => ({
    key: player.id,
    id: player.id,
    name: player.username,
    avatarUrl: player.avatarUrl,
    color: player.color,
    connected: player.connected,
    isBot: player.isBot,
    ready: player.ready,
    isHost: player.isHost,
    sixStreak: player.sixStreak,
    planes: player.planes
  }));
  const mine = players.find((player) => player.id === accountId) ?? null;
  const current = players[state.turn];
  const canAct = !!mine
    && !mine.isBot
    && !state.youAreSpectator
    && state.active
    && (state.phase === "move" || state.phase === "roll")
    && !!current
    && current.color === mine.color;
  return {
    roomCode: state.roomCode,
    players,
    spectators: state.spectators.map((spectator) => ({ id: spectator.id, username: spectator.username })),
    turn: state.turn,
    dice: state.dice,
    phase: state.phase,
    winner: state.winner,
    sixOnly: state.sixOnly,
    maxPlayers: state.maxPlayers,
    event: state.event,
    legalPlaneIndices: canAct && state.phase === "move" ? state.legalPlaneIndices : [],
    notBefore: state.notBefore,
    meColor: mine?.color ?? null,
    canAct,
    isHost: state.isHost,
    onGame: state.onGame,
    youAreSpectator: state.youAreSpectator,
    active: state.active,
    startAllowed: state.startAllowed,
    connected: true,
    seq: state.seq
  };
}
