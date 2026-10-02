/** Spectre skill tree. Names and descriptions live in lang/en.json under tree.<node id>. */
import type { z } from 'zod';
import type { SkillTreeSchema } from './schema';

type Tree = z.input<typeof SkillTreeSchema>;

const skillNode = (id: string, branch: Tree['nodes'][number]['branch']) =>
  ({ id: `n.${id}`, branch, type: 'skill', skill: `spectre.${id}` }) as const;
const S = (id: string) => `spectre.${id}`;

export const SPECTRE_TREE: Tree = {
  classId: 'spectre',
  startingNode: 'n.quick_shot',
  unlockAt: { basic: 0, core: 2, defensive: 5, tactical: 9, mastery: 14, ultimate: 20, key: 28 },
  respecGoldPerLevel: 25,
  nodes: [
    // ---- Basic
    skillNode('quick_shot', 'basic'),
    { id: 'e.quick_shot', branch: 'basic', type: 'enhancement', parent: 'n.quick_shot',
      effects: [{ kind: 'skillMod', skill: S('quick_shot'), mods: [{ op: 'add', field: 'resourceGain', value: 3 }] }] },
    { id: 'm.quick_shot.rapid', branch: 'basic', type: 'modifier', parent: 'e.quick_shot', group: 'quick_shot',
      effects: [{ kind: 'skillMod', skill: S('quick_shot'), mods: [{ op: 'mul', field: 'castTime', value: -0.5 }] }] },
    { id: 'm.quick_shot.ricochet', branch: 'basic', type: 'modifier', parent: 'e.quick_shot', group: 'quick_shot',
      effects: [{ kind: 'skillMod', skill: S('quick_shot'), mods: [{ op: 'add', field: 'pierce', value: 2 }] }] },
    skillNode('vibro_slash', 'basic'),
    { id: 'e.vibro_slash', branch: 'basic', type: 'enhancement', parent: 'n.vibro_slash',
      effects: [{ kind: 'skillMod', skill: S('vibro_slash'), mods: [{ op: 'mul', field: 'arcDeg', value: 0.3 }] }] },
    { id: 'm.vibro_slash.venom', branch: 'basic', type: 'modifier', parent: 'e.vibro_slash', group: 'vibro_slash',
      effects: [{ kind: 'skillMod', skill: S('vibro_slash'), mods: [{ op: 'addApply', apply: { status: 'poisoned', duration: 3, coefficient: 0.5 } }] }] },
    { id: 'm.vibro_slash.flurry', branch: 'basic', type: 'modifier', parent: 'e.vibro_slash', group: 'vibro_slash',
      effects: [{ kind: 'skillMod', skill: S('vibro_slash'), mods: [{ op: 'mul', field: 'castTime', value: -0.3 }, { op: 'damage', value: 0.2, when: 'vulnerable' }] }] },
    { id: 'p.steady_aim', branch: 'basic', type: 'passive', effects: [{ kind: 'stat', stat: 'critChance', value: 0.02 }] },
    { id: 'p.marksmanship', branch: 'basic', type: 'passive', effects: [{ kind: 'stat', stat: 'damage', value: 0.04 }] },

    // ---- Core
    skillNode('piercing_shot', 'core'),
    { id: 'e.piercing_shot', branch: 'core', type: 'enhancement', parent: 'n.piercing_shot',
      effects: [{ kind: 'skillMod', skill: S('piercing_shot'), mods: [{ op: 'add', field: 'resourceCost', value: -5 }] }] },
    { id: 'm.piercing_shot.deadshot', branch: 'core', type: 'modifier', parent: 'e.piercing_shot', group: 'piercing_shot',
      effects: [{ kind: 'skillMod', skill: S('piercing_shot'), mods: [{ op: 'damage', value: 0.5, when: 'elite' }, { op: 'damage', value: 0.25, when: 'marked' }] }] },
    { id: 'm.piercing_shot.explosive', branch: 'core', type: 'modifier', parent: 'e.piercing_shot', group: 'piercing_shot',
      effects: [{ kind: 'skillMod', skill: S('piercing_shot'), mods: [{ op: 'set', field: 'explodeRadius', value: 2.4 }, { op: 'set', field: 'pierce', value: 0 }, { op: 'mul', field: 'coefficient', value: 0.1 }] }] },
    skillNode('pistol_barrage', 'core'),
    { id: 'e.pistol_barrage', branch: 'core', type: 'enhancement', parent: 'n.pistol_barrage',
      effects: [{ kind: 'skillMod', skill: S('pistol_barrage'), mods: [{ op: 'add', field: 'count', value: 2 }] }] },
    { id: 'm.pistol_barrage.focused', branch: 'core', type: 'modifier', parent: 'e.pistol_barrage', group: 'pistol_barrage',
      effects: [{ kind: 'skillMod', skill: S('pistol_barrage'), mods: [{ op: 'mul', field: 'spreadDeg', value: -0.6 }, { op: 'mul', field: 'maxRange', value: 0.4 }] }] },
    { id: 'm.pistol_barrage.incendiary', branch: 'core', type: 'modifier', parent: 'e.pistol_barrage', group: 'pistol_barrage',
      effects: [{ kind: 'skillMod', skill: S('pistol_barrage'), mods: [{ op: 'addApply', apply: { status: 'burning', duration: 2, coefficient: 0.3 } }] }] },
    { id: 'p.precision', branch: 'core', type: 'passive', effects: [{ kind: 'stat', stat: 'critDamage', value: 0.1 }] },
    { id: 'p.exploit_weakness', branch: 'core', type: 'passive', effects: [{ kind: 'stat', stat: 'damageVsVulnerable', value: 0.06 }] },

    // ---- Defensive
    skillNode('holo_decoy', 'defensive'),
    { id: 'e.holo_decoy', branch: 'defensive', type: 'enhancement', parent: 'n.holo_decoy',
      effects: [{ kind: 'skillMod', skill: S('holo_decoy'), mods: [{ op: 'add', field: 'duration', value: 2 }] }] },
    { id: 'm.holo_decoy.volatile', branch: 'defensive', type: 'modifier', parent: 'e.holo_decoy', group: 'holo_decoy',
      effects: [{ kind: 'skillMod', skill: S('holo_decoy'), mods: [{ op: 'set', field: 'burstCoefficient', value: 3 }] }] },
    { id: 'm.holo_decoy.hardlight', branch: 'defensive', type: 'modifier', parent: 'e.holo_decoy', group: 'holo_decoy',
      effects: [{ kind: 'skillMod', skill: S('holo_decoy'), mods: [{ op: 'mul', field: 'lifeFraction', value: 1 }, { op: 'mul', field: 'tauntRadius', value: 0.5 }] }] },
    skillNode('smoke_cloak', 'defensive'),
    { id: 'e.smoke_cloak', branch: 'defensive', type: 'enhancement', parent: 'n.smoke_cloak',
      effects: [{ kind: 'skillMod', skill: S('smoke_cloak'), mods: [{ op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'm.smoke_cloak.ambush', branch: 'defensive', type: 'modifier', parent: 'e.smoke_cloak', group: 'smoke_cloak',
      effects: [{ kind: 'damage', value: 0.6, multiplicative: true, when: 'stealthed' }] },
    { id: 'm.smoke_cloak.regroup', branch: 'defensive', type: 'modifier', parent: 'e.smoke_cloak', group: 'smoke_cloak',
      effects: [{ kind: 'skillMod', skill: S('smoke_cloak'), mods: [{ op: 'add', field: 'heal', value: 0.15 }] }] },
    { id: 'p.kevlar_weave', branch: 'defensive', type: 'passive', effects: [{ kind: 'stat', stat: 'armor', value: 15 }] },
    { id: 'p.survival_instinct', branch: 'defensive', type: 'passive', effects: [{ kind: 'stat', stat: 'maxLife', value: 12 }] },

    // ---- Tactical
    skillNode('phase_shift', 'tactical'),
    { id: 'e.phase_shift', branch: 'tactical', type: 'enhancement', parent: 'n.phase_shift',
      effects: [{ kind: 'skillMod', skill: S('phase_shift'), mods: [{ op: 'mul', field: 'maxRange', value: 0.3 }] }] },
    { id: 'm.phase_shift.slipstream', branch: 'tactical', type: 'modifier', parent: 'e.phase_shift', group: 'phase_shift',
      effects: [{ kind: 'skillMod', skill: S('phase_shift'), mods: [{ op: 'mul', field: 'cooldown', value: -0.35 }] }] },
    { id: 'm.phase_shift.vanish', branch: 'tactical', type: 'modifier', parent: 'e.phase_shift', group: 'phase_shift',
      effects: [{ kind: 'skillMod', skill: S('phase_shift'), mods: [{ op: 'addApply', apply: { status: 'stealth', duration: 1.5 } }] }] },
    skillNode('minefield', 'tactical'),
    { id: 'e.minefield', branch: 'tactical', type: 'enhancement', parent: 'n.minefield',
      effects: [{ kind: 'skillMod', skill: S('minefield'), mods: [{ op: 'add', field: 'count', value: 1 }] }] },
    { id: 'm.minefield.cluster', branch: 'tactical', type: 'modifier', parent: 'e.minefield', group: 'minefield',
      effects: [{ kind: 'skillMod', skill: S('minefield'), mods: [{ op: 'mul', field: 'radius', value: 0.4 }] }] },
    { id: 'm.minefield.shrapnel', branch: 'tactical', type: 'modifier', parent: 'e.minefield', group: 'minefield',
      effects: [{ kind: 'skillMod', skill: S('minefield'), mods: [{ op: 'addApply', apply: { status: 'vulnerable', duration: 4 } }] }] },
    { id: 'p.quick_hands', branch: 'tactical', type: 'passive', effects: [{ kind: 'stat', stat: 'cooldownReduction', value: 0.03 }] },
    { id: 'p.light_step', branch: 'tactical', type: 'passive', effects: [{ kind: 'stat', stat: 'moveSpeed', value: 0.03 }] },

    // ---- Mastery
    skillNode('cluster_grenade', 'mastery'),
    { id: 'e.cluster_grenade', branch: 'mastery', type: 'enhancement', parent: 'n.cluster_grenade',
      effects: [{ kind: 'skillMod', skill: S('cluster_grenade'), mods: [{ op: 'mul', field: 'radius', value: 0.2 }] }] },
    { id: 'm.cluster_grenade.napalm', branch: 'mastery', type: 'modifier', parent: 'e.cluster_grenade', group: 'cluster_grenade',
      effects: [{ kind: 'skillMod', skill: S('cluster_grenade'), mods: [{ op: 'hazard', radius: 3, duration: 4, status: 'burning', dpsCoefficient: 0.4 }] }] },
    { id: 'm.cluster_grenade.concussion', branch: 'mastery', type: 'modifier', parent: 'e.cluster_grenade', group: 'cluster_grenade',
      effects: [{ kind: 'skillMod', skill: S('cluster_grenade'), mods: [{ op: 'addApply', apply: { status: 'stunned', duration: 1.2 } }] }] },
    { id: 'p.overwatch', branch: 'mastery', type: 'passive', effects: [{ kind: 'stat', stat: 'damageVsElite', value: 0.08 }] },
    { id: 'p.adrenaline', branch: 'mastery', type: 'passive', effects: [{ kind: 'stat', stat: 'resourceGen', value: 0.05 }] },

    // ---- Ultimate
    skillNode('death_mark', 'ultimate'),
    { id: 'e.death_mark', branch: 'ultimate', type: 'enhancement', parent: 'n.death_mark',
      effects: [{ kind: 'skillMod', skill: S('death_mark'), mods: [{ op: 'mul', field: 'cooldown', value: -0.2 }] }] },
    { id: 'm.death_mark.wide_net', branch: 'ultimate', type: 'modifier', parent: 'e.death_mark', group: 'death_mark',
      effects: [{ kind: 'skillMod', skill: S('death_mark'), mods: [{ op: 'mul', field: 'radius', value: 0.5 }] }] },
    { id: 'm.death_mark.kill_order', branch: 'ultimate', type: 'modifier', parent: 'e.death_mark', group: 'death_mark',
      effects: [{ kind: 'skillMod', skill: S('death_mark'), mods: [{ op: 'mul', field: 'coefficient', value: 2 }] }, { kind: 'damage', value: 0.1, multiplicative: true, when: 'marked' }] },
    { id: 'p.hunters_focus', branch: 'ultimate', type: 'passive', effects: [{ kind: 'stat', stat: 'critChance', value: 0.02 }] },

    // ---- Key passives (choose one)
    { id: 'k.deadeye', branch: 'key', type: 'keyPassive',
      effects: [{ kind: 'stat', stat: 'critChance', value: 0.1 }, { kind: 'damage', value: 0.2, multiplicative: true, when: 'ranged' }] },
    { id: 'k.saboteur', branch: 'key', type: 'keyPassive',
      effects: [
        { kind: 'skillMod', skill: S('minefield'), mods: [{ op: 'damage', value: 0.4, multiplicative: true }] },
        { kind: 'skillMod', skill: S('cluster_grenade'), mods: [{ op: 'damage', value: 0.4, multiplicative: true }] },
        { kind: 'stat', stat: 'cooldownReduction', value: 0.1 },
      ] },
    { id: 'k.ghost', branch: 'key', type: 'keyPassive',
      effects: [{ kind: 'damage', value: 0.35, multiplicative: true, when: 'evasive' }, { kind: 'stat', stat: 'moveSpeed', value: 0.08 }] },
  ],
};
