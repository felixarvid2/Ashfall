import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data/zones';
import { buildGroundSplat, groundSplatCached } from '../src/render/groundSplat';

const texel = (data: Uint8Array, res: number, extent: number, x: number, z: number, channel: number) => {
  const i = Math.floor((x + extent / 2) / (extent / res));
  const j = Math.floor((z + extent / 2) / (extent / res));
  return data[(j * res + i) * 4 + channel]!;
};

describe('ground splat', () => {
  const extent = 400;
  const res = 200;
  const [data, second] = buildGroundSplat(
    [
      { layer: 0, x: -100, z: 50, radius: 40 },
      { layer: 2, x: 120, z: -80, radius: 10, strength: 0.5 },
      { layer: 4, x: 0, z: 0, radius: 20 },
    ],
    extent,
    res,
    'test',
    5,
  ) as [Uint8Array, Uint8Array];

  it('covers a patch fully at its centre and not at all far away', () => {
    expect(texel(data, res, extent, -100, 50, 0)).toBe(255);
    expect(texel(data, res, extent, 100, 50, 0)).toBe(0);
    expect(texel(data, res, extent, -100, 50, 1)).toBe(0);
  });

  it('places rows from -z to +z and honours strength', () => {
    expect(texel(data, res, extent, 120, -80, 2)).toBe(128);
    expect(texel(data, res, extent, 120, 80, 2)).toBe(0);
  });

  it('puts layers 3–5 in a second texture', () => {
    expect(texel(second, res, extent, 0, 0, 1)).toBe(255);
    expect(texel(data, res, extent, 0, 0, 1)).toBe(0);
  });

  it('fills the variation channel with slow noise and is deterministic', () => {
    const alpha = Array.from({ length: res * res }, (_, i) => data[i * 4 + 3]!);
    expect(Math.min(...alpha)).toBe(0);
    expect(Math.max(...alpha)).toBe(255);
    expect(buildGroundSplat([], extent, res, 'test')).toEqual(buildGroundSplat([], extent, res, 'test'));
  });
});

describe('zone ground textures', () => {
  it('reference texture files that exist and valid overlay layers', () => {
    for (const zone of ZONES) {
      const ground = zone.ground;
      if (!ground) continue;
      expect(ground.layers.length).toBeLessThanOrEqual(6);
      const names = [ground.base, ground.road, ...ground.layers].filter(Boolean);
      for (const name of names) expect(existsSync(join(__dirname, `../public/assets/textures/ground/${name}.webp`)), `${name}.webp`).toBe(true);
      for (const p of ground.patches) expect(p.layer).toBeLessThan(ground.layers.length);
      if (ground.patches.length) expect(ground.base, `${zone.id}: overlays need a base`).toBeDefined();
    }
  });

  it('paints Cinder Flats by subzone', () => {
    const ground = ZONES.find((z) => z.id === 'zone.cinder_flats')!.ground!;
    expect(ground.base).toBe('ash_plain');
    expect(ground.road).toBe('cracked_asphalt');
    const used = new Set(ground.patches.map((p) => ground.layers[p.layer]));
    expect([...used].sort()).toEqual(['lumen_infested', 'military_concrete', 'scorched_ground']);
  });
});

describe('ground splat speed-ups (T004)', () => {
  it('keeps the variation channel identical to the straightforward modulo noise', async () => {
    const { Rng } = await import('../src/core/rng');
    const n = 64;
    const grid = Float32Array.from({ length: n * n }, ((rng) => () => rng.next())(new Rng('ref-variation')));
    const at = (x: number, z: number) => {
      const xi = Math.floor(x);
      const zi = Math.floor(z);
      const fx = x - xi;
      const fz = z - zi;
      const sx = fx * fx * (3 - 2 * fx);
      const sz = fz * fz * (3 - 2 * fz);
      const g = (a: number, b: number) => grid[(((b % n) + n) % n) * n + (((a % n) + n) % n)]!;
      const top = g(xi, zi) + (g(xi + 1, zi) - g(xi, zi)) * sx;
      const bottom = g(xi, zi + 1) + (g(xi + 1, zi + 1) - g(xi, zi + 1)) * sx;
      return top + (bottom - top) * sz;
    };
    const fbm = (x: number, z: number) => at(x, z) * 0.6 + at(x * 2.1 + 17, z * 2.1 + 31) * 0.3 + at(x * 4.3 + 5, z * 4.3 + 11) * 0.1;
    const smooth = (v: number) => {
      const t = Math.min(1, Math.max(0, (v - 0.35) / 0.3));
      return t * t * (3 - 2 * t);
    };
    // Negative coordinates and a crop far from the origin both exercise the index wrap.
    const extent = 3000;
    const res = 64;
    const [data] = buildGroundSplat([], extent, res, 'ref', 3) as [Uint8Array];
    const cell = extent / res;
    for (let j = 0; j < res; j += 3) {
      for (let i = 0; i < res; i += 3) {
        const x = -extent / 2 + (i + 0.5) * cell;
        const z = -extent / 2 + (j + 0.5) * cell;
        expect(Math.abs(data[(j * res + i) * 4 + 3]! - Math.round(255 * smooth(fbm(x / 70, z / 70))))).toBeLessThanOrEqual(0);
      }
    }
  });

  it('memoises a zone: the second entry returns the same weights', () => {
    const patches = [{ layer: 0, x: 0, z: 0, radius: 30 }];
    const a = groundSplatCached('zone.test', patches, 200, 64, 'zone.test', 3);
    expect(groundSplatCached('zone.test', patches, 200, 64, 'zone.test', 3)).toBe(a);
    expect(a).toEqual(buildGroundSplat(patches, 200, 64, 'zone.test', 3));
    // Only the last few zones stay resident.
    for (const k of ['a', 'b', 'c']) groundSplatCached(k, [], 200, 64, k, 3);
    expect(groundSplatCached('zone.test', patches, 200, 64, 'zone.test', 3)).not.toBe(a);
  });

  it('builds a full 1024 px zone splat quickly', () => {
    const zone = ZONES.find((z) => z.id === 'zone.hydroponic_vaults')!;
    const g = zone.ground!;
    const t = performance.now();
    buildGroundSplat(g.patches, zone.halfSize * 2 + 40, 1024, zone.id, Math.min(g.layers.length, 6));
    // Was 3.2-3.7 s; generous bound so a slow CI box passes.
    expect(performance.now() - t).toBeLessThan(1500);
  });
});
