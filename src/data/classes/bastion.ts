/** Bastion — heavy melee in a battered exoskeleton. Resource: Heat. */
import type { z } from 'zod';
import type { ClassDefSchema } from '../schemas';

export const BASTION: z.input<typeof ClassDefSchema> = {
  id: 'bastion',
  assetId: 'char.bastion',
  life: 220,
  armor: 60,
  resist: { heat: 0.1, cold: 0.1, toxic: 0.1, energy: 0.1, void: 0.1 },
  // Fists; the starter hammer replaces this.
  weaponDamage: 5,
  attributes: {
    primary: 'strength',
    base: { strength: 20, dexterity: 8, intelligence: 8, willpower: 12 },
    perLevel: { strength: 3, dexterity: 1, intelligence: 1, willpower: 2 },
  },
  lifePerLevel: 14,
  starterKit: ['hydraulic_hammer', 'plated_vest', 'mag_boots'],
  critChance: 0.05,
  critDamage: 0.5,
  moveSpeed: 5.5,
  collider: { radius: 0.45, mass: 4 },
  resource: {
    id: 'heat',
    max: 100,
    start: 0,
    idleRate: -12,
    idleDelay: 2.5,
    gainPerLifePercentLost: 0.6,
    overheat: { grace: 1.5, damagePerSecond: 0.05 },
  },
  dodge: { distance: 4.5, duration: 0.22, cooldown: 2.5 },
  potion: { charges: 4, heal: 0.35, recharge: 18 },
  actionBar: ['bastion.hydraulic_strike', 'bastion.seismic_shock', 'bastion.rocket_leap', 'bastion.energy_shield', null, null],
};
