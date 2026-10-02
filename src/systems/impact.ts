/**
 * Area hits and skill hazards shared by skills, projectiles, grenades, traps and summons.
 */
import { CombatStats, Faction, Hazard, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { Impact, StatusApply } from '../data/schemas';
import { dealHit, heal } from './combat';
import { angleDelta } from './movement';
import type { CompiledSkill } from './skillCompile';
import { livingInCircle, opposingTeam } from './targeting';
import { hitDestructibles } from '../world/interactables';

/**
 * Hit every opposing living entity in a circle (optionally limited to an arc).
 * Returns the number of targets hit and emits hit-stop/shake when anything was hit.
 */
export function impactArea(
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
  exclude?: readonly Entity[],
): number {
  const team = world.get(caster, Faction)?.team ?? 'player';
  let hits = 0;
  const halfArc = arc ? (arc.arcDeg * Math.PI) / 360 : Math.PI;
  for (const target of livingInCircle(world, ctx, x, z, radius, opposingTeam(team))) {
    if (target === caster || exclude?.includes(target)) continue;
    const tt = world.req(target, Transform);
    if (arc && Math.hypot(tt.x - x, tt.z - z) > 0.3) {
      const angle = Math.atan2(tt.x - x, tt.z - z);
      if (Math.abs(angleDelta(arc.facing, angle)) > halfArc) continue;
    }
    if (hitOne(world, ctx, caster, target, x, z, impact, extraApplies, bonuses) !== null) hits++;
  }
  // Player attacks set off explosive barrels.
  if (team === 'player') hitDestructibles(world, x, z, radius);
  if (hits > 0) {
    if (impact.hitstopMs > 0) ctx.events.push({ type: 'hitstop', ms: impact.hitstopMs });
    if (impact.shake > 0) ctx.events.push({ type: 'shake', trauma: impact.shake });
  }
  return hits;
}

/** One skill hit on one target. */
export function hitOne(
  world: World,
  ctx: GameContext,
  caster: Entity,
  target: Entity,
  fromX: number,
  fromZ: number,
  impact: Impact,
  extraApplies: readonly StatusApply[] = [],
  bonuses?: CompiledSkill['bonuses'],
): number | null {
  const dealt = dealHit(world, ctx, caster, target, {
    coefficient: impact.coefficient,
    damageType: impact.damageType,
    knockback: impact.knockback,
    fromX,
    fromZ,
    applies: [...impact.applies, ...extraApplies],
    range: impact.delivery,
    ...(bonuses ? { bonuses } : {}),
  });
  if (dealt !== null && impact.lifeSteal > 0) heal(world, ctx, caster, dealt * impact.lifeSteal);
  return dealt;
}

/** Burning/poison areas left by skill modifiers (Rupture, Crater, Fissure aspect…). */
export function spawnHazards(world: World, caster: Entity, x: number, z: number, compiled: CompiledSkill): void {
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
