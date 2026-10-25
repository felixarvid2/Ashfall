/**
 * Endgame crafting data (docs/endgame.md): tempering recipes, masterworking costs and the Codex of Power's
 * dungeon-to-aspect table. Names and descriptions: lang/en.json → endgame.recipes.<id>, endgame.materials.<id>.
 */
import type { StatKey } from '../loot/schemas';

export type RecipeGroup = 'offense' | 'defense' | 'utility' | 'mobility';
export const RECIPE_GROUPS: readonly RecipeGroup[] = ['offense', 'defense', 'utility', 'mobility'];

/** One affix a recipe can add. Values are the range at item power 100, scaled like normal affixes. */
export interface RecipeOption {
  stat: StatKey;
  min: number;
  max: number;
  scaling: 'linear' | 'sqrt' | 'none';
}

export interface Recipe {
  id: string;
  group: RecipeGroup;
  options: RecipeOption[];
}

const o = (stat: StatKey, min: number, max: number, scaling: RecipeOption['scaling']): RecipeOption => ({ stat, min, max, scaling });

/** The sixteen tempering recipes (twelve at first, four more with the Choir of Stone and the Echo Engine). Tempered values are a step above normal affixes, to make them worth the charges. */
export const RECIPES: readonly Recipe[] = [
  { id: 'temper.offense.crit', group: 'offense', options: [o('critChance', 0.03, 0.05, 'none'), o('critDamage', 0.12, 0.2, 'sqrt')] },
  { id: 'temper.offense.fury', group: 'offense', options: [o('damage', 0.09, 0.14, 'sqrt'), o('attackSpeed', 0.05, 0.09, 'none'), o('weaponDamage', 6, 10, 'linear'), o('rangedDamage', 0.09, 0.14, 'sqrt')] },
  { id: 'temper.offense.bane', group: 'offense', options: [o('damageVsElite', 0.12, 0.2, 'sqrt'), o('damageVsVulnerable', 0.14, 0.22, 'sqrt'), o('damageVsStunned', 0.14, 0.22, 'sqrt'), o('damageVsBurning', 0.14, 0.22, 'sqrt')] },
  { id: 'temper.defense.ward', group: 'defense', options: [o('resistAll', 0.04, 0.07, 'sqrt'), o('armor', 26, 42, 'linear')] },
  { id: 'temper.defense.vitality', group: 'defense', options: [o('maxLife', 26, 42, 'linear'), o('lifeOnKill', 5, 9, 'linear')] },
  { id: 'temper.defense.bulwark', group: 'defense', options: [o('damageReduction', 0.03, 0.055, 'none'), o('barrierBonus', 0.12, 0.2, 'sqrt')] },
  { id: 'temper.utility.tempo', group: 'utility', options: [o('cooldownReduction', 0.045, 0.08, 'none'), o('resourceGen', 0.07, 0.12, 'none')] },
  { id: 'temper.utility.mending', group: 'utility', options: [o('potionHealing', 0.14, 0.24, 'none'), o('lifeOnKill', 5, 9, 'linear')] },
  { id: 'temper.utility.mind', group: 'utility', options: [o('strength', 9, 14, 'linear'), o('intelligence', 9, 14, 'linear'), o('willpower', 9, 14, 'linear')] },
  { id: 'temper.mobility.stride', group: 'mobility', options: [o('moveSpeed', 0.06, 0.11, 'none')] },
  { id: 'temper.mobility.dash', group: 'mobility', options: [o('moveSpeed', 0.05, 0.09, 'none'), o('cooldownReduction', 0.035, 0.06, 'none')] },
  { id: 'temper.mobility.flow', group: 'mobility', options: [o('moveSpeed', 0.05, 0.09, 'none'), o('dexterity', 9, 14, 'linear'), o('attackSpeed', 0.04, 0.07, 'none')] },
  // Four more (C012), found from the Choir of Stone and the Echo Engine as well as the older bosses.
  { id: 'temper.offense.havoc', group: 'offense', options: [o('damage', 0.1, 0.15, 'sqrt'), o('critChance', 0.025, 0.045, 'none')] },
  { id: 'temper.defense.aegis', group: 'defense', options: [o('maxLife', 22, 36, 'linear'), o('armor', 22, 36, 'linear'), o('resistAll', 0.03, 0.05, 'sqrt')] },
  { id: 'temper.utility.focus', group: 'utility', options: [o('resourceGen', 0.06, 0.1, 'none'), o('cooldownReduction', 0.04, 0.07, 'none')] },
  { id: 'temper.mobility.surge', group: 'mobility', options: [o('moveSpeed', 0.07, 0.12, 'none'), o('cooldownReduction', 0.03, 0.05, 'none')] },
];

export const RECIPE_IDS: readonly string[] = RECIPES.map((r) => r.id);
export const RECIPE_DEFS: ReadonlyMap<string, Recipe> = new Map(RECIPES.map((r) => [r.id, r]));

// ---- Tempering ---------------------------------------------------------------------------------

export const TEMPERING = {
  /** Account World Tier needed before the blacksmith tempers. */
  tierRequired: 2,
  /** Tempered affixes per item, and tempering charges per item (each tempering costs one). */
  maxAffixes: 2,
  charges: 5,
  /** Gold = base × item power / 100 × growth ^ charges already spent. */
  goldBase: 150,
  goldGrowth: 1.5,
  /** Rarities that can be tempered. */
  rarities: ['rare', 'legendary', 'unique', 'mythic'] as const,
};

// ---- Masterworking -----------------------------------------------------------------------------

export const MASTERWORK = {
  maxRank: 12,
  /** Every rank adds this fraction to every affix value. */
  perRank: 0.05,
  /** These ranks also upgrade one random affix by `upgrade` more. */
  upgradeRanks: [4, 8, 12] as readonly number[],
  upgrade: 0.25,
  /** Gold to reach a rank = base × item power / 100 × growth ^ (rank − 1). */
  goldBase: 200,
  goldGrowth: 1.35,
  /** Materials to reach rank r: Lumen Dust = ceil(dustBase + dustPerRank × r); Rift Shards = r − shardsFrom + 2 from rank shardsFrom. */
  dustBase: 2,
  dustPerRank: 0.75,
  shardsFrom: 5,
  /** Resetting to rank 0 costs this × item power / 100 × (1 + rank / 4). */
  resetBase: 250,
  rarities: ['rare', 'legendary', 'unique', 'mythic'] as const,
};

/** Lumen Dust from salvaging items of these rarities (the material comes from legendaries and uniques). */
export const SALVAGE_DUST: Partial<Record<string, number>> = { legendary: 2, unique: 3, mythic: 5 };

export const MATERIAL_IDS = ['lumen_dust', 'rift_shard'] as const;

// ---- Codex of Power ----------------------------------------------------------------------------

/**
 * The first clear of a dungeon (src/data/instances.ts, kind 'dungeon') unlocks these aspects (src/data/loot/aspects.ts).
 * A dungeon can unlock several; every class has at least five aspects it can reach here.
 */
export const CODEX_ASPECTS: Readonly<Record<string, readonly string[]>> = {
  meridians_hold: ['brutality', 'mercy'],
  bunker_sierra4: ['marksman', 'warding'],
  drainage_tunnels: ['plague', 'strangler'],
  smelter_3: ['furnace', 'coolant_reserve'],
  pipe_alleys: ['fissure', 'thurible'],
  cathedral_crypt: ['molten_fists', 'hallowed'],
  cold_hall: ['phantom', 'vanishing'],
  seed_bank_depths: ['hive', 'creeping_mold'],
  cocoon_chamber: ['aegis', 'vestments'],
  irrigation_system: ['predator', 'radiant'],
  sleeping_lab: ['virulent', 'fervent'],
  shaft_13: ['bullet_storm', 'iron_stride'],
  crystal_labyrinth: ['ricochet', 'harbinger'],
  sunken_drill: ['unbroken', 'processional'],
  archive: ['lifeblood', 'mirage'],
  burial_chamber: ['ancient_wrath'],
  // The Core's dungeons (Deep Rifts repeat, so they unlock nothing).
  core_memory_of_ember: ['bulwark', 'litany'],
  core_endless_shaft: ['blade_dancer', 'sentinel'],
  core_singing_halls: ['parasitic', 'verdict'],
  core_chamber_of_creation: ['carapace', 'daybreak'],
};

/** Every Codex entry as [dungeon, aspect], in table order (the Codex panel lists these). */
export function codexEntries(): [string, string][] {
  return Object.entries(CODEX_ASPECTS).flatMap(([dungeon, aspects]) => aspects.map((a): [string, string] => [dungeon, a]));
}

/** Codex imprint cost: gold × item power / 100 (more than a cached aspect, since it never runs out). */
export const CODEX_IMPRINT_COST = 140;
