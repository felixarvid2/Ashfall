/**
 * Procedural ground texture for the Core: pale, warm "Lumen matter" (polished pearl stone) with thin gold
 * and violet veins that the ground shader makes glow (`glow: 'lumen'` in GROUND_LOOK, gameRenderer.ts).
 * Free and deterministic (no generator, no budget): `npx tsx scripts/art/lumenMatter.ts` writes
 * public/assets/textures/ground/lumen_matter.webp, 1024 px and seamless (every noise lattice wraps).
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { Rng } from '../../src/core/rng';

const ROOT = new URL('../..', import.meta.url).pathname;
const SIZE = 1024;

/** Seamless value noise: a lattice of `period` cells that wraps at the texture edge. */
class Wrap {
  private readonly grid: Float32Array;
  constructor(seed: string, private readonly period: number) {
    const rng = new Rng(seed);
    this.grid = Float32Array.from({ length: period * period }, () => rng.next());
  }
  at(u: number, v: number): number {
    const p = this.period;
    const x = u * p;
    const y = v * p;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const g = (a: number, b: number) => this.grid[(((b % p) + p) % p) * p + (((a % p) + p) % p)]!;
    const top = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * sx;
    const bottom = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * sx;
    return top + (bottom - top) * sy;
  }
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const mottle = [new Wrap('lm-m0', 4), new Wrap('lm-m1', 9), new Wrap('lm-m2', 23), new Wrap('lm-m3', 64)];
// Domain warps bend the veins so they wander like cracks instead of following the lattice.
const warpX = new Wrap('lm-wx', 5);
const warpY = new Wrap('lm-wy', 5);
const goldVein = new Wrap('lm-gold', 6);
const goldVein2 = new Wrap('lm-gold2', 14);
const violetVein = new Wrap('lm-violet', 7);
const violetVein2 = new Wrap('lm-violet2', 17);

/** 0..1, peaking where a noise field crosses 0.5: thin wandering lines. */
const ridge = (n: number, width: number) => 1 - smooth(0, width, Math.abs(n - 0.5));

const data = Buffer.alloc(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE;
    const v = y / SIZE;
    const wu = (u + (warpX.at(u, v) - 0.5) * 0.06 + 1) % 1;
    const wv = (v + (warpY.at(u, v) - 0.5) * 0.06 + 1) % 1;
    // Pearl stone: slow mottling, a finer grain on top.
    const m = mottle[0]!.at(u, v) * 0.42 + mottle[1]!.at(u, v) * 0.3 + mottle[2]!.at(u, v) * 0.2 + mottle[3]!.at(u, v) * 0.08;
    const tone = 0.62 + (m - 0.5) * 0.36;
    let r = tone * 1.0;
    let g = tone * 0.93;
    let b = tone * 0.86;
    // Veins: gold is common, violet rarer; each has a sharp core and a soft halo that tints the stone.
    const gv = Math.max(ridge(goldVein.at(wu, wv), 0.018) * 0.9, ridge(goldVein2.at(wu, wv), 0.012) * 0.7);
    const gh = Math.max(ridge(goldVein.at(wu, wv), 0.08), ridge(goldVein2.at(wu, wv), 0.05)) * 0.35;
    const vv = Math.max(ridge(violetVein.at(wu, wv), 0.016) * 0.9, ridge(violetVein2.at(wu, wv), 0.011) * 0.65);
    const vh = Math.max(ridge(violetVein.at(wu, wv), 0.07), ridge(violetVein2.at(wu, wv), 0.045)) * 0.3;
    r += (1.0 - r) * gh * 0.5 - (r - 0.85) * 0.0;
    g += (0.8 - g) * gh * 0.5;
    b += (0.4 - b) * gh * 0.5;
    r += (0.62 - r) * vh * 0.5;
    g += (0.5 - g) * vh * 0.5;
    b += (1.0 - b) * vh * 0.5;
    r += (1.0 - r) * gv;
    g += (0.78 - g) * gv;
    b += (0.28 - b) * gv;
    r += (0.66 - r) * vv;
    g += (0.44 - g) * vv;
    b += (1.0 - b) * vv;
    const k = (y * SIZE + x) * 3;
    data[k] = Math.round(255 * Math.min(1, r));
    data[k + 1] = Math.round(255 * Math.min(1, g));
    data[k + 2] = Math.round(255 * Math.min(1, b));
  }
}

const out = join(ROOT, 'public', 'assets', 'textures', 'ground', 'lumen_matter.webp');
mkdirSync(dirname(out), { recursive: true });
await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ quality: 84 }).toFile(out);
console.log(`✓ ${out}`);
