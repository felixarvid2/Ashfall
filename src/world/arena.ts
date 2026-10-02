/** Builds a zone's static entities from its data definition. */
import type { World } from '../core/ecs';
import { Collider, Renderable, Transform, makeTransform } from '../core/components';
import { Rng } from '../core/rng';
import type { ArenaDef } from '../data/zones/testArena';

export interface ScatterInstance {
  x: number;
  z: number;
  rot: number;
  scale: number;
}

/** Spawn prop entities. Lights and scatter are visual-only and handled by the renderer. */
export function spawnArenaProps(world: World, arena: ArenaDef): void {
  for (const prop of arena.props) {
    const e = world.create();
    world.add(e, Transform, makeTransform(prop.x, 0, prop.z, prop.rot ?? 0));
    world.add(e, Renderable, { assetId: prop.asset, scale: prop.scale ?? 1 });
    if (prop.collider) world.add(e, Collider, { radius: prop.collider, mass: Infinity, layer: 'ground', isStatic: true });
    // Long props get invisible collision circles rotated into place.
    const rot = prop.rot ?? 0;
    const scale = prop.scale ?? 1;
    for (const c of prop.colliders ?? []) {
      const blocker = world.create();
      const x = prop.x + (c.x * Math.cos(rot) + c.z * Math.sin(rot)) * scale;
      const z = prop.z + (-c.x * Math.sin(rot) + c.z * Math.cos(rot)) * scale;
      world.add(blocker, Transform, makeTransform(x, 0, z));
      world.add(blocker, Collider, { radius: c.r * scale, mass: Infinity, layer: 'ground', isStatic: true });
    }
  }
}

/** Deterministic scatter positions (same seed → same layout), keeping the spawn clear. */
export function scatterInstances(arena: ArenaDef, index: number): ScatterInstance[] {
  const def = arena.scatter[index];
  if (!def) return [];
  const rng = new Rng(def.seed);
  const out: ScatterInstance[] = [];
  const clear = 3;
  while (out.length < def.count) {
    const x = rng.range(-arena.halfSize, arena.halfSize);
    const z = rng.range(-arena.halfSize, arena.halfSize);
    if (Math.hypot(x - arena.playerSpawn.x, z - arena.playerSpawn.z) < clear) continue;
    out.push({ x, z, rot: rng.range(0, Math.PI * 2), scale: rng.range(def.minScale, def.maxScale) });
  }
  return out;
}
