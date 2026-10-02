/**
 * Instanced dungeons and bunkers (docs/world-and-gameplay.md §6). A seeded grid of rooms: a main
 * path from the entrance to the boss room plus side branches, walls along the cell edges with
 * doorways where rooms connect. Enemies wake per room; the objective opens the boss room's gate;
 * killing the boss (or clearing a bunker) unlocks the cache and the way out.
 *
 * Instances are built far outside the zone (INSTANCE_ORIGIN), so the open world keeps its state.
 */
import {
  Collider,
  Dead,
  EnemyAI,
  Faction,
  Health,
  Interactable,
  PlayerControlled,
  Renderable,
  Targetable,
  Transform,
  makeTransform,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { Rng } from '../core/rng';
import { INSTANCES, INSTANCE_ORIGIN, ROOM_CELL, type InstanceDef } from '../data/instances';
import { INTERACT_RADIUS } from '../data/interactables';
import { packTemplate } from '../data/packs';
import { spawnBoss } from '../systems/boss';
import { signal } from '../systems/quests';
import { spawnEnemy } from './spawn';
import { makeElite } from './zone';

export type Dir = 'n' | 's' | 'e' | 'w';
const DIRS: Record<Dir, [number, number]> = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };
const OPPOSITE: Record<Dir, Dir> = { n: 's', s: 'n', e: 'w', w: 'e' };

export interface InstanceRoom {
  gx: number;
  gz: number;
  kind: 'start' | 'main' | 'side' | 'boss';
  links: Dir[];
  /** Main-path index (side rooms: the main room they branch from). */
  depth: number;
  spawned: boolean;
  explored: boolean;
}

export interface Layout {
  rooms: InstanceRoom[];
}

const key = (gx: number, gz: number) => `${gx},${gz}`;

/** Lay out rooms on a grid: a self-avoiding main path, then short side branches. */
export function generateLayout(rng: Rng, def: InstanceDef): Layout {
  for (let attempt = 0; attempt < 50; attempt++) {
    const cells = new Map<string, InstanceRoom>();
    const mainLen = rng.int(def.main[0], def.main[1]);
    const start: InstanceRoom = { gx: 0, gz: 0, kind: 'start', links: [], depth: 0, spawned: true, explored: true };
    cells.set(key(0, 0), start);
    const path = [start];
    let ok = true;
    for (let i = 1; i < mainLen; i++) {
      const prev = path[i - 1]!;
      const options = (Object.keys(DIRS) as Dir[]).filter((d) => {
        const [dx, dz] = DIRS[d];
        return !cells.has(key(prev.gx + dx, prev.gz + dz));
      });
      if (!options.length) {
        ok = false;
        break;
      }
      // Prefer continuing outward so the path doesn't coil into a ball.
      const d = rng.pick(options);
      const [dx, dz] = DIRS[d];
      const room: InstanceRoom = { gx: prev.gx + dx, gz: prev.gz + dz, kind: i === mainLen - 1 ? 'boss' : 'main', links: [OPPOSITE[d]], depth: i, spawned: false, explored: false };
      prev.links.push(d);
      cells.set(key(room.gx, room.gz), room);
      path.push(room);
    }
    if (!ok) continue;
    const branches = rng.int(def.branches[0], def.branches[1]);
    for (let b = 0; b < branches; b++) {
      const candidates = path.slice(1, -1);
      if (!candidates.length) break;
      let from = rng.pick(candidates);
      const len = rng.int(1, 2);
      for (let s = 0; s < len; s++) {
        const options = (Object.keys(DIRS) as Dir[]).filter((d) => {
          const [dx, dz] = DIRS[d];
          return !cells.has(key(from.gx + dx, from.gz + dz));
        });
        if (!options.length) break;
        const d = rng.pick(options);
        const [dx, dz] = DIRS[d];
        const room: InstanceRoom = { gx: from.gx + dx, gz: from.gz + dz, kind: 'side', links: [OPPOSITE[d]], depth: from.depth, spawned: false, explored: false };
        from.links.push(d);
        cells.set(key(room.gx, room.gz), room);
        from = room;
      }
    }
    return { rooms: [...cells.values()] };
  }
  throw new Error(`Could not lay out ${def.id}`);
}

export function roomCenter(room: InstanceRoom): { x: number; z: number } {
  return { x: INSTANCE_ORIGIN.x + room.gx * ROOM_CELL, z: INSTANCE_ORIGIN.z + room.gz * ROOM_CELL };
}

/** Rooms are connected (every room reachable from the start). */
export function connected(layout: Layout): boolean {
  const byKey = new Map(layout.rooms.map((r) => [key(r.gx, r.gz), r]));
  const seen = new Set<string>([key(0, 0)]);
  const queue = [byKey.get(key(0, 0))!];
  while (queue.length) {
    const r = queue.shift()!;
    for (const d of r.links) {
      const [dx, dz] = DIRS[d];
      const k = key(r.gx + dx, r.gz + dz);
      const n = byKey.get(k);
      if (n && !seen.has(k) && n.links.includes(OPPOSITE[d])) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return seen.size === layout.rooms.length;
}

// ---- Runtime ---------------------------------------------------------------------------

export interface InstanceRuntime {
  def: InstanceDef;
  /** The point of interest it was entered from, and where to put the player back. */
  poi: string;
  exit: { x: number; z: number };
  level: number;
  layout: Layout;
  rng: Rng;
  start: { x: number; z: number };
  objective: { progress: number; done: boolean; charging: { entity: Entity; remaining: number } | null };
  gate: Entity[];
  boss: Entity | null;
  completed: boolean;
  /** Lamps for the renderer's light pool. */
  lights: { x: number; z: number; color: string; intensity: number; distance: number; height: number }[];
}

export function instanceDef(id: string): InstanceDef {
  const def = INSTANCES.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown instance ${id}`);
  return def;
}

const WALL_SEGMENTS = 8;

function wall(world: World, x: number, z: number, rot: number): void {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, rot));
  world.add(e, Renderable, { assetId: 'env.wall_segment' });
  const len = ROOM_CELL / WALL_SEGMENTS;
  for (let i = 0; i < 3; i++) {
    const off = -len / 2 + (len * i) / 2;
    const b = world.create();
    world.add(b, Transform, makeTransform(x + Math.cos(rot) * off, 0, z - Math.sin(rot) * off));
    world.add(b, Collider, { radius: 0.7, mass: Infinity, layer: 'ground', isStatic: true });
  }
}

/** Build one edge of a room: full wall, or two halves with a doorway. */
function edge(world: World, cx: number, cz: number, d: Dir, door: boolean, gate: Entity[] | null): void {
  const half = ROOM_CELL / 2;
  const len = ROOM_CELL / WALL_SEGMENTS;
  const horizontal = d === 'n' || d === 's';
  const ex = cx + (d === 'e' ? half : d === 'w' ? -half : 0);
  const ez = cz + (d === 'n' ? half : d === 's' ? -half : 0);
  for (let i = 0; i < WALL_SEGMENTS; i++) {
    if (door && (i === WALL_SEGMENTS / 2 - 1 || i === WALL_SEGMENTS / 2)) continue;
    const t = -half + len * (i + 0.5);
    if (horizontal) wall(world, ex + t, ez, 0);
    else wall(world, ex, ez + t, Math.PI / 2);
  }
  if (door && gate) {
    // A barricade across the boss doorway until the objective is done.
    for (const t of [-len / 2, len / 2]) {
      const x = horizontal ? ex + t : ex;
      const z = horizontal ? ez : ez + t;
      const e = world.create();
      world.add(e, Transform, makeTransform(x, 0, z, horizontal ? 0 : Math.PI / 2));
      world.add(e, Renderable, { assetId: 'prop.barricade', glow: '#ff3a2a' });
      world.add(e, Collider, { radius: 1.6, mass: Infinity, layer: 'ground', isStatic: true });
      gate.push(e);
    }
  }
}

function interactable(world: World, poi: string, kind: Interactable['kind'], x: number, z: number, asset: string, scale = 1, glow?: string): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: asset, scale, ...(glow ? { glow } : {}) });
  world.add(e, Interactable, { poi, kind, radius: INTERACT_RADIUS, used: false, readyAt: 0 });
  return e;
}

/** Build the instance's walls, decor, objective objects and the way out. */
export function buildInstance(world: World, ctx: GameContext, defId: string, poi: string, seed: string, level: number, exit: { x: number; z: number }): InstanceRuntime {
  const def = instanceDef(defId);
  const rng = new Rng(`${defId}-${seed}`);
  const layout = generateLayout(rng, def);
  const byKey = new Map(layout.rooms.map((r) => [key(r.gx, r.gz), r]));
  const rt: InstanceRuntime = {
    def,
    poi,
    exit,
    level,
    layout,
    rng,
    start: roomCenter(layout.rooms[0]!),
    objective: { progress: 0, done: def.objective.kind === 'clear' && false, charging: null },
    gate: [],
    boss: null,
    completed: false,
    lights: [],
  };

  const bossRoom = layout.rooms.find((r) => r.kind === 'boss');
  for (const room of layout.rooms) {
    const { x: cx, z: cz } = roomCenter(room);
    for (const d of Object.keys(DIRS) as Dir[]) {
      const [dx, dz] = DIRS[d];
      const neighbour = byKey.get(key(room.gx + dx, room.gz + dz));
      // Shared edges are built once, by the room further south/west.
      if (neighbour && (d === 's' || d === 'w')) continue;
      const door = room.links.includes(d) || (neighbour?.links.includes(OPPOSITE[d]) ?? false);
      const intoBoss = def.boss !== null && door && (room === bossRoom || neighbour === bossRoom);
      edge(world, cx, cz, d, door, intoBoss ? rt.gate : null);
    }
    // Decor along the walls and a lamp or two.
    const n = rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const side = rng.int(0, 3);
      const t = rng.range(-8, 8);
      const inset = ROOM_CELL / 2 - 2.2;
      const x = cx + (side === 0 ? inset : side === 1 ? -inset : t);
      const z = cz + (side === 2 ? inset : side === 3 ? -inset : t);
      const e = world.create();
      world.add(e, Transform, makeTransform(x, 0, z, rng.range(0, Math.PI * 2)));
      world.add(e, Renderable, { assetId: rng.pick(def.theme.decor), scale: rng.range(0.7, 1.05) });
      world.add(e, Collider, { radius: 0.8, mass: Infinity, layer: 'ground', isStatic: true });
    }
    const lamps = room.kind === 'boss' ? 4 : rng.int(1, 2);
    for (let i = 0; i < lamps; i++) {
      const a = (i / lamps) * Math.PI * 2 + rng.range(0, 1);
      const x = cx + Math.sin(a) * 8;
      const z = cz + Math.cos(a) * 8;
      const e = world.create();
      world.add(e, Transform, makeTransform(x, 0, z));
      world.add(e, Renderable, { assetId: def.theme.light.asset });
      rt.lights.push({ x, z, color: def.theme.light.color, intensity: def.theme.light.intensity, distance: 16, height: 2.6 });
    }
  }

  // Objective objects go into side rooms first, then main rooms (never start or boss).
  const spots = [...layout.rooms.filter((r) => r.kind === 'side'), ...layout.rooms.filter((r) => r.kind === 'main')];
  const obj = def.objective;
  if (obj.kind === 'activate' || obj.kind === 'collect' || obj.kind === 'destroy') {
    for (let i = 0; i < obj.count; i++) {
      const room = spots[i % spots.length]!;
      const c = roomCenter(room);
      const x = c.x + rng.range(-3, 3);
      const z = c.z + rng.range(-3, 3);
      if (obj.kind === 'activate') {
        const g = interactable(world, `gen.${i}`, 'generator', x, z, 'prop.generator', 1, '#ff3a2a');
        world.add(g, Collider, { radius: 0.9, mass: Infinity, layer: 'ground', isStatic: true });
      } else if (obj.kind === 'collect') {
        interactable(world, `card.${i}`, 'instanceKey', x, z, 'prop.cargo_crate', 0.3, '#3ad2ff');
      } else {
        const nest = world.create();
        world.add(nest, Transform, makeTransform(x, 0, z, rng.range(0, 6)));
        world.add(nest, Renderable, { assetId: 'prop.spore_nest', glow: '#7dff5a' });
        world.add(nest, Faction, { team: 'enemy' });
        world.add(nest, Health, { current: obj.life * (1 + 0.12 * (level - 1)), max: obj.life * (1 + 0.12 * (level - 1)) });
        world.add(nest, Collider, { radius: 1.2, mass: Infinity, layer: 'ground', isStatic: true });
        world.add(nest, Targetable, { spawn: { enemy: 'infected_colonist', count: 2, every: obj.spawnEvery, timer: 2 } });
      }
    }
  }

  // The way out, by the entrance.
  interactable(world, 'exit', 'portal', rt.start.x - 6, rt.start.z - 6, 'prop.teleporter', 0.32, '#5ad2ff');
  // Dungeon event: an extra named elite waits in a side room.
  if (rng.chance(def.eventChance)) {
    const room = layout.rooms.find((r) => r.kind === 'side') ?? layout.rooms.find((r) => r.kind === 'main');
    if (room) {
      const c = roomCenter(room);
      const enemy = packTemplate(rng.pick(def.packs)).members[0]!.enemy;
      const e = spawnEnemy(world, enemy, c.x + 2, c.z + 2, { level });
      makeElite(world, e, 'rare', rng);
    }
  }
  return rt;
}

/** Spawn a room's enemies (when the player first comes near). */
function populate(world: World, rt: InstanceRuntime, room: InstanceRoom): void {
  room.spawned = true;
  if (room.kind === 'start' || room.kind === 'boss') return;
  const c = roomCenter(room);
  const packs = rt.rng.int(rt.def.packsPerRoom[0], rt.def.packsPerRoom[1]);
  for (let p = 0; p < packs; p++) {
    const template = packTemplate(rt.rng.pick(rt.def.packs));
    const elite = rt.rng.chance(template.championChance * 1.5) ? 'champion' : rt.rng.chance(template.rareChance * 1.5) ? 'rare' : null;
    let first = true;
    for (const m of template.members) {
      if (m.chance !== undefined && !rt.rng.chance(m.chance)) continue;
      const n = rt.rng.int(m.count[0], m.count[1]);
      for (let i = 0; i < n; i++) {
        const e = spawnEnemy(world, m.enemy, c.x + rt.rng.range(-8, 8), c.z + rt.rng.range(-8, 8), { level: rt.level });
        if (first && elite) makeElite(world, e, elite, rt.rng);
        first = false;
      }
    }
  }
}

function inInstance(x: number): boolean {
  return x > INSTANCE_ORIGIN.x - 600;
}

export function instanceSystem(world: World, dt: number, ctx: GameContext): void {
  const rt = ctx.instance;
  if (!rt) return;
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined) return;
  const ptr = world.req(player, Transform);
  const def = rt.def;

  // Rooms wake as the player approaches and count as explored once entered.
  for (const room of rt.layout.rooms) {
    const c = roomCenter(room);
    const d = Math.max(Math.abs(ptr.x - c.x), Math.abs(ptr.z - c.z));
    if (!room.spawned && d < ROOM_CELL * 0.95) populate(world, rt, room);
    if (d < ROOM_CELL / 2) room.explored = true;
  }

  // Nests keep spawning while they live.
  for (const e of world.query(Targetable, Transform)) {
    const tg = world.req(e, Targetable);
    if (!tg.spawn || world.has(e, Dead)) continue;
    const tr = world.req(e, Transform);
    if (Math.hypot(tr.x - ptr.x, tr.z - ptr.z) > 22) continue;
    tg.spawn.timer -= dt;
    if (tg.spawn.timer > 0) continue;
    tg.spawn.timer = tg.spawn.every;
    for (let i = 0; i < tg.spawn.count; i++) {
      const a = ctx.rng.range(0, Math.PI * 2);
      const m = spawnEnemy(world, tg.spawn.enemy, tr.x + Math.sin(a) * 2.5, tr.z + Math.cos(a) * 2.5, { level: rt.level });
      world.req(m, EnemyAI).aggro = true;
    }
    ctx.events.push({ type: 'vfx', kind: 'sporePulse', x: tr.x, z: tr.z, radius: 2.5, facing: 0 });
  }

  const obj = def.objective;
  if (!rt.objective.done) {
    if (obj.kind === 'destroy') {
      const dead = world.query(Targetable).filter((e) => world.has(e, Dead) && inInstance(world.req(e, Transform).x)).length;
      if (dead !== rt.objective.progress) {
        rt.objective.progress = dead;
        ctx.events.push({ type: 'banner', key: 'instances.progress.destroy', params: { n: dead, count: obj.count }, seconds: 1.6 });
      }
    } else if (obj.kind === 'activate' && rt.objective.charging) {
      const ch = rt.objective.charging;
      const gt = world.req(ch.entity, Transform);
      // Charging only progresses while the player stays close.
      if (Math.hypot(gt.x - ptr.x, gt.z - ptr.z) < 9) ch.remaining -= dt;
      if (ch.remaining <= 0) {
        const r = world.get(ch.entity, Renderable);
        if (r) r.glow = '#7dff8a';
        rt.objective.charging = null;
        rt.objective.progress++;
        ctx.events.push({ type: 'banner', key: 'instances.progress.activate', params: { n: rt.objective.progress, count: obj.count }, seconds: 1.6 });
        rt.lights.push({ x: gt.x, z: gt.z + 1, color: '#7dffb0', intensity: 30, distance: 14, height: 2.4 });
      }
    } else if (obj.kind === 'clear') {
      const allSpawned = rt.layout.rooms.every((r) => r.spawned);
      const alive = world.query(EnemyAI, Transform).some((e) => !world.has(e, Dead) && inInstance(world.req(e, Transform).x));
      if (allSpawned && !alive) rt.objective.progress = 1;
    }
    const count = obj.kind === 'clear' ? 1 : obj.count;
    if (rt.objective.progress >= count) {
      rt.objective.done = true;
      for (const g of rt.gate) world.destroyDeferred(g);
      rt.gate = [];
      ctx.events.push({ type: 'banner', key: def.boss ? 'instances.gateOpen' : 'instances.cleared', seconds: 2.4 });
      if (!def.boss) complete(world, ctx, rt, rt.start.x + 4, rt.start.z + 4);
    }
  }

  // The boss appears when the player walks into its room.
  const bossRoom = rt.layout.rooms.find((r) => r.kind === 'boss');
  if (def.boss && bossRoom && rt.objective.done && rt.boss === null) {
    const c = roomCenter(bossRoom);
    if (Math.max(Math.abs(ptr.x - c.x), Math.abs(ptr.z - c.z)) < ROOM_CELL / 2 - 1) {
      rt.boss = spawnBoss(world, c.x, c.z, { ...def.boss, level: rt.level, arena: { x: c.x, z: c.z, radius: ROOM_CELL / 2 - 1 } });
      world.req(rt.boss, EnemyAI).aggro = true;
      ctx.events.push({ type: 'banner', key: def.boss.name, seconds: 2.4 });
    }
  }
  if (rt.boss !== null && !rt.completed && world.has(rt.boss, Dead)) {
    const tr = world.req(rt.boss, Transform);
    complete(world, ctx, rt, tr.x, tr.z);
  }
}

/** Boss dead (or bunker cleared): the cache, the objective signal and a way out. */
function complete(world: World, ctx: GameContext, rt: InstanceRuntime, x: number, z: number): void {
  rt.completed = true;
  interactable(world, 'cache', 'cache', x + 2, z, 'prop.supply_chest', 1.2, '#ffb43a');
  interactable(world, 'exit', 'portal', x - 3, z - 3, 'prop.teleporter', 0.32, '#5ad2ff');
  const id = rt.def.kind === 'dungeon' ? `dungeon.${rt.def.id}` : rt.poi;
  signal(ctx, { type: 'objective', id });
  ctx.events.push({ type: 'banner', key: 'instances.complete', params: {}, seconds: 2.6 });
  if (ctx.account) {
    const zoneId = ctx.zone?.def.id ?? 'zone';
    const entry = (ctx.account.restoration[zoneId] ??= { points: [], tiers: 0 });
    const k = `instance:${rt.poi}`;
    if (!entry.points.includes(k)) entry.points.push(k);
  }
}

/** Use an instance object (generator, keycard, cache, portal). Returns true if handled. */
export function instanceInteract(world: World, ctx: GameContext, target: Entity, it: Interactable): boolean {
  const rt = ctx.instance;
  if (!rt) return false;
  const tr = world.req(target, Transform);
  const obj = rt.def.objective;
  switch (it.kind) {
    case 'generator': {
      if (obj.kind !== 'activate' || rt.objective.charging) return false;
      it.used = true;
      rt.objective.charging = { entity: target, remaining: obj.charge };
      const r = world.get(target, Renderable);
      if (r) r.glow = '#ffd23a';
      // The noise draws a wave.
      for (let i = 0; i < obj.wave; i++) {
        const a = (i / obj.wave) * Math.PI * 2;
        const m = spawnEnemy(world, rt.rng.pick(['infected_colonist', 'infected_colonist', 'spore_hound', 'bloater']), tr.x + Math.sin(a) * 9, tr.z + Math.cos(a) * 9, { level: rt.level });
        world.req(m, EnemyAI).aggro = true;
      }
      ctx.events.push({ type: 'banner', key: 'instances.charging', seconds: 1.8 });
      return true;
    }
    case 'instanceKey':
      if (obj.kind !== 'collect') return false;
      it.used = true;
      world.destroyDeferred(target);
      rt.objective.progress++;
      ctx.events.push({ type: 'banner', key: 'instances.progress.collect', params: { n: rt.objective.progress, count: obj.count }, seconds: 1.6 });
      return true;
    case 'cache':
      it.used = true;
      ctx.rewards.push({ table: 'dt.dungeon_cache', level: rt.level, x: tr.x, z: tr.z, xp: false, ...(rt.def.kind === 'dungeon' ? { rarity: 'legendary' as const } : {}) });
      {
        const r = world.get(target, Renderable);
        if (r) delete r.glow;
      }
      return true;
    case 'portal':
      ctx.events.push({ type: 'interact', kind: 'portal', id: 'exit' });
      return true;
    default:
      return false;
  }
}

/** Remove everything that lives in instance space (walls, enemies, loot), except the player. */
export function clearInstance(world: World): void {
  for (const e of world.query(Transform)) {
    if (world.has(e, PlayerControlled)) continue;
    if (inInstance(world.req(e, Transform).x)) world.destroyDeferred(e);
  }
  world.flushDestroyed();
}

/** Objective line for the HUD. */
export function objectiveText(rt: InstanceRuntime, t: (key: string, params?: Record<string, string | number>) => string): string {
  const obj = rt.def.objective;
  if (rt.completed) return t('instances.objective.done');
  if (rt.objective.done) return rt.def.boss ? t('instances.objective.boss', { name: t(rt.def.boss.name) }) : t('instances.objective.done');
  if (obj.kind === 'clear') return t('instances.objective.clear');
  return t(`instances.objective.${obj.kind}`, { n: rt.objective.progress, count: obj.count });
}
