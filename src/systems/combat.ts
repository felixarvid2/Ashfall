/**
 * Applying hits, damage, statuses, healing and death to entities.
 * Pure formula lives in damage.ts; this module mutates the world and emits events.
 */
import { PYLON_EFFECTS } from '../data/interactables';
import {
  Blast,
  Boss,
  Collider,
  CombatStats,
  Dead,
  Elite,
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
  Projectile,
  QuestTag,
  Resource,
  SkillUser,
  StatusEffects,
  Summon,
  Transform,
  makeTransform,
  type StatusInstance,
  type Team,
} from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { STATUS_DEFS, enemyDef } from '../data/db';
import type { Bonus, Condition, DamageType, StatusApply, StatusId } from '../data/schemas';
import { computeHit, computeOutgoing, computeTaken, type TargetState } from './damage';
import { signal } from './quests';
import { eliteDeath, onEliteHit } from './elites';
import { spawnEnemy } from '../world/spawn';
import { isLit } from '../world/underground';

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
      if (s.id === 'vulnerable' || s.id === 'burning' || s.id === 'poisoned' || s.id === 'chilled' || s.id === 'marked') set.add(s.id);
      if (s.id === 'stunned' || s.id === 'frozen') set.add('stunned');
    }
  }
  if (world.get(e, CombatStats)?.tags.includes('elite')) set.add('elite');
  if (attackRange) set.add(attackRange);
  return set;
}

/** Conditions about the attacker itself ("while you have a barrier", "while Heat is high"). */
export function attackerConditions(world: World, e: Entity): Condition[] {
  const out: Condition[] = [];
  const r = world.get(e, Resource);
  if (r && r.current >= r.max * 0.7) out.push('highResource');
  if (hasStatus(world, e, 'barrier')) out.push('hasBarrier');
  if (hasStatus(world, e, 'evasive')) out.push('evasive');
  if (hasStatus(world, e, 'stealth')) out.push('stealthed');
  if (world.get(e, Summon)?.kind === 'minion') out.push('minion');
  return out;
}

export function targetState(world: World, e: Entity, attackRange: 'melee' | 'ranged' | null): TargetState {
  const stats = world.get(e, CombatStats);
  const vulnDef = STATUS_DEFS.vulnerable;
  const markDef = STATUS_DEFS.marked;
  const marked = markDef.kind === 'mark' && hasStatus(world, e, 'marked') ? markDef.damageTakenMultiplier : 1;
  const wardDef = STATUS_DEFS.chitin;
  const ward = wardDef.kind === 'ward' && hasStatus(world, e, 'chitin') ? 1 - wardDef.damageReduction : 1;
  return {
    armor: stats?.armor ?? 0,
    resist: stats?.resist ?? {},
    vulnerable: hasStatus(world, e, 'vulnerable'),
    vulnerableMultiplier: vulnDef.kind === 'vulnerable' ? vulnDef.damageTakenMultiplier : 1.2,
    conditions: conditionsOf(world, e, attackRange),
    damageTakenMultiplier: (1 - (stats?.damageReduction ?? 0)) * marked * ward,
  };
}

export interface HitSpec {
  /** Extra damage bonuses that apply only to this hit (skill modifiers). */
  bonuses?: { additive: readonly Bonus[]; multiplicative: readonly Bonus[] };
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
  // Evasive swarms slip some of the player's hits.
  const targetAi = world.get(target, EnemyAI);
  if (team === 'player' && targetAi) {
    const evasion = enemyDef(targetAi.defId).evasion;
    if (evasion > 0 && ctx.rng.next() < evasion) {
      const tt = world.req(target, Transform);
      ctx.events.push({ type: 'miss', x: tt.x, y: 1.4, z: tt.z });
      return null;
    }
  }
  // Crystal-Bound Walkers throw some shots back at the shooter.
  if (team === 'player' && targetAi && hit.range === 'ranged') {
    const reflect = enemyDef(targetAi.defId).reflect;
    if (reflect > 0 && ctx.rng.next() < reflect && isAlive(world, attacker)) {
      const tt = world.req(target, Transform);
      ctx.events.push({ type: 'vfx', kind: 'shield', x: tt.x, z: tt.z, radius: 1, facing: 0 });
      const back = (world.get(target, CombatStats)?.weaponDamage ?? 0) * 0.8;
      if (back > 0) applyDamage(world, ctx, attacker, computeTaken(back, 'energy', targetState(world, attacker, 'ranged'), world.get(target, CombatStats)?.level ?? 1).final, { crit: false, damageType: 'energy', dot: false, sourceTeam: 'enemy' });
      return null;
    }
  }
  const state = targetState(world, target, hit.range);
  const conditions = new Set(state.conditions);
  for (const c of attackerConditions(world, attacker)) conditions.add(c);
  // Attacking from stealth is a guaranteed crit and reveals the attacker.
  const stealthed = hasStatus(world, attacker, 'stealth');
  const input = {
    ...stats,
    ...(stealthed ? { critChance: 1 } : {}),
    coefficient: hit.coefficient,
    additive: hit.bonuses ? [...stats.additive, ...hit.bonuses.additive] : stats.additive,
    multiplicative: [
      ...stats.multiplicative,
      ...(hit.bonuses?.multiplicative ?? []),
      // Overcharge pylon.
      ...(hasStatus(world, attacker, 'overcharge') ? [{ value: PYLON_EFFECTS.overchargeDamage, source: 'pylon' }] : []),
    ],
  };
  const result = computeHit(input, hit.damageType, { ...state, conditions }, stats.level, ctx.rng);
  // A Crystal Sentinel's shell sends part of each hit back.
  if (team === 'player' && targetAi && (targetAi.shell ?? 0) > 0 && isAlive(world, attacker)) {
    const shell = enemyDef(targetAi.defId).shell;
    if (shell && shell.reflect > 0 && hit.damageType === 'physical') {
      applyDamage(world, ctx, attacker, result.final * shell.reflect, { crit: false, damageType: 'physical', dot: true, sourceTeam: 'enemy' });
    }
  }
  const dealt = applyDamage(world, ctx, target, result.final * frontShieldFactor(world, target, hit.fromX, hit.fromZ) * domeFactor(world, ctx, target, hit.range, team), {
    crit: result.crit,
    damageType: hit.damageType,
    dot: false,
    sourceTeam: team,
  });
  if (dealt === null) return null;
  if (stealthed) removeStatuses(world, attacker, (st) => st.id === 'stealth');
  onEliteHit(world, ctx, attacker, target, dealt);
  // Chitin thorns: melee attackers take damage back.
  const wardDef = STATUS_DEFS.chitin;
  if (hit.range === 'melee' && wardDef.kind === 'ward' && hasStatus(world, target, 'chitin') && isAlive(world, attacker)) {
    const thorns = (world.get(target, CombatStats)?.weaponDamage ?? 0) * wardDef.thornsCoefficient;
    if (thorns > 0) applyDamage(world, ctx, attacker, thorns, { crit: false, damageType: 'physical', dot: true, sourceTeam: world.get(target, Faction)?.team ?? 'player' });
  }
  markInCombat(world, attacker);
  const attackerResource = world.get(attacker, Resource);
  if (result.crit && attackerResource && attackerResource.config.onCrit > 0) gainResource(attackerResource, attackerResource.config.onCrit);
  if (hit.knockback !== 0 && isAlive(world, target)) applyKnockback(world, target, hit.fromX, hit.fromZ, hit.knockback);
  for (const apply of hit.applies) applyStatus(world, ctx, target, apply, { team, level: stats.level, attacker });
  return dealt;
}

/** Shield Officers' domes cut ranged damage to the enemies inside them. */
function domeFactor(world: World, ctx: GameContext, target: Entity, range: 'melee' | 'ranged', team: string): number {
  if (team !== 'player' || range !== 'ranged' || !world.has(target, EnemyAI)) return 1;
  const tt = world.req(target, Transform);
  for (const e of world.query(EnemyAI, Transform)) {
    const ai = world.req(e, EnemyAI);
    if ((ai.domeUntil ?? 0) <= ctx.time || world.has(e, Dead)) continue;
    const dome = enemyDef(ai.defId).dome;
    if (!dome) continue;
    const t = world.req(e, Transform);
    if (Math.hypot(t.x - tt.x, t.z - tt.z) <= dome.radius) return 1 - dome.reduction;
  }
  return 1;
}

/** Riot shields: enemies with `frontShield` block part of hits that come from in front of them. */
function frontShieldFactor(world: World, target: Entity, fromX: number, fromZ: number): number {
  const ai = world.get(target, EnemyAI);
  if (!ai) return 1;
  const def = enemyDef(ai.defId);
  // A raised fire shield (Smelters) blocks more than a permanent riot shield.
  const shield = Math.max(def.frontShield, (ai.shieldUp ?? 0) > 0 ? (def.shield?.block ?? 0) : 0);
  if (shield <= 0 || hasStatus(world, target, 'stunned')) return 1;
  const tr = world.get(target, Transform);
  if (!tr) return 1;
  const angle = Math.atan2(fromX - tr.x, fromZ - tr.z);
  let d = angle - tr.facing;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= Math.PI / 3 ? 1 - shield : 1;
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
  // Burrowers underground cannot be hurt.
  if (world.get(target, EnemyAI)?.burrowed) return null;
  if (world.has(target, Invulnerable) || hasStatus(world, target, 'aegis')) {
    // Avoiding a hit by dodging feeds Focus.
    const r = world.get(target, Resource);
    if (r && !opts.dot && r.config.onAvoid > 0 && opts.sourceTeam !== world.get(target, Faction)?.team) gainResource(r, r.config.onAvoid);
    return null;
  }
  const health = world.req(target, Health);
  const tr = world.get(target, Transform);
  const isPlayer = world.has(target, PlayerControlled);

  // Armoured or rooted bosses (the Warden) take less or nothing.
  let remaining = Math.max(0, amount) * (world.get(target, Boss)?.damageTaken ?? 1);
  const targetAi = world.get(target, EnemyAI);
  if (targetAi && opts.sourceTeam !== 'enemy') {
    const def = enemyDef(targetAi.defId);
    // Echoes come apart in the light.
    if (def.lightVulnerable !== 1 && tr && isLit(world, ctx, tr.x, tr.z)) remaining *= def.lightVulnerable;
    // Crystal shell: elemental damage does nothing; everything else chips the shell first.
    if ((targetAi.shell ?? 0) > 0) {
      if (opts.damageType !== 'physical') {
        if (!opts.dot && tr) ctx.events.push({ type: 'miss', x: tr.x, y: 1.4, z: tr.z });
        return null;
      }
      const take = Math.min(targetAi.shell!, remaining);
      targetAi.shell! -= take;
      remaining -= take;
      if (targetAi.shell! <= 0 && tr) {
        ctx.events.push({ type: 'vfx', kind: 'flash', x: tr.x, z: tr.z, radius: 2.5, facing: 0 });
        ctx.events.push({ type: 'shake', trauma: 0.2 });
      }
    }
  }
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

/** Seconds an enemy corpse lingers (and can be raised or detonated). */
export const CORPSE_TIME = 20;

const KNOCKBACK_TIME = 0.18;
const PULL_STOP_DISTANCE = 1.2;

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
  let speed = (strength * 4) / Math.sqrt(mass);
  // Negative strength pulls toward the origin, stopping short of it instead of overshooting.
  if (strength < 0) speed = -Math.min(-speed, Math.max(0, len - PULL_STOP_DISTANCE) / KNOCKBACK_TIME);
  world.add(target, Knockback, { vx: dx * speed, vz: dz * speed, remaining: KNOCKBACK_TIME });
}

export interface StatusSource {
  team: Team;
  level: number;
  /** For coefficient-based DoTs: the attacker whose stats scale the damage. */
  attacker?: Entity;
}

/**
 * Poison on a player lasts at most `max` seconds in a row however often it is reapplied (clouds tick,
 * swarms keep biting), then can't take hold for `rest` seconds, so it always wears off.
 */
export const PLAYER_POISON = { max: 5, rest: 2 };

export function applyStatus(world: World, ctx: GameContext, target: Entity, apply: StatusApply, source: StatusSource): void {
  if (!isAlive(world, target)) return;
  const effects = world.get(target, StatusEffects);
  if (!effects) return;
  const def = STATUS_DEFS[apply.status];
  let duration = apply.duration;
  if (apply.status === 'poisoned' && world.has(target, PlayerControlled)) {
    const { max, rest } = PLAYER_POISON;
    const poisoned = effects.list.some((s) => s.id === 'poisoned' && s.remaining > 0);
    if (!poisoned && (effects.poisonSince === undefined || ctx.time >= effects.poisonSince + max + rest)) effects.poisonSince = ctx.time;
    const end = (effects.poisonSince ?? ctx.time) + max;
    if (ctx.time >= end) return;
    duration = Math.min(duration, end - ctx.time);
  }

  const instance: StatusInstance = {
    id: apply.status,
    remaining: duration,
    duration,
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
        // Replace the stack with the least damage left (weak or nearly expired).
        const weakest = stacks.reduce((a, b) => (a.dps * a.remaining <= b.dps * b.remaining ? a : b));
        if (weakest.dps * weakest.remaining > instance.dps * instance.remaining) return;
        effects.list.splice(effects.list.indexOf(weakest), 1);
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
/**
 * Ground that hurts the player's side, left by an enemy (death clouds, burning trails). DoTs with
 * a `coefficient` scale with the enemy's level-scaled damage; `dps` values are used as they are.
 */
export function spawnEnemyHazard(
  world: World,
  owner: Entity,
  x: number,
  z: number,
  spec: { radius: number; duration: number; applies: StatusApply[]; color?: string | undefined },
): Entity {
  const stats = world.get(owner, CombatStats);
  const hz = world.create();
  world.add(hz, Transform, makeTransform(x, 0, z));
  world.add(hz, Hazard, {
    team: 'enemy',
    radius: spec.radius,
    remaining: spec.duration,
    duration: spec.duration,
    tickTimer: 0,
    ...(spec.color ? { color: spec.color } : {}),
    applies: spec.applies.map((a) => ({
      status: a.status,
      duration: a.duration,
      dps: a.dps ?? (a.coefficient !== undefined && stats ? (stats.weaponDamage * a.coefficient) / a.duration : undefined),
    })),
    attackerLevel: stats?.level ?? 1,
  });
  return hz;
}

export function kill(world: World, ctx: GameContext, target: Entity, fallDir: number): void {
  if (world.has(target, Dead)) return;
  const isPlayer = world.has(target, PlayerControlled);
  const tr = world.get(target, Transform);
  const wasMarked = hasStatus(world, target, 'marked');
  const isSummon = world.has(target, Summon);
  // Enemy bodies linger as corpses for Xenomant skills.
  const isEnemy = world.has(target, EnemyAI);
  world.add(target, Dead, {
    elapsed: 0,
    removeAfter: isPlayer ? Infinity : isSummon ? 0.6 : isEnemy ? CORPSE_TIME : 2.4,
    fallDir,
    corpse: isEnemy,
  });
  const mover = world.get(target, Mover);
  if (mover) {
    mover.vx = 0;
    mover.vz = 0;
  }
  world.remove(target, ForcedMove);
  const effects = world.get(target, StatusEffects);
  if (effects) effects.list = [];

  const ai = world.get(target, EnemyAI);
  // A Lumen Giant falls but regrows while one of its fungi still stands: no loot until it stays down.
  if (ai && tr && enemyDef(ai.defId).regrow && ai.fungi?.some((f) => isAlive(world, f))) {
    const regrow = enemyDef(ai.defId).regrow!;
    const dead = world.req(target, Dead);
    dead.removeAfter = Infinity;
    dead.corpse = false;
    ai.regrowAt = ctx.time + regrow.delay;
    ctx.events.push({ type: 'vfx', kind: 'sporePulse', x: tr.x, z: tr.z, radius: regrow.radius, facing: 0 });
    ctx.events.push({ type: 'banner', key: 'enemies.regrowing', seconds: 2 });
    ctx.events.push({ type: 'death', target, x: tr.x, z: tr.z, isPlayer: false });
    return;
  }
  if (ai) {
    const def = enemyDef(ai.defId);
    if (tr) {
      const tags = world.get(target, CombatStats)?.tags ?? [];
      const eliteTable = tags.includes('rare') ? 'dt.rare_elite' : tags.includes('champion') ? 'dt.champion' : null;
      // Mirror copies drop nothing.
      if (!world.get(target, Elite)?.copy) ctx.rewards.push({
        table: eliteTable ?? def.dropTable ?? `dt.${def.id}`,
        level: world.get(target, Level)?.value ?? 1,
        x: tr.x,
        z: tr.z,
        xp: true,
      });
    }
    if (def.onDeath?.hazard && tr) spawnEnemyHazard(world, target, tr.x, tr.z, def.onDeath.hazard);
    // Swarms burst out of the body.
    if (def.onDeath?.spawn && tr) {
      const level = world.get(target, CombatStats)?.level ?? 1;
      for (let i = 0; i < def.onDeath.spawn.count; i++) {
        const a = (i / def.onDeath.spawn.count) * Math.PI * 2;
        const m = spawnEnemy(world, def.onDeath.spawn.enemy, tr.x + Math.sin(a) * 1.2, tr.z + Math.cos(a) * 1.2, { level });
        world.req(m, EnemyAI).aggro = true;
      }
    }
    // Crystal shards fly out in a ring.
    if (def.onDeath?.shards && tr) {
      const sh = def.onDeath.shards;
      const stats = world.get(target, CombatStats);
      const level = stats?.level ?? 1;
      for (let i = 0; i < sh.count; i++) {
        const a = (i / sh.count) * Math.PI * 2;
        const p = world.create();
        world.add(p, Transform, makeTransform(tr.x, 1, tr.z, a));
        world.add(p, Projectile, {
          team: 'enemy',
          vx: Math.sin(a) * sh.speed,
          vz: Math.cos(a) * sh.speed,
          radius: 0.3,
          remaining: sh.range / sh.speed,
          damage: (stats?.weaponDamage ?? 20) * sh.coefficient,
          damageType: 'physical',
          attackerLevel: level,
          owner: target,
        });
      }
    }
    eliteDeath(world, ctx, target);
    ctx.stats.kills++;
    if (tr) {
      const quest = world.get(target, QuestTag)?.quest;
      signal(ctx, { type: 'kill', defId: ai.defId, x: tr.x, z: tr.z, ...(quest ? { quest } : {}) });
    }
    onEnemyDeath(world, ctx, target, wasMarked);
  }
  ctx.events.push({ type: 'death', target, x: tr?.x ?? 0, z: tr?.z ?? 0, isPlayer });
}

/** Resource rules that trigger when an enemy dies: mark refunds and nearby-death gains (Biomass). */
function onEnemyDeath(world: World, ctx: GameContext, target: Entity, wasMarked: boolean): void {
  const tr = world.get(target, Transform);
  const markDef = STATUS_DEFS.marked;
  for (const e of world.query(PlayerControlled, Resource)) {
    if (world.has(e, Dead)) continue;
    const r = world.req(e, Resource);
    if (wasMarked && markDef.kind === 'mark') gainResource(r, markDef.refund);
    const near = r.config.onNearbyDeath;
    const ptr = world.get(e, Transform);
    if (near && tr && ptr && Math.hypot(tr.x - ptr.x, tr.z - ptr.z) <= near.radius) gainResource(r, near.amount);
    // Chain Reaction pylon: the body explodes a moment later (which can chain further).
    if (tr && hasStatus(world, e, 'chainReaction')) {
      const blast = world.create();
      world.add(blast, Transform, makeTransform(tr.x, 0, tr.z));
      world.add(blast, Blast, {
        fuse: 0.15,
        radius: PYLON_EFFECTS.chainRadius,
        owner: e,
        coefficient: PYLON_EFFECTS.chainCoefficient,
        flat: 0,
        hurtsEnemies: true,
        player: null,
      });
    }
  }
  void ctx;
}

/** Resolve a mitigated DoT tick for a target (used by the status system). */
export function dotTaken(world: World, target: Entity, amount: number, type: DamageType, attackerLevel: number): number {
  return computeTaken(amount, type, targetState(world, target, null), attackerLevel).final;
}
