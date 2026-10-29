# 五子棋 / 围棋规则引擎

两个互相独立的纯 TypeScript 模块，不依赖任何框架，状态都是可 JSON 序列化的普通数据。服务端按房间的 `mode` 选用其中一个，所有落子校验以服务端为准。

统一接口：`createGame / validateMove / applyMove / getResult / serialize`（另有 `resign`、`replay`、`deserialize`）。

## 五子棋 `src/gomokuEngine.ts`
- 15×15 或 19×19，黑先；自由规则下横竖斜五连及以上即胜，下满判和。
- 可选禁手（只限黑方）：三三、四四、长连；恰好五连优先于禁手。白方无禁手。禁手落点被拒绝，不判负。

## 围棋 `src/goEngine.ts`
- 9×9 / 13×13 / 19×19，黑先；先提对方无气的棋块，再判己方是否自杀（禁止）。
- 打劫：局面超级劫（positional superko）——记录历史上出现过的每个盘面，禁止重复其中任何一个，覆盖单劫和长循环。
- 终局：双方连续虚着进入点目。**简化版**：双方点击标记死子并各自确认，确认后自动数子；不做死活自动判断，任何一方可拒绝并继续对局。
- 计分：中国规则数子法（活子加只被一方围住的空点），白方加贴目（默认 7.5）。
- 认输随时可用。

## 测试
`Game/UNO/UNO WorkSpace/tests/unit/gomoku-engine.test.ts`、`go-engine.test.ts`（含围棋随机对局不变量检查）。
