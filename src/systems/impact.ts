/**
 * Area hits and skill hazards shared by skills, projectiles, grenades, traps and summons.
 */
import { CombatStats, Faction, Hazard, Transform, makeTransform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import type { GameEvent } from '../core/events';
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
  if (team === 'player') hitDestructibles(world, x, z, radius, ctx);
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
    corruptedMul: impact.corruptedMul,
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

// ---- Hit feel (F001, F009): extra freeze and shake for hits taken, crits and kills ----------------------------

/** Tuning for the extra feel on top of a skill's own `hitstopMs` / `shake` (docs/improvements/feel.md F001, F009). */
export const FEEL = {
  /** A hit taken below this share of max life gives no shake. */
  hitTakenMinShare: 0.02,
  /** Shake trauma per share of max life lost, capped at `hitTakenMaxTrauma`. */
  hitTakenTrauma: 0.8,
  hitTakenMaxTrauma: 0.35,
  /** A hit taken above this share of max life also freezes the game briefly. */
  hitTakenStopShare: 0.15,
  hitTakenStopMs: 40,
  /** A crit lengthens the freeze (a light weapon's 10-15 ms is raised to `critMinBaseMs` first) and shakes a little. */
  critMul: 1.6,
  critMinBaseMs: 20,
  critMaxMs: 120,
  critShake: 0.08,
  /** The killing blow holds a little longer. */
  killExtraMs: 20,
  /** Elite and boss kills: a heavy shake and a short slow-motion beat (real seconds at `slowmoScale`). */
  bigKillTrauma: 0.35,
  slowmoSeconds: 0.25,
  slowmoScale: 0.25,
} as const;

export interface FrameFeel {
  /** Freeze to apply this frame (ms); 0 when the frame's own events ask for none. */
  hitstopMs: number;
  /** Extra camera trauma on top of the frame's own `shake` events. */
  trauma: number;
  /** Slow-motion beat in real seconds (0 = none). */
  slowmoS: number;
}

/** Freeze after a crit: 1.6x the skill's own value (at least 1.6 x 20 ms), never more than 120 ms. */
export function critHitstop(baseMs: number): number {
  return Math.min(FEEL.critMaxMs, Math.max(baseMs, FEEL.critMinBaseMs) * FEEL.critMul);
}

/** Shake trauma and freeze (ms) for a hit that took `amount` of `maxLife` from the player. */
export function hitTakenFeel(amount: number, maxLife: number): { trauma: number; hitstopMs: number } {
  if (!(maxLife > 0) || !(amount > 0)) return { trauma: 0, hitstopMs: 0 };
  const share = amount / maxLife;
  return {
    trauma: share < FEEL.hitTakenMinShare ? 0 : Math.min(FEEL.hitTakenMaxTrauma, FEEL.hitTakenTrauma * share),
    hitstopMs: share > FEEL.hitTakenStopShare ? FEEL.hitTakenStopMs : 0,
  };
}

/**
 * What one frame of events adds to the feel. Pure: `maxLife` is the player's life, `weightOf` says whether a dying
 * entity was an elite or a boss. The caller applies `hitstopMs` as a floor (max with its own freeze) and `trauma`
 * through the camera (which honours the screen-shake setting).
 */
export function frameFeel(events: readonly GameEvent[], maxLife: number, weightOf: (e: Entity) => 'elite' | 'boss' | null = () => null): FrameFeel {
  let baseStop = 0;
  let crit = false;
  let kill = false;
  let big = false;
  let takenTrauma = 0;
  let takenStop = 0;
  for (const ev of events) {
    switch (ev.type) {
      case 'hitstop':
        baseStop = Math.max(baseStop, ev.ms);
        break;
      case 'damage':
        if (ev.dot) break;
        if (ev.toPlayer) {
          const f = hitTakenFeel(ev.amount, maxLife);
          takenTrauma += f.trauma;
          takenStop = Math.max(takenStop, f.hitstopMs);
        } else if (ev.crit && ev.amount + ev.absorbed > 0) crit = true;
        break;
      case 'death':
        if (ev.isPlayer || ev.family === undefined) break;
        kill = true;
        if (weightOf(ev.target) !== null) big = true;
        break;
      default:
        break;
    }
  }
  let hitstopMs = baseStop;
  if (crit) hitstopMs = critHitstop(baseStop);
  if (kill) hitstopMs = Math.min(FEEL.critMaxMs, hitstopMs + FEEL.killExtraMs);
  hitstopMs = Math.max(hitstopMs, takenStop);
  // A frame with no freeze of its own and no crit/kill/hit taken stays at 0 (a floor, not a replacement).
  const trauma = Math.min(1, takenTrauma + (crit ? FEEL.critShake : 0) + (big ? FEEL.bigKillTrauma : 0));
  return { hitstopMs, trauma, slowmoS: big ? FEEL.slowmoSeconds : 0 };
}
