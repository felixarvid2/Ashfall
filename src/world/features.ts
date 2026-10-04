/**
 * Unique features (docs/world-and-gameplay.md §3, one or two per region): things in the world the
 * player can turn on the enemy.
 * - Cinder Flats: the Checkpoint Sierra autocannon (a barrage on enemies nearby) and the fuel depot
 *   (one big blast).
 * - Refinery District: The Crane drops its load on the drop zone with the most enemies, once the
 *   crane has been restored (side quest); coolant valves flood nearby molten metal with steam for a
 *   few seconds, so it can be crossed.
 * - Hydroponic Vaults: air filters clear the spore fields around them for good once switched on.
 * - Deep Mines: floodlights light the dark around them for good once switched on.
 */
import { Blast, Dead, EnemyAI, Renderable, Transform, makeTransform, type Interactable } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { PoiDef } from '../data/zones/zoneTypes';
import { monsterLevel } from '../systems/encounter';
import type { ZoneRuntime } from './zone';
import { signal } from '../systems/quests';

export type FeatureKind = 'autocannon' | 'fuelDepot' | 'crane' | 'coolantValve' | 'airFilter' | 'floodlight';

export const FEATURES: Record<FeatureKind, { asset: string; scale?: number; glow: string; cooldown: number; requires?: string }> = {
  autocannon: { asset: 'prop.control_terminal', glow: '#ff9a3a', cooldown: 90 },
  fuelDepot: { asset: 'prop.fuel_tank', scale: 1.3, glow: '#ff6a1a', cooldown: 150 },
  crane: { asset: 'prop.control_terminal', glow: '#ffd23a', cooldown: 45, requires: 'sq.crane_operator' },
  coolantValve: { asset: 'prop.coolant_valve', glow: '#7ad8ff', cooldown: 25 },
  // Hydroponic Vaults: switched on once, a filter clears the spore fields around it for good.
  airFilter: { asset: 'prop.compressor', scale: 1.3, glow: '#7dffd0', cooldown: Infinity },
  // Deep Mines: an old work-light generator; once running it lights the area for good.
  floodlight: { asset: 'prop.generator', scale: 1.1, glow: '#ffe2a0', cooldown: Infinity },
};

export const FEATURE_TUNING = {
  autocannon: { range: 30, shots: 12, every: 0.3, radius: 2.4, base: 40, perLevel: 16 },
  fuelDepot: { radius: 10, fuse: 1.2, base: 160, perLevel: 50 },
  crane: { radius: 6.5, warning: 1.4, base: 220, perLevel: 70 },
  coolantValve: { radius: 34, duration: 8 },
};

export function featureOf(poi: PoiDef | undefined): FeatureKind | null {
  const f = poi?.data?.feature;
  return typeof f === 'string' && f in FEATURES ? (f as FeatureKind) : null;
}

function blast(world: World, x: number, z: number, radius: number, fuse: number, flat: number): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z));
  world.add(e, Blast, { fuse, radius, owner: null, coefficient: 0, flat, hurtsEnemies: true, player: null });
  return e;
}

function enemiesNear(world: World, x: number, z: number, radius: number): Transform[] {
  const out: Transform[] = [];
  for (const e of world.query(EnemyAI, Transform)) {
    if (world.has(e, Dead)) continue;
    const t = world.req(e, Transform);
    if (Math.hypot(t.x - x, t.z - z) <= radius) out.push(t);
  }
  return out;
}

/** Use a feature. Returns true if it fired. */
export function useFeature(world: World, ctx: GameContext, zone: ZoneRuntime, target: Entity, it: Interactable, poi: PoiDef | undefined): boolean {
  const kind = featureOf(poi);
  if (!kind || !poi) return false;
  const def = FEATURES[kind];
  if (def.requires && !ctx.quests?.done.has(def.requires)) {
    ctx.events.push({ type: 'notice', key: `features.${kind}.locked` });
    return false;
  }
  const tr = world.req(target, Transform);
  const level = monsterLevel(world, ctx);
  switch (kind) {
    case 'autocannon': {
      const T = FEATURE_TUNING.autocannon;
      const targets = enemiesNear(world, tr.x, tr.z, T.range);
      if (!targets.length) {
        ctx.events.push({ type: 'notice', key: 'features.noTargets' });
        return false;
      }
      for (let i = 0; i < T.shots; i++) {
        const t = targets[i % targets.length]!;
        const x = t.x + ctx.rng.range(-1.5, 1.5);
        const z = t.z + ctx.rng.range(-1.5, 1.5);
        blast(world, x, z, T.radius, 0.3 + i * T.every, T.base + T.perLevel * level);
      }
      break;
    }
    case 'fuelDepot': {
      const T = FEATURE_TUNING.fuelDepot;
      ctx.events.push({ type: 'telegraph', owner: null, x: tr.x, z: tr.z, shape: { kind: 'circle', radius: T.radius }, duration: T.fuse, color: '#ff6a1a' });
      blast(world, tr.x, tr.z, T.radius, T.fuse, T.base + T.perLevel * level);
      break;
    }
    case 'crane': {
      const T = FEATURE_TUNING.crane;
      // The load drops on whichever drop zone has the most enemies under it.
      const zones = String(poi.data?.drops ?? '')
        .split(';')
        .filter(Boolean)
        .map((p) => p.split(',').map(Number) as [number, number]);
      let best: [number, number] | null = null;
      let bestN = 0;
      for (const [x, z] of zones) {
        const n = enemiesNear(world, x, z, T.radius).length;
        if (n > bestN) {
          bestN = n;
          best = [x, z];
        }
      }
      if (!best) {
        ctx.events.push({ type: 'notice', key: 'features.noTargets' });
        return false;
      }
      ctx.events.push({ type: 'telegraph', owner: null, x: best[0], z: best[1], shape: { kind: 'circle', radius: T.radius }, duration: T.warning, color: '#ffd23a' });
      blast(world, best[0], best[1], T.radius, T.warning, T.base + T.perLevel * level);
      ctx.events.push({ type: 'shake', trauma: 0.5 });
      break;
    }
    case 'airFilter': {
      if (zone.found.has(poi.id)) {
        ctx.events.push({ type: 'notice', key: 'features.airFilter.locked' });
        return false;
      }
      zone.found.add(poi.id);
      it.used = true;
      if (ctx.account) {
        const entry = (ctx.account.restoration[zone.def.id] ??= { points: [], tiers: 0 });
        if (!entry.points.includes(`filter:${poi.id}`)) entry.points.push(`filter:${poi.id}`);
      }
      ctx.events.push({ type: 'vfx', kind: 'coolant', x: tr.x, z: tr.z, radius: 8, facing: 0 });
      ctx.events.push({ type: 'banner', key: 'features.airFilter.used', seconds: 2.4 });
      signal(ctx, { type: 'interact', kind: 'feature', id: poi.id });
      break;
    }
    case 'floodlight': {
      if (zone.found.has(poi.id)) {
        ctx.events.push({ type: 'notice', key: 'features.floodlight.locked' });
        return false;
      }
      zone.found.add(poi.id);
      it.used = true;
      if (ctx.account) {
        const entry = (ctx.account.restoration[zone.def.id] ??= { points: [], tiers: 0 });
        if (!entry.points.includes(`light:${poi.id}`)) entry.points.push(`light:${poi.id}`);
      }
      ctx.events.push({ type: 'vfx', kind: 'flash', x: tr.x, z: tr.z, radius: 6, facing: 0 });
      ctx.events.push({ type: 'banner', key: 'features.floodlight.used', seconds: 2.2 });
      signal(ctx, { type: 'interact', kind: 'feature', id: poi.id });
      break;
    }
    case 'coolantValve': {
      const T = FEATURE_TUNING.coolantValve;
      for (const f of zone.def.env ?? []) {
        if (f.kind !== 'molten' || Math.hypot(f.x - tr.x, f.z - tr.z) > T.radius) continue;
        zone.cooled.set(f.id, ctx.time + T.duration);
      }
      ctx.events.push({ type: 'vfx', kind: 'coolant', x: tr.x, z: tr.z, radius: 6, facing: 0 });
      break;
    }
  }
  it.readyAt = ctx.time + def.cooldown;
  const r = world.get(target, Renderable);
  if (r) delete r.glow;
  ctx.events.push({ type: 'interact', kind: 'feature', id: it.poi, detail: kind });
  return true;
}
