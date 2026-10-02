/**
 * Schemas for items, affixes, rarities, crystals, drop tables and progression.
 * See docs/loot.md for how the pieces fit together.
 */
import { z } from 'zod';

export const SLOTS = ['helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring1', 'ring2', 'mainHand', 'offHand'] as const;
export const SlotSchema = z.enum(SLOTS);
export type Slot = z.infer<typeof SlotSchema>;

/** Item categories; rings fit either ring slot. */
export const ITEM_TYPES = ['helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring', 'weapon', 'offHand', 'crystal'] as const;
export const ItemTypeSchema = z.enum(ITEM_TYPES);
export type ItemType = z.infer<typeof ItemTypeSchema>;

export function slotsFor(type: ItemType): Slot[] {
  switch (type) {
    case 'ring':
      return ['ring1', 'ring2'];
    case 'weapon':
      return ['mainHand'];
    case 'crystal':
      return [];
    default:
      return [type];
  }
}

/**
 * Every stat an item can grant. Flat stats add a number; "pct" stats are fractions (0.1 = 10 %).
 * Damage bonuses map onto the damage model's additive bucket (docs/damage-formula.md).
 */
export const STAT_KEYS = [
  // Attributes (flat)
  'strength',
  'dexterity',
  'intelligence',
  'willpower',
  'allAttributes',
  // Defence (flat)
  'maxLife',
  'armor',
  'resistAll',
  'resistHeat',
  'resistCold',
  'resistToxic',
  'resistEnergy',
  'resistVoid',
  'lifeOnKill',
  // Offence
  'weaponDamage',
  'critChance',
  'critDamage',
  'attackSpeed',
  'damage',
  'damageVsVulnerable',
  'damageVsElite',
  'damageVsStunned',
  'damageVsBurning',
  'meleeDamage',
  // Utility
  'cooldownReduction',
  'resourceGen',
  'moveSpeed',
  'barrierBonus',
  'potionHealing',
  'damageReduction',
] as const;
export const StatKeySchema = z.enum(STAT_KEYS);
export type StatKey = z.infer<typeof StatKeySchema>;

/** Percent stats are shown as "+12.5%"; the rest as "+12". */
export const PERCENT_STATS: ReadonlySet<StatKey> = new Set([
  'critChance',
  'critDamage',
  'attackSpeed',
  'damage',
  'damageVsVulnerable',
  'damageVsElite',
  'damageVsStunned',
  'damageVsBurning',
  'meleeDamage',
  'cooldownReduction',
  'resourceGen',
  'moveSpeed',
  'barrierBonus',
  'potionHealing',
  'damageReduction',
  'resistAll',
  'resistHeat',
  'resistCold',
  'resistToxic',
  'resistEnergy',
  'resistVoid',
]);

/** How a value grows with item power. */
export const ScalingSchema = z.enum(['linear', 'sqrt', 'none']);

export const AffixDefSchema = z.object({
  id: z.string(),
  stat: StatKeySchema,
  /** Value range at item power 100; scaled by `scaling`. */
  min: z.number(),
  max: z.number(),
  scaling: ScalingSchema,
  /** Item types this affix may roll on. */
  types: z.array(ItemTypeSchema).min(1),
  weight: z.number().positive(),
  /** Word used in magic item names ("Searing Hammer"). */
  adjective: z.string(),
});
export type AffixDef = z.infer<typeof AffixDefSchema>;

export const ImplicitSchema = z.object({
  stat: StatKeySchema,
  min: z.number(),
  max: z.number(),
  scaling: ScalingSchema,
});

export const BaseItemDefSchema = z.object({
  id: z.string(),
  type: ItemTypeSchema,
  /** Classes that can equip it; omitted = everyone. */
  classes: z.array(z.string()).optional(),
  /** Icon asset id in assets/manifest.json (Meshy text-to-image). */
  icon: z.string(),
  implicits: z.array(ImplicitSchema).default([]),
  /** Maximum sockets this base can roll. */
  maxSockets: z.number().int().min(0).max(3).default(0),
  /** Minimum item power before this base can drop. */
  minItemPower: z.number().int().nonnegative().default(0),
  weight: z.number().positive().default(1),
});
export type BaseItemDef = z.infer<typeof BaseItemDefSchema>;

export const RARITIES = ['common', 'magic', 'rare', 'legendary', 'unique', 'mythic'] as const;
export const RaritySchema = z.enum(RARITIES);
export type Rarity = z.infer<typeof RaritySchema>;

export const RarityDefSchema = z.object({
  id: RaritySchema,
  color: z.string(),
  affixes: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  /** Chance per affix to roll as a greater affix (×1.5 value). Mythic: always. */
  greaterChance: z.number().min(0).max(1),
  /** Socket roll chance per possible socket. */
  socketChance: z.number().min(0).max(1),
  /** Gold received when salvaged, per 10 item power. */
  salvageGold: z.number().nonnegative(),
  /** Height of the light beam on the ground (0 = none). */
  beam: z.number().nonnegative(),
  /** Whether this rarity can drop yet (legendary+ arrive in Phase 3b). */
  enabled: z.boolean().default(true),
});
export type RarityDef = z.infer<typeof RarityDefSchema>;

export const CrystalDefSchema = z.object({
  id: z.string(),
  icon: z.string(),
  color: z.string(),
  /** What the crystal grants depending on where it is socketed (D4-style gems). */
  weapon: z.object({ stat: StatKeySchema, values: z.tuple([z.number(), z.number(), z.number()]) }),
  armor: z.object({ stat: StatKeySchema, values: z.tuple([z.number(), z.number(), z.number()]) }),
  jewelry: z.object({ stat: StatKeySchema, values: z.tuple([z.number(), z.number(), z.number()]) }),
});
export type CrystalDef = z.infer<typeof CrystalDefSchema>;

export const DropTableSchema = z.object({
  id: z.string(),
  /** Chance to drop one item. */
  itemChance: z.number().min(0).max(1),
  /** Extra independent item rolls (bosses, chests). */
  extraItems: z.number().int().nonnegative().default(0),
  goldChance: z.number().min(0).max(1),
  /** Gold per enemy level. */
  gold: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  crystalChance: z.number().min(0).max(1),
  /** Multipliers on the global rarity weights (e.g. elites roll rares more often). */
  rarityBias: z.partialRecord(RaritySchema, z.number().nonnegative()).default({}),
  minRarity: RaritySchema.default('common'),
  xp: z.number().nonnegative(),
});
export type DropTable = z.infer<typeof DropTableSchema>;

export const ProgressionSchema = z.object({
  maxLevel: z.number().int().positive(),
  /** XP to go from level L to L+1 = round(base × L^exponent). */
  xpBase: z.number().positive(),
  xpExponent: z.number().positive(),
  /** Item power of drops: base + perLevel × monster level, ± spread. */
  itemPower: z.object({ base: z.number(), perLevel: z.number(), spread: z.number().nonnegative() }),
  /** Enemy stat growth per level above 1 (linear). */
  enemyLifePerLevel: z.number().nonnegative(),
  enemyDamagePerLevel: z.number().nonnegative(),
  /** Bonus XP per enemy level above 1. */
  xpPerEnemyLevel: z.number().nonnegative(),
  /** Global base rarity weights. */
  rarityWeights: z.record(RaritySchema, z.number().nonnegative()),
  /** Fraction of drops restricted to the player's class (brief §5.6: ~85 %). */
  ownClassShare: z.number().min(0).max(1),
  inventorySize: z.number().int().positive(),
});
export type Progression = z.infer<typeof ProgressionSchema>;

// ---- Item instances (saved) -------------------------------------------------------

export const RolledStatSchema = z.object({
  stat: StatKeySchema,
  value: z.number(),
  /** Affix id (absent for implicits). */
  affix: z.string().optional(),
  greater: z.boolean().optional(),
});
export type RolledStat = z.infer<typeof RolledStatSchema>;

export const ItemSchema = z.object({
  uid: z.string(),
  base: z.string(),
  rarity: RaritySchema,
  itemPower: z.number().int().nonnegative(),
  name: z.string(),
  implicits: z.array(RolledStatSchema),
  affixes: z.array(RolledStatSchema),
  /** Socket contents: crystal item uid's crystal id + tier, or null for empty. */
  sockets: z.array(z.object({ crystal: z.string(), tier: z.number().int().min(0).max(2) }).nullable()).default([]),
  /** Crystals are items too: which crystal and tier. */
  crystal: z.object({ id: z.string(), tier: z.number().int().min(0).max(2) }).optional(),
  aspect: z.string().optional(),
  unique: z.string().optional(),
});
export type Item = z.infer<typeof ItemSchema>;
