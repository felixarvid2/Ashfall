/**
 * Headless balance simulator: a build fights a stationary training dummy with the real
 * combat systems for a fixed time, using a simple priority rotation. Reports DPS.
 */
import { Collider, ForcedMove, Health, Inventory, Progression, Resource, SkillUser, Transform } from '../../src/core/components';
import type { GameContext } from '../../src/core/context';
import { World } from '../../src/core/ecs';
import { EventQueue } from '../../src/core/events';
import { Rng } from '../../src/core/rng';
import { SpatialHash } from '../../src/core/spatial';
import { PROGRESSION, UNIQUE_DEFS, baseItem } from '../../src/data/loot/db';
import { slotsFor, type Slot } from '../../src/data/loot/schemas';
import { defaultSettings } from '../../src/data/settings';
import { collisionSystem, spatialSystem } from '../../src/systems/collision';
import { generateItem, generateUnique } from '../../src/systems/loot/generate';
import { movementSystem } from '../../src/systems/movement';
import { hazardSystem } from '../../src/systems/projectiles';
import { resourceSystem } from '../../src/systems/resource';
import { delayedStrikeSystem, forcedMoveSystem, skillSystem } from '../../src/systems/skills';
import { recomputePlayer } from '../../src/systems/stats';
import { statusSystem } from '../../src/systems/status';
import { spawnEnemy, spawnPlayer } from '../../src/world/spawn';

export interface RotationEntry {
  skill: string;
  /** Only use when Heat is at least this (spenders, vents). */
  minHeat?: number;
  /** Only use when Heat is at most this (coolant). */
  maxHeat?: number;
}

export interface Build {
  name: string;
  level: number;
  /** Tree ranks (the starting skill is added automatically). */
  nodes: Record<string, number>;
  /** Highest priority first; the action bar is filled from this list. */
  rotation: RotationEntry[];
  /** Unique items to equip by id; a rare weapon of the right item power is always equipped. */
  uniques?: string[];
  /** Legendary aspects as [item slot, aspect id, value]. */
  aspects?: [Slot, string, number][];
}

export interface SimResult {
  name: string;
  dps: number;
  casts: Record<string, number>;
  /** Share of the fight spent overheating. */
  overheated: number;
  avgHeat: number;
}

const SYSTEMS = [
  spatialSystem,
  skillSystem,
  statusSystem,
  movementSystem,
  forcedMoveSystem,
  delayedStrikeSystem,
  collisionSystem,
  hazardSystem,
  resourceSystem,
];

function makeContext(seed: string): GameContext {
  return {
    input: { isDown: () => false, wasPressed: () => false, isMouseDown: () => false, wasMousePressed: () => false },
    settings: defaultSettings(),
    rng: new Rng(seed),
    tick: 0,
    time: 0,
    cameraYaw: 0,
    worldHalfSize: 60,
    pickGround: () => null,
    events: new EventQueue(),
    spatial: new SpatialHash(4),
    debug: { godMode: true },
    stats: { kills: 0 },
    loot: { rng: new Rng(`${seed}-loot`), seq: 0 },
    rewards: [],
    zoneLevels: [1, 50],
  };
}

export function simulate(build: Build, seconds = 60, seed = 'sim'): SimResult {
  const world = new World();
  const ctx = makeContext(seed);
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const user = world.req(player, SkillUser);
  world.req(player, Progression).level = build.level;
  Object.assign(user.tree.ranks, build.nodes);
  const bar = build.rotation.map((r) => r.skill).slice(0, 6);
  user.slots = [...bar, null, null, null, null, null, null].slice(0, 6);

  // Gear: a rare weapon at the build's item power, plus requested uniques/aspects.
  const rng = new Rng(`${seed}-gear`);
  const itemPower = Math.round(PROGRESSION.itemPower.base + PROGRESSION.itemPower.perLevel * build.level);
  const inv = world.req(player, Inventory);
  inv.equipped.mainHand = generateItem(rng, { itemPower, classId: 'bastion', uid: 'w', rarity: 'rare', type: 'weapon' });
  for (const id of build.uniques ?? []) {
    const def = UNIQUE_DEFS.get(id);
    if (!def) throw new Error(`Unknown unique ${id}`);
    const item = generateUnique(rng, def, itemPower, id);
    const slot = slotsFor(baseItem(def.base).type)[0];
    if (slot) inv.equipped[slot] = item;
  }
  for (const [slot, id, value] of build.aspects ?? []) {
    const item = inv.equipped[slot] ?? generateItem(rng, { itemPower, classId: 'bastion', uid: `a-${slot}`, rarity: 'rare', baseId: BASE_FOR_SLOT[slot] });
    item.aspect = { id, value };
    item.rarity = 'legendary';
    inv.equipped[slot] = item;
  }
  recomputePlayer(world, player);
  for (const id of bar) if (!user.compiled[id]) throw new Error(`${build.name}: ${id} is not learned`);

  const dummy = spawnEnemy(world, 'spore_carrier', 0, 1.9, { level: build.level });
  const life = world.req(dummy, Health);
  life.max = life.current = 1e12;
  world.req(dummy, Collider).mass = 1e9;

  const casts: Record<string, number> = {};
  const resource = world.req(player, Resource);
  let overheatedTicks = 0;
  let heatSum = 0;
  const ticks = Math.round(seconds * 60);
  for (let i = 0; i < ticks; i++) {
    // Stay next to the dummy (leaps and knockback would otherwise drift us apart).
    const tr = world.req(player, Transform);
    if (!world.has(player, ForcedMove) && !user.cast) {
      tr.x = 0;
      tr.z = 0;
    }
    const dtr = world.req(dummy, Transform);
    dtr.x = 0;
    dtr.z = 1.9;
    if (!user.cast && !user.request && !world.has(player, ForcedMove)) {
      const pick = build.rotation.find((r) => {
        const c = user.compiled[r.skill];
        if (!c) return false;
        if ((user.cooldowns[r.skill] ?? 0) > 0) return false;
        if (resource.current < c.def.resourceCost) return false;
        if (r.minHeat !== undefined && resource.current < r.minHeat) return false;
        if (r.maxHeat !== undefined && resource.current > r.maxHeat) return false;
        return true;
      });
      if (pick) {
        user.request = { slot: bar.indexOf(pick.skill), aimX: 0, aimZ: 1.9, ttl: 0.25 };
        casts[pick.skill] = (casts[pick.skill] ?? 0) + 1;
      }
    }
    for (const s of SYSTEMS) s(world, 1 / 60, ctx);
    world.flushDestroyed();
    ctx.events.drain();
    ctx.tick++;
    ctx.time += 1 / 60;
    if (resource.config.overheat && resource.atMaxFor >= resource.config.overheat.grace) overheatedTicks++;
    heatSum += resource.current;
  }
  return {
    name: build.name,
    dps: (1e12 - life.current) / seconds,
    casts,
    overheated: overheatedTicks / ticks,
    avgHeat: heatSum / ticks,
  };
}

const BASE_FOR_SLOT: Partial<Record<Slot, string>> = {
  chest: 'plated_vest',
  boots: 'mag_boots',
  gloves: 'servo_gauntlets',
  helm: 'combat_helm',
  ring1: 'conduit_ring',
  mainHand: 'hydraulic_hammer',
  amulet: 'signal_pendant',
};
