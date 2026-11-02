import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: "src/client",
  build: { outDir: "../../dist/client", emptyOutDir: true },
  plugins: [react()],
  resolve: {
    alias: { "@game": path.resolve(process.cwd(), "src/game") }
  },
  server: { port: 5280 }
});
