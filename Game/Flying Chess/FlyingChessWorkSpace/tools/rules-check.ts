/**
 * 规则引擎的自检：用 node 直接跑，不依赖浏览器。
 * 覆盖提示词里列出的每条规则，尤其是容易写错的优先级与边界。
 */

import {
  afterRoll, applyMove, createGame, currentPlayer, legalMoves, resolveMove, ringIndexAt
} from "../src/game/rules.ts";
import type { GameState } from "../src/game/rules.ts";
import { GOAL_STEP, LAST_RING_STEP, RING, SHORTCUT_STEP, START_INDEX } from "../src/game/board.ts";

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = ""): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `得到 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
}

function twoPlayer(sixOnly = false): GameState {
  return createGame({
    players: [
      { color: "green", name: "绿", ai: false },
      { color: "red", name: "红", ai: false }
    ],
    sixOnly
  });
}

console.log("棋盘几何");
eq("环线 52 格", RING.length, 52);
check("环线颜色严格 B-G-R-Y 循环", RING.every((cell, i) => {
  const order = ["blue", "green", "red", "yellow"];
  return cell.color === order[i % 4];
}), RING.map((c) => c.color).slice(0, 8).join(","));
eq("绿起飞格是环线 46", START_INDEX.green, 46);
eq("红起飞格是环线 7", START_INDEX.red, 7);
eq("绕行 48 格回到跑道入口", ringIndexAt("green", 47), (46 + 47) % 52);

console.log("起飞条件");
const g1 = twoPlayer();
const p1 = currentPlayer(g1);
eq("4 点不能起飞", legalMoves(g1, p1, 4).length, 0);
eq("5 点可以起飞", legalMoves(g1, p1, 5).length, 4);
eq("6 点可以起飞", legalMoves(g1, p1, 6).length, 4);

const g2 = twoPlayer(true);
eq("仅 6 模式下 5 点不能起飞", legalMoves(g2, currentPlayer(g2), 5).length, 0);
eq("仅 6 模式下 6 点可以起飞", legalMoves(g2, currentPlayer(g2), 6).length, 4);

console.log("连续三次 6");
let g3 = twoPlayer();
g3 = afterRoll(g3, 6);
check("第一次 6 进入移动阶段", g3.phase === "move");
g3 = applyMove(g3, legalMoves(g3, currentPlayer(g3), 6)[0]!);
check("掷 6 后仍是同一玩家", g3.turn === 0, `turn=${g3.turn}`);
eq("连续计数为 1", currentPlayer(g3).sixStreak, 1);

g3 = afterRoll(g3, 6);
g3 = applyMove(g3, legalMoves(g3, currentPlayer(g3), 6)[0]!);
eq("连续计数为 2", currentPlayer(g3).sixStreak, 2);

g3 = afterRoll(g3, 6);
check("第三次 6 作废、不进入移动", g3.phase === "roll" && g3.voided === true);
check("第三次 6 后换人", g3.turn === 1, `turn=${g3.turn}`);
eq("连续计数清零", g3.players[0]!.sixStreak, 0);

console.log("精确抵达终点");
const g4 = twoPlayer();
const green4 = g4.players[0]!;
green4.planes[0]!.step = GOAL_STEP - 3;
eq("差 3 格掷 3 可到终点", legalMoves(g4, green4, 3).filter((m) => m.planeIndex === 0).length, 1);
eq("差 3 格掷 4 不可动", legalMoves(g4, green4, 4).filter((m) => m.planeIndex === 0).length, 0);
const finish = resolveMove(g4, green4, legalMoves(g4, green4, 3).find((m) => m.planeIndex === 0)!);
check("抵达终点有事件", finish.events.includes("抵达终点"));

console.log("撞机与安全格");
const g5 = twoPlayer();
const green5 = g5.players[0]!;
const red5 = g5.players[1]!;
// 让绿机落在环线 0（蓝格），红机也放同一格
green5.planes[0]!.step = (0 - START_INDEX.green + 52) % 52;
red5.planes[0]!.step = 0 >= START_INDEX.red ? 0 - START_INDEX.red + 52 : 0;
const sameCell = ringIndexAt("green", green5.planes[0]!.step);
red5.planes[0]!.step = sameCell! - START_INDEX.red >= 0 ? sameCell! - START_INDEX.red : sameCell! - START_INDEX.red + 52;
const g5move = { planeIndex: 1, toStep: green5.planes[0]!.step, path: [], events: [], captured: [] };
// 直接验证撞机判定（不安全格）
const landIndex = ringIndexAt("green", g5move.toStep)!;
const safeList = [7, 20, 33, 46, 9, 22, 35, 48];
if (!safeList.includes(landIndex)) {
  const resolved = resolveMove(g5, green5, g5move);
  check("落在敌机格会击落", resolved.captured.length === 1, `captured=${resolved.captured.length}`);
}

// 安全格豁免
const g6 = twoPlayer();
const green6 = g6.players[0]!;
const red6 = g6.players[1]!;
green6.planes[1]!.step = 0; // 绿起飞格 = 环线 46（安全格）
red6.planes[0]!.step = (46 - START_INDEX.red + 52) % 52; // 红机停在同一格
const safeResolved = resolveMove(g6, green6, { planeIndex: 1, toStep: 0, path: [], events: [], captured: [] });
eq("安全格上不击落", safeResolved.captured.length, 0);

console.log("捷径");
const g7 = twoPlayer();
const green7 = g7.players[0]!;
// 让绿机停在"再走 1 格就到捷径格"的位置：捷径按环线格号判定，所以要用 SHORTCUT_STEP 换算。
green7.planes[0]!.step = SHORTCUT_STEP.green - 1;
const shortMove = legalMoves(g7, green7, 1).find((m) => m.planeIndex === 0)!;
const shortResolved = resolveMove(g7, green7, shortMove);
eq("捷径跳到 +12", shortResolved.toStep, SHORTCUT_STEP.green + 12);
check("捷径有事件", shortResolved.events.includes("触发捷径"));

console.log("获胜");
const g8 = twoPlayer();
const green8 = g8.players[0]!;
green8.planes.forEach((plane, i) => { plane.step = i === 3 ? GOAL_STEP - 1 : GOAL_STEP; });
let g8s = afterRoll(g8, 1);
g8s = applyMove(g8s, legalMoves(g8s, currentPlayer(g8s), 1).find((m) => m.planeIndex === 3)!);
eq("四架到终点即获胜", g8s.winner, "green");
eq("获胜后阶段为 over", g8s.phase, "over");

console.log("无合法移动自动跳过");
const g9 = twoPlayer();
const p9 = currentPlayer(g9);
p9.planes.forEach((plane) => { plane.step = -1; });
const g9s = afterRoll(g9, 3);
check("无合法移动直接换人", g9s.turn === 1 && g9s.phase === "roll");
check("提示跳过", g9s.event.includes("跳过"), g9s.event);

console.log("AI 不污染状态");
const g10 = twoPlayer();
const before = JSON.stringify(g10);
const player10 = currentPlayer(g10);
resolveMove(g10, player10, { planeIndex: 0, toStep: 0, path: [], events: [], captured: [] });
eq("resolveMove 不改状态", JSON.stringify(g10), before);

console.log(`\n${checks - failures}/${checks} 通过`);
if (failures > 0) process.exit(1);
