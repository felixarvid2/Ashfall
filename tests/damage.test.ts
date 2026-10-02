import { describe, expect, it } from 'vitest';
import {
  ARMOR_CAP,
  RESIST_CAP,
  additiveMultiplier,
  armorMitigation,
  computeHit,
  computeOutgoing,
  computeTaken,
  mitigation,
  multiplicativeMultiplier,
  type OutgoingInput,
  type TargetState,
} from '../src/systems/damage';
import type { Condition } from '../src/data/schemas';

const none = new Set<Condition>();
const base: OutgoingInput = {
  weaponDamage: 100,
  coefficient: 1,
  mainStat: 0,
  additive: [],
  multiplicative: [],
  critChance: 0,
  critDamage: 0.5,
};
const dummy = (over: Partial<TargetState> = {}): TargetState => ({
  armor: 0,
  resist: {},
  vulnerable: false,
  vulnerableMultiplier: 1.2,
  conditions: none,
  ...over,
});

describe('damage buckets', () => {
  it('base damage is weapon × coefficient', () => {
    expect(computeOutgoing({ ...base, coefficient: 2.5 }, none, null).outgoing).toBe(250);
  });

  it('main stat adds 0.1% per point', () => {
    expect(computeOutgoing({ ...base, mainStat: 200 }, none, null).outgoing).toBeCloseTo(120);
  });

  it('additive bonuses are summed into one bucket', () => {
    // +20% and +30% additive → ×1.5, not ×1.56
    const out = computeOutgoing({ ...base, additive: [{ value: 0.2 }, { value: 0.3 }] }, none, null);
    expect(out.additiveMul).toBeCloseTo(1.5);
    expect(out.outgoing).toBeCloseTo(150);
  });

  it('multiplicative bonuses each multiply separately', () => {
    // ×20% and ×30% → ×1.56
    const out = computeOutgoing({ ...base, multiplicative: [{ value: 0.2 }, { value: 0.3 }] }, none, null);
    expect(out.multiplicativeMul).toBeCloseTo(1.56);
    expect(out.outgoing).toBeCloseTo(156);
  });

  it('additive and multiplicative buckets multiply with each other', () => {
    const out = computeOutgoing(
      { ...base, additive: [{ value: 0.5 }], multiplicative: [{ value: 0.2 }], mainStat: 100 },
      none,
      null,
    );
    expect(out.outgoing).toBeCloseTo(100 * 1.1 * 1.5 * 1.2);
  });

  it('conditional bonuses only apply when the condition holds', () => {
    const input = { ...base, additive: [{ value: 0.4, when: 'vulnerable' as const }] };
    expect(computeOutgoing(input, none, null).outgoing).toBeCloseTo(100);
    expect(computeOutgoing(input, new Set<Condition>(['vulnerable']), null).outgoing).toBeCloseTo(140);
  });

  it('negative additive bonuses never push damage below zero', () => {
    expect(additiveMultiplier([{ value: -2 }], none)).toBe(0);
    expect(multiplicativeMultiplier([{ value: -2 }], none)).toBe(0);
  });
});

describe('critical hits', () => {
  it('crit when roll is below crit chance, multiplying by 1 + crit damage', () => {
    const input = { ...base, critChance: 0.25, critDamage: 0.5 };
    const crit = computeOutgoing(input, none, 0.1);
    const normal = computeOutgoing(input, none, 0.9);
    expect(crit.crit).toBe(true);
    expect(crit.outgoing).toBeCloseTo(150);
    expect(normal.crit).toBe(false);
    expect(normal.outgoing).toBeCloseTo(100);
  });

  it('null roll never crits (damage over time)', () => {
    expect(computeOutgoing({ ...base, critChance: 1 }, none, null).crit).toBe(false);
  });
});

describe('target side', () => {
  it('vulnerable multiplies damage taken by 1.2', () => {
    expect(computeTaken(100, 'heat', dummy({ vulnerable: true }), 1).final).toBeCloseTo(120);
  });

  it('armor mitigates physical damage with diminishing returns and a cap', () => {
    expect(armorMitigation(0, 1)).toBe(0);
    expect(armorMitigation(65, 1)).toBeCloseTo(0.5); // 65 / (65 + 50 + 15)
    expect(armorMitigation(100000, 1)).toBe(ARMOR_CAP);
    // Higher-level attackers penetrate the same armor better.
    expect(armorMitigation(200, 10)).toBeLessThan(armorMitigation(200, 1));
  });

  it('elemental damage uses resistance, capped at 70%, and ignores armor', () => {
    const target = dummy({ armor: 1000, resist: { heat: 0.25, cold: 0.95 } });
    expect(mitigation('heat', target, 1)).toBeCloseTo(0.25);
    expect(mitigation('cold', target, 1)).toBe(RESIST_CAP);
    expect(mitigation('toxic', target, 1)).toBe(0);
  });

  it('full hit combines every bucket', () => {
    const input: OutgoingInput = {
      weaponDamage: 20,
      coefficient: 2,
      mainStat: 100,
      additive: [{ value: 0.3 }, { value: 0.2, when: 'vulnerable' }],
      multiplicative: [{ value: 0.25 }],
      critChance: 1,
      critDamage: 0.5,
    };
    const target = dummy({ armor: 65, vulnerable: true, conditions: new Set<Condition>(['vulnerable']) });
    const hit = computeHit(input, 'physical', target, 1, null);
    // 40 × 1.1 × 1.5 × 1.25 × (no crit: null rng) × 1.2 vulnerable × 0.5 armor
    expect(hit.final).toBeCloseTo(40 * 1.1 * 1.5 * 1.25 * 1.2 * 0.5);
  });
});
