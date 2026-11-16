/**
 * 对局界面：单机与联机共用。只消费 `TableView`，不关心状态来自本地 reducer 还是服务端快照。
 *
 * 棋盘高亮来自视图里的 `legalPlaneIndices`；联机时这就是服务端算出的可移动机号，客户端不自己推规则。
 */

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { COLOR_HEX, COLOR_NAME } from "../../game/board.ts";
import type { Color } from "../../game/board.ts";
import type { TableView } from "../table.ts";
import { Board } from "./Board.tsx";
import { Dice } from "./Dice.tsx";

/** 骰子停住后多久才允许操作；服务端用 notBefore 给出这个时刻，这里只负责渲染。 */
function useUnlockAt(notBefore: number, seq: number): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const wait = notBefore - Date.now();
    if (wait <= 0) return undefined;
    const timer = window.setTimeout(() => setNow(Date.now()), wait + 30);
    return () => window.clearTimeout(timer);
  }, [notBefore, seq]);
  return now >= notBefore;
}

export function GameTable({ view, busy, onRoll, onMove, onExit, exitLabel, banner }: {
  view: TableView;
  busy?: boolean;
  onRoll: () => void;
  onMove: (planeIndex: number) => void;
  onExit: () => void;
  exitLabel: string;
  banner?: JSX.Element | null;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const unlocked = useUnlockAt(view.notBefore, view.seq);

  const player = view.players[view.turn];
  const canRoll = view.canAct && view.phase === "roll" && !view.winner && unlocked;
  const canMove = view.canAct && view.phase === "move" && !view.winner && unlocked;
  const diceRolling = !!busy || !unlocked;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <div className="fc-root fc-table-root">
      {banner}
      <div className="table">
        <div className="board-wrap">
          <Board
            players={view.players}
            turn={view.turn}
            highlight={canMove ? view.legalPlaneIndices : []}
            onPick={onMove}
          />
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
                <button type="button" role="menuitem" className="menu-item menu-danger" onClick={() => { setMenuOpen(false); onExit(); }}>{exitLabel}</button>
              </div>
            )}
          </div>

          <div className="scoreboard">
            {view.players.map((entry, index) => {
              const home = entry.planes.filter((plane) => plane.step < 0).length;
              const done = entry.planes.filter((plane) => plane.step >= 53).length;
              return (
                <div key={entry.key} className={`score ${index === view.turn ? "is-turn" : ""}`}>
                  <span className="chip" style={{ borderColor: COLOR_HEX[entry.color] }}>
                    <AvatarHtml name={entry.name} color={entry.color} avatarUrl={entry.avatarUrl} />
                  </span>
                  <span className="score-name">
                    {entry.name}
                    <span className="fc-score-badges">
                      {entry.isHost ? <span className="fc-badge">房主</span> : null}
                      {entry.isBot ? <span className="fc-badge fc-badge-bot">电脑</span> : null}
                      {!entry.connected && !entry.isBot ? <span className="fc-badge fc-badge-off">离线</span> : null}
                      {view.phase === "waiting" && !entry.isBot ? (
                        <span className={`fc-badge ${entry.ready ? "fc-badge-ok" : ""}`}>{entry.ready ? "已准备" : "未准备"}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="score-stat">基地 {home} · 终点 {done}</span>
                </div>
              );
            })}
          </div>

          <div className="turn-box">
            <div className="turn-line">
              {player ? <span className="swatch" style={{ background: COLOR_HEX[player.color] }} /> : null}
              <strong>{player?.name ?? "等待中"}</strong>
              <span className="muted">
                {view.youAreSpectator ? "观战中" : player?.isBot ? "电脑思考中" : view.canAct ? "你的回合" : "等待对方"}
              </span>
            </div>
            {view.roomCode ? <p className="fc-room-code">房间 {view.roomCode}</p> : null}
            <Dice
              value={view.dice}
              rolling={diceRolling}
              onRoll={onRoll}
              disabled={!canRoll}
            />
            <p className="event">{view.event || "点击骰子开始"}</p>
            {view.phase === "roll" && player && player.sixStreak > 0 && !view.winner ? (
              <p className="again">掷出 6 · 再掷一次（连续第 {player.sixStreak} 次）</p>
            ) : null}
            {view.phase === "move" && !unlocked ? <p className="hint">骰子还在转…</p> : null}
            {canMove ? <p className="hint">点击棋盘上高亮的飞机移动</p> : null}
            {!view.active && view.onGame ? <p className="voided">另一个标签页正在操作，这里只能观看</p> : null}
          </div>

          {view.winner ? (
            <div className="winner">
              <strong>{COLOR_NAME[view.winner]}方获胜</strong>
              <button className="primary" onClick={onExit}>{exitLabel}</button>
            </div>
          ) : null}
        </aside>
      </div>

      {showRules ? (
        <div className="modal-backdrop" onClick={() => setShowRules(false)}>
          <div className="modal" role="dialog" aria-label="规则说明" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>规则</h2>
              <button type="button" className="ghost" onClick={() => setShowRules(false)}>关闭</button>
            </div>
            <Rules />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 比分栏里的头像：和棋盘上同一套徽记，用 HTML 实现以便排版。 */
function AvatarHtml({ name, color, avatarUrl }: { name: string; color: Color; avatarUrl: string | null }): JSX.Element {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [avatarUrl]);
  if (avatarUrl && !broken) {
    return <img className="chip-avatar" src={avatarUrl} alt="" onError={() => setBroken(true)} />;
  }
  const initial = name.trim() ? [...name.trim()][0]! : "?";
  return <span className="chip-initial" style={{ background: COLOR_HEX[color] }}>{initial}</span>;
}

export function Rules(): JSX.Element {
  return (
    <section className="panel rules fc-rules">
      <h2>规则</h2>
      <ul>
        <li>每人 4 架飞机，按红 → 绿 → 蓝 → 黄顺时针轮流行动。</li>
        <li>掷出 5 或 6 才能起飞（房主可改为仅 6）。</li>
        <li>掷出 6 可再掷一次；连续三次 6，第三次作废且不移动。</li>
        <li>沿外圈绕行一周后进入本色跑道，必须精确抵达终点。</li>
        <li>落在敌机所在格会将其送回基地；起飞格与捷径格是安全格。</li>
        <li>落在本色捷径格可向前跳 12 格。</li>
        <li>4 架飞机全部抵达终点者获胜。</li>
      </ul>
    </section>
  );
}
