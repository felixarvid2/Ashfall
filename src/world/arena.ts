/** Builds a zone's static entities from its data definition. */
import type { World } from '../core/ecs';
import { Collider, Renderable, Transform, makeTransform } from '../core/components';
import { Rng } from '../core/rng';
import type { ArenaDef, ScatterDef } from '../data/zones/testArena';
import type { EnvFeature, HubDef, Road } from '../data/zones/zoneTypes';
import { caveGrid, walkableAt } from '../data/zones/caves';

export interface ScatterInstance {
  x: number;
  z: number;
  rot: number;
  scale: number;
  /** Distorted memories only (ScatterDef.tilt/lift): lean about the x and z axes, metres above the ground. */
  lean?: { x: number; z: number };
  lift?: number;
}

/** Spawn prop entities. Lights and scatter are visual-only and handled by the renderer. */
export function spawnArenaProps(world: World, arena: ArenaDef): void {
  for (const prop of arena.props) {
    const e = world.create();
    world.add(e, Transform, makeTransform(prop.x, 0, prop.z, prop.rot ?? 0));
    world.add(e, Renderable, { assetId: prop.asset, scale: prop.scale ?? 1, ...(prop.landmark ? { landmark: true } : {}), ...(prop.glow ? { glow: prop.glow } : {}) });
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
  // Underground: scatter only on open ground (rock is drawn solid).
  const grid = caveGrid(arena as unknown as Parameters<typeof caveGrid>[0]);
  const zone = arena as ArenaDef & { roads?: Road[]; hubs?: HubDef[]; env?: EnvFeature[] };
  const pick = spotPicker(zone, def, rng);
  const lim = arena.halfSize - 1;
  let tries = 0;
  while (out.length < def.count && tries++ < def.count * 20) {
    const spot = pick();
    if (!spot) break;
    const { x, z } = spot;
    if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
    if (Math.hypot(x - arena.playerSpawn.x, z - arena.playerSpawn.z) < clear) continue;
    if (grid && !walkableAt(grid, x, z)) continue;
    // Clutter by the roads stays out of water and molten metal.
    if (def.near && (zone.env ?? []).some((f) => (f.kind === 'molten' || f.kind === 'water') && Math.hypot(x - f.x, z - f.z) < f.radius + 1)) continue;
    const inst: ScatterInstance = { x, z, rot: rng.range(0, Math.PI * 2), scale: rng.range(def.minScale, def.maxScale) };
    if (def.tilt) inst.lean = { x: rng.range(-def.tilt, def.tilt), z: rng.range(-def.tilt, def.tilt) };
    if (def.lift) inst.lift = rng.range(0, def.lift);
    out.push(inst);
  }
  return out;
}

/** Random candidate positions for a scatter definition. */
function spotPicker(zone: ArenaDef & { roads?: Road[]; hubs?: HubDef[] }, def: ScatterDef, rng: Rng): () => { x: number; z: number } | null {
  const spread = def.spread ?? 4;
  if (def.near === 'roads') {
    // Segments weighted by length, a point on one, pushed out past the road's edge to either side.
    const segs = (zone.roads ?? []).flatMap((r) => r.points.slice(1).map((b, i) => ({ a: r.points[i]!, b, w: r.width, len: Math.hypot(b[0] - r.points[i]![0], b[1] - r.points[i]![1]) })));
    const total = segs.reduce((n, s) => n + s.len, 0);
    if (!total) return () => null;
    return () => {
      let d = rng.range(0, total);
      const s = segs.find((g) => (d -= g.len) < 0) ?? segs[segs.length - 1]!;
      const t = rng.range(0, 1);
      const off = (s.w / 2 + rng.range(0.3, spread)) * (rng.range(0, 1) < 0.5 ? -1 : 1);
      const nx = -(s.b[1] - s.a[1]) / s.len;
      const nz = (s.b[0] - s.a[0]) / s.len;
      return { x: s.a[0] + (s.b[0] - s.a[0]) * t + nx * off, z: s.a[1] + (s.b[1] - s.a[1]) * t + nz * off };
    };
  }
  if (def.near === 'hubs') {
    const hubs = zone.hubs ?? [];
    if (!hubs.length) return () => null;
    return () => {
      const h = hubs[Math.floor(rng.range(0, hubs.length))]!;
      const a = rng.range(0, Math.PI * 2);
      const r = h.radius + rng.range(-1, spread);
      return { x: h.x + Math.sin(a) * r, z: h.z + Math.cos(a) * r };
    };
  }
  if (def.within) {
    const w = def.within;
    return () => {
      const a = rng.range(0, Math.PI * 2);
      const r = w.radius * Math.sqrt(rng.range(0, 1));
      return { x: w.x + Math.sin(a) * r, z: w.z + Math.cos(a) * r };
    };
  }
  const half = zone.halfSize;
  return () => ({ x: rng.range(-half, half), z: rng.range(-half, half) });
}
