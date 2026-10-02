/**
 * Player skills: buffered requests → cast (wind-up, effect, recovery),
 * cooldowns, resource costs, dodge, potions and forced moves (leap/dodge).
 */
import {
  Dead,
  Faction,
  ForcedMove,
  Health,
  Invulnerable,
  Mover,
  Resource,
  SkillUser,
  StatusEffects,
  Transform,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { STATUS_DEFS, classDef, skill } from '../data/db';
import type { Impact, SkillDef, StatusApply } from '../data/schemas';
import { angleDelta } from './movement';
import { applyStatus, dealHit, gainResource, heal, removeStatuses } from './combat';
import { livingInCircle, opposingTeam } from './targeting';


export function skillSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(SkillUser, Transform)) {
    const user = world.req(e, SkillUser);
    if (world.has(e, Dead)) {
      user.cast = null;
      user.request = null;
      continue;
    }
    const cls = classDef(user.classId);
    for (const id in user.cooldowns) user.cooldowns[id] = Math.max(0, user.cooldowns[id]! - dt);
    user.dodgeCooldown = Math.max(0, user.dodgeCooldown - dt);
    if (user.potionCharges < cls.potion.charges) {
      user.potionRecharge -= dt;
      if (user.potionRecharge <= 0) {
        user.potionCharges++;
        user.potionRecharge = cls.potion.recharge;
      }
    }

    const canAct = world.get(e, StatusEffects)?.canAct ?? true;
    const tr = world.req(e, Transform);
    const mover = world.get(e, Mover);

    if (user.potionRequested) {
      user.potionRequested = false;
      const health = world.get(e, Health);
      if (user.potionCharges > 0 && health && health.current < health.max) {
        if (user.potionCharges === cls.potion.charges) user.potionRecharge = cls.potion.recharge;
        user.potionCharges--;
        heal(world, ctx, e, health.max * cls.potion.heal);
        ctx.events.push({ type: 'vfx', kind: 'heal', x: tr.x, z: tr.z, radius: 1, facing: 0 });
      }
    }

    if (user.dodgeRequested) {
      const dir = user.dodgeRequested;
      user.dodgeRequested = null;
      // Dodge cancels a wind-up or recovery — it is the panic button.
      if (user.dodgeCooldown <= 0 && canAct && !world.has(e, ForcedMove)) {
        user.cast = null;
        const len = Math.hypot(dir.x, dir.z) || 1;
        const dist = cls.dodge.distance;
        const lim = ctx.worldHalfSize;
        world.add(e, ForcedMove, {
          fromX: tr.x,
          fromZ: tr.z,
          toX: clamp(tr.x + (dir.x / len) * dist, -lim, lim),
          toZ: clamp(tr.z + (dir.z / len) * dist, -lim, lim),
          elapsed: 0,
          duration: cls.dodge.duration,
          height: 0,
          landingSkill: null,
        });
        world.add(e, Invulnerable, { remaining: cls.dodge.duration + 0.05 });
        user.dodgeCooldown = cls.dodge.cooldown;
        ctx.events.push({ type: 'vfx', kind: 'dodge', x: tr.x, z: tr.z, radius: 1, facing: Math.atan2(dir.x, dir.z) });
      }
    }

    if (user.request) {
      user.request.ttl -= dt;
      if (user.request.ttl <= 0) user.request = null;
    }

    if (user.cast) {
      const cast = user.cast;
      const def = skill(cast.skillId);
      cast.elapsed += dt;
      if (mover) {
        mover.vx = 0;
        mover.vz = 0;
      }
      faceToward(tr, cast.aimX, cast.aimZ);
      if (!cast.fired && cast.elapsed >= def.castTime) {
        cast.fired = true;
        fireSkill(world, ctx, e, def, cast.aimX, cast.aimZ);
      }
      if (cast.elapsed >= def.castTime + def.recovery) user.cast = null;
    }

    if (!user.cast && user.request && canAct && !world.has(e, ForcedMove)) {
      const id = user.slots[user.request.slot];
      if (!id) {
        user.request = null;
        continue;
      }
      const def = skill(id);
      if ((user.cooldowns[id] ?? 0) > 0) continue; // stay buffered until ttl expires
      const resource = world.get(e, Resource);
      if (def.resourceCost > 0 && (!resource || resource.current < def.resourceCost)) {
        user.request = null;
        ctx.events.push({ type: 'notice', key: 'combat.notEnoughResource' });
        continue;
      }
      if (resource && def.resourceCost > 0) resource.current -= def.resourceCost;
      user.cooldowns[id] = def.cooldown;
      user.cast = { skillId: id, elapsed: 0, fired: false, aimX: user.request.aimX, aimZ: user.request.aimZ };
      user.request = null;
      if (mover) {
        mover.vx = 0;
        mover.vz = 0;
      }
      faceToward(tr, user.cast.aimX, user.cast.aimZ);
      if (def.castTime === 0) {
        user.cast.fired = true;
        fireSkill(world, ctx, e, def, user.cast.aimX, user.cast.aimZ);
      }
    }
  }
}

/** Advances leaps and dodges; fires landing impacts. Runs after normal movement. */
export function forcedMoveSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(ForcedMove, Transform)) {
    const fm = world.req(e, ForcedMove);
    const tr = world.req(e, Transform);
    fm.elapsed += dt;
    const t = Math.min(1, fm.elapsed / fm.duration);
    // Dodges ease out (fast start); leaps travel linearly under a parabola.
    const p = fm.height > 0 ? t : 1 - (1 - t) * (1 - t);
    tr.x = fm.fromX + (fm.toX - fm.fromX) * p;
    tr.z = fm.fromZ + (fm.toZ - fm.fromZ) * p;
    tr.y = fm.height * 4 * t * (1 - t);
    const dx = fm.toX - fm.fromX;
    const dz = fm.toZ - fm.fromZ;
    if (dx !== 0 || dz !== 0) tr.facing = Math.atan2(dx, dz);
    if (t >= 1) {
      tr.y = 0;
      world.remove(e, ForcedMove);
      if (fm.landingSkill) {
        const def = skill(fm.landingSkill);
        if (def.effect.kind === 'leap') {
          const landing = def.effect.landing;
          impactArea(world, ctx, e, tr.x, tr.z, landing.radius, null, landing);
          ctx.events.push({ type: 'vfx', kind: 'leapLand', x: tr.x, z: tr.z, radius: landing.radius, facing: tr.facing });
          if (landing.shake > 0) ctx.events.push({ type: 'shake', trauma: landing.shake });
        }
      }
    }
  }
}

function fireSkill(world: World, ctx: GameContext, caster: Entity, def: SkillDef, aimX: number, aimZ: number): void {
  const tr = world.req(caster, Transform);
  const resource = world.get(caster, Resource);
  const effect = def.effect;
  const bonusApplies =
    def.resourceBonus && resource && resource.current >= def.resourceBonus.threshold ? def.resourceBonus.applies : [];

  switch (effect.kind) {
    case 'meleeArc': {
      const hits = impactArea(world, ctx, caster, tr.x, tr.z, effect.range, { facing: tr.facing, arcDeg: effect.arcDeg }, effect, bonusApplies);
      ctx.events.push({ type: 'vfx', kind: 'slash', x: tr.x, z: tr.z, radius: effect.range, facing: tr.facing, arcDeg: effect.arcDeg });
      if (hits > 0 && resource) gainResource(resource, def.resourceGain);
      break;
    }
    case 'nova': {
      const hits = impactArea(world, ctx, caster, tr.x, tr.z, effect.radius, null, effect, bonusApplies);
      ctx.events.push({ type: 'vfx', kind: 'shockwave', x: tr.x, z: tr.z, radius: effect.radius, facing: 0 });
      if (effect.shake > 0 && hits === 0) ctx.events.push({ type: 'shake', trauma: effect.shake * 0.5 });
      if (hits > 0 && resource) gainResource(resource, def.resourceGain);
      break;
    }
    case 'leap': {
      let dx = aimX - tr.x;
      let dz = aimZ - tr.z;
      const dist = Math.hypot(dx, dz);
      if (dist > effect.maxRange) {
        dx = (dx / dist) * effect.maxRange;
        dz = (dz / dist) * effect.maxRange;
      }
      const lim = ctx.worldHalfSize;
      world.add(caster, ForcedMove, {
        fromX: tr.x,
        fromZ: tr.z,
        toX: clamp(tr.x + dx, -lim, lim),
        toZ: clamp(tr.z + dz, -lim, lim),
        elapsed: 0,
        duration: effect.duration,
        height: effect.height,
        landingSkill: def.id,
      });
      if (resource) gainResource(resource, def.resourceGain);
      break;
    }
    case 'selfBuff': {
      if (effect.cleanse) {
        removeStatuses(world, caster, (s) => {
          const kind = STATUS_DEFS[s.id].kind;
          return kind === 'disable' || kind === 'slow';
        });
      }
      const team = world.get(caster, Faction)?.team ?? 'player';
      for (const apply of effect.applies) applyStatus(world, ctx, caster, apply, { team, level: 1, attacker: caster });
      ctx.events.push({ type: 'vfx', kind: 'shield', x: tr.x, z: tr.z, radius: 1.2, facing: 0 });
      if (resource) gainResource(resource, def.resourceGain);
      break;
    }
  }
}

/**
 * Hit every opposing living entity in a circle (optionally limited to an arc).
 * Returns the number of targets hit and emits hit-stop/shake when anything was hit.
 */
function impactArea(
  world: World,
  ctx: GameContext,
  caster: Entity,
  x: number,
  z: number,
  radius: number,
  arc: { facing: number; arcDeg: number } | null,
  impact: Impact,
  extraApplies: readonly StatusApply[] = [],
): number {
  const team = world.get(caster, Faction)?.team ?? 'player';
  let hits = 0;
  const halfArc = arc ? (arc.arcDeg * Math.PI) / 360 : Math.PI;
  for (const target of livingInCircle(world, ctx, x, z, radius, opposingTeam(team))) {
    if (target === caster) continue;
    const tt = world.req(target, Transform);
    if (arc && Math.hypot(tt.x - x, tt.z - z) > 0.3) {
      const angle = Math.atan2(tt.x - x, tt.z - z);
      if (Math.abs(angleDelta(arc.facing, angle)) > halfArc) continue;
    }
    const dealt = dealHit(world, ctx, caster, target, {
      coefficient: impact.coefficient,
      damageType: impact.damageType,
      knockback: impact.knockback,
      fromX: x,
      fromZ: z,
      applies: [...impact.applies, ...extraApplies],
      range: 'melee',
    });
    if (dealt !== null) hits++;
  }
  if (hits > 0) {
    if (impact.hitstopMs > 0) ctx.events.push({ type: 'hitstop', ms: impact.hitstopMs });
    if (impact.shake > 0) ctx.events.push({ type: 'shake', trauma: impact.shake });
  }
  return hits;
}

/** Turn to face a point (no-op if the point is on top of us). */
function faceToward(tr: Transform, x: number, z: number): void {
  const dx = x - tr.x;
  const dz = z - tr.z;
  if (dx * dx + dz * dz > 1e-6) tr.facing = Math.atan2(dx, dz);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
