/**
 * Applying hits, damage, statuses, healing and death to entities.
 * Pure formula lives in damage.ts; this module mutates the world and emits events.
 */
import {
  Collider,
  CombatStats,
  Dead,
  EnemyAI,
  Faction,
  ForcedMove,
  Hazard,
  Health,
  Invulnerable,
  Knockback,
  Level,
  Mover,
  PlayerControlled,
  Resource,
  SkillUser,
  StatusEffects,
  Transform,
  makeTransform,
  type StatusInstance,
  type Team,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { STATUS_DEFS, enemyDef } from '../data/db';
import type { Condition, DamageType, StatusApply, StatusId } from '../data/schemas';
import { computeHit, computeOutgoing, computeTaken, type TargetState } from './damage';

export function hasStatus(world: World, e: Entity, id: StatusId): boolean {
  return world.get(e, StatusEffects)?.list.some((s) => s.id === id) ?? false;
}

export function isAlive(world: World, e: Entity): boolean {
  return world.isAlive(e) && world.has(e, Health) && !world.has(e, Dead);
}

export function conditionsOf(world: World, e: Entity, attackRange: 'melee' | 'ranged' | null): Set<Condition> {
  const set = new Set<Condition>();
  const effects = world.get(e, StatusEffects);
  if (effects) {
    for (const s of effects.list) {
      if (s.id === 'vulnerable' || s.id === 'burning' || s.id === 'poisoned' || s.id === 'chilled') set.add(s.id);
      if (s.id === 'stunned' || s.id === 'frozen') set.add('stunned');
    }
  }
  if (world.get(e, CombatStats)?.tags.includes('elite')) set.add('elite');
  if (attackRange) set.add(attackRange);
  return set;
}

export function targetState(world: World, e: Entity, attackRange: 'melee' | 'ranged' | null): TargetState {
  const stats = world.get(e, CombatStats);
  const vulnDef = STATUS_DEFS.vulnerable;
  return {
    armor: stats?.armor ?? 0,
    resist: stats?.resist ?? {},
    vulnerable: hasStatus(world, e, 'vulnerable'),
    vulnerableMultiplier: vulnDef.kind === 'vulnerable' ? vulnDef.damageTakenMultiplier : 1.2,
    conditions: conditionsOf(world, e, attackRange),
    damageTakenMultiplier: 1 - (stats?.damageReduction ?? 0),
  };
}

export interface HitSpec {
  coefficient: number;
  damageType: DamageType;
  knockback: number;
  /** Origin of the hit, for knockback direction. */
  fromX: number;
  fromZ: number;
  applies: readonly StatusApply[];
  range: 'melee' | 'ranged';
}

/** Attacker hits target using the attacker's CombatStats. Returns final damage, or null if no effect. */
export function dealHit(world: World, ctx: GameContext, attacker: Entity, target: Entity, hit: HitSpec): number | null {
  if (!isAlive(world, target)) return null;
  const stats = world.get(attacker, CombatStats);
  const team = world.get(attacker, Faction)?.team ?? 'enemy';
  if (!stats) return null;
  const result = computeHit({ ...stats, coefficient: hit.coefficient }, hit.damageType, targetState(world, target, hit.range), stats.level, ctx.rng);
  const dealt = applyDamage(world, ctx, target, result.final, {
    crit: result.crit,
    damageType: hit.damageType,
    dot: false,
    sourceTeam: team,
  });
  if (dealt === null) return null;
  markInCombat(world, attacker);
  if (hit.knockback > 0 && isAlive(world, target)) applyKnockback(world, target, hit.fromX, hit.fromZ, hit.knockback);
  for (const apply of hit.applies) applyStatus(world, ctx, target, apply, { team, level: stats.level, attacker });
  return dealt;
}

export interface DamageOptions {
  crit: boolean;
  damageType: DamageType;
  dot: boolean;
  sourceTeam: Team;
}

/**
 * Subtract already-mitigated damage from a target: barrier first, then life.
 * Returns the amount that reached life + barrier, or null if the target was immune.
 */
export function applyDamage(world: World, ctx: GameContext, target: Entity, amount: number, opts: DamageOptions): number | null {
  if (!isAlive(world, target)) return null;
  if (world.has(target, Invulnerable)) return null;
  const health = world.req(target, Health);
  const tr = world.get(target, Transform);
  const isPlayer = world.has(target, PlayerControlled);

  let remaining = Math.max(0, amount);
  let absorbed = 0;
  const effects = world.get(target, StatusEffects);
  if (effects) {
    for (const s of effects.list) {
      if (s.id !== 'barrier' || remaining <= 0) continue;
      const take = Math.min(s.amount, remaining);
      s.amount -= take;
      remaining -= take;
      absorbed += take;
    }
    effects.list = effects.list.filter((s) => s.id !== 'barrier' || s.amount > 0.01);
  }

  if (!(isPlayer && ctx.debug.godMode)) health.current -= remaining;
  markInCombat(world, target);
  const ai = world.get(target, EnemyAI);
  if (ai) ai.aggro = true;

  const resource = world.get(target, Resource);
  if (resource && remaining > 0 && resource.config.gainPerLifePercentLost > 0) {
    gainResource(resource, (remaining / health.max) * 100 * resource.config.gainPerLifePercentLost);
  }

  ctx.events.push({
    type: 'damage',
    target,
    x: tr?.x ?? 0,
    y: (tr?.y ?? 0) + 1.8,
    z: tr?.z ?? 0,
    amount: remaining,
    absorbed,
    crit: opts.crit,
    damageType: opts.damageType,
    toPlayer: isPlayer,
    dot: opts.dot,
  });

  if (health.current <= 0) {
    health.current = 0;
    const fallDir = tr ? Math.atan2(tr.x - (tr.prevX ?? tr.x), tr.z - (tr.prevZ ?? tr.z)) : 0;
    kill(world, ctx, target, fallDir);
  }
  return remaining + absorbed;
}

export function heal(world: World, ctx: GameContext, target: Entity, amount: number): number {
  if (!isAlive(world, target)) return 0;
  const health = world.req(target, Health);
  const before = health.current;
  health.current = Math.min(health.max, health.current + amount);
  const healed = health.current - before;
  const tr = world.get(target, Transform);
  if (healed > 0 && tr) ctx.events.push({ type: 'heal', target, x: tr.x, y: tr.y + 1.8, z: tr.z, amount: healed });
  return healed;
}

export function gainResource(resource: Resource, amount: number): void {
  resource.current = Math.min(resource.max, Math.max(0, resource.current + amount));
}

export function markInCombat(world: World, e: Entity): void {
  const resource = world.get(e, Resource);
  if (resource) resource.sinceCombat = 0;
}

export function applyKnockback(world: World, target: Entity, fromX: number, fromZ: number, strength: number): void {
  const tr = world.get(target, Transform);
  const mover = world.get(target, Mover);
  if (!tr || !mover || world.has(target, ForcedMove)) return;
  let dx = tr.x - fromX;
  let dz = tr.z - fromZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) {
    dx = Math.sin(tr.facing + Math.PI);
    dz = Math.cos(tr.facing + Math.PI);
  } else {
    dx /= len;
    dz /= len;
  }
  // Heavier things budge less.
  const mass = Math.max(0.5, world.get(target, Collider)?.mass ?? 1);
  const speed = (strength * 4) / Math.sqrt(mass);
  world.add(target, Knockback, { vx: dx * speed, vz: dz * speed, remaining: 0.18 });
}

export interface StatusSource {
  team: Team;
  level: number;
  /** For coefficient-based DoTs: the attacker whose stats scale the damage. */
  attacker?: Entity;
}

export function applyStatus(world: World, ctx: GameContext, target: Entity, apply: StatusApply, source: StatusSource): void {
  if (!isAlive(world, target)) return;
  const effects = world.get(target, StatusEffects);
  if (!effects) return;
  const def = STATUS_DEFS[apply.status];

  const instance: StatusInstance = {
    id: apply.status,
    remaining: apply.duration,
    duration: apply.duration,
    dps: 0,
    amount: 0,
    pending: 0,
    sourceTeam: source.team,
    attackerLevel: source.level,
  };

  if (def.kind === 'dot') {
    if (apply.dps !== undefined) {
      instance.dps = apply.dps;
    } else if (apply.coefficient !== undefined && source.attacker !== undefined) {
      const stats = world.get(source.attacker, CombatStats);
      if (stats) {
        const total = computeOutgoing(
          { ...stats, coefficient: apply.coefficient },
          conditionsOf(world, target, null),
          null,
        ).outgoing;
        instance.dps = total / apply.duration;
      }
    }
    if (def.stacking === 'refresh') {
      const existing = effects.list.find((s) => s.id === apply.status);
      if (existing) {
        existing.dps = Math.max(existing.dps, instance.dps);
        existing.remaining = Math.max(existing.remaining, instance.remaining);
        existing.duration = Math.max(existing.duration, instance.duration);
        return;
      }
    } else {
      const stacks = effects.list.filter((s) => s.id === apply.status);
      if (stacks.length >= def.maxStacks) {
        // Replace the stack closest to expiring.
        const oldest = stacks.reduce((a, b) => (a.remaining <= b.remaining ? a : b));
        effects.list.splice(effects.list.indexOf(oldest), 1);
      }
    }
  } else if (def.kind === 'barrier') {
    const max = world.get(target, Health)?.max ?? 0;
    const bonus = 1 + (world.get(target, CombatStats)?.barrierBonus ?? 0);
    instance.amount = ((apply.amount ?? 0) + (apply.lifeFraction ?? 0) * max) * bonus;
  } else {
    // Slows, disables, vulnerable: one instance, longest duration wins.
    const existing = effects.list.find((s) => s.id === apply.status);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, instance.remaining);
      existing.duration = Math.max(existing.duration, instance.duration);
      return;
    }
  }

  effects.list.push(instance);
  if (def.kind === 'disable') {
    // A stunned enemy loses its wind-up; a stunned player loses their cast.
    const ai = world.get(target, EnemyAI);
    if (ai && ai.state === 'windup') {
      ai.state = 'recover';
      ai.timer = 0.2;
    }
    const user = world.get(target, SkillUser);
    if (user && user.cast && !user.cast.fired) user.cast = null;
  }
  ctx.events.push({ type: 'status', target, status: apply.status });
}

export function removeStatuses(world: World, target: Entity, predicate: (s: StatusInstance) => boolean): void {
  const effects = world.get(target, StatusEffects);
  if (effects) effects.list = effects.list.filter((s) => !predicate(s));
}

/** Mark an entity dead, trigger on-death effects and emit events. */
export function kill(world: World, ctx: GameContext, target: Entity, fallDir: number): void {
  if (world.has(target, Dead)) return;
  const isPlayer = world.has(target, PlayerControlled);
  const tr = world.get(target, Transform);
  world.add(target, Dead, { elapsed: 0, removeAfter: isPlayer ? Infinity : 2.4, fallDir });
  const mover = world.get(target, Mover);
  if (mover) {
    mover.vx = 0;
    mover.vz = 0;
  }
  world.remove(target, ForcedMove);
  const effects = world.get(target, StatusEffects);
  if (effects) effects.list = [];

  const ai = world.get(target, EnemyAI);
  if (ai) {
    const def = enemyDef(ai.defId);
    if (tr) {
      ctx.rewards.push({
        table: def.dropTable ?? `dt.${def.id}`,
        level: world.get(target, Level)?.value ?? 1,
        x: tr.x,
        z: tr.z,
        xp: true,
      });
    }
    if (def.onDeath && tr) {
      const hz = world.create();
      world.add(hz, Transform, makeTransform(tr.x, 0, tr.z));
      world.add(hz, Hazard, {
        team: 'enemy',
        radius: def.onDeath.hazard.radius,
        remaining: def.onDeath.hazard.duration,
        duration: def.onDeath.hazard.duration,
        tickTimer: 0,
        applies: def.onDeath.hazard.applies.map((a) => ({ status: a.status, duration: a.duration, dps: a.dps })),
        attackerLevel: world.get(target, CombatStats)?.level ?? 1,
      });
    }
    ctx.stats.kills++;
  }
  ctx.events.push({ type: 'death', target, x: tr?.x ?? 0, z: tr?.z ?? 0, isPlayer });
}

/** Resolve a mitigated DoT tick for a target (used by the status system). */
export function dotTaken(world: World, target: Entity, amount: number, type: DamageType, attackerLevel: number): number {
  return computeTaken(amount, type, targetState(world, target, null), attackerLevel).final;
}
