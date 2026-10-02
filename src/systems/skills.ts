/**
 * Player skills: buffered requests → cast (wind-up, effect, recovery),
 * cooldowns, resource costs, dodge, potions and forced moves (leap/dodge).
 */
import {
  CombatStats,
  Dead,
  DelayedStrike,
  Hazard,
  makeTransform,
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
import type { Impact, StatusApply } from '../data/schemas';
import type { CompiledSkill } from './skillCompile';
import { angleDelta } from './movement';
import { applyStatus, dealHit, gainResource, heal, removeStatuses } from './combat';
import { livingInCircle, opposingTeam } from './targeting';


/** Effective skill for a caster: compiled (ranks + modifiers) if learned, else the base data. */
export function skillOf(user: SkillUser | undefined, id: string): CompiledSkill {
  return user?.compiled[id] ?? { def: skill(id), rank: 1, bonuses: { additive: [], multiplicative: [] }, hazards: [] };
}

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
        const potionBonus = 1 + (world.get(e, CombatStats)?.potionHealing ?? 0);
        heal(world, ctx, e, health.max * cls.potion.heal * potionBonus);
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

    const speed = 1 + (world.get(e, CombatStats)?.attackSpeed ?? 0);
    if (user.cast) {
      const cast = user.cast;
      const compiled = skillOf(user, cast.skillId);
      const def = compiled.def;
      // Attack speed shortens wind-up and recovery.
      cast.elapsed += dt * speed;
      if (mover) {
        mover.vx = 0;
        mover.vz = 0;
      }
      faceToward(tr, cast.aimX, cast.aimZ);
      if (!cast.fired && cast.elapsed >= def.castTime) {
        cast.fired = true;
        fireSkill(world, ctx, e, compiled, cast.aimX, cast.aimZ);
      }
      if (cast.elapsed >= def.castTime + def.recovery) user.cast = null;
    }

    if (!user.cast && user.request && canAct && !world.has(e, ForcedMove)) {
      const id = user.slots[user.request.slot];
      if (!id) {
        user.request = null;
        continue;
      }
      // Only learned skills can be used.
      const compiled = user.compiled[id];
      if (!compiled) {
        user.request = null;
        continue;
      }
      const def = compiled.def;
      if ((user.cooldowns[id] ?? 0) > 0) continue; // stay buffered until ttl expires
      if (def.effect.kind === 'vent') {
        const r = world.get(e, Resource);
        if (!r || r.current < def.effect.minResource) {
          user.request = null;
          ctx.events.push({ type: 'notice', key: 'combat.notEnoughResource' });
          continue;
        }
      }
      const resource = world.get(e, Resource);
      if (def.resourceCost > 0 && (!resource || resource.current < def.resourceCost)) {
        user.request = null;
        ctx.events.push({ type: 'notice', key: 'combat.notEnoughResource' });
        continue;
      }
      if (resource && def.resourceCost > 0) resource.current -= def.resourceCost;
      user.cooldowns[id] = def.cooldown * (1 - (world.get(e, CombatStats)?.cooldownReduction ?? 0));
      user.cast = { skillId: id, elapsed: 0, fired: false, aimX: user.request.aimX, aimZ: user.request.aimZ };
      user.request = null;
      if (mover) {
        mover.vx = 0;
        mover.vz = 0;
      }
      faceToward(tr, user.cast.aimX, user.cast.aimZ);
      if (def.castTime === 0) {
        user.cast.fired = true;
        fireSkill(world, ctx, e, compiled, user.cast.aimX, user.cast.aimZ);
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
        const compiled = skillOf(world.get(e, SkillUser), fm.landingSkill);
        const def = compiled.def;
        if (def.effect.kind === 'leap') {
          const landing = def.effect.landing;
          impactArea(world, ctx, e, tr.x, tr.z, landing.radius, null, landing, [], compiled.bonuses);
          spawnHazards(world, e, tr.x, tr.z, compiled);
          ctx.events.push({ type: 'vfx', kind: 'leapLand', x: tr.x, z: tr.z, radius: landing.radius, facing: tr.facing });
          if (landing.shake > 0) ctx.events.push({ type: 'shake', trauma: landing.shake });
        }
      }
    }
  }
}

function fireSkill(world: World, ctx: GameContext, caster: Entity, compiled: CompiledSkill, aimX: number, aimZ: number): void {
  const def = compiled.def;
  const tr = world.req(caster, Transform);
  const resource = world.get(caster, Resource);
  const gain = def.resourceGain * (1 + (world.get(caster, CombatStats)?.resourceGen ?? 0));
  const effect = def.effect;
  const bonusApplies =
    def.resourceBonus && resource && resource.current >= def.resourceBonus.threshold ? def.resourceBonus.applies : [];
  const bonuses = compiled.bonuses;

  switch (effect.kind) {
    case 'meleeArc': {
      const hits = impactArea(world, ctx, caster, tr.x, tr.z, effect.range, { facing: tr.facing, arcDeg: effect.arcDeg }, effect, bonusApplies, bonuses);
      ctx.events.push({ type: 'vfx', kind: 'slash', x: tr.x, z: tr.z, radius: effect.range, facing: tr.facing, arcDeg: effect.arcDeg });
      if (hits > 0 && resource) gainResource(resource, gain);
      spawnHazards(world, caster, tr.x + Math.sin(tr.facing) * 1.5, tr.z + Math.cos(tr.facing) * 1.5, compiled);
      break;
    }
    case 'nova': {
      const hits = impactArea(world, ctx, caster, tr.x, tr.z, effect.radius, null, effect, bonusApplies, bonuses);
      ctx.events.push({ type: 'vfx', kind: effect.knockback < 0 ? 'pull' : 'shockwave', x: tr.x, z: tr.z, radius: effect.radius, facing: 0 });
      if (effect.shake > 0 && hits === 0) ctx.events.push({ type: 'shake', trauma: effect.shake * 0.5 });
      if (hits > 0 && resource) gainResource(resource, gain);
      spawnHazards(world, caster, tr.x, tr.z, compiled);
      break;
    }
    case 'vent': {
      // Spend all Heat: more stored Heat = a bigger blast.
      const spent = resource ? resource.current : 0;
      if (resource) resource.current = 0;
      const impact = { ...effect, coefficient: effect.coefficient + effect.perResource * spent };
      impactArea(world, ctx, caster, tr.x, tr.z, effect.radius, null, impact, [], bonuses);
      ctx.events.push({ type: 'vfx', kind: 'vent', x: tr.x, z: tr.z, radius: effect.radius, facing: 0 });
      ctx.events.push({ type: 'shake', trauma: effect.shake });
      spawnHazards(world, caster, tr.x, tr.z, compiled);
      break;
    }
    case 'orbital': {
      let dx = aimX - tr.x;
      let dz = aimZ - tr.z;
      const dist = Math.hypot(dx, dz);
      if (dist > effect.range) {
        dx = (dx / dist) * effect.range;
        dz = (dz / dist) * effect.range;
      }
      const lim = ctx.worldHalfSize;
      const x = clamp(tr.x + dx, -lim, lim);
      const z = clamp(tr.z + dz, -lim, lim);
      const strike = world.create();
      world.add(strike, Transform, makeTransform(x, 0, z));
      world.add(strike, DelayedStrike, { caster, skillId: def.id, remaining: effect.delay, radius: effect.radius });
      ctx.events.push({
        type: 'telegraph',
        owner: strike,
        x,
        z,
        shape: { kind: 'circle', radius: effect.radius },
        duration: effect.delay,
        color: '#7ec8ff',
      });
      if (resource) gainResource(resource, gain);
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
      if (resource) gainResource(resource, gain);
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
      if (effect.healFraction > 0) {
        const health = world.get(caster, Health);
        if (health) heal(world, ctx, caster, health.max * effect.healFraction);
      }
      if (resource && effect.resourceDelta !== 0) gainResource(resource, effect.resourceDelta);
      ctx.events.push({ type: 'vfx', kind: effect.resourceDelta < 0 ? 'coolant' : 'shield', x: tr.x, z: tr.z, radius: 1.2, facing: 0 });
      if (resource) gainResource(resource, gain);
      break;
    }
  }
}

/** Burning/poison areas left by skill modifiers (Rupture, Crater, Fissure aspect…). */
function spawnHazards(world: World, caster: Entity, x: number, z: number, compiled: CompiledSkill): void {
  if (!compiled.hazards.length) return;
  const stats = world.get(caster, CombatStats);
  const team = world.get(caster, Faction)?.team ?? 'player';
  for (const h of compiled.hazards) {
    const e = world.create();
    world.add(e, Transform, makeTransform(x, 0, z));
    world.add(e, Hazard, {
      team,
      radius: h.radius,
      remaining: h.duration,
      duration: h.duration,
      tickTimer: 0,
      applies: [{ status: h.status, duration: 1.5, dps: h.dpsCoefficient * (stats?.weaponDamage ?? 10) * (1 + (stats?.mainStat ?? 0) * 0.001) }],
      attackerLevel: stats?.level ?? 1,
    });
  }
}

/** Lands orbital strikes when their delay runs out. */
export function delayedStrikeSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(DelayedStrike, Transform)) {
    const strike = world.req(e, DelayedStrike);
    strike.remaining -= dt;
    if (strike.remaining > 0) continue;
    const tr = world.req(e, Transform);
    world.destroyDeferred(e);
    if (!world.isAlive(strike.caster)) continue;
    const compiled = skillOf(world.get(strike.caster, SkillUser), strike.skillId);
    const effect = compiled.def.effect;
    if (effect.kind !== 'orbital') continue;
    impactArea(world, ctx, strike.caster, tr.x, tr.z, effect.radius, null, effect, [], compiled.bonuses);
    ctx.events.push({ type: 'vfx', kind: 'orbital', x: tr.x, z: tr.z, radius: effect.radius, facing: 0 });
    ctx.events.push({ type: 'shake', trauma: effect.shake });
    spawnHazards(world, strike.caster, tr.x, tr.z, compiled);
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
  bonuses?: CompiledSkill['bonuses'],
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
      ...(bonuses ? { bonuses } : {}),
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
