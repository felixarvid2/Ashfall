import { describe, expect, it } from 'vitest';
import { AccountBonuses, Blast, CombatStats, Dead, Destructible, Health, Interactable, Mover, Progression, Renderable, Transform } from '../src/core/components';
import { emptyAccount, relicEffects } from '../src/core/account';
import { World, type Entity } from '../src/core/ecs';
import type { GameContext } from '../src/core/context';
import { PYLONS, PYLON_RECHARGE, RELIC_BONUS } from '../src/data/interactables';
import type { PoiDef, ZoneDef } from '../src/data/zones/zoneTypes';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import { applyStatus, dealHit, hasStatus, kill } from '../src/systems/combat';
import { deathSystem } from '../src/systems/death';
import { statusSystem } from '../src/systems/status';
import { spatialSystem } from '../src/systems/collision';
import { recomputePlayer } from '../src/systems/stats';
import { blastSystem, hitDestructibles, interact, interactSystem, nearestInteractable, spawnInteractables, syncInteractables } from '../src/world/interactables';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime, revealedFraction, type ZoneRuntime } from '../src/world/zone';
import { fakeInput, makeCtx, run } from './helpers';

function zoneWith(pois: PoiDef[]): ZoneDef {
  return { ...CINDER_FLATS, pois, teleporters: [{ id: 'tp.ember', x: 100, z: 100, hub: true }], packs: [] };
}

function setup(pois: PoiDef[]) {
  const world = new World();
  const zone = createZoneRuntime(zoneWith(pois));
  const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: zone.def.halfSize });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  spawnInteractables(world, zone);
  return { world, ctx, zone, player };
}

function entityFor(world: World, poi: string): Entity {
  return world.query(Interactable).find((e) => world.req(e, Interactable).poi === poi)!;
}

function press(world: World, ctx: GameContext) {
  ctx.input = fakeInput(['pickup']);
  run(world, ctx, [interactSystem]);
  ctx.input = fakeInput();
}

describe('interactables', () => {
  it('spawns one entity per point of interest (plus teleporters) in Cinder Flats', () => {
    const world = new World();
    const zone = createZoneRuntime(CINDER_FLATS);
    spawnInteractables(world, zone);
    const barrels = CINDER_FLATS.pois.filter((p) => p.kind === 'barrel').length;
    const usable = CINDER_FLATS.pois.filter((p) => ['chest', 'lockedChest', 'keycard', 'pylon', 'relic', 'lore', 'signalTower', 'dungeon', 'bunker', 'feature'].includes(p.kind)).length;
    expect(world.query(Destructible).length).toBe(barrels);
    expect(world.query(Interactable).length).toBe(usable + CINDER_FLATS.teleporters.length);
    // Every zone has all six pylon types and 8–12 relics (docs/world-and-gameplay.md §3).
    const types = new Set(CINDER_FLATS.pois.filter((p) => p.kind === 'pylon').map((p) => p.data?.type));
    expect(types.size).toBe(6);
    const relics = CINDER_FLATS.pois.filter((p) => p.kind === 'relic').length;
    expect(relics).toBeGreaterThanOrEqual(8);
    expect(relics).toBeLessThanOrEqual(12);
  });

  it('opens a supply crate with the interact key and refills it later', () => {
    const { world, ctx } = setup([{ id: 'chest.a', kind: 'chest', x: 1, z: 0 }]);
    press(world, ctx);
    expect(ctx.rewards).toEqual([expect.objectContaining({ table: 'dt.supply_crate', xp: false })]);
    expect(nearestInteractable(world, 0, 0, ctx.time)).toBeNull();
    ctx.time += 601;
    run(world, ctx, [interactSystem]);
    expect(nearestInteractable(world, 0, 0, ctx.time)).toBe(entityFor(world, 'chest.a'));
  });

  it('needs the nearby keycard to open a locked chest, then spends it', () => {
    const { world, ctx, zone, player } = setup([
      { id: 'locked.0', kind: 'lockedChest', x: 1, z: 0, data: { key: 'keycard.0' } },
      { id: 'keycard.0', kind: 'keycard', x: 20, z: 0, data: { opens: 'locked.0' } },
    ]);
    expect(interact(world, ctx, player, entityFor(world, 'locked.0'))).toBe(false);
    expect(ctx.events.drain()).toContainEqual({ type: 'notice', key: 'interact.needKeycard' });
    expect(interact(world, ctx, player, entityFor(world, 'keycard.0'))).toBe(true);
    expect(zone.keycards.has('keycard.0')).toBe(true);
    expect(world.req(entityFor(world, 'keycard.0'), Renderable).scale).toBeLessThan(0.01);
    expect(interact(world, ctx, player, entityFor(world, 'locked.0'))).toBe(true);
    expect(ctx.rewards[0]!.table).toBe('dt.locked_chest');
    expect(zone.keycards.size).toBe(0);
    expect(zone.found.has('locked.0')).toBe(true);
    expect(interact(world, ctx, player, entityFor(world, 'locked.0'))).toBe(false);
  });

  it('pylons grant their buff and recharge', () => {
    const { world, ctx, player } = setup([{ id: 'pylon.0', kind: 'pylon', x: 1, z: 0, data: { type: 'overcharge' } }]);
    press(world, ctx);
    expect(hasStatus(world, player, 'overcharge')).toBe(true);
    const it = world.req(entityFor(world, 'pylon.0'), Interactable);
    expect(it.readyAt).toBeCloseTo(ctx.time + PYLON_RECHARGE - 1 / 60, 3);
    expect(world.req(entityFor(world, 'pylon.0'), Renderable).glow).toBeUndefined();
    ctx.time = it.readyAt + 1;
    run(world, ctx, [interactSystem]);
    expect(world.req(entityFor(world, 'pylon.0'), Renderable).glow).toBe(PYLONS.overcharge.color);
  });

  it('Overcharge adds 50% damage, Kinetic speeds movement, Barrier absorbs everything', () => {
    const { world, ctx, player } = setup([]);
    const enemy = spawnEnemy(world, 'infected_colonist', 1, 0);
    world.req(enemy, Health).max = world.req(enemy, Health).current = 100000;
    Object.assign(world.req(player, CombatStats), { critChance: 0 });
    const hit = () => dealHit(world, ctx, player, enemy, { coefficient: 1, damageType: 'physical', knockback: 0, fromX: 0, fromZ: 0, applies: [], range: 'melee' })!;
    const base = hit();
    const apply = (status: 'overcharge' | 'kinetic' | 'aegis') => applyStatus(world, ctx, player, { status, duration: 10 }, { team: 'player', level: 1 });
    apply('overcharge');
    expect(hit() / base).toBeCloseTo(1.5, 1);
    apply('kinetic');
    run(world, ctx, [statusSystem]);
    expect(world.req(player, Mover).speedMul).toBeCloseTo(1.4, 5);
    apply('aegis');
    const before = world.req(player, Health).current;
    dealHit(world, ctx, enemy, player, { coefficient: 5, damageType: 'physical', knockback: 0, fromX: 1, fromZ: 0, applies: [], range: 'melee' });
    expect(world.req(player, Health).current).toBe(before);
  });

  it('Echo Relics grant an account-wide bonus', () => {
    const { world, ctx, player } = setup([{ id: 'relic.0', kind: 'relic', x: 1, z: 0, data: { stat: 'maxLife' } }]);
    const before = world.req(player, Health).max;
    press(world, ctx);
    expect(ctx.account!.relics).toEqual({ 'relic.0': 'maxLife' });
    expect(world.req(player, Health).max).toBe(before + RELIC_BONUS.maxLife!);
    // A different character on the same account gets it too.
    const other = new World();
    const p2 = spawnPlayer(other, 'spectre', 0, 0);
    const base2 = other.req(p2, Health).max;
    other.add(p2, AccountBonuses, { effects: relicEffects(ctx.account!) });
    recomputePlayer(other, p2);
    expect(other.req(p2, Health).max).toBe(base2 + RELIC_BONUS.maxLife!);
  });

  it('reading a log gives XP once; signal towers reveal the map', () => {
    const { world, ctx, zone, player } = setup([
      { id: 'lore.0', kind: 'lore', x: 1, z: 0, data: { log: 'cf.0' } },
      { id: 'tower.0', kind: 'signalTower', x: 200, z: 200 },
    ]);
    press(world, ctx);
    expect(ctx.events.drain()).toContainEqual({ type: 'interact', kind: 'lore', id: 'lore.0', detail: 'cf.0' });
    expect(world.req(player, Progression).xp).toBeGreaterThan(0);
    expect(interact(world, ctx, player, entityFor(world, 'lore.0'))).toBe(false);
    const before = revealedFraction(zone);
    expect(interact(world, ctx, player, entityFor(world, 'tower.0'))).toBe(true);
    expect(revealedFraction(zone)).toBeGreaterThan(before + 0.05);
  });

  it('restores used objects from saved progress', () => {
    const { world, zone } = setup([
      { id: 'relic.0', kind: 'relic', x: 1, z: 0, data: { stat: 'armor' } },
      { id: 'lore.0', kind: 'lore', x: 3, z: 0, data: { log: 'cf.0' } },
    ]);
    zone.found.add('relic.0');
    syncInteractables(world, zone as ZoneRuntime);
    expect(world.req(entityFor(world, 'relic.0'), Interactable).used).toBe(true);
    expect(world.req(entityFor(world, 'lore.0'), Interactable).used).toBe(false);
  });

  it('explosive barrels blow up when hit, hurt everyone nearby and chain', () => {
    const { world, ctx, player } = setup([
      { id: 'barrel.0', kind: 'barrel', x: 5, z: 0 },
      { id: 'barrel.1', kind: 'barrel', x: 8.5, z: 0 },
    ]);
    const near = spawnEnemy(world, 'infected_colonist', 6, 1);
    const far = spawnEnemy(world, 'infected_colonist', 11, 0);
    const lifeNear = world.req(near, Health).current;
    const lifeFar = world.req(far, Health).current;
    world.req(player, Transform).x = 2;
    const playerLife = world.req(player, Health).current;
    expect(hitDestructibles(world, 5, 0, 1)).toBe(1);
    run(world, ctx, [spatialSystem, blastSystem], 30);
    expect(world.query(Destructible).length).toBe(0);
    expect(world.query(Blast).length).toBe(0);
    expect(world.req(near, Health).current).toBeLessThan(lifeNear);
    // The second barrel (chained) reaches the far enemy.
    expect(world.req(far, Health).current).toBeLessThan(lifeFar);
    expect(world.req(player, Health).current).toBeLessThan(playerLife);
  });

  it('Chain Reaction makes dying enemies explode', () => {
    const { world, ctx, player } = setup([]);
    const a = spawnEnemy(world, 'infected_colonist', 10, 0);
    const b = spawnEnemy(world, 'infected_colonist', 12, 0);
    world.req(b, Health).max = world.req(b, Health).current = 10000;
    applyStatus(world, ctx, player, { status: 'chainReaction', duration: 60 }, { team: 'player', level: 1 });
    expect(hasStatus(world, player, 'chainReaction')).toBe(true);
    kill(world, ctx, a, 0);
    expect(world.query(Blast).length).toBe(1);
    run(world, ctx, [spatialSystem, blastSystem, deathSystem], 20);
    expect(world.has(a, Dead)).toBe(true);
    expect(world.req(b, Health).current).toBeLessThan(10000);
  });
});
