/** Turns player input into movement intent (velocity or a click-to-move target). */
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import { MoveTarget, Mover, PlayerControlled } from '../core/components';

export function playerControlSystem(world: World, _dt: number, ctx: GameContext): void {
  for (const e of world.query(PlayerControlled, Mover)) {
    const mover = world.req(e, Mover);

    if (ctx.settings.moveMode === 'click') {
      if (ctx.input.isMouseDown(0)) {
        const point = ctx.pickGround();
        if (point) world.add(e, MoveTarget, { x: point.x, z: point.z });
      }
      // Velocity is set by the movement system while a target exists.
      if (!world.has(e, MoveTarget)) {
        mover.vx = 0;
        mover.vz = 0;
      }
      continue;
    }

    // WASD, relative to the camera: "up" walks away from the camera.
    let ix = 0;
    let iz = 0;
    if (ctx.input.isDown('moveUp')) iz += 1;
    if (ctx.input.isDown('moveDown')) iz -= 1;
    if (ctx.input.isDown('moveRight')) ix += 1;
    if (ctx.input.isDown('moveLeft')) ix -= 1;

    world.remove(e, MoveTarget);
    if (ix === 0 && iz === 0) {
      mover.vx = 0;
      mover.vz = 0;
      continue;
    }
    const len = Math.hypot(ix, iz);
    ix /= len;
    iz /= len;
    const sin = Math.sin(ctx.cameraYaw);
    const cos = Math.cos(ctx.cameraYaw);
    // forward = (-sin, -cos), right = (cos, -sin) on the xz plane.
    mover.vx = (iz * -sin + ix * cos) * mover.speed;
    mover.vz = (iz * -cos + ix * -sin) * mover.speed;
  }
}
