/** Xenomant skill tree. Names and descriptions live in lang/en.json under tree.<node id>. */
import type { z } from 'zod';
import type { SkillTreeSchema } from './schema';

type Tree = z.input<typeof SkillTreeSchema>;

const skillNode = (id: string, branch: Tree['nodes'][number]['branch']) =>
  ({ id: `n.${id}`, branch, type: 'skill', skill: `xenomant.${id}` }) as const;
const X = (id: string) => `xenomant.${id}`;

export const XENOMANT_TREE: Tree = {
  classId: 'xenomant',
  startingNode: 'n.spore_dart',
  unlockAt: { basic: 0, core: 2, defensive: 5, tactical: 9, mastery: 14, ultimate: 20, key: 28 },
  respecGoldPerLevel: 25,
  nodes: [
    // ---- Basic
    skillNode('spore_dart', 'basic'),
    { id: 'e.spore_dart', branch: 'basic', type: 'enhancement', parent: 'n.spore_dart',
      effects: [{ kind: 'skillMod', skill: X('spore_dart'), mods: [{ op: 'add', field: 'resourceGain', value: 2 }] }] },
    { id: 'm.spore_dart.virulent', branch: 'basic', type: 'modifier', parent: 'e.spore_dart', group: 'spore_dart',
      effects: [{ kind: 'skillMod', skill: X('spore_dart'), mods: [{ op: 'addApply', apply: { status: 'poisoned', duration: 3, coefficient: 0.3 } }] }] },
    { id: 'm.spore_dart.splitting', branch: 'basic', type: 'modifier', parent: 'e.spore_dart', group: 'spore_dart',
      effects: [{ kind: 'skillMod', skill: X('spore_dart'), mods: [{ op: 'set', field: 'count', value: 3 }, { op: 'set', field: 'spreadDeg', value: 30 }, { op: 'mul', field: 'coefficient', value: -0.35 }] }] },
    skillNode('scalpel_slash', 'basic'),
    { id: 'e.scalpel_slash', branch: 'basic', type: 'enhancement', parent: 'n.scalpel_slash',
      effects: [{ kind: 'skillMod', skill: X('scalpel_slash'), mods: [{ op: 'add', field: 'lifeSteal', value: 0.04 }] }] },
    { id: 'm.scalpel_slash.butcher', branch: 'basic', type: 'modifier', parent: 'e.scalpel_slash', group: 'scalpel_slash',
      effects: [{ kind: 'skillMod', skill: X('scalpel_slash'), mods: [{ op: 'damage', value: 0.4, when: 'poisoned' }] }] },
    { id: 'm.scalpel_slash.harvester', branch: 'basic', type: 'modifier', parent: 'e.scalpel_slash', group: 'scalpel_slash',
      effects: [{ kind: 'skillMod', skill: X('scalpel_slash'), mods: [{ op: 'add', field: 'resourceGain', value: 4 }] }] },
    { id: 'p.lumen_affinity', branch: 'basic', type: 'passive', effects: [{ kind: 'stat', stat: 'damage', value: 0.04 }] },
    { id: 'p.cell_division', branch: 'basic', type: 'passive', effects: [{ kind: 'stat', stat: 'maxLife', value: 12 }] },

    // ---- Core
    skillNode('spore_burst', 'core'),
    { id: 'e.spore_burst', branch: 'core', type: 'enhancement', parent: 'n.spore_burst',
      effects: [{ kind: 'skillMod', skill: X('spore_burst'), mods: [{ op: 'mul', field: 'radius', value: 0.2 }] }] },
    { id: 'm.spore_burst.lingering', branch: 'core', type: 'modifier', parent: 'e.spore_burst', group: 'spore_burst',
      effects: [{ kind: 'skillMod', skill: X('spore_burst'), mods: [{ op: 'mul', field: 'duration', value: 0.6 }] }] },
    { id: 'm.spore_burst.caustic', branch: 'core', type: 'modifier', parent: 'e.spore_burst', group: 'spore_burst',
      effects: [{ kind: 'skillMod', skill: X('spore_burst'), mods: [{ op: 'mul', field: 'dpsCoefficient', value: 0.3 }, { op: 'addApply', apply: { status: 'vulnerable', duration: 3 } }] }] },
    skillNode('parasite_link', 'core'),
    { id: 'e.parasite_link', branch: 'core', type: 'enhancement', parent: 'n.parasite_link',
      effects: [{ kind: 'skillMod', skill: X('parasite_link'), mods: [{ op: 'add', field: 'resourceCost', value: -5 }] }] },
    { id: 'm.parasite_link.hydra', branch: 'core', type: 'modifier', parent: 'e.parasite_link', group: 'parasite_link',
      effects: [{ kind: 'skillMod', skill: X('parasite_link'), mods: [{ op: 'add', field: 'count', value: 2 }] }] },
    { id: 'm.parasite_link.leech', branch: 'core', type: 'modifier', parent: 'e.parasite_link', group: 'parasite_link',
      effects: [{ kind: 'skillMod', skill: X('parasite_link'), mods: [{ op: 'add', field: 'lifeSteal', value: 0.25 }] }] },
    { id: 'p.toxicology', branch: 'core', type: 'passive', effects: [{ kind: 'damage', value: 0.06, when: 'poisoned' }] },
    { id: 'p.symbiosis', branch: 'core', type: 'passive', effects: [{ kind: 'stat', stat: 'resourceGen', value: 0.05 }] },

    // ---- Defensive
    skillNode('chitin_armor', 'defensive'),
    { id: 'e.chitin_armor', branch: 'defensive', type: 'enhancement', parent: 'n.chitin_armor',
      effects: [{ kind: 'skillMod', skill: X('chitin_armor'), mods: [{ op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'm.chitin_armor.carapace', branch: 'defensive', type: 'modifier', parent: 'e.chitin_armor', group: 'chitin_armor',
      effects: [{ kind: 'skillMod', skill: X('chitin_armor'), mods: [{ op: 'addApply', apply: { status: 'barrier', duration: 4, lifeFraction: 0.15 } }] }] },
    { id: 'm.chitin_armor.regenerative', branch: 'defensive', type: 'modifier', parent: 'e.chitin_armor', group: 'chitin_armor',
      effects: [{ kind: 'skillMod', skill: X('chitin_armor'), mods: [{ op: 'add', field: 'heal', value: 0.15 }] }] },
    skillNode('spore_cocoon', 'defensive'),
    { id: 'e.spore_cocoon', branch: 'defensive', type: 'enhancement', parent: 'n.spore_cocoon',
      effects: [{ kind: 'skillMod', skill: X('spore_cocoon'), mods: [{ op: 'mul', field: 'barrier', value: 0.2 }] }] },
    { id: 'm.spore_cocoon.nourishing', branch: 'defensive', type: 'modifier', parent: 'e.spore_cocoon', group: 'spore_cocoon',
      effects: [{ kind: 'skillMod', skill: X('spore_cocoon'), mods: [{ op: 'add', field: 'heal', value: 0.1 }] }] },
    { id: 'm.spore_cocoon.spore_shell', branch: 'defensive', type: 'modifier', parent: 'e.spore_cocoon', group: 'spore_cocoon',
      effects: [{ kind: 'skillMod', skill: X('spore_cocoon'), mods: [{ op: 'hazard', radius: 3, duration: 4, status: 'poisoned', dpsCoefficient: 0.5 }] }] },
    { id: 'p.thick_hide', branch: 'defensive', type: 'passive', effects: [{ kind: 'stat', stat: 'armor', value: 15 }] },
    { id: 'p.vital_spores', branch: 'defensive', type: 'passive', effects: [{ kind: 'stat', stat: 'potionHealing', value: 0.1 }] },

    // ---- Tactical
    skillNode('raise_corpse', 'tactical'),
    { id: 'e.raise_corpse', branch: 'tactical', type: 'enhancement', parent: 'n.raise_corpse',
      effects: [{ kind: 'skillMod', skill: X('raise_corpse'), mods: [{ op: 'add', field: 'maxMinions', value: 1 }] }] },
    { id: 'm.raise_corpse.horde', branch: 'tactical', type: 'modifier', parent: 'e.raise_corpse', group: 'raise_corpse',
      effects: [{ kind: 'skillMod', skill: X('raise_corpse'), mods: [{ op: 'add', field: 'maxMinions', value: 2 }, { op: 'add', field: 'count', value: 1 }] }] },
    { id: 'm.raise_corpse.ravenous', branch: 'tactical', type: 'modifier', parent: 'e.raise_corpse', group: 'raise_corpse',
      effects: [{ kind: 'skillMod', skill: X('raise_corpse'), mods: [{ op: 'mul', field: 'coefficient', value: 0.4 }, { op: 'mul', field: 'lifeFraction', value: 0.4 }] }] },
    skillNode('grasping_tendrils', 'tactical'),
    { id: 'e.grasping_tendrils', branch: 'tactical', type: 'enhancement', parent: 'n.grasping_tendrils',
      effects: [{ kind: 'skillMod', skill: X('grasping_tendrils'), mods: [{ op: 'mul', field: 'radius', value: 0.2 }] }] },
    { id: 'm.grasping_tendrils.strangling', branch: 'tactical', type: 'modifier', parent: 'e.grasping_tendrils', group: 'grasping_tendrils',
      effects: [{ kind: 'skillMod', skill: X('grasping_tendrils'), mods: [{ op: 'mul', field: 'coefficient', value: 1.5 }] }] },
    { id: 'm.grasping_tendrils.withering', branch: 'tactical', type: 'modifier', parent: 'e.grasping_tendrils', group: 'grasping_tendrils',
      effects: [{ kind: 'skillMod', skill: X('grasping_tendrils'), mods: [{ op: 'addApply', apply: { status: 'vulnerable', duration: 4 } }] }] },
    { id: 'p.hive_link', branch: 'tactical', type: 'passive', effects: [{ kind: 'damage', value: 0.05, when: 'minion' }] },
    { id: 'p.rapid_mutation', branch: 'tactical', type: 'passive', effects: [{ kind: 'stat', stat: 'cooldownReduction', value: 0.03 }] },

    // ---- Mastery
    skillNode('corpse_explosion', 'mastery'),
    { id: 'e.corpse_explosion', branch: 'mastery', type: 'enhancement', parent: 'n.corpse_explosion',
      effects: [{ kind: 'skillMod', skill: X('corpse_explosion'), mods: [{ op: 'mul', field: 'radius', value: 0.2 }] }] },
    { id: 'm.corpse_explosion.chain', branch: 'mastery', type: 'modifier', parent: 'e.corpse_explosion', group: 'corpse_explosion',
      effects: [{ kind: 'skillMod', skill: X('corpse_explosion'), mods: [{ op: 'add', field: 'count', value: 2 }] }] },
    { id: 'm.corpse_explosion.plague_bomb', branch: 'mastery', type: 'modifier', parent: 'e.corpse_explosion', group: 'corpse_explosion',
      effects: [{ kind: 'skillMod', skill: X('corpse_explosion'), mods: [{ op: 'hazard', radius: 3, duration: 4, status: 'poisoned', dpsCoefficient: 0.5 }] }] },
    { id: 'p.necrotic_mastery', branch: 'mastery', type: 'passive', effects: [{ kind: 'stat', stat: 'damageVsElite', value: 0.08 }] },
    { id: 'p.adaptive_tissue', branch: 'mastery', type: 'passive', effects: [{ kind: 'stat', stat: 'damageReduction', value: 0.02 }] },

    // ---- Ultimate
    skillNode('wrath_of_lumen', 'ultimate'),
    { id: 'e.wrath_of_lumen', branch: 'ultimate', type: 'enhancement', parent: 'n.wrath_of_lumen',
      effects: [{ kind: 'skillMod', skill: X('wrath_of_lumen'), mods: [{ op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'm.wrath_of_lumen.colossus', branch: 'ultimate', type: 'modifier', parent: 'e.wrath_of_lumen', group: 'wrath_of_lumen',
      effects: [{ kind: 'skillMod', skill: X('wrath_of_lumen'), mods: [{ op: 'mul', field: 'lifeFraction', value: 1 }, { op: 'mul', field: 'tauntRadius', value: 0.5 }] }] },
    { id: 'm.wrath_of_lumen.frenzy', branch: 'ultimate', type: 'modifier', parent: 'e.wrath_of_lumen', group: 'wrath_of_lumen',
      effects: [{ kind: 'skillMod', skill: X('wrath_of_lumen'), mods: [{ op: 'mul', field: 'interval', value: -0.35 }] }] },
    { id: 'p.overgrowth', branch: 'ultimate', type: 'passive', effects: [{ kind: 'stat', stat: 'damage', value: 0.04 }] },

    // ---- Key passives (choose one)
    { id: 'k.hive_mind', branch: 'key', type: 'keyPassive',
      effects: [
        { kind: 'damage', value: 0.4, multiplicative: true, when: 'minion' },
        { kind: 'skillMod', skill: X('raise_corpse'), mods: [{ op: 'add', field: 'maxMinions', value: 2 }] },
      ] },
    { id: 'k.pandemic', branch: 'key', type: 'keyPassive',
      effects: [
        { kind: 'damage', value: 0.3, multiplicative: true, when: 'poisoned' },
        { kind: 'skillMod', skill: X('spore_burst'), mods: [{ op: 'mul', field: 'duration', value: 0.5 }] },
      ] },
    { id: 'k.symbiote', branch: 'key', type: 'keyPassive',
      effects: [
        { kind: 'damage', value: 0.25, multiplicative: true, when: 'melee' },
        { kind: 'skillMod', skill: X('scalpel_slash'), mods: [{ op: 'add', field: 'lifeSteal', value: 0.06 }] },
        { kind: 'stat', stat: 'damageReduction', value: 0.1 },
      ] },
  ],
};
