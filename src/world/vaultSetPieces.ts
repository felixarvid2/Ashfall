/**
 * Hydroponic Vaults set pieces (docs/regions/hydroponic-vaults.md):
 * - Dome Gamma: five Root Nodes hold the dome; each one destroyed provokes a bigger counter-wave.
 *   With all five gone the Gamma Bloom rises. Reclaimed, it becomes a hub with a teleporter.
 * - The Great Dome: the Warden, behind gates that close for the fight.
 */
import { Collider, Dead, DisplayName, EnemyAI, Faction, Health, Renderable, Targetable, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { HubDef } from '../data/zones/zoneTypes';
import { GAMMA, GREAT_DOME } from '../data/zones/hydroponicVaults';
import { resetBoss, spawnBoss } from '../systems/boss';
import { monsterLevel } from '../systems/encounter';
import { signal } from '../systems/quests';
import { spawnEnemy } from './spawn';
import type { ZoneRuntime } from './zone';

export const VAULTS_ID = 'zone.hydroponic_vaults';
export const GAMMA_HUB: HubDef = { id: 'hub.gamma', x: GAMMA.x, z: GAMMA.z, radius: 28 };
export const GAMMA_TUNING = {
  trigger: 26,
  nodes: 5,
  ring: 17,
  nodeLife: 520,
  /** Counter-wave after the n-th node falls (escalating). */
  waves: [
    [['overgrown_walker', 2], ['spore_swarm', 2]],
    [['overgrown_walker', 2], ['mossborn', 2]],
    [['vine_weaver', 1], ['overgrown_walker', 3], ['spore_swarm', 2]],
    [['mutated_botanist', 1], ['mossborn', 3], ['swarm_bloater', 1]],
    [['cocoon_warden', 1], ['overgrown_walker', 4], ['mossborn', 2]],
  ] as [string, number][][],
  spawnRadius: 30,
  /** Seconds of quiet between nodes before the dome sends patrols at you anyway. */
  idleWave: 22,
};
const WARDEN_GATES = { segments: 22, gaps: [10, 11] };

export interface VaultSetPieces {
  gamma: { state: 'idle' | 'nodes' | 'boss' | 'reclaimed'; nodes: Entity[]; enemies: Entity[]; fallen: number; timer: number; boss: Entity | null };
  warden: { state: 'idle' | 'fight' | 'defeated'; boss: Entity | null; gates: Entity[]; leftAt: number };
}

export function createVaultSetPieces(): VaultSetPieces {
  return {
    gamma: { state: 'idle', nodes: [], enemies: [], fallen: 0, timer: 0, boss: null },
    warden: { state: 'idle', boss: null, gates: [], leftAt: 0 },
  };
}

export function vaultHubs(zone: ZoneRuntime): HubDef[] {
  return zone.def.id === VAULTS_ID && zone.found.has(GAMMA.id) ? [GAMMA_HUB] : [];
}

/** After loading or entering: reclaimed or defeated stays that way; anything in progress resets. */
export function syncVaults(world: World, zone: ZoneRuntime): VaultSetPieces {
  const old = zone.setPieces.vaults;
  if (old) {
    for (const e of [...old.gamma.nodes, ...old.gamma.enemies, ...old.warden.gates]) if (world.isAlive(e)) world.destroyDeferred(e);
    for (const e of [old.gamma.boss, old.warden.boss]) if (e !== null && world.isAlive(e)) world.destroyDeferred(e);
  }
  const sp = createVaultSetPieces();
  if (zone.found.has(GAMMA.id)) sp.gamma.state = 'reclaimed';
  if (zone.found.has(GREAT_DOME.id)) sp.warden.state = 'defeated';
  return sp;
}

function restorationPoint(ctx: GameContext, key: string): void {
  if (!ctx.account || !ctx.zone) return;
  const entry = (ctx.account.restoration[ctx.zone.def.id] ??= { points: [], tiers: 0 });
  if (!entry.points.includes(key)) entry.points.push(key);
}

export function vaultSystem(world: World, dt: number, ctx: GameContext, zone: ZoneRuntime, ptr: Transform): void {
  const sp = (zone.setPieces.vaults ??= createVaultSetPieces());
  gamma(world, dt, ctx, zone, sp, ptr);
  warden(world, ctx, zone, sp, ptr);
}

const alive = (world: World, e: Entity) => world.isAlive(e) && !world.has(e, Dead);

function rootNode(world: World, x: number, z: number, life: number): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: 'prop.spore_nest', scale: 1.3, glow: '#7dff5a' });
  world.add(e, Faction, { team: 'enemy' });
  world.add(e, Health, { current: life, max: life });
  world.add(e, Collider, { radius: 1.4, mass: Infinity, layer: 'ground', isStatic: true });
  world.add(e, Targetable, {});
  world.add(e, DisplayName, { key: 'enemies.rootNode' });
  return e;
}

function wave(world: World, ctx: GameContext, st: VaultSetPieces['gamma'], list: [string, number][], level: number): void {
  for (const [enemy, count] of list) {
    for (let i = 0; i < count; i++) {
      const a = ctx.rng.range(0, Math.PI * 2);
      const e = spawnEnemy(world, enemy, GAMMA.x + Math.sin(a) * GAMMA_TUNING.spawnRadius, GAMMA.z + Math.cos(a) * GAMMA_TUNING.spawnRadius, { level });
      world.req(e, EnemyAI).aggro = true;
      st.enemies.push(e);
    }
  }
}

function gamma(world: World, dt: number, ctx: GameContext, zone: ZoneRuntime, sp: VaultSetPieces, ptr: Transform): void {
  const st = sp.gamma;
  const T = GAMMA_TUNING;
  const d = Math.hypot(ptr.x - GAMMA.x, ptr.z - GAMMA.z);
  const level = monsterLevel(world, ctx) + 1;
  if (st.state === 'idle' && d < T.trigger) {
    st.state = 'nodes';
    st.fallen = 0;
    st.timer = T.idleWave;
    const life = T.nodeLife * (1 + 0.15 * (level - 1));
    st.nodes = Array.from({ length: T.nodes }, (_, i) => {
      const a = (i / T.nodes) * Math.PI * 2 + 0.3;
      return rootNode(world, GAMMA.x + Math.sin(a) * T.ring, GAMMA.z + Math.cos(a) * T.ring, life);
    });
    ctx.events.push({ type: 'banner', key: 'setPieces.gamma.start', seconds: 2.8 });
  }
  if (st.state === 'nodes') {
    st.enemies = st.enemies.filter((e) => alive(world, e));
    const standing = st.nodes.filter((n) => alive(world, n));
    const fallen = T.nodes - standing.length;
    // Each node that falls answers with a bigger wave.
    while (st.fallen < fallen) {
      wave(world, ctx, st, T.waves[Math.min(st.fallen, T.waves.length - 1)]!, level);
      st.fallen++;
      st.timer = T.idleWave;
      ctx.events.push({ type: 'banner', key: 'setPieces.gamma.node', params: { n: st.fallen, count: T.nodes }, seconds: 2 });
    }
    st.timer -= dt;
    if (st.timer <= 0 && standing.length && d < GAMMA.radius + 20 && st.enemies.length < 4) {
      st.timer = T.idleWave;
      wave(world, ctx, st, [['overgrown_walker', 2]], level);
    }
    if (d > GAMMA.radius + 60) {
      // Walked away: the dome grows back.
      for (const e of [...st.nodes, ...st.enemies]) if (world.isAlive(e)) world.destroyDeferred(e);
      st.nodes = [];
      st.enemies = [];
      st.state = 'idle';
      return;
    }
    if (!standing.length && st.enemies.length === 0) {
      st.state = 'boss';
      st.boss = spawnBoss(world, GAMMA.x, GAMMA.z, {
        enemy: 'gamma_bloom',
        name: 'enemies.named.gamma_bloom',
        level,
        lifeMul: 1 + 0.12 * (level - 1),
        damageMul: 1,
        affixes: ['sporeSpreader'],
        script: 'gamma_bloom',
        arena: { x: GAMMA.x, z: GAMMA.z, radius: GAMMA.radius - 3 },
      });
      world.req(st.boss, EnemyAI).aggro = true;
      ctx.events.push({ type: 'banner', key: 'enemies.named.gamma_bloom', seconds: 2.4 });
      ctx.events.push({ type: 'shake', trauma: 0.5 });
    }
  }
  if (st.state === 'boss' && st.boss !== null && world.has(st.boss, Dead)) {
    st.state = 'reclaimed';
    zone.found.add(GAMMA.id);
    zone.discovered.add('tp.gamma');
    signal(ctx, { type: 'objective', id: GAMMA.id });
    restorationPoint(ctx, `stronghold:${GAMMA.id}`);
    const tr = world.req(st.boss, Transform);
    ctx.rewards.push({ table: 'dt.boss', level, x: tr.x, z: tr.z, xp: false, rarity: 'legendary' });
    for (const e of st.enemies) if (world.isAlive(e)) world.destroyDeferred(e);
    st.enemies = [];
    ctx.events.push({ type: 'banner', key: 'setPieces.gamma.reclaimed', seconds: 3 });
    ctx.events.push({ type: 'interact', kind: 'reclaimed', id: GAMMA.id });
  }
}

function gateAt(world: World, i: number): Entity {
  const a = (i / WARDEN_GATES.segments) * Math.PI * 2;
  const e = world.create();
  world.add(e, Transform, makeTransform(GREAT_DOME.x + Math.sin(a) * GREAT_DOME.radius, 0, GREAT_DOME.z + Math.cos(a) * GREAT_DOME.radius, a + Math.PI / 2));
  world.add(e, Renderable, { assetId: 'prop.barricade', scale: 1.25, glow: '#7dff5a' });
  world.add(e, Collider, { radius: 3.2, mass: Infinity, layer: 'ground', isStatic: true });
  return e;
}

function warden(world: World, ctx: GameContext, zone: ZoneRuntime, sp: VaultSetPieces, ptr: Transform): void {
  const st = sp.warden;
  const d = Math.hypot(ptr.x - GREAT_DOME.x, ptr.z - GREAT_DOME.z);
  const level = Math.max(monsterLevel(world, ctx), ctx.zoneLevels[1]);
  // Like the other region bosses, it returns a while after you leave.
  if (st.state === 'defeated' && d > 80 && st.leftAt === 0) st.leftAt = ctx.time;
  if (st.state === 'defeated' && st.leftAt > 0 && ctx.time - st.leftAt > 600) {
    st.state = 'idle';
    st.leftAt = 0;
  }
  if (st.state === 'idle' && d < GREAT_DOME.radius - 8) {
    st.state = 'fight';
    if (st.boss === null || !world.isAlive(st.boss) || world.has(st.boss, Dead)) {
      st.boss = spawnBoss(world, GREAT_DOME.x, GREAT_DOME.z + 12, {
        enemy: 'warden',
        name: 'enemies.named.warden',
        level,
        lifeMul: 1,
        damageMul: 1,
        affixes: [],
        script: 'warden',
        arena: { x: GREAT_DOME.x, z: GREAT_DOME.z, radius: GREAT_DOME.radius - 2 },
      });
    }
    world.req(st.boss, EnemyAI).aggro = true;
    st.gates = WARDEN_GATES.gaps.map((i) => gateAt(world, i));
    ctx.events.push({ type: 'banner', key: 'bosses.warden.intro', seconds: 3 });
    ctx.events.push({ type: 'shake', trauma: 0.6 });
  }
  if (st.state === 'fight' && st.boss !== null && world.has(st.boss, Dead)) {
    st.state = 'defeated';
    st.leftAt = 0;
    for (const g of st.gates) world.destroyDeferred(g);
    st.gates = [];
    const first = !zone.found.has(GREAT_DOME.id);
    zone.found.add(GREAT_DOME.id);
    signal(ctx, { type: 'objective', id: GREAT_DOME.id });
    restorationPoint(ctx, `boss:${GREAT_DOME.id}`);
    const tr = world.req(st.boss, Transform);
    ctx.rewards.push({ table: 'dt.boss', level, x: tr.x, z: tr.z, xp: false, ...(first ? { rarity: 'legendary' as const } : {}) });
    ctx.events.push({ type: 'banner', key: 'setPieces.warden.defeated', seconds: 3 });
  }
}

/** The player died: the Warden's fight resets with the gates open; the Gamma Bloom heals up. */
export function vaultsOnDeath(world: World, zone: ZoneRuntime): void {
  const sp = zone.setPieces.vaults;
  if (!sp) return;
  if (sp.warden.state === 'fight') {
    for (const g of sp.warden.gates) world.destroyDeferred(g);
    sp.warden.gates = [];
    sp.warden.state = 'idle';
    if (sp.warden.boss !== null) resetBoss(world, sp.warden.boss);
  }
  if (sp.gamma.state === 'boss' && sp.gamma.boss !== null) resetBoss(world, sp.gamma.boss);
}
