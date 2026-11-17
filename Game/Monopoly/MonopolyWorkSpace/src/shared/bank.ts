/**
 * 银行：无抵押现金贷款、每日利息和账本。
 *
 * 贷款与地产抵押是两套完全独立的东西——抵押动的是地产，贷款动的是银行账上的本金和利息。所有入口都只由这里改钱，
 * 并同时写一条对局日志和一条账本；金额、去重和结算同样由服务器端的引擎负责，客户端只能提出申请。
 *
 * 计息规则（服务器在游戏日 00:00 结算）：未还本金 × 2%，向上取整，无复利；当日新借的款在下一次 00:00 起计息；
 * 未付利息继续累计在账户上，但不会变成新的本金，也不会自动扣款。
 */

import { formatMoney, type EconomyRules } from "./economy.ts";
import { recordLedger } from "./ledger.ts";
import { MonopolyRuleError, type MonopolyGame, type PlayerState } from "./protocol.ts";
import { findPlayer, pushLog, rulesOf } from "./rules.ts";

/** 一位玩家的银行贷款总额：本金 + 未付利息。 */
export const bankDebtOf = (player: PlayerState | undefined): number =>
  player ? player.bank.principal + player.bank.interest : 0;

/** 剩余可借额度。 */
export const remainingLoanRoom = (game: MonopolyGame, player: PlayerState): number =>
  Math.max(0, rulesOf(game).loanPrincipalCap - player.bank.principal);

/** 某一档贷款每天产生的利息，按结算规则向上取整。 */
export const dailyInterestFor = (rules: EconomyRules, principal: number): number =>
  principal > 0 ? Math.ceil(principal * rules.loanDailyRate) : 0;

/**
 * 防重复提交：每个银行操作都带一个客户端新生成的请求编号，同一个编号只受理一次。
 * 只保留最近 400 个，旧编号被挤掉后即使重放也只会被业务规则（额度、余额）挡住。
 */
export function claimRequest(game: MonopolyGame, requestId: unknown): void {
  if (typeof requestId !== "string" || !requestId || requestId.length > 64) throw new MonopolyRuleError("INVALID_ACTION");
  if (game.seenRequests.includes(requestId)) throw new MonopolyRuleError("DUPLICATE_REQUEST");
  game.seenRequests.push(requestId);
  if (game.seenRequests.length > 400) game.seenRequests.splice(0, game.seenRequests.length - 400);
}

/** 申请贷款：固定档位、无需抵押，本金上限内可多笔；成功后立即到账。 */
export function takeLoan(game: MonopolyGame, actorId: string, amount: number, requestId: unknown): void {
  const rules = rulesOf(game);
  if (!rules.loanTiers.some((tier) => tier.amount === amount)) throw new MonopolyRuleError("LOAN_AMOUNT");
  const actor = findPlayer(game, actorId);
  if (!actor || actor.bankrupt) throw new MonopolyRuleError("BANKRUPT");
  if (actor.bank.principal + amount > rules.loanPrincipalCap) throw new MonopolyRuleError("LOAN_LIMIT");
  claimRequest(game, requestId);

  const before = actor.cash;
  actor.cash += amount;
  actor.bank.principal += amount;
  recordLedger(game, actorId, "loan", amount, before, actor.cash);
  pushLog(game, actorId,
    `${actor.username} 向银行申请无抵押贷款 ${formatMoney(amount)}，每日利息 ${formatMoney(dailyInterestFor(rules, amount))}，`
    + `未还本金 ${formatMoney(actor.bank.principal)}。`, "loan", amount);
}

/**
 * 还款（先息后本）：付出现金先清已产生利息，剩余还本金；多付、超过现金、没有欠款都被拒绝。
 * 付清后账户归零，可以再次申请（受本金上限约束）。
 */
export function repayLoan(game: MonopolyGame, actorId: string, amount: number, requestId: unknown): void {
  const actor = findPlayer(game, actorId);
  if (!actor || actor.bankrupt) throw new MonopolyRuleError("BANKRUPT");
  if (!Number.isInteger(amount) || amount <= 0) throw new MonopolyRuleError("INVALID_ACTION");
  const total = bankDebtOf(actor);
  if (total <= 0) throw new MonopolyRuleError("NOTHING_TO_REPAY");
  if (amount > total) throw new MonopolyRuleError("REPAY_TOO_MUCH");
  if (amount > actor.cash) throw new MonopolyRuleError("NOT_ENOUGH_CASH");
  claimRequest(game, requestId);

  const before = actor.cash;
  actor.cash -= amount;
  const toInterest = Math.min(actor.bank.interest, amount);
  actor.bank.interest -= toInterest;
  const toPrincipal = amount - toInterest;
  actor.bank.principal -= toPrincipal;
  recordLedger(game, actorId, "repay", amount, before, actor.cash);
  pushLog(game, actorId,
    `${actor.username} 还款 ${formatMoney(amount)}：利息 ${formatMoney(toInterest)}、本金 ${formatMoney(toPrincipal)}，`
    + `剩余欠款 ${formatMoney(bankDebtOf(actor))}。`, "repay", -amount);
  if (total - amount === 0) pushLog(game, actorId, `${actor.username} 的银行贷款已还清。`, "repay");
}

/**
 * 每天 00:00 的利息结算：遍历所有未破产玩家，把未还本金的 2% 计入应付利息并写账本。
 * 每个游戏日只结算一次，由 `clock.settledDay` 记住；服务器重启后继续用同一个标记，不会重复计息。
 */
export function settleDailyInterest(game: MonopolyGame, day: number): void {
  const rules = rulesOf(game);
  if (game.clock.settledDay >= day) return;
  game.clock.settledDay = day;
  for (const player of game.players) {
    if (player.bankrupt || player.bank.principal <= 0) continue;
    const added = dailyInterestFor(rules, player.bank.principal);
    player.bank.interest += added;
    recordLedger(game, player.id, "interest", added, player.cash, player.cash);
    pushLog(game, player.id,
      `${player.username} 的贷款利息 +${formatMoney(added)}（本金 ${formatMoney(player.bank.principal)}），`
      + `未付利息 ${formatMoney(player.bank.interest)}。`, "interest");
  }
}

/**
 * 破产清盘：无抵押贷款和未付利息都由银行承担损失，不从其他玩家或已转移的资产里补扣。
 */
export function clearBankDebt(game: MonopolyGame, playerId: string): void {
  const player = findPlayer(game, playerId);
  if (!player) return;
  const total = bankDebtOf(player);
  player.bank.principal = 0;
  player.bank.interest = 0;
  if (total > 0) {
    recordLedger(game, playerId, "bankrupt", total, player.cash, player.cash);
    pushLog(game, playerId, `${player.username} 的银行贷款 ${formatMoney(total)} 由银行承担损失。`, "bankrupt");
  }
}
