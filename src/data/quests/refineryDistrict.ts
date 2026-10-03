/**
 * Refinery District quests and NPCs (docs/regions/refinery-district.md): 6 main quests, 10 side
 * quests and one mystery. Dialogue and tracker text: lang quests.<id> and npcs.<id>.
 */
import type { z } from 'zod';
import type { NpcDefSchema, QuestDefSchema } from './schema';
import { CINDER_GATE } from '../zones/cinderFlats';
import { CATHEDRAL, COOLANT_WORKS as HUB, CRANE, DELTA, rd } from '../zones/refineryDistrict';

type NpcInput = z.input<typeof NpcDefSchema>;
type QuestInput = z.input<typeof QuestDefSchema>;

const ZONE = 'zone.refinery_district';
const p = (x: number, z: number) => {
  const [a, b] = rd(x, z);
  return { x: a, z: b };
};

const SHRINE = p(-205, 262);
const DEFECTOR = p(-128, 150);
const PREACHER = p(-70, 62);
const DEN = p(122, -128);
const CACHE = p(176, 170);
const RAIL_YARD = p(312, 150);
const BELT_END = p(-326, -64);

/** Hub NPCs around the Coolant Works' centre; −x/−z is screen-up. */
export const REFINERY_NPCS: NpcInput[] = [
  { id: 'mara', zone: ZONE, asset: 'npc.pump_engineer', x: HUB.x - 8, z: HUB.z + 6, facing: 2.4, service: 'technician' },
  { id: 'gus', zone: ZONE, asset: 'npc.cook', x: HUB.x + 6, z: HUB.z - 5, facing: -2.4, scale: 1.05, service: 'vendor' },
  { id: 'ines', zone: ZONE, asset: 'npc.blacksmith', x: HUB.x + 4, z: HUB.z + 11, facing: -2.8, scale: 0.96, service: 'blacksmith' },
  { id: 'tobin', zone: ZONE, asset: 'npc.defector', x: HUB.x + 14, z: HUB.z - 8, facing: -1.6 },
  // Pump Station Delta's engineer moves in once the station is reclaimed.
  { id: 'osei', zone: ZONE, asset: 'npc.technician', x: DELTA.x + 8, z: DELTA.z + 4, facing: -2, requires: 'rd.stronghold.delta' },
  // Quest-only.
  { id: 'rhee', zone: ZONE, asset: 'npc.technician', x: CRANE.x + 22, z: CRANE.z - 16, facing: -0.6, scale: 0.92, questOnly: true },
  { id: 'lenn', zone: ZONE, asset: 'npc.defector', x: PREACHER.x, z: PREACHER.z, facing: 0.8, scale: 0.94, questOnly: true },
];

export const REFINERY_QUESTS: QuestInput[] = [
  // ---- Main quests ---------------------------------------------------------------
  {
    id: 'mq.burning_road',
    zone: ZONE,
    kind: 'main',
    giver: null,
    after: ['mq.the_first'],
    level: 10,
    steps: [
      { kind: 'reach', x: CINDER_GATE.x, z: CINDER_GATE.z, radius: 16, zone: 'zone.cinder_flats' },
      { kind: 'discover', teleporter: 'tp.rdGate' },
      { kind: 'reach', x: HUB.x, z: HUB.z - 8, radius: 14 },
      { kind: 'talk', npc: 'mara' },
    ],
    rewards: { xp: 1100, gold: 160, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.cold_comfort',
    zone: ZONE,
    kind: 'main',
    giver: 'mara',
    after: ['mq.burning_road'],
    level: 11,
    steps: [
      {
        kind: 'interact',
        count: 3,
        // Beside the steam vents around the Coolant Works (they teach the vent warning).
        objects: [
          { id: 'cc.valve.a', x: HUB.x + Math.sin(0.8) * 31, z: HUB.z + Math.cos(0.8) * 31, asset: 'prop.coolant_valve' },
          { id: 'cc.valve.b', x: HUB.x + Math.sin(0.8 + Math.PI / 2) * 31, z: HUB.z + Math.cos(0.8 + Math.PI / 2) * 31, asset: 'prop.coolant_valve' },
          { id: 'cc.valve.c', x: HUB.x + Math.sin(0.8 + Math.PI) * 31, z: HUB.z + Math.cos(0.8 + Math.PI) * 31, asset: 'prop.coolant_valve' },
        ],
      },
      { kind: 'kill', count: 8, near: { x: HUB.x, z: HUB.z, radius: 70 } },
      { kind: 'talk', npc: 'mara' },
    ],
    rewards: { xp: 1300, gold: 180, restoration: 1 },
  },
  {
    id: 'mq.faithful',
    zone: ZONE,
    kind: 'main',
    giver: 'mara',
    after: ['mq.cold_comfort'],
    level: 13,
    steps: [
      { kind: 'talk', npc: 'tobin' },
      { kind: 'reach', ...SHRINE, radius: 14 },
      { kind: 'kill', count: 1, spawn: { enemy: 'smelter_priest', x: SHRINE.x + 4, z: SHRINE.z + 6, name: 'enemies.named.hask', elite: 'rare', escorts: 3 } },
      { kind: 'interact', count: 1, objects: [{ id: 'sermon', x: SHRINE.x - 3, z: SHRINE.z + 3, asset: 'prop.control_terminal', scale: 0.9 }] },
      { kind: 'talk', npc: 'tobin' },
    ],
    rewards: { xp: 1700, gold: 220, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.delta',
    zone: ZONE,
    kind: 'main',
    giver: 'tobin',
    after: ['mq.faithful'],
    level: 15,
    steps: [
      { kind: 'reach', x: DELTA.x - 30, z: DELTA.z + 26, radius: 14 },
      { kind: 'objective', id: 'rd.stronghold.delta', x: DELTA.x, z: DELTA.z },
      { kind: 'talk', npc: 'osei' },
    ],
    rewards: { xp: 2200, gold: 280, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.ashes',
    zone: ZONE,
    kind: 'main',
    giver: 'osei',
    after: ['mq.delta'],
    level: 17,
    steps: [
      { kind: 'reach', ...p(130, 228), radius: 14 },
      { kind: 'objective', id: 'dungeon.cathedral_crypt', ...p(130, 236) },
      { kind: 'talk', npc: 'tobin' },
    ],
    rewards: { xp: 2700, gold: 320, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.vire',
    zone: ZONE,
    kind: 'main',
    giver: 'tobin',
    after: ['mq.ashes'],
    level: 19,
    steps: [
      { kind: 'discover', teleporter: 'tp.cathedral' },
      { kind: 'objective', id: CATHEDRAL.id, x: CATHEDRAL.x, z: CATHEDRAL.z },
      { kind: 'talk', npc: 'mara' },
    ],
    rewards: { xp: 3600, gold: 520, item: 'legendary', restoration: 2 },
  },

  // ---- Side quests ---------------------------------------------------------------
  {
    id: 'sq.defector',
    zone: ZONE,
    kind: 'side',
    giver: 'tobin',
    after: ['mq.faithful'],
    level: 14,
    steps: [
      { kind: 'reach', ...DEFECTOR, radius: 12 },
      {
        kind: 'escort',
        asset: 'enemy.smelter',
        // Down the stack road to the hub gate.
        path: [rd(-128, 150), rd(-100, 110), rd(-75, 70), rd(-60, 20), rd(-105, -48), [HUB.x + 18, HUB.z + 6]],
        life: 800,
        speed: 2.6,
      },
      { kind: 'talk', npc: 'tobin' },
    ],
    rewards: { xp: 900, gold: 140, restoration: 1 },
  },
  {
    id: 'sq.spare_parts',
    zone: ZONE,
    kind: 'side',
    giver: 'ines',
    after: ['mq.cold_comfort'],
    level: 12,
    steps: [
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'bike.engine', ...p(-286, -222), asset: 'prop.cargo_crate', scale: 0.55 },
          { id: 'bike.wheel', ...p(56, -48), asset: 'prop.cargo_crate', scale: 0.55 },
          { id: 'bike.fuel', ...p(-188, -4), asset: 'prop.fuel_tank', scale: 0.4 },
        ],
      },
      { kind: 'talk', npc: 'ines' },
    ],
    rewards: { xp: 800, gold: 60, restoration: 1 },
  },
  {
    id: 'sq.sabotage',
    zone: ZONE,
    kind: 'side',
    giver: 'mara',
    after: ['mq.faithful'],
    level: 16,
    steps: [
      { kind: 'reach', ...CACHE, radius: 12 },
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'cache.a', x: CACHE.x - 5, z: CACHE.z + 3, asset: 'prop.fuel_tank', scale: 0.6 },
          { id: 'cache.b', x: CACHE.x + 4, z: CACHE.z + 5, asset: 'prop.fuel_tank', scale: 0.6 },
          { id: 'cache.c', x: CACHE.x + 1, z: CACHE.z - 5, asset: 'prop.fuel_tank', scale: 0.6 },
        ],
      },
      { kind: 'talk', npc: 'mara' },
    ],
    rewards: { xp: 1200, gold: 200, restoration: 1 },
  },
  {
    id: 'sq.shift_change',
    zone: ZONE,
    kind: 'side',
    giver: 'osei',
    after: ['mq.delta'],
    level: 15,
    steps: [
      { kind: 'interact', count: 3, ids: ['rd.lore.2', 'rd.lore.5', 'rd.lore.8'] },
      { kind: 'talk', npc: 'osei' },
    ],
    rewards: { xp: 1000, gold: 120, item: 'legendary', restoration: 1 },
  },
  {
    id: 'sq.belt_rider',
    zone: ZONE,
    kind: 'side',
    giver: 'gus',
    after: ['mq.cold_comfort'],
    level: 12,
    steps: [
      { kind: 'reach', ...BELT_END, radius: 10 },
      { kind: 'interact', count: 1, objects: [{ id: 'belt.cache', x: BELT_END.x + 3, z: BELT_END.z + 2, asset: 'prop.supply_chest' }] },
      { kind: 'talk', npc: 'gus' },
    ],
    rewards: { xp: 700, gold: 150, item: 'rare' },
  },
  {
    id: 'sq.heat_sick',
    zone: ZONE,
    kind: 'side',
    giver: 'osei',
    after: ['mq.delta'],
    level: 16,
    steps: [
      { kind: 'interact', count: 1, objects: [{ id: 'coolant.canister', ...p(214, -62), asset: 'prop.fuel_tank', scale: 0.4 }] },
      { kind: 'talk', npc: 'osei' },
    ],
    rewards: { xp: 1100, gold: 160, restoration: 1 },
  },
  {
    id: 'sq.crane_operator',
    zone: ZONE,
    kind: 'side',
    giver: 'gus',
    after: ['mq.cold_comfort'],
    level: 13,
    steps: [
      { kind: 'reach', x: CRANE.x + 22, z: CRANE.z - 12, radius: 12 },
      { kind: 'talk', npc: 'rhee' },
      {
        kind: 'interact',
        count: 2,
        objects: [
          { id: 'crane.fuse.a', x: CRANE.x - 14, z: CRANE.z - 14, asset: 'prop.generator', scale: 0.7 },
          { id: 'crane.fuse.b', x: CRANE.x + 14, z: CRANE.z + 6, asset: 'prop.generator', scale: 0.7 },
        ],
      },
      { kind: 'talk', npc: 'rhee' },
    ],
    rewards: { xp: 1000, gold: 140, restoration: 1 },
  },
  {
    id: 'sq.red_hound',
    zone: ZONE,
    kind: 'side',
    giver: 'ines',
    after: ['mq.cold_comfort'],
    level: 14,
    steps: [
      { kind: 'reach', ...DEN, radius: 12 },
      { kind: 'kill', count: 1, spawn: { enemy: 'slag_hound', x: DEN.x + 4, z: DEN.z - 5, name: 'enemies.named.red', elite: 'rare', escorts: 4 } },
      { kind: 'interact', count: 1, objects: [{ id: 'red.collar', x: DEN.x + 2, z: DEN.z - 3, asset: 'prop.echo_relic', scale: 0.3 }] },
      { kind: 'talk', npc: 'ines' },
    ],
    rewards: { xp: 1000, gold: 150, restoration: 1 },
  },
  {
    id: 'sq.choir',
    zone: ZONE,
    kind: 'side',
    giver: 'tobin',
    after: ['mq.faithful'],
    level: 15,
    steps: [
      { kind: 'reach', x: PREACHER.x, z: PREACHER.z + 4, radius: 10 },
      {
        kind: 'choice',
        npc: 'lenn',
        options: [
          { id: 'expose', gold: 260, xp: 300 },
          { id: 'release', item: 'rare', xp: 300 },
        ],
      },
    ],
    rewards: { xp: 500, gold: 0, restoration: 1 },
  },
  {
    id: 'sq.last_shipment',
    zone: ZONE,
    kind: 'side',
    giver: null,
    trigger: { poi: 'rd.lore.10' },
    level: 17,
    steps: [
      { kind: 'interact', count: 1, ids: ['rd.lore.1'] },
      { kind: 'reach', ...RAIL_YARD, radius: 12 },
      { kind: 'interact', count: 1, objects: [{ id: 'rail.manifest', x: RAIL_YARD.x + 3, z: RAIL_YARD.z, asset: 'prop.control_terminal' }] },
      { kind: 'talk', npc: 'mara' },
    ],
    rewards: { xp: 1300, gold: 200, item: 'legendary', restoration: 1 },
  },

  // ---- Mystery -----------------------------------------------------------------------
  {
    id: 'my.fireproof',
    zone: ZONE,
    kind: 'mystery',
    giver: null,
    trigger: { object: { id: 'fireproof.prints', ...p(284, 12), asset: 'prop.echo_relic', scale: 0.25 } },
    level: 16,
    steps: [
      { kind: 'reach', ...p(262, -36), radius: 9, marker: false },
      { kind: 'reach', ...p(232, -98), radius: 9, marker: false },
      { kind: 'reach', ...p(258, -158), radius: 9, marker: false },
      { kind: 'interact', count: 1, objects: [{ id: 'fireproof.cache', x: p(258, -158).x + 3, z: p(258, -158).z + 3, asset: 'prop.supply_chest' }], marker: false },
    ],
    rewards: { xp: 1400, gold: 260, item: 'legendary', restoration: 1 },
  },
];
