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

describe('D20 credits screen', () => {
  it('lists every source named in docs/credits.md with a heading string', async () => {
    const { readFileSync } = await import('node:fs');
    const { CREDITS } = await import('../src/data/credits');
    const en = (await import('../src/data/lang/en.json')).default as unknown as { credits: { sections: Record<string, string> } };
    const md = readFileSync(new URL('../docs/credits.md', import.meta.url), 'utf8');
    const text = CREDITS.flatMap((s) => s.entries).map((e) => `${e.source} ${e.licence}`).join(' ');
    for (const needle of ['Poly Haven', 'Quaternius', 'Kenney', 'ambientCG', 'game-icons.net', 'Abstraction', 'Rajdhani', 'Meshy', 'FLUX', 'Blender']) {
      expect(text, needle).toContain(needle === 'Rajdhani' ? 'Google Fonts' : needle);
      if (needle !== 'Blender') expect(md, needle).toContain(needle);
    }
    for (const s of CREDITS) expect(en.credits.sections[s.id]).toBeTruthy();
    expect(text).toContain('CC BY 3.0');
  });
});

describe('D18 machine death pose', () => {
  it('twitches, topples to nearly flat with a small bounce, and never goes below the ground', async () => {
    const { machineDeathPose } = await import('../src/render/deathPose');
    expect(machineDeathPose(0).pitch).toBe(0);
    expect(Math.abs(machineDeathPose(0.3).roll)).toBeGreaterThan(0);
    const end = machineDeathPose(1);
    expect(end.pitch).toBeGreaterThan(1.4);
    for (let t = 0; t < 1.2; t += 0.02) expect(machineDeathPose(t).lift).toBeGreaterThanOrEqual(0);
    expect(machineDeathPose(0.35 + 0.45 * 0.9).lift).toBeGreaterThan(0.03);
  });
});

describe('D17 ground decals', () => {
  it('hold, then fade to nothing; the pool reuses its oldest slot', async () => {
    const { decalFade, GROUND_DECAL_LIFE, GROUND_DECAL_POOL, GroundDecals } = await import('../src/render/groundDecals');
    expect(decalFade(0)).toBe(1);
    expect(decalFade(GROUND_DECAL_LIFE * 0.6)).toBe(1);
    expect(decalFade(GROUND_DECAL_LIFE * 0.8)).toBeCloseTo(0.5, 5);
    expect(decalFade(GROUND_DECAL_LIFE)).toBe(0);
    const d = new GroundDecals();
    expect(() => {
      for (let i = 0; i < GROUND_DECAL_POOL + 5; i++) d.add('blood', i, 0, 1);
    }).not.toThrow();
    expect(d.activeCount).toBeLessThanOrEqual(GROUND_DECAL_POOL);
    d.update(GROUND_DECAL_LIFE + 1);
    expect(d.activeCount).toBe(0);
  });
});

describe('D04 minion look', () => {
  it('raised minions get the minion look, and the Xenomant prefetches the bone shards', async () => {
    const { LOOKS } = await import('../src/render/looks');
    const { classAssetIds } = await import('../src/data/assetSets');
    expect(LOOKS.minion.keepTexture).toBe(true);
    expect(classAssetIds('xenomant')).toContain('part.bone_shards');
    expect(classAssetIds('bastion')).not.toContain('part.bone_shards');
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(new URL('../src/systems/minions.ts', import.meta.url), 'utf8')).toContain("r.look = 'minion'");
  });
});

describe('D10 ambient life and D11 weather', () => {
  it('every region has ambient life, three regions have weather, and the preset toggles them', async () => {
    const { ATMOSPHERE, atmosphereFor } = await import('../src/data/atmosphere');
    const { ZONES } = await import('../src/data/zones');
    for (const z of ZONES) if (z.id !== 'zone.test_arena' && ATMOSPHERE[z.id] === undefined) expect(z.id.startsWith('zone.')).toBe(true);
    for (const id of ['zone.cinder_flats', 'zone.refinery_district', 'zone.hydroponic_vaults', 'zone.deep_mines', 'zone.the_core']) expect(ATMOSPHERE[id]!.ambient.count).toBeGreaterThan(0);
    expect(Object.entries(ATMOSPHERE).filter(([, r]) => r.weather).map(([k]) => k).sort()).toEqual(['zone.cinder_flats', 'zone.hydroponic_vaults', 'zone.the_core']);
    expect(atmosphereFor('zone.cinder_flats', 'low')).toEqual({ ambient: null, weather: null });
    const med = atmosphereFor('zone.cinder_flats', 'medium');
    const high = atmosphereFor('zone.cinder_flats', 'high');
    expect(med.ambient).not.toBeNull();
    expect(med.weather!.count).toBe(high.weather!.count / 2);
    expect(atmosphereFor('zone.deep_mines', 'high').weather).toBeNull();
  });

  it('a cloud keeps its particles inside the box around the focus and the height band', async () => {
    const { stepCloud } = await import('../src/render/atmosphere');
    const { ATMOSPHERE } = await import('../src/data/atmosphere');
    const def = ATMOSPHERE['zone.cinder_flats']!.weather!;
    const n = 200;
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (i % 20) - 10; pos[i * 3 + 1] = 5; pos[i * 3 + 2] = (i % 7) - 3; phase[i] = i; }
    const focus = { x: 0, z: 0 };
    for (let s = 0; s < 600; s++) { focus.x += 0.1; stepCloud(pos, phase, def, s / 60, 1 / 60, focus, 40); }
    for (let i = 0; i < n; i++) {
      expect(Math.abs(pos[i * 3]! - focus.x)).toBeLessThanOrEqual(20.001);
      expect(pos[i * 3 + 1]!).toBeGreaterThanOrEqual(def.y[0]);
      expect(pos[i * 3 + 1]!).toBeLessThanOrEqual(def.y[1]);
    }
  });
});

describe('D14 one more world event per region 1-4', () => {
  it('has a place in each zone, strings, and an existing event as its logic', async () => {
    const { EVENT_BASE, baseType } = await import('../src/world/worldEvents');
    const { ZONES } = await import('../src/data/zones');
    const en = (await import('../src/data/lang/en.json')).default as unknown as { worldEvents: Record<string, { title: string; objective: string }> };
    const wanted: Record<string, string> = { 'zone.cinder_flats': 'beaconRelight', 'zone.refinery_district': 'foundryAmbush', 'zone.hydroponic_vaults': 'pollenRun', 'zone.deep_mines': 'cartRescue' };
    for (const [zone, type] of Object.entries(wanted)) {
      const z = ZONES.find((x) => x.id === zone)!;
      expect(z.pois.some((p) => p.kind === 'event' && p.data?.event === type), type).toBe(true);
      expect(en.worldEvents[type]!.title).toBeTruthy();
      expect(en.worldEvents[type]!.objective).toContain('{s}');
      expect(EVENT_BASE[type as keyof typeof EVENT_BASE]).toBeDefined();
      expect(baseType(type as never)).not.toBe(type);
    }
  });
});

describe('D16 ten Blender props', () => {
  it('are in the manifest as Blender props and placed in their zones', async () => {
    const { readFileSync } = await import('node:fs');
    const { ZONES } = await import('../src/data/zones');
    const { ROUND4_PROPS } = await import('../src/data/zones/round4Props');
    const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')) as { assets: { id: string; source?: string; file?: string }[] };
    const ids = new Set(Object.values(ROUND4_PROPS).flat().map((s) => s.asset));
    expect(ids.size).toBe(10);
    for (const id of ids) {
      const a = manifest.assets.find((x) => x.id === id)!;
      expect(a?.source, id).toBe('blender');
      expect(a.file).toMatch(/^blender\//);
    }
    for (const [zone, spots] of Object.entries(ROUND4_PROPS)) {
      const z = ZONES.find((x) => x.id === zone)!;
      for (const s of spots) expect(z.props.filter((p) => p.asset === s.asset).length, `${zone} ${s.asset}`).toBeGreaterThanOrEqual(Math.min(s.count, 4));
    }
  });
});
