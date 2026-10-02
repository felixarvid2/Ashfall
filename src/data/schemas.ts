/**
 * Zod schemas for combat design data (skills, classes, enemies, statuses,
 * encounters). Data files under src/data/ are typed with z.input<> so they get
 * autocomplete, and validate.ts parses them at startup in dev and in tests.
 */
import { z } from 'zod';

export const DAMAGE_TYPES = ['physical', 'heat', 'cold', 'toxic', 'energy', 'void'] as const;
export const DamageTypeSchema = z.enum(DAMAGE_TYPES);
export type DamageType = z.infer<typeof DamageTypeSchema>;

export const STATUS_IDS = ['burning', 'poisoned', 'chilled', 'frozen', 'stunned', 'vulnerable', 'barrier'] as const;
export const StatusIdSchema = z.enum(STATUS_IDS);
export type StatusId = z.infer<typeof StatusIdSchema>;

/** Conditions that gate a conditional damage bonus (e.g. "+20% vs vulnerable"). */
export const CONDITIONS = [
  'vulnerable',
  'stunned',
  'burning',
  'poisoned',
  'chilled',
  'elite',
  'melee',
  'ranged',
  // Attacker-side conditions (evaluated on the one dealing damage).
  'highResource',
  'hasBarrier',
] as const;
export const ConditionSchema = z.enum(CONDITIONS);
export type Condition = z.infer<typeof ConditionSchema>;

export const BonusSchema = z.object({
  /** 0.2 = +20%. */
  value: z.number(),
  when: ConditionSchema.optional(),
  /** Free-text origin for breakdowns ("Seismic Shock passive", "Ring affix"). */
  source: z.string().optional(),
});
export type Bonus = z.infer<typeof BonusSchema>;

export const ResistancesSchema = z
  .object(Object.fromEntries(DAMAGE_TYPES.map((t) => [t, z.number().min(0).max(1).default(0)])) as Record<
    DamageType,
    z.ZodDefault<z.ZodNumber>
  >)
  .partial()
  .default({});

// ---- Statuses ---------------------------------------------------------------

export const StatusDefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('dot'),
    damageType: DamageTypeSchema,
    /** "refresh": one instance, strongest wins. "stack": independent instances up to maxStacks. */
    stacking: z.enum(['refresh', 'stack']),
    maxStacks: z.number().int().positive().default(1),
    color: z.string(),
  }),
  z.object({ kind: z.literal('slow'), slow: z.number().min(0).max(1), color: z.string() }),
  z.object({ kind: z.literal('disable'), color: z.string() }),
  z.object({ kind: z.literal('vulnerable'), damageTakenMultiplier: z.number().min(1), color: z.string() }),
  z.object({ kind: z.literal('barrier'), color: z.string() }),
]);
export type StatusDef = z.infer<typeof StatusDefSchema>;

/** A status applied by a skill, attack or hazard. */
export const StatusApplySchema = z.object({
  status: StatusIdSchema,
  duration: z.number().positive(),
  /** DoT: total damage coefficient over the duration (scaled by the attacker's damage). */
  coefficient: z.number().nonnegative().optional(),
  /** DoT with fixed damage per second (hazards). */
  dps: z.number().nonnegative().optional(),
  /** Barrier: absolute amount, or fraction of the receiver's max life. */
  amount: z.number().nonnegative().optional(),
  lifeFraction: z.number().min(0).max(1).optional(),
});
export type StatusApply = z.infer<typeof StatusApplySchema>;

// ---- Skills -------------------------------------------------------------------

const ImpactSchema = z.object({
  coefficient: z.number().nonnegative(),
  damageType: DamageTypeSchema,
  /** Metres pushed away from the caster; negative pulls toward it. */
  knockback: z.number().default(0),
  applies: z.array(StatusApplySchema).default([]),
  hitstopMs: z.number().nonnegative().default(0),
  shake: z.number().min(0).max(1).default(0),
});

export type Impact = z.infer<typeof ImpactSchema>;

export const SkillEffectSchema = z.discriminatedUnion('kind', [
  ImpactSchema.extend({
    kind: z.literal('meleeArc'),
    range: z.number().positive(),
    arcDeg: z.number().positive().max(360),
  }),
  ImpactSchema.extend({
    kind: z.literal('nova'),
    radius: z.number().positive(),
  }),
  z.object({
    kind: z.literal('leap'),
    maxRange: z.number().positive(),
    duration: z.number().positive(),
    height: z.number().nonnegative(),
    landing: ImpactSchema.extend({ radius: z.number().positive() }),
  }),
  z.object({
    kind: z.literal('selfBuff'),
    applies: z.array(StatusApplySchema),
    /** Remove disabling statuses (stun/freeze) and slows on use. */
    cleanse: z.boolean().default(false),
    /** Change the caster's resource on use (negative = vent Heat). */
    resourceDelta: z.number().default(0),
    /** Heal this fraction of max life on use. */
    healFraction: z.number().min(0).max(1).default(0),
  }),
  // Spend stored resource in a blast: coefficient = base + perResource × resource spent.
  ImpactSchema.extend({
    kind: z.literal('vent'),
    radius: z.number().positive(),
    perResource: z.number().nonnegative(),
    minResource: z.number().nonnegative(),
  }),
  // Delayed strike at the cursor after a telegraph (ultimate).
  ImpactSchema.extend({
    kind: z.literal('orbital'),
    range: z.number().positive(),
    radius: z.number().positive(),
    delay: z.number().positive(),
  }),
]);
export type SkillEffect = z.infer<typeof SkillEffectSchema>;

export const SkillDefSchema = z.object({
  id: z.string().regex(/^[a-z]+\.[a-z_]+$/),
  classId: z.string(),
  category: z.enum(['basic', 'core', 'defensive', 'tactical', 'mastery', 'ultimate']),
  /** Seconds before the skill can be used again (0 = limited by cast time only). */
  cooldown: z.number().nonnegative(),
  resourceCost: z.number().nonnegative().default(0),
  /** Resource generated when the skill hits at least one enemy (or on use for buffs/leaps). */
  resourceGain: z.number().nonnegative().default(0),
  /** Wind-up before the effect fires (s). */
  castTime: z.number().nonnegative(),
  /** Lock-out after the effect fires (s). */
  recovery: z.number().nonnegative(),
  /** Optional bonus when the caster's resource is at or above a threshold. */
  resourceBonus: z
    .object({ threshold: z.number().nonnegative(), applies: z.array(StatusApplySchema) })
    .optional(),
  effect: SkillEffectSchema,
});
export type SkillDef = z.infer<typeof SkillDefSchema>;

// ---- Classes ----------------------------------------------------------------

export const ClassDefSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  life: z.number().positive(),
  armor: z.number().nonnegative(),
  resist: ResistancesSchema,
  /** Damage with no weapon equipped. */
  weaponDamage: z.number().positive(),
  /** Attributes at level 1 and gained per level; `primary` scales damage (+0.1 % per point). */
  attributes: z.object({
    primary: z.enum(['strength', 'dexterity', 'intelligence']),
    base: z.object({ strength: z.number(), dexterity: z.number(), intelligence: z.number(), willpower: z.number() }),
    perLevel: z.object({ strength: z.number(), dexterity: z.number(), intelligence: z.number(), willpower: z.number() }),
  }),
  lifePerLevel: z.number().nonnegative(),
  /** Common items a new character starts with (base ids). */
  starterKit: z.array(z.string()).default([]),
  critChance: z.number().min(0).max(1),
  critDamage: z.number().nonnegative(),
  moveSpeed: z.number().positive(),
  collider: z.object({ radius: z.number().positive(), mass: z.number().positive() }),
  resource: z.object({
    id: z.enum(['heat', 'focus', 'biomass']),
    max: z.number().positive(),
    start: z.number().nonnegative(),
    /** Passive change per second (negative = decays) once out of combat for `idleDelay` seconds. */
    idleRate: z.number(),
    idleDelay: z.number().nonnegative(),
    /** Resource gained per 1% of max life lost. */
    gainPerLifePercentLost: z.number().nonnegative().default(0),
    overheat: z
      .object({
        /** Seconds at max before overheating starts. */
        grace: z.number().nonnegative(),
        /** Self-damage per second as a fraction of max life. */
        damagePerSecond: z.number().nonnegative(),
      })
      .optional(),
  }),
  dodge: z.object({ distance: z.number().positive(), duration: z.number().positive(), cooldown: z.number().positive() }),
  potion: z.object({ charges: z.number().int().positive(), heal: z.number().min(0).max(1), recharge: z.number().positive() }),
  /** Six action bar slots: LMB, RMB, 1, 2, 3, 4. */
  actionBar: z.array(z.string().nullable()).length(6),
});
export type ClassDef = z.infer<typeof ClassDefSchema>;

// ---- Enemies ----------------------------------------------------------------

const EnemyAttackSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('melee'),
    range: z.number().positive(),
    arcDeg: z.number().positive(),
    windup: z.number().positive(),
    recovery: z.number().nonnegative(),
    cooldown: z.number().nonnegative(),
    damageType: DamageTypeSchema,
    knockback: z.number().nonnegative().default(0),
  }),
  z.object({
    kind: z.literal('projectile'),
    windup: z.number().positive(),
    cooldown: z.number().nonnegative(),
    speed: z.number().positive(),
    radius: z.number().positive(),
    maxRange: z.number().positive(),
    damageType: DamageTypeSchema,
  }),
  z.object({
    kind: z.literal('buffAllies'),
    windup: z.number().positive(),
    cooldown: z.number().positive(),
    radius: z.number().positive(),
    applies: z.array(StatusApplySchema),
  }),
]);

export const EnemyDefSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  family: z.enum(['infected', 'insect', 'machine', 'beast', 'lumen']),
  behavior: z.enum(['rusher', 'ranged', 'support']),
  life: z.number().positive(),
  armor: z.number().nonnegative(),
  resist: ResistancesSchema,
  damage: z.number().nonnegative(),
  moveSpeed: z.number().positive(),
  turnRate: z.number().positive(),
  aggroRange: z.number().positive(),
  /** Ranged/support: distance band to keep from the player. */
  preferredRange: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).optional(),
  /** Hover height for flying enemies (metres). */
  hover: z.number().nonnegative().default(0),
  collider: z.object({ radius: z.number().positive(), mass: z.number().positive() }),
  /** Drop table id in src/data/loot/tables.ts (defaults to "dt.<enemy id>"). */
  dropTable: z.string().optional(),
  attack: EnemyAttackSchema,
  onDeath: z
    .object({
      hazard: z.object({
        radius: z.number().positive(),
        duration: z.number().positive(),
        applies: z.array(StatusApplySchema),
      }),
    })
    .optional(),
});
export type EnemyDef = z.infer<typeof EnemyDefSchema>;

// ---- Encounters -------------------------------------------------------------

export const EncounterSchema = z.object({
  id: z.string(),
  spawnRing: z.tuple([z.number().positive(), z.number().positive()]),
  groupSpread: z.number().positive(),
  intermission: z.number().nonnegative(),
  /** Extra life multiplier per wave after the last defined one (endless mode). */
  endlessLifeScale: z.number().nonnegative(),
  waves: z
    .array(z.object({ groups: z.array(z.object({ enemy: z.string(), count: z.number().int().positive() })) }))
    .min(1),
});
export type Encounter = z.infer<typeof EncounterSchema>;
