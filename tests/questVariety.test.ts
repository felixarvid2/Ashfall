import { describe, expect, it } from 'vitest';
import { Escort, Npc, Transform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import en from '../src/data/lang/en.json';
import { ENEMY_DEFS } from '../src/data/db';
import { NPCS, QUESTS } from '../src/data/quests/db';
import { EMPTY_CAB_PATH } from '../src/data/quests/theCore';
import { caveGrid, walkableAt } from '../src/data/zones/caves';
import { DEEP_MINES } from '../src/data/zones/deepMines';
import { THE_CORE } from '../src/data/zones/theCore';
import { CAMPAIGN_END_QUEST, createQuestRuntime, greetingKey, greetingStage, restoreQuests } from '../src/systems/quests';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx } from './helpers';

const shape = (id: string) => QUESTS.get(id)!.steps.map((s) => s.kind);
const lang = en as unknown as { quests: Record<string, Record<string, Record<string, unknown>>>; npcs: Record<string, Record<string, string>>; enemies: { named: Record<string, string> } };

describe('Core side quests vary their shape (C014)', () => {
  it('sq.empty_cab kills Rhee, escorts the cab and reports back', () => {
    expect(shape('sq.empty_cab')).toEqual(['kill', 'escort', 'talk']);
  });

  it('sq.fifth_lamp lights four lamps, then holds against a wave', () => {
    expect(shape('sq.fifth_lamp')).toEqual(['interact', 'kill', 'talk']);
    const steps = QUESTS.get('sq.fifth_lamp')!.steps;
    const lamps = steps[0]!;
    expect(lamps.kind === 'interact' && lamps.count).toBe(4);
    expect(lamps.kind === 'interact' && new Set(lamps.objects.map((o) => o.id)).size).toBe(4);
    const wave = steps[1]!;
    expect(wave.kind === 'kill' && wave.spawn?.enemy).toBe('absorbed_ostrow');
    expect(wave.kind === 'kill' && wave.spawn?.escorts).toBeGreaterThanOrEqual(3);
  });

  it('sq.pyre_song waits on the Refinery Mirror, then Lenn', () => {
    expect(shape('sq.pyre_song')).toEqual(['objective', 'kill', 'talk']);
    const step = QUESTS.get('sq.pyre_song')!.steps[0]!;
    expect(step.kind === 'objective' && step.id).toBe('core.mirror.1');
  });

  it('no longer has five identical side quests', () => {
    const core = [...QUESTS.values()].filter((q) => q.zone === THE_CORE.id && q.kind === 'side' && !q.repeatable);
    const kinds = new Set(core.flatMap((q) => q.steps.map((s) => s.kind)));
    expect(kinds.has('escort')).toBe(true);
    const sameAsOld = ['sq.last_watch', 'sq.last_samples', 'sq.empty_cab', 'sq.fifth_lamp', 'sq.pyre_song'].filter((id) => shape(id).join() === 'reach,kill,interact,talk');
    expect(sameAsOld).toEqual(['sq.last_watch', 'sq.last_samples']);
  });

  it('keeps the whole cab route on open ground, every metre of it', () => {
    const grid = caveGrid(THE_CORE)!;
    const bad: string[] = [];
    for (let i = 1; i < EMPTY_CAB_PATH.length; i++) {
      const [ax, az] = EMPTY_CAB_PATH[i - 1]!;
      const [bx, bz] = EMPTY_CAB_PATH[i]!;
      const n = Math.ceil(Math.hypot(bx - ax, bz - az));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        if (!walkableAt(grid, x, z)) bad.push(`${Math.round(x)},${Math.round(z)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('puts the cab and its text in the quest', () => {
    const step = QUESTS.get('sq.empty_cab')!.steps[1]!;
    expect(step.kind === 'escort' && step.path).toEqual(EMPTY_CAB_PATH);
    expect(lang.quests.sq!.empty_cab!.escortName).toBeTruthy();
  });

  it('spawns the cab when the escort step begins', () => {
    const world = new World();
    const zone = createZoneRuntime(THE_CORE);
    const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize });
    restoreQuests(world, ctx, { active: { 'sq.empty_cab': { step: 1, progress: 0 } }, done: {}, tracked: null });
    const cabs = world.query(Escort);
    expect(cabs).toHaveLength(1);
    const tr = world.req(cabs[0]!, Transform);
    expect([tr.x, tr.z]).toEqual(EMPTY_CAB_PATH[0]);
  });
});

describe('Mystery quests vary their shape (C016)', () => {
  const mysteries = ['my.whistle', 'my.fireproof', 'my.gardener', 'my.whisper', 'my.table_light'];

  it('has five different step sequences', () => {
    expect(new Set(mysteries.map((id) => shape(id).join())).size).toBe(5);
    expect(shape('my.fireproof')).toEqual(['reach', 'reach', 'kill', 'interact']);
    expect(shape('my.gardener')).toEqual(['discover', 'reach', 'reach', 'interact']);
    expect(shape('my.whisper')).toEqual(['reach', 'reach', 'talk', 'interact']);
    expect(shape('my.table_light')).toEqual(['reach', 'kill', 'reach', 'interact']);
  });

  it('keeps every trail hidden from the map and every reward a legendary', () => {
    for (const id of mysteries) {
      const q = QUESTS.get(id)!;
      expect(q.kind).toBe('mystery');
      expect(q.rewards.item, id).toBe('legendary');
      for (const s of q.steps) expect(s.marker, `${id} ${s.kind}`).toBe(false);
    }
  });

  it('fireproof ends on a named enemy that exists; the hold-out counts ordinary kills near its room', () => {
    const kill = QUESTS.get('my.fireproof')!.steps[2]!;
    expect(kill.kind === 'kill' && ENEMY_DEFS.has(kill.spawn!.enemy)).toBe(true);
    expect(kill.kind === 'kill' && lang.enemies.named[kill.spawn!.name.replace('enemies.named.', '')]).toBeTruthy();
    const hold = QUESTS.get('my.table_light')!.steps[1]!;
    expect(hold.kind === 'kill' && hold.spawn).toBeUndefined();
    expect(hold.kind === 'kill' && hold.near?.radius).toBeGreaterThan(0);
    expect(hold.kind === 'kill' && hold.count).toBeGreaterThanOrEqual(5);
  });

  it('gardener discovers a teleporter of the Vaults', async () => {
    const { HYDROPONIC_VAULTS } = await import('../src/data/zones/hydroponicVaults');
    const step = QUESTS.get('my.gardener')!.steps[0]!;
    expect(step.kind === 'discover' && HYDROPONIC_VAULTS.teleporters.some((t) => t.id === step.teleporter)).toBe(true);
  });

  it('whisper talks to a hidden quest-only NPC who has text', () => {
    const step = QUESTS.get('my.whisper')!.steps[2]!;
    const id = step.kind === 'talk' ? step.npc : '';
    expect(NPCS.get(id)).toMatchObject({ questOnly: true, zone: DEEP_MINES.id });
    expect(lang.npcs[id]!.name).toBeTruthy();
    expect(lang.quests.my!.whisper!.talk2).toBeTruthy();
    const world = new World();
    const zone = createZoneRuntime(DEEP_MINES);
    const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize });
    restoreQuests(world, ctx, { active: { 'my.whisper': { step: 2, progress: 0 } }, done: {}, tracked: null });
    expect(world.query(Npc).map((e) => world.req(e, Npc).id)).toContain(id);
  });
});

describe('NPC greetings follow the campaign (C023)', () => {
  const rtWith = (...done: string[]) => {
    const rt = createQuestRuntime();
    for (const q of done) rt.done.set(q, '');
    return rt;
  };

  it('picks the stage from the NPC region and the end of the campaign', () => {
    expect(greetingStage(rtWith(), 'benny')).toBe('first');
    expect(greetingStage(rtWith('mq.the_first'), 'benny')).toBe('late');
    // Another region's boss does not change this region's people.
    expect(greetingStage(rtWith('mq.the_first'), 'gus')).toBe('first');
    expect(greetingStage(rtWith('mq.the_first', 'mq.vire'), 'gus')).toBe('late');
    expect(greetingStage(rtWith('mq.governor'), 'brask')).toBe('late');
    expect(greetingStage(rtWith(CAMPAIGN_END_QUEST), 'benny')).toBe('end');
    expect(greetingStage(rtWith(CAMPAIGN_END_QUEST), 'maren')).toBe('end');
  });

  it('chooses the key, falling back to what exists', () => {
    expect(greetingKey(rtWith(), 'benny')).toBe('npcs.benny.greeting');
    expect(greetingKey(rtWith('mq.the_first'), 'benny')).toBe('npcs.benny.greetingLate');
    expect(greetingKey(rtWith(CAMPAIGN_END_QUEST), 'benny')).toBe('npcs.benny.greetingEnd');
    // The Core's people have no "late" line: the region's boss is the end.
    expect(greetingKey(rtWith(CAMPAIGN_END_QUEST), 'maren')).toBe('npcs.maren.greetingEnd');
    // A quest-only NPC without variants keeps its one greeting at every stage.
    expect(greetingKey(rtWith(CAMPAIGN_END_QUEST), 'danner')).toBe('npcs.danner.greeting');
    expect(greetingKey(rtWith('mq.the_first'), 'unknown_npc')).toBe('npcs.unknown_npc.greeting');
  });

  it('gives every hub service NPC a late and an end line that differ from the first', () => {
    for (const n of NPCS.values()) {
      if (!n.service || n.questOnly) continue;
      const g = lang.npcs[n.id]!;
      expect(g.greetingEnd, `${n.id} end`).toBeTruthy();
      expect(g.greetingEnd, n.id).not.toBe(g.greeting);
      if (n.zone !== THE_CORE.id) {
        expect(g.greetingLate, `${n.id} late`).toBeTruthy();
        expect(g.greetingLate, n.id).not.toBe(g.greeting);
        expect(g.greetingLate, n.id).not.toBe(g.greetingEnd);
      }
    }
  });
});
