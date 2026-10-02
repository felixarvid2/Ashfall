/**
 * Account-wide progress shared by every character slot: Echo Relics found and Region Restoration
 * (docs/world-and-gameplay.md §3, §3.2). Stored next to the character saves.
 */
import { z } from 'zod';
import type { Effect } from '../data/effects';
import { RELIC_BONUS } from '../data/interactables';
import { ItemSchema, type StatKey } from '../data/loot/schemas';

const KEY = 'ashfall.account';

export const AccountSchema = z.object({
  version: z.literal(1),
  /** Echo Relic ids → the stat each one granted. */
  relics: z.record(z.string(), z.string()).default({}),
  /** Restoration points earned per zone, and the reward tiers already granted. */
  restoration: z.record(z.string(), z.object({ points: z.array(z.string()).default([]), tiers: z.number().int().default(0) })).default({}),
  /** Shared stash (all characters). */
  stash: z.array(ItemSchema.nullable()).default([]),
});
export type AccountData = z.infer<typeof AccountSchema>;

export function emptyAccount(): AccountData {
  return { version: 1, relics: {}, restoration: {}, stash: [] };
}

export function loadAccount(storage: Storage | undefined): AccountData {
  try {
    const json = storage?.getItem(KEY);
    if (!json) return emptyAccount();
    return AccountSchema.parse(JSON.parse(json));
  } catch {
    return emptyAccount();
  }
}

export function saveAccount(storage: Storage | undefined, data: AccountData): void {
  try {
    storage?.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the bonus still applies this session.
  }
}

/** Permanent stat effects from the account's relics. */
export function relicEffects(account: AccountData): Effect[] {
  const out: Effect[] = [];
  for (const stat of Object.values(account.relics)) {
    const value = RELIC_BONUS[stat as StatKey];
    if (value !== undefined) out.push({ kind: 'stat', stat: stat as StatKey, value });
  }
  return out;
}
