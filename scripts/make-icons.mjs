// Genera logo e icone (public/logo.png, public/icon-*.png, apple-touch-icon, src/app/icon.png, favicon.ico)
// dal logo originale scripts/assets/logo-source.jpg (sfondo bianco). Uso: node scripts/make-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const SOURCE = "scripts/assets/logo-source.jpg";
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

/** Rende trasparente il bianco collegato ai bordi (lo sfondo), lasciando intatti i bianchi interni al logo. */
async function cutout() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isBg = (i) => data[i] >= 235 && data[i + 1] >= 235 && data[i + 2] >= 235;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (!seen[p] && isBg(p * 4)) { seen[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let p = 0; p < w * h; p++) if (seen[p]) data[p * 4 + 3] = 0;
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return sharp(png).trim().png().toBuffer();
}

const logo = await cutout();
const meta = await sharp(logo).metadata();
console.log(`logo ritagliato: ${meta.width}x${meta.height}`);

/** Logo centrato su un quadrato; `ratio` = lato lungo del logo / lato dell'icona (le "maskable" lasciano più margine). */
async function square(size, ratio, background) {
  const inner = Math.round(size * ratio);
  const fitted = await sharp(logo).resize(inner, inner, { fit: "inside" }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: fitted, gravity: "center" }])
    .png()
    .toBuffer();
}

writeFileSync("public/logo.png", await sharp(logo).resize({ height: 360 }).png().toBuffer());
writeFileSync("public/icon-192.png", await square(192, 0.9, BG));
writeFileSync("public/icon-512.png", await square(512, 0.9, BG));
writeFileSync("public/icon-maskable-512.png", await square(512, 0.66, BG));
writeFileSync("public/apple-touch-icon.png", await square(180, 0.9, BG));
writeFileSync("src/app/icon.png", await square(256, 1, { r: 0, g: 0, b: 0, alpha: 0 }));

// favicon.ico con un solo PNG 48x48 incorporato.
const ico48 = await square(48, 1, { r: 0, g: 0, b: 0, alpha: 0 });
const head = Buffer.alloc(22);
head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 48; head[7] = 48; head.writeUInt16LE(1, 12); head.writeUInt16LE(32, 14);
head.writeUInt32LE(ico48.length, 14 + 4); head.writeUInt32LE(22, 18);
writeFileSync("src/app/favicon.ico", Buffer.concat([head, ico48]));
