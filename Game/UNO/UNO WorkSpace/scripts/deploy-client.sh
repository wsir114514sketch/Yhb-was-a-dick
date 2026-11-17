#!/usr/bin/env bash
# 用 /tmp/uno-unpack 里的新前端替换 /opt/LayUDown-Game-Suite/client，并保留一份带时间戳的备份。
set -Eeuo pipefail

APP_DIR=/opt/LayUDown-Game-Suite
ARCHIVE=/tmp/uno-client.tar.gz
STAMP=$(date +%Y%m%d-%H%M%S)
UNPACK=/tmp/uno-unpack

if [[ ! -f "$ARCHIVE" ]]; then
  echo "archive missing: $ARCHIVE" >&2
  exit 1
fi
if ! grep -q '"ok":true' < <(curl -s --max-time 5 http://127.0.0.1:3000/api/health); then
  echo "health check did not report ok" >&2
  exit 1
fi

rm -rf "$UNPACK"
install -d -m 0755 -o uno-game -g uno-game "$UNPACK"
tar -xzf "$ARCHIVE" -C "$UNPACK"
[[ -f "$UNPACK/index.html" ]] || { echo "unpacked archive has no index.html" >&2; exit 1; }

mv "$APP_DIR/client" "$APP_DIR/client.backup-$STAMP"
mv "$UNPACK" "$APP_DIR/client"
chown -R uno-game:uno-game "$APP_DIR/client"

echo "backup: $APP_DIR/client.backup-$STAMP"
ls -1 "$APP_DIR/client"