/**
 * Deep Mines set pieces (docs/regions/deep-mines.md):
 * - Mining Station Aurum: three shield generators make the governor's security near them
 *   invulnerable; break them through the counterattacks, then Security Chief Holm. Reclaimed, the
 *   station becomes a hub with a teleporter.
 * - Drill Control: Governor Kade, with the tunnel mouths barred for the fight.
 */
import { Collider, Dead, DisplayName, EnemyAI, Faction, Health, Renderable, Targetable, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { HubDef } from '../data/zones/zoneTypes';
import { AURUM, DEEP_MINES, DRILL_CONTROL } from '../data/zones/deepMines';
import { resetBoss, spawnBoss } from '../systems/boss';
import { applyStatus } from '../systems/combat';
import { monsterLevel } from '../systems/encounter';
import { signal } from '../systems/quests';
import { spawnEnemy } from './spawn';
import type { ZoneRuntime } from './zone';

export const MINES_ID = 'zone.deep_mines';
export const AURUM_HUB: HubDef = { id: 'hub.aurum', x: AURUM.x, z: AURUM.z, radius: 26 };
export const AURUM_TUNING = {
  trigger: AURUM.radius - 4,
  generators: 3,
  ring: 0.55,
  generatorLife: 700,
  /** Defenders within this distance of a standing generator cannot be hurt. */
  shieldRadius: 13,
  waveEvery: 18,
  wave: [['security_trooper', 3], ['shield_officer', 1], ['governor_drone', 1]] as [string, number][],
  spawnRadius: 20,
};

export interface MineSetPieces {
  aurum: { state: 'idle' | 'assault' | 'boss' | 'reclaimed'; generators: Entity[]; enemies: Entity[]; timer: number; aura: number; boss: Entity | null };
  kade: { state: 'idle' | 'fight' | 'defeated'; boss: Entity | null; gates: Entity[]; leftAt: number };
}

export function createMineSetPieces(): MineSetPieces {
  return {
    aurum: { state: 'idle', generators: [], enemies: [], timer: 0, aura: 0, boss: null },
    kade: { state: 'idle', boss: null, gates: [], leftAt: 0 },
  };
}

export function mineHubs(zone: ZoneRuntime): HubDef[] {
  return zone.def.id === MINES_ID && zone.found.has(AURUM.id) ? [AURUM_HUB] : [];
}

export function syncMines(world: World, zone: ZoneRuntime): MineSetPieces {
  const old = zone.setPieces.mines;
  if (old) {
    for (const e of [...old.aurum.generators, ...old.aurum.enemies, ...old.kade.gates]) if (world.isAlive(e)) world.destroyDeferred(e);
    for (const e of [old.aurum.boss, old.kade.boss]) if (e !== null && world.isAlive(e)) world.destroyDeferred(e);
  }
  const sp = createMineSetPieces();
  if (zone.found.has(AURUM.id)) sp.aurum.state = 'reclaimed';
  if (zone.found.has(DRILL_CONTROL.id)) sp.kade.state = 'defeated';
  return sp;
}

function restorationPoint(ctx: GameContext, key: string): void {
  if (!ctx.account || !ctx.zone) return;
  const entry = (ctx.account.restoration[ctx.zone.def.id] ??= { points: [], tiers: 0 });
  if (!entry.points.includes(key)) entry.points.push(key);
}

export function mineSystem(world: World, dt: number, ctx: GameContext, zone: ZoneRuntime, ptr: Transform): void {
  const sp = (zone.setPieces.mines ??= createMineSetPieces());
  aurum(world, dt, ctx, zone, sp, ptr);
  kade(world, ctx, zone, sp, ptr);
}

const alive = (world: World, e: Entity) => world.isAlive(e) && !world.has(e, Dead);

function generator(world: World, x: number, z: number, life: number): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: 'prop.compressor', scale: 1.4, glow: '#6ab8ff' });
  world.add(e, Faction, { team: 'enemy' });
  world.add(e, Health, { current: life, max: life });
  world.add(e, Collider, { radius: 1.4, mass: Infinity, layer: 'ground', isStatic: true });
  world.add(e, Targetable, {});
  world.add(e, DisplayName, { key: 'enemies.shieldGenerator' });
  return e;
}

function wave(world: World, ctx: GameContext, st: MineSetPieces['aurum'], level: number): void {
  for (const [enemy, count] of AURUM_TUNING.wave) {
    for (let i = 0; i < count; i++) {
      const a = ctx.rng.range(0, Math.PI * 2);
      const e = spawnEnemy(world, enemy, AURUM.x + Math.sin(a) * AURUM_TUNING.spawnRadius, AURUM.z + Math.cos(a) * AURUM_TUNING.spawnRadius, { level });
      world.req(e, EnemyAI).aggro = true;
      st.enemies.push(e);
    }
  }
}

function aurum(world: World, dt: number, ctx: GameContext, zone: ZoneRuntime, sp: MineSetPieces, ptr: Transform): void {
  const st = sp.aurum;
  const T = AURUM_TUNING;
  const d = Math.hypot(ptr.x - AURUM.x, ptr.z - AURUM.z);
  const level = monsterLevel(world, ctx) + 1;
  if (st.state === 'idle' && d < T.trigger) {
    st.state = 'assault';
    st.timer = T.waveEvery;
    const life = T.generatorLife * (1 + 0.15 * (level - 1));
    st.generators = Array.from({ length: T.generators }, (_, i) => {
      const a = (i / T.generators) * Math.PI * 2 + 0.5;
      return generator(world, AURUM.x + Math.sin(a) * AURUM.radius * T.ring, AURUM.z + Math.cos(a) * AURUM.radius * T.ring, life);
    });
    wave(world, ctx, st, level);
    ctx.events.push({ type: 'banner', key: 'setPieces.aurum.start', seconds: 2.8 });
  }
  if (st.state === 'assault') {
    st.enemies = st.enemies.filter((e) => alive(world, e));
    const standing = st.generators.filter((g) => alive(world, g));
    // The generators' field: defenders near one cannot be hurt.
    if ((st.aura -= dt) <= 0) {
      st.aura = 0.5;
      for (const g of standing) {
        const gt = world.req(g, Transform);
        for (const e of world.query(EnemyAI, Transform)) {
          if (world.has(e, Dead)) continue;
          const et = world.req(e, Transform);
          if (Math.hypot(et.x - gt.x, et.z - gt.z) <= T.shieldRadius) applyStatus(world, ctx, e, { status: 'aegis', duration: 0.8 }, { team: 'enemy', level });
        }
      }
    }
    if ((st.timer -= dt) <= 0 && standing.length && d < AURUM.radius + 40) {
      st.timer = T.waveEvery;
      wave(world, ctx, st, level);
    }
    if (d > AURUM.radius + 90) {
      for (const e of [...st.generators, ...st.enemies]) if (world.isAlive(e)) world.destroyDeferred(e);
      st.generators = [];
      st.enemies = [];
      st.state = 'idle';
      return;
    }
    if (!standing.length && st.enemies.length === 0) {
      st.state = 'boss';
      st.boss = spawnBoss(world, AURUM.x, AURUM.z, {
        enemy: 'security_chief_holm',
        name: 'enemies.named.holm',
        level,
        lifeMul: 1 + 0.12 * (level - 1),
        damageMul: 1,
        affixes: ['shielded'],
        script: 'holm',
        arena: { x: AURUM.x, z: AURUM.z, radius: AURUM.radius - 3 },
      });
      world.req(st.boss, EnemyAI).aggro = true;
      ctx.events.push({ type: 'banner', key: 'enemies.named.holm', seconds: 2.4 });
    }
  }
  if (st.state === 'boss' && st.boss !== null && world.has(st.boss, Dead)) {
    st.state = 'reclaimed';
    zone.found.add(AURUM.id);
    zone.discovered.add('tp.aurum');
    signal(ctx, { type: 'objective', id: AURUM.id });
    restorationPoint(ctx, `stronghold:${AURUM.id}`);
    const tr = world.req(st.boss, Transform);
    ctx.rewards.push({ table: 'dt.boss', level, x: tr.x, z: tr.z, xp: false, rarity: 'legendary' });
    for (const e of st.enemies) if (world.isAlive(e)) world.destroyDeferred(e);
    st.enemies = [];
    ctx.events.push({ type: 'banner', key: 'setPieces.aurum.reclaimed', seconds: 3 });
    ctx.events.push({ type: 'interact', kind: 'reclaimed', id: AURUM.id });
  }
}

/** Where each tunnel enters Drill Control: barred during the fight. */
export function drillControlMouths(): { x: number; z: number; rot: number; width: number }[] {
  const out: { x: number; z: number; rot: number; width: number }[] = [];
  const R = DRILL_CONTROL.radius + 4;
  for (const road of DEEP_MINES.roads) {
    const pts = road.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const da = Math.hypot(ax - DRILL_CONTROL.x, az - DRILL_CONTROL.z);
      const db = Math.hypot(bx - DRILL_CONTROL.x, bz - DRILL_CONTROL.z);
      if ((da - R) * (db - R) > 0) continue;
      // The segment crosses the ring: find the crossing.
      const t = (da - R) / (da - db);
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, rot: Math.atan2(bx - ax, bz - az) + Math.PI / 2, width: road.width });
    }
  }
  return out;
}

function kade(world: World, ctx: GameContext, zone: ZoneRuntime, sp: MineSetPieces, ptr: Transform): void {
  const st = sp.kade;
  const d = Math.hypot(ptr.x - DRILL_CONTROL.x, ptr.z - DRILL_CONTROL.z);
  const level = Math.max(monsterLevel(world, ctx), ctx.zoneLevels[1]);
  if (st.state === 'defeated' && d > 90 && st.leftAt === 0) st.leftAt = ctx.time;
  if (st.state === 'defeated' && st.leftAt > 0 && ctx.time - st.leftAt > 600) {
    st.state = 'idle';
    st.leftAt = 0;
  }
  if (st.state === 'idle' && d < DRILL_CONTROL.radius - 8) {
    st.state = 'fight';
    if (st.boss === null || !world.isAlive(st.boss) || world.has(st.boss, Dead)) {
      st.boss = spawnBoss(world, DRILL_CONTROL.x, DRILL_CONTROL.z + 10, {
        enemy: 'governor_kade',
        name: 'enemies.named.kade',
        level,
        lifeMul: 1,
        damageMul: 1,
        affixes: [],
        script: 'kade',
        arena: { x: DRILL_CONTROL.x, z: DRILL_CONTROL.z, radius: DRILL_CONTROL.radius - 2 },
      });
    }
    world.req(st.boss, EnemyAI).aggro = true;
    st.gates = drillControlMouths().map((m) => {
      const g = world.create();
      world.add(g, Transform, makeTransform(m.x, 0, m.z, m.rot));
      world.add(g, Renderable, { assetId: 'prop.barricade', scale: 1.6, glow: '#ffd23a' });
      world.add(g, Collider, { radius: m.width / 2 + 1.5, mass: Infinity, layer: 'ground', isStatic: true });
      return g;
    });
    ctx.events.push({ type: 'banner', key: 'bosses.kade.intro', seconds: 3 });
    ctx.events.push({ type: 'shake', trauma: 0.6 });
  }
  if (st.state === 'fight' && st.boss !== null && world.has(st.boss, Dead)) {
    st.state = 'defeated';
    st.leftAt = 0;
    for (const g of st.gates) world.destroyDeferred(g);
    st.gates = [];
    const first = !zone.found.has(DRILL_CONTROL.id);
    zone.found.add(DRILL_CONTROL.id);
    signal(ctx, { type: 'objective', id: DRILL_CONTROL.id });
    restorationPoint(ctx, `boss:${DRILL_CONTROL.id}`);
    const tr = world.req(st.boss, Transform);
    ctx.rewards.push({ table: 'dt.boss', level, x: tr.x, z: tr.z, xp: false, ...(first ? { rarity: 'legendary' as const } : {}) });
    ctx.events.push({ type: 'banner', key: 'setPieces.kade.defeated', seconds: 3 });
  }
}

/** The player died: Kade's fight resets with the tunnels open; Holm heals up. */
export function minesOnDeath(world: World, zone: ZoneRuntime): void {
  const sp = zone.setPieces.mines;
  if (!sp) return;
  if (sp.kade.state === 'fight') {
    for (const g of sp.kade.gates) world.destroyDeferred(g);
    sp.kade.gates = [];
    sp.kade.state = 'idle';
    if (sp.kade.boss !== null) resetBoss(world, sp.kade.boss);
  }
  if (sp.aurum.state === 'boss' && sp.aurum.boss !== null) resetBoss(world, sp.aurum.boss);
}
