/** Projectiles, ground hazards (spore clouds), mines and expiring summons (decoys). */
import { CombatStats, Dead, EnemyAI, Guardian, Hazard, PlayerControlled, Projectile, Resource, SkillUser, Summon, Transform, Trap } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { enemyDef } from '../data/db';
import { applyDamage, applyStatus, gainResource, isAlive, kill, targetState } from './combat';
import { computeTaken } from './damage';
import { hitOne, impactArea, spawnHazards } from './impact';
import { skillOf } from './skills';
import { livingInCircle, nearestOpposing, opposingTeam } from './targeting';
import { hitDestructibles } from '../world/interactables';
import { onEliteHit } from './elites';

const HAZARD_TICK = 1;

export function projectileSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Projectile, Transform)) {
    const p = world.req(e, Projectile);
    const tr = world.req(e, Transform);
    tr.prevX = tr.x;
    tr.prevY = tr.y;
    tr.prevZ = tr.z;
    tr.prevFacing = tr.facing;
    if (p.skill?.homing) steer(world, ctx, p, tr, dt);
    if (p.curveDeg) curveToPlayer(world, p, tr, dt);
    tr.x += p.vx * dt;
    tr.z += p.vz * dt;
    p.remaining -= dt;

    if (p.skill) {
      if (skillProjectile(world, ctx, e, p, tr)) {
        world.destroyDeferred(e);
        continue;
      }
    } else {
      const hit = livingInCircle(world, ctx, tr.x, tr.z, p.radius, opposingTeam(p.team))[0];
      if (hit !== undefined) {
      const taken = computeTaken(p.damage, p.damageType, targetState(world, hit, 'ranged'), p.attackerLevel).final;
      const dealt = applyDamage(world, ctx, hit, taken, { crit: false, damageType: p.damageType, dot: false, sourceTeam: p.team });
      if (dealt !== null && world.isAlive(p.owner)) onEliteHit(world, ctx, p.owner, hit, dealt);
        ctx.events.push({ type: 'vfx', kind: 'boltHit', x: tr.x, z: tr.z, radius: 0.6, facing: tr.facing });
        world.destroyDeferred(e);
        continue;
      }
    }
    if (p.remaining <= 0 || Math.abs(tr.x) > ctx.worldHalfSize + 5 || Math.abs(tr.z) > ctx.worldHalfSize + 5) {
      world.destroyDeferred(e);
    }
  }
}

/**
 * Homing shots turn toward their target, at most `turn` rad/s. A shot without a living target looks
 * for the nearest enemy within `seek` m that lies ahead of it (within 80° of its heading) and that
 * it hasn't already hit.
 */
function steer(world: World, ctx: GameContext, p: Projectile, tr: Transform, dt: number): void {
  const h = p.skill!.homing!;
  const heading = Math.atan2(p.vx, p.vz);
  const ahead = (e: Entity) => {
    const t = world.get(e, Transform);
    if (!t || p.skill!.hit.includes(e)) return false;
    return Math.abs(angleTo(Math.atan2(t.x - tr.x, t.z - tr.z) - heading)) < (80 * Math.PI) / 180;
  };
  if (h.target !== null && (!isAlive(world, h.target) || p.skill!.hit.includes(h.target))) h.target = null;
  h.target ??= nearestOpposing(world, ctx, tr.x, tr.z, h.seek, opposingTeam(p.team), ahead);
  const t = h.target !== null ? world.get(h.target, Transform) : undefined;
  if (!t) return;
  const delta = angleTo(Math.atan2(t.x - tr.x, t.z - tr.z) - heading);
  const a = heading + Math.max(-h.turn * dt, Math.min(h.turn * dt, delta));
  const speed = Math.hypot(p.vx, p.vz);
  p.vx = Math.sin(a) * speed;
  p.vz = Math.cos(a) * speed;
  tr.facing = a;
}

/** Enemy bolts with `curveDeg` bend toward the player, at most that many degrees per second (Shade Drone). */
function curveToPlayer(world: World, p: Projectile, tr: Transform, dt: number): void {
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined || !isAlive(world, player) || p.team !== 'enemy') return;
  const t = world.req(player, Transform);
  const heading = Math.atan2(p.vx, p.vz);
  const delta = angleTo(Math.atan2(t.x - tr.x, t.z - tr.z) - heading);
  const max = ((p.curveDeg ?? 0) * Math.PI * dt) / 180;
  const a = heading + Math.max(-max, Math.min(max, delta));
  const speed = Math.hypot(p.vx, p.vz);
  p.vx = Math.sin(a) * speed;
  p.vz = Math.cos(a) * speed;
  tr.facing = a;
}

/**
 * A Shade Sentinel's shell throws the player's bolts back while it holds: the shot turns into an enemy bolt aimed
 * at whoever fired it (0.4 x the sentinel's damage, so a fan of bolts stings without being a one-shot).
 */
function reflectBolt(world: World, ctx: GameContext, p: Projectile, tr: Transform, sentinel: Entity): void {
  const spec = p.skill!;
  const owner = world.get(p.owner, Transform);
  const dx = (owner?.x ?? tr.x - p.vx) - tr.x;
  const dz = (owner?.z ?? tr.z - p.vz) - tr.z;
  const len = Math.hypot(dx, dz) || 1;
  const speed = Math.hypot(p.vx, p.vz) || 12;
  p.vx = (dx / len) * speed;
  p.vz = (dz / len) * speed;
  p.team = 'enemy';
  p.damage = (world.get(sentinel, CombatStats)?.weaponDamage ?? 20) * 0.4;
  p.damageType = spec.impact.damageType;
  p.attackerLevel = world.get(sentinel, CombatStats)?.level ?? 1;
  p.owner = sentinel;
  p.remaining = Math.max(p.remaining, 1.2);
  delete p.skill;
  tr.facing = Math.atan2(p.vx, p.vz);
  ctx.events.push({ type: 'vfx', kind: 'shield', x: tr.x, z: tr.z, radius: 1.1, facing: 0 });
}

/** Does this enemy's intact shell reflect bolts? */
export function reflectsBolts(world: World, target: Entity): boolean {
  const ai = world.get(target, EnemyAI);
  return !!ai && (ai.shell ?? 0) > 0 && enemyDef(ai.defId).shell?.bolts === true;
}

/** Wrap an angle to (-π, π]. */
const angleTo = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Player skill projectile step. Returns true when it is spent. */
function skillProjectile(world: World, ctx: GameContext, e: Entity, p: Projectile, tr: Transform): boolean {
  const spec = p.skill!;
  if (!world.isAlive(p.owner)) return true;
  // A guardian light's bolts carry its owner's skill modifiers; every other summon's shots use the skill's base data.
  const guardian = world.get(p.owner, Guardian);
  const compiled = skillOf(world.get(guardian ? guardian.owner : p.owner, SkillUser), spec.skillId);
  // Shots that reach an explosive barrel set it off and stop.
  if (p.team === 'player' && hitDestructibles(world, tr.x, tr.z, p.radius, ctx) > 0 && spec.pierce <= 0) return true;
  for (const target of livingInCircle(world, ctx, tr.x, tr.z, p.radius, opposingTeam(p.team))) {
    if (spec.hit.includes(target)) continue;
    if (reflectsBolts(world, target)) {
      reflectBolt(world, ctx, p, tr, target);
      return false;
    }
    spec.hit.push(target);
    if (spec.explodeRadius > 0) {
      impactArea(world, ctx, p.owner, tr.x, tr.z, spec.explodeRadius, null, spec.impact, [], compiled.bonuses);
      ctx.events.push({ type: 'vfx', kind: 'explosion', x: tr.x, z: tr.z, radius: spec.explodeRadius, facing: 0 });
    } else {
      const dealt = hitOne(world, ctx, p.owner, target, tr.x - p.vx * 0.05, tr.z - p.vz * 0.05, spec.impact, [], compiled.bonuses);
      if (dealt !== null && spec.impact.hitstopMs > 0) ctx.events.push({ type: 'hitstop', ms: spec.impact.hitstopMs });
    }
    ctx.events.push({ type: 'vfx', kind: 'shotHit', x: tr.x, z: tr.z, radius: 0.5, facing: tr.facing });
    if (spec.gain > 0) {
      const r = world.get(p.owner, Resource);
      if (r) gainResource(r, spec.gain);
      spec.gain = 0;
    }
    if (spec.hit.length === 1) spawnHazards(world, p.owner, tr.x, tr.z, compiled);
    if (spec.pierce <= 0) return true;
    spec.pierce--;
  }
  return false;
}

/** Mines arm, then blow up when an opposing entity steps within the trigger radius. */
export function trapSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Trap, Transform)) {
    const trap = world.req(e, Trap);
    trap.arming -= dt;
    trap.remaining -= dt;
    if (trap.remaining <= 0 || !world.isAlive(trap.owner)) {
      world.destroyDeferred(e);
      continue;
    }
    if (trap.arming > 0) continue;
    const tr = world.req(e, Transform);
    if (livingInCircle(world, ctx, tr.x, tr.z, trap.triggerRadius, opposingTeam(trap.team)).length === 0) continue;
    const compiled = skillOf(world.get(trap.owner, SkillUser), trap.skillId);
    const effect = compiled.def.effect;
    if (effect.kind === 'trap') {
      impactArea(world, ctx, trap.owner, tr.x, tr.z, trap.radius, null, effect, [], compiled.bonuses);
      spawnHazards(world, trap.owner, tr.x, tr.z, compiled);
    }
    ctx.events.push({ type: 'vfx', kind: 'explosion', x: tr.x, z: tr.z, radius: trap.radius, facing: 0 });
    world.destroyDeferred(e);
  }
}

/** Decoys and other summons: expire after their duration, with an optional burst. */
export function summonSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Summon, Transform)) {
    const summon = world.req(e, Summon);
    summon.remaining -= dt;
    const dead = world.has(e, Dead);
    if (!dead && summon.remaining > 0 && world.isAlive(summon.owner)) continue;
    if (summon.kind === 'decoy') {
      const tr = world.req(e, Transform);
      const compiled = skillOf(world.get(summon.owner, SkillUser), summon.skillId);
      const effect = compiled.def.effect;
      if (effect.kind === 'decoy' && effect.burst && effect.burst.coefficient > 0 && world.has(summon.owner, CombatStats)) {
        impactArea(world, ctx, summon.owner, tr.x, tr.z, effect.burst.radius, null, effect.burst, [], compiled.bonuses);
        ctx.events.push({ type: 'vfx', kind: 'explosion', x: tr.x, z: tr.z, radius: effect.burst.radius, facing: 0 });
      } else {
        ctx.events.push({ type: 'vfx', kind: 'blink', x: tr.x, z: tr.z, radius: 1, facing: 0 });
      }
      world.destroyDeferred(e);
      continue;
    }
    if (!dead && isAlive(world, e)) kill(world, ctx, e, 0);
  }
}

export function hazardSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Hazard, Transform)) {
    const hz = world.req(e, Hazard);
    hz.remaining -= dt;
    if (hz.remaining <= 0) {
      world.destroyDeferred(e);
      continue;
    }
    hz.tickTimer -= dt;
    if (hz.tickTimer > 0) continue;
    hz.tickTimer = HAZARD_TICK;
    const tr = world.req(e, Transform);
    for (const target of livingInCircle(world, ctx, tr.x, tr.z, hz.radius, opposingTeam(hz.team))) {
      if (world.has(target, Dead)) continue;
      if (hz.inner !== undefined) {
        const t = world.req(target, Transform);
        if (Math.hypot(t.x - tr.x, t.z - tr.z) < hz.inner) continue;
      }
      for (const apply of hz.applies) {
        applyStatus(world, ctx, target, apply, { team: hz.team, level: hz.attackerLevel });
      }
    }
  }
}
