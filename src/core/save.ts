/**
 * Save games: versioned, schema-validated JSON with forward migrations.
 *
 * Bump SAVE_VERSION whenever SaveDataSchema changes shape, and add a migration
 * from the previous version to MIGRATIONS so older saves keep loading.
 */
import { z } from 'zod';
import { ItemSchema, SlotSchema } from '../data/loot/schemas';

export const SAVE_VERSION = 8;

/** Number of character slots on the select screen. */
export const CHARACTER_SLOTS = 3;
export const slotKey = (index: number): string => `slot${index}`;

const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const SaveDataSchema = z.object({
  version: z.literal(SAVE_VERSION),
  savedAt: z.string(),
  seed: z.string(),
  rngState: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  tick: z.number().int().nonnegative(),
  /** Who this save belongs to (character select). */
  character: z.object({ name: z.string().min(1).max(24), classId: z.string() }),
  player: z.object({
    position: Vec3Schema,
    facing: z.number(),
  }),
  progression: z.object({
    level: z.number().int().min(1),
    xp: z.number().nonnegative(),
    skillPoints: z.number().int().nonnegative(),
    /** Skill points already granted by Region Restoration. */
    restorationGranted: z.number().int().nonnegative().default(0),
  }),
  /** null = a character that has never received its starter kit (saves migrated from v1). */
  inventory: z
    .object({
      gold: z.number().int().nonnegative(),
      grid: z.array(ItemSchema.nullable()),
      equipped: z.partialRecord(SlotSchema, ItemSchema),
      aspects: z.array(z.object({ id: z.string(), value: z.number() })).default([]),
    })
    .nullable(),
  loot: z.object({
    seq: z.number().int().nonnegative(),
    rngState: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }),
  /** Skill tree ranks and the 6 action bar slots. */
  skills: z.object({
    ranks: z.record(z.string(), z.number().int().positive()),
    slots: z.array(z.string().nullable()).length(6),
  }),
  /** Open-world progress: the zone the character is in, and every visited zone's own state. */
  world: z.object({
    zone: z.string(),
    zones: z.record(
      z.string(),
      z.object({
        /** Discovered teleporters and the fog-of-war bitmap (base64). */
        discovered: z.array(z.string()),
        revealed: z.string(),
        /** One-time points of interest used (relics, logs, locked chests, towers, keycards). */
        found: z.array(z.string()).default([]),
        keycards: z.array(z.string()).default([]),
      }),
    ),
  }),
  /** Quest log: active quests (step, progress, choice), finished quests (→ choice) and the tracked one. */
  quests: z
    .object({
      active: z.record(z.string(), z.object({ step: z.number().int().nonnegative(), progress: z.number().int().nonnegative(), choice: z.string().optional() })),
      done: z.record(z.string(), z.string()),
      tracked: z.string().nullable(),
    })
    .default({ active: {}, done: {}, tracked: null }),
  /**
   * Endgame progress of this character (docs/endgame.md): Neural Matrix (paragon) experience,
   * points, allocated nodes, boards and glyphs; Ash Harvest shards carried; tempering recipes learned
   * and masterworking materials. Defaults keep older v7 saves loading.
   */
  endgame: z
    .object({
      matrixXp: z.number().nonnegative().default(0),
      matrixPoints: z.number().int().nonnegative().default(0),
      nodes: z.array(z.string()).default([]),
      boards: z.array(z.object({ id: z.string(), rotation: z.number().int().default(0), gate: z.string().optional() })).default([]),
      glyphs: z.array(z.object({ id: z.string(), level: z.number().int().min(1), socket: z.string().optional() })).default([]),
      ashShards: z.number().int().nonnegative().default(0),
      recipes: z.array(z.string()).default([]),
      materials: z.record(z.string(), z.number().int().nonnegative()).default({}),
    })
    .prefault({}),
});

export type SaveData = z.infer<typeof SaveDataSchema>;

type RawSave = Record<string, unknown>;
/** Upgrades a save from version N to N+1. Keyed by the version it upgrades *from*. */
export type Migration = (data: RawSave) => RawSave;

/**
 * Migration chain. Example for a future v2:
 *   1: (d) => ({ ...d, version: 2, gold: 0 }),
 */
export const MIGRATIONS: Record<number, Migration> = {
  // v2 (Phase 3): levels, inventory and a separate loot RNG stream.
  1: (d) => ({
    ...d,
    version: 2,
    progression: { level: 1, xp: 0, skillPoints: 0 },
    inventory: null,
    loot: { seq: 0, rngState: d.rngState },
  }),
  // v3 (Phase 3b): skill tree. Earlier characters get every point back to spend in the tree.
  2: (d) => {
    const prog = d.progression as { level: number; xp: number; skillPoints: number };
    return {
      ...d,
      version: 3,
      progression: { ...prog, skillPoints: Math.max(0, prog.level - 1) },
      skills: { ranks: { 'n.hydraulic_strike': 1 }, slots: ['bastion.hydraulic_strike', null, null, null, null, null] },
    };
  },
  // v4 (Phase 4): several characters and classes. Older saves were always a Bastion.
  3: (d) => ({ ...d, version: 4, character: { name: 'Bastion', classId: 'bastion' } }),
  // v5 (Phase 5): the open world. Characters arrive at the escape pod in Cinder Flats.
  4: (d) => ({
    ...d,
    version: 5,
    player: { position: { x: -296, y: 0, z: -224 }, facing: 0 },
    world: { zone: 'zone.cinder_flats', discovered: ['tp.ember'], revealed: '', found: [], keycards: [] },
  }),
  // v6 (Phase 5): Cinder Flats grew 2.2× so it takes 5–7 minutes to cross. Positions scale with it;
  // the fog-of-war grid changed size, so the map starts unexplored again.
  5: (d) => {
    const player = d.player as { position: { x: number; y: number; z: number }; facing: number };
    const world = d.world as Record<string, unknown>;
    return {
      ...d,
      version: 6,
      player: { ...player, position: { x: player.position.x * 2.2, y: 0, z: player.position.z * 2.2 } },
      world: { ...world, revealed: '' },
    };
  },
  // v7 (Region 2): several zones. The single zone's progress moves under world.zones.
  6: (d) => {
    const { zone, ...state } = d.world as { zone: string } & Record<string, unknown>;
    return { ...d, version: 7, world: { zone, zones: { [zone]: state } } };
  },
  // v8 (UI audit B002/B003): items can be locked or marked as junk. Every carried item starts unmarked.
  7: (d) => {
    const inv = d.inventory as { grid?: unknown[]; equipped?: Record<string, unknown> } | null | undefined;
    if (!inv || typeof inv !== 'object') return { ...d, version: 8 };
    const flag = (item: unknown): unknown =>
      item && typeof item === 'object' ? { locked: false, junk: false, ...(item as Record<string, unknown>) } : item;
    return {
      ...d,
      version: 8,
      inventory: {
        ...inv,
        ...(Array.isArray(inv.grid) ? { grid: inv.grid.map(flag) } : {}),
        ...(inv.equipped && typeof inv.equipped === 'object'
          ? { equipped: Object.fromEntries(Object.entries(inv.equipped).map(([slot, item]) => [slot, flag(item)])) }
          : {}),
      },
    };
  },
};

export class SaveError extends Error {}
/** The save was written by a newer build: it is not corrupt, and must not be overwritten by this one. */
export class NewerSaveError extends SaveError {}

/** Bring raw parsed JSON up to `target` version by running migrations in order. */
export function migrate(
  raw: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  target: number = SAVE_VERSION,
): RawSave {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SaveError('not an object');
  }
  let data = raw as RawSave;
  if (typeof data.version !== 'number' || !Number.isInteger(data.version)) {
    throw new SaveError('missing version');
  }
  let version: number = data.version;
  if (version > target) throw new NewerSaveError(`save is from a newer version (${version})`);
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new SaveError(`no migration from version ${version}`);
    data = step(data);
    if (data.version !== version + 1) {
      throw new SaveError(`migration from ${version} did not produce version ${version + 1}`);
    }
    version += 1;
  }
  return data;
}

/** Parse + migrate + validate, also reporting the version the raw save was written at. */
export function parseSaveDetailed(json: string): { data: SaveData; fromVersion: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    // Reported as a SaveError, which the callers handle.
    throw new SaveError('invalid JSON');
  }
  const migrated = migrate(raw);
  const result = SaveDataSchema.safeParse(migrated);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new SaveError(issue ? `${issue.path.join('.') || 'root'}: ${issue.message}` : 'invalid save');
  }
  // migrate() has checked that the raw value is an object with an integer version.
  return { data: result.data, fromVersion: (raw as RawSave).version as number };
}

/** Parse + migrate + validate. Throws SaveError with a readable reason. */
export function parseSave(json: string): SaveData {
  return parseSaveDetailed(json).data;
}

/** Compact JSON (about 38 % smaller); pass `pretty` only for the exported file, which people read and edit. */
export function serializeSave(data: SaveData, pretty = false): string {
  return JSON.stringify(SaveDataSchema.parse(data), null, pretty ? 2 : undefined);
}

export type SaveWriteFailure = 'quota' | 'blocked' | 'unknown';
export type SaveWriteResult = { ok: true } | { ok: false; reason: SaveWriteFailure };

/** Maps what `setItem` threw to a reason the player can act on. */
export function writeFailureReason(err: unknown): SaveWriteFailure {
  const name = typeof err === 'object' && err !== null ? String((err as { name?: unknown }).name ?? '') : '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'quota';
  if (name === 'SecurityError') return 'blocked';
  return 'unknown';
}

/** How many `.corrupt.*` copies of a slot are kept. */
const QUARANTINE_KEEP = 2;

/** Thin wrapper over a Storage so the browser storage can be swapped in tests. */
export class SaveStore {
  constructor(
    private readonly storage: Storage | undefined,
    private readonly prefix = 'ashfall.save.',
  ) {}

  get available(): boolean {
    return this.storage !== undefined;
  }

  /** Never throws: a full or blocked storage comes back as `{ ok: false, reason }`. */
  write(slot: string, data: SaveData): SaveWriteResult {
    if (!this.storage) return { ok: false, reason: 'blocked' };
    try {
      this.storage.setItem(this.prefix + slot, serializeSave(data));
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: writeFailureReason(err) };
    }
  }

  /**
   * Returns null when the slot is empty. Throws SaveError when it is corrupt (NewerSaveError when it
   * comes from a newer build). A save that had to be migrated keeps its original as `<slot>.v<N>.bak`.
   */
  read(slot: string): SaveData | null {
    const json = this.storage?.getItem(this.prefix + slot);
    if (json == null) return null;
    const { data, fromVersion } = parseSaveDetailed(json);
    if (fromVersion < SAVE_VERSION) this.keepOriginal(slot, `v${fromVersion}`, json);
    return data;
  }

  /** The raw string in a slot, for backups. */
  raw(slot: string): string | null {
    return this.storage?.getItem(this.prefix + slot) ?? null;
  }

  /** Writes `<slot>.<tag>.bak` once (an existing backup is never replaced). Best effort. */
  keepOriginal(slot: string, tag: string, json: string | null = this.raw(slot)): void {
    if (!this.storage || json == null) return;
    const key = `${this.prefix}${slot}.${tag}.bak`;
    try {
      if (this.storage.getItem(key) == null) this.storage.setItem(key, json);
    } catch {
      // No room for a backup: the save itself is more important.
    }
  }

  /**
   * Before a slot that fails to parse (corrupt, or newer than this build) is overwritten or deleted,
   * copies its raw string to `<slot>.corrupt.<timestamp>` and keeps the last two copies.
   * Returns true when a copy was made.
   */
  quarantineIfUnreadable(slot: string, now: number = Date.now()): boolean {
    const json = this.raw(slot);
    if (!this.storage || json == null) return false;
    try {
      parseSaveDetailed(json);
      return false;
    } catch {
      // unreadable: fall through and keep a copy
    }
    const stem = `${this.prefix}${slot}.corrupt.`;
    try {
      this.storage.setItem(stem + now, json);
      const stamps: number[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key?.startsWith(stem)) stamps.push(Number(key.slice(stem.length)));
      }
      stamps.sort((a, b) => b - a);
      for (const old of stamps.slice(QUARANTINE_KEEP)) this.storage.removeItem(stem + old);
      return true;
    } catch (err) {
      console.warn('[ashfall] keeping a copy of an unreadable save failed', err);
      return false;
    }
  }

  remove(slot: string): void {
    this.storage?.removeItem(this.prefix + slot);
  }
}

/** localStorage can throw on access (privacy mode, blocked site data). */
export function safeLocalStorage(): Storage | undefined {
  try {
    const storage = globalThis.localStorage;
    const probe = '__ashfall_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    // Storage blocked or full (private mode): saving is unavailable, which the callers handle.
    return undefined;
  }
}
