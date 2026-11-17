/**
 * The chance (机会) and community fund (公共基金) decks.
 *
 * A card only describes itself: its effect kind and the numbers that go with it. The engine's handler decides what the
 * kind means and applies it, so the wording on a card is never what decides the outcome — an edited description cannot
 * change the result.
 *
 * Wording stays on ordinary travel life: a missed flight, a repair bill, a tip from a blogger. No politics, no religion,
 * no real brands and no real people, so a card reads the same to everyone at the table. Money is written in dollars, the
 * one currency the game uses.
 */

export type CardDeck = "chance" | "fund";

export type CardEffect =
  /** Money from or to the bank. Positive receives, negative pays. */
  | { kind: "money"; amount: number }
  /** Pays each other player (negative) or collects from each (positive), so the total moves with the table size. */
  | { kind: "eachPlayer"; amount: number }
  /** Repairs: charged per house and per hotel on the player's own tiles. */
  | { kind: "repairs"; perHouse: number; perHotel: number }
  /** Move to a named tile, and optionally collect the salary for passing 起点 on the way. */
  | { kind: "moveTo"; tile: number; collectGo: boolean }
  /** Move a number of tiles forward, collecting the salary if 起点 is passed. */
  | { kind: "moveBy"; steps: number }
  /** Go to jail without passing 起点. */
  | { kind: "goToJail" }
  /** A 免费出狱卡, kept in hand until used. */
  | { kind: "jailFree" }
  /** Every player pays into the bank (a global event); the mover pays too. */
  | { kind: "globalLevy"; amount: number };

export interface GameCard {
  id: string;
  deck: CardDeck;
  title: string;
  text: string;
  effect: CardEffect;
}

/** 机会 — the travel deck. */
export const CHANCE_CARDS: readonly GameCard[] = [
  { id: "c-start", deck: "chance", title: "直达起点", text: "搭上顺风车直接回到起点，领取 $200。", effect: { kind: "moveTo", tile: 0, collectGo: true } },
  { id: "c-ny", deck: "chance", title: "商务行程", text: "前往纽约出差。若经过起点，领取 $200。", effect: { kind: "moveTo", tile: 46, collectGo: true } },
  { id: "c-bj", deck: "chance", title: "考察团", text: "前往北京。若经过起点，领取 $200。", effect: { kind: "moveTo", tile: 22, collectGo: true } },
  { id: "c-paris", deck: "chance", title: "时装周", text: "前往巴黎。若经过起点，领取 $200。", effect: { kind: "moveTo", tile: 39, collectGo: true } },
  { id: "c-move3", deck: "chance", title: "临时的差事", text: "错过一班车，往前赶 3 格。若经过起点，领取 $200。", effect: { kind: "moveBy", steps: 3 } },
  { id: "c-move5", deck: "chance", title: "赶一班船", text: "往前赶 5 格。若经过起点，领取 $200。", effect: { kind: "moveBy", steps: 5 } },
  { id: "c-bank", deck: "chance", title: "股息到账", text: "行李里的旧股票分红，领取 $50。", effect: { kind: "money", amount: 50 } },
  { id: "c-cash", deck: "chance", title: "旅行博主", text: "游记被转载，收到稿费 $100。", effect: { kind: "money", amount: 100 } },
  { id: "c-fine", deck: "chance", title: "交通罚单", text: "违规停车，缴纳 $15。", effect: { kind: "money", amount: -15 } },
  { id: "c-fix", deck: "chance", title: "房屋维修", text: "每栋房屋缴 $25，每座酒店缴 $100。", effect: { kind: "repairs", perHouse: 25, perHotel: 100 } },
  { id: "c-jail", deck: "chance", title: "被带走", text: "直接进入监狱，不经过起点。", effect: { kind: "goToJail" } },
  { id: "c-free", deck: "chance", title: "免费出狱", text: "保留此卡，直到需要时使用。", effect: { kind: "jailFree" } },
  { id: "c-split", deck: "chance", title: "请客", text: "请大家吃一顿，向每位其他玩家支付 $50。", effect: { kind: "eachPlayer", amount: -50 } },
  { id: "c-collect", deck: "chance", title: "合伙分红", text: "合伙生意分红，向每位其他玩家收取 $50。", effect: { kind: "eachPlayer", amount: 50 } },
  { id: "c-global", deck: "chance", title: "旺季涨价", text: "旺季来临，所有玩家向银行缴纳 $50。", effect: { kind: "globalLevy", amount: 50 } }
];

/** 公共基金 — the civic deck. */
export const FUND_CARDS: readonly GameCard[] = [
  { id: "f-start", deck: "fund", title: "市政奖励", text: "回到起点，领取 $200。", effect: { kind: "moveTo", tile: 0, collectGo: true } },
  { id: "f-bank", deck: "fund", title: "退税", text: "多缴的税退回来了，领取 $20。", effect: { kind: "money", amount: 20 } },
  { id: "f-health", deck: "fund", title: "医疗费", text: "旅途中着了凉，缴纳 $100。", effect: { kind: "money", amount: -100 } },
  { id: "f-repair", deck: "fund", title: "街区整修", text: "每栋房屋缴 $40，每座酒店缴 $115。", effect: { kind: "repairs", perHouse: 40, perHotel: 115 } },
  { id: "f-gift", deck: "fund", title: "生日礼金", text: "朋友们凑了红包，向每位其他玩家收取 $10。", effect: { kind: "eachPlayer", amount: 10 } },
  { id: "f-fine", deck: "fund", title: "违规罚款", text: "在步行街骑车，缴纳 $50。", effect: { kind: "money", amount: -50 } },
  { id: "f-inherit", deck: "fund", title: "远房遗产", text: "收到一笔遗产，领取 $100。", effect: { kind: "money", amount: 100 } },
  { id: "f-free", deck: "fund", title: "免费出狱", text: "保留此卡，直到需要时使用。", effect: { kind: "jailFree" } },
  { id: "f-jail", deck: "fund", title: "被带走", text: "直接进入监狱，不经过起点。", effect: { kind: "goToJail" } },
  { id: "f-global", deck: "fund", title: "市政分摊", text: "全城整修，所有玩家向银行缴纳 $30。", effect: { kind: "globalLevy", amount: 30 } }
];

export const DECK_CARDS: Readonly<Record<CardDeck, readonly GameCard[]>> = { chance: CHANCE_CARDS, fund: FUND_CARDS };
export const DECK_NAME: Readonly<Record<CardDeck, string>> = { chance: "机会", fund: "公共基金" };
