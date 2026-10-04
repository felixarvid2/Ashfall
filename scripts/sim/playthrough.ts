/**
 * Level 1→10 playthrough simulator (Phase 4c balance). A simple bot plays the real test-arena waves
 * with every combat system running and enemies fighting back: it moves, kites or closes in, uses a
 * priority rotation, drinks potions, sometimes dodges telegraphed attacks, spends skill points
 * along a build order, picks up loot and equips upgrades. Reports time to each level and deaths.
 */
import {
  Collider,
  Dead,
  EncounterState,
  EnemyAI,
  ForcedMove,
  GroundItem,
  Health,
  Inventory,
  Invulnerable,
  Mover,
  Progression,
  Resource,
  SkillUser,
  StatusEffects,
  Transform,
  makeTransform,
} from '../../src/core/components';
import type { GameContext } from '../../src/core/context';
import { World, type Entity } from '../../src/core/ecs';
import { EventQueue } from '../../src/core/events';
import { Rng } from '../../src/core/rng';
import { SpatialHash } from '../../src/core/spatial';
import { classDef, enemyDef } from '../../src/data/db';
import { PROGRESSION, baseItem } from '../../src/data/loot/db';
import { defaultSettings } from '../../src/data/settings';
import { TEST_ARENA } from '../../src/data/zones/testArena';
import { collisionSystem, spatialSystem } from '../../src/systems/collision';
import { deathSystem } from '../../src/systems/death';
import { encounterSystem } from '../../src/systems/encounter';
import { enemyAISystem } from '../../src/systems/enemyAI';
import { navigationSystem } from '../../src/systems/navigation';
import { canEquip, generateItem, itemPowerFor } from '../../src/systems/loot/generate';
import { addToGrid, equipFromGrid, salvage } from '../../src/systems/loot/inventory';
import { nextItemUid, pickUp, pickupSystem, rewardSystem } from '../../src/systems/loot/rewards';
import { findCorpses, minionSystem, minionsOf, tetherSystem, turretSystem } from '../../src/systems/minions';
import { movementSystem } from '../../src/systems/movement';
import { hazardSystem, projectileSystem, summonSystem, trapSystem } from '../../src/systems/projectiles';
import { resourceSystem } from '../../src/systems/resource';
import { canLearn, learn, tree } from '../../src/systems/skillTree';
import { delayedStrikeSystem, forcedMoveSystem, skillSystem } from '../../src/systems/skills';
import { computePlayerStats, recomputePlayer } from '../../src/systems/stats';
import { statusSystem } from '../../src/systems/status';
import { spawnArenaProps } from '../../src/world/arena';
import { spawnPlayer } from '../../src/world/spawn';

export interface PlayStep {
  skill: string;
  /** Resource thresholds. */
  minResource?: number;
  maxResource?: number;
  /** Use only below this life fraction (defensives). */
  lifeBelow?: number;
  /** Use only with at least this many enemies within 6 m (AoE). */
  minEnemiesNear?: number;
  /** Raise Corpse: only while fewer minions than this. */
  minionsBelow?: number;
  /** Needs a corpse within 8 m of the target. */
  needsCorpse?: boolean;
}

export interface PlayPlan {
  name: string;
  classId: string;
  /** Melee closes in; ranged keeps 5–9 m. */
  style: 'melee' | 'ranged';
  /** Tree nodes in the order points are spent (repeat an id for more ranks). */
  learnOrder: string[];
  rotation: PlayStep[];
}

export interface PlayResult {
  name: string;
  /** Seconds of game time to reach each level (index = level). */
  levelTimes: number[];
  reached: number;
  deaths: number;
  kills: number;
  wave: number;
  potions: number;
  /** Average life fraction while enemies were alive. */
  avgLife: number;
  seconds: number;
  /** Damage taken by type (energy = drone bolts, physical = melee, toxic = spores). */
  taken: Record<string, number>;
  /** Ticks spent casting / moving / standing while enemies were alive, and between waves. */
  activity: { casting: number; moving: number; idle: number; between: number };
}

const SYSTEMS = [
  spatialSystem,
  skillSystem,
  navigationSystem,
  enemyAISystem,
  minionSystem,
  statusSystem,
  movementSystem,
  forcedMoveSystem,
  delayedStrikeSystem,
  collisionSystem,
  projectileSystem,
  trapSystem,
  summonSystem,
  tetherSystem,
  turretSystem,
  hazardSystem,
  resourceSystem,
  deathSystem,
  encounterSystem,
  rewardSystem,
  pickupSystem,
];

const DT = 1 / 60;
const RESPAWN_DELAY = 3;
/** Chance the bot reacts to a telegraphed attack with a dodge (an average player, not a perfect one). */
const DODGE_SKILL = 0.35;

function makeContext(seed: string): GameContext {
  return {
    input: { isDown: () => false, wasPressed: () => false, isMouseDown: () => false, wasMousePressed: () => false },
    settings: defaultSettings(),
    rng: new Rng(seed),
    tick: 0,
    time: 0,
    cameraYaw: 0,
    worldHalfSize: TEST_ARENA.halfSize,
    pickGround: () => null,
    events: new EventQueue(),
    spatial: new SpatialHash(4),
    debug: { godMode: false },
    stats: { kills: 0 },
    loot: { rng: new Rng(seed).fork('loot'), seq: 0 },
    rewards: [],
    zoneLevels: TEST_ARENA.levels,
  };
}

/** Score used to decide whether an item is an upgrade: damage × survivability. */
function gearScore(classId: string, level: number, equipped: Inventory['equipped']): number {
  const s = computePlayerStats(classDef(classId), level, equipped);
  const armor = s.combat.armor;
  return s.damageEstimate * Math.sqrt(s.maxLife * (1 + armor / 200));
}

export function playthrough(plan: PlayPlan, opts: { maxMinutes?: number; targetLevel?: number; seed?: string } = {}): PlayResult {
  const seed = opts.seed ?? 'play';
  const maxTicks = Math.round((opts.maxMinutes ?? 40) * 3600);
  const targetLevel = opts.targetLevel ?? 10;
  const world = new World();
  const ctx = makeContext(seed);
  const botRng = new Rng(`${seed}-bot`);
  spawnArenaProps(world, TEST_ARENA);
  const spawn = TEST_ARENA.playerSpawn;
  const player = spawnPlayer(world, plan.classId, spawn.x, spawn.z);
  const user = world.req(player, SkillUser);
  const prog = world.req(player, Progression);
  const inv = world.req(player, Inventory);
  const t = tree(plan.classId);
  // Like a player, fall back on the starting skill until the build's skills are learned.
  const starter = classDef(plan.classId).actionBar[0]!;
  if (!plan.rotation.some((r) => r.skill === starter)) plan = { ...plan, rotation: [...plan.rotation, { skill: starter }] };

  // Starter kit, as in the game.
  for (const baseId of classDef(plan.classId).starterKit) {
    const item = generateItem(ctx.loot.rng, { itemPower: itemPowerFor(1, ctx.loot.rng), classId: plan.classId, uid: nextItemUid(ctx), rarity: 'common', baseId });
    addToGrid(inv, item);
    equipFromGrid(inv, inv.grid.indexOf(item), plan.classId);
  }
  recomputePlayer(world, player);

  const encounter = world.create();
  world.add(encounter, EncounterState, { encounterId: 'encounter.test_arena', wave: 0, phase: 'intermission', timer: 2.5, alive: 0 });

  reacted.clear();
  Object.assign(nav, { lastX: spawn.x, lastZ: spawn.z, checkTimer: 0, sideTimer: 0, flip: 1 });
  const result: PlayResult = { name: plan.name, levelTimes: [0, 0], reached: 1, deaths: 0, kills: 0, wave: 0, potions: 0, avgLife: 0, seconds: 0, taken: {}, activity: { casting: 0, moving: 0, idle: 0, between: 0 } };
  let deadFor = 0;
  let lifeSum = 0;
  let lifeSamples = 0;
  let lastLevel = 1;

  const spendPoints = () => {
    if (prog.skillPoints <= 0) return;
    // Walk the build order; repeat while points remain and something new became learnable.
    let progress = true;
    while (progress && prog.skillPoints > 0) {
      progress = false;
      const want = new Map<string, number>();
      for (const id of plan.learnOrder) {
        // Listing the starting skill means a rank on top of its free one.
        const n = (want.get(id) ?? (id === t.startingNode ? 1 : 0)) + 1;
        want.set(id, n);
        if ((user.tree.ranks[id] ?? 0) >= n) continue;
        if (!canLearn(t, user.tree, id, prog.skillPoints).ok) continue;
        learn(t, user.tree, id, prog.skillPoints);
        prog.skillPoints--;
        progress = true;
        break;
      }
    }
    recomputePlayer(world, player);
    const bar = plan.rotation.map((r) => r.skill).filter((id) => user.compiled[id]);
    user.slots = [...new Set(bar), null, null, null, null, null, null].slice(0, 6);
  };
  spendPoints();

  const lootAndGear = () => {
    for (const e of world.query(GroundItem, Transform)) pickUp(world, ctx, player, e);
    world.flushDestroyed();
    let changed = false;
    for (let i = 0; i < inv.grid.length; i++) {
      const item = inv.grid[i];
      if (!item) continue;
      const base = baseItem(item.base);
      if (item.crystal || !canEquip(base, plan.classId)) {
        salvage(inv, i);
        continue;
      }
      const before = gearScore(plan.classId, prog.level, inv.equipped);
      const copy = { ...inv.equipped };
      const slotKey = base.type === 'ring' ? (inv.equipped.ring1 ? (inv.equipped.ring2 ? 'ring1' : 'ring2') : 'ring1') : base.type === 'weapon' ? 'mainHand' : base.type;
      (copy as Record<string, unknown>)[slotKey] = item;
      if (gearScore(plan.classId, prog.level, copy) > before * 1.001) {
        if (equipFromGrid(inv, i, plan.classId).ok) changed = true;
      } else {
        salvage(inv, i);
      }
    }
    if (changed) recomputePlayer(world, player);
  };

  for (let tick = 0; tick < maxTicks; tick++) {
    const life = world.req(player, Health);
    const tr = world.req(player, Transform);

    if (world.has(player, Dead)) {
      deadFor += DT;
      if (deadFor >= RESPAWN_DELAY) {
        deadFor = 0;
        result.deaths++;
        world.remove(player, Dead);
        world.remove(player, ForcedMove);
        life.current = life.max;
        const r = world.req(player, Resource);
        r.current = r.config.start;
        r.atMaxFor = 0;
        world.req(player, StatusEffects).list = [];
        user.cast = null;
        user.request = null;
        Object.assign(tr, makeTransform(spawn.x, 0, spawn.z, Math.PI));
        world.add(player, Invulnerable, { remaining: 2 });
      }
    } else {
      bot(world, ctx, player, plan, botRng, result);
    }

    for (const s of SYSTEMS) s(world, DT, ctx);
    world.flushDestroyed();
    for (const ev of ctx.events.drain()) {
      if (ev.type === 'damage' && ev.toPlayer && ev.target === player) {
        const k = `${ev.damageType}${ev.dot ? '-dot' : ''}`;
        result.taken[k] = (result.taken[k] ?? 0) + ev.amount;
      }
    }
    ctx.tick++;
    ctx.time += DT;

    // Bookkeeping
    const enemiesAlive = world.query(EnemyAI).some((e) => !world.has(e, Dead));
    if (enemiesAlive && !world.has(player, Dead)) {
      lifeSum += life.current / life.max;
      lifeSamples++;
      if (user.cast) result.activity.casting++;
      else if (Math.hypot(world.req(player, Mover).vx, world.req(player, Mover).vz) > 0.1) result.activity.moving++;
      else result.activity.idle++;
    } else result.activity.between++;
    if (prog.level !== lastLevel) {
      for (let l = lastLevel + 1; l <= prog.level; l++) result.levelTimes[l] = ctx.time;
      lastLevel = prog.level;
      spendPoints();
    }
    if (tick % 60 === 0) lootAndGear();
    if (process.env.PLAY_TRACE && tick % 600 === 0) {
      const enc = world.req(encounter, EncounterState);
      const alive = world.query(EnemyAI).filter((e) => !world.has(e, Dead));
      const near = alive.map((e) => world.req(e, Transform)).map((p) => Math.round(Math.hypot(p.x - tr.x, p.z - tr.z))).sort((a, b) => a - b).slice(0, 4);
      console.log(`t=${Math.round(ctx.time)} lvl=${prog.level} xp=${Math.round(prog.xp)} wave=${enc.wave} ${enc.phase} alive=${alive.length} near=${near} life=${Math.round(life.current)}/${life.max} pos=${tr.x.toFixed(1)},${tr.z.toFixed(1)} res=${Math.round(world.req(player, Resource).current)} cast=${user.cast?.skillId ?? '-'} slots=${user.slots.filter(Boolean).length} deaths=${result.deaths}`);
    }
    if (prog.level >= targetLevel) break;
  }
  result.reached = prog.level;
  result.kills = ctx.stats.kills;
  result.wave = world.req(encounter, EncounterState).wave;
  result.avgLife = lifeSamples > 0 ? lifeSum / lifeSamples : 1;
  result.seconds = ctx.time;
  return result;
}

/** One tick of decisions: potion, dodge, movement and skill choice. */
function bot(world: World, ctx: GameContext, player: Entity, plan: PlayPlan, rng: Rng, result: PlayResult): void {
  const tr = world.req(player, Transform);
  const mover = world.req(player, Mover);
  const user = world.req(player, SkillUser);
  const life = world.req(player, Health);
  const resource = world.req(player, Resource);
  mover.vx = mover.vz = 0;

  if (life.current < life.max * 0.4 && user.potionCharges > 0 && !user.potionRequested) {
    user.potionRequested = true;
    result.potions++;
  }

  // Nearest enemy and how crowded it is around us.
  let target: Entity | null = null;
  let best = Infinity;
  let near = 0;
  for (const e of world.query(EnemyAI, Transform)) {
    if (world.has(e, Dead)) continue;
    const et = world.req(e, Transform);
    const d = Math.hypot(et.x - tr.x, et.z - tr.z);
    if (d < 6) near++;
    // Ranged builds shoot the fragile ranged enemies first (as a player would).
    // Melee builds take drones that come close (they are worth chasing a few steps).
    const isShooter = enemyDef(world.req(e, EnemyAI).defId).behavior === 'ranged';
    const ranged = isShooter && (plan.style === 'ranged' ? d < 14 : d < 7);
    const score = ranged ? d - 8 : d;
    if (score < best) {
      best = score;
      target = e;
    }
    // React to a telegraphed attack aimed at us (once per wind-up, with some chance).
    const ai = world.req(e, EnemyAI);
    if (ai.state === 'windup' && ai.timer < 0.25 && user.dodgeCooldown <= 0 && d < 9) {
      const key = `${e}:${ai.attackSeq}`;
      if (!reacted.has(key)) {
        reacted.add(key);
        if (rng.chance(DODGE_SKILL)) {
          const ax = tr.x - et.x;
          const az = tr.z - et.z;
          const len = Math.hypot(ax, az) || 1;
          // Sidestep across the attack line.
          user.dodgeRequested = { x: -az / len, z: ax / len };
        }
      }
    }
  }
  if (target === null) {
    // Between waves: drift back toward the middle.
    if (Math.hypot(tr.x, tr.z) > 6) {
      const len = Math.hypot(tr.x, tr.z);
      mover.vx = (-tr.x / len) * mover.speed;
      mover.vz = (-tr.z / len) * mover.speed;
    }
    return;
  }
  const tt = world.req(target, Transform);
  const dx = tt.x - tr.x;
  const dz = tt.z - tr.z;
  const dist = Math.hypot(dx, dz) || 1;
  const targetRadius = world.get(target, Collider)?.radius ?? 0.4;

  // Skill choice
  if (!user.cast && !user.request && !world.has(player, ForcedMove)) {
    for (const step of plan.rotation) {
      const c = user.compiled[step.skill];
      if (!c) continue;
      const slot = user.slots.indexOf(step.skill);
      if (slot < 0 || (user.cooldowns[step.skill] ?? 0) > 0) continue;
      if (resource.current < c.def.resourceCost) continue;
      if (step.minResource !== undefined && resource.current < step.minResource) continue;
      if (step.maxResource !== undefined && resource.current > step.maxResource) continue;
      if (step.lifeBelow !== undefined && life.current / life.max >= step.lifeBelow) continue;
      if (step.minEnemiesNear !== undefined && near < step.minEnemiesNear) continue;
      if (step.minionsBelow !== undefined && minionsOf(world, player).length >= step.minionsBelow) continue;
      if (step.needsCorpse && findCorpses(world, tt.x, tt.z, 8, 1).length === 0) continue;
      if (dist - targetRadius > reach(c.def.effect)) continue;
      const corpse = step.needsCorpse ? findCorpses(world, tt.x, tt.z, 8, 1)[0] : undefined;
      const aim = corpse !== undefined ? world.req(corpse, Transform) : tt;
      user.request = { slot, aimX: aim.x, aimZ: aim.z, ttl: 0.25 };
      break;
    }
  }

  // Movement
  if (user.cast) return;
  const speed = mover.speed;
  if (plan.style === 'melee') {
    if (dist - targetRadius > 1.2) {
      mover.vx = (dx / dist) * speed;
      mover.vz = (dz / dist) * speed;
    }
  } else if (dist < 5) {
    // Kite: back away, sliding sideways a little so we don't pin ourselves to a wall.
    const side = Math.sin(ctx.time * 0.7) > 0 ? 1 : -1;
    const vx = -dx / dist + (-dz / dist) * 0.5 * side;
    const vz = -dz / dist + (dx / dist) * 0.5 * side;
    const len = Math.hypot(vx, vz) || 1;
    mover.vx = (vx / len) * speed;
    mover.vz = (vz / len) * speed;
    // Don't back into the arena edge forever.
    const lim = ctx.worldHalfSize - 3;
    if (Math.abs(tr.x) > lim || Math.abs(tr.z) > lim) {
      mover.vx = (-tr.x / (Math.hypot(tr.x, tr.z) || 1)) * speed;
      mover.vz = (-tr.z / (Math.hypot(tr.x, tr.z) || 1)) * speed;
    }
  } else if (dist > 9) {
    mover.vx = (dx / dist) * speed;
    mover.vz = (dz / dist) * speed;
  }
  unstick(tr, mover, DT);
}

const reacted = new Set<string>();

/** Per-bot memory for getting unstuck from props. */
const nav = { lastX: 0, lastZ: 0, checkTimer: 0, sideTimer: 0, sideX: 0, sideZ: 0, flip: 1 };

/**
 * Props block walking but drones float over them, so a bot pushing straight at a target can pin
 * itself against a crate. If we wanted to move but barely did, walk sideways for a moment.
 */
function unstick(tr: Transform, mover: Mover, dt: number): void {
  if (nav.sideTimer > 0) {
    nav.sideTimer -= dt;
    mover.vx = nav.sideX * mover.speed;
    mover.vz = nav.sideZ * mover.speed;
    return;
  }
  nav.checkTimer += dt;
  if (nav.checkTimer < 0.6) return;
  const moved = Math.hypot(tr.x - nav.lastX, tr.z - nav.lastZ);
  const wanted = Math.hypot(mover.vx, mover.vz) > 0.1;
  nav.checkTimer = 0;
  nav.lastX = tr.x;
  nav.lastZ = tr.z;
  if (wanted && moved < 0.6) {
    const len = Math.hypot(mover.vx, mover.vz) || 1;
    nav.flip = -nav.flip;
    nav.sideX = (-mover.vz / len) * nav.flip;
    nav.sideZ = (mover.vx / len) * nav.flip;
    nav.sideTimer = 0.8;
  }
}

/** How close the target must be for a skill to be worth casting. */
function reach(effect: import('../../src/data/schemas').SkillEffect): number {
  switch (effect.kind) {
    case 'meleeArc':
      return effect.range - 0.4;
    case 'nova':
    case 'vent':
      return effect.radius;
    case 'leap':
      return effect.maxRange;
    case 'projectile':
      return effect.maxRange * 0.9;
    case 'selfBuff':
    case 'blink':
      return 99;
    case 'decoy':
    case 'turret':
      return 10;
    case 'raise':
    case 'corpseBurst':
    case 'cloud':
    case 'cursorBurst':
    case 'grenade':
    case 'trap':
    case 'tether':
      return effect.maxRange;
    case 'orbital':
      return effect.range;
  }
}
