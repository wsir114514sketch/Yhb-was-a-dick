# 飞行棋 · 素材与代码署名

本项目不是棋盘素材的原创者。棋盘几何与规则来自开源项目，按原许可署名如下。

## 棋盘与规则

- 项目：**SweetMikann / aeroplane-chess**
- 许可：**CC BY 4.0**（Creative Commons Attribution 4.0 International）
- 署名：规则 **Mikann** / 棋盘 **Damien** / 程序 **澄**
- 用途：`src/game/board.ts` 的 52 格环线、四色跑道、基地、捷径与起飞格的坐标表，以及 `src/game/rules.ts` 的规则设计，均依据该项目的棋盘与规则整理。
- 许可全文：<https://creativecommons.org/licenses/by/4.0/>

修改说明：坐标表整理为 900×900 的画布坐标并写入 TypeScript 常量；界面、骰子与头像徽记为另写的实现，但棋盘布局仍源自上述项目。

## 本项目自写的部分

- `src/client/` 的界面、CSS 3D 骰子、头像徽记、联机大厅与等待室。
- `src/server/` 的房间、协议、断线重连、电脑托管与落盘。
- 首页封面 `FlyingChessCover.tsx` 为原创 SVG。

## 未使用的库

- 骰子为 CSS 3D 实现，**没有引入 Three.js**；因此不需为 Three.js 署名。
