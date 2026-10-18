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

const mottle = [new Wrap('lm-m0', 4), new Wrap('lm-m1', 9), new Wrap('lm-m2', 23), new Wrap('lm-m3', 64), new Wrap('lm-m4', 160)];
// Domain warps bend the veins so they wander and branch like cracks instead of following the lattice.
const warpX = [new Wrap('lm-wx0', 3), new Wrap('lm-wx1', 8), new Wrap('lm-wx2', 19)];
const warpY = [new Wrap('lm-wy0', 3), new Wrap('lm-wy1', 8), new Wrap('lm-wy2', 19)];
const veinA = new Wrap('lm-gold', 5);
const veinB = new Wrap('lm-gold2', 12);
const veinC = new Wrap('lm-violet', 6);
const veinD = new Wrap('lm-violet2', 15);
// Slow fade along each vein: it burns bright in places and thins out to nothing in others.
const fadeG = new Wrap('lm-fade-g', 7);
const fadeV = new Wrap('lm-fade-v', 6);

/** 0..1, peaking where a noise field crosses 0.5: thin wandering lines. */
const ridge = (n: number, width: number) => 1 - smooth(0, width, Math.abs(n - 0.5));
const wrap01 = (x: number) => ((x % 1) + 1) % 1;

const data = Buffer.alloc(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE;
    const v = y / SIZE;
    const wu = wrap01(u + (warpX[0]!.at(u, v) - 0.5) * 0.16 + (warpX[1]!.at(u, v) - 0.5) * 0.07 + (warpX[2]!.at(u, v) - 0.5) * 0.025);
    const wv = wrap01(v + (warpY[0]!.at(u, v) - 0.5) * 0.16 + (warpY[1]!.at(u, v) - 0.5) * 0.07 + (warpY[2]!.at(u, v) - 0.5) * 0.025);
    // Pearl stone: slow mottling with a fine grain on top.
    const m = mottle[0]!.at(u, v) * 0.34 + mottle[1]!.at(u, v) * 0.28 + mottle[2]!.at(u, v) * 0.2 + mottle[3]!.at(u, v) * 0.1 + mottle[4]!.at(u, v) * 0.08;
    const tone = 0.8 + (m - 0.5) * 0.3;
    let r = tone;
    let g = tone * 0.96;
    let b = tone * 0.9;
    const gFade = smooth(0.3, 0.62, fadeG.at(u, v));
    const vFade = smooth(0.38, 0.68, fadeV.at(u, v));
    const gv = Math.max(ridge(veinA.at(wu, wv), 0.014) * 0.95, ridge(veinB.at(wu, wv), 0.008) * 0.6) * gFade;
    const gh = Math.max(ridge(veinA.at(wu, wv), 0.07), ridge(veinB.at(wu, wv), 0.04)) * 0.3 * gFade;
    const vv = Math.max(ridge(veinC.at(wu, wv), 0.012) * 0.9, ridge(veinD.at(wu, wv), 0.007) * 0.55) * vFade;
    const vh = Math.max(ridge(veinC.at(wu, wv), 0.06), ridge(veinD.at(wu, wv), 0.035)) * 0.26 * vFade;
    r += (1.0 - r) * gh * 0.45;
    g += (0.78 - g) * gh * 0.45;
    b += (0.38 - b) * gh * 0.45;
    r += (0.7 - r) * vh * 0.45;
    g += (0.55 - g) * vh * 0.45;
    b += (1.0 - b) * vh * 0.45;
    r += (1.0 - r) * gv;
    g += (0.74 - g) * gv;
    b += (0.22 - b) * gv;
    r += (0.6 - r) * vv;
    g += (0.36 - g) * vv;
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
