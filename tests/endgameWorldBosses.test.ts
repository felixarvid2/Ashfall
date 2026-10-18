import { afterEach, describe, expect, it } from 'vitest';
import { Boss, Dead, Health, Transform } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { World } from '../src/core/ecs';
import { SaveDataSchema } from '../src/core/save';
import { BOSS_SCRIPTS } from '../src/data/bosses';
import { RECIPE_IDS } from '../src/data/endgame/crafting';
import { TIER_TABLE } from '../src/data/endgame/tiers';
import { WORLD_BOSSES, WORLD_BOSS, WORLD_BOSS_ENEMIES, worldBossPortrait } from '../src/data/endgame/worldBosses';
import { t } from '../src/data/i18n';
import { ENEMY_DEFS } from '../src/data/db';
import { PROGRESSION } from '../src/data/loot/db';
import { ZONES, zoneDef } from '../src/data/zones';
import { caveGrid, openAt } from '../src/data/zones/caves';
import { kill } from '../src/systems/combat';
import { setEnemyScaling } from '../src/systems/endgame/tiers';
import { spawnPlayer } from '../src/world/spawn';
import {
  activeWorldBoss,
  payWorldBoss,
  worldBossEvent,
  worldBossMarker,
  worldBossRuntime,
  worldBossStatus,
  worldBossSystem,
  worldBossUniques,
} from '../src/world/worldBoss';
import { createZoneRuntime } from '../src/world/zone';
import { worldBossLine } from '../src/ui/worldBossHud';
import { makeCtx, run } from './helpers';

const { interval, warning, lifetime } = WORLD_BOSS;

afterEach(() => setEnemyScaling({ enemyLife: 1, enemyDamage: 1 }));

/** A world with a level-1 player standing in the zone of world boss event `index`; the account is at `playtime`. */
function setup(index: number, playtime: number, tier = 2) {
  const event = worldBossEvent(index);
  const world = new World();
  const zone = createZoneRuntime(zoneDef(event.spot.zone));
  const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: zone.def.halfSize });
  ctx.endgame = SaveDataSchema.shape.endgame.parse(undefined);
  ctx.account!.endgame.tierUnlocked = tier;
  ctx.account!.endgame.playtime = playtime;
  const player = spawnPlayer(world, 'bastion', event.spot.x - 60, event.spot.z);
  return { world, ctx, event, player };
}

const tick = (world: World, ctx: ReturnType<typeof makeCtx>, n = 1) => run(world, ctx, [worldBossSystem], n);

describe('schedule', () => {
  it('is the same every time for the same play time', () => {
    for (let i = 1; i <= 30; i++) {
      const a = worldBossEvent(i);
      const b = worldBossEvent(i);
      expect(b.def.id).toBe(a.def.id);
      expect(b.spot).toEqual(a.spot);
    }
    expect(worldBossStatus(3000)).toEqual(worldBossStatus(3000));
  });

  it('brings one boss per interval, never the same twice running, and all three over time', () => {
    const events = Array.from({ length: 24 }, (_, i) => worldBossEvent(i + 1));
    events.forEach((e, i) => {
      expect(e.index).toBe(i + 1);
      expect(e.appearsAt).toBe((i + 1) * interval);
      expect(e.endsAt).toBe(e.appearsAt + lifetime);
      expect(e.def.spots).toContainEqual(e.spot);
      if (i > 0) expect(e.def.id).not.toBe(events[i - 1]!.def.id);
    });
    expect(new Set(events.map((e) => e.def.id))).toEqual(new Set(WORLD_BOSSES.map((b) => b.id)));
    // Every spot gets used by the seeded sequence.
    for (const def of WORLD_BOSSES) expect(new Set(events.filter((e) => e.def === def).map((e) => e.spot)).size).toBeGreaterThan(1);
  });

  it('keeps the data values: 45 min, 5 min warning, 15 min lifetime', () => {
    expect([interval, warning, lifetime]).toEqual([2700, 300, 900]);
  });

  it('announces five minutes ahead, lives for fifteen, and is quiet in between', () => {
    expect(worldBossStatus(0)).toBeNull();
    expect(worldBossStatus(interval - warning - 1)).toBeNull();
    const w = worldBossStatus(interval - warning)!;
    expect(w.phase).toBe('warning');
    expect(w.secondsLeft).toBe(warning);
    expect(w.event.index).toBe(1);
    expect(worldBossStatus(interval - 1)!.phase).toBe('warning');
    const a = worldBossStatus(interval)!;
    expect(a.phase).toBe('alive');
    expect(a.secondsLeft).toBe(lifetime);
    expect(worldBossStatus(interval + lifetime - 1)!.phase).toBe('alive');
    expect(worldBossStatus(interval + lifetime)).toBeNull();
    // The next one is announced on time again.
    const next = worldBossStatus(2 * interval - warning)!;
    expect(next.phase).toBe('warning');
    expect(next.event.index).toBe(2);
  });
});

describe('data', () => {
  it('three bosses with three phases each, spread over all five regions', () => {
    expect(WORLD_BOSSES).toHaveLength(3);
    for (const def of WORLD_BOSSES) {
      expect(ENEMY_DEFS.has(def.enemy)).toBe(true);
      expect(BOSS_SCRIPTS[def.script]).toHaveLength(3);
      expect(def.spots.length).toBeGreaterThanOrEqual(2);
      expect(def.spots.length).toBeLessThanOrEqual(3);
      expect(t(`worldBoss.${def.id}.name`)).not.toContain('worldBoss.');
      expect(t(`worldBoss.${def.id}.intro`)).not.toContain('worldBoss.');
      for (const phase of BOSS_SCRIPTS[def.script]!.slice(1)) expect(t(phase.banner!)).not.toBe(phase.banner);
    }
    expect(WORLD_BOSS_ENEMIES).toHaveLength(3);
    const zones = new Set(WORLD_BOSSES.flatMap((b) => b.spots.map((s) => s.zone)));
    expect(zones).toEqual(new Set(ZONES.map((z) => z.id)));
  });

  it('the bodies reuse the existing large models', () => {
    expect(ENEMY_DEFS.get('world_ashen_colossus')!.assetId).toBe('enemy.cargo_loader');
    expect(ENEMY_DEFS.get('world_mother_of_spores')!.assetId).toBe('enemy.spore_carrier');
    const engine = ENEMY_DEFS.get('world_hollow_engine')!;
    expect(engine.assetId).toBe('enemy.core_guardian');
    expect(engine.look).toBe('lumen');
    // Only existing portraits are reused (the portrait files are listed in artFiles).
    expect(worldBossPortrait('world_mother_of_spores')).toBe('brood_mother');
    expect(worldBossPortrait('world_ashen_colossus')).toBeUndefined();
  });

  it('every spot is inside its zone, in the open and away from hubs and gates', () => {
    for (const def of WORLD_BOSSES) {
      for (const s of def.spots) {
        const zone = zoneDef(s.zone);
        expect(Math.abs(s.x) + s.radius).toBeLessThan(zone.halfSize);
        expect(Math.abs(s.z) + s.radius).toBeLessThan(zone.halfSize);
        for (const h of zone.hubs) expect(Math.hypot(s.x - h.x, s.z - h.z) - h.radius).toBeGreaterThan(100);
        for (const g of zone.gates) expect(Math.hypot(s.x - g.x, s.z - g.z)).toBeGreaterThan(90);
        for (const p of zone.pois) if (p.kind === 'boss' || p.kind === 'stronghold' || p.kind === 'dungeon') expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(s.radius + 20);
        for (const p of zone.props) if (p.collider || p.colliders) expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(s.radius * 0.8);
        const grid = caveGrid(zone);
        if (grid) expect(openAt(grid, s.x, s.z, s.radius - 2)).toBe(true);
      }
    }
  });
});

describe('spawning', () => {
  it('does nothing before World Tier 2 or without an account', () => {
    const a = setup(1, interval, 1);
    tick(a.world, a.ctx);
    expect(worldBossRuntime(a.ctx).entity).toBeNull();
    expect(activeWorldBoss(a.ctx)).toBeNull();
    const b = setup(1, interval);
    delete b.ctx.account;
    tick(b.world, b.ctx);
    expect(worldBossRuntime(b.ctx).entity).toBeNull();
  });

  it('does not spawn while it is only announced, or when the player is in another zone', () => {
    const early = setup(1, interval - 60);
    tick(early.world, early.ctx);
    expect(worldBossRuntime(early.ctx).entity).toBeNull();
    expect(activeWorldBoss(early.ctx)!.phase).toBe('warning');

    const elsewhere = setup(1, interval);
    const other = ZONES.find((z) => z.id !== elsewhere.event.spot.zone)!;
    elsewhere.ctx.zone = createZoneRuntime(other);
    tick(elsewhere.world, elsewhere.ctx, 5);
    expect(worldBossRuntime(elsewhere.ctx).entity).toBeNull();
  });

  it('spawns at its spot when its time comes with the player in the zone, at level 50 with its script', () => {
    const { world, ctx, event } = setup(1, interval);
    tick(world, ctx);
    const e = worldBossRuntime(ctx).entity!;
    expect(e).not.toBeNull();
    const tr = world.req(e, Transform);
    expect([tr.x, tr.z]).toEqual([event.spot.x, event.spot.z]);
    const boss = world.req(e, Boss);
    expect(boss.script).toBe(event.def.script);
    expect(boss.arena).toEqual({ x: event.spot.x, z: event.spot.z, radius: event.spot.radius });
    expect(ctx.events.drain().some((ev) => ev.type === 'banner' && ev.key === `worldBoss.${event.def.id}.intro`)).toBe(true);
    // Only one, however long the player stays.
    tick(world, ctx, 120);
    expect(world.query(Boss)).toHaveLength(1);
  });

  it('spawns when the player enters the zone mid-lifetime, and not again after the lifetime', () => {
    const { world, ctx } = setup(2, 2 * interval + 400);
    tick(world, ctx);
    expect(worldBossRuntime(ctx).entity).not.toBeNull();
    // Time runs out: it is gone.
    ctx.account!.endgame.playtime = 2 * interval + lifetime;
    tick(world, ctx);
    world.flushDestroyed();
    expect(world.query(Boss)).toHaveLength(0);
    expect(worldBossRuntime(ctx).entity).toBeNull();
    tick(world, ctx, 10);
    expect(world.query(Boss)).toHaveLength(0);
  });

  it('comes back when the player returns to the zone, with the life it had left', () => {
    const { world, ctx } = setup(1, interval + 100);
    tick(world, ctx);
    const first = worldBossRuntime(ctx).entity!;
    world.req(first, Health).current = world.req(first, Health).max * 0.4;
    tick(world, ctx);
    // The player leaves: the zone's entities are cleared.
    world.destroy(first);
    tick(world, ctx);
    const again = worldBossRuntime(ctx).entity!;
    expect(again).not.toBe(first);
    const h = world.req(again, Health);
    expect(h.current / h.max).toBeCloseTo(0.4, 2);
  });

  it('heals up when the player dies in the fight', () => {
    const { world, ctx, player } = setup(1, interval + 10);
    tick(world, ctx);
    const e = worldBossRuntime(ctx).entity!;
    world.req(e, Boss).engaged = true;
    world.req(e, Health).current = 5;
    world.add(player, Dead, { elapsed: 0, removeAfter: Infinity, fallDir: 0 });
    tick(world, ctx);
    expect(world.req(e, Health).current).toBe(world.req(e, Health).max);
    expect(world.req(e, Boss).engaged).toBe(false);
  });

  it('is gone for good once killed, and pays its chest once', () => {
    const { world, ctx, event } = setup(1, interval + 10);
    tick(world, ctx);
    const e = worldBossRuntime(ctx).entity!;
    ctx.rewards = [];
    kill(world, ctx, e, 0);
    // The body itself pays nothing: the chest is the reward.
    expect(ctx.rewards.map((r) => r.table)).toEqual([WORLD_BOSS.bodyTable]);
    ctx.rewards = [];
    tick(world, ctx, 3);
    const rt = worldBossRuntime(ctx);
    expect(rt.killed).toBe(1);
    expect(rt.reward).not.toBeNull();
    expect(ctx.rewards.some((r) => r.rarity === 'legendary' && r.table === WORLD_BOSS.dropTable)).toBe(true);
    expect(ctx.events.drain().some((ev) => ev.type === 'banner' && ev.key === 'worldBoss.defeated')).toBe(true);
    const paid = ctx.rewards.length;
    tick(world, ctx, 60);
    expect(ctx.rewards).toHaveLength(paid);
    expect(world.query(Boss).filter((b) => !world.has(b, Dead))).toHaveLength(0);
    expect(activeWorldBoss(ctx)).toBeNull();
    expect(worldBossMarker(ctx)).toBeNull();
    // The next one is still announced on schedule.
    ctx.account!.endgame.playtime = 2 * interval - warning;
    expect(activeWorldBoss(ctx)!.event.index).toBe(2);
    expect(event.index).toBe(1);
  });
});

describe('scaling', () => {
  function lifeAt(tierRow: 1 | 2 | 3 | 4) {
    setEnemyScaling(TIER_TABLE[tierRow]);
    const { world, ctx } = setup(1, interval);
    tick(world, ctx);
    return world.req(worldBossRuntime(ctx).entity!, Health).max;
  }

  it('has a large level-50 health pool that grows with the World Tier', () => {
    const def = worldBossEvent(1).def;
    const base = ENEMY_DEFS.get(def.enemy)!.life * def.lifeMul * (1 + PROGRESSION.enemyLifePerLevel * (WORLD_BOSS.level - 1));
    const tier1 = lifeAt(1);
    expect(tier1).toBeCloseTo(base, 0);
    expect(tier1).toBeGreaterThan(100_000);
    for (const tier of [2, 3, 4] as const) expect(lifeAt(tier)).toBeCloseTo(tier1 * TIER_TABLE[tier].enemyLife, 0);
  });
});

describe('maps and HUD', () => {
  it('marks the spot in its zone while announced and alive, and writes the countdown', () => {
    const { ctx, event } = setup(1, interval - 252);
    expect(worldBossMarker(ctx)).toEqual({ x: event.spot.x, z: event.spot.z, color: expect.any(String) });
    const region = t(`zones.${zoneDef(event.spot.zone).key}.name`);
    expect(worldBossLine(ctx)).toBe(`World boss: ${t(`worldBoss.${event.def.id}.name`)} in 4:12 — ${region}`);
    ctx.account!.endgame.playtime = interval + 100;
    expect(worldBossMarker(ctx)).not.toBeNull();
    expect(worldBossLine(ctx)).toContain('13:20 left');
    // In another zone the HUD still counts down, but there is no marker on that map.
    ctx.zone = createZoneRuntime(ZONES.find((z) => z.id !== event.spot.zone)!);
    expect(worldBossMarker(ctx)).toBeNull();
    expect(worldBossLine(ctx)).not.toBe('');
    ctx.account!.endgame.playtime = 10;
    expect(worldBossLine(ctx)).toBe('');
  });
});

describe('rewards', () => {
  it('a guaranteed legendary, recipes, Lumen Dust and, scaled by the tier, a unique', () => {
    const def = WORLD_BOSSES[0]!;
    const { ctx } = setup(1, interval);
    const r = payWorldBoss(ctx, def, 5, 6, 'bastion', TIER_TABLE[4]);
    expect(ctx.rewards[0]).toMatchObject({ table: 'dt.boss', x: 5, z: 6, rarity: 'legendary', xp: true });
    expect(r.recipes.length).toBeGreaterThanOrEqual(1);
    expect(r.recipes.length).toBeLessThanOrEqual(2);
    for (const id of r.recipes) {
      expect(RECIPE_IDS).toContain(id);
      expect(ctx.endgame!.recipes).toContain(id);
    }
    expect(r.dust).toBeGreaterThanOrEqual(def.rewards.dust[0]);
    expect(r.dust).toBeLessThanOrEqual(def.rewards.dust[1]);
    expect(ctx.endgame!.materials.lumen_dust).toBe(r.dust);
    expect(r.unique).toBe(ctx.rewards.some((q) => q.unique !== undefined));
  });

  it('the unique chance follows the tier\'s rare drop weight and the class', () => {
    const def = { ...WORLD_BOSSES[0]!, rewards: { ...WORLD_BOSSES[0]!.rewards, uniqueChance: 0.25 } };
    const count = (mods: typeof TIER_TABLE[1]) => {
      let n = 0;
      const { ctx } = setup(1, interval);
      for (let i = 0; i < 400; i++) if (payWorldBoss(ctx, def, 0, 0, 'bastion', mods).unique) n++;
      return n;
    };
    const base = count(TIER_TABLE[1]);
    const t4 = count({ ...TIER_TABLE[4], rareDrops: 4 });
    expect(base).toBeGreaterThan(50);
    expect(base).toBeLessThan(150);
    expect(t4).toBe(400);
    const { ctx } = setup(1, interval);
    payWorldBoss(ctx, def, 0, 0, 'bastion', { ...TIER_TABLE[4], rareDrops: 10 });
    const u = ctx.rewards.find((q) => q.unique !== undefined)!;
    expect(worldBossUniques('bastion')).toContain(u.unique);
  });

  it('teaches only recipes the character does not know, then falls back to dust alone', () => {
    const def = WORLD_BOSSES[1]!;
    const { ctx } = setup(1, interval);
    ctx.endgame!.recipes = RECIPE_IDS.slice(0, RECIPE_IDS.length - 1);
    const r = payWorldBoss(ctx, def, 0, 0, 'bastion');
    expect(r.recipes).toEqual([RECIPE_IDS[RECIPE_IDS.length - 1]]);
    const again = payWorldBoss(ctx, def, 0, 0, 'bastion');
    expect(again.recipes).toEqual([]);
    expect(again.dust).toBeGreaterThan(0);
  });
});
