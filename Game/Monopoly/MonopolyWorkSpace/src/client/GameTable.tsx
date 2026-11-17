/**
 * The game surface, shared by the offline table and the online room.
 *
 * It owns only view state — which card is open, the menu, the animation setting — and everything else is presentational.
 * Where an action goes is not this component's business: it takes an `act` callback, so the local session can apply it
 * through the engine and the online session can send it to the server. That is the whole difference between the two modes.
 *
 * - A desktop gets the board in the middle, seats on the left, the log on the right, and the action bar underneath.
 * - A phone gets the board on top, seats in a horizontal strip, the action bar at the bottom, and every dialog as a sheet.
 */

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { BOARD_TILES } from "../shared/board.ts";
import { formatMoney } from "../shared/economy.ts";
import type { MonopolyAction, MonopolyGame } from "../shared/protocol.ts";
import { BoardView } from "./board/Board.tsx";
import { ZoomPane } from "./board/ZoomPane.tsx";
import { Seats } from "./board/Seats.tsx";
import { ActionBar } from "./ui/ActionBar.tsx";
import { EventLog } from "./ui/EventLog.tsx";
import { TileDialog } from "./ui/TileDialog.tsx";
import { CardDialog } from "./ui/CardDialog.tsx";
import { TradeDialog } from "./ui/TradeDialog.tsx";
import { SettlementDialog } from "./ui/SettlementDialog.tsx";
import { RulesDialog } from "./ui/RulesDialog.tsx";
import { play, setSoundEnabled, setSoundVolume } from "./sound.ts";
import { readThemeMode, setThemeMode, type ThemeMode } from "./theme.ts";
import { applyMotionScale } from "./fx/timing.ts";

export type Speed = "normal" | "fast" | "off";

/** Per-turn clock, in seconds, for the bar. The server enforces its own; this is display only. */
const TURN_SECONDS = 60;

export interface GameTableProps {
  game: MonopolyGame;
  /** The seat this browser is looking at. Offline that is the human's seat; online it is the signed-in account. */
  meId: string;
  /** Sends one action. Offline it is applied at once; online it is sent to the server. */
  onAct: (action: MonopolyAction) => void;
  /** A refusal or a notice, shown briefly over the table. */
  toast: string | null;
  speed: Speed;
  setSpeed: (next: Speed) => void;
  sound: boolean;
  setSound: (next: boolean) => void;
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
  /** The menu's "leave" entry: quitting offline, or leaving the room online. */
  onQuit: () => void;
  /** What "end the game" does. Offline it resigns; online the host closes the table. */
  onEndGame: () => void;
  /** The settlement dialog's button, when the game is over. */
  onPlayAgain: () => void;
  /** Drawn above the table, e.g. the online connection badge. */
  banner?: JSX.Element | null;
}

export function GameTable(props: GameTableProps): JSX.Element {
  const { game, meId, onAct, toast, speed, setSpeed, sound, setSound, theme, setTheme } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [bidInput, setBidInput] = useState("");
  const [showSettlement, setShowSettlement] = useState(true);
  // A first-time player gets the rules once, on their first table. The flag lives in localStorage so it
  // stays read; the menu's 玩法说明 entry reopens it any time.
  const [rulesOpen, setRulesOpen] = useState(() => {
    try { return localStorage.getItem("monopoly.rulesSeen") === null; } catch { return false; }
  });
  const [, forceRender] = useState(0);

  const closeRules = (): void => {
    setRulesOpen(false);
    try { localStorage.setItem("monopoly.rulesSeen", "1"); } catch { /* private mode: show it every time */ }
  };

  const bump = (): void => forceRender((value) => value + 1);
  const act = (action: MonopolyAction): void => {
    onAct(action);
    setBidInput("");
    bump();
  };

  // A one-second heartbeat for the turn clock.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  /**
   * Sound, driven from the log rather than from the buttons: every cue the player hears is an event the *engine* recorded,
   * so the audio matches the game even when the move came from someone else. Each new log line since the last render gets
   * a cue.
   */
  const heardRef = useRef(0);
  useEffect(() => {
    const log = game.log;
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
  });

  // The animation setting collapses every transition at once, and the theme is one attribute on the root.
  useEffect(() => { document.documentElement.dataset.motion = speed === "off" ? "off" : speed; applyMotionScale(speed); }, [speed]);
  useEffect(() => { setSoundEnabled(sound); }, [sound]);
  // A new game (or a fresh room) starts with the settlement dialog closed over.
  useEffect(() => { setShowSettlement(true); }, [game.startedAt]);

  const me = game.players.find((player) => player.id === meId) ?? game.players[0]!;
  const pending = game.pending;
  const secondsLeft = Math.max(0, Math.min(TURN_SECONDS, TURN_SECONDS - Math.floor((Date.now() - game.turnStartedAt) / 1000)));
  const selectedTile = selected !== null ? BOARD_TILES[selected] : null;
  const narrow = isNarrow();

  return (
    <div style={{
      height: "100%", display: "grid",
      gridTemplateAreas: narrow
        ? '"head" "board" "seats" "action"'
        : '"seats board log" "action action action"',
      gridTemplateColumns: narrow ? "minmax(0, 1fr)" : "minmax(170px, 208px) minmax(0, 1fr) minmax(196px, 246px)",
      gridTemplateRows: narrow ? "auto minmax(0, 1fr) auto auto" : "minmax(0, 1fr) auto",
      gap: narrow ? "5px" : "9px",
      padding: narrow
        ? "calc(var(--safe-top) + 4px) calc(var(--safe-right) + 4px) calc(var(--safe-bottom) + 4px) calc(var(--safe-left) + 4px)"
        : "calc(var(--safe-top) + 8px) calc(var(--safe-right) + 10px) calc(var(--safe-bottom) + 8px) calc(var(--safe-left) + 10px)",
      maxWidth: "1600px", margin: "0 auto"
    }}>
      {props.banner ? <div style={{ gridArea: "head" }}>{props.banner}</div> : null}

      <div style={{ gridArea: "seats", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
        {narrow ? (
          <Seats game={game} meId={meId} horizontal />
        ) : (
          <div style={{ height: "100%", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: "6px" }}>
            <HeaderBar turn={game.turn} meCash={me.cash} secondsLeft={secondsLeft} narrow={false}
              onMenu={() => setMenuOpen(true)} />
            <div style={{ minHeight: 0, overflow: "hidden" }}>
              <Seats game={game} meId={meId} />
            </div>
          </div>
        )}
      </div>

      <div style={{
        gridArea: "board", minWidth: 0, minHeight: 0,
        display: "grid", alignItems: narrow ? "start" : "center", justifyItems: "center"
      }}>
        <div style={{ width: "100%", height: "100%", display: "grid", alignItems: narrow ? "start" : "center", justifyItems: "center", containerType: "size" }}>
          <div style={{ width: "min(100cqw, calc(100cqh * 14 / 12))", maxWidth: "100%", aspectRatio: "14 / 12", position: "relative" }}>
            <ZoomPane enabled={narrow}>
              <BoardView game={game} meId={meId} selected={selected} onSelect={setSelected} compact={speed === "fast"} dense={narrow} onAct={act} motion={speed} />
            </ZoomPane>
          </div>
        </div>
      </div>

      {narrow ? (
        <div style={{ gridArea: "head" }}>
          <HeaderBar turn={game.turn} meCash={me.cash} secondsLeft={secondsLeft} narrow
            onMenu={() => setMenuOpen(true)} />
        </div>
      ) : (
        <div style={{ gridArea: "log", minHeight: 0, display: "flex" }}>
          <EventLog log={game.log} />
        </div>
      )}

      <div style={{ gridArea: "action" }}>
        <ActionBar
          game={game} meId={meId} onAct={act}
          onTrade={() => setTradeOpen(true)}
          bidInput={bidInput} onBidInput={setBidInput}
          secondsLeft={secondsLeft}
        />
      </div>

      {pending?.kind === "card" && pending.playerId === meId ? (
        <CardDialog deck={pending.deck} cardId={pending.cardId} onAck={() => act({ type: "ackCard" })} />
      ) : null}

      {selectedTile ? (
        <TileDialog
          tile={selectedTile}
          game={game}
          meId={meId}
          onClose={() => setSelected(null)}
          onBuild={() => { act({ type: "build", tile: selectedTile.index }); setSelected(null); }}
          onSell={() => { act({ type: "sellBuilding", tile: selectedTile.index }); setSelected(null); }}
          onMortgage={() => { act({ type: "mortgage", tile: selectedTile.index }); setSelected(null); }}
          onUnmortgage={() => { act({ type: "unmortgage", tile: selectedTile.index }); setSelected(null); }}
        />
      ) : null}

      {tradeOpen ? (
        <TradeDialog
          game={game} meId={meId}
          onClose={() => setTradeOpen(false)}
          onOffer={(toId, give, take, money) => {
            act({ type: "offerTrade", toId, offer: { give, take, money, jailCards: 0 } });
            setTradeOpen(false);
          }}
        />
      ) : null}

      {game.winner && showSettlement ? (
        <SettlementDialog
          game={game} meId={meId}
          onClose={() => setShowSettlement(false)}
          onRestart={props.onPlayAgain}
        />
      ) : null}

      {menuOpen ? (
        <Menu
          speed={speed} setSpeed={setSpeed}
          sound={sound} setSound={setSound}
          theme={theme} setTheme={setTheme}
          onRules={() => { setMenuOpen(false); setRulesOpen(true); }}
          onResign={props.onEndGame}
          onQuit={props.onQuit}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}

      {rulesOpen ? <RulesDialog onClose={closeRules} /> : null}

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
function Menu({ speed, setSpeed, sound, setSound, theme, setTheme, onRules, onResign, onQuit, onClose }: {
  speed: Speed; setSpeed: (next: Speed) => void;
  sound: boolean; setSound: (next: boolean) => void;
  theme: ThemeMode; setTheme: (next: ThemeMode) => void;
  onRules: () => void;
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
          <button type="button" className="secondary" onClick={onRules}>玩法说明</button>
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

/** True when the viewport is phone-sized. Re-read on every render; the board itself is CSS-sized, so this only picks layout. */
function isNarrow(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 760;
}

/** The shared sound/theme settings, so the offline and online modes start from the same place. */
export function useTableSettings(): {
  speed: Speed; setSpeed: (next: Speed) => void;
  sound: boolean; setSound: (next: boolean) => void;
  theme: ThemeMode; setTheme: (next: ThemeMode) => void;
} {
  const [speed, setSpeed] = useState<Speed>("normal");
  const [sound, setSound] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>(() => readThemeMode());
  return {
    speed, setSpeed,
    sound, setSound,
    theme, setTheme: (next) => { setTheme(next); setThemeMode(next); }
  };
}