"""把 /flying-chess 接入 Nginx：转发到 3000 主服务。

与 /monopoly 相同，飞行棋是共享 SPA 的一个路由；页面与 WebSocket 都由主服务提供，
Socket.IO 走已有的 /socket.io 通道（namespace /flying-chess），无需新增 location。

两个配置文件要同步修改：HTTP/HTTPS 共用的 snippet 与站点 conf。
脚本可重复执行；已存在 /flying-chess location 时直接跳过。
"""

targets = [
    "/etc/nginx/snippets/layudown-locations.conf",
    "/etc/nginx/conf.d/layudown-gamesuite.conf",
]

block = """# 飞行棋：共享 SPA 的一个路由，页面与 WebSocket 都由 3000 主服务提供。
# Socket.IO 走已有的 /socket.io 通道（namespace /flying-chess）。
location /flying-chess {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

"""

for path in targets:
    text = open(path, encoding="utf-8").read()
    if "location /flying-chess" in text:
        print("already patched:", path)
        continue
    marker = "location /monopoly"
    if marker not in text:
        print("PATTERN MISSING:", path)
        continue
    text = text.replace(marker, block + marker, 1)
    open(path, "w", encoding="utf-8").write(text)
    print("patched:", path)
