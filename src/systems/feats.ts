/**
 * Feats (D12, D13): feeds the account's counters from the frame's game events and reports the feats that
 * just reached their goal. Pure functions on the world and the account; the game shows the toast and saves.
 */
import { Boss, Elite, Faction, Progression, SkillUser } from '../core/components';
import type { World, Entity } from '../core/ecs';
import type { AccountData } from '../core/account';
import type { GameEvent } from '../core/events';
import { CLASSES } from '../data/db';
import { FEATS, FEAT_DEFS, type FeatDef, type FeatStat } from '../data/feats';

const bump = (stats: Record<string, number>, key: string, by = 1) => {
  stats[key] = (stats[key] ?? 0) + by;
};

/** Current value of the counter a feat is measured on. */
export function featValue(account: AccountData, stat: FeatStat): number {
  const stats = account.feats.stats;
  switch (stat) {
    case 'riftBest':
      return account.endgame.riftBest;
    case 'classesAt10':
      return [...CLASSES.keys()].filter((id) => (stats[`class.${id}`] ?? 0) >= 10).length;
    default:
      return stats[stat] ?? 0;
  }
}

export function featDone(account: AccountData, id: string): boolean {
  return id in account.feats.done;
}

/** Progress of one feat for the list: the value (capped at the goal) and whether it is done. */
export function featProgress(account: AccountData, def: FeatDef): { value: number; done: boolean } {
  const done = featDone(account, def.id);
  return { value: done ? def.goal : Math.min(def.goal, featValue(account, def.stat)), done };
}

/** Titles the account has earned, in feat order. */
export function earnedTitles(account: AccountData): string[] {
  return FEATS.filter((f) => f.title && featDone(account, f.id)).map((f) => f.id);
}

/** Sets the worn title (a feat id, or null for none). Refuses a title that is not earned. */
export function setTitle(account: AccountData, id: string | null): boolean {
  if (id !== null && !(FEAT_DEFS.get(id)?.title && featDone(account, id))) return false;
  account.feats.title = id;
  return true;
}

/** The title shown under the name, if it is still a valid earned one. */
export function wornTitle(account: AccountData | undefined): string | null {
  const id = account?.feats.title ?? null;
  return account && id && FEAT_DEFS.get(id)?.title && featDone(account, id) ? id : null;
}

/** Counts one frame's events into the account's counters. */
function count(world: World, account: AccountData, events: readonly GameEvent[]): void {
  const stats = account.feats.stats;
  for (const ev of events) {
    switch (ev.type) {
      case 'death': {
        if (ev.isPlayer) break;
        const e: Entity = ev.target;
        if (!world.isAlive(e) || world.get(e, Faction)?.team !== 'enemy') break;
        const elite = world.get(e, Elite);
        if (elite?.copy) break;
        bump(stats, 'kills');
        if (elite) bump(stats, 'elites');
        if (world.has(e, Boss)) bump(stats, 'bosses');
        break;
      }
      case 'pickup':
        if (ev.kind === 'item' && ev.rarity === 'unique') bump(stats, 'uniques');
        if (ev.kind === 'item' && ev.rarity === 'mythic') {
          bump(stats, 'uniques');
          bump(stats, 'mythics');
        }
        break;
      case 'interact':
        if (ev.kind === 'riftCleared') {
          bump(stats, 'riftsCleared');
          if (ev.detail === 'daily') bump(stats, 'dailyRifts');
        }
        break;
      case 'quest':
        if (ev.state === 'completed') bump(stats, 'quests');
        break;
      default:
        break;
    }
  }
}

/**
 * Updates the counters from `events` and from the player's level, and returns the feats completed by it.
 * Call it with an empty list after a load so a hero that is already level 30 counts.
 */
export function trackFeats(world: World, account: AccountData, player: Entity, events: readonly GameEvent[]): FeatDef[] {
  count(world, account, events);
  const level = world.get(player, Progression)?.level ?? 0;
  const classId = world.get(player, SkillUser)?.classId;
  const stats = account.feats.stats;
  if (level > (stats.level ?? 0)) stats.level = level;
  if (classId && level > (stats[`class.${classId}`] ?? 0)) stats[`class.${classId}`] = level;
  const earned: FeatDef[] = [];
  for (const f of FEATS) {
    if (featDone(account, f.id) || featValue(account, f.stat) < f.goal) continue;
    account.feats.done[f.id] = Date.now();
    earned.push(f);
  }
  return earned;
}
