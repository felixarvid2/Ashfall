/**
 * Lightbearer: support skills that heal, shield and bless the caster's side (allyArea), consecrated ground that
 * pulses (sanctum) and floating guardian lights. Healing goes through healAlly so Devotion grows with every life mended.
 */
import {
  Collider,
  CombatStats,
  Dead,
  EnemyAI,
  Faction,
  Guardian,
  Health,
  MinionAI,
  Mover,
  Renderable,
  Sanctum,
  SkillUser,
  StatusEffects,
  Summon,
  Transform,
  makeTransform,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { STATUS_DEFS, enemyDef } from '../data/db';
import { CORRUPTED_FAMILIES, type SkillEffect } from '../data/schemas';
import { applyAllyStatus, healAlly, isAlive, kill, removeStatuses } from './combat';
import { hitOne, impactArea } from './impact';
import type { CompiledSkill } from './skillCompile';
import { skillOf } from './skills';
import { livingInCircle, opposingTeam } from './targeting';

type AllyArea = Extract<SkillEffect, { kind: 'allyArea' }>;
type SanctumEffect = Extract<SkillEffect, { kind: 'sanctum' }>;
type GuardianEffect = Extract<SkillEffect, { kind: 'guardian' }>;

/** Seconds a sanctum's ground takes to fade out after its last pulse. */
export const SANCTUM_FADE = 0.5;
/** Hover height of a guardian light, and its glow. */
export const GUARDIAN_HEIGHT = 1.7;
export const GUARDIAN_GLOW = '#ffe9a0';
/** Model of a guardian light: the small floating Light Mote, repainted gold-white by the `halo` look. */
export const GUARDIAN_ASSET = 'enemy.light_mote';

/** Living members of the caster's team in a circle: the caster, minions, decoys, guardians. */
export function alliesInCircle(world: World, ctx: GameContext, caster: Entity, x: number, z: number, radius: number): Entity[] {
  const team = world.get(caster, Faction)?.team ?? 'player';
  return livingInCircle(world, ctx, x, z, radius, team);
}

/** Is this enemy burned by the Lightbearer's light? */
function isCorrupted(world: World, e: Entity): boolean {
  const ai = world.get(e, EnemyAI);
  return !!ai && CORRUPTED_FAMILIES.includes(enemyDef(ai.defId).family);
}

/** Heal, shield and bless allies around (cx, cz); optionally strike enemies there too. */
export function castAllyArea(world: World, ctx: GameContext, caster: Entity, compiled: CompiledSkill, effect: AllyArea, cx: number, cz: number): void {
  const team = world.get(caster, Faction)?.team ?? 'player';
  for (const ally of alliesInCircle(world, ctx, caster, cx, cz, effect.radius)) {
    if (effect.cleanse) {
      removeStatuses(world, ally, (s) => {
        const kind = STATUS_DEFS[s.id].kind;
        return kind === 'disable' || kind === 'slow';
      });
    }
    if (effect.healFraction > 0) {
      const max = world.get(ally, Health)?.max ?? 0;
      healAlly(world, ctx, caster, ally, max * effect.healFraction);
    }
    for (const apply of effect.applies) applyAllyStatus(world, ctx, caster, ally, apply);
  }

  const strike = effect.enemyImpact;
  if (strike) {
    const radius = strike.radius ?? effect.radius;
    if (!strike.corruptedOnly) {
      impactArea(world, ctx, caster, cx, cz, radius, null, strike, [], compiled.bonuses);
    } else {
      // Only the corrupted are burned; barrels and everything else are left alone.
      let hits = 0;
      for (const target of livingInCircle(world, ctx, cx, cz, radius, opposingTeam(team))) {
        if (!isCorrupted(world, target)) continue;
        if (hitOne(world, ctx, caster, target, cx, cz, strike, [], compiled.bonuses) !== null) hits++;
      }
      if (hits > 0) {
        if (strike.hitstopMs > 0) ctx.events.push({ type: 'hitstop', ms: strike.hitstopMs });
        if (strike.shake > 0) ctx.events.push({ type: 'shake', trauma: strike.shake });
      }
    }
  }
  ctx.events.push({ type: 'vfx', kind: 'holy', x: cx, z: cz, radius: effect.radius, facing: 0, color: effect.color });
}

/** Lay consecrated ground at (cx, cz). */
export function castSanctum(world: World, ctx: GameContext, caster: Entity, compiled: CompiledSkill, effect: SanctumEffect, cx: number, cz: number): void {
  // At the cap the oldest ground of this skill (the entity made first) is taken away.
  if (effect.maxConcurrent > 0) {
    const live = world
      .query(Sanctum)
      .filter((o) => {
        const s = world.req(o, Sanctum);
        return s.owner === caster && s.skillId === compiled.def.id && s.remaining > 0;
      })
      .sort((a, b) => world.req(a, Sanctum).remaining - world.req(b, Sanctum).remaining);
    for (let i = 0; i < live.length - effect.maxConcurrent + 1; i++) world.destroyDeferred(live[i]!);
  }
  const e = world.create();
  world.add(e, Transform, makeTransform(cx, 0, cz));
  world.add(e, Sanctum, {
    owner: caster,
    skillId: compiled.def.id,
    team: world.get(caster, Faction)?.team ?? 'player',
    radius: effect.radius,
    remaining: effect.duration,
    duration: effect.duration,
    interval: effect.interval,
    timer: 0,
    pulsesLeft: Math.max(1, Math.round(effect.duration / effect.interval)),
    pulses: 0,
    color: effect.color,
  });
  ctx.events.push({ type: 'vfx', kind: 'holyRing', x: cx, z: cz, radius: effect.radius, facing: 0, color: effect.color });
}

/** Pulses sanctums: heal and bless allies inside, strike enemies inside, then fade. */
export function sanctumSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Sanctum, Transform)) {
    const s = world.req(e, Sanctum);
    s.remaining -= dt;
    if (s.remaining <= -SANCTUM_FADE || !isAlive(world, s.owner)) {
      world.destroyDeferred(e);
      continue;
    }
    if (s.remaining <= 0 || s.pulsesLeft <= 0) continue;
    s.timer -= dt;
    if (s.timer > 0) continue;
    s.timer += s.interval;
    s.pulsesLeft--;
    s.pulses++;
    const compiled = skillOf(world.get(s.owner, SkillUser), s.skillId);
    const effect = compiled.def.effect;
    if (effect.kind !== 'sanctum') continue;
    const tr = world.req(e, Transform);
    for (const ally of alliesInCircle(world, ctx, s.owner, tr.x, tr.z, s.radius)) {
      if (effect.allyHealFraction > 0) healAlly(world, ctx, s.owner, ally, (world.get(ally, Health)?.max ?? 0) * effect.allyHealFraction);
      for (const apply of effect.allyApplies) applyAllyStatus(world, ctx, s.owner, ally, apply);
    }
    if (effect.impact) impactArea(world, ctx, s.owner, tr.x, tr.z, s.radius, null, effect.impact, [], compiled.bonuses);
    ctx.events.push({ type: 'vfx', kind: 'holyRing', x: tr.x, z: tr.z, radius: s.radius, facing: 0, color: s.color });
  }
}

/** Guardians of an owner that are still alive. */
export function guardiansOf(world: World, owner: Entity): Entity[] {
  return world.query(Guardian).filter((e) => world.req(e, Guardian).owner === owner && !world.has(e, Dead));
}

/** Call up a guardian light beside the caster; at the cap the oldest one is replaced. */
export function castGuardian(world: World, ctx: GameContext, caster: Entity, compiled: CompiledSkill, effect: GuardianEffect): Entity {
  const tr = world.req(caster, Transform);
  const existing = guardiansOf(world, caster).sort((a, b) => world.req(a, Guardian).born - world.req(b, Guardian).born);
  for (let i = 0; i < existing.length - effect.maxGuardians + 1; i++) kill(world, ctx, existing[i]!, 0);

  const ownerStats = world.get(caster, CombatStats);
  const life = (world.get(caster, Health)?.max ?? 100) * effect.lifeFraction;
  const ownerSpeed = world.get(caster, Mover)?.speed ?? 5.5;
  const a = ctx.rng.range(0, Math.PI * 2);
  const x = tr.x + Math.sin(a) * 1.8;
  const z = tr.z + Math.cos(a) * 1.8;
  const e = world.create();
  world.add(e, Transform, makeTransform(x, GUARDIAN_HEIGHT, z, tr.facing));
  world.add(e, Renderable, { assetId: GUARDIAN_ASSET, scale: 0.5, glow: GUARDIAN_GLOW, look: 'halo' });
  world.add(e, Faction, { team: world.get(caster, Faction)?.team ?? 'player' });
  world.add(e, Health, { current: life, max: life });
  world.add(e, Mover, { speed: ownerSpeed * 1.15, speedMul: 1, turnRate: 12, vx: 0, vz: 0 });
  // Hovering: it never shoves anyone on the ground, but enemies and bolts can still hit it.
  world.add(e, Collider, { radius: 0.35, mass: 0.4, layer: 'air', isStatic: false });
  if (ownerStats) {
    // Offence is re-synced from the owner every tick (minionSystem); armour is half of theirs.
    world.add(e, CombatStats, {
      ...ownerStats,
      armor: ownerStats.armor * 0.5,
      tags: [],
      resist: {},
      additive: [...ownerStats.additive],
      multiplicative: [...ownerStats.multiplicative],
    });
  }
  world.add(e, StatusEffects, { list: [], canAct: true, dotTimer: 0 });
  world.add(e, MinionAI, {
    owner: caster,
    state: 'follow',
    timer: 0,
    cooldown: 0.5,
    attackCooldown: effect.attackCooldown,
    attackRange: effect.range,
    windup: 0.2,
    coefficient: effect.bolt.coefficient,
    damageType: effect.bolt.damageType,
    ranged: true,
    applies: effect.bolt.applies.map((s) => ({ status: s.status, duration: s.duration, ...(s.coefficient !== undefined ? { coefficient: s.coefficient } : {}) })),
    target: null,
    attackSeq: 0,
    born: ctx.tick,
  });
  world.add(e, Summon, { owner: caster, remaining: effect.duration, skillId: compiled.def.id, kind: 'summon' });
  world.add(e, Guardian, {
    owner: caster,
    skillId: compiled.def.id,
    born: ctx.tick,
    bolt: effect.bolt,
    explodeRadius: effect.explodeRadius,
    healPulse: effect.healPulse ?? null,
    pulseTimer: effect.healPulse?.interval ?? 0,
  });
  ctx.events.push({ type: 'vfx', kind: 'holyRing', x, z, radius: 1.4, facing: 0, color: GUARDIAN_GLOW });
  return e;
}

/** Guardian lights mend the allies near them on an interval; the healing is the owner's (Devotion). */
export function guardianSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Guardian, Transform)) {
    if (world.has(e, Dead)) continue;
    const g = world.req(e, Guardian);
    const pulse = g.healPulse;
    if (!pulse || !isAlive(world, g.owner)) continue;
    g.pulseTimer -= dt;
    if (g.pulseTimer > 0) continue;
    g.pulseTimer += pulse.interval;
    const tr = world.req(e, Transform);
    for (const ally of alliesInCircle(world, ctx, g.owner, tr.x, tr.z, pulse.radius)) {
      healAlly(world, ctx, g.owner, ally, (world.get(ally, Health)?.max ?? 0) * pulse.healFraction);
    }
    ctx.events.push({ type: 'vfx', kind: 'holyRing', x: tr.x, z: tr.z, radius: pulse.radius, facing: 0, color: GUARDIAN_GLOW });
  }
}
