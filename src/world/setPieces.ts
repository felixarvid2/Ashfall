/**
 * Open-world set pieces in Cinder Flats (docs/regions/cinder-flats.md):
 * - Checkpoint Sierra stronghold: three Spore Feeders empower the defenders while waves arrive;
 *   then Commandant Hale. Reclaimed, it becomes a safe hub.
 * - The Maw: the region boss The First, behind gates that close for the fight.
 */
import { Collider, Dead, EnemyAI, Faction, Health, PlayerControlled, Renderable, Targetable, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { HubDef } from '../data/zones/zoneTypes';
import { CINDER_SCALE } from '../data/zones/cinderFlats';
import { spawnBoss, resetBoss } from '../systems/boss';
import { applyStatus } from '../systems/combat';
import { signal } from '../systems/quests';
import { monsterLevel } from '../systems/encounter';
import { spawnEnemy } from './spawn';
import type { ZoneRuntime } from './zone';

/** These set pieces live in Cinder Flats only. */
const ZONE_ID = 'zone.cinder_flats';
export const SIERRA = { id: 'stronghold.sierra', x: 232 * CINDER_SCALE, z: -132 * CINDER_SCALE, radius: 30, trigger: 24 };
export const SIERRA_HUB: HubDef = { id: 'hub.sierra', x: SIERRA.x, z: SIERRA.z, radius: 26 };
export const MAW = { id: 'boss.first', x: 292 * CINDER_SCALE, z: 196 * CINDER_SCALE, radius: 26, trigger: 19, segments: 22, gaps: [0, 1, 11] };

const FEEDERS: [number, number][] = [
  [-14, 8],
  [12, 12],
  [2, -15],
];
const FEEDER_RANGE = 11;

export interface SetPieceState {
  sierra: { state: 'idle' | 'feeders' | 'boss' | 'reclaimed'; feeders: Entity[]; boss: Entity | null; wave: number; aura: number };
  maw: { state: 'idle' | 'fight' | 'defeated'; boss: Entity | null; gates: Entity[]; leftAt: number };
}

export function createSetPieces(): SetPieceState {
  return {
    sierra: { state: 'idle', feeders: [], boss: null, wave: 0, aura: 0 },
    maw: { state: 'idle', boss: null, gates: [], leftAt: 0 },
  };
}

/** Reclaimed strongholds act as hubs. */
export function extraHubs(zone: ZoneRuntime): HubDef[] {
  return zone.def.id === ZONE_ID && zone.found.has(SIERRA.id) ? [SIERRA_HUB] : [];
}

/** After loading: reclaimed or defeated set pieces stay that way. */
export function syncSetPieces(world: World, zone: ZoneRuntime): void {
  const sp = zone.setPieces;
  for (const e of [...sp.sierra.feeders, ...sp.maw.gates]) if (world.isAlive(e)) world.destroyDeferred(e);
  for (const e of [sp.sierra.boss, sp.maw.boss]) if (e !== null && world.isAlive(e)) world.destroyDeferred(e);
  zone.setPieces = createSetPieces();
  if (zone.found.has(SIERRA.id)) zone.setPieces.sierra.state = 'reclaimed';
  if (zone.found.has(MAW.id)) zone.setPieces.maw.state = 'defeated';
}

function restorationPoint(ctx: GameContext, key: string): void {
  if (!ctx.account || !ctx.zone) return;
  const entry = (ctx.account.restoration[ctx.zone.def.id] ??= { points: [], tiers: 0 });
  if (!entry.points.includes(key)) entry.points.push(key);
}

export function setPieceSystem(world: World, dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  if (!zone || ctx.instance || zone.def.id !== ZONE_ID) return;
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined || world.has(player, Dead)) return;
  const ptr = world.req(player, Transform);
  sierra(world, dt, ctx, zone, ptr);
  maw(world, ctx, zone, ptr);
}

function sierra(world: World, dt: number, ctx: GameContext, zone: ZoneRuntime, ptr: Transform): void {
  const st = zone.setPieces.sierra;
  const d = Math.hypot(ptr.x - SIERRA.x, ptr.z - SIERRA.z);
  const level = monsterLevel(world, ctx) + 1;
  if (st.state === 'idle' && d < SIERRA.trigger) {
    st.state = 'feeders';
    st.wave = 3;
    for (const [dx, dz] of FEEDERS) {
      const e = world.create();
      world.add(e, Transform, makeTransform(SIERRA.x + dx, 0, SIERRA.z + dz, 0));
      world.add(e, Renderable, { assetId: 'prop.spore_feeder', glow: '#7dff5a' });
      world.add(e, Faction, { team: 'enemy' });
      const life = 320 * (1 + 0.15 * (level - 1));
      world.add(e, Health, { current: life, max: life });
      world.add(e, Collider, { radius: 1.2, mass: Infinity, layer: 'ground', isStatic: true });
      world.add(e, Targetable, {});
      st.feeders.push(e);
    }
    ctx.events.push({ type: 'banner', key: 'setPieces.sierra.start', seconds: 2.6 });
  }
  if (st.state === 'feeders') {
    const alive = st.feeders.filter((f) => world.isAlive(f) && !world.has(f, Dead));
    // Feeders empower defenders near them.
    st.aura -= dt;
    if (st.aura <= 0) {
      st.aura = 1;
      for (const f of alive) {
        const ft = world.req(f, Transform);
        for (const e of world.query(EnemyAI, Transform)) {
          if (world.has(e, Dead)) continue;
          const et = world.req(e, Transform);
          if (Math.hypot(et.x - ft.x, et.z - ft.z) <= FEEDER_RANGE) applyStatus(world, ctx, e, { status: 'overcharge', duration: 1.5 }, { team: 'enemy', level });
        }
      }
    }
    // Reinforcements while the feeders live.
    st.wave -= dt;
    if (st.wave <= 0 && alive.length && d < SIERRA.radius + 20) {
      st.wave = 14;
      for (let i = 0; i < 4; i++) {
        const a = ctx.rng.range(0, Math.PI * 2);
        const enemy = i === 0 ? 'security_drone' : 'infected_colonist';
        const e = spawnEnemy(world, enemy, SIERRA.x + Math.sin(a) * 26, SIERRA.z + Math.cos(a) * 26, { level });
        world.req(e, EnemyAI).aggro = true;
      }
    }
    if (alive.length === 0) {
      st.state = 'boss';
      st.boss = spawnBoss(world, SIERRA.x, SIERRA.z, {
        enemy: 'commandant_hale',
        name: 'enemies.named.hale',
        level,
        lifeMul: 1 + 0.12 * (level - 1),
        damageMul: 1,
        affixes: ['shielded'],
        script: 'hale',
        arena: { x: SIERRA.x, z: SIERRA.z, radius: SIERRA.radius - 3 },
      });
      world.req(st.boss, EnemyAI).aggro = true;
      ctx.events.push({ type: 'banner', key: 'enemies.named.hale', seconds: 2.4 });
    }
  }
  if (st.state === 'boss' && st.boss !== null && world.has(st.boss, Dead)) {
    st.state = 'reclaimed';
    zone.found.add(SIERRA.id);
    zone.discovered.add('tp.sierra');
    signal(ctx, { type: 'objective', id: SIERRA.id });
    restorationPoint(ctx, `stronghold:${SIERRA.id}`);
    const tr = world.req(st.boss, Transform);
    ctx.rewards.push({ table: 'dt.boss', level, x: tr.x, z: tr.z, xp: false, rarity: 'legendary' });
    ctx.events.push({ type: 'banner', key: 'setPieces.sierra.reclaimed', seconds: 3 });
  }
}

function gateAt(world: World, i: number): Entity {
  const a = (i / MAW.segments) * Math.PI * 2;
  const e = world.create();
  world.add(e, Transform, makeTransform(MAW.x + Math.sin(a) * MAW.radius, 0, MAW.z + Math.cos(a) * MAW.radius, a + Math.PI / 2));
  world.add(e, Renderable, { assetId: 'prop.barricade', scale: 1.25, glow: '#ff3a2a' });
  world.add(e, Collider, { radius: 3.2, mass: Infinity, layer: 'ground', isStatic: true });
  return e;
}

function maw(world: World, ctx: GameContext, zone: ZoneRuntime, ptr: Transform): void {
  const st = zone.setPieces.maw;
  const d = Math.hypot(ptr.x - MAW.x, ptr.z - MAW.z);
  const level = Math.max(monsterLevel(world, ctx), ctx.zoneLevels[1]);
  // A defeated First rises again a while after you leave (it can be farmed).
  if (st.state === 'defeated' && d > 80 && st.leftAt === 0) st.leftAt = ctx.time;
  if (st.state === 'defeated' && st.leftAt > 0 && ctx.time - st.leftAt > 600) {
    st.state = 'idle';
    st.leftAt = 0;
  }
  if (st.state === 'idle' && d < MAW.trigger) {
    st.state = 'fight';
    if (st.boss === null || !world.isAlive(st.boss) || world.has(st.boss, Dead)) {
      st.boss = spawnBoss(world, MAW.x, MAW.z + 6, {
        enemy: 'the_first',
        name: 'enemies.named.the_first',
        level,
        lifeMul: 1,
        damageMul: 1,
        affixes: [],
        script: 'the_first',
        arena: { x: MAW.x, z: MAW.z, radius: MAW.radius - 2 },
      });
    }
    world.req(st.boss, EnemyAI).aggro = true;
    st.gates = MAW.gaps.map((i) => gateAt(world, i));
    ctx.events.push({ type: 'banner', key: 'bosses.the_first.intro', seconds: 3 });
    ctx.events.push({ type: 'shake', trauma: 0.6 });
  }
  if (st.state === 'fight' && st.boss !== null && world.has(st.boss, Dead)) {
    st.state = 'defeated';
    st.leftAt = 0;
    for (const g of st.gates) world.destroyDeferred(g);
    st.gates = [];
    const first = !zone.found.has(MAW.id);
    zone.found.add(MAW.id);
    signal(ctx, { type: 'objective', id: MAW.id });
    restorationPoint(ctx, `boss:${MAW.id}`);
    const tr = world.req(st.boss, Transform);
    // A guaranteed legendary the first time (docs/world-and-gameplay.md §9.6).
    ctx.rewards.push({ table: 'dt.boss', level, x: tr.x, z: tr.z, xp: false, ...(first ? { rarity: 'legendary' as const } : {}) });
    ctx.events.push({ type: 'banner', key: 'setPieces.maw.defeated', seconds: 3 });
  }
}

/** The player died: an ongoing boss fight resets and the gates open. */
export function setPiecesOnDeath(world: World, zone: ZoneRuntime | undefined): void {
  if (!zone) return;
  const st = zone.setPieces.maw;
  if (st.state === 'fight') {
    for (const g of st.gates) world.destroyDeferred(g);
    st.gates = [];
    st.state = 'idle';
    if (st.boss !== null) resetBoss(world, st.boss);
  }
  const s = zone.setPieces.sierra;
  if (s.state === 'boss' && s.boss !== null) resetBoss(world, s.boss);
}
