/**
 * The Elevator Base (docs/regions/the-core.md "Stronghold"): the last defence before the shaft.
 * Walk in and shades and Lumen creatures come in waves; Memory Shades of Vire, the Warden and Kade lead
 * waves 2, 4 and 6; allies from the earlier regions arrive during the first four waves and fight beside you.
 * Hold the Base and the heart causeway opens (until then it is barred), the Base becomes a fast-travel point
 * and its people move in. Modelled on Aurum's state machine (mineSetPieces.ts).
 */
import { Collider, CombatStats, Dead, DisplayName, EnemyAI, Faction, Health, MinionAI, Mover, Renderable, StatusEffects, Summon, Transform, makeTransform, PlayerControlled } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { ELEVATOR_BASE } from '../data/zones/theCore';
import { resetBoss, spawnBoss } from '../systems/boss';
import { monsterLevel } from '../systems/encounter';
import { signal } from '../systems/quests';
import { spawnEnemy } from './spawn';
import type { ZoneRuntime } from './zone';

export const CORE_ID = 'zone.the_core';

/** Where the heart causeway is narrowest (16 m wide, x -8..8): the bar across it stands here until the Base is held. */
export const CAUSEWAY_GATE = { z: 360, xs: [-6, -2, 2, 6] as number[] };

export interface BaseWave {
  enemies: [string, number][];
  /** A Memory Shade miniboss that leads the wave. */
  boss?: string;
  /** The ally (index into `allies`) who arrives with it. */
  ally?: number;
}

export const BASE_TUNING = {
  trigger: ELEVATOR_BASE.radius - 8,
  /** Seconds between a cleared wave and the next. */
  intermission: 6,
  firstWave: 4,
  spawnRadius: ELEVATOR_BASE.radius - 4,
  waves: [
    { enemies: [['shade_walker', 4], ['shade_hound', 2], ['light_mote', 5]], ally: 0 },
    { enemies: [['shade_drone', 2], ['light_being', 2]], boss: 'shade_vire', ally: 1 },
    { enemies: [['light_being', 3], ['shade_walker', 3], ['shade_sentinel', 1]], ally: 2 },
    { enemies: [['core_guardian', 1], ['shade_smelter', 2], ['shade_hound', 3]], boss: 'shade_warden', ally: 3 },
    { enemies: [['guardian_lancer', 2], ['light_being', 2], ['light_mote', 6]] },
    { enemies: [['core_guardian', 1], ['shade_drone', 3], ['shade_walker', 3]], boss: 'shade_kade' },
  ] as BaseWave[],
  /** Friends from the earlier regions: a model and a name (language key) each. */
  allies: [
    { asset: 'variant.npc_militia', name: 'setPieces.base.ally.ember' },
    { asset: 'variant.npc_osei', name: 'setPieces.base.ally.refinery' },
    { asset: 'variant.npc_dace', name: 'setPieces.base.ally.vaults' },
    { asset: 'variant.npc_gerd', name: 'setPieces.base.ally.mines' },
  ],
  /** Allies' life as a share of the player's, and the hit they land (a share of the player's weapon damage). */
  allyLife: 0.6,
  allyHit: 0.9,
};

export interface BaseState {
  state: 'idle' | 'waves' | 'cleared';
  /** Index of the wave on the field (-1 before the first). */
  wave: number;
  timer: number;
  enemies: Entity[];
  bosses: Entity[];
  allies: Entity[];
  gate: Entity[];
}

export function createBaseState(): BaseState {
  return { state: 'idle', wave: -1, timer: 0, enemies: [], bosses: [], allies: [], gate: [] };
}

/** After loading or entering: a held Base stays held; anything in progress resets. */
export function syncBase(world: World, zone: ZoneRuntime): BaseState {
  const old = zone.setPieces.base;
  if (old) for (const e of [...old.enemies, ...old.bosses, ...old.allies, ...old.gate]) if (world.isAlive(e)) world.destroyDeferred(e);
  const st = createBaseState();
  if (zone.found.has(ELEVATOR_BASE.id)) st.state = 'cleared';
  return st;
}

function restorationPoint(ctx: GameContext, key: string): void {
  if (!ctx.account || !ctx.zone) return;
  const entry = (ctx.account.restoration[ctx.zone.def.id] ??= { points: [], tiers: 0 });
  if (!entry.points.includes(key)) entry.points.push(key);
}

const alive = (world: World, e: Entity) => world.isAlive(e) && !world.has(e, Dead);

/** The bar across the causeway: barricades with colliders, like the Maw's and Drill Control's gates. */
function buildGate(world: World): Entity[] {
  return CAUSEWAY_GATE.xs.map((x) => {
    const g = world.create();
    world.add(g, Transform, makeTransform(x, 0, CAUSEWAY_GATE.z, Math.PI / 2));
    world.add(g, Renderable, { assetId: 'prop.barricade', scale: 1.1, glow: '#c8a4ff' });
    world.add(g, Collider, { radius: 2.6, mass: Infinity, layer: 'ground', isStatic: true });
    return g;
  });
}

/** A friend from an earlier region: fights for the player with the minion code (a melee guard that follows). */
export function spawnAlly(world: World, ctx: GameContext, player: Entity, index: number, x: number, z: number): Entity | null {
  const T = BASE_TUNING;
  const a = T.allies[index % T.allies.length]!;
  const stats = world.get(player, CombatStats);
  const pHealth = world.get(player, Health);
  const pMover = world.get(player, Mover);
  if (!stats || !pHealth || !pMover) return null;
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: a.asset, scale: 1, glow: '#c8a4ff' });
  world.add(e, Faction, { team: 'player' });
  const life = pHealth.max * T.allyLife;
  world.add(e, Health, { current: life, max: life });
  world.add(e, Mover, { speed: pMover.speed * 1.05, speedMul: 1, turnRate: 8, vx: 0, vz: 0 });
  world.add(e, Collider, { radius: 0.5, mass: 5, layer: 'ground', isStatic: false });
  world.add(e, CombatStats, { ...stats, tags: [], resist: {}, additive: [...stats.additive], multiplicative: [...stats.multiplicative] });
  world.add(e, StatusEffects, { list: [], canAct: true, dotTimer: 0 });
  world.add(e, DisplayName, { key: a.name });
  world.add(e, MinionAI, {
    owner: player,
    state: 'follow',
    timer: 0,
    cooldown: 0.4,
    attackCooldown: 1.0,
    attackRange: 1.5,
    windup: 0.3,
    coefficient: T.allyHit,
    damageType: 'physical',
    ranged: false,
    applies: [],
    target: null,
    attackSeq: 0,
    born: ctx.tick,
  });
  world.add(e, Summon, { owner: player, remaining: Infinity, skillId: 'ally', kind: 'minion' });
  ctx.events.push({ type: 'vfx', kind: 'blink', x, z, radius: 1.4, facing: 0 });
  ctx.events.push({ type: 'banner', key: 'setPieces.base.allyArrives', keyParams: { name: a.name }, seconds: 2 });
  return e;
}

function spawnWave(world: World, ctx: GameContext, st: BaseState, index: number, level: number, player: Entity): void {
  const T = BASE_TUNING;
  const wave = T.waves[index]!;
  const at = (i: number, n: number, r: number) => {
    const a = (i / n) * Math.PI * 2 + ctx.rng.range(0, 0.6);
    return { x: ELEVATOR_BASE.x + Math.sin(a) * r, z: ELEVATOR_BASE.z + Math.cos(a) * r };
  };
  const total = wave.enemies.reduce((n, [, c]) => n + c, 0);
  let k = 0;
  for (const [enemy, count] of wave.enemies) {
    for (let i = 0; i < count; i++) {
      const p = at(k++, total, T.spawnRadius);
      const e = spawnEnemy(world, enemy, p.x, p.z, { level });
      world.req(e, EnemyAI).aggro = true;
      st.enemies.push(e);
    }
  }
  if (wave.boss) {
    const boss = spawnBoss(world, ELEVATOR_BASE.x, ELEVATOR_BASE.z + 10, {
      enemy: wave.boss,
      name: `enemies.named.${wave.boss}`,
      level,
      lifeMul: 1,
      damageMul: 1,
      affixes: [],
      script: wave.boss,
      arena: { x: ELEVATOR_BASE.x, z: ELEVATOR_BASE.z, radius: ELEVATOR_BASE.radius - 3 },
    });
    world.req(boss, EnemyAI).aggro = true;
    st.bosses.push(boss);
    ctx.events.push({ type: 'banner', key: `enemies.named.${wave.boss}`, seconds: 2.4 });
  }
  if (wave.ally !== undefined) {
    const p = world.req(player, Transform);
    const ally = spawnAlly(world, ctx, player, wave.ally, p.x + 2, p.z + 2);
    if (ally !== null) st.allies.push(ally);
  }
  ctx.events.push({ type: 'banner', key: 'setPieces.base.wave', params: { n: index + 1, count: T.waves.length }, seconds: 2 });
}

function clearAll(world: World, st: BaseState): void {
  // Bosses first: resetting clears their guards, armour plates and other parts, which are not in `enemies`.
  for (const b of st.bosses) if (world.isAlive(b)) resetBoss(world, b);
  for (const e of [...st.enemies, ...st.bosses, ...st.allies]) if (world.isAlive(e)) world.destroyDeferred(e);
  st.enemies = [];
  st.bosses = [];
  st.allies = [];
}

export function baseSystem(world: World, dt: number, ctx: GameContext, zone: ZoneRuntime, ptr: Transform): void {
  const st = (zone.setPieces.base ??= createBaseState());
  const T = BASE_TUNING;
  const d = Math.hypot(ptr.x - ELEVATOR_BASE.x, ptr.z - ELEVATOR_BASE.z);
  const level = monsterLevel(world, ctx) + 1;

  // The causeway stays barred until the Base is held.
  if (st.state !== 'cleared' && (st.gate.length === 0 || !st.gate.every((g) => world.isAlive(g)))) {
    for (const g of st.gate) if (world.isAlive(g)) world.destroyDeferred(g);
    st.gate = buildGate(world);
  }

  if (st.state === 'idle' && d < T.trigger) {
    st.state = 'waves';
    st.wave = -1;
    st.timer = T.firstWave;
    ctx.events.push({ type: 'banner', key: 'setPieces.base.start', seconds: 2.8 });
  }
  if (st.state !== 'waves') return;

  // Walking away gives the Base up for now (what stood there is gone; the waves begin again).
  if (d > ELEVATOR_BASE.radius + 90) {
    clearAll(world, st);
    st.state = 'idle';
    return;
  }
  st.enemies = st.enemies.filter((e) => alive(world, e));
  st.allies = st.allies.filter((e) => alive(world, e));
  const bossesUp = st.bosses.some((e) => alive(world, e));
  const fieldClear = st.enemies.length === 0 && !bossesUp;
  if (fieldClear && st.wave < T.waves.length - 1) {
    if ((st.timer -= dt) <= 0) {
      st.wave++;
      st.timer = T.intermission;
      const player = world.first(PlayerControlled);
      if (player !== undefined) spawnWave(world, ctx, st, st.wave, level, player);
    }
    return;
  }
  if (fieldClear && st.wave >= T.waves.length - 1) {
    st.state = 'cleared';
    zone.found.add(ELEVATOR_BASE.id);
    zone.discovered.add('tp.base');
    signal(ctx, { type: 'objective', id: ELEVATOR_BASE.id });
    restorationPoint(ctx, `stronghold:${ELEVATOR_BASE.id}`);
    ctx.rewards.push({ table: 'dt.boss', level, x: ELEVATOR_BASE.x, z: ELEVATOR_BASE.z, xp: false, rarity: 'legendary' });
    for (const g of st.gate) if (world.isAlive(g)) world.destroyDeferred(g);
    st.gate = [];
    for (const a of st.allies) if (world.isAlive(a)) world.destroyDeferred(a);
    st.allies = [];
    ctx.events.push({ type: 'banner', key: 'setPieces.base.reclaimed', seconds: 3 });
    ctx.events.push({ type: 'interact', kind: 'reclaimed', id: ELEVATOR_BASE.id });
  }
}

/** The player died: the defence resets (the causeway stays barred). */
export function baseOnDeath(world: World, zone: ZoneRuntime): void {
  const st = zone.setPieces.base;
  if (!st || st.state !== 'waves') return;
  clearAll(world, st);
  st.state = 'idle';
  st.wave = -1;
}
