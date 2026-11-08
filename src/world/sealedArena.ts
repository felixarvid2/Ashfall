/**
 * A07: sealed boss arenas. The region bosses' arenas (The Maw, the Smelters' Cathedral, the Great Dome) are rings of wall
 * segments with the entrances closed by gates for the fight, but the walls are shorter than the spacing between them, so
 * a player could slip out through the seams. While a fight runs, a barrier of static colliders (one glowing marker per seam)
 * fills every seam; the caller keeps the entities with the gates, so they go when the boss dies or the fight resets.
 */
import { Collider, Renderable, Transform, makeTransform } from '../core/components';
import type { Entity, World } from '../core/ecs';

export interface RingSpec {
  x: number;
  z: number;
  radius: number;
  /** Wall segments round the ring (gates sit on their positions, the seams between them). */
  segments: number;
}

/** Blocker circles along a seam: wide enough to overlap their neighbours, far wider than any player collider. */
const BLOCK = { radius: 1.4, step: 2.4 };

/** Where the seam between segment `i` and `i + 1` lies. */
export function seamCentre(ring: RingSpec, i: number): { x: number; z: number; angle: number; length: number } {
  const angle = ((i + 0.5) / ring.segments) * Math.PI * 2;
  return {
    x: ring.x + Math.sin(angle) * ring.radius,
    z: ring.z + Math.cos(angle) * ring.radius,
    angle,
    length: 2 * ring.radius * Math.sin(Math.PI / ring.segments),
  };
}

/** Fill every seam of the ring with energy-barrier colliders; returns all the entities made. */
export function sealRing(world: World, ring: RingSpec, glow: string): Entity[] {
  const out: Entity[] = [];
  for (let i = 0; i < ring.segments; i++) {
    const seam = seamCentre(ring, i);
    // Tangent of the ring at the seam.
    const tx = Math.cos(seam.angle);
    const tz = -Math.sin(seam.angle);
    const n = Math.max(1, Math.ceil(seam.length / BLOCK.step));
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * (seam.length / n);
      const e = world.create();
      world.add(e, Transform, makeTransform(seam.x + tx * off, 0, seam.z + tz * off, seam.angle + Math.PI / 2));
      world.add(e, Collider, { radius: BLOCK.radius, mass: Infinity, layer: 'ground', isStatic: true });
      // One glowing panel per seam; the rest are invisible blockers.
      if (k === Math.floor(n / 2)) world.add(e, Renderable, { assetId: 'prop.barricade', scale: 1, glow });
      out.push(e);
    }
  }
  return out;
}
