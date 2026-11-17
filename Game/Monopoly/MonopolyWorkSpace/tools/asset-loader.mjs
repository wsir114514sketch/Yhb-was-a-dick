/**
 * Loaders for `tsx tools/smoke.tsx`: Node has no import pipeline for images and no Vite to expand
 * `import.meta.glob`, so the smoke run would die on both. The image loader maps any image extension
 * to a URL string (what Vite hands the browser); the glob loader stubs `import.meta.glob` to return
 * an eager record of the city photos. Registered by tools/register-loader.mjs, wired into the
 * `smoke` npm script.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const IMAGE = /\.(webp|png|jpe?g|gif|svg|avif)$/;

export function resolve(specifier, context, next) {
  if (IMAGE.test(specifier)) {
    return { shortCircuit: true, url: `data:text/javascript,export default ${JSON.stringify(specifier)};` };
  }
  return next(specifier, context);
}

export function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith("photos.ts")) {
    // The real file, with the one Vite-only line (import.meta.glob) expanded to a plain record.
    const here = fileURLToPath(url);
    // photos.ts sits in src/client/, so its assets are siblings: <here>/assets/cities/.
    const dir = here.replace(/photos\.ts$/, "") + "assets/cities/";
    const entries = readdirSync(dir).filter((name) => name.endsWith(".jpg"))
      .map((name) => [`./assets/cities/${name}`, `/src/client/assets/cities/${name}`]);
    const real = readFileSync(here, "utf8");
    const source = real
      .replace(new RegExp('const FILES = import\.meta\.glob\([^;]*\);'), `const FILES = Object.fromEntries(${JSON.stringify(entries)});`)
      // The short-circuit hands Node plain ESM, so the file's TS-only type syntax goes too:
      // the interface block, the two casts, and the two field-type annotations.
      .replace(/export interface TilePhoto \{[\s\S]*?\}\n/, "")
      .replace(" as Record<string, string>", "")
      .replace(/TILE_PHOTOS: Record<number, TilePhoto>/, "TILE_PHOTOS")
      .replace(/tilePhoto = \(index: number\): TilePhoto \| undefined/, "tilePhoto = (index)");
    return { shortCircuit: true, format: "module", source };
  }
  return next(url, context);
}

