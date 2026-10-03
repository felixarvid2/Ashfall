/**
 * Refinery District set pieces (docs/regions/refinery-district.md):
 * - Pump Station Delta: defend three technicians through four waves while they unlock the cooling,
 *   then Brother Ash. Reclaimed, it becomes a hub with a teleporter.
 * - The Smelters' Cathedral: High Priestess Vire behind gates that close for the fight.
 */
import { Collider, Dead, DisplayName, EnemyAI, Faction, Health, Renderable, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { HubDef } from '../data/zones/zoneTypes';
import { CATHEDRAL, DELTA } from '../data/zones/refineryDistrict';
import { resetBoss, spawnBoss } from '../systems/boss';
import { monsterLevel } from '../systems/encounter';
import { signal } from '../systems/quests';
import { spawnEnemy } from './spawn';
import type { ZoneRuntime } from './zone';

export const DISTRICT_ID = 'zone.refinery_district';
export const DELTA_HUB: HubDef = { id: 'hub.delta', x: DELTA.x, z: DELTA.z, radius: 26 };
export const DELTA_TUNING = {
  trigger: 22,
  technicians: [[-8, 6], [7, 8], [2, -9]] as [number, number][],
  technicianLife: 600,
  /** Seconds between waves (or sooner, once a wave is cleared). */
  waveEvery: 24,
  waves: [
    [['smelter', 2], ['welder', 2]],
    [['smelter', 2], ['welder', 2], ['flame_drone', 2]],
    [['smelter', 3], ['scorched_walker', 3], ['smelter_priest', 1]],
    [['cargo_loader', 1], ['welder', 2], ['smelter', 2]],
  ] as [string, number][][],
  spawnRadius: 34,
};
const VIRE_GATES = { segments: 20, gaps: [10, 11] };

export interface DistrictSetPieces {
  delta: { state: 'idle' | 'defend' | 'boss' | 'reclaimed'; technicians: Entity[]; wave: number; timer: number; enemies: Entity[]; boss: Entity | null };
  vire: { state: 'idle' | 'fight' | 'defeated'; boss: Entity | null; gates: Entity[]; leftAt: number };
}

export function createDistrictSetPieces(): DistrictSetPieces {
  return {
    delta: { state: 'idle', technicians: [], wave: 0, timer: 0, enemies: [], boss: null },
    vire: { state: 'idle', boss: null, gates: [], leftAt: 0 },
  };
}

export function districtHubs(zone: ZoneRuntime): HubDef[] {
  return zone.def.id === DISTRICT_ID && zone.found.has(DELTA.id) ? [DELTA_HUB] : [];
}

/** After loading or entering: reclaimed or defeated stays that way; anything in progress resets. */
export function syncDistrict(world: World, zone: ZoneRuntime): DistrictSetPieces {
  const old = zone.setPieces.district;
  if (old) {
    const all = [...old.delta.technicians, ...old.delta.enemies, ...old.vire.gates];
    for (const e of all) if (world.isAlive(e)) world.destroyDeferred(e);
    for (const e of [old.delta.boss, old.vire.boss]) if (e !== null && world.isAlive(e)) world.destroyDeferred(e);
  }
  const sp = createDistrictSetPieces();
  if (zone.found.has(DELTA.id)) sp.delta.state = 'reclaimed';
  if (zone.found.has(CATHEDRAL.id)) sp.vire.state = 'defeated';
  return sp;
}

function restorationPoint(ctx: GameContext, key: string): void {
  if (!ctx.account || !ctx.zone) return;
  const entry = (ctx.account.restoration[ctx.zone.def.id] ??= { points: [], tiers: 0 });
  if (!entry.points.includes(key)) entry.points.push(key);
}

export function districtSystem(world: World, dt: number, ctx: GameContext, zone: ZoneRuntime, ptr: Transform): void {
  const sp = (zone.setPieces.district ??= createDistrictSetPieces());
  delta(world, dt, ctx, zone, sp, ptr);
  vire(world, ctx, zone, sp, ptr);
}

function technician(world: World, x: number, z: number, life: number): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: 'npc.technician', glow: '#7ad8ff' });
  world.add(e, Faction, { team: 'player' });
  world.add(e, Health, { current: life, max: life });
  world.add(e, Collider, { radius: 0.45, mass: Infinity, layer: 'ground', isStatic: true });
  world.add(e, DisplayName, { key: 'setPieces.delta.technician' });
  return e;
}

const alive = (world: World, e: Entity) => world.isAlive(e) && !world.has(e, Dead);

function delta(world: World, dt: number, ctx: GameContext, zone: ZoneRuntime, sp: DistrictSetPieces, ptr: Transform): void {
  const st = sp.delta;
  const T = DELTA_TUNING;
  const d = Math.hypot(ptr.x - DELTA.x, ptr.z - DELTA.z);
  const level = monsterLevel(world, ctx) + 1;
  if (st.state === 'idle' && d < T.trigger) {
    st.state = 'defend';
    st.wave = 0;
    st.timer = 4;
    const life = T.technicianLife * (1 + 0.15 * (level - 1));
    st.technicians = T.technicians.map(([dx, dz]) => technician(world, DELTA.x + dx, DELTA.z + dz, life));
    ctx.events.push({ type: 'banner', key: 'setPieces.delta.start', seconds: 2.8 });
  }
  if (st.state === 'defend') {
    const standing = st.technicians.filter((t) => alive(world, t));
    if (standing.length === 0) {
      // Everyone fell: the Smelters keep the station; try again later.
      for (const e of st.enemies) if (world.isAlive(e)) world.destroyDeferred(e);
      st.enemies = [];
      st.technicians = [];
      st.state = 'idle';
      ctx.events.push({ type: 'banner', key: 'setPieces.delta.failed', seconds: 2.8 });
      return;
    }
    st.enemies = st.enemies.filter((e) => alive(world, e));
    st.timer -= dt;
    const cleared = st.wave > 0 && st.enemies.length === 0;
    if (st.wave < T.waves.length && (st.timer <= 0 || cleared)) {
      const wave = T.waves[st.wave]!;
      st.wave++;
      st.timer = T.waveEvery;
      for (const [enemy, count] of wave) {
        for (let i = 0; i < count; i++) {
          const a = ctx.rng.range(0, Math.PI * 2);
          const e = spawnEnemy(world, enemy, DELTA.x + Math.sin(a) * T.spawnRadius, DELTA.z + Math.cos(a) * T.spawnRadius, { level });
          world.req(e, EnemyAI).aggro = true;
          st.enemies.push(e);
        }
      }
      ctx.events.push({ type: 'banner', key: 'setPieces.delta.wave', params: { n: st.wave, count: T.waves.length }, seconds: 2 });
    } else if (st.wave >= T.waves.length && st.enemies.length === 0) {
      st.state = 'boss';
      st.boss = spawnBoss(world, DELTA.x, DELTA.z + 10, {
        enemy: 'brother_ash',
        name: 'enemies.named.brother_ash',
        level,
        lifeMul: 1 + 0.12 * (level - 1),
        damageMul: 1,
        affixes: ['shielded'],
        script: 'brother_ash',
        arena: { x: DELTA.x, z: DELTA.z, radius: DELTA.radius - 3 },
      });
      world.req(st.boss, EnemyAI).aggro = true;
      ctx.events.push({ type: 'banner', key: 'enemies.named.brother_ash', seconds: 2.4 });
    }
  }
  if (st.state === 'boss' && st.boss !== null && world.has(st.boss, Dead)) {
    st.state = 'reclaimed';
    zone.found.add(DELTA.id);
    zone.discovered.add('tp.delta');
    signal(ctx, { type: 'objective', id: DELTA.id });
    restorationPoint(ctx, `stronghold:${DELTA.id}`);
    const tr = world.req(st.boss, Transform);
    ctx.rewards.push({ table: 'dt.boss', level, x: tr.x, z: tr.z, xp: false, rarity: 'legendary' });
    for (const t of st.technicians) if (world.isAlive(t)) world.destroyDeferred(t);
    st.technicians = [];
    ctx.events.push({ type: 'banner', key: 'setPieces.delta.reclaimed', seconds: 3 });
    ctx.events.push({ type: 'interact', kind: 'reclaimed', id: DELTA.id });
  }
}

function gateAt(world: World, i: number): Entity {
  const a = (i / VIRE_GATES.segments) * Math.PI * 2;
  const e = world.create();
  world.add(e, Transform, makeTransform(CATHEDRAL.x + Math.sin(a) * CATHEDRAL.radius, 0, CATHEDRAL.z + Math.cos(a) * CATHEDRAL.radius, a + Math.PI / 2));
  world.add(e, Renderable, { assetId: 'prop.barricade', scale: 1.25, glow: '#ff6a1a' });
  world.add(e, Collider, { radius: 3.2, mass: Infinity, layer: 'ground', isStatic: true });
  return e;
}

function vire(world: World, ctx: GameContext, zone: ZoneRuntime, sp: DistrictSetPieces, ptr: Transform): void {
  const st = sp.vire;
  const d = Math.hypot(ptr.x - CATHEDRAL.x, ptr.z - CATHEDRAL.z);
  const level = Math.max(monsterLevel(world, ctx), ctx.zoneLevels[1]);
  // Like The First, she returns a while after you leave.
  if (st.state === 'defeated' && d > 80 && st.leftAt === 0) st.leftAt = ctx.time;
  if (st.state === 'defeated' && st.leftAt > 0 && ctx.time - st.leftAt > 600) {
    st.state = 'idle';
    st.leftAt = 0;
  }
  if (st.state === 'idle' && d < CATHEDRAL.radius - 8) {
    st.state = 'fight';
    if (st.boss === null || !world.isAlive(st.boss) || world.has(st.boss, Dead)) {
      st.boss = spawnBoss(world, CATHEDRAL.x, CATHEDRAL.z + 12, {
        enemy: 'vire',
        name: 'enemies.named.vire',
        level,
        lifeMul: 1,
        damageMul: 1,
        affixes: [],
        script: 'vire',
        arena: { x: CATHEDRAL.x, z: CATHEDRAL.z, radius: CATHEDRAL.radius - 2 },
      });
    }
    world.req(st.boss, EnemyAI).aggro = true;
    st.gates = VIRE_GATES.gaps.map((i) => gateAt(world, i));
    ctx.events.push({ type: 'banner', key: 'bosses.vire.intro', seconds: 3 });
    ctx.events.push({ type: 'shake', trauma: 0.6 });
  }
  if (st.state === 'fight' && st.boss !== null && world.has(st.boss, Dead)) {
    st.state = 'defeated';
    st.leftAt = 0;
    for (const g of st.gates) world.destroyDeferred(g);
    st.gates = [];
    const first = !zone.found.has(CATHEDRAL.id);
    zone.found.add(CATHEDRAL.id);
    signal(ctx, { type: 'objective', id: CATHEDRAL.id });
    restorationPoint(ctx, `boss:${CATHEDRAL.id}`);
    const tr = world.req(st.boss, Transform);
    ctx.rewards.push({ table: 'dt.boss', level, x: tr.x, z: tr.z, xp: false, ...(first ? { rarity: 'legendary' as const } : {}) });
    ctx.events.push({ type: 'banner', key: 'setPieces.vire.defeated', seconds: 3 });
  }
}

/** The player died: Vire's fight resets with the gates open; Delta's defence keeps going. */
export function districtOnDeath(world: World, zone: ZoneRuntime): void {
  const sp = zone.setPieces.district;
  if (!sp) return;
  if (sp.vire.state === 'fight') {
    for (const g of sp.vire.gates) world.destroyDeferred(g);
    sp.vire.gates = [];
    sp.vire.state = 'idle';
    if (sp.vire.boss !== null) resetBoss(world, sp.vire.boss);
  }
  if (sp.delta.state === 'boss' && sp.delta.boss !== null) resetBoss(world, sp.delta.boss);
}
