/** Level 1→10 bot plans, three per class (npm run play). */
import type { PlayPlan } from './playthrough';

export const PLANS: PlayPlan[] = [
  // ---- Bastion
  {
    name: 'Bastion · Seismic Shock',
    classId: 'bastion',
    style: 'melee',
    learnOrder: ['n.hydraulic_strike', 'n.seismic_shock', 'n.seismic_shock', 'e.seismic_shock', 'n.energy_shield', 'm.seismic_shock.rupture', 'p.hydraulic_power', 'p.forged_frame', 'n.rocket_leap', 'n.seismic_shock'],
    rotation: [
      { skill: 'bastion.energy_shield', lifeBelow: 0.6 },
      { skill: 'bastion.rocket_leap', minEnemiesNear: 0 },
      { skill: 'bastion.seismic_shock', minEnemiesNear: 1 },
      { skill: 'bastion.hydraulic_strike' },
    ],
  },
  {
    name: 'Bastion · Furnace Cleave',
    classId: 'bastion',
    style: 'melee',
    learnOrder: ['n.piston_jab', 'n.furnace_cleave', 'n.furnace_cleave', 'e.furnace_cleave', 'n.coolant_flush', 'm.furnace_cleave.wildfire', 'p.hydraulic_power', 'p.hydraulic_power', 'n.magnetic_pull', 'n.furnace_cleave'],
    rotation: [
      { skill: 'bastion.coolant_flush', lifeBelow: 0.55 },
      { skill: 'bastion.coolant_flush', minResource: 90 },
      { skill: 'bastion.magnetic_pull', minEnemiesNear: 2 },
      { skill: 'bastion.furnace_cleave' },
      { skill: 'bastion.piston_jab' },
    ],
  },
  {
    name: 'Bastion · Strike tank',
    classId: 'bastion',
    style: 'melee',
    learnOrder: ['n.hydraulic_strike', 'e.hydraulic_strike', 'm.hydraulic_strike.searing', 'n.seismic_shock', 'n.energy_shield', 'p.forged_frame', 'p.forged_frame', 'n.hydraulic_strike', 'n.rocket_leap', 'p.forged_frame'],
    rotation: [
      { skill: 'bastion.energy_shield', lifeBelow: 0.7 },
      { skill: 'bastion.seismic_shock', minEnemiesNear: 3 },
      { skill: 'bastion.rocket_leap', minEnemiesNear: 0 },
      { skill: 'bastion.hydraulic_strike' },
    ],
  },
  // ---- Spectre
  {
    name: 'Spectre · Sniper',
    classId: 'spectre',
    style: 'ranged',
    learnOrder: ['n.quick_shot', 'n.piercing_shot', 'n.piercing_shot', 'e.piercing_shot', 'n.smoke_cloak', 'm.piercing_shot.deadshot', 'p.steady_aim', 'p.steady_aim', 'n.phase_shift', 'n.piercing_shot'],
    rotation: [
      { skill: 'spectre.smoke_cloak', lifeBelow: 0.5 },
      { skill: 'spectre.phase_shift', lifeBelow: 0.4 },
      { skill: 'spectre.piercing_shot' },
      { skill: 'spectre.quick_shot' },
    ],
  },
  {
    name: 'Spectre · Trapper',
    classId: 'spectre',
    style: 'ranged',
    learnOrder: ['n.quick_shot', 'n.pistol_barrage', 'n.pistol_barrage', 'e.pistol_barrage', 'n.holo_decoy', 'p.marksmanship', 'p.marksmanship', 'e.quick_shot', 'n.minefield', 'n.minefield'],
    rotation: [
      { skill: 'spectre.holo_decoy', minEnemiesNear: 2 },
      { skill: 'spectre.minefield' },
      { skill: 'spectre.pistol_barrage', minEnemiesNear: 1 },
      { skill: 'spectre.quick_shot' },
    ],
  },
  {
    name: 'Spectre · Blades',
    classId: 'spectre',
    style: 'melee',
    learnOrder: ['n.vibro_slash', 'n.vibro_slash', 'e.vibro_slash', 'n.pistol_barrage', 'n.smoke_cloak', 'm.vibro_slash.flurry', 'p.marksmanship', 'p.marksmanship', 'n.phase_shift', 'n.vibro_slash'],
    rotation: [
      { skill: 'spectre.smoke_cloak', lifeBelow: 0.6 },
      { skill: 'spectre.phase_shift', lifeBelow: 0.4 },
      { skill: 'spectre.pistol_barrage', minEnemiesNear: 2 },
      { skill: 'spectre.vibro_slash' },
    ],
  },
  // ---- Xenomant
  {
    name: 'Xenomant · Minions',
    classId: 'xenomant',
    style: 'ranged',
    learnOrder: ['n.spore_dart', 'n.spore_burst', 'e.spore_dart', 'n.chitin_armor', 'p.lumen_affinity', 'p.lumen_affinity', 'p.cell_division', 'n.spore_burst', 'n.raise_corpse', 'n.raise_corpse'],
    rotation: [
      { skill: 'xenomant.chitin_armor', lifeBelow: 0.6 },
      { skill: 'xenomant.raise_corpse', minionsBelow: 6, needsCorpse: true },
      { skill: 'xenomant.spore_burst', minEnemiesNear: 2 },
      { skill: 'xenomant.spore_dart' },
    ],
  },
  {
    name: 'Xenomant · Disease',
    classId: 'xenomant',
    style: 'ranged',
    learnOrder: ['n.spore_dart', 'n.spore_burst', 'n.spore_burst', 'e.spore_burst', 'n.spore_cocoon', 'm.spore_burst.lingering', 'p.toxicology', 'p.toxicology', 'n.grasping_tendrils', 'n.spore_burst'],
    rotation: [
      { skill: 'xenomant.spore_cocoon', lifeBelow: 0.5 },
      { skill: 'xenomant.grasping_tendrils', minEnemiesNear: 2 },
      { skill: 'xenomant.spore_burst', minEnemiesNear: 2 },
      { skill: 'xenomant.spore_dart' },
    ],
  },
  {
    name: 'Xenomant · Leech',
    classId: 'xenomant',
    style: 'melee',
    learnOrder: ['n.scalpel_slash', 'n.parasite_link', 'n.scalpel_slash', 'e.scalpel_slash', 'n.chitin_armor', 'n.parasite_link', 'p.lumen_affinity', 'p.cell_division', 'n.grasping_tendrils', 'n.scalpel_slash'],
    rotation: [
      { skill: 'xenomant.chitin_armor', minEnemiesNear: 2 },
      { skill: 'xenomant.parasite_link' },
      { skill: 'xenomant.scalpel_slash' },
    ],
  },
];
