/**
 * The Core's behaviours (docs/regions/the-core.md), on top of the shared enemy AI: blinking Shade Hounds and
 * Light Beings, short-lived echoes, the Absorbed's first words, and the Choir's song. Behaviours that fit
 * existing machinery (lunges, pulls, shells, ally shields, curving bolts) live there, not here.
 */
import { Dead, EnemyAI, PlayerControlled, StatusEffects, Transform, type EnemyAI as EnemyAIData } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { CHOIR } from '../data/core';
import { enemyDef } from '../data/db';
import type { EnemyDef } from '../data/schemas';
import { caveGrid, nearestWalkable, walkableAt } from '../data/zones/caves';
import { applyStatus, kill } from './combat';
import { livingInCircle } from './targeting';

/**
 * Runs every tick, aggro or not. Returns true when the enemy is gone and the AI should skip it:
 * echoes fade at the end of their lifespan, the Absorbed speak once when they notice you.
 */
export function coreTick(world: World, ctx: GameContext, e: Entity, ai: EnemyAIData, def: EnemyDef, dt: number): boolean {
  if (def.named && ai.aggro && !ai.spoke) {
    ai.spoke = true;
    ctx.events.push({ type: 'banner', key: 'enemies.absorbedSays', keyParams: { name: def.named.name, line: def.named.line }, seconds: 4.5 });
  }
  if (def.lifespan !== undefined) {
    ai.age = (ai.age ?? 0) + dt;
    if (ai.age >= def.lifespan) {
      const tr = world.req(e, Transform);
      ctx.events.push({ type: 'vfx', kind: 'blink', x: tr.x, z: tr.z, radius: 1, facing: 0 });
      // They were never really there: no loot, no experience (their drop table is empty).
      kill(world, ctx, e, 0);
      return true;
    }
  }
  return false;
}

/** Where a blink lands, or null when there is no sensible spot. Ground creatures stay on walkable ground. */
export function blinkDestination(
  ctx: GameContext,
  def: EnemyDef,
  from: { x: number; z: number },
  target: { x: number; z: number },
  angleJitter: number,
): { x: number; z: number } | null {
  const b = def.blink;
  if (!b) return null;
  const toTarget = Math.atan2(target.x - from.x, target.z - from.z);
  let x: number;
  let z: number;
  if (b.mode === 'close') {
    // On the side it came from: `hop` metres from the target along the line back to where it stood.
    const away = toTarget + Math.PI + angleJitter * 0.4;
    x = target.x + Math.sin(away) * b.hop;
    z = target.z + Math.cos(away) * b.hop;
  } else {
    // A hop to one side, keeping the distance to the target.
    const side = toTarget + (angleJitter >= 0 ? 1 : -1) * (Math.PI / 2 + Math.abs(angleJitter) * 0.3);
    x = from.x + Math.sin(side) * b.hop;
    z = from.z + Math.cos(side) * b.hop;
  }
  if (def.hover === 0 && ctx.zone && !ctx.instance) {
    const g = caveGrid(ctx.zone.def);
    if (g && !walkableAt(g, x, z)) return nearestWalkable(g, x, z, 8);
  }
  return { x, z };
}

/**
 * Runs before the attack logic of an aggro'd enemy. Returns true while it holds the enemy still (a blink
 * being prepared), false once the normal AI should carry on.
 */
export function coreAct(world: World, ctx: GameContext, _e: Entity, ai: EnemyAIData, def: EnemyDef, tr: Transform, dt: number): boolean {
  const b = def.blink;
  if (!b || !ai.aggro) return false;
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined || world.has(player, Dead)) return false;
  const pt = world.req(player, Transform);

  if (ai.blinkAt) {
    // The flicker before the blink: it holds still, then is gone.
    ai.blinkAt.t -= dt;
    if (ai.blinkAt.t > 0) return true;
    const to = blinkDestination(ctx, def, tr, pt, (ctx.rng.next() - 0.5) * 2);
    ai.blinkAt = undefined;
    ai.blinkTimer = b.every * ctx.rng.range(0.8, 1.2);
    if (!to) return false;
    ctx.events.push({ type: 'vfx', kind: 'blink', x: tr.x, z: tr.z, radius: 1.2, facing: 0 });
    tr.x = tr.prevX = to.x;
    tr.z = tr.prevZ = to.z;
    tr.facing = Math.atan2(pt.x - to.x, pt.z - to.z);
    ctx.events.push({ type: 'vfx', kind: 'blink', x: to.x, z: to.z, radius: 1.2, facing: 0 });
    // Arrived ready: the leap or the shot follows at once.
    ai.state = 'chase';
    ai.cooldown = 0;
    return false;
  }

  // The first blink comes as soon as it has you in range: a `close` blink is the hound's opening move (a fast hound
  // would be on you before a timer ran out), a `strafe` hop comes a moment after it spots you.
  ai.blinkTimer = (ai.blinkTimer ?? (b.mode === 'close' ? 0 : b.every * ctx.rng.range(0.1, 0.5))) - dt;
  if (ai.blinkTimer > 0 || ai.state === 'windup' || ai.state === 'recover') return false;
  const d = Math.hypot(pt.x - tr.x, pt.z - tr.z);
  if (d < b.minRange || d > b.maxRange) return false;
  ai.blinkAt = { x: tr.x, z: tr.z, t: b.warning, fromX: tr.x, fromZ: tr.z };
  ctx.events.push({ type: 'vfx', kind: 'blink', x: tr.x, z: tr.z, radius: 0.8, facing: 0 });
  return b.warning > 0;
}

/**
 * The Choir: while a singer lives, every other enemy within its radius is Empowered (+25 % damage, +15 % speed,
 * see `empowered` in combat.ts, enemyAI.ts and status.ts). The status is short and renewed each pulse, so it ends
 * by itself soon after the last singer dies or an enemy walks out of range.
 */
export function choirAura(world: World, ctx: GameContext, dt: number): void {
  for (const s of world.query(EnemyAI, Transform)) {
    if (world.has(s, Dead)) continue;
    const ai = world.req(s, EnemyAI);
    if (!enemyDef(ai.defId).choir) continue;
    ai.choirTimer = (ai.choirTimer ?? 0) - dt;
    if (ai.choirTimer > 0) continue;
    ai.choirTimer = CHOIR.pulse;
    const tr = world.req(s, Transform);
    for (const o of livingInCircle(world, ctx, tr.x, tr.z, CHOIR.radius, 'enemy')) {
      const oai = world.get(o, EnemyAI);
      if (!oai || !world.has(o, StatusEffects) || enemyDef(oai.defId).choir) continue;
      applyStatus(world, ctx, o, { status: 'empowered', duration: CHOIR.duration }, { team: 'enemy', level: 1 });
    }
  }
}

/** Living singers (renderer: link beams and the aura). */
export function singers(world: World): Entity[] {
  return world.query(EnemyAI, Transform).filter((e) => !world.has(e, Dead) && enemyDef(world.req(e, EnemyAI).defId).choir);
}
