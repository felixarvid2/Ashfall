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
  character: z.object({
    name: z.string().min(1).max(24),
    classId: z.string(),
    /** A13: a Hardcore character has one life and its own stash; `fallen` once it has died (the slot keeps a skull, the save cannot be played). */
    hardcore: z.boolean().optional(),
    fallen: z.boolean().optional(),
  }),
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
      /** Quests pinned to the HUD tracker, at most three (C08). */
      pinned: z.array(z.string()).max(3).optional(),
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
  /**
   * A17: the moment-to-moment state: life, class resource, the remaining time of buffs and the wave encounter's
   * phase. Absent in older saves, which load at full life as before (no version bump: the block is optional).
   */
  state: z
    .object({
      health: z.number().nonnegative(),
      resource: z.number().nonnegative().default(0),
      buffs: z.array(z.object({ id: z.string(), remaining: z.number().positive(), duration: z.number().positive(), amount: z.number().default(0) })).default([]),
      wave: z.object({ encounterId: z.string(), wave: z.number().int().nonnegative(), phase: z.enum(['intermission', 'active']), timer: z.number() }).nullable().default(null),
    })
    .optional(),
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
/** B07: rolling backups of a slot (`<slot>.bk.<time>`): the last three, at least this far apart (autosave runs often). */
export const BACKUP_KEEP = 3;
export const BACKUP_EVERY_MS = 5 * 60 * 1000;

export interface SaveBackup {
  /** Epoch ms when the backup was taken (also its key suffix). */
  stamp: number;
  /** The `savedAt` and character of the saved data, when it can be read. */
  savedAt?: string;
  name?: string;
  level?: number;
  classId?: string;
  bytes: number;
}

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
  write(slot: string, data: SaveData, now: number = Date.now()): SaveWriteResult {
    if (!this.storage) return { ok: false, reason: 'blocked' };
    try {
      const json = serializeSave(data);
      this.rotateBackup(slot, now);
      this.storage.setItem(this.prefix + slot, json);
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

  private backupStem(slot: string): string {
    return `${this.prefix}${slot}.bk.`;
  }

  private backupStamps(slot: string): number[] {
    const stem = this.backupStem(slot);
    const stamps: number[] = [];
    for (let i = 0; this.storage && i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(stem) && /^\d+$/.test(key.slice(stem.length))) stamps.push(Number(key.slice(stem.length)));
    }
    return stamps.sort((a, b) => b - a);
  }

  /**
   * B07: before a slot is overwritten, keeps what is in it as a backup, if the newest backup is older than
   * BACKUP_EVERY_MS (or `force`). Only the last BACKUP_KEEP are kept. Best effort: a full storage skips the backup,
   * never the save.
   */
  private rotateBackup(slot: string, now: number, force = false): void {
    if (!this.storage) return;
    try {
      const current = this.raw(slot);
      if (current == null) return;
      const stamps = this.backupStamps(slot);
      const newest = stamps[0];
      if (!force && newest !== undefined && now - newest < BACKUP_EVERY_MS) return;
      if (newest !== undefined && this.storage.getItem(this.backupStem(slot) + newest) === current) return;
      const stem = this.backupStem(slot);
      this.storage.setItem(stem + now, current);
      for (const old of [now, ...stamps].slice(BACKUP_KEEP)) this.storage.removeItem(stem + old);
    } catch {
      // No room for a backup: the save itself is more important.
    }
  }

  /** Keeps what is in the slot as a backup right now, whatever the age of the newest one (before an import, say). */
  backupNow(slot: string, now: number = Date.now()): void {
    this.rotateBackup(slot, now, true);
  }

  /** The backups of a slot, newest first, with what can be read from each. */
  backups(slot: string): SaveBackup[] {
    const out: SaveBackup[] = [];
    for (const stamp of this.backupStamps(slot)) {
      const json = this.storage?.getItem(this.backupStem(slot) + stamp);
      if (json == null) continue;
      const entry: SaveBackup = { stamp, bytes: json.length };
      try {
        const { data } = parseSaveDetailed(json);
        entry.savedAt = data.savedAt;
        entry.name = data.character.name;
        entry.classId = data.character.classId;
        entry.level = data.progression.level;
      } catch {
        // Listed, but restoring it will say why it cannot be read.
      }
      out.push(entry);
    }
    return out;
  }

  /**
   * Puts a backup back into its slot after checking that it reads. What was in the slot is kept as a backup first.
   * Throws SaveError when the backup is unreadable (the slot is untouched). Returns the restored data.
   */
  restoreBackup(slot: string, stamp: number, now: number = Date.now()): SaveData {
    const json = this.storage?.getItem(this.backupStem(slot) + stamp);
    if (json == null) throw new SaveError('that backup no longer exists');
    const data = parseSave(json);
    this.rotateBackup(slot, now, true);
    this.storage!.setItem(this.prefix + slot, json);
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
    for (const stamp of this.backupStamps(slot)) this.storage?.removeItem(this.backupStem(slot) + stamp);
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
