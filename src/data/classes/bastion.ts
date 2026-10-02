/** Bastion — heavy melee in a battered exoskeleton. Resource: Heat. */
import type { z } from 'zod';
import type { ClassDefSchema } from '../schemas';

export const BASTION: z.input<typeof ClassDefSchema> = {
  id: 'bastion',
  assetId: 'char.bastion',
  life: 220,
  armor: 60,
  resist: { heat: 0.1, cold: 0.1, toxic: 0.1, energy: 0.1, void: 0.1 },
  // Until items exist (Phase 3), the class carries a fixed starter weapon.
  weaponDamage: 14,
  mainStat: 20,
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
