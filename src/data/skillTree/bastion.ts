/** Bastion skill tree. Names and descriptions live in lang/en.json under tree.<node id>. */
import type { z } from 'zod';
import type { SkillTreeSchema } from './schema';

type Tree = z.input<typeof SkillTreeSchema>;

const skillNode = (id: string, branch: Tree['nodes'][number]['branch']) =>
  ({ id: `n.${id}`, branch, type: 'skill', skill: `bastion.${id}` }) as const;

export const BASTION_TREE: Tree = {
  classId: 'bastion',
  startingNode: 'n.hydraulic_strike',
  unlockAt: { basic: 0, core: 2, defensive: 5, tactical: 9, mastery: 14, ultimate: 20, key: 28 },
  respecGoldPerLevel: 25,
  nodes: [
    // ---- Basic
    skillNode('hydraulic_strike', 'basic'),
    { id: 'e.hydraulic_strike', branch: 'basic', type: 'enhancement', parent: 'n.hydraulic_strike',
      effects: [{ kind: 'skillMod', skill: 'bastion.hydraulic_strike', mods: [{ op: 'add', field: 'resourceGain', value: 4 }] }] },
    { id: 'm.hydraulic_strike.searing', branch: 'basic', type: 'modifier', parent: 'e.hydraulic_strike', group: 'hydraulic_strike',
      effects: [{ kind: 'skillMod', skill: 'bastion.hydraulic_strike', mods: [{ op: 'addApply', apply: { status: 'burning', duration: 3, coefficient: 0.5 } }] }] },
    { id: 'm.hydraulic_strike.crushing', branch: 'basic', type: 'modifier', parent: 'e.hydraulic_strike', group: 'hydraulic_strike',
      effects: [{ kind: 'skillMod', skill: 'bastion.hydraulic_strike', mods: [{ op: 'damage', value: 0.4, when: 'stunned' }, { op: 'damage', value: 0.4, when: 'vulnerable' }] }] },
    skillNode('piston_jab', 'basic'),
    { id: 'e.piston_jab', branch: 'basic', type: 'enhancement', parent: 'n.piston_jab',
      effects: [{ kind: 'skillMod', skill: 'bastion.piston_jab', mods: [{ op: 'mul', field: 'range', value: 0.2 }] }] },
    { id: 'm.piston_jab.rapid', branch: 'basic', type: 'modifier', parent: 'e.piston_jab', group: 'piston_jab',
      effects: [{ kind: 'skillMod', skill: 'bastion.piston_jab', mods: [{ op: 'mul', field: 'castTime', value: -0.4 }, { op: 'add', field: 'resourceGain', value: 3 }] }] },
    { id: 'm.piston_jab.breaching', branch: 'basic', type: 'modifier', parent: 'e.piston_jab', group: 'piston_jab',
      effects: [{ kind: 'skillMod', skill: 'bastion.piston_jab', mods: [{ op: 'damage', value: 0.5, multiplicative: true, when: 'vulnerable' }] }] },
    { id: 'p.hydraulic_power', branch: 'basic', type: 'passive', effects: [{ kind: 'stat', stat: 'damage', value: 0.04 }] },
    { id: 'p.forged_frame', branch: 'basic', type: 'passive', effects: [{ kind: 'stat', stat: 'damageReduction', value: 0.02 }] },

    // ---- Core
    skillNode('seismic_shock', 'core'),
    { id: 'e.seismic_shock', branch: 'core', type: 'enhancement', parent: 'n.seismic_shock',
      effects: [{ kind: 'skillMod', skill: 'bastion.seismic_shock', mods: [{ op: 'mul', field: 'radius', value: 0.15 }] }] },
    { id: 'm.seismic_shock.pull', branch: 'core', type: 'modifier', parent: 'e.seismic_shock', group: 'seismic_shock',
      effects: [{ kind: 'skillMod', skill: 'bastion.seismic_shock', mods: [{ op: 'set', field: 'knockback', value: -3.5 }] }] },
    { id: 'm.seismic_shock.rupture', branch: 'core', type: 'modifier', parent: 'e.seismic_shock', group: 'seismic_shock',
      effects: [{ kind: 'skillMod', skill: 'bastion.seismic_shock', mods: [{ op: 'hazard', radius: 3.5, duration: 3, status: 'burning', dpsCoefficient: 0.3 }] }] },
    skillNode('furnace_cleave', 'core'),
    { id: 'e.furnace_cleave', branch: 'core', type: 'enhancement', parent: 'n.furnace_cleave',
      effects: [{ kind: 'skillMod', skill: 'bastion.furnace_cleave', mods: [{ op: 'add', field: 'resourceCost', value: -6 }] }] },
    { id: 'm.furnace_cleave.wildfire', branch: 'core', type: 'modifier', parent: 'e.furnace_cleave', group: 'furnace_cleave',
      effects: [{ kind: 'skillMod', skill: 'bastion.furnace_cleave', mods: [{ op: 'damage', value: 0.5, when: 'burning' }] }] },
    { id: 'm.furnace_cleave.molten', branch: 'core', type: 'modifier', parent: 'e.furnace_cleave', group: 'furnace_cleave',
      effects: [{ kind: 'skillMod', skill: 'bastion.furnace_cleave', mods: [{ op: 'set', field: 'arcDeg', value: 360 }, { op: 'mul', field: 'coefficient', value: -0.15 }] }] },
    { id: 'p.thermal_capacitor', branch: 'core', type: 'passive', effects: [{ kind: 'stat', stat: 'resourceGen', value: 0.04 }] },
    { id: 'p.crushing_force', branch: 'core', type: 'passive', effects: [{ kind: 'stat', stat: 'damageVsVulnerable', value: 0.06 }] },

    // ---- Defensive
    skillNode('energy_shield', 'defensive'),
    { id: 'e.energy_shield', branch: 'defensive', type: 'enhancement', parent: 'n.energy_shield',
      effects: [{ kind: 'skillMod', skill: 'bastion.energy_shield', mods: [{ op: 'mul', field: 'barrier', value: 0.2 }] }] },
    { id: 'm.energy_shield.reactive', branch: 'defensive', type: 'modifier', parent: 'e.energy_shield', group: 'energy_shield',
      effects: [{ kind: 'damage', value: 0.15, when: 'hasBarrier' }] },
    { id: 'm.energy_shield.restoring', branch: 'defensive', type: 'modifier', parent: 'e.energy_shield', group: 'energy_shield',
      effects: [{ kind: 'skillMod', skill: 'bastion.energy_shield', mods: [{ op: 'add', field: 'heal', value: 0.12 }] }] },
    skillNode('coolant_flush', 'defensive'),
    { id: 'e.coolant_flush', branch: 'defensive', type: 'enhancement', parent: 'n.coolant_flush',
      effects: [{ kind: 'skillMod', skill: 'bastion.coolant_flush', mods: [{ op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'm.coolant_flush.cryo', branch: 'defensive', type: 'modifier', parent: 'e.coolant_flush', group: 'coolant_flush',
      effects: [{ kind: 'skillMod', skill: 'bastion.coolant_flush', mods: [{ op: 'mul', field: 'barrier', value: 1 }] }] },
    { id: 'm.coolant_flush.overpressure', branch: 'defensive', type: 'modifier', parent: 'e.coolant_flush', group: 'coolant_flush',
      effects: [{ kind: 'skillMod', skill: 'bastion.coolant_flush', mods: [{ op: 'mul', field: 'heal', value: 0.5 }] }] },
    { id: 'p.reinforced_plating', branch: 'defensive', type: 'passive', effects: [{ kind: 'stat', stat: 'armor', value: 20 }] },
    { id: 'p.vital_systems', branch: 'defensive', type: 'passive', effects: [{ kind: 'stat', stat: 'maxLife', value: 15 }] },

    // ---- Tactical
    skillNode('rocket_leap', 'tactical'),
    { id: 'e.rocket_leap', branch: 'tactical', type: 'enhancement', parent: 'n.rocket_leap',
      effects: [{ kind: 'skillMod', skill: 'bastion.rocket_leap', mods: [{ op: 'mul', field: 'landingRadius', value: 0.2 }] }] },
    { id: 'm.rocket_leap.afterburner', branch: 'tactical', type: 'modifier', parent: 'e.rocket_leap', group: 'rocket_leap',
      effects: [{ kind: 'skillMod', skill: 'bastion.rocket_leap', mods: [{ op: 'mul', field: 'cooldown', value: -0.3 }] }] },
    { id: 'm.rocket_leap.crater', branch: 'tactical', type: 'modifier', parent: 'e.rocket_leap', group: 'rocket_leap',
      effects: [{ kind: 'skillMod', skill: 'bastion.rocket_leap', mods: [{ op: 'hazard', radius: 3, duration: 4, status: 'burning', dpsCoefficient: 0.35 }] }] },
    skillNode('magnetic_pull', 'tactical'),
    { id: 'e.magnetic_pull', branch: 'tactical', type: 'enhancement', parent: 'n.magnetic_pull',
      effects: [{ kind: 'skillMod', skill: 'bastion.magnetic_pull', mods: [{ op: 'mul', field: 'radius', value: 0.2 }] }] },
    { id: 'm.magnetic_pull.polarity', branch: 'tactical', type: 'modifier', parent: 'e.magnetic_pull', group: 'magnetic_pull',
      effects: [{ kind: 'skillMod', skill: 'bastion.magnetic_pull', mods: [{ op: 'addApply', apply: { status: 'vulnerable', duration: 3 } }] }] },
    { id: 'm.magnetic_pull.lock', branch: 'tactical', type: 'modifier', parent: 'e.magnetic_pull', group: 'magnetic_pull',
      effects: [{ kind: 'skillMod', skill: 'bastion.magnetic_pull', mods: [{ op: 'addApply', apply: { status: 'stunned', duration: 1.4 } }] }] },
    { id: 'p.servo_actuators', branch: 'tactical', type: 'passive', effects: [{ kind: 'stat', stat: 'moveSpeed', value: 0.03 }] },
    { id: 'p.combat_stims', branch: 'tactical', type: 'passive', effects: [{ kind: 'stat', stat: 'potionHealing', value: 0.1 }] },

    // ---- Mastery
    skillNode('heat_vent', 'mastery'),
    { id: 'e.heat_vent', branch: 'mastery', type: 'enhancement', parent: 'n.heat_vent',
      effects: [{ kind: 'skillMod', skill: 'bastion.heat_vent', mods: [{ op: 'mul', field: 'coefficient', value: 0.2 }] }] },
    { id: 'm.heat_vent.supernova', branch: 'mastery', type: 'modifier', parent: 'e.heat_vent', group: 'heat_vent',
      effects: [{ kind: 'skillMod', skill: 'bastion.heat_vent', mods: [{ op: 'mul', field: 'radius', value: 0.4 }] }] },
    { id: 'm.heat_vent.controlled', branch: 'mastery', type: 'modifier', parent: 'e.heat_vent', group: 'heat_vent',
      effects: [{ kind: 'skillMod', skill: 'bastion.heat_vent', mods: [{ op: 'mul', field: 'cooldown', value: -0.35 }] }] },
    { id: 'p.overclock', branch: 'mastery', type: 'passive', effects: [{ kind: 'stat', stat: 'attackSpeed', value: 0.03 }] },
    { id: 'p.heat_tolerance', branch: 'mastery', type: 'passive', effects: [{ kind: 'overheat', graceDelta: 0.5 }] },

    // ---- Ultimate
    skillNode('orbital_strike', 'ultimate'),
    { id: 'e.orbital_strike', branch: 'ultimate', type: 'enhancement', parent: 'n.orbital_strike',
      effects: [{ kind: 'skillMod', skill: 'bastion.orbital_strike', mods: [{ op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'm.orbital_strike.precision', branch: 'ultimate', type: 'modifier', parent: 'e.orbital_strike', group: 'orbital_strike',
      effects: [{ kind: 'skillMod', skill: 'bastion.orbital_strike', mods: [{ op: 'mul', field: 'coefficient', value: 0.35 }] }] },
    { id: 'm.orbital_strike.barrage', branch: 'ultimate', type: 'modifier', parent: 'e.orbital_strike', group: 'orbital_strike',
      effects: [{ kind: 'skillMod', skill: 'bastion.orbital_strike', mods: [{ op: 'mul', field: 'radius', value: 0.5 }] }] },
    { id: 'p.killing_blow', branch: 'ultimate', type: 'passive', effects: [{ kind: 'stat', stat: 'damageVsElite', value: 0.08 }] },

    // ---- Key passives (choose one)
    { id: 'k.reactor_core', branch: 'key', type: 'keyPassive',
      effects: [{ kind: 'damage', value: 0.25, multiplicative: true, when: 'highResource' }, { kind: 'overheat', graceDelta: -0.5 }] },
    { id: 'k.bulwark_protocol', branch: 'key', type: 'keyPassive',
      effects: [{ kind: 'damage', value: 0.2, multiplicative: true, when: 'hasBarrier' }, { kind: 'stat', stat: 'barrierBonus', value: 0.3 }] },
    { id: 'k.shockwave_engine', branch: 'key', type: 'keyPassive',
      effects: [{ kind: 'damage', value: 0.3, multiplicative: true, when: 'vulnerable' }] },
  ],
};
