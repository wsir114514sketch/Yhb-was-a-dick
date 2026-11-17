/**
 * The board: 48 tiles on a ring around a working centre.
 *
 * The centre is the table's status board, not an illustration: whose turn it is, both decks with what is left in them, the
 * dice, and the last thing that happened. That is the same job UNO's `.table-center` does — it exists to be read at a
 * glance, so it is a flat panel with one hairline border and no ornament.
 *
 * The only ambient colour is the current player's, and it appears in one place (the turn line's marker), not as a wash over
 * the whole surface.
 */

import { useRef } from "react";
import type { JSX } from "react";
import { BOARD_TILES, REGIONS, REGION_PROPERTIES, isCommercial, tileName, type CommercialTile } from "../../shared/board.ts";
import { formatMoney } from "../../shared/economy.ts";
import type { MonopolyAction, MonopolyGame, Ownership, PlayerState } from "../../shared/protocol.ts";
import { canDo } from "../../shared/legal.ts";
import { Token, seatColor } from "../art/tokens.tsx";
import { Avatar } from "../ui/Avatar.tsx";
import { GameClockChip } from "../ui/GameClockChip.tsx";
import { TileView } from "./Tile.tsx";
import { Dice } from "./Dice.tsx";
import { centerOf, layoutOf } from "./geometry.ts";
import { FxLayer } from "../fx/FxLayer.tsx";
import type { MotionMode } from "../fx/timing.ts";

export interface BoardViewProps {
  game: MonopolyGame;
  meId: string;
  /** The tile whose detail card is open, if any. */
  selected: number | null;
  onSelect: (tile: number | null) => void;
  /** True at the faster animation setting, which shrinks the drawings a little. */
  compact: boolean;
  /** A small board (a phone) drops the centre's log line so the tiles stay legible. */
  dense?: boolean;
  /** Sends an action, for the dice click and the jail moves that live in the centre. */
  onAct?: (action: MonopolyAction) => void;
  /** 动画档位，决定动效层的时长倍率。 */
  motion?: MotionMode;
  /** 棋盘皮肤：只换 CSS 变量与纹理（board.css）。 */
  skin?: BoardSkin;
  /** 收到当前状态的本地时刻：中央时钟用它补出两次广播之间的时间。 */
  clockReceivedAt?: number;
  /** 当前本地时刻，每秒刷新一次。 */
  now?: number;
  /** 打开银行面板。 */
  onOpenBank?: () => void;
}

export type BoardSkin = "classic" | "map" | "night";

/** 最近一次掷骰的日志 id。从尾部找，通常一两步就命中。 */
function lastRollId(game: MonopolyGame): number | undefined {
  for (let index = game.log.length - 1; index >= 0; index -= 1) {
    if (game.log[index]!.kind === "roll") return game.log[index]!.id;
  }
  return undefined;
}

/** Which regions one player holds outright, for the completed-group edge. */
function monopolies(game: MonopolyGame): Set<string> {
  const held = new Set<string>();
  for (const region of REGIONS) {
    const members = REGION_PROPERTIES[region.id] ?? [];
    if (!members.length) continue;
    const owners = members.map((member) => game.ownership.find((entry) => entry.tile === member.index)?.ownerId);
    if (owners[0] && owners.every((ownerId) => ownerId === owners[0])) held.add(region.id);
  }
  return held;
}

export function BoardView({ game, meId, selected, onSelect, compact, dense, onAct, motion = "normal", skin = "classic", clockReceivedAt, now, onOpenBank }: BoardViewProps): JSX.Element {
  const label = useRef<HTMLDivElement | null>(null);
  const ownerOf = (tile: number): Ownership | undefined => game.ownership.find((entry) => entry.tile === tile);
  const playerById = (id: string | undefined): PlayerState | undefined => game.players.find((player) => player.id === id);
  const wholeRegions = monopolies(game);

  const current = game.players.find((player) => player.id === game.order[game.turnIndex]) ?? game.players[0]!;

  /** 悬停地名：整块棋盘只有一个标签节点，这里直接改它的文字与位置，不经过 React 状态。 */
  const hover = (index: number | null): void => {
    const node = label.current;
    if (!node) return;
    if (index === null) { node.dataset.on = "0"; return; }
    const tile = BOARD_TILES[index]!;
    const cell = layoutOf(index);
    const center = centerOf(index);
    const owner = playerById(ownerOf(index)?.ownerId);
    node.textContent = `${tileName(tile)}${isCommercial(tile) ? ` · ${formatMoney(tile.price)}` : ""}${owner ? ` · ${owner.username}` : ""}`;
    const above = cell.side !== "top";
    // 靠边的格子把标签往里推，不让它伸出棋盘。
    const edge = center.x < 12 ? "0%" : center.x > 88 ? "-100%" : "-50%";
    node.style.left = `${center.x < 12 ? cell.x : center.x > 88 ? cell.x + cell.w : center.x}%`;
    node.style.top = `${above ? cell.y : cell.y + cell.h}%`;
    node.style.transform = `translate(${edge}, ${above ? "calc(-100% - 4px)" : "4px"})`;
    node.dataset.on = "1";
  };

  return (
    <div className="monopoly-board" data-skin={skin === "classic" ? undefined : skin} style={{
      position: "relative", width: "100%", height: "100%",
      // A size container, so the centre can size itself in `cqw` against the board rather than the viewport: the board is
      // not the window, and a vw-based font would be wrong on a desktop with a narrow board column.
      containerType: "size",
      background: "linear-gradient(var(--board-tint), var(--board-tint)), var(--board-bg)",
      border: "1px solid var(--board-line)",
      borderRadius: "var(--radius-lg)",
      padding: "0.35%"
    }}>
      {(["tl", "tr", "bl", "br"] as const).map((corner) => <span key={corner} className={`board-corner ${corner}`} aria-hidden="true" />)}
      {BOARD_TILES.map((tile) => {
        const ownership = ownerOf(tile.index);
        const owner = playerById(ownership?.ownerId);
        const commercial = isCommercial(tile);
        return (
          <TileView
            key={tile.index}
            tile={tile}
            ownership={ownership}
            owner={owner}
            highlight={selected === tile.index}
            monopoly={commercial && wholeRegions.has((tile as CommercialTile).region)}
            onClick={() => onSelect(selected === tile.index ? null : tile.index)}
            onHover={hover}
          />
        );
      })}

      <BoardCenter game={game} current={current} meId={meId} dense={dense} compact={compact} onAct={onAct}
        clockReceivedAt={clockReceivedAt} now={now} onOpenBank={onOpenBank} />

      <FxLayer game={game} compact={compact} motion={motion} meId={meId} version={`${game.startedAt}:${game.log.length}`} />
      <div ref={label} className="board-hover-label" aria-hidden="true" />
    </div>
  );
}

/**
 * The middle of the board. Three rows: the turn, the table's contents (decks and dice), and the last event. It is a panel
 * like any other — same border, same fill, same radius — because it is furniture, not a stage.
 *
 * The dice are the roll button: when it is the viewer's turn and the engine waits for the throw, they take the pointer and
 * send it. The jail question is answered here too — use the card or pay the fine — because those are things you do at the
 * table, not menu items for a bar.
 */
function BoardCenter({ game, current, meId, dense, compact, onAct, clockReceivedAt, now, onOpenBank }: {
  game: MonopolyGame; current: PlayerState; meId: string; dense?: boolean; compact: boolean;
  onAct?: (action: MonopolyAction) => void;
  clockReceivedAt?: number; now?: number; onOpenBank?: () => void;
}): JSX.Element {
  const lastLine = game.log[game.log.length - 1];
  const isMine = current?.id === meId;
  const dice = game.lastRoll?.dice;
  const chanceLeft = game.decks.chance.length;
  const fundLeft = game.decks.fund.length;
  const me = game.players.find((player) => player.id === meId);
  // The dice accept the click only when the engine is actually waiting on this viewer's roll.
  const canRoll = !!onAct && isMine && !game.pending && !game.winner
    && game.stage === "roll" && !me?.bankrupt
    && canDo(game, meId, { type: "roll" });
  const inJailHere = canRoll && !!me?.inJail;

  return (
    <div style={{
      position: "absolute",
      // Inset to the ring's inner edge. A dense board insets less, so the centre gives its room to the tiles.
      left: dense ? "6.4%" : "7.2%", right: dense ? "6.4%" : "7.2%",
      top: dense ? "6.6%" : "8.33%", bottom: dense ? "6.6%" : "8.33%",
      border: "1px solid var(--board-line)",
      borderRadius: "var(--radius)",
      background: "var(--felt-grain), linear-gradient(var(--board-tint), var(--board-tint)), var(--board-centre)",
      // Four rows: the turn line, the table (which takes the slack), the standings, and the last event. The `1fr` on the
      // table row is what keeps the centre from looking empty — the decks and dice sit in the middle of the space rather
      // than huddling at the top of it.
      display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto auto",
      alignItems: "center", justifyItems: "center",
      padding: compact ? "2.4% 2.6%" : "2.6% 3%", gap: "1.6%",
      // The panel lets clicks pass through it; the dice and the jail buttons re-enable them on themselves,
      // which is what makes the centre's controls clickable while the centre stays display-only.
      overflow: "hidden", pointerEvents: "none"
    }}>
      <Track />

      {/* Whose turn it is. The one place the current player's colour appears in the centre. */}
      <div style={{ display: "flex", alignItems: "center", gap: "7px", maxWidth: "100%" }}>
        {/* 回合牌：回合数是一张立着的小牌，而不是一行小字。 */}
        <span className="turn-card" aria-label={`第 ${game.turn} 回合`}><small>回合</small><b>{game.turn}</b></span>
        <span style={{
          width: "3px", height: "16px", borderRadius: "2px",
          background: seatColor(current?.seat ?? 0), flex: "0 0 auto"
        }} />
        <Token seat={current?.seat ?? 0} size={15} />
        <span style={{
          fontSize: "clamp(10px, 1.05vw, 14px)", fontWeight: 650, color: "var(--text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
        }}>
          {current?.username ?? "—"}
        </span>
        <span style={{ fontSize: "clamp(9px, .82vw, 11px)", color: "var(--muted)", whiteSpace: "nowrap" }}>
          {isMine ? "轮到你" : "行动中"}
        </span>
      </div>

      {/* The table: both decks with their counts, and the dice between them. Scaled off the board's own width (`cqw`), so
          the centre fills a large desktop board and still fits a 360px phone without a media query. The deck faces are
          sized in cqw too, which is what makes the middle of a big board look like a table rather than a stamp. */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", justifyItems: "center",
        gap: "clamp(10px, 3cqw, 40px)", width: "100%", height: "100%", minHeight: 0
      }}>
        {/* Left column: the deck, with its remaining count stated large — the count is the fact a player wants. */}
        <div style={{ position: "relative", width: "100%", height: "100%", display: "grid", placeItems: "center", minWidth: 0 }}>
          <Deck label="机会" count={chanceLeft} deck="chance" active={game.pending?.kind === "card" && game.pending.deck === "chance"} side="left" />
          {/* 中央区域左下角：游戏时间与银行入口相邻放着，棋子、骰子和牌堆都不受影响。 */}
          <div style={{
            position: "absolute", left: 0, bottom: 0, display: "flex",
            flexDirection: dense ? "column" : "row", alignItems: "flex-end", gap: "clamp(3px, .6cqw, 8px)",
            pointerEvents: "auto", zIndex: 2, maxWidth: "100%"
          }}>
            {clockReceivedAt !== undefined && now !== undefined ? (
              <GameClockChip game={game} receivedAt={clockReceivedAt} now={now} dense={dense} />
            ) : null}
            {onOpenBank ? (
              <button type="button" className="secondary" onClick={onOpenBank} aria-label="银行"
                style={{
                  minHeight: dense ? "22px" : "clamp(22px, 3cqw, 32px)",
                  padding: dense ? "0 7px" : "0 clamp(7px, 1cqw, 12px)",
                  fontSize: dense ? "10px" : "clamp(9px, 1cqw, 12px)"
                }}>银行</button>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(2px, .5cqw, 6px)" }}>
          <div className="dice-tray">
          <DiceTray />
          <Dice dice={dice} doubles={game.lastRoll?.doubles} compact={compact} rollKey={lastRollId(game)}
            canRoll={canRoll} onRoll={canRoll && onAct ? () => onAct({ type: "roll" }) : undefined} />
          </div>
          {/* The jail answer lives where the dice are: two quiet moves, shown only while the viewer is in jail. */}
          {inJailHere && onAct ? (
            <div style={{ display: "flex", gap: "5px", pointerEvents: "auto" }}>
              {me && me.jailCards > 0 ? (
                <button type="button" className="secondary" style={{ minHeight: "24px", padding: "0 8px", fontSize: "11px" }}
                  onClick={() => onAct({ type: "useJailCard" })}>出狱卡</button>
              ) : null}
              {me && canDo(game, meId, { type: "payJailFine" }) ? (
                <button type="button" className="secondary" style={{ minHeight: "24px", padding: "0 8px", fontSize: "11px" }}
                  onClick={() => onAct({ type: "payJailFine" })}>缴费出狱</button>
              ) : null}
            </div>
          ) : null}
        </div>
        <Deck label="基金" count={fundLeft} deck="fund" active={game.pending?.kind === "card" && game.pending.deck === "fund"} side="right" />
      </div>

      {/* Below the table: where everyone stands. This is the space a player looks at when deciding whether to trade, and it
          is the reason the centre is a working panel rather than an ornament — the four figures are the whole game state
          that one screen can hold. */}
      <Standings game={game} dense={dense} />

      {/* The last event. Dropped on a dense board: the log panel already has it, and a phone needs the room. */}
      <div style={{
        display: dense ? "none" : "block", maxWidth: "100%",
        fontSize: "clamp(9px, .95cqw, 13px)", color: "var(--muted)", textAlign: "center",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        paddingBottom: "0.5%"
      }}>
        {lastLine?.text ?? "掷骰开始"}
      </div>
    </div>
  );
}

/**
 * Where every player stands, as a compact strip under the table: piece, name, cash, and how many tiles they hold.
 *
 * On a phone the seats panel is already a strip below the board, so this would be the same information twice; there it is
 * dropped.
 */
function Standings({ game, dense }: { game: MonopolyGame; dense?: boolean }): JSX.Element | null {
  if (dense) return null;
  const ordered = game.order
    .map((id) => game.players.find((player) => player.id === id))
    .filter((player): player is PlayerState => !!player);

  return (
    <div style={{
      display: "flex", alignItems: "stretch", justifyContent: "center", flexWrap: "nowrap",
      gap: "clamp(4px, 1cqw, 12px)", width: "100%", minHeight: 0, overflow: "hidden"
    }}>
      {ordered.map((player) => {
        const held = game.ownership.filter((entry) => entry.ownerId === player.id).length;
        const isTurn = player.id === game.order[game.turnIndex];
        return (
          <div key={player.id} style={{
            display: "flex", alignItems: "center", gap: "clamp(3px, .7cqw, 8px)",
            minWidth: 0, flex: "1 1 0", maxWidth: "26%",
            padding: "clamp(2px, .55cqw, 7px) clamp(4px, .9cqw, 11px)",
            borderRadius: "var(--radius-sm)",
            background: isTurn ? "var(--surface-raised)" : "transparent",
            border: `1px solid ${isTurn ? "var(--border-strong)" : "var(--border)"}`,
            opacity: player.bankrupt ? 0.45 : 1
          }}>
            <Avatar seat={player.seat} avatarUrl={player.avatarUrl} size="clamp(15px, 2.3cqw, 24px)" />
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: "0px" }}>
              <span style={{
                fontSize: "clamp(8px, 1cqw, 12px)", color: "var(--muted)", lineHeight: 1.15,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
              }}>{player.username}</span>
              <span className="num" style={{
                fontSize: "clamp(10px, 1.35cqw, 16px)", fontWeight: 700, lineHeight: 1.15, whiteSpace: "nowrap"
              }}>{formatMoney(player.cash)}</span>
            </span>
            <span className="num" style={{
              marginLeft: "auto", fontSize: "clamp(8px, 1cqw, 12px)", color: "var(--muted)", whiteSpace: "nowrap"
            }}>{held} 处</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A deck: a card-shaped block with how many are left in it.
 *
 * The count is set large beside the card rather than as a small caption under it, because the remaining draw is the one
 * fact a player wants from the deck and a caption at 9px says nothing. A stack of card backs would look richer and say
 * less.
 */
function Deck({ label, count, deck, active, side }: {
  label: string; count: number; deck: "chance" | "fund"; active: boolean; side: "left" | "right";
}): JSX.Element {
  const card = (
    <div className={`deck-card ${deck}`} data-deck={deck} style={{
      // Sized against the board, so a desktop deck is a real card and a phone deck is a token. The height cap keeps the
      // card from towering on a very tall board.
      width: "clamp(28px, 8cqw, 104px)", aspectRatio: "3 / 4",
      maxHeight: "clamp(38px, 11cqw, 138px)",
      borderRadius: "var(--radius-sm)",
      border: active ? "2px solid var(--accent)" : "1px solid var(--board-line)",
      display: "grid", placeItems: "center",
      color: "var(--tile-muted)", flex: "0 0 auto"
    }}>
      <svg viewBox="0 0 24 24" width="52%" height="52%" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    </div>
  );
  const label2 = (
    <div style={{
      display: "flex", flexDirection: "column", gap: "clamp(1px, .3cqw, 4px)",
      alignItems: side === "left" ? "flex-end" : "flex-start"
    }}>
      <span style={{ fontSize: "clamp(9px, 1.2cqw, 14px)", color: "var(--muted)", lineHeight: 1.1 }}>{label}</span>
      <span className="num" style={{
        fontSize: "clamp(16px, 3.4cqw, 40px)", fontWeight: 700, lineHeight: 1, color: "var(--text)"
      }}>{count}</span>
      <span style={{ fontSize: "clamp(8px, .95cqw, 11px)", color: "var(--muted)", lineHeight: 1 }}>张剩余</span>
    </div>
  );
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "clamp(6px, 1.4cqw, 16px)",
      // The deck sits on its own side of the board, with its count facing the middle, so the two read toward the dice.
      flexDirection: side === "left" ? "row" : "row-reverse"
    }}>
      {card}
      {label2}
    </div>
  );
}

/**
 * 环内侧一圈静态的行进方向轨道：虚线 + 四个方向箭头（顺时针：底边向左、左边向上、顶边向右、右边向下）。
 * 只在中心区里画一次，不动。
 */
function Track(): JSX.Element {
  const line = { fill: "none", stroke: "var(--track)", vectorEffect: "non-scaling-stroke" } as const;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <rect x="1.4" y="1.8" width="97.2" height="96.4" rx="1.2" {...line} strokeWidth="1" strokeDasharray="2 5" opacity="0.8" />
      <path d="M51.2 96.6 49 98.2 51.2 99.8" {...line} strokeWidth="1.4" />
      <path d="M-0.2 51.6 1.4 49.6 3 51.6" {...line} strokeWidth="1.4" />
      <path d="M48.8 0.2 51 1.8 48.8 3.4" {...line} strokeWidth="1.4" />
      <path d="M97 48.4 98.6 50.4 100.2 48.4" {...line} strokeWidth="1.4" />
    </svg>
  );
}

/** 骰盘：一圈外框，一圈刻度。 */
function DiceTray(): JSX.Element {
  return (
    <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="1" width="98" height="58" rx="12" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7" />
      <rect x="5" y="5" width="90" height="50" rx="9" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="1 6" vectorEffect="non-scaling-stroke" opacity="0.6" />
    </svg>
  );
}
