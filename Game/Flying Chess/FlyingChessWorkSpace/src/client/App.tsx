import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { Board } from "./components/Board.tsx";
import { Dice } from "./components/Dice.tsx";
import { Avatar } from "./components/Avatar.tsx";
import { COLORS, COLOR_HEX, COLOR_NAME } from "@game/board.ts";
import type { Color } from "@game/board.ts";
import {
  afterRoll, applyMove, createGame, currentPlayer, legalMoves, pickAiMove, rollDice
} from "@game/rules.ts";
import type { GameState } from "@game/rules.ts";

type Setup = { color: Color; name: string; ai: boolean };

const DEFAULT_SETUP: Setup[] = [
  { color: "green", name: "你", ai: false },
  { color: "red", name: "电脑 A", ai: true },
  { color: "yellow", name: "电脑 B", ai: true },
  { color: "blue", name: "电脑 C", ai: true }
];

/** 骰子停住后停留多久再进入下一步，让玩家看清点数。 */
const DICE_READ_MS = 1100;

export function App(): JSX.Element {
  const [screen, setScreen] = useState<"lobby" | "game">("lobby");
  const [setup, setSetup] = useState<Setup[]>(DEFAULT_SETUP);
  const [sixOnly, setSixOnly] = useState(false);
  const [state, setState] = useState<GameState | null>(null);

  const start = () => {
    setState(createGame({ players: setup, sixOnly }));
    setScreen("game");
  };

  if (screen === "lobby" || !state) {
    return (
      <Lobby setup={setup} setSetup={setSetup} sixOnly={sixOnly} setSixOnly={setSixOnly} onStart={start} />
    );
  }

  return (
    <GameTable
      state={state}
      setState={setState}
      onExit={() => { setState(null); setScreen("lobby"); }}
    />
  );
}

function Lobby({ setup, setSetup, sixOnly, setSixOnly, onStart }: {
  setup: Setup[];
  setSetup: (value: Setup[]) => void;
  sixOnly: boolean;
  setSixOnly: (value: boolean) => void;
  onStart: () => void;
}): JSX.Element {
  const count = setup.length;
  const resize = (n: number) => {
    const next = setup.slice(0, n);
    while (next.length < n) {
      const used = new Set(next.map((s) => s.color));
      const color = COLORS.find((c) => !used.has(c))!;
      next.push({ color, name: `电脑 ${COLOR_NAME[color]}`, ai: true });
    }
    setSetup(next);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <h1>飞行棋</h1>
        <p className="muted">2–4 人 · 单机练习</p>
      </header>

      <section className="panel">
        <h2>对局设置</h2>

        <div className="field">
          <span className="label">人数</span>
          <div className="segmented">
            {[2, 3, 4].map((n) => (
              <button key={n} className={count === n ? "is-on" : ""} onClick={() => resize(n)}>{n} 人</button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">起飞条件</span>
          <div className="segmented">
            <button className={!sixOnly ? "is-on" : ""} onClick={() => setSixOnly(false)}>5 或 6</button>
            <button className={sixOnly ? "is-on" : ""} onClick={() => setSixOnly(true)}>仅 6</button>
          </div>
        </div>

        <div className="seats">
          {setup.map((seat, index) => (
            <div key={seat.color} className="seat">
              <span className="swatch" style={{ background: COLOR_HEX[seat.color] }} />
              <span className="seat-name">{COLOR_NAME[seat.color]}方</span>
              <input
                className="seat-input"
                value={seat.name}
                maxLength={8}
                aria-label={`${COLOR_NAME[seat.color]}方昵称`}
                onChange={(event) => {
                  const next = [...setup];
                  next[index] = { ...seat, name: event.target.value };
                  setSetup(next);
                }}
              />
              <select
                value={seat.ai ? "ai" : "human"}
                aria-label={`${COLOR_NAME[seat.color]}方控制者`}
                onChange={(event) => {
                  const next = [...setup];
                  next[index] = { ...seat, ai: event.target.value === "ai" };
                  setSetup(next);
                }}
              >
                <option value="human">玩家</option>
                <option value="ai">电脑</option>
              </select>
            </div>
          ))}
        </div>

        <button className="primary wide" onClick={onStart}>开始对局</button>
      </section>

      <Rules />
    </div>
  );
}

function Rules(): JSX.Element {
  return (
    <section className="panel rules">
      <h2>规则</h2>
      <ul>
        <li>每人 4 架飞机，按红 → 绿 → 蓝 → 黄顺时针轮流行动。</li>
        <li>掷出 5 或 6 才能起飞（可在设置中改为仅 6）。</li>
        <li>掷出 6 可再掷一次；连续三次 6，第三次作废且不移动。</li>
        <li>沿外圈绕行一周后进入本色跑道，必须精确抵达终点。</li>
        <li>落在敌机所在格会将其送回基地；起飞格与捷径格是安全格。</li>
        <li>落在本色捷径格可向前跳 12 格。</li>
        <li>4 架飞机全部抵达终点者获胜。</li>
      </ul>
    </section>
  );
}

function GameTable({ state, setState, onExit }: {
  state: GameState;
  setState: (state: GameState) => void;
  onExit: () => void;
}): JSX.Element {
  const player = currentPlayer(state);
  const moves = useMemo(
    () => (state.phase === "move" && state.dice !== null ? legalMoves(state, player, state.dice) : []),
    [state, player]
  );

  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const timer = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const doRoll = useCallback(() => {
    if (busy || state.phase !== "roll" || state.winner) return;
    setBusy(true);
    const value = rollDice();
    const next = afterRoll(state, value);
    // 先把点数显示出来并停住，让玩家看清自己掷了什么，再进入移动或换人。
    setState({ ...state, dice: value, event: `${player.name} 掷出 ${value}`, voided: false });
    window.setTimeout(() => {
      setState(next);
      setBusy(false);
    }, DICE_READ_MS);
  }, [busy, state, setState, player.name]);

  const doMove = useCallback((moveIndex: number) => {
    const move = moves[moveIndex];
    if (!move) return;
    setState(applyMove(state, move));
  }, [moves, state, setState]);

  // 电脑回合：掷骰 → 移动。等待时间覆盖了骰子停留，所以电脑的点数也看得清。
  useEffect(() => {
    if (!player.ai || state.winner || busy) return;
    if (state.phase === "roll") {
      timer.current = window.setTimeout(() => doRoll(), 700);
    } else if (state.phase === "move" && state.dice !== null) {
      const move = pickAiMove(state, state.dice);
      const index = move ? moves.findIndex((m) => m.planeIndex === move.planeIndex) : -1;
      timer.current = window.setTimeout(() => {
        if (index >= 0) doMove(index);
      }, DICE_READ_MS);
    }
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [player.ai, state, moves, doRoll, doMove, busy]);

  // 点空白处收起菜单。
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <div className="table">
      <div className="board-wrap">
        <Board state={state} highlight={moves} onPick={doMove} />
      </div>

      <aside className="side">
        <div className="menu-anchor" ref={menuRef}>
          <button
            type="button"
            className="hamburger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="对局菜单"
            title="对局菜单"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="menu" role="menu" aria-label="对局菜单">
              <button type="button" role="menuitem" className="menu-item" onClick={() => { setMenuOpen(false); setShowRules(true); }}>规则说明</button>
              <button type="button" role="menuitem" className="menu-item menu-danger" onClick={() => { setMenuOpen(false); onExit(); }}>退出对局</button>
            </div>
          )}
        </div>

        <div className="scoreboard">
          {state.players.map((p, index) => {
            const home = p.planes.filter((plane) => plane.step < 0).length;
            const done = p.planes.filter((plane) => plane.step >= 53).length;
            return (
              <div key={p.color} className={`score ${index === state.turn ? "is-turn" : ""}`}>
                <span className="chip" style={{ borderColor: COLOR_HEX[p.color] }}>
                  <AvatarHtml name={p.name} color={p.color} />
                </span>
                <span className="score-name">{p.name}</span>
                <span className="score-stat">基地 {home} · 终点 {done}</span>
              </div>
            );
          })}
        </div>

        <div className="turn-box">
          <div className="turn-line">
            <span className="swatch" style={{ background: COLOR_HEX[player.color] }} />
            <strong>{player.name}</strong>
            <span className="muted">{player.ai ? "思考中" : "你的回合"}</span>
          </div>
          <Dice
            value={state.dice}
            rolling={busy}
            onRoll={doRoll}
            disabled={busy || state.phase !== "roll" || player.ai || !!state.winner}
          />
          <p className="event">{state.event || "点击骰子开始"}</p>
          {state.phase === "roll" && player.sixStreak > 0 && !state.winner && (
            <p className="again">掷出 6 · 再掷一次（连续第 {player.sixStreak} 次）</p>
          )}
          {state.voided && <p className="voided">连续三次 6，本次作废</p>}
        </div>

        {state.phase === "move" && !player.ai && (
          <p className="hint">点击棋盘上高亮的飞机移动</p>
        )}

        {state.winner && (
          <div className="winner">
            <strong>{COLOR_NAME[state.winner]}方获胜</strong>
            <button className="primary" onClick={onExit}>返回大厅</button>
          </div>
        )}
      </aside>

      {showRules && (
        <div className="modal-backdrop" onClick={() => setShowRules(false)}>
          <div className="modal" role="dialog" aria-label="规则说明" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>规则</h2>
              <button type="button" className="ghost" onClick={() => setShowRules(false)}>关闭</button>
            </div>
            <Rules />
          </div>
        </div>
      )}
    </div>
  );
}

/** 比分栏里的头像：和棋盘上同一套徽记，用 HTML 实现以便排版。 */
function AvatarHtml({ name, color }: { name: string; color: Color }): JSX.Element {
  const initial = name.trim() ? [...name.trim()][0]! : "?";
  return <span className="chip-initial" style={{ background: COLOR_HEX[color] }}>{initial}</span>;
}
