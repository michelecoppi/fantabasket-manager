// Genera le icone PWA (public/icon-*.png): palla da basket su sfondo scuro. Uso: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [10, 13, 20];
const BALL = [232, 106, 31];
const LINE = [10, 13, 20];

function crc32(buf) {
  let c, crc = ~0;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** `ballRatio`: diametro della palla / lato; le icone "maskable" lasciano più margine. */
function icon(size, ballRatio) {
  const r = (size * ballRatio) / 2, c = size / 2, w = Math.max(size * 0.018, 1.5);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      let col = BG;
      if (d <= r) {
        col = BALL;
        const seam = Math.abs(dx) < w || Math.abs(dy) < w || Math.abs(Math.hypot(dx - r * 1.05, dy) - r * 0.95) < w || Math.abs(Math.hypot(dx + r * 1.05, dy) - r * 0.95) < w;
        if (seam || d > r - w) col = LINE;
      }
      raw.set(col, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public", { recursive: true });
writeFileSync("public/icon-192.png", icon(192, 0.8));
writeFileSync("public/icon-512.png", icon(512, 0.8));
writeFileSync("public/icon-maskable-512.png", icon(512, 0.56));
writeFileSync("public/apple-touch-icon.png", icon(180, 0.8));
