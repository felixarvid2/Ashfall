/**
 * Player skills: buffered requests → cast (wind-up, effect, recovery),
 * cooldowns, resource costs, dodge, potions and forced moves (leap/dodge).
 */
import { PYLON_EFFECTS } from '../data/interactables';
import {
  Collider,
  CombatStats,
  Dead,
  DelayedStrike,
  makeTransform,
  Faction,
  ForcedMove,
  Health,
  Invulnerable,
  Mover,
  Projectile,
  Renderable,
  Resource,
  SkillUser,
  Hazard,
  MinionAI,
  StatusEffects,
  Summon,
  Taunt,
  Tether,
  Transform,
  Trap,
  Turret,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { STATUS_DEFS, classDef, skill } from '../data/db';
import type { Impact } from '../data/schemas';
import type { CompiledSkill } from './skillCompile';
import { applyStatus, gainResource, hasStatus, heal, kill, removeStatuses } from './combat';
import { impactArea, spawnHazards } from './impact';
import { hubAt } from '../world/zone';
import { consumeCorpse, findCorpses, minionsOf, raiseCorpse } from './minions';
import { livingInCircle } from './targeting';

/** Seconds of the "evasive" window after a dodge or blink (Ghost key passive). */
export const EVASIVE_WINDOW = 2.5;


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
        applyStatus(world, ctx, e, { status: 'evasive', duration: EVASIVE_WINDOW }, { team: world.get(e, Faction)?.team ?? 'player', level: 1 });
        user.dodgeCooldown = cls.dodge.cooldown;
        ctx.events.push({ type: 'vfx', kind: 'dodge', x: tr.x, z: tr.z, radius: 1, facing: Math.atan2(dir.x, dir.z) });
      }
    }

    if (user.request) {
      user.request.ttl -= dt;
      if (user.request.ttl <= 0) user.request = null;
    }

    const speed = 1 + (world.get(e, CombatStats)?.attackSpeed ?? 0) + (hasStatus(world, e, 'kinetic') ? PYLON_EFFECTS.kineticSpeed : 0);
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

    if (user.request && hubAt(ctx.zone, tr.x, tr.z)) {
      // No fighting in a safe hub.
      user.request = null;
      ctx.events.push({ type: 'notice', key: 'map.noCombat' });
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
      // Overclock pylon: no cooldowns while it lasts.
      user.cooldowns[id] = hasStatus(world, e, 'overclock') ? 0 : def.cooldown * (1 - (world.get(e, CombatStats)?.cooldownReduction ?? 0));
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
      world.add(strike, DelayedStrike, {
        caster,
        skillId: def.id,
        remaining: effect.delay,
        radius: effect.radius,
        duration: effect.delay,
        vfx: 'orbital',
        fromX: x,
        fromZ: z,
      });
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
    case 'projectile': {
      const base = Math.atan2(aimX - tr.x, aimZ - tr.z);
      const spread = (effect.spreadDeg * Math.PI) / 180;
      const team = world.get(caster, Faction)?.team ?? 'player';
      const level = world.get(caster, CombatStats)?.level ?? 1;
      for (let i = 0; i < effect.count; i++) {
        const a = effect.count === 1 ? base : base - spread / 2 + (spread * i) / (effect.count - 1);
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        const p = world.create();
        world.add(p, Transform, makeTransform(tr.x + dx * 0.7, 1.2, tr.z + dz * 0.7, a));
        world.add(p, Projectile, {
          team,
          vx: dx * effect.speed,
          vz: dz * effect.speed,
          radius: effect.radius,
          remaining: effect.maxRange / effect.speed,
          damage: 0,
          damageType: effect.damageType,
          attackerLevel: level,
          owner: caster,
          skill: {
            skillId: def.id,
            impact: effect,
            pierce: effect.pierce,
            explodeRadius: effect.explodeRadius,
            gain: gain / effect.count,
            hit: [],
            color: effect.color,
          },
        });
      }
      ctx.events.push({ type: 'vfx', kind: 'muzzle', x: tr.x + Math.sin(base) * 0.8, z: tr.z + Math.cos(base) * 0.8, radius: 0.5, facing: base });
      break;
    }
    case 'grenade': {
      const at = clampToRange(tr, aimX, aimZ, effect.maxRange, ctx.worldHalfSize);
      const strike = world.create();
      world.add(strike, Transform, makeTransform(at.x, 0, at.z));
      world.add(strike, DelayedStrike, {
        caster,
        skillId: def.id,
        remaining: effect.flightTime,
        radius: effect.radius,
        duration: effect.flightTime,
        vfx: 'grenade',
        fromX: tr.x,
        fromZ: tr.z,
      });
      ctx.events.push({ type: 'telegraph', owner: strike, x: at.x, z: at.z, shape: { kind: 'circle', radius: effect.radius }, duration: effect.flightTime, color: '#ffb84a' });
      if (resource) gainResource(resource, gain);
      break;
    }
    case 'trap': {
      const at = clampToRange(tr, aimX, aimZ, effect.maxRange, ctx.worldHalfSize);
      const team = world.get(caster, Faction)?.team ?? 'player';
      const turn = ctx.rng.range(0, Math.PI * 2);
      for (let i = 0; i < effect.count; i++) {
        const a = turn + (Math.PI * 2 * i) / effect.count;
        const r = effect.count > 1 ? effect.spacing : 0;
        const trap = world.create();
        world.add(trap, Transform, makeTransform(at.x + Math.sin(a) * r, 0, at.z + Math.cos(a) * r));
        world.add(trap, Trap, {
          owner: caster,
          skillId: def.id,
          team,
          arming: effect.armTime,
          remaining: effect.duration,
          triggerRadius: effect.triggerRadius,
          radius: effect.radius,
        });
      }
      ctx.events.push({ type: 'vfx', kind: 'trapPlace', x: at.x, z: at.z, radius: effect.spacing + 0.6, facing: 0 });
      if (resource) gainResource(resource, gain);
      break;
    }
    case 'blink': {
      const at = clampToRange(tr, aimX, aimZ, effect.maxRange, ctx.worldHalfSize);
      ctx.events.push({ type: 'vfx', kind: 'blink', x: tr.x, z: tr.z, radius: 1, facing: tr.facing });
      // Teleport: no interpolation streak across the gap.
      tr.x = tr.prevX = at.x;
      tr.z = tr.prevZ = at.z;
      if (effect.invulnerable > 0) world.add(caster, Invulnerable, { remaining: effect.invulnerable });
      const team = world.get(caster, Faction)?.team ?? 'player';
      for (const apply of [...effect.applies, { status: 'evasive' as const, duration: EVASIVE_WINDOW }]) {
        applyStatus(world, ctx, caster, apply, { team, level: 1, attacker: caster });
      }
      ctx.events.push({ type: 'vfx', kind: 'blink', x: at.x, z: at.z, radius: 1.3, facing: tr.facing });
      if (resource) gainResource(resource, gain);
      break;
    }
    case 'decoy': {
      const at = clampToRange(tr, aimX, aimZ, effect.maxRange, ctx.worldHalfSize);
      const team = world.get(caster, Faction)?.team ?? 'player';
      const life = (world.get(caster, Health)?.max ?? 100) * effect.lifeFraction;
      const d = world.create();
      world.add(d, Transform, makeTransform(at.x, 0, at.z, tr.facing));
      world.add(d, Renderable, { assetId: world.get(caster, Renderable)?.assetId ?? 'char.spectre', hologram: true });
      world.add(d, Faction, { team });
      world.add(d, Health, { current: life, max: life });
      world.add(d, Collider, { radius: 0.4, mass: 2, layer: 'ground', isStatic: true });
      world.add(d, StatusEffects, { list: [], canAct: true, dotTimer: 0 });
      world.add(d, Taunt, { radius: effect.tauntRadius });
      world.add(d, Summon, { owner: caster, remaining: effect.duration, skillId: def.id, kind: 'decoy' });
      ctx.events.push({ type: 'vfx', kind: 'blink', x: at.x, z: at.z, radius: 1.3, facing: 0 });
      if (resource) gainResource(resource, gain);
      break;
    }
    case 'cursorBurst': {
      const at = clampToRange(tr, aimX, aimZ, effect.maxRange, ctx.worldHalfSize);
      const hits = impactArea(world, ctx, caster, at.x, at.z, effect.radius, null, effect, [], bonuses);
      ctx.events.push({ type: 'vfx', kind: 'mark', x: at.x, z: at.z, radius: effect.radius, facing: 0 });
      if (resource && (hits > 0 || def.category !== 'basic')) gainResource(resource, gain);
      spawnHazards(world, caster, at.x, at.z, compiled);
      break;
    }
    case 'cloud': {
      const at = clampToRange(tr, aimX, aimZ, effect.maxRange, ctx.worldHalfSize);
      if (effect.coefficient > 0) impactArea(world, ctx, caster, at.x, at.z, effect.radius, null, effect, [], bonuses);
      const stats = world.get(caster, CombatStats);
      const cloud = world.create();
      world.add(cloud, Transform, makeTransform(at.x, 0, at.z));
      world.add(cloud, Hazard, {
        team: world.get(caster, Faction)?.team ?? 'player',
        radius: effect.radius,
        remaining: effect.duration,
        duration: effect.duration,
        tickTimer: 0,
        applies: [
          {
            status: effect.status,
            duration: 1.5,
            dps: effect.dpsCoefficient * (stats?.weaponDamage ?? 10) * (1 + (stats?.mainStat ?? 0) * 0.001),
          },
        ],
        attackerLevel: stats?.level ?? 1,
      });
      ctx.events.push({ type: 'vfx', kind: 'sporePulse', x: at.x, z: at.z, radius: effect.radius, facing: 0 });
      spawnHazards(world, caster, at.x, at.z, compiled);
      if (resource) gainResource(resource, gain);
      break;
    }
    case 'tether': {
      // Link the enemies closest to the cursor within range.
      const team = world.get(caster, Faction)?.team ?? 'player';
      const enemies = livingInCircle(world, ctx, tr.x, tr.z, effect.maxRange, team === 'player' ? 'enemy' : 'player')
        .map((e) => {
          const et = world.req(e, Transform);
          return { e, d: Math.hypot(et.x - aimX, et.z - aimZ) };
        })
        .sort((a, b) => a.d - b.d)
        .slice(0, effect.count);
      if (enemies.length === 0) {
        refund(world, ctx, caster, def.resourceCost);
        break;
      }
      for (const { e } of enemies) {
        const link = world.create();
        world.add(link, Tether, {
          owner: caster,
          target: e,
          skillId: def.id,
          remaining: effect.duration,
          tickTimer: 0,
          interval: effect.duration / effect.ticks,
          maxRange: effect.maxRange,
        });
      }
      if (resource) gainResource(resource, gain);
      break;
    }
    case 'raise': {
      const at = clampToRange(tr, aimX, aimZ, effect.maxRange, ctx.worldHalfSize);
      const corpses = findCorpses(world, at.x, at.z, effect.searchRadius, effect.count);
      if (corpses.length === 0) {
        refund(world, ctx, caster, def.resourceCost);
        ctx.events.push({ type: 'notice', key: 'combat.noCorpses' });
        break;
      }
      // Over the cap: the oldest minions crumble to make room.
      const existing = minionsOf(world, caster).sort((a, b) => world.req(a, MinionAI).born - world.req(b, MinionAI).born);
      const excess = existing.length + corpses.length - effect.maxMinions;
      for (let i = 0; i < excess && i < existing.length; i++) kill(world, ctx, existing[i]!, 0);
      for (const c of corpses) raiseCorpse(world, ctx, c, caster, def);
      if (resource) gainResource(resource, gain);
      break;
    }
    case 'corpseBurst': {
      const at = clampToRange(tr, aimX, aimZ, effect.maxRange, ctx.worldHalfSize);
      const corpses = findCorpses(world, at.x, at.z, effect.searchRadius, effect.count);
      if (corpses.length === 0) {
        refund(world, ctx, caster, def.resourceCost);
        ctx.events.push({ type: 'notice', key: 'combat.noCorpses' });
        break;
      }
      for (const c of corpses) {
        const ct = world.req(c, Transform);
        impactArea(world, ctx, caster, ct.x, ct.z, effect.radius, null, effect, [], bonuses);
        ctx.events.push({ type: 'vfx', kind: 'corpseBurst', x: ct.x, z: ct.z, radius: effect.radius, facing: 0 });
        spawnHazards(world, caster, ct.x, ct.z, compiled);
        consumeCorpse(world, c);
      }
      if (resource) gainResource(resource, gain);
      break;
    }
    case 'turret': {
      const at = clampToRange(tr, aimX, aimZ, effect.maxRange, ctx.worldHalfSize);
      const team = world.get(caster, Faction)?.team ?? 'player';
      const life = (world.get(caster, Health)?.max ?? 100) * effect.lifeFraction;
      const w = world.create();
      world.add(w, Transform, makeTransform(at.x, 0, at.z, tr.facing));
      world.add(w, Renderable, { assetId: effect.assetId, glow: '#4dff5a' });
      world.add(w, Faction, { team });
      world.add(w, Health, { current: life, max: life });
      world.add(w, Collider, { radius: 1.1, mass: 50, layer: 'ground', isStatic: true });
      world.add(w, StatusEffects, { list: [], canAct: true, dotTimer: 0 });
      if (effect.tauntRadius > 0) world.add(w, Taunt, { radius: effect.tauntRadius });
      world.add(w, Summon, { owner: caster, remaining: effect.duration, skillId: def.id, kind: 'summon' });
      world.add(w, Turret, { owner: caster, skillId: def.id, interval: effect.interval, timer: 0.5, slamSeq: 0 });
      ctx.events.push({ type: 'vfx', kind: 'raise', x: at.x, z: at.z, radius: 3, facing: 0 });
      ctx.events.push({ type: 'shake', trauma: 0.4 });
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
      const fx = effect.applies.some((a) => a.status === 'stealth') ? 'smoke' : effect.resourceDelta < 0 ? 'coolant' : 'shield';
      ctx.events.push({ type: 'vfx', kind: fx, x: tr.x, z: tr.z, radius: 1.2, facing: 0 });
      spawnHazards(world, caster, tr.x, tr.z, compiled);
      if (resource) gainResource(resource, gain);
      break;
    }
  }
}

/** Lands orbital strikes, grenades and bomblets when their delay runs out. */
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
    const impact: Impact | null = strike.impact ?? (effect.kind === 'orbital' || effect.kind === 'grenade' ? effect : null);
    if (!impact) continue;
    impactArea(world, ctx, strike.caster, tr.x, tr.z, strike.radius, null, impact, [], compiled.bonuses);
    const kind = strike.vfx === 'orbital' ? 'orbital' : strike.vfx === 'grenade' ? 'explosion' : 'bomblet';
    ctx.events.push({ type: 'vfx', kind, x: tr.x, z: tr.z, radius: strike.radius, facing: 0 });
    if (impact.shake > 0) ctx.events.push({ type: 'shake', trauma: impact.shake });
    if (strike.vfx === 'bomblet') continue;
    spawnHazards(world, strike.caster, tr.x, tr.z, compiled);
    // Cluster grenades scatter bomblets that pop a moment later.
    if (strike.vfx === 'grenade' && effect.kind === 'grenade' && effect.bomblets) {
      const b = effect.bomblets;
      for (let i = 0; i < b.count; i++) {
        const a = ctx.rng.range(0, Math.PI * 2);
        const r = ctx.rng.range(b.spread * 0.4, b.spread);
        const bx = tr.x + Math.sin(a) * r;
        const bz = tr.z + Math.cos(a) * r;
        const bomb = world.create();
        const delay = 0.25 + i * 0.07;
        world.add(bomb, Transform, makeTransform(bx, 0, bz));
        world.add(bomb, DelayedStrike, {
          caster: strike.caster,
          skillId: strike.skillId,
          remaining: delay,
          radius: b.radius,
          duration: delay,
          impact: { ...effect, coefficient: b.coefficient, hitstopMs: 0, shake: 0, knockback: 0 },
          vfx: 'bomblet',
          fromX: tr.x,
          fromZ: tr.z,
        });
      }
    }
  }
}

/** Turn to face a point (no-op if the point is on top of us). */
function faceToward(tr: Transform, x: number, z: number): void {
  const dx = x - tr.x;
  const dz = z - tr.z;
  if (dx * dx + dz * dz > 1e-6) tr.facing = Math.atan2(dx, dz);
}

/** Give back a skill's cost when it fizzles (no corpse, no target). */
function refund(world: World, ctx: GameContext, caster: Entity, cost: number): void {
  const r = world.get(caster, Resource);
  if (r && cost > 0) gainResource(r, cost);
  void ctx;
}

/** A point toward (x, z) at most `range` metres away, inside the world bounds. */
function clampToRange(tr: Transform, x: number, z: number, range: number, lim: number): { x: number; z: number } {
  let dx = x - tr.x;
  let dz = z - tr.z;
  const dist = Math.hypot(dx, dz);
  if (dist > range) {
    dx = dist > 0 ? (dx / dist) * range : 0;
    dz = dist > 0 ? (dz / dist) * range : 0;
  }
  return { x: clamp(tr.x + dx, -lim, lim), z: clamp(tr.z + dz, -lim, lim) };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
