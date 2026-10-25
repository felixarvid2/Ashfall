/** Lightbearer — a colony chaplain who carries the old light. Resource: Devotion (grows with every life mended). */
import type { z } from 'zod';
import type { ClassDefSchema } from '../schemas';

export const LIGHTBEARER: z.input<typeof ClassDefSchema> = {
  id: 'lightbearer',
  assetId: 'char.lightbearer',
  life: 190,
  armor: 45,
  resist: { heat: 0.05, cold: 0.05, toxic: 0.1, energy: 0.2, void: 0.2 },
  weaponDamage: 5,
  attributes: {
    primary: 'intelligence',
    base: { strength: 10, dexterity: 8, intelligence: 18, willpower: 14 },
    perLevel: { strength: 1, dexterity: 1, intelligence: 3, willpower: 2 },
  },
  lifePerLevel: 12,
  starterKit: ['censer_mace', 'plated_vest', 'mag_boots'],
  critChance: 0.05,
  critDamage: 0.5,
  moveSpeed: 5.8,
  collider: { radius: 0.42, mass: 3 },
  resource: {
    id: 'devotion',
    max: 100,
    start: 40,
    // Devotion returns slowly on its own; healing and shielding (yourself or your lights) refill it.
    idleRate: 3,
    idleDelay: 0,
    onHeal: 0.5,
  },
  dodge: { distance: 4.8, duration: 0.22, cooldown: 2.5 },
  potion: { charges: 4, heal: 0.35, recharge: 18 },
  actionBar: ['lightbearer.censer_strike', null, null, null, null, null],
};
