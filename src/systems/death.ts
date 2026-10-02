/** Advances corpses and removes them after their linger time. */
import { Dead } from '../core/components';
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';

export function deathSystem(world: World, dt: number, _ctx: GameContext): void {
  for (const e of world.query(Dead)) {
    const dead = world.req(e, Dead);
    dead.elapsed += dt;
    if (dead.elapsed >= dead.removeAfter) world.destroyDeferred(e);
  }
}
