/** Unique and mythic items: fixed affixes plus a build-changing effect. Text: lang → uniques.<id>. */
import type { z } from 'zod';
import type { UniqueDefSchema } from './schemas';

type Unique = z.input<typeof UniqueDefSchema>;

export const UNIQUES: Unique[] = [
  {
    // Seismic Shock becomes a cooldown skill instead of a Heat spender.
    id: 'governors_crucible',
    base: 'plated_vest',
    rarity: 'unique',
    classes: ['bastion'],
    affixes: [
      { stat: 'maxLife', min: 30, max: 40, scaling: 'linear' },
      { stat: 'armor', min: 25, max: 35, scaling: 'linear' },
      { stat: 'resistAll', min: 0.05, max: 0.08, scaling: 'sqrt' },
    ],
    effects: [
      { kind: 'skillMod', skill: 'bastion.seismic_shock', mods: [{ op: 'set', field: 'resourceCost', value: 0 }, { op: 'add', field: 'cooldown', value: 3.5 }] },
    ],
  },
  {
    // Rocket Leap becomes a frequent, hard-hitting Heat spender.
    id: 'ashwalker_treads',
    base: 'mag_boots',
    rarity: 'unique',
    classes: ['bastion'],
    affixes: [
      { stat: 'moveSpeed', min: 0.08, max: 0.12, scaling: 'none' },
      { stat: 'maxLife', min: 20, max: 30, scaling: 'linear' },
      { stat: 'resistHeat', min: 0.08, max: 0.12, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'bastion.rocket_leap',
        mods: [
          { op: 'mul', field: 'cooldown', value: -0.6 },
          { op: 'mul', field: 'landingCoefficient', value: 0.6 },
          { op: 'add', field: 'resourceCost', value: 25 },
          { op: 'set', field: 'resourceGain', value: 0 },
        ],
      },
    ],
  },
  {
    // Hydraulic Strike becomes a full spin that hits everything around you.
    id: 'fist_of_kharos',
    base: 'hydraulic_knuckles',
    rarity: 'unique',
    classes: ['bastion'],
    affixes: [
      { stat: 'critChance', min: 0.04, max: 0.06, scaling: 'none' },
      { stat: 'attackSpeed', min: 0.06, max: 0.1, scaling: 'none' },
      { stat: 'damageVsVulnerable', min: 0.15, max: 0.22, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'bastion.hydraulic_strike',
        mods: [{ op: 'set', field: 'arcDeg', value: 360 }, { op: 'add', field: 'range', value: 0.6 }, { op: 'mul', field: 'coefficient', value: -0.2 }],
      },
    ],
  },
  {
    // Mythic: huge damage and overheating no longer hurts — ride Heat at max forever.
    id: 'heart_of_lumen',
    base: 'signal_pendant',
    rarity: 'mythic',
    affixes: [
      { stat: 'damage', min: 0.12, max: 0.16, scaling: 'sqrt' },
      { stat: 'allAttributes', min: 8, max: 12, scaling: 'linear' },
      { stat: 'critDamage', min: 0.15, max: 0.2, scaling: 'sqrt' },
    ],
    effects: [
      { kind: 'damage', value: 0.35, multiplicative: true },
      { kind: 'overheat', graceDelta: 0, damageMul: 0 },
    ],
  },
];
