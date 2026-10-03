import { describe, expect, it } from 'vitest';
import { Dead, Destructible, EnemyAI, ForcedMove, Health, Renderable, StatusEffects, Transform } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { World, type Entity } from '../src/core/ecs';
import { ENEMY_DEFS } from '../src/data/db';
import { PACK_TEMPLATES } from '../src/data/packs';
import { ZONES, zoneDef } from '../src/data/zones';
import { AIR_FILTERS, FILTER_RADIUS, HYDROPONIC_VAULTS, VAULTS_GATE } from '../src/data/zones/hydroponicVaults';
import { REFINERY_DISTRICT, VAULTS_ROAD_GATE } from '../src/data/zones/refineryDistrict';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { dealHit, hasStatus, kill } from '../src/systems/combat';
import { deathSystem } from '../src/systems/death';
import { enemyAISystem } from '../src/systems/enemyAI';
import { movementSystem } from '../src/systems/movement';
import { hazardSystem, projectileSystem } from '../src/systems/projectiles';
import { forcedMoveSystem } from '../src/systems/skills';
import { statusSystem } from '../src/systems/status';
import { environmentSystem, resetEnvironment, sporeExposure, sporesActive } from '../src/world/environment';
import { crystalSystem, hitDestructibles, interact, spawnInteractables } from '../src/world/interactables';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx, run, type SystemFn } from './helpers';

const SYSTEMS: SystemFn[] = [spatialSystem, enemyAISystem, statusSystem, movementSystem, forcedMoveSystem, collisionSystem, projectileSystem, hazardSystem, deathSystem];

function fight(enemy: string, x = 0, z = 4, level = 24) {
  const world = new World();
  const ctx = makeCtx({ worldHalfSize: 400 });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const h = world.req(player, Health);
  h.max = h.current = 1e7;
  const e = spawnEnemy(world, enemy, x, z, { level, aggro: true });
  return { world, ctx, player, e };
}

describe('The Hydroponic Vaults zone', () => {
  it('is region 3, levels 20–30, connected to the Refinery District by paired gates at road ends', () => {
    expect(HYDROPONIC_VAULTS.region).toBe(3);
    expect(HYDROPONIC_VAULTS.levels).toEqual([20, 30]);
    expect(VAULTS_GATE.to).toEqual({ zone: REFINERY_DISTRICT.id, gate: VAULTS_ROAD_GATE.id });
    expect(VAULTS_ROAD_GATE.to).toEqual({ zone: HYDROPONIC_VAULTS.id, gate: VAULTS_GATE.id });
    for (const [zone, gate] of [[HYDROPONIC_VAULTS, VAULTS_GATE], [REFINERY_DISTRICT, VAULTS_ROAD_GATE]] as const) {
      expect(zone.gates.some((g) => g.id === gate.id)).toBe(true);
      const ends = zone.roads.flatMap((r) => [r.points[0]!, r.points[r.points.length - 1]!]);
      expect(Math.min(...ends.map(([x, z]) => Math.hypot(x - gate.x, z - gate.z)))).toBeLessThan(gate.radius);
    }
    expect(zoneDef(VAULTS_GATE.to.zone)).toBe(REFINERY_DISTRICT);
  });

  it('prefixes every id and keeps ids unique across zones', () => {
    for (const p of HYDROPONIC_VAULTS.pois) expect(p.id.startsWith('hv.'), p.id).toBe(true);
    for (const p of HYDROPONIC_VAULTS.packs) expect(p.id.startsWith('hv.'), p.id).toBe(true);
    const all = ZONES.flatMap((z) => z.pois.map((p) => p.id));
    expect(new Set(all).size).toBe(all.length);
    const tps = ZONES.flatMap((z) => z.teleporters.map((t) => t.id));
    expect(new Set(tps).size).toBe(tps.length);
  });

  it('has the point-of-interest counts from the plan', () => {
    const count = (kind: string) => HYDROPONIC_VAULTS.pois.filter((p) => p.kind === kind).length;
    expect(count('dungeon')).toBe(4);
    expect(count('bunker')).toBe(6);
    expect(count('event')).toBe(6);
    expect(count('relic')).toBe(10);
    expect(count('lore')).toBe(12);
    expect(count('signalTower')).toBe(3);
    expect(count('pylon')).toBe(6);
    expect(count('lockedChest')).toBe(6);
    expect(count('stronghold')).toBe(1);
    expect(count('boss')).toBe(1);
    expect(HYDROPONIC_VAULTS.pois.filter((p) => p.data?.feature === 'airFilter')).toHaveLength(6);
    expect(count('crystal')).toBeGreaterThanOrEqual(20);
    expect(HYDROPONIC_VAULTS.teleporters.filter((t) => t.id !== 'tp.gamma')).toHaveLength(6);
  });

  it('keeps spore fields and water out of the hub and away from the arrival point', () => {
    const lab = HYDROPONIC_VAULTS.hubs[0]!;
    for (const f of HYDROPONIC_VAULTS.env ?? []) {
      if (f.kind !== 'spores' && f.kind !== 'water') continue;
      expect(Math.hypot(f.x - lab.x, f.z - lab.z)).toBeGreaterThan(lab.radius + f.radius);
      expect(Math.hypot(f.x - VAULTS_GATE.arrive.x, f.z - VAULTS_GATE.arrive.z)).toBeGreaterThan(30);
    }
  });
});

describe('spore fields and air filters', () => {
  function inSpores() {
    resetEnvironment();
    const world = new World();
    const zone = createZoneRuntime(HYDROPONIC_VAULTS);
    const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: HYDROPONIC_VAULTS.halfSize });
    // A field that one of the filters covers.
    const field = (HYDROPONIC_VAULTS.env ?? []).find(
      (f): f is Extract<typeof f, { kind: 'spores' }> => f.kind === 'spores' && !f.clearedBy && AIR_FILTERS.some((a) => Math.hypot(a.x - f.x, a.z - f.z) <= FILTER_RADIUS),
    )!;
    const player = spawnPlayer(world, 'bastion', field.x, field.z);
    spawnInteractables(world, zone);
    return { world, ctx, zone, player, field };
  }

  it('builds up exposure and poison while standing in spores, and clears in clean air', () => {
    const { world, ctx, player } = inSpores();
    const start = world.req(player, Health).current;
    run(world, ctx, [environmentSystem, statusSystem], 60 * 6);
    expect(sporeExposure()).toBeGreaterThan(0.6);
    expect(world.req(player, Health).current).toBeLessThan(start);
    world.req(player, Transform).x += 2000;
    run(world, ctx, [environmentSystem], 60 * 5);
    expect(sporeExposure()).toBe(0);
  });

  it('a switched-on filter clears its fields for good', () => {
    const { world, ctx, zone, field } = inSpores();
    expect(sporesActive(zone, field)).toBe(true);
    const filter = AIR_FILTERS.find((a) => Math.hypot(a.x - field.x, a.z - field.z) <= FILTER_RADIUS)!;
    const e = world.query(Transform).find((x) => {
      const t = world.req(x, Transform);
      return Math.hypot(t.x - filter.x, t.z - filter.z) < 0.01 && world.has(x, Renderable);
    })!;
    const player = world.first(Transform)!;
    expect(interact(world, ctx, player, e)).toBe(true);
    expect(zone.found.has(filter.id)).toBe(true);
    expect(sporesActive(zone, field)).toBe(false);
    // Already running.
    expect(interact(world, ctx, player, e)).toBe(false);
  });

  it('Dome Gamma’s spores only clear when the dome is reclaimed', () => {
    const zone = createZoneRuntime(HYDROPONIC_VAULTS);
    const gamma = (HYDROPONIC_VAULTS.env ?? []).find((f) => f.kind === 'spores' && f.clearedBy)!;
    if (gamma.kind !== 'spores') throw new Error('expected spores');
    expect(sporesActive(zone, gamma)).toBe(true);
    zone.found.add(gamma.clearedBy!);
    expect(sporesActive(zone, gamma)).toBe(false);
  });
});

describe('water and crystals', () => {
  it('water slows everyone wading through it', () => {
    resetEnvironment();
    const world = new World();
    const zone = createZoneRuntime(HYDROPONIC_VAULTS);
    const ctx = makeCtx({ zone, worldHalfSize: HYDROPONIC_VAULTS.halfSize });
    const pool = (HYDROPONIC_VAULTS.env ?? []).find((f) => f.kind === 'water')!;
    const player = spawnPlayer(world, 'bastion', pool.x, pool.z);
    run(world, ctx, [environmentSystem, statusSystem], 5);
    expect(hasStatus(world, player, 'wading')).toBe(true);
  });

  it('breaking a crystal blinds enemies around it, and it grows back', () => {
    const world = new World();
    const zone = createZoneRuntime(HYDROPONIC_VAULTS);
    const ctx = makeCtx({ zone, worldHalfSize: HYDROPONIC_VAULTS.halfSize });
    spawnInteractables(world, zone);
    const crystal = world.query(Destructible).find((e) => world.req(e, Destructible).blind)!;
    const ct = world.req(crystal, Transform);
    const enemy = spawnEnemy(world, 'overgrown_walker', ct.x + 3, ct.z, { level: 22, aggro: true });
    run(world, ctx, [spatialSystem], 1);
    expect(hitDestructibles(world, ct.x, ct.z, 1, ctx)).toBe(1);
    expect(hasStatus(world, enemy, 'stunned')).toBe(true);
    expect(world.has(crystal, Destructible)).toBe(false);
    ctx.time += 60;
    run(world, ctx, [crystalSystem], 1);
    expect(world.has(crystal, Destructible)).toBe(true);
  });
});

describe('Region 3 roster', () => {
  const ids = ['overgrown_walker', 'spore_hound', 'swarm_bloater', 'mossborn', 'vine_weaver', 'spore_swarm', 'cocoon_warden', 'mutated_botanist', 'lumen_giant'];

  it('uses only existing models, 40–60 % returning, every type in a pack', () => {
    for (const id of ids) expect(ENEMY_DEFS.get(id)!.assetId.match(/^(enemy|boss)\./), id).toBeTruthy();
    const packed = new Set(PACK_TEMPLATES.filter((p) => p.id.startsWith('hv_')).flatMap((p) => p.members.map((m) => m.enemy)));
    for (const id of ids) expect(packed.has(id), id).toBe(true);
    const returning = ['overgrown_walker', 'spore_hound', 'swarm_bloater', 'mossborn'];
    expect(returning.length / ids.length).toBeGreaterThanOrEqual(0.4);
    expect(returning.length / ids.length).toBeLessThanOrEqual(0.6);
  });

  it('Overgrown Walkers root you every third hit that lands', () => {
    const { world, ctx, player } = fight('overgrown_walker', 0, 1.2);
    let rooted = false;
    for (let i = 0; i < 60 * 8 && !rooted; i++) {
      run(world, ctx, SYSTEMS, 1);
      rooted = hasStatus(world, player, 'rooted');
    }
    expect(rooted).toBe(true);
  });

  it('Vine Weavers telegraph a lash and drag a distant target in', () => {
    const { world, ctx, player } = fight('vine_weaver', 0, 8);
    let pulled = false;
    let telegraph = false;
    for (let i = 0; i < 60 * 6 && !pulled; i++) {
      run(world, ctx, SYSTEMS, 1);
      for (const ev of ctx.events.drain()) if (ev.type === 'telegraph' && ev.shape.kind === 'line') telegraph = true;
      pulled = world.has(player, ForcedMove);
    }
    expect(telegraph).toBe(true);
    expect(pulled).toBe(true);
  });

  it('Spore Swarms slip some hits', () => {
    const { world, ctx, player, e } = fight('spore_swarm', 0, 2);
    let misses = 0;
    for (let i = 0; i < 200; i++) {
      world.req(e, Health).current = world.req(e, Health).max;
      if (dealHit(world, ctx, player, e, { coefficient: 0.01, damageType: 'physical', knockback: 0, fromX: 0, fromZ: 0, applies: [], range: 'melee' }) === null) misses++;
    }
    expect(misses).toBeGreaterThan(40);
    expect(misses).toBeLessThan(120);
  });

  it('Swarm Bloaters release Spore Swarms when they die', () => {
    const { world, ctx, e } = fight('swarm_bloater', 0, 6);
    kill(world, ctx, e, 0);
    const swarms = world.query(EnemyAI).filter((x) => world.req(x, EnemyAI).defId === 'spore_swarm');
    expect(swarms).toHaveLength(3);
  });

  it('Mossborn heal the Lumen creatures around them', () => {
    const { world, ctx, e } = fight('mossborn', 0, 20);
    const ally = spawnEnemy(world, 'spore_hound', 1.5, 20, { level: 24, aggro: true });
    const h = world.req(ally, Health);
    h.current = h.max * 0.3;
    world.req(e, EnemyAI).aggro = true;
    run(world, ctx, [spatialSystem, enemyAISystem], 60 * 6);
    expect(world.req(ally, Health).current).toBeGreaterThan(h.max * 0.3);
  });

  it('Cocoon Wardens call reinforcements if not killed quickly', () => {
    const { world, ctx } = fight('cocoon_warden', 0, 4);
    const before = world.query(EnemyAI).length;
    run(world, ctx, [spatialSystem, enemyAISystem], 60 * 9);
    expect(world.query(EnemyAI).length).toBeGreaterThan(before);
  });

  it('Lumen Giants regrow while a fungus stands, and stay down once the fungi are gone', () => {
    const { world, ctx, e } = fight('lumen_giant', 0, 6);
    run(world, ctx, [spatialSystem, enemyAISystem], 2);
    const fungi = world.req(e, EnemyAI).fungi!;
    expect(fungi).toHaveLength(3);
    kill(world, ctx, e, 0);
    expect(ctx.rewards).toHaveLength(0);
    ctx.time += 6;
    run(world, ctx, [enemyAISystem], 1);
    expect(world.has(e, Dead)).toBe(false);
    expect(world.req(e, Health).current).toBeGreaterThan(0);
    for (const f of fungi) kill(world, ctx, f, 0);
    kill(world, ctx, e, 0);
    expect(world.has(e, Dead)).toBe(true);
    expect(ctx.rewards.length).toBeGreaterThan(0);
  });

  it('Mutated Botanists lob telegraphed spore clouds', () => {
    const { world, ctx, player } = fight('mutated_botanist', 0, 9);
    let clouds = 0;
    for (let i = 0; i < 60 * 8; i++) {
      run(world, ctx, SYSTEMS, 1);
      for (const ev of ctx.events.drain()) if (ev.type === 'telegraph' && ev.shape.kind === 'circle' && ev.owner === null) clouds++;
    }
    expect(clouds).toBeGreaterThan(0);
    expect(world.req(player, StatusEffects).list.some((s) => s.id === 'poisoned') || world.req(player, Health).current < 1e7).toBe(true);
  });
});

void (null as unknown as Entity);
