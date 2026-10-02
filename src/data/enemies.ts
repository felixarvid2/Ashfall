/** Enemy definitions (Phase 1: three Cinder Flats archetypes). */
import type { z } from 'zod';
import type { EnemyDefSchema } from './schemas';

type EnemyInput = z.input<typeof EnemyDefSchema>;

export const ENEMIES: EnemyInput[] = [
  {
    // Rusher: charges in and swings with a telegraphed claw.
    id: 'infected_colonist',
    assetId: 'enemy.infected_colonist',
    family: 'infected',
    behavior: 'rusher',
    life: 45,
    armor: 20,
    resist: { toxic: 0.1 },
    damage: 14,
    moveSpeed: 3.4,
    turnRate: 8,
    aggroRange: 16,
    collider: { radius: 0.42, mass: 1 },
    attack: {
      kind: 'melee',
      range: 1.6,
      arcDeg: 90,
      windup: 0.5,
      recovery: 0.6,
      cooldown: 1.0,
      damageType: 'physical',
      knockback: 0.8,
    },
  },
  {
    // Ranged: hovers at distance, strafes and fires telegraphed energy bolts.
    id: 'security_drone',
    assetId: 'enemy.security_drone',
    family: 'machine',
    behavior: 'ranged',
    life: 30,
    armor: 60,
    resist: { energy: 0.3 },
    damage: 10,
    moveSpeed: 3.0,
    turnRate: 6,
    aggroRange: 18,
    preferredRange: [7, 11],
    hover: 1.3,
    collider: { radius: 0.45, mass: 0.6 },
    attack: { kind: 'projectile', windup: 0.6, cooldown: 2.2, speed: 11, radius: 0.3, maxRange: 16, damageType: 'energy' },
  },
  {
    // Support: stays behind its pack, shields allies, bursts into a toxic cloud on death.
    id: 'spore_carrier',
    assetId: 'enemy.spore_carrier',
    family: 'lumen',
    behavior: 'support',
    life: 70,
    armor: 30,
    resist: { toxic: 0.25 },
    damage: 0,
    moveSpeed: 2.2,
    turnRate: 4,
    aggroRange: 16,
    preferredRange: [7, 12],
    collider: { radius: 0.6, mass: 2 },
    attack: {
      kind: 'buffAllies',
      windup: 0.6,
      cooldown: 6,
      radius: 7,
      applies: [{ status: 'barrier', duration: 6, amount: 25 }],
    },
    onDeath: {
      hazard: { radius: 2.8, duration: 4, applies: [{ status: 'poisoned', duration: 1.5, dps: 6 }] },
    },
  },
];
