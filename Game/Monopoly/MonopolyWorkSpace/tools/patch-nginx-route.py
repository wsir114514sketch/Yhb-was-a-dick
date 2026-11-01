"""把 /monopoly 从「Nginx 直接发静态文件」改回计划的承载方式：转发到 3000 主服务。

计划 §A3 / §C1 规定 /monopoly 返回共享 SPA 的 index.html，由主服务处理路由与 Socket.IO。
之前部署的独立静态站点（alias 到 /opt/LayUDown-Game-Suite/monopoly/）与此不符，这里替换掉；
两个配置文件（HTTP 站点与 HTTP/HTTPS 共用 snippet）同步修改。
"""

targets = [
    "/etc/nginx/snippets/layudown-locations.conf",
    "/etc/nginx/conf.d/layudown-gamesuite.conf",
]

old = """# 大富翁：纯静态客户端（对局引擎与 AI 均在浏览器内运行），直接由 Nginx 从磁盘提供。
# 构建产物带 /monopoly/ 前缀引用资源，所以 location 与目录名必须一致。
location = /monopoly {
    return 301 /monopoly/;
}

# 文件名带内容哈希，可以长期缓存；入口页每次回源校验，保证发布后立即生效。
location ^~ /monopoly/assets/ {
    alias /opt/LayUDown-Game-Suite/monopoly/assets/;
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location /monopoly/ {
    alias /opt/LayUDown-Game-Suite/monopoly/;
    index index.html;
    try_files $uri $uri/ /monopoly/index.html;
    add_header Cache-Control "no-cache";
}"""

new = """# 大富翁：按游戏接入规范（A3/C1），它是共享 SPA 的一个路由，页面与 WebSocket 都由 3000 主服务提供。
# Socket.IO 走同一个 /socket.io 通道（namespace /monopoly），下面已有的 /socket.io 块已经覆盖。
location /monopoly {
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
}"""

for path in targets:
    text = open(path, encoding="utf-8").read()
    if "location /monopoly {" in text:
        print("already patched:", path)
        continue
    if old not in text:
        print("PATTERN MISSING:", path)
        continue
    open(path, "w", encoding="utf-8").write(text.replace(old, new, 1))
    print("patched:", path)