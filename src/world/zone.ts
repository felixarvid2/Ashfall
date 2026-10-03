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
import { applyAffixes, championAffixes, rareAffixes } from '../systems/elites';
import type { EliteAffix } from '../data/elites';
import { createSetPieces, extraHubs, type SetPieceState } from './setPieces';
import { createEvents, type EventState } from './worldEvents';
import { createStorm, type StormState } from './storm';

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
  /** One-time points of interest this character has used (locked chests, relics, logs, towers…). */
  found: Set<string>;
  /** Keycards carried (opening their locked chest spends them). */
  keycards: Set<string>;
  /** Stronghold and region boss state. */
  setPieces: SetPieceState;
  /** World events by point-of-interest id. */
  events: Map<string, EventState>;
  /** Ash Storm (docs/regions/cinder-flats.md). */
  storm: StormState;
  /** Border gates fire only after the player has stepped clear of them (no bounce on arrival). */
  gateReady: boolean;
}

export function createZoneRuntime(def: ZoneDef): ZoneRuntime {
  const cells = Math.ceil((def.halfSize * 2) / def.mapCell);
  const zone: ZoneRuntime = {
    def,
    packs: new Map(def.packs.map((p) => [p.id, { state: 'dormant', members: [], clearedAt: -Infinity, spawns: 0 }])),
    discovered: new Set(def.teleporters.filter((t) => t.hub).map((t) => t.id)),
    revealed: new Uint8Array(cells * cells),
    cells,
    timer: 0,
    inHub: null,
    found: new Set(),
    keycards: new Set(),
    setPieces: createSetPieces(),
    events: new Map(),
    storm: createStorm(),
    gateReady: false,
  };
  zone.events = createEvents(zone);
  return zone;
}

export function hubAt(zone: ZoneRuntime | undefined, x: number, z: number, margin = 0): HubDef | null {
  if (!zone) return null;
  for (const h of zone.def.hubs) if (Math.hypot(x - h.x, z - h.z) <= h.radius + margin) return h;
  // Reclaimed strongholds are hubs too.
  for (const h of extraHubs(zone)) if (Math.hypot(x - h.x, z - h.z) <= h.radius + margin) return h;
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

/** The player left this zone: its live packs go back to sleep (their entities are gone). */
export function suspendZone(zone: ZoneRuntime): void {
  for (const st of zone.packs.values()) {
    if (st.state !== 'active') continue;
    st.members = [];
    st.state = 'dormant';
  }
  zone.inHub = null;
  zone.gateReady = false;
  zone.timer = 0;
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
  const shared = champion ? championAffixes(rng) : [];
  const extra: Entity[] = [];
  state.members = ids.map((enemy, i) => {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, 3.5);
    const lim = zone.def.halfSize - 2;
    const x = Math.max(-lim, Math.min(lim, spawn.x + Math.sin(a) * d));
    const z = Math.max(-lim, Math.min(lim, spawn.z + Math.cos(a) * d));
    const e = spawnEnemy(world, enemy, x, z, { level });
    world.req(e, EnemyAI).pack = id;
    if (champion && i < 4) makeElite(world, e, 'champion', rng, shared);
    if (i === rareIndex) extra.push(...makeElite(world, e, 'rare', rng));
    return e;
  });
  state.members.push(...extra);
  state.state = 'active';
}

/**
 * Champions (blue) and rare elites (yellow): tougher, hit harder, carry affixes and better loot.
 * Champions in a pack share `affixes`; rares roll their own, get a generated name and minions.
 */
export function makeElite(world: World, e: Entity, kind: 'champion' | 'rare', rng: Rng, affixes?: EliteAffix[]): Entity[] {
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
  applyAffixes(world, e, kind, affixes ?? (kind === 'rare' ? rareAffixes(rng, stats.level) : championAffixes(rng)), rng);
  if (kind !== 'rare') return [];
  // Rare elites bring a few ordinary minions of their own kind.
  const ai = world.req(e, EnemyAI);
  const tr = world.req(e, Transform);
  const minions: Entity[] = [];
  const n = rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = spawnEnemy(world, ai.defId, tr.x + Math.sin(a) * 2.5, tr.z + Math.cos(a) * 2.5, { level: stats.level });
    if (ai.pack) world.req(m, EnemyAI).pack = ai.pack;
    minions.push(m);
  }
  return minions;
}

export function zoneSystem(world: World, dt: number, ctx: GameContext): void {
  const zone = ctx.zone;
  // Inside a dungeon the open world waits.
  if (!zone || ctx.instance) return;
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
  // Border crossings (the game loads the other zone).
  let atGate: string | null = null;
  let clear = true;
  for (const g of zone.def.gates) {
    const d = Math.hypot(g.x - ptr.x, g.z - ptr.z);
    if (d <= g.radius) atGate = g.id;
    if (d <= g.radius + 3) clear = false;
  }
  if (atGate && zone.gateReady && !world.has(player, Dead)) {
    zone.gateReady = false;
    ctx.events.push({ type: 'zoneGate', gate: atGate });
  } else if (clear) zone.gateReady = true;
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
