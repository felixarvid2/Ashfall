import { describe, expect, it } from 'vitest';
import { Boss, CombatStats, Dead, Elite, EnemyAI, Health, Interactable, Renderable, Transform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { emptyAccount } from '../src/core/account';
import { BOSS_SCRIPTS } from '../src/data/bosses';
import { ENEMY_DEFS } from '../src/data/db';
import { RIFT, RIFT_GUARDIANS, RIFT_ID, RIFT_PACKS, RIFT_RECIPE_POOL, RIFT_REWARDS } from '../src/data/endgame/rifts';
import { riftObeliskAt } from '../src/data/endgame/riftObelisks';
import { INSTANCES } from '../src/data/instances';
import en from '../src/data/lang/en.json';
import { packTemplate } from '../src/data/packs';
import { TIER_BEACONS } from '../src/data/endgame/beacons';
import { NPCS } from '../src/data/quests/db';
import { STASH_POSITION } from '../src/data/quests/cinderFlats';
import { ZONES } from '../src/data/zones';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import { THE_CORE } from '../src/data/zones/theCore';
import { kill } from '../src/systems/combat';
import { ensureEndgame } from '../src/systems/endgame/matrix';
import {
  createRift,
  completeRift,
  failRift,
  killWeight,
  openRiftCache,
  riftEntryProblem,
  riftGlyphAttempt,
  riftItemPower,
  riftOpenLevel,
  riftProgress,
  riftScale,
  riftsUnlocked,
  tickRift,
} from '../src/systems/endgame/rifts';
import { tierMods } from '../src/systems/endgame/tiers';
import { buildInstance, instanceInteract, instanceSystem, objectiveText, riftHost, roomCenter, type InstanceRuntime } from '../src/world/instance';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { makeElite } from '../src/world/zone';
import { makeCtx, run } from './helpers';

function moveTo(world: World, e: Entity, x: number, z: number) {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
}

/** A character in a rift of `level` (the account has World Tier 2 unless told otherwise). */
function inRift(level: number, opts: { tierUnlocked?: number; seed?: string } = {}) {
  const world = new World();
  const account = emptyAccount();
  account.endgame.tierUnlocked = opts.tierUnlocked ?? 2;
  const ctx = makeCtx({ worldHalfSize: 2600, account, zoneLevels: [1, 10] });
  ensureEndgame(ctx);
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const rt = buildInstance(world, ctx, RIFT_ID, 'riftObelisk', opts.seed ?? 's1', 50, { x: 10, z: 10 }, level);
  ctx.instance = rt;
  moveTo(world, player, rt.start.x, rt.start.z);
  return { world, ctx, player, rt, rift: rt.rift! };
}
type Rift = ReturnType<typeof inRift>;

const enemies = (world: World) => world.query(EnemyAI).filter((e) => !world.has(e, Dead));
const objects = (world: World, kind: string) => world.query(Interactable).filter((e) => world.req(e, Interactable).kind === kind);
const tick = (g: Rift, n = 1) => run(g.world, g.ctx, [instanceSystem], n);

/** Walk the whole rift so every room wakes. */
function wakeAll(g: Rift) {
  for (const room of g.rt.layout.rooms) {
    const c = roomCenter(room);
    moveTo(g.world, g.player, c.x, c.z);
    tick(g, 2);
  }
}

/** A plain enemy next to the player. */
function nearby(g: Rift): Entity {
  const tr = g.world.req(g.player, Transform);
  return spawnEnemy(g.world, 'infected_colonist', tr.x + 3, tr.z, { level: RIFT.monsterLevel });
}

/** Fill the bar and let the guardian spawn. */
function callGuardian(g: Rift): Entity {
  g.rift.points = RIFT.need;
  tick(g);
  expect(g.rift.phase).toBe('guardian');
  return g.rift.guardian!;
}

function clearRift(g: Rift): InstanceRuntime {
  const boss = callGuardian(g);
  kill(g.world, g.ctx, boss, 0);
  tick(g);
  expect(g.rift.phase).toBe('cleared');
  return g.rt;
}

describe('Deep Rifts: levels', () => {
  it('the obelisk waits for World Tier 2', () => {
    const locked = inRift(1, { tierUnlocked: 1 });
    expect(riftsUnlocked(locked.ctx)).toBe(false);
    expect(riftEntryProblem(locked.ctx, 1)).toBe('locked');
    const open = inRift(1);
    expect(riftsUnlocked(open.ctx)).toBe(true);
    expect(riftEntryProblem(open.ctx, 1)).toBeNull();
  });

  it('opens level 1 first, then best + 1, or two more after a fast clear, up to 100', () => {
    const g = inRift(1);
    const e = g.ctx.account!.endgame;
    expect(riftOpenLevel(g.ctx)).toBe(1);
    e.riftBest = 5;
    expect(riftOpenLevel(g.ctx)).toBe(6);
    e.riftOpen = 7;
    expect(riftOpenLevel(g.ctx)).toBe(7);
    e.riftBest = 100;
    e.riftOpen = 102;
    expect(riftOpenLevel(g.ctx)).toBe(RIFT.maxLevel);
    expect(riftEntryProblem(g.ctx, 100)).toBeNull();
    e.riftBest = 5;
    e.riftOpen = 0;
    expect(riftEntryProblem(g.ctx, 7)).toBe('level');
    expect(riftEntryProblem(g.ctx, 0)).toBe('level');
    expect(riftEntryProblem(g.ctx, 2.5)).toBe('level');
  });

  it('the obelisks stand in the Last Camp and in Outpost Ember', () => {
    expect(riftObeliskAt(THE_CORE.id)).toBeDefined();
    expect(riftObeliskAt(CINDER_FLATS.id)).toBeDefined();
    expect(riftObeliskAt('zone.deep_mines')).toBeUndefined();
    // Clear of the hub's NPCs, stash, teleporters and Tier Beacon, and inside the zone.
    for (const id of [THE_CORE.id, CINDER_FLATS.id]) {
      const zone = ZONES.find((z) => z.id === id)!;
      const o = riftObeliskAt(id)!;
      expect(Math.hypot(o.x, o.z)).toBeLessThan(zone.halfSize);
      const others = [
        ...[...NPCS.values()].filter((n) => n.zone === id),
        ...zone.teleporters,
        id === CINDER_FLATS.id ? STASH_POSITION : (zone.stash ?? { x: 1e9, z: 1e9 }),
        TIER_BEACONS[id]!,
      ];
      for (const p of others) expect(Math.hypot(p.x - o.x, p.z - o.z), `${id} obelisk near ${JSON.stringify(p)}`).toBeGreaterThan(3);
    }
  });
});

describe('Deep Rifts: scaling', () => {
  it('life and damage grow 6 % per level', () => {
    expect(riftScale(0)).toBe(1);
    expect(riftScale(10)).toBeCloseTo(1.06 ** 10, 10);
    expect(riftScale(100)).toBeCloseTo(1.06 ** 100, 6);
  });

  it('every enemy is level 50, scaled by 1.06 ^ rift level on top (same seed, same crowd)', () => {
    const total = (g: Rift) => {
      wakeAll(g);
      let life = 0;
      let dmg = 0;
      for (const e of enemies(g.world)) {
        life += g.world.req(e, Health).max;
        dmg += g.world.req(e, CombatStats).weaponDamage;
        expect(g.world.req(e, CombatStats).level).toBe(50);
      }
      return { life, dmg, n: enemies(g.world).length };
    };
    const a = total(inRift(1, { seed: 'same' }));
    const b = total(inRift(21, { seed: 'same' }));
    expect(a.n).toBeGreaterThan(40);
    expect(b.n).toBe(a.n);
    expect(b.life / a.life).toBeCloseTo(1.06 ** 20, 6);
    expect(b.dmg / a.dmg).toBeCloseTo(1.06 ** 20, 6);
  });

  it('World Tier modifiers do not apply inside a rift', () => {
    const g = inRift(5);
    g.ctx.account!.endgame.tierUnlocked = 4;
    g.ctx.account!.endgame.tier = 4;
    expect(tierMods(g.ctx).enemyLife).toBe(1);
    expect(tierMods(g.ctx).enemyDamage).toBe(1);
    expect(tierMods(g.ctx).itemPower).toBe(0);
  });

  it('mixes the enemies of every region and rooms with props from every kit', () => {
    const g = inRift(1);
    wakeAll(g);
    const defs = new Set(enemies(g.world).map((e) => g.world.req(e, EnemyAI).defId));
    const has = (...ids: string[]) => ids.some((id) => defs.has(id));
    expect(has('infected_colonist', 'spore_hound', 'sergeant')).toBe(true);
    expect(has('scorched_walker', 'smelter', 'welder', 'slag_hound', 'flame_drone')).toBe(true);
    expect(has('overgrown_walker', 'mutated_botanist', 'vine_weaver', 'spore_hound')).toBe(true);
    expect(has('crystal_walker', 'infected_miner', 'blind_hound', 'burrower', 'echo')).toBe(true);
    expect(has('shade_walker', 'shade_hound', 'light_mote', 'light_being', 'core_guardian')).toBe(true);
    expect(RIFT_PACKS.length).toBeGreaterThan(20);
  });

  it('item power: the level-50 baseline plus 2 per level, capped at 540', () => {
    expect(riftItemPower(1)).toBe(RIFT_REWARDS.itemPower.base + 2);
    expect(riftItemPower(40)).toBe(RIFT_REWARDS.itemPower.base + 80);
    expect(riftItemPower(100)).toBe(540);
    expect(riftItemPower(65)).toBe(540);
    expect(riftItemPower(64)).toBeLessThan(540);
  });
});

describe('Deep Rifts: the progress bar', () => {
  it('normal enemies count 1, champions 5, rare elites 10', () => {
    const g = inRift(1);
    const rng = new Rng('w');
    const normal = nearby(g);
    const champion = nearby(g);
    makeElite(g.world, champion, 'champion', rng);
    const rare = nearby(g);
    const minions = makeElite(g.world, rare, 'rare', rng);
    expect(killWeight(g.world, normal)).toBe(1);
    expect(killWeight(g.world, champion)).toBe(5);
    expect(killWeight(g.world, rare)).toBe(10);
    expect(killWeight(g.world, minions[0]!)).toBe(1);
    // A mirrored copy counts for nothing.
    g.world.req(champion, Elite).copy = true;
    expect(killWeight(g.world, champion)).toBe(0);
    g.world.req(champion, Elite).copy = false;

    tick(g);
    expect(g.rift.points).toBe(0);
    for (const e of [normal, champion, rare]) kill(g.world, g.ctx, e, 0);
    tick(g);
    expect(g.rift.points).toBe(16);
    // Corpses are counted once.
    tick(g, 30);
    expect(g.rift.points).toBe(16);
    expect(riftProgress(g.rift)).toBeCloseTo(16 / RIFT.need, 10);
  });

  it('a rift fills from kills: the layout holds enough points for the bar, with the surge as a backstop', () => {
    const g = inRift(1);
    wakeAll(g);
    let points = 0;
    for (const e of enemies(g.world)) points += killWeight(g.world, e);
    // Enough that the bar fills after exploring about half the rooms.
    expect(points).toBeGreaterThan(RIFT.need * 1.4);
  });

  it('when every room is awake and the crowd is gone, the rift sends more packs', () => {
    const g = inRift(1);
    wakeAll(g);
    // The crowd is gone without a kill (so the bar stays low).
    for (const e of enemies(g.world)) g.world.destroyDeferred(e);
    tick(g);
    const before = enemies(g.world).length;
    expect(before).toBeLessThan(RIFT.surgeBelow);
    expect(riftProgress(g.rift)).toBeLessThan(1);
    tick(g, Math.ceil(RIFT.surgeEvery * 60) + 5);
    expect(enemies(g.world).length).toBeGreaterThan(before);
    expect(g.rift.phase).toBe('running');
  });
});

describe('Deep Rifts: the Rift Guardian', () => {
  it('does not appear before the bar is full', () => {
    const g = inRift(3);
    g.rift.points = RIFT.need - 1;
    tick(g);
    expect(g.rift.guardian).toBeNull();
    expect(g.rift.phase).toBe('running');
  });

  it('spawns at 100 %, in the Lumen look, scaled by the rift level; the crowd falls away', () => {
    const g = inRift(30);
    wakeAll(g);
    expect(enemies(g.world).length).toBeGreaterThan(10);
    const boss = callGuardian(g);
    expect(g.world.has(boss, Boss)).toBe(true);
    expect(g.world.req(boss, Renderable).look).toBe('lumen');
    expect(g.world.req(boss, CombatStats).level).toBe(50);
    const def = RIFT_GUARDIANS.find((x) => x.enemy === g.world.req(boss, EnemyAI).defId)!;
    expect(def).toBeDefined();
    const base = ENEMY_DEFS.get(def.enemy)!;
    const perLevel = 1 + 0.18 * 49;
    expect(g.world.req(boss, Health).max).toBeGreaterThan(base.life * perLevel * def.lifeMul * riftScale(30) * 0.99);
    // The rest of the rift is gone: only the guardian (and anything it brings) is left.
    expect(enemies(g.world).filter((e) => e !== boss)).toHaveLength(0);
    expect(objectiveText(g.world, g.rt, (k) => k)).toBe('rifts.objective.guardian');
    // It is not counted as a kill, and does not spawn twice.
    tick(g, 5);
    expect(g.rift.guardian).toBe(boss);
    expect(g.world.query(Boss)).toHaveLength(1);
  });

  it('every guardian is a real boss with a script and a name', () => {
    expect(RIFT_GUARDIANS.length).toBeGreaterThanOrEqual(5);
    const lang = (k: string) => k.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], en);
    for (const g of RIFT_GUARDIANS) {
      expect(ENEMY_DEFS.has(g.enemy), g.enemy).toBe(true);
      expect(BOSS_SCRIPTS[g.script!], g.enemy).toBeDefined();
      expect(typeof lang(g.name), g.name).toBe('string');
    }
  });
});

describe('Deep Rifts: the timer', () => {
  it('runs 10 minutes; out of time the rift collapses, with no cache and no upgrades', () => {
    const g = inRift(4);
    expect(RIFT.time).toBe(600);
    g.rift.elapsed = RIFT.time - 0.05;
    tick(g, 6);
    expect(g.rift.phase).toBe('failed');
    expect(g.ctx.events.peek().some((e) => e.type === 'interact' && e.kind === 'riftFailed')).toBe(true);
    // Collapse: a moment later the game throws the player out.
    tick(g, 60 * 4);
    expect(g.ctx.events.peek().filter((e) => e.type === 'interact' && e.kind === 'riftExit')).toHaveLength(1);
    expect(g.ctx.account!.endgame.riftBest).toBe(0);
    expect(g.ctx.endgame!.glyphs).toHaveLength(0);
    expect(objects(g.world, 'cache')).toHaveLength(0);
    expect(riftGlyphAttempt(g.ctx, g.rift, 'brawn')).toBe(false);
  });

  it('also runs out while the guardian is alive', () => {
    const g = inRift(4);
    callGuardian(g);
    g.rift.elapsed = RIFT.time - 0.01;
    tick(g, 2);
    expect(g.rift.phase).toBe('failed');
    expect(g.ctx.account!.endgame.riftBest).toBe(0);
  });

  it('a failed rift cannot be cleared afterwards', () => {
    const g = inRift(4);
    const boss = callGuardian(g);
    failRift(g.world, g.ctx, g.rift);
    kill(g.world, g.ctx, boss, 0);
    tick(g, 3);
    expect(g.rift.phase).toBe('failed');
    expect(g.ctx.account!.endgame.riftBest).toBe(0);
  });

  it('time only counts while inside (no ticks without a rift)', () => {
    const g = inRift(4);
    tick(g, 120);
    expect(g.rift.elapsed).toBeCloseTo(2, 1);
  });
});

describe('Deep Rifts: a clear', () => {
  it('records the best level and time, opens one level (two when fast), and leaves a cache and a way out', () => {
    const slow = inRift(7);
    slow.rift.elapsed = RIFT.time * 0.6;
    callGuardian(slow);
    kill(slow.world, slow.ctx, slow.rift.guardian!, 0);
    tick(slow);
    const a = slow.ctx.account!.endgame;
    expect(a.riftBest).toBe(7);
    expect(a.riftOpen).toBe(8);
    expect(a.riftTime).toBeGreaterThan(300);
    expect(slow.rift.result!.fast).toBe(false);
    expect(riftOpenLevel(slow.ctx)).toBe(8);
    expect(objects(slow.world, 'cache')).toHaveLength(1);
    expect(objects(slow.world, 'portal').length).toBeGreaterThanOrEqual(2);

    const fast = inRift(7);
    fast.rift.elapsed = RIFT.time * 0.4;
    clearRift(fast);
    expect(fast.ctx.account!.endgame.riftBest).toBe(7);
    expect(fast.ctx.account!.endgame.riftOpen).toBe(9);
    expect(fast.rift.result!.fast).toBe(true);
    expect(riftOpenLevel(fast.ctx)).toBe(9);
    expect(fast.rift.result!.newBest).toBe(true);
  });

  it('exactly half the time left is not a fast clear', () => {
    const g = inRift(2);
    g.rift.elapsed = RIFT.time * RIFT.fastShare;
    clearRift(g);
    expect(g.rift.result!.fast).toBe(false);
  });

  it('keeps the best level when a lower one is cleared, and the faster time for the same level', () => {
    const g = inRift(3);
    const e = g.ctx.account!.endgame;
    e.riftBest = 10;
    e.riftTime = 400;
    g.rift.elapsed = 300;
    clearRift(g);
    expect(e.riftBest).toBe(10);
    expect(e.riftTime).toBe(400);
    expect(g.rift.result!.newBest).toBe(false);

    const h = inRift(10);
    h.ctx.account!.endgame.riftBest = 10;
    h.ctx.account!.endgame.riftTime = 400;
    h.rift.elapsed = 350;
    clearRift(h);
    expect(h.ctx.account!.endgame.riftTime).toBe(350);
    expect(h.rift.result!.newBest).toBe(true);
  });

  it('rift 20 unlocks World Tier 3, rift 40 World Tier 4; lower rifts unlock nothing', () => {
    const a = inRift(19);
    clearRift(a);
    expect(a.ctx.account!.endgame.tierUnlocked).toBe(2);
    const b = inRift(20);
    clearRift(b);
    expect(b.ctx.account!.endgame.tierUnlocked).toBe(3);
    expect(b.rift.result!.tiers).toEqual([3]);
    const c = inRift(40);
    clearRift(c);
    expect(c.ctx.account!.endgame.tierUnlocked).toBe(4);
    expect(c.rift.result!.tiers).toEqual([3, 4]);
    // A tier already unlocked is not announced again.
    const d = inRift(41);
    d.ctx.account!.endgame.tierUnlocked = 4;
    clearRift(d);
    expect(d.rift.result!.tiers).toEqual([]);
    expect(d.ctx.account!.endgame.tierUnlocked).toBe(4);
  });

  it('gives three glyph upgrade attempts on the glyph the player picks', () => {
    const g = inRift(5);
    g.ctx.endgame!.glyphs.push({ id: 'brawn', level: 1 }, { id: 'precision', level: 1 });
    clearRift(g);
    expect(g.rift.attempts).toBe(3);
    expect(g.rift.result!.grantedGlyph).toBeNull();
    expect(riftGlyphAttempt(g.ctx, g.rift, 'nonexistent')).toBe(false);
    expect(g.rift.attempts).toBe(3);
    // Low glyph levels upgrade easily: a few tries move the picked one and leave the other alone.
    let ok = 0;
    for (let i = 0; i < 3; i++) {
      const r = riftGlyphAttempt(g.ctx, g.rift, 'brawn');
      expect(r).not.toBe(false);
      if (r && r.ok) ok++;
    }
    expect(g.rift.attempts).toBe(0);
    expect(g.ctx.endgame!.glyphs.find((x) => x.id === 'brawn')!.level).toBe(1 + ok);
    expect(g.ctx.endgame!.glyphs.find((x) => x.id === 'precision')!.level).toBe(1);
    expect(riftGlyphAttempt(g.ctx, g.rift, 'brawn')).toBe(false);
  });

  it('with no glyphs, a random one is granted first', () => {
    const g = inRift(5);
    expect(g.ctx.endgame!.glyphs).toHaveLength(0);
    clearRift(g);
    expect(g.ctx.endgame!.glyphs).toHaveLength(1);
    expect(g.rift.result!.grantedGlyph).toBe(g.ctx.endgame!.glyphs[0]!.id);
    expect(g.rift.attempts).toBe(3);
  });

  it('the cache holds legendaries at the rift item power, Rift Shards, and sometimes a recipe', () => {
    const g = inRift(70);
    clearRift(g);
    const cache = objects(g.world, 'cache')[0]!;
    expect(instanceInteract(g.world, g.ctx, cache, g.world.req(cache, Interactable))).toBe(true);
    const req = g.ctx.rewards.find((r) => r.rarity === 'legendary')!;
    expect(req).toBeDefined();
    expect(req.count).toBe(RIFT_REWARDS.legendaries.base + Math.floor(70 / RIFT_REWARDS.legendaries.perLevels));
    expect(req.itemPower).toBe(540);
    expect(g.ctx.endgame!.materials['rift_shard']).toBe(Math.round(RIFT_REWARDS.shards.base + RIFT_REWARDS.shards.perLevel * 70));
    // Opened once.
    expect(g.world.req(cache, Interactable).used).toBe(true);
    expect(instanceInteract(g.world, g.ctx, cache, g.world.req(cache, Interactable))).toBe(false);
    expect(g.ctx.rewards.filter((r) => r.rarity === 'legendary')).toHaveLength(1);
  });

  it('a recipe drops now and then, from the crafting recipes, never one the character already knows while others remain', () => {
    expect(RIFT_RECIPE_POOL.length).toBe(12);
    const g = inRift(10);
    clearRift(g);
    let learned = 0;
    for (let i = 0; i < 60; i++) {
      const got = openRiftCache(g.world, g.ctx, g.rift, { x: 0, z: 0 }, new Rng(`r${i}`));
      if (got.recipe) {
        learned++;
        expect(RIFT_RECIPE_POOL).toContain(got.recipe);
      }
    }
    expect(learned).toBeGreaterThan(5);
    expect(learned).toBeLessThan(40);
    expect(new Set(g.ctx.endgame!.recipes).size).toBe(g.ctx.endgame!.recipes.length);
    expect(g.ctx.endgame!.recipes.length).toBe(learned);
  });

  it('leaving a cleared rift with attempts left asks once, then leaves', () => {
    const g = inRift(5);
    clearRift(g);
    const exit = objects(g.world, 'portal').find((e) => g.world.req(e, Interactable).poi === 'exit')!;
    const it = g.world.req(exit, Interactable);
    g.ctx.events.drain();
    expect(instanceInteract(g.world, g.ctx, exit, it)).toBe(true);
    expect(g.ctx.events.peek().some((e) => e.type === 'interact' && e.kind === 'riftCleared')).toBe(true);
    g.ctx.events.drain();
    expect(instanceInteract(g.world, g.ctx, exit, it)).toBe(true);
    expect(g.ctx.events.peek().some((e) => e.type === 'interact' && e.kind === 'portal')).toBe(true);
  });

  it('completeRift can be driven directly (nothing granted twice)', () => {
    const g = inRift(20);
    const res = completeRift(g.world, g.ctx, riftHost(g.rt), g.rift, { x: g.rt.start.x, z: g.rt.start.z });
    expect(res.level).toBe(20);
    expect(g.ctx.account!.endgame.tierUnlocked).toBe(3);
  });
});

describe('Deep Rifts: definition', () => {
  it('is a registered instance with real packs and enemies, and every string exists', () => {
    const def = INSTANCES.find((d) => d.id === RIFT_ID)!;
    expect(def.kind).toBe('rift');
    expect(def.boss).toBeNull();
    for (const p of def.packs) for (const m of packTemplate(p).members) expect(ENEMY_DEFS.has(m.enemy), `${p}: ${m.enemy}`).toBe(true);
    const lang = (k: string) => k.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], en);
    const keys = [
      'rifts.title', 'rifts.locked', 'rifts.badLevel', 'rifts.intro', 'rifts.best', 'rifts.noBest', 'rifts.open', 'rifts.effects', 'rifts.enter', 'rifts.cleared',
      'rifts.resultTime', 'rifts.fast', 'rifts.tierUnlocked', 'rifts.glyphGranted', 'rifts.attempts', 'rifts.attemptsDone', 'rifts.glyphRow', 'rifts.upgraded',
      'rifts.failed', 'rifts.cacheHint', 'rifts.cache', 'rifts.recipe', 'rifts.guardianAppears', 'rifts.collapse', 'rifts.collapsed',
      'rifts.objective.running', 'rifts.objective.guardian', 'rifts.objective.cleared', 'rifts.objective.failed',
      'rifts.hud.level', 'rifts.hud.running', 'rifts.hud.guardian', 'rifts.hud.cleared', 'rifts.hud.failed',
      'instances.names.deep_rift', 'interact.actions.riftObelisk',
    ];
    for (const k of keys) expect(typeof lang(k), k).toBe('string');
  });

  it('a rift is built from a level and runs from the first tick', () => {
    const g = inRift(12);
    expect(g.rt.level).toBe(50);
    expect(g.rift.level).toBe(12);
    expect(g.rift.mul).toBeCloseTo(1.06 ** 12, 10);
    expect(createRift(500).level).toBe(RIFT.maxLevel);
    expect(createRift(0).level).toBe(1);
    // The boss room is an ordinary room in a rift (there is no boss gate).
    expect(g.rt.gate).toHaveLength(0);
    tickRift(g.world, 1 / 60, g.ctx, riftHost(g.rt), g.rift, g.player);
    expect(g.rift.elapsed).toBeGreaterThan(0);
  });
});
