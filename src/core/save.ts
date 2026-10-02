/**
 * Save games: versioned, schema-validated JSON with forward migrations.
 *
 * Bump SAVE_VERSION whenever SaveDataSchema changes shape, and add a migration
 * from the previous version to MIGRATIONS so older saves keep loading.
 */
import { z } from 'zod';

export const SAVE_VERSION = 1;

const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const SaveDataSchema = z.object({
  version: z.literal(SAVE_VERSION),
  savedAt: z.string(),
  seed: z.string(),
  rngState: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  tick: z.number().int().nonnegative(),
  player: z.object({
    position: Vec3Schema,
    facing: z.number(),
  }),
});

export type SaveData = z.infer<typeof SaveDataSchema>;

type RawSave = Record<string, unknown>;
/** Upgrades a save from version N to N+1. Keyed by the version it upgrades *from*. */
export type Migration = (data: RawSave) => RawSave;

/**
 * Migration chain. Example for a future v2:
 *   1: (d) => ({ ...d, version: 2, gold: 0 }),
 */
export const MIGRATIONS: Record<number, Migration> = {};

export class SaveError extends Error {}

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
  if (version > target) throw new SaveError(`save is from a newer version (${version})`);
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

/** Parse + migrate + validate. Throws SaveError with a readable reason. */
export function parseSave(json: string): SaveData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveError('invalid JSON');
  }
  const migrated = migrate(raw);
  const result = SaveDataSchema.safeParse(migrated);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new SaveError(issue ? `${issue.path.join('.') || 'root'}: ${issue.message}` : 'invalid save');
  }
  return result.data;
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(SaveDataSchema.parse(data), null, 2);
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

  write(slot: string, data: SaveData): void {
    if (!this.storage) throw new SaveError('storage unavailable');
    this.storage.setItem(this.prefix + slot, serializeSave(data));
  }

  /** Returns null when the slot is empty. Throws SaveError when it is corrupt. */
  read(slot: string): SaveData | null {
    const json = this.storage?.getItem(this.prefix + slot);
    if (json == null) return null;
    return parseSave(json);
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
    return undefined;
  }
}
