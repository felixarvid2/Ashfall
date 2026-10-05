import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { ParticleField } from '../src/render/particles';
import { ATLAS_COLS, MASK_SPRITES, SPRITE } from '../src/render/vfxAtlas';
import { SPRITES } from '../scripts/vfx/sprites';

describe('sprite particles', () => {
  it('ages, moves and recycles particles without disturbing the living', () => {
    const f = new ParticleField(8);
    f.spawn({ sprite: 'flame_0', x: 0, y: 1, z: 0, vy: 2, life: 0.5, size: 1 });
    f.spawn({ sprite: 'smoke_0', x: 5, y: 1, z: 0, vx: 1, life: 2, size: 1, additive: 0 });
    f.update(0.25);
    expect(f.count).toBe(2);
    f.update(0.3);
    // The flame died; the smoke moved into its slot and kept going.
    expect(f.count).toBe(1);
    expect(f.data[0]).toBeCloseTo(5 + 0.55, 5);
  });

  it('respects its cap (and the lower cap set for low graphics)', () => {
    const f = new ParticleField(5);
    for (let i = 0; i < 10; i++) f.spawn({ sprite: 'embers_0', x: 0, y: 0, z: 0, life: 1, size: 1 });
    expect(f.count).toBe(5);
    const g = new ParticleField(5);
    g.limit = 2;
    for (let i = 0; i < 10; i++) g.spawn({ sprite: 'embers_0', x: 0, y: 0, z: 0, life: 1, size: 1 });
    expect(g.count).toBe(2);
  });

  it('fades in, holds and fades out', () => {
    expect(ParticleField.opacity(0.05, 0.1, 0.5)).toBeCloseTo(0.5);
    expect(ParticleField.opacity(0.3, 0.1, 0.5)).toBe(1);
    expect(ParticleField.opacity(0.75, 0.1, 0.5)).toBeCloseTo(0.5);
  });

  it('keeps non-flat particles above the ground', () => {
    const f = new ParticleField(2);
    f.spawn({ sprite: 'ice_shard_0', x: 0, y: 0.5, z: 0, vy: -3, life: 1, size: 1, gravity: 9 });
    f.update(0.5);
    expect(f.data[1]).toBeGreaterThanOrEqual(0.05);
  });

  it('the atlas holds every generated sprite, in order', () => {
    expect(existsSync(new URL('../public/assets/vfx/atlas.webp', import.meta.url))).toBe(true);
    expect(SPRITES.length).toBeLessThanOrEqual(ATLAS_COLS * ATLAS_COLS);
    SPRITES.forEach((s, i) => {
      expect(SPRITE[s.key as keyof typeof SPRITE]).toBe(i);
      expect(MASK_SPRITES.has(s.key)).toBe(!!s.mask);
    });
  });
});
