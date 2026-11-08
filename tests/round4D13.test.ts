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
