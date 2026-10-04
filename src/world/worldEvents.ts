/**
 * World events (docs/world-and-gameplay.md §12.1): timed events at fixed places, scored Bronze,
 * Silver or Gold by how well the player does. They start when the player comes close and return
 * after a cooldown.
 */
import {
  Collider,
  Dead,
  EnemyAI,
  Faction,
  Health,
  Hazard,
  Interactable,
  MoveTarget,
  Mover,
  PlayerControlled,
  Renderable,
  Targetable,
  Transform,
  makeTransform,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { Rng } from '../core/rng';
import { INTERACT_RADIUS } from '../data/interactables';
import { at } from '../data/zones/cinderFlats';
import { monsterLevel } from '../systems/encounter';
import { grantXp } from '../systems/loot/rewards';
import { spawnEnemy } from './spawn';
import { makeElite, type ZoneRuntime } from './zone';

export type EventType =
  | 'convoy'
  | 'sporeNest'
  | 'rescue'
  | 'signalJam'
  | 'eliteHunt'
  | 'supplyDrop'
  // Refinery District
  | 'runawayBelt'
  | 'slagTide'
  | 'purgeFurnace'
  | 'smelterRaid'
  // Hydroponic Vaults
  | 'sporeBloom'
  | 'swarmMigration'
  | 'rootEruption'
  // Deep Mines
  | 'caveRescue'
  | 'burrowerSwarm'
  | 'lightsOut'
  | 'securityPatrol';
export type Tier = 'gold' | 'silver' | 'bronze';

export const EVENT_TUNING = {
  triggerRadius: 22,
  cooldown: 600,
  // Along Route 7 (≈ 90 m).
  convoy: { path: [at(40, 18), at(60, 24), at(80, 30)] as [number, number][], speed: 2.2, life: 700, leash: 16, waveEvery: 8 },
  sporeNest: { life: 900, hatch: 60, gold: 25, silver: 40 },
  rescue: { time: 90, survivors: 3 },
  signalJam: { time: 60, life: 650, waveEvery: 7 },
  eliteHunt: { time: 90, gold: 45, silver: 70 },
  supplyDrop: { land: 3, guards: 6, steal: 60, gold: 20, silver: 35, clearRadius: 6 },
  /** Explosive cargo rides a runaway belt toward the furnace; shoot it before it gets there. */
  runawayBelt: { crates: 6, every: 4, speed: 3, length: 46, life: 90, blast: 4 },
  /** The slag rises: kill what crawls out of it before the tide swallows the field. */
  slagTide: { kills: 22, time: 80, gold: 45, silver: 65, poolEvery: 3, poolRadius: 3, poolDuration: 9 },
  /** Shut the furnace igniters before the Smelters light the pyre. */
  purgeFurnace: { igniters: 3, life: 520, time: 75, gold: 35, silver: 55 },
  /** Hold the pump against a Smelter raid. */
  smelterRaid: { time: 60, life: 700, waveEvery: 8 },
  /** Giant spore pods are about to burst: cut them down while their spores cloud the field. */
  sporeBloom: { pods: 3, life: 600, time: 70, gold: 35, silver: 55, cloudEvery: 4, cloudRadius: 3.2, cloudDuration: 8 },
  /** A swarm migrates through: thin it out before it moves on. */
  swarmMigration: { kills: 20, time: 70, gold: 40, silver: 58, waveEvery: 5 },
  /** Roots erupt from the floor; tear them all out before the patch is overgrown. */
  rootEruption: { roots: 5, time: 75, gold: 40, silver: 60, waveEvery: 10 },
  /** Miners trapped under fallen rock: dig them out while Burrowers come for them. */
  caveRescue: { miners: 3, time: 90, gold: 45, silver: 65, waveEvery: 9 },
  /** A Burrower nest stirs: kill what comes up before the tunnel fills. */
  burrowerSwarm: { kills: 16, time: 75, gold: 40, silver: 58, waveEvery: 6 },
  /** Keep the work lights' generator running against the things that hate the light. */
  lightsOut: { time: 60, life: 800, waveEvery: 8 },
  /** A security patrol escorts a cargo of sleepers: stop them before they reach the far tunnel. */
  securityPatrol: { time: 70, gold: 35, silver: 52 },
  /** XP per tier, × monster level. */
  xp: { gold: 40, silver: 28, bronze: 18 } as Record<Tier, number>,
};

export interface EventState {
  state: 'idle' | 'active' | 'cooldown';
  type: EventType;
  x: number;
  z: number;
  elapsed: number;
  readyAt: number;
  /** Entities that belong to the event (vehicle, nest, survivors, crate, elite). */
  objects: Entity[];
  progress: number;
  waveTimer: number;
  result: Tier | 'failed' | null;
  /** Runaway Belt: crates that reached the furnace. Slag Tide: kills whose corpses are gone. */
  missed?: number;
  banked?: number;
}

export function createEvents(zone: ZoneRuntime): Map<string, EventState> {
  const out = new Map<string, EventState>();
  for (const p of zone.def.pois) {
    if (p.kind !== 'event') continue;
    out.set(p.id, { state: 'idle', type: p.data?.event as EventType, x: p.x, z: p.z, elapsed: 0, readyAt: 0, objects: [], progress: 0, waveTimer: 0, result: null });
  }
  return out;
}

/** The player left the zone mid-event: it can be started again later (its entities are gone). */
export function suspendEvents(zone: ZoneRuntime): void {
  for (const ev of zone.events.values()) {
    if (ev.state !== 'active') continue;
    ev.state = 'idle';
    ev.objects = [];
    ev.result = null;
  }
}

function eventObject(world: World, id: string, x: number, z: number, asset: string, scale = 1, glow?: string): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: asset, scale, ...(glow ? { glow } : {}) });
  world.add(e, Interactable, { poi: id, kind: 'eventObject', radius: INTERACT_RADIUS, used: false, readyAt: 0 });
  return e;
}

/** Who answers an event's noise, by region. */
const WAVE_ROSTER: Record<string, { item: string; weight: number }[]> = {
  'zone.refinery_district': [
    { item: 'scorched_walker', weight: 5 },
    { item: 'slag_hound', weight: 2 },
    { item: 'smelter', weight: 1 },
    { item: 'welder', weight: 1 },
    { item: 'fire_bloater', weight: 1 },
  ],
  'zone.deep_mines': [
    { item: 'crystal_walker', weight: 5 },
    { item: 'blind_hound', weight: 2 },
    { item: 'infected_miner', weight: 2 },
    { item: 'shard_bloater', weight: 1 },
  ],
  'zone.hydroponic_vaults': [
    { item: 'overgrown_walker', weight: 5 },
    { item: 'spore_swarm', weight: 2 },
    { item: 'mossborn', weight: 2 },
    { item: 'swarm_bloater', weight: 1 },
  ],
  default: [
    { item: 'infected_colonist', weight: 6 },
    { item: 'spore_hound', weight: 2 },
    { item: 'bloater', weight: 1 },
    { item: 'security_drone', weight: 1 },
  ],
};

function wave(world: World, ctx: GameContext, x: number, z: number, n: number, level: number, radius = 18, roster?: { item: string; weight: number }[]): Entity[] {
  const out: Entity[] = [];
  for (let i = 0; i < n; i++) {
    const a = ctx.rng.range(0, Math.PI * 2);
    const enemy = ctx.rng.weighted(roster ?? WAVE_ROSTER[ctx.zone?.def.id ?? ''] ?? WAVE_ROSTER.default!);
    const e = spawnEnemy(world, enemy, x + Math.sin(a) * radius, z + Math.cos(a) * radius, { level });
    world.req(e, EnemyAI).aggro = true;
    out.push(e);
  }
  return out;
}

/** A thing with life the player protects or destroys. */
function target(world: World, x: number, z: number, asset: string, team: 'player' | 'enemy', life: number, scale = 1, glow?: string): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: asset, scale, ...(glow ? { glow } : {}) });
  world.add(e, Faction, { team });
  world.add(e, Health, { current: life, max: life });
  world.add(e, Collider, { radius: 0.9 * scale, mass: Infinity, layer: 'ground', isStatic: true });
  if (team === 'enemy') world.add(e, Targetable, {});
  return e;
}

function start(world: World, ctx: GameContext, id: string, ev: EventState): void {
  const level = monsterLevel(world, ctx);
  const T = EVENT_TUNING;
  ev.state = 'active';
  ev.elapsed = 0;
  ev.progress = 0;
  ev.waveTimer = 2;
  ev.result = null;
  ev.objects = [];
  ev.missed = 0;
  ev.banked = 0;
  switch (ev.type) {
    case 'convoy': {
      const [x, z] = T.convoy.path[0]!;
      const truck = world.create();
      world.add(truck, Transform, makeTransform(x, 0, z, 0));
      world.add(truck, Renderable, { assetId: 'prop.water_tanker' });
      world.add(truck, Mover, { speed: T.convoy.speed, speedMul: 1, turnRate: 2, vx: 0, vz: 0 });
      world.add(truck, Faction, { team: 'player' });
      world.add(truck, Health, { current: T.convoy.life, max: T.convoy.life });
      world.add(truck, Collider, { radius: 1.6, mass: 40, layer: 'ground', isStatic: false });
      ev.objects.push(truck);
      ev.progress = 1;
      break;
    }
    case 'sporeNest': {
      const nest = world.create();
      world.add(nest, Transform, makeTransform(ev.x, 0, ev.z, 0));
      world.add(nest, Renderable, { assetId: 'prop.spore_nest', scale: 1.6, glow: '#7dff5a' });
      world.add(nest, Faction, { team: 'enemy' });
      const life = T.sporeNest.life * (1 + 0.15 * (level - 1));
      world.add(nest, Health, { current: life, max: life });
      world.add(nest, Collider, { radius: 1.8, mass: Infinity, layer: 'ground', isStatic: true });
      world.add(nest, Targetable, { spawn: { enemy: 'infected_colonist', count: 2, every: 6, timer: 3 } });
      ev.objects.push(nest);
      break;
    }
    case 'rescue':
      for (let i = 0; i < T.rescue.survivors; i++) {
        const a = (i / T.rescue.survivors) * Math.PI * 2;
        const x = ev.x + Math.sin(a) * 12;
        const z = ev.z + Math.cos(a) * 12;
        ev.objects.push(eventObject(world, `${id}.survivor.${i}`, x, z, 'npc.technician', 0.9, '#7dd8ff'));
        wave(world, ctx, x, z, 3, level, 4);
      }
      break;
    case 'signalJam': {
      const tower = world.create();
      world.add(tower, Transform, makeTransform(ev.x, 0, ev.z, 0));
      world.add(tower, Renderable, { assetId: 'prop.signal_tower', scale: 1.2, glow: '#8ad2ff' });
      world.add(tower, Faction, { team: 'player' });
      world.add(tower, Health, { current: T.signalJam.life, max: T.signalJam.life });
      world.add(tower, Collider, { radius: 1.2, mass: Infinity, layer: 'ground', isStatic: true });
      ev.objects.push(tower);
      break;
    }
    case 'eliteHunt': {
      const prey = ({ 'zone.refinery_district': 'welder', 'zone.hydroponic_vaults': 'vine_weaver', 'zone.deep_mines': 'ore_crusher' } as Record<string, string>)[ctx.zone?.def.id ?? ''] ?? 'spore_hound';
      const e = spawnEnemy(world, prey, ev.x, ev.z, { level: level + 1 });
      makeElite(world, e, 'rare', new Rng(`${id}-${ctx.tick}`));
      world.req(e, EnemyAI).aggro = true;
      ev.objects.push(e);
      break;
    }
    case 'supplyDrop':
      ctx.events.push({ type: 'telegraph', owner: null, x: ev.x, z: ev.z, shape: { kind: 'circle', radius: 2.5 }, duration: T.supplyDrop.land, color: '#ffd23a' });
      ev.progress = 0; // 0 = falling, 1 = landed
      break;
    case 'runawayBelt':
      // progress = crates sent; objects hold the crates still riding.
      ev.waveTimer = 1;
      wave(world, ctx, ev.x, ev.z, 3, level, 14);
      break;
    case 'slagTide':
      ev.waveTimer = 0;
      ev.progress = 0;
      break;
    case 'purgeFurnace': {
      const T2 = T.purgeFurnace;
      const life = T2.life * (1 + 0.15 * (level - 1));
      for (let i = 0; i < T2.igniters; i++) {
        const a = (i / T2.igniters) * Math.PI * 2;
        ev.objects.push(target(world, ev.x + Math.sin(a) * 9, ev.z + Math.cos(a) * 9, 'env.furnace_block', 'enemy', life, 0.45, '#ff6a1a'));
      }
      wave(world, ctx, ev.x, ev.z, 4, level, 6, [{ item: 'smelter', weight: 2 }, { item: 'scorched_walker', weight: 3 }]);
      break;
    }
    case 'smelterRaid':
      ev.objects.push(target(world, ev.x, ev.z, 'env.pump_house', 'player', T.smelterRaid.life, 0.35, '#7ad8ff'));
      break;
    case 'sporeBloom': {
      const B = T.sporeBloom;
      const life = B.life * (1 + 0.15 * (level - 1));
      for (let i = 0; i < B.pods; i++) {
        const a = (i / B.pods) * Math.PI * 2 + 0.5;
        ev.objects.push(target(world, ev.x + Math.sin(a) * 10, ev.z + Math.cos(a) * 10, 'prop.spore_nest', 'enemy', life, 1.6, '#c8ff3a'));
      }
      wave(world, ctx, ev.x, ev.z, 3, level, 8, [{ item: 'spore_swarm', weight: 2 }, { item: 'mossborn', weight: 1 }]);
      break;
    }
    case 'swarmMigration':
      ev.waveTimer = 0;
      break;
    case 'caveRescue':
      for (let i = 0; i < T.caveRescue.miners; i++) {
        const a = (i / T.caveRescue.miners) * Math.PI * 2 + 0.4;
        ev.objects.push(eventObject(world, `${id}.miner.${i}`, ev.x + Math.sin(a) * 8, ev.z + Math.cos(a) * 8, 'env.slag_rock', 1.2, '#ffc890'));
      }
      ev.waveTimer = 3;
      break;
    case 'burrowerSwarm':
      ev.waveTimer = 0;
      break;
    case 'lightsOut':
      ev.objects.push(target(world, ev.x, ev.z, 'prop.generator', 'player', T.lightsOut.life, 1.2, '#ffe2a0'));
      break;
    case 'securityPatrol': {
      // The patrol: troopers round a shield officer; they head off down the tunnel.
      const lead = spawnEnemy(world, 'shield_officer', ev.x, ev.z, { level: level + 1 });
      makeElite(world, lead, 'champion', ctx.rng);
      world.req(lead, EnemyAI).aggro = true;
      ev.objects.push(lead, ...wave(world, ctx, ev.x, ev.z, 4, level, 3, [{ item: 'security_trooper', weight: 1 }]));
      break;
    }
    case 'rootEruption': {
      for (let i = 0; i < T.rootEruption.roots; i++) {
        const a = ctx.rng.range(0, Math.PI * 2);
        const r = ctx.rng.range(5, 14);
        const e = spawnEnemy(world, 'mother_root', ev.x + Math.sin(a) * r, ev.z + Math.cos(a) * r, { level });
        world.req(e, EnemyAI).aggro = true;
        ev.objects.push(e);
      }
      ctx.events.push({ type: 'vfx', kind: 'raise', x: ev.x, z: ev.z, radius: 10, facing: 0 });
      ctx.events.push({ type: 'shake', trauma: 0.4 });
      break;
    }
  }
  ctx.events.push({ type: 'banner', key: `worldEvents.${ev.type}.title`, seconds: 2.4 });
}

function finish(world: World, ctx: GameContext, zone: ZoneRuntime, id: string, ev: EventState, result: Tier | 'failed'): void {
  ev.state = 'cooldown';
  ev.result = result;
  ev.readyAt = ctx.time + EVENT_TUNING.cooldown;
  for (const o of ev.objects) {
    if (!world.isAlive(o)) continue;
    // Enemies (the hunted elite) stay; event props go.
    if (world.has(o, EnemyAI)) continue;
    world.destroyDeferred(o);
  }
  ev.objects = [];
  ctx.events.push({ type: 'banner', key: result === 'failed' ? 'worldEvents.failed' : `worldEvents.tier.${result}`, seconds: 2.6 });
  if (result === 'failed') return;
  const level = monsterLevel(world, ctx);
  ctx.rewards.push({ table: `dt.event_${result}`, level, x: ev.x, z: ev.z, xp: false });
  const player = world.first(PlayerControlled);
  if (player !== undefined) grantXp(world, ctx, player, EVENT_TUNING.xp[result] * level);
  if (ctx.account) {
    const entry = (ctx.account.restoration[zone.def.id] ??= { points: [], tiers: 0 });
    const k = `event:${id}`;
    if (!entry.points.includes(k)) entry.points.push(k);
  }
}

const alive = (world: World, e: Entity | undefined) => e !== undefined && world.isAlive(e) && !world.has(e, Dead);

export function worldEventSystem(world: World, dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  if (!zone || ctx.instance) return;
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined) return;
  const ptr = world.req(player, Transform);
  const T = EVENT_TUNING;
  const level = monsterLevel(world, ctx);
  for (const [id, ev] of zone.events) {
    const d = Math.hypot(ptr.x - ev.x, ptr.z - ev.z);
    if (ev.state === 'cooldown' && ctx.time >= ev.readyAt) ev.state = 'idle';
    if (ev.state === 'idle') {
      if (d < T.triggerRadius && !world.has(player, Dead)) start(world, ctx, id, ev);
      continue;
    }
    if (ev.state !== 'active') continue;
    ev.elapsed += dt;
    // Walking far away abandons the event (the convoy route itself is ~100 m long).
    if (d > 150) {
      finish(world, ctx, zone, id, ev, 'failed');
      continue;
    }
    switch (ev.type) {
      case 'convoy': {
        const truck = ev.objects[0];
        if (!alive(world, truck)) {
          finish(world, ctx, zone, id, ev, 'failed');
          break;
        }
        const tr = world.req(truck!, Transform);
        const path = T.convoy.path;
        const [nx, nz] = path[ev.progress]!;
        if (Math.hypot(tr.x - nx, tr.z - nz) < 1.5) ev.progress++;
        if (ev.progress >= path.length) {
          const h = world.req(truck!, Health);
          const frac = h.current / h.max;
          finish(world, ctx, zone, id, ev, frac >= 0.7 ? 'gold' : frac >= 0.35 ? 'silver' : 'bronze');
          break;
        }
        const near = Math.hypot(ptr.x - tr.x, ptr.z - tr.z) <= T.convoy.leash;
        const [tx, tz] = path[ev.progress]!;
        if (near) world.add(truck!, MoveTarget, { x: tx, z: tz });
        else world.remove(truck!, MoveTarget);
        if ((ev.waveTimer -= dt) <= 0) {
          ev.waveTimer = T.convoy.waveEvery;
          wave(world, ctx, tr.x, tr.z, 3, level, 16);
        }
        break;
      }
      case 'sporeNest': {
        if (!alive(world, ev.objects[0])) {
          finish(world, ctx, zone, id, ev, ev.elapsed < T.sporeNest.gold ? 'gold' : ev.elapsed < T.sporeNest.silver ? 'silver' : 'bronze');
        } else if (ev.elapsed >= T.sporeNest.hatch) {
          wave(world, ctx, ev.x, ev.z, 8, level + 1, 3);
          finish(world, ctx, zone, id, ev, 'failed');
        }
        break;
      }
      case 'rescue': {
        const freed = ev.progress;
        if (freed >= T.rescue.survivors || ev.elapsed >= T.rescue.time) {
          finish(world, ctx, zone, id, ev, freed >= 3 ? 'gold' : freed === 2 ? 'silver' : freed === 1 ? 'bronze' : 'failed');
        }
        break;
      }
      case 'signalJam': {
        const tower = ev.objects[0];
        if (!alive(world, tower)) {
          finish(world, ctx, zone, id, ev, 'failed');
          break;
        }
        if ((ev.waveTimer -= dt) <= 0) {
          ev.waveTimer = T.signalJam.waveEvery;
          wave(world, ctx, ev.x, ev.z, 4, level, 20);
        }
        if (ev.elapsed >= T.signalJam.time) {
          const h = world.req(tower!, Health);
          const frac = h.current / h.max;
          finish(world, ctx, zone, id, ev, frac >= 0.7 ? 'gold' : frac >= 0.35 ? 'silver' : 'bronze');
        }
        break;
      }
      case 'eliteHunt': {
        const elite = ev.objects[0];
        if (!alive(world, elite)) {
          finish(world, ctx, zone, id, ev, ev.elapsed < T.eliteHunt.gold ? 'gold' : ev.elapsed < T.eliteHunt.silver ? 'silver' : 'bronze');
        } else if (ev.elapsed >= T.eliteHunt.time) {
          // It slips away into the ash.
          world.destroyDeferred(elite!);
          ev.objects = [];
          finish(world, ctx, zone, id, ev, 'failed');
        }
        break;
      }
      case 'runawayBelt': {
        const R = T.runawayBelt;
        // Crates ride east along the belt; each one that reaches the end blows up the line.
        if (ev.progress < R.crates && (ev.waveTimer -= dt) <= 0) {
          ev.waveTimer = R.every;
          ev.progress++;
          ev.objects.push(target(world, ev.x - R.length / 2, ev.z, 'prop.explosive_barrel', 'enemy', R.life * (1 + 0.12 * (level - 1)), 1.3, '#ff3a2a'));
        }
        for (const crate of ev.objects) {
          if (!alive(world, crate)) continue;
          const tr = world.req(crate, Transform);
          tr.x += R.speed * dt;
          if (tr.x >= ev.x + R.length / 2) {
            world.destroyDeferred(crate);
            ev.missed = (ev.missed ?? 0) + 1;
            ctx.events.push({ type: 'vfx', kind: 'explosion', x: tr.x, z: tr.z, radius: R.blast, facing: 0 });
            ctx.events.push({ type: 'shake', trauma: 0.35 });
          }
        }
        ev.objects = ev.objects.filter((o) => alive(world, o) && world.req(o, Transform).x < ev.x + R.length / 2);
        if (ev.progress >= R.crates && ev.objects.length === 0) {
          const missed = ev.missed ?? 0;
          ev.missed = 0;
          finish(world, ctx, zone, id, ev, missed === 0 ? 'gold' : missed <= 2 ? 'silver' : missed <= 4 ? 'bronze' : 'failed');
        }
        break;
      }
      case 'slagTide': {
        const S = T.slagTide;
        if ((ev.waveTimer -= dt) <= 0) {
          ev.waveTimer = S.poolEvery;
          const a = ctx.rng.range(0, Math.PI * 2);
          const r = ctx.rng.range(4, 18);
          spawnTidePool(world, ev.x + Math.sin(a) * r, ev.z + Math.cos(a) * r, S, level);
          ev.objects.push(...wave(world, ctx, ev.x, ev.z, 2, level, 16, [{ item: 'slag_hound', weight: 3 }, { item: 'fire_bloater', weight: 1 }]));
        }
        ev.progress = ev.objects.filter((o) => world.isAlive(o) && world.has(o, Dead)).length + (ev.banked ?? 0);
        // Corpses vanish after a while: bank kills as they happen.
        const gone = ev.objects.filter((o) => !world.isAlive(o));
        if (gone.length) {
          ev.banked = (ev.banked ?? 0) + gone.length;
          ev.objects = ev.objects.filter((o) => world.isAlive(o));
        }
        if (ev.progress >= S.kills) {
          ev.banked = 0;
          finish(world, ctx, zone, id, ev, ev.elapsed < S.gold ? 'gold' : ev.elapsed < S.silver ? 'silver' : 'bronze');
        } else if (ev.elapsed >= S.time) {
          ev.banked = 0;
          finish(world, ctx, zone, id, ev, 'failed');
        }
        break;
      }
      case 'purgeFurnace': {
        const P = T.purgeFurnace;
        if (ev.objects.every((o) => !alive(world, o))) {
          finish(world, ctx, zone, id, ev, ev.elapsed < P.gold ? 'gold' : ev.elapsed < P.silver ? 'silver' : 'bronze');
        } else if (ev.elapsed >= P.time) {
          ctx.events.push({ type: 'vfx', kind: 'vent', x: ev.x, z: ev.z, radius: 9, facing: 0 });
          finish(world, ctx, zone, id, ev, 'failed');
        }
        break;
      }
      case 'smelterRaid': {
        const M = T.smelterRaid;
        const pump = ev.objects[0];
        if (!alive(world, pump)) {
          finish(world, ctx, zone, id, ev, 'failed');
          break;
        }
        if ((ev.waveTimer -= dt) <= 0) {
          ev.waveTimer = M.waveEvery;
          wave(world, ctx, ev.x, ev.z, 3, level, 22, [{ item: 'smelter', weight: 2 }, { item: 'welder', weight: 2 }, { item: 'flame_drone', weight: 1 }]);
        }
        if (ev.elapsed >= M.time) {
          const h = world.req(pump!, Health);
          const frac = h.current / h.max;
          finish(world, ctx, zone, id, ev, frac >= 0.7 ? 'gold' : frac >= 0.35 ? 'silver' : 'bronze');
        }
        break;
      }
      case 'caveRescue': {
        const R = T.caveRescue;
        if ((ev.waveTimer -= dt) <= 0) {
          ev.waveTimer = R.waveEvery;
          wave(world, ctx, ev.x, ev.z, 3, level, 12, [{ item: 'burrower', weight: 2 }, { item: 'blind_hound', weight: 1 }]);
        }
        if (ev.progress >= R.miners) finish(world, ctx, zone, id, ev, ev.elapsed < R.gold ? 'gold' : ev.elapsed < R.silver ? 'silver' : 'bronze');
        else if (ev.elapsed >= R.time) finish(world, ctx, zone, id, ev, ev.progress >= 2 ? 'bronze' : 'failed');
        break;
      }
      case 'burrowerSwarm': {
        const M = T.burrowerSwarm;
        if ((ev.waveTimer -= dt) <= 0) {
          ev.waveTimer = M.waveEvery;
          ev.objects.push(...wave(world, ctx, ev.x, ev.z, 3, level, 10, [{ item: 'burrower', weight: 3 }, { item: 'crystal_walker', weight: 1 }]));
        }
        ev.progress = countKills(world, ev);
        if (ev.progress >= M.kills) {
          ev.banked = 0;
          finish(world, ctx, zone, id, ev, ev.elapsed < M.gold ? 'gold' : ev.elapsed < M.silver ? 'silver' : 'bronze');
        } else if (ev.elapsed >= M.time) {
          ev.banked = 0;
          finish(world, ctx, zone, id, ev, 'failed');
        }
        break;
      }
      case 'lightsOut': {
        const L = T.lightsOut;
        const gen = ev.objects[0];
        if (!alive(world, gen)) {
          finish(world, ctx, zone, id, ev, 'failed');
          break;
        }
        if ((ev.waveTimer -= dt) <= 0) {
          ev.waveTimer = L.waveEvery;
          wave(world, ctx, ev.x, ev.z, 3, level, 20, [{ item: 'echo', weight: 3 }, { item: 'blind_hound', weight: 1 }]);
        }
        if (ev.elapsed >= L.time) {
          const h = world.req(gen!, Health);
          const frac = h.current / h.max;
          finish(world, ctx, zone, id, ev, frac >= 0.7 ? 'gold' : frac >= 0.35 ? 'silver' : 'bronze');
        }
        break;
      }
      case 'securityPatrol': {
        const P = T.securityPatrol;
        const left = ev.objects.filter((o) => alive(world, o));
        if (!left.length) finish(world, ctx, zone, id, ev, ev.elapsed < P.gold ? 'gold' : ev.elapsed < P.silver ? 'silver' : 'bronze');
        else if (ev.elapsed >= P.time) {
          // They got away down the tunnel.
          for (const o of left) world.destroyDeferred(o);
          ev.objects = [];
          finish(world, ctx, zone, id, ev, 'failed');
        }
        break;
      }
      case 'sporeBloom': {
        const B = T.sporeBloom;
        const pods = ev.objects.filter((o) => alive(world, o));
        ev.progress = B.pods - pods.length;
        if ((ev.waveTimer -= dt) <= 0 && pods.length) {
          // Each standing pod puffs a poison cloud somewhere near it.
          ev.waveTimer = B.cloudEvery;
          const pod = world.req(pods[Math.floor(ctx.rng.next() * pods.length)]!, Transform);
          const a = ctx.rng.range(0, Math.PI * 2);
          spawnSporeCloud(world, pod.x + Math.sin(a) * 4, pod.z + Math.cos(a) * 4, B, level);
        }
        if (!pods.length) finish(world, ctx, zone, id, ev, ev.elapsed < B.gold ? 'gold' : ev.elapsed < B.silver ? 'silver' : 'bronze');
        else if (ev.elapsed >= B.time) {
          for (const p of pods) spawnSporeCloud(world, world.req(p, Transform).x, world.req(p, Transform).z, { ...B, cloudRadius: 7 }, level);
          finish(world, ctx, zone, id, ev, 'failed');
        }
        break;
      }
      case 'swarmMigration': {
        const M = T.swarmMigration;
        if ((ev.waveTimer -= dt) <= 0) {
          ev.waveTimer = M.waveEvery;
          ev.objects.push(...wave(world, ctx, ev.x, ev.z, 3, level, 20, [{ item: 'spore_swarm', weight: 4 }, { item: 'swarm_bloater', weight: 1 }]));
        }
        ev.progress = countKills(world, ev);
        if (ev.progress >= M.kills) {
          ev.banked = 0;
          finish(world, ctx, zone, id, ev, ev.elapsed < M.gold ? 'gold' : ev.elapsed < M.silver ? 'silver' : 'bronze');
        } else if (ev.elapsed >= M.time) {
          ev.banked = 0;
          finish(world, ctx, zone, id, ev, 'failed');
        }
        break;
      }
      case 'rootEruption': {
        const R = T.rootEruption;
        const roots = ev.objects.filter((o) => alive(world, o));
        ev.progress = R.roots - roots.length;
        if ((ev.waveTimer -= dt) <= 0 && roots.length) {
          ev.waveTimer = R.waveEvery;
          wave(world, ctx, ev.x, ev.z, 3, level, 16, [{ item: 'overgrown_walker', weight: 3 }, { item: 'mossborn', weight: 1 }]);
        }
        if (!roots.length) finish(world, ctx, zone, id, ev, ev.elapsed < R.gold ? 'gold' : ev.elapsed < R.silver ? 'silver' : 'bronze');
        else if (ev.elapsed >= R.time) {
          // Failed: the roots sink back into the soil.
          for (const r of roots) world.destroyDeferred(r);
          ev.objects = [];
          finish(world, ctx, zone, id, ev, 'failed');
        }
        break;
      }
      case 'supplyDrop': {
        if (ev.progress === 0 && ev.elapsed >= T.supplyDrop.land) {
          ev.progress = 1;
          ev.elapsed = 0;
          ev.objects.push(eventObject(world, `${id}.crate`, ev.x, ev.z, 'prop.supply_chest', 1.3, '#ffd23a'));
          ctx.events.push({ type: 'vfx', kind: 'explosion', x: ev.x, z: ev.z, radius: 2.5, facing: 0 });
          ctx.events.push({ type: 'shake', trauma: 0.4 });
          wave(world, ctx, ev.x, ev.z, T.supplyDrop.guards, level, 24);
        } else if (ev.progress === 1 && ev.elapsed >= T.supplyDrop.steal) {
          finish(world, ctx, zone, id, ev, 'failed');
        }
        break;
      }
    }
  }
}

/** Survivors and supply crates. Returns true if handled. */
export function eventInteract(world: World, ctx: GameContext, target: Entity, it: Interactable): boolean {
  const zone = ctx.zone;
  if (!zone) return false;
  for (const [id, ev] of zone.events) {
    if (ev.state !== 'active' || !ev.objects.includes(target)) continue;
    const tr = world.req(target, Transform);
    if (ev.type === 'rescue') {
      it.used = true;
      ev.progress++;
      world.destroyDeferred(target);
      ev.objects = ev.objects.filter((o) => o !== target);
      ctx.events.push({ type: 'banner', key: 'worldEvents.rescue.freed', params: { n: ev.progress, count: EVENT_TUNING.rescue.survivors }, seconds: 1.6 });
      return true;
    }
    if (ev.type === 'caveRescue') {
      it.used = true;
      ev.progress++;
      world.destroyDeferred(target);
      ev.objects = ev.objects.filter((o) => o !== target);
      ctx.events.push({ type: 'vfx', kind: 'dust', x: tr.x, z: tr.z, radius: 2, facing: 0 });
      ctx.events.push({ type: 'banner', key: 'worldEvents.caveRescue.freed', params: { n: ev.progress, count: EVENT_TUNING.caveRescue.miners }, seconds: 1.6 });
      return true;
    }
    if (ev.type === 'supplyDrop') {
      // You have to drive the scavengers off first.
      const near = world.query(EnemyAI, Transform).some((e) => {
        if (world.has(e, Dead)) return false;
        const et = world.req(e, Transform);
        return Math.hypot(et.x - tr.x, et.z - tr.z) < EVENT_TUNING.supplyDrop.clearRadius;
      });
      if (near) {
        ctx.events.push({ type: 'notice', key: 'worldEvents.supplyDrop.contested' });
        return false;
      }
      it.used = true;
      const T = EVENT_TUNING.supplyDrop;
      finish(world, ctx, zone, id, ev, ev.elapsed < T.gold ? 'gold' : ev.elapsed < T.silver ? 'silver' : 'bronze');
      return true;
    }
  }
  return false;
}

/** HUD line for the active event nearest the player. */
export function activeEvent(zone: ZoneRuntime | undefined, x: number, z: number): { type: EventType; text: string; params: Record<string, number> } | null {
  if (!zone) return null;
  let best: EventState | null = null;
  let bestD = Infinity;
  for (const ev of zone.events.values()) {
    if (ev.state !== 'active') continue;
    const d = Math.hypot(ev.x - x, ev.z - z);
    if (d < bestD) {
      bestD = d;
      best = ev;
    }
  }
  if (!best) return null;
  const T = EVENT_TUNING;
  const left = (limit: number) => Math.max(0, Math.ceil(limit - best!.elapsed));
  switch (best.type) {
    case 'convoy':
      return { type: best.type, text: 'worldEvents.convoy.objective', params: { n: best.progress, count: T.convoy.path.length } };
    case 'sporeNest':
      return { type: best.type, text: 'worldEvents.sporeNest.objective', params: { s: left(T.sporeNest.hatch) } };
    case 'rescue':
      return { type: best.type, text: 'worldEvents.rescue.objective', params: { n: best.progress, count: T.rescue.survivors, s: left(T.rescue.time) } };
    case 'signalJam':
      return { type: best.type, text: 'worldEvents.signalJam.objective', params: { s: left(T.signalJam.time) } };
    case 'eliteHunt':
      return { type: best.type, text: 'worldEvents.eliteHunt.objective', params: { s: left(T.eliteHunt.time) } };
    case 'supplyDrop':
      return { type: best.type, text: best.progress === 0 ? 'worldEvents.supplyDrop.falling' : 'worldEvents.supplyDrop.objective', params: { s: left(T.supplyDrop.steal) } };
    case 'runawayBelt':
      return { type: best.type, text: 'worldEvents.runawayBelt.objective', params: { n: best.progress, count: T.runawayBelt.crates } };
    case 'slagTide':
      return { type: best.type, text: 'worldEvents.slagTide.objective', params: { n: best.progress, count: T.slagTide.kills, s: left(T.slagTide.time) } };
    case 'purgeFurnace':
      return { type: best.type, text: 'worldEvents.purgeFurnace.objective', params: { s: left(T.purgeFurnace.time) } };
    case 'smelterRaid':
      return { type: best.type, text: 'worldEvents.smelterRaid.objective', params: { s: left(T.smelterRaid.time) } };
    case 'sporeBloom':
      return { type: best.type, text: 'worldEvents.sporeBloom.objective', params: { n: best.progress, count: T.sporeBloom.pods, s: left(T.sporeBloom.time) } };
    case 'swarmMigration':
      return { type: best.type, text: 'worldEvents.swarmMigration.objective', params: { n: best.progress, count: T.swarmMigration.kills, s: left(T.swarmMigration.time) } };
    case 'caveRescue':
      return { type: best.type, text: 'worldEvents.caveRescue.objective', params: { n: best.progress, count: T.caveRescue.miners, s: left(T.caveRescue.time) } };
    case 'burrowerSwarm':
      return { type: best.type, text: 'worldEvents.burrowerSwarm.objective', params: { n: best.progress, count: T.burrowerSwarm.kills, s: left(T.burrowerSwarm.time) } };
    case 'lightsOut':
      return { type: best.type, text: 'worldEvents.lightsOut.objective', params: { s: left(T.lightsOut.time) } };
    case 'securityPatrol':
      return { type: best.type, text: 'worldEvents.securityPatrol.objective', params: { s: left(T.securityPatrol.time) } };
    case 'rootEruption':
      return { type: best.type, text: 'worldEvents.rootEruption.objective', params: { n: best.progress, count: T.rootEruption.roots, s: left(T.rootEruption.time) } };
  }
}

/** A burning pool of rising slag (hurts the player's side only). */
function spawnTidePool(world: World, x: number, z: number, S: { poolRadius: number; poolDuration: number }, level: number): void {
  const hz = world.create();
  world.add(hz, Transform, makeTransform(x, 0, z));
  world.add(hz, Hazard, {
    team: 'enemy',
    radius: S.poolRadius,
    remaining: S.poolDuration,
    duration: S.poolDuration,
    tickTimer: 0.5,
    color: '#ff6a1a',
    applies: [{ status: 'burning', duration: 1.5, dps: 6 + 3 * level }],
    attackerLevel: level,
  });
}

/** Kills among the event's enemies, banking those whose corpses have already vanished. */
function countKills(world: World, ev: EventState): number {
  const gone = ev.objects.filter((o) => !world.isAlive(o));
  if (gone.length) {
    ev.banked = (ev.banked ?? 0) + gone.length;
    ev.objects = ev.objects.filter((o) => world.isAlive(o));
  }
  return ev.objects.filter((o) => world.has(o, Dead)).length + (ev.banked ?? 0);
}

/** A drifting poison cloud from a blooming pod. */
function spawnSporeCloud(world: World, x: number, z: number, B: { cloudRadius: number; cloudDuration: number }, level: number): void {
  const hz = world.create();
  world.add(hz, Transform, makeTransform(x, 0, z));
  world.add(hz, Hazard, {
    team: 'enemy',
    radius: B.cloudRadius,
    remaining: B.cloudDuration,
    duration: B.cloudDuration,
    tickTimer: 0.5,
    color: '#9aff3a',
    applies: [{ status: 'poisoned', duration: 1.5, dps: 5 + 3 * level }],
    attackerLevel: level,
  });
}
