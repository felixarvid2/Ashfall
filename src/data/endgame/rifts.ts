/**
 * Deep Rifts (docs/endgame.md): a timed, procedural dungeon that mixes the rooms and enemies of every
 * region. Kills fill a progress bar; at 100 % the Rift Guardian (an earlier boss in the Lumen look) spawns.
 * Cleared in time: glyph upgrades, a cache, the account's best level and the higher World Tiers.
 * Names and texts: lang/en.json → rifts.*.
 */
import type { InstanceDef, InstanceBoss } from '../instances';
import { RECIPE_IDS } from './crafting';

export const RIFT_ID = 'deep_rift';

export const RIFT = {
  /** Levels 1..max. */
  maxLevel: 100,
  /** Rift monsters are always this level; the rift level multiplies life and damage on top. */
  monsterLevel: 50,
  /** Enemy life and damage × this per rift level. */
  perLevel: 1.06,
  /** Seconds in which the exit must be used twice to abandon a running rift. */
  abandonWindow: 8,
  /** Seconds to fill the bar and kill the guardian. */
  time: 600,
  /** Progress points that fill the bar. About 6–7 of the ~14 rooms' packs, i.e. 5–7 minutes of fighting. */
  need: 120,
  /** Progress per kill. Rare elites (and named enemies) count as `elite`. */
  weights: { normal: 1, champion: 5, elite: 10 },
  /** World Tier needed (the account's highest unlocked) before the obelisk opens. */
  tierRequired: 2,
  /** Cleared with more than this share of the time left: the next two levels open instead of one. */
  fastShare: 0.5,
  /** Rifts that unlock World Tiers when cleared. */
  tierUnlocks: [
    { level: 20, tier: 3 },
    { level: 40, tier: 4 },
  ] as const,
  /** Once every room has woken and the bar is not full, a new pack arrives near the player this often (s). */
  surgeEvery: 6,
  surgeBelow: 6,
  /** The guardian's life multiplier on top of its own (per-guardian) one: a rift boss is tougher than a dungeon's. */
  guardianLife: 1,
  guardianDamage: 1,
};

/** Rewards for a rift cleared in time. */
export const RIFT_REWARDS = {
  /** Glyph upgrade attempts; the player picks the glyph for each. */
  glyphAttempts: 3,
  /** Guaranteed legendaries in the cache: base + 1 per this many rift levels. */
  legendaries: { base: 2, perLevels: 25 },
  /** Rift Shards: base + per level. */
  shards: { base: 2, perLevel: 0.25 },
  /** Chance of a tempering recipe in the cache (and it never repeats one the character knows while others are left). */
  recipeChance: 0.25,
  /** Item power of the cache's items: the level-50 baseline (`10 + 8 × 50`) + this per rift level, up to the cap. */
  itemPower: { base: 410, perLevel: 2, cap: 540 },
};

/** Tempering recipes a rift can teach (data by the crafting system; every recipe may drop). */
export const RIFT_RECIPE_POOL: readonly string[] = RECIPE_IDS;

/** Rifts draw packs from every region's templates (src/data/packs.ts); the Core's are already shades and Lumen's creatures. */
export const RIFT_PACKS = [
  'road', 'valley', 'military', 'maw_approach',
  'rd_road', 'rd_conveyor', 'rd_slag', 'rd_stacks', 'rd_cathedral',
  'hv_road', 'hv_outer', 'hv_seed', 'hv_roots', 'hv_gamma',
  'dm_tunnel', 'dm_shafts', 'dm_caves', 'dm_elder', 'dm_security',
  'core_borderland', 'core_gardens', 'core_halls_ash', 'core_halls_fire', 'core_halls_jungle', 'core_base',
];

/** The Rift Guardians: one earlier boss per region, drawn with the Lumen look. Life is the boss's own times `lifeMul`. */
export const RIFT_GUARDIANS: readonly InstanceBoss[] = [
  { enemy: 'brood_mother', name: 'rifts.guardians.brood_mother', lifeMul: 4, damageMul: 1, affixes: ['sporeSpreader'], script: 'brood_mother' },
  { enemy: 'slagborn', name: 'rifts.guardians.slag_heart', lifeMul: 12, damageMul: 1.4, affixes: ['burning', 'fast'], script: 'slag_heart' },
  { enemy: 'vine_matriarch', name: 'rifts.guardians.vine_matriarch', lifeMul: 3, damageMul: 1, affixes: ['fast'], script: 'vine_matriarch' },
  { enemy: 'archivist', name: 'rifts.guardians.archivist', lifeMul: 3, damageMul: 1, affixes: ['teleporting'], script: 'archivist' },
  { enemy: 'elder_guardian', name: 'rifts.guardians.elder_guardian', lifeMul: 1.2, damageMul: 1.1, affixes: ['shielded'], script: 'elder_guardian' },
];

/** Rift rooms mix the props of every region's kit. */
export const RIFT_INSTANCE: InstanceDef = {
  id: RIFT_ID,
  kind: 'rift',
  main: [9, 11],
  branches: [4, 6],
  packs: RIFT_PACKS,
  packsPerRoom: [2, 3],
  objective: { kind: 'clear' },
  boss: null,
  theme: {
    floor: '#2c2a3a',
    ground: 'steel_grating',
    fog: { color: '#0e0a1a', density: 0.026 },
    ambient: { color: '#a090d8', intensity: 0.5 },
    decor: [
      'prop.cargo_crate', 'prop.pipe_section', 'prop.control_terminal', 'prop.fuel_tank', 'prop.barricade',
      'env.pipe_cluster', 'env.furnace_block', 'prop.generator', 'prop.lumen_growth', 'prop.spore_nest',
      'env.slag_rock', 'env.wall_segment', 'prop.compressor', 'env.catwalk', 'prop.core_console',
    ],
    light: { asset: 'prop.lumen_growth', color: '#b48cff', intensity: 38 },
  },
  eventChance: 0.3,
};
