/**
 * Account-wide progress shared by every character slot: Echo Relics found and Region Restoration
 * (docs/world-and-gameplay.md §3, §3.2). Stored next to the character saves.
 */
import { z } from 'zod';
import type { Effect } from '../data/effects';
import { RELIC_BONUS } from '../data/interactables';
import { ItemSchema, type StatKey } from '../data/loot/schemas';
import { writeFailureReason, type SaveWriteResult } from './save';

const KEY = 'ashfall.account';
export const ACCOUNT_VERSION = 1;

export const AccountSchema = z.object({
  version: z.literal(ACCOUNT_VERSION),
  /** Echo Relic ids → the stat each one granted. */
  relics: z.record(z.string(), z.string()).default({}),
  /** Restoration points earned per zone, and the reward tiers already granted. */
  restoration: z.record(z.string(), z.object({ points: z.array(z.string()).default([]), tiers: z.number().int().default(0) })).default({}),
  /** Shared stash (all characters). */
  stash: z.array(ItemSchema.nullable()).default([]),
  /**
   * Account-wide endgame state (docs/endgame.md): the highest World Tier unlocked and the one chosen,
   * aspects unlocked in the Codex, the best Deep Rift cleared, and total play time in seconds (the
   * clock behind world bosses and the Ash Harvest rotation).
   */
  endgame: z
    .object({
      tierUnlocked: z.number().int().min(1).max(4).default(1),
      tier: z.number().int().min(1).max(4).default(1),
      codex: z.array(z.string()).default([]),
      riftBest: z.number().int().nonnegative().default(0),
      /** Deep Rifts: the highest level open (a fast clear opens two), and the best time (s) of the best level (0 = none). */
      riftOpen: z.number().int().nonnegative().default(0),
      riftTime: z.number().nonnegative().default(0),
      playtime: z.number().nonnegative().default(0),
    })
    .prefault({}),
  /** D08: the best clear time (s) per class per rift level, local to this browser: class id → level → seconds. */
  riftRecords: z.record(z.string(), z.record(z.string(), z.number().positive())).default({}),
  /** D11: the best clear time (s) of each day's seeded rift, by local date (YYYY-MM-DD); the oldest days are dropped. */
  dailyRifts: z.record(z.string(), z.number().positive()).default({}),
  /** D05: how many times the trader's stock was rerolled for gold on `date` (the price rises with each). */
  vendor: z.object({ date: z.string().default(''), rerolls: z.number().int().nonnegative().default(0) }).prefault({}),
  /** D10: materials deposited in the shared stash (id → count), so any character can take them. */
  materials: z.record(z.string(), z.number().int().nonnegative()).default({}),
  /** D12/D13: feats earned (id → when, ms since 1970), the counters behind them, and the title worn on character select. */
  feats: z
    .object({
      done: z.record(z.string(), z.number()).default({}),
      stats: z.record(z.string(), z.number()).default({}),
      title: z.string().nullable().default(null),
    })
    .prefault({}),
});
export type AccountData = z.infer<typeof AccountSchema>;

export function emptyAccount(): AccountData {
  return AccountSchema.parse({ version: ACCOUNT_VERSION });
}

type RawAccount = Record<string, unknown>;
/** Upgrades an account blob from version N to N+1. Keyed by the version it upgrades *from*. */
export type AccountMigration = (data: RawAccount) => RawAccount;
/** Migration chain, mirroring `MIGRATIONS` in save.ts. Add `1: (d) => ({ ...d, version: 2, ... })` with the next schema. */
export const ACCOUNT_MIGRATIONS: Record<number, AccountMigration> = {};

/** The account was written by a newer build: never overwrite it. */
export class NewerAccountError extends Error {}

export function migrateAccount(
  raw: unknown,
  migrations: Record<number, AccountMigration> = ACCOUNT_MIGRATIONS,
  target: number = ACCOUNT_VERSION,
): RawAccount {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('account is not an object');
  let data = raw as RawAccount;
  if (typeof data.version !== 'number' || !Number.isInteger(data.version)) throw new Error('account has no version');
  let version: number = data.version;
  if (version > target) throw new NewerAccountError(`account is from a newer version (${version})`);
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new Error(`no account migration from version ${version}`);
    data = step(data);
    if (data.version !== version + 1) throw new Error(`account migration from ${version} did not produce version ${version + 1}`);
    version += 1;
  }
  return data;
}

/**
 * Field-by-field repair of a blob that fails the schema: every top-level field that validates is
 * kept, bad ones take their defaults, and stash entries that fail are dropped one by one.
 */
function salvageAccount(raw: unknown): AccountData {
  const src = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as RawAccount) : {};
  const out: RawAccount = { version: ACCOUNT_VERSION };
  for (const [key, field] of Object.entries(AccountSchema.shape)) {
    if (key === 'version' || !(key in src)) continue;
    const parsed = field.safeParse(src[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  if (Array.isArray(src.stash) && !('stash' in out)) {
    const item = ItemSchema.nullable();
    out.stash = src.stash.map((entry) => item.safeParse(entry)).map((r) => (r.success ? r.data : null));
  }
  return AccountSchema.parse(out);
}

/** Why `loadAccount` did not return the stored account as it was. */
export type AccountRecovery = 'corrupt' | 'newer';

export interface LoadedAccount {
  account: AccountData;
  /** True when the stored blob could not be read as it was: it was backed up and the account was rebuilt. */
  recovered: boolean;
  reason?: AccountRecovery;
}

const BACKUP_KEY = `${KEY}.bak`;
/** Accounts rebuilt from a bad blob: saveAccount does not write them until the player carries on (or ever, for a newer one). */
const held = new WeakMap<AccountData, AccountRecovery>();

/** Copies a bad blob to `ashfall.account.bak`, moving the previous backup to `ashfall.account.bak.1`. */
function backUpAccount(storage: Storage, raw: string): void {
  try {
    const previous = storage.getItem(BACKUP_KEY);
    if (previous === raw) return;
    if (previous !== null) storage.setItem(`${BACKUP_KEY}.1`, previous);
    storage.setItem(BACKUP_KEY, raw);
  } catch {
    // Storage full: nothing more to do.
  }
}

/**
 * Reads the shared account. A blob that fails to parse or validate is never silently replaced: the raw
 * string is kept in `ashfall.account.bak`, whatever still validates is salvaged, and the result is
 * flagged `recovered` and held back from `saveAccount`.
 */
export function loadAccount(storage: Storage | undefined): LoadedAccount {
  let json: string | null | undefined;
  try {
    json = storage?.getItem(KEY);
  } catch {
    // Storage blocked: treated as no account yet.
    json = null;
  }
  if (!json) return { account: emptyAccount(), recovered: false };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
    const result = AccountSchema.safeParse(migrateAccount(raw));
    if (result.success) return { account: result.data, recovered: false };
  } catch (err) {
    if (err instanceof NewerAccountError) {
      if (storage) backUpAccount(storage, json);
      const account = emptyAccount();
      held.set(account, 'newer');
      return { account, recovered: true, reason: 'newer' };
    }
  }
  if (storage) backUpAccount(storage, json);
  let account: AccountData;
  try {
    account = salvageAccount(raw);
  } catch (err) {
    console.error('[ashfall] the account data could not be salvaged; starting an empty account', err);
    account = emptyAccount();
  }
  held.set(account, 'corrupt');
  return { account, recovered: true, reason: 'corrupt' };
}

/** The player has carried on after a recovery notice: the rebuilt account may be saved now (not for a newer one). */
export function acknowledgeAccountRecovery(account: AccountData): void {
  if (held.get(account) === 'corrupt') held.delete(account);
}

/** True while `saveAccount` refuses to write this account. */
export function accountHeld(account: AccountData): boolean {
  return held.has(account);
}

export function saveAccount(storage: Storage | undefined, data: AccountData): SaveWriteResult {
  if (held.has(data)) return { ok: true };
  if (!storage) return { ok: false, reason: 'blocked' };
  try {
    storage.setItem(KEY, JSON.stringify(data));
    return { ok: true };
  } catch (err) {
    // Storage full or blocked: the bonus still applies this session.
    return { ok: false, reason: writeFailureReason(err) };
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
