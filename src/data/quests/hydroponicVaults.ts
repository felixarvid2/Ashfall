/**
 * Hydroponic Vaults quests and NPCs (docs/regions/hydroponic-vaults.md): 6 main quests, 10 side
 * quests and one mystery. Dialogue and tracker text: lang quests.<id> and npcs.<id>.
 * The Mother Tree's burn-or-spare choice is kept in the finished-quest record (quests.done).
 */
import type { z } from 'zod';
import type { NpcDefSchema, QuestDefSchema } from './schema';
import { VAULTS_ROAD_GATE } from '../zones/refineryDistrict';
import { AIR_FILTERS, DAM, GAMMA, GREAT_DOME, LAB9 as HUB, TREE_FOOT, hv } from '../zones/hydroponicVaults';

type NpcInput = z.input<typeof NpcDefSchema>;
type QuestInput = z.input<typeof QuestDefSchema>;

const ZONE = 'zone.hydroponic_vaults';
const p = (x: number, z: number) => {
  const [a, b] = hv(x, z);
  return { x: a, z: b };
};

const FILTER = AIR_FILTERS[0]!;
const RESEARCHER = p(-96, -170);
const NEST = p(-232, 72);
const PATROL = p(-206, -96);
const SEED_BANK = p(272, 188);
const GARDEN = p(-64, -214);

/** Lab 9's people around the hub centre; −x/−z is screen-up. */
export const VAULTS_NPCS: NpcInput[] = [
  { id: 'okafor', zone: ZONE, asset: 'npc.technician', x: HUB.x - 7, z: HUB.z + 6, facing: 2.4 },
  { id: 'quill', zone: ZONE, asset: 'npc.cook', x: HUB.x + 7, z: HUB.z - 4, facing: -2.4, scale: 1.04, service: 'vendor' },
  { id: 'brann', zone: ZONE, asset: 'npc.blacksmith', x: HUB.x + 5, z: HUB.z + 10, facing: -2.8, service: 'blacksmith' },
  { id: 'dace', zone: ZONE, asset: 'npc.pump_engineer', x: HUB.x - 12, z: HUB.z + 0.5, facing: 0, scale: 0.95, service: 'technician' },
  // Corporal Ruiz and his squad hold Dome Gamma once it is reclaimed.
  { id: 'ruiz', zone: ZONE, asset: 'enemy.sergeant', x: GAMMA.x + 8, z: GAMMA.z + 4, facing: -2, scale: 0.9, requires: GAMMA.id },
  // Quest-only.
  { id: 'halvorsen', zone: ZONE, asset: 'npc.defector', x: RESEARCHER.x, z: RESEARCHER.z, facing: 0.6, scale: 0.94, questOnly: true },
  { id: 'okafor_tree', zone: ZONE, asset: 'npc.technician', x: TREE_FOOT.x + 3, z: TREE_FOOT.z - 2, facing: 0, questOnly: true },
];

export const VAULTS_QUESTS: QuestInput[] = [
  // ---- Main quests ---------------------------------------------------------------
  {
    id: 'mq.green_door',
    zone: ZONE,
    kind: 'main',
    giver: null,
    after: ['mq.vire'],
    level: 20,
    steps: [
      { kind: 'reach', x: VAULTS_ROAD_GATE.x, z: VAULTS_ROAD_GATE.z, radius: 16, zone: 'zone.refinery_district' },
      { kind: 'discover', teleporter: 'tp.hvGate' },
      { kind: 'reach', x: HUB.x, z: HUB.z - 8, radius: 14 },
      { kind: 'talk', npc: 'okafor' },
    ],
    rewards: { xp: 4200, gold: 420, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.clean_air',
    zone: ZONE,
    kind: 'main',
    giver: 'okafor',
    after: ['mq.green_door'],
    level: 21,
    steps: [
      { kind: 'interact', count: 1, ids: [FILTER.id] },
      { kind: 'kill', count: 10, near: { x: FILTER.x, z: FILTER.z, radius: 60 } },
      { kind: 'talk', npc: 'okafor' },
    ],
    rewards: { xp: 4600, gold: 460, restoration: 1 },
  },
  {
    id: 'mq.okafors_seeds',
    zone: ZONE,
    kind: 'main',
    giver: 'okafor',
    after: ['mq.clean_air'],
    level: 23,
    steps: [
      { kind: 'reach', x: SEED_BANK.x - 10, z: SEED_BANK.z - 10, radius: 14 },
      { kind: 'objective', id: 'dungeon.seed_bank_depths', ...SEED_BANK },
      { kind: 'talk', npc: 'okafor' },
    ],
    rewards: { xp: 5400, gold: 520, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.gamma',
    zone: ZONE,
    kind: 'main',
    giver: 'okafor',
    after: ['mq.okafors_seeds'],
    level: 25,
    steps: [
      { kind: 'reach', x: GAMMA.x + 40, z: GAMMA.z + 40, radius: 16 },
      { kind: 'objective', id: GAMMA.id, x: GAMMA.x, z: GAMMA.z },
      { kind: 'talk', npc: 'ruiz' },
    ],
    rewards: { xp: 6400, gold: 600, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.sleepers',
    zone: ZONE,
    kind: 'main',
    giver: 'ruiz',
    after: ['mq.gamma'],
    level: 27,
    steps: [
      { kind: 'reach', ...p(-20, -262), radius: 14 },
      { kind: 'objective', id: 'dungeon.sleeping_lab', ...p(-20, -272) },
      { kind: 'talk', npc: 'okafor' },
    ],
    rewards: { xp: 7600, gold: 700, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.mother_tree',
    zone: ZONE,
    kind: 'main',
    giver: 'okafor',
    after: ['mq.sleepers'],
    level: 29,
    steps: [
      { kind: 'discover', teleporter: 'tp.roots' },
      { kind: 'objective', id: GREAT_DOME.id, x: GREAT_DOME.x, z: GREAT_DOME.z },
      {
        kind: 'choice',
        npc: 'okafor_tree',
        options: [
          // Burn it: the Vaults are safe, the research is ash.
          { id: 'burn', xp: 2000, unique: 'ashen_heartwood' },
          // Spare it: Okafor tries to talk to it. She follows you into the Deep Mines.
          { id: 'spare', xp: 2000, unique: 'seed_of_accord' },
        ],
      },
    ],
    rewards: { xp: 9000, gold: 1100, item: 'legendary', restoration: 2 },
  },

  // ---- Side quests ---------------------------------------------------------------
  {
    id: 'sq.samples',
    zone: ZONE,
    kind: 'side',
    giver: 'okafor',
    after: ['mq.green_door'],
    level: 21,
    steps: [
      {
        kind: 'interact',
        count: 5,
        objects: [
          { id: 'sample.a', ...p(40, -150), asset: 'prop.lumen_growth', scale: 0.35 },
          { id: 'sample.b', ...p(-20, -180), asset: 'prop.lumen_growth', scale: 0.35 },
          { id: 'sample.c', ...p(-70, -240), asset: 'prop.lumen_growth', scale: 0.35 },
          { id: 'sample.d', ...p(10, -100), asset: 'prop.lumen_growth', scale: 0.35 },
          { id: 'sample.e', ...p(70, -110), asset: 'prop.lumen_growth', scale: 0.35 },
        ],
      },
      { kind: 'talk', npc: 'okafor' },
    ],
    rewards: { xp: 1600, gold: 180, restoration: 1 },
  },
  {
    id: 'sq.infected_researcher',
    zone: ZONE,
    kind: 'side',
    giver: 'okafor',
    after: ['mq.clean_air'],
    level: 22,
    steps: [
      { kind: 'reach', x: RESEARCHER.x, z: RESEARCHER.z + 4, radius: 10 },
      {
        kind: 'choice',
        npc: 'halvorsen',
        options: [
          { id: 'save', xp: 500, item: 'rare' },
          { id: 'mercy', xp: 500, gold: 380 },
        ],
      },
    ],
    rewards: { xp: 900, gold: 0, restoration: 1 },
  },
  {
    id: 'sq.melody',
    zone: ZONE,
    kind: 'side',
    giver: 'quill',
    after: ['mq.clean_air'],
    level: 22,
    steps: [
      { kind: 'reach', ...p(-120, -60), radius: 10 },
      { kind: 'reach', ...p(-190, 10), radius: 10 },
      { kind: 'interact', count: 1, objects: [{ id: 'melody.box', ...p(-236, 46), asset: 'prop.echo_relic', scale: 0.3 }] },
      { kind: 'talk', npc: 'quill' },
    ],
    rewards: { xp: 1700, gold: 220, item: 'rare', restoration: 1 },
  },
  {
    id: 'sq.dam_repair',
    zone: ZONE,
    kind: 'side',
    giver: 'dace',
    after: ['mq.clean_air'],
    level: 23,
    steps: [
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'dam.valve.a', x: DAM.x - 27, z: DAM.z - 9, asset: 'prop.coolant_valve' },
          { id: 'dam.valve.b', x: DAM.x + 4, z: DAM.z + 18, asset: 'prop.coolant_valve' },
          { id: 'dam.valve.c', x: DAM.x + 26, z: DAM.z - 8, asset: 'prop.coolant_valve' },
        ],
      },
      { kind: 'kill', count: 8, near: { x: DAM.x, z: DAM.z, radius: 60 } },
      { kind: 'talk', npc: 'dace' },
    ],
    rewards: { xp: 1900, gold: 240, restoration: 1 },
  },
  {
    id: 'sq.swarm_queen',
    zone: ZONE,
    kind: 'side',
    giver: 'brann',
    after: ['mq.clean_air'],
    level: 24,
    steps: [
      { kind: 'reach', ...NEST, radius: 12 },
      { kind: 'kill', count: 1, spawn: { enemy: 'spore_swarm', x: NEST.x + 4, z: NEST.z - 4, name: 'enemies.named.swarm_queen', elite: 'rare', escorts: 5 } },
      { kind: 'talk', npc: 'brann' },
    ],
    rewards: { xp: 2000, gold: 260, item: 'rare', restoration: 1 },
  },
  {
    id: 'sq.lost_harvest',
    zone: ZONE,
    kind: 'side',
    giver: 'quill',
    after: ['mq.green_door'],
    level: 21,
    steps: [
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'harvest.a', ...p(-30, -206), asset: 'prop.cargo_crate', scale: 0.55 },
          { id: 'harvest.b', ...p(-96, -228), asset: 'prop.cargo_crate', scale: 0.55 },
          { id: 'harvest.c', ...p(20, -232), asset: 'prop.cargo_crate', scale: 0.55 },
        ],
      },
      { kind: 'talk', npc: 'quill' },
    ],
    rewards: { xp: 1400, gold: 240 },
  },
  {
    id: 'sq.crystal_light',
    zone: ZONE,
    kind: 'side',
    giver: 'dace',
    after: ['mq.clean_air'],
    level: 22,
    steps: [
      // Enemies stunned by a shattered crystal.
      { kind: 'interact', count: 10, poiKind: 'blinded', marker: false },
      { kind: 'talk', npc: 'dace' },
    ],
    rewards: { xp: 1700, gold: 200, restoration: 1 },
  },
  {
    id: 'sq.seed_courier',
    zone: ZONE,
    kind: 'side',
    giver: 'okafor',
    after: ['mq.okafors_seeds'],
    level: 24,
    steps: [
      { kind: 'reach', ...p(100, 40), radius: 12 },
      {
        kind: 'escort',
        asset: 'npc.technician',
        // Along the east ring road to the Seed Bank doors.
        path: [hv(100, 40), hv(160, 80), hv(205, 110), hv(250, 150), hv(262, 176)],
        life: 1400,
        speed: 2.6,
      },
      { kind: 'talk', npc: 'okafor' },
    ],
    rewards: { xp: 2200, gold: 280, restoration: 1 },
  },
  {
    id: 'sq.overgrown_patrol',
    zone: ZONE,
    kind: 'side',
    giver: 'ruiz',
    after: ['mq.gamma'],
    level: 26,
    steps: [
      { kind: 'reach', ...PATROL, radius: 12 },
      { kind: 'kill', count: 1, spawn: { enemy: 'overgrown_walker', x: PATROL.x + 4, z: PATROL.z + 4, name: 'enemies.named.thorn', elite: 'rare', escorts: 4 } },
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'patrol.tag.a', x: PATROL.x + 2, z: PATROL.z + 2, asset: 'prop.echo_relic', scale: 0.25 },
          { id: 'patrol.tag.b', ...p(-226, -70), asset: 'prop.echo_relic', scale: 0.25 },
          { id: 'patrol.tag.c', ...p(-190, -122), asset: 'prop.echo_relic', scale: 0.25 },
        ],
      },
      { kind: 'talk', npc: 'ruiz' },
    ],
    rewards: { xp: 2400, gold: 300, item: 'legendary', restoration: 1 },
  },
  {
    id: 'sq.cold_storage',
    zone: ZONE,
    kind: 'side',
    giver: 'brann',
    after: ['mq.okafors_seeds'],
    level: 25,
    steps: [
      {
        kind: 'interact',
        count: 2,
        objects: [
          { id: 'freezer.gen.a', x: SEED_BANK.x - 18, z: SEED_BANK.z - 8, asset: 'prop.generator', scale: 0.7 },
          { id: 'freezer.gen.b', x: SEED_BANK.x + 12, z: SEED_BANK.z - 20, asset: 'prop.generator', scale: 0.7 },
        ],
      },
      { kind: 'interact', count: 1, ids: ['hv.lore.9'] },
      { kind: 'talk', npc: 'brann' },
    ],
    rewards: { xp: 2100, gold: 260, restoration: 1 },
  },

  // ---- Mystery -----------------------------------------------------------------------
  {
    id: 'my.gardener',
    zone: ZONE,
    kind: 'mystery',
    giver: null,
    trigger: { object: { id: 'gardener.row', ...GARDEN, asset: 'prop.lumen_growth', scale: 0.3 } },
    level: 24,
    steps: [
      { kind: 'reach', ...p(-100, -250), radius: 9, marker: false },
      { kind: 'reach', ...p(-140, -280), radius: 9, marker: false },
      { kind: 'reach', ...p(-176, -262), radius: 9, marker: false },
      { kind: 'interact', count: 1, objects: [{ id: 'gardener.cache', x: p(-176, -262).x + 3, z: p(-176, -262).z + 3, asset: 'prop.supply_chest' }], marker: false },
    ],
    rewards: { xp: 2600, gold: 420, item: 'legendary', restoration: 1 },
  },
];
