#!/usr/bin/env node
/**
 * A local reverse proxy to the LIVE LayUDown site, so the deployed pages can be opened in the in-app Browser
 * (which cannot attach to a remote URL directly). It forwards everything to https://layudown.cn and keeps the
 * Host header, so the site's own routing and the /monopoly/ location behave exactly as they do in production.
 */
import http from "node:http";
import https from "node:https";

const port = 4182;
const upstream = { host: "layudown.cn", port: 443 };

const server = http.createServer((request, response) => {
  const upstreamRequest = https.request(
    {
      host: upstream.host,
      port: upstream.port,
      method: request.method,
      path: request.url,
      servername: upstream.host,
      rejectUnauthorized: false,
      headers: { ...request.headers, host: upstream.host }
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    }
  );
  upstreamRequest.on("error", (error) => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(`upstream error: ${error.message}`);
  });
  request.pipe(upstreamRequest);
});

server.on("upgrade", (request, socket, head) => {
  const upstreamRequest = https.request({
    host: upstream.host,
    port: upstream.port,
    method: request.method,
    path: request.url,
    servername: upstream.host,
    rejectUnauthorized: false,
    headers: { ...request.headers, host: upstream.host }
  });
  upstreamRequest.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(upstreamResponse.headers).map(([key, value]) => `${key}: ${value}\r\n`).join("") +
        "\r\n"
    );
    if (upstreamHead?.length) socket.write(upstreamHead);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });
  upstreamRequest.on("error", () => socket.destroy());
  upstreamRequest.end();
});

server.listen(port, "127.0.0.1", () => console.log(`live proxy on http://127.0.0.1:${port}`));