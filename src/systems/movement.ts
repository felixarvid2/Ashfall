/** Integrates movement on the ground plane and turns entities toward their heading. */
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import { Dead, ForcedMove, Knockback, MoveTarget, Mover, Transform } from '../core/components';

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

    // Leaps and dodges are driven by the forced-move system.
    if (world.has(e, ForcedMove)) continue;

    const dead = world.has(e, Dead);
    const kb = world.get(e, Knockback);
    if (dead) {
      mover.vx = 0;
      mover.vz = 0;
    }

    const target = dead ? undefined : world.get(e, MoveTarget);
    if (target) {
      const dx = target.x - tr.x;
      const dz = target.z - tr.z;
      const dist = Math.hypot(dx, dz);
      const speed = mover.speed * mover.speedMul;
      const step = speed * dt;
      if (dist <= Math.max(ARRIVE_DISTANCE, step)) {
        tr.x = target.x;
        tr.z = target.z;
        mover.vx = 0;
        mover.vz = 0;
        world.remove(e, MoveTarget);
      } else {
        mover.vx = (dx / dist) * speed;
        mover.vz = (dz / dist) * speed;
      }
    }

    let vx = mover.vx * (target ? 1 : mover.speedMul);
    let vz = mover.vz * (target ? 1 : mover.speedMul);
    if (kb) {
      vx += kb.vx;
      vz += kb.vz;
      kb.remaining -= dt;
      if (kb.remaining <= 0) world.remove(e, Knockback);
    }
    tr.x += vx * dt;
    tr.z += vz * dt;
    const limit = ctx.worldHalfSize;
    tr.x = Math.min(limit, Math.max(-limit, tr.x));
    tr.z = Math.min(limit, Math.max(-limit, tr.z));

    if (!dead && mover.speedMul > 0 && (mover.vx !== 0 || mover.vz !== 0)) {
      const desired = Math.atan2(mover.vx, mover.vz);
      const delta = angleDelta(tr.facing, desired);
      const maxTurn = mover.turnRate * dt;
      tr.facing += Math.abs(delta) <= maxTurn ? delta : Math.sign(delta) * maxTurn;
      // Keep facing in (-PI, PI] so interpolation stays short.
      tr.facing = angleDelta(0, tr.facing);
    }
  }
}
