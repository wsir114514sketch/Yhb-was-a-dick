/**
 * The settlement: who won, why, and where everyone finished.
 *
 * The winner is stated once, plainly, and the ranking underneath carries the numbers — cash, property, buildings, and the
 * mortgage debt, because that is what produced the net worth the ranking is by. No confetti and no glow: the result of a
 * game is already a big enough moment, and a celebration that keeps moving is a celebration that gets in the way of
 * reading your own score.
 */

import type { JSX } from "react";
import { formatMoney } from "../../shared/economy.ts";
import type { MonopolyGame } from "../../shared/protocol.ts";
import { Token, seatColor } from "../art/tokens.tsx";
import { Dialog } from "./Dialog.tsx";
import { StatsList } from "./StatsList.tsx";
import type { GameStats } from "../stats.ts";

/** 时长随动画档位缩放（--fx-scale 为 0 时延迟也为 0，当帧到终态）。 */
const ms = (value: number): string => `calc(${value}ms * var(--fx-scale, 1))`;

export function SettlementDialog({ game, meId, stats, onClose, onRestart }: {
  game: MonopolyGame;
  meId: string;
  stats?: GameStats;
  onClose: () => void;
  onRestart: () => void;
}): JSX.Element | null {
  const result = game.winner;
  if (!result) return null;

  const champion = game.players.find((player) => player.id === result.playerId);
  const ranked = result.standings;
  const iWon = result.playerId === meId;
  const top = Math.max(1, ...ranked.map((entry) => entry.netWorth));
  // 名次从最后一名往上逐个揭示，冠军最后出现。
  const revealAt = (index: number): number => (ranked.length - 1 - index) * 140;

  return (
    <Dialog onClose={onClose} wide label="对局结算">
      <div style={{ padding: "18px 14px 14px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ textAlign: "center" }}>
          <div className="eyebrow" style={{ marginBottom: "8px" }}>对局结束</div>
          {champion ? (
            <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
              <Token seat={champion.seat} size={34} />
              <div style={{ fontSize: "20px", fontWeight: 700 }}>
                {champion.username}{iWon ? "（你）" : ""}
              </div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>{result.reason}</div>
            </div>
          ) : (
            <div style={{ fontSize: "17px", fontWeight: 650, color: "var(--muted)" }}>无人获胜</div>
          )}
        </div>

        {/* The ranking, most valuable first. The header row says what the columns are, once. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "16px minmax(0, 1fr) auto", gap: "8px",
            padding: "0 9px", fontSize: "10px", color: "var(--muted)"
          }}>
            <span>#</span>
            <span>玩家 · 现金 / 地产 / 建筑 / 欠款</span>
            <span style={{ textAlign: "right" }}>净资产</span>
          </div>
          {ranked.map((entry, index) => {
            const player = game.players.find((candidate) => candidate.id === entry.playerId);
            return (
              <div key={entry.playerId} style={{
                display: "grid", gridTemplateColumns: "16px minmax(0, 1fr) auto", alignItems: "center", gap: "8px",
                padding: "7px 9px", borderRadius: "var(--radius)", position: "relative", overflow: "hidden",
                animation: `rank-in ${ms(220)} ease-out ${ms(revealAt(index))} both`,
                background: entry.playerId === meId ? "var(--surface-raised)" : "transparent",
                border: `1px solid ${entry.playerId === meId ? "var(--border-strong)" : "var(--border)"}`,
                opacity: entry.bankrupt ? 0.62 : 1
              }}>
                <span className="num" style={{ fontSize: "11px", fontWeight: 650, color: "var(--muted)" }}>{index + 1}</span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                  {player ? <span style={{ width: "3px", height: "14px", borderRadius: "1px", background: seatColor(player.seat), flex: "0 0 auto" }} /> : null}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "12px", fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.username}
                      {entry.bankrupt ? <span style={{ color: "var(--danger)", fontWeight: 400 }}> · 破产</span> : null}
                    </span>
                    <span className="num" style={{ display: "block", fontSize: "10px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {formatMoney(entry.cash)}
                      {entry.propertyValue ? ` / ${formatMoney(entry.propertyValue)}` : ""}
                      {entry.buildingValue ? ` / ${formatMoney(entry.buildingValue)}` : ""}
                      {entry.mortgageDebt ? ` / 欠 ${formatMoney(entry.mortgageDebt)}` : ""}
                      {entry.bankDebt ? ` / 贷款 ${formatMoney(entry.bankDebt)}` : ""}
                    </span>
                  </span>
                </span>
                <span className="num" style={{ fontSize: "12px", fontWeight: 700, textAlign: "right" }}>
                  {formatMoney(entry.netWorth)}
                </span>
                {/* 净资产横条：从 0 长到它占冠军的比例，只动 transform。 */}
                <span aria-hidden="true" style={{
                  position: "absolute", left: 0, bottom: 0, height: "2px", width: "100%",
                  background: player ? seatColor(player.seat) : "var(--border-strong)", opacity: 0.85,
                  transformOrigin: "left center", transform: `scaleX(${Math.max(0, entry.netWorth) / top})`,
                  animation: `bar-grow ${ms(420)} cubic-bezier(.2, .8, .3, 1) ${ms(revealAt(index) + 120)} both`
                }} />
              </div>
            );
          })}
        </div>

        {stats ? (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
            <div className="eyebrow" style={{ marginBottom: "6px" }}>本局数据</div>
            <StatsList game={game} stats={stats} />
          </div>
        ) : null}

        <div className="button-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="secondary" onClick={onClose}>看看棋盘</button>
          <button type="button" className="primary" onClick={onRestart}>再来一局</button>
        </div>
      </div>
    </Dialog>
  );
}
