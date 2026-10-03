import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data/zones';
import { buildGroundSplat } from '../src/render/groundSplat';

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
