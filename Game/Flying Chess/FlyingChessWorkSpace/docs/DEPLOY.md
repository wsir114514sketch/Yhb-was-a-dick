# 飞行棋部署说明

飞行棋不是独立站点，按游戏接入规范并入 3000 主服务：

- 服务端模块：`registerFlyingChess(app, io, deps)`（`src/server/index.ts`），在 `Game/UNO/UNO WorkSpace/server/app.ts` 注册。
- Socket.IO namespace：`/flying-chess`，复用同一个 `/socket.io` 通道。
- 账号：复用站点 `auth.verifyToken`，不写新的账号文件。
- 数据：`<UNO_DATA_DIR>/flying-chess/`，生产上是 `/opt/LayUDown-Game-Suite/data/flying-chess/`（属主 `uno-game`）。
- 前端：编进共享 SPA（`@flying-chess` 别名），路由 `/flying-chess`。

## 1. 本地构建

```bash
cd "Game/UNO/UNO WorkSpace"
npm run typecheck
npm test
npm run build
```

`npm run build` 产出 `dist/client` 与 `dist/server/index.js`（已包含飞行棋服务端）。

## 2. 打包与上传

```bash
cd "Game/UNO/UNO WorkSpace"
STAMP=$(date +%Y%m%d-%H%M%S)
tar -czf /tmp/uno-deploy.tar.gz dist
scp -i ~/.ssh/id_ed25519_47_100_174_241 /tmp/uno-deploy.tar.gz admin@47.100.174.241:/tmp/
```

## 3. 服务器上替换（`admin` 有免密 sudo）

```bash
sudo bash -s <<'SH'
set -Eeuo pipefail
APP=/opt/LayUDown-Game-Suite
STAMP=$(date +%Y%m%d-%H%M%S)
ROOMS=$(curl -s --max-time 5 http://127.0.0.1:3000/api/health | sed -n 's/.*"rooms":\([0-9]*\).*/\1/p')
[ -n "$ROOMS" ] || { echo "health check failed"; exit 1; }
[ "$ROOMS" = "0" ] || { echo "有 $ROOMS 个对局在进行，先等结束"; exit 1; }

rm -rf /tmp/uno-unpack && mkdir -p /tmp/uno-unpack
tar -xzf /tmp/uno-deploy.tar.gz -C /tmp/uno-unpack
[ -f /tmp/uno-unpack/dist/server/index.js ] || { echo "archive incomplete"; exit 1; }

mkdir -p "$APP/.layudown-backups/$STAMP"
cp -a "$APP/server/index.js" "$APP/.layudown-backups/$STAMP/server-index.js"
cp -a "$APP/client" "$APP/.layudown-backups/$STAMP/client"
cp -a /tmp/uno-unpack/dist/server/index.js "$APP/server/index.js"
cp -a /tmp/uno-unpack/dist/server/shogi-index.js "$APP/server/shogi-index.js"
rm -rf "$APP/client"
cp -a /tmp/uno-unpack/dist/client "$APP/client"
chown -R uno-game:uno-game "$APP/server/index.js" "$APP/server/shogi-index.js" "$APP/client"
systemctl restart uno-game.service
sleep 3
curl -fsS http://127.0.0.1:3000/api/health; echo
curl -fsS http://127.0.0.1:3000/api/flying-chess/health; echo
systemctl show uno-game.service -p ActiveEnterTimestamp --value
SH
```

## 4. Nginx

```bash
sudo python3 /tmp/patch-nginx-route.py
sudo nginx -t && sudo systemctl reload nginx
```

脚本会同时改：

- `/etc/nginx/snippets/layudown-locations.conf`
- `/etc/nginx/conf.d/layudown-gamesuite.conf`

两处都要有 `location /flying-chess { proxy_pass http://127.0.0.1:3000; ... }`；Socket.IO 复用已有的 `/socket.io` 块。

## 5. 回滚

```bash
sudo bash -s <<'SH'
set -Eeuo pipefail
APP=/opt/LayUDown-Game-Suite
STAMP=<备份时间戳>
cp -a "$APP/.layudown-backups/$STAMP/server-index.js" "$APP/server/index.js"
rm -rf "$APP/client"
cp -a "$APP/.layudown-backups/$STAMP/client" "$APP/client"
chown -R uno-game:uno-game "$APP/server/index.js" "$APP/client"
systemctl restart uno-game.service
SH
```

Nginx 回滚：把新增的 `location /flying-chess` 删掉，`nginx -t` 后 reload。房间数据在 `data/flying-chess/`，回滚代码不会自动删除；确认不再需要后手动清理。

## 6. 验证

- `curl http://127.0.0.1:3000/api/flying-chess/health` 返回 `{"ok":true,...}`。
- 浏览器打开 `https://layudown.cn/flying-chess`，创建房间、把房号发给另一个账号，双方准备后开局。
- 刷新页面应回到原座位；好友列表显示"正在游玩 飞行棋"并可点击观战。
- 原有 UNO / UNION ARENA / 本将棋 / 大富翁 / OpenClaw 不应受影响；本次只增量注册 namespace 与路由。
