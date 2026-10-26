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
    classes: ['bastion'],
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
  {
    // Piercing Shot detonates on every enemy it passes through.
    id: 'widowmaker',
    base: 'marksman_rifle',
    rarity: 'unique',
    classes: ['spectre'],
    affixes: [
      { stat: 'critDamage', min: 0.2, max: 0.3, scaling: 'sqrt' },
      { stat: 'dexterity', min: 10, max: 15, scaling: 'linear' },
      { stat: 'damageVsElite', min: 0.15, max: 0.22, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'spectre.piercing_shot',
        mods: [{ op: 'set', field: 'explodeRadius', value: 1.8 }, { op: 'mul', field: 'coefficient', value: -0.3 }],
      },
    ],
  },
  {
    // Quick Shot fires a three-round spread.
    id: 'echo_holsters',
    base: 'twin_pistols',
    rarity: 'unique',
    classes: ['spectre'],
    affixes: [
      { stat: 'attackSpeed', min: 0.08, max: 0.12, scaling: 'none' },
      { stat: 'critChance', min: 0.04, max: 0.06, scaling: 'none' },
      { stat: 'resourceGen', min: 0.08, max: 0.12, scaling: 'none' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'spectre.quick_shot',
        mods: [{ op: 'set', field: 'count', value: 3 }, { op: 'set', field: 'spreadDeg', value: 24 }, { op: 'mul', field: 'coefficient', value: -0.4 }],
      },
    ],
  },
  {
    // Spore Dart bursts into a small poison cloud on impact.
    id: 'mother_of_spores',
    base: 'bio_focus',
    rarity: 'unique',
    classes: ['xenomant'],
    affixes: [
      { stat: 'intelligence', min: 10, max: 15, scaling: 'linear' },
      { stat: 'resourceGen', min: 0.08, max: 0.12, scaling: 'none' },
      { stat: 'resistToxic', min: 0.1, max: 0.15, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'xenomant.spore_dart',
        mods: [
          { op: 'set', field: 'explodeRadius', value: 2 },
          { op: 'hazard', radius: 2, duration: 3, status: 'poisoned', dpsCoefficient: 0.35 },
          { op: 'mul', field: 'coefficient', value: -0.2 },
        ],
      },
    ],
  },
  {
    // A bigger horde: three more minions and one more per cast, each a little frailer.
    id: 'crown_of_the_hive',
    base: 'combat_helm',
    rarity: 'unique',
    classes: ['xenomant'],
    affixes: [
      { stat: 'maxLife', min: 25, max: 35, scaling: 'linear' },
      { stat: 'cooldownReduction', min: 0.06, max: 0.1, scaling: 'none' },
      { stat: 'resistAll', min: 0.05, max: 0.08, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'xenomant.raise_corpse',
        mods: [
          { op: 'add', field: 'maxMinions', value: 3 },
          { op: 'add', field: 'count', value: 1 },
          { op: 'mul', field: 'lifeFraction', value: -0.3 },
        ],
      },
    ],
  },
  {
    // Holy Light bursts on impact and leaves a patch of burning ground.
    id: 'dawnbringer',
    base: 'sun_staff',
    rarity: 'unique',
    classes: ['lightbearer'],
    affixes: [
      { stat: 'intelligence', min: 10, max: 15, scaling: 'linear' },
      { stat: 'resourceGen', min: 0.08, max: 0.12, scaling: 'none' },
      { stat: 'resistEnergy', min: 0.1, max: 0.15, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'lightbearer.holy_light',
        mods: [
          { op: 'set', field: 'explodeRadius', value: 2.2 },
          { op: 'hazard', radius: 2.2, duration: 3, status: 'burning', dpsCoefficient: 0.35 },
          { op: 'mul', field: 'coefficient', value: -0.2 },
        ],
      },
    ],
  },
  {
    // Sanctuary lasts twice as long and covers more ground, but takes twice as long to return (uptime 35 %, was 47 %: D01).
    id: 'halo_of_the_penitent',
    base: 'combat_helm',
    rarity: 'unique',
    classes: ['lightbearer'],
    affixes: [
      { stat: 'maxLife', min: 25, max: 35, scaling: 'linear' },
      { stat: 'intelligence', min: 8, max: 12, scaling: 'linear' },
      { stat: 'barrierBonus', min: 0.08, max: 0.12, scaling: 'none' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'lightbearer.sanctuary',
        mods: [
          { op: 'mul', field: 'duration', value: 1 },
          { op: 'mul', field: 'radius', value: 0.4 },
          { op: 'mul', field: 'cooldown', value: 1 },
        ],
      },
    ],
  },
  // ---- Content pass (C004/C005): gloves, ring and amulet uniques, and a mythic for every class.
  {
    // Death Mark covers a much wider area and returns sooner, but hits softer.
    id: 'reapers_grip',
    base: 'servo_gauntlets',
    rarity: 'unique',
    classes: ['spectre'],
    affixes: [
      { stat: 'critChance', min: 0.03, max: 0.05, scaling: 'none' },
      { stat: 'dexterity', min: 8, max: 12, scaling: 'linear' },
      { stat: 'damageVsVulnerable', min: 0.12, max: 0.18, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'spectre.death_mark',
        mods: [{ op: 'mul', field: 'radius', value: 0.6 }, { op: 'mul', field: 'cooldown', value: -0.4 }, { op: 'mul', field: 'coefficient', value: -0.35 }],
      },
    ],
  },
  {
    // Corpse Explosion leaves a cloud of poison where the corpses burst, but each blast is weaker.
    id: 'signet_of_rot',
    base: 'conduit_ring',
    rarity: 'unique',
    classes: ['xenomant'],
    affixes: [
      { stat: 'intelligence', min: 8, max: 12, scaling: 'linear' },
      { stat: 'resistToxic', min: 0.08, max: 0.12, scaling: 'sqrt' },
      { stat: 'critDamage', min: 0.1, max: 0.16, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'xenomant.corpse_explosion',
        mods: [{ op: 'hazard', radius: 3.2, duration: 4, status: 'poisoned', dpsCoefficient: 0.6 }, { op: 'mul', field: 'coefficient', value: -0.15 }],
      },
    ],
  },
  {
    // Lex Aeterna judges a wider area, comes back sooner and leaves scorching light on the ground.
    id: 'sunwheel_pendant',
    base: 'signal_pendant',
    rarity: 'unique',
    classes: ['lightbearer'],
    affixes: [
      { stat: 'intelligence', min: 8, max: 12, scaling: 'linear' },
      { stat: 'resourceGen', min: 0.06, max: 0.1, scaling: 'none' },
      { stat: 'cooldownReduction', min: 0.04, max: 0.07, scaling: 'none' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'lightbearer.lex_aeterna',
        mods: [
          { op: 'mul', field: 'radius', value: 0.6 },
          { op: 'mul', field: 'cooldown', value: -0.4 },
          { op: 'hazard', radius: 3.5, duration: 4, status: 'burning', dpsCoefficient: 0.4 },
        ],
      },
    ],
  },
  {
    // Heat Vent scorches the ground it erupts on and reaches further, but takes longer to recover.
    id: 'cinder_collar',
    base: 'signal_pendant',
    rarity: 'unique',
    classes: ['bastion'],
    affixes: [
      { stat: 'maxLife', min: 25, max: 35, scaling: 'linear' },
      { stat: 'resistHeat', min: 0.1, max: 0.15, scaling: 'sqrt' },
      { stat: 'damageVsBurning', min: 0.15, max: 0.22, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'bastion.heat_vent',
        mods: [
          { op: 'mul', field: 'radius', value: 0.4 },
          { op: 'mul', field: 'cooldown', value: 0.3 },
          { op: 'hazard', radius: 5.5, duration: 5, status: 'burning', dpsCoefficient: 0.5 },
        ],
      },
    ],
  },
  // ---- Content pass (C004), second wave: one more gloves, ring or amulet unique per class.
  {
    // Magnetic Pull reaches further, returns sooner and hits far harder.
    id: 'lodestone_grips',
    base: 'servo_gauntlets',
    rarity: 'unique',
    classes: ['bastion'],
    affixes: [
      { stat: 'strength', min: 8, max: 12, scaling: 'linear' },
      { stat: 'maxLife', min: 20, max: 30, scaling: 'linear' },
      { stat: 'damageReduction', min: 0.03, max: 0.05, scaling: 'none' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'bastion.magnetic_pull',
        mods: [{ op: 'mul', field: 'radius', value: 0.4 }, { op: 'mul', field: 'cooldown', value: -0.4 }, { op: 'mul', field: 'coefficient', value: 2 }],
      },
    ],
  },
  {
    // Minefield lays five mines with a wider blast, but each is weaker and the field takes longer to rearm.
    id: 'sappers_signet',
    base: 'conduit_ring',
    rarity: 'unique',
    classes: ['spectre'],
    affixes: [
      { stat: 'dexterity', min: 8, max: 12, scaling: 'linear' },
      { stat: 'critChance', min: 0.03, max: 0.05, scaling: 'none' },
      { stat: 'cooldownReduction', min: 0.04, max: 0.07, scaling: 'none' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'spectre.minefield',
        mods: [
          { op: 'add', field: 'count', value: 2 },
          { op: 'mul', field: 'radius', value: 0.3 },
          { op: 'mul', field: 'coefficient', value: -0.2 },
          { op: 'mul', field: 'cooldown', value: 0.3 },
        ],
      },
    ],
  },
  {
    // Raise Corpse raises three at a time and keeps two more of them standing, but each is frailer.
    id: 'gravecallers_grasp',
    base: 'servo_gauntlets',
    rarity: 'unique',
    classes: ['xenomant'],
    affixes: [
      { stat: 'intelligence', min: 8, max: 12, scaling: 'linear' },
      { stat: 'maxLife', min: 20, max: 30, scaling: 'linear' },
      { stat: 'resistToxic', min: 0.08, max: 0.12, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'xenomant.raise_corpse',
        mods: [
          { op: 'add', field: 'count', value: 1 },
          { op: 'add', field: 'maxMinions', value: 2 },
          { op: 'mul', field: 'lifeFraction', value: -0.3 },
        ],
      },
    ],
  },
  {
    // Guardian Light calls a third light and keeps all of them burning longer, but each is frailer.
    id: 'vigil_ring',
    base: 'conduit_ring',
    rarity: 'unique',
    classes: ['lightbearer'],
    affixes: [
      { stat: 'intelligence', min: 8, max: 12, scaling: 'linear' },
      { stat: 'maxLife', min: 20, max: 30, scaling: 'linear' },
      { stat: 'resistEnergy', min: 0.08, max: 0.12, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'lightbearer.guardian_light',
        mods: [
          { op: 'add', field: 'maxGuardians', value: 1 },
          { op: 'mul', field: 'duration', value: 0.4 },
          { op: 'mul', field: 'lifeFraction', value: -0.25 },
        ],
      },
    ],
  },
  {
    // Mythic: Sanctuary almost never goes down, lasts as long as it can and grows; recast it and it moves with you.
    id: 'aureole_of_the_first_dawn',
    base: 'combat_helm',
    rarity: 'mythic',
    classes: ['lightbearer'],
    affixes: [
      { stat: 'maxLife', min: 40, max: 55, scaling: 'linear' },
      { stat: 'intelligence', min: 12, max: 18, scaling: 'linear' },
      { stat: 'barrierBonus', min: 0.1, max: 0.15, scaling: 'sqrt' },
      { stat: 'cooldownReduction', min: 0.06, max: 0.1, scaling: 'none' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'lightbearer.sanctuary',
        mods: [
          { op: 'mul', field: 'duration', value: 1.5 },
          { op: 'mul', field: 'radius', value: 0.6 },
          { op: 'mul', field: 'cooldown', value: -0.75 },
        ],
      },
    ],
  },
  {
    // Mythic: the Widowmaker's blast without its price, from farther away and for less Focus.
    id: 'the_last_word',
    base: 'marksman_rifle',
    rarity: 'mythic',
    classes: ['spectre'],
    affixes: [
      { stat: 'critDamage', min: 0.25, max: 0.35, scaling: 'sqrt' },
      { stat: 'dexterity', min: 12, max: 18, scaling: 'linear' },
      { stat: 'damageVsElite', min: 0.18, max: 0.26, scaling: 'sqrt' },
      { stat: 'critChance', min: 0.04, max: 0.06, scaling: 'none' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'spectre.piercing_shot',
        mods: [
          { op: 'set', field: 'explodeRadius', value: 2.6 },
          { op: 'mul', field: 'coefficient', value: -0.1 },
          { op: 'add', field: 'maxRange', value: 8 },
          { op: 'add', field: 'resourceCost', value: -10 },
        ],
      },
    ],
  },
  {
    // Mythic: the Hive's crown without the frailty: a far bigger horde that dies no easier.
    id: 'diadem_of_the_swarm_queen',
    base: 'combat_helm',
    rarity: 'mythic',
    classes: ['xenomant'],
    affixes: [
      { stat: 'maxLife', min: 40, max: 55, scaling: 'linear' },
      { stat: 'intelligence', min: 12, max: 18, scaling: 'linear' },
      { stat: 'cooldownReduction', min: 0.07, max: 0.11, scaling: 'none' },
      { stat: 'resistAll', min: 0.06, max: 0.09, scaling: 'sqrt' },
    ],
    effects: [
      {
        kind: 'skillMod',
        skill: 'xenomant.raise_corpse',
        mods: [
          { op: 'add', field: 'maxMinions', value: 6 },
          { op: 'add', field: 'count', value: 2 },
          { op: 'mul', field: 'lifeFraction', value: 0.2 },
        ],
      },
    ],
  },
  {
    // Mythic for every class: a loop that feeds on itself.
    id: 'ouroboros_coil',
    base: 'conduit_ring',
    rarity: 'mythic',
    affixes: [
      { stat: 'damage', min: 0.1, max: 0.14, scaling: 'sqrt' },
      { stat: 'allAttributes', min: 6, max: 9, scaling: 'linear' },
      { stat: 'critChance', min: 0.03, max: 0.05, scaling: 'none' },
      { stat: 'lifeOnKill', min: 8, max: 12, scaling: 'linear' },
    ],
    effects: [
      { kind: 'damage', value: 0.25, multiplicative: true },
      { kind: 'stat', stat: 'cooldownReduction', value: 0.08 },
      { kind: 'stat', stat: 'damageReduction', value: 0.05 },
    ],
  },
  // ---- Hydroponic Vaults: the Mother Tree choice (any class) ----
  {
    // Burned: the tree's charred heartwood, still warm.
    id: 'ashen_heartwood',
    base: 'signal_pendant',
    rarity: 'unique',
    source: 'quest',
    affixes: [
      { stat: 'damageVsBurning', min: 0.2, max: 0.28, scaling: 'sqrt' },
      { stat: 'resistHeat', min: 0.08, max: 0.12, scaling: 'sqrt' },
      { stat: 'maxLife', min: 20, max: 30, scaling: 'linear' },
    ],
    effects: [{ kind: 'damage', value: 0.08 }],
  },
  {
    // Spared: a seed the tree let fall into your hand.
    id: 'seed_of_accord',
    base: 'conduit_ring',
    rarity: 'unique',
    source: 'quest',
    affixes: [
      { stat: 'resistToxic', min: 0.12, max: 0.16, scaling: 'sqrt' },
      { stat: 'potionHealing', min: 0.15, max: 0.2, scaling: 'none' },
      { stat: 'lifeOnKill', min: 6, max: 9, scaling: 'linear' },
    ],
    effects: [{ kind: 'stat', stat: 'damageReduction', value: 0.06 }],
  },
];
