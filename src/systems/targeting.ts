/** Helpers for finding entities in areas, used by skills, AI and the cursor. */
import { Collider, Dead, EnemyAI, Faction, Health, Transform, type Team } from '../core/components';
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';

const scratch: Entity[] = [];

/** Living entities of `team` whose collider overlaps the circle. */
export function livingInCircle(world: World, ctx: GameContext, x: number, z: number, radius: number, team: Team): Entity[] {
  const result: Entity[] = [];
  for (const e of ctx.spatial.queryCircle(x, z, radius, scratch)) {
    if (!world.has(e, Health) || world.has(e, Dead)) continue;
    if (world.get(e, Faction)?.team !== team) continue;
    result.push(e);
  }
  return result;
}

export function opposingTeam(team: Team): Team {
  return team === 'player' ? 'enemy' : 'player';
}

/** Nearest living enemy to a ground point, within `tolerance` of its collider edge. */
export function enemyNear(world: World, ctx: GameContext, x: number, z: number, tolerance = 1): Entity | null {
  let best: Entity | null = null;
  let bestDist = Infinity;
  for (const e of livingInCircle(world, ctx, x, z, tolerance, 'enemy')) {
    if (!world.has(e, EnemyAI)) continue;
    const tr = world.req(e, Transform);
    const d = Math.hypot(tr.x - x, tr.z - z) - (world.get(e, Collider)?.radius ?? 0);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}
