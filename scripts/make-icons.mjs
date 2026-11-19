// Draws the app icons (a suspension bridge on amber) as PNGs, without any image library:
// shapes are rasterised with 4×4 supersampling and written with node:zlib.
//
//   node scripts/make-icons.mjs
//
// The bridge is the toolbar's icon-bridge symbol (a 24-unit grid), so the icons match it.
// src/icons/icon.svg is the same drawing by hand.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const AMBER = [242, 178, 51];
const INK = [29, 39, 51];

/** Distance from p to the segment ab. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** The bridge as segments in the 24-unit grid: deck, towers, cable (a parabola), hangers. */
function bridgeSegments() {
  const segs = [[2, 16, 22, 16], [4, 16, 4, 9], [20, 16, 20, 9]];
  // the cable: quadratic from (4, 9) through control (12, 16) to (20, 9)
  const cable = (t) => [4 + 16 * t, 9 + 2 * 7 * t * (1 - t)];
  for (let i = 0; i < 32; i++) segs.push([...cable(i / 32), ...cable((i + 1) / 32)]);
  // hangers from the deck up to the cable
  for (const x of [8, 12, 16]) {
    const t = (x - 4) / 16;
    segs.push([x, 16, x, cable(t)[1]]);
  }
  return segs;
}

/**
 * @param {number} size - pixels
 * @param {{ maskable?: boolean }} options - maskable: full-bleed background, the drawing kept
 *   inside the middle 80% (the safe zone launchers crop to)
 */
function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const segs = bridgeSegments();
  // fit the drawing (x 2..22, y 9..16, so 20 × 7 units, centred on (12, 12.5)) into the icon
  const scale = (maskable ? 0.56 : 0.7) / 20;
  const half = 1.1; // stroke half-width, grid units
  const radius = maskable ? 0 : 0.22;
  const n = 4; // supersamples per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, ink = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const u = (x + (sx + 0.5) / n) / size, v = (y + (sy + 0.5) / n) / size;
          // rounded square
          const qx = Math.max(Math.abs(u - 0.5) - (0.5 - radius), 0), qy = Math.max(Math.abs(v - 0.5) - (0.5 - radius), 0);
          if (Math.hypot(qx, qy) > radius) continue;
          bg++;
          const gx = 12 + (u - 0.5) / scale, gy = 12.5 + (v - 0.5) / scale;
          if (segs.some(s => segmentDistance(gx, gy, ...s) <= half)) ink++;
        }
      }
      const total = n * n;
      const i = (y * size + x) * 4;
      const a = bg / total, k = bg ? ink / bg : 0;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(AMBER[c] * (1 - k) + INK[c] * k);
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0; // no filter
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = new URL("../src/icons/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, size, options] of [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, { maskable: true }], // iOS rounds the corners itself
]) {
  writeFileSync(new URL(name, dir), drawIcon(size, options));
  console.log(`src/icons/${name}`);
}
