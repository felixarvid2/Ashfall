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
  /** Spore fields around the arena. */
  sporeFields?: { every: number; count: number; radius: number; duration: number; dpsOfWeapon: number };
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
};
