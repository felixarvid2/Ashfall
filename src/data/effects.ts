/**
 * Effects shared by skill-tree nodes, legendary aspects, unique items and key passives.
 * A small fixed vocabulary implemented in code; all numbers live in data.
 * Aspect values use the string "$" as a placeholder for the rolled value.
 */
import { z } from 'zod';
import { StatKeySchema } from './loot/schemas';
import { ConditionSchema, StatusApplySchema } from './schemas';

/** A number, or a placeholder for an aspect's rolled value ("$") or its negation ("-$"). */
const Num = z.union([z.number(), z.literal('$'), z.literal('-$')]);

/** Numeric fields of a skill that modifiers may change. */
export const SKILL_FIELDS = [
  'coefficient',
  'radius',
  'range',
  'arcDeg',
  'cooldown',
  'resourceCost',
  'resourceGain',
  'knockback',
  'castTime',
  'landingRadius',
  'landingCoefficient',
  'barrier',
  'heal',
  'maxRange',
  // Projectiles, grenades, traps, decoys
  'count',
  'pierce',
  'speed',
  'spreadDeg',
  'explodeRadius',
  'duration',
  'triggerRadius',
  'tauntRadius',
  'lifeFraction',
  'burstCoefficient',
  // Xenomant
  'lifeSteal',
  'dpsCoefficient',
  'ticks',
  'searchRadius',
  'maxMinions',
  'interval',
  'attackCooldown',
  'slamCoefficient',
  'slamRadius',
] as const;
export const SkillFieldSchema = z.enum(SKILL_FIELDS);
export type SkillField = z.infer<typeof SkillFieldSchema>;

export const SkillModSchema = z.discriminatedUnion('op', [
  /** Multiply a field: value 0.2 → ×1.2; −0.5 → ×0.5. */
  z.object({ op: z.literal('mul'), field: SkillFieldSchema, value: Num }),
  z.object({ op: z.literal('add'), field: SkillFieldSchema, value: Num }),
  z.object({ op: z.literal('set'), field: SkillFieldSchema, value: Num }),
  /** Apply an extra status on hit (or to self for buffs). */
  z.object({ op: z.literal('addApply'), apply: StatusApplySchema.extend({ coefficient: Num.optional(), dps: Num.optional() }) }),
  /** Leave a burning/poison area where the skill lands. */
  z.object({
    op: z.literal('hazard'),
    radius: z.number().positive(),
    duration: z.number().positive(),
    status: z.enum(['burning', 'poisoned']),
    /** Damage per second as a fraction of weapon damage. */
    dpsCoefficient: Num,
  }),
  /** Extra damage for this skill only. */
  z.object({ op: z.literal('damage'), value: Num, multiplicative: z.boolean().default(false), when: ConditionSchema.optional() }),
]);
export type SkillMod = z.infer<typeof SkillModSchema>;

export const EffectSchema = z.discriminatedUnion('kind', [
  /** Add to a character stat (same keys as item affixes). */
  z.object({ kind: z.literal('stat'), stat: StatKeySchema, value: Num }),
  /** Global damage bonus (additive bucket unless multiplicative). */
  z.object({ kind: z.literal('damage'), value: Num, multiplicative: z.boolean().default(false), when: ConditionSchema.optional() }),
  /** Change how a skill works. */
  z.object({ kind: z.literal('skillMod'), skill: z.string(), mods: z.array(SkillModSchema) }),
  /** Heat tuning: seconds of grace before overheating, and overheat damage multiplier. */
  z.object({ kind: z.literal('overheat'), graceDelta: Num.default(0), damageMul: Num.default(1) }),
]);
export type Effect = z.infer<typeof EffectSchema>;

/** Replace "$" placeholders with a rolled value (aspects), returning plain numbers. */
export function resolveEffects(effects: readonly Effect[], value: number, scale = 1): Effect[] {
  const fix = (v: unknown): unknown => {
    if (v === '$') return value;
    if (v === '-$') return -value;
    if (Array.isArray(v)) return v.map(fix);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)]));
    return v;
  };
  const out = fix(effects) as Effect[];
  if (scale === 1) return out;
  // Multiply every numeric "value" by `scale` (skill-tree ranks).
  return out.map((e) => scaleEffect(e, scale));
}

function scaleEffect(e: Effect, scale: number): Effect {
  if (e.kind === 'stat' || e.kind === 'damage') return { ...e, value: (e.value as number) * scale };
  if (e.kind === 'overheat') return { ...e, graceDelta: num(e.graceDelta) * scale };
  if (e.kind === 'skillMod') {
    return {
      ...e,
      mods: e.mods.map((m) => ('value' in m && typeof m.value === 'number' && m.op !== 'set' ? { ...m, value: m.value * scale } : m)),
    };
  }
  return e;
}

/** Numeric value of a field that may still hold a placeholder. */
export function num(v: number | '$' | '-$' | undefined, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}
