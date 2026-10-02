/**
 * Instanced dungeons and bunkers (docs/world-and-gameplay.md §6): themed modular rooms laid out
 * from a seed, a main objective that opens the boss room, and a final boss (bunkers: a cache).
 */
import type { EliteAffix } from './elites';

export type InstanceObjective =
  /** Power up generators; each charges while enemies attack. */
  | { kind: 'activate'; count: number; charge: number; wave: number }
  /** Find keycards in side rooms. */
  | { kind: 'collect'; count: number }
  /** Destroy spore nests (they keep spawning while alive). */
  | { kind: 'destroy'; count: number; life: number; spawnEvery: number }
  /** Kill everything. */
  | { kind: 'clear' };

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
