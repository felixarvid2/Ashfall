/** Projectiles and ground hazards (spore clouds). */
import { Dead, Hazard, Projectile, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import { applyDamage, applyStatus, targetState } from './combat';
import { computeTaken } from './damage';
import { livingInCircle, opposingTeam } from './targeting';

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

    const hit = livingInCircle(world, ctx, tr.x, tr.z, p.radius, opposingTeam(p.team))[0];
    if (hit !== undefined) {
      const taken = computeTaken(p.damage, p.damageType, targetState(world, hit, 'ranged'), p.attackerLevel).final;
      applyDamage(world, ctx, hit, taken, { crit: false, damageType: p.damageType, dot: false, sourceTeam: p.team });
      ctx.events.push({ type: 'vfx', kind: 'boltHit', x: tr.x, z: tr.z, radius: 0.6, facing: tr.facing });
      world.destroyDeferred(e);
      continue;
    }
    if (p.remaining <= 0 || Math.abs(tr.x) > ctx.worldHalfSize + 5 || Math.abs(tr.z) > ctx.worldHalfSize + 5) {
      world.destroyDeferred(e);
    }
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
      for (const apply of hz.applies) {
        applyStatus(world, ctx, target, apply, { team: hz.team, level: hz.attackerLevel });
      }
    }
  }
}
