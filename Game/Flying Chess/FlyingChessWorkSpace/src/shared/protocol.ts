/**
 * 飞行棋的线上协议：服务端与客户端共用同一份类型。
 *
 * 服务端是唯一可信状态：客户端只提交"意图"，这里定义的 `FcPublicState` 是它渲染所需的全部信息，
 * 不含任何只有服务端才知道的东西（下一个点数、未来事件）。
 */

import type { Color } from "../game/board.ts";

/** 房间阶段；`seq` 每次广播递增，客户端据此丢弃过期快照。 */
export type FcPhase = "waiting" | "roll" | "move" | "over";

export type FcPlayerView = {
  /** 账号 id；电脑托管座位是 `bot:<颜色>`。 */
  id: string;
  username: string;
  avatarUrl: string | null;
  color: Color;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  isHost: boolean;
  /** 四架飞机：-1 基地，0..47 环线，48..52 跑道，53 终点。 */
  planes: { step: number }[];
  /** 连续掷出 6 的次数。 */
  sixStreak: number;
};

export type FcSpectatorView = {
  id: string;
  username: string;
  avatarUrl: string | null;
  connected: boolean;
};

export type FcPublicState = {
  roomCode: string;
  phase: FcPhase;
  players: FcPlayerView[];
  spectators: FcSpectatorView[];
  hostId: string;
  maxPlayers: number;
  sixOnly: boolean;
  /** `players` 数组下标。 */
  turn: number;
  /** 最近一次掷出的点数，停住不消失，供界面显示。 */
  dice: number | null;
  winner: Color | null;
  /**
   * 当前这一步可合法移动的机号。客户端只用来高亮，不自己推算规则。
   * 不在移动阶段时为空数组。
   */
  legalPlaneIndices: number[];
  /** 最近事件文案（"起飞"、"击落敌机"、"触发捷径"…）。 */
  event: string;
  /** 每次广播递增。 */
  seq: number;
  /** 服务端时间戳：早于它之前不应操作，用于保留骰子停留的 1.1 秒。 */
  notBefore: number;
  startAllowed: boolean;
  isHost: boolean;
  /** 该账号是否坐在座位上（否则是观战者）。 */
  onGame: boolean;
  youAreSpectator: boolean;
  /** 该连接是否是本账号当前的操作连接；同一账号多开时只有最近的一连接为 true。 */
  active: boolean;
};

export type FcRoomSummary = {
  code: string;
  host: string;
  players: number;
  maxPlayers: number;
  spectators: number;
  phase: "waiting" | "playing" | "over";
  sixOnly: boolean;
};

export type FcErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_LIMIT"
  | "NOT_IN_ROOM"
  | "GAME_STARTED"
  | "NOT_STARTED"
  | "NOT_HOST"
  | "NOT_YOUR_TURN"
  | "NOT_NOW"
  | "NOT_YET"
  | "INVALID_MOVE"
  | "COLOR_TAKEN"
  | "READ_ONLY"
  | "INVALID_ACTION";

export type FcAccount = {
  id: string;
  username: string;
  avatarUrl?: string | null;
};

/** 客户端 → 服务端的动作名，集中在协议文档与两端的 switch 里。 */
export type FcClientEvent =
  | "fc:rooms:request"
  | "fc:create"
  | "fc:join"
  | "fc:leave"
  | "fc:config"
  | "fc:seats"
  | "fc:ready"
  | "fc:start"
  | "fc:roll"
  | "fc:move"
  | "fc:bot"
  | "fc:rejoin"
  | "fc:health";
