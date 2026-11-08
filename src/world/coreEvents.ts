/**
 * The Core's four own world events (round 4, A01-A04), run by the world event system (src/world/worldEvents.ts):
 * - Collapsing Bridge (A01): a light bridge crackles and gives way under the player; reach the far island in time, or fall
 *   (damage, back at the near end). The bridge rebuilds after 30 s.
 * - Choir Awakening (A02): singers wake in waves round a resonance stone; break the stone.
 * - Memory Surge (A03): shades of earlier bosses' adds pour out of a memory rift for 60 s; close it with three interactions.
 * - Gravity Storm (A04): two drifting gravity fields pull the player and every bolt; destroy the two anchors.
 * Rewards follow the other events: Gold, Silver or Bronze by time (or by how the crossing went), nothing for a failure.
 */
import { Collider, Dead, EnemyAI, Faction, Health, Interactable, Mover, PlayerControlled, Projectile, Renderable, Targetable, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { INTERACT_RADIUS } from '../data/interactables';
import { caveGrid, type CaveGrid } from '../data/zones/caves';
import { monsterLevel } from '../systems/encounter';
import { spawnEnemy } from './spawn';
import { CORE_TUNING } from './theCore';
import type { EventState, Tier } from './worldEvents';

export const CORE_EVENT_TYPES = ['bridgeCollapse', 'choirAwakening', 'memorySurge', 'gravityStorm'] as const;
export type CoreEventType = (typeof CORE_EVENT_TYPES)[number];
export const isCoreEvent = (type: string): type is CoreEventType => (CORE_EVENT_TYPES as readonly string[]).includes(type);

export const CORE_EVENT_TUNING = {
  /** How close the player must come to start the event (m); the bridge starts only once they are out on it. */
  triggerRadius: { bridgeCollapse: 6, choirAwakening: 22, memorySurge: 22, gravityStorm: 22 } satisfies Record<CoreEventType, number>,
  /** Collapsing Bridge: crackle time before it gives way, how long it stays down, fall damage (share of max life), spare seconds for Gold. */
  bridgeCollapse: { id: 'core.bridge.g4g7', warn: 4.5, down: 30, fall: 0.12, goldSpare: 1 },
  /** Choir Awakening: the stone's life (before level scaling), waves of singers, the time limit, Gold/Silver times. */
  choirAwakening: { life: 700, waves: 4, every: 11, singers: 2, time: 110, gold: 45, silver: 75 },
  /** Memory Surge: the pouring time, interactions to close the rift, the pause between them, Gold/Silver times. */
  memorySurge: { time: 60, closes: 3, pause: 3, every: 5, shades: 3, gold: 30, silver: 45, roster: ['shade_walker', 'shade_hound', 'shade_drone', 'shade_echo'] },
  /** Gravity Storm: field radius and orbit, anchors and their life, the time limit, Gold/Silver times. */
  gravityStorm: { fields: 2, radius: 11, orbit: 15, spin: 0.28, anchors: 2, anchorRadius: 20, life: 650, every: 12, time: 120, gold: 55, silver: 85, pull: 0.45 },
};

type Finish = (result: Tier | 'failed') => void;

const bridgeOf = (grid: CaveGrid | null | undefined, id: string) => grid?.bridges?.find((b) => b.def.id === id);

function onBridge(grid: CaveGrid, cells: Int32Array, x: number, z: number): boolean {
  const i = Math.floor((x + grid.half) / grid.cell);
  const j = Math.floor((z + grid.half) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.n || j >= grid.n) return false;
  return cells.includes(j * grid.n + i);
}

/** A destructible thing on the enemy side (the resonance stone, the anchors). */
function stone(world: World, x: number, z: number, scale: number, life: number, glow: string): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: 'prop.core_column', scale, glow });
  world.add(e, Faction, { team: 'enemy' });
  world.add(e, Health, { current: life, max: life });
  world.add(e, Collider, { radius: 0.9 * scale, mass: Infinity, layer: 'ground', isStatic: true });
  world.add(e, Targetable, {});
  return e;
}

function pour(world: World, ctx: GameContext, x: number, z: number, n: number, level: number, roster: readonly string[], radius: number): Entity[] {
  const out: Entity[] = [];
  for (let i = 0; i < n; i++) {
    const a = ctx.rng.range(0, Math.PI * 2);
    const e = spawnEnemy(world, ctx.rng.pick([...roster]), x + Math.sin(a) * radius, z + Math.cos(a) * radius, { level });
    world.req(e, EnemyAI).aggro = true;
    out.push(e);
  }
  return out;
}

const alive = (world: World, e: Entity | undefined) => e !== undefined && world.isAlive(e) && !world.has(e, Dead);
const tierBy = (elapsed: number, gold: number, silver: number): Tier => (elapsed < gold ? 'gold' : elapsed < silver ? 'silver' : 'bronze');

// ---- Start --------------------------------------------------------------------------------------

/** Set up the event's things; `ev` is already marked active with its counters reset. */
export function startCoreEvent(world: World, ctx: GameContext, id: string, ev: EventState): void {
  const level = monsterLevel(world, ctx);
  switch (ev.type as CoreEventType) {
    case 'bridgeCollapse': {
      const grid = ctx.zone ? caveGrid(ctx.zone.def) : null;
      const b = bridgeOf(grid, CORE_EVENT_TUNING.bridgeCollapse.id);
      const player = world.first(PlayerControlled, Transform);
      if (b && player !== undefined) {
        // The end the player came from: the near end, where a fall puts them back (0 = a, 1 = b).
        const pt = world.req(player, Transform);
        ev.banked = Math.hypot(pt.x - b.def.a[0], pt.z - b.def.a[1]) <= Math.hypot(pt.x - b.def.b[0], pt.z - b.def.b[1]) ? 0 : 1;
        ev.waveTimer = CORE_EVENT_TUNING.bridgeCollapse.warn;
        b.collapse = { warnUntil: ctx.time + ev.waveTimer, downUntil: 0 };
        ctx.events.push({ type: 'shake', trauma: 0.25 });
        ctx.events.push({ type: 'telegraph', owner: null, x: pt.x, z: pt.z, shape: { kind: 'circle', radius: 4 }, duration: ev.waveTimer, color: '#ffd484' });
      }
      break;
    }
    case 'choirAwakening': {
      const T = CORE_EVENT_TUNING.choirAwakening;
      ev.objects.push(stone(world, ev.x, ev.z, 1.1, T.life * (1 + 0.15 * (level - 1)), '#c8a4ff'));
      ev.waveTimer = 3;
      break;
    }
    case 'memorySurge': {
      const rift = world.create();
      world.add(rift, Transform, makeTransform(ev.x, 0, ev.z, 0));
      world.add(rift, Renderable, { assetId: 'prop.core_column', scale: 0.9, glow: '#9fd8ff' });
      world.add(rift, Interactable, { poi: `${id}.rift`, kind: 'eventObject', radius: INTERACT_RADIUS + 0.5, used: false, readyAt: 0 });
      ev.objects.push(rift);
      ev.waveTimer = 1.5;
      break;
    }
    case 'gravityStorm': {
      const T = CORE_EVENT_TUNING.gravityStorm;
      for (let i = 0; i < T.anchors; i++) {
        const a = (i / T.anchors) * Math.PI * 2 + 0.6;
        ev.objects.push(stone(world, ev.x + Math.sin(a) * T.anchorRadius, ev.z + Math.cos(a) * T.anchorRadius, 0.8, T.life * (1 + 0.15 * (level - 1)), '#b48cff'));
      }
      ev.waveTimer = 5;
      break;
    }
  }
}

// ---- The step -----------------------------------------------------------------------------------

/** Where the gravity storm's fields are at event time `t` (they drift round the event's centre). */
export function stormFields(ev: Pick<EventState, 'x' | 'z'>, t: number): { x: number; z: number; radius: number }[] {
  const T = CORE_EVENT_TUNING.gravityStorm;
  return Array.from({ length: T.fields }, (_, i) => {
    const a = t * T.spin + (i / T.fields) * Math.PI * 2;
    // Slightly squashed, so the fields cross the middle now and then.
    return { x: ev.x + Math.sin(a) * T.orbit, z: ev.z + Math.cos(a) * T.orbit * 0.7, radius: T.radius };
  });
}

/** One tick of an active Core event. */
export function stepCoreEvent(world: World, ctx: GameContext, ev: EventState, dt: number, ptr: Transform, finish: Finish): void {
  const level = monsterLevel(world, ctx);
  const player = world.first(PlayerControlled, Transform);
  switch (ev.type as CoreEventType) {
    case 'bridgeCollapse': {
      const T = CORE_EVENT_TUNING.bridgeCollapse;
      const grid = ctx.zone ? caveGrid(ctx.zone.def) : null;
      const b = bridgeOf(grid, T.id);
      if (!b || !grid || player === undefined) {
        finish('failed');
        break;
      }
      const near = ev.banked === 0 ? b.def.a : b.def.b;
      const far = ev.banked === 0 ? b.def.b : b.def.a;
      const onIt = onBridge(grid, b.cells, ptr.x, ptr.z);
      if (ev.progress === 0) {
        // Crackling: the way across is the only way out.
        ev.waveTimer -= dt;
        if (!onIt && Math.hypot(ptr.x - far[0], ptr.z - far[1]) < Math.hypot(ptr.x - near[0], ptr.z - near[1])) {
          delete b.collapse;
          finish(ev.waveTimer >= T.goldSpare ? 'gold' : 'silver');
          break;
        }
        if (ev.waveTimer <= 0) {
          // It gives way. Whoever is out on it falls: damage, and back at the near end.
          b.collapse = { warnUntil: 0, downUntil: ctx.time + T.down };
          ev.progress = 1;
          ctx.events.push({ type: 'shake', trauma: 0.7 });
          ctx.events.push({ type: 'banner', key: 'worldEvents.bridgeCollapse.fell', seconds: 2.4 });
          if (onIt && !ctx.debug.godMode) {
            const h = world.get(player, Health);
            if (h) h.current = Math.max(1, h.current - h.max * T.fall);
            ptr.x = ptr.prevX = near[0];
            ptr.z = ptr.prevZ = near[1];
            ctx.events.push({ type: 'vfx', kind: 'blink', x: near[0], z: near[1], radius: 1.4, facing: 0 });
          }
          finish('failed');
        }
      }
      break;
    }
    case 'choirAwakening': {
      const T = CORE_EVENT_TUNING.choirAwakening;
      const rock = ev.objects[0];
      if (!alive(world, rock)) {
        finish(tierBy(ev.elapsed, T.gold, T.silver));
        break;
      }
      if (ev.elapsed >= T.time) {
        // The song finishes: the stone goes quiet and the choir stays.
        ctx.events.push({ type: 'vfx', kind: 'flash', x: ev.x, z: ev.z, radius: 8, facing: 0 });
        world.destroyDeferred(rock!);
        ev.objects = [];
        finish('failed');
        break;
      }
      if (ev.progress < T.waves && (ev.waveTimer -= dt) <= 0) {
        ev.waveTimer = T.every;
        ev.progress++;
        ctx.events.push({ type: 'vfx', kind: 'flash', x: ev.x, z: ev.z, radius: 5, facing: 0 });
        ev.objects.push(...pour(world, ctx, ev.x, ev.z, T.singers + ev.progress - 1, level, ['choir_singer'], 8));
      }
      break;
    }
    case 'memorySurge': {
      const T = CORE_EVENT_TUNING.memorySurge;
      if (ev.progress >= T.closes) {
        finish(tierBy(ev.elapsed, T.gold, T.silver));
        break;
      }
      if (ev.elapsed >= T.time) {
        const rift = ev.objects[0];
        if (rift !== undefined && world.isAlive(rift)) world.destroyDeferred(rift);
        ev.objects = [];
        finish('failed');
        break;
      }
      if ((ev.waveTimer -= dt) <= 0) {
        ev.waveTimer = T.every;
        pour(world, ctx, ev.x, ev.z, T.shades, level, T.roster, 7);
        ctx.events.push({ type: 'vfx', kind: 'flash', x: ev.x, z: ev.z, radius: 4, facing: 0 });
      }
      break;
    }
    case 'gravityStorm': {
      const T = CORE_EVENT_TUNING.gravityStorm;
      const anchors = ev.objects.slice(0, T.anchors);
      const left = anchors.filter((a) => alive(world, a)).length;
      if (left === 0) {
        finish(tierBy(ev.elapsed, T.gold, T.silver));
        break;
      }
      if (ev.elapsed >= T.time) {
        for (const a of anchors) if (world.isAlive(a)) world.destroyDeferred(a);
        ev.objects = [];
        finish('failed');
        break;
      }
      ev.progress = T.anchors - left;
      const fields = stormFields(ev, ev.elapsed);
      // Draw the fields (short telegraphs, refreshed) and pull the player and every bolt inside them.
      if (Math.floor(ev.elapsed * 2) !== Math.floor((ev.elapsed - dt) * 2)) {
        for (const f of fields) ctx.events.push({ type: 'telegraph', owner: null, x: f.x, z: f.z, shape: { kind: 'circle', radius: f.radius }, duration: 0.6, color: '#b48cff' });
      }
      pullInto(world, fields, ptr, dt);
      for (const e of world.query(Projectile, Transform)) {
        const tr = world.req(e, Transform);
        const p = world.req(e, Projectile);
        for (const f of fields) {
          const d = Math.hypot(f.x - tr.x, f.z - tr.z);
          if (d > f.radius || d < 0.01) continue;
          p.vx += ((f.x - tr.x) / d) * CORE_TUNING.gravity.boltAccel * dt;
          p.vz += ((f.z - tr.z) / d) * CORE_TUNING.gravity.boltAccel * dt;
          break;
        }
      }
      if ((ev.waveTimer -= dt) <= 0) {
        ev.waveTimer = T.every;
        pour(world, ctx, ev.x, ev.z, 2, level, ['shade_walker', 'shade_hound'], 16);
      }
      break;
    }
  }
}

/** The player is drawn toward the centre of the first field they stand in (a share of their walking speed). */
function pullInto(world: World, fields: readonly { x: number; z: number; radius: number }[], tr: Transform, dt: number): void {
  const player = world.first(PlayerControlled, Mover, Transform);
  if (player === undefined || world.has(player, Dead)) return;
  for (const f of fields) {
    const d = Math.hypot(f.x - tr.x, f.z - tr.z);
    if (d > f.radius || d < 0.5) continue;
    const speed = world.req(player, Mover).speed * CORE_EVENT_TUNING.gravityStorm.pull;
    tr.x += ((f.x - tr.x) / d) * speed * dt;
    tr.z += ((f.z - tr.z) / d) * speed * dt;
    return;
  }
}

/** The player used the rift: one of three closings, then it needs a moment. Returns true when handled. */
export function coreEventInteract(world: World, ctx: GameContext, ev: EventState, target: Entity, it: Interactable): boolean {
  if (ev.type !== 'memorySurge' || ev.objects[0] !== target) return false;
  const T = CORE_EVENT_TUNING.memorySurge;
  ev.progress++;
  const tr = world.req(target, Transform);
  ctx.events.push({ type: 'vfx', kind: 'flash', x: tr.x, z: tr.z, radius: 5, facing: 0 });
  if (ev.progress >= T.closes) {
    it.used = true;
    world.destroyDeferred(target);
    ev.objects = [];
    ctx.events.push({ type: 'banner', key: 'worldEvents.memorySurge.closed', seconds: 2 });
  } else {
    // It pushes back: a short pause, and the shades come faster for a moment.
    it.readyAt = ctx.time + T.pause;
    ev.waveTimer = Math.min(ev.waveTimer, 1);
    ctx.events.push({ type: 'banner', key: 'worldEvents.memorySurge.closing', params: { n: ev.progress, count: T.closes }, seconds: 1.6 });
  }
  return true;
}

/** HUD line for an active Core event. */
export function coreEventObjective(ev: EventState): { text: string; params: Record<string, number> } {
  const T = CORE_EVENT_TUNING;
  const left = (limit: number) => Math.max(0, Math.ceil(limit - ev.elapsed));
  switch (ev.type as CoreEventType) {
    case 'bridgeCollapse':
      return { text: ev.progress === 0 ? 'worldEvents.bridgeCollapse.objective' : 'worldEvents.bridgeCollapse.down', params: { s: Math.max(0, Math.ceil(ev.waveTimer)) } };
    case 'choirAwakening':
      return { text: 'worldEvents.choirAwakening.objective', params: { s: left(T.choirAwakening.time) } };
    case 'memorySurge':
      return { text: 'worldEvents.memorySurge.objective', params: { n: ev.progress, count: T.memorySurge.closes, s: left(T.memorySurge.time) } };
    default:
      return { text: 'worldEvents.gravityStorm.objective', params: { n: ev.progress, count: T.gravityStorm.anchors, s: left(T.gravityStorm.time) } };
  }
}
