import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The client build. The dev server proxies the socket and the API to the game server once it exists; until then the page
 * runs a local session, so the proxy is harmless.
 */
export default defineConfig({
  root: "src/client",
  // Served beside the other games on the game suite's origin, so its assets must not collide with the SPA's /assets/.
  base: "/monopoly/",
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true },
      "/api": "http://localhost:3000"
    }
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true
  }
});
