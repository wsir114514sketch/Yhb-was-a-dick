# 素材登记表 (ASSETS.md)

本文件登记仓库内所有美术与音频素材。**未登记的文件不应进入 `public/` 或 `src/client/assets/`**。

规则：无法确认授权的素材一律不进仓库。城市照片来自 Wikimedia Commons，逐张核验授权后入库（§2）；其余素材为本项目自绘。

---

## 1. 当前素材清单

除 §2 的照片与 §3 的骰子材质外，全部视觉素材**由本项目自绘**，以 SVG 内联于组件。不含第三方音频、商标或国家象征。

| 素材 | 来源 | 作者 | 授权 | 需署名 | 使用位置 |
|---|---|---|---|---|---|
| 棋子图标 8 种（行李箱、相机、热气球、帆船、火车头、飞机、指南针、地球仪） | 原创自绘 SVG | 本项目 | 原创 | 否 | `src/client/art/tokens.tsx` |
| 城市徽记 35 个（棋盘格上的单色记号，按格号索引） | 原创自绘 SVG | 本项目 | 原创 | 否 | `src/client/art/crests.tsx` |
| 城市场景插画 35 幅（地产卡头图兜底，含天空/地标/地面层次） | 原创自绘 SVG | 本项目 | 原创 | 否 | `src/client/art/scenes.tsx` |
| 建筑图形（房屋 1–4 级、酒店） | 原创自绘 SVG | 本项目 | 原创 | 否 | `src/client/board/Tile.tsx` |
| 事件卡卡面（色带 + 文字，无插画） | 原创 | 本项目 | 原创 | 否 | `src/client/ui/CardDialog.tsx` |
| 骰子面（大理石纹理，见 §3）+ 程序化骰点 | 纹理见 §3；骰点为原创绘制 | 本项目 | 见 §3 | 见 §3 | `src/client/board/Dice.tsx` |
| 界面图标（骰、菜单、卡牌、交通与公用事业） | 原创自绘 SVG | 本项目 | 原创 | 否 | 各组件内联 |
| 音效（骰子、金币、卡牌、建房、入狱、拍卖、胜负） | Web Audio 程序化合成，无音频文件 | 本项目 | 原创 | 否 | `src/client/sound.ts` |

## 2. 城市照片（Wikimedia Commons）

地产卡头图使用 35 张真实照片，存于 `src/client/assets/cities/<格号>.jpg`（880×480 JPEG，从 Commons 缩略图下载并居中裁切）。
索引 `src/client/photos.ts` 由 `tools/fetch_city_photos.py` 生成，含每张的 Commons 文件名、作者与许可证；照片卡左下角就地标注「© 作者 · 许可证」。
选择标准：仅 CC0 / Public domain / CC BY / CC BY-SA；无国旗、无地图、无徽章；CC BY-SA 的分享注记（指向 Commons 原页的引用）随卡面署名一并满足。

| 文件 | Commons 文件名 | 作者 | 许可证 |
|---|---|---|---|
| 1.jpg | Rio de Janeiro skyline and Sugarloaf Mountain at sunset, Brazil 3.jpg | Wilfredor | CC0 |
| 2.jpg | Buenos Aires-Av. 9 de julio.jpg | jennifrog | CC BY-SA 2.0 |
| 5.jpg | Kaohsiung Port Station front view.jpg | KasugaHuang | CC BY 2.5 |
| 6.jpg | Parque Avenida Building in Paulista Avenue.jpg | Wilfredor | CC0 |
| 7.jpg | Lima, Peru City -- Skyline (Miraflores).jpg | Donairesunovi | CC BY-SA 3.0 |
| 10.jpg | All Gizah Pyramids.jpg | Ricardo Liberato | CC BY-SA 2.0 |
| 12.jpg | Cape Town City Bowl and Table Mountain at dawn.jpg | Daniel Case | CC BY-SA 3.0 |
| 13.jpg | Jamaa El Fna, Marrakesh, Morocco, 20250124 1804 7017.jpg | Jakub Hałun | CC BY 4.0 |
| 14.jpg | PacifiCorp 345kV Power Lines Near Jim Bridger Power Plant, Wyoming.jpg | Tony Webster | CC BY 4.0 |
| 15.jpg | Marine Lines Mumbai 2021.jpg | Dr Vikramjit Kakati | CC BY-SA 4.0 |
| 16.jpg | Monumen Nasional, Jakarta, Indonesia.jpg | Ramayoni | CC BY-SA 4.0 |
| 18.jpg | Puente Helix, museo ArtScience y hotel Marina Bay Sands, Marina Bay, Singapur, 2023-08-17, DD 67-69 HDR.jpg | Diego Delso | CC BY-SA 4.0 |
| 19.jpg | Río Chao Phraya, Bangkok, Tailandia, 2013-08-22, DD 05.jpg | Diego Delso | CC BY-SA 3.0 |
| 20.jpg | Munich subway station Westfriedhof.jpg | Martin Falbisoner | CC BY-SA 3.0 |
| 21.jpg | Shanghai skyline waterfront pudong 5166168 69 70.jpg | Ermell | CC0 |
| 22.jpg | Peking verbotene Stadt-20071018-RM-162411.jpg | Ermell | CC BY-SA 4.0 |
| 24.jpg | Minato City, Tokyo, Japan.jpg | David Kernan | CC BY 4.0 |
| 25.jpg | Gyeonghoeru (Royal Banquet Hall) at Gyeongbokgung Palace, Seoul.jpg | Frank Schulenburg | CC BY-SA 4.0 |
| 27.jpg | Taipei Taiwan Taipei-101-Tower-01.jpg | CEphoto, Uwe Aranas | CC BY-SA 3.0 |
| 28.jpg | Taiwan High Speed Rail train 639 at Tainan HSR station May 2025.jpg | 4300streetcar | CC BY 4.0 |
| 29.jpg | Kaohsiung-Love-River.jpg | Taken by Henry Trotter | Public domain |
| 30.jpg | Taichung City Skyline, Central District 2025-11-06.jpg | Foxy1219 | CC BY-SA 4.0 |
| 32.jpg | Tainan Taiwan Fort-Provintia-01.jpg | CEphoto, Uwe Aranas | CC BY-SA 3.0 |
| 34.jpg | Sydney Opera House and Harbour Bridge Dusk (3) 2019-06-21.jpg | Benh LIEU SONG (Flickr) | CC BY-SA 4.0 |
| 35.jpg | Auckland CBD skyline from Waitemata Harbour entrance.jpg | Pseudopanax at English Wikipedia | Public domain |
| 36.jpg | Water treatment plant below Carsington Water reservoir - geograph.org.uk - 3187180.jpg | Chris Morgan | CC BY-SA 2.0 |
| 37.jpg | Burj Khalifa Dubai, UAE at Sunset 001 by Eric Chamchoum.jpg | ECWiki1 | CC BY 4.0 |
| 39.jpg | Tour eiffel at sunrise from the trocadero.jpg | Tristan Nitot | CC BY-SA 3.0 |
| 40.jpg | Tower Bridge London Dusk Feb 2006.jpg | Diliff | CC BY-SA 3.0 |
| 41.jpg | Grossmünster and Limmat River, Zurich, 20250330 1239 7929.jpg | Jakub Hałun | CC BY 4.0 |
| 42.jpg | Rome Colosseum 001.jpg | Wilfredor | CC0 |
| 44.jpg | Lower Manhattan from Staten Island Ferry Jan 2006.jpg | Diliff | CC BY 2.5 |
| 45.jpg | Los Angeles (California, USA), South Olive Street -- 2012 -- 4847.jpg | Dietmar Rabich | CC BY-SA 4.0 |
| 46.jpg | Lower Manhattan from Jersey City September 2020 panorama.jpg | King of Hearts | CC BY-SA 4.0 |
| 47.jpg | San Francisco with two bridges and the low fog.jpg | Brocken Inaglory | CC BY-SA 3.0 |

## 3. 骰子材质

| 素材 | 来源 | 作者 | 授权 | 需署名 | 使用位置 |
|---|---|---|---|---|---|
| `src/client/assets/dice/marble.webp`（大理石骰面纹理） | [dice-box-threejs](https://github.com/3d-dice/dice-box-threejs) 仓库 `public/textures` | 3d-dice | MIT | 否（保留许可声明即可） | `src/client/board/Dice.tsx` |

只取其材质观感，不引入其物理引擎或代码。飞行棋原型（`Flying Chess/FlyingChessWorkSpace/prototype/ref/`）登记过同一批纹理，两处同源。

## 4. 字体

| 字体 | 来源 | 授权 | 使用方式 |
|---|---|---|---|
| 系统字体栈（`-apple-system`, `Segoe UI`, `Microsoft YaHei`, `PingFang SC`, `Noto Sans CJK SC`） | 操作系统自带 | 随系统 | 不打包、不分发 |

数字使用 `font-variant-numeric: tabular-nums` 保证等宽，不引入额外字体文件。

## 5. 明确未使用

为遵守内容的合规要求，以下内容**一律不使用**：

- 国旗、国徽、国歌、领导人形象、国界线地图
- 任何真实品牌商标、真实人物肖像
- 社交平台（微博/小红书/Instagram/Pinterest）上抓取的图片
- 含品牌标识的真实建筑照片（选图时人工核验，见 §2）

地区与国家相关的表达限制见制作计划 B1.1，并由 `tests/unit/board.test.ts` 的内容审查用例自动检查。

## 6. 检查方式

`tests/unit/board.test.ts` 的「大富翁内容规范」用例扫描数据层，确保：

- 不存在 `country` / `continent` / `nation` / `flag` 字段
- 玩家可见文案不含禁用词
- 数据层不引用任何图片路径

`tests/unit/render.test.tsx` 检查地产卡头图为真实照片并带「© 作者 · 许可证」署名。照片与骰子材质以外的新增 `assets/` 文件必须同步登记到 §1–§3。