/**
 * A two-client online smoke test: two real accounts, a real Socket.IO connection each, a real game played through the
 * server's namespace. It checks the things a unit test cannot: that the namespace accepts authenticated clients, that a
 * room can be created and joined, that a seat survives a reconnect, and that an action taken by one client is seen by the
 * other.
 *
 * Run against a server that already has 大富翁 mounted: `node scripts/monopoly-online-smoke.mjs [baseUrl]`.
 */
import { io } from "socket.io-client";

const base = process.argv[2] ?? "http://127.0.0.1:3199";
const failures = [];
const check = (ok, label, detail = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

const register = (name) => new Promise((resolve, reject) => {
  const socket = io(base, { transports: ["websocket"], reconnection: false, timeout: 8000 });
  const stamp = String(Date.now()).slice(-8) + Math.floor(Math.random() * 900 + 100);
  socket.on("connect", () => {
    socket.emit("auth_register", { username: `${name}${stamp}`.slice(0, 16), email: `${name}${stamp}@example.com`, password: "Test1234!" }, (result) => {
      socket.close();
      if (!result?.ok || !result.data) reject(new Error(result?.message ?? "register failed"));
      else resolve({ token: result.data.token, account: result.data.account });
    });
  });
  socket.on("connect_error", reject);
});

const connect = (token) => new Promise((resolve, reject) => {
  const socket = io(`${base}/monopoly`, { auth: { token }, transports: ["websocket"], reconnection: false, timeout: 8000 });
  const states = [];
  socket.on("monopoly:state", (state) => states.push(state));
  socket.on("connect", () => resolve({ socket, states }));
  socket.on("connect_error", (error) => reject(new Error(`monopoly connect_error: ${error.message}`)));
});

/** An event with no payload must pass its callback first, or socket.io takes it as the payload and no ack arrives. */
const ack = (socket, event, ...args) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ ok: false, error: "TIMEOUT" }), 8000);
  socket.emit(event, ...args, (result) => { clearTimeout(timer); resolve(result ?? { ok: false }); });
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log(`大富翁联机冒烟测试 → ${base}`);

// An unauthenticated client must be refused before it can sit down.
const anonymous = await new Promise((resolve) => {
  const socket = io(`${base}/monopoly`, { transports: ["websocket"], reconnection: false, timeout: 8000 });
  socket.on("connect", () => { socket.close(); resolve("connected"); });
  socket.on("connect_error", (error) => resolve(error.message));
});
check(anonymous === "AUTH_REQUIRED", "未登录连接被拒绝", String(anonymous));

const [first, second] = await Promise.all([register("mptA"), register("mptB")]);
const a = await connect(first.token);
const b = await connect(second.token);
check(a.socket.connected && b.socket.connected, "两个账号都能连上 /monopoly");

const created = await ack(a.socket, "monopoly:create", { maxPlayers: 2, allowSpectators: true });
check(created.ok && /^[A-Z2-9]{4}$/.test(created.roomCode ?? ""), "创建房间", JSON.stringify(created));
const code = created.roomCode;

const joined = await ack(b.socket, "monopoly:join", { roomCode: code });
check(joined.ok, "第二个账号加入房间", JSON.stringify(joined));

await wait(200);
const lobbyState = a.states.at(-1);
check(lobbyState?.players?.length === 2, "房主看到两名玩家", String(lobbyState?.players?.length));
check(b.states.at(-1)?.isHost === false, "加入者不是房主");

const ready = await ack(b.socket, "monopoly:ready", { ready: true });
check(ready.ok, "加入者准备", JSON.stringify(ready));
await wait(150);
check(a.states.at(-1)?.startAllowed === true, "全员就绪后房主可以开始");

const started = await ack(a.socket, "monopoly:start");
check(started.ok, "房主开始对局", JSON.stringify(started));
await wait(300);
const gameA = a.states.at(-1)?.game;
const gameB = b.states.at(-1)?.game;
check(!!gameA && !!gameB, "双方都收到了对局状态");
check(gameA?.order?.length === 2, "对局有两名玩家", String(gameA?.order?.length));
check(gameA?.clock?.day === 0 && gameA?.clock?.minute === 480, "游戏时钟从第 0 天 08:00 开始", JSON.stringify(gameA?.clock));
check(Array.isArray(gameA?.ledger), "对局状态携带银行账本");
check(gameA?.players?.every((player) => player.bank && player.bank.principal === 0), "每位玩家都有贷款账户");

// 暂停权归房主：加入者的请求被拒绝，房主的暂停/恢复双方都看得到。
const guestPause = await ack(b.socket, "monopoly:action", { type: "pauseClock" });
check(guestPause.ok === false, "非房主不能暂停游戏时钟", JSON.stringify(guestPause));
const paused = await ack(a.socket, "monopoly:action", { type: "pauseClock" });
check(paused.ok, "房主暂停游戏时钟", JSON.stringify(paused));
await wait(200);
check(b.states.at(-1)?.game?.clock?.paused === true, "加入者看到时钟已暂停");
const resumedClock = await ack(a.socket, "monopoly:action", { type: "resumeClock" });
await wait(200);
check(resumedClock.ok && b.states.at(-1)?.game?.clock?.paused === false, "恢复游戏时钟", JSON.stringify(resumedClock));

// 银行贷款：到账、记账本、同一请求编号只受理一次。
const loan = await ack(a.socket, "monopoly:action", { type: "takeLoan", amount: 500, requestId: "smoke-loan-1" });
check(loan.ok, "申请 $500 贷款", JSON.stringify(loan));
await wait(200);
const hostState = a.states.at(-1)?.game;
const hostPlayer = hostState?.players?.find((player) => player.id === first.account.id);
check(hostPlayer?.bank?.principal === 500, "贷款本金记入账户", JSON.stringify(hostPlayer?.bank));
check(!!hostState?.ledger?.some((entry) => entry.kind === "loan" && entry.amount === 500), "账本记录了这笔贷款");
const duplicate = await ack(a.socket, "monopoly:action", { type: "takeLoan", amount: 500, requestId: "smoke-loan-1" });
check(duplicate.ok === false && duplicate.error === "DUPLICATE_REQUEST", "重复提交被拒绝", JSON.stringify(duplicate));

// The first player rolls; the other client must see it without asking.
const firstId = gameA?.order?.[gameA.turnIndex];
const roller = firstId === first.account.id ? a : b;
const watcher = roller === a ? b : a;
const before = watcher.states.at(-1)?.game?.log?.length ?? 0;
const rolled = await ack(roller.socket, "monopoly:action", { type: "roll" });
check(rolled.ok, "先手掷骰", JSON.stringify(rolled));
await wait(300);
const after = watcher.states.at(-1)?.game?.log?.length ?? 0;
check(after > before, "对手收到了掷骰后的状态", `${before} → ${after}`);

// A refused action must come back as a code, not as a state change.
const outOfTurn = roller === a ? b : a;
const refused = await ack(outOfTurn.socket, "monopoly:action", { type: "roll" });
check(refused.ok === false, "非当前回合的操作被拒绝", JSON.stringify(refused));

// A reconnect with the same token lands back in the same seat.
roller.socket.close();
await wait(300);
const reconnected = await connect(roller === a ? first.token : second.token);
const resumed = await ack(reconnected.socket, "monopoly:rejoin", { roomCode: code });
check(resumed.ok, "重连后回到原房间", JSON.stringify(resumed));
await wait(300);
check(!!reconnected.states.at(-1)?.game, "重连后拿回了对局状态");

const listed = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 4000);
  reconnected.socket.on("monopoly:rooms", (rooms) => { clearTimeout(timer); resolve(rooms); });
  reconnected.socket.emit("monopoly:rooms:request");
});
check(Array.isArray(listed) && listed.some((room) => room.code === code), "房间出现在房间列表里");

a.socket.close(); b.socket.close(); reconnected.socket.close();

if (failures.length) {
  console.error(`\n${failures.length} 项失败：`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("\n全部通过。");