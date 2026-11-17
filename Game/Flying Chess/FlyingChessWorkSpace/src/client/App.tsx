/**
 * 单机版的独立开发入口。线上由站点的 `/flying-chess` 路由挂载 `FlyingChessEntry`；
 * 这里保留同一套大厅与对局界面，方便单独 `npm run dev` 调试规则与视觉。
 */

import { useState } from "react";
import type { JSX } from "react";
import { COLORS, COLOR_HEX, COLOR_NAME } from "../game/board.ts";
import type { Color } from "../game/board.ts";
import { GameTable, Rules } from "./components/GameTable.tsx";
import { useFlyingChessGame } from "./useFlyingChessGame.ts";
import type { LocalSetupSeat } from "./useFlyingChessGame.ts";

const DEFAULT_SETUP: LocalSetupSeat[] = [
  { color: "green", name: "你", ai: false },
  { color: "red", name: "电脑 A", ai: true },
  { color: "yellow", name: "电脑 B", ai: true },
  { color: "blue", name: "电脑 C", ai: true }
];

export function App(): JSX.Element {
  const [screen, setScreen] = useState<"lobby" | "game">("lobby");
  const [setup, setSetup] = useState<LocalSetupSeat[]>(DEFAULT_SETUP);
  const [sixOnly, setSixOnly] = useState(false);
  const [round, setRound] = useState(0);

  if (screen === "game") {
    return (
      <LocalGame
        key={`${round}-${sixOnly}-${setup.map((seat) => `${seat.color}${seat.ai ? 1 : 0}`).join("")}`}
        setup={setup}
        sixOnly={sixOnly}
        onExit={() => setScreen("lobby")}
        onAgain={() => setRound((value) => value + 1)}
      />
    );
  }

  return (
    <div className="fc-root fc-lobby-root">
      <div className="fc-center">
        <Lobby setup={setup} setSetup={setSetup} sixOnly={sixOnly} setSixOnly={setSixOnly}
          onStart={() => setScreen("game")} />
        <Rules />
      </div>
    </div>
  );
}

function Lobby({ setup, setSetup, sixOnly, setSixOnly, onStart }: {
  setup: LocalSetupSeat[];
  setSetup: (value: LocalSetupSeat[]) => void;
  sixOnly: boolean;
  setSixOnly: (value: boolean) => void;
  onStart: () => void;
}): JSX.Element {
  const count = setup.length;
  const resize = (n: number): void => {
    const next = setup.slice(0, n);
    while (next.length < n) {
      const used = new Set(next.map((seat) => seat.color));
      const color = COLORS.find((candidate) => !used.has(candidate))!;
      next.push({ color, name: `电脑 ${COLOR_NAME[color]}`, ai: true });
    }
    setSetup(next);
  };

  return (
    <section className="panel">
      <header className="topbar">
        <h1>飞行棋</h1>
        <p className="muted">2–4 人 · 单机练习</p>
      </header>

      <div className="field">
        <span className="label">人数</span>
        <div className="segmented">
          {[2, 3, 4].map((n) => (
            <button key={n} type="button" className={count === n ? "is-on" : ""} onClick={() => resize(n)}>{n} 人</button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">起飞条件</span>
        <div className="segmented">
          <button type="button" className={!sixOnly ? "is-on" : ""} onClick={() => setSixOnly(false)}>5 或 6</button>
          <button type="button" className={sixOnly ? "is-on" : ""} onClick={() => setSixOnly(true)}>仅 6</button>
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

      <button type="button" className="primary wide" onClick={onStart}>开始对局</button>
    </section>
  );
}

function LocalGame({ setup, sixOnly, onExit, onAgain }: {
  setup: LocalSetupSeat[];
  sixOnly: boolean;
  onExit: () => void;
  onAgain: () => void;
}): JSX.Element {
  const game = useFlyingChessGame(setup, sixOnly);
  return (
    <GameTable
      view={game.view}
      busy={game.busy}
      onRoll={game.roll}
      onMove={game.move}
      onExit={onExit}
      exitLabel="返回大厅"
      banner={game.view.winner ? (
        <div className="fc-banner">
          <span>对局结束</span>
          <button type="button" className="fc-banner-action" onClick={onAgain}>再来一局</button>
        </div>
      ) : null}
    />
  );
}

export type { Color };
