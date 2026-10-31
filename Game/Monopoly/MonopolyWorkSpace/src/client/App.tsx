/**
 * The whole game surface.
 *
 * One component owns the session and the small amount of view state (which card is open, the menu, the animation setting),
 * and everything else is presentational. The layout is responsive without a breakpoint library:
 *
 * - A desktop gets the board in the middle, seats on the left, the log on the right, and the action bar underneath.
 * - A phone gets the board on top, seats in a horizontal strip, the action bar at the bottom, and every dialog as a sheet.
 *
 * The board is always its own 14:12 shape: the tiles are laid out on that grid, so forcing another ratio would only
 * stretch them.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { BOARD_TILES } from "../shared/board.ts";
import { formatMoney } from "../shared/economy.ts";
import type { MonopolyAction } from "../shared/protocol.ts";
import { GameSession, TURN_SECONDS } from "./session.ts";
import { BoardView } from "./board/Board.tsx";
import { ZoomPane } from "./board/ZoomPane.tsx";
import { Seats } from "./board/Seats.tsx";
import { ActionBar } from "./ui/ActionBar.tsx";
import { EventLog } from "./ui/EventLog.tsx";
import { TileDialog } from "./ui/TileDialog.tsx";
import { CardDialog } from "./ui/CardDialog.tsx";
import { TradeDialog } from "./ui/TradeDialog.tsx";
import { SettlementDialog } from "./ui/SettlementDialog.tsx";
import { play, setSoundEnabled, setSoundVolume } from "./sound.ts";
import { readThemeMode, setThemeMode, type ThemeMode } from "./theme.ts";

export type Speed = "normal" | "fast" | "off";

const ERROR_TEXT: Record<string, string> = {
  NOT_YOUR_TURN: "还没轮到你。", NOT_NOW: "现在不能这样做。", NOT_ENOUGH_CASH: "现金不足。",
  NOT_OWNER: "这不是你的地产。", GROUP_INCOMPLETE: "需要集齐整个地区组。", BUILD_EVENLY: "需要均衡建造。",
  HAS_BUILDINGS: "有建筑的地产不能抵押。", ALREADY_MORTGAGED: "已经抵押了。", BUILD_LIMIT: "已经到上限。",
  MORTGAGED: "该地产处于抵押状态。", NEED_RAISE_MONEY: "现金不足，需要先筹钱。", BID_TOO_LOW: "出价比最低价还低。",
  PENDING_DECISION: "还有待处理的事情。", GAME_OVER: "对局已结束。", INVALID_ACTION: "这个操作不合法。"
};

export function App(): JSX.Element {
  const [seats, setSeats] = useState(4);
  const [started, setStarted] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [sound, setSound] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>(() => readThemeMode());
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [bidInput, setBidInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [showSettlement, setShowSettlement] = useState(true);
  const [, forceRender] = useState(0);

  const sessionRef = useRef<GameSession | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);

  /** Re-renders the surface whenever the session's state changes. */
  const bump = useCallback(() => forceRender((value) => value + 1), []);

  const startGame = useCallback((seatCount: number) => {
    sessionRef.current?.dispose();
    const next = new GameSession({
      seats: seatCount,
      botSeats: Array.from({ length: seatCount }, (_, seat) => seat).filter((seat) => seat !== 0),
      // A first game is a 快速局: it ends on the clock and ranks by net worth, so it always reaches a result.
      config: { timeLimitMinutes: 60, winCondition: "assets" },
      onError: (code) => setToast(ERROR_TEXT[code] ?? code)
    });
    next.subscribe(bump);
    sessionRef.current = next;
    setSession(next);
    setStarted(true);
    setSelected(null);
    setShowSettlement(true);
    bump();
  }, [bump]);

  useEffect(() => () => { sessionRef.current?.dispose(); }, []);

  // A one-second heartbeat for the turn clock. Only runs while a game is live.
  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [started]);

  /**
   * Sound, driven from the log rather than from the buttons: every cue the player hears is an event the *engine* recorded,
   * so the audio matches the game even when the move came from a bot. Each new log line since the last render gets a cue.
   */
  const heardRef = useRef(0);
  useEffect(() => {
    const log = session?.game.log;
    if (!log) return;
    // On a fresh game, start from the end: the opening lines are not worth a fanfare.
    if (heardRef.current > log.length) heardRef.current = log.length;
    const fresh = log.slice(heardRef.current);
    heardRef.current = log.length;
    for (const entry of fresh) {
      switch (entry.kind) {
        case "roll": play("dice"); break;
        case "buy": play("buy"); break;
        case "rent": play("coin"); break;
        case "build": play("build"); break;
        case "card": play("card"); break;
        case "jail": play("jail"); break;
        case "auction": play("auction"); break;
        case "end": if (entry.text.includes("游戏结束")) play("win"); break;
        default: break;
      }
    }
  }, [session, tick]);

  // A toast clears itself.
  useEffect(() => {
    if (!toast) return;
    play("error");
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  // The animation setting collapses every transition at once, and the theme is one attribute on the root.
  useEffect(() => {
    document.documentElement.dataset.motion = speed === "off" ? "off" : speed;
  }, [speed]);

  useEffect(() => { setSoundEnabled(sound); }, [sound]);

  if (!started || !session || !session.game) {
    return (
      <Lobby
        seats={seats} setSeats={setSeats} onStart={() => startGame(seats)}
        theme={theme} onTheme={(next) => { setTheme(next); setThemeMode(next); }}
      />
    );
  }

  const game = session.game;
  const me = session.me;
  const pending = game.pending;
  const secondsLeft = Math.max(0, Math.min(TURN_SECONDS, TURN_SECONDS - Math.floor((Date.now() - game.turnStartedAt) / 1000)));

  const act = (action: MonopolyAction): void => {
    session.act(action);
    setBidInput("");
    bump();
  };

  const selectedTile = selected !== null ? BOARD_TILES[selected] : null;
  const narrow = isNarrow();

  return (
    <div style={{
      height: "100%", display: "grid",
      // Two named layouts rather than one layout reordered with `order`, which kept getting the header and the seat strip
      // mixed up. Wide: seats | board | log, with the action bar across the bottom. Narrow: header, board, a seat strip,
      // then the action bar, each its own row.
      gridTemplateAreas: narrow
        ? '"head" "board" "seats" "action"'
        : '"seats board log" "action action action"',
      gridTemplateColumns: narrow ? "minmax(0, 1fr)" : "minmax(170px, 208px) minmax(0, 1fr) minmax(196px, 246px)",
      // On a phone the board row takes the slack (`1fr`) and the board sits at the top of it, so the spare height falls
      // between the board and the seat strip — beside the thing the player is looking at — instead of pushing the action
      // bar off the bottom of the screen.
      gridTemplateRows: narrow ? "auto minmax(0, 1fr) auto auto" : "minmax(0, 1fr) auto",
      gap: narrow ? "5px" : "9px",
      padding: narrow
        ? "calc(var(--safe-top) + 4px) calc(var(--safe-right) + 4px) calc(var(--safe-bottom) + 4px) calc(var(--safe-left) + 4px)"
        : "calc(var(--safe-top) + 8px) calc(var(--safe-right) + 10px) calc(var(--safe-bottom) + 8px) calc(var(--safe-left) + 10px)",
      maxWidth: "1600px", margin: "0 auto"
    }}>
      {/* The header is its own row on a phone; on a desktop it sits above the seat column. */}
      {narrow ? (
        <div style={{ gridArea: "head" }}>
          <HeaderBar turn={game.turn} meCash={me.cash} secondsLeft={secondsLeft} narrow
            onMenu={() => setMenuOpen(true)} />
        </div>
      ) : null}

      {/* Seats: a column under the header on a desktop, a flat strip under the board on a phone. */}
      <div style={{ gridArea: "seats", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
        {narrow ? (
          <Seats game={game} meId={session.humanId} horizontal />
        ) : (
          <div style={{ height: "100%", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: "6px" }}>
            <HeaderBar turn={game.turn} meCash={me.cash} secondsLeft={secondsLeft} narrow={false}
              onMenu={() => setMenuOpen(true)} />
            <div style={{ minHeight: 0, overflow: "hidden" }}>
              <Seats game={game} meId={session.humanId} />
            </div>
          </div>
        )}
      </div>

      {/* The board, measured against the room it is actually given. */}
      <div style={{
        gridArea: "board", minWidth: 0, minHeight: 0,
        // On a phone the board is width-limited (a 14:12 ring in 375px is only ~321px tall), so the leftover height would
        // sit above and below it as dead space. Aligning it to the top puts that space under the seats instead, where it
        // does no harm; a desktop centres it, because there the board is height-limited and the space is symmetric.
        display: "grid", alignItems: narrow ? "start" : "center", justifyItems: "center"
      }}>
        <div style={{ width: "100%", height: "100%", display: "grid", alignItems: narrow ? "start" : "center", justifyItems: "center", containerType: "size" }}>
          <div style={{ width: "min(100cqw, calc(100cqh * 14 / 12))", maxWidth: "100%", aspectRatio: "14 / 12", position: "relative" }}>
            <ZoomPane enabled={narrow}>
              <BoardView game={game} meId={session.humanId} selected={selected} onSelect={setSelected} compact={speed === "fast"} dense={narrow} />
            </ZoomPane>
          </div>
        </div>
      </div>

      {/* Log: a column on a desktop, absent on a phone where the board needs the room. */}
      {narrow ? null : (
        <div style={{ gridArea: "log", minHeight: 0, display: "flex" }}>
          <EventLog log={game.log} />
        </div>
      )}

      <div style={{ gridArea: "action" }}>
        <ActionBar
          game={game} meId={session.humanId} onAct={act}
          onTrade={() => setTradeOpen(true)}
          bidInput={bidInput} onBidInput={setBidInput}
          secondsLeft={secondsLeft}
        />
      </div>

      {/* Dialogs */}
      {pending?.kind === "card" && pending.playerId === session.humanId ? (
        <CardDialog deck={pending.deck} cardId={pending.cardId} onAck={() => act({ type: "ackCard" })} />
      ) : null}

      {selectedTile ? (
        <TileDialog
          tile={selectedTile}
          game={game}
          meId={session.humanId}
          onClose={() => setSelected(null)}
          onBuild={() => { act({ type: "build", tile: selectedTile.index }); setSelected(null); }}
          onSell={() => { act({ type: "sellBuilding", tile: selectedTile.index }); setSelected(null); }}
          onMortgage={() => { act({ type: "mortgage", tile: selectedTile.index }); setSelected(null); }}
          onUnmortgage={() => { act({ type: "unmortgage", tile: selectedTile.index }); setSelected(null); }}
        />
      ) : null}

      {tradeOpen ? (
        <TradeDialog
          game={game} meId={session.humanId}
          onClose={() => setTradeOpen(false)}
          onOffer={(toId, give, take, money) => {
            act({ type: "offerTrade", toId, offer: { give, take, money, jailCards: 0 } });
            setTradeOpen(false);
          }}
        />
      ) : null}

      {game.winner && showSettlement ? (
        <SettlementDialog
          game={game} meId={session.humanId}
          onClose={() => setShowSettlement(false)}
          onRestart={() => { setStarted(false); setShowSettlement(true); }}
        />
      ) : null}

      {menuOpen ? (
        <Menu
          speed={speed} setSpeed={setSpeed}
          sound={sound} setSound={setSound}
          theme={theme} setTheme={(next) => { setTheme(next); setThemeMode(next); }}
          onResign={() => { session.resign(); setMenuOpen(false); }}
          onQuit={() => { session.dispose(); setStarted(false); setMenuOpen(false); }}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}

      {toast ? (
        <div role="status" style={{
          position: "fixed", left: "50%", bottom: "calc(var(--safe-bottom) + 78px)", transform: "translateX(-50%)",
          zIndex: 60, padding: "7px 14px", borderRadius: "var(--radius)",
          background: "var(--surface-raised)", border: "1px solid var(--border-strong)",
          color: "var(--text)", fontSize: "12px", fontWeight: 650,
          animation: "panel-in 160ms ease both", pointerEvents: "none", maxWidth: "86vw"
        }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/** A compact header: whose turn, the clock, your cash, and the menu. */
function HeaderBar({ turn, meCash, secondsLeft, onMenu, narrow }: {
  turn: number; meCash: number; secondsLeft: number; onMenu: () => void; narrow: boolean;
}): JSX.Element {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px", flexShrink: 0,
      padding: "6px 8px", borderRadius: "var(--radius-lg)",
      background: "var(--surface)", border: "1px solid var(--border)"
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="eyebrow" style={{ display: "block", fontSize: "10px", lineHeight: 1.15 }}>第 {turn} 回合</span>
        <span className="num" style={{ display: "block", fontSize: "13px", fontWeight: 700, lineHeight: 1.25 }}>
          {formatMoney(meCash)}
        </span>
      </span>
      {narrow ? null : (
        <span className="num" style={{ fontSize: "11px", color: "var(--muted)" }}>{secondsLeft}s</span>
      )}
      <button type="button" onClick={onMenu} aria-label="菜单" className="secondary"
        style={{ width: "30px", height: "30px", minWidth: "30px", minHeight: "30px", padding: 0, display: "grid", placeItems: "center" }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" />
        </svg>
      </button>
    </div>
  );
}

/** The menu: the things a player may want mid-game, including the theme, as in every other LayUDown surface. */
function Menu({ speed, setSpeed, sound, setSound, theme, setTheme, onResign, onQuit, onClose }: {
  speed: Speed; setSpeed: (next: Speed) => void;
  sound: boolean; setSound: (next: boolean) => void;
  theme: ThemeMode; setTheme: (next: ThemeMode) => void;
  onResign: () => void; onQuit: () => void; onClose: () => void;
}): JSX.Element {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 50, background: "rgba(0, 0, 0, 0.45)",
      display: "grid", placeItems: "center", padding: "16px", animation: "fade-in 140ms ease both"
    }}>
      <div onClick={(event) => event.stopPropagation()} style={{
        width: "100%", maxWidth: "290px", padding: "15px",
        background: "var(--surface)", borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-strong)",
        display: "flex", flexDirection: "column", gap: "13px", animation: "panel-in 180ms ease both"
      }}>
        <h4 style={{ fontSize: "14px", fontWeight: 650 }}>设置</h4>

        <Group label="主题">
          {(["auto", "light", "dark"] as const).map((option) => (
            <Pill key={option} on={theme === option} onClick={() => setTheme(option)}>
              {option === "auto" ? "跟随系统" : option === "light" ? "浅色" : "深色"}
            </Pill>
          ))}
        </Group>

        <Group label="动画">
          {(["normal", "fast", "off"] as const).map((option) => (
            <Pill key={option} on={speed === option} onClick={() => setSpeed(option)}>
              {option === "normal" ? "正常" : option === "fast" ? "快速" : "关闭"}
            </Pill>
          ))}
        </Group>

        <Group label="音效">
          <Pill on={sound} onClick={() => setSound(!sound)}>{sound ? "开" : "关"}</Pill>
          <input type="range" min={0} max={1} step={0.05} defaultValue={0.22}
            onChange={(event) => setSoundVolume(Number(event.target.value))}
            style={{ flex: 1, accentColor: "var(--accent)" }} aria-label="音量" />
        </Group>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "1px" }}>
          <button type="button" className="secondary" onClick={onResign}>结束本局</button>
          <button type="button" className="danger-quiet" onClick={onQuit}>退出房间</button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: "5px" }}>{label}</div>
      <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>{children}</div>
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button type="button" onClick={onClick} className={on ? "primary" : "secondary"}
      style={{ minHeight: "30px", padding: "0 10px", fontSize: "12px" }}>
      {children}
    </button>
  );
}

/** The start screen: pick the table size and begin. Two controls, no account, no branding. */
function Lobby({ seats, setSeats, onStart, theme, onTheme }: {
  seats: number; setSeats: (next: number) => void; onStart: () => void;
  theme: ThemeMode; onTheme: (next: ThemeMode) => void;
}): JSX.Element {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", padding: "20px", position: "relative" }}>
      {/* The theme switch stays available before a game starts, so the choice can be made in the lobby. It is three
          buttons rather than a cycling one: a player can see what the options are without pressing through them. */}
      <div style={{
        position: "absolute", top: "calc(var(--safe-top) + 12px)", right: "calc(var(--safe-right) + 12px)",
        display: "flex", gap: "4px"
      }}>
        {(["auto", "light", "dark"] as const).map((option) => (
          <button key={option} type="button" className={theme === option ? "primary" : "secondary"}
            onClick={() => onTheme(option)}
            style={{ minHeight: "30px", padding: "0 9px", fontSize: "11px" }}>
            {option === "auto" ? "跟随系统" : option === "light" ? "浅色" : "深色"}
          </button>
        ))}
      </div>

      <div style={{
        width: "100%", maxWidth: "360px", padding: "24px 22px",
        background: "var(--surface)", borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)",
        display: "flex", flexDirection: "column", gap: "18px", animation: "panel-in 240ms ease both"
      }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "0.02em" }}>大富翁</h1>
          <p className="muted" style={{ marginTop: "4px", fontSize: "12px", lineHeight: 1.6 }}>
            48 格环游世界 · 其余席位由电脑补足
          </p>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: "7px" }}>人数</div>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {[2, 3, 4, 5, 6].map((count) => (
              <button key={count} type="button" className={seats === count ? "primary" : "secondary"}
                onClick={() => setSeats(count)} style={{ flex: 1, minWidth: "44px", fontSize: "14px" }}>
                {count}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="primary" onClick={onStart} style={{ height: "44px", fontSize: "15px" }}>
          开始游戏
        </button>

        <p className="faint" style={{ fontSize: "11px", textAlign: "center", lineHeight: 1.6 }}>
          快速局：60 分钟后按总资产结算
        </p>
      </div>
    </div>
  );
}

/** True when the viewport is phone-sized. Re-read on every render; the board itself is CSS-sized, so this only picks layout. */
function isNarrow(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 760;
}