#!/usr/bin/env node
// One-off generator for the PWA icons — a flat ink-square background with
// the brand's chevron mark (see docs/BRAND.md), written directly as PNG
// bytes so no image-processing dependency is needed for two static icons.

import { deflateSync } from "node:zlib";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const INK = [0x14, 0x18, 0x1c];
const CHEVRON = [0xd9, 0x63, 0x1e];

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

// Point-in-triangle test for a chevron: a right-pointing triangle inscribed
// in the square's middle third, matching the departure-bubble mark in the
// brand guide.
function isInChevron(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const half = size * 0.22;
  const tipX = cx + half;
  const baseX = cx - half;
  const topY = cy - half;
  const botY = cy + half;
  if (x < baseX || x > tipX) return false;
  const t = (x - baseX) / (tipX - baseX); // 0 at base, 1 at tip
  const halfHeightAtX = (half) * (1 - t);
  return Math.abs(y - cy) <= halfHeightAtX;
}

function buildIconPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = isInChevron(x, y, size) ? CHEVRON : INK;
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
