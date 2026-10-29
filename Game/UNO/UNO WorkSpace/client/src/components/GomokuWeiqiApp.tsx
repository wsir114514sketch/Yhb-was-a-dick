import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { AuthAccount } from "@shared/protocol.ts";
import type { RoomRole } from "@shared/social.ts";
import {
  GW_DEFAULT_CONFIG,
  GW_SIZES,
  type GwAck,
  type GwConfig,
  type GwMode,
  type GwPoint,
  type GwRoomState,
  type GwSeatView,
  type GwStone
} from "@gw/protocol.ts";
import { useUnoSession } from "../session.ts";
import { AuthScreen } from "./AuthScreen.tsx";
import { ConnectHostPanel } from "./ConnectHostPanel.tsx";
import { ConnectionBadge } from "./ConnectionBadge.tsx";
import { VersionBadge } from "./VersionBadge.tsx";
import { InviteDialog } from "./InviteDialog.tsx";
import { SpectatorSeats } from "./SpectatorSeats.tsx";
import { GwBoard } from "./GwBoard.tsx";
import { copyText } from "../clipboard.ts";
import type { ConnectionStatus } from "../types.ts";
import "./gomoku-weiqi.css";

const MODE_NAME: Record<GwMode, string> = { gomoku: "五子棋", go: "围棋" };
const STONE_NAME: Record<GwStone, string> = { black: "黑棋", white: "白棋" };
const REASON_TEXT: Record<string, string> = {
  five: "五连获胜", full: "棋盘已满", resigned: "对方认输", "agreed-draw": "双方同意和棋", score: "数子结果", disconnected: "对方长时间掉线"
};

/** The entry page: the site's own login first, then the game. */
export function GomokuWeiqiEntry() {
  const session = useUnoSession();
  if (session.booting) return <div className="app-shell loading-shell"><p className="muted">正在连接服务器</p></div>;
  if (!session.account) {
    return <AuthScreen connection={session.connection} busy={session.busy} error={session.error} inviteCode={null}
      onLogin={session.login} onRegister={session.register} onResetPassword={session.resetPassword} clearError={() => session.setError("")} />;
  }
  return <GomokuWeiqiApp account={session.account} token={session.accountToken} />;
}

function ack<T>(socket: Socket, event: string, payload?: unknown): Promise<GwAck<T>> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve({ ok: false, code: "TIMEOUT", message: "服务器响应超时，请检查连接后重试" }), 8000);
    socket.emit(event, payload, (result: GwAck<T>) => { window.clearTimeout(timer); resolve(result); });
  });
}

function urlRoom(): { code: string; watch: boolean } {
  const params = new URLSearchParams(location.search);
  return { code: (params.get("room") ?? "").replace(/\D/g, "").slice(0, 6), watch: params.get("watch") === "1" };
}

export function GomokuWeiqiApp({ account, token }: { account: AuthAccount; token: string | null }) {
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<GwRoomState | null>(null);
  const [error, setError] = useState("");
  const [closedNotice, setClosedNotice] = useState("");
  const [busy, setBusy] = useState(false);
  /** The room this tab was last in, so a reconnect can get back in (as a player, or as a spectator again). */
  const lastRoom = useRef<{ code: string; spectator: boolean } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const invited = useRef(false);

  const socket = useMemo(() => io("/gomoku-weiqi", {
    auth: { token }, autoConnect: false, transports: ["websocket", "polling"], reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 4000
  }), [token]);

  useEffect(() => {
    socketRef.current = socket;
    const enterFromUrl = async (): Promise<void> => {
      const { code, watch } = urlRoom();
      if (!code || invited.current) return;
      invited.current = true;
      const result = await ack<{ roomCode: string }>(socket, watch ? "gw:spectate_room" : "gw:join_room", { roomCode: code });
      if (!result.ok) setError(result.message);
    };
    const onConnect = async (): Promise<void> => {
      setConnection("connected");
      setError("");
      const resumed = await ack<{ roomCode: string }>(socket, "gw:resume_room");
      if (resumed.ok) return;
      // A spectator has no seat to resume: go back to watching the same room.
      const previous = lastRoom.current;
      if (previous?.spectator) {
        const again = await ack<{ roomCode: string }>(socket, "gw:spectate_room", { roomCode: previous.code });
        if (again.ok) return;
        lastRoom.current = null;
        setState(null);
      }
      await enterFromUrl();
    };
    const onDisconnect = (): void => setConnection("disconnected");
    const onError = (): void => setConnection("disconnected");
    const onState = (next: GwRoomState): void => {
      lastRoom.current = { code: next.roomCode, spectator: next.you.spectator };
      setState(next);
      setBusy(false);
      history.replaceState({}, "", `/gomoku-weiqi?room=${next.roomCode}${next.you.spectator ? "&watch=1" : ""}`);
    };
    const onClosed = (payload: { message: string }): void => {
      lastRoom.current = null;
      setState(null);
      setClosedNotice(payload.message);
      history.replaceState({}, "", "/gomoku-weiqi");
    };
    socket.on("connect", () => void onConnect());
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);
    socket.on("gw:state", onState);
    socket.on("gw:closed", onClosed);
    socket.connect();
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [socket]);

  const run = useCallback(async (event: string, payload?: unknown): Promise<boolean> => {
    setBusy(true);
    setError("");
    const result = await ack(socket, event, payload);
    setBusy(false);
    if (!result.ok) setError(result.message);
    return result.ok;
  }, [socket]);

  const leave = async (): Promise<void> => {
    if (await run("gw:leave_room")) {
      lastRoom.current = null;
      setState(null);
      history.replaceState({}, "", "/gomoku-weiqi");
    }
  };

  const header = <header className="lobby-header gw-header">
    <div className="gw-header-title">
      <button type="button" className="secondary" onClick={() => window.location.assign("/")}>返回大厅</button>
      <div><h1>五子棋 / 围棋</h1><p className="eyebrow">LayUDown · 在线对局</p></div>
    </div>
    <nav className="lobby-account" aria-label="主导航">
      <a className="my-link" href="/about">
        {account.avatarUrl ? <img className="my-avatar" src={account.avatarUrl} alt="" /> : <span className="my-avatar-placeholder" aria-hidden="true">{account.username.slice(0, 1)}</span>}
        <strong>我的</strong>
      </a>
      <ConnectionBadge status={connection} />
      <span className="gw-username">已登录：{account.username}</span>
      <VersionBadge />
    </nav>
  </header>;

  return <div className="app-shell lobby-shell gw-shell">
    {header}
    {closedNotice && !state ? <p className="gw-message" role="status">{closedNotice}</p> : null}
    {error ? <p className="gw-message gw-error" role="alert">{error}</p> : null}
    {!state
      ? <GwLobby connected={connection === "connected"} busy={busy} onCreate={(config) => run("gw:create_room", config)}
          onJoin={(code) => run("gw:join_room", { roomCode: code })} onSpectate={(code) => run("gw:spectate_room", { roomCode: code })} />
      : state.phase === "lobby"
        ? <GwRoom state={state} busy={busy} run={run} onLeave={() => void leave()} />
        : <GwGame state={state} busy={busy} run={run} onLeave={() => void leave()} />}
  </div>;
}

function GwLobby({ connected, busy, onCreate, onJoin, onSpectate }: {
  connected: boolean; busy: boolean;
  onCreate: (config: Partial<GwConfig>) => Promise<boolean>;
  onJoin: (code: string) => Promise<boolean>;
  onSpectate: (code: string) => Promise<boolean>;
}) {
  const [config, setConfig] = useState<GwConfig>({ ...GW_DEFAULT_CONFIG });
  const [code, setCode] = useState(urlRoom().code);
  const setMode = (mode: GwMode): void => setConfig((current) => ({ ...current, mode, size: mode === "gomoku" ? 15 : 19 }));
  return <main className="lobby-main gw-lobby">
    <ConnectHostPanel />
    <section className="panel gw-card" aria-labelledby="gw-create">
      <h2 id="gw-create">创建房间</h2>
      <GwConfigForm config={config} editable onChange={setConfig} onMode={setMode} />
      <button className="primary" disabled={!connected || busy} onClick={() => void onCreate(config)}>创建房间</button>
    </section>
    <section className="panel gw-card" aria-labelledby="gw-join">
      <h2 id="gw-join">加入房间</h2>
      <label className="gw-field">房间号
        <input value={code} inputMode="numeric" maxLength={6} placeholder="6 位房间号" autoComplete="off"
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(event) => { if (event.key === "Enter" && /^\d{6}$/.test(code)) void onJoin(code); }} />
      </label>
      <div className="button-row">
        <button className="primary" disabled={!connected || busy || !/^\d{6}$/.test(code)} onClick={() => void onJoin(code)}>加入房间</button>
        <button className="secondary" disabled={!connected || busy || !/^\d{6}$/.test(code)} onClick={() => void onSpectate(code)}>进入观战席</button>
      </div>
    </section>
  </main>;
}

/** The mode and its options; read-only (just text) once the room is locked or the viewer is not the host. */
function GwConfigForm({ config, editable, onChange, onMode }: { config: GwConfig; editable: boolean; onChange: (config: GwConfig) => void; onMode: (mode: GwMode) => void }) {
  if (!editable) {
    return <dl className="gw-config-summary">
      <div><dt>模式</dt><dd>{MODE_NAME[config.mode]}</dd></div>
      <div><dt>棋盘</dt><dd>{config.size}×{config.size}</dd></div>
      {config.mode === "gomoku" ? <div><dt>禁手</dt><dd>{config.renju ? "开启（黑棋三三、四四、长连禁手）" : "关闭（自由规则）"}</dd></div>
        : <div><dt>贴目 · 计分</dt><dd>{config.komi} 目 · 中国规则数子法</dd></div>}
      <div><dt>房主执子</dt><dd>{config.hostColor === "random" ? "随机" : STONE_NAME[config.hostColor]}</dd></div>
    </dl>;
  }
  return <div className="gw-config">
    <div className="gw-segment" role="radiogroup" aria-label="游戏模式">
      {(["gomoku", "go"] as const).map((mode) => <button key={mode} type="button" role="radio" aria-checked={config.mode === mode} className={config.mode === mode ? "is-active" : ""} onClick={() => onMode(mode)}>{MODE_NAME[mode]}</button>)}
    </div>
    <label className="gw-field">棋盘大小
      <select value={config.size} onChange={(event) => onChange({ ...config, size: Number(event.target.value) })}>
        {GW_SIZES[config.mode].map((size) => <option key={size} value={size}>{size}×{size}</option>)}
      </select>
    </label>
    {config.mode === "gomoku"
      ? <label className="gw-check"><input type="checkbox" checked={config.renju} onChange={(event) => onChange({ ...config, renju: event.target.checked })} />启用禁手（黑棋三三、四四、长连禁手；默认关闭）</label>
      : <>
        <label className="gw-field">贴目
          <input type="number" min={0} max={30} step={0.5} value={config.komi} onChange={(event) => onChange({ ...config, komi: Number(event.target.value) })} />
        </label>
        <p className="muted gw-note">计分规则：中国规则（数子法）。双方连续虚着后，由双方标记死子并确认，再自动数子。</p>
      </>}
    <label className="gw-field">我执子
      <select value={config.hostColor} onChange={(event) => onChange({ ...config, hostColor: event.target.value as GwConfig["hostColor"] })}>
        <option value="random">随机（默认）</option><option value="black">黑棋（先手）</option><option value="white">白棋</option>
      </select>
    </label>
  </div>;
}

function Avatar({ person, size = 40 }: { person: Pick<GwSeatView, "avatarUrl" | "username">; size?: number }) {
  const [broken, setBroken] = useState(false);
  return person.avatarUrl && !broken
    ? <img className="gw-avatar" style={{ width: size, height: size }} src={person.avatarUrl} alt="" onError={() => setBroken(true)} />
    : <span className="gw-avatar gw-avatar-fallback" style={{ width: size, height: size }} aria-hidden="true">{person.username.slice(0, 1)}</span>;
}

function GwRoom({ state, busy, run, onLeave }: { state: GwRoomState; busy: boolean; run: (event: string, payload?: unknown) => Promise<boolean>; onLeave: () => void }) {
  const [inviteRole, setInviteRole] = useState<RoomRole | null>(null);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<GwConfig>(state.config);
  useEffect(() => setDraft(state.config), [state.config]);
  const me = state.players.find((player) => player.accountId === state.you.accountId);
  const guest = state.players.find((player) => !player.isHost);
  const canStart = state.you.isHost && state.players.length === 2 && state.players.every((player) => player.connected) && Boolean(guest?.ready);
  const apply = (next: GwConfig): void => { setDraft(next); void run("gw:configure", next); };

  return <main className="gw-room">
    {inviteRole ? <InviteDialog game="gomoku-weiqi" roomCode={state.roomCode} role={inviteRole} onClose={() => setInviteRole(null)} /> : null}
    <section className="panel gw-room-head">
      <div><span className="muted">房间号</span><strong className="gw-code">{state.roomCode}</strong></div>
      <button className="secondary" onClick={() => void copyText(state.roomCode).then((ok) => { setCopied(ok); window.setTimeout(() => setCopied(false), 1500); })}>{copied ? "已复制" : "复制房间号"}</button>
      <span className="gw-mode-tag">{MODE_NAME[state.config.mode]} · {state.config.size}×{state.config.size}</span>
    </section>
    <div className="gw-room-grid">
      <section className="panel gw-card" aria-labelledby="gw-players">
        <h2 id="gw-players">对战席（{state.players.length}/2）</h2>
        <ul className="gw-player-list">
          {state.players.map((player) => <li key={player.accountId} className={player.accountId === state.you.accountId ? "is-self" : ""}>
            <Avatar person={player} />
            <span className="gw-player-name">{player.username}{player.isHost ? <em className="gw-host-tag">房主</em> : null}</span>
            <span className={`gw-presence ${player.connected ? "is-online" : ""}`}>{player.connected ? (player.isHost ? "在线" : player.ready ? "已准备" : "在线") : "已离线"}</span>
          </li>)}
          {state.players.length < 2 ? <li className="gw-player-empty"><span className="gw-avatar gw-avatar-fallback" aria-hidden="true">+</span><span className="muted">等待玩家加入</span></li> : null}
        </ul>
        <div className="gw-invite-row">
          <strong>邀请好友</strong>
          <button type="button" className="secondary" disabled={state.you.spectator || state.players.length >= 2} onClick={() => setInviteRole("player")}>邀请对战席</button>
        </div>
        <div className="spectator-block"><strong>观战席（{state.spectators.length}）</strong>
          <SpectatorSeats spectators={state.spectators} canInvite={!state.you.spectator} onInvite={() => setInviteRole("spectator")} />
        </div>
      </section>
      <section className="panel gw-card" aria-labelledby="gw-config-title">
        <h2 id="gw-config-title">房间设置</h2>
        <GwConfigForm config={draft} editable={state.you.isHost} onChange={apply} onMode={(mode) => apply({ ...draft, mode, size: mode === "gomoku" ? 15 : 19 })} />
        <h2 className="gw-sub">准备与开局</h2>
        {state.you.spectator ? <p className="muted">你正在观战，只能查看棋局。</p>
          : state.you.isHost
            ? <>
              <button className="primary" disabled={busy || !canStart} onClick={() => void run("gw:start")}>开始游戏</button>
              <p className="muted gw-note">{state.players.length < 2 ? "至少需要 2 名在线玩家" : guest?.ready ? "对手已准备，可以开始" : "等待对手准备"}</p>
            </>
            : <button className={me?.ready ? "secondary" : "primary"} disabled={busy || state.players.length < 2} onClick={() => void run("gw:ready", { ready: !me?.ready })}>{me?.ready ? "取消准备" : "准备"}</button>}
        <button className="secondary gw-leave" disabled={busy} onClick={onLeave}>离开房间</button>
      </section>
    </div>
  </main>;
}

function PlayerBar({ seat, stone, turn, captures, showCaptures, you, role }: {
  seat: GwSeatView | undefined; stone: GwStone | null; turn: boolean; captures: number; showCaptures: boolean; you: boolean; role: "top" | "bottom";
}) {
  return <div className={`gw-playerbar gw-playerbar-${role} ${turn ? "is-turn" : ""}`}>
    {seat ? <Avatar person={seat} size={44} /> : <span className="gw-avatar gw-avatar-fallback" style={{ width: 44, height: 44 }}>?</span>}
    <div className="gw-playerbar-text">
      <strong>{seat?.username ?? "等待玩家"}{you ? <em className="gw-host-tag">我</em> : null}{seat && !seat.connected ? <em className="gw-offline-tag">已断线</em> : null}</strong>
      <span className="gw-stone-tag"><i className={`gw-chip gw-chip-${stone ?? "none"}`} />{stone ? STONE_NAME[stone] : "未分配"}{showCaptures ? ` · 提子 ${captures}` : ""}</span>
    </div>
    <span className="gw-turn-badge">{turn ? (you ? "轮到你落子" : "轮到 TA 落子") : ""}</span>
  </div>;
}

function GwGame({ state, busy, run, onLeave }: { state: GwRoomState; busy: boolean; run: (event: string, payload?: unknown) => Promise<boolean>; onLeave: () => void }) {
  const game = state.game!;
  const mine = state.you.stone;
  const spectator = state.you.spectator;
  // The viewer sits at the bottom; a spectator sees Black at the bottom and White on top.
  const bottomStone: GwStone = spectator || !mine ? "black" : mine;
  const topStone: GwStone = bottomStone === "black" ? "white" : "black";
  const seatOf = (stone: GwStone): GwSeatView | undefined => state.players.find((player) => player.stone === stone);
  const playing = state.phase === "playing";
  const myTurn = playing && !spectator && game.status === "playing" && game.turn === mine;
  const [confirmResign, setConfirmResign] = useState(false);
  const request = state.undoRequest;
  const draw = state.drawRequest;
  const iAsked = (r: { from: GwStone } | null): boolean => r !== null && r.from === mine;
  const result = game.result;
  const winnerText = result?.winner ? `${STONE_NAME[result.winner]}（${seatOf(result.winner)?.username ?? ""}）获胜` : "和棋";
  const turnText = game.status === "scoring" ? "点目：双方标记死子并确认" : game.status === "finished" ? "对局已结束" : myTurn ? "轮到你落子" : `等待 ${STONE_NAME[game.turn]} 落子`;

  const place = (point: GwPoint): void => {
    if (game.status === "scoring") void run("gw:toggle_dead", { point });
    else void run("gw:move", { point });
  };

  return <main className="gw-game">
    <PlayerBar role="top" seat={seatOf(topStone)} stone={topStone} turn={playing && game.status === "playing" && game.turn === topStone} captures={game.captures[topStone]} showCaptures={game.mode === "go"} you={false} />
    <div className="gw-board-area">
      <p className={`gw-status ${myTurn ? "is-mine" : ""}`} aria-live="polite">{turnText}{game.lastWasPass && game.status === "playing" ? " · 对方虚着" : ""}</p>
      <GwBoard game={game} canPlay={myTurn} ghost={myTurn ? mine : null} marking={game.status === "scoring" && !spectator} onPlace={place} />
    </div>
    <PlayerBar role="bottom" seat={seatOf(bottomStone)} stone={bottomStone} turn={playing && game.status === "playing" && game.turn === bottomStone} captures={game.captures[bottomStone]} showCaptures={game.mode === "go"} you={!spectator} />

    {playing && request && !iAsked(request) && !spectator ? <div className="gw-request" role="alert"><span>对方请求悔棋</span>
      <button className="primary" onClick={() => void run("gw:undo_respond", { accept: true })}>同意</button><button className="secondary" onClick={() => void run("gw:undo_respond", { accept: false })}>拒绝</button></div> : null}
    {playing && draw && !iAsked(draw) && !spectator ? <div className="gw-request" role="alert"><span>对方请求和棋</span>
      <button className="primary" onClick={() => void run("gw:draw_respond", { accept: true })}>同意</button><button className="secondary" onClick={() => void run("gw:draw_respond", { accept: false })}>拒绝</button></div> : null}
    {playing && (iAsked(request) || iAsked(draw)) ? <p className="gw-message">已发出请求，等待对方回应…</p> : null}

    {game.status === "scoring" ? <section className="panel gw-scoring">
      <strong>点目</strong>
      <p className="muted">点击棋盘上的死子来标记（整块棋一起标记），再点一次取消。双方都点“确认”后自动数子。</p>
      {game.preview ? <p>当前数子：黑 {game.preview.black} · 白 {game.preview.white}（含贴目 {game.preview.komi}）</p> : null}
      <p className="muted">已确认：{game.confirmed.length === 0 ? "无" : game.confirmed.map((stone) => STONE_NAME[stone]).join("、")}</p>
      {!spectator ? <div className="button-row">
        <button className="primary" disabled={busy || (mine !== null && game.confirmed.includes(mine))} onClick={() => void run("gw:confirm_score")}>确认结果</button>
        <button className="secondary" disabled={busy} onClick={() => void run("gw:resume_play")}>不同意，继续对局</button>
      </div> : null}
    </section> : null}

    <div className="gw-actions">
      {playing && !spectator ? <>
        {game.mode === "go" && game.status === "playing" ? <button className="secondary" disabled={busy || !myTurn} onClick={() => void run("gw:pass")}>虚着 / 停一手</button> : null}
        <button className="secondary" disabled={busy || game.status === "scoring" || Boolean(request) || game.moveCount === 0} onClick={() => void run("gw:undo_request")}>请求悔棋</button>
        {game.mode === "gomoku" ? <button className="secondary" disabled={busy || Boolean(draw)} onClick={() => void run("gw:draw_request")}>请求和棋</button> : null}
        <button className="secondary" disabled={busy} onClick={() => setConfirmResign(true)}>认输</button>
      </> : null}
      <button className="secondary" disabled={busy} onClick={onLeave}>离开房间</button>
      <span className="gw-room-tag">房间 {state.roomCode} · {MODE_NAME[game.mode]} {game.size}×{game.size}{game.mode === "go" ? ` · 贴目 ${state.config.komi}` : state.config.renju ? " · 禁手" : ""}</span>
    </div>

    <div className="spectator-block gw-game-spectators"><strong>观战席（{state.spectators.length}）</strong>
      <SpectatorSeats spectators={state.spectators} canInvite={false} onInvite={() => undefined} />
    </div>

    {confirmResign && playing ? <div className="shogi-modal-backdrop"><section className="panel shogi-promotion" role="dialog" aria-modal="true" aria-labelledby="gw-resign">
      <h2 id="gw-resign">确定要认输吗？认输后本局判负。</h2>
      <div className="button-row"><button className="primary" onClick={() => { setConfirmResign(false); void run("gw:resign"); }}>确认认输</button><button className="text-button" onClick={() => setConfirmResign(false)}>取消</button></div>
    </section></div> : null}

    {state.phase === "finished" && result ? <div className="gw-result" role="dialog" aria-label="对局结果">
      <div className="gw-result-card">
        <strong>{winnerText}</strong>
        <span>{REASON_TEXT[result.reason] ?? ""}</span>
        {result.score ? <span>黑 {result.score.black} · 白 {result.score.white}（含贴目 {result.score.komi}）{result.margin !== null ? ` · 相差 ${result.margin} 目` : ""}</span> : null}
        <div className="button-row">
          {!spectator ? <button className="primary" disabled={busy} onClick={() => void run("gw:back_to_lobby")}>再来一局</button> : null}
          <button className="secondary" disabled={busy} onClick={onLeave}>离开房间</button>
        </div>
      </div>
    </div> : null}
  </main>;
}
