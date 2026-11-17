/**
 * 规则引擎：服务端将来是唯一可信状态，这里先把同一份逻辑写成纯函数，
 * 单机模式直接用，将来搬到服务端不需要改。
 *
 * 一条行动链的结果由 resolveMove 一次算完，按提示词规定的优先级：
 *   普通移动 → 捷径跳跃 → 落点撞机（安全格豁免）→ 终点判定 → 是否额外回合
 */

import {
  COLORS, RING_SIZE, START_INDEX, ENTRY_INDEX, SHORTCUT_CELL, SHORTCUT_JUMP,
  SAFE_INDICES, LAST_RING_STEP, GOAL_STEP, RUNWAY_LEN
} from "./board.ts";
import type { Color } from "./board.ts";

export type PlaneState = {
  /** -1 = 停机坪；0..47 环线步数；48..52 跑道；53 终点。 */
  step: number;
};

export type Player = {
  color: Color;
  name: string;
  /** 是否电脑控制。 */
  ai: boolean;
  planes: PlaneState[];
  /** 连续掷出 6 的次数。 */
  sixStreak: number;
};

export type Phase = "roll" | "move" | "over";

export type GameState = {
  players: Player[];
  turn: number;
  /** 当前玩家掷出的点数；phase 为 move 时有效。 */
  dice: number | null;
  /** 上一次掷骰是否因连续三次 6 而作废。 */
  voided: boolean;
  phase: Phase;
  winner: Color | null;
  /** 最近一条事件文案，界面用来提示。 */
  event: string;
  /** 房主设置：仅 6 起飞。 */
  sixOnly: boolean;
};

export type Move = {
  planeIndex: number;
  /** 这次移动的最终 step。 */
  toStep: number;
  /** 途中经过的 step 列表，用于逐格位移动画。 */
  path: number[];
  /** 触发事件，按发生顺序。 */
  events: string[];
  /** 落点撞回基地的敌对飞机。 */
  captured: { color: Color; planeIndex: number }[];
};

export function createGame(opts: {
  players: { color: Color; name: string; ai: boolean }[];
  sixOnly?: boolean;
}): GameState {
  return {
    players: opts.players.map((p) => ({
      color: p.color,
      name: p.name,
      ai: p.ai,
      planes: [0, 1, 2, 3].map(() => ({ step: -1 })),
      sixStreak: 0
    })),
    turn: 0,
    dice: null,
    voided: false,
    phase: "roll",
    winner: null,
    event: "",
    sixOnly: !!opts.sixOnly
  };
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.turn]!;
}

/** 掷骰。返回 1..6。 */
export function rollDice(random: () => number = Math.random): number {
  return 1 + Math.floor(random() * 6);
}

export function canLaunch(state: GameState, player: Player, dice: number): boolean {
  // 起飞条件：默认 5 或 6；房主可设仅 6。
  return state.sixOnly ? dice === 6 : dice >= 5;
}

/**
 * 列出一个点数下的所有合法移动。空数组表示无合法移动。
 * 规则：
 *  - 停机坪上的飞机，只有满足起飞条件才能动，落到起飞格。
 *  - 环线/跑道上的飞机，前进 dice 步不能超过终点。
 */
export function legalMoves(state: GameState, player: Player, dice: number): Move[] {
  const moves: Move[] = [];
  player.planes.forEach((plane, index) => {
    if (plane.step >= GOAL_STEP) return; // 已到终点
    if (plane.step < 0) {
      if (!canLaunch(state, player, dice)) return;
      moves.push({
        planeIndex: index,
        toStep: 0,
        path: [0],
        events: ["起飞"],
        captured: []
      });
      return;
    }
    const target = plane.step + dice;
    // 环线内允许越过 LAST_RING_STEP 进入跑道，但不能超过对应该色的终点
    if (target > GOAL_STEP) return;
    const path: number[] = [];
    for (let s = plane.step + 1; s <= target; s++) path.push(s);
    moves.push({ planeIndex: index, toStep: target, path, events: [], captured: [] });
  });
  return moves;
}

/** 某色飞机在环线上的绝对格号，跑道/基地/终点返回 null。 */
export function ringIndexAt(color: Color, step: number): number | null {
  if (step < 0 || step > LAST_RING_STEP) return null;
  return (START_INDEX[color] + step) % RING_SIZE;
}

/** 把捷径、撞机、终点等副作用一次性算出来。纯函数：只读状态，不改任何飞机。 */
export function resolveMove(state: GameState, player: Player, move: Move): Move {
  const events: string[] = [...move.events];
  const captured: { color: Color; planeIndex: number }[] = [];
  let step = move.toStep;

  // 1. 捷径：落点正好是本色捷径格，且还在环线上
  const landingIndex = ringIndexAt(player.color, step);
  if (landingIndex !== null && SHORTCUT_CELL[player.color] === landingIndex) {
    const jumped = step + SHORTCUT_JUMP;
    if (jumped <= LAST_RING_STEP) {
      step = jumped;
      events.push("触发捷径");
      // 捷径落点也要参与撞机判定
    }
  }

  // 2. 撞机：落点在环线上且不是安全格
  const finalIndex = ringIndexAt(player.color, step);
  if (finalIndex !== null && !SAFE_INDICES.includes(finalIndex)) {
    for (const other of state.players) {
      if (other.color === player.color) continue;
      other.planes.forEach((plane, planeIndex) => {
        if (plane.step < 0 || plane.step > LAST_RING_STEP) return;
        if (ringIndexAt(other.color, plane.step) === finalIndex) {
          captured.push({ color: other.color, planeIndex });
        }
      });
    }
    if (captured.length > 0) events.push("击落敌机");
  }

  // 3. 终点
  if (step === GOAL_STEP) events.push("抵达终点");

  return { ...move, toStep: step, events, captured };
}

/** 执行一步移动，推进状态。moves 必须来自 legalMoves。 */
export function applyMove(state: GameState, move: Move): GameState {
  const player = currentPlayer(state);
  const resolved = resolveMove(state, player, move);

  // 复制所有飞机再改，避免和调用方共享引用（AI 评估会反复调用 resolveMove）。
  const players = state.players.map((p) => ({
    ...p,
    planes: p.planes.map((plane) => ({ ...plane }))
  }));
  const mover = players[state.turn]!;

  mover.planes[resolved.planeIndex]!.step = resolved.toStep;
  for (const hit of resolved.captured) {
    const victim = players.find((p) => p.color === hit.color);
    if (victim) victim.planes[hit.planeIndex]!.step = -1;
  }

  const won = mover.planes.every((plane) => plane.step >= GOAL_STEP);
  const dice = state.dice ?? 0;
  const extraTurn = dice === 6 && !won;

  return {
    ...state,
    players,
    event: resolved.events.join(" · "),
    winner: won ? mover.color : null,
    phase: won ? "over" : "roll",
    turn: won || extraTurn ? state.turn : (state.turn + 1) % players.length,
    dice: null,
    voided: false
  };
}

/** 掷骰后决定进入移动阶段还是直接结束（无合法移动 / 三连 6 作废）。 */
export function afterRoll(state: GameState, dice: number): GameState {
  const player = currentPlayer(state);

  // 连续三次 6：第三次作废，不移动，回合结束。
  if (dice === 6) {
    player.sixStreak += 1;
    if (player.sixStreak >= 3) {
      player.sixStreak = 0;
      return {
        ...state,
        dice: null,
        voided: true,
        event: `${player.name} 连续三次 6，本次作废`,
        phase: "roll",
        turn: (state.turn + 1) % state.players.length
      };
    }
  } else {
    player.sixStreak = 0;
  }

  const moves = legalMoves(state, player, dice);
  if (moves.length === 0) {
    return {
      ...state,
      dice: null,
      voided: false,
      event: `${player.name} 掷出 ${dice}，无合法移动`,
      phase: "roll",
      turn: (state.turn + 1) % state.players.length
    };
  }

  return {
    ...state,
    dice,
    voided: false,
    event: `${player.name} 掷出 ${dice}`,
    phase: "move"
  };
}

/** 电脑玩家选一步：优先能撞机 > 能到终点 > 能起飞 > 走得最远。 */
export function pickAiMove(state: GameState, dice: number): Move | null {
  const player = currentPlayer(state);
  const moves = legalMoves(state, player, dice);
  if (moves.length === 0) return null;

  const scored = moves.map((move) => {
    const resolved = resolveMove(state, player, move);
    let score = resolved.toStep;
    if (resolved.captured.length > 0) score += 1000;
    if (resolved.toStep === GOAL_STEP) score += 500;
    if (move.events.includes("起飞")) score += 200;
    return { move, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.move;
}

/** 供界面使用：某格的飞机数量，用于避免完全遮挡。 */
export function planesAt(state: GameState, index: number): { color: Color; planeIndex: number }[] {
  const found: { color: Color; planeIndex: number }[] = [];
  for (const player of state.players) {
    player.planes.forEach((plane, planeIndex) => {
      if (ringIndexAt(player.color, plane.step) === index) found.push({ color: player.color, planeIndex });
    });
  }
  return found;
}

export { COLORS, GOAL_STEP, LAST_RING_STEP, RUNWAY_LEN, START_INDEX, ENTRY_INDEX };
