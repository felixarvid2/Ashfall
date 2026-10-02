/**
 * Xenomant: corpses, raised minions, draining tethers and the Wrath of Lumen summon.
 * Minions reuse the dead enemy's own entity and model, re-teamed and glowing Lumen green.
 */
import {
  CombatStats,
  Dead,
  EnemyAI,
  Faction,
  Health,
  MinionAI,
  Mover,
  Projectile,
  Renderable,
  StatusEffects,
  Summon,
  Tether,
  Transform,
  Turret,
  WaveMember,
  makeTransform,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { enemyDef } from '../data/db';
import type { SkillDef } from '../data/schemas';
import { dealHit, isAlive, kill } from './combat';
import { hitOne, impactArea } from './impact';
import { angleDelta } from './movement';
import { skillOf } from './skills';
import { livingInCircle } from './targeting';
import { SkillUser } from '../core/components';

/** Glow colour of raised minions. */
export const MINION_GLOW = '#6bff7a';
/** Minions further than this from their owner teleport back. */
const LEASH = 18;
/** Minions look for enemies within this distance of their owner. */
const GUARD_RADIUS = 10;

/** Up to `max` unused corpses within `radius` of a point, nearest first. */
export function findCorpses(world: World, x: number, z: number, radius: number, max: number): Entity[] {
  const found: { e: Entity; d: number }[] = [];
  for (const e of world.query(Dead, Transform)) {
    if (!world.req(e, Dead).corpse) continue;
    const tr = world.req(e, Transform);
    const d = Math.hypot(tr.x - x, tr.z - z);
    if (d <= radius) found.push({ e, d });
  }
  return found.sort((a, b) => a.d - b.d).slice(0, max).map((f) => f.e);
}

/** Use up a corpse: it sinks away quickly. */
export function consumeCorpse(world: World, e: Entity): void {
  const dead = world.get(e, Dead);
  if (!dead) return;
  dead.corpse = false;
  dead.removeAfter = Math.min(dead.removeAfter, dead.elapsed + 0.4);
}

export function minionsOf(world: World, owner: Entity): Entity[] {
  return world.query(MinionAI).filter((e) => world.req(e, MinionAI).owner === owner && !world.has(e, Dead));
}

/** Turn a corpse into a minion for `owner`. */
export function raiseCorpse(world: World, ctx: GameContext, corpse: Entity, owner: Entity, def: SkillDef): Entity | null {
  const effect = def.effect;
  if (effect.kind !== 'raise' || !world.has(corpse, Dead)) return null;
  const ai = world.get(corpse, EnemyAI);
  const source = ai ? enemyDef(ai.defId) : null;
  const ownerLife = world.get(owner, Health)?.max ?? 100;
  const ownerStats = world.get(owner, CombatStats);
  const ownerSpeed = world.get(owner, Mover)?.speed ?? 5.5;

  world.remove(corpse, Dead);
  world.remove(corpse, EnemyAI);
  world.remove(corpse, WaveMember);
  world.add(corpse, Faction, { team: 'player' });
  const life = ownerLife * effect.lifeFraction;
  world.add(corpse, Health, { current: life, max: life });
  const effects = world.get(corpse, StatusEffects);
  if (effects) effects.list = [];
  const stats = world.get(corpse, CombatStats);
  if (stats) {
    stats.armor = (ownerStats?.armor ?? 0) * 0.5;
    stats.resist = {};
    stats.tags = [];
  }
  const mover = world.get(corpse, Mover);
  if (mover) mover.speed = Math.max(mover.speed, ownerSpeed * 1.05);
  const r = world.get(corpse, Renderable);
  if (r) r.glow = MINION_GLOW;
  const ranged = source?.behavior === 'ranged';
  world.add(corpse, MinionAI, {
    owner,
    state: 'follow',
    timer: 0,
    cooldown: 0.4,
    attackCooldown: effect.attackCooldown,
    attackRange: ranged ? 8 : 1.5,
    windup: ranged ? 0.4 : 0.3,
    coefficient: effect.coefficient,
    damageType: effect.damageType,
    ranged,
    applies: effect.applies.map((a) => ({ status: a.status, duration: a.duration, ...(a.coefficient !== undefined ? { coefficient: a.coefficient } : {}) })),
    target: null,
    attackSeq: 0,
    born: ctx.tick,
  });
  world.add(corpse, Summon, { owner, remaining: Infinity, skillId: def.id, kind: 'minion' });
  const tr = world.req(corpse, Transform);
  ctx.events.push({ type: 'vfx', kind: 'raise', x: tr.x, z: tr.z, radius: 1.2, facing: 0 });
  return corpse;
}

/** Copy the owner's offence onto a minion so it scales with gear, level and passives. */
function syncStats(world: World, minion: Entity, owner: Entity): void {
  const o = world.get(owner, CombatStats);
  const m = world.get(minion, CombatStats);
  if (!o || !m) return;
  m.level = o.level;
  m.weaponDamage = o.weaponDamage;
  m.mainStat = o.mainStat;
  m.critChance = o.critChance;
  m.critDamage = o.critDamage;
  m.additive = o.additive;
  m.multiplicative = o.multiplicative;
  m.attackSpeed = o.attackSpeed;
}

export function minionSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(MinionAI, Transform, Mover)) {
    if (world.has(e, Dead)) continue;
    const ai = world.req(e, MinionAI);
    if (!world.isAlive(ai.owner) || world.has(ai.owner, Dead)) {
      kill(world, ctx, e, 0);
      continue;
    }
    syncStats(world, e, ai.owner);
    const tr = world.req(e, Transform);
    const otr = world.req(ai.owner, Transform);
    const mover = world.req(e, Mover);
    mover.vx = mover.vz = 0;
    ai.cooldown = Math.max(0, ai.cooldown - dt);
    if (!(world.get(e, StatusEffects)?.canAct ?? true)) continue;

    const toOwner = Math.hypot(otr.x - tr.x, otr.z - tr.z);
    if (toOwner > LEASH) {
      const a = ctx.rng.range(0, Math.PI * 2);
      tr.x = tr.prevX = otr.x + Math.sin(a) * 1.5;
      tr.z = tr.prevZ = otr.z + Math.cos(a) * 1.5;
      ai.state = 'follow';
      continue;
    }

    if (ai.state === 'windup') {
      ai.timer -= dt;
      if (ai.target !== null && isAlive(world, ai.target)) face(tr, world.req(ai.target, Transform));
      if (ai.timer <= 0) {
        if (ai.target !== null && isAlive(world, ai.target)) attack(world, ctx, e, ai, tr, ai.target);
        ai.state = 'recover';
        ai.timer = 0.3;
        ai.cooldown = ai.attackCooldown;
      }
      continue;
    }
    if (ai.state === 'recover') {
      ai.timer -= dt;
      if (ai.timer <= 0) ai.state = 'follow';
      continue;
    }

    // Guard the owner: fight the nearest enemy close to them, otherwise follow.
    let target: Entity | null = null;
    let best = Infinity;
    for (const enemy of livingInCircle(world, ctx, otr.x, otr.z, GUARD_RADIUS, 'enemy')) {
      const et = world.req(enemy, Transform);
      const d = Math.hypot(et.x - tr.x, et.z - tr.z);
      if (d < best) {
        best = d;
        target = enemy;
      }
    }
    ai.target = target;
    if (target !== null) {
      const et = world.req(target, Transform);
      const reach = ai.attackRange + 0.5;
      face(tr, et);
      if (best <= reach && ai.cooldown <= 0) {
        ai.state = 'windup';
        ai.timer = ai.windup;
        ai.attackSeq++;
      } else if (best > ai.attackRange * 0.8) {
        steer(mover, et.x - tr.x, et.z - tr.z);
      }
      continue;
    }
    if (toOwner > 3) {
      steer(mover, otr.x - tr.x, otr.z - tr.z);
      face(tr, otr);
    }
  }
}

function attack(world: World, ctx: GameContext, e: Entity, ai: MinionAI, tr: Transform, target: Entity): void {
  const tt = world.req(target, Transform);
  if (!ai.ranged) {
    if (Math.hypot(tt.x - tr.x, tt.z - tr.z) > ai.attackRange + 1.2) return;
    dealHit(world, ctx, e, target, {
      coefficient: ai.coefficient,
      damageType: ai.damageType,
      knockback: 0.3,
      fromX: tr.x,
      fromZ: tr.z,
      applies: ai.applies,
      range: 'melee',
    });
    ctx.events.push({ type: 'vfx', kind: 'minionSlash', x: tr.x, z: tr.z, radius: 1.4, facing: tr.facing, arcDeg: 90 });
    return;
  }
  const dx = tt.x - tr.x;
  const dz = tt.z - tr.z;
  const len = Math.hypot(dx, dz) || 1;
  const speed = 18;
  const p = world.create();
  world.add(p, Transform, makeTransform(tr.x + (dx / len) * 0.5, Math.max(1, tr.y), tr.z + (dz / len) * 0.5, Math.atan2(dx, dz)));
  world.add(p, Projectile, {
    team: 'player',
    vx: (dx / len) * speed,
    vz: (dz / len) * speed,
    radius: 0.3,
    remaining: 12 / speed,
    damage: 0,
    damageType: ai.damageType,
    attackerLevel: world.get(e, CombatStats)?.level ?? 1,
    owner: e,
    skill: {
      skillId: world.req(e, Summon).skillId,
      impact: {
        coefficient: ai.coefficient,
        damageType: ai.damageType,
        knockback: 0,
        applies: ai.applies,
        hitstopMs: 0,
        shake: 0,
        delivery: 'ranged',
        lifeSteal: 0,
      },
      pierce: 0,
      explodeRadius: 0,
      gain: 0,
      hit: [],
      color: MINION_GLOW,
    },
  });
}

/** Parasite Link: drains each tethered target on an interval, healing the owner (impact.lifeSteal). */
export function tetherSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Tether)) {
    const t = world.req(e, Tether);
    t.remaining -= dt;
    if (t.remaining <= 0 || !isAlive(world, t.target) || !isAlive(world, t.owner)) {
      world.destroyDeferred(e);
      continue;
    }
    const otr = world.req(t.owner, Transform);
    const ttr = world.req(t.target, Transform);
    if (Math.hypot(ttr.x - otr.x, ttr.z - otr.z) > t.maxRange + 3) {
      world.destroyDeferred(e);
      continue;
    }
    t.tickTimer -= dt;
    if (t.tickTimer > 0) continue;
    t.tickTimer = t.interval;
    const compiled = skillOf(world.get(t.owner, SkillUser), t.skillId);
    const effect = compiled.def.effect;
    if (effect.kind !== 'tether') continue;
    hitOne(world, ctx, t.owner, t.target, otr.x, otr.z, effect, [], compiled.bonuses);
  }
}

/** Wrath of Lumen: slams the area around itself on an interval, using the owner's stats. */
export function turretSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Turret, Transform)) {
    if (world.has(e, Dead)) continue;
    const turret = world.req(e, Turret);
    if (!world.isAlive(turret.owner)) continue;
    turret.timer -= dt;
    if (turret.timer > 0) continue;
    turret.timer = turret.interval;
    const compiled = skillOf(world.get(turret.owner, SkillUser), turret.skillId);
    const effect = compiled.def.effect;
    if (effect.kind !== 'turret') continue;
    const tr = world.req(e, Transform);
    impactArea(world, ctx, turret.owner, tr.x, tr.z, effect.slam.radius, null, effect.slam, [], compiled.bonuses);
    turret.slamSeq++;
    ctx.events.push({ type: 'vfx', kind: 'slam', x: tr.x, z: tr.z, radius: effect.slam.radius, facing: 0 });
  }
}

function face(tr: Transform, to: { x: number; z: number }): void {
  const dx = to.x - tr.x;
  const dz = to.z - tr.z;
  if (dx * dx + dz * dz < 1e-6) return;
  const desired = Math.atan2(dx, dz);
  tr.facing = angleDelta(0, tr.facing + angleDelta(tr.facing, desired) * 0.35);
}

function steer(mover: Mover, dx: number, dz: number): void {
  const d = Math.hypot(dx, dz) || 1;
  mover.vx = (dx / d) * mover.speed;
  mover.vz = (dz / d) * mover.speed;
}
