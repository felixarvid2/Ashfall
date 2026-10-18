/**
 * The Core quests and NPCs (docs/regions/the-core.md): 6 main quests, 8 side quests (five of them lay one of
 * the Absorbed to rest) and one mystery. Text: lang quests.<id> and npcs.<id>.
 *
 * Signals the steps wait for (emitted by the dungeons, the stronghold and the boss):
 *  - dungeon cleared: `dungeon.<instance id>` (instance.ts `complete`)
 *  - Memory Mirror cleared: the mirror's point of interest id, `core.mirror.<n>`
 *  - stronghold reclaimed / boss killed: the zone constant's id (`core.stronghold.base`, `core.boss.lumen`)
 *  - Endless Shaft depth: `ENDLESS_SHAFT_DEPTH` (the shaft must emit it when the player reaches that floor)
 */
import type { z } from 'zod';
import type { NpcDefSchema, QuestDefSchema } from './schema';
import { DRILL_BORE } from '../zones/deepMines';
import { CORE_GATE, ELEVATOR_BASE, LAST_CAMP as HUB, LUMEN_HEART, cr, island } from '../zones/theCore';

type NpcInput = z.input<typeof NpcDefSchema>;
type QuestInput = z.input<typeof QuestDefSchema>;

const ZONE = 'zone.the_core';
const p = (x: number, z: number) => {
  const [a, b] = cr(x, z);
  return { x: a, z: b };
};
/** A point on an island, offset from its centre in metres. */
const onIsland = (id: string, dx: number, dz: number) => ({ x: island(id).x + dx, z: island(id).z + dz });

/** The Endless Shaft's quest signal: the floor the player has to reach. */
export const ENDLESS_SHAFT_FLOOR = 8;
export const ENDLESS_SHAFT_DEPTH = `dungeon.core_endless_shaft.floor_${ENDLESS_SHAFT_FLOOR}`;

const ASH = p(240, 110);
const FIRE = p(225, -35);
const JUNGLE = p(172, 74);
const DARK = p(130, -40);
const EMBER = p(258, 128);
const SHAFT_MOUTH = p(-134, -196);
const WEST_MACHINERY = p(-130, -195);
const EAST_MACHINERY = p(128, -184);
const BORDERLAND = p(0, -232);

/** The Last Camp's people; −z is screen-up. Old friends from every hub, and the two who held the camp. */
export const CORE_NPCS: NpcInput[] = [
  // The camp's own.
  { id: 'maren', zone: ZONE, asset: 'npc.technician', x: HUB.x + 4, z: HUB.z + 3, facing: 2.4 },
  { id: 'idris', zone: ZONE, asset: 'npc.defector', x: HUB.x - 2, z: HUB.z - 9, facing: 0.4, scale: 0.94 },
  // Who came down the bore behind you, one from each hub.
  { id: 'hekla_core', zone: ZONE, asset: 'npc.blacksmith', x: HUB.x + 9, z: HUB.z - 1, facing: -2.2, service: 'blacksmith' },
  { id: 'gus_core', zone: ZONE, asset: 'npc.cook', x: HUB.x - 6, z: HUB.z, facing: 1.8, scale: 1.05, service: 'vendor' },
  { id: 'dace_core', zone: ZONE, asset: 'npc.pump_engineer', x: HUB.x - 11, z: HUB.z + 3, facing: 1.4, scale: 0.95, service: 'technician' },
  { id: 'brask_core', zone: ZONE, asset: 'npc.pump_engineer', x: HUB.x + 6, z: HUB.z + 9, facing: -2.6 },
];

export const CORE_QUESTS: QuestInput[] = [
  // ---- Main quests ---------------------------------------------------------------
  {
    id: 'mq.core_bore',
    zone: ZONE,
    kind: 'main',
    giver: null,
    after: ['mq.governor'],
    level: 40,
    steps: [
      { kind: 'reach', x: DRILL_BORE.arrive.x, z: DRILL_BORE.arrive.z, radius: 12, zone: 'zone.deep_mines' },
      { kind: 'reach', x: CORE_GATE.arrive.x, z: CORE_GATE.arrive.z, radius: 14 },
      { kind: 'kill', count: 8, near: { x: BORDERLAND.x, z: BORDERLAND.z, radius: 100 } },
      { kind: 'reach', ...p(0, -205), radius: 16 },
    ],
    rewards: { xp: 23000, gold: 2700, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.last_camp',
    zone: ZONE,
    kind: 'main',
    giver: null,
    after: ['mq.core_bore'],
    level: 40,
    steps: [
      { kind: 'reach', ...p(0, -160), radius: 18 },
      { kind: 'reach', x: HUB.x, z: HUB.z + 10, radius: 16 },
      { kind: 'talk', npc: 'maren' },
    ],
    rewards: { xp: 24500, gold: 2800, restoration: 1 },
  },
  {
    id: 'mq.bridges_of_light',
    zone: ZONE,
    kind: 'main',
    giver: 'maren',
    after: ['mq.last_camp'],
    level: 43,
    steps: [
      { kind: 'reach', ...p(-98, 34), radius: 16 },
      { kind: 'discover', teleporter: 'tp.gardens' },
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'anchor.a', ...onIsland('g1', 4, 6), asset: 'prop.core_console', scale: 1.1 },
          { id: 'anchor.b', ...onIsland('g3', 4, 6), asset: 'prop.core_console', scale: 1.1 },
          { id: 'anchor.c', ...onIsland('g4', 4, 6), asset: 'prop.core_console', scale: 1.1 },
        ],
      },
      { kind: 'kill', count: 12, near: { x: island('g4').x, z: island('g4').z, radius: 70 } },
      { kind: 'reach', x: island('g7').x, z: island('g7').z, radius: 14 },
      { kind: 'talk', npc: 'maren' },
    ],
    rewards: { xp: 30000, gold: 3300, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.what_lumen_remembers',
    zone: ZONE,
    kind: 'main',
    giver: 'idris',
    after: ['mq.bridges_of_light'],
    level: 45,
    steps: [
      { kind: 'reach', ...p(122, 48), radius: 16 },
      { kind: 'discover', teleporter: 'tp.halls' },
      {
        kind: 'interact',
        count: 4,
        objects: [
          { id: 'echo.fire', ...p(205, -18), asset: 'prop.echo_relic', scale: 0.35 },
          { id: 'echo.dark', ...p(112, -32), asset: 'prop.echo_relic', scale: 0.35 },
          { id: 'echo.jungle', ...p(160, 96), asset: 'prop.echo_relic', scale: 0.35 },
          { id: 'echo.ash', ...p(262, 96), asset: 'prop.echo_relic', scale: 0.35 },
        ],
      },
      { kind: 'reach', ...EMBER, radius: 14 },
      { kind: 'objective', id: 'dungeon.core_memory_of_ember', ...EMBER },
      { kind: 'talk', npc: 'idris' },
    ],
    rewards: { xp: 34000, gold: 3700, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.elevator_base',
    zone: ZONE,
    kind: 'main',
    giver: 'maren',
    after: ['mq.what_lumen_remembers'],
    level: 47,
    steps: [
      { kind: 'reach', ...p(0, -20), radius: 20 },
      { kind: 'objective', id: ELEVATOR_BASE.id, x: ELEVATOR_BASE.x, z: ELEVATOR_BASE.z },
      { kind: 'talk', npc: 'maren' },
    ],
    rewards: { xp: 41000, gold: 4400, item: 'legendary', restoration: 1 },
  },
  {
    id: 'mq.one_who_remembers',
    zone: ZONE,
    kind: 'main',
    giver: 'maren',
    after: ['mq.elevator_base'],
    level: 50,
    steps: [
      { kind: 'reach', ...p(0, 190), radius: 18 },
      { kind: 'discover', teleporter: 'tp.heart' },
      { kind: 'reach', x: LUMEN_HEART.x, z: LUMEN_HEART.z - 20, radius: 26 },
      { kind: 'objective', id: LUMEN_HEART.id, x: LUMEN_HEART.x, z: LUMEN_HEART.z },
    ],
    rewards: { xp: 56000, gold: 6000, item: 'legendary', restoration: 2 },
  },

  // ---- Side quests ---------------------------------------------------------------
  // The Absorbed: five people the player met above, who followed the light down.
  {
    id: 'sq.last_watch',
    zone: ZONE,
    kind: 'side',
    giver: 'hekla_core',
    after: ['mq.bridges_of_light'],
    level: 44,
    steps: [
      { kind: 'reach', ...ASH, radius: 22 },
      { kind: 'kill', count: 1, spawn: { enemy: 'absorbed_danner', x: ASH.x, z: ASH.z, name: 'enemies.absorbed.danner.name' } },
      { kind: 'interact', count: 1, objects: [{ id: 'danner.tags', x: ASH.x + 5, z: ASH.z + 4, asset: 'prop.echo_relic', scale: 0.3 }] },
      { kind: 'talk', npc: 'hekla_core' },
    ],
    rewards: { xp: 11500, gold: 1250, item: 'rare', restoration: 1 },
  },
  {
    id: 'sq.pyre_song',
    zone: ZONE,
    kind: 'side',
    giver: 'gus_core',
    after: ['mq.bridges_of_light'],
    level: 44,
    steps: [
      { kind: 'reach', ...FIRE, radius: 22 },
      { kind: 'kill', count: 1, spawn: { enemy: 'absorbed_lenn', x: FIRE.x, z: FIRE.z, name: 'enemies.absorbed.lenn.name' } },
      { kind: 'interact', count: 1, objects: [{ id: 'lenn.hymnal', x: FIRE.x + 4, z: FIRE.z - 5, asset: 'prop.echo_relic', scale: 0.3 }] },
      { kind: 'talk', npc: 'gus_core' },
    ],
    rewards: { xp: 11800, gold: 1280, item: 'rare', restoration: 1 },
  },
  {
    id: 'sq.empty_cab',
    zone: ZONE,
    kind: 'side',
    giver: 'gus_core',
    after: ['mq.last_camp'],
    level: 41,
    steps: [
      { kind: 'reach', ...EAST_MACHINERY, radius: 22 },
      { kind: 'kill', count: 1, spawn: { enemy: 'absorbed_rhee', x: EAST_MACHINERY.x, z: EAST_MACHINERY.z, name: 'enemies.absorbed.rhee.name' } },
      { kind: 'interact', count: 1, objects: [{ id: 'rhee.controls', x: EAST_MACHINERY.x - 5, z: EAST_MACHINERY.z + 3, asset: 'prop.control_terminal', scale: 0.9 }] },
      { kind: 'talk', npc: 'gus_core' },
    ],
    rewards: { xp: 8800, gold: 980, item: 'rare', restoration: 1 },
  },
  {
    id: 'sq.last_samples',
    zone: ZONE,
    kind: 'side',
    giver: 'dace_core',
    after: ['mq.bridges_of_light'],
    level: 45,
    steps: [
      { kind: 'reach', ...JUNGLE, radius: 22 },
      { kind: 'kill', count: 1, spawn: { enemy: 'absorbed_halvorsen', x: JUNGLE.x, z: JUNGLE.z, name: 'enemies.absorbed.halvorsen.name' } },
      { kind: 'interact', count: 1, objects: [{ id: 'halvorsen.notes', x: JUNGLE.x + 5, z: JUNGLE.z - 4, asset: 'prop.echo_relic', scale: 0.3 }] },
      { kind: 'talk', npc: 'dace_core' },
    ],
    rewards: { xp: 12200, gold: 1320, item: 'rare', restoration: 1 },
  },
  {
    id: 'sq.fifth_lamp',
    zone: ZONE,
    kind: 'side',
    giver: 'brask_core',
    after: ['mq.bridges_of_light'],
    level: 44,
    steps: [
      { kind: 'reach', ...DARK, radius: 22 },
      { kind: 'kill', count: 1, spawn: { enemy: 'absorbed_ostrow', x: DARK.x, z: DARK.z, name: 'enemies.absorbed.ostrow.name' } },
      { kind: 'interact', count: 1, objects: [{ id: 'ostrow.lamp', x: DARK.x + 4, z: DARK.z + 5, asset: 'prop.emergency_light', scale: 0.6 }] },
      { kind: 'talk', npc: 'brask_core' },
    ],
    rewards: { xp: 11600, gold: 1260, item: 'rare', restoration: 1 },
  },
  // The three Memory Mirrors.
  {
    id: 'sq.three_mirrors',
    zone: ZONE,
    kind: 'side',
    giver: 'idris',
    after: ['mq.bridges_of_light'],
    level: 45,
    steps: [
      { kind: 'objective', id: 'core.mirror.0', ...p(212, -50) },
      { kind: 'objective', id: 'core.mirror.1', ...p(150, 8) },
      { kind: 'objective', id: 'core.mirror.2', ...p(-285, 70) },
      { kind: 'talk', npc: 'idris' },
    ],
    rewards: { xp: 15500, gold: 1700, item: 'legendary', restoration: 1 },
  },
  // The Endless Shaft.
  {
    id: 'sq.how_deep',
    zone: ZONE,
    kind: 'side',
    giver: 'brask_core',
    after: ['mq.last_camp'],
    level: 42,
    steps: [
      { kind: 'reach', ...SHAFT_MOUTH, radius: 14 },
      { kind: 'objective', id: ENDLESS_SHAFT_DEPTH, ...SHAFT_MOUTH },
      { kind: 'talk', npc: 'brask_core' },
    ],
    rewards: { xp: 10500, gold: 1150, item: 'rare', restoration: 1 },
  },
  // The camp's own errand.
  {
    id: 'sq.towers_speak',
    zone: ZONE,
    kind: 'side',
    giver: 'maren',
    after: ['mq.last_camp'],
    level: 41,
    steps: [{ kind: 'interact', count: 3, ids: ['core.tower.0', 'core.tower.1', 'core.tower.2'] }, { kind: 'talk', npc: 'maren' }],
    rewards: { xp: 8200, gold: 920, restoration: 1 },
  },

  // ---- Mystery -----------------------------------------------------------------------
  {
    id: 'my.table_light',
    zone: ZONE,
    kind: 'mystery',
    giver: null,
    trigger: { object: { id: 'table.lamp', ...p(108, 70), asset: 'prop.emergency_light', scale: 0.5 } },
    level: 45,
    steps: [
      { kind: 'reach', ...p(205, -20), radius: 9, marker: false },
      { kind: 'reach', ...p(160, 100), radius: 9, marker: false },
      { kind: 'reach', ...p(262, 100), radius: 9, marker: false },
      { kind: 'interact', count: 1, objects: [{ id: 'table.cache', ...p(270, 140), asset: 'prop.supply_chest' }], marker: false },
    ],
    rewards: { xp: 14000, gold: 2000, item: 'legendary', restoration: 1 },
  },
];
