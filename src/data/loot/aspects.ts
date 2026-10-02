/**
 * Legendary aspects (brief §5.4). "$" is the rolled value, "-$" its negation.
 * Names and descriptions: lang/en.json → aspects.<id>.
 */
import type { z } from 'zod';
import type { AspectDefSchema } from './schemas';

type Aspect = z.input<typeof AspectDefSchema>;
const B = ['bastion'];
const S = (skill: string) => `bastion.${skill}`;

export const ASPECTS: Aspect[] = [
  { id: 'fissure', classes: B, types: ['weapon', 'gloves', 'amulet', 'ring'], min: 0.25, max: 0.45, scaling: 'sqrt',
    effects: [{ kind: 'skillMod', skill: S('seismic_shock'), mods: [{ op: 'hazard', radius: 3.2, duration: 3, status: 'burning', dpsCoefficient: '$' }] }] },
  { id: 'furnace', classes: B, types: ['ring', 'amulet', 'helm'], min: 0.2, max: 0.4, scaling: 'none',
    effects: [
      { kind: 'skillMod', skill: S('hydraulic_strike'), mods: [{ op: 'mul', field: 'resourceGain', value: '$' }] },
      { kind: 'skillMod', skill: S('piston_jab'), mods: [{ op: 'mul', field: 'resourceGain', value: '$' }] },
    ] },
  { id: 'momentum', classes: B, types: ['boots', 'amulet'], min: 0.2, max: 0.35, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: S('rocket_leap'), mods: [{ op: 'mul', field: 'cooldown', value: '-$' }] }] },
  { id: 'aegis', classes: B, types: ['chest', 'helm', 'offHand', 'amulet'], min: 0.25, max: 0.5, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: S('energy_shield'), mods: [{ op: 'mul', field: 'barrier', value: '$' }] }] },
  { id: 'echo', classes: B, types: ['gloves', 'weapon', 'amulet'], min: 0.15, max: 0.3, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: S('seismic_shock'), mods: [{ op: 'mul', field: 'radius', value: '$' }, { op: 'mul', field: 'coefficient', value: '$' }] }] },
  { id: 'molten_fists', classes: B, types: ['weapon', 'gloves'], min: 0.6, max: 1, scaling: 'sqrt',
    effects: [{ kind: 'skillMod', skill: S('hydraulic_strike'), mods: [{ op: 'addApply', apply: { status: 'burning', duration: 3, coefficient: '$' } }] }] },
  { id: 'brutality', classes: B, types: ['weapon', 'ring', 'amulet', 'gloves'], min: 0.12, max: 0.22, scaling: 'sqrt',
    effects: [{ kind: 'damage', value: '$', multiplicative: true, when: 'stunned' }] },
  { id: 'bulwark', classes: B, types: ['chest', 'offHand', 'amulet'], min: 0.1, max: 0.2, scaling: 'sqrt',
    effects: [{ kind: 'damage', value: '$', multiplicative: true, when: 'hasBarrier' }] },
  { id: 'wrecking_ball', classes: B, types: ['boots', 'weapon', 'amulet'], min: 0.2, max: 0.4, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: S('rocket_leap'), mods: [{ op: 'mul', field: 'landingRadius', value: '$' }, { op: 'mul', field: 'landingCoefficient', value: '$' }] }] },
  { id: 'vulnerability_matrix', classes: B, types: ['weapon', 'ring', 'amulet', 'gloves'], min: 0.1, max: 0.2, scaling: 'sqrt',
    effects: [{ kind: 'damage', value: '$', multiplicative: true, when: 'vulnerable' }] },
  { id: 'heat_sink', classes: B, types: ['helm', 'amulet', 'ring'], min: 0.2, max: 0.4, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: S('heat_vent'), mods: [{ op: 'mul', field: 'cooldown', value: '-$' }] }] },
  { id: 'gravity_well', classes: B, types: ['gloves', 'amulet'], min: 0.2, max: 0.4, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: S('magnetic_pull'), mods: [{ op: 'mul', field: 'radius', value: '$' }] }] },
  { id: 'orbital_uplink', classes: B, types: ['helm', 'amulet'], min: 0.15, max: 0.3, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: S('orbital_strike'), mods: [{ op: 'mul', field: 'cooldown', value: '-$' }] }] },
  { id: 'cinder_core', classes: B, types: ['weapon', 'ring'], min: 6, max: 12, scaling: 'none', display: 'flat',
    effects: [{ kind: 'skillMod', skill: S('furnace_cleave'), mods: [{ op: 'add', field: 'resourceCost', value: '-$' }] }] },
  // Generic aspects (any class)
  { id: 'lifeblood', types: ['ring', 'amulet', 'gloves'], min: 6, max: 12, scaling: 'linear', display: 'flat',
    effects: [{ kind: 'stat', stat: 'lifeOnKill', value: '$' }] },
  { id: 'unbroken', types: ['chest', 'pants', 'offHand'], min: 0.04, max: 0.08, scaling: 'none',
    effects: [{ kind: 'stat', stat: 'damageReduction', value: '$' }] },
];
