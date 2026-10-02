/**
 * Turns player input into intent: movement, skill requests, dodge and potion.
 *
 * WASD mode: keys move, left/right mouse cast the first two slots at the cursor.
 * Click mode: left-click moves or attacks the enemy under the cursor,
 * Shift + left-click attacks in place, right-click casts slot 2.
 */
import type { GameContext } from '../core/context';
import type { Entity, World } from '../core/ecs';
import {
  AttackTarget,
  Collider,
  Dead,
  MoveTarget,
  Mover,
  PlayerControlled,
  SkillUser,
  Transform,
  type SkillUser as SkillUserData,
} from '../core/components';
import { skill } from '../data/db';
import type { Action } from '../data/settings';
import { isAlive } from './combat';
import { enemyNear } from './targeting';

const SLOT_KEYS: Action[] = ['skill1', 'skill2', 'skill3', 'skill4'];
/** How long a skill press stays buffered while the character is busy. */
const BUFFER = 0.25;

function request(user: SkillUserData, slot: number, aim: { x: number; z: number }): void {
  if (!user.slots[slot]) return;
  user.request = { slot, aimX: aim.x, aimZ: aim.z, ttl: BUFFER };
}

export function playerControlSystem(world: World, _dt: number, ctx: GameContext): void {
  for (const e of world.query(PlayerControlled, Mover)) {
    const mover = world.req(e, Mover);
    if (world.has(e, Dead)) {
      mover.vx = mover.vz = 0;
      world.remove(e, MoveTarget);
      world.remove(e, AttackTarget);
      continue;
    }
    const tr = world.req(e, Transform);
    const user = world.get(e, SkillUser);
    const input = ctx.input;
    const ground = ctx.pickGround();
    // Without a cursor (e.g. before the mouse moves), aim straight ahead.
    const aim = ground ?? { x: tr.x + Math.sin(tr.facing) * 3, z: tr.z + Math.cos(tr.facing) * 3 };

    const moveDir = wasdDirection(ctx);

    if (user) {
      if (input.wasPressed('potion')) user.potionRequested = true;
      if (input.wasPressed('dodge')) {
        // Dodge toward the movement direction if moving, else toward the cursor.
        const dir =
          ctx.settings.moveMode === 'wasd' && moveDir ? moveDir : { x: aim.x - tr.x, z: aim.z - tr.z };
        user.dodgeRequested = Math.hypot(dir.x, dir.z) > 1e-3 ? dir : { x: Math.sin(tr.facing), z: Math.cos(tr.facing) };
      }
      SLOT_KEYS.forEach((action, i) => {
        if (input.isDown(action)) request(user, i + 2, aim);
      });
      if (input.isMouseDown(2)) request(user, 1, aim);
    }

    if (ctx.settings.moveMode === 'click') {
      clickMode(world, ctx, e, mover, user, aim, ground !== null);
      continue;
    }

    // ---- WASD mode ----
    world.remove(e, MoveTarget);
    world.remove(e, AttackTarget);
    if (user && input.isMouseDown(0)) request(user, 0, aim);
    if (!moveDir) {
      mover.vx = 0;
      mover.vz = 0;
      continue;
    }
    mover.vx = moveDir.x * mover.speed;
    mover.vz = moveDir.z * mover.speed;
  }
}

/** Unit vector for held WASD keys, camera-relative; null when idle. */
function wasdDirection(ctx: GameContext): { x: number; z: number } | null {
  let ix = 0;
  let iz = 0;
  if (ctx.input.isDown('moveUp')) iz += 1;
  if (ctx.input.isDown('moveDown')) iz -= 1;
  if (ctx.input.isDown('moveRight')) ix += 1;
  if (ctx.input.isDown('moveLeft')) ix -= 1;
  if (ix === 0 && iz === 0) return null;
  const len = Math.hypot(ix, iz);
  ix /= len;
  iz /= len;
  const sin = Math.sin(ctx.cameraYaw);
  const cos = Math.cos(ctx.cameraYaw);
  // forward = (-sin, -cos), right = (cos, -sin) on the xz plane.
  return { x: iz * -sin + ix * cos, z: iz * -cos + ix * -sin };
}

function clickMode(
  world: World,
  ctx: GameContext,
  e: Entity,
  mover: Mover,
  user: SkillUserData | undefined,
  aim: { x: number; z: number },
  hasCursor: boolean,
): void {
  const input = ctx.input;
  if (input.isMouseDown(0) && hasCursor) {
    if (user && input.isDown('forceStand')) {
      world.remove(e, MoveTarget);
      world.remove(e, AttackTarget);
      request(user, 0, aim);
    } else {
      const enemy = enemyNear(world, ctx, aim.x, aim.z, 1.2);
      if (enemy !== null && user) {
        world.add(e, AttackTarget, { target: enemy });
        world.remove(e, MoveTarget);
      } else {
        world.remove(e, AttackTarget);
        world.add(e, MoveTarget, { x: aim.x, z: aim.z });
      }
    }
  }

  const order = world.get(e, AttackTarget);
  if (order && user) {
    if (!isAlive(world, order.target)) {
      world.remove(e, AttackTarget);
    } else {
      const tr = world.req(e, Transform);
      const tt = world.req(order.target, Transform);
      const basic = user.slots[0] ? skill(user.slots[0]) : null;
      const reach =
        (basic?.effect.kind === 'meleeArc' ? basic.effect.range : 2) + (world.get(order.target, Collider)?.radius ?? 0) - 0.3;
      if (Math.hypot(tt.x - tr.x, tt.z - tr.z) <= reach) {
        world.remove(e, MoveTarget);
        request(user, 0, { x: tt.x, z: tt.z });
        // Keep attacking only while the button is held, like classic ARPGs.
        if (!input.isMouseDown(0)) world.remove(e, AttackTarget);
      } else {
        world.add(e, MoveTarget, { x: tt.x, z: tt.z });
      }
    }
  }

  // Velocity is set by the movement system while a target exists.
  if (!world.has(e, MoveTarget)) {
    mover.vx = 0;
    mover.vz = 0;
  }
}
