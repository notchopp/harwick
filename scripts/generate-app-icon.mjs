import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "../apps/web/public/harwick-gemini-logo.png");
const OUT = join(__dirname, "../apps/web/public/app-icon-1024.png");

const SIZE = 1024;
const BG = { r: 10, g: 11, b: 11 };
const GLYPH_FRACTION = 0.62;

const source = sharp(SRC);
const trimmed = await source.trim().toBuffer({ resolveWithObject: true });
const trimmedW = trimmed.info.width;
const trimmedH = trimmed.info.height;
const longest = Math.max(trimmedW, trimmedH);
const targetGlyph = Math.round(SIZE * GLYPH_FRACTION);
const scale = targetGlyph / longest;
const newW = Math.round(trimmedW * scale);
const newH = Math.round(trimmedH * scale);

const resized = await sharp(trimmed.data).resize(newW, newH).png().toBuffer();

const canvas = await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 3,
    background: BG,
  },
})
  .composite([
    {
      input: resized,
      left: Math.round((SIZE - newW) / 2),
      top: Math.round((SIZE - newH) / 2),
    },
  ])
  .png()
  .toBuffer();

writeFileSync(OUT, canvas);
console.log(`Wrote ${OUT}`);
console.log(`Glyph size: ${newW}x${newH} on ${SIZE}x${SIZE} ink canvas`);
