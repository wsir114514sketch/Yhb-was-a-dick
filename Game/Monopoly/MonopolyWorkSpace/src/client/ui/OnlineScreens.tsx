/**
 * The online lobby and room: pick a table, sit down, get ready.
 *
 * This is deliberately a thin screen over `OnlineSession`. It never decides what is legal — the server's room state says
 * who may start, who may edit the table, and whose turn it is — so every button here is drawn straight from that state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { RoomState, RoomSummary } from "../../shared/protocol.ts";
import type { OnlineSession } from "../online.ts";
import { roomFromUrl } from "../roomLink.ts";

export function OnlineLobby({ session, onPlayLocal }: { session: OnlineSession; onPlayLocal: () => void }): JSX.Element {
  const [code, setCode] = useState("");
  const [seats, setSeats] = useState(4);
  const [busy, setBusy] = useState(false);
  const followed = useRef(false);

  /**
   * A shared link (`?room=ABCD`, `&watch=1`) is followed here, not on the first render: the route can only know whether a
   * token exists after the site's session has booted, so the decision to show this screen happens later than the URL.
   */
  useEffect(() => {
    if (followed.current || session.status !== "connected") return;
    const link = roomFromUrl();
    if (!link) return;
    followed.current = true;
    void session.joinRoom(link.code, link.watch);
  }, [session, session.status]);

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setBusy(true);
    try { await work(); } finally { setBusy(false); }
  }, []);

  const connectionText =
    session.status === "connected" ? "已连接"
      : session.status === "auth-required" ? "登录已过期，请重新登录"
        : session.status === "reconnecting" ? "正在重新连接…"
          : session.status === "failed" ? "无法连接服务器"
            : "正在连接…";

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "calc(var(--safe-top) + 18px) 16px calc(var(--safe-bottom) + 24px)" }}>
      <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <header style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>大富翁 · 联机</h1>
          <span className={`eyebrow ${session.status === "connected" ? "" : "muted"}`}>{connectionText}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" onClick={onPlayLocal} style={{ fontSize: 12 }}>单机对电脑</button>
        </header>

        <section className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="eyebrow" style={{ flex: 1 }}>创建房间</span>
            <span className="faint" style={{ fontSize: 11 }}>人数</span>
            {[2, 3, 4, 5, 6].map((count) => (
              <button key={count} type="button" className={seats === count ? "primary" : "secondary"}
                onClick={() => setSeats(count)}
                style={{ minHeight: 30, minWidth: 34, padding: "0 8px", fontSize: 12 }}>
                {count}
              </button>
            ))}
          </div>
          <button type="button" className="primary" disabled={busy || session.status !== "connected"}
            onClick={() => void run(() => session.createRoom({ maxPlayers: seats, allowSpectators: true }))}>
            创建房间
          </button>
        </section>

        <section className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="eyebrow">加入房间</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="field" value={code} placeholder="4 位房间号"
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 4))}
              onKeyDown={(event) => { if (event.key === "Enter" && code.length === 4) void run(() => session.joinRoom(code)); }}
              style={{ flex: 1, letterSpacing: "0.24em", fontFamily: "var(--font-mono, monospace)" }} />
            <button type="button" className="primary" disabled={busy || code.length !== 4 || session.status !== "connected"}
              onClick={() => void run(() => session.joinRoom(code))}>
              加入
            </button>
          </div>
        </section>

        <section className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="eyebrow" style={{ flex: 1 }}>房间列表</span>
            <button type="button" className="secondary" onClick={() => session.refreshRooms()} style={{ minHeight: 28, fontSize: 11 }}>刷新</button>
          </div>
          {session.rooms.length === 0 ? (
            <p className="faint" style={{ fontSize: 12, lineHeight: 1.7 }}>还没有房间。创建一个，把房间号发给朋友。</p>
          ) : (
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {session.rooms.map((room) => <RoomRow key={room.code} room={room} disabled={busy} onJoin={(watch) => void run(() => session.joinRoom(room.code, watch))} />)}
            </ul>
          )}
        </section>

        <p className="faint" style={{ fontSize: 11, lineHeight: 1.7 }}>
          房间按账号保留座位：断线或刷新后回到原来的位置。快速局 60 分钟，结束时按总资产排名。
        </p>
      </div>
    </div>
  );
}

function RoomRow({ room, disabled, onJoin }: { room: RoomSummary; disabled: boolean; onJoin: (watch: boolean) => void }): JSX.Element {
  return (
    <li style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      padding: "8px 10px", borderRadius: "var(--radius)", background: "var(--surface-soft)"
    }}>
      <span className="num" style={{ fontWeight: 700, letterSpacing: "0.16em" }}>{room.code}</span>
      <span className="muted" style={{ fontSize: 12, flex: 1, minWidth: 90 }}>
        {room.phase === "playing" ? "对局中" : "等待中"} · {room.players}/{room.maxPlayers} 人
        {room.host ? ` · 房主 ${room.host}` : ""}
      </span>
      {room.phase === "playing" ? (
        <button type="button" className="secondary" disabled={disabled || !room.allowSpectators} onClick={() => onJoin(true)}>观战</button>
      ) : (
        <button type="button" className="primary" disabled={disabled || room.players >= room.maxPlayers} onClick={() => onJoin(false)}>加入</button>
      )}
    </li>
  );
}

/** The waiting room: who is seated, ready flags, and the host's start button. */
export function OnlineRoom({ session }: { session: OnlineSession }): JSX.Element {
  const state = session.state!;
  const [busy, setBusy] = useState(false);
  const me = state.players.find((player) => player.id === session.account.id);

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setBusy(true);
    try { await work(); } finally { setBusy(false); }
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "calc(var(--safe-top) + 18px) 16px calc(var(--safe-bottom) + 24px)" }}>
      <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p className="eyebrow">房间号</p>
            <p className="num" style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.2em" }}>{state.roomCode}</p>
          </div>
          <button type="button" className="secondary" onClick={() => void navigator.clipboard?.writeText(state.roomCode)}>复制</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void run(() => session.leave())}>离开</button>
        </header>

        {state.youAreSpectator ? (
          <p className="muted" style={{ fontSize: 12 }}>你正在观战，对局开始后可以看到牌桌。</p>
        ) : null}

        <section className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="eyebrow">座位 {state.players.length}/{state.config.maxPlayers}</div>
          {state.players.map((player) => (
            <div key={player.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: "var(--radius)", background: "var(--surface-soft)"
            }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                {player.username}
                {player.id === session.account.id ? "（你）" : ""}
                {player.isHost ? <span className="eyebrow" style={{ marginLeft: 6 }}>房主</span> : null}
              </span>
              <span className={player.connected ? "muted" : "faint"} style={{ fontSize: 11 }}>
                {player.connected ? (player.ready || player.isHost ? "已就绪" : "未就绪") : "已断开"}
              </span>
            </div>
          ))}
          {state.spectators.length > 0 ? (
            <p className="faint" style={{ fontSize: 11 }}>观战：{state.spectators.map((person) => person.username).join("、")}</p>
          ) : null}
        </section>

        {state.isHost ? (
          <section className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="eyebrow" style={{ flex: 1 }}>人数上限</span>
              {[2, 3, 4, 5, 6].map((count) => (
                <button key={count} type="button" className={state.config.maxPlayers === count ? "primary" : "secondary"}
                  disabled={busy || !state.canEditConfig}
                  onClick={() => void run(() => session.configure({ maxPlayers: count }))}
                  style={{ minHeight: 28, minWidth: 32, padding: "0 8px", fontSize: 12 }}>
                  {count}
                </button>
              ))}
            </div>
            <button type="button" className="primary" disabled={busy || !state.startAllowed}
              onClick={() => void run(() => session.start())}>
              {state.startAllowed ? "开始对局" : "等所有人到齐并准备"}
            </button>
          </section>
        ) : me ? (
          <button type="button" className={me.ready ? "secondary" : "primary"} disabled={busy}
            onClick={() => void run(() => session.setReady(!me.ready))}>
            {me.ready ? "取消准备" : "准备"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type { RoomState };