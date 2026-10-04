/**
 * Region 2 dungeon objectives (docs/regions/refinery-district.md "Dungeons"):
 * - valves:  shut pumps in the order a panel shows (Smelter 3, with a rising heat meter)
 * - follow:  escort a damaged maintenance robot that stops while enemies are near (The Pipe Alleys)
 * - rescue:  free caged prisoners before their pyres light (The Cathedral Crypt)
 * - defend:  restart the compressor and keep it alive through the waves (The Cold Hall, frost vents)
 * Region 3 (docs/regions/hydroponic-vaults.md):
 * - drain:   pump levers that each drain the water from a stretch of tunnels (The Irrigation System)
 * - cocoons: cocoons that hatch as the player passes (The Cocoon Chamber)
 * Region 4 (docs/regions/deep-mines.md):
 * - defend (elevator): ride the elevator down while waves climb on (Shaft 13)
 * - mirrors: turn crystal mirrors until each catches the light (The Crystal Labyrinth)
 */
import {
  Collider,
  Dead,
  DisplayName,
  EnemyAI,
  Faction,
  Health,
  Interactable,
  MoveTarget,
  Mover,
  PlayerControlled,
  Renderable,
  Transform,
  makeTransform,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { INTERACT_RADIUS } from '../data/interactables';
import { ROOM_CELL, type InstanceObjective } from '../data/instances';
import { packTemplate } from '../data/packs';
import type { EnvFeature } from '../data/zones/zoneTypes';
import { applyDamage, applyStatus } from '../systems/combat';
import type { InstanceRoom, InstanceRuntime } from './instance';
import { spawnEnemy } from './spawn';

export const VALVE_COLORS = ['red', 'yellow', 'blue', 'green'] as const;
/** Cocoons hatch when the player comes this close. */
const COCOON_HATCH = 5;
const MIRROR_DARK = '#3a5a8a';
const MIRROR_LIT = '#e8ffff';
const VALVE_GLOW: Record<(typeof VALVE_COLORS)[number], string> = { red: '#ff3a2a', yellow: '#ffd23a', blue: '#3a8aff', green: '#5aff6a' };

export interface ObjectiveExtra {
  heat?: number;
  valves?: { entity: Entity; color: (typeof VALVE_COLORS)[number] }[];
  order?: number[];
  robot?: { entity: Entity | null; path: { x: number; z: number }[]; next: number; respawnAt: number };
  cages?: { entity: Entity; room: InstanceRoom; remaining: number | null; state: 'locked' | 'freed' | 'lost' }[];
  defend?: { entity: Entity | null; state: 'idle' | 'running'; remaining: number; wave: number; respawnAt: number; x: number; z: number };
  /** Frost vents and water, run by the environment system while inside. */
  env?: EnvFeature[];
  /** Water drained by the Irrigation System's levers. */
  drained?: Set<string>;
  /** Irrigation System: the pump levers and the water each one drains. */
  levers?: { entity: Entity; water: string[] }[];
  /** Cocoon Chamber: cocoons that hatch when the player comes close. */
  cocoons?: { entity: Entity; x: number; z: number }[];
  /** Crystal Labyrinth: each mirror's position (0–3) and the one that catches the light. */
  mirrors?: { entity: Entity; turn: number; aligned: number }[];
}

/** How many steps the objective counts to. */
export function objectiveCount(obj: InstanceObjective): number {
  return 'count' in obj ? obj.count : 1;
}

function interactable(world: World, poi: string, kind: Interactable['kind'], x: number, z: number, asset: string, scale: number, glow?: string): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: asset, scale, ...(glow ? { glow } : {}) });
  world.add(e, Interactable, { poi, kind, radius: INTERACT_RADIUS, used: false, readyAt: 0 });
  world.add(e, Collider, { radius: 0.7 * scale, mass: Infinity, layer: 'ground', isStatic: true });
  return e;
}

function centre(room: InstanceRoom, origin: (r: InstanceRoom) => { x: number; z: number }): { x: number; z: number } {
  return origin(room);
}

/** Place the objective's objects. `spots` lists side rooms first, then main rooms. */
export function setupObjective(world: World, rt: InstanceRuntime, spots: InstanceRoom[], roomCenter: (r: InstanceRoom) => { x: number; z: number }): void {
  const obj = rt.def.objective;
  const rng = rt.rng;
  const extra = rt.extra;
  if (rt.def.heat) extra.heat = 0;
  if (obj.kind === 'valves') {
    extra.valves = [];
    for (let i = 0; i < obj.count; i++) {
      const c = centre(spots[i % spots.length]!, roomCenter);
      const color = VALVE_COLORS[i]!;
      const e = interactable(world, `valve.${i}`, 'valve', c.x + rng.range(-3, 3), c.z + rng.range(-3, 3), 'prop.coolant_valve', 1.2, VALVE_GLOW[color]);
      extra.valves.push({ entity: e, color });
    }
    // The panel's order: a shuffle of the pumps.
    const order = extra.valves.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    extra.order = order;
  } else if (obj.kind === 'follow') {
    // Along the main path, room by room, to the doorway of the boss room.
    const main = rt.layout.rooms.filter((r) => r.kind === 'start' || r.kind === 'main' || r.kind === 'boss').sort((a, b) => a.depth - b.depth);
    const path = main.map((r) => roomCenter(r));
    const boss = path.pop()!;
    const last = path[path.length - 1]!;
    path.push({ x: (last.x + boss.x) / 2, z: (last.z + boss.z) / 2 });
    extra.robot = { entity: null, path, next: 1, respawnAt: 0 };
    spawnRobot(world, rt);
  } else if (obj.kind === 'rescue') {
    extra.cages = [];
    for (let i = 0; i < obj.count; i++) {
      const room = spots[i % spots.length]!;
      const c = roomCenter(room);
      const e = interactable(world, `cage.${i}`, 'cage', c.x + rng.range(-2, 2), c.z + rng.range(-2, 2), 'prop.prisoner_cage', 1, '#ffd23a');
      world.add(e, DisplayName, { key: 'instances.prisoner' });
      extra.cages.push({ entity: e, room, remaining: null, state: 'locked' });
    }
  } else if (obj.kind === 'mirrors') {
    extra.mirrors = [];
    for (let i = 0; i < obj.count; i++) {
      const c = centre(spots[i % spots.length]!, roomCenter);
      const aligned = rng.int(0, 3);
      const turn = (aligned + rng.int(1, 3)) % 4;
      const e = interactable(world, `mirror.${i}`, 'mirror', c.x + rng.range(-3, 3), c.z + rng.range(-3, 3), 'env.wall_segment', 0.5, MIRROR_DARK);
      world.req(e, Transform).facing = (turn * Math.PI) / 2;
      world.add(e, DisplayName, { key: 'instances.mirror' });
      extra.mirrors.push({ entity: e, turn, aligned });
    }
  } else if (obj.kind === 'defend') {
    // The compressor stands in the last main room before the boss.
    const room = rt.layout.rooms.filter((r) => r.kind === 'main').sort((a, b) => b.depth - a.depth)[0] ?? rt.layout.rooms[0]!;
    const c = roomCenter(room);
    extra.defend = { entity: null, state: 'idle', remaining: obj.time, wave: 0, respawnAt: 0, x: c.x, z: c.z };
    spawnCompressor(world, rt);
  }
  if (obj.kind === 'drain') {
    // Water in every room past the entrance, in depth order; each lever drains one stretch of it.
    extra.env ??= [];
    extra.drained = new Set();
    const wet = rt.layout.rooms.filter((r) => r.kind !== 'start').sort((a, b) => a.depth - b.depth);
    const groups: string[][] = Array.from({ length: obj.count }, () => []);
    wet.forEach((room, i) => {
      const group = groups[Math.min(obj.count - 1, Math.floor((i / wet.length) * obj.count))]!;
      const c = roomCenter(room);
      for (let k = 0; k < 3; k++) {
        const id = `water.${room.gx}.${room.gz}.${k}`;
        extra.env!.push({ kind: 'water', id, x: c.x + rng.range(-7, 7), z: c.z + rng.range(-7, 7), radius: rng.range(5, 7.5) });
        group.push(id);
      }
    });
    extra.levers = groups.map((water, i) => {
      const c = roomCenter(spots[i % spots.length]!);
      const e = interactable(world, `lever.${i}`, 'lever', c.x + rng.range(-3, 3), c.z + rng.range(-3, 3), 'prop.coolant_valve', 1.1, '#7ad8c8');
      world.add(e, DisplayName, { key: 'instances.lever' });
      return { entity: e, water };
    });
  }
  if (rt.def.cocoons) {
    extra.cocoons = [];
    for (const room of rt.layout.rooms) {
      if (room.kind === 'start' || room.kind === 'boss') continue;
      const c = roomCenter(room);
      for (let i = 0; i < rt.def.cocoons; i++) {
        const x = c.x + rng.range(-ROOM_CELL / 3, ROOM_CELL / 3);
        const z = c.z + rng.range(-ROOM_CELL / 3, ROOM_CELL / 3);
        const e = world.create();
        world.add(e, Transform, makeTransform(x, 0, z, rng.range(0, 6)));
        world.add(e, Renderable, { assetId: 'prop.spore_feeder', scale: 0.8, glow: '#9aff5a' });
        extra.cocoons.push({ entity: e, x, z });
      }
    }
  }
  if (rt.def.frostVents) {
    extra.env = [];
    for (const room of rt.layout.rooms) {
      if (room.kind === 'start') continue;
      const c = roomCenter(room);
      for (let i = 0; i < rt.def.frostVents; i++) {
        const x = c.x + rng.range(-ROOM_CELL / 3, ROOM_CELL / 3);
        const z = c.z + rng.range(-ROOM_CELL / 3, ROOM_CELL / 3);
        extra.env.push({ kind: 'vent', id: `frost.${room.gx}.${room.gz}.${i}`, x, z, radius: 3, period: rng.range(6, 8), offset: rng.range(0, 6), element: 'frost' });
        const g = world.create();
        world.add(g, Transform, makeTransform(x, 0, z, rng.range(0, 6)));
        world.add(g, Renderable, { assetId: 'prop.vent', glow: '#7ec8ff' });
      }
    }
  }
}

function spawnRobot(world: World, rt: InstanceRuntime): void {
  const r = rt.extra.robot!;
  const obj = rt.def.objective as Extract<InstanceObjective, { kind: 'follow' }>;
  const at = r.path[Math.max(0, r.next - 1)]!;
  const e = world.create();
  world.add(e, Transform, makeTransform(at.x, 0, at.z, 0));
  world.add(e, Renderable, { assetId: 'enemy.security_drone', glow: '#7ad8ff', scale: 1.1 });
  world.add(e, Faction, { team: 'player' });
  const life = obj.life * (1 + 0.1 * (rt.level - 1));
  world.add(e, Health, { current: life, max: life });
  world.add(e, Mover, { speed: obj.speed, speedMul: 1, turnRate: 3, vx: 0, vz: 0 });
  world.add(e, Collider, { radius: 0.6, mass: 30, layer: 'ground', isStatic: false });
  world.add(e, DisplayName, { key: 'instances.robot' });
  r.entity = e;
}

function spawnCompressor(world: World, rt: InstanceRuntime): void {
  const d = rt.extra.defend!;
  const elevator = rt.def.objective.kind === 'defend' && rt.def.objective.machine === 'elevator';
  const e = elevator
    ? interactable(world, 'compressor', 'compressor', d.x, d.z, 'prop.elevator_foundation', 0.45, '#ffc890')
    : interactable(world, 'compressor', 'compressor', d.x, d.z, 'prop.compressor', 1, '#7ec8ff');
  world.add(e, DisplayName, { key: elevator ? 'instances.elevator' : 'instances.compressor' });
  d.entity = e;
}

const alive = (world: World, e: Entity | null | undefined): e is Entity => e !== null && e !== undefined && world.isAlive(e) && !world.has(e, Dead);

function enemyWave(world: World, rt: InstanceRuntime, x: number, z: number, n: number, radius: number): void {
  const pool = rt.def.packs.flatMap((p) => packTemplate(p).members.map((m) => m.enemy));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rt.rng.range(0, 1);
    const m = spawnEnemy(world, rt.rng.pick(pool), x + Math.sin(a) * radius, z + Math.cos(a) * radius, { level: rt.level });
    world.req(m, EnemyAI).aggro = true;
  }
}

/** Per-tick objective logic. Updates rt.objective.progress. */
export function tickObjective(world: World, dt: number, ctx: GameContext, rt: InstanceRuntime, player: Entity, roomCenter: (r: InstanceRoom) => { x: number; z: number }): void {
  const obj = rt.def.objective;
  const extra = rt.extra;
  const ptr = world.req(player, Transform);

  // Smelter 3: the heat meter.
  if (rt.def.heat && extra.heat !== undefined && !rt.objective.done) {
    extra.heat = Math.min(1, extra.heat + dt / rt.def.heat.fullAfter);
    const over = extra.heat - rt.def.heat.burnAt;
    if (over > 0 && !world.has(player, Dead)) {
      const h = world.req(player, Health);
      // Burning ticks, then real damage as it approaches full heat.
      const pct = 0.004 + over * 0.06;
      applyDamage(world, ctx, player, h.max * pct * dt, { crit: false, damageType: 'heat', dot: true, sourceTeam: 'enemy' });
    }
  }

  // Cocoons burst as the player walks past them.
  if (extra.cocoons?.length) {
    for (const c of extra.cocoons.filter((k) => Math.hypot(ptr.x - k.x, ptr.z - k.z) < COCOON_HATCH)) {
      if (world.isAlive(c.entity)) world.destroyDeferred(c.entity);
      for (const [enemy, n] of [['spore_swarm', 2], ['overgrown_walker', 1]] as const) {
        for (let i = 0; i < n; i++) {
          const m = spawnEnemy(world, enemy, c.x + rt.rng.range(-1, 1), c.z + rt.rng.range(-1, 1), { level: rt.level });
          world.req(m, EnemyAI).aggro = true;
        }
      }
      ctx.events.push({ type: 'vfx', kind: 'corpseBurst', x: c.x, z: c.z, radius: 2.5, facing: 0 });
    }
    extra.cocoons = extra.cocoons.filter((k) => Math.hypot(ptr.x - k.x, ptr.z - k.z) >= COCOON_HATCH);
  }

  if (rt.objective.done) return;
  if (obj.kind === 'follow' && extra.robot) {
    const r = extra.robot;
    if (!alive(world, r.entity)) {
      if (r.entity !== null) {
        r.entity = null;
        r.respawnAt = ctx.time + 4;
        ctx.events.push({ type: 'banner', key: 'instances.robotDown', seconds: 2 });
      } else if (ctx.time >= r.respawnAt) spawnRobot(world, rt);
      return;
    }
    const tr = world.req(r.entity, Transform);
    const target = r.path[r.next]!;
    if (Math.hypot(tr.x - target.x, tr.z - target.z) < 1.6) {
      r.next++;
      rt.objective.progress = 0;
      if (r.next >= r.path.length) {
        rt.objective.progress = 1;
        world.remove(r.entity, MoveTarget);
        return;
      }
    }
    // It waits while enemies are near it, or while the player is far behind.
    const threatened = world.query(EnemyAI, Transform).some((e) => {
      if (world.has(e, Dead)) return false;
      const et = world.req(e, Transform);
      return Math.hypot(et.x - tr.x, et.z - tr.z) < obj.stopRadius;
    });
    const near = Math.hypot(ptr.x - tr.x, ptr.z - tr.z) < 16;
    const next = r.path[r.next]!;
    if (!threatened && near) world.add(r.entity, MoveTarget, { x: next.x, z: next.z });
    else world.remove(r.entity, MoveTarget);
  } else if (obj.kind === 'rescue' && extra.cages) {
    for (const c of extra.cages) {
      if (c.state !== 'locked') continue;
      const rc = roomCenter(c.room);
      if (c.remaining === null && Math.max(Math.abs(ptr.x - rc.x), Math.abs(ptr.z - rc.z)) < ROOM_CELL / 2) {
        c.remaining = obj.time;
        ctx.events.push({ type: 'banner', key: 'instances.pyreLit', params: { s: obj.time }, seconds: 2 });
      }
      if (c.remaining === null) continue;
      c.remaining -= dt;
      if (c.remaining <= 0) {
        c.state = 'lost';
        const it = world.get(c.entity, Interactable);
        if (it) it.used = true;
        const r = world.get(c.entity, Renderable);
        if (r) r.glow = '#3a1408';
        const tr = world.req(c.entity, Transform);
        ctx.events.push({ type: 'vfx', kind: 'vent', x: tr.x, z: tr.z, radius: 3, facing: 0 });
        ctx.events.push({ type: 'banner', key: 'instances.prisonerLost', seconds: 2 });
      }
    }
    rt.objective.progress = extra.cages.filter((c) => c.state !== 'locked').length;
  } else if (obj.kind === 'defend' && extra.defend) {
    const d = extra.defend;
    if (d.state === 'idle' && d.entity === null && ctx.time >= d.respawnAt) spawnCompressor(world, rt);
    if (d.state !== 'running') return;
    if (!alive(world, d.entity)) {
      // Destroyed: it can be restarted after a moment.
      d.state = 'idle';
      d.entity = null;
      d.remaining = obj.time;
      d.respawnAt = ctx.time + 5;
      ctx.events.push({ type: 'banner', key: rt.def.objective.kind === 'defend' && rt.def.objective.machine === 'elevator' ? 'instances.elevatorDown' : 'instances.compressorDown', seconds: 2 });
      return;
    }
    d.remaining -= dt;
    if ((d.wave -= dt) <= 0) {
      d.wave = obj.waveEvery;
      enemyWave(world, rt, d.x, d.z, obj.wave, 11);
    }
    if (d.remaining <= 0) {
      d.state = 'idle';
      rt.objective.progress = 1;
      const r = world.get(d.entity, Renderable);
      if (r) r.glow = '#7dffb0';
    }
  }
}

/** Use a valve, cage, compressor or lever. Returns true if handled. */
export function objectiveInteract(world: World, ctx: GameContext, rt: InstanceRuntime, target: Entity, it: Interactable): boolean {
  const obj = rt.def.objective;
  const extra = rt.extra;
  const tr = world.req(target, Transform);
  if (it.kind === 'lever' && obj.kind === 'drain' && extra.levers && extra.drained) {
    const lever = extra.levers.find((l) => l.entity === target);
    if (!lever || it.used) return false;
    it.used = true;
    for (const id of lever.water) extra.drained.add(id);
    rt.objective.progress++;
    const r = world.get(target, Renderable);
    if (r) delete r.glow;
    // The pumps' noise draws the creatures in the tunnels.
    enemyWave(world, rt, tr.x, tr.z, 3, 9);
    ctx.events.push({ type: 'vfx', kind: 'coolant', x: tr.x, z: tr.z, radius: 4, facing: 0 });
    ctx.events.push({ type: 'banner', key: 'instances.progress.drain', params: { n: rt.objective.progress, count: obj.count }, seconds: 1.8 });
    return true;
  }
  if (it.kind === 'valve' && obj.kind === 'valves' && extra.valves && extra.order) {
    const i = extra.valves.findIndex((v) => v.entity === target);
    const expected = extra.order[rt.objective.progress];
    if (i < 0 || it.used) return false;
    if (i === expected) {
      it.used = true;
      const r = world.get(target, Renderable);
      if (r) delete r.glow;
      rt.objective.progress++;
      if (rt.def.heat && extra.heat !== undefined) extra.heat = Math.max(0, extra.heat - rt.def.heat.coolPerStep);
      ctx.events.push({ type: 'vfx', kind: 'coolant', x: tr.x, z: tr.z, radius: 3, facing: 0 });
      ctx.events.push({ type: 'banner', key: 'instances.progress.valves', params: { n: rt.objective.progress, count: obj.count }, seconds: 1.6 });
    } else {
      // Wrong pump: everything opens again, the furnace flares and the noise draws a wave.
      for (const v of extra.valves) {
        const vit = world.get(v.entity, Interactable);
        if (vit) vit.used = false;
        const r = world.get(v.entity, Renderable);
        if (r) r.glow = VALVE_GLOW[v.color];
      }
      rt.objective.progress = 0;
      if (rt.def.heat && extra.heat !== undefined) extra.heat = Math.min(1, extra.heat + 0.15);
      enemyWave(world, rt, tr.x, tr.z, obj.wave, 9);
      ctx.events.push({ type: 'vfx', kind: 'vent', x: tr.x, z: tr.z, radius: 4, facing: 0 });
      ctx.events.push({ type: 'banner', key: 'instances.wrongValve', seconds: 2 });
    }
    return true;
  }
  if (it.kind === 'cage' && obj.kind === 'rescue' && extra.cages) {
    const c = extra.cages.find((x) => x.entity === target);
    if (!c || c.state !== 'locked') return false;
    c.state = 'freed';
    it.used = true;
    world.destroyDeferred(target);
    const player = world.first(PlayerControlled);
    ctx.rewards.push({ table: 'dt.supply_crate', level: rt.level, x: tr.x, z: tr.z, xp: false });
    if (player !== undefined) applyStatus(world, ctx, player, { status: 'overcharge', duration: 10 }, { team: 'player', level: rt.level });
    ctx.events.push({ type: 'vfx', kind: 'heal', x: tr.x, z: tr.z, radius: 2, facing: 0 });
    ctx.events.push({ type: 'banner', key: 'instances.prisonerFreed', params: { n: extra.cages.filter((x) => x.state === 'freed').length, count: obj.count }, seconds: 1.8 });
    return true;
  }
  if (it.kind === 'mirror' && obj.kind === 'mirrors' && extra.mirrors) {
    const m = extra.mirrors.find((x) => x.entity === target);
    if (!m || m.turn === m.aligned) return false;
    m.turn = (m.turn + 1) % 4;
    world.req(target, Transform).facing = (m.turn * Math.PI) / 2;
    const r = world.get(target, Renderable);
    if (m.turn === m.aligned) {
      // It catches the light.
      if (r) r.glow = MIRROR_LIT;
      it.used = true;
      ctx.events.push({ type: 'vfx', kind: 'flash', x: tr.x, z: tr.z, radius: 4, facing: 0 });
    }
    rt.objective.progress = extra.mirrors.filter((x) => x.turn === x.aligned).length;
    ctx.events.push({ type: 'banner', key: 'instances.progress.mirrors', params: { n: rt.objective.progress, count: obj.count }, seconds: 1.4 });
    // The grinding stone draws the labyrinth's guards.
    enemyWave(world, rt, tr.x, tr.z, obj.wave, 9);
    return true;
  }
  if (it.kind === 'compressor' && obj.kind === 'defend' && extra.defend) {
    const d = extra.defend;
    if (d.state === 'running' || rt.objective.done) return false;
    d.state = 'running';
    d.remaining = obj.time;
    d.wave = 2;
    it.used = true;
    // A running machine can be hit.
    const life = obj.life * (1 + 0.12 * (rt.level - 1));
    world.add(target, Faction, { team: 'player' });
    world.add(target, Health, { current: life, max: life });
    ctx.events.push({ type: 'banner', key: obj.machine === 'elevator' ? 'instances.elevatorStart' : 'instances.defendStart', params: { s: obj.time }, seconds: 2 });
    return true;
  }
  return false;
}

/** Objective line details for the HUD (null = use the generic text). */
export function objectiveDetail(rt: InstanceRuntime, t: (key: string, params?: Record<string, string | number>) => string): string | null {
  const obj = rt.def.objective;
  const extra = rt.extra;
  const heat = extra.heat !== undefined && !rt.objective.done ? ` · ${t('instances.heat', { pct: Math.round(extra.heat * 100) })}` : '';
  if (obj.kind === 'valves' && extra.order && extra.valves) {
    const next = extra.order[rt.objective.progress];
    const color = next !== undefined ? t(`instances.valveColors.${extra.valves[next]!.color}`) : '';
    const sequence = extra.order.map((i) => t(`instances.valveColors.${extra.valves![i]!.color}`)).join(' → ');
    return `${t('instances.objective.valves', { n: rt.objective.progress, count: obj.count, next: color })} (${sequence})${heat}`;
  }
  if (obj.kind === 'follow' && extra.robot) {
    return t(extra.robot.entity === null ? 'instances.objective.followDown' : 'instances.objective.follow', { n: Math.max(0, extra.robot.next - 1), count: extra.robot.path.length - 1 });
  }
  if (obj.kind === 'rescue' && extra.cages) {
    const freed = extra.cages.filter((c) => c.state === 'freed').length;
    const timers = extra.cages.filter((c) => c.state === 'locked' && c.remaining !== null).map((c) => Math.ceil(c.remaining!));
    const soon = timers.length ? ` · ${t('instances.pyreIn', { s: Math.min(...timers) })}` : '';
    return `${t('instances.objective.rescue', { n: freed, count: obj.count })}${soon}`;
  }
  if (obj.kind === 'defend' && extra.defend) {
    const key = obj.machine === 'elevator' ? 'elevator' : 'defend';
    return extra.defend.state === 'running' ? t(`instances.objective.${key}Running`, { s: Math.ceil(extra.defend.remaining) }) : t(`instances.objective.${key}`);
  }
  return heat ? `${heat.slice(3)}` : null;
}
