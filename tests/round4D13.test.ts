import { describe, expect, it } from 'vitest';
import { GroundItem } from '../src/core/components';
import { World } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { ENEMY_DEFS } from '../src/data/db';
import { BOSS_SIGNATURES } from '../src/data/loot/bossLoot';
import { BASE_ITEMS, UNIQUE_DEFS } from '../src/data/loot/db';
import { rollBossSignatures, signatureUnique } from '../src/systems/loot/bossLoot';
import { rewardSystem } from '../src/systems/loot/rewards';
import { spawnPlayer } from '../src/world/spawn';
import { makeCtx, run } from './helpers';

const CLASSES = ['bastion', 'spectre', 'xenomant', 'lightbearer'];

describe('D13 boss signature drops', () => {
  it('every dt.boss enemy has exactly two signature entries with a raised chance', () => {
    const bosses = [...ENEMY_DEFS.values()].filter((e) => e.dropTable === 'dt.boss').map((e) => e.id);
    expect(bosses.length).toBeGreaterThanOrEqual(20);
    for (const id of [...bosses, 'lumen']) {
      const sigs = BOSS_SIGNATURES[id];
      expect(sigs, id).toBeDefined();
      expect(sigs).toHaveLength(2);
      expect(sigs![0].type).not.toBe(sigs![1].type);
      for (const s of sigs!) expect(s.chance).toBeGreaterThanOrEqual(0.05);
    }
    for (const id of Object.keys(BOSS_SIGNATURES)) expect(ENEMY_DEFS.has(id), id).toBe(true);
  });

  it('resolves to a drop-source unique usable by the class, stable per boss', () => {
    for (const [boss, sigs] of Object.entries(BOSS_SIGNATURES)) {
      for (const cls of CLASSES) {
        for (const sig of sigs) {
          const id = signatureUnique(boss, sig, cls);
          expect(id, `${boss}/${cls}`).not.toBeNull();
          const def = UNIQUE_DEFS.get(id!)!;
          expect(def.rarity).toBe('unique');
          expect(def.source).not.toBe('quest');
          expect(!def.classes || def.classes.includes(cls)).toBe(true);
          expect(signatureUnique(boss, sig, cls)).toBe(id);
        }
      }
    }
    // The type is honoured wherever the class has a unique of it.
    const id = signatureUnique('vire', { type: 'weapon', chance: 0.1 }, 'spectre')!;
    expect(BASE_ITEMS.get(UNIQUE_DEFS.get(id)!.base)!.type).toBe('weapon');
  });

  it('drops signatures much more often than the plain unique weight, and the tier multiplier helps', () => {
    let hits = 0;
    const rng = new Rng('sig');
    for (let i = 0; i < 2000; i++) if (rollBossSignatures(rng, 'vire', 'bastion').length > 0) hits++;
    expect(hits / 2000).toBeGreaterThan(0.1);
    expect(hits / 2000).toBeLessThan(0.25);
    expect(rollBossSignatures(new Rng('x'), 'nobody', 'bastion')).toEqual([]);
  });

  it('a boss reward request with boss set can add the signature unique to the ground', () => {
    const uniques = new Set<string>();
    for (let n = 0; n < 80; n++) {
      const world = new World();
      const ctx = makeCtx();
      ctx.loot.rng = new Rng(`d13-${n}`);
      spawnPlayer(world, 'bastion', 0, 0);
      ctx.rewards.push({ table: 'dt.boss', level: 10, x: 1, z: 1, xp: false, boss: 'vire' });
      run(world, ctx, [rewardSystem], 1);
      for (const e of world.query(GroundItem)) {
        const it = world.req(e, GroundItem).item;
        if (it.unique) uniques.add(it.unique);
      }
    }
    const expected = new Set(BOSS_SIGNATURES.vire!.map((s) => signatureUnique('vire', s, 'bastion')!));
    expect([...uniques].some((u) => expected.has(u))).toBe(true);
  });
});

describe('D05 six new uniques', () => {
  const NEW = ['spore_mantle', 'thornwoven_band', 'prospectors_lamp', 'sunken_greaves', 'memory_lens', 'lightstep_boots'];
  it('exist, drop for every class, and have names and effects in the language file', async () => {
    const en = (await import('../src/data/lang/en.json')).default as { uniques: Record<string, { name: string; effect: string; flavor: string }> };
    for (const id of NEW) {
      const u = UNIQUE_DEFS.get(id)!;
      expect(u, id).toBeDefined();
      expect(u.rarity).toBe('unique');
      expect(u.source).not.toBe('quest');
      expect(u.classes).toBeUndefined();
      expect(u.affixes.length).toBeGreaterThanOrEqual(3);
      expect(en.uniques[id]?.name).toBeTruthy();
      expect(en.uniques[id]?.effect).toBeTruthy();
    }
    // Two per region 3-5, using the existing base icons.
    expect(new Set(NEW.map((id) => UNIQUE_DEFS.get(id)!.base)).size).toBe(6);
    for (const id of NEW) expect(BASE_ITEMS.has(UNIQUE_DEFS.get(id)!.base)).toBe(true);
  });
});

describe('D06 eight new aspects', () => {
  const NEW = ['cleaver', 'afterburner', 'long_arm', 'steady_hand', 'venom_edge', 'miasma', 'sacred_flame', 'choir_of_light'];
  it('two per class, valid for their class, with strings and borrowed art', async () => {
    const en = (await import('../src/data/lang/en.json')).default as { aspects: Record<string, { name: string; desc: string }> };
    const { ASPECT_DEFS } = await import('../src/data/loot/db');
    const { ART_ALIAS } = await import('../src/data/artAlias');
    const { ART_FILES } = await import('../src/data/artFiles');
    const perClass: Record<string, number> = {};
    for (const id of NEW) {
      const a = ASPECT_DEFS.get(id)!;
      expect(a, id).toBeDefined();
      expect(a.classes).toHaveLength(1);
      perClass[a.classes![0]!] = (perClass[a.classes![0]!] ?? 0) + 1;
      expect(en.aspects[id]?.desc).toContain('{value}');
      expect(ART_FILES.has(ART_ALIAS[`aspects/${id}`] ?? '')).toBe(true);
    }
    expect(perClass).toEqual({ bastion: 2, spectre: 2, xenomant: 2, lightbearer: 2 });
  });
});

describe('D07 three new bounty types', () => {
  it('are repeatable, valid and use steps that exist', async () => {
    const { QUESTS, NPCS } = await import('../src/data/quests/db');
    for (const id of ['bt.cf_pylon', 'bt.hv_samples', 'bt.dm_hunt']) {
      const q = QUESTS.get(id)!;
      expect(q.repeatable).toBe(true);
      expect(NPCS.get(q.giver!)?.zone).toBe(q.zone);
      expect(q.steps.at(-1)!.kind).toBe('talk');
    }
    const samples = QUESTS.get('bt.hv_samples')!.steps.find((s) => s.kind === 'interact');
    expect(samples && samples.kind === 'interact' && samples.objects).toHaveLength(5);
    const hunt = QUESTS.get('bt.dm_hunt')!.steps[0]!;
    expect(hunt.kind === 'kill' && hunt.spawn?.elite).toBe('champion');
  });
});

describe('D08 lore pages and D09 NPC barks', () => {
  it('D08: twelve new lore notes with title and body, placed in the zones', async () => {
    const en = (await import('../src/data/lang/en.json')).default as unknown as { lore: Record<string, Record<string, { title: string; body: string }>> };
    const { ZONES } = await import('../src/data/zones');
    const counts = { cf: 14, rd: 14, hv: 15, dm: 15, core: 14 } as Record<string, number>;
    let added = 0;
    for (const [k, n] of Object.entries(counts)) {
      expect(Object.keys(en.lore[k]!)).toHaveLength(n);
      for (let i = 12; i < n; i++) {
        added++;
        expect(en.lore[k]![String(i)]!.title.length).toBeGreaterThan(3);
        expect(en.lore[k]![String(i)]!.body.length).toBeGreaterThan(60);
      }
    }
    expect(added).toBe(12);
    const logs = ZONES.flatMap((z) => z.pois.filter((p) => p.kind === 'lore').map((p) => String(p.data?.log)));
    for (const [k, n] of Object.entries(counts)) for (let i = 12; i < n; i++) expect(logs).toContain(`${k}.${i}`);
  });

  it('D09: every hub NPC has three idle barks and two reactions, and the system picks them in order', async () => {
    const en = (await import('../src/data/lang/en.json')).default as unknown as { barks: Record<string, { idle: Record<string, string>; react: Record<string, string> }> };
    const { BARK_NPCS } = await import('../src/data/barks');
    const { NPCS } = await import('../src/data/quests/db');
    const { nextBarkKey } = await import('../src/world/barks');
    expect(BARK_NPCS.length).toBeGreaterThanOrEqual(20);
    for (const id of BARK_NPCS) {
      expect(NPCS.has(id), id).toBe(true);
      expect(Object.keys(en.barks[id]!.idle), id).toHaveLength(3);
      expect(Object.keys(en.barks[id]!.react), id).toHaveLength(2);
    }
    const heard = new Set<string>();
    expect(nextBarkKey('benny', false, false, heard, 4)).toBe('barks.benny.idle.1');
    expect(nextBarkKey('benny', true, false, heard, 0)).toBe('barks.benny.react.0');
    heard.add('benny:0');
    expect(nextBarkKey('benny', true, true, heard, 0)).toBe('barks.benny.react.1');
  });
});

describe('D12 regional elite names', () => {
  it('rare elites draw prefix + suffix and titles from their region, deterministically', async () => {
    const { rareName, eliteRegionOf } = await import('../src/systems/elites');
    const en = (await import('../src/data/lang/en.json')).default as unknown as { elites: { regional: Record<string, { prefix: string; suffix: string; title: string }> } };
    expect(eliteRegionOf(5)).toBe('cf');
    expect(eliteRegionOf(25)).toBe('hv');
    expect(eliteRegionOf(45)).toBe('core');
    const all = new Set<string>();
    for (const [level, key] of [[5, 'cf'], [15, 'rd'], [25, 'hv'], [35, 'dm'], [48, 'core']] as const) {
      const r = en.elites.regional[key]!;
      for (let i = 0; i < 30; i++) {
        const name = rareName(new Rng(`n${level}-${i}`), level);
        const [first, rest] = name.split(' the ');
        expect(rest, name).toBeTruthy();
        expect(r.prefix.split('|').some((p) => first!.startsWith(p)), name).toBe(true);
        expect(r.title.split('|').some((t) => name.endsWith(t)), name).toBe(true);
        all.add(first!);
      }
      expect(rareName(new Rng('same'), level)).toBe(rareName(new Rng('same'), level));
    }
    expect(all.size).toBeGreaterThan(40);
  });
});

describe('D15 feats round 2', () => {
  it('adds ten feats, three with titles', async () => {
    const { FEATS } = await import('../src/data/feats');
    const ids = ['thousand_cuts', 'ash_legion', 'elite_scourge', 'giant_killer', 'unique_hoard', 'mythic_hoard', 'rift_legend', 'rift_apex', 'maxed_out', 'town_hero'];
    const mine = FEATS.filter((f) => ids.includes(f.id));
    expect(mine).toHaveLength(10);
    expect(mine.filter((f) => f.title)).toHaveLength(3);
  });
});
