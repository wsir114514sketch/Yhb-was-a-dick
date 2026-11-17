/**
 * 银行面板：账户概览、申请贷款、偿还贷款、地产抵押四块。
 *
 * 这里只负责把状态摆清楚、把玩家点的那一下变成一个动作。额度、利息、先后顺序、能不能抵押这些判断全部来自共享引擎
 * （`legal.ts` 与 `bank.ts`），真正的钱只在服务器的 `applyAction` 里移动。每次申请或还款都带一个新的请求编号，
 * 重连或重复点击不会扣两次。
 */

import { useState } from "react";
import type { JSX } from "react";
import { REGION_PROPERTIES, commercialAt } from "../../shared/board.ts";
import { bankDebtOf, dailyInterestFor, remainingLoanRoom } from "../../shared/bank.ts";
import { formatMoney } from "../../shared/economy.ts";
import { canDo } from "../../shared/legal.ts";
import { ownershipOf, rulesOf } from "../../shared/rules.ts";
import type { MonopolyAction, MonopolyGame } from "../../shared/protocol.ts";
import { Dialog, DialogHeader } from "./Dialog.tsx";
import { newRequestId } from "./requestId.ts";

type Confirm = { kind: "loan"; amount: number } | { kind: "repay"; amount: number } | null;

export function BankDialog({ game, meId, onAct, onClose }: {
  game: MonopolyGame;
  meId: string;
  onAct: (action: MonopolyAction) => void;
  onClose: () => void;
}): JSX.Element {
  const me = game.players.find((player) => player.id === meId);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [repayInput, setRepayInput] = useState("");

  if (!me) {
    return (
      <Dialog onClose={onClose} label="银行">
        <DialogHeader title="银行" onClose={onClose} />
        <div style={{ padding: "16px" }}><p className="muted">你不在这一局里。</p></div>
      </Dialog>
    );
  }

  const rules = rulesOf(game);
  const debt = bankDebtOf(me);
  const room = remainingLoanRoom(game, me);
  // 交易提议打开时引擎不接受任何银行操作；买地、拍卖、欠款这些都不影响借款。
  const blocked = game.pending?.kind === "trade";
  const mortgaged = game.ownership.filter((entry) => entry.ownerId === meId && entry.mortgaged);
  const mortgagedValue = mortgaged.reduce((sum, entry) => sum + (commercialAt(entry.tile)?.mortgage ?? 0), 0);
  const held = game.ownership.filter((entry) => entry.ownerId === meId).sort((left, right) => left.tile - right.tile);
  const repayMax = Math.min(debt, me.cash);
  const customRepay = Math.floor(Number(repayInput || 0));

  const submit = (action: MonopolyAction): void => {
    onAct(action);
    setConfirm(null);
  };

  return (
    <Dialog onClose={onClose} wide label="银行">
      <DialogHeader title="银行" subtitle="贷款与地产抵押互相独立；所有操作由服务器结算" onClose={onClose} />
      <div style={{ padding: "12px 14px 16px", display: "flex", flexDirection: "column", gap: "14px", overflowY: "auto", minHeight: 0 }}>

        {/* ---- 账户概览 ---- */}
        <section>
          <SectionTitle>账户概览</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: "6px" }}>
            <Stat label="现金" value={formatMoney(me.cash)} />
            <Stat label="贷款本金" value={formatMoney(me.bank.principal)} />
            <Stat label="应付利息" value={formatMoney(me.bank.interest)} tone={me.bank.interest > 0 ? "danger" : undefined} />
            <Stat label="总欠款" value={formatMoney(debt)} tone={debt > 0 ? "danger" : undefined} />
            <Stat label="剩余可借" value={formatMoney(room)} />
            <Stat label="已抵押地产" value={`${mortgaged.length} 处 · ${formatMoney(mortgagedValue)}`} />
          </div>
        </section>

        {/* ---- 申请贷款 ---- */}
        <section>
          <SectionTitle>申请贷款</SectionTitle>
          {blocked ? (
            <p style={{ fontSize: "11px", color: "var(--warning-text)", marginBottom: "5px" }}>
              有交易提议等待回应，处理完才能操作银行。
            </p>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {rules.loanTiers.map((tier) => {
              const overCap = me.bank.principal + tier.amount > rules.loanPrincipalCap;
              return (
                <div key={tier.amount} style={{
                  display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface-raised)"
                }}>
                  <span className="num" style={{ fontSize: "14px", fontWeight: 700, minWidth: "62px" }}>{formatMoney(tier.amount)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "11px", color: "var(--muted)" }}>
                    每日利息 {formatMoney(dailyInterestFor(rules, tier.amount))}（本金的 2%，向上取整）
                  </span>
                  <button type="button" className="secondary" disabled={blocked || overCap}
                    style={{ minHeight: "30px", padding: "0 10px", fontSize: "12px" }}
                    title={overCap ? `未还本金上限 ${formatMoney(rules.loanPrincipalCap)}` : undefined}
                    onClick={() => setConfirm({ kind: "loan", amount: tier.amount })}>
                    {overCap ? "超出额度" : "申请"}
                  </button>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: "10px", color: "var(--faint)", marginTop: "4px", lineHeight: 1.5 }}>
            无需抵押，可多笔申请；未还本金上限 {formatMoney(rules.loanPrincipalCap)}。利息在游戏时间每天 00:00 结算，
            未付利息会继续累计，但不计算复利，也不会自动扣款。
          </p>
        </section>

        {/* ---- 偿还贷款 ---- */}
        <section>
          <SectionTitle>偿还贷款</SectionTitle>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>
              共欠 <span className="num" style={{ color: "var(--text)", fontWeight: 700 }}>{formatMoney(debt)}</span>
              （本金 {formatMoney(me.bank.principal)} · 利息 {formatMoney(me.bank.interest)}）
            </span>
            <input className="field" inputMode="numeric" aria-label="还款金额" placeholder="金额"
              value={repayInput} onChange={(event) => setRepayInput(event.target.value.replace(/[^0-9]/g, ""))}
              style={{ width: "92px", height: "32px", padding: "0 8px" }} />
            <button type="button" className="secondary" style={{ minHeight: "32px", padding: "0 10px", fontSize: "12px" }}
              disabled={blocked || customRepay <= 0 || customRepay > repayMax}
              onClick={() => setConfirm({ kind: "repay", amount: customRepay })}>还款</button>
            <button type="button" className="secondary" style={{ minHeight: "32px", padding: "0 10px", fontSize: "12px" }}
              disabled={blocked || repayMax <= 0}
              onClick={() => setConfirm({ kind: "repay", amount: repayMax })}>还清</button>
          </div>
          <p style={{ fontSize: "10px", color: "var(--faint)", marginTop: "4px" }}>先还利息，再还本金；可以只还一部分，提前还清没有手续费。</p>
        </section>

        {/* ---- 地产抵押 ---- */}
        <section>
          <SectionTitle>地产抵押</SectionTitle>
          {held.length === 0 ? <p className="muted" style={{ fontSize: "12px" }}>你还没有地产。</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {held.map((entry) => {
                const info = commercialAt(entry.tile);
                if (!info) return null;
                const value = Math.round(info.price * rules.mortgageRate);
                const redeem = Math.round(info.mortgage * (1 + rules.mortgageInterest));
                const canMortgage = canDo(game, meId, { type: "mortgage", tile: entry.tile });
                const canRedeem = canDo(game, meId, { type: "unmortgage", tile: entry.tile });
                const groupHasBuildings = info.kind === "property"
                  && (REGION_PROPERTIES[info.region] ?? []).some((member) => (ownershipOf(game, member.index)?.level ?? 0) > 0);
                const reason = entry.mortgaged
                  ? (canRedeem ? null : "现金不足")
                  : entry.level > 0 ? "先卖掉这处建筑"
                    : groupHasBuildings ? "同组还有建筑"
                      : canMortgage ? null : "现在不能抵押";
                return (
                  <div key={entry.tile} style={{
                    display: "flex", alignItems: "center", gap: "8px", padding: "5px 8px",
                    border: "1px solid var(--border)", borderRadius: "var(--radius)",
                    background: entry.mortgaged ? "var(--surface-soft)" : "var(--surface-raised)",
                    opacity: entry.mortgaged ? 0.9 : 1
                  }}>
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: "1px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {info.city}{entry.level > 0 ? ` · ${entry.level >= rules.maxBuildLevel ? "酒店" : `${entry.level} 栋`}` : ""}
                      </span>
                      <span className="num" style={{ fontSize: "10px", color: "var(--muted)" }}>
                        购价 {formatMoney(info.price)} · 抵押 {formatMoney(value)} · 赎回 {formatMoney(redeem)}
                      </span>
                    </span>
                    {entry.mortgaged ? <span className="tag" style={{ color: "var(--warning-text)" }}>已抵押</span> : null}
                    <button type="button" className={entry.mortgaged ? "secondary" : "quiet"}
                      style={{ minHeight: "28px", padding: "0 9px", fontSize: "11px" }}
                      disabled={entry.mortgaged ? !canRedeem : !canMortgage}
                      title={reason ?? undefined}
                      onClick={() => onAct(entry.mortgaged
                        ? { type: "unmortgage", tile: entry.tile }
                        : { type: "mortgage", tile: entry.tile })}>
                      {entry.mortgaged ? (reason ?? "赎回") : (canMortgage ? "抵押" : reason)}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p style={{ fontSize: "10px", color: "var(--faint)", marginTop: "4px", lineHeight: 1.5 }}>
            抵押拿地价的 50%，赎回要付抵押价值的 110%；抵押期间不收租，同组还有抵押时不能建造。抵押地产交易给别的玩家时，
            新业主需向银行支付 10% 手续费。
          </p>
        </section>

        {/* ---- 确认条 ---- */}
        {confirm ? (
          <div style={{
            position: "sticky", bottom: 0, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
            padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border-strong)",
            background: "var(--surface-raised)"
          }}>
            <span style={{ flex: 1, minWidth: "140px", fontSize: "12px" }}>
              {confirm.kind === "loan"
                ? `确认申请 ${formatMoney(confirm.amount)} 贷款？每日利息 ${formatMoney(dailyInterestFor(rules, confirm.amount))}。`
                : `确认还款 ${formatMoney(confirm.amount)}？（先息后本）`}
            </span>
            <button type="button" className="primary" style={{ minHeight: "30px", padding: "0 12px", fontSize: "12px" }}
              onClick={() => submit(confirm.kind === "loan"
                ? { type: "takeLoan", amount: confirm.amount, requestId: newRequestId() }
                : { type: "repayLoan", amount: confirm.amount, requestId: newRequestId() })}>
              确认
            </button>
            <button type="button" className="secondary" style={{ minHeight: "30px", padding: "0 12px", fontSize: "12px" }}
              onClick={() => setConfirm(null)}>取消</button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="eyebrow" style={{ marginBottom: "6px" }}>{children}</div>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }): JSX.Element {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "1px", padding: "5px 7px",
      border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface-raised)", minWidth: 0
    }}>
      <span style={{ fontSize: "10px", color: "var(--muted)", whiteSpace: "nowrap" }}>{label}</span>
      <span className="num" style={{ fontSize: "12px", fontWeight: 700, color: tone === "danger" ? "var(--danger)" : "var(--text)", whiteSpace: "nowrap" }}>
        {value}
      </span>
    </div>
  );
}
