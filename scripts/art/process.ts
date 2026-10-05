/**
 * npm run art:process — turns the generated art (assets-src/art/raw/) into game files under
 * public/assets/art/ and writes src/data/artFiles.ts listing what exists.
 *
 *  icon      256 px webp (item, aspect and passive icons sit on dark slots, black stays)
 *  portrait  512 px webp
 *  frame     256 px webp, black becomes transparent (the slot shows through the middle)
 *  decal     512 px webp, the chroma-key background becomes transparent, a sticker the generator
 *            drew underneath is cut off (`keep`), edges fade
 *  wide      1280 × 720 webp (region cards, menu art)
 *  map       1024 px webp
 *  texture   seam-fixed 1024 px ground texture into public/assets/textures/ground/
 *  vfx       left to scripts/vfx/pack.ts (the particle atlas)
 *
 * Processed copies are committed under public/; the raw images are not (regenerate with
 * npm run art:generate).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { ART, type ArtSpec } from './catalog';

const ROOT = new URL('../..', import.meta.url).pathname;
const RAW = join(ROOT, 'assets-src', 'art', 'raw');
const OUT = join(ROOT, 'public', 'assets', 'art');

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

async function rgba(file: string, w: number, h: number): Promise<Buffer> {
  return sharp(file).resize(w, h).removeAlpha().ensureAlpha().raw().toBuffer();
}

/** Black → transparent (premultiplied-looking ornaments on black). */
function blackToAlpha(px: Buffer): void {
  for (let i = 0; i < px.length; i += 4) {
    const m = Math.max(px[i]!, px[i + 1]!, px[i + 2]!) / 255;
    const a = Math.min(1, Math.max(0, (m - 0.06) / 0.25));
    px[i + 3] = Math.round(a * 255);
  }
}

/**
 * Chroma key: the background colour is read from the corners (the generator's "magenta" is often a
 * pink like #ec0158), alpha grows with the colour distance from it, and the key's tint is pulled
 * out of the edges.
 */
function chromaKey(px: Buffer, size: number, key: 'green' | 'magenta'): void {
  const samples: number[][] = [];
  for (const [cx, cy] of [[8, 8], [size - 9, 8], [8, size - 9], [size - 9, size - 9]]) {
    const i = (cy! * size + cx!) * 4;
    samples.push([px[i]!, px[i + 1]!, px[i + 2]!]);
  }
  const k = [0, 1, 2].map((c) => samples.map((s) => s[c]!).sort((a, b) => a - b)[1]! / 2 + samples.map((s) => s[c]!).sort((a, b) => a - b)[2]! / 2);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!;
    const g = px[i + 1]!;
    const b = px[i + 2]!;
    const d = Math.hypot(r - k[0]!, g - k[1]!, b - k[2]!) / 255;
    // Shaded background (same hue, darker) keys out too: compare chroma direction as well.
    const lean = key === 'green' ? g - Math.max(r, b) : Math.min(r, b) - g;
    const rel = lean / Math.max(24, r, g, b);
    const a = Math.min(smooth(0.18, 0.42, d), 1 - smooth(0.3, 0.5, rel));
    px[i + 3] = Math.round(a * 255);
    // Despill: cap the key channel(s) so edges don't glow green or pink.
    if (key === 'green') px[i + 1] = Math.min(g, Math.max(r, b) + 10);
    else {
      const cap = g + 25;
      px[i] = Math.min(r, Math.max(cap, b));
      px[i + 2] = Math.min(b, cap);
    }
  }
}

/** Clear everything below `keep` (share of the height): a sticker the model drew under the decal. */
function cutBelow(px: Buffer, size: number, keep: number): void {
  for (let y = Math.floor(size * keep); y < size; y++) for (let x = 0; x < size; x++) px[(y * size + x) * 4 + 3] = 0;
}

/** Fade alpha toward the edges so no square shows. */
function edgeFade(px: Buffer, w: number, h: number, edge = 0.06): void {
  for (let y = 0; y < h; y++) {
    const fy = smooth(0, edge, Math.min(y + 0.5, h - y - 0.5) / h);
    for (let x = 0; x < w; x++) {
      const f = fy * smooth(0, edge, Math.min(x + 0.5, w - x - 0.5) / w);
      const i = (y * w + x) * 4 + 3;
      px[i] = Math.round(px[i]! * f);
    }
  }
}

/** Cross-fade opposite edges so the texture tiles. */
function fixSeams(px: Buffer, size: number, band: number): void {
  const src = Buffer.from(px);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      const tx = dx < band ? 0.5 * (1 - dx / band) : 0;
      const ty = dy < band ? 0.5 * (1 - dy / band) : 0;
      if (!tx && !ty) continue;
      const i = (y * size + x) * 4;
      const ix = (y * size + (size - 1 - x)) * 4;
      const iy = ((size - 1 - y) * size + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(src[i + c]! * (1 - tx - ty) + src[ix + c]! * tx + src[iy + c]! * ty);
    }
  }
}

async function save(px: Buffer, w: number, h: number, file: string, quality = 85): Promise<void> {
  mkdirSync(dirname(file), { recursive: true });
  await sharp(px, { raw: { width: w, height: h, channels: 4 } }).webp({ quality, alphaQuality: 90 }).toFile(file);
}

async function processOne(spec: ArtSpec): Promise<string | null> {
  const raw = join(RAW, `${spec.key}.png`);
  if (!existsSync(raw)) return null;
  const out = join(OUT, `${spec.key}.webp`);
  switch (spec.kind) {
    case 'icon': {
      await sharp(raw).resize(256, 256).webp({ quality: 85 }).toFile((mkdirSync(dirname(out), { recursive: true }), out));
      return spec.key;
    }
    case 'portrait': {
      await sharp(raw).resize(512, 512).webp({ quality: 82 }).toFile((mkdirSync(dirname(out), { recursive: true }), out));
      return spec.key;
    }
    case 'frame': {
      const px = await rgba(raw, 256, 256);
      blackToAlpha(px);
      await save(px, 256, 256, out, 90);
      return spec.key;
    }
    case 'decal': {
      const px = await rgba(raw, 512, 512);
      chromaKey(px, 512, spec.chroma ?? 'green');
      if (spec.keep) cutBelow(px, 512, spec.keep);
      edgeFade(px, 512, 512, 0.08);
      await save(px, 512, 512, out, 85);
      return spec.key;
    }
    case 'wide': {
      await sharp(raw).resize(1280, 720).webp({ quality: 80 }).toFile((mkdirSync(dirname(out), { recursive: true }), out));
      return spec.key;
    }
    case 'map': {
      await sharp(raw).resize(1024, 1024).webp({ quality: 82 }).toFile((mkdirSync(dirname(out), { recursive: true }), out));
      return spec.key;
    }
    case 'texture': {
      const px = await rgba(raw, 1024, 1024);
      fixSeams(px, 1024, 40);
      const file = join(ROOT, 'public', 'assets', 'textures', 'ground', `${spec.key.split('/')[1]}.webp`);
      await sharp(px, { raw: { width: 1024, height: 1024, channels: 4 } }).removeAlpha().webp({ quality: 88 }).toFile(file);
      return null;
    }
    case 'vfx':
      return null;
  }
}

async function main(): Promise<void> {
  const done: string[] = [];
  for (const spec of ART) {
    const key = await processOne(spec);
    if (key) done.push(key);
  }
  done.sort();
  writeFileSync(
    join(ROOT, 'src', 'data', 'artFiles.ts'),
    `// Generated by scripts/art/process.ts — the painted art in public/assets/art/ (FLUX.2 Turbo).\n` +
      `export const ART_FILES: ReadonlySet<string> = new Set([\n${done.map((k) => `  '${k}',`).join('\n')}\n]);\n`,
  );
  console.log(`Processed ${done.length} images into public/assets/art/.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
