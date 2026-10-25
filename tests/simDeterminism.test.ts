/**
 * C04: a seeded headless run is bit-for-bit repeatable. 600 ticks across two zone changes (the way the game's
 * `enterZone` does it: every entity but the player goes, the new zone's props and enemies arrive) must give the
 * same state hash twice, and a different seed must give a different one (so the hash is not constant).
 */
import { describe, expect, it } from 'vitest';
import { Health, Transform } from '../src/core/components';
import { Scheduler, World } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { ZONES } from '../src/data/zones';
import type { ZoneDef } from '../src/data/zones/zoneTypes';
import { collisionSystem, spatialSystem } from '../src/systems/collision';
import { deathSystem } from '../src/systems/death';
import { enemyAISystem } from '../src/systems/enemyAI';
import { movementSystem } from '../src/systems/movement';
import { navigationSystem } from '../src/systems/navigation';
import { projectileSystem } from '../src/systems/projectiles';
import { skillSystem } from '../src/systems/skills';
import { statusSystem } from '../src/systems/status';
import { spawnArenaProps } from '../src/world/arena';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { fakeInput, learnSkills, makeCtx } from './helpers';

const zoneById = (id: string): ZoneDef => ZONES.find((z) => z.id === id)!;
const ENEMIES = ['infected_colonist', 'security_drone', 'bloater', 'spore_hound'];

/** FNV-1a over a string, as 8 hex digits. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function stateHash(world: World, ctx: ReturnType<typeof makeCtx>): string {
  const rows: string[] = [`t${ctx.tick}`, `k${ctx.stats.kills}`, `r${ctx.rng.getState().join(',')}`];
  for (const e of world.query(Transform).sort((a, b) => a - b)) {
    const tr = world.req(e, Transform);
    const hp = world.get(e, Health);
    rows.push(`${e}:${tr.x.toFixed(5)},${tr.z.toFixed(5)}${hp ? `:${hp.current.toFixed(3)}` : ''}`);
  }
  return fnv(rows.join('|'));
}

function runSession(seed: string): string[] {
  const world = new World();
  const ctx = makeCtx({ rng: new Rng(seed), loot: { rng: new Rng(`${seed}-loot`), seq: 0 }, input: fakeInput(['skill1'], [0]) });
  const first = zoneById('zone.hydroponic_vaults');
  const player = spawnPlayer(world, 'bastion', first.hubs[0]!.x, first.hubs[0]!.z);
  learnSkills(world, player);
  const scheduler = new Scheduler<typeof ctx>()
    .add('spatial', spatialSystem)
    .add('skills', skillSystem)
    .add('navigation', navigationSystem)
    .add('enemyAI', enemyAISystem)
    .add('status', statusSystem)
    .add('movement', movementSystem)
    .add('collision', collisionSystem)
    .add('projectiles', projectileSystem)
    .add('death', deathSystem);

  const enter = (zone: ZoneDef): void => {
    for (const e of world.query(Transform)) if (e !== player) world.destroyDeferred(e);
    world.flushDestroyed();
    ctx.spatial.clearStatics();
    ctx.zone = createZoneRuntime(zone);
    ctx.worldHalfSize = zone.halfSize;
    spawnArenaProps(world, zone);
    const hub = zone.hubs[0]!;
    const tr = world.req(player, Transform);
    tr.x = hub.x;
    tr.z = hub.z;
    for (let i = 0; i < 12; i++) {
      const r = 6 + (i % 5) * 2;
      spawnEnemy(world, ENEMIES[i % ENEMIES.length]!, hub.x + Math.cos(i * 2.4) * r, hub.z + Math.sin(i * 2.4) * r, { level: 5 });
    }
    // The aim point of the held mouse button: a spot near the hub.
    ctx.pickGround = () => ({ x: hub.x + 4, z: hub.z + 4 });
  };

  const hashes: string[] = [];
  const order = [first, zoneById('zone.deep_mines'), first];
  for (const zone of order) {
    enter(zone);
    for (let k = 0; k < 200; k++) {
      scheduler.tick(world, 1 / 60, ctx);
      world.flushDestroyed();
      ctx.tick++;
      ctx.time += 1 / 60;
    }
    hashes.push(stateHash(world, ctx));
  }
  expect(ctx.tick).toBe(600);
  return hashes;
}

describe('seeded simulation', () => {
  it('600 ticks with two zone changes give the same state hash twice', () => {
    const a = runSession('det-1');
    const b = runSession('det-1');
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  }, 60000);

  it('a different seed ends in a different state', () => {
    expect(runSession('det-2')[2]).not.toBe(runSession('det-1')[2]);
  }, 60000);
});
