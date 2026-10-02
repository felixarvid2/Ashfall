/**
 * Enemy pack templates for open-world packs (docs/world-and-gameplay.md §8.1): mostly fodder,
 * one or two specialists, sometimes a heavy. Counts are [min, max].
 */
export interface PackMember {
  enemy: string;
  count: [number, number];
  /** Chance this member line is included at all. */
  chance?: number;
}

export interface PackTemplate {
  id: string;
  members: PackMember[];
  /** Chance the pack is a champion pack (blue, shared affixes) / has a rare elite (yellow). */
  championChance: number;
  rareChance: number;
}

export const PACK_TEMPLATES: PackTemplate[] = [
  {
    id: 'impact',
    members: [
      { enemy: 'infected_colonist', count: [2, 4] },
      { enemy: 'bloater', count: [1, 1], chance: 0.35 },
    ],
    championChance: 0.04,
    rareChance: 0.03,
  },
  {
    id: 'road',
    members: [
      { enemy: 'infected_colonist', count: [3, 6] },
      { enemy: 'security_drone', count: [1, 2], chance: 0.6 },
      { enemy: 'bloater', count: [1, 1], chance: 0.35 },
      { enemy: 'spore_hound', count: [2, 3], chance: 0.3 },
    ],
    championChance: 0.08,
    rareChance: 0.06,
  },
  {
    id: 'valley',
    members: [
      { enemy: 'infected_colonist', count: [3, 6] },
      { enemy: 'spore_hound', count: [2, 4], chance: 0.6 },
      { enemy: 'spore_carrier', count: [1, 1], chance: 0.5 },
      { enemy: 'bloater', count: [1, 2], chance: 0.4 },
    ],
    championChance: 0.1,
    rareChance: 0.08,
  },
  {
    id: 'military',
    members: [
      { enemy: 'infected_colonist', count: [3, 5] },
      { enemy: 'security_drone', count: [2, 3] },
      { enemy: 'sergeant', count: [1, 1], chance: 0.35 },
    ],
    championChance: 0.12,
    rareChance: 0.1,
  },
  {
    id: 'maw_approach',
    members: [
      { enemy: 'infected_colonist', count: [4, 7] },
      { enemy: 'spore_hound', count: [2, 3], chance: 0.5 },
      { enemy: 'spore_carrier', count: [1, 1], chance: 0.5 },
      { enemy: 'sergeant', count: [1, 1], chance: 0.25 },
    ],
    championChance: 0.12,
    rareChance: 0.1,
  },
];

export function packTemplate(id: string): PackTemplate {
  const t = PACK_TEMPLATES.find((p) => p.id === id);
  if (!t) throw new Error(`Unknown pack template ${id}`);
  return t;
}
