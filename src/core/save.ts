/**
 * Save games: versioned, schema-validated JSON with forward migrations.
 *
 * Bump SAVE_VERSION whenever SaveDataSchema changes shape, and add a migration
 * from the previous version to MIGRATIONS so older saves keep loading.
 */
import { z } from 'zod';
import { ItemSchema, SlotSchema } from '../data/loot/schemas';

export const SAVE_VERSION = 7;

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
};

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
