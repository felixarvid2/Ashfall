/**
 * Boss phase scripts (docs/world-and-gameplay.md §9): each phase starts below a share of life and
 * changes tempo, summons adds, throws plates that stay as cover, or covers the arena in spores.
 */
export interface BossPhase {
  /** Starts when life drops to this fraction (the first phase uses 1). */
  below: number;
  /** Language key for the phase banner. */
  banner?: string;
  /** Movement speed multiplier and attack tempo (wind-ups and cooldowns). */
  speedMul?: number;
  tempo?: number;
  adds?: { enemy: string; count: number; every: number };
  /** Metal plates: warned impacts at the player that leave cover behind. */
  plates?: { every: number; radius: number; warning: number; damageOfWeapon: number };
  /** Spore fields around the arena (burning spore fields in the Cathedral). */
  sporeFields?: { every: number; count: number; radius: number; duration: number; dpsOfWeapon: number; status?: 'poisoned' | 'burning'; color?: string };
  /** Warned fireballs at and around the player (no cover left behind). */
  fireballs?: { every: number; count: number; radius: number; warning: number; damageOfWeapon: number };
  /** The floor collapses from the edge inward: each step leaves a safe circle of this fraction of the arena. */
  shrink?: { steps: number[]; every: number; warning: number; dpsOfWeapon: number };
  /** Spawned once when the phase starts (bodyguards). */
  guards?: { enemy: string; count: number };
  /** Stationary enemies that rise near the player. */
  tentacles?: { enemy: string; count: number; every: number };
  /** A new form: bigger and glowing. */
  transform?: { scale: number; glow: string };
}

export const BOSS_SCRIPTS: Record<string, BossPhase[]> = {
  brood_mother: [
    { below: 1, adds: { enemy: 'bloater', count: 2, every: 12 } },
    { below: 0.5, banner: 'bosses.brood_mother.phase2', speedMul: 1.2, adds: { enemy: 'bloater', count: 3, every: 8 } },
  ],
  hale: [
    { below: 1, adds: { enemy: 'infected_colonist', count: 3, every: 16 } },
    { below: 0.5, banner: 'bosses.hale.phase2', speedMul: 1.5, tempo: 1.6 },
  ],
  the_first: [
    { below: 1, adds: { enemy: 'infected_colonist', count: 3, every: 15 } },
    {
      below: 0.6,
      banner: 'bosses.the_first.phase2',
      adds: { enemy: 'infected_colonist', count: 2, every: 20 },
      plates: { every: 6, radius: 2.6, warning: 1.3, damageOfWeapon: 1.4 },
    },
    {
      below: 0.25,
      banner: 'bosses.the_first.phase3',
      speedMul: 1.6,
      tempo: 1.4,
      plates: { every: 9, radius: 2.6, warning: 1.2, damageOfWeapon: 1.4 },
      sporeFields: { every: 7, count: 3, radius: 3.5, duration: 9, dpsOfWeapon: 0.35 },
    },
  ],
  // ---- Region 2 ----
  krell: [
    { below: 1, adds: { enemy: 'welder', count: 2, every: 18 } },
    { below: 0.5, banner: 'bosses.krell.phase2', speedMul: 1.3, tempo: 1.3, adds: { enemy: 'flame_drone', count: 2, every: 14 } },
  ],
  slag_heart: [
    { below: 1, adds: { enemy: 'slag_hound', count: 3, every: 16 } },
    { below: 0.5, banner: 'bosses.slag_heart.phase2', speedMul: 1.3, sporeFields: { every: 6, count: 3, radius: 3, duration: 7, dpsOfWeapon: 0.3, status: 'burning', color: '#ff6a1a' } },
  ],
  pyre_warden: [
    { below: 1, guards: { enemy: 'smelter', count: 2 }, adds: { enemy: 'scorched_walker', count: 2, every: 15 } },
    { below: 0.5, banner: 'bosses.pyre_warden.phase2', tempo: 1.4, fireballs: { every: 5, count: 2, radius: 2.6, warning: 1.2, damageOfWeapon: 1.3 } },
  ],
  frozen_welder: [
    { below: 1, adds: { enemy: 'welder', count: 1, every: 20 } },
    { below: 0.5, banner: 'bosses.frozen_welder.phase2', speedMul: 1.4, tempo: 1.5 },
  ],
  brother_ash: [
    { below: 1, guards: { enemy: 'smelter', count: 2 } },
    { below: 0.5, banner: 'bosses.brother_ash.phase2', tempo: 1.3, guards: { enemy: 'welder', count: 2 }, fireballs: { every: 6, count: 2, radius: 2.6, warning: 1.3, damageOfWeapon: 1.2 } },
  ],
  vire: [
    // Phase 1: three guards and fireballs; she keeps them between herself and the player.
    { below: 1, guards: { enemy: 'smelter', count: 3 }, fireballs: { every: 4.5, count: 2, radius: 2.8, warning: 1.3, damageOfWeapon: 1.3 } },
    // Phase 2: she sets the cathedral on fire; the floor collapses into molten metal in three steps.
    {
      below: 0.6,
      banner: 'bosses.vire.phase2',
      fireballs: { every: 5.5, count: 2, radius: 2.8, warning: 1.3, damageOfWeapon: 1.3 },
      shrink: { steps: [0.78, 0.6, 0.45], every: 14, warning: 2.5, dpsOfWeapon: 0.8 },
      adds: { enemy: 'smelter', count: 2, every: 18 },
    },
    // Phase 3: her infected form. Tentacles, burning spore fields and Scorched Walkers.
    {
      below: 0.25,
      banner: 'bosses.vire.phase3',
      speedMul: 1.3,
      tempo: 1.3,
      transform: { scale: 1.35, glow: '#7dff5a' },
      tentacles: { enemy: 'lumen_tentacle', count: 2, every: 11 },
      adds: { enemy: 'scorched_walker', count: 3, every: 14 },
      sporeFields: { every: 7, count: 3, radius: 3.2, duration: 8, dpsOfWeapon: 0.4, status: 'burning', color: '#c8ff3a' },
    },
  ],
};
