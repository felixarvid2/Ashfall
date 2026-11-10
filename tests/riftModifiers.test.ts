import { describe, expect, it } from 'vitest';
import { Blast, Dead, Elite, EnemyAI, Hazard, StatusEffects, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { emptyAccount } from '../src/core/account';
import { RIFT, RIFT_ID } from '../src/data/endgame/rifts';
import en from '../src/data/lang/en.json';
import { kill } from '../src/systems/combat';
import { ensureEndgame } from '../src/systems/endgame/matrix';
import { RIFT_MODIFIERS, RIFT_MODIFIER_IDS, RIFT_MODIFIER_TUNING, ringInnerAt, rollRiftModifier, type RiftModifierId } from '../src/systems/endgame/riftModifiers';
import { riftHud } from '../src/systems/endgame/rifts';
import { buildInstance, instanceSystem, roomCenter } from '../src/world/instance';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeCtx, run } from './helpers';
import manifest from '../assets/manifest.json';

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

/** A rift whose modifier is forced (the roll is tested separately). */
function rift(modifier: RiftModifierId | null, level = 20) {
  const world = new World();
  const account = emptyAccount();
  account.endgame.tierUnlocked = 2;
  const ctx = makeCtx({ worldHalfSize: 2600, account, zoneLevels: [1, 10] });
  ensureEndgame(ctx);
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const rt = buildInstance(world, ctx, RIFT_ID, 'riftObelisk', 'mods', 50, { x: 10, z: 10 }, level);
  ctx.instance = rt;
  rt.rift!.modifier = modifier;
  moveTo(world, player, rt.start.x, rt.start.z);
  const tick = (n = 1) => run(world, ctx, [instanceSystem], n);
  return { world, ctx, player, rt, r: rt.rift!, tick };
}
const living = (world: World) => world.query(EnemyAI).filter((e) => !world.has(e, Dead));

describe('A20 rift modifiers: the roll', () => {
  it('four modifiers, each with an existing icon and strings', () => {
    expect(RIFT_MODIFIER_IDS).toHaveLength(4);
    const ids = new Set(((manifest as { assets?: { id: string }[] }).assets ?? (manifest as unknown as { id: string }[])).map((a) => a.id));
    for (const id of RIFT_MODIFIER_IDS) {
      expect(ids.has(RIFT_MODIFIERS[id].icon), RIFT_MODIFIERS[id].icon).toBe(true);
      const s = (en.rifts.modifiers as Record<string, { name: string; desc: string }>)[id]!;
      expect(s.name && s.desc).toBeTruthy();
    }
    expect(new Set(RIFT_MODIFIER_IDS.map((id) => RIFT_MODIFIERS[id].icon)).size).toBe(4);
  });
  it('low rifts have none; the rest roll one in about 70 %, every kind appears, and a seed always gives the same', () => {
    for (let i = 0; i < 50; i++) expect(rollRiftModifier(new Rng(`a${i}`), RIFT_MODIFIER_TUNING.minLevel - 1)).toBeNull();
    const seen = new Map<string | null, number>();
    for (let i = 0; i < 400; i++) {
      const m = rollRiftModifier(new Rng(`b${i}`), 30);
      seen.set(m, (seen.get(m) ?? 0) + 1);
      expect(rollRiftModifier(new Rng(`b${i}`), 30)).toBe(m);
    }
    for (const id of RIFT_MODIFIER_IDS) expect(seen.get(id) ?? 0).toBeGreaterThan(40);
    expect((seen.get(null) ?? 0) / 400).toBeGreaterThan(0.15);
    expect((seen.get(null) ?? 0) / 400).toBeLessThan(0.45);
  });
  it('a rift built from a seed carries its roll, and the HUD reports it', () => {
    const a = rift(null, 30);
    const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
    const mods = seeds.map((seed) => {
      const world = new World();
      const ctx = makeCtx({ worldHalfSize: 2600, account: emptyAccount(), zoneLevels: [1, 10] });
      ensureEndgame(ctx);
      spawnPlayer(world, 'bastion', 0, 0);
      return buildInstance(world, ctx, RIFT_ID, 'riftObelisk', seed, 50, { x: 10, z: 10 }, 30).rift!.modifier;
    });
    expect(mods.some((m) => m !== null)).toBe(true);
    a.r.modifier = 'eliteStorm';
    expect(riftHud(a.r).modifier).toBe('eliteStorm');
  });
});

describe('A20 rift modifiers: the twists', () => {
  it('Volatile Dead: some kills leave a warned blast that hurts the player only', () => {
    const g = rift('volatileDead');
    g.tick(2);
    let blasts = 0;
    for (let i = 0; i < 40; i++) {
      const e = spawnEnemy(g.world, 'infected_colonist', g.world.req(g.player, Transform).x + 5, 0, { level: RIFT.monsterLevel });
      g.tick(1);
      kill(g.world, g.ctx, e, g.player);
      g.tick(2);
    }
    for (const b of g.world.query(Blast)) {
      blasts++;
      expect(g.world.req(b, Blast).hurtsEnemies).toBe(false);
    }
    expect(blasts).toBeGreaterThan(3);
    expect(blasts).toBeLessThan(30);
    const none = rift(null);
    none.tick(2);
    const e = spawnEnemy(none.world, 'infected_colonist', 5, 0, { level: RIFT.monsterLevel });
    none.tick(1);
    kill(none.world, none.ctx, e, none.player);
    none.tick(3);
    expect(none.world.query(Blast)).toHaveLength(0);
  });

  it('Elite Storm: far more of the rift is champions than normally', () => {
    const share = (m: RiftModifierId | null) => {
      const g = rift(m, 20);
      for (const room of g.rt.layout.rooms) {
        const c = roomCenter(room);
        moveTo(g.world, g.player, c.x, c.z);
        g.tick(2);
      }
      const all = living(g.world);
      return { n: all.length, elite: all.filter((e) => g.world.has(e, Elite)).length };
    };
    const base = share(null);
    const storm = share('eliteStorm');
    expect(storm.n).toBeGreaterThan(10);
    expect(storm.elite / storm.n).toBeGreaterThan(base.elite / base.n + 0.12);
  });

  it('Shrinking Arena: nothing until the guardian, then a ring that closes in', () => {
    const g = rift('shrinkingArena');
    g.tick(5);
    expect(g.world.query(Hazard).filter((h) => g.world.req(h, Hazard).inner !== undefined)).toHaveLength(0);
    g.r.points = RIFT.need;
    g.tick(1);
    expect(g.r.mod.ring).not.toBeNull();
    const hz = g.world.req(g.r.mod.ring!, Hazard);
    const start = hz.inner!;
    expect(start).toBeGreaterThan(10);
    g.r.elapsed += RIFT_MODIFIER_TUNING.shrinkingArena.warmup + 30;
    g.tick(1);
    expect(hz.inner!).toBeLessThan(start);
    g.r.elapsed += 200;
    g.tick(1);
    expect(hz.inner!).toBeCloseTo(start * RIFT_MODIFIER_TUNING.shrinkingArena.to, 1);
    expect(ringInnerAt(30, 0)).toBe(30);
    expect(ringInnerAt(30, 1e6)).toBeCloseTo(30 * RIFT_MODIFIER_TUNING.shrinkingArena.to);
  });

  it('Lumen Surges: a warning, then the enemies surge for a few seconds', () => {
    const g = rift('lumenSurges');
    g.tick(2);
    const foe = spawnEnemy(g.world, 'infected_colonist', 6, 0, { level: RIFT.monsterLevel });
    g.tick(1);
    const T = RIFT_MODIFIER_TUNING.lumenSurges;
    g.tick(Math.ceil(60 * T.every) + 5);
    expect(g.ctx.events.drain().some((ev) => ev.type === 'banner' && ev.key === 'rifts.modifiers.lumenSurges.flare')).toBe(true);
    g.tick(Math.ceil(60 * T.warning) + 2);
    const st = g.world.get(foe, StatusEffects);
    expect(st?.list.some((s) => s.id === 'overcharge')).toBe(true);
  });
});

