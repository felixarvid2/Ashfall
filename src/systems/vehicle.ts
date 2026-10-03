/**
 * The motorbike (docs/world-and-gameplay.md §2.3, unlocked by "Spare Parts" in the Refinery
 * District): summoned with a key in the open world, much faster than walking. Using a skill, a
 * strong hit, a hub or a dungeon puts you back on your feet.
 */
import { Dead, Health, Mounted, PlayerControlled, SkillUser, Transform } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import { applyStatus } from './combat';
import { hubAt } from '../world/zone';

export const BIKE = {
  speedMul: 1.9,
  /** Quest that unlocks it. */
  unlock: 'sq.spare_parts',
  /** A single hit this large (share of max life) throws you off. */
  knockOff: 0.12,
};

export function bikeUnlocked(ctx: GameContext): boolean {
  return ctx.quests?.done.has(BIKE.unlock) ?? false;
}

export function dismount(world: World, ctx: GameContext, e: Entity, thrown = false): void {
  if (!world.has(e, Mounted)) return;
  world.remove(e, Mounted);
  const tr = world.req(e, Transform);
  ctx.events.push({ type: 'vfx', kind: 'dodge', x: tr.x, z: tr.z, radius: 1.4, facing: tr.facing });
  if (thrown) applyStatus(world, ctx, e, { status: 'stunned', duration: 0.5 }, { team: 'enemy', level: 1 });
}

export function vehicleSystem(world: World, _dt: number, ctx: GameContext): void {
  const player = world.first(PlayerControlled, Transform);
  if (player === undefined) return;
  const tr = world.req(player, Transform);
  const mounted = world.get(player, Mounted);
  const health = world.req(player, Health);
  if (mounted) {
    const user = world.get(player, SkillUser);
    const hit = mounted.lastLife - health.current;
    if (world.has(player, Dead) || ctx.instance || hubAt(ctx.zone, tr.x, tr.z)) dismount(world, ctx, player);
    else if (hit >= health.max * BIKE.knockOff) {
      dismount(world, ctx, player, true);
      ctx.events.push({ type: 'notice', key: 'bike.thrown' });
    } else if (user?.cast) dismount(world, ctx, player);
    else mounted.lastLife = health.current;
  }
  if (!ctx.input.wasPressed('mount')) return;
  if (world.has(player, Mounted)) {
    dismount(world, ctx, player);
    return;
  }
  if (!bikeUnlocked(ctx)) {
    ctx.events.push({ type: 'notice', key: 'bike.locked' });
    return;
  }
  if (world.has(player, Dead) || ctx.instance || !ctx.zone || hubAt(ctx.zone, tr.x, tr.z)) {
    ctx.events.push({ type: 'notice', key: 'bike.notHere' });
    return;
  }
  world.add(player, Mounted, { speedMul: BIKE.speedMul, lastLife: health.current });
  ctx.events.push({ type: 'vfx', kind: 'dodge', x: tr.x, z: tr.z, radius: 1.6, facing: tr.facing });
}
