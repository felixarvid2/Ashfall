/**
 * Ash Harvest runtime (docs/endgame.md): which region is under the Harvest, its pack modifiers, Ash Shard
 * drops, the three Harvest Caches in that region and the shard penalty for dying. Data: data/endgame/harvest.ts.
 * The clock is the account's play time (`account.endgame.playtime`); nothing here is saved beyond the
 * character's shard count (`ctx.endgame.ashShards`) and the recipes and materials a cache grants.
 */
import { Boss, Collider, Elite, EnemyAI, Interactable, PlayerControlled, Renderable, Transform, CombatStats, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { Rng } from '../core/rng';
import { INTERACT_RADIUS } from '../data/interactables';
import { HARVEST, HARVEST_CACHES, type CacheSpot } from '../data/endgame/harvest';
import { RECIPE_IDS } from '../data/endgame/crafting';
import { ZONES, zoneDef } from '../data/zones';
import { monsterLevel } from '../systems/encounter';
import { grantMaterial, grantRecipe } from '../systems/endgame/crafting';

/** The region currently under the Harvest. */
export interface ActiveHarvest {
  /** Index into HARVEST.rotation. */
  index: number;
  /** Rotations since play time 0 (changes every 20 minutes; keys the caches and the pack mix). */
  rotation: number;
  zoneId: string;
  /** Seconds of play time left in this rotation. */
  remaining: number;
}

/** The Harvest for a play time, or null before the account unlocked World Tier 2. */
export function harvestAt(tierUnlocked: number, playtime: number): ActiveHarvest | null {
  if (tierUnlocked < HARVEST.minTier) return null;
  const t = Math.max(0, playtime);
  const rotation = Math.floor(t / HARVEST.rotationSeconds);
  const index = rotation % HARVEST.rotation.length;
  return { index, rotation, zoneId: HARVEST.rotation[index]!, remaining: HARVEST.rotationSeconds - (t - rotation * HARVEST.rotationSeconds) };
}

/** The region under the Harvest right now (null without an account, before tier 2). */
export function activeHarvest(ctx: GameContext): ActiveHarvest | null {
  const e = ctx.account?.endgame;
  return e ? harvestAt(e.tierUnlocked, e.playtime) : null;
}

/** The Harvest, if the player stands in its region on the open map (not in a dungeon). */
export function harvestHere(ctx: GameContext): ActiveHarvest | null {
  const h = activeHarvest(ctx);
  return h && ctx.zone && !ctx.instance && ctx.zone.def.id === h.zoneId ? h : null;
}

/** "12:40" for a number of seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- Pack modifiers --------------------------------------------------------------

export interface PackMods {
  packMul: number;
  eliteMul: number;
  /** Share of packs swapped for another region's pack (10–30 %, fixed per rotation). */
  mixShare: number;
  rotation: number;
}

/** Share of mixed packs for a rotation: deterministic, between mixShare[0] and mixShare[1]. */
export function mixShareFor(rotation: number): number {
  const u = ((Math.imul(rotation + 1, 2654435761) >>> 0) % 10000) / 10000;
  return HARVEST.mixShare[0] + (HARVEST.mixShare[1] - HARVEST.mixShare[0]) * u;
}

/** Pack modifiers for packs spawning in `zoneId` now; null outside the active zone (the campaign is untouched). */
export function harvestPackMods(ctx: GameContext, zoneId: string): PackMods | null {
  const h = activeHarvest(ctx);
  if (!h || h.zoneId !== zoneId) return null;
  return { packMul: HARVEST.packMul, eliteMul: HARVEST.eliteMul, mixShare: mixShareFor(h.rotation), rotation: h.rotation };
}

const pools = new Map<string, string[]>();
/** Pack templates used by the other regions' packs. */
export function mixPool(zoneId: string): string[] {
  let pool = pools.get(zoneId);
  if (!pool) {
    const ids = new Set<string>();
    for (const z of ZONES) if (z.id !== zoneId) for (const p of z.packs) ids.add(p.template);
    pools.set(zoneId, (pool = [...ids].sort()));
  }
  return pool;
}

/** A template from another region instead of the pack's own, or null (the roll uses `rng` only in the active zone). */
export function mixedTemplate(mods: PackMods, zoneId: string, rng: Rng): string | null {
  if (!rng.chance(mods.mixShare)) return null;
  const pool = mixPool(zoneId);
  return pool.length ? rng.pick(pool) : null;
}

/** Scales a pack line's count (1.5× → 2 becomes 3, 3 becomes 4 or 5), rounding the fraction at random. */
export function scaledCount(n: number, mul: number, rng: Rng): number {
  const x = n * mul;
  const base = Math.floor(x);
  return base + (rng.chance(x - base) ? 1 : 0);
}

/** World events in the active zone come back twice as fast. */
export function harvestEventCooldownMul(ctx: GameContext): number {
  return harvestHere(ctx) ? HARVEST.eventCooldownMul : 1;
}

// ---- Shards ----------------------------------------------------------------------

/** Ash Shards an enemy is worth. */
export function shardValue(world: World, e: Entity): number {
  if (world.has(e, Boss)) return HARVEST.shards.boss;
  const tags = world.get(e, CombatStats)?.tags ?? [];
  return tags.includes('elite') || world.has(e, Elite) ? HARVEST.shards.elite : HARVEST.shards.normal;
}

/**
 * Called when something dies (combat.kill): enemies in the active zone drop shards straight into the
 * character's count; the player dying anywhere loses half of what is carried (the shards are gone, not left on the ground).
 */
export function harvestOnDeath(world: World, ctx: GameContext, target: Entity): void {
  const e = ctx.endgame;
  if (!e) return;
  if (world.has(target, PlayerControlled)) {
    const lost = Math.floor(e.ashShards * HARVEST.deathLoss);
    if (lost <= 0) return;
    e.ashShards -= lost;
    ctx.events.push({ type: 'notice', key: 'harvest.shardsLost' });
    return;
  }
  if (!world.has(target, EnemyAI) || world.get(target, Elite)?.copy || !harvestHere(ctx)) return;
  e.ashShards += shardValue(world, target);
}

// ---- Caches ----------------------------------------------------------------------

interface HarvestState {
  /** Cache id → the rotation it was opened in (it returns when its region is under the Harvest again). */
  opened: Map<string, number>;
  timer: number;
}
const states = new WeakMap<GameContext, HarvestState>();
function stateOf(ctx: GameContext): HarvestState {
  let s = states.get(ctx);
  if (!s) states.set(ctx, (s = { opened: new Map(), timer: 0 }));
  return s;
}

/** Caches of the active region that are still closed this rotation. */
export function closedCaches(ctx: GameContext, h: ActiveHarvest): CacheSpot[] {
  const opened = stateOf(ctx).opened;
  return (HARVEST_CACHES[h.zoneId] ?? []).filter((c) => opened.get(c.id) !== h.rotation);
}

const CACHE_LOOK = { asset: 'prop.supply_chest', scale: 1.4, glow: '#ff7a2a', collider: 0.9 };

/** Keeps the cache chests in step with the Harvest: present in the active region, gone elsewhere. */
export function harvestSystem(world: World, dt: number, ctx: GameContext): void {
  const s = stateOf(ctx);
  s.timer -= dt;
  if (s.timer > 0) return;
  s.timer = 0.5;
  const here = harvestHere(ctx);
  const want = here ? closedCaches(ctx, here) : [];
  const have = new Map<string, Entity>();
  for (const e of world.query(Interactable)) {
    const it = world.req(e, Interactable);
    if (it.kind !== 'harvestCache') continue;
    if (want.some((c) => c.id === it.poi) && !have.has(it.poi)) have.set(it.poi, e);
    else world.destroyDeferred(e);
  }
  for (const c of want) {
    if (have.has(c.id)) continue;
    const e = world.create();
    world.add(e, Transform, makeTransform(c.x, 0, c.z, ((c.x * 7 + c.z * 13) % 628) / 100));
    world.add(e, Renderable, { assetId: CACHE_LOOK.asset, scale: CACHE_LOOK.scale, glow: CACHE_LOOK.glow });
    world.add(e, Interactable, { poi: c.id, kind: 'harvestCache', radius: INTERACT_RADIUS, used: false, readyAt: 0 });
    world.add(e, Collider, { radius: CACHE_LOOK.collider, mass: Infinity, layer: 'ground', isStatic: true });
  }
}

/**
 * Open a Harvest Cache for its price in shards: a guaranteed legendary, Lumen Dust and a chance at a
 * tempering recipe the character does not know yet. The event detail is "<dust>,<recipe id or empty>".
 */
export function openHarvestCache(world: World, ctx: GameContext, target: Entity, it: Interactable): boolean {
  const e = ctx.endgame;
  const tr = world.get(target, Transform);
  const h = harvestHere(ctx);
  if (!e || !tr || !h) return false;
  if (e.ashShards < HARVEST.cacheCost) {
    ctx.events.push({ type: 'notice', key: 'harvest.needShards' });
    return false;
  }
  e.ashShards -= HARVEST.cacheCost;
  ctx.rewards.push({ table: 'dt.boss', level: monsterLevel(world, ctx), x: tr.x, z: tr.z, xp: false, rarity: 'legendary' });
  const rng = ctx.loot.rng;
  const dust = rng.int(HARVEST.cacheDust[0], HARVEST.cacheDust[1]);
  grantMaterial(ctx, HARVEST.cacheMaterial, dust);
  const unknown = RECIPE_IDS.filter((r) => !e.recipes.includes(r));
  let recipe = '';
  if (unknown.length && rng.chance(HARVEST.cacheRecipeChance)) {
    recipe = rng.pick(unknown);
    grantRecipe(ctx, recipe);
  }
  stateOf(ctx).opened.set(it.poi, h.rotation);
  world.destroyDeferred(target);
  ctx.events.push({ type: 'vfx', kind: 'shockwave', x: tr.x, z: tr.z, radius: 6, facing: 0 });
  ctx.events.push({ type: 'interact', kind: 'harvestCache', id: it.poi, detail: `${dust},${recipe}` });
  return true;
}

// ---- For the HUD and the map -------------------------------------------------------

export interface HarvestView {
  active: ActiveHarvest;
  /** Language key prefix of the region (zones.<key>.name). */
  zoneKey: string;
  /** The player is in that region on the open map. */
  here: boolean;
  /** Caches still closed this rotation. */
  caches: CacheSpot[];
}

export function harvestView(ctx: GameContext): HarvestView | null {
  const active = activeHarvest(ctx);
  if (!active) return null;
  return { active, zoneKey: zoneDef(active.zoneId).key, here: harvestHere(ctx) !== null, caches: closedCaches(ctx, active) };
}
