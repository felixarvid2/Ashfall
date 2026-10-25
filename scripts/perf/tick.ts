/**
 * Simulation tick cost per system (docs/improvements/tech.md T019).
 *
 *   npm run perf:tick -- hydroponic_vaults            ms/tick per system for one zone
 *   npm run perf:tick -- all                          every open-world zone
 *   node --expose-gc --import tsx scripts/perf/tick.ts hydroponic_vaults    adds heap bytes per tick
 *
 * Spawns the zone's props, 120 enemies round the first hub and the player, then runs the core systems
 * through a profiling Scheduler. Timings are wall time on whatever machine runs it: compare runs on the
 * same machine, not against a phone.
 */
import { pathToFileURL } from 'node:url';
import { Collider } from '../../src/core/components';
import { Scheduler, World } from '../../src/core/ecs';
import { ZONES } from '../../src/data/zones';
import { makeCtx } from '../../tests/helpers';
import { spawnArenaProps } from '../../src/world/arena';
import { spawnEnemy, spawnPlayer } from '../../src/world/spawn';
import { createZoneRuntime } from '../../src/world/zone';
import { collisionSystem, spatialSystem } from '../../src/systems/collision';
import { deathSystem } from '../../src/systems/death';
import { enemyAISystem } from '../../src/systems/enemyAI';
import { movementSystem } from '../../src/systems/movement';
import { navigationSystem } from '../../src/systems/navigation';
import { projectileSystem } from '../../src/systems/projectiles';
import { skillSystem } from '../../src/systems/skills';
import { statusSystem } from '../../src/systems/status';

export interface TickBenchOptions {
  enemies?: number;
  ticks?: number;
  warmup?: number;
}

export interface TickBenchResult {
  zone: string;
  entities: number;
  colliders: number;
  /** ms per tick, by system, in run order. */
  perSystem: Record<string, number>;
  totalMs: number;
  /** Heap bytes allocated per tick; null unless node ran with --expose-gc. */
  heapPerTick: number | null;
}

const ENEMY_MIX = ['infected_colonist', 'security_drone', 'bloater', 'spore_hound'];

export function openZoneIds(): string[] {
  return ZONES.filter((z) => z.id !== 'zone.test_arena').map((z) => z.id.replace(/^zone\./, ''));
}

export function runTickBench(zoneName: string, opts: TickBenchOptions = {}): TickBenchResult {
  const id = zoneName.startsWith('zone.') ? zoneName : `zone.${zoneName}`;
  const zone = ZONES.find((z) => z.id === id);
  if (!zone) throw new Error(`Unknown zone "${zoneName}". Zones: ${openZoneIds().join(', ')}`);
  const enemies = opts.enemies ?? 120;
  const ticks = opts.ticks ?? 600;
  const warmup = opts.warmup ?? 60;

  const world = new World();
  spawnArenaProps(world, zone);
  const ctx = makeCtx();
  ctx.zone = createZoneRuntime(zone);
  ctx.worldHalfSize = zone.halfSize;
  const hub = zone.hubs[0]!;
  spawnPlayer(world, 'bastion', hub.x, hub.z);
  for (let i = 0; i < enemies; i++) {
    const r = 8 + (i % 30);
    spawnEnemy(world, ENEMY_MIX[i % ENEMY_MIX.length]!, hub.x + Math.cos(i * 2.4) * r, hub.z + Math.sin(i * 2.4) * r, { level: 10 });
  }

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
  const step = (): void => {
    scheduler.tick(world, 1 / 60, ctx);
    ctx.tick++;
    ctx.time += 1 / 60;
  };

  for (let k = 0; k < warmup; k++) step();
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  const heap0 = process.memoryUsage().heapUsed;
  scheduler.profile = true;
  scheduler.resetTimes();
  for (let k = 0; k < ticks; k++) step();
  scheduler.profile = false;
  const heapPerTick = gc ? (process.memoryUsage().heapUsed - heap0) / ticks : null;

  const perSystem: Record<string, number> = {};
  let totalMs = 0;
  for (const [name, ms] of scheduler.times) {
    perSystem[name] = ms / ticks;
    totalMs += ms / ticks;
  }
  return {
    zone: zone.id,
    entities: world.entityCount,
    colliders: world.query(Collider).length,
    perSystem,
    totalMs,
    heapPerTick,
  };
}

function print(r: TickBenchResult): void {
  console.log(`${r.zone}: ${r.entities} entities, ${r.colliders} colliders`);
  for (const [name, ms] of Object.entries(r.perSystem)) console.log(`  ${name.padEnd(12)} ${ms.toFixed(3)} ms/tick`);
  console.log(`  ${'total'.padEnd(12)} ${r.totalMs.toFixed(3)} ms/tick (budget at 60 Hz: 16.7)`);
  if (r.heapPerTick !== null) console.log(`  heap         ${Math.round(r.heapPerTick)} bytes/tick`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2] ?? 'hydroponic_vaults';
  try {
    for (const name of arg === 'all' ? openZoneIds() : [arg]) print(runTickBench(name));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
