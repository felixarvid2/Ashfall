/** Builds a zone's static entities from its data definition. */
import type { World } from '../core/ecs';
import { Renderable, Transform, makeTransform } from '../core/components';
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
