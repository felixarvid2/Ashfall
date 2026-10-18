import { describe, expect, it } from 'vitest';
import { Boss, CombatStats, Dead, Elite, EnemyAI, Interactable, Transform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { Rng } from '../src/core/rng';
import { SaveDataSchema } from '../src/core/save';
import { t } from '../src/data/i18n';
import { RECIPE_IDS } from '../src/data/endgame/crafting';
import { HARVEST, HARVEST_CACHES } from '../src/data/endgame/harvest';
import { PACK_TEMPLATES } from '../src/data/packs';
import { caveGrid, openAt } from '../src/data/zones/caves';
import { ZONES } from '../src/data/zones';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import { REFINERY_DISTRICT } from '../src/data/zones/refineryDistrict';
import { kill } from '../src/systems/combat';
import { createQuestRuntime } from '../src/systems/quests';
import { interact } from '../src/world/interactables';
import {
  activeHarvest,
  clock,
  harvestAt,
  harvestEventCooldownMul,
  harvestHere,
  harvestPackMods,
  harvestSystem,
  harvestView,
  mixPool,
  mixShareFor,
  openHarvestCache,
  scaledCount,
  shardValue,
} from '../src/world/harvest';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import type { ZoneDef } from '../src/data/zones/zoneTypes';
import { createZoneRuntime, zoneSystem } from '../src/world/zone';
import { EVENT_TUNING, worldEventSystem } from '../src/world/worldEvents';
import { makeCtx, run } from './helpers';

const ROT = HARVEST.rotationSeconds;
const ID = {
  flats: 'zone.cinder_flats',
  refinery: 'zone.refinery_district',
  vaults: 'zone.hydroponic_vaults',
  mines: 'zone.deep_mines',
  core: 'zone.the_core',
};

/** A context in a zone at an account tier and play time, with a character's endgame state. */
function setup(def: ZoneDef = CINDER_FLATS, tier = 2, playtime = 0) {
  const world = new World();
  const zone = createZoneRuntime(def);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: def.halfSize });
  ctx.account!.endgame.tierUnlocked = tier;
  ctx.account!.endgame.playtime = playtime;
  ctx.endgame = SaveDataSchema.shape.endgame.parse(undefined);
  const player = spawnPlayer(world, 'bastion', 0, 0);
  return { world, ctx, zone, player };
}

const at = (def: ZoneDef, id: string) => def.packs.find((p) => p.id === id)!;

describe('rotation', () => {
  it('one region per 20 minutes of play time, through the five regions in order, then around again', () => {
    expect(ROT).toBe(1200);
    expect(HARVEST.rotation).toEqual(ZONES.map((z) => z.id));
    expect(HARVEST.rotation).toEqual([ID.flats, ID.refinery, ID.vaults, ID.mines, ID.core]);
    const seen = [0, 1, 2, 3, 4, 5, 6].map((k) => harvestAt(2, k * ROT + 1)!.zoneId);
    expect(seen).toEqual([ID.flats, ID.refinery, ID.vaults, ID.mines, ID.core, ID.flats, ID.refinery]);
  });

  it('counts down the time left and switches exactly at the boundary', () => {
    expect(harvestAt(2, 0)).toMatchObject({ zoneId: ID.flats, rotation: 0, remaining: ROT });
    expect(harvestAt(2, 760)!.remaining).toBe(ROT - 760);
    expect(harvestAt(2, ROT - 0.5)!.zoneId).toBe(ID.flats);
    expect(harvestAt(2, ROT)).toMatchObject({ zoneId: ID.refinery, rotation: 1, remaining: ROT });
    expect(harvestAt(2, 5 * ROT)).toMatchObject({ zoneId: ID.flats, rotation: 5, index: 0 });
  });

  it('shows the time as minutes:seconds', () => {
    expect(clock(760)).toBe('12:40');
    expect(clock(59.2)).toBe('1:00');
    expect(clock(0)).toBe('0:00');
  });
});

describe('gating by World Tier', () => {
  it('is off before World Tier 2 is unlocked, on from tier 2 on', () => {
    expect(harvestAt(1, 5000)).toBeNull();
    expect(harvestAt(2, 5000)).not.toBeNull();
    expect(harvestAt(4, 5000)).not.toBeNull();
  });

  it('reads the account; headless contexts without one have no Harvest', () => {
    expect(activeHarvest(setup(CINDER_FLATS, 1).ctx)).toBeNull();
    expect(activeHarvest(setup(CINDER_FLATS, 2).ctx)?.zoneId).toBe(ID.flats);
    const bare = makeCtx();
    expect(activeHarvest(bare)).toBeNull();
    expect(harvestEventCooldownMul(bare)).toBe(1);
  });

  it('follows the account clock', () => {
    const { ctx } = setup(CINDER_FLATS, 2, 0);
    expect(activeHarvest(ctx)?.zoneId).toBe(ID.flats);
    ctx.account!.endgame.playtime = ROT * 2 + 5;
    expect(activeHarvest(ctx)?.zoneId).toBe(ID.vaults);
  });

  it('nothing happens at tier 1: no pack changes, no shards, no caches', () => {
    const s = setup(CINDER_FLATS, 1);
    expect(harvestPackMods(s.ctx, ID.flats)).toBeNull();
    const e = spawnEnemy(s.world, 'infected_colonist', 5, 5);
    kill(s.world, s.ctx, e, 0);
    expect(s.ctx.endgame!.ashShards).toBe(0);
    run(s.world, s.ctx, [harvestSystem]);
    expect(s.world.query(Interactable)).toHaveLength(0);
    expect(harvestView(s.ctx)).toBeNull();
  });
});

describe('modifiers apply only in the active zone', () => {
  it('pack mods exist for the active zone only, with a 10–30 % mix', () => {
    const { ctx } = setup(CINDER_FLATS, 2, 0);
    const mods = harvestPackMods(ctx, ID.flats)!;
    expect(mods).toMatchObject({ packMul: 1.5, eliteMul: 3 });
    expect(mods.mixShare).toBeGreaterThanOrEqual(0.1);
    expect(mods.mixShare).toBeLessThanOrEqual(0.3);
    for (const z of [ID.refinery, ID.vaults, ID.mines, ID.core]) expect(harvestPackMods(ctx, z)).toBeNull();
    ctx.account!.endgame.playtime = ROT;
    expect(harvestPackMods(ctx, ID.flats)).toBeNull();
    expect(harvestPackMods(ctx, ID.refinery)).not.toBeNull();
  });

  it('the mix share stays between 10 and 30 % for every rotation', () => {
    const shares = Array.from({ length: 200 }, (_, r) => mixShareFor(r));
    expect(Math.min(...shares)).toBeGreaterThanOrEqual(0.1);
    expect(Math.max(...shares)).toBeLessThanOrEqual(0.3);
    expect(new Set(shares.map((s) => s.toFixed(2))).size).toBeGreaterThan(5);
  });

  it('the mix pool holds only other regions\' templates', () => {
    const own = new Set(CINDER_FLATS.packs.map((p) => p.template));
    const pool = mixPool(ID.flats);
    expect(pool.length).toBeGreaterThan(10);
    const known = new Set(PACK_TEMPLATES.map((p) => p.id));
    for (const id of pool) expect(known.has(id)).toBe(true);
    const otherOnly = new Set(ZONES.filter((z) => z.id !== ID.flats).flatMap((z) => z.packs.map((p) => p.template)));
    for (const id of pool) expect(otherOnly.has(id)).toBe(true);
    expect(own.size).toBeGreaterThan(0);
  });

  it('scaledCount multiplies by 1.5 on average and never loses a member', () => {
    const rng = new Rng('count');
    const sum = (n: number) => Array.from({ length: 2000 }, () => scaledCount(n, 1.5, rng)).reduce((a, b) => a + b, 0) / 2000;
    expect(sum(2)).toBe(3);
    expect(sum(3)).toBeGreaterThan(4.3);
    expect(sum(3)).toBeLessThan(4.7);
    expect(scaledCount(1, 1.5, new Rng('x'))).toBeGreaterThanOrEqual(1);
  });

  /** Wake a sample of the zone's packs one at a time and total what comes out. */
  function wake(def: ZoneDef, tier: number, playtime: number) {
    const defIds = new Set<string>();
    let members = 0;
    let elites = 0;
    const sample = def.packs.filter((_, i) => i % 6 === 0).slice(0, 40);
    for (const p of sample) {
      const s = setup(def, tier, playtime);
      const tr = s.world.req(s.player, Transform);
      tr.x = tr.prevX = p.x;
      tr.z = tr.prevZ = p.z;
      run(s.world, s.ctx, [zoneSystem], 20);
      for (const e of s.world.query(EnemyAI)) {
        members++;
        defIds.add(s.world.req(e, EnemyAI).defId);
        if (s.world.has(e, Elite)) elites++;
      }
    }
    return { members, elites, defIds };
  }

  it('Cinder Flats under the Harvest: more enemies, more elites, enemies from other regions', () => {
    const base = wake(CINDER_FLATS, 1, 0);
    const harvest = wake(CINDER_FLATS, 2, 0);
    expect(harvest.members).toBeGreaterThan(base.members * 1.3);
    expect(harvest.elites).toBeGreaterThan(base.elites);
    const ownEnemies = new Set(base.defIds);
    expect([...harvest.defIds].some((id) => !ownEnemies.has(id))).toBe(true);
  });

  it('another region being under the Harvest changes nothing here', () => {
    const base = wake(CINDER_FLATS, 1, 0);
    const elsewhere = wake(CINDER_FLATS, 2, ROT);
    expect(elsewhere.members).toBe(base.members);
    expect(elsewhere.elites).toBe(base.elites);
    expect([...elsewhere.defIds].sort()).toEqual([...base.defIds].sort());
    // …and the Refinery District under it is changed.
    const refineryBase = wake(REFINERY_DISTRICT, 1, 0);
    const refinery = wake(REFINERY_DISTRICT, 2, ROT);
    expect(refinery.members).toBeGreaterThan(refineryBase.members * 1.3);
  });

  it('mixed packs bring no set-piece enemies', () => {
    const harvest = wake(CINDER_FLATS, 2, 0);
    for (const id of harvest.defIds) expect(HARVEST.mixExcluded).not.toContain(id);
  });

  it('world events come back twice as fast in the active zone only', () => {
    const cooldown = (tier: number, playtime: number) => {
      const s = setup(CINDER_FLATS, tier, playtime);
      const ev = s.zone.events.get('event.sporeNest')!;
      const tr = s.world.req(s.player, Transform);
      tr.x = tr.prevX = ev.x + 5;
      tr.z = tr.prevZ = ev.z;
      run(s.world, s.ctx, [worldEventSystem]);
      expect(ev.state).toBe('active');
      run(s.world, s.ctx, [worldEventSystem], 60 * (EVENT_TUNING.sporeNest.hatch + 1));
      expect(ev.result).toBe('failed');
      return ev.readyAt - s.ctx.time;
    };
    const normal = cooldown(1, 0);
    expect(normal).toBeGreaterThan(EVENT_TUNING.cooldown - 2);
    expect(cooldown(2, 0)).toBeCloseTo(normal * HARVEST.eventCooldownMul, 0);
    expect(cooldown(2, ROT)).toBeCloseTo(normal, 0);
    expect(harvestEventCooldownMul(setup(CINDER_FLATS, 2, 0).ctx)).toBe(0.5);
    expect(harvestEventCooldownMul(setup(CINDER_FLATS, 2, ROT).ctx)).toBe(1);
  });
});

describe('Ash Shards', () => {
  const killOne = (s: ReturnType<typeof setup>, make: (e: number) => void = () => {}) => {
    const e = spawnEnemy(s.world, 'infected_colonist', 6, 6);
    make(e);
    kill(s.world, s.ctx, e, 0);
    return e;
  };

  it('pays 1 for a normal enemy, 5 for an elite and 25 for a boss', () => {
    expect(HARVEST.shards).toEqual({ normal: 1, elite: 5, boss: 25 });
    const s = setup();
    killOne(s);
    expect(s.ctx.endgame!.ashShards).toBe(1);
    killOne(s, (e) => s.world.req(e, CombatStats).tags.push('elite', 'rare'));
    expect(s.ctx.endgame!.ashShards).toBe(6);
    killOne(s, (e) => s.world.add(e, Boss, { arena: { x: 0, z: 0, radius: 10 } } as never));
    expect(s.ctx.endgame!.ashShards).toBe(31);
  });

  it('shardValue reads the elite and boss marks', () => {
    const s = setup();
    const plain = spawnEnemy(s.world, 'infected_colonist', 1, 1);
    expect(shardValue(s.world, plain)).toBe(1);
    s.world.req(plain, CombatStats).tags.push('elite');
    expect(shardValue(s.world, plain)).toBe(5);
  });

  it('drops only in the active zone, on the open map, with an account at tier 2', () => {
    const wrongZone = setup(REFINERY_DISTRICT, 2, 0);
    killOne(wrongZone);
    expect(wrongZone.ctx.endgame!.ashShards).toBe(0);

    const inDungeon = setup();
    inDungeon.ctx.instance = {} as never;
    killOne(inDungeon);
    expect(inDungeon.ctx.endgame!.ashShards).toBe(0);

    const later = setup(CINDER_FLATS, 2, ROT);
    killOne(later);
    expect(later.ctx.endgame!.ashShards).toBe(0);
    expect(harvestHere(later.ctx)).toBeNull();
  });

  it('mirror copies and the player\'s own side drop nothing', () => {
    const s = setup();
    killOne(s, (e) => s.world.add(e, Elite, { kind: 'rare', affixes: [], timers: {}, shieldUsed: false, mirrored: false, copy: true }));
    expect(s.ctx.endgame!.ashShards).toBe(0);
  });
});

describe('dying', () => {
  it('drops half of the carried shards (they are lost)', () => {
    const s = setup();
    s.ctx.endgame!.ashShards = 101;
    kill(s.world, s.ctx, s.player, 0);
    expect(s.ctx.endgame!.ashShards).toBe(51);
    expect(s.ctx.events.drain().some((e) => e.type === 'notice' && e.key === 'harvest.shardsLost')).toBe(true);
  });

  it('applies anywhere, with nothing to lose it is silent', () => {
    const elsewhere = setup(REFINERY_DISTRICT, 2, 0);
    elsewhere.ctx.endgame!.ashShards = 300;
    kill(elsewhere.world, elsewhere.ctx, elsewhere.player, 0);
    expect(elsewhere.ctx.endgame!.ashShards).toBe(150);

    const empty = setup();
    kill(empty.world, empty.ctx, empty.player, 0);
    expect(empty.ctx.endgame!.ashShards).toBe(0);
    expect(empty.ctx.events.drain().some((e) => e.type === 'notice')).toBe(false);
    expect(empty.world.has(empty.player, Dead)).toBe(true);
  });

  it('a second kill call on a dead player takes nothing more', () => {
    const s = setup();
    s.ctx.endgame!.ashShards = 100;
    kill(s.world, s.ctx, s.player, 0);
    kill(s.world, s.ctx, s.player, 0);
    expect(s.ctx.endgame!.ashShards).toBe(50);
  });
});

describe('Harvest Caches', () => {
  const caches = (w: World) => w.query(Interactable).filter((e) => w.req(e, Interactable).kind === 'harvestCache');

  it('three chests stand in the active region, none elsewhere or before tier 2', () => {
    const s = setup();
    run(s.world, s.ctx, [harvestSystem]);
    const list = caches(s.world);
    expect(list).toHaveLength(3);
    expect(list.map((e) => s.world.req(e, Interactable).poi).sort()).toEqual(HARVEST_CACHES[ID.flats]!.map((c) => c.id).sort());
    // Not a duplicate pass.
    run(s.world, s.ctx, [harvestSystem], 120);
    expect(caches(s.world)).toHaveLength(3);

    const other = setup(REFINERY_DISTRICT, 2, 0);
    run(other.world, other.ctx, [harvestSystem]);
    expect(caches(other.world)).toHaveLength(0);
    const early = setup(CINDER_FLATS, 1, 0);
    run(early.world, early.ctx, [harvestSystem]);
    expect(caches(early.world)).toHaveLength(0);
  });

  it('they leave when the rotation moves on', () => {
    const s = setup();
    run(s.world, s.ctx, [harvestSystem]);
    expect(caches(s.world)).toHaveLength(3);
    s.ctx.account!.endgame.playtime = ROT + 1;
    run(s.world, s.ctx, [harvestSystem], 40);
    expect(caches(s.world)).toHaveLength(0);
  });

  it('cost 250 shards: 249 is refused, 250 opens it', () => {
    expect(HARVEST.cacheCost).toBe(250);
    const s = setup();
    run(s.world, s.ctx, [harvestSystem]);
    const chest = caches(s.world)[0]!;
    const player = s.player;

    s.ctx.endgame!.ashShards = 249;
    expect(interact(s.world, s.ctx, player, chest)).toBe(false);
    expect(s.ctx.endgame!.ashShards).toBe(249);
    expect(s.ctx.rewards).toHaveLength(0);
    expect(s.ctx.events.drain().some((e) => e.type === 'notice' && e.key === 'harvest.needShards')).toBe(true);
    expect(s.world.isAlive(chest)).toBe(true);

    s.ctx.endgame!.ashShards = 250;
    expect(interact(s.world, s.ctx, player, chest)).toBe(true);
    expect(s.ctx.endgame!.ashShards).toBe(0);
    run(s.world, s.ctx, []);
    expect(s.world.isAlive(chest)).toBe(false);
  });

  it('gives a guaranteed legendary, Lumen Dust and, sometimes, a new recipe', () => {
    const s = setup();
    run(s.world, s.ctx, [harvestSystem]);
    const chest = caches(s.world)[0]!;
    s.ctx.endgame!.ashShards = 400;
    interact(s.world, s.ctx, s.player, chest);
    expect(s.ctx.endgame!.ashShards).toBe(150);
    expect(s.ctx.rewards).toHaveLength(1);
    expect(s.ctx.rewards[0]).toMatchObject({ table: 'dt.boss', rarity: 'legendary', xp: false });
    const dust = s.ctx.endgame!.materials[HARVEST.cacheMaterial] ?? 0;
    expect(dust).toBeGreaterThanOrEqual(HARVEST.cacheDust[0]);
    expect(dust).toBeLessThanOrEqual(HARVEST.cacheDust[1]);
    const opened = s.ctx.events.drain().find((e) => e.type === 'interact' && e.kind === 'harvestCache');
    expect(opened).toBeDefined();
    expect(opened!.type === 'interact' && opened!.detail!.startsWith(`${dust},`)).toBe(true);
  });

  /** Opens `n` caches on bare chests and reports how many taught a recipe. */
  function openMany(n: number, known: string[] = []) {
    const s = setup();
    s.ctx.endgame!.recipes.push(...known);
    s.ctx.endgame!.ashShards = 250 * n;
    let recipes = 0;
    for (let i = 0; i < n; i++) {
      const chest = s.world.create();
      s.world.add(chest, Transform, { x: 1, z: 1 } as never);
      const it = { poi: 'hc.cf.1', kind: 'harvestCache', radius: 3, used: false, readyAt: 0 } as Interactable;
      s.world.add(chest, Interactable, it);
      const before = s.ctx.endgame!.recipes.length;
      expect(openHarvestCache(s.world, s.ctx, chest, it)).toBe(true);
      if (s.ctx.endgame!.recipes.length > before) recipes++;
      s.ctx.rewards.length = 0;
    }
    return { s, recipes };
  }

  it('teaches a recipe about one time in three, never one already known', () => {
    const { s, recipes } = openMany(60);
    expect(recipes).toBeGreaterThan(8);
    expect(recipes).toBeLessThan(35);
    expect(new Set(s.ctx.endgame!.recipes).size).toBe(s.ctx.endgame!.recipes.length);
    for (const r of s.ctx.endgame!.recipes) expect(RECIPE_IDS).toContain(r);
    expect(openMany(40, [...RECIPE_IDS]).recipes).toBe(0);
  });

  it('an opened cache stays gone for the rest of the rotation and returns with the next one', () => {
    const s = setup();
    run(s.world, s.ctx, [harvestSystem]);
    s.ctx.endgame!.ashShards = 250;
    interact(s.world, s.ctx, s.player, caches(s.world)[0]!);
    run(s.world, s.ctx, [harvestSystem], 120);
    expect(caches(s.world)).toHaveLength(2);
    // Five rotations later the Harvest is back in the Flats.
    s.ctx.account!.endgame.playtime = ROT * 5 + 10;
    run(s.world, s.ctx, [harvestSystem], 120);
    expect(caches(s.world)).toHaveLength(3);
  });
});

describe('data', () => {
  it('has three cache spots in each of the five regions, on open ground away from hubs and gates', () => {
    expect(Object.keys(HARVEST_CACHES).sort()).toEqual([...HARVEST.rotation].sort());
    const ids = new Set<string>();
    for (const def of ZONES) {
      const spots = HARVEST_CACHES[def.id]!;
      expect(spots).toHaveLength(3);
      const grid = caveGrid(def);
      for (const c of spots) {
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(Math.abs(c.x)).toBeLessThan(def.halfSize - 10);
        expect(Math.abs(c.z)).toBeLessThan(def.halfSize - 10);
        for (const h of def.hubs) expect(Math.hypot(h.x - c.x, h.z - c.z)).toBeGreaterThan(h.radius + 50);
        for (const g of def.gates) expect(Math.hypot(g.x - c.x, g.z - c.z)).toBeGreaterThan(g.radius + 40);
        for (const p of def.props) if (p.collider) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(p.collider + 1.5);
        for (const p of def.pois) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(3);
        if (grid) expect(openAt(grid, c.x, c.z, 1.5)).toBe(true);
      }
      // The three are spread out.
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThan(200);
    }
  });

  it('the HUD line reads like the design', () => {
    expect(t('harvest.line', { region: 'Refinery District', time: clock(760) })).toBe('Ash Harvest: Refinery District — 12:40 left');
    expect(t('interact.actions.harvestCache')).toBe('Open Harvest Cache');
  });

  it('the view for the HUD and the map names the region and lists the closed caches', () => {
    const s = setup(CINDER_FLATS, 2, ROT * 2 + 30);
    const view = harvestView(s.ctx)!;
    expect(view.active.zoneId).toBe(ID.vaults);
    expect(view.here).toBe(false);
    expect(view.zoneKey).toBeTruthy();
    expect(view.caches).toHaveLength(3);
    expect(t(`zones.${view.zoneKey}.name`)).not.toContain('zones.');
  });
});
