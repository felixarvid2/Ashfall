/** Projectiles, ground hazards (spore clouds), mines and expiring summons (decoys). */
import { Dead, Hazard, Projectile, Resource, SkillUser, Summon, Transform, Trap, CombatStats } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { applyDamage, applyStatus, gainResource, isAlive, kill, targetState } from './combat';
import { computeTaken } from './damage';
import { hitOne, impactArea, spawnHazards } from './impact';
import { skillOf } from './skills';
import { livingInCircle, opposingTeam } from './targeting';
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

/** Player skill projectile step. Returns true when it is spent. */
function skillProjectile(world: World, ctx: GameContext, e: Entity, p: Projectile, tr: Transform): boolean {
  const spec = p.skill!;
  if (!world.isAlive(p.owner)) return true;
  const compiled = skillOf(world.get(p.owner, SkillUser), spec.skillId);
  // Shots that reach an explosive barrel set it off and stop.
  if (p.team === 'player' && hitDestructibles(world, tr.x, tr.z, p.radius) > 0 && spec.pierce <= 0) return true;
  for (const target of livingInCircle(world, ctx, tr.x, tr.z, p.radius, opposingTeam(p.team))) {
    if (spec.hit.includes(target)) continue;
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
