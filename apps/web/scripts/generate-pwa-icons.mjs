// Generates the PWA manifest icons (192/512, any + maskable) from the
// master icon at apps/web/public/icon.png. Hooked into the web app's
// `prebuild` and `predev` npm scripts so Vite picks them up via its
// public/ → dist/ copy step.
//
// The four generated PNGs are listed in .gitignore — only the master
// icon and this script are tracked.
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public"
);
const SOURCE = path.join(PUBLIC_DIR, "icon.png");

// Pads the source so the artwork sits inside a circular safe zone (12.5%
// margin per the maskable spec) — keeps the shield visible when Android
// launchers crop to a circle.
async function maskable(size) {
  const inner = Math.round(size * 0.75);
  const padding = Math.round((size - inner) / 2);
  const resized = await sharp(SOURCE)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, top: padding, left: padding }])
    .png();
}

async function plain(size) {
  return sharp(SOURCE)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png();
}

const targets = [
  { name: "icon-192.png", pipe: () => plain(192) },
  { name: "icon-512.png", pipe: () => plain(512) },
  { name: "icon-maskable-192.png", pipe: () => maskable(192) },
  { name: "icon-maskable-512.png", pipe: () => maskable(512) },
];

await Promise.all(
  targets.map(async ({ name, pipe }) => {
    const out = path.join(PUBLIC_DIR, name);
    await (await pipe()).toFile(out);
    // eslint-disable-next-line no-console
    console.log(`[pwa-icons] wrote ${out}`);
  })
);
