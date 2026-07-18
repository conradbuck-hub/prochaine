#!/usr/bin/env node
// PWA icon generator — the line-disc "P" over a four-colour band on
// signage black, per docs/BRAND.md. Written directly as PNG bytes so no
// image-processing dependency is needed for two static icons.

import { deflateSync } from "node:zlib";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SIGNAGE_BLACK = [0x0e, 0x0f, 0x11];
const LINE_GREEN = [0x00, 0x8e, 0x5b];
const LINE_ORANGE = [0xef, 0x81, 0x22];
const LINE_YELLOW = [0xff, 0xd9, 0x00];
const LINE_BLUE = [0x00, 0x83, 0xca];
const WHITE = [0xf7, 0xf7, 0xf5];

// 5x7 block bitmap for "P" — the wordmark's first disc letter (green, per
// the g→o→y→b cycle: P=green).
const GLYPH_P = [
  "11110",
  "10001",
  "10001",
  "11110",
  "10000",
  "10000",
  "10000",
];

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function isInDisc(x, y, cx, cy, radius) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function isInGlyph(x, y, cx, cy, glyphSize) {
  const rows = GLYPH_P.length;
  const cols = GLYPH_P[0].length;
  const cellW = glyphSize / cols;
  const cellH = glyphSize / rows;
  const left = cx - glyphSize / 2;
  const top = cy - glyphSize / 2;
  const col = Math.floor((x - left) / cellW);
  const row = Math.floor((y - top) / cellH);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
  return GLYPH_P[row][col] === "1";
}

function bandColorAt(x, size) {
  const segment = Math.floor((x / size) * 4);
  return [LINE_GREEN, LINE_ORANGE, LINE_YELLOW, LINE_BLUE][Math.min(segment, 3)];
}

// Disc fill is green, so the "P" glyph is white-on-green (only a yellow
// disc fill would need dark text, per docs/BRAND.md).
function pixelColor(x, y, size) {
  const discRadius = size * 0.28;
  const discCx = size / 2;
  const discCy = size * 0.42;
  const bandTop = size * 0.78;
  const bandBottom = size * 0.92;

  if (isInDisc(x, y, discCx, discCy, discRadius)) {
    if (isInGlyph(x, y, discCx, discCy, discRadius * 1.15)) return WHITE;
    return LINE_GREEN;
  }
  if (y >= bandTop && y < bandBottom) {
    return bandColorAt(x, size);
  }
  return SIGNAGE_BLACK;
}

function buildIconPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelColor(x, y, size);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  const outDir = fileURLToPath(new URL("../public/icons/", import.meta.url));
  await mkdir(outDir, { recursive: true });
  for (const size of [192, 512]) {
    await writeFile(`${outDir}icon-${size}.png`, buildIconPng(size));
    console.log(`Wrote icon-${size}.png`);
  }
}

main();
