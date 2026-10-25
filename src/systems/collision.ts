/**
 * Spatial index and circle-vs-circle separation.
 * Moving colliders push each other apart weighted by mass; static colliders
 * (crates, posts) never move. Air colliders only interact with air.
 *
 * Static colliders live in the spatial hash's static layer, which is built once and patched as colliders
 * come and go (a World watcher on Collider), not rebuilt every tick; only the moving ones are re-hashed.
 * Dead statics (broken crates) stay in the layer and are hidden from queries while they carry Dead.
 */
import { Collider, Dead, EnemyAI, ForcedMove, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { SpatialHash } from '../core/spatial';

/** What the collision system tracks about the Collider store of the world a hash is bound to. */
interface ColliderIndex {
  world: World;
  unwatch: () => void;
  /** Non-static colliders, in the order their Collider component was added. */
  dynamic: Set<Entity>;
  /** Static colliders not yet in the static layer (added this tick, or waiting for a Transform). */
  pending: Entity[];
}

const indexes = new WeakMap<SpatialHash, ColliderIndex>();

function bindIndex(world: World, spatial: SpatialHash): ColliderIndex {
  let idx = indexes.get(spatial);
  if (idx && idx.world === world) return idx;
  idx?.unwatch();
  spatial.clear();
  const bound: ColliderIndex = { world, unwatch: () => {}, dynamic: new Set(), pending: [] };
  const note = (e: Entity, c: Collider): void => {
    if (c.isStatic) {
      bound.dynamic.delete(e);
      spatial.removeStatic(e);
      bound.pending.push(e);
    } else {
      bound.dynamic.add(e);
      spatial.removeStatic(e);
    }
  };
  bound.unwatch = world.watch(Collider, {
    added: note,
    removed: (e) => {
      bound.dynamic.delete(e);
      spatial.removeStatic(e);
    },
  });
  spatial.isHidden = (e) => world.has(e, Dead);
  indexes.set(spatial, bound);
  // Colliders that exist before the system first runs (zone props, tests).
  for (const e of world.query(Collider)) note(e, world.req(e, Collider));
  idx = bound;
  return idx;
}

/** Refresh the spatial hash: new statics in, moved statics re-indexed, living movers re-hashed. Runs first each tick. */
export function spatialSystem(world: World, _dt: number, ctx: GameContext): void {
  const spatial = ctx.spatial;
  const idx = bindIndex(world, spatial);
  const pending = idx.pending;
  if (pending.length > 0) {
    let kept = 0;
    for (let i = 0; i < pending.length; i++) {
      const e = pending[i]!;
      const col = world.get(e, Collider);
      if (!col || !col.isStatic || spatial.hasStatic(e)) continue;
      const tr = world.get(e, Transform);
      if (!tr) {
        pending[kept++] = e; // Not placed yet; look again next tick.
        continue;
      }
      spatial.insertStatic(e, tr.x, tr.z, col.radius, tr, col);
    }
    pending.length = kept;
  }
  spatial.refreshStatics();
  spatial.clearDynamic();
  for (const e of idx.dynamic) {
    const tr = world.get(e, Transform);
    if (!tr || world.has(e, Dead)) continue;
    spatial.insert(e, tr.x, tr.z, world.req(e, Collider).radius);
  }
}

const scratch: Entity[] = [];

export function collisionSystem(world: World, _dt: number, ctx: GameContext): void {
  // Re-index after movement so we resolve against current positions.
  spatialSystem(world, 0, ctx);
  for (const a of indexes.get(ctx.spatial)!.dynamic) {
    if (!world.has(a, Transform) || world.has(a, Dead)) continue;
    const ca = world.req(a, Collider);
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
