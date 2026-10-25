/**
 * Repeatable bounties (C013): three per region, offered by hub NPCs once the region's campaign is
 * done. A finished bounty comes back when the player re-enters its region (resetBounties in
 * systems/quests.ts). They pay gold, XP (scaled by the World Tier like every quest), a guaranteed
 * rare and Lumen Dust or Rift Shards. Text: lang quests.bt.<id> and enemies.named.*.
 * The ids after `bt.` start with the region's short name.
 */
import type { z } from 'zod';
import type { QuestDefSchema } from './schema';
import { at } from '../zones/cinderFlats';
import { rd } from '../zones/refineryDistrict';
import { hv } from '../zones/hydroponicVaults';
import { dm } from '../zones/deepMines';
import { cr } from '../zones/theCore';

type QuestInput = z.input<typeof QuestDefSchema>;

const pt = (f: (x: number, z: number) => [number, number], x: number, z: number) => {
  const [a, b] = f(x, z);
  return { x: a, z: b };
};

/** Three crates to open at a spot (the same shape in every region). */
const crates = (prefix: string, c: { x: number; z: number }, asset: string, scale: number) => [
  { id: `${prefix}.a`, x: c.x - 6, z: c.z + 4, asset, scale },
  { id: `${prefix}.b`, x: c.x + 5, z: c.z - 6, asset, scale },
  { id: `${prefix}.c`, x: c.x + 2, z: c.z + 9, asset, scale },
];

const CF = { zone: 'zone.cinder_flats', after: ['mq.the_first'] };
const RD = { zone: 'zone.refinery_district', after: ['mq.vire'] };
const HV = { zone: 'zone.hydroponic_vaults', after: ['mq.mother_tree'] };
const DM = { zone: 'zone.deep_mines', after: ['mq.governor'] };
const CORE = { zone: 'zone.the_core', after: ['mq.one_who_remembers'] };

const CONVOY = pt(at, 40, 18);
const CACHE = pt(rd, 176, 170);
const DEN = pt(rd, 122, -128);
const SEED_BANK = pt(hv, 272, 188);
const NEST = pt(hv, -232, 72);
const WORKINGS = pt(dm, 80, -120);
const LAKE_SHORE = pt(dm, 214, 18);
const BORDERLAND = pt(cr, 0, -232);
const DARK = pt(cr, 130, -40);
const ROAD = pt(at, -128, 168);

export const BOUNTY_QUESTS: QuestInput[] = [
  // ---- Cinder Flats: Outpost Ember ----------------------------------------------
  {
    id: 'bt.cf_drones',
    kind: 'side',
    repeatable: true,
    ...CF,
    giver: 'hekla',
    level: 10,
    steps: [{ kind: 'kill', count: 10, enemy: 'security_drone' }, { kind: 'talk', npc: 'hekla' }],
    rewards: { xp: 420, gold: 90, item: 'rare', dust: 4 },
  },
  {
    id: 'bt.cf_salvage',
    kind: 'side',
    repeatable: true,
    ...CF,
    giver: 'benny',
    level: 10,
    steps: [
      { kind: 'reach', ...CONVOY, radius: 14 },
      { kind: 'interact', count: 3, objects: crates('bt.cf.salvage', CONVOY, 'prop.cargo_crate', 0.5) },
      { kind: 'kill', count: 6, enemy: 'spore_hound' },
      { kind: 'talk', npc: 'benny' },
    ],
    rewards: { xp: 480, gold: 100, item: 'rare', shards: 2 },
  },
  {
    id: 'bt.cf_sergeant',
    kind: 'side',
    repeatable: true,
    ...CF,
    giver: 'pell',
    level: 11,
    steps: [
      { kind: 'kill', count: 1, spawn: { enemy: 'sergeant', x: ROAD.x + 8, z: ROAD.z - 4, name: 'enemies.named.bt_sergeant', elite: 'rare', escorts: 3 } },
      { kind: 'talk', npc: 'pell' },
    ],
    rewards: { xp: 560, gold: 120, item: 'rare', dust: 6, shards: 2 },
  },
  // ---- Refinery District: the Coolant Works --------------------------------------
  {
    id: 'bt.rd_smelters',
    kind: 'side',
    repeatable: true,
    ...RD,
    giver: 'gus',
    level: 17,
    steps: [{ kind: 'kill', count: 10, enemy: 'smelter' }, { kind: 'talk', npc: 'gus' }],
    rewards: { xp: 1300, gold: 190, item: 'rare', dust: 5 },
  },
  {
    id: 'bt.rd_belts',
    kind: 'side',
    repeatable: true,
    ...RD,
    giver: 'ines',
    level: 17,
    steps: [
      { kind: 'reach', ...CACHE, radius: 14 },
      { kind: 'interact', count: 3, objects: crates('bt.rd.belts', CACHE, 'prop.fuel_tank', 0.6) },
      { kind: 'kill', count: 8, enemy: 'welder' },
      { kind: 'talk', npc: 'ines' },
    ],
    rewards: { xp: 1450, gold: 210, item: 'rare', shards: 3 },
  },
  {
    id: 'bt.rd_slagborn',
    kind: 'side',
    repeatable: true,
    ...RD,
    giver: 'mara',
    level: 18,
    steps: [
      { kind: 'kill', count: 1, spawn: { enemy: 'slagborn', x: DEN.x + 5, z: DEN.z - 4, name: 'enemies.named.bt_slagborn', elite: 'rare', escorts: 3 } },
      { kind: 'talk', npc: 'mara' },
    ],
    rewards: { xp: 1700, gold: 250, item: 'rare', dust: 6, shards: 3 },
  },
  // ---- Hydroponic Vaults: Lab 9 --------------------------------------------------
  {
    id: 'bt.hv_botanists',
    kind: 'side',
    repeatable: true,
    ...HV,
    giver: 'quill',
    level: 26,
    steps: [{ kind: 'kill', count: 8, enemy: 'mutated_botanist' }, { kind: 'talk', npc: 'quill' }],
    rewards: { xp: 2300, gold: 280, item: 'rare', dust: 6 },
  },
  {
    id: 'bt.hv_seeds',
    kind: 'side',
    repeatable: true,
    ...HV,
    giver: 'brann',
    level: 26,
    steps: [
      { kind: 'reach', ...SEED_BANK, radius: 16 },
      { kind: 'interact', count: 3, objects: crates('bt.hv.seeds', SEED_BANK, 'prop.supply_chest', 0.9) },
      { kind: 'kill', count: 8, enemy: 'vine_weaver' },
      { kind: 'talk', npc: 'brann' },
    ],
    rewards: { xp: 2500, gold: 310, item: 'rare', shards: 4 },
  },
  {
    id: 'bt.hv_warden',
    kind: 'side',
    repeatable: true,
    ...HV,
    giver: 'dace',
    level: 27,
    steps: [
      { kind: 'kill', count: 1, spawn: { enemy: 'cocoon_warden', x: NEST.x + 5, z: NEST.z - 4, name: 'enemies.named.bt_cocoon', elite: 'rare', escorts: 3 } },
      { kind: 'talk', npc: 'dace' },
    ],
    rewards: { xp: 2900, gold: 360, item: 'rare', dust: 8, shards: 4 },
  },
  // ---- Deep Mines: Station Zero --------------------------------------------------
  {
    id: 'bt.dm_burrowers',
    kind: 'side',
    repeatable: true,
    ...DM,
    giver: 'oona',
    level: 35,
    steps: [{ kind: 'kill', count: 8, enemy: 'burrower' }, { kind: 'talk', npc: 'oona' }],
    rewards: { xp: 3200, gold: 620, item: 'rare', dust: 8 },
  },
  {
    id: 'bt.dm_ore',
    kind: 'side',
    repeatable: true,
    ...DM,
    giver: 'gerd',
    level: 35,
    steps: [
      { kind: 'reach', ...WORKINGS, radius: 14 },
      { kind: 'interact', count: 3, objects: crates('bt.dm.ore', WORKINGS, 'prop.supply_chest', 0.9) },
      { kind: 'kill', count: 8, enemy: 'crystal_walker' },
      { kind: 'talk', npc: 'gerd' },
    ],
    rewards: { xp: 3500, gold: 680, item: 'rare', shards: 5 },
  },
  {
    id: 'bt.dm_crusher',
    kind: 'side',
    repeatable: true,
    ...DM,
    giver: 'nils',
    level: 36,
    steps: [
      { kind: 'kill', count: 1, spawn: { enemy: 'ore_crusher', x: LAKE_SHORE.x + 5, z: LAKE_SHORE.z + 4, name: 'enemies.named.bt_crusher', elite: 'rare', escorts: 3 } },
      { kind: 'talk', npc: 'nils' },
    ],
    rewards: { xp: 3900, gold: 780, item: 'rare', dust: 10, shards: 5 },
  },
  // ---- The Core: the Last Camp ---------------------------------------------------
  {
    id: 'bt.core_drones',
    kind: 'side',
    repeatable: true,
    ...CORE,
    giver: 'gus_core',
    level: 45,
    steps: [{ kind: 'kill', count: 10, enemy: 'shade_drone' }, { kind: 'talk', npc: 'gus_core' }],
    rewards: { xp: 4800, gold: 1300, item: 'rare', dust: 10 },
  },
  {
    id: 'bt.core_cache',
    kind: 'side',
    repeatable: true,
    ...CORE,
    giver: 'hekla_core',
    level: 45,
    steps: [
      { kind: 'reach', ...BORDERLAND, radius: 16 },
      { kind: 'interact', count: 3, objects: crates('bt.core.cache', BORDERLAND, 'prop.supply_chest', 0.9) },
      { kind: 'kill', count: 8, enemy: 'shade_hound' },
      { kind: 'talk', npc: 'hekla_core' },
    ],
    rewards: { xp: 5200, gold: 1400, item: 'rare', shards: 6 },
  },
  {
    id: 'bt.core_sentinel',
    kind: 'side',
    repeatable: true,
    ...CORE,
    giver: 'dace_core',
    level: 46,
    steps: [
      { kind: 'kill', count: 1, spawn: { enemy: 'shade_sentinel', x: DARK.x + 6, z: DARK.z + 4, name: 'enemies.named.bt_sentinel', elite: 'rare', escorts: 3 } },
      { kind: 'talk', npc: 'dace_core' },
    ],
    rewards: { xp: 6000, gold: 1600, item: 'rare', dust: 12, shards: 6 },
  },
];
