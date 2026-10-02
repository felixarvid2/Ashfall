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
import { monsterLevel } from '../systems/encounter';
import { grantXp } from '../systems/loot/rewards';
import { spawnEnemy } from './spawn';
import { makeElite, type ZoneRuntime } from './zone';

export type EventType = 'convoy' | 'sporeNest' | 'rescue' | 'signalJam' | 'eliteHunt' | 'supplyDrop';
export type Tier = 'gold' | 'silver' | 'bronze';

export const EVENT_TUNING = {
  triggerRadius: 22,
  cooldown: 600,
  convoy: { path: [[40, 18], [80, 30], [120, 40]] as [number, number][], speed: 2.2, life: 700, leash: 16, waveEvery: 8 },
  sporeNest: { life: 900, hatch: 60, gold: 25, silver: 40 },
  rescue: { time: 90, survivors: 3 },
  signalJam: { time: 60, life: 650, waveEvery: 7 },
  eliteHunt: { time: 90, gold: 45, silver: 70 },
  supplyDrop: { land: 3, guards: 6, steal: 60, gold: 20, silver: 35, clearRadius: 6 },
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
}

export function createEvents(zone: ZoneRuntime): Map<string, EventState> {
  const out = new Map<string, EventState>();
  for (const p of zone.def.pois) {
    if (p.kind !== 'event') continue;
    out.set(p.id, { state: 'idle', type: p.data?.event as EventType, x: p.x, z: p.z, elapsed: 0, readyAt: 0, objects: [], progress: 0, waveTimer: 0, result: null });
  }
  return out;
}

function eventObject(world: World, id: string, x: number, z: number, asset: string, scale = 1, glow?: string): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: asset, scale, ...(glow ? { glow } : {}) });
  world.add(e, Interactable, { poi: id, kind: 'eventObject', radius: INTERACT_RADIUS, used: false, readyAt: 0 });
  return e;
}

function wave(world: World, ctx: GameContext, x: number, z: number, n: number, level: number, radius = 18): void {
  for (let i = 0; i < n; i++) {
    const a = ctx.rng.range(0, Math.PI * 2);
    const enemy = ctx.rng.weighted([
      { item: 'infected_colonist', weight: 6 },
      { item: 'spore_hound', weight: 2 },
      { item: 'bloater', weight: 1 },
      { item: 'security_drone', weight: 1 },
    ]);
    const e = spawnEnemy(world, enemy, x + Math.sin(a) * radius, z + Math.cos(a) * radius, { level });
    world.req(e, EnemyAI).aggro = true;
  }
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
      const e = spawnEnemy(world, 'spore_hound', ev.x, ev.z, { level: level + 1 });
      makeElite(world, e, 'rare', new Rng(`${id}-${ctx.tick}`));
      world.req(e, EnemyAI).aggro = true;
      ev.objects.push(e);
      break;
    }
    case 'supplyDrop':
      ctx.events.push({ type: 'telegraph', owner: null, x: ev.x, z: ev.z, shape: { kind: 'circle', radius: 2.5 }, duration: T.supplyDrop.land, color: '#ffd23a' });
      ev.progress = 0; // 0 = falling, 1 = landed
      break;
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
    // Walking far away abandons the event.
    if (d > 90) {
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
  }
}
