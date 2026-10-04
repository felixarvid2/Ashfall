/**
 * Deep Mines quests and NPCs (docs/regions/deep-mines.md): 6 main quests, 10 side quests (the
 * follower's own quest depends on the Mother Tree choice) and one mystery. Text: lang quests.<id>
 * and npcs.<id>.
 */
import type { z } from 'zod';
import type { NpcDefSchema, QuestDefSchema } from './schema';
import { LIFT_GATE } from '../zones/hydroponicVaults';
import { AURUM, DRILL_CONTROL, ELDER_GATE, FLOODLIGHTS, ZERO as HUB, dm } from '../zones/deepMines';

type NpcInput = z.input<typeof NpcDefSchema>;
type QuestInput = z.input<typeof QuestDefSchema>;

const ZONE = 'zone.deep_mines';
const p = (x: number, z: number) => {
  const [a, b] = dm(x, z);
  return { x: a, z: b };
};

const LIGHT = FLOODLIGHTS[0]!;
const CREW = p(-262, -40);
const LAKE_SHORE = p(214, 18);
const CAVES = p(-210, 40);
const SHAFTS = p(0, -160);
const ELDER = p(0, 238);
const WORKINGS = p(80, -120);

/** Station Zero's people; −x/−z is screen-up. */
export const MINES_NPCS: NpcInput[] = [
  { id: 'brask', zone: ZONE, asset: 'npc.pump_engineer', x: HUB.x + 2, z: HUB.z + 3, facing: 2.6 },
  { id: 'oona', zone: ZONE, asset: 'npc.cook', x: HUB.x - 6, z: HUB.z + 8, facing: 2, scale: 1.02, service: 'vendor' },
  { id: 'gerd', zone: ZONE, asset: 'npc.blacksmith', x: HUB.x + 9, z: HUB.z + 1, facing: -2.2, service: 'blacksmith' },
  { id: 'nils', zone: ZONE, asset: 'npc.technician', x: HUB.x - 5, z: HUB.z - 1, facing: 1.6, scale: 0.96, service: 'technician' },
  // Who followed you down from the Vaults (the Mother Tree choice).
  { id: 'okafor_mines', zone: ZONE, asset: 'npc.technician', x: HUB.x + 7, z: HUB.z + 9, facing: -2.6, choice: { quest: 'mq.mother_tree', option: 'spare' } },
  { id: 'ruiz_mines', zone: ZONE, asset: 'enemy.sergeant', x: HUB.x + 7, z: HUB.z + 9, facing: -2.6, scale: 0.9, choice: { quest: 'mq.mother_tree', option: 'burn' } },
  // The miners move into Mining Station Aurum once it is reclaimed.
  { id: 'vasquez', zone: ZONE, asset: 'npc.defector', x: AURUM.x + 7, z: AURUM.z - 4, facing: -1.8, requires: AURUM.id },
];

export const MINES_QUESTS: QuestInput[] = [
  // ---- Main quests ---------------------------------------------------------------
  {
    id: 'mq.going_down',
    zone: ZONE,
    kind: 'main',
    giver: null,
    after: ['mq.mother_tree'],
    level: 30,
    steps: [
      { kind: 'reach', x: LIFT_GATE.x, z: LIFT_GATE.z - 10, radius: 16, zone: 'zone.hydroponic_vaults' },
      { kind: 'discover', teleporter: 'tp.lift' },
      { kind: 'reach', x: HUB.x, z: HUB.z + 6, radius: 14 },
      { kind: 'talk', npc: 'brask' },
    ],
    rewards: { xp: 11000, gold: 1200, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.lights_in_the_dark',
    zone: ZONE,
    kind: 'main',
    giver: 'brask',
    after: ['mq.going_down'],
    level: 31,
    steps: [
      { kind: 'interact', count: 1, ids: [LIGHT.id] },
      { kind: 'kill', count: 10, near: { x: LIGHT.x, z: LIGHT.z, radius: 60 } },
      { kind: 'talk', npc: 'brask' },
    ],
    rewards: { xp: 12000, gold: 1300, restoration: 1 },
  },
  {
    id: 'mq.missing_shift',
    zone: ZONE,
    kind: 'main',
    giver: 'brask',
    after: ['mq.lights_in_the_dark'],
    level: 32,
    steps: [
      { kind: 'reach', ...p(-90, -214), radius: 16 },
      { kind: 'objective', id: 'dungeon.shaft_13', ...p(-100, -230) },
      { kind: 'talk', npc: 'brask' },
    ],
    rewards: { xp: 13500, gold: 1450, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.aurum',
    zone: ZONE,
    kind: 'main',
    giver: 'brask',
    after: ['mq.missing_shift'],
    level: 34,
    steps: [
      { kind: 'reach', ...p(170, -202), radius: 14 },
      { kind: 'objective', id: AURUM.id, x: AURUM.x, z: AURUM.z },
      { kind: 'talk', npc: 'vasquez' },
    ],
    rewards: { xp: 15500, gold: 1650, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.elder_gate',
    zone: ZONE,
    kind: 'main',
    giver: 'vasquez',
    after: ['mq.aurum'],
    level: 36,
    steps: [
      { kind: 'reach', x: ELDER_GATE.x, z: ELDER_GATE.z, radius: 14 },
      { kind: 'objective', id: 'dungeon.archive', ...p(-90, 290) },
      { kind: 'talk', npc: 'brask' },
    ],
    rewards: { xp: 17500, gold: 1850, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.governor',
    zone: ZONE,
    kind: 'main',
    giver: 'brask',
    after: ['mq.elder_gate'],
    level: 39,
    steps: [
      { kind: 'discover', teleporter: 'tp.lake' },
      { kind: 'objective', id: DRILL_CONTROL.id, x: DRILL_CONTROL.x, z: DRILL_CONTROL.z },
      { kind: 'talk', npc: 'brask' },
    ],
    rewards: { xp: 22000, gold: 2600, item: 'legendary', restoration: 2 },
  },

  // ---- Side quests ---------------------------------------------------------------
  {
    id: 'sq.lost_crew',
    zone: ZONE,
    kind: 'side',
    giver: 'brask',
    after: ['mq.going_down'],
    level: 31,
    steps: [
      { kind: 'reach', ...CREW, radius: 14 },
      {
        kind: 'interact',
        count: 4,
        objects: [
          { id: 'crew.lamp.a', x: CREW.x - 8, z: CREW.z + 4, asset: 'prop.emergency_light', scale: 0.6 },
          { id: 'crew.lamp.b', x: CREW.x + 7, z: CREW.z + 6, asset: 'prop.emergency_light', scale: 0.6 },
          { id: 'crew.lamp.c', x: CREW.x + 2, z: CREW.z - 9, asset: 'prop.emergency_light', scale: 0.6 },
          { id: 'crew.lamp.d', x: CREW.x - 10, z: CREW.z - 6, asset: 'prop.emergency_light', scale: 0.6 },
        ],
      },
      { kind: 'talk', npc: 'brask' },
    ],
    rewards: { xp: 4200, gold: 520, restoration: 1 },
  },
  {
    id: 'sq.shortcuts',
    zone: ZONE,
    kind: 'side',
    giver: 'nils',
    after: ['mq.going_down'],
    level: 31,
    steps: [
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'lift.panel.shafts', ...p(10, -170), asset: 'prop.control_terminal', scale: 0.9 },
          { id: 'lift.panel.caves', ...p(-188, 66), asset: 'prop.control_terminal', scale: 0.9 },
          { id: 'lift.panel.lake', ...p(178, 50), asset: 'prop.control_terminal', scale: 0.9 },
        ],
      },
      { kind: 'talk', npc: 'nils' },
    ],
    rewards: { xp: 4500, gold: 560, restoration: 1 },
  },
  {
    id: 'sq.rosetta',
    zone: ZONE,
    kind: 'side',
    giver: 'nils',
    after: ['mq.lights_in_the_dark'],
    level: 34,
    steps: [
      { kind: 'interact', count: 3, ids: ['dm.lore.8', 'dm.lore.9', 'dm.lore.10'] },
      {
        kind: 'interact',
        count: 2,
        objects: [
          { id: 'glyph.a', ...p(-30, 254), asset: 'env.wall_segment', scale: 0.6 },
          { id: 'glyph.b', ...p(24, 250), asset: 'env.wall_segment', scale: 0.6 },
        ],
      },
      { kind: 'talk', npc: 'nils' },
    ],
    rewards: { xp: 6200, gold: 700, item: 'legendary', restoration: 1 },
  },
  {
    id: 'sq.blind_one',
    zone: ZONE,
    kind: 'side',
    giver: 'gerd',
    after: ['mq.lights_in_the_dark'],
    level: 33,
    steps: [
      { kind: 'reach', ...LAKE_SHORE, radius: 14 },
      { kind: 'kill', count: 1, spawn: { enemy: 'blind_hound', x: LAKE_SHORE.x + 4, z: LAKE_SHORE.z + 4, name: 'enemies.named.old_ears', elite: 'rare', escorts: 5 } },
      { kind: 'talk', npc: 'gerd' },
    ],
    rewards: { xp: 5200, gold: 640, item: 'rare', restoration: 1 },
  },
  {
    id: 'sq.dynamite',
    zone: ZONE,
    kind: 'side',
    giver: 'oona',
    after: ['mq.going_down'],
    level: 32,
    steps: [
      { kind: 'kill', count: 6, enemy: 'infected_miner' },
      { kind: 'interact', count: 1, objects: [{ id: 'dynamite.cache', x: WORKINGS.x + 4, z: WORKINGS.z + 3, asset: 'prop.supply_chest' }] },
      { kind: 'talk', npc: 'oona' },
    ],
    rewards: { xp: 4600, gold: 620 },
  },
  {
    id: 'sq.crystal_song',
    zone: ZONE,
    kind: 'side',
    giver: 'nils',
    after: ['mq.lights_in_the_dark'],
    level: 33,
    steps: [
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'song.a', x: CAVES.x - 16, z: CAVES.z + 10, asset: 'prop.lumen_growth', scale: 1.2 },
          { id: 'song.b', x: CAVES.x + 18, z: CAVES.z - 6, asset: 'prop.lumen_growth', scale: 1.2 },
          { id: 'song.c', x: CAVES.x + 2, z: CAVES.z + 22, asset: 'prop.lumen_growth', scale: 1.2 },
        ],
      },
      { kind: 'talk', npc: 'nils' },
    ],
    rewards: { xp: 5000, gold: 600, restoration: 1 },
  },
  {
    id: 'sq.the_drowned',
    zone: ZONE,
    kind: 'side',
    giver: 'vasquez',
    after: ['mq.aurum'],
    level: 35,
    steps: [
      { kind: 'objective', id: 'dungeon.sunken_drill', ...p(270, -32) },
      { kind: 'talk', npc: 'vasquez' },
    ],
    rewards: { xp: 7000, gold: 820, item: 'rare', restoration: 1 },
  },
  {
    id: 'sq.prism',
    zone: ZONE,
    kind: 'side',
    giver: 'gerd',
    after: ['mq.missing_shift'],
    level: 34,
    steps: [
      { kind: 'objective', id: 'dungeon.crystal_labyrinth', ...p(-266, 116) },
      { kind: 'talk', npc: 'gerd' },
    ],
    rewards: { xp: 6600, gold: 780, item: 'rare', restoration: 1 },
  },
  {
    id: 'sq.canary',
    zone: ZONE,
    kind: 'side',
    giver: 'oona',
    after: ['mq.going_down'],
    level: 31,
    steps: [
      { kind: 'reach', ...SHAFTS, radius: 14 },
      { kind: 'interact', count: 1, objects: [{ id: 'canary.cage', x: SHAFTS.x + 6, z: SHAFTS.z + 5, asset: 'prop.prisoner_cage', scale: 0.3 }] },
      { kind: 'talk', npc: 'oona' },
    ],
    rewards: { xp: 3800, gold: 460, restoration: 1 },
  },
  // The follower's own quest (only one of the two is ever offered).
  {
    id: 'sq.roots_below',
    zone: ZONE,
    kind: 'side',
    giver: 'okafor_mines',
    after: ['mq.lights_in_the_dark'],
    level: 33,
    steps: [
      { kind: 'reach', ...CAVES, radius: 16 },
      { kind: 'interact', count: 3, poiKind: 'crystal' },
      { kind: 'talk', npc: 'okafor_mines' },
    ],
    rewards: { xp: 5600, gold: 600, item: 'legendary', restoration: 1 },
  },
  {
    id: 'sq.old_orders',
    zone: ZONE,
    kind: 'side',
    giver: 'ruiz_mines',
    after: ['mq.lights_in_the_dark'],
    level: 33,
    steps: [
      { kind: 'kill', count: 8, enemy: 'security_trooper' },
      { kind: 'interact', count: 1, ids: ['dm.lore.11'] },
      { kind: 'talk', npc: 'ruiz_mines' },
    ],
    rewards: { xp: 5600, gold: 600, item: 'legendary', restoration: 1 },
  },

  // ---- Mystery -----------------------------------------------------------------------
  {
    id: 'my.whisper',
    zone: ZONE,
    kind: 'mystery',
    giver: null,
    trigger: { object: { id: 'whisper.stone', x: ELDER.x + 10, z: ELDER.z - 8, asset: 'prop.echo_relic', scale: 0.3 } },
    level: 36,
    steps: [
      { kind: 'reach', ...p(-40, 262), radius: 9, marker: false },
      { kind: 'reach', ...p(-86, 286), radius: 9, marker: false },
      { kind: 'reach', ...p(-100, 300), radius: 9, marker: false },
      { kind: 'interact', count: 1, objects: [{ id: 'whisper.cache', ...p(-96, 296), asset: 'prop.supply_chest' }], marker: false },
    ],
    rewards: { xp: 7000, gold: 1100, item: 'legendary', restoration: 1 },
  },
];
