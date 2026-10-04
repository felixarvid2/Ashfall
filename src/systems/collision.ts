/**
 * Spatial index rebuild and circle-vs-circle separation.
 * Moving colliders push each other apart weighted by mass; static colliders
 * (crates, posts) never move. Air colliders only interact with air.
 */
import { Collider, Dead, EnemyAI, ForcedMove, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';

/** Rebuild the spatial hash from all living colliders. Runs first each tick. */
export function spatialSystem(world: World, _dt: number, ctx: GameContext): void {
  ctx.spatial.clear();
  for (const e of world.query(Transform, Collider)) {
    if (world.has(e, Dead)) continue;
    const tr = world.req(e, Transform);
    ctx.spatial.insert(e, tr.x, tr.z, world.req(e, Collider).radius);
  }
}

const scratch: Entity[] = [];

export function collisionSystem(world: World, _dt: number, ctx: GameContext): void {
  // Re-index after movement so we resolve against current positions.
  spatialSystem(world, 0, ctx);
  for (const a of world.query(Transform, Collider)) {
    const ca = world.req(a, Collider);
    if (ca.isStatic || world.has(a, Dead)) continue;
    // Leaping entities fly over everything.
    const fm = world.get(a, ForcedMove);
    if (fm && fm.height > 0) continue;
    if (world.get(a, EnemyAI)?.burrowed) continue;
    const ta = world.req(a, Transform);
    for (const b of ctx.spatial.queryCircle(ta.x, ta.z, ca.radius, scratch)) {
      if (b === a) continue;
      const cb = world.req(b, Collider);
      if (cb.layer !== ca.layer) continue;
      const fmb = world.get(b, ForcedMove);
      if (fmb && fmb.height > 0) continue;
      if (world.get(b, EnemyAI)?.burrowed) continue;
      const tb = world.req(b, Transform);
      let dx = ta.x - tb.x;
      let dz = ta.z - tb.z;
      let dist = Math.hypot(dx, dz);
      const overlap = ca.radius + cb.radius - dist;
      if (overlap <= 0) continue;
      if (dist < 1e-5) {
        // Perfectly stacked: separate along an arbitrary but deterministic axis.
        dx = Math.cos(a * 2.399);
        dz = Math.sin(a * 2.399);
        dist = 1;
      }
      const nx = dx / dist;
      const nz = dz / dist;
      if (cb.isStatic) {
        ta.x += nx * overlap;
        ta.z += nz * overlap;
      } else {
        // Each body moves in proportion to the other's mass; a is resolved
        // here and b again from its own side, so split the overlap in half.
        const share = cb.mass / (ca.mass + cb.mass);
        ta.x += nx * overlap * share * 0.5;
        ta.z += nz * overlap * share * 0.5;
      }
    }
  }
}
