import { describe, expect, it } from 'vitest';
import { SILHOUETTE, hiddenEnemies, propBlocksView, silhouetteEnabled, type Prop } from '../src/render/occlusion';

// The camera sits up and back along +x/+z of whatever it follows, like the isometric rig.
const cam = { x: 14, y: 18, z: 14 };
const tower = (x: number, z: number, h = 9): Prop => ({ x, z, h, r: 1 });

describe('enemies hidden behind tall props (F018)', () => {
  it('a tall prop on the line to the camera hides what stands behind it', () => {
    // A creature at the origin; a tower halfway to the camera.
    expect(propBlocksView(cam, { x: 0, z: 0 }, tower(3, 3))).toBe(true);
    // Beside the line, or behind the creature (away from the camera), nothing is hidden.
    expect(propBlocksView(cam, { x: 0, z: 0 }, tower(8, -3))).toBe(false);
    expect(propBlocksView(cam, { x: 0, z: 0 }, tower(-4, -4))).toBe(false);
  });

  it('short props never hide anyone, and a prop the ray passes over does not either', () => {
    expect(propBlocksView(cam, { x: 0, z: 0 }, tower(3, 3, SILHOUETTE.minPropHeight - 0.1))).toBe(false);
    expect(propBlocksView(cam, { x: 0, z: 0 }, tower(12, 12, 5))).toBe(false);
  });

  it('lists the hidden enemies in range, nearest first, capped, and none without tall props', () => {
    const enemies = [
      { id: 1, x: 0, z: 0 }, // hidden by the tower, near
      { id: 2, x: 6, z: -6 }, // in the open
      { id: 3, x: -3, z: -3 }, // hidden, further
      { id: 4, x: -40, z: -40 }, // hidden but out of range
    ];
    const props = [tower(3, 3), tower(0, 0)];
    const hero = { x: 1, z: 1 };
    expect(hiddenEnemies(enemies, [tower(5, 5)], cam, hero)).toEqual([1]);
    expect(hiddenEnemies(enemies, props, cam, hero)).toEqual([1, 3]);
    expect(hiddenEnemies(enemies, [], cam, hero)).toEqual([]);
    expect(hiddenEnemies(enemies, props, cam, hero, 26, 1)).toHaveLength(1);
    expect(hiddenEnemies(enemies, props, cam, hero)).not.toContain(4);
  });

  it('is off on the low graphics setting only', () => {
    expect(silhouetteEnabled('low')).toBe(false);
    expect(silhouetteEnabled('medium')).toBe(true);
    expect(silhouetteEnabled('high')).toBe(true);
  });
});
