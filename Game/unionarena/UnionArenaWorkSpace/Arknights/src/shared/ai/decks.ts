/**
 * Preset decks for the vs-computer mode and for training. They only use cards the engine plays entirely by itself (no ability text beyond
 * keywords, or abilities written in abilities/cards.ts; see `isAutomated`), so the computer never meets a card it would have to resolve
 * by hand. Each deck follows the deck rules: 50 cards, one source material code, at most four copies per card number,
 * at most four 特殊 / 色彩 / 最终 triggers each.
 */
import type { IpId } from "../ips.ts";

export interface PresetDeck {
  id: string; name: string; description: string; cards: Array<[string, number]>;
  /** The title the deck plays as. */ ipId: IpId;
  /**
   * True when `cards` lists card NUMBERS instead of catalog ids. The site's catalog ids come from each title's card-art index, which a
   * deck written from the printed data alone cannot know, so such a deck is turned into ids with `resolvePresets` before it is used.
   */
  byNumber?: boolean;
}

export const PRESET_DECKS: readonly PresetDeck[] = [
  {
    id: "rhodes",
    ipId: "ark",
    name: "罗德岛（蓝）",
    description: "蓝色单色：芙兰卡、杜宾、Guard 提供能量，临光（登场/阻挡/退场时强化前线）、红、阿米娅收尾，Mon3tr（所需能量 7，冲击1）与事件精神爆发。",
    cards: [["7059", 4], ["7066", 4], ["7079", 4], ["7145", 2], ["7055", 4], ["7060", 2], ["7075", 3], ["9029", 2], ["7070", 3], ["9038", 3], ["7058", 2], ["7143", 3], ["7076", 3], ["7082", 2], ["7144", 3], ["7063", 2], ["7081", 2], ["7095", 2]]
  },
  {
    id: "lungmen",
    ipId: "ark",
    name: "龙门（红）",
    description: "红色单色：九、星熊、诗怀雅起步，《2次阻挡》的星熊和《伤害2》的陈为核心，企鹅物流的德克萨斯、能天使，事件赤霄・拔刀。",
    cards: [["7126", 4], ["7128", 4], ["7117", 4], ["7120", 2], ["7107", 4], ["7121", 3], ["9108", 3], ["7103", 3], ["7133", 3], ["7111", 2], ["7129", 1], ["7112", 2], ["7116", 2], ["7108", 3], ["7122", 3], ["7130", 3], ["7100", 2], ["7136", 2]]
  },
  {
    id: "reunion",
    ipId: "ark",
    name: "整合运动（黄）",
    description: "黄色单色：米莎、霜星、整合运动士兵起步，弑君者、W、碎骨、塔露拉（所需能量 6）推进，事件整合运动。",
    cards: [["7011", 4], ["7041", 4], ["7039", 4], ["7040", 2], ["7012", 4], ["7015", 4], ["7022", 3], ["7028", 3], ["9015", 3], ["7043", 3], ["7018", 2], ["7027", 3], ["9022", 2], ["7016", 3], ["7019", 2], ["7029", 2], ["7052", 2]]
  },
  {
    id: "chernobog",
    ipId: "ark",
    name: "切尔诺伯格（紫）",
    description: "紫色单色：阿丽娜、萨沙、陈起步，斗士塔露拉与陈为主力，不死的黑蛇 塔露拉（所需能量 7，《2次攻击》）收尾，事件赤霄＆影霄。",
    cards: [["9046", 4], ["9053", 4], ["9057", 4], ["9065", 2], ["9047", 4], ["9067", 4], ["9079", 2], ["9058", 4], ["9085", 3], ["9074", 2], ["9066", 3], ["9059", 3], ["9054", 2], ["9061", 3], ["9055", 2], ["9072", 2], ["9091", 2]]
  },
  {
    id: "jjk",
    name: "咒术回战",
    description: "咒术回战：虎杖悠仁、钉崎野蔷薇、伏黑惠等 0 费用角色起步，禅院真希、大蛇、七海建人推进。只含引擎能自动结算的卡，所以本 IP 的人机对战只覆盖该作品的一部分卡牌。",
    ipId: "jjk",
    cards: [["100906", 4], ["100913", 4], ["100915", 4], ["100934", 4], ["100955", 4], ["100965", 4], ["100972", 4], ["100977", 4], ["100995", 4], ["101003", 4], ["101015", 4], ["101089", 4], ["101102", 2]]
  },
  {
    id: "kmy",
    name: "鬼灭之刃",
    description: "鬼灭之刃：灶门炭治郎、我妻善逸、嘴平伊之助、宇髓天元起步，时透无一郎与积怒补充。只含引擎能自动结算的卡，所以本 IP 的人机对战只覆盖该作品的一部分卡牌。",
    ipId: "kmy",
    cards: [["101807", 4], ["101820", 4], ["101836", 4], ["101863", 4], ["101884", 4], ["101897", 4], ["101979", 4], ["101989", 4], ["101997", 4], ["102000", 4], ["102024", 4], ["102030", 4], ["102035", 2]]
  },
  {
    id: "aot-survey",
    ipId: "aot",
    byNumber: true,
    name: "艾伦-调查兵团（红）",
    description: "红色单色：第104期训练兵团与利威尔小队的红色角色，艾伦·耶格尔为核心。",
    cards: [["UE10BT/AOT-1-090", 3], ["UE10BT/AOT-1-071", 3], ["UE10BT/AOT-1-083", 3], ["UE10BT/AOT-1-085", 3], ["UE10ST/AOT-1-106", 3], ["UE10BT/AOT-1-092", 3], ["UE10ST/AOT-1-107", 3], ["UEX07BT/AOT-2-071", 3], ["UE10BT/AOT-1-091", 3], ["UE10BT/AOT-1-093", 3], ["UEX07BT/AOT-2-070", 3], ["UEX07BT/AOT-2-072", 3], ["UE10BT/AOT-1-094", 3], ["UEX07BT/AOT-2-067", 3], ["UE10BT/AOT-1-081", 3], ["UE10BT/AOT-1-088", 3], ["UE10BT/AOT-1-074", 2]]
  },
  {
    id: "aot-levi",
    ipId: "aot",
    byNumber: true,
    name: "利威尔-利威尔小队（蓝）",
    description: "蓝色单色：利威尔小队为主，利威尔·阿克曼领队，搭配第104期训练兵团。",
    cards: [["UE10BT/AOT-1-007", 3], ["UE10BT/AOT-1-017", 3], ["UE10BT/AOT-1-004", 3], ["UE10BT/AOT-1-012", 3], ["UE10BT/AOT-1-010", 3], ["UE10BT/AOT-1-009", 3], ["UE10ST/AOT-1-110", 3], ["UE10BT/AOT-1-008", 3], ["UE10BT/AOT-1-011", 3], ["UEX07BT/AOT-2-041", 3], ["UEX07BT/AOT-2-042", 3], ["UEX07BT/AOT-2-040", 3], ["UE10BT/AOT-1-034", 3], ["UE10BT/AOT-1-018", 3], ["UE10BT/AOT-1-016", 3], ["UE10BT/AOT-1-024", 3], ["UE10BT/AOT-1-027", 2]]
  },
  {
    id: "aot-marley",
    ipId: "aot",
    byNumber: true,
    name: "莱纳-马莱战士（绿）",
    description: "绿色单色：马莱战士与巨人继承者，莱纳·布朗、贝尔托特、阿尼为核心。",
    cards: [["UE10BT/AOT-1-050", 3], ["UE10BT/AOT-1-058", 3], ["UE10BT/AOT-1-054", 3], ["UE10BT/AOT-1-042", 3], ["UE10BT/AOT-1-059", 3], ["UE10BT/AOT-1-055", 3], ["UEX07BT/AOT-2-059", 3], ["UE10BT/AOT-1-052", 3], ["UE10BT/AOT-1-053", 3], ["UE10BT/AOT-1-060", 3], ["UEX07BT/AOT-2-060", 3], ["UE10BT/AOT-1-051", 3], ["UE10BT/AOT-1-056", 3], ["UE10BT/AOT-1-061", 3], ["UE10BT/AOT-1-049", 3], ["UE10BT/AOT-1-047", 3], ["UE10ST/AOT-1-112", 2]]
  },
  {
    id: "aot-rumbling",
    ipId: "aot",
    byNumber: true,
    name: "艾伦-地鸣（黄）",
    description: "黄色单色：地鸣与九大巨人，艾伦·耶格尔为核心。",
    cards: [["UEX07BT/AOT-2-020", 3], ["UEX07BT/AOT-2-011", 3], ["UEX07BT/AOT-2-018", 3], ["UEX07BT/AOT-2-023", 3], ["UEX07BT/AOT-2-021", 3], ["UEX07BT/AOT-2-022", 3], ["UEX07BT/AOT-2-012", 3], ["UEX07BT/AOT-2-027", 3], ["UEX07BT/AOT-2-028", 3], ["UEX07BT/AOT-2-017", 3], ["UEX07BT/AOT-2-014", 3], ["UEX07BT/AOT-2-019", 3], ["UEX07BT/AOT-2-026", 3], ["UEX07BT/AOT-2-024", 3], ["UEX07BT/AOT-2-016", 3], ["UEX07BT/AOT-2-025", 3], ["UEX07BT/AOT-2-010", 2]]
  },
  {
    id: "kmy-hashira",
    ipId: "kmy",
    byNumber: true,
    name: "炭治郎-鬼杀队（黄）",
    description: "黄色单色：灶门炭治郎、我妻善逸、嘴平伊之助与柱。",
    cards: [["UA05ST/KMY-1-101", 3], ["UA05BT/KMY-1-005", 3], ["UA01NC/KMY-2-003", 3], ["UA01NC/KMY-2-004", 3], ["UA05BT/KMY-1-006", 3], ["UA05ST/KMY-1-106", 3], ["UA01NC/KMY-2-001", 3], ["UA05BT/KMY-1-007", 3], ["UA05BT/KMY-1-008", 3], ["EX05BT/KMY-3-002", 1], ["UA05ST/KMY-1-103", 3], ["UA05ST/KMY-1-102", 3], ["UA05BT/KMY-1-001", 3], ["UA05BT/KMY-1-015", 3], ["EX05BT/KMY-3-009", 3], ["UA01NC/KMY-2-006", 3], ["UA05BT/KMY-1-018", 3], ["UA05BT/KMY-1-023", 1]]
  },
  {
    id: "kmy-upper",
    ipId: "kmy",
    byNumber: true,
    name: "无惨-上弦之鬼（紫）",
    description: "紫色单色：上弦之鬼与下弦之鬼，鬼舞辻无惨坐镇。",
    cards: [["UA05BT/KMY-1-037", 3], ["UA05BT/KMY-1-049", 3], ["UA05BT/KMY-1-053", 3], ["EX05BT/KMY-3-058", 3], ["UA05BT/KMY-1-035", 3], ["UA05BT/KMY-1-036", 3], ["UA05BT/KMY-1-038", 3], ["EX05BT/KMY-3-049", 3], ["UA05BT/KMY-1-034", 3], ["UA05BT/KMY-1-048", 3], ["UA05BT/KMY-1-059", 3], ["UA05BT/KMY-1-054", 3], ["UA05BT/KMY-1-058", 3], ["UA05BT/KMY-1-050", 3], ["UA05BT/KMY-1-045", 3], ["UA05BT/KMY-1-055", 3], ["UA05BT/KMY-1-056", 1], ["EX05BT/KMY-3-052", 1]]
  },
  {
    id: "kmy-sound",
    ipId: "kmy",
    byNumber: true,
    name: "天元-音柱（红）",
    description: "红色单色：宇髄天元与他的妻子们，配合柱。",
    cards: [["UA05BT/KMY-1-085", 3], ["UA05BT/KMY-1-082", 3], ["UA05BT/KMY-1-092", 3], ["EX05BT/KMY-3-070", 3], ["UA05BT/KMY-1-086", 3], ["UA05BT/KMY-1-087", 3], ["UA01NC/KMY-2-010", 3], ["EX05BT/KMY-3-069", 3], ["UA05BT/KMY-1-089", 3], ["EX05BT/KMY-3-068", 3], ["UA05BT/KMY-1-091", 3], ["UA01NC/KMY-2-011", 3], ["UA05BT/KMY-1-083", 3], ["EX05BT/KMY-3-071", 1], ["UA05BT/KMY-1-090", 3], ["UA05BT/KMY-1-084", 3], ["UA05BT/KMY-1-093", 3], ["EX05BT/KMY-3-072", 1]]
  },
  {
    id: "kmy-mist",
    ipId: "kmy",
    byNumber: true,
    name: "无一郎-刀匠村（蓝）",
    description: "蓝色单色：时透无一郎与刀匠村、日轮刀。",
    cards: [["EX05BT/KMY-3-035", 3], ["EX05BT/KMY-3-030", 3], ["EX05BT/KMY-3-028", 3], ["EX05BT/KMY-3-018", 3], ["EX05BT/KMY-3-037", 3], ["EX05BT/KMY-3-038", 3], ["EX05BT/KMY-3-036", 3], ["EX05BT/KMY-3-039", 3], ["EX05BT/KMY-3-043", 3], ["EX05BT/KMY-3-033", 1], ["EX05BT/KMY-3-025", 3], ["EX05BT/KMY-3-029", 3], ["EX05BT/KMY-3-032", 3], ["EX05BT/KMY-3-026", 3], ["EX05BT/KMY-3-034", 3], ["EX05BT/KMY-3-031", 3], ["EX05BT/KMY-3-027", 3], ["EX05BT/KMY-3-040", 1]]
  },
  {
    id: "jjk-sorcerer",
    ipId: "jjk",
    byNumber: true,
    name: "虎杖-咒术师（红）",
    description: "红色单色：虎杖悠仁、钉崎野蔷薇与咒术师。",
    cards: [["EX04BT/JJK-3-047", 3], ["EX04BT/JJK-3-040", 3], ["EX04BT/JJK-3-054", 3], ["EX04BT/JJK-3-055", 3], ["EX04BT/JJK-3-042", 3], ["EX04BT/JJK-3-043", 3], ["EX04BT/JJK-3-049", 3], ["EX04BT/JJK-3-041", 3], ["EX04BT/JJK-3-048", 3], ["EX04BT/JJK-3-056", 3], ["EX04BT/JJK-3-058", 3], ["EX04BT/JJK-3-051", 3], ["EX04BT/JJK-3-052", 3], ["EX04BT/JJK-3-053", 3], ["EX04BT/JJK-3-062", 3], ["EX04BT/JJK-3-050", 3], ["EX04BT/JJK-3-059", 2]]
  },
  {
    id: "jjk-curse",
    ipId: "jjk",
    byNumber: true,
    name: "夏油-咒灵（紫）",
    description: "紫色单色：咒灵与京都校，夏油杰为核心。",
    cards: [["UA02BT/JJK-1-076", 3], ["UA02BT/JJK-1-090", 3], ["UA02BT/JJK-1-079", 3], ["UA02BT/JJK-1-091", 3], ["EX04BT/JJK-3-025", 3], ["UA02BT/JJK-1-069", 3], ["UA02BT/JJK-1-068", 3], ["UA02BT/JJK-1-080", 3], ["EX04BT/JJK-3-030", 1], ["UA02BT/JJK-1-077", 3], ["UA02BT/JJK-1-086", 3], ["UA02BT/JJK-1-089", 3], ["EX04BT/JJK-3-028", 3], ["EX04BT/JJK-3-033", 3], ["UA02BT/JJK-1-082", 3], ["UA02BT/JJK-1-087", 3], ["UA02BT/JJK-1-093", 3], ["EX04BT/JJK-3-034", 1]]
  },
  {
    id: "jjk-shikigami",
    ipId: "jjk",
    byNumber: true,
    name: "伏黑-式神（黄）",
    description: "黄色单色：伏黑惠与式神。",
    cards: [["UA02BT/JJK-1-019", 3], ["UA02BT/JJK-1-024", 3], ["EX04BT/JJK-3-008", 3], ["UA02BT/JJK-1-013", 3], ["UA02BT/JJK-1-021", 3], ["UA02BT/JJK-1-020", 3], ["UA02BT/JJK-1-022", 3], ["EX04BT/JJK-3-007", 3], ["UA02NC/JJK-2-005", 3], ["EX04BT/JJK-3-009", 3], ["UA02BT/JJK-1-025", 3], ["UA02BT/JJK-1-023", 3], ["UA02BT/JJK-1-026", 3], ["UA02BT/JJK-1-009", 2], ["UA02BT/JJK-1-016", 2], ["EX04BT/JJK-3-005", 2], ["UA02NC/JJK-2-002", 2], ["UA02BT/JJK-1-008", 2], ["UA02NC/JJK-2-004", 1]]
  },
  {
    id: "jjk-tokyo",
    ipId: "jjk",
    byNumber: true,
    name: "五条-东京校（蓝）",
    description: "蓝色单色：五条悟领队，咒具辅助。",
    cards: [["UA02BT/JJK-1-042", 3], ["EX04BT/JJK-3-014", 3], ["UA02ST/JJK-1-106", 3], ["UA02BT/JJK-1-037", 3], ["UA02BT/JJK-1-046", 3], ["UA02BT/JJK-1-045", 3], ["UA02ST/JJK-1-103", 3], ["UA02BT/JJK-1-065", 3], ["UA02BT/JJK-1-066", 3], ["UA02BT/JJK-1-041", 2], ["EX04BT/JJK-3-023", 2], ["UA02NC/JJK-2-006", 2], ["UA02BT/JJK-1-035", 2], ["UA02BT/JJK-1-039", 2], ["UA02BT/JJK-1-049", 2], ["UA02BT/JJK-1-052", 2], ["EX04BT/JJK-3-017", 2], ["UA02ST/JJK-1-101", 2], ["UA02ST/JJK-1-102", 2], ["UA02BT/JJK-1-040", 2], ["UA02BT/JJK-1-054", 1]]
  }
];

/** The preset decks of one title. */
export function presetDecksFor(ipId: IpId): PresetDeck[] {
  return PRESET_DECKS.filter((deck) => deck.ipId === ipId);
}

/** The titles that have a preset deck, i.e. the ones the vs-computer mode can actually play. */
export function titlesWithPresetDeck(): IpId[] {
  return [...new Set(PRESET_DECKS.map((deck) => deck.ipId))];
}

export function deckCards(deck: PresetDeck): string[] {
  return deck.cards.flatMap(([id, copies]) => Array<string>(copies).fill(id));
}

/**
 * The preset decks with card numbers turned into this catalog's card ids (the first print of each number, one with art preferred).
 * A deck with a number the catalog does not have is left out, so a title whose card data is not loaded offers no broken deck.
 */
export function resolvePresets(catalog: ReadonlyArray<{ id: string; number: string; imageAvailable?: boolean; imageUrl?: string | null }>): PresetDeck[] {
  const idOf = new Map<string, { id: string; art: boolean }>();
  for (const card of catalog) {
    const art = card.imageAvailable ?? (card.imageUrl !== undefined && card.imageUrl !== null);
    const known = idOf.get(card.number);
    if (known === undefined || (art && !known.art)) idOf.set(card.number, { id: card.id, art });
  }
  const resolved: PresetDeck[] = [];
  for (const deck of PRESET_DECKS) {
    if (!deck.byNumber) { resolved.push(deck); continue; }
    const cards: Array<[string, number]> = [];
    for (const [number, copies] of deck.cards) {
      const entry = idOf.get(number);
      if (entry === undefined) break;
      cards.push([entry.id, copies]);
    }
    if (cards.length === deck.cards.length) resolved.push({ ...deck, cards, byNumber: false });
  }
  return resolved;
}

export function presetDeck(id: string): PresetDeck {
  return PRESET_DECKS.find((deck) => deck.id === id) ?? PRESET_DECKS[0]!;
}
