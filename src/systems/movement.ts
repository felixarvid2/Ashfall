/** Integrates movement on the ground plane and turns entities toward their heading. */
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import { MoveTarget, Mover, Transform } from '../core/components';

const ARRIVE_DISTANCE = 0.08;

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function movementSystem(world: World, dt: number, ctx: GameContext): void {
  for (const e of world.query(Transform, Mover)) {
    const tr = world.req(e, Transform);
    const mover = world.req(e, Mover);
    tr.prevX = tr.x;
    tr.prevY = tr.y;
    tr.prevZ = tr.z;
    tr.prevFacing = tr.facing;

    const target = world.get(e, MoveTarget);
    if (target) {
      const dx = target.x - tr.x;
      const dz = target.z - tr.z;
      const dist = Math.hypot(dx, dz);
      const step = mover.speed * dt;
      if (dist <= Math.max(ARRIVE_DISTANCE, step)) {
        tr.x = target.x;
        tr.z = target.z;
        mover.vx = 0;
        mover.vz = 0;
        world.remove(e, MoveTarget);
      } else {
        mover.vx = (dx / dist) * mover.speed;
        mover.vz = (dz / dist) * mover.speed;
      }
    }

    tr.x += mover.vx * dt;
    tr.z += mover.vz * dt;
    const limit = ctx.worldHalfSize;
    tr.x = Math.min(limit, Math.max(-limit, tr.x));
    tr.z = Math.min(limit, Math.max(-limit, tr.z));

    if (mover.vx !== 0 || mover.vz !== 0) {
      const desired = Math.atan2(mover.vx, mover.vz);
      const delta = angleDelta(tr.facing, desired);
      const maxTurn = mover.turnRate * dt;
      tr.facing += Math.abs(delta) <= maxTurn ? delta : Math.sign(delta) * maxTurn;
      // Keep facing in (-PI, PI] so interpolation stays short.
      tr.facing = angleDelta(0, tr.facing);
    }
  }
}
