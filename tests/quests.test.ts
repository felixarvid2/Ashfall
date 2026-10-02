import { describe, expect, it } from 'vitest';
import { DisplayName, Escort, Health, Interactable, Inventory, Npc, Progression, QuestTag, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import type { GameContext } from '../src/core/context';
import { emptyAccount } from '../src/core/account';
import { NPCS, QUESTS, questDef } from '../src/data/quests/db';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import en from '../src/data/lang/en.json';
import { kill } from '../src/systems/combat';
import { movementSystem } from '../src/systems/movement';
import {
  choose,
  completeTalk,
  createQuestRuntime,
  offeredBy,
  questMarkers,
  questSystem,
  restoreQuests,
  saveQuests,
  spawnQuestWorld,
  startQuest,
  waitingOn,
} from '../src/systems/quests';
import { interact, interactSystem, spawnInteractables } from '../src/world/interactables';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx, run } from './helpers';

function setup() {
  const world = new World();
  const zone = createZoneRuntime(CINDER_FLATS);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize });
  const player = spawnPlayer(world, 'bastion', -300, -228);
  spawnInteractables(world, zone);
  spawnQuestWorld(world, ctx);
  return { world, ctx, zone, player, rt: ctx.quests! };
}

function moveTo(world: World, player: Entity, x: number, z: number) {
  const tr = world.req(player, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

function tick(world: World, ctx: GameContext, n = 1) {
  run(world, ctx, [questSystem], n);
}

describe('quest data', () => {
  it('has 6 main quests, 10 side quests and a mystery for Cinder Flats', () => {
    const kinds = [...QUESTS.values()].map((q) => q.kind);
    expect(kinds.filter((k) => k === 'main')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'side')).toHaveLength(10);
    expect(kinds.filter((k) => k === 'mystery')).toHaveLength(1);
  });

  it('references real NPCs, quests and language strings', () => {
    const raw = en as unknown as { quests: Record<string, Record<string, { title: string; summary: string; steps: Record<string, string> }>>; npcs: Record<string, { name: string }> };
    const lang = {
      quests: Object.fromEntries(Object.entries(raw.quests).flatMap(([group, qs]) => Object.entries(qs).map(([k, v]) => [`${group}.${k}`, v]))),
      npcs: raw.npcs,
    };
    for (const q of QUESTS.values()) {
      if (q.giver) expect(NPCS.has(q.giver), `${q.id} giver`).toBe(true);
      for (const a of q.after) expect(QUESTS.has(a), `${q.id} after ${a}`).toBe(true);
      expect(lang.quests[q.id]?.title, q.id).toBeTruthy();
      expect(lang.quests[q.id]?.summary, q.id).toBeTruthy();
      if (q.giver) expect((lang.quests[q.id] as { offer?: string }).offer, `${q.id} offer`).toBeTruthy();
      q.steps.forEach((s, i) => {
        expect(lang.quests[q.id]!.steps[String(i)], `${q.id} step ${i}`).toBeTruthy();
        if (s.kind === 'talk' || s.kind === 'choice') expect(NPCS.has(s.npc), `${q.id} npc ${s.npc}`).toBe(true);
        if (s.kind === 'talk') expect((lang.quests[q.id] as Record<string, unknown>)[`talk${i}`], `${q.id} talk${i}`).toBeTruthy();
      });
    }
    for (const n of NPCS.values()) expect(lang.npcs[n.id]?.name).toBeTruthy();
  });
});

describe('quest engine', () => {
  it('starts Wake Up on its own and walks through reach, kill and discover steps', () => {
    const { world, ctx, rt, player } = setup();
    tick(world, ctx);
    expect(rt.active.get('mq.wake_up')).toEqual({ step: 0, progress: 0 });
    expect(rt.tracked).toBe('mq.wake_up');
    moveTo(world, player, -275, -160);
    tick(world, ctx);
    expect(rt.active.get('mq.wake_up')!.step).toBe(1);
    for (let i = 0; i < 3; i++) {
      const e = spawnEnemy(world, i === 1 ? 'security_drone' : 'infected_colonist', -270, -150);
      kill(world, ctx, e, 0);
      tick(world, ctx);
    }
    // The drone did not count.
    expect(rt.active.get('mq.wake_up')).toMatchObject({ step: 1, progress: 2 });
    kill(world, ctx, spawnEnemy(world, 'infected_colonist', -270, -150), 0);
    tick(world, ctx);
    expect(rt.active.get('mq.wake_up')!.step).toBe(2);
    ctx.zone!.discovered.add('tp.impact');
    const gold = world.req(player, Inventory).gold;
    tick(world, ctx);
    expect(rt.done.has('mq.wake_up')).toBe(true);
    expect(world.req(player, Inventory).gold).toBe(gold + 15);
    // The follow-up starts by itself.
    tick(world, ctx);
    expect(rt.active.has('mq.signal')).toBe(true);
  });

  it('offers quests from NPCs once their prerequisites are done, and talk steps complete them', () => {
    const { world, ctx, rt } = setup();
    expect(offeredBy(rt, 'benny').map((q) => q.id)).toEqual([]);
    rt.done.set('mq.wake_up', '');
    rt.done.set('mq.signal', '');
    expect(offeredBy(rt, 'benny').map((q) => q.id)).toContain('mq.fuel');
    startQuest(world, ctx, 'mq.fuel');
    expect(waitingOn(rt, 'hekla').map((w) => w.id)).toEqual(['mq.fuel']);
    expect(completeTalk(world, ctx, 'mq.fuel')).toBe(true);
    expect(rt.active.get('mq.fuel')!.step).toBe(1);
    expect(completeTalk(world, ctx, 'mq.fuel')).toBe(false);
  });

  it('spawns quest objects for interact steps and counts them', () => {
    const { world, ctx, rt, player } = setup();
    rt.active.set('mq.fuel', { step: 2, progress: 0 });
    restoreQuests(world, ctx, saveQuests(rt));
    world.flushDestroyed();
    // Clear the 6 infected near the convoy.
    for (let i = 0; i < 6; i++) kill(world, ctx, spawnEnemy(world, 'infected_colonist', 40 + i, 20), 0);
    tick(world, ctx);
    expect(rt.active.get('mq.fuel')!.step).toBe(3);
    const objects = world.query(Interactable).filter((e) => world.req(e, Interactable).kind === 'questObject' && world.get(e, QuestTag)?.quest === 'mq.fuel');
    expect(objects).toHaveLength(3);
    for (const o of objects) {
      const tr = world.req(o, Transform);
      moveTo(world, player, tr.x, tr.z);
      expect(interact(world, ctx, player, o)).toBe(true);
      tick(world, ctx);
    }
    expect(rt.active.get('mq.fuel')!.step).toBe(4);
    expect(questMarkers(world, ctx).filter((m) => m.quest === 'mq.fuel')).toEqual([expect.objectContaining({ x: NPCS.get('hekla')!.x, main: true })]);
  });

  it('named targets: only the spawned one counts', () => {
    const { world, ctx, rt } = setup();
    rt.done.set('mq.wake_up', '');
    rt.done.set('mq.signal', '');
    startQuest(world, ctx, 'sq.old_dog');
    rt.active.get('sq.old_dog')!.step = 1;
    restoreQuests(world, ctx, saveQuests(rt));
    const rook = world.query(DisplayName).find((e) => world.req(e, DisplayName).key === 'enemies.named.rook');
    expect(rook).toBeDefined();
    kill(world, ctx, spawnEnemy(world, 'spore_hound', -216, -198), 0);
    tick(world, ctx);
    expect(rt.active.get('sq.old_dog')!.step).toBe(1);
    kill(world, ctx, rook!, 0);
    tick(world, ctx);
    expect(rt.active.get('sq.old_dog')!.step).toBe(2);
  });

  it('logs read before the quest count toward it', () => {
    const { world, ctx, rt, player, zone } = setup();
    zone.found.add('lore.5');
    zone.found.add('lore.7');
    const log = world.query(Interactable).find((e) => world.req(e, Interactable).poi === 'lore.2')!;
    moveTo(world, player, world.req(log, Transform).x, world.req(log, Transform).z);
    interact(world, ctx, player, log);
    tick(world, ctx);
    expect(rt.active.get('sq.logs')).toMatchObject({ step: 0, progress: 3 });
  });

  it('the escort waits for the player, and restarts when the tanker is destroyed', () => {
    const { world, ctx, rt, player } = setup();
    rt.active.set('sq.water', { step: 1, progress: 0 });
    restoreQuests(world, ctx, saveQuests(rt));
    const tanker = world.query(Escort)[0]!;
    const start = { ...world.req(tanker, Transform) };
    moveTo(world, player, 100, 100);
    run(world, ctx, [questSystem, movementSystem], 60);
    expect(world.req(tanker, Transform).x).toBeCloseTo(start.x, 3);
    moveTo(world, player, start.x, start.z + 3);
    run(world, ctx, [questSystem, movementSystem], 120);
    expect(Math.hypot(world.req(tanker, Transform).x - start.x, world.req(tanker, Transform).z - start.z)).toBeGreaterThan(2);
    kill(world, ctx, tanker, 0);
    run(world, ctx, [questSystem], 1);
    world.flushDestroyed();
    expect(ctx.events.drain()).toContainEqual({ type: 'quest', id: 'sq.water', state: 'failed' });
    const fresh = world.query(Escort)[0]!;
    expect(fresh).not.toBe(tanker);
    expect(world.req(fresh, Health).current).toBe(world.req(fresh, Health).max);
  });

  it('choice steps pay the chosen reward and remember the choice', () => {
    const { world, ctx, rt, player } = setup();
    rt.active.set('sq.deserter', { step: 1, progress: 0 });
    restoreQuests(world, ctx, saveQuests(rt));
    expect(world.query(Npc).some((e) => world.req(e, Npc).id === 'danner')).toBe(true);
    const gold = world.req(player, Inventory).gold;
    expect(choose(world, ctx, 'sq.deserter', 'spare')).toBe(true);
    expect(rt.done.get('sq.deserter')).toBe('spare');
    expect(world.req(player, Inventory).gold).toBe(gold + 90);
    world.flushDestroyed();
    expect(world.query(Npc).some((e) => world.req(e, Npc).id === 'danner')).toBe(false);
  });

  it('a found object starts the mystery; its trail has no markers', () => {
    const { world, ctx, rt, player } = setup();
    const whistle = rt.triggers.get('my.whistle')!;
    const tr = world.req(whistle, Transform);
    moveTo(world, player, tr.x, tr.z);
    interact(world, ctx, player, whistle);
    tick(world, ctx);
    expect(rt.active.has('my.whistle')).toBe(true);
    expect(questMarkers(world, ctx).filter((m) => m.quest === 'my.whistle')).toEqual([]);
  });

  it('completing a quest with Restoration records account points and XP', () => {
    const { world, ctx, rt, player } = setup();
    rt.active.set('sq.radio', { step: 1, progress: 0 });
    const xp = world.req(player, Progression).xp;
    completeTalk(world, ctx, 'sq.radio');
    expect(rt.done.has('sq.radio')).toBe(true);
    expect(ctx.account!.restoration['zone.cinder_flats']!.points).toEqual(['quest:sq.radio#0']);
    expect(world.req(player, Progression).xp + world.req(player, Progression).level * 1000).toBeGreaterThan(xp);
    void questDef;
    void interactSystem;
  });
});
