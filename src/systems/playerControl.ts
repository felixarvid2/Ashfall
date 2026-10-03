/**
 * Turns player input into intent: movement, skill requests, dodge and potion.
 *
 * Click mode (default, like Diablo): left-click walks to the ground under the cursor, attacks the
 * enemy under it, picks up the item under it or walks to the object under it and uses it. Holding the
 * button keeps walking toward the cursor (or attacking whatever is under it). Shift + left-click
 * attacks in place; right-click casts slot 2; 1–4 cast at the cursor.
 * WASD mode: keys move, left/right mouse cast the first two slots at the cursor.
 * Touch (phones): a joystick moves, the attack button hits the nearest enemy, skill buttons aim at
 * the nearest enemy, and tapping the screen works like a left-click.
 */
import type { GameContext, TouchState } from '../core/context';
import type { Entity, World } from '../core/ecs';
import {
  AttackTarget,
  Collider,
  Dead,
  GroundItem,
  Interactable,
  InteractTarget,
  MoveTarget,
  Mover,
  PickupTarget,
  PlayerControlled,
  SkillUser,
  Transform,
  type SkillUser as SkillUserData,
} from '../core/components';
import { skill } from '../data/db';
import type { SkillDef } from '../data/schemas';
import type { Action } from '../data/settings';
import { isAlive } from './combat';
import { enemyNear } from './targeting';

const SLOT_KEYS: Action[] = ['skill1', 'skill2', 'skill3', 'skill4'];
/** How long a skill press stays buffered while the character is busy. */
const BUFFER = 0.25;
/** How close to an object or item the cursor must be to click it (m). */
const CLICK_REACH = 1.3;
/** Touch: the attack button and skills look for enemies this far away (m). */
const TOUCH_SEEK = 12;
/** Touch: joystick deflection below this is ignored. */
const DEAD_ZONE = 0.18;

function request(user: SkillUserData, slot: number, aim: { x: number; z: number }): void {
  if (!user.slots[slot]) return;
  user.request = { slot, aimX: aim.x, aimZ: aim.z, ttl: BUFFER };
}

/** How far a skill reaches: melee range, or most of a ranged skill's range (m). */
export function skillReach(def: SkillDef | null): number {
  if (!def) return 2;
  const effect = def.effect as { kind: string; range?: number; maxRange?: number };
  if (effect.kind === 'meleeArc') return effect.range ?? 2;
  if (effect.maxRange !== undefined) return effect.maxRange * 0.85;
  if (effect.range !== undefined) return effect.range;
  return 2;
}

export function playerControlSystem(world: World, _dt: number, ctx: GameContext): void {
  for (const e of world.query(PlayerControlled, Mover)) {
    const mover = world.req(e, Mover);
    if (world.has(e, Dead)) {
      mover.vx = mover.vz = 0;
      clearOrders(world, e);
      continue;
    }
    const tr = world.req(e, Transform);
    const user = world.get(e, SkillUser);
    const input = ctx.input;
    const touch = input.touch ?? null;
    const ground = ctx.pickGround();
    // Without a cursor (e.g. before the mouse moves), aim straight ahead.
    const ahead = { x: tr.x + Math.sin(tr.facing) * 3, z: tr.z + Math.cos(tr.facing) * 3 };
    const aim = ground ?? ahead;

    if (touch) {
      touchMode(world, ctx, e, mover, user, touch, ground);
      continue;
    }

    const moveDir = ctx.settings.moveMode === 'wasd' ? wasdDirection(ctx, null) : null;

    if (user) {
      if (input.wasPressed('potion')) user.potionRequested = true;
      if (input.wasPressed('dodge')) {
        // Dodge toward the movement direction if moving, else toward the cursor.
        const dir = moveDir ?? { x: aim.x - tr.x, z: aim.z - tr.z };
        user.dodgeRequested = Math.hypot(dir.x, dir.z) > 1e-3 ? dir : { x: Math.sin(tr.facing), z: Math.cos(tr.facing) };
      }
      SLOT_KEYS.forEach((action, i) => {
        if (input.isDown(action) || input.wasPressed(action)) request(user, i + 2, aim);
      });
      if (input.isMouseDown(2) || input.wasMousePressed(2)) request(user, 1, aim);
    }

    if (ctx.settings.moveMode === 'click') {
      clickMode(world, ctx, e, mover, user, aim, ground !== null);
      continue;
    }

    // ---- WASD mode ----
    world.remove(e, AttackTarget);
    world.remove(e, InteractTarget);
    // Clicking a ground item walks to it until a movement key is pressed.
    if (world.has(e, PickupTarget) && !moveDir) continue;
    world.remove(e, PickupTarget);
    world.remove(e, MoveTarget);
    if (user && (input.isMouseDown(0) || input.wasMousePressed(0))) request(user, 0, aim);
    if (!moveDir) {
      mover.vx = 0;
      mover.vz = 0;
      continue;
    }
    mover.vx = moveDir.x * mover.speed;
    mover.vz = moveDir.z * mover.speed;
  }
}

function clearOrders(world: World, e: Entity): void {
  world.remove(e, MoveTarget);
  world.remove(e, AttackTarget);
  world.remove(e, InteractTarget);
  world.remove(e, PickupTarget);
}

/**
 * Camera-relative unit vector for held WASD keys (or a joystick, in screen space with +y up);
 * null when idle.
 */
function wasdDirection(ctx: GameContext, stick: { x: number; y: number } | null): { x: number; z: number } | null {
  let ix = 0;
  let iz = 0;
  if (stick) {
    if (Math.hypot(stick.x, stick.y) < DEAD_ZONE) return null;
    ix = stick.x;
    iz = stick.y;
  } else {
    if (ctx.input.isDown('moveUp')) iz += 1;
    if (ctx.input.isDown('moveDown')) iz -= 1;
    if (ctx.input.isDown('moveRight')) ix += 1;
    if (ctx.input.isDown('moveLeft')) ix -= 1;
  }
  if (ix === 0 && iz === 0) return null;
  const len = Math.hypot(ix, iz);
  ix /= len;
  iz /= len;
  const sin = Math.sin(ctx.cameraYaw);
  const cos = Math.cos(ctx.cameraYaw);
  // forward = (-sin, -cos), right = (cos, -sin) on the xz plane.
  return { x: iz * -sin + ix * cos, z: iz * -cos + ix * -sin };
}

/** The nearest ground item or usable object within CLICK_REACH of a point. */
export function clickableAt(world: World, ctx: GameContext, x: number, z: number): { kind: 'item' | 'object'; target: Entity } | null {
  let best: { kind: 'item' | 'object'; target: Entity } | null = null;
  let bestD = CLICK_REACH;
  for (const e of world.query(GroundItem, Transform)) {
    const tr = world.req(e, Transform);
    const d = Math.hypot(tr.x - x, tr.z - z);
    if (d < bestD) {
      bestD = d;
      best = { kind: 'item', target: e };
    }
  }
  if (best) return best;
  for (const e of world.query(Interactable, Transform)) {
    const it = world.req(e, Interactable);
    if (it.used || it.readyAt > ctx.time) continue;
    const tr = world.req(e, Transform);
    const d = Math.hypot(tr.x - x, tr.z - z) - (world.get(e, Collider)?.radius ?? 0);
    if (d < bestD) {
      bestD = d;
      best = { kind: 'object', target: e };
    }
  }
  return best;
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
  // A quick click can press and release between two ticks: the press edge still counts.
  if ((input.isMouseDown(0) || input.wasMousePressed(0)) && hasCursor) {
    const fresh = input.wasMousePressed(0);
    if (user && input.isDown('forceStand')) {
      clearOrders(world, e);
      request(user, 0, aim);
    } else if (fresh || !(world.has(e, InteractTarget) || world.has(e, PickupTarget))) {
      // A new click picks what is under the cursor: enemy, item, object, else the ground. Holding the
      // button after clicking an item or object keeps walking to it instead of following the cursor.
      const enemy = enemyNear(world, ctx, aim.x, aim.z, 1.2);
      const thing = enemy === null && fresh ? clickableAt(world, ctx, aim.x, aim.z) : null;
      clearOrders(world, e);
      if (enemy !== null && user) {
        world.add(e, AttackTarget, { target: enemy });
      } else if (thing) {
        const tr = world.req(thing.target, Transform);
        if (thing.kind === 'item') world.add(e, PickupTarget, { target: thing.target });
        else world.add(e, InteractTarget, { target: thing.target });
        world.add(e, MoveTarget, { x: tr.x, z: tr.z });
      } else {
        world.add(e, MoveTarget, { x: aim.x, z: aim.z });
      }
    }
  }

  if (user) followAttack(world, e, user, input.isMouseDown(0));

  // Velocity is set by the movement system while a target exists.
  if (!world.has(e, MoveTarget)) {
    mover.vx = 0;
    mover.vz = 0;
  }
}

/** Chase the attack target into reach and hit it; keep attacking only while `holding`. */
function followAttack(world: World, e: Entity, user: SkillUserData, holding: boolean): void {
  const order = world.get(e, AttackTarget);
  if (!order) return;
  if (!isAlive(world, order.target)) {
    world.remove(e, AttackTarget);
    return;
  }
  const tr = world.req(e, Transform);
  const tt = world.req(order.target, Transform);
  const basic = user.slots[0] ? skill(user.slots[0]) : null;
  const reach = skillReach(basic) + (world.get(order.target, Collider)?.radius ?? 0) - 0.3;
  if (Math.hypot(tt.x - tr.x, tt.z - tr.z) <= reach) {
    world.remove(e, MoveTarget);
    request(user, 0, { x: tt.x, z: tt.z });
    // Keep attacking only while the button is held, like classic ARPGs.
    if (!holding) world.remove(e, AttackTarget);
  } else {
    world.add(e, MoveTarget, { x: tt.x, z: tt.z });
  }
}

/** Nearest living enemy to the player within `range` (m), measured to its collider edge. */
function nearestEnemy(world: World, ctx: GameContext, x: number, z: number, range: number): Entity | null {
  return enemyNear(world, ctx, x, z, range);
}

function touchMode(
  world: World,
  ctx: GameContext,
  e: Entity,
  mover: Mover,
  user: SkillUserData | undefined,
  touch: TouchState,
  ground: { x: number; z: number } | null,
): void {
  const input = ctx.input;
  const tr = world.req(e, Transform);
  const dir = wasdDirection(ctx, touch.stick);
  const facing = { x: Math.sin(tr.facing), z: Math.cos(tr.facing) };

  if (user) {
    if (input.wasPressed('potion')) user.potionRequested = true;
    if (input.wasPressed('dodge')) user.dodgeRequested = dir ?? facing;
    // Skills aim at the current target or the nearest enemy, else ahead; mobility skills follow the stick.
    const cast = (slot: number) => {
      const id = user.slots[slot];
      if (!id) return;
      request(user, slot, touchAim(world, ctx, e, skill(id), dir ?? facing));
    };
    SLOT_KEYS.forEach((action, i) => {
      if (input.isDown(action) || input.wasPressed(action)) cast(i + 2);
    });
    if (input.isMouseDown(2) || input.wasMousePressed(2)) cast(1);
  }

  if (touch.attack && user) {
    world.remove(e, InteractTarget);
    world.remove(e, PickupTarget);
    const current = world.get(e, AttackTarget)?.target;
    const keep = current !== undefined && isAlive(world, current) && distanceTo(world, tr, current) <= TOUCH_SEEK + 2;
    const target = keep ? current : nearestEnemy(world, ctx, tr.x, tr.z, TOUCH_SEEK);
    if (target !== null) {
      world.add(e, AttackTarget, { target });
      followAttack(world, e, user, true);
    } else {
      // Nothing in range: swing where you face (or toward the stick).
      world.remove(e, AttackTarget);
      world.remove(e, MoveTarget);
      const d = dir ?? facing;
      request(user, 0, { x: tr.x + d.x * 3, z: tr.z + d.z * 3 });
    }
  } else if (dir) {
    clearOrders(world, e);
    mover.vx = dir.x * mover.speed;
    mover.vz = dir.z * mover.speed;
    return;
  } else {
    // Taps on the screen behave like left-clicks.
    clickMode(world, ctx, e, mover, user, ground ?? { x: tr.x, z: tr.z }, ground !== null);
    return;
  }
  if (!world.has(e, MoveTarget)) {
    mover.vx = 0;
    mover.vz = 0;
  }
}

function distanceTo(world: World, tr: Transform, target: Entity): number {
  const tt = world.req(target, Transform);
  return Math.hypot(tt.x - tr.x, tt.z - tr.z);
}

/** Touch aim for a skill: the attack target or nearest enemy in reach, else a point in `dir`. */
function touchAim(world: World, ctx: GameContext, e: Entity, def: SkillDef, dir: { x: number; z: number }): { x: number; z: number } {
  const tr = world.req(e, Transform);
  const reach = skillReach(def);
  const kind = def.effect.kind;
  if (kind === 'blink' || kind === 'leap') {
    const range = Math.max(3, reach);
    return { x: tr.x + dir.x * range, z: tr.z + dir.z * range };
  }
  const current = world.get(e, AttackTarget)?.target;
  const target =
    current !== undefined && isAlive(world, current) && distanceTo(world, tr, current) <= reach + 3
      ? current
      : nearestEnemy(world, ctx, tr.x, tr.z, Math.max(reach + 3, 6));
  if (target !== null) {
    const tt = world.req(target, Transform);
    return { x: tt.x, z: tt.z };
  }
  const d = Math.min(Math.max(reach, 2), 6);
  return { x: tr.x + dir.x * d, z: tr.z + dir.z * d };
}
