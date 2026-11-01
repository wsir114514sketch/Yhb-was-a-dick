#!/usr/bin/env bash
# 替换 3000 主服务的前端与服务端，并重启 uno-game.service。
# 备份已由部署流程在 .layudown-backups/<STAMP>/ 下做好；这里只做替换与重启。
set -Eeuo pipefail

APP_DIR=/opt/LayUDown-Game-Suite
ARCHIVE=/tmp/uno-deploy.tar.gz
STAMP=$(date +%Y%m%d-%H%M%S)
UNPACK=/tmp/uno-unpack

[[ -f "$ARCHIVE" ]] || { echo "archive missing: $ARCHIVE" >&2; exit 1; }

# 有对局在进行时不重启：计划 §C3 要求选低峰并确认房间数。
ROOMS=$(curl -s --max-time 5 http://127.0.0.1:3000/api/health | sed -n 's/.*"rooms":\([0-9]*\).*/\1/p')
if [[ -z "$ROOMS" ]]; then echo "health check failed" >&2; exit 1; fi
if [[ "$ROOMS" != "0" ]]; then echo "refusing to restart with $ROOMS room(s) in progress" >&2; exit 1; fi

rm -rf "$UNPACK"
install -d -m 0755 "$UNPACK"
tar -xzf "$ARCHIVE" -C "$UNPACK"
[[ -f "$UNPACK/dist/server/index.js" && -f "$UNPACK/dist/client/index.html" ]] || { echo "archive incomplete" >&2; exit 1; }

cp -a "$APP_DIR/server/index.js" "$APP_DIR/server/index.js.prev-$STAMP"
cp -a "$APP_DIR/client" "$APP_DIR/client.prev-$STAMP"
cp -a "$UNPACK/dist/server/index.js" "$APP_DIR/server/index.js"
cp -a "$UNPACK/dist/server/shogi-index.js" "$APP_DIR/server/shogi-index.js"
rm -rf "$APP_DIR/client"
cp -a "$UNPACK/dist/client" "$APP_DIR/client"
chown -R uno-game:uno-game "$APP_DIR/server/index.js" "$APP_DIR/server/shogi-index.js" "$APP_DIR/client"

systemctl restart uno-game.service
sleep 3

echo "--- health after restart ---"
curl -fsS http://127.0.0.1:3000/api/health; echo
echo "--- monopoly module ---"
curl -fsS http://127.0.0.1:3000/api/monopoly/health; echo
echo "--- process start time vs file mtime ---"
systemctl show uno-game.service -p ActiveEnterTimestamp --value
stat -c '%y %n' "$APP_DIR/server/index.js"
echo "previous build kept at: $APP_DIR/server/index.js.prev-$STAMP and $APP_DIR/client.prev-$STAMP"