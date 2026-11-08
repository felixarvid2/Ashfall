/**
 * Round 4 (D07): three more repeatable bounty types, one in each of three regions, built from the quest steps that
 * exist: hold a pylon (switch it on, then clear what comes for it), collect samples (five finds spread over a
 * wide ring), and assassinate a named elite (a champion with escorts). Text: lang quests.bt.<id>, enemies.named.*.
 */
import type { z } from 'zod';
import type { QuestDefSchema } from './schema';
import { at } from '../zones/cinderFlats';
import { hv } from '../zones/hydroponicVaults';
import { dm } from '../zones/deepMines';

type QuestInput = z.input<typeof QuestDefSchema>;

const pt = (f: (x: number, z: number) => [number, number], x: number, z: number) => {
  const [a, b] = f(x, z);
  return { x: a, z: b };
};

const PYLON = pt(at, -128, 150);
const GROVE = pt(hv, -214, 60);
const SHAFT = pt(dm, 60, -140);

/** Five finds on a ring around a centre. */
const ring = (prefix: string, c: { x: number; z: number }, asset: string, scale: number, r: number) =>
  [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    return { id: `${prefix}.${i}`, x: Math.round(c.x + Math.sin(a) * r), z: Math.round(c.z + Math.cos(a) * r), asset, scale };
  });

export const BOUNTY_ROUND4: QuestInput[] = [
  {
    id: 'bt.cf_pylon',
    kind: 'side',
    repeatable: true,
    zone: 'zone.cinder_flats',
    after: ['mq.the_first'],
    giver: 'pell',
    level: 11,
    steps: [
      { kind: 'reach', ...PYLON, radius: 14 },
      { kind: 'interact', count: 1, objects: [{ id: 'bt.cf.pylon', x: PYLON.x, z: PYLON.z, asset: 'prop.generator', scale: 0.8 }] },
      { kind: 'kill', count: 10, enemy: 'infected_colonist', near: { x: PYLON.x, z: PYLON.z, radius: 40 } },
      { kind: 'talk', npc: 'pell' },
    ],
    rewards: { xp: 600, gold: 125, item: 'rare', dust: 5, shards: 2 },
  },
  {
    id: 'bt.hv_samples',
    kind: 'side',
    repeatable: true,
    zone: 'zone.hydroponic_vaults',
    after: ['mq.mother_tree'],
    giver: 'okafor',
    level: 27,
    steps: [
      { kind: 'reach', ...GROVE, radius: 18 },
      { kind: 'interact', count: 5, objects: ring('bt.hv.samples', GROVE, 'prop.lumen_growth', 0.5, 16) },
      { kind: 'talk', npc: 'okafor' },
    ],
    rewards: { xp: 2600, gold: 320, item: 'rare', dust: 6, shards: 4 },
  },
  {
    id: 'bt.dm_hunt',
    kind: 'side',
    repeatable: true,
    zone: 'zone.deep_mines',
    after: ['mq.governor'],
    giver: 'brask',
    level: 36,
    steps: [
      { kind: 'kill', count: 1, spawn: { enemy: 'crystal_sentinel', x: SHAFT.x + 4, z: SHAFT.z + 4, name: 'enemies.named.bt_dm_hunt', elite: 'champion', escorts: 4 } },
      { kind: 'talk', npc: 'brask' },
    ],
    rewards: { xp: 4000, gold: 800, item: 'rare', dust: 10, shards: 5 },
  },
];
