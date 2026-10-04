/**
 * The Deep Mines' environment (docs/regions/deep-mines.md):
 * - Rock: only tunnels and caverns are walkable; anything that ends a step inside rock slides back.
 * - Darkness: the player's lamp, floodlights switched on for good, and flares (F) light the dark.
 *   `isLit` tells light-sensitive enemies (Echoes) where the light is.
 * - Cave-ins: marked tunnel stretches creak and drop dust, then rubble falls and blocks the way briefly.
 */
import { Blast, Collider, Dead, Mover, PlayerControlled, Projectile, Renderable, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { caveGrid, nearestWalkable, walkableAt, type CaveGrid } from '../data/zones/caves';
import type { ZoneDef } from '../data/zones/zoneTypes';
import { monsterLevel } from '../systems/encounter';
import type { ZoneRuntime } from './zone';

export const UNDERGROUND = {
  /** Radius the player's lamp lights for gameplay (enemies that fear light, glowing eyes). */
  lampRadius: 13,
  /** Default radius a floodlight lights once switched on. */
  floodlightRadius: 24,
  flare: { charges: 3, recharge: 25, duration: 20, radius: 14, range: 14 },
  caveIn: { trigger: 1.4, warning: 2, cooldown: 28, rubble: 7, lifeFraction: 0.18 },
};

export interface UndergroundState {
  flares: { x: number; z: number; until: number }[];
  flareCharges: number;
  /** Seconds until the next charge comes back. */
  flareRecharge: number;
  /** Cave-in id → when it next can fall, and the warning in progress. */
  caveIns: Map<string, { readyAt: number; fallsAt: number | null }>;
  rubble: { entity: Entity; until: number }[];
  /** Loud spots (flares, explosions): Blind Hounds hunt by sound. */
  noises: { x: number; z: number; until: number }[];
}

export function undergroundState(zone: ZoneRuntime): UndergroundState {
  return (zone.underground ??= { flares: [], flareCharges: UNDERGROUND.flare.charges, flareRecharge: 0, caveIns: new Map(), rubble: [], noises: [] });
}

export function zoneGrid(ctx: GameContext): CaveGrid | null {
  if (!ctx.zone || ctx.instance) return null;
  return caveGrid(ctx.zone.def);
}

/** Floodlights switched on in this zone: positions and radii. */
export function litFloodlights(zone: ZoneRuntime): { id: string; x: number; z: number; radius: number }[] {
  const out: { id: string; x: number; z: number; radius: number }[] = [];
  for (const p of zone.def.pois) {
    if (p.kind !== 'feature' || p.data?.feature !== 'floodlight' || !zone.found.has(p.id)) continue;
    out.push({ id: p.id, x: p.x, z: p.z, radius: Number(p.data.radius ?? UNDERGROUND.floodlightRadius) });
  }
  return out;
}

/** Is this spot lit (lamp, floodlight or flare)? Zones that are not dark are lit everywhere. */
export function isLit(world: World, ctx: GameContext, x: number, z: number): boolean {
  const zone = ctx.zone;
  if (!zone || ctx.instance || !zone.def.dark) return true;
  const player = world.first(PlayerControlled, Transform);
  if (player !== undefined && !world.has(player, Dead)) {
    const pt = world.req(player, Transform);
    if (Math.hypot(pt.x - x, pt.z - z) <= UNDERGROUND.lampRadius) return true;
  }
  for (const f of litFloodlights(zone)) if (Math.hypot(f.x - x, f.z - z) <= f.radius) return true;
  const st = zone.underground;
  if (st) for (const f of st.flares) if (f.until > ctx.time && Math.hypot(f.x - x, f.z - z) <= UNDERGROUND.flare.radius) return true;
  return false;
}

/** Keep everything that moves inside tunnels and caverns; bolts that hit rock are spent. */
export function rockSystem(world: World, _dt: number, ctx: GameContext): void {
  const grid = zoneGrid(ctx);
  if (!grid) return;
  for (const e of world.query(Transform, Mover)) {
    const tr = world.req(e, Transform);
    if (walkableAt(grid, tr.x, tr.z)) continue;
    // Slide along the wall: keep whichever axis of the step is still open.
    if (walkableAt(grid, tr.x, tr.prevZ)) tr.z = tr.prevZ;
    else if (walkableAt(grid, tr.prevX, tr.z)) tr.x = tr.prevX;
    else if (walkableAt(grid, tr.prevX, tr.prevZ)) {
      tr.x = tr.prevX;
      tr.z = tr.prevZ;
    } else {
      // Spawned or thrown into rock: out to the nearest open ground.
      const p = nearestWalkable(grid, tr.x, tr.z);
      if (p) {
        tr.x = tr.prevX = p.x;
        tr.z = tr.prevZ = p.z;
      }
    }
  }
  for (const e of world.query(Transform, Projectile)) {
    const tr = world.req(e, Transform);
    if (!walkableAt(grid, tr.x, tr.z)) world.destroyDeferred(e);
  }
}

/** Flares (F) and the cave-ins. */
export function undergroundSystem(world: World, dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  if (!zone || ctx.instance || !zone.def.dark) return;
  const st = undergroundState(zone);
  const F = UNDERGROUND.flare;
  st.flares = st.flares.filter((f) => f.until > ctx.time);
  st.noises = st.noises.filter((n) => n.until > ctx.time);
  if (st.flareCharges < F.charges && (st.flareRecharge -= dt) <= 0) {
    st.flareCharges++;
    st.flareRecharge = st.flareCharges < F.charges ? F.recharge : 0;
  }
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined || world.has(player, Dead)) return;
  const pt = world.req(player, Transform);
  if (ctx.input.wasPressed('flare')) throwFlare(ctx, st, pt);
  caveIns(world, ctx, zone, st, pt);
}

export function throwFlare(ctx: GameContext, st: UndergroundState, pt: Transform): boolean {
  const F = UNDERGROUND.flare;
  if (st.flareCharges <= 0) {
    ctx.events.push({ type: 'notice', key: 'underground.noFlares' });
    return false;
  }
  const aim = ctx.pickGround();
  let x = pt.x + Math.sin(pt.facing) * 6;
  let z = pt.z + Math.cos(pt.facing) * 6;
  if (aim) {
    const d = Math.hypot(aim.x - pt.x, aim.z - pt.z);
    const k = d > F.range ? F.range / d : 1;
    x = pt.x + (aim.x - pt.x) * k;
    z = pt.z + (aim.z - pt.z) * k;
  }
  const grid = zoneGrid(ctx);
  if (grid && !walkableAt(grid, x, z)) {
    const p = nearestWalkable(grid, x, z, 12);
    if (p) ({ x, z } = p);
  }
  if (st.flareCharges === F.charges) st.flareRecharge = F.recharge;
  st.flareCharges--;
  st.flares.push({ x, z, until: ctx.time + F.duration });
  ctx.events.push({ type: 'vfx', kind: 'flare', x, z, radius: F.radius, facing: 0 });
  // Blind Hounds hunt by sound: a flare is noise.
  makeNoise(st, ctx, x, z);
  return true;
}

function caveIns(world: World, ctx: GameContext, zone: ZoneRuntime, st: UndergroundState, pt: Transform): void {
  const C = UNDERGROUND.caveIn;
  st.rubble = st.rubble.filter((r) => {
    if (r.until > ctx.time) return true;
    if (world.isAlive(r.entity)) world.destroyDeferred(r.entity);
    return false;
  });
  for (const f of zone.def.env ?? []) {
    if (f.kind !== 'caveIn') continue;
    let s = st.caveIns.get(f.id);
    if (!s) st.caveIns.set(f.id, (s = { readyAt: 0, fallsAt: null }));
    if (s.fallsAt === null) {
      if (ctx.time < s.readyAt || Math.hypot(pt.x - f.x, pt.z - f.z) > f.radius * C.trigger) continue;
      s.fallsAt = ctx.time + C.warning;
      ctx.events.push({ type: 'telegraph', owner: null, x: f.x, z: f.z, shape: { kind: 'circle', radius: f.radius }, duration: C.warning, color: '#d8b070' });
      ctx.events.push({ type: 'vfx', kind: 'dust', x: f.x, z: f.z, radius: f.radius, facing: 0 });
      ctx.events.push({ type: 'notice', key: 'underground.creak' });
      ctx.events.push({ type: 'shake', trauma: 0.25 });
      continue;
    }
    if (ctx.time < s.fallsAt) continue;
    s.fallsAt = null;
    s.readyAt = ctx.time + C.cooldown;
    const blast = world.create();
    world.add(blast, Transform, makeTransform(f.x, 0, f.z));
    world.add(blast, Blast, { fuse: 0, radius: f.radius, owner: null, coefficient: 0, flat: 0, hurtsEnemies: true, player: { fraction: C.lifeFraction, damage: 0, level: monsterLevel(world, ctx) } });
    ctx.events.push({ type: 'vfx', kind: 'slam', x: f.x, z: f.z, radius: f.radius, facing: 0 });
    ctx.events.push({ type: 'shake', trauma: 0.6 });
    // Rubble blocks the middle of the tunnel for a few seconds.
    const rock = world.create();
    world.add(rock, Transform, makeTransform(f.x, 0, f.z, ctx.rng.range(0, 6.28)));
    world.add(rock, Renderable, { assetId: 'env.slag_rock', scale: f.radius * 0.45 });
    world.add(rock, Collider, { radius: f.radius * 0.55, mass: Infinity, layer: 'ground', isStatic: true });
    st.rubble.push({ entity: rock, until: ctx.time + C.rubble });
  }
}

export function makeNoise(st: UndergroundState, ctx: GameContext, x: number, z: number, seconds = 6): void {
  st.noises.push({ x, z, until: ctx.time + seconds });
}

/** Pick a walkable spot near (x, z) (spawns, loot, blinks); unchanged in open zones. */
export function openGround(def: ZoneDef, x: number, z: number): { x: number; z: number } {
  const grid = caveGrid(def);
  if (!grid) return { x, z };
  return nearestWalkable(grid, x, z) ?? { x, z };
}
