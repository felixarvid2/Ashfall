/** Spectre — agile marksman and saboteur. Resource: Focus (regenerates; crits and dodged hits refill it). */
import type { z } from 'zod';
import type { ClassDefSchema } from '../schemas';

export const SPECTRE: z.input<typeof ClassDefSchema> = {
  id: 'spectre',
  assetId: 'char.spectre',
  life: 170,
  armor: 30,
  resist: { heat: 0.05, cold: 0.1, toxic: 0.1, energy: 0.1, void: 0.05 },
  weaponDamage: 5,
  attributes: {
    primary: 'dexterity',
    base: { strength: 8, dexterity: 20, intelligence: 10, willpower: 10 },
    perLevel: { strength: 1, dexterity: 3, intelligence: 1, willpower: 2 },
  },
  lifePerLevel: 11,
  starterKit: ['marksman_rifle', 'plated_vest', 'mag_boots'],
  critChance: 0.08,
  critDamage: 0.6,
  moveSpeed: 6.2,
  collider: { radius: 0.4, mass: 2.5 },
  resource: {
    id: 'focus',
    max: 100,
    start: 60,
    // Focus trickles back all the time; crits and dodged hits refill it fast.
    idleRate: 4,
    idleDelay: 0,
    onCrit: 4,
    onAvoid: 10,
  },
  dodge: { distance: 5.5, duration: 0.2, cooldown: 2 },
  potion: { charges: 4, heal: 0.35, recharge: 18 },
  actionBar: ['spectre.quick_shot', null, null, null, null, null],
};
