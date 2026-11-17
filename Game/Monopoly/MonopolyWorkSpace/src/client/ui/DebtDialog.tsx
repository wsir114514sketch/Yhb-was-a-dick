/**
 * 资金不足时的筹款：三步——抵押、变卖、偿还。
 *
 * 只是把引擎已经允许的操作（mortgage / sellBuilding）按顺序摆出来，并实时显示"还差多少"。现金一够，引擎会在下一次
 * 操作后自动付清（settleOpenDebt），这个面板随 pending 消失而关闭；凑不够时只剩宣告破产。
 */

import type { JSX } from "react";
import { REGION_PROPERTIES, commercialAt } from "../../shared/board.ts";
import { remainingLoanRoom } from "../../shared/bank.ts";
import { formatMoney } from "../../shared/economy.ts";
import type { MonopolyAction, MonopolyGame } from "../../shared/protocol.ts";
import { ownershipOf, rulesOf } from "../../shared/rules.ts";
import { Dialog, DialogHeader } from "./Dialog.tsx";
import { newRequestId } from "./requestId.ts";

export function DebtDialog({ game, meId, onAct, onClose }: {
  game: MonopolyGame; meId: string; onAct: (action: MonopolyAction) => void; onClose: () => void;
}): JSX.Element | null {
  const pending = game.pending;
  const me = game.players.find((player) => player.id === meId);
  if (pending?.kind !== "debt" || pending.playerId !== meId || !me) return null;
  const rules = rulesOf(game);
  const mine = game.ownership.filter((entry) => entry.ownerId === meId);
  // 同组还有建筑时，这一组的地都不能抵押；筹款面板也不再把它列成可以点的按钮。
  const groupHasBuildings = (tile: number): boolean => {
    const info = commercialAt(tile);
    return !!info && info.kind === "property"
      && (REGION_PROPERTIES[info.region] ?? []).some((member) => (ownershipOf(game, member.index)?.level ?? 0) > 0);
  };
  const mortgageable = mine.filter((entry) => !entry.mortgaged && entry.level === 0 && !groupHasBuildings(entry.tile))
    .map((entry) => ({ tile: entry.tile, info: commercialAt(entry.tile)! }))
    .map(({ tile, info }) => ({ tile, name: info.city, value: Math.round(info.price * rules.mortgageRate) }));
  const sellable = mine.filter((entry) => entry.level > 0)
    .map((entry) => ({ tile: entry.tile, level: entry.level, info: commercialAt(entry.tile)! }))
    .map(({ tile, level, info }) => ({ tile, level, name: info.city, value: Math.round(info.buildCost * rules.buildingSellRate) }));
  const loanRoom = remainingLoanRoom(game, me);
  // 全部变现的上限：拆光所有建筑，抵押所有可抵押的地，再加上还能借到的额度。
  const ceiling = me.cash
    + sellable.reduce((sum, entry) => sum + entry.value * entry.level, 0)
    + mortgageable.reduce((sum, entry) => sum + entry.value, 0)
    + loanRoom;
  const short = Math.max(0, pending.amount - me.cash);
  const progress = Math.min(1, me.cash / Math.max(1, pending.amount));

  return (
    <Dialog onClose={onClose} label="筹款还债">
      <DialogHeader title="筹款还债" subtitle={`欠${pending.creditorId ? game.players.find((p) => p.id === pending.creditorId)?.username ?? "对手" : "银行"} ${formatMoney(pending.amount)}`} onClose={onClose} />
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <Step index={1} title="抵押地产" hint={`每块得地价的 ${Math.round(rules.mortgageRate * 100)}%；有建筑的地要先拆`}>
          {mortgageable.length ? mortgageable.map((entry) => (
            <Row key={entry.tile} name={entry.name} value={entry.value} label="抵押" onClick={() => onAct({ type: "mortgage", tile: entry.tile })} />
          )) : <Empty>没有可抵押的地产</Empty>}
        </Step>
        <Step index={2} title="变卖建筑" hint={`每拆一级回收造价的 ${Math.round(rules.buildingSellRate * 100)}%`}>
          {sellable.length ? sellable.map((entry) => (
            <Row key={entry.tile} name={`${entry.name} · ${entry.level >= 5 ? "酒店" : `${entry.level} 栋`}`} value={entry.value} label="拆一级" onClick={() => onAct({ type: "sellBuilding", tile: entry.tile })} />
          )) : <Empty>没有建筑可拆</Empty>}
        </Step>
        <Step index={3} title="向银行借款" hint="无抵押现金贷款；筹到钱会先结清这笔欠款">
          {rules.loanTiers.some((tier) => tier.amount <= loanRoom)
            ? rules.loanTiers.filter((tier) => tier.amount <= loanRoom).map((tier) => (
              <Row key={tier.amount} name={`贷款 · 每日利息 ${formatMoney(Math.ceil(tier.amount * rules.loanDailyRate))}`}
                value={tier.amount} label="借款"
                onClick={() => onAct({ type: "takeLoan", amount: tier.amount, requestId: newRequestId() })} />
            ))
            : <Empty>可借额度已用完</Empty>}
        </Step>
        <Step index={4} title="偿还" hint="现金一够就自动付清">
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <div style={{ height: "6px", borderRadius: "3px", background: "var(--surface-soft)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: "100%", transform: `scaleX(${progress})`, transformOrigin: "left center", background: short ? "var(--warning-text)" : "var(--ok)" }} />
            </div>
            <div className="num" style={{ fontSize: "12px", color: "var(--secondary-text)" }}>
              现金 {formatMoney(me.cash)} / 需付 {formatMoney(pending.amount)}{short ? ` · 还差 ${formatMoney(short)}` : ""}
            </div>
            {ceiling < pending.amount ? (
              <div style={{ fontSize: "12px", color: "var(--danger)" }}>全部变现也只有 {formatMoney(ceiling)}，不够偿还，只能宣告破产。</div>
            ) : null}
          </div>
        </Step>
        <div className="button-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="danger-quiet" onClick={() => onAct({ type: "declareBankrupt" })}>宣告破产</button>
        </div>
      </div>
    </Dialog>
  );
}

function Step({ index, title, hint, children }: { index: number; title: string; hint: string; children: React.ReactNode }): JSX.Element {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "22px minmax(0, 1fr)", gap: "8px" }}>
      <span className="num" aria-hidden="true" style={{
        width: "22px", height: "22px", borderRadius: "50%", border: "1px solid var(--border-strong)",
        display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 700, color: "var(--muted)"
      }}>{index}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
        <div><span style={{ fontSize: "13px", fontWeight: 650 }}>{title}</span> <span style={{ fontSize: "11px", color: "var(--muted)" }}>{hint}</span></div>
        {children}
      </div>
    </section>
  );
}

function Row({ name, value, label, onClick }: { name: string; value: number; label: string; onClick: () => void }): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <span className="num" style={{ color: "var(--ok)" }}>+{formatMoney(value)}</span>
      <button type="button" className="secondary" onClick={onClick} style={{ minHeight: "28px", padding: "0 10px", fontSize: "12px" }}>{label}</button>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return <div style={{ fontSize: "12px", color: "var(--faint)" }}>{children}</div>;
}
