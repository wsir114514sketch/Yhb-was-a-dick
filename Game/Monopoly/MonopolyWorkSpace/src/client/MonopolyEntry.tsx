/**
 * The Monopoly entry point, mounted as a route of the LayUDown SPA.
 *
 * Three screens and one switch: the lobby (single-player or online), the waiting room, and the table. Which one shows is
 * read entirely from the online session's state — the same way every other game on this site works — so a refresh, a
 * dropped connection or a room that closes all land back on the right screen without a separate router.
 *
 * The account is the site's: the host passes the signed-in account and token in, so a Monopoly seat is the same person as
 * an UNO seat, and the friends list can show them in a Monopoly room.
 */

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { GameTable, useTableSettings } from "./GameTable.tsx";
import { OnlineLobby, OnlineRoom } from "./ui/OnlineScreens.tsx";
import { RulesDialog } from "./ui/RulesDialog.tsx";
import { OnlineSession, errorText } from "./online.ts";
import { roomFromUrl } from "./roomLink.ts";
import { GameSession } from "./session.ts";
import type { MonopolyAction } from "../shared/protocol.ts";

/** The signed-in account, as the host's session hands it to this route. */
export interface EntryAccount {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

export interface MonopolyEntryProps {
  account: EntryAccount;
  token: string | null;
  /** Where the site's own connection stands, for the banner when our own socket is still coming up. */
  connection: string;
}

/** The full-height stage every Monopoly screen sits in. The site's #root only guarantees a minimum height, so the
 *  table has to claim the viewport itself or its `1fr` rows collapse to the action bar's height. */
function Stage({ children }: { children: React.ReactNode }): JSX.Element {
  return <div style={{ height: "100dvh", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
  </div>;
}

export function MonopolyEntry({ account, token, connection }: MonopolyEntryProps): JSX.Element {
  // A shared link (`/monopoly?room=ABCD`, optionally `&watch=1`) skips the menu and opens the online lobby, which joins
  // that room as soon as its socket is up. Without this, a friend who followed a link would land on the menu.
  const [mode, setMode] = useState<"choose" | "online" | "local">(() => (roomFromUrl() ? "online" : "choose"));
  const [localSeats, setLocalSeats] = useState(4);
  const [rulesOpen, setRulesOpen] = useState(false);

  if (mode === "local") {
    return <Stage><LocalTable seats={localSeats} onLeave={() => setMode("choose")} /></Stage>;
  }
  if (mode === "choose") {
    return (
      <Stage>
      <StartScreen
        account={account}
        connection={connection}
        tokenReady={!!token}
        seats={localSeats}
        setSeats={setLocalSeats}
        onLocal={() => setMode("local")}
        onOnline={() => setMode("online")}
        onRules={() => setRulesOpen(true)}
      />
      {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} /> : null}
      </Stage>
    );
  }
  return <Stage><OnlineMonopoly account={account} token={token!} onLocal={() => setMode("local")} /></Stage>;
}

/** The first screen: play the computer, or sit down with people. */
function StartScreen({ account, connection, tokenReady, seats, setSeats, onLocal, onOnline, onRules }: {
  account: EntryAccount; connection: string; tokenReady: boolean;
  seats: number; setSeats: (next: number) => void; onLocal: () => void; onOnline: () => void;
  onRules: () => void;
}): JSX.Element {
  return (
    <div style={{ flex: "1 1 auto", minHeight: "100%", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="panel" style={{ width: "100%", maxWidth: 400, padding: "24px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.02em" }}>大富翁</h1>
          <p className="muted" style={{ marginTop: 4, fontSize: 12, lineHeight: 1.6 }}>
            48 格环游世界 · {account.username}
          </p>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>和电脑玩 · 人数</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[2, 3, 4, 5, 6].map((count) => (
              <button key={count} type="button" className={seats === count ? "primary" : "secondary"}
                onClick={() => setSeats(count)} style={{ flex: 1, minWidth: 44, fontSize: 14 }}>
                {count}
              </button>
            ))}
          </div>
          <button type="button" className="secondary" onClick={onLocal} style={{ width: "100%", height: 42, marginTop: 8, fontSize: 14 }}>
            单机开局
          </button>
          <button type="button" className="text-button" onClick={onRules} style={{ width: "100%", marginTop: 6, fontSize: 12 }}>
            玩法说明
          </button>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 7 }}>和别人玩</div>
          <button type="button" className="primary" onClick={onOnline} disabled={!tokenReady}
            style={{ width: "100%", height: 44, fontSize: 15 }}>
            联机大厅
          </button>
          <p className="faint" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
            {tokenReady ? `已登录：${account.username}，可以创建或加入房间。` : `当前连接：${connection}，登录后才能联机。`}
          </p>
        </div>

        <p className="faint" style={{ fontSize: 11, textAlign: "center", lineHeight: 1.6 }}>
          快速局：60 分钟后按总资产结算
        </p>
      </div>
    </div>
  );
}

/** Single-player: the engine runs in this tab, every other seat is a bot. */
function LocalTable({ seats, onLeave }: { seats: number; onLeave: () => void }): JSX.Element {
  const settings = useTableSettings();
  const [session, setSession] = useState<GameSession | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const next = new GameSession({
      seats,
      botSeats: Array.from({ length: seats }, (_, seat) => seat).filter((seat) => seat !== 0),
      config: { timeLimitMinutes: 60, winCondition: "assets" },
      onError: (code) => setToast(errorText(code))
    });
    setSession(next);
    return () => next.dispose();
  }, [seats]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!session) return <div style={{ display: "grid", placeItems: "center", minHeight: "40vh" }}><p className="muted">正在发牌</p></div>;

  // The local session bumps its own listeners; re-render on every change is enough for a table this small.
  return (
    <LocalView
      session={session}
      toast={toast}
      settings={settings}
      onLeave={onLeave}
    />
  );
}

function LocalView({ session, toast, settings, onLeave }: {
  session: GameSession;
  toast: string | null;
  settings: ReturnType<typeof useTableSettings>;
  onLeave: () => void;
}): JSX.Element {
  const [, forceRender] = useState(0);
  useEffect(() => session.subscribe(() => forceRender((value) => value + 1)), [session]);
  useEffect(() => {
    const timer = setInterval(() => forceRender((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ flex: "1 1 auto", minWidth: 0, minHeight: 0 }}>
      <GameTable
        game={session.game}
        meId={session.humanId}
        onAct={(action: MonopolyAction) => session.act(action)}
        toast={toast}
        speed={settings.speed} setSpeed={settings.setSpeed}
        sound={settings.sound} setSound={settings.setSound}
        theme={settings.theme} setTheme={settings.setTheme}
        onQuit={onLeave}
        onEndGame={() => session.resign()}
        onPlayAgain={onLeave}
      />
    </div>
  );
}

/** Online: the server owns the game; this component only shows what it says and sends actions back. */
function OnlineMonopoly({ account, token, onLocal }: { account: EntryAccount; token: string; onLocal: () => void }): JSX.Element {
  const settings = useTableSettings();
  const [session] = useState(() => new OnlineSession({ token, account }));
  const [toast, setToast] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  const invited = useRef(false);

  useEffect(() => {
    const off = session.subscribe(() => forceRender((value) => value + 1));
    session.connect();
    return () => { off(); session.dispose(); };
  }, [session]);

  // Walk into the room a shared link names, once — and only once the socket is actually connected, since the join is an
  // event that would otherwise be dropped.
  useEffect(() => {
    if (invited.current || session.status !== "connected") return;
    const link = roomFromUrl();
    if (!link) return;
    invited.current = true;
    void session.joinRoom(link.code, link.watch);
  }, [session, session.status]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // The session reports refusals; the table shows them like the local game does.
  useEffect(() => {
    const original = session.error;
    if (original) setToast(original);
  }, [session, session.error]);

  const state = session.state;
  const game = state?.game ?? null;

  if (game && state && (state.phase === "playing" || state.phase === "over")) {
    return (
      <div style={{ flex: "1 1 auto", minWidth: 0, minHeight: 0 }}>
        <GameTable
          game={game}
          meId={session.account.id}
          onAct={(action) => session.act(action)}
          toast={toast}
          speed={settings.speed} setSpeed={settings.setSpeed}
          sound={settings.sound} setSound={settings.setSound}
          theme={settings.theme} setTheme={settings.setTheme}
          onQuit={() => void session.leave()}
          onEndGame={() => void session.reset()}
          onPlayAgain={() => void session.reset()}
          banner={state.youAreSpectator ? (
            <div className="panel" style={{ padding: "5px 10px", fontSize: 11, marginBottom: 4, textAlign: "center" }}>观战中</div>
          ) : null}
        />
      </div>
    );
  }

  if (state) return <OnlineRoom session={session} />;
  return <OnlineLobby session={session} onPlayLocal={onLocal} />;
}

