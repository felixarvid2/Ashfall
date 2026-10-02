/**
 * Open-world zone runtime: enemy packs that wake up as the player approaches and go back to sleep
 * far away, fog-of-war reveal, teleporter discovery and safe hubs (docs/world-and-gameplay.md §2).
 */
import { Dead, EnemyAI, Health, PlayerControlled, Renderable, Transform, CombatStats } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { Rng } from '../core/rng';
import { packTemplate } from '../data/packs';
import type { HubDef, ZoneDef } from '../data/zones/zoneTypes';
import { monsterLevel } from '../systems/encounter';
import { spawnEnemy } from './spawn';

/** A pack wakes up when the player is this close… */
export const PACK_WAKE = 55;
/** …goes back to sleep beyond this (if nobody is fighting)… */
export const PACK_SLEEP = 120;
/** …and a cleared pack returns after this long, once the player is away. */
export const PACK_RESPAWN = 240;
const PACK_RESPAWN_MIN_DISTANCE = 75;
/** Teleporters are discovered within this distance. */
export const DISCOVER_RADIUS = 7;
/** Fog of war is revealed within this radius of the player. */
export const REVEAL_RADIUS = 36;
const TICK = 0.25;

export interface PackState {
  state: 'dormant' | 'active' | 'cleared';
  members: Entity[];
  clearedAt: number;
  /** Times this pack has spawned (varies the roll). */
  spawns: number;
}

export interface ZoneRuntime {
  def: ZoneDef;
  packs: Map<string, PackState>;
  discovered: Set<string>;
  /** Fog-of-war cells (1 = revealed), `cells × cells`, row-major from (−half, −half). */
  revealed: Uint8Array;
  cells: number;
  timer: number;
  /** Hub the player is standing in, if any. */
  inHub: string | null;
}

export function createZoneRuntime(def: ZoneDef): ZoneRuntime {
  const cells = Math.ceil((def.halfSize * 2) / def.mapCell);
  return {
    def,
    packs: new Map(def.packs.map((p) => [p.id, { state: 'dormant', members: [], clearedAt: -Infinity, spawns: 0 }])),
    discovered: new Set(def.teleporters.filter((t) => t.hub).map((t) => t.id)),
    revealed: new Uint8Array(cells * cells),
    cells,
    timer: 0,
    inHub: null,
  };
}

export function hubAt(zone: ZoneRuntime | undefined, x: number, z: number, margin = 0): HubDef | null {
  if (!zone) return null;
  for (const h of zone.def.hubs) if (Math.hypot(x - h.x, z - h.z) <= h.radius + margin) return h;
  return null;
}

export function revealAround(zone: ZoneRuntime, x: number, z: number, radius = REVEAL_RADIUS): void {
  const { cells, def } = zone;
  const c = def.mapCell;
  const cx = Math.floor((x + def.halfSize) / c);
  const cz = Math.floor((z + def.halfSize) / c);
  const r = Math.ceil(radius / c);
  for (let j = cz - r; j <= cz + r; j++) {
    if (j < 0 || j >= cells) continue;
    for (let i = cx - r; i <= cx + r; i++) {
      if (i < 0 || i >= cells) continue;
      const px = (i + 0.5) * c - def.halfSize;
      const pz = (j + 0.5) * c - def.halfSize;
      if (Math.hypot(px - x, pz - z) <= radius) zone.revealed[j * cells + i] = 1;
    }
  }
}

export function revealedFraction(zone: ZoneRuntime): number {
  let n = 0;
  for (const v of zone.revealed) n += v;
  return n / zone.revealed.length;
}

export function nearestTeleporter(zone: ZoneRuntime, x: number, z: number) {
  let best = zone.def.teleporters.find((t) => t.hub) ?? zone.def.teleporters[0]!;
  let bestD = Infinity;
  for (const t of zone.def.teleporters) {
    if (!zone.discovered.has(t.id)) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** Fog bitmap ↔ base64 for saves. */
export function encodeRevealed(zone: ZoneRuntime): string {
  const bytes = new Uint8Array(Math.ceil(zone.revealed.length / 8));
  zone.revealed.forEach((v, i) => {
    if (v) bytes[i >> 3]! |= 1 << (i & 7);
  });
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function decodeRevealed(zone: ZoneRuntime, data: string): void {
  try {
    const s = atob(data);
    for (let i = 0; i < zone.revealed.length; i++) zone.revealed[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch {
    // Corrupt or empty: start unrevealed.
  }
}

/** Spawn one pack's members around its anchor, with an occasional champion pack or rare elite. */
function spawnPack(world: World, ctx: GameContext, zone: ZoneRuntime, id: string, state: PackState): void {
  const spawn = zone.def.packs.find((p) => p.id === id)!;
  const template = packTemplate(spawn.template);
  const rng = new Rng(`${id}-${state.spawns}-${ctx.rng.seed}`);
  state.spawns++;
  const level = monsterLevel(world, ctx);
  const ids: string[] = [];
  for (const m of template.members) {
    if (m.chance !== undefined && !rng.chance(m.chance)) continue;
    const n = rng.int(m.count[0], m.count[1]);
    for (let i = 0; i < n; i++) ids.push(m.enemy);
  }
  const champion = rng.chance(template.championChance);
  const rareIndex = !champion && rng.chance(template.rareChance) ? rng.int(0, ids.length - 1) : -1;
  state.members = ids.map((enemy, i) => {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, 3.5);
    const lim = zone.def.halfSize - 2;
    const x = Math.max(-lim, Math.min(lim, spawn.x + Math.sin(a) * d));
    const z = Math.max(-lim, Math.min(lim, spawn.z + Math.cos(a) * d));
    const e = spawnEnemy(world, enemy, x, z, { level });
    world.req(e, EnemyAI).pack = id;
    if (champion && i < 4) makeElite(world, e, 'champion', rng);
    if (i === rareIndex) makeElite(world, e, 'rare', rng);
    return e;
  });
  state.state = 'active';
}

/** Champions (blue) and rare elites (yellow): tougher, hit harder, better loot (affixes: elites.ts). */
export function makeElite(world: World, e: Entity, kind: 'champion' | 'rare', rng: Rng): void {
  const health = world.req(e, Health);
  const stats = world.req(e, CombatStats);
  const mul = kind === 'rare' ? 4 : 2;
  health.max *= mul;
  health.current = health.max;
  stats.weaponDamage *= kind === 'rare' ? 1.5 : 1.25;
  stats.tags.push('elite', kind);
  const r = world.get(e, Renderable);
  if (r) {
    r.glow = kind === 'rare' ? '#ffd23a' : '#4a8aff';
    r.scale = (r.scale ?? 1) * (kind === 'rare' ? 1.25 : 1.1);
  }
  void rng;
}

export function zoneSystem(world: World, dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  if (!zone) return;
  zone.timer -= dt;
  if (zone.timer > 0) return;
  zone.timer = TICK;
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined) return;
  const ptr = world.req(player, Transform);

  revealAround(zone, ptr.x, ptr.z);
  for (const t of zone.def.teleporters) {
    if (zone.discovered.has(t.id) || Math.hypot(t.x - ptr.x, t.z - ptr.z) > DISCOVER_RADIUS) continue;
    zone.discovered.add(t.id);
    ctx.events.push({ type: 'discover', id: t.id });
  }
  const hub = hubAt(zone, ptr.x, ptr.z);
  if ((hub?.id ?? null) !== zone.inHub) {
    ctx.events.push({ type: 'hub', id: hub?.id ?? zone.inHub!, entered: hub !== null });
    zone.inHub = hub?.id ?? null;
  }

  for (const spawn of zone.def.packs) {
    const st = zone.packs.get(spawn.id)!;
    const d = Math.hypot(spawn.x - ptr.x, spawn.z - ptr.z);
    if (st.state === 'active') {
      st.members = st.members.filter((m) => world.isAlive(m) && !world.has(m, Dead) && world.has(m, EnemyAI));
      if (st.members.length === 0) {
        st.state = 'cleared';
        st.clearedAt = ctx.time;
      } else if (d > PACK_SLEEP && !st.members.some((m) => world.req(m, EnemyAI).aggro)) {
        for (const m of st.members) world.destroyDeferred(m);
        st.members = [];
        st.state = 'dormant';
      }
    } else if (st.state === 'cleared') {
      if (ctx.time - st.clearedAt > PACK_RESPAWN && d > PACK_RESPAWN_MIN_DISTANCE) st.state = 'dormant';
    } else if (d < PACK_WAKE && !hubAt(zone, spawn.x, spawn.z, 10)) {
      spawnPack(world, ctx, zone, spawn.id, st);
    }
  }
}
