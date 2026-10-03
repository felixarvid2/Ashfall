/**
 * Cinder Flats quests and NPCs (docs/regions/cinder-flats.md): 6 main quests, 10 side quests and
 * one mystery. Dialogue and tracker text: lang quests.<id> and npcs.<id>.
 */
import type { z } from 'zod';
import type { NpcDefSchema, QuestDefSchema } from './schema';
import { CINDER_FLATS_HUB as HUB, at } from '../zones/cinderFlats';

type NpcInput = z.input<typeof NpcDefSchema>;
type QuestInput = z.input<typeof QuestDefSchema>;

const DANNER = at(-80, -196);

/** Hub NPCs stand relative to Outpost Ember's centre; −x/−z is screen-up. */
export const CINDER_FLATS_NPCS: NpcInput[] = [
  { id: 'benny', asset: 'npc.cook', x: HUB.x + 6, z: HUB.z - 5, facing: -2.4, service: 'vendor' },
  { id: 'hekla', asset: 'npc.blacksmith', x: HUB.x + 11, z: HUB.z + 6, facing: -2, service: 'blacksmith' },
  { id: 'pell', asset: 'npc.technician', x: HUB.x - 8, z: HUB.z + 7, facing: 2.6, service: 'technician' },
  { id: 'tomas', asset: 'npc.blacksmith', x: HUB.x + 15, z: HUB.z - 7, facing: -1.6, scale: 0.94 },
  // Quest-only: the deserter hiding by the southern bunker.
  { id: 'danner', asset: 'enemy.sergeant', x: DANNER[0], z: DANNER[1], facing: 0.6, scale: 0.92, questOnly: true },
];

/** Where the stash terminal stands in the hub. */
export const STASH_POSITION = { x: HUB.x - 5, z: HUB.z - 9 };

const p = (x: number, z: number) => {
  const [a, b] = at(x, z);
  return { x: a, z: b };
};
const CONVOY = p(40, 18);
const LENA = p(-128, 168);
const KENNEL = p(-212, -192);

const OKAFOR_LOGS = ['lore.2', 'lore.5', 'lore.7', 'lore.9', 'lore.11'];

export const CINDER_FLATS_QUESTS: QuestInput[] = [
  // ---- Main quests ---------------------------------------------------------------
  {
    id: 'mq.wake_up',
    kind: 'main',
    giver: null,
    level: 1,
    steps: [
      { kind: 'reach', ...p(-275, -160), radius: 12 },
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
      { kind: 'reach', x: HUB.x, z: HUB.z - 8, radius: 12 },
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
      { kind: 'reach', ...CONVOY, radius: 14 },
      { kind: 'kill', count: 6, near: { ...CONVOY, radius: 34 } },
      {
        kind: 'interact',
        count: 3,
        objects: [
          { id: 'fuel.a', x: CONVOY.x - 6, z: CONVOY.z + 6, asset: 'prop.fuel_tank', scale: 0.45 },
          { id: 'fuel.b', x: CONVOY.x + 7, z: CONVOY.z - 6, asset: 'prop.fuel_tank', scale: 0.45 },
          { id: 'fuel.c', x: CONVOY.x + 3, z: CONVOY.z + 9, asset: 'prop.fuel_tank', scale: 0.45 },
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
      { kind: 'objective', id: 'stronghold.sierra', ...p(232, -132) },
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
      { kind: 'reach', ...p(54, 232), radius: 12 },
      { kind: 'objective', id: 'dungeon.meridians_hold', ...p(54, 236) },
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
      { kind: 'objective', id: 'boss.first', ...p(292, 196) },
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
      { kind: 'reach', ...LENA, radius: 14 },
      { kind: 'kill', count: 1, spawn: { enemy: 'infected_colonist', x: LENA.x + 4, z: LENA.z + 10, name: 'enemies.named.lena', elite: 'rare', escorts: 3 } },
      { kind: 'interact', count: 1, objects: [{ id: 'locket', x: LENA.x + 6, z: LENA.z + 8, asset: 'prop.echo_relic', scale: 0.35 }] },
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
      { kind: 'reach', ...p(-90, -42), radius: 10 },
      {
        kind: 'escort',
        asset: 'prop.water_tanker',
        // West along Route 7 to the outpost gate (≈ 90 m).
        path: [at(-90, -42), at(-110, -55), at(-130, -68), [HUB.x + 14, HUB.z - 4]],
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
      { kind: 'reach', ...KENNEL, radius: 12 },
      { kind: 'kill', count: 1, spawn: { enemy: 'spore_hound', x: KENNEL.x - 4, z: KENNEL.z - 6, name: 'enemies.named.rook', elite: 'champion', escorts: 2 } },
      { kind: 'interact', count: 1, objects: [{ id: 'collar', x: KENNEL.x - 2, z: KENNEL.z - 4, asset: 'prop.echo_relic', scale: 0.3 }] },
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
          { id: 'relay.a', ...p(-104, -8), asset: 'prop.control_terminal' },
          { id: 'relay.b', ...p(18, 44), asset: 'prop.control_terminal' },
          { id: 'relay.c', ...p(-36, -64), asset: 'prop.control_terminal' },
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
      { kind: 'reach', x: DANNER[0], z: DANNER[1] + 4, radius: 10 },
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
          { id: 'beacon.a', ...p(141, 9), asset: 'prop.emergency_light' },
          { id: 'beacon.b', ...p(179, -50), asset: 'prop.emergency_light' },
          { id: 'beacon.c', ...p(209, -93), asset: 'prop.emergency_light' },
          { id: 'beacon.d', ...p(249, -150), asset: 'prop.emergency_light' },
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
    trigger: { object: { id: 'letter.body', ...p(-46, 158), asset: 'prop.cargo_crate', scale: 0.5 } },
    level: 4,
    steps: [{ kind: 'talk', npc: 'benny' }],
    rewards: { xp: 120, gold: 10, restoration: 1 },
  },

  // ---- Mystery -----------------------------------------------------------------------
  {
    id: 'my.whistle',
    kind: 'mystery',
    giver: null,
    trigger: { object: { id: 'whistle', ...p(-296, 36), asset: 'prop.echo_relic', scale: 0.25 } },
    level: 5,
    steps: [
      { kind: 'reach', ...p(-252, 92), radius: 9, marker: false },
      { kind: 'reach', ...p(-212, 150), radius: 9, marker: false },
      { kind: 'reach', ...p(-166, 214), radius: 9, marker: false },
      { kind: 'interact', count: 1, objects: [{ id: 'whistle.cache', x: p(-166, 214).x + 3, z: p(-166, 214).z + 3, asset: 'prop.supply_chest', scale: 0.9 }], marker: false },
    ],
    rewards: { xp: 320, gold: 80, item: 'legendary', restoration: 1 },
  },
];
