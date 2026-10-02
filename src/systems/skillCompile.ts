/**
 * Builds the effective version of each skill from its data, its rank and every modifier
 * that applies (skill tree, legendary aspects, unique items).
 */
import { SKILLS } from '../data/db';
import type { Effect, SkillField, SkillMod } from '../data/effects';
import { num } from '../data/effects';
import type { Bonus, SkillDef, StatusApply } from '../data/schemas';

export interface SkillHazard {
  radius: number;
  duration: number;
  status: 'burning' | 'poisoned';
  dpsCoefficient: number;
}

/** A skill after ranks and modifiers. `bonuses` apply only to this skill's hits. */
export interface CompiledSkill {
  def: SkillDef;
  rank: number;
  bonuses: { additive: Bonus[]; multiplicative: Bonus[] };
  hazards: SkillHazard[];
}

/** Damage gained per rank above 1 (Diablo 4 style: +10 % of base per rank). */
export const RANK_DAMAGE = 0.1;
/** Barrier/heal gained per rank above 1. */
export const RANK_SUPPORT = 0.08;

type Getter = { get: () => number; set: (v: number) => void };

/** Accessors for the numeric fields modifiers can touch, per effect kind. */
export function fieldAccess(def: SkillDef, field: SkillField): Getter | null {
  const e = def.effect as Record<string, unknown> & { kind: string };
  const top = (key: 'cooldown' | 'resourceCost' | 'resourceGain' | 'castTime'): Getter => ({
    get: () => def[key],
    set: (v) => (def[key] = Math.max(0, v)),
  });
  const onEffect = (key: string, target: Record<string, unknown> = e): Getter | null =>
    typeof target[key] === 'number' ? { get: () => target[key] as number, set: (v) => (target[key] = v) } : null;
  switch (field) {
    case 'cooldown':
    case 'resourceCost':
    case 'resourceGain':
    case 'castTime':
      return top(field);
    case 'coefficient':
    case 'radius':
    case 'range':
    case 'arcDeg':
    case 'knockback':
    case 'maxRange':
      return onEffect(field);
    case 'landingRadius':
      return e.kind === 'leap' ? onEffect('radius', e.landing as Record<string, unknown>) : null;
    case 'landingCoefficient':
      return e.kind === 'leap' ? onEffect('coefficient', e.landing as Record<string, unknown>) : null;
    case 'heal':
      return onEffect('healFraction');
    case 'barrier': {
      const applies = (e.applies as StatusApply[] | undefined)?.filter((a) => a.status === 'barrier') ?? [];
      if (!applies.length) return null;
      return {
        get: () => applies[0]!.lifeFraction ?? applies[0]!.amount ?? 0,
        set: (v) => {
          for (const a of applies) {
            if (a.lifeFraction !== undefined) a.lifeFraction = Math.min(1, v);
            else a.amount = v;
          }
        },
      };
    }
  }
}

function appliesOf(def: SkillDef): StatusApply[] | null {
  const e = def.effect as { kind: string; applies?: StatusApply[]; landing?: { applies: StatusApply[] } };
  if (e.kind === 'leap') return e.landing!.applies;
  return e.applies ?? null;
}

export function compileSkill(id: string, rank: number, mods: SkillMod[]): CompiledSkill {
  const base = SKILLS.get(id);
  if (!base) throw new Error(`Unknown skill ${id}`);
  const def = structuredClone(base);
  const bonuses: CompiledSkill['bonuses'] = { additive: [], multiplicative: [] };
  const hazards: SkillHazard[] = [];

  // (base + Σadd) × (1 + Σmul), then "set" overrides.
  const adds = new Map<SkillField, number>();
  const muls = new Map<SkillField, number>();
  const sets = new Map<SkillField, number>();
  for (const m of mods) {
    switch (m.op) {
      case 'add':
        adds.set(m.field, (adds.get(m.field) ?? 0) + num(m.value));
        break;
      case 'mul':
        muls.set(m.field, (muls.get(m.field) ?? 0) + num(m.value));
        break;
      case 'set':
        sets.set(m.field, num(m.value));
        break;
      case 'addApply': {
        const list = appliesOf(def);
        if (list) {
          const a = m.apply;
          list.push({
            status: a.status,
            duration: a.duration,
            ...(a.coefficient !== undefined ? { coefficient: num(a.coefficient) } : {}),
            ...(a.dps !== undefined ? { dps: num(a.dps) } : {}),
            ...(a.amount !== undefined ? { amount: a.amount } : {}),
            ...(a.lifeFraction !== undefined ? { lifeFraction: a.lifeFraction } : {}),
          });
        }
        break;
      }
      case 'hazard':
        hazards.push({ radius: m.radius, duration: m.duration, status: m.status, dpsCoefficient: num(m.dpsCoefficient) });
        break;
      case 'damage': {
        const b: Bonus = { value: num(m.value), ...(m.when ? { when: m.when } : {}), source: id };
        (m.multiplicative ? bonuses.multiplicative : bonuses.additive).push(b);
        break;
      }
    }
  }
  const fields = new Set<SkillField>([...adds.keys(), ...muls.keys(), ...sets.keys()]);
  for (const f of fields) {
    const acc = fieldAccess(def, f);
    if (!acc) continue;
    let v = (acc.get() + (adds.get(f) ?? 0)) * (1 + (muls.get(f) ?? 0));
    if (sets.has(f)) v = sets.get(f)!;
    acc.set(v);
  }

  // Ranks: damage and support values grow with rank.
  const extra = Math.max(0, rank - 1);
  if (extra > 0) {
    for (const f of ['coefficient', 'landingCoefficient'] as const) {
      const acc = fieldAccess(def, f);
      if (acc) acc.set(acc.get() * (1 + RANK_DAMAGE * extra));
    }
    for (const f of ['barrier', 'heal'] as const) {
      const acc = fieldAccess(def, f);
      if (acc && acc.get() > 0) acc.set(acc.get() * (1 + RANK_SUPPORT * extra));
    }
  }
  return { def, rank, bonuses, hazards };
}

/** Compile every learned skill with all skill modifiers from `effects`. */
export function compileSkills(ranks: Map<string, number>, effects: Effect[]): Record<string, CompiledSkill> {
  const modsBySkill = new Map<string, SkillMod[]>();
  for (const e of effects) {
    if (e.kind !== 'skillMod') continue;
    const list = modsBySkill.get(e.skill) ?? [];
    list.push(...e.mods);
    modsBySkill.set(e.skill, list);
  }
  const out: Record<string, CompiledSkill> = {};
  for (const [id, rank] of ranks) out[id] = compileSkill(id, rank, modsBySkill.get(id) ?? []);
  return out;
}
