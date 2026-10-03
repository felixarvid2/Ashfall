/**
 * Instanced dungeons and bunkers (docs/world-and-gameplay.md §6): themed modular rooms laid out
 * from a seed, a main objective that opens the boss room, and a final boss (bunkers: a cache).
 */
import type { EliteAffix } from './elites';

export type InstanceObjective =
  /** Power up generators; each charges while enemies attack. */
  | { kind: 'activate'; count: number; charge: number; wave: number }
  /** Find keycards (or seed vaults, or research data) in side rooms. */
  | { kind: 'collect'; count: number; item?: 'keycard' | 'seed' | 'data' }
  /**
   * Destroy spore nests (they keep spawning while alive). The Cocoon Chamber's single Mother Cocoon
   * is a bigger target with its own look and brood.
   */
  | { kind: 'destroy'; count: number; life: number; spawnEvery: number; target?: { asset: string; scale: number; enemy: string; name: string } }
  /** Irrigation System: pull the pump levers; each drains the water from part of the tunnels. */
  | { kind: 'drain'; count: number }
  /** Kill everything. */
  | { kind: 'clear' }
  /** Shut pumps in the order a panel shows; a wrong one resets them, heats the furnace and draws a wave. */
  | { kind: 'valves'; count: number; wave: number }
  /** Follow a damaged maintenance robot to the boss room; it stops while enemies are near it. */
  | { kind: 'follow'; life: number; speed: number; stopRadius: number }
  /** Free prisoners from their cages before the pyres light (each cage's timer starts when you enter its room). */
  | { kind: 'rescue'; count: number; time: number }
  /** Restart a machine, then keep it alive through waves for `time` seconds. */
  | { kind: 'defend'; time: number; life: number; waveEvery: number; wave: number };

export interface InstanceBoss {
  enemy: string;
  /** Language key of the boss name. */
  name: string;
  lifeMul: number;
  damageMul: number;
  affixes: EliteAffix[];
  /** Boss phase script id in src/data/bosses.ts (optional). */
  script?: string;
}

export interface InstanceDef {
  id: string;
  kind: 'dungeon' | 'bunker';
  /** Main path length (rooms, start and boss included) and side branches. */
  main: [number, number];
  branches: [number, number];
  /** Pack templates (src/data/packs.ts) rolled per room. */
  packs: string[];
  packsPerRoom: [number, number];
  objective: InstanceObjective;
  boss: InstanceBoss | null;
  theme: {
    floor: string;
    fog: { color: string; density: number };
    ambient: { color: string; intensity: number };
    /** Props scattered along room walls. */
    decor: string[];
    light: { asset: string; color: string; intensity: number };
  };
  /** Chance of a dungeon event (an extra named elite in a side room). */
  eventChance: number;
  /** Smelter 3: the furnace heats up over time (0..1 in `fullAfter` s); above `burnAt` it burns. */
  heat?: { fullAfter: number; burnAt: number; coolPerStep: number };
  /** The Cold Hall: frost vents per room that freeze whoever stands in them, enemies too. */
  frostVents?: number;
  /** The Cocoon Chamber: cocoons per room that hatch when the player passes close. */
  cocoons?: number;
}

const FREIGHTER = {
  floor: '#3a3632',
  fog: { color: '#0c0b0b', density: 0.026 },
  ambient: { color: '#6a6058', intensity: 0.5 },
  decor: ['prop.cargo_crate', 'prop.pipe_section', 'prop.control_terminal', 'prop.fuel_tank'],
  light: { asset: 'prop.emergency_light', color: '#ff6a3a', intensity: 40 },
};
const BUNKER = {
  floor: '#34363a',
  fog: { color: '#0a0b0d', density: 0.028 },
  ambient: { color: '#5a6472', intensity: 0.5 },
  decor: ['prop.cargo_crate', 'prop.barricade', 'prop.control_terminal', 'prop.supply_chest'],
  light: { asset: 'prop.emergency_light', color: '#ffd2a1', intensity: 36 },
};
const SEWER = {
  floor: '#2c322a',
  fog: { color: '#0a0d0a', density: 0.028 },
  ambient: { color: '#5a6a54', intensity: 0.48 },
  decor: ['prop.pipe_section', 'prop.lumen_growth', 'prop.cargo_crate', 'prop.lumen_growth'],
  light: { asset: 'prop.lumen_growth', color: '#7dff8a', intensity: 30 },
};

const FOUNDRY = {
  floor: '#3a2c24',
  fog: { color: '#1a0e08', density: 0.024 },
  ambient: { color: '#8a5a40', intensity: 0.5 },
  decor: ['env.pipe_cluster', 'prop.fuel_tank', 'prop.cargo_crate', 'env.furnace_block'],
  light: { asset: 'prop.emergency_light', color: '#ff6a1a', intensity: 44 },
};
const PIPES = {
  floor: '#30302c',
  fog: { color: '#0e0d0b', density: 0.03 },
  ambient: { color: '#6a6458', intensity: 0.45 },
  decor: ['env.pipe_cluster', 'prop.pipe_section', 'prop.pipe_section', 'prop.control_terminal'],
  light: { asset: 'prop.emergency_light', color: '#ffb04a', intensity: 34 },
};
const CRYPT = {
  floor: '#2e2420',
  fog: { color: '#120a08', density: 0.028 },
  ambient: { color: '#7a4a3a', intensity: 0.45 },
  decor: ['env.furnace_block', 'prop.barricade', 'prop.cargo_crate', 'prop.fuel_tank'],
  light: { asset: 'prop.emergency_light', color: '#ff8a3a', intensity: 40 },
};
const COLD = {
  floor: '#3a4048',
  fog: { color: '#0a0e14', density: 0.026 },
  ambient: { color: '#7a90b0', intensity: 0.55 },
  decor: ['env.pipe_cluster', 'prop.generator', 'prop.control_terminal', 'prop.cargo_crate'],
  light: { asset: 'prop.emergency_light', color: '#9fd8ff', intensity: 36 },
};

const SEEDVAULT = {
  floor: '#3a4446',
  fog: { color: '#0a1012', density: 0.026 },
  ambient: { color: '#7aa0b0', intensity: 0.55 },
  decor: ['prop.generator', 'prop.control_terminal', 'prop.lumen_growth', 'prop.cargo_crate'],
  light: { asset: 'prop.emergency_light', color: '#9fd8ff', intensity: 36 },
};
const BROOD = {
  floor: '#28301e',
  fog: { color: '#0a1006', density: 0.03 },
  ambient: { color: '#5a7a44', intensity: 0.48 },
  decor: ['prop.spore_nest', 'prop.lumen_growth', 'prop.lumen_growth', 'env.slag_rock'],
  light: { asset: 'prop.lumen_growth', color: '#7dff5a', intensity: 30 },
};
const FLOODED = {
  floor: '#2c3434',
  fog: { color: '#0a0e0e', density: 0.028 },
  ambient: { color: '#5a7a80', intensity: 0.5 },
  decor: ['prop.pipe_section', 'env.pipe_cluster', 'prop.lumen_growth', 'prop.generator'],
  light: { asset: 'prop.emergency_light', color: '#7ad8c8', intensity: 34 },
};
const SLEEPING_LAB = {
  floor: '#343838',
  fog: { color: '#0b0d0d', density: 0.026 },
  ambient: { color: '#7a8a84', intensity: 0.5 },
  decor: ['prop.control_terminal', 'prop.cargo_crate', 'prop.lumen_growth', 'prop.generator'],
  light: { asset: 'prop.emergency_light', color: '#c8ffd8', intensity: 34 },
};

export const INSTANCES: InstanceDef[] = [
  {
    id: 'meridians_hold',
    kind: 'dungeon',
    main: [6, 7],
    branches: [3, 4],
    packs: ['valley', 'road'],
    packsPerRoom: [1, 2],
    objective: { kind: 'activate', count: 3, charge: 6, wave: 4 },
    boss: { enemy: 'sergeant', name: 'enemies.named.hold_warden', lifeMul: 9, damageMul: 1.6, affixes: ['shielded', 'burning'] },
    theme: FREIGHTER,
    eventChance: 0.35,
  },
  {
    id: 'bunker_sierra4',
    kind: 'dungeon',
    main: [6, 7],
    branches: [3, 4],
    packs: ['military', 'road'],
    packsPerRoom: [1, 2],
    objective: { kind: 'collect', count: 2 },
    boss: { enemy: 'sergeant', name: 'enemies.named.vos', lifeMul: 10, damageMul: 1.6, affixes: ['fast', 'freezing'] },
    theme: BUNKER,
    eventChance: 0.35,
  },
  {
    id: 'drainage_tunnels',
    kind: 'dungeon',
    main: [6, 8],
    branches: [2, 4],
    packs: ['valley', 'impact'],
    packsPerRoom: [1, 2],
    objective: { kind: 'destroy', count: 4, life: 260, spawnEvery: 9 },
    boss: { enemy: 'brood_mother', name: 'enemies.named.brood_mother', lifeMul: 1, damageMul: 1, affixes: ['sporeSpreader'], script: 'brood_mother' },
    theme: SEWER,
    eventChance: 0.35,
  },
  // ---- Refinery District (docs/regions/refinery-district.md): longer, 8–12 minutes ----
  {
    id: 'smelter_3',
    kind: 'dungeon',
    main: [8, 9],
    branches: [4, 5],
    packs: ['rd_road', 'rd_conveyor'],
    packsPerRoom: [1, 2],
    objective: { kind: 'valves', count: 3, wave: 5 },
    boss: { enemy: 'cargo_loader', name: 'enemies.named.krell', lifeMul: 4, damageMul: 1.3, affixes: ['shielded'], script: 'krell' },
    theme: FOUNDRY,
    eventChance: 0.35,
    heat: { fullAfter: 300, burnAt: 0.5, coolPerStep: 0.25 },
  },
  {
    id: 'pipe_alleys',
    kind: 'dungeon',
    main: [9, 10],
    branches: [3, 4],
    packs: ['rd_stacks', 'rd_slag'],
    packsPerRoom: [1, 2],
    objective: { kind: 'follow', life: 900, speed: 2.6, stopRadius: 10 },
    boss: { enemy: 'slagborn', name: 'enemies.named.slag_heart', lifeMul: 5, damageMul: 1.4, affixes: ['burning', 'fast'], script: 'slag_heart' },
    theme: PIPES,
    eventChance: 0.35,
  },
  {
    id: 'cathedral_crypt',
    kind: 'dungeon',
    main: [8, 9],
    branches: [4, 5],
    packs: ['rd_cathedral', 'rd_road'],
    packsPerRoom: [1, 2],
    objective: { kind: 'rescue', count: 4, time: 70 },
    boss: { enemy: 'pyre_warden', name: 'enemies.named.pyre_warden', lifeMul: 1, damageMul: 1, affixes: ['burning'], script: 'pyre_warden' },
    theme: CRYPT,
    eventChance: 0.35,
  },
  {
    id: 'cold_hall',
    kind: 'dungeon',
    main: [8, 9],
    branches: [4, 5],
    packs: ['rd_conveyor', 'rd_road'],
    packsPerRoom: [1, 2],
    objective: { kind: 'defend', time: 60, life: 900, waveEvery: 9, wave: 4 },
    boss: { enemy: 'frozen_welder', name: 'enemies.named.frozen_welder', lifeMul: 1, damageMul: 1, affixes: ['freezing'], script: 'frozen_welder' },
    theme: COLD,
    eventChance: 0.35,
    frostVents: 2,
  },
  // ---- Hydroponic Vaults (docs/regions/hydroponic-vaults.md) ----
  {
    id: 'seed_bank_depths',
    kind: 'dungeon',
    main: [8, 9],
    branches: [4, 5],
    packs: ['hv_seed', 'hv_road'],
    packsPerRoom: [1, 2],
    objective: { kind: 'collect', count: 3, item: 'seed' },
    boss: { enemy: 'the_keeper', name: 'enemies.named.keeper', lifeMul: 1, damageMul: 1, affixes: ['freezing'], script: 'keeper' },
    theme: SEEDVAULT,
    eventChance: 0.35,
    frostVents: 1,
  },
  {
    id: 'cocoon_chamber',
    kind: 'dungeon',
    main: [8, 9],
    branches: [4, 5],
    packs: ['hv_roots', 'hv_sea'],
    packsPerRoom: [1, 2],
    objective: { kind: 'destroy', count: 1, life: 2400, spawnEvery: 6, target: { asset: 'prop.spore_feeder', scale: 2.4, enemy: 'spore_swarm', name: 'instances.motherCocoon' } },
    boss: { enemy: 'brood_warden', name: 'enemies.named.brood_warden', lifeMul: 1, damageMul: 1, affixes: ['sporeSpreader'], script: 'brood_warden' },
    theme: BROOD,
    eventChance: 0.35,
    cocoons: 3,
  },
  {
    id: 'irrigation_system',
    kind: 'dungeon',
    main: [8, 9],
    branches: [4, 5],
    packs: ['hv_sea', 'hv_road'],
    packsPerRoom: [1, 2],
    objective: { kind: 'drain', count: 3 },
    boss: { enemy: 'vine_matriarch', name: 'enemies.named.vine_matriarch', lifeMul: 1, damageMul: 1, affixes: ['fast'], script: 'vine_matriarch' },
    theme: FLOODED,
    eventChance: 0.35,
  },
  {
    id: 'sleeping_lab',
    kind: 'dungeon',
    main: [8, 9],
    branches: [4, 5],
    packs: ['hv_outer', 'hv_road'],
    packsPerRoom: [1, 2],
    objective: { kind: 'collect', count: 4, item: 'data' },
    boss: { enemy: 'ilse_varga', name: 'enemies.named.ilse_varga', lifeMul: 1, damageMul: 1, affixes: ['sporeSpreader'], script: 'ilse_varga' },
    theme: SLEEPING_LAB,
    eventChance: 0.35,
  },
  {
    id: 'hv_bunker',
    kind: 'bunker',
    main: [3, 4],
    branches: [0, 1],
    packs: ['hv_road', 'hv_sea'],
    packsPerRoom: [1, 1],
    objective: { kind: 'clear' },
    boss: null,
    theme: SEEDVAULT,
    eventChance: 0.2,
  },
  {
    id: 'rd_bunker',
    kind: 'bunker',
    main: [3, 4],
    branches: [0, 1],
    packs: ['rd_road', 'rd_conveyor'],
    packsPerRoom: [1, 1],
    objective: { kind: 'clear' },
    boss: null,
    theme: FOUNDRY,
    eventChance: 0.2,
  },
  {
    id: 'bunker',
    kind: 'bunker',
    main: [3, 4],
    branches: [0, 1],
    packs: ['road', 'military'],
    packsPerRoom: [1, 1],
    objective: { kind: 'clear' },
    boss: null,
    theme: BUNKER,
    eventChance: 0.2,
  },
];

/** Where instances are built: far outside every zone. */
export const INSTANCE_ORIGIN = { x: 2000, z: 0 };
/** Room grid cell (m); walls run along the cell edges. */
export const ROOM_CELL = 26;
