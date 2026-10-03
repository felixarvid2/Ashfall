import type { GroundPatch } from '../data/zones/testArena';
import { Rng } from '../core/rng';

/**
 * Weights for the ground shader (pure, so tests can run it): one RGBA texel per cell over the
 * ground plane. R, G and B hold how much of overlay layer 0, 1 and 2 shows; A is a slow noise the
 * shader uses to break up the base texture's repeat. Row 0 is the plane's -z edge.
 */
export function buildGroundSplat(patches: GroundPatch[], extent: number, res: number, seed: string): Uint8Array {
  const data = new Uint8Array(res * res * 4);
  const cell = extent / res;
  const ragged = new ValueNoise(`${seed}-edge`, 64);
  const slow = new ValueNoise(`${seed}-variation`, 64);
  const half = extent / 2;
  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * cell;
    for (let i = 0; i < res; i++) {
      const x = -half + (i + 0.5) * cell;
      data[(j * res + i) * 4 + 3] = Math.round(255 * smooth(0.35, 0.65, slow.fbm(x / 70, z / 70)));
    }
  }
  for (const p of patches) {
    // Ragged edges: the noise pushes the border in and out by up to a quarter of the radius.
    const rough = Math.max(2.5, p.radius * 0.25);
    const fade = Math.max(1.5, p.radius * 0.2);
    const reach = p.radius + rough;
    const strength = p.strength ?? 1;
    const i0 = Math.max(0, Math.floor((p.x - reach + half) / cell));
    const i1 = Math.min(res - 1, Math.ceil((p.x + reach + half) / cell));
    const j0 = Math.max(0, Math.floor((p.z - reach + half) / cell));
    const j1 = Math.min(res - 1, Math.ceil((p.z + reach + half) / cell));
    const scale = Math.max(6, p.radius * 0.6);
    for (let j = j0; j <= j1; j++) {
      const z = -half + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = -half + (i + 0.5) * cell;
        const d = Math.hypot(x - p.x, z - p.z) + (ragged.fbm(x / scale, z / scale) - 0.5) * 2 * rough;
        const w = Math.min(1, Math.max(0, (p.radius - d) / fade)) * strength;
        const k = (j * res + i) * 4 + p.layer;
        data[k] = Math.max(data[k]!, Math.round(w * 255));
      }
    }
  }
  return data;
}

function smooth(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Tiling value noise in [0, 1] with a few octaves. */
class ValueNoise {
  private readonly grid: Float32Array;
  constructor(seed: string, private readonly n: number) {
    const rng = new Rng(seed);
    this.grid = Float32Array.from({ length: n * n }, () => rng.next());
  }
  private at(x: number, z: number): number {
    const n = this.n;
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const fx = x - xi;
    const fz = z - zi;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const g = (a: number, b: number) => this.grid[(((b % n) + n) % n) * n + (((a % n) + n) % n)]!;
    const top = g(xi, zi) + (g(xi + 1, zi) - g(xi, zi)) * sx;
    const bottom = g(xi, zi + 1) + (g(xi + 1, zi + 1) - g(xi, zi + 1)) * sx;
    return top + (bottom - top) * sz;
  }
  fbm(x: number, z: number): number {
    return (this.at(x, z) * 0.6 + this.at(x * 2.1 + 17, z * 2.1 + 31) * 0.3 + this.at(x * 4.3 + 5, z * 4.3 + 11) * 0.1);
  }
}
