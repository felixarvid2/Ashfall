/**
 * Cinder Flats quests and NPCs (docs/regions/cinder-flats.md): 6 main quests, 10 side quests and
 * one mystery. Dialogue and tracker text: lang quests.<id> and npcs.<id>.
 */
import type { z } from 'zod';
import type { NpcDefSchema, QuestDefSchema } from './schema';

type NpcInput = z.input<typeof NpcDefSchema>;
type QuestInput = z.input<typeof QuestDefSchema>;

/** Outpost Ember is centred on (−150, −66); −x/−z is screen-up. */
export const CINDER_FLATS_NPCS: NpcInput[] = [
  { id: 'benny', asset: 'npc.cook', x: -144, z: -71, facing: -2.4, service: 'vendor' },
  { id: 'hekla', asset: 'npc.blacksmith', x: -139, z: -60, facing: -2, service: 'blacksmith' },
  { id: 'pell', asset: 'npc.technician', x: -158, z: -59, facing: 2.6, service: 'technician' },
  { id: 'tomas', asset: 'npc.blacksmith', x: -135, z: -73, facing: -1.6, scale: 0.94 },
  // Quest-only: the deserter hiding by the southern bunker.
  { id: 'danner', asset: 'enemy.sergeant', x: -80, z: -196, facing: 0.6, scale: 0.92, questOnly: true },
];

/** Where the stash terminal stands in the hub. */
export const STASH_POSITION = { x: -155, z: -75 };

const OKAFOR_LOGS = ['lore.2', 'lore.5', 'lore.7', 'lore.9', 'lore.11'];

export const CINDER_FLATS_QUESTS: QuestInput[] = [
  // ---- Main quests ---------------------------------------------------------------
  {
    id: 'mq.wake_up',
    kind: 'main',
    giver: null,
    level: 1,
    steps: [
      { kind: 'reach', x: -275, z: -160, radius: 10 },
      { kind: 'kill', count: 3, enemy: 'infected_colonist' },
      { kind: 'discover', teleporter: 'tp.impact' },
    ],
    rewards: { xp: 60, gold: 15 },
  },
  {
    id: 'mq.signal',
    kind: 'main',
    giver: null,
    after: ['mq.wake_up'],
    level: 2,
    steps: [
      { kind: 'reach', x: -150, z: -74, radius: 12 },
      { kind: 'talk', npc: 'benny' },
    ],
    rewards: { xp: 90, gold: 20, item: 'magic' },
  },
  {
    id: 'mq.fuel',
    kind: 'main',
    giver: 'benny',
    after: ['mq.signal'],
    level: 3,
    steps: [
      { kind: 'talk', npc: 'hekla' },
      { kind: 'reach', x: 40, z: 18, radius: 14 },
      { kind: 'kill', count: 6, near: { x: 40, z: 18, radius: 34 } },
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'fuel.a', x: 34, z: 24, asset: 'prop.fuel_tank', scale: 0.45 },
          { id: 'fuel.b', x: 47, z: 12, asset: 'prop.fuel_tank', scale: 0.45 },
          { id: 'fuel.c', x: 43, z: 27, asset: 'prop.fuel_tank', scale: 0.45 },
        ],
      },
      { kind: 'talk', npc: 'hekla' },
    ],
    rewards: { xp: 220, gold: 45, restoration: 1 },
  },
  {
    id: 'mq.orders',
    kind: 'main',
    giver: 'pell',
    after: ['mq.fuel'],
    level: 5,
    steps: [
      { kind: 'discover', teleporter: 'tp.sierra' },
      { kind: 'objective', id: 'stronghold.sierra', x: 232, z: -132 },
      { kind: 'talk', npc: 'pell' },
    ],
    rewards: { xp: 450, gold: 90, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.black_box',
    kind: 'main',
    giver: 'pell',
    after: ['mq.orders'],
    level: 7,
    steps: [
      { kind: 'reach', x: 54, z: 232, radius: 12 },
      { kind: 'objective', id: 'dungeon.meridians_hold', x: 54, z: 236 },
      { kind: 'talk', npc: 'pell' },
    ],
    rewards: { xp: 600, gold: 120, item: 'rare', restoration: 1 },
  },
  {
    id: 'mq.the_first',
    kind: 'main',
    giver: 'pell',
    after: ['mq.black_box'],
    level: 9,
    steps: [
      { kind: 'discover', teleporter: 'tp.maw' },
      { kind: 'objective', id: 'boss.first', x: 292, z: 196 },
      { kind: 'talk', npc: 'benny' },
    ],
    rewards: { xp: 900, gold: 220, item: 'legendary', restoration: 2 },
  },

  // ---- Side quests ---------------------------------------------------------------
  {
    id: 'sq.daughter',
    kind: 'side',
    giver: 'tomas',
    after: ['mq.signal'],
    level: 4,
    steps: [
      { kind: 'reach', x: -128, z: 168, radius: 14 },
      { kind: 'kill', count: 1, spawn: { enemy: 'infected_colonist', x: -124, z: 178, name: 'enemies.named.lena', elite: 'rare', escorts: 3 } },
      { kind: 'interact', count: 1, objects: [{ id: 'locket', x: -122, z: 176, asset: 'prop.echo_relic', scale: 0.35 }] },
      { kind: 'talk', npc: 'tomas' },
    ],
    rewards: { xp: 260, gold: 50, restoration: 1 },
  },
  {
    id: 'sq.logs',
    kind: 'side',
    giver: null,
    trigger: { poi: 'lore.2' },
    level: 3,
    steps: [
      { kind: 'interact', count: 5, ids: OKAFOR_LOGS },
      { kind: 'talk', npc: 'pell' },
    ],
    rewards: { xp: 320, gold: 40, item: 'legendary', restoration: 1 },
  },
  {
    id: 'sq.water',
    kind: 'side',
    giver: 'benny',
    after: ['mq.fuel'],
    level: 4,
    steps: [
      { kind: 'reach', x: -62, z: -30, radius: 10 },
      {
        kind: 'escort',
        asset: 'prop.water_tanker',
        path: [[-62, -30], [-90, -42], [-120, -62], [-136, -70]],
        life: 600,
        speed: 2.4,
      },
      { kind: 'talk', npc: 'benny' },
    ],
    rewards: { xp: 260, gold: 60, restoration: 1 },
  },
  {
    id: 'sq.spices',
    kind: 'side',
    giver: 'benny',
    after: ['mq.signal'],
    level: 3,
    steps: [
      { kind: 'kill', count: 3, enemy: 'spore_carrier' },
      { kind: 'talk', npc: 'benny' },
    ],
    rewards: { xp: 160, gold: 30 },
  },
  {
    id: 'sq.old_dog',
    kind: 'side',
    giver: 'hekla',
    after: ['mq.signal'],
    level: 3,
    steps: [
      { kind: 'reach', x: -212, z: -192, radius: 12 },
      { kind: 'kill', count: 1, spawn: { enemy: 'spore_hound', x: -216, z: -198, name: 'enemies.named.rook', elite: 'champion', escorts: 2 } },
      { kind: 'interact', count: 1, objects: [{ id: 'collar', x: -214, z: -196, asset: 'prop.echo_relic', scale: 0.3 }] },
      { kind: 'talk', npc: 'hekla' },
    ],
    rewards: { xp: 200, gold: 40, restoration: 1 },
  },
  {
    id: 'sq.radio',
    kind: 'side',
    giver: 'pell',
    after: ['mq.signal'],
    level: 3,
    steps: [
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'relay.a', x: -104, z: -8, asset: 'prop.control_terminal' },
          { id: 'relay.b', x: 18, z: 44, asset: 'prop.control_terminal' },
          { id: 'relay.c', x: -36, z: -64, asset: 'prop.control_terminal' },
        ],
      },
      { kind: 'talk', npc: 'pell' },
    ],
    rewards: { xp: 230, gold: 50, restoration: 1 },
  },
  {
    id: 'sq.rations',
    kind: 'side',
    giver: 'benny',
    after: ['mq.signal'],
    level: 2,
    steps: [
      { kind: 'interact', count: 3, poiKind: 'chest', marker: false },
      { kind: 'talk', npc: 'benny' },
    ],
    rewards: { xp: 130, gold: 25 },
  },
  {
    id: 'sq.deserter',
    kind: 'side',
    giver: 'hekla',
    after: ['mq.fuel'],
    level: 5,
    steps: [
      { kind: 'reach', x: -80, z: -192, radius: 10 },
      {
        kind: 'choice',
        npc: 'danner',
        options: [
          { id: 'spare', gold: 90, xp: 120 },
          { id: 'rifle', item: 'rare', xp: 120 },
        ],
      },
    ],
    rewards: { xp: 150, gold: 0, restoration: 1 },
  },
  {
    id: 'sq.lights',
    kind: 'side',
    giver: 'hekla',
    after: ['mq.signal'],
    level: 5,
    steps: [
      {
        kind: 'interact',
        count: 4,
        objects: [
          { id: 'beacon.a', x: 138, z: 8, asset: 'prop.emergency_light' },
          { id: 'beacon.b', x: 176, z: -50, asset: 'prop.emergency_light' },
          { id: 'beacon.c', x: 206, z: -94, asset: 'prop.emergency_light' },
          { id: 'beacon.d', x: 246, z: -150, asset: 'prop.emergency_light' },
        ],
      },
      { kind: 'talk', npc: 'hekla' },
    ],
    rewards: { xp: 220, gold: 45, restoration: 1 },
  },
  {
    id: 'sq.letter',
    kind: 'side',
    giver: null,
    trigger: { object: { id: 'letter.body', x: -46, z: 158, asset: 'prop.cargo_crate', scale: 0.5 } },
    level: 4,
    steps: [{ kind: 'talk', npc: 'benny' }],
    rewards: { xp: 120, gold: 10, restoration: 1 },
  },

  // ---- Mystery -----------------------------------------------------------------------
  {
    id: 'my.whistle',
    kind: 'mystery',
    giver: null,
    trigger: { object: { id: 'whistle', x: -296, z: 36, asset: 'prop.echo_relic', scale: 0.25 } },
    level: 5,
    steps: [
      { kind: 'reach', x: -252, z: 92, radius: 8, marker: false },
      { kind: 'reach', x: -212, z: 150, radius: 8, marker: false },
      { kind: 'reach', x: -166, z: 214, radius: 8, marker: false },
      { kind: 'interact', count: 1, objects: [{ id: 'whistle.cache', x: -164, z: 218, asset: 'prop.supply_chest', scale: 0.9 }], marker: false },
    ],
    rewards: { xp: 320, gold: 80, item: 'legendary', restoration: 1 },
  },
];
