/** Xenomant — a biologist who tamed the Lumen. Resource: Biomass (gathered from the dying). */
import type { z } from 'zod';
import type { ClassDefSchema } from '../schemas';

export const XENOMANT: z.input<typeof ClassDefSchema> = {
  id: 'xenomant',
  assetId: 'char.xenomant',
  life: 180,
  armor: 35,
  resist: { heat: 0.05, cold: 0.05, toxic: 0.25, energy: 0.05, void: 0.1 },
  weaponDamage: 5,
  attributes: {
    primary: 'intelligence',
    base: { strength: 8, dexterity: 8, intelligence: 20, willpower: 12 },
    perLevel: { strength: 1, dexterity: 1, intelligence: 3, willpower: 2 },
  },
  lifePerLevel: 12,
  starterKit: ['bio_focus', 'plated_vest', 'mag_boots'],
  critChance: 0.05,
  critDamage: 0.5,
  moveSpeed: 5.8,
  collider: { radius: 0.42, mass: 3 },
  resource: {
    id: 'biomass',
    max: 100,
    start: 30,
    // Biomass rots away slowly out of combat; deaths nearby feed it.
    idleRate: -2,
    idleDelay: 6,
    onNearbyDeath: { radius: 14, amount: 8 },
  },
  dodge: { distance: 4.8, duration: 0.22, cooldown: 2.5 },
  potion: { charges: 4, heal: 0.35, recharge: 18 },
  actionBar: ['xenomant.spore_dart', null, null, null, null, null],
};
