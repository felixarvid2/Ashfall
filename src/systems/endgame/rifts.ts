/**
 * Deep Rifts (docs/endgame.md): the rules of a rift run. The rooms are built by world/instance.ts from the
 * rift's InstanceDef (data/endgame/rifts.ts); this file holds the level and scaling rules, the progress bar
 * (kills), the guardian, the 10-minute timer, and what a clear pays out. Pure functions on the world and the
 * context, so tests drive them directly.
 */
import { CombatStats, Dead, Elite, EnemyAI, Faction, Health, Interactable, Renderable, Transform, makeTransform } from '../../core/components';
import type { GameContext } from '../../core/context';
import type { Entity, World } from '../../core/ecs';
import type { Rng } from '../../core/rng';
import { INSTANCE_ORIGIN, ROOM_CELL } from '../../data/instances';
import { GLYPHS } from '../../data/endgame/matrix';
import { RIFT, RIFT_GUARDIANS, RIFT_PACKS, RIFT_RECIPE_POOL, RIFT_REWARDS } from '../../data/endgame/rifts';
import { INTERACT_RADIUS } from '../../data/interactables';
import { packTemplate } from '../../data/packs';
import { spawnBoss } from '../boss';
import { spawnEnemy } from '../../world/spawn';
import { grantMaterial, grantRecipe } from './crafting';
import { upgradeGlyph, grantGlyph } from './matrix';
import { unlockTier } from './tiers';

export type RiftPhase = 'running' | 'guardian' | 'cleared' | 'failed';

export interface RiftState {
  /** Rift level 1..100. */
  level: number;
  /** Life multiplier: 1.06 ^ level. */
  mul: number;
  /** Damage multiplier: 1.035 ^ level (G024). */
  dmgMul: number;
  /** Seconds spent inside. */
  elapsed: number;
  /** Progress points from kills (RIFT.need fills the bar). */
  points: number;
  phase: RiftPhase;
  guardian: Entity | null;
  /** Dead enemies already counted (pruned when the corpse goes). */
  counted: Set<Entity>;
  /** Seconds until the next surge pack once every room has woken. */
  surge: number;
  /** Glyph upgrade attempts left (set on a clear). */
  attempts: number;
  /** The exit was used once while attempts were left: the next use leaves. */
  warned: boolean;
  /** `elapsed` when the exit was last used mid-run: using it again within `RIFT.abandonWindow` seconds abandons the run. */
  abandonAt: number;
  /** Seconds until a collapsed rift throws the player out. */
  collapse: number;
  /** Results of a clear, for the panel and tests. */
  result: RiftResult | null;
  /** The cache was opened. */
  cacheOpened: boolean;
}

export interface RiftResult {
  level: number;
  /** Seconds the run took, and the share of the time left. */
  elapsed: number;
  fast: boolean;
  /** Highest level now open, and the account's best. */
  open: number;
  best: number;
  newBest: boolean;
  /** World Tiers this clear unlocked. */
  tiers: number[];
  /** A glyph given because the character had none. */
  grantedGlyph: string | null;
}

// ---- Levels and scaling ---------------------------------------------------------------

/** Life multiplier for a rift level. */
export function riftScale(level: number): number {
  return Math.pow(RIFT.perLevel, Math.max(0, level));
}

/** Damage multiplier for a rift level: grows slower than life (G024). */
export function riftDamageScale(level: number): number {
  return Math.pow(RIFT.damagePerLevel, Math.max(0, level));
}

/** Chances of the cache's extra unique, and of that item being a mythic (C011). */
export function riftExtraChances(level: number): { unique: number; mythic: number } {
  const { uniqueChance, mythicChance } = RIFT_REWARDS;
  return {
    unique: Math.min(1, uniqueChance.base + uniqueChance.perLevel * level),
    mythic: Math.min(1, Math.max(0, level - mythicChance.from) * mythicChance.perLevel),
  };
}

/** Item power of the cache's items: the level-50 baseline plus 2 per level, capped. */
export function riftItemPower(level: number): number {
  const { base, perLevel, cap } = RIFT_REWARDS.itemPower;
  return Math.min(cap, base + perLevel * level);
}

/** What the cache of a rift of this level holds: guaranteed legendaries and Rift Shards (shown on the obelisk panel, paid by `openRiftCache`). */
export function riftCacheYield(level: number): { legendaries: number; shards: number } {
  return {
    legendaries: RIFT_REWARDS.legendaries.base + Math.floor(level / RIFT_REWARDS.legendaries.perLevels),
    shards: Math.round(RIFT_REWARDS.shards.base + RIFT_REWARDS.shards.perLevel * level),
  };
}

/** Does the account have the tier that opens the Rift Obelisk? */
export function riftsUnlocked(ctx: GameContext): boolean {
  return (ctx.account?.endgame.tierUnlocked ?? 1) >= RIFT.tierRequired;
}

/** The highest rift level the account may enter: the best cleared + 1, or +2 after a fast clear. */
export function riftOpenLevel(ctx: GameContext): number {
  const e = ctx.account?.endgame;
  return Math.max(1, Math.min(RIFT.maxLevel, Math.max((e?.riftBest ?? 0) + 1, e?.riftOpen ?? 0)));
}

export function createRift(level: number): RiftState {
  const lv = Math.max(1, Math.min(RIFT.maxLevel, Math.floor(level)));
  return {
    level: lv,
    mul: riftScale(lv),
    dmgMul: riftDamageScale(lv),
    elapsed: 0,
    points: 0,
    phase: 'running',
    guardian: null,
    counted: new Set(),
    surge: RIFT.surgeEvery,
    attempts: 0,
    warned: false,
    abandonAt: -Infinity,
    collapse: 3.5,
    result: null,
    cacheOpened: false,
  };
}

// ---- Progress -------------------------------------------------------------------------

/** What an enemy's death adds to the bar: normal 1, champion 5, rare / named elite 10. */
export function killWeight(world: World, e: Entity): number {
  const elite = world.get(e, Elite);
  if (!elite) return RIFT.weights.normal;
  if (elite.copy) return 0;
  return elite.kind === 'champion' ? RIFT.weights.champion : RIFT.weights.elite;
}

/** Bar fill, 0..1. */
export function riftProgress(r: RiftState): number {
  return Math.min(1, r.points / RIFT.need);
}

export function riftTimeLeft(r: RiftState): number {
  return Math.max(0, RIFT.time - r.elapsed);
}

const inInstance = (x: number) => x > INSTANCE_ORIGIN.x - 600;

/** Scale every rift enemy that has not been yet (every spawn path: packs, minions, events, surges, guardian adds). */
function scaleEnemies(world: World, r: RiftState): void {
  for (const e of world.query(EnemyAI, Health, CombatStats, Transform)) {
    if (!inInstance(world.req(e, Transform).x) || world.has(e, Dead)) continue;
    const stats = world.req(e, CombatStats);
    if (stats.tags.includes('rift')) continue;
    stats.tags.push('rift');
    const h = world.req(e, Health);
    h.max *= r.mul;
    h.current = h.max;
    stats.weaponDamage *= r.dmgMul;
  }
}

function countKills(world: World, r: RiftState): void {
  for (const e of r.counted) if (!world.isAlive(e) || !world.has(e, Dead)) r.counted.delete(e);
  for (const e of world.query(EnemyAI, Dead, Transform)) {
    if (r.counted.has(e) || e === r.guardian || !inInstance(world.req(e, Transform).x)) continue;
    if (world.get(e, Faction)?.team !== 'enemy') continue;
    r.counted.add(e);
    if (r.phase === 'running') r.points += killWeight(world, e);
  }
}

// ---- The guardian ---------------------------------------------------------------------

/** Spawn the Rift Guardian in the room nearest the player, in the Lumen look, and clear out what is left. */
export function spawnGuardian(world: World, ctx: GameContext, rt: RiftHost, r: RiftState, player: Entity): Entity {
  const pt = world.req(player, Transform);
  const room = rt.layout.rooms.reduce((best, x) => {
    const c = rt.roomCenter(x);
    const b = rt.roomCenter(best);
    return Math.hypot(c.x - pt.x, c.z - pt.z) < Math.hypot(b.x - pt.x, b.z - pt.z) ? x : best;
  });
  for (const x of rt.layout.rooms) x.spawned = true;
  // What is left of the rift's crowd falls away: the guardian fight is the guardian.
  for (const e of world.query(EnemyAI, Transform)) if (inInstance(world.req(e, Transform).x) && !world.has(e, Dead)) world.destroyDeferred(e);
  const c = rt.roomCenter(room);
  const g = rt.rng.pick(RIFT_GUARDIANS);
  const boss = spawnBoss(world, c.x, c.z, {
    ...g,
    level: RIFT.monsterLevel,
    lifeMul: g.lifeMul * RIFT.guardianLife * r.mul,
    damageMul: g.damageMul * RIFT.guardianDamage * r.dmgMul,
    arena: { x: c.x, z: c.z, radius: ROOM_CELL / 2 - 1 },
  });
  world.req(boss, CombatStats).tags.push('rift', 'guardian');
  const look = world.get(boss, Renderable);
  if (look) look.look = 'lumen';
  world.req(boss, EnemyAI).aggro = true;
  r.guardian = boss;
  r.phase = 'guardian';
  ctx.events.push({ type: 'banner', key: 'rifts.guardianAppears', keyParams: { name: g.name }, seconds: 3 });
  return boss;
}

/** What the rift needs from its instance (so this file does not import world/instance.ts). */
export interface RiftHost {
  layout: { rooms: { gx: number; gz: number; spawned: boolean; kind: string }[] };
  rng: Rng;
  start: { x: number; z: number };
  roomCenter(room: { gx: number; gz: number }): { x: number; z: number };
}

// ---- Per-tick -------------------------------------------------------------------------

/** One tick of a rift run: scaling, kills, the bar, the guardian, the timer. */
export function tickRift(world: World, dt: number, ctx: GameContext, rt: RiftHost, r: RiftState, player: Entity): void {
  scaleEnemies(world, r);
  if (r.phase === 'failed') {
    r.collapse -= dt;
    if (r.collapse <= 0 && r.collapse + dt > 0) ctx.events.push({ type: 'interact', kind: 'riftExit', id: 'collapse' });
    return;
  }
  if (r.phase === 'cleared') return;

  r.elapsed += dt;
  countKills(world, r);

  if (r.phase === 'running') {
    // Every room has woken and the crowd is thin: the rift sends more.
    const woken = rt.layout.rooms.every((x) => x.spawned);
    if (woken && riftProgress(r) < 1) {
      const alive = world.query(EnemyAI, Transform).filter((e) => !world.has(e, Dead) && inInstance(world.req(e, Transform).x)).length;
      r.surge -= dt;
      if (alive < RIFT.surgeBelow && r.surge <= 0) {
        r.surge = RIFT.surgeEvery;
        surgePack(world, rt, player);
      }
    }
    if (riftProgress(r) >= 1 && r.elapsed < RIFT.time) spawnGuardian(world, ctx, rt, r, player);
  } else if (r.phase === 'guardian' && r.guardian !== null && world.has(r.guardian, Dead)) {
    completeRift(world, ctx, rt, r, world.req(r.guardian, Transform));
    return;
  }

  if (r.elapsed >= RIFT.time) failRift(world, ctx, r);
}

function surgePack(world: World, rt: RiftHost, player: Entity): void {
  const pt = world.req(player, Transform);
  const template = packTemplate(rt.rng.pick(RIFT_PACKS));
  const a = rt.rng.range(0, Math.PI * 2);
  const cx = pt.x + Math.sin(a) * 11;
  const cz = pt.z + Math.cos(a) * 11;
  for (const m of template.members) {
    if (m.chance !== undefined && !rt.rng.chance(m.chance)) continue;
    const n = rt.rng.int(m.count[0], m.count[1]);
    for (let i = 0; i < n; i++) {
      spawnEnemy(world, m.enemy, cx + rt.rng.range(-3, 3), cz + rt.rng.range(-3, 3), { level: RIFT.monsterLevel, aggro: true });
    }
  }
}

// ---- Failing and clearing -------------------------------------------------------------

/** Out of time (or the player died): the rift collapses, no upgrades. */
export function failRift(world: World, ctx: GameContext, r: RiftState): void {
  if (r.phase === 'failed' || r.phase === 'cleared') return;
  r.phase = 'failed';
  void world;
  ctx.events.push({ type: 'banner', key: 'rifts.collapse', seconds: 3 });
  ctx.events.push({ type: 'interact', kind: 'riftFailed', id: String(r.level) });
}

/** The glyph ids a character may be granted (all twelve), from the Neural Matrix data. */
export type GlyphPool = readonly string[];
const GLYPH_IDS: GlyphPool = GLYPHS.map((g) => g.id);

/**
 * The guardian is dead within the time: update the account, unlock World Tiers, give the three glyph attempts
 * (a random glyph first if the character has none), and place the cache and the way out where it fell.
 */
export function completeRift(world: World, ctx: GameContext, rt: RiftHost, r: RiftState, at: { x: number; z: number }, glyphPool: GlyphPool = GLYPH_IDS): RiftResult {
  r.phase = 'cleared';
  const left = riftTimeLeft(r);
  const fast = left > RIFT.time * RIFT.fastShare;
  const e = ctx.account?.endgame;
  const prevBest = e?.riftBest ?? 0;
  const newBest = r.level > prevBest || (r.level === prevBest && (e?.riftTime ?? 0) > 0 && r.elapsed < (e?.riftTime ?? 0));
  const tiers: number[] = [];
  if (e) {
    if (r.level > e.riftBest) e.riftBest = r.level;
    e.riftOpen = Math.max(e.riftOpen, Math.min(RIFT.maxLevel, r.level + (fast ? 2 : 1)));
    if (newBest || e.riftTime === 0) e.riftTime = Math.round(r.elapsed * 10) / 10;
  }
  for (const u of RIFT.tierUnlocks) {
    if (r.level < u.level) continue;
    if ((e?.tierUnlocked ?? 4) < u.tier) tiers.push(u.tier);
    unlockTier(ctx, u.tier);
  }
  let grantedGlyph: string | null = null;
  if (ctx.endgame && ctx.endgame.glyphs.length === 0 && glyphPool.length > 0) {
    const id = rt.rng.pick(glyphPool);
    if (grantGlyph(ctx, id)) grantedGlyph = id;
  }
  r.attempts = RIFT_REWARDS.glyphAttempts;
  r.result = { level: r.level, elapsed: r.elapsed, fast, open: riftOpenLevel(ctx), best: e?.riftBest ?? r.level, newBest, tiers, grantedGlyph };

  placeObject(world, 'rift.cache', 'cache', at.x + 2, at.z, 'prop.supply_chest', 1.2, '#b48cff');
  placeObject(world, 'exit', 'portal', at.x - 3, at.z - 3, 'prop.teleporter', 0.32, '#5ad2ff');
  ctx.events.push({ type: 'banner', key: 'rifts.cleared', params: { level: r.level }, seconds: 3 });
  ctx.events.push({ type: 'interact', kind: 'riftCleared', id: String(r.level) });
  return r.result;
}

function placeObject(world: World, poi: string, kind: Interactable['kind'], x: number, z: number, asset: string, scale: number, glow: string): Entity {
  const e = world.create();
  world.add(e, Transform, makeTransform(x, 0, z, 0));
  world.add(e, Renderable, { assetId: asset, scale, glow });
  world.add(e, Interactable, { poi, kind, radius: INTERACT_RADIUS, used: false, readyAt: 0 });
  return e;
}

/** One glyph upgrade attempt for the glyph the player picked. Returns the new level, null on a failed roll, or false when not allowed. */
export function riftGlyphAttempt(ctx: GameContext, r: RiftState, glyphId: string): { ok: boolean; level: number | null } | false {
  if (r.phase !== 'cleared' || r.attempts <= 0) return false;
  if (!ctx.endgame?.glyphs.some((g) => g.id === glyphId)) return false;
  r.attempts--;
  const level = upgradeGlyph(ctx, glyphId, r.level);
  return { ok: level !== null, level };
}

/** Opening the cache: legendaries at the rift's item power, Rift Shards, and a chance at a recipe. */
export function openRiftCache(world: World, ctx: GameContext, r: RiftState, at: { x: number; z: number }, rng: Rng): { legendaries: number; shards: number; recipe: string | null; extra: 'unique' | 'mythic' | null } {
  r.cacheOpened = true;
  const { legendaries, shards } = riftCacheYield(r.level);
  ctx.rewards.push({ table: 'dt.dungeon_cache', level: RIFT.monsterLevel, x: at.x, z: at.z, xp: false, rarity: 'legendary', count: legendaries, itemPower: riftItemPower(r.level) });
  grantMaterial(ctx, 'rift_shard', shards);
  let recipe: string | null = null;
  if (rng.chance(RIFT_REWARDS.recipeChance)) {
    const known = new Set(ctx.endgame?.recipes ?? []);
    const fresh = RIFT_RECIPE_POOL.filter((id) => !known.has(id));
    const pool = fresh.length ? fresh : RIFT_RECIPE_POOL;
    const id = rng.pick(pool);
    if (grantRecipe(ctx, id)) recipe = id;
  }
  // C011: one extra unique, rarely a mythic, so levels past 40 keep a goal. Rolled last: the recipe roll above is unchanged.
  const chances = riftExtraChances(r.level);
  const extra = rng.chance(chances.mythic) ? 'mythic' : rng.chance(chances.unique) ? 'unique' : null;
  if (extra) ctx.rewards.push({ table: 'dt.dungeon_cache', level: RIFT.monsterLevel, x: at.x, z: at.z, xp: false, rarity: extra, count: 1, itemPower: riftItemPower(r.level) });
  void world;
  return { legendaries, shards, recipe, extra };
}

// ---- Entering -------------------------------------------------------------------------

/** Why the obelisk would refuse a level (null = allowed). */
export function riftEntryProblem(ctx: GameContext, level: number): 'locked' | 'level' | null {
  if (!riftsUnlocked(ctx)) return 'locked';
  if (!Number.isInteger(level) || level < 1 || level > riftOpenLevel(ctx)) return 'level';
  return null;
}

/** HUD numbers: time left, bar fill, level, and a line for the phase. */
export function riftHud(r: RiftState): { level: number; left: number; progress: number; phase: RiftPhase } {
  return { level: r.level, left: riftTimeLeft(r), progress: riftProgress(r), phase: r.phase };
}
