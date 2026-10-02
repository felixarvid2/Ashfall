/**
 * Damage model. See docs/damage-formula.md for the full explanation.
 *
 *   outgoing = weapon × coefficient × mainStatMul × (1 + Σ additive) × Π(1 + multiplicative) × critMul
 *   taken    = outgoing × vulnerableMul × (1 − mitigation)
 *
 * Additive bonuses share one bucket (they are summed); multiplicative bonuses
 * each multiply on their own. Conditional bonuses only count when their
 * condition holds for the current target.
 */
import type { Bonus, Condition, DamageType } from '../data/schemas';
import type { Rng } from '../core/rng';

export const ARMOR_CAP = 0.85;
export const RESIST_CAP = 0.7;
/** Each point of the class's main stat adds 0.1% damage (multiplicatively). */
export const MAIN_STAT_SCALE = 0.001;

export interface OutgoingInput {
  weaponDamage: number;
  coefficient: number;
  mainStat: number;
  additive: readonly Bonus[];
  multiplicative: readonly Bonus[];
  critChance: number;
  critDamage: number;
}

export interface TargetState {
  armor: number;
  resist: Partial<Record<DamageType, number>>;
  vulnerable: boolean;
  /** Extra multiplier from the vulnerable status definition (1.2 by default). */
  vulnerableMultiplier: number;
  conditions: ReadonlySet<Condition>;
}

export interface DamageBreakdown {
  base: number;
  mainStatMul: number;
  additiveMul: number;
  multiplicativeMul: number;
  critMul: number;
  outgoing: number;
  vulnerableMul: number;
  mitigation: number;
  final: number;
  crit: boolean;
}

function applies(bonus: Bonus, conditions: ReadonlySet<Condition>): boolean {
  return bonus.when === undefined || conditions.has(bonus.when);
}

/** Sum of applicable additive bonuses → one multiplier. */
export function additiveMultiplier(bonuses: readonly Bonus[], conditions: ReadonlySet<Condition>): number {
  let sum = 0;
  for (const b of bonuses) if (applies(b, conditions)) sum += b.value;
  return Math.max(0, 1 + sum);
}

/** Product of applicable multiplicative bonuses. */
export function multiplicativeMultiplier(bonuses: readonly Bonus[], conditions: ReadonlySet<Condition>): number {
  let product = 1;
  for (const b of bonuses) if (applies(b, conditions)) product *= Math.max(0, 1 + b.value);
  return product;
}

/**
 * Armor reduces physical damage: armor / (armor + 50 + 15 × attackerLevel), capped at 85%.
 * Stronger attackers punch through the same armor more easily.
 */
export function armorMitigation(armor: number, attackerLevel: number): number {
  if (armor <= 0) return 0;
  return Math.min(ARMOR_CAP, armor / (armor + 50 + 15 * Math.max(1, attackerLevel)));
}

/** Physical damage uses armor; elemental damage uses the matching resistance (capped at 70%). */
export function mitigation(type: DamageType, target: Pick<TargetState, 'armor' | 'resist'>, attackerLevel: number): number {
  if (type === 'physical') return armorMitigation(target.armor, attackerLevel);
  return Math.min(RESIST_CAP, Math.max(0, target.resist[type] ?? 0));
}

/** Damage before target-side multipliers. `critRoll` in [0,1); pass null to never crit (DoTs). */
export function computeOutgoing(
  input: OutgoingInput,
  conditions: ReadonlySet<Condition>,
  critRoll: number | null,
): Omit<DamageBreakdown, 'vulnerableMul' | 'mitigation' | 'final'> {
  const base = input.weaponDamage * input.coefficient;
  const mainStatMul = 1 + input.mainStat * MAIN_STAT_SCALE;
  const additiveMul = additiveMultiplier(input.additive, conditions);
  const multiplicativeMul = multiplicativeMultiplier(input.multiplicative, conditions);
  const crit = critRoll !== null && critRoll < input.critChance;
  const critMul = crit ? 1 + input.critDamage : 1;
  const outgoing = base * mainStatMul * additiveMul * multiplicativeMul * critMul;
  return { base, mainStatMul, additiveMul, multiplicativeMul, critMul, outgoing, crit };
}

/** Apply target-side multipliers (vulnerable, armor/resistance). */
export function computeTaken(
  outgoing: number,
  type: DamageType,
  target: TargetState,
  attackerLevel: number,
): { vulnerableMul: number; mitigation: number; final: number } {
  const vulnerableMul = target.vulnerable ? target.vulnerableMultiplier : 1;
  const mit = mitigation(type, target, attackerLevel);
  return { vulnerableMul, mitigation: mit, final: outgoing * vulnerableMul * (1 - mit) };
}

/** Full hit: outgoing then taken, with a crit roll from the seeded RNG. */
export function computeHit(
  input: OutgoingInput,
  type: DamageType,
  target: TargetState,
  attackerLevel: number,
  rng: Rng | null,
): DamageBreakdown {
  const out = computeOutgoing(input, target.conditions, rng ? rng.next() : null);
  const taken = computeTaken(out.outgoing, type, target, attackerLevel);
  return { ...out, ...taken };
}
