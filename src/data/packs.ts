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
  // Refinery District (docs/regions/refinery-district.md): returning fire variants plus the Smelters.
  {
    id: 'rd_road',
    members: [
      { enemy: 'scorched_walker', count: [3, 5] },
      { enemy: 'flame_drone', count: [1, 2], chance: 0.5 },
      { enemy: 'smelter', count: [1, 2], chance: 0.45 },
      { enemy: 'welder', count: [1, 2], chance: 0.35 },
      { enemy: 'fire_bloater', count: [1, 1], chance: 0.3 },
    ],
    championChance: 0.1,
    rareChance: 0.08,
  },
  {
    id: 'rd_conveyor',
    members: [
      { enemy: 'welder', count: [2, 3] },
      { enemy: 'flame_drone', count: [1, 3] },
      { enemy: 'cargo_loader', count: [1, 1], chance: 0.25 },
      { enemy: 'sergeant', count: [1, 1], chance: 0.15 },
    ],
    championChance: 0.1,
    rareChance: 0.08,
  },
  {
    id: 'rd_slag',
    members: [
      { enemy: 'slag_hound', count: [3, 5] },
      { enemy: 'fire_bloater', count: [1, 2], chance: 0.5 },
      { enemy: 'slagborn', count: [1, 1], chance: 0.35 },
    ],
    championChance: 0.12,
    rareChance: 0.1,
  },
  {
    id: 'rd_stacks',
    members: [
      { enemy: 'scorched_walker', count: [3, 5] },
      { enemy: 'slag_hound', count: [1, 3], chance: 0.6 },
      { enemy: 'fire_bloater', count: [1, 1], chance: 0.4 },
      { enemy: 'smelter', count: [1, 1], chance: 0.3 },
    ],
    championChance: 0.1,
    rareChance: 0.1,
  },
  {
    id: 'rd_cathedral',
    members: [
      { enemy: 'smelter', count: [2, 4] },
      { enemy: 'welder', count: [1, 2], chance: 0.6 },
      { enemy: 'smelter_priest', count: [1, 1], chance: 0.45 },
      { enemy: 'scorched_walker', count: [2, 3], chance: 0.5 },
    ],
    championChance: 0.14,
    rareChance: 0.12,
  },
  // Hydroponic Vaults (docs/regions/hydroponic-vaults.md): overgrown variants, the brood and the botanists.
  {
    id: 'hv_road',
    members: [
      { enemy: 'overgrown_walker', count: [3, 5] },
      { enemy: 'spore_hound', count: [2, 4], chance: 0.5 },
      { enemy: 'mutated_botanist', count: [1, 2], chance: 0.4 },
      { enemy: 'swarm_bloater', count: [1, 1], chance: 0.3 },
      { enemy: 'spore_swarm', count: [2, 3], chance: 0.25 },
    ],
    championChance: 0.1,
    rareChance: 0.08,
  },
  {
    id: 'hv_outer',
    members: [
      { enemy: 'overgrown_walker', count: [3, 5] },
      { enemy: 'mutated_botanist', count: [1, 2], chance: 0.6 },
      { enemy: 'swarm_bloater', count: [1, 1], chance: 0.35 },
    ],
    championChance: 0.08,
    rareChance: 0.07,
  },
  {
    id: 'hv_sea',
    members: [
      { enemy: 'spore_hound', count: [5, 7] },
      { enemy: 'vine_weaver', count: [1, 2], chance: 0.55 },
      { enemy: 'spore_swarm', count: [2, 4], chance: 0.5 },
      { enemy: 'mossborn', count: [1, 1], chance: 0.3 },
      { enemy: 'lumen_giant', count: [1, 1], chance: 0.04 },
    ],
    championChance: 0.12,
    rareChance: 0.1,
  },
  {
    id: 'hv_seed',
    members: [
      { enemy: 'overgrown_walker', count: [3, 5] },
      { enemy: 'mutated_botanist', count: [1, 2], chance: 0.55 },
      { enemy: 'mossborn', count: [1, 1], chance: 0.35 },
      { enemy: 'sergeant', count: [1, 1], chance: 0.15 },
    ],
    championChance: 0.12,
    rareChance: 0.1,
  },
  {
    id: 'hv_roots',
    members: [
      { enemy: 'vine_weaver', count: [2, 3] },
      { enemy: 'overgrown_walker', count: [2, 4], chance: 0.7 },
      { enemy: 'spore_swarm', count: [2, 3], chance: 0.5 },
      { enemy: 'cocoon_warden', count: [1, 1], chance: 0.3 },
    ],
    championChance: 0.12,
    rareChance: 0.1,
  },
  {
    id: 'hv_gamma',
    members: [
      { enemy: 'overgrown_walker', count: [3, 5] },
      { enemy: 'cocoon_warden', count: [1, 1], chance: 0.5 },
      { enemy: 'swarm_bloater', count: [1, 2], chance: 0.5 },
      { enemy: 'mossborn', count: [1, 1], chance: 0.3 },
      { enemy: 'lumen_giant', count: [1, 1], chance: 0.06 },
    ],
    championChance: 0.14,
    rareChance: 0.12,
  },
];

export function packTemplate(id: string): PackTemplate {
  const t = PACK_TEMPLATES.find((p) => p.id === id);
  if (!t) throw new Error(`Unknown pack template ${id}`);
  return t;
}
