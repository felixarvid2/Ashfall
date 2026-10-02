/** Bastion skills (Phase 1 set). Numbers are first-pass and will be tuned. */
import type { z } from 'zod';
import type { SkillDefSchema } from '../schemas';

type SkillInput = z.input<typeof SkillDefSchema>;

export const BASTION_SKILLS: SkillInput[] = [
  {
    id: 'bastion.hydraulic_strike',
    classId: 'bastion',
    category: 'basic',
    cooldown: 0,
    resourceGain: 11,
    castTime: 0.1,
    recovery: 0.24,
    // Superheated: at high Heat the strike sets enemies on fire.
    resourceBonus: { threshold: 70, applies: [{ status: 'burning', duration: 3, coefficient: 0.9 }] },
    effect: {
      kind: 'meleeArc',
      range: 2.5,
      arcDeg: 120,
      coefficient: 0.9,
      damageType: 'physical',
      knockback: 1.6,
      hitstopMs: 45,
      shake: 0.12,
    },
  },
  {
    id: 'bastion.seismic_shock',
    classId: 'bastion',
    category: 'core',
    cooldown: 0,
    resourceCost: 35,
    castTime: 0.22,
    recovery: 0.28,
    effect: {
      kind: 'nova',
      radius: 4.2,
      coefficient: 2.2,
      damageType: 'physical',
      knockback: 5,
      applies: [{ status: 'vulnerable', duration: 4 }],
      hitstopMs: 90,
      shake: 0.45,
    },
  },
  {
    id: 'bastion.rocket_leap',
    classId: 'bastion',
    category: 'tactical',
    cooldown: 7,
    resourceGain: 15,
    castTime: 0.05,
    recovery: 0.15,
    effect: {
      kind: 'leap',
      maxRange: 9,
      duration: 0.55,
      height: 3,
      landing: {
        radius: 3.2,
        coefficient: 1.4,
        damageType: 'physical',
        knockback: 3,
        applies: [{ status: 'stunned', duration: 1.25 }],
        hitstopMs: 70,
        shake: 0.55,
      },
    },
  },
  {
    id: 'bastion.energy_shield',
    classId: 'bastion',
    category: 'defensive',
    cooldown: 14,
    resourceGain: 15,
    castTime: 0.08,
    recovery: 0.08,
    effect: {
      kind: 'selfBuff',
      applies: [{ status: 'barrier', duration: 6, lifeFraction: 0.35 }],
      cleanse: true,
    },
  },
];
