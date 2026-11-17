#!/usr/bin/env node
/**
 * Serves the built client (`dist/client`) and proxies the API and Socket.IO to the UNO server on 3100,
 * so the production bundle can be exercised in the browser the way the real deployment serves it.
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd(), "dist/client");
const port = 4181;
const upstream = { host: "127.0.0.1", port: 3100 };

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

const proxyRequest = (request, response) => {
  const upstreamRequest = http.request({
    host: upstream.host,
    port: upstream.port,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: `${upstream.host}:${upstream.port}` }
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstreamRequest.on("error", () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.pipe(upstreamRequest);
};

const proxyUpgrade = (request, socket, head) => {
  const upstreamRequest = http.request({
    host: upstream.host,
    port: upstream.port,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: `${upstream.host}:${upstream.port}` }
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
};

const server = http.createServer(async (request, response) => {
  if (request.url?.startsWith("/socket.io") || request.url?.startsWith("/api/")) {
    proxyRequest(request, response);
    return;
  }
  const relative = path.normalize(decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname)).replace(/^([/\\])+/, "");
  let filePath = path.join(root, relative);
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(root, "index.html");
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": TYPES[path.extname(filePath)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.on("upgrade", proxyUpgrade);
server.listen(port, "127.0.0.1", () => console.log(`built client on http://127.0.0.1:${port}`));