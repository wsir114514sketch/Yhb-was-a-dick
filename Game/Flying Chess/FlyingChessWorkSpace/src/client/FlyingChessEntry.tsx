/**
 * 飞行棋在站点里的入口：选择单机/联机、联机大厅、等待室，以及对局界面。
 *
 * 单机与联机共用 `GameTable`；两者都通过 `TableView` 渲染，规则表现一致。
 */

import { useMemo, useState } from "react";
import type { JSX } from "react";
import "./styles.css";
import { COLORS, COLOR_HEX, COLOR_NAME } from "../game/board.ts";
import type { Color } from "../game/board.ts";
import type { FcRoomSummary } from "../shared/protocol.ts";
import { GameTable, Rules } from "./components/GameTable.tsx";
import { useFlyingChessGame } from "./useFlyingChessGame.ts";
import type { LocalSetupSeat } from "./useFlyingChessGame.ts";
import { useFlyingChessOnline, roomFromUrl } from "./useFlyingChessOnline.ts";
import { viewFromPublic } from "./table.ts";

/** 上次还在房间里：刷新后直接回联机，让 hook 自动 rejoin。 */
function hasLastRoom(): boolean {
  try {
    return !!localStorage.getItem("flying-chess.room");
  } catch {
    return false;
  }
}

export interface FlyingChessAccount {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

export function FlyingChessEntry({ account, token, connection }: {
  account: FlyingChessAccount;
  token: string | null;
  connection: string;
}): JSX.Element {
  // 分享链接 `/flying-chess?room=ABCD` 直接进联机大厅；刷新时若上次还在房间里，也直接回联机，
  // 由 hook 的 `fc:rejoin` 走回原座位。
  const [mode, setMode] = useState<"choose" | "local" | "online">(() => (roomFromUrl() || hasLastRoom() ? "online" : "choose"));
  const [seats, setSeats] = useState(3);
  const [sixOnly, setSixOnly] = useState(false);

  if (mode === "local") {
    return <LocalGame seats={seats} sixOnly={sixOnly} onExit={() => setMode("choose")} />;
  }
  if (mode === "choose") {
    return (
      <StartScreen
        account={account}
        connection={connection}
        tokenReady={!!token}
        seats={seats}
        setSeats={setSeats}
        sixOnly={sixOnly}
        setSixOnly={setSixOnly}
        onLocal={() => setMode("local")}
        onOnline={() => setMode("online")}
      />
    );
  }
  return <OnlineEntry account={account} token={token!} />;
}

function StartScreen({ account, connection, tokenReady, seats, setSeats, sixOnly, setSixOnly, onLocal, onOnline }: {
  account: FlyingChessAccount;
  connection: string;
  tokenReady: boolean;
  seats: number;
  setSeats: (value: number) => void;
  sixOnly: boolean;
  setSixOnly: (value: boolean) => void;
  onLocal: () => void;
  onOnline: () => void;
}): JSX.Element {
  return (
    <div className="fc-root fc-lobby-root">
      <div className="fc-center">
        <section className="panel fc-start">
          <header className="topbar">
            <h1>飞行棋</h1>
            <p className="muted">2–4 人 · 掷骰起飞 · 四机到终点</p>
          </header>

          <div className="field">
            <span className="label">人数</span>
            <div className="segmented">
              {[2, 3, 4].map((count) => (
                <button key={count} type="button" className={seats === count ? "is-on" : ""} onClick={() => setSeats(count)}>
                  {count} 人
                </button>
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

          <button type="button" className="primary wide" onClick={onLocal}>单机练习</button>

          <div className="fc-split" />

          <button type="button" className="primary wide" onClick={onOnline} disabled={!tokenReady}>联机大厅</button>
          <p className="faint">
            {tokenReady ? `已登录：${account.username}，可以创建或加入房间。` : `当前连接：${connection}，登录后才能联机。`}
          </p>
        </section>

        <Rules />
      </div>
    </div>
  );
}

/** 单机：本地规则引擎，其余座位是电脑。 */
function LocalGame({ seats, sixOnly, onExit }: { seats: number; sixOnly: boolean; onExit: () => void }): JSX.Element {
  const [round, setRound] = useState(0);
  const setup = useMemo<LocalSetupSeat[]>(() => {
    const chosen: Color[] = ["green", "red", "yellow", "blue"].slice(0, Math.max(2, Math.min(4, seats))) as Color[];
    return chosen.map((color, index) => ({
      color,
      name: index === 0 ? "你" : `电脑·${COLOR_NAME[color]}`,
      ai: index !== 0
    }));
  }, [seats, round]);
  return <LocalRound key={`${seats}-${sixOnly}-${round}`} setup={setup} sixOnly={sixOnly} onExit={onExit} onAgain={() => setRound((value) => value + 1)} />;
}

function LocalRound({ setup, sixOnly, onExit, onAgain }: {
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
      exitLabel="退出对局"
      banner={game.view.winner ? (
        <div className="fc-banner">
          <span>对局结束</span>
          <button type="button" className="fc-banner-action" onClick={onAgain}>再来一局</button>
        </div>
      ) : null}
    />
  );
}

/** 联机：服务端拥有对局，这里只显示它说的状态并把意图发回去。 */
function OnlineEntry({ account, token }: { account: FlyingChessAccount; token: string }): JSX.Element {
  const game = useFlyingChessOnline(account, token, { autoRoom: roomFromUrl() });
  const state = game.state;

  const toast = game.error ? <div className="fc-toast" role="status">{game.error}</div> : null;

  if (game.status === "auth-required") {
    return (
      <div className="fc-root fc-lobby-root">
        <div className="fc-center"><section className="panel"><p className="muted">登录状态已失效，请刷新页面重新登录。</p></section></div>
      </div>
    );
  }

  if (!state) {
    return (
      <>
        {toast}
        <OnlineLobby
          rooms={game.rooms}
          status={game.status}
          onCreate={game.createRoom}
          onJoin={game.joinRoom}
          onRefresh={game.refreshRooms}
          onBack={() => window.location.assign("/")}
        />
      </>
    );
  }

  if (state.phase === "waiting") {
    return (
      <>
        {toast}
        <WaitingRoom game={game} accountId={account.id} />
      </>
    );
  }

  const view = viewFromPublic(state, account.id);
  return (
    <>
      {toast}
      <GameTable
        view={view}
        onRoll={game.roll}
        onMove={game.move}
        onExit={() => { void game.leave(); }}
        exitLabel="离开房间"
        banner={
          <>
            {state.youAreSpectator ? <div className="fc-banner">观战中 · 只能看，不能操作</div> : null}
            {!state.youAreSpectator && !state.active ? <div className="fc-banner fc-banner-warn">同一账号在另一个标签页操作中</div> : null}
            {game.status !== "connected" ? <div className="fc-banner fc-banner-warn">连接中断，正在重连…</div> : null}
          </>
        }
      />
    </>
  );
}

// ---------------- 大厅 ----------------

function OnlineLobby({ rooms, status, onCreate, onJoin, onRefresh, onBack }: {
  rooms: FcRoomSummary[];
  status: string;
  onCreate: (options: { maxPlayers?: number; sixOnly?: boolean }) => Promise<boolean>;
  onJoin: (code: string, asSpectator?: boolean) => Promise<boolean>;
  onRefresh: () => void;
  onBack: () => void;
}): JSX.Element {
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [sixOnly, setSixOnly] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async (): Promise<void> => {
    setBusy(true);
    await onCreate({ maxPlayers, sixOnly });
    setBusy(false);
  };
  const join = async (asSpectator: boolean): Promise<void> => {
    if (code.trim().length === 0) return;
    setBusy(true);
    await onJoin(code, asSpectator);
    setBusy(false);
  };

  return (
    <div className="fc-root fc-lobby-root">
      <div className="fc-center">
        <section className="panel">
          <header className="topbar fc-topbar-row">
            <div>
              <h1>联机大厅</h1>
              <p className="muted" data-fc-status={status}>{status === "connected" ? "已连接服务器" : "正在连接服务器…"}</p>
            </div>
            <button type="button" className="ghost" onClick={onBack}>返回主页</button>
          </header>

          <div className="field">
            <span className="label">人数</span>
            <div className="segmented">
              {[2, 3, 4].map((count) => (
                <button key={count} type="button" className={maxPlayers === count ? "is-on" : ""} onClick={() => setMaxPlayers(count)}>
                  {count} 人
                </button>
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
          <button type="button" className="primary wide" disabled={busy || status !== "connected"} onClick={() => void create()}>
            创建房间
          </button>

          <div className="fc-split" />

          <div className="fc-join-row">
            <input
              className="fc-code-input"
              value={code}
              maxLength={4}
              placeholder="输入 4 位房间号"
              aria-label="房间号"
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))}
              onKeyDown={(event) => { if (event.key === "Enter") void join(false); }}
            />
            <button type="button" className="primary" disabled={busy || code.length !== 4} onClick={() => void join(false)}>加入</button>
            <button type="button" className="ghost" disabled={busy || code.length !== 4} onClick={() => void join(true)}>观战</button>
          </div>
        </section>

        <section className="panel">
          <div className="fc-panel-head">
            <h2>房间列表</h2>
            <button type="button" className="ghost" onClick={onRefresh}>刷新</button>
          </div>
          {rooms.length === 0 ? (
            <p className="muted">还没有人开桌。创建一个房间，把房号告诉朋友。</p>
          ) : (
            <ul className="fc-room-list">
              {rooms.map((room) => (
                <li key={room.code} className="fc-room-row">
                  <span className="fc-room-title">{room.code}</span>
                  <span className="fc-room-meta">
                    {room.players}/{room.maxPlayers} 人 · {room.sixOnly ? "仅 6 起飞" : "5 或 6 起飞"} · 观战 {room.spectators}
                  </span>
                  <span className="fc-room-meta muted">{room.phase === "waiting" ? "等待中" : "对局中"} · 房主 {room.host || "—"}</span>
                  <span className="fc-room-actions">
                    <button type="button" className="primary" disabled={busy} onClick={() => void onJoin(room.code, false)}>加入</button>
                    <button type="button" className="ghost" disabled={busy} onClick={() => void onJoin(room.code, true)}>观战</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Rules />
      </div>
    </div>
  );
}

// ---------------- 等待室 ----------------

function WaitingRoom({ game, accountId }: {
  game: ReturnType<typeof useFlyingChessOnline>;
  accountId: string;
}): JSX.Element {
  const state = game.state!;
  const me = state.players.find((player) => player.id === accountId) ?? null;
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(state.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      setCopied(false);
    }
  };
  const seatByColor = new Map(state.players.map((player) => [player.color, player]));
  const watching = state.youAreSpectator;

  return (
    <div className="fc-root fc-lobby-root">
      <div className="fc-center">
        <section className="panel">
          <header className="topbar fc-topbar-row">
            <div>
              <h1>等待室</h1>
              <p className="muted">把房间号告诉朋友，或把空位交给电脑。</p>
            </div>
            <button type="button" className="ghost" onClick={() => void game.leave()}>离开</button>
          </header>

          <div className="fc-code-row">
            <span className="fc-room-title">{state.roomCode}</span>
            <button type="button" className="ghost" onClick={() => void copy()}>{copied ? "已复制" : "复制房号"}</button>
            <span className="muted">{state.players.length}/{state.maxPlayers} 人</span>
          </div>

          {watching ? <p className="fc-notice">你在观战这个房间，等下一局再入座。</p> : null}

          <div className="fc-seat-grid">
            {COLORS.map((color) => {
              const seat = seatByColor.get(color);
              const isMe = seat?.id === accountId;
              const free = !seat;
              const canGiveBot = state.isHost && state.phase !== "over" && free;
              return (
                <div key={color} className={`fc-seat-card ${isMe ? "is-me" : ""} ${free ? "is-empty" : ""}`}>
                  <span className="swatch" style={{ background: COLOR_HEX[color] }} />
                  <div className="fc-seat-body">
                    <strong>{seat ? seat.username : "空位"}</strong>
                    <span className="fc-seat-tags">
                      {isMe ? <span className="fc-badge fc-badge-me">我</span> : null}
                      {seat?.isHost ? <span className="fc-badge">房主</span> : null}
                      {seat?.isBot ? <span className="fc-badge fc-badge-bot">电脑</span> : null}
                      {seat && !seat.connected && !seat.isBot ? <span className="fc-badge fc-badge-off">离线</span> : null}
                      {seat && !seat.isBot ? (
                        <span className={`fc-badge ${seat.ready ? "fc-badge-ok" : ""}`}>{seat.ready ? "已准备" : "未准备"}</span>
                      ) : null}
                    </span>
                  </div>
                  {canGiveBot ? (
                    <button type="button" className="ghost" onClick={() => game.toggleBot(color, true)}>交给电脑</button>
                  ) : null}
                  {seat?.isBot && state.isHost ? (
                    <button type="button" className="ghost" onClick={() => game.toggleBot(color, false)}>移走电脑</button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {me ? (
            <div className="fc-color-picker">
              <span className="label">我的阵营色</span>
              {COLORS.map((color) => {
                const owner = seatByColor.get(color);
                const takenByOther = !!owner && owner.id !== accountId;
                return (
                  <button
                    key={color}
                    type="button"
                    className={`fc-color-dot ${me.color === color ? "is-on" : ""}`}
                    style={{ background: COLOR_HEX[color] }}
                    aria-label={`${COLOR_NAME[color]}方`}
                    title={takenByOther ? "已被占用" : `${COLOR_NAME[color]}方`}
                    disabled={takenByOther}
                    onClick={() => game.chooseColor(color)}
                  />
                );
              })}
              <button type="button" className="ghost" onClick={() => game.chooseColor(null)}>自动分配</button>
            </div>
          ) : null}

          <div className="fc-ready-row">
            {me ? (
              <button
                type="button"
                className={me.ready ? "secondary" : "primary"}
                onClick={() => game.setReady(!me.ready)}
              >
                {me.ready ? "取消准备" : "准备"}
              </button>
            ) : null}
            {state.isHost ? (
              <button
                type="button"
                className="primary"
                disabled={!state.startAllowed}
                onClick={game.start}
                title={state.startAllowed ? "开始对局" : "满员且全员准备后才能开始"}
              >
                开始对局
              </button>
            ) : (
              <span className="muted">等待房主开始</span>
            )}
          </div>
          {state.isHost && !state.startAllowed ? (
            <p className="faint">需要满员（{state.maxPlayers} 人）且全员准备；房主本人不必点准备。</p>
          ) : null}

          {state.isHost ? (
            <>
              <div className="fc-split" />
              <div className="field">
                <span className="label">房间人数</span>
                <div className="segmented">
                  {[2, 3, 4].map((count) => (
                    <button key={count} type="button" className={state.maxPlayers === count ? "is-on" : ""}
                      onClick={() => game.configure({ maxPlayers: count })}>
                      {count} 人
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="label">起飞条件</span>
                <div className="segmented">
                  <button type="button" className={!state.sixOnly ? "is-on" : ""} onClick={() => game.configure({ sixOnly: false })}>5 或 6</button>
                  <button type="button" className={state.sixOnly ? "is-on" : ""} onClick={() => game.configure({ sixOnly: true })}>仅 6</button>
                </div>
              </div>
            </>
          ) : null}

          {state.spectators.length ? (
            <p className="faint">观战：{state.spectators.map((spectator) => spectator.username).join("、")}</p>
          ) : null}
        </section>

        <Rules />
      </div>
    </div>
  );
}
