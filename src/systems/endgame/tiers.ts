/**
 * World Tiers (docs/endgame.md): the account's chosen difficulty after the campaign. This file is the
 * shared entry point other endgame systems call: the current tier's modifiers, unlocking tiers, the play
 * time clock, and the enemy scaling `spawnEnemy` applies.
 */
import { EnemyAI, PlayerControlled, Resource, Transform } from '../../core/components';
import type { GameContext } from '../../core/context';
import type { World } from '../../core/ecs';
import { livingInCircle } from '../targeting';
import { SCALE_TO_PLAYER_FROM_TIER, TIER_TABLE, type TierMods, type WorldTier } from '../../data/endgame/tiers';

export type { TierMods, WorldTier };

const NEUTRAL: TierMods = TIER_TABLE[1];

/** The tier row for a tier number (unknown values fall back to the campaign). */
export function tierRow(tier: number): TierMods {
  return TIER_TABLE[tier as WorldTier] ?? NEUTRAL;
}

/** The tier in effect: the chosen one, never above what the account has unlocked. */
export function currentTier(ctx: GameContext): WorldTier {
  const e = ctx.account?.endgame;
  if (!e) return 1;
  // Deep Rifts have their own scaling: world tiers do not apply inside one.
  if ((ctx.instance?.def.kind as string | undefined) === 'rift') return 1;
  return Math.max(1, Math.min(e.tier, e.tierUnlocked, 4)) as WorldTier;
}

/** The current tier's modifiers; neutral without an account (headless sims). */
export function tierMods(ctx: GameContext): TierMods {
  return tierRow(currentTier(ctx));
}

/** Unlocks a World Tier for the whole account (never lowers it). */
export function unlockTier(ctx: GameContext, tier: WorldTier): void {
  const e = ctx.account?.endgame;
  if (e && tier > e.tierUnlocked) e.tierUnlocked = tier;
}

/** Do monsters match the player's level everywhere (not only inside the zone's range)? */
export function scalesToPlayer(ctx: GameContext): boolean {
  return currentTier(ctx) >= SCALE_TO_PLAYER_FROM_TIER;
}

/** Highest level monsters may reach in the current zone's content: unbounded once monsters follow the player. */
export function monsterLevelCap(ctx: GameContext): number {
  return scalesToPlayer(ctx) ? Infinity : ctx.zoneLevels[1];
}

/** Play time (seconds) on the account: the clock behind world bosses and the Ash Harvest rotation. */
export function tickPlaytime(ctx: GameContext, dt: number): void {
  const e = ctx.account?.endgame;
  if (e && dt > 0) e.playtime += dt;
}

// `spawnEnemy` has no context and ~40 callers, so the game publishes the tier's enemy scaling here once per tick
// (the same pattern as the item namer). Headless sims never set it and spawn at the campaign's strength.
let enemyScaling: { life: number; damage: number } = { life: 1, damage: 1 };

/** Enemy life and damage multipliers applied to every enemy spawned from now on. */
export function setEnemyScaling(mods: Pick<TierMods, 'enemyLife' | 'enemyDamage'>): void {
  enemyScaling = { life: mods.enemyLife, damage: mods.enemyDamage };
}

export function enemyScalingNow(): Readonly<{ life: number; damage: number }> {
  return enemyScaling;
}

/** Seconds after the last hit dealt or taken during which the Tier Beacon stays silent. */
export const BEACON_COMBAT_COOLDOWN = 6;
/** An enemy that has noticed the player within this distance also counts as combat. */
export const BEACON_COMBAT_RANGE = 22;

/** Is the player in combat (hit recently, or hunted by a nearby enemy)? The tier cannot be changed then. */
export function playerInCombat(world: World, ctx: GameContext): boolean {
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined) return false;
  if ((world.get(player, Resource)?.sinceCombat ?? Infinity) < BEACON_COMBAT_COOLDOWN) return true;
  const tr = world.req(player, Transform);
  return livingInCircle(world, ctx, tr.x, tr.z, BEACON_COMBAT_RANGE, 'enemy').some((e) => world.get(e, EnemyAI)?.aggro === true);
}

/** Switch the chosen tier (only to one the account has unlocked, and never in combat). Returns whether it changed. */
export function chooseTier(world: World, ctx: GameContext, tier: WorldTier): boolean {
  const e = ctx.account?.endgame;
  if (!e || tier > e.tierUnlocked || tier < 1 || tier === e.tier || playerInCombat(world, ctx)) return false;
  e.tier = tier;
  return true;
}
