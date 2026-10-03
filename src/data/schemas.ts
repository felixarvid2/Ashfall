/**
 * Zod schemas for combat design data (skills, classes, enemies, statuses,
 * encounters). Data files under src/data/ are typed with z.input<> so they get
 * autocomplete, and validate.ts parses them at startup in dev and in tests.
 */
import { z } from 'zod';

export const DAMAGE_TYPES = ['physical', 'heat', 'cold', 'toxic', 'energy', 'void'] as const;
export const DamageTypeSchema = z.enum(DAMAGE_TYPES);
export type DamageType = z.infer<typeof DamageTypeSchema>;

export const STATUS_IDS = [
  'burning',
  'poisoned',
  'chilled',
  'frozen',
  'stunned',
  'vulnerable',
  'barrier',
  // Spectre: marked targets take more damage and refund resource on death.
  'marked',
  // Invisible to enemies; the next hit is a guaranteed crit.
  'stealth',
  // Short window after a dodge or blink (Ghost key passive).
  'evasive',
  // Xenomant: hardened chitin (less damage taken, thorns) and roots that hold enemies in place.
  'chitin',
  'rooted',
  // Stim Pylon buffs (docs/world-and-gameplay.md §3.1).
  'overcharge',
  'kinetic',
  'aegis',
  'chainReaction',
  'magnet',
  'overclock',
] as const;
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
  'marked',
  // Attacker-side conditions (evaluated on the one dealing damage).
  'highResource',
  'hasBarrier',
  'evasive',
  'stealthed',
  // The attacker is one of the player's minions.
  'minion',
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
  /** Takes more damage; the killer's owner gets `refund` resource when it dies marked. */
  z.object({ kind: z.literal('mark'), damageTakenMultiplier: z.number().min(1), refund: z.number().nonnegative(), color: z.string() }),
  /** Flag-like buff read by game logic (stealth, evasive). */
  z.object({ kind: z.literal('buff'), color: z.string() }),
  /** Damage reduction plus thorns: melee attackers take `thornsCoefficient` × the wearer's weapon damage. */
  z.object({ kind: z.literal('ward'), damageReduction: z.number().min(0).max(0.9), thornsCoefficient: z.number().nonnegative(), color: z.string() }),
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
  /** Melee or ranged hit (for "+x% melee damage" style bonuses). */
  delivery: z.enum(['melee', 'ranged']).default('melee'),
  /** Heal the attacker for this fraction of the damage dealt. */
  lifeSteal: z.number().min(0).max(1).default(0),
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
  // Bullets/darts: `count` projectiles spread over `spreadDeg`, each passing through `pierce` enemies.
  ImpactSchema.extend({
    kind: z.literal('projectile'),
    speed: z.number().positive(),
    maxRange: z.number().positive(),
    radius: z.number().positive(),
    count: z.number().int().positive().default(1),
    spreadDeg: z.number().nonnegative().default(0),
    pierce: z.number().int().nonnegative().default(0),
    /** Explode on impact, hitting everything in this radius instead of only the target. */
    explodeRadius: z.number().nonnegative().default(0),
    color: z.string().default('#9fe8ff'),
  }),
  // Thrown in an arc to the cursor, explodes on landing, optionally into bomblets.
  ImpactSchema.extend({
    kind: z.literal('grenade'),
    maxRange: z.number().positive(),
    radius: z.number().positive(),
    flightTime: z.number().positive(),
    bomblets: z
      .object({ count: z.number().int().positive(), radius: z.number().positive(), coefficient: z.number().nonnegative(), spread: z.number().positive() })
      .optional(),
  }),
  // Mines placed around the cursor: arm, then explode when an enemy steps close.
  ImpactSchema.extend({
    kind: z.literal('trap'),
    maxRange: z.number().positive(),
    count: z.number().int().positive(),
    spacing: z.number().nonnegative(),
    triggerRadius: z.number().positive(),
    radius: z.number().positive(),
    armTime: z.number().nonnegative(),
    duration: z.number().positive(),
  }),
  // Instant teleport toward the cursor.
  z.object({
    kind: z.literal('blink'),
    maxRange: z.number().positive(),
    invulnerable: z.number().nonnegative().default(0),
    applies: z.array(StatusApplySchema).default([]),
  }),
  // A hologram that draws enemy attention.
  z.object({
    kind: z.literal('decoy'),
    maxRange: z.number().nonnegative(),
    duration: z.number().positive(),
    /** Decoy life as a fraction of the caster's max life. */
    lifeFraction: z.number().positive(),
    tauntRadius: z.number().positive(),
    /** Explodes when it expires or dies (0 = no explosion). */
    burst: ImpactSchema.extend({ radius: z.number().positive() }).optional(),
  }),
  // Instant area at the cursor (marks, bursts).
  ImpactSchema.extend({
    kind: z.literal('cursorBurst'),
    maxRange: z.number().positive(),
    radius: z.number().positive(),
  }),
  // A lingering cloud at the cursor (initial hit, then a damage-over-time area).
  ImpactSchema.extend({
    kind: z.literal('cloud'),
    maxRange: z.number().positive(),
    radius: z.number().positive(),
    duration: z.number().positive(),
    /** Damage per second inside the cloud, as a fraction of weapon damage. */
    dpsCoefficient: z.number().nonnegative(),
    status: z.enum(['poisoned', 'burning']).default('poisoned'),
  }),
  // A draining link to up to `count` enemies near the cursor; hits `ticks` times over `duration`.
  ImpactSchema.extend({
    kind: z.literal('tether'),
    maxRange: z.number().positive(),
    duration: z.number().positive(),
    ticks: z.number().int().positive(),
    count: z.number().int().positive().default(1),
  }),
  // Raise corpses near the cursor as minions.
  z.object({
    kind: z.literal('raise'),
    maxRange: z.number().positive(),
    searchRadius: z.number().positive(),
    /** Corpses raised per cast. */
    count: z.number().int().positive(),
    maxMinions: z.number().int().positive(),
    /** Minion life as a fraction of the caster's max life. */
    lifeFraction: z.number().positive(),
    /** Minion hit, scaled by the caster's damage. */
    coefficient: z.number().nonnegative(),
    damageType: DamageTypeSchema,
    attackCooldown: z.number().positive(),
    applies: z.array(StatusApplySchema).default([]),
  }),
  // Detonate corpses near the cursor.
  ImpactSchema.extend({
    kind: z.literal('corpseBurst'),
    maxRange: z.number().positive(),
    searchRadius: z.number().positive(),
    count: z.number().int().positive(),
    radius: z.number().positive(),
  }),
  // A stationary summon that taunts and slams the area around it (Wrath of Lumen).
  z.object({
    kind: z.literal('turret'),
    assetId: z.string(),
    maxRange: z.number().nonnegative(),
    duration: z.number().positive(),
    lifeFraction: z.number().positive(),
    tauntRadius: z.number().nonnegative(),
    interval: z.number().positive(),
    slam: ImpactSchema.extend({ radius: z.number().positive() }),
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
  /** Animation for the cast; default: basic skills "attack", others "cast". */
  /** Character clip to play (missing clips fall back: shoot→attack, slam/leap/throw/cast2→cast). */
  anim: z.enum(['attack', 'attack2', 'cast', 'cast2', 'slam', 'leap', 'shoot', 'throw', 'dodge']).optional(),
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
    /** Resource gained per critical hit dealt (Focus). */
    onCrit: z.number().nonnegative().default(0),
    /** Resource gained when an attack is avoided by dodging or stealth (Focus). */
    onAvoid: z.number().nonnegative().default(0),
    /** Resource gained when an enemy dies within `radius` metres (Biomass). */
    onNearbyDeath: z.object({ radius: z.number().positive(), amount: z.number().nonnegative() }).optional(),
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
    /** Shots per attack (machine-gun bursts), fired `burstInterval` apart within `spreadDeg`. */
    burst: z.number().int().positive().default(1),
    burstInterval: z.number().nonnegative().default(0.1),
    spreadDeg: z.number().nonnegative().default(0),
  }),
  // Walks up, swells (telegraphed circle) and bursts, dying in the blast.
  z.object({
    kind: z.literal('explode'),
    range: z.number().positive(),
    radius: z.number().positive(),
    windup: z.number().positive(),
    cooldown: z.number().nonnegative().default(0),
    damageType: DamageTypeSchema,
    knockback: z.number().nonnegative().default(0),
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
  behavior: z.enum(['rusher', 'ranged', 'support', 'kamikaze', 'flanker', 'tank']),
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
  /** Model scale and constant emissive tint (variants of a shared model). */
  scale: z.number().positive().default(1),
  glow: z.string().optional(),
  /** Fraction of damage blocked by a shield when hit from the front (within 60°). */
  frontShield: z.number().min(0).max(0.95).default(0),
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
