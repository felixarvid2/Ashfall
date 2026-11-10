import { describe, expect, it } from 'vitest';
import { Escort, GroundGold, GroundItem, Health, Transform, makeTransform } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { SaveDataSchema } from '../src/core/save';
import { HARVEST } from '../src/data/endgame/harvest';
import { LOOT_KEEP, restoreGroundLoot, stashGroundLoot } from '../src/world/groundLoot';
import { harvestOnDeath, shardPileSystem } from '../src/world/harvest';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import { movementSystem } from '../src/systems/movement';
import { PROGRESS_KEEP, createQuestRuntime, questSystem, rebuildQuestWorld, restoreQuests, saveQuests, spawnQuestWorld } from '../src/systems/quests';
import { suspendEvents, worldEventSystem } from '../src/world/worldEvents';
import { spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx, run } from './helpers';

function setup() {
  const world = new World();
  const zone = createZoneRuntime(CINDER_FLATS);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize });
  const player = spawnPlayer(world, 'bastion', CINDER_FLATS.playerSpawn.x, CINDER_FLATS.playerSpawn.z);
  spawnQuestWorld(world, ctx);
  return { world, ctx, zone, player, rt: ctx.quests! };
}
const moveTo = (world: World, e: Entity, x: number, z: number) => {
  const tr = world.req(e, Transform);
  tr.x = tr.prevX = x;
  tr.z = tr.prevZ = z;
};
/** What Game.enterZone does to the old zone's entities, then comes back. */
function leaveAndReturn(world: World, ctx: ReturnType<typeof makeCtx>, player: Entity) {
  for (const e of world.query(Transform)) if (e !== player) world.destroyDeferred(e);
  world.flushDestroyed();
  rebuildQuestWorld(world, ctx);
  world.flushDestroyed();
}

describe('A10 escort and event persistence', () => {
  it('an escort left mid-way resumes within 10 minutes and restarts after', () => {
    const { world, ctx, rt, player } = setup();
    rt.active.set('sq.water', { step: 1, progress: 0 });
    restoreQuests(world, ctx, saveQuests(rt));
    const tanker = world.query(Escort)[0]!;
    const start = { ...world.req(tanker, Transform) };
    moveTo(world, player, start.x, start.z + 3);
    // Drive it along until it passed a waypoint.
    for (let i = 0; i < 40 && world.req(tanker, Escort).next < 2; i++) {
      moveTo(world, player, world.req(tanker, Transform).x, world.req(tanker, Transform).z + 3);
      run(world, ctx, [questSystem, movementSystem], 60);
    }
    const next = world.req(tanker, Escort).next;
    expect(next).toBeGreaterThanOrEqual(2);
    world.req(tanker, Health).current -= 10;
    const hp = world.req(tanker, Health).current;
    const at = { ...world.req(tanker, Transform) };
    run(world, ctx, [questSystem], 1);
    leaveAndReturn(world, ctx, player);
    run(world, ctx, [], 600);
    const back = world.query(Escort)[0]!;
    expect(world.req(back, Escort).next).toBe(next);
    expect(Math.hypot(world.req(back, Transform).x - at.x, world.req(back, Transform).z - at.z)).toBeLessThan(2);
    expect(world.req(back, Health).current).toBe(hp);

    // Away for too long: it starts over.
    run(world, ctx, [questSystem], 1);
    ctx.time += PROGRESS_KEEP + 5;
    leaveAndReturn(world, ctx, player);
    const fresh = world.query(Escort)[0]!;
    expect(world.req(fresh, Escort).next).toBe(1);
  });

  it('an event picks up its progress when the player returns within 10 minutes', () => {
    const { world, ctx, zone, player } = setup();
    const ev = zone.events.get('event.convoy')!;
    moveTo(world, player, ev.x + 5, ev.z);
    run(world, ctx, [worldEventSystem], 1);
    expect(ev.state).toBe('active');
    ev.progress = 2;
    ev.elapsed = 33;
    suspendEvents(zone, ctx.time, world);
    expect(ev.state).toBe('idle');
    leaveAndReturn(world, ctx, player);
    ctx.time += 120;
    moveTo(world, player, ev.x + 5, ev.z);
    run(world, ctx, [worldEventSystem], 1);
    expect(ev.state).toBe('active');
    expect(ev.progress).toBeGreaterThanOrEqual(2);
    expect(ev.elapsed).toBeGreaterThanOrEqual(33);

    // Too late: a fresh start.
    suspendEvents(zone, ctx.time, world);
    leaveAndReturn(world, ctx, player);
    ctx.time += PROGRESS_KEEP + 5;
    moveTo(world, player, ev.x + 5, ev.z);
    run(world, ctx, [worldEventSystem], 1);
    expect(ev.state).toBe('active');
    expect(ev.elapsed).toBeLessThan(5);
  });
});

describe('A11 ground loot persists', () => {
  const item = (uid: string) => ({ uid, baseId: 'x', name: 'x', slot: 'weapon', rarity: 'rare' }) as never;
  it('comes back after a zone change within 5 minutes, per zone, and is gone later', () => {
    const { world, ctx, zone, player } = setup();
    const a = world.create();
    world.add(a, Transform, makeTransform(10, 0, 12, 0));
    world.add(a, GroundItem, { item: item('u1'), age: 9 });
    const g = world.create();
    world.add(g, Transform, makeTransform(-4, 0, 3, 0));
    world.add(g, GroundGold, { amount: 42, age: 9 });
    stashGroundLoot(world, ctx, zone);
    leaveAndReturn(world, ctx, player);
    expect(world.query(GroundItem)).toHaveLength(0);
    ctx.time += LOOT_KEEP - 1;
    expect(restoreGroundLoot(world, ctx, zone)).toBe(2);
    const back = world.query(GroundItem)[0]!;
    expect(world.req(back, GroundItem).item.uid).toBe('u1');
    expect(world.req(back, Transform).x).toBe(10);
    expect(world.req(world.query(GroundGold)[0]!, GroundGold).amount).toBe(42);
    // Stashed again but too late.
    stashGroundLoot(world, ctx, zone);
    leaveAndReturn(world, ctx, player);
    ctx.time += LOOT_KEEP + 1;
    expect(restoreGroundLoot(world, ctx, zone)).toBe(0);
    expect(world.query(GroundItem)).toHaveLength(0);
  });
});

describe('A09 Ash Shard pile', () => {
  it('drops where you died, is picked up by walking over it, expires after 5 minutes', () => {
    const world = new World();
    const zone = createZoneRuntime(CINDER_FLATS);
    const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: zone.def.halfSize });
    ctx.endgame = SaveDataSchema.shape.endgame.parse(undefined);
    ctx.endgame.ashShards = 100;
    const player = spawnPlayer(world, 'bastion', 30, 40);
    harvestOnDeath(world, ctx, player);
    expect(ctx.endgame.ashShards).toBe(50);
    expect(zone.shardPile).toMatchObject({ x: 30, z: 40, amount: 50 });
    // The player respawns elsewhere; the pile stands as an entity.
    moveTo(world, player, 0, 0);
    run(world, ctx, [shardPileSystem], 2);
    expect(world.isAlive(zone.shardPile!.entity!)).toBe(true);
    expect(ctx.endgame.ashShards).toBe(50);
    moveTo(world, player, 30.5, 40);
    run(world, ctx, [shardPileSystem], 2);
    expect(ctx.endgame.ashShards).toBe(100);
    expect(zone.shardPile).toBeUndefined();

    // Lost for good after the window.
    ctx.endgame.ashShards = 40;
    moveTo(world, player, 5, 5);
    harvestOnDeath(world, ctx, player);
    ctx.time += HARVEST.pileKeep + 1;
    run(world, ctx, [shardPileSystem], 1);
    expect(zone.shardPile).toBeUndefined();
    expect(ctx.endgame.ashShards).toBe(20);
  });
});
