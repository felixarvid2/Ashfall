/** Lightbearer skill tree. Names and descriptions live in lang/en.json under tree.<node id>. */
import type { z } from 'zod';
import type { SkillTreeSchema } from './schema';

type Tree = z.input<typeof SkillTreeSchema>;

const skillNode = (id: string, branch: Tree['nodes'][number]['branch']) =>
  ({ id: `n.${id}`, branch, type: 'skill', skill: `lightbearer.${id}` }) as const;
const L = (id: string) => `lightbearer.${id}`;

export const LIGHTBEARER_TREE: Tree = {
  classId: 'lightbearer',
  startingNode: 'n.censer_strike',
  unlockAt: { basic: 0, core: 2, defensive: 5, tactical: 9, mastery: 14, ultimate: 20, key: 28 },
  respecGoldPerLevel: 25,
  nodes: [
    // ---- Basic
    skillNode('censer_strike', 'basic'),
    { id: 'e.censer_strike', branch: 'basic', type: 'enhancement', parent: 'n.censer_strike',
      effects: [{ kind: 'skillMod', skill: L('censer_strike'), mods: [{ op: 'add', field: 'resourceGain', value: 2 }] }] },
    { id: 'm.censer_strike.sweeping', branch: 'basic', type: 'modifier', parent: 'e.censer_strike', group: 'censer_strike',
      effects: [{ kind: 'skillMod', skill: L('censer_strike'), mods: [{ op: 'set', field: 'arcDeg', value: 200 }, { op: 'add', field: 'range', value: 0.5 }, { op: 'mul', field: 'coefficient', value: -0.1 }] }] },
    { id: 'm.censer_strike.sundering', branch: 'basic', type: 'modifier', parent: 'e.censer_strike', group: 'censer_strike',
      effects: [{ kind: 'skillMod', skill: L('censer_strike'), mods: [{ op: 'addApply', apply: { status: 'vulnerable', duration: 3 } }] }] },
    skillNode('holy_light', 'basic'),
    { id: 'e.holy_light', branch: 'basic', type: 'enhancement', parent: 'n.holy_light',
      effects: [{ kind: 'skillMod', skill: L('holy_light'), mods: [{ op: 'add', field: 'resourceGain', value: 2 }] }] },
    { id: 'm.holy_light.twin_motes', branch: 'basic', type: 'modifier', parent: 'e.holy_light', group: 'holy_light',
      effects: [{ kind: 'skillMod', skill: L('holy_light'), mods: [{ op: 'set', field: 'count', value: 2 }, { op: 'set', field: 'spreadDeg', value: 14 }, { op: 'mul', field: 'coefficient', value: -0.3 }] }] },
    { id: 'm.holy_light.radiant_mote', branch: 'basic', type: 'modifier', parent: 'e.holy_light', group: 'holy_light',
      effects: [{ kind: 'skillMod', skill: L('holy_light'), mods: [{ op: 'set', field: 'explodeRadius', value: 1.8 }, { op: 'mul', field: 'coefficient', value: -0.15 }] }] },
    { id: 'p.fervor', branch: 'basic', type: 'passive', effects: [{ kind: 'stat', stat: 'damage', value: 0.04 }] },
    { id: 'p.vigil', branch: 'basic', type: 'passive', effects: [{ kind: 'stat', stat: 'maxLifePct', value: 0.02 }] },

    // ---- Core
    skillNode('heal', 'core'),
    { id: 'e.heal', branch: 'core', type: 'enhancement', parent: 'n.heal',
      effects: [{ kind: 'skillMod', skill: L('heal'), mods: [{ op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'm.heal.mending', branch: 'core', type: 'modifier', parent: 'e.heal', group: 'heal',
      effects: [{ kind: 'skillMod', skill: L('heal'), mods: [{ op: 'add', field: 'heal', value: 0.08 }] }] },
    { id: 'm.heal.smiting', branch: 'core', type: 'modifier', parent: 'e.heal', group: 'heal',
      effects: [{ kind: 'skillMod', skill: L('heal'), mods: [{ op: 'mul', field: 'coefficient', value: 0.6 }, { op: 'add', field: 'resourceCost', value: -5 }] }] },
    skillNode('magnus_exorcismus', 'core'),
    { id: 'e.magnus_exorcismus', branch: 'core', type: 'enhancement', parent: 'n.magnus_exorcismus',
      effects: [{ kind: 'skillMod', skill: L('magnus_exorcismus'), mods: [{ op: 'mul', field: 'radius', value: 0.2 }] }] },
    { id: 'm.magnus_exorcismus.unending', branch: 'core', type: 'modifier', parent: 'e.magnus_exorcismus', group: 'magnus_exorcismus',
      effects: [{ kind: 'skillMod', skill: L('magnus_exorcismus'), mods: [{ op: 'mul', field: 'duration', value: 0.5 }] }] },
    { id: 'm.magnus_exorcismus.rapid', branch: 'core', type: 'modifier', parent: 'e.magnus_exorcismus', group: 'magnus_exorcismus',
      effects: [{ kind: 'skillMod', skill: L('magnus_exorcismus'), mods: [{ op: 'mul', field: 'interval', value: -0.2 }] }] },
    { id: 'p.piety', branch: 'core', type: 'passive', effects: [{ kind: 'stat', stat: 'resourceGen', value: 0.03 }] },
    { id: 'p.sacred_flame', branch: 'core', type: 'passive', effects: [{ kind: 'damage', value: 0.05, when: 'ranged' }] },

    // ---- Defensive
    skillNode('kyrie_eleison', 'defensive'),
    { id: 'e.kyrie_eleison', branch: 'defensive', type: 'enhancement', parent: 'n.kyrie_eleison',
      effects: [{ kind: 'skillMod', skill: L('kyrie_eleison'), mods: [{ op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'm.kyrie_eleison.radiant_ward', branch: 'defensive', type: 'modifier', parent: 'e.kyrie_eleison', group: 'kyrie_eleison',
      effects: [{ kind: 'skillMod', skill: L('kyrie_eleison'), mods: [{ op: 'mul', field: 'barrier', value: 0.4 }] }] },
    { id: 'm.kyrie_eleison.sanctified', branch: 'defensive', type: 'modifier', parent: 'e.kyrie_eleison', group: 'kyrie_eleison',
      effects: [{ kind: 'skillMod', skill: L('kyrie_eleison'), mods: [{ op: 'addApply', apply: { status: 'blessed', duration: 5 } }] }] },
    skillNode('sanctuary', 'defensive'),
    { id: 'e.sanctuary', branch: 'defensive', type: 'enhancement', parent: 'n.sanctuary',
      effects: [{ kind: 'skillMod', skill: L('sanctuary'), mods: [{ op: 'mul', field: 'duration', value: 0.3 }] }] },
    { id: 'm.sanctuary.hallowed', branch: 'defensive', type: 'modifier', parent: 'e.sanctuary', group: 'sanctuary',
      effects: [{ kind: 'skillMod', skill: L('sanctuary'), mods: [{ op: 'mul', field: 'radius', value: 0.4 }] }] },
    { id: 'm.sanctuary.tireless', branch: 'defensive', type: 'modifier', parent: 'e.sanctuary', group: 'sanctuary',
      effects: [{ kind: 'skillMod', skill: L('sanctuary'), mods: [{ op: 'mul', field: 'interval', value: -0.3 }] }] },
    { id: 'p.warding_light', branch: 'defensive', type: 'passive', effects: [{ kind: 'stat', stat: 'barrierBonus', value: 0.08 }] },
    { id: 'p.consecrated_mail', branch: 'defensive', type: 'passive', effects: [{ kind: 'stat', stat: 'armorPct', value: 0.04 }] },

    // ---- Tactical
    skillNode('blessing', 'tactical'),
    { id: 'e.blessing', branch: 'tactical', type: 'enhancement', parent: 'n.blessing',
      effects: [{ kind: 'skillMod', skill: L('blessing'), mods: [{ op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'm.blessing.far_reaching', branch: 'tactical', type: 'modifier', parent: 'e.blessing', group: 'blessing',
      effects: [{ kind: 'skillMod', skill: L('blessing'), mods: [{ op: 'mul', field: 'radius', value: 0.4 }, { op: 'add', field: 'resourceGain', value: 10 }] }] },
    { id: 'm.blessing.warding', branch: 'tactical', type: 'modifier', parent: 'e.blessing', group: 'blessing',
      effects: [{ kind: 'skillMod', skill: L('blessing'), mods: [{ op: 'addApply', apply: { status: 'barrier', duration: 5, lifeFraction: 0.1 } }] }] },
    skillNode('lex_aeterna', 'tactical'),
    { id: 'e.lex_aeterna', branch: 'tactical', type: 'enhancement', parent: 'n.lex_aeterna',
      effects: [{ kind: 'skillMod', skill: L('lex_aeterna'), mods: [{ op: 'mul', field: 'radius', value: 0.25 }] }] },
    { id: 'm.lex_aeterna.judgment', branch: 'tactical', type: 'modifier', parent: 'e.lex_aeterna', group: 'lex_aeterna',
      effects: [{ kind: 'skillMod', skill: L('lex_aeterna'), mods: [{ op: 'add', field: 'radius', value: 1.5 }, { op: 'addApply', apply: { status: 'lexAeterna', duration: 10 } }] }] },
    { id: 'm.lex_aeterna.swift', branch: 'tactical', type: 'modifier', parent: 'e.lex_aeterna', group: 'lex_aeterna',
      effects: [{ kind: 'skillMod', skill: L('lex_aeterna'), mods: [{ op: 'mul', field: 'cooldown', value: -0.4 }] }] },
    { id: 'p.hymnal', branch: 'tactical', type: 'passive', effects: [{ kind: 'stat', stat: 'cooldownReduction', value: 0.03 }] },
    { id: 'p.discernment', branch: 'tactical', type: 'passive', effects: [{ kind: 'stat', stat: 'damageVsElite', value: 0.06 }] },

    // ---- Mastery
    skillNode('guardian_light', 'mastery'),
    { id: 'e.guardian_light', branch: 'mastery', type: 'enhancement', parent: 'n.guardian_light',
      effects: [{ kind: 'skillMod', skill: L('guardian_light'), mods: [{ op: 'mul', field: 'duration', value: 0.4 }] }] },
    { id: 'm.guardian_light.bulwark', branch: 'mastery', type: 'modifier', parent: 'e.guardian_light', group: 'guardian_light',
      effects: [{ kind: 'skillMod', skill: L('guardian_light'), mods: [{ op: 'mul', field: 'lifeFraction', value: 0.75 }] }] },
    { id: 'm.guardian_light.vigilant', branch: 'mastery', type: 'modifier', parent: 'e.guardian_light', group: 'guardian_light',
      effects: [{ kind: 'skillMod', skill: L('guardian_light'), mods: [{ op: 'mul', field: 'attackCooldown', value: -0.35 }] }] },
    { id: 'p.martyrdom', branch: 'mastery', type: 'passive', effects: [{ kind: 'stat', stat: 'damageReduction', value: 0.02 }] },
    { id: 'p.sacred_oath', branch: 'mastery', type: 'passive', effects: [{ kind: 'damage', value: 0.04, when: 'corrupted' }] },

    // ---- Ultimate
    skillNode('benediction', 'ultimate'),
    { id: 'e.benediction', branch: 'ultimate', type: 'enhancement', parent: 'n.benediction',
      effects: [{ kind: 'skillMod', skill: L('benediction'), mods: [{ op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'm.benediction.miracle', branch: 'ultimate', type: 'modifier', parent: 'e.benediction', group: 'benediction',
      effects: [{ kind: 'skillMod', skill: L('benediction'), mods: [{ op: 'add', field: 'heal', value: 0.2 }, { op: 'mul', field: 'radius', value: 0.25 }] }] },
    { id: 'm.benediction.afterglow', branch: 'ultimate', type: 'modifier', parent: 'e.benediction', group: 'benediction',
      effects: [{ kind: 'skillMod', skill: L('benediction'), mods: [{ op: 'addApply', apply: { status: 'blessed', duration: 10 } }, { op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'p.radiance', branch: 'ultimate', type: 'passive', effects: [{ kind: 'stat', stat: 'damage', value: 0.04 }] },

    // ---- Key passives (choose one): healer, exorcist, shepherd
    { id: 'k.devout', branch: 'key', type: 'keyPassive',
      effects: [
        { kind: 'skillMod', skill: L('heal'), mods: [{ op: 'mul', field: 'heal', value: 0.35 }] },
        { kind: 'skillMod', skill: L('kyrie_eleison'), mods: [{ op: 'mul', field: 'barrier', value: 0.35 }] },
        { kind: 'skillMod', skill: L('sanctuary'), mods: [{ op: 'mul', field: 'heal', value: 0.35 }] },
      ] },
    { id: 'k.zealot', branch: 'key', type: 'keyPassive',
      effects: [
        { kind: 'damage', value: 0.15, multiplicative: true, when: 'ranged' },
        { kind: 'damage', value: 0.15, multiplicative: true, when: 'corrupted' },
        { kind: 'skillMod', skill: L('magnus_exorcismus'), mods: [{ op: 'mul', field: 'interval', value: -0.2 }] },
        { kind: 'skillMod', skill: L('lex_aeterna'), mods: [{ op: 'mul', field: 'cooldown', value: -0.25 }] },
      ] },
    { id: 'k.shepherd', branch: 'key', type: 'keyPassive',
      effects: [
        { kind: 'skillMod', skill: L('guardian_light'), mods: [{ op: 'add', field: 'maxGuardians', value: 1 }, { op: 'mul', field: 'lifeFraction', value: 0.4 }, { op: 'mul', field: 'duration', value: 0.25 }, { op: 'mul', field: 'attackCooldown', value: -0.15 }] },
        { kind: 'skillMod', skill: L('blessing'), mods: [{ op: 'mul', field: 'radius', value: 0.2 }] },
        { kind: 'stat', stat: 'damageReduction', value: 0.05 },
      ] },
  ],
};
