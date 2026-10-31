/**
 * The board: 48 tiles around a loop, walked clockwise from 起点.
 *
 * The layout is a world-travel one, grouping cities by **region** (not by country): a region is what pays the group
 * bonus, so it is the only grouping the rules need. There is deliberately no `country` field — a city board does not need
 * one, and leaving it out keeps every tile from reading as a statement about sovereignty.
 *
 * Money is in US dollars, held here as plain integers and formatted by `formatMoney` in economy.ts. Prices climb from the
 * cheap corner of the board to the far side, so reaching the other half is worth the walk; the numbers are balanced
 * against each other (rent ÷ price, build cost ÷ rent) rather than against real property prices.
 */

/** A group of tiles that pays more rent once one owner holds all of them. */
export interface Region {
  id: string;
  /** The region's name, which is all the interface ever shows of it. */
  name: string;
  /** The region's colour, used on the board and in the detail card. */
  color: string;
  /** A single letter or glyph, so a region is never identified by colour alone. */
  mark: string;
}

export const REGIONS: readonly Region[] = [
  { id: "sa", name: "南美洲", color: "#1f8a5f", mark: "A" },
  { id: "af", name: "非洲", color: "#c9803a", mark: "B" },
  { id: "sea", name: "南亚与东南亚", color: "#b8901f", mark: "C" },
  { id: "ea", name: "东亚", color: "#c1443f", mark: "D" },
  { id: "tw", name: "台湾地区", color: "#2f8f8a", mark: "E" },
  { id: "oc", name: "大洋洲及西亚", color: "#5d6fb5", mark: "F" },
  { id: "eu", name: "欧洲", color: "#8a5fbf", mark: "G" },
  { id: "na", name: "北美洲", color: "#2f6f8f", mark: "H" }
];

export type TileKind = "go" | "property" | "transport" | "utility" | "chance" | "fund" | "tax" | "jail" | "gotojail" | "rest";

/** How a purchasable tile charges rent: a property by buildings, a transport by how many are held, a utility by dice. */
export type TileType = "普通" | "地标" | "交通运输" | "公共事业";

export interface TileBase {
  /** Its place on the loop, 0-based, in walking order. */
  index: number;
  kind: TileKind;
  /** Shown on tiles that cannot be bought (起点, 机会, 税…). A purchasable tile shows its `city` instead. */
  name?: string;
  /** English name, shown under the Chinese one in the detail card. */
  nameEn?: string;
  /** One line for the detail card of a tile that cannot be bought. */
  blurb?: string;
}

export interface CommercialTile extends TileBase {
  kind: "property" | "transport" | "utility";
  /** The city (or the transport/utility) this tile is. This is the only name a purchasable tile has. */
  city: string;
  cityEn?: string;
  type: TileType;
  /** The region whose rent bonus this tile shares. Transports and utilities carry one too, for colour only. */
  region: string;
  price: number;
  /** Rent with no buildings. For a transport or a utility this is the base of its own formula. */
  rent: number;
  /** Rent at building levels 1..5 (four homes, then the hotel). Empty for transports and utilities, which are not built on. */
  rents: number[];
  /** Cost of one building step. */
  buildCost: number;
  /** Money received when mortgaged, and what it costs to lift the mortgage. */
  mortgage: number;
  /** One neutral line about the city, for the detail card: places, food, landscape — never politics or history. */
  about: string;
}

export interface PlainTile extends TileBase { kind: Exclude<TileKind, "property" | "transport" | "utility">; name: string; }

export type Tile = CommercialTile | PlainTile;

export const isCommercial = (tile: Tile): tile is CommercialTile => tile.kind === "property" || tile.kind === "transport" || tile.kind === "utility";

/**
 * The board, in walking order. 48 tiles: 13 that cannot be bought, 29 properties, 4 transports, 2 utilities.
 *
 * The four transports keep generic names (环城地铁 / 滨港铁路 / 高速铁路 / 跨海渡轮) so no real operator or trademark is
 * implied. The regions run along the edges in ascending price order: the cheap corner is 南美洲, the expensive far side is
 * 北美洲.
 */
const TILES: readonly Tile[] = [
  { index: 0, kind: "go", name: "起点", nameEn: "Start", blurb: "经过或停留领取 $200。" },

  // ---- 南美洲 (the cheap corner) ----
  { index: 1, kind: "property", city: "里约热内卢", cityEn: "Rio de Janeiro", type: "普通", region: "sa", price: 60, rent: 2, rents: [10, 30, 90, 160, 250], buildCost: 50, mortgage: 30, about: "海湾边的城市，海滩紧挨着山峰，山上的缆车横跨城区。" },
  { index: 2, kind: "property", city: "布宜诺斯艾利斯", cityEn: "Buenos Aires", type: "普通", region: "sa", price: 60, rent: 4, rents: [20, 60, 180, 320, 450], buildCost: 50, mortgage: 30, about: "河口边的城市，街区像棋盘一样向草原铺开，街头常见探戈。" },
  { index: 3, kind: "chance", name: "机会", nameEn: "Chance", blurb: "抽一张机会卡，按卡面结算。" },
  { index: 4, kind: "tax", name: "所得税", nameEn: "Income Tax", blurb: "缴纳所得税 $200。" },
  { index: 5, kind: "transport", city: "滨港铁路", cityEn: "Harbour Railway", type: "交通运输", region: "sa", price: 200, rent: 25, rents: [], buildCost: 0, mortgage: 100, about: "把港口与内陆货场连起来的铁路线。" },
  { index: 6, kind: "property", city: "圣保罗", cityEn: "São Paulo", type: "普通", region: "sa", price: 100, rent: 6, rents: [30, 90, 270, 400, 550], buildCost: 50, mortgage: 50, about: "高原上的巨型城市，大道从天际线中间穿过。" },
  { index: 7, kind: "property", city: "利马", cityEn: "Lima", type: "普通", region: "sa", price: 100, rent: 6, rents: [30, 90, 270, 400, 550], buildCost: 50, mortgage: 50, about: "太平洋岸边的城市，一年到头少见下雨。" },

  { index: 8, kind: "chance", name: "机会", nameEn: "Chance", blurb: "抽一张机会卡，按卡面结算。" },
  { index: 9, kind: "jail", name: "监狱", nameEn: "Jail", blurb: "只是路过；在押者仍可收租。" },

  // ---- 非洲 ----
  { index: 10, kind: "property", city: "开罗", cityEn: "Cairo", type: "普通", region: "af", price: 140, rent: 10, rents: [50, 150, 450, 625, 750], buildCost: 100, mortgage: 70, about: "大河从城中穿过，河谷把两侧的沙地切成两半。" },
  { index: 11, kind: "fund", name: "公共基金", nameEn: "Community Chest", blurb: "领取或缴纳公共基金。" },
  { index: 12, kind: "property", city: "开普敦", cityEn: "Cape Town", type: "普通", region: "af", price: 140, rent: 10, rents: [50, 150, 450, 625, 750], buildCost: 100, mortgage: 70, about: "平顶山脚下的港口城市，缆车直上山顶看两片海。" },
  { index: 13, kind: "property", city: "马拉喀什", cityEn: "Marrakesh", type: "普通", region: "af", price: 160, rent: 12, rents: [60, 180, 500, 700, 900], buildCost: 100, mortgage: 80, about: "老城墙围着一片大广场，傍晚挤满小吃摊和说书人。" },
  { index: 14, kind: "utility", city: "电力公司", cityEn: "Power Company", type: "公共事业", region: "af", price: 150, rent: 4, rents: [], buildCost: 0, mortgage: 75, about: "公用事业：按骰子点数收费，持有一家与两家标准不同。" },

  // ---- 南亚与东南亚 ----
  { index: 15, kind: "property", city: "孟买", cityEn: "Mumbai", type: "普通", region: "sea", price: 180, rent: 14, rents: [70, 200, 550, 750, 950], buildCost: 100, mortgage: 90, about: "半岛城市，海滨大道沿着海岸画出一条长弧。" },
  { index: 16, kind: "property", city: "雅加达", cityEn: "Jakarta", type: "普通", region: "sea", price: 180, rent: 14, rents: [70, 200, 550, 750, 950], buildCost: 100, mortgage: 90, about: "老城靠着运河与码头，街边小吃摊挤满巷口。" },
  { index: 17, kind: "chance", name: "机会", nameEn: "Chance", blurb: "抽一张机会卡，按卡面结算。" },
  { index: 18, kind: "property", city: "新加坡", cityEn: "Singapore", type: "地标", region: "sea", price: 200, rent: 16, rents: [80, 220, 600, 800, 1000], buildCost: 100, mortgage: 100, about: "赤道旁的港口城邦，雨树遮住大半街道，夜市一直开到深夜。" },
  { index: 19, kind: "property", city: "曼谷", cityEn: "Bangkok", type: "普通", region: "sea", price: 220, rent: 18, rents: [90, 250, 700, 875, 1050], buildCost: 150, mortgage: 110, about: "大河边的城市，运河与水上市场曾是这里的主要街道。" },

  { index: 20, kind: "transport", city: "环城地铁", cityEn: "City Metro", type: "交通运输", region: "sea", price: 200, rent: 25, rents: [], buildCost: 0, mortgage: 100, about: "绕城一圈的地铁环线，换乘站总是最热闹的地方。" },

  // ---- 东亚 ----
  { index: 21, kind: "property", city: "上海", cityEn: "Shanghai", type: "普通", region: "ea", price: 220, rent: 18, rents: [90, 250, 700, 875, 1050], buildCost: 150, mortgage: 110, about: "江把老城与新区隔在两岸，一边是石库门，一边是塔楼群。" },
  { index: 22, kind: "property", city: "北京", cityEn: "Beijing", type: "普通", region: "ea", price: 240, rent: 20, rents: [100, 300, 750, 925, 1100], buildCost: 150, mortgage: 120, about: "城正中有条笔直的中轴线，环路一圈圈套在外面。" },
  { index: 23, kind: "fund", name: "公共基金", nameEn: "Community Chest", blurb: "领取或缴纳公共基金。" },
  { index: 24, kind: "property", city: "东京", cityEn: "Tokyo", type: "地标", region: "ea", price: 260, rent: 22, rents: [110, 330, 800, 975, 1150], buildCost: 150, mortgage: 130, about: "环线把老城区与几个副中心串成一圈，樱花季沿线挤满人。" },
  { index: 25, kind: "property", city: "首尔", cityEn: "Seoul", type: "普通", region: "ea", price: 280, rent: 24, rents: [120, 360, 850, 1025, 1200], buildCost: 150, mortgage: 140, about: "大河把城市分成两半，老宫殿与高楼隔着一条街。" },

  { index: 26, kind: "tax", name: "奢侈税", nameEn: "Luxury Tax", blurb: "缴纳奢侈税 $100。" },

  // ---- 台湾地区 ----
  { index: 27, kind: "property", city: "台北", cityEn: "Taipei", type: "普通", region: "tw", price: 300, rent: 26, rents: [130, 390, 900, 1100, 1275], buildCost: 200, mortgage: 150, about: "盆地之中的城市，河边有夜市，山就在城边。" },
  { index: 28, kind: "transport", city: "高速铁路", cityEn: "High Speed Rail", type: "交通运输", region: "tw", price: 200, rent: 25, rents: [], buildCost: 0, mortgage: 100, about: "沿西海岸行驶的高速铁路线。" },
  { index: 29, kind: "property", city: "高雄", cityEn: "Kaohsiung", type: "普通", region: "tw", price: 300, rent: 26, rents: [130, 390, 900, 1100, 1275], buildCost: 200, mortgage: 150, about: "港口城市，旧仓库改成艺术区，爱河从城中流过。" },
  { index: 30, kind: "property", city: "台中", cityEn: "Taichung", type: "普通", region: "tw", price: 320, rent: 28, rents: [150, 450, 1000, 1200, 1400], buildCost: 200, mortgage: 160, about: "岛中部的城市，一条绿园道从旧市区一直铺到北边。" },
  { index: 31, kind: "fund", name: "公共基金", nameEn: "Community Chest", blurb: "领取或缴纳公共基金。" },
  { index: 32, kind: "property", city: "台南", cityEn: "Tainan", type: "普通", region: "tw", price: 340, rent: 32, rents: [160, 480, 1050, 1250, 1450], buildCost: 200, mortgage: 170, about: "老城，弯弯曲曲的老街之间是庙口小吃摊。" },

  { index: 33, kind: "chance", name: "机会", nameEn: "Chance", blurb: "抽一张机会卡，按卡面结算。" },

  // ---- 大洋洲及西亚 ----
  { index: 34, kind: "property", city: "悉尼", cityEn: "Sydney", type: "普通", region: "oc", price: 340, rent: 32, rents: [160, 480, 1050, 1250, 1450], buildCost: 200, mortgage: 170, about: "海湾与海岬之间，一座钢拱桥跨在水面上，歌剧院像张开的帆。" },
  { index: 35, kind: "property", city: "奥克兰", cityEn: "Auckland", type: "普通", region: "oc", price: 360, rent: 38, rents: [180, 520, 1150, 1400, 1600], buildCost: 200, mortgage: 180, about: "两片港湾夹着的城市，几十座火山锥散在屋顶之间。" },
  { index: 36, kind: "utility", city: "自来水厂", cityEn: "Water Works", type: "公共事业", region: "oc", price: 150, rent: 4, rents: [], buildCost: 0, mortgage: 75, about: "公用事业：按骰子点数收费，持有一家与两家标准不同。" },
  { index: 37, kind: "property", city: "迪拜", cityEn: "Dubai", type: "地标", region: "oc", price: 380, rent: 40, rents: [190, 550, 1250, 1550, 1800], buildCost: 200, mortgage: 190, about: "沙漠与海湾之间，塔楼沿一条公路排开，市集里卖香料和黄金。" },

  { index: 38, kind: "rest", name: "免费停留", nameEn: "Free Parking", blurb: "什么也不发生，休息一格。" },

  // ---- 欧洲 ----
  { index: 39, kind: "property", city: "巴黎", cityEn: "Paris", type: "普通", region: "eu", price: 380, rent: 40, rents: [190, 550, 1250, 1550, 1800], buildCost: 200, mortgage: 190, about: "河穿城而过，两岸的街区绕着河心排成一圈圈。" },
  { index: 40, kind: "property", city: "伦敦", cityEn: "London", type: "地标", region: "eu", price: 400, rent: 50, rents: [200, 600, 1400, 1700, 2000], buildCost: 250, mortgage: 200, about: "大河向东转弯，老码头与金融区隔水相对。" },
  { index: 41, kind: "property", city: "苏黎世", cityEn: "Zurich", type: "普通", region: "eu", price: 400, rent: 50, rents: [200, 600, 1400, 1700, 2000], buildCost: 250, mortgage: 200, about: "湖的北端，河从老城中间穿出，电车沿着湖边开。" },
  { index: 42, kind: "property", city: "罗马", cityEn: "Rome", type: "普通", region: "eu", price: 420, rent: 55, rents: [220, 650, 1500, 1800, 2100], buildCost: 250, mortgage: 210, about: "河边的城市，几座山丘把街区抬得高低不平，广场上总有喷泉。" },

  { index: 43, kind: "gotojail", name: "前往监狱", nameEn: "Go to Jail", blurb: "直接进入监狱，不领取起点工资。" },

  // ---- 北美洲 (the far, expensive side) ----
  { index: 44, kind: "transport", city: "跨海渡轮", cityEn: "Ferry Line", type: "交通运输", region: "na", price: 200, rent: 25, rents: [], buildCost: 0, mortgage: 100, about: "连接两岸码头的渡轮航线，早班船上常常只有通勤的人。" },
  { index: 45, kind: "property", city: "洛杉矶", cityEn: "Los Angeles", type: "普通", region: "na", price: 400, rent: 50, rents: [200, 600, 1400, 1700, 2000], buildCost: 250, mortgage: 200, about: "群山与海岸之间铺开的低密度城市，高速公路贯穿全城。" },
  { index: 46, kind: "property", city: "纽约", cityEn: "New York", type: "地标", region: "na", price: 440, rent: 60, rents: [240, 700, 1600, 1900, 2200], buildCost: 250, mortgage: 220, about: "格子状的街道向两端铺开，大河在西侧，公园占去一大片街区。" },
  { index: 47, kind: "property", city: "旧金山", cityEn: "San Francisco", type: "普通", region: "na", price: 420, rent: 55, rents: [220, 650, 1500, 1800, 2100], buildCost: 250, mortgage: 210, about: "半岛北端，坡道尽头是海湾和雾，有轨电车一路爬坡。" }
];

export const BOARD_SIZE = TILES.length;

/** Every region's purchasable properties, in board order. */
export const REGION_PROPERTIES: Readonly<Record<string, readonly CommercialTile[]>> = Object.fromEntries(
  REGIONS.map((region) => [region.id, TILES.filter((tile): tile is CommercialTile => isCommercial(tile) && tile.kind === "property" && tile.region === region.id)])
);

/** How many properties a region has; holding all of them doubles an unbuilt rent and allows building. */
export const REGION_SIZES: Readonly<Record<string, number>> = Object.fromEntries(
  REGIONS.map((region) => [region.id, REGION_PROPERTIES[region.id]!.length])
);

/** A tile's display name, whether it is a purchasable city or a plain square. */
export const tileName = (tile: Tile): string => (isCommercial(tile) ? tile.city : tile.name);
/** A tile's English name, when it has one. */
export const tileNameEn = (tile: Tile): string | undefined => (isCommercial(tile) ? tile.cityEn : tile.nameEn);

export const tileAt = (index: number): Tile => TILES[((index % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE]!;
export const commercialAt = (index: number): CommercialTile | null => {
  const tile = tileAt(index);
  return isCommercial(tile) ? tile : null;
};
export const regionOf = (id: string): Region | undefined => REGIONS.find((region) => region.id === id);

export const TRANSPORT_TILES = TILES.filter((tile): tile is CommercialTile => tile.kind === "transport");
export const UTILITY_TILES = TILES.filter((tile): tile is CommercialTile => tile.kind === "utility");
/** Every purchasable tile, which is what ownership, mortgage and trade all work on. */
export const COMMERCIAL_TILES = TILES.filter(isCommercial);

export { TILES as BOARD_TILES };
