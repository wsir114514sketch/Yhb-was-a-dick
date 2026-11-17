/**
 * The rules, written for a player who has never seen the table.
 *
 * One dialog, four short sections, read top to bottom the way a game actually unfolds: what a turn is, what the tiles do,
 * what money pressure looks like, and how the game ends. Every claim here restates what the engine enforces — the same
 * numbers come from the board and rules data, so a rule change surfaces here or the test fails trying.
 */

import type { JSX } from "react";
import { DEFAULT_RULES } from "../../shared/economy.ts";
import { Dialog } from "./Dialog.tsx";

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: "5px" }}>{title}</div>
      <div style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--secondary-text)" }}>{children}</div>
    </div>
  );
}

const B = ({ children }: { children: React.ReactNode }): JSX.Element => (
  <strong style={{ color: "var(--text)", fontWeight: 650 }}>{children}</strong>
);

export function RulesDialog({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Dialog onClose={onClose} label="玩法说明" wide>
      <div style={{ padding: "16px 16px 14px", display: "flex", flexDirection: "column", gap: "13px" }}>
        <h4 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>玩法说明</h4>

        <Section title="一回合做什么">
          <B>点击棋盘中央的骰子</B>掷两颗骰子，棋子按点数顺时针前进。落在无主的城市上会立刻问你买不买；
          落在别人的地上付租金。走完这些，点<B>结束回合</B>。掷出两颗相同（双骰）可以再掷一次，三次双骰会被送进监狱。
        </Section>

        <Section title="买地与盖楼">
          集齐<B>同一颜色整组</B>的地块才能盖楼：点击棋盘上自己的地块打开详情卡，在那里建造房屋（最多 1 座酒店）。
          整组无建筑时租金翻倍；楼越多，租金按租金表逐级上涨。铁路按持有条数收费，公用事业按骰子点数收费。
        </Section>

        <Section title="钱不够时">
          现金付不起租金会进入负债：变卖建筑、<B>抵押地产</B>（详情卡里操作）或与对手交易来筹钱；
          还是还不上就只能宣告破产退场。监狱里可以等三回合、用出狱卡或缴费 {formatFine()} 出狱，在押期间仍能收租。
        </Section>

        <Section title="银行与游戏时间">
          棋盘中央左下角是<B>游戏时间</B>和<B>银行</B>入口。银行贷款无需抵押，三档 $500 / $1,000 / $2,000，
          未还本金上限 $3,000；每天 00:00（游戏时间）按未还本金 {Math.round(DEFAULT_RULES.loanDailyRate * 100)}%
          结算利息，还款先息后本，可以只还一部分。现实 30 秒 = 游戏 1 小时，牌桌的明暗会随游戏时间变化；
          房主可以在菜单里暂停时钟，暂停期间不计时也不计息。
        </Section>

        <Section title="怎么赢">
          快局 {DEFAULT_RULES.timeLimitMinutes} 分钟到时按<B>总资产</B>（现金 + 地价 + 建筑 − 抵押债 − 银行贷款）结算排名；
          只剩一名未破产玩家时直接获胜。超时未行动会自动交给下一个玩家。
        </Section>

        <button type="button" className="primary" onClick={onClose} style={{ alignSelf: "flex-end", minHeight: "34px", padding: "0 18px" }}>
          开始游戏
        </button>
      </div>
    </Dialog>
  );
}

function formatFine(): string {
  return `$${DEFAULT_RULES.jailFine ?? 50}`;
}
