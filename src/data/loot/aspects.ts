/**
 * Legendary aspects (brief §5.4). "$" is the rolled value, "-$" its negation.
 * Names and descriptions: lang/en.json → aspects.<id>.
 */
import type { z } from 'zod';
import type { AspectDefSchema } from './schemas';

type Aspect = z.input<typeof AspectDefSchema>;
const B = ['bastion'];
const S = (skill: string) => `bastion.${skill}`;
const SP = ['spectre'];
const X = (skill: string) => `spectre.${skill}`;
const XE = ['xenomant'];
const Z = (skill: string) => `xenomant.${skill}`;

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
  // ---- Spectre
  { id: 'ricochet', classes: SP, types: ['weapon', 'gloves', 'ring'], min: 1, max: 2, scaling: 'none', display: 'flat',
    effects: [{ kind: 'skillMod', skill: X('quick_shot'), mods: [{ op: 'add', field: 'pierce', value: '$' }] }] },
  { id: 'marksman', classes: SP, types: ['weapon', 'amulet', 'gloves'], min: 0.2, max: 0.4, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: X('piercing_shot'), mods: [{ op: 'mul', field: 'coefficient', value: '$' }] }] },
  { id: 'bullet_storm', classes: SP, types: ['weapon', 'gloves', 'amulet'], min: 1, max: 3, scaling: 'none', display: 'flat',
    effects: [{ kind: 'skillMod', skill: X('pistol_barrage'), mods: [{ op: 'add', field: 'count', value: '$' }] }] },
  { id: 'trapper', classes: SP, types: ['boots', 'amulet', 'pants'], min: 1, max: 2, scaling: 'none', display: 'flat',
    effects: [{ kind: 'skillMod', skill: X('minefield'), mods: [{ op: 'add', field: 'count', value: '$' }] }] },
  { id: 'demolition', classes: SP, types: ['gloves', 'amulet', 'ring'], min: 0.15, max: 0.3, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: X('cluster_grenade'), mods: [{ op: 'mul', field: 'radius', value: '$' }, { op: 'mul', field: 'coefficient', value: '$' }] }] },
  { id: 'phantom', classes: SP, types: ['boots', 'amulet'], min: 0.2, max: 0.35, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: X('phase_shift'), mods: [{ op: 'mul', field: 'cooldown', value: '-$' }] }] },
  { id: 'ambusher', classes: SP, types: ['weapon', 'ring', 'chest'], min: 0.4, max: 0.7, scaling: 'sqrt',
    effects: [{ kind: 'damage', value: '$', multiplicative: true, when: 'stealthed' }] },
  { id: 'predator', classes: SP, types: ['weapon', 'ring', 'amulet', 'helm'], min: 0.1, max: 0.2, scaling: 'sqrt',
    effects: [{ kind: 'damage', value: '$', multiplicative: true, when: 'marked' }] },
  { id: 'blade_dancer', classes: SP, types: ['weapon', 'offHand', 'gloves'], min: 0.2, max: 0.4, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: X('vibro_slash'), mods: [{ op: 'mul', field: 'coefficient', value: '$' }, { op: 'mul', field: 'arcDeg', value: '$' }] }] },
  // ---- Xenomant
  { id: 'plague', classes: XE, types: ['weapon', 'amulet', 'gloves'], min: 0.2, max: 0.4, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: Z('spore_burst'), mods: [{ op: 'mul', field: 'dpsCoefficient', value: '$' }] }] },
  { id: 'swarm', classes: XE, types: ['helm', 'amulet', 'offHand'], min: 1, max: 2, scaling: 'none', display: 'flat',
    effects: [{ kind: 'skillMod', skill: Z('raise_corpse'), mods: [{ op: 'add', field: 'maxMinions', value: '$' }] }] },
  { id: 'leech', classes: XE, types: ['weapon', 'gloves', 'ring'], min: 0.03, max: 0.06, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: Z('scalpel_slash'), mods: [{ op: 'add', field: 'lifeSteal', value: '$' }] }] },
  { id: 'parasitic', classes: XE, types: ['weapon', 'amulet', 'offHand'], min: 1, max: 2, scaling: 'none', display: 'flat',
    effects: [{ kind: 'skillMod', skill: Z('parasite_link'), mods: [{ op: 'add', field: 'count', value: '$' }] }] },
  { id: 'detonation', classes: XE, types: ['gloves', 'amulet', 'ring'], min: 0.15, max: 0.3, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: Z('corpse_explosion'), mods: [{ op: 'mul', field: 'radius', value: '$' }, { op: 'mul', field: 'coefficient', value: '$' }] }] },
  { id: 'carapace', classes: XE, types: ['chest', 'helm', 'pants'], min: 0.2, max: 0.35, scaling: 'none',
    effects: [{ kind: 'skillMod', skill: Z('chitin_armor'), mods: [{ op: 'mul', field: 'cooldown', value: '-$' }] }] },
  { id: 'hive', classes: XE, types: ['weapon', 'offHand', 'ring', 'amulet'], min: 0.12, max: 0.25, scaling: 'sqrt',
    effects: [{ kind: 'damage', value: '$', multiplicative: true, when: 'minion' }] },
  { id: 'virulent', classes: XE, types: ['weapon', 'ring', 'amulet', 'gloves'], min: 0.1, max: 0.2, scaling: 'sqrt',
    effects: [{ kind: 'damage', value: '$', multiplicative: true, when: 'poisoned' }] },
  { id: 'ancient_wrath', classes: XE, types: ['helm', 'amulet'], min: 3, max: 5, scaling: 'none', display: 'flat',
    effects: [{ kind: 'skillMod', skill: Z('wrath_of_lumen'), mods: [{ op: 'add', field: 'duration', value: '$' }] }] },
  // Generic aspects (any class)
  { id: 'lifeblood', types: ['ring', 'amulet', 'gloves'], min: 6, max: 12, scaling: 'linear', display: 'flat',
    effects: [{ kind: 'stat', stat: 'lifeOnKill', value: '$' }] },
  { id: 'unbroken', types: ['chest', 'pants', 'offHand'], min: 0.04, max: 0.08, scaling: 'none',
    effects: [{ kind: 'stat', stat: 'damageReduction', value: '$' }] },
];
