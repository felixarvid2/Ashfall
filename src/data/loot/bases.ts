/**
 * Item bases. Values are at item power 100 and scale with item power (see loot/generate.ts).
 * Bases for Spectre and Xenomant already exist so the "85 % own class" drop rule works.
 */
import type { z } from 'zod';
import type { BaseItemDefSchema } from './schemas';

type Base = z.input<typeof BaseItemDefSchema>;

const armor = (min: number, max: number) => ({ stat: 'armor' as const, min, max, scaling: 'linear' as const });

export const BASES: Base[] = [
  // ---- Bastion weapons & off-hand
  {
    id: 'hydraulic_hammer',
    type: 'weapon',
    classes: ['bastion'],
    icon: 'icon.hydraulic_hammer',
    implicits: [{ stat: 'weaponDamage', min: 28, max: 34, scaling: 'linear' }],
    maxSockets: 2,
  },
  {
    id: 'power_sword',
    type: 'weapon',
    classes: ['bastion'],
    icon: 'icon.power_sword',
    implicits: [
      { stat: 'weaponDamage', min: 24, max: 29, scaling: 'linear' },
      { stat: 'attackSpeed', min: 0.08, max: 0.08, scaling: 'none' },
    ],
    maxSockets: 2,
  },
  {
    id: 'hydraulic_knuckles',
    type: 'weapon',
    classes: ['bastion'],
    icon: 'icon.hydraulic_knuckles',
    implicits: [
      { stat: 'weaponDamage', min: 22, max: 27, scaling: 'linear' },
      { stat: 'critChance', min: 0.04, max: 0.04, scaling: 'none' },
    ],
    maxSockets: 2,
  },
  {
    id: 'riot_shield',
    type: 'offHand',
    classes: ['bastion'],
    icon: 'icon.riot_shield',
    implicits: [armor(36, 48), { stat: 'maxLife', min: 14, max: 20, scaling: 'linear' }],
    maxSockets: 1,
  },
  // ---- Spectre (future class)
  {
    id: 'marksman_rifle',
    type: 'weapon',
    classes: ['spectre'],
    icon: 'icon.marksman_rifle',
    implicits: [{ stat: 'weaponDamage', min: 30, max: 36, scaling: 'linear' }],
    maxSockets: 2,
  },
  {
    id: 'vibroblade',
    type: 'offHand',
    classes: ['spectre'],
    icon: 'icon.vibroblade',
    implicits: [{ stat: 'critChance', min: 0.05, max: 0.05, scaling: 'none' }],
    maxSockets: 1,
  },
  // ---- Xenomant (future class)
  {
    id: 'bio_focus',
    type: 'weapon',
    classes: ['xenomant'],
    icon: 'icon.bio_focus',
    implicits: [{ stat: 'weaponDamage', min: 26, max: 32, scaling: 'linear' }],
    maxSockets: 2,
  },
  {
    id: 'injector_rig',
    type: 'offHand',
    classes: ['xenomant'],
    icon: 'icon.injector_rig',
    implicits: [{ stat: 'resourceGen', min: 0.08, max: 0.08, scaling: 'none' }],
    maxSockets: 1,
  },
  // ---- Armour (all classes)
  { id: 'combat_helm', type: 'helm', icon: 'icon.combat_helm', implicits: [armor(16, 22)], maxSockets: 1 },
  { id: 'plated_vest', type: 'chest', icon: 'icon.plated_vest', implicits: [armor(30, 40)], maxSockets: 2 },
  { id: 'servo_gauntlets', type: 'gloves', icon: 'icon.servo_gauntlets', implicits: [armor(12, 16)], maxSockets: 1 },
  { id: 'armored_greaves', type: 'pants', icon: 'icon.armored_greaves', implicits: [armor(22, 30)], maxSockets: 2 },
  { id: 'mag_boots', type: 'boots', icon: 'icon.mag_boots', implicits: [armor(12, 16)], maxSockets: 1 },
  // ---- Jewellery (all classes)
  {
    id: 'signal_pendant',
    type: 'amulet',
    icon: 'icon.signal_pendant',
    implicits: [{ stat: 'resistAll', min: 0.04, max: 0.05, scaling: 'sqrt' }],
    maxSockets: 1,
  },
  {
    id: 'conduit_ring',
    type: 'ring',
    icon: 'icon.conduit_ring',
    implicits: [{ stat: 'resistAll', min: 0.02, max: 0.03, scaling: 'sqrt' }],
    maxSockets: 1,
  },
  // ---- Crystals (socketables)
  { id: 'crystal', type: 'crystal', icon: 'icon.crystal_ember' },
];
