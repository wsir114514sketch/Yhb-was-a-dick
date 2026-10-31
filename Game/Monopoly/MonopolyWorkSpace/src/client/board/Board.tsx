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

import type { JSX } from "react";
import { BOARD_TILES, REGIONS, REGION_PROPERTIES, isCommercial, type CommercialTile } from "../../shared/board.ts";
import { formatMoney } from "../../shared/economy.ts";
import type { MonopolyGame, Ownership, PlayerState } from "../../shared/protocol.ts";
import { Token, seatColor } from "../art/tokens.tsx";
import { TileView } from "./Tile.tsx";
import { Dice } from "./Dice.tsx";

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

export function BoardView({ game, meId, selected, onSelect, compact, dense }: BoardViewProps): JSX.Element {
  const ownerOf = (tile: number): Ownership | undefined => game.ownership.find((entry) => entry.tile === tile);
  const playerById = (id: string | undefined): PlayerState | undefined => game.players.find((player) => player.id === id);
  const wholeRegions = monopolies(game);

  const occupantsOf = (tile: number): PlayerState[] =>
    game.players.filter((player) => player.position === tile && !player.bankrupt).sort((left, right) => left.seat - right.seat);

  const current = game.players.find((player) => player.id === game.order[game.turnIndex]) ?? game.players[0]!;

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      // A size container, so the centre can size itself in `cqw` against the board rather than the viewport: the board is
      // not the window, and a vw-based font would be wrong on a desktop with a narrow board column.
      containerType: "size",
      background: "var(--board-bg)",
      border: "1px solid var(--board-line)",
      borderRadius: "var(--radius-lg)",
      padding: "0.35%"
    }}>
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
            occupants={occupantsOf(tile.index)}
            highlight={selected === tile.index}
            monopoly={commercial && wholeRegions.has((tile as CommercialTile).region)}
            compact={compact}
            onClick={() => onSelect(selected === tile.index ? null : tile.index)}
          />
        );
      })}

      <BoardCenter game={game} current={current} meId={meId} dense={dense} compact={compact} />
    </div>
  );
}

/**
 * The middle of the board. Three rows: the turn, the table's contents (decks and dice), and the last event. It is a panel
 * like any other — same border, same fill, same radius — because it is furniture, not a stage.
 */
function BoardCenter({ game, current, meId, dense, compact }: {
  game: MonopolyGame; current: PlayerState; meId: string; dense?: boolean; compact: boolean;
}): JSX.Element {
  const lastLine = game.log[game.log.length - 1];
  const isMine = current?.id === meId;
  const dice = game.lastRoll?.dice;
  const chanceLeft = game.decks.chance.length;
  const fundLeft = game.decks.fund.length;

  return (
    <div style={{
      position: "absolute",
      // Inset to the ring's inner edge. A dense board insets less, so the centre gives its room to the tiles.
      left: dense ? "3.2%" : "4.43%", right: dense ? "3.2%" : "4.43%",
      top: dense ? "6.6%" : "8.33%", bottom: dense ? "6.6%" : "8.33%",
      border: "1px solid var(--board-line)",
      borderRadius: "var(--radius)",
      background: "var(--board-centre)",
      // Four rows: the turn line, the table (which takes the slack), the standings, and the last event. The `1fr` on the
      // table row is what keeps the centre from looking empty — the decks and dice sit in the middle of the space rather
      // than huddling at the top of it.
      display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto auto",
      alignItems: "center", justifyItems: "center",
      padding: compact ? "2.4% 2.6%" : "2.6% 3%", gap: "1.6%",
      overflow: "hidden", pointerEvents: "none"
    }}>
      {/* Whose turn it is. The one place the current player's colour appears in the centre. */}
      <div style={{ display: "flex", alignItems: "center", gap: "7px", maxWidth: "100%" }}>
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
          {isMine ? "轮到你" : "行动中"} · 第 {game.turn} 回合
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
        <Deck label="机会" count={chanceLeft} accent="var(--tile-chance)" active={game.pending?.kind === "card" && game.pending.deck === "chance"} side="left" />
        <Dice dice={dice} doubles={game.lastRoll?.doubles} compact={compact} />
        <Deck label="基金" count={fundLeft} accent="var(--tile-fund)" active={game.pending?.kind === "card" && game.pending.deck === "fund"} side="right" />
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
            <span style={{ width: "3px", height: "clamp(10px, 2cqw, 22px)", borderRadius: "1px", background: seatColor(player.seat), flex: "0 0 auto" }} />
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
function Deck({ label, count, accent, active, side }: {
  label: string; count: number; accent: string; active: boolean; side: "left" | "right";
}): JSX.Element {
  const card = (
    <div style={{
      // Sized against the board, so a desktop deck is a real card and a phone deck is a token. The height cap keeps the
      // card from towering on a very tall board.
      width: "clamp(28px, 8cqw, 104px)", aspectRatio: "3 / 4",
      maxHeight: "clamp(38px, 11cqw, 138px)",
      borderRadius: "var(--radius-sm)",
      background: accent,
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
