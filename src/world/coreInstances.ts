/**
 * The Core's dungeons and mirrors (docs/regions/the-core.md "Dungeons", "Memory Mirrors"):
 * - The Singing Halls: choir pillars. Hit one, or fight close to one, and it rings: a noise the whole room
 *   hears (the mines' hearing behaviour, see `hearing` on the instance and `minesAI.ts`).
 * - The Endless Shaft: floors of the same rooms. Clear a floor and a way down opens; each floor is denser
 *   (`shaftScaling`). The deepest floor reached is kept in the zone's `found` set as `core.shaft.floor.N`.
 * - Memory Mirrors: a lore log in the last room. Memory instances draw their enemies with the shade look.
 */
import { Collider, Dead, DisplayName, EnemyAI, Faction, Health, Interactable, Invulnerable, MoveTarget, PlayerControlled, Renderable, Targetable, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { Rng } from '../core/rng';
import { rareAffixCount, type EliteAffix } from '../data/elites';
import { INTERACT_RADIUS } from '../data/interactables';
import type { GameEvent } from '../core/events';
import { INSTANCE_ORIGIN, ROOM_CELL } from '../data/instances';
import { makeNoise, undergroundState } from './underground';
import { rollAffixes } from '../systems/elites';
import { signal } from '../systems/quests';
import { shadeLook } from './spawn';
import type { InstanceRoom, InstanceRuntime } from './instance';

const inInstance = (x: number) => x > INSTANCE_ORIGIN.x - 600;

export const PILLAR = {
  /** A pillar rings when any hit lands this close to it. */
  combatRadius: 8,
  /** Seconds the noise lasts, and the pause before the same pillar can ring again. */
  noise: 6,
  cooldown: 4,
  /** Life of a pillar: it only counts hits, it is never destroyed (it heals at once). */
  life: 1e6,
};

export interface CoreInstanceState {
  /** Endless Shaft: the floor the player is on, whether it is cleared, and the way down. */
  shaft?: { floor: number; cleared: boolean; portal: Entity | null; best: number };
  /** Singing Halls: the pillars and the room each one belongs to. */
  pillars?: { entity: Entity; room: InstanceRoom; readyAt: number; hp: number }[];
}

/** Memories (and the Chamber of Creation, whose portals hatch the earlier regions) draw their enemies with the shade look. */
export const shadesOnly = (rt: InstanceRuntime): boolean => rt.def.theme.shade === true || rt.def.objective.kind === 'portals';

/** The deepest Endless Shaft floor reached (from the zone's found set; 0 = none yet). */
export function bestShaftFloor(found: ReadonlySet<string>): number {
  let best = 0;
  for (const id of found) {
    const m = /^core\.shaft\.floor\.(\d+)$/.exec(id);
    if (m) best = Math.max(best, Number(m[1]));
  }
  return best;
}

/** Elite affixes for a shaft floor: the usual count plus the floor's extras. */
export function shaftAffixes(rng: Rng, kind: 'champion' | 'rare', level: number, extra: number): EliteAffix[] {
  const base = kind === 'rare' ? rareAffixCount(level) : rng.chance(0.5) ? 2 : 1;
  return rollAffixes(rng, base + extra);
}

function interactable(world: World, poi: string, kind: Interactable['kind'], x: number, z: number, asset: string, scale: number, glow?: string): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: asset, scale, ...(glow ? { glow } : {}) });
  world.add(e, Interactable, { poi, kind, radius: INTERACT_RADIUS, used: false, readyAt: 0 });
  return e;
}

/** Called once the rooms and the objective are built. */
export function setupCore(world: World, ctx: GameContext, rt: InstanceRuntime, roomCenter: (r: InstanceRoom) => { x: number; z: number }): void {
  const def = rt.def;
  const rng = rt.rng;
  const state: CoreInstanceState = (rt.core = {});
  if (def.floors) state.shaft = { floor: 1, cleared: false, portal: null, best: bestShaftFloor(ctx.zone?.found ?? new Set()) };
  if (def.pillars) {
    state.pillars = [];
    for (const room of rt.layout.rooms) {
      if (room.kind === 'start' || room.kind === 'boss') continue;
      const c = roomCenter(room);
      for (let i = 0; i < def.pillars; i++) {
        const e = world.create();
        world.add(e, Transform, makeTransform(c.x + rng.range(-6, 6), 0, c.z + rng.range(-6, 6), 0));
        world.add(e, Renderable, { assetId: 'prop.core_column', scale: 0.5, glow: '#ffe39a' });
        world.add(e, Faction, { team: 'enemy' });
        world.add(e, Health, { current: PILLAR.life, max: PILLAR.life });
        world.add(e, Collider, { radius: 0.9, mass: Infinity, layer: 'ground', isStatic: true });
        world.add(e, Targetable, {});
        world.add(e, DisplayName, { key: 'instances.choirPillar' });
        state.pillars.push({ entity: e, room, readyAt: 0, hp: PILLAR.life });
      }
    }
  }
  if (def.lore) {
    // The last room holds the log (bunkers keep it empty of enemies).
    const room = rt.layout.rooms.find((r) => r.kind === 'boss') ?? rt.layout.rooms[rt.layout.rooms.length - 1]!;
    const c = roomCenter(room);
    interactable(world, def.lore, 'lore', c.x - 3, c.z + 3, 'prop.control_terminal', 1, '#c8a4ff');
  }
}

/** A pillar rings: a noise for the hunters in earshot, and every sleeper in its room turns to look. */
export function ringPillar(world: World, ctx: GameContext, at: { x: number; z: number }, roomCentre: { x: number; z: number }): number {
  if (ctx.zone) {
    const st = undergroundState(ctx.zone);
    // Nothing prunes the list outside dark zones.
    st.noises = st.noises.filter((n) => n.until > ctx.time);
    makeNoise(st, ctx, at.x, at.z, PILLAR.noise);
  }
  let drawn = 0;
  for (const e of world.query(EnemyAI, Transform)) {
    if (world.has(e, Dead)) continue;
    const t = world.req(e, Transform);
    if (Math.max(Math.abs(t.x - roomCentre.x), Math.abs(t.z - roomCentre.z)) > ROOM_CELL / 2) continue;
    const ai = world.req(e, EnemyAI);
    if (ai.aggro) continue;
    ai.investigate = { x: at.x, z: at.z };
    drawn++;
  }
  ctx.events.push({ type: 'vfx', kind: 'shockwave', x: at.x, z: at.z, radius: 9, facing: 0 });
  ctx.events.push({ type: 'banner', key: 'instances.pillarRings', seconds: 1.8 });
  return drawn;
}

/** Per-tick work: pillars, the shaft's floors, and the shade look for whatever else appears. */
export function tickCore(world: World, _dt: number, ctx: GameContext, rt: InstanceRuntime, player: Entity, roomCenter: (r: InstanceRoom) => { x: number; z: number }): void {
  const st = rt.core;
  if (!st) return;

  if (st.pillars?.length) {
    const damage = ctx.events.peek().filter((e): e is Extract<GameEvent, { type: 'damage' }> => e.type === 'damage');
    for (const p of st.pillars) {
      if (!world.isAlive(p.entity)) continue;
      const h = world.req(p.entity, Health);
      const hit = h.current < p.hp;
      h.current = h.max;
      p.hp = h.max;
      if (ctx.time < p.readyAt) continue;
      const tr = world.req(p.entity, Transform);
      const near = damage.some((e) => e.target !== p.entity && Math.hypot(e.x - tr.x, e.z - tr.z) <= PILLAR.combatRadius);
      if (!hit && !near) continue;
      p.readyAt = ctx.time + PILLAR.cooldown;
      ringPillar(world, ctx, tr, roomCenter(p.room));
    }
  }

  const sh = st.shaft;
  if (sh && !sh.cleared) {
    const alive = world.query(EnemyAI, Transform).some((e) => !world.has(e, Dead) && inInstance(world.req(e, Transform).x));
    if (rt.layout.rooms.every((r) => r.spawned) && !alive) clearFloor(world, ctx, rt, player, roomCenter);
  }

  if (shadesOnly(rt)) for (const e of world.query(EnemyAI, Renderable, Transform)) if (inInstance(world.req(e, Transform).x)) shadeLook(world, e);
}

/** The floor is clear: remember it, pay out (deeper floors), and open the way down. */
function clearFloor(world: World, ctx: GameContext, rt: InstanceRuntime, player: Entity, roomCenter: (r: InstanceRoom) => { x: number; z: number }): void {
  const sh = rt.core!.shaft!;
  sh.cleared = true;
  sh.best = Math.max(sh.best, sh.floor);
  const id = `core.shaft.floor.${sh.floor}`;
  ctx.zone?.found.add(id);
  signal(ctx, { type: 'objective', id });
  const pt = world.req(player, Transform);
  // The way down stands in the middle of the room the player is in.
  const room = rt.layout.rooms.reduce((best, r) => {
    const c = roomCenter(r);
    const b = roomCenter(best);
    return Math.hypot(c.x - pt.x, c.z - pt.z) < Math.hypot(b.x - pt.x, b.z - pt.z) ? r : best;
  });
  const c = roomCenter(room);
  sh.portal = interactable(world, 'deeper', 'portal', c.x + 2, c.z + 2, 'prop.teleporter', 0.32, '#ffe39a');
  if (sh.floor > 1) ctx.rewards.push({ table: 'dt.dungeon_cache', level: rt.level, x: c.x - 2, z: c.z - 2, xp: false });
  ctx.events.push({ type: 'banner', key: 'instances.shaft.cleared', params: { n: sh.floor }, seconds: 2.2 });
  if (sh.floor === 1) rt.objective.progress = 1;
}

/** Use the way down: the next floor wakes with everything denser, and the player starts it at the entrance. */
export function descend(world: World, ctx: GameContext, rt: InstanceRuntime): boolean {
  const sh = rt.core?.shaft;
  if (!sh || !sh.cleared) return false;
  sh.floor++;
  sh.cleared = false;
  if (sh.portal !== null && world.isAlive(sh.portal)) world.destroyDeferred(sh.portal);
  sh.portal = null;
  for (const r of rt.layout.rooms) {
    r.spawned = r.kind === 'start';
    r.explored = r.kind === 'start';
  }
  const player = world.first(PlayerControlled, Transform);
  if (player !== undefined) {
    const tr = world.req(player, Transform);
    tr.x = tr.prevX = rt.start.x;
    tr.z = tr.prevZ = rt.start.z;
    world.remove(player, MoveTarget);
    world.add(player, Invulnerable, { remaining: 1.5 });
  }
  // Reaching a floor: `dungeon.core_endless_shaft.floor_N` (the quests wait for floor 8).
  signal(ctx, { type: 'objective', id: `dungeon.core_endless_shaft.floor_${sh.floor}` });
  ctx.events.push({ type: 'banner', key: 'instances.shaft.floor', params: { n: sh.floor }, seconds: 2.2 });
  ctx.events.push({ type: 'interact', kind: 'portal', id: 'deeper' });
  return true;
}
