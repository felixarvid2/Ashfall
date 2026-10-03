import { describe, expect, it } from 'vitest';
import {
  AttackTarget,
  Collider,
  GroundItem,
  Interactable,
  InteractTarget,
  MoveTarget,
  PickupTarget,
  SkillUser,
  Transform,
} from '../src/core/components';
import type { GameContext, InputState, TouchState } from '../src/core/context';
import { World, type Entity } from '../src/core/ecs';
import { defaultSettings, loadSettings, migrateSettings, SettingsSchema } from '../src/data/settings';
import { skill } from '../src/data/db';
import { spatialSystem } from '../src/systems/collision';
import { movementSystem } from '../src/systems/movement';
import { playerControlSystem, skillReach } from '../src/systems/playerControl';
import { interactSystem } from '../src/world/interactables';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import { emptyAccount } from '../src/core/account';
import { makeCtx, run } from './helpers';

/** Input with a left-button press this tick (or held), plus optional touch state. */
function mouse(opts: { pressed?: boolean; held?: boolean; touch?: TouchState | null; held2?: string[] } = {}): InputState {
  return {
    isDown: (a) => (opts.held2 ?? []).includes(a),
    wasPressed: (a) => (opts.held2 ?? []).includes(a),
    isMouseDown: (b = 0) => b === 0 && !!opts.held,
    wasMousePressed: (b = 0) => b === 0 && !!opts.pressed,
    touch: opts.touch ?? null,
  };
}

function setup(cursor: { x: number; z: number } | null = null) {
  const world = new World();
  const zone = createZoneRuntime({ ...CINDER_FLATS, pois: [], packs: [] });
  let cur = cursor;
  const ctx: GameContext = makeCtx({ zone, account: emptyAccount(), worldHalfSize: 200, pickGround: () => cur });
  const player = spawnPlayer(world, 'bastion', 0, 0);
  const tick = (input: InputState, ticks = 1) => {
    ctx.input = input;
    run(world, ctx, [spatialSystem, playerControlSystem, movementSystem, interactSystem], ticks);
  };
  return { world, ctx, player, tick, setCursor: (c: { x: number; z: number } | null) => (cur = c) };
}

function npcAt(world: World, x: number, z: number): Entity {
  const e = world.create();
  world.add(e, Transform, { x, y: 0, z, facing: 0, prevX: x, prevY: 0, prevZ: z, prevFacing: 0 });
  world.add(e, Interactable, { poi: 'test_npc', kind: 'npc', radius: 2.4, used: false, readyAt: 0 });
  world.add(e, Collider, { radius: 0.5, mass: Infinity, layer: 'ground', isStatic: true });
  return e;
}

describe('click-to-move (Diablo style)', () => {
  it('is the default, and old settings switch to it once', () => {
    expect(defaultSettings().moveMode).toBe('click');
    const old = SettingsSchema.parse({ moveMode: 'wasd' });
    expect(migrateSettings(old).moveMode).toBe('click');
    // After the migration a player who picks WASD again keeps it.
    const chosen = SettingsSchema.parse({ moveMode: 'wasd', controlsVersion: 1 });
    expect(migrateSettings(chosen).moveMode).toBe('wasd');
    const store = new Map<string, string>([['ashfall.settings', JSON.stringify({ moveMode: 'wasd' })]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null } as Storage;
    expect(loadSettings(storage).moveMode).toBe('click');
  });

  it('a quick click that presses and releases between ticks still walks', () => {
    const s = setup({ x: 6, z: 0 });
    s.tick(mouse({ pressed: true, held: false }));
    expect(s.world.get(s.player, MoveTarget)).toEqual({ x: 6, z: 0 });
    s.tick(mouse(), 120);
    expect(s.world.req(s.player, Transform).x).toBeCloseTo(6, 1);
  });

  it('holding the button follows the cursor', () => {
    const s = setup({ x: 5, z: 0 });
    s.tick(mouse({ pressed: true, held: true }), 10);
    s.setCursor({ x: 0, z: 8 });
    s.tick(mouse({ held: true }));
    expect(s.world.get(s.player, MoveTarget)).toEqual({ x: 0, z: 8 });
  });

  it('clicking an enemy walks into reach and attacks it', () => {
    const s = setup();
    const enemy = spawnEnemy(s.world, 'infected_colonist', 6, 0);
    s.setCursor({ x: 6, z: 0 });
    s.tick(mouse({ pressed: true, held: true }));
    expect(s.world.get(s.player, AttackTarget)?.target).toBe(enemy);
    s.tick(mouse({ held: true }), 90);
    expect(s.world.req(s.player, Transform).x).toBeGreaterThan(2.5);
    // In reach it stops walking and asks for the basic attack.
    expect(s.world.has(s.player, MoveTarget)).toBe(false);
    expect(s.world.req(s.player, SkillUser).request?.slot).toBe(0);
  });

  it('clicking an NPC walks to it and talks on arrival', () => {
    const s = setup();
    const npc = npcAt(s.world, 8, 0);
    s.setCursor({ x: 8, z: 0.4 });
    s.tick(mouse({ pressed: true }));
    expect(s.world.get(s.player, InteractTarget)?.target).toBe(npc);
    s.tick(mouse(), 120);
    expect(s.world.has(s.player, InteractTarget)).toBe(false);
    const talked = s.ctx.events.drain().some((e) => e.type === 'interact' && e.kind === 'npc');
    expect(talked).toBe(true);
  });

  it('clicking an item on the ground walks over and picks it up', () => {
    const s = setup();
    const item = s.world.create();
    s.world.add(item, Transform, { x: 0, y: 0, z: 5, facing: 0, prevX: 0, prevY: 0, prevZ: 5, prevFacing: 0 });
    s.world.add(item, GroundItem, { item: { base: 'x' } as never, age: 1 });
    s.setCursor({ x: 0.3, z: 5 });
    s.tick(mouse({ pressed: true }));
    expect(s.world.get(s.player, PickupTarget)?.target).toBe(item);
    // Holding the button after the click keeps the pickup order instead of following the cursor.
    s.setCursor({ x: -10, z: 0 });
    s.tick(mouse({ held: true }));
    expect(s.world.get(s.player, PickupTarget)?.target).toBe(item);
  });

  it('ranged basic attacks stop at range instead of walking into melee', () => {
    expect(skillReach(skill('spectre.quick_shot'))).toBeGreaterThan(10);
    expect(skillReach(skill('spectre.vibro_slash'))).toBeCloseTo(2.3);
  });
});

describe('touch controls', () => {
  it('the joystick moves relative to the screen', () => {
    const s = setup();
    s.tick(mouse({ touch: { stick: { x: 0, y: 1 }, attack: false } }), 60);
    // Camera yaw 0: screen up is -z.
    expect(s.world.req(s.player, Transform).z).toBeLessThan(-3);
  });

  it('a stick inside the dead zone does nothing', () => {
    const s = setup();
    s.tick(mouse({ touch: { stick: { x: 0.05, y: 0.05 }, attack: false } }), 30);
    expect(s.world.req(s.player, Transform).z).toBe(0);
  });

  it('the attack button targets the nearest enemy', () => {
    const s = setup();
    const far = spawnEnemy(s.world, 'infected_colonist', 10, 0);
    const near = spawnEnemy(s.world, 'infected_colonist', 0, 5);
    s.tick(mouse({ touch: { stick: null, attack: true } }));
    expect(s.world.get(s.player, AttackTarget)?.target).toBe(near);
    expect(far).not.toBe(near);
  });

  it('skills aim at the nearest enemy', () => {
    const s = setup();
    const user = s.world.req(s.player, SkillUser);
    user.slots[2] = user.slots[0]!;
    spawnEnemy(s.world, 'infected_colonist', 3, 3);
    s.tick(mouse({ touch: { stick: null, attack: false }, held2: ['skill1'] }));
    expect(user.request?.slot).toBe(2);
    expect(user.request?.aimX).toBeCloseTo(3, 0);
    expect(user.request?.aimZ).toBeCloseTo(3, 0);
  });

  it('a tap works like a left-click', () => {
    const s = setup({ x: 4, z: 4 });
    s.tick(mouse({ pressed: true, touch: { stick: null, attack: false } }));
    expect(s.world.get(s.player, MoveTarget)).toEqual({ x: 4, z: 4 });
  });
});
