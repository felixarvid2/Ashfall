/**
 * World bosses (docs/endgame.md): a timed boss at a fixed spot, scheduled from the account's play time.
 *
 * The schedule is a pure function of `playtime` (seconds): event n appears at n × interval, is announced
 * `warning` seconds ahead and despawns `lifetime` seconds after it appears. Which boss and which of its spots
 * come up is a seeded sequence, so the same play time always gives the same answer. The system spawns the boss
 * whenever the player is in the spot's zone while it is alive (it arrives on time, the player walks in
 * mid-lifetime, or comes back after leaving), and pays the chest when it dies.
 * It only runs once the account has reached World Tier 2.
 */
import { Boss, Dead, Health, PlayerControlled, SkillUser, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { Rng } from '../core/rng';
import { RECIPE_IDS } from '../data/endgame/crafting';
import { WORLD_BOSSES, WORLD_BOSS, type WorldBossDef, type WorldBossSpot } from '../data/endgame/worldBosses';
import { UNIQUE_DEFS } from '../data/loot/db';
import { resetBoss, spawnBoss } from '../systems/boss';
import { grantMaterial, grantRecipe } from '../systems/endgame/crafting';
import { tierMods, type TierMods } from '../systems/endgame/tiers';

// ---- The schedule (pure) --------------------------------------------------------------------------------

export interface WorldBossEvent {
  /** 1, 2, 3 …: the n-th world boss of the account. */
  index: number;
  def: WorldBossDef;
  spot: WorldBossSpot;
  /** Play time (s) at which it appears, and at which it is gone again. */
  appearsAt: number;
  endsAt: number;
}

/**
 * The bosses in the order they come: seeded, so a pure function of the index; never the same one twice running,
 * and the one that has waited longest is the likeliest, so all three keep coming.
 */
const bossOrder: number[] = [0];
const lastSeen: number[] = WORLD_BOSSES.map((_, i) => (i === 0 ? 0 : -i));
function bossIndexAt(index: number): number {
  while (bossOrder.length <= index) {
    const n = bossOrder.length;
    const prev = bossOrder[n - 1]!;
    const next = new Rng(`world-boss-order-${n}`).weighted(
      WORLD_BOSSES.map((_, i) => ({ item: i, weight: i === prev ? 0 : n - lastSeen[i]! })),
    );
    bossOrder.push(next);
    lastSeen[next] = n;
  }
  return bossOrder[index]!;
}

/** The n-th world boss (n ≥ 1): which boss, which of its spots, and when. */
export function worldBossEvent(index: number): WorldBossEvent {
  const def = WORLD_BOSSES[bossIndexAt(index)]!;
  const spot = new Rng(`world-boss-spot-${index}`).pick(def.spots);
  const appearsAt = index * WORLD_BOSS.interval;
  return { index, def, spot, appearsAt, endsAt: appearsAt + WORLD_BOSS.lifetime };
}

export interface WorldBossStatus {
  /** `warning`: announced, not here yet. `alive`: it is out there (until `event.endsAt`). */
  phase: 'warning' | 'alive';
  event: WorldBossEvent;
  /** Seconds until it appears (warning) or until it is gone (alive). */
  secondsLeft: number;
}

/** What the clock says at `playtime`; null between the events. */
export function worldBossStatus(playtime: number): WorldBossStatus | null {
  const n = Math.floor(playtime / WORLD_BOSS.interval);
  if (n >= 1 && playtime < n * WORLD_BOSS.interval + WORLD_BOSS.lifetime) {
    const event = worldBossEvent(n);
    return { phase: 'alive', event, secondsLeft: event.endsAt - playtime };
  }
  const next = worldBossEvent(n + 1);
  if (playtime >= next.appearsAt - WORLD_BOSS.warning) return { phase: 'warning', event: next, secondsLeft: next.appearsAt - playtime };
  return null;
}

// ---- Runtime --------------------------------------------------------------------------------------------

/** What a kill paid, for the toasts. */
export interface WorldBossReward {
  seq: number;
  recipes: string[];
  dust: number;
  unique: boolean;
}

export interface WorldBossRuntime {
  entity: Entity | null;
  /** The event the entity belongs to. */
  index: number;
  /** The last event killed (it does not come back). Not saved: a reload inside the window brings it back. */
  killed: number;
  /** Life fraction when it was last seen, so leaving the zone and coming back does not heal it. */
  lifeFrac: number;
  reward: WorldBossReward | null;
}

const runtimes = new WeakMap<GameContext, WorldBossRuntime>();

export function worldBossRuntime(ctx: GameContext): WorldBossRuntime {
  let rt = runtimes.get(ctx);
  if (!rt) runtimes.set(ctx, (rt = { entity: null, index: 0, killed: 0, lifeFrac: 1, reward: null }));
  return rt;
}

/** The status in effect for this game: null before World Tier 2, without an account, and once the boss is dead. */
export function activeWorldBoss(ctx: GameContext): WorldBossStatus | null {
  const e = ctx.account?.endgame;
  if (!e || e.tierUnlocked < WORLD_BOSS.minTier) return null;
  const st = worldBossStatus(e.playtime);
  if (!st || (st.phase === 'alive' && worldBossRuntime(ctx).killed === st.event.index)) return null;
  return st;
}

/** The marker for the maps: the boss's spot while it is announced or alive, in the zone that has it. */
export function worldBossMarker(ctx: GameContext): { x: number; z: number; color: string } | null {
  const st = activeWorldBoss(ctx);
  if (!st || ctx.instance || ctx.zone?.def.id !== st.event.spot.zone) return null;
  return { x: st.event.spot.x, z: st.event.spot.z, color: st.phase === 'alive' ? '#ff2a2a' : '#ffb23a' };
}

function removeBoss(world: World, e: Entity): void {
  const boss = world.get(e, Boss);
  if (boss) for (const x of [...boss.adds, ...boss.plates, ...(boss.parts ?? []), ...(boss.nodes ?? []), ...(boss.vines ?? []), ...(boss.fields ?? []), ...(boss.form !== undefined ? [boss.form] : [])]) if (world.isAlive(x)) world.destroyDeferred(x);
  if (world.isAlive(e)) world.destroyDeferred(e);
}

function spawn(world: World, ctx: GameContext, rt: WorldBossRuntime, event: WorldBossEvent): void {
  const { def, spot } = event;
  // Life, damage and the World Tier's multipliers on top: spawnEnemy applies the tier (src/systems/endgame/tiers.ts).
  const e = spawnBoss(world, spot.x, spot.z, {
    enemy: def.enemy,
    name: `worldBoss.${def.id}.name`,
    level: WORLD_BOSS.level,
    lifeMul: def.lifeMul,
    damageMul: def.damageMul,
    affixes: def.affixes,
    script: def.script,
    arena: { x: spot.x, z: spot.z, radius: spot.radius },
  });
  const h = world.req(e, Health);
  h.current = Math.max(1, h.max * rt.lifeFrac);
  // The announcement is for the first time it appears, not every time the player comes back to it.
  if (rt.index !== event.index) ctx.events.push({ type: 'banner', key: `worldBoss.${def.id}.intro`, seconds: 3 });
  rt.entity = e;
  rt.index = event.index;
}

// ---- Rewards --------------------------------------------------------------------------------------------

/** The unique that can drop for a class: the class's own and the classless ones, never mythics. */
export function worldBossUniques(classId: string): string[] {
  return [...UNIQUE_DEFS.values()].filter((u) => u.rarity === 'unique' && (!u.classes || u.classes.includes(classId))).map((u) => u.id);
}

/**
 * The chest: a guaranteed legendary and the boss table's drops, maybe a unique (scaled by the tier's rare
 * drop weight), 1–2 tempering recipes the character does not know yet, and Lumen Dust.
 */
export function payWorldBoss(ctx: GameContext, def: WorldBossDef, x: number, z: number, classId: string, mods: TierMods = tierMods(ctx)): WorldBossReward {
  const rng = ctx.loot.rng;
  const level = WORLD_BOSS.level;
  ctx.rewards.push({ table: WORLD_BOSS.dropTable, level, x, z, xp: true, rarity: 'legendary' });
  const pool = worldBossUniques(classId);
  const unique = pool.length > 0 && rng.chance(Math.min(1, def.rewards.uniqueChance * mods.rareDrops));
  if (unique) ctx.rewards.push({ table: 'dt.quest_reward', level, x, z, xp: false, unique: rng.pick(pool) });
  const recipes: string[] = [];
  const known = new Set(ctx.endgame?.recipes ?? []);
  const fresh = RECIPE_IDS.filter((id) => !known.has(id));
  const want = rng.int(def.rewards.recipes[0], def.rewards.recipes[1]);
  for (let i = 0; i < want && fresh.length > 0; i++) {
    const id = fresh.splice(rng.int(0, fresh.length - 1), 1)[0]!;
    if (grantRecipe(ctx, id)) recipes.push(id);
  }
  const dust = rng.int(def.rewards.dust[0], def.rewards.dust[1]);
  grantMaterial(ctx, 'lumen_dust', dust);
  const rt = worldBossRuntime(ctx);
  rt.reward = { seq: (rt.reward?.seq ?? 0) + 1, recipes, dust, unique };
  return rt.reward;
}

// ---- The system -----------------------------------------------------------------------------------------

export function worldBossSystem(world: World, _dt: number, ctx: GameContext): void {
  const rt = worldBossRuntime(ctx);
  // Inside a dungeon the zone's entities are still there, but nothing here changes.
  if (ctx.instance) return;
  const st = activeWorldBoss(ctx);
  const here = rt.entity !== null && world.isAlive(rt.entity) ? rt.entity : null;

  if (here !== null) {
    const dead = world.has(here, Dead);
    if (dead) {
      if (rt.killed !== rt.index) {
        rt.killed = rt.index;
        const def = worldBossEvent(rt.index).def;
        const tr = world.req(here, Transform);
        const player = world.first(PlayerControlled, SkillUser);
        const classId = player !== undefined ? world.req(player, SkillUser).classId : 'bastion';
        payWorldBoss(ctx, def, tr.x, tr.z, classId);
        ctx.events.push({ type: 'banner', key: 'worldBoss.defeated', seconds: 3 });
      }
      rt.entity = null;
      return;
    }
    // Gone with its time (or the account lost the tier): despawn.
    if (!st || st.phase !== 'alive' || st.event.index !== rt.index) {
      removeBoss(world, here);
      rt.entity = null;
      return;
    }
    const h = world.req(here, Health);
    rt.lifeFrac = h.current / h.max;
    // The player died in the fight: it heals up and goes home.
    const player = world.first(PlayerControlled, Transform);
    if (player !== undefined && world.has(player, Dead) && world.req(here, Boss).engaged) {
      resetBoss(world, here);
      rt.lifeFrac = 1;
    }
    return;
  }

  rt.entity = null;
  if (!st || st.phase !== 'alive' || !ctx.zone || ctx.zone.def.id !== st.event.spot.zone) return;
  if (rt.killed === st.event.index) return;
  // A new event starts at full life; the same one (back in the zone) keeps what was taken off it.
  if (rt.index !== st.event.index) rt.lifeFrac = 1;
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined) return;
  spawn(world, ctx, rt, st.event);
}
