/**
 * Save and account fixtures written by the game's own code (C09).
 *
 *   npm run fixtures:build    rewrites tests/fixtures/save-v8-sim.json and account-v1-sim.json
 *
 * A seeded headless run (Cinder Flats, a Bastion, real combat, rewards and pickups) is turned into a save by
 * `buildSaveData` (what `Game.snapshot()` calls) and written by `serializeSave(data, true)` (what "Export save"
 * downloads); the account goes through `saveAccount` into a memory Storage. tests/simFixtures.test.ts rebuilds
 * both and fails when a checked-in file no longer matches, so a schema change shows up as a fixture to refresh.
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Dead, EnemyAI, Health, Inventory, Mover, Progression, SkillUser, Transform } from '../../src/core/components';
import { emptyAccount, saveAccount } from '../../src/core/account';
import type { GameContext } from '../../src/core/context';
import { Scheduler, World, type Entity } from '../../src/core/ecs';
import { Rng } from '../../src/core/rng';
import { serializeSave } from '../../src/core/save';
import { classDef } from '../../src/data/db';
import { ZONES } from '../../src/data/zones';
import { collisionSystem, spatialSystem } from '../../src/systems/collision';
import { deathSystem } from '../../src/systems/death';
import { enemyAISystem } from '../../src/systems/enemyAI';
import { generateItem, itemPowerFor } from '../../src/systems/loot/generate';
import { addToGrid, equipFromGrid } from '../../src/systems/loot/inventory';
import { nextItemUid, pickUp, pickupSystem, rewardSystem } from '../../src/systems/loot/rewards';
import { movementSystem } from '../../src/systems/movement';
import { navigationSystem } from '../../src/systems/navigation';
import { createQuestRuntime } from '../../src/systems/quests';
import { buildSaveData } from '../../src/systems/saveSnapshot';
import { projectileSystem } from '../../src/systems/projectiles';
import { recomputePlayer } from '../../src/systems/stats';
import { skillSystem } from '../../src/systems/skills';
import { statusSystem } from '../../src/systems/status';
import { spawnArenaProps } from '../../src/world/arena';
import { GroundItem } from '../../src/core/components';
import { spawnEnemy, spawnPlayer } from '../../src/world/spawn';
import { createZoneRuntime } from '../../src/world/zone';
import { MemoryStorage } from '../../tests/fixtures/memoryStorage';
import { learnSkills, makeCtx } from '../../tests/helpers';

export interface FixtureSet {
  save: string;
  account: string;
  /** What the run did, for the tests' sanity checks. */
  summary: { kills: number; level: number; items: number; ticks: number };
}

const SAVED_AT = '2026-10-01T12:00:00.000Z';
const ENEMIES = ['infected_colonist', 'security_drone', 'bloater', 'spore_hound'];

/** The class's starter kit in the bag and equipped, as in the game: without a weapon nothing hurts. */
export function equipStarterKit(world: World, player: Entity, ctx: GameContext): void {
  const classId = world.req(player, SkillUser).classId;
  const inv = world.req(player, Inventory);
  for (const baseId of classDef(classId).starterKit) {
    const item = generateItem(ctx.loot.rng, { itemPower: itemPowerFor(1, ctx.loot.rng), classId, uid: nextItemUid(ctx), rarity: 'common', baseId });
    addToGrid(inv, item);
    equipFromGrid(inv, inv.grid.indexOf(item), classId);
  }
  recomputePlayer(world, player);
}

/** One tick of a minimal fighter: walk at the nearest living enemy and cast the first bar skill at it. */
export function fighterStep(world: World, player: Entity): void {
  const me = world.req(player, Transform);
  const user = world.req(player, SkillUser);
  const mover = world.req(player, Mover);
  mover.vx = mover.vz = 0;
  let best: Transform | null = null;
  let bestD = Infinity;
  for (const e of world.query(EnemyAI, Transform)) {
    if (world.has(e, Dead)) continue;
    const t = world.req(e, Transform);
    const d = (t.x - me.x) ** 2 + (t.z - me.z) ** 2;
    if (d < bestD) [best, bestD] = [t, d];
  }
  if (!best) return;
  const dist = Math.sqrt(bestD);
  if (!user.cast && !user.request) user.request = { slot: 0, aimX: best.x, aimZ: best.z, ttl: 0.25 };
  if (dist > 1.5) {
    mover.vx = ((best.x - me.x) / dist) * 5;
    mover.vz = ((best.z - me.z) / dist) * 5;
  }
}

export function buildFixtures(): FixtureSet {
  const seed = 'fixture-sim';
  const zone = ZONES.find((z) => z.id === 'zone.cinder_flats')!;
  const world = new World();
  const ctx = makeCtx({
    rng: new Rng(seed),
    loot: { rng: new Rng(`${seed}-loot`), seq: 0 },
    zoneLevels: zone.levels,
    worldHalfSize: zone.halfSize,
  });
  ctx.zone = createZoneRuntime(zone);
  ctx.zones = new Map([[zone.id, ctx.zone]]);
  ctx.quests = createQuestRuntime();
  spawnArenaProps(world, zone);
  const hub = zone.hubs[0]!;
  const player = spawnPlayer(world, 'bastion', hub.x, hub.z);
  learnSkills(world, player);
  equipStarterKit(world, player, ctx);
  const scheduler = new Scheduler<typeof ctx>()
    .add('spatial', spatialSystem)
    .add('skills', skillSystem)
    .add('navigation', navigationSystem)
    .add('enemyAI', enemyAISystem)
    .add('status', statusSystem)
    .add('movement', movementSystem)
    .add('collision', collisionSystem)
    .add('projectiles', projectileSystem)
    .add('death', deathSystem)
    .add('rewards', rewardSystem)
    .add('pickup', pickupSystem);

  const TICKS = 10800;
  for (let k = 0; k < TICKS; k++) {
    // A fresh handful of enemies every few seconds, so the run keeps fighting.
    if (k % 400 === 0) {
      for (let i = 0; i < 3; i++) spawnEnemy(world, ENEMIES[i % ENEMIES.length]!, hub.x + Math.cos(i * 2.4) * (5 + i), hub.z + Math.sin(i * 2.4) * (5 + i), { level: 1 });
    }
    fighterStep(world, player);
    scheduler.tick(world, 1 / 60, ctx);
    world.flushDestroyed();
    // A player picks the drops up; the bot walks over them.
    if (k % 60 === 59) for (const e of world.query(GroundItem, Transform)) pickUp(world, ctx, player, e);
    world.flushDestroyed();
    // Stay alive: this is a fixture run, not a balance test.
    const life = world.req(player, Health);
    if (life.current < life.max * 0.3) life.current = life.max;
    ctx.tick++;
    ctx.time += 1 / 60;
  }

  const tr = world.req(player, Transform);
  const data = buildSaveData(world, player, ctx, { zoneId: zone.id, name: 'Fixture Vex', position: { x: tr.x, z: tr.z }, facing: tr.facing, savedAt: SAVED_AT });
  const inv = world.req(player, Inventory);

  // The account, as the game fills it: what the run earned, written by saveAccount.
  const account = emptyAccount();
  account.stash = inv.grid.filter((i) => i !== null).slice(0, 4);
  account.endgame.playtime = Math.round(ctx.time);
  account.feats.stats.kills = ctx.stats.kills;
  const storage = new MemoryStorage();
  saveAccount(storage, account);

  return {
    save: serializeSave(data, true),
    account: JSON.stringify(JSON.parse(storage.getItem('ashfall.account')!), null, 2),
    summary: { kills: ctx.stats.kills, level: world.req(player, Progression).level, items: inv.grid.filter((i) => i !== null).length, ticks: ctx.tick },
  };
}

export const FIXTURE_FILES = {
  save: new URL('../../tests/fixtures/save-v8-sim.json', import.meta.url),
  account: new URL('../../tests/fixtures/account-v1-sim.json', import.meta.url),
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const f = buildFixtures();
  writeFileSync(FIXTURE_FILES.save, `${f.save}\n`);
  writeFileSync(FIXTURE_FILES.account, `${f.account}\n`);
  console.log('Wrote fixtures from a run of', f.summary);
}
