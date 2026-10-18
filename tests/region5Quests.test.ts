import { describe, expect, it } from 'vitest';
import { Npc, Transform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import en from '../src/data/lang/en.json';
import { ENEMY_DEFS } from '../src/data/db';
import { INSTANCES } from '../src/data/instances';
import { NPCS, QUESTS } from '../src/data/quests/db';
import { ENDLESS_SHAFT_DEPTH } from '../src/data/quests/theCore';
import { caveGrid, walkableAt } from '../src/data/zones/caves';
import { ELEVATOR_BASE, LUMEN_HEART, THE_CORE } from '../src/data/zones/theCore';
import { createQuestRuntime, spawnQuestWorld } from '../src/systems/quests';
import { createZoneRuntime, hubAt } from '../src/world/zone';
import { makeCtx } from './helpers';

const grid = caveGrid(THE_CORE)!;
const coreQuests = [...QUESTS.values()].filter((q) => q.zone === THE_CORE.id);
const lang = en as unknown as { quests: Record<string, Record<string, Record<string, unknown>>>; npcs: Record<string, Record<string, string>>; lore: { core: Record<string, { title: string; body: string }> }; enemies: Record<string, unknown> };
const text = (id: string) => {
  const [g, n] = id.split('.') as [string, string];
  return lang.quests[g]![n]!;
};

describe('The Core quests', () => {
  it('has 6 main quests, 8 side quests and a mystery', () => {
    expect(coreQuests.filter((q) => q.kind === 'main').map((q) => q.id)).toEqual([
      'mq.core_bore', 'mq.last_camp', 'mq.bridges_of_light', 'mq.what_lumen_remembers', 'mq.elevator_base', 'mq.one_who_remembers',
    ]);
    expect(coreQuests.filter((q) => q.kind === 'side')).toHaveLength(8);
    expect(coreQuests.filter((q) => q.kind === 'mystery')).toHaveLength(1);
  });

  it('chains from the Deep Mines governor, each main quest after the one before', () => {
    const mains = coreQuests.filter((q) => q.kind === 'main');
    expect(mains[0]!.after).toEqual(['mq.governor']);
    for (let i = 1; i < mains.length; i++) expect(mains[i]!.after).toEqual([mains[i - 1]!.id]);
    for (const q of coreQuests) for (const a of q.after) expect(QUESTS.has(a), `${q.id} after ${a}`).toBe(true);
  });

  it('has text for every quest, step, talk step and giver', () => {
    for (const q of coreQuests) {
      const tx = text(q.id);
      expect(tx.title, q.id).toBeTruthy();
      expect(tx.summary, q.id).toBeTruthy();
      expect(tx.done, q.id).toBeTruthy();
      if (q.giver) {
        expect(NPCS.has(q.giver), `${q.id} giver`).toBe(true);
        expect(tx.offer, `${q.id} offer`).toBeTruthy();
      }
      q.steps.forEach((s, i) => {
        expect((tx.steps as Record<string, string>)[String(i)], `${q.id} step ${i}`).toBeTruthy();
        if (s.kind === 'talk') {
          expect(NPCS.has(s.npc), `${q.id} npc ${s.npc}`).toBe(true);
          expect(tx[`talk${i}`], `${q.id} talk${i}`).toBeTruthy();
        }
      });
    }
  });

  it('only references enemies, instances and objective signals that exist', () => {
    const dungeons = new Set(INSTANCES.map((i) => i.id));
    const signals = new Set<string>([ELEVATOR_BASE.id, LUMEN_HEART.id, ENDLESS_SHAFT_DEPTH]);
    for (const poi of THE_CORE.pois) {
      if (poi.kind === 'dungeon') signals.add(`dungeon.${poi.data!.dungeon}`);
      if (poi.kind === 'bunker') signals.add(poi.id);
    }
    for (const q of coreQuests) {
      for (const s of q.steps) {
        if (s.kind === 'kill' && s.spawn) {
          expect(ENEMY_DEFS.has(s.spawn.enemy), `${q.id} ${s.spawn.enemy}`).toBe(true);
          expect(s.spawn.name, q.id).toMatch(/^enemies\./);
        }
        if (s.kind === 'kill' && s.enemy) expect(ENEMY_DEFS.has(s.enemy), `${q.id} ${s.enemy}`).toBe(true);
        if (s.kind === 'objective') expect(signals.has(s.id), `${q.id} signal ${s.id}`).toBe(true);
        if (s.kind === 'objective' && s.id.startsWith('dungeon.core_') && !s.id.includes('.floor_')) {
          expect(dungeons.has(s.id.replace('dungeon.', '')), `${q.id} instance ${s.id}`).toBe(true);
        }
        if (s.kind === 'discover') expect(THE_CORE.teleporters.some((t) => t.id === s.teleporter), s.teleporter).toBe(true);
        if (s.kind === 'interact' && s.ids) for (const id of s.ids) expect(THE_CORE.pois.some((p) => p.id === id), id).toBe(true);
      }
    }
  });

  it('ends on the dungeon, stronghold and boss signals', () => {
    const obj = (id: string) => QUESTS.get(id)!.steps.filter((s) => s.kind === 'objective').map((s) => (s as { id: string }).id);
    expect(obj('mq.what_lumen_remembers')).toEqual(['dungeon.core_memory_of_ember']);
    expect(obj('mq.elevator_base')).toEqual(['core.stronghold.base']);
    expect(obj('mq.one_who_remembers')).toEqual(['core.boss.lumen']);
  });

  it('puts every step on open ground', () => {
    for (const q of coreQuests) {
      for (const s of q.steps) {
        if ((s.zone ?? q.zone) !== THE_CORE.id) continue;
        if ('x' in s) expect(walkableAt(grid, s.x, s.z), `${q.id} step`).toBe(true);
        if (s.kind === 'interact') for (const o of s.objects) expect(walkableAt(grid, o.x, o.z), `${q.id} ${o.id}`).toBe(true);
        if (s.kind === 'kill' && s.spawn) expect(walkableAt(grid, s.spawn.x, s.spawn.z), `${q.id} spawn`).toBe(true);
      }
      if (q.trigger && 'object' in q.trigger) expect(walkableAt(grid, q.trigger.object.x, q.trigger.object.z), `${q.id} trigger`).toBe(true);
    }
  });
});

describe('The Last Camp', () => {
  it('has the services of the other hubs, all inside the camp', () => {
    const camp = [...NPCS.values()].filter((n) => n.zone === THE_CORE.id);
    expect(camp.map((n) => n.service).filter(Boolean).sort()).toEqual(['blacksmith', 'technician', 'vendor']);
    for (const n of camp) {
      expect(lang.npcs[n.id]?.name, n.id).toBeTruthy();
      expect(lang.npcs[n.id]?.greeting, n.id).toBeTruthy();
      if (n.service) expect(lang.npcs[n.id]?.service, n.id).toBeTruthy();
    }
    const world = new World();
    const zone = createZoneRuntime(THE_CORE);
    const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize });
    spawnQuestWorld(world, ctx);
    const here = world.query(Npc);
    expect(here).toHaveLength(camp.length);
    for (const e of here) {
      const t = world.req(e, Transform);
      expect(hubAt(zone, t.x, t.z)?.id, world.req(e, Npc).id).toBe('hub.camp');
      expect(walkableAt(grid, t.x, t.z)).toBe(true);
    }
  });
});

describe('The Absorbed (people from earlier regions)', () => {
  it('are not hub NPCs elsewhere, and each has a side quest or pack', () => {
    const names = ['danner', 'lenn', 'rhee', 'halvorsen', 'ostrow'];
    for (const n of names) {
      expect(ENEMY_DEFS.has(`absorbed_${n}`), n).toBe(true);
      expect((lang.enemies.absorbed as Record<string, { name: string; line: string }>)[n]!.line, n).toBeTruthy();
    }
    const spawned = new Set(coreQuests.flatMap((q) => q.steps.flatMap((s) => (s.kind === 'kill' && s.spawn ? [s.spawn.enemy] : []))));
    for (const n of names) expect(spawned.has(`absorbed_${n}`), n).toBe(true);
  });
});

describe('The Core lore and events', () => {
  it('has twelve lore logs with title and body', () => {
    expect(Object.keys(lang.lore.core)).toHaveLength(12);
    for (const l of Object.values(lang.lore.core)) {
      expect(l.title).toBeTruthy();
      expect(l.body.length).toBeGreaterThan(40);
    }
  });

  it('has five world events of existing kinds', () => {
    const events = THE_CORE.pois.filter((p) => p.kind === 'event');
    expect(events).toHaveLength(5);
    for (const e of events) {
      expect(['signalJam', 'rescue', 'eliteHunt', 'supplyDrop']).toContain(e.data!.event);
      expect(walkableAt(grid, e.x, e.z), e.id).toBe(true);
    }
  });
});
