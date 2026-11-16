/**
 * 单机模式的"对局层"：一个 hook 持有一局本地规则引擎，暴露与联机相同的 `roll` / `move`。
 *
 * 骰子停住 1.1 秒才推进，和联机版的节奏一致；电脑回合也走同一套 `pickAiMove`。
 * 棋面之外的规则表现由 `src/game/rules.ts` 决定，本文件只负责时序与渲染状态。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Color } from "../game/board.ts";
import {
  afterRoll, applyMove, createGame, currentPlayer, legalMoves, pickAiMove, rollDice
} from "../game/rules.ts";
import type { GameState } from "../game/rules.ts";
import { viewFromLocal } from "./table.ts";
import type { TableView } from "./table.ts";

export type LocalSetupSeat = { color: Color; name: string; ai: boolean };

/** 骰子停住后停留多久再进入下一步，让玩家看清点数。 */
const DICE_READ_MS = 1_100;
/** 电脑掷骰前的停顿。 */
const BOT_THINK_MS = 700;

export function useFlyingChessGame(setup: LocalSetupSeat[], sixOnly: boolean): {
  view: TableView;
  busy: boolean;
  roll: () => void;
  move: (planeIndex: number) => void;
} {
  const [state, setState] = useState<GameState>(() => createGame({ players: setup, sixOnly }));
  const [dice, setDice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(0);

  const stateRef = useRef(state);
  const busyRef = useRef(false);
  const timer = useRef<number | null>(null);
  stateRef.current = state;

  const meColor = useMemo<Color | null>(
    () => setup.find((seat) => !seat.ai)?.color ?? null,
    [setup]
  );

  const roll = useCallback(() => {
    const current = stateRef.current;
    if (busyRef.current || current.phase !== "roll" || current.winner) return;
    busyRef.current = true;
    setBusy(true);
    const value = rollDice();
    setDice(value);
    const next = afterRoll(current, value);
    // 先把点数停住，再推进到移动或换人。
    timer.current = window.setTimeout(() => {
      timer.current = null;
      busyRef.current = false;
      setBusy(false);
      setState(next);
      setSeq((value) => value + 1);
    }, DICE_READ_MS);
  }, []);

  const move = useCallback((planeIndex: number) => {
    const current = stateRef.current;
    if (busyRef.current || current.phase !== "move" || current.dice === null) return;
    const player = currentPlayer(current);
    const found = legalMoves(current, player, current.dice).find((entry) => entry.planeIndex === planeIndex);
    if (!found) return;
    setState(applyMove(current, found));
    setSeq((value) => value + 1);
  }, []);

  // 电脑回合：掷骰 → 移动；等待时间覆盖骰子停留，所以电脑的点数也看得清。
  useEffect(() => {
    const current = currentPlayer(state);
    if (!current.ai || busy || state.winner) return undefined;
    let handle: number | null = null;
    if (state.phase === "roll") {
      handle = window.setTimeout(() => roll(), BOT_THINK_MS);
    } else if (state.phase === "move" && state.dice !== null) {
      const pick = pickAiMove(state, state.dice);
      if (pick) handle = window.setTimeout(() => move(pick.planeIndex), DICE_READ_MS);
    }
    return () => { if (handle !== null) window.clearTimeout(handle); };
  }, [state, busy, roll, move]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const view = useMemo(
    () => viewFromLocal(state, { meColor, seq, dice }),
    [state, meColor, seq, dice]
  );

  return { view, busy, roll, move };
}
