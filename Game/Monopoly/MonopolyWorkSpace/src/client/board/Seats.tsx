/**
 * The seats: every player's piece, cash, holdings and jail status, in turn order.
 *
 * Cash is the number a player looks at most, so it is the largest thing on the card, in tabular figures. The seat colour is
 * a 3px bar on the leading edge — the same bar as on the tiles that player owns — so the board and the panel agree about who
 * is who. A bankrupt seat greys out but keeps its place, so the table keeps its shape and the record stays readable.
 */

import type { JSX } from "react";
import { REGIONS, REGION_PROPERTIES, commercialAt } from "../../shared/board.ts";
import { formatMoney } from "../../shared/economy.ts";
import type { MonopolyGame, PlayerState } from "../../shared/protocol.ts";
import { Token, seatColor } from "../art/tokens.tsx";

export function Seats({ game, meId, onFocus, horizontal }: {
  game: MonopolyGame;
  meId: string;
  onFocus?: (playerId: string) => void;
  /** On a phone the seats run across the screen rather than down it, so the board keeps its height. */
  horizontal?: boolean;
}): JSX.Element {
  const activeId = game.order[game.turnIndex];
  const seated = game.order
    .map((id) => game.players.find((player) => player.id === id))
    .filter((player): player is PlayerState => !!player);

  return (
    <div style={{
      display: "flex",
      flexDirection: horizontal ? "row" : "column",
      gap: "5px", minHeight: 0, minWidth: 0,
      overflowX: horizontal ? "hidden" : "visible",
      overflowY: horizontal ? "hidden" : "auto",
      // The strip pads itself rather than its parent, so a rounded corner never clips a card's border.
      padding: horizontal ? 0 : "1px"
    }}>
      {seated.map((player) => (
        <SeatCard
          key={player.id}
          player={player}
          game={game}
          isTurn={player.id === activeId}
          isMe={player.id === meId}
          compact={horizontal}
          onClick={() => onFocus?.(player.id)}
        />
      ))}
    </div>
  );
}

function SeatCard({ player, game, isTurn, isMe, compact, onClick }: {
  player: PlayerState; game: MonopolyGame; isTurn: boolean; isMe: boolean; compact?: boolean; onClick: () => void;
}): JSX.Element {
  const color = seatColor(player.seat);
  const tiles = game.ownership.filter((entry) => entry.ownerId === player.id);
  const properties = tiles.filter((entry) => commercialAt(entry.tile)?.kind === "property");

  // Which regions the player holds outright — the thing worth knowing about an opponent.
  const finished = REGIONS.filter((region) => {
    const members = REGION_PROPERTIES[region.id] ?? [];
    return members.length > 0 && members.every((member) => game.ownership.find((entry) => entry.tile === member.index)?.ownerId === player.id);
  });

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isTurn ? "true" : undefined}
      style={{
        display: compact ? "flex" : "grid",
        gridTemplateColumns: compact ? undefined : "auto minmax(0, 1fr) auto",
        flexDirection: compact ? "column" : undefined,
        alignItems: "center", justifyContent: compact ? "center" : undefined,
        gap: compact ? "1px" : "8px",
        padding: compact ? "4px 5px" : "7px 9px",
        textAlign: compact ? "center" : "left",
        flex: compact ? "1 1 0" : undefined, minWidth: compact ? 0 : undefined,
        borderRadius: "var(--radius)",
        background: isTurn ? "var(--surface-raised)" : "var(--surface)",
        // The turn is a border, not a glow: one line, no animation.
        border: `1px solid ${isTurn ? color : "var(--border)"}`,
        opacity: player.bankrupt ? 0.45 : 1,
        position: "relative", overflow: "hidden",
        minHeight: compact ? "38px" : "var(--touch)",
        // Nothing pulses; the border and the fill say whose turn it is and stay still.
        transition: "background 160ms ease, border-color 160ms ease"
      }}
    >
      {/* The player's colour, on the same edge the tiles use. */}
      <span style={{
        position: "absolute", background: color,
        ...(compact ? { left: 0, right: 0, top: 0, height: "2px" } : { left: 0, top: 0, bottom: 0, width: "3px" })
      }} aria-hidden="true" />

      {compact ? (
        <>
          <span style={{ display: "flex", alignItems: "center", gap: "3px", minWidth: 0, maxWidth: "100%" }}>
            <Token seat={player.seat} size={13} />
            <span style={{
              fontSize: "9px", fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              color: "var(--text)"
            }}>
              {isMe ? "你" : player.username.replace("玩家 ", "")}
            </span>
            {player.inJail ? <span className="tag" style={{ minHeight: "14px", padding: "0 3px", fontSize: "9px" }}>狱</span> : null}
          </span>
          <span className="num" style={{
            fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap",
            color: player.bankrupt ? "var(--faint)" : "var(--text)"
          }}>
            {formatMoney(player.cash)}
          </span>
        </>
      ) : (
        <>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", paddingLeft: "4px" }}>
            <Token seat={player.seat} size={19} />
            {player.inJail ? <span className="tag" style={{ minHeight: "14px", padding: "0 3px", fontSize: "9px" }}>狱中</span> : null}
          </span>

          <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: "1px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0 }}>
              <span style={{
                fontSize: "12px", fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                color: isMe ? "var(--accent)" : "var(--text)"
              }}>
                {player.username}{isMe ? "（你）" : ""}
              </span>
              {player.bankrupt ? <span className="tag" style={{ color: "var(--danger)" }}>破产</span> : null}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--muted)" }}>
              <span className="num">{properties.length} 处</span>
              {player.jailCards > 0 ? <span style={{ color: "var(--ok)" }}>卡×{player.jailCards}</span> : null}
            </span>
            {finished.length > 0 ? (
              <span style={{ display: "flex", gap: "2px", marginTop: "1px" }} title={`集齐 ${finished.map((region) => region.name).join("、")}`}>
                {finished.map((region) => (
                  <span key={region.id} style={{ width: "8px", height: "3px", borderRadius: "1px", background: region.color }} />
                ))}
              </span>
            ) : null}
          </span>

          <span className="num" style={{
            fontSize: "13px", fontWeight: 700, textAlign: "right",
            color: player.bankrupt ? "var(--faint)" : "var(--text)"
          }}>
            {formatMoney(player.cash)}
          </span>
        </>
      )}
    </button>
  );
}
