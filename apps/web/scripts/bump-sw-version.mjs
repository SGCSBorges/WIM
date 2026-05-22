#!/usr/bin/env node
// Stamp the built service worker with a fresh CACHE_VERSION so each
// deploy invalidates installed PWAs.
//
// Runs as part of `vite build`'s post-step. Patches the literal
// `CACHE_VERSION = "wim-v1"` line in dist/sw.js with a timestamped
// version so the activate handler's diff-keys loop wipes the old cache
// and re-populates from the new build.
//
// We intentionally don't checksum the dist output — a timestamp is
// enough to guarantee every deploy is a fresh version, and avoids
// pulling in extra build dependencies.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const swPath = resolve(dirname(__filename), "..", "dist", "sw.js");

if (!existsSync(swPath)) {
  console.warn(
    `[bump-sw-version] ${swPath} not found — vite build did not run. Skipping.`
  );
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
const newVersion = `wim-${stamp}`;

const src = await readFile(swPath, "utf8");
const replaced = src.replace(
  /const\s+CACHE_VERSION\s*=\s*"[^"]+";/,
  `const CACHE_VERSION = "${newVersion}";`
);

if (replaced === src) {
  console.warn(
    "[bump-sw-version] CACHE_VERSION declaration not found — sw.js was not patched. Did the placeholder change?"
  );
  process.exit(0);
}

await writeFile(swPath, replaced, "utf8");
console.log(`[bump-sw-version] dist/sw.js stamped: ${newVersion}`);
