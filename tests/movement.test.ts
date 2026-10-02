import { describe, expect, it } from 'vitest';
import { MoveTarget, Mover, PlayerControlled, Transform, makeTransform } from '../src/core/components';
import type { GameContext } from '../src/core/context';
import { World } from '../src/core/ecs';
import { defaultSettings, type Action } from '../src/data/settings';
import { angleDelta, movementSystem } from '../src/systems/movement';
import { playerControlSystem } from '../src/systems/playerControl';
import { fakeInput as baseFakeInput, makeCtx } from './helpers';

const fakeInput = (held: Action[] = [], mouseDown = false) => baseFakeInput(held, mouseDown ? [0] : []);

function setup(ctxOverrides: Partial<GameContext> = {}) {
  const world = new World();
  const e = world.create();
  world.add(e, Transform, makeTransform());
  world.add(e, Mover, { speed: 5, speedMul: 1, turnRate: 100, vx: 0, vz: 0 });
  world.add(e, PlayerControlled, {});
  const ctx: GameContext = makeCtx(ctxOverrides);
  const step = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      playerControlSystem(world, 1 / 60, ctx);
      movementSystem(world, 1 / 60, ctx);
    }
  };
  return { world, e, ctx, step, tr: () => world.req(e, Transform) };
}

describe('angleDelta', () => {
  it('returns the shortest signed angle', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(angleDelta(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2);
  });
});

describe('WASD movement', () => {
  it('moves away from the camera when pressing up (camera yaw 0 → -z)', () => {
    const s = setup({ input: fakeInput(['moveUp']) });
    s.step(60);
    expect(s.tr().z).toBeCloseTo(-5, 1);
    expect(s.tr().x).toBeCloseTo(0, 5);
  });

  it('is camera-relative: right with yaw 90° moves toward -z', () => {
    const s = setup({ input: fakeInput(['moveRight']), cameraYaw: Math.PI / 2 });
    s.step(60);
    expect(s.tr().z).toBeCloseTo(-5, 1);
    expect(s.tr().x).toBeCloseTo(0, 5);
  });

  it('normalizes diagonal movement', () => {
    const s = setup({ input: fakeInput(['moveUp', 'moveRight']) });
    s.step(60);
    expect(Math.hypot(s.tr().x, s.tr().z)).toBeCloseTo(5, 1);
  });

  it('stops when no key is held and stays inside the world bounds', () => {
    const s = setup({ input: fakeInput(['moveLeft']), worldHalfSize: 2 });
    s.step(120);
    expect(s.tr().x).toBe(-2);
    s.ctx.input = fakeInput();
    s.step(1);
    expect(s.tr().x).toBe(-2);
  });

  it('turns to face the movement direction', () => {
    const s = setup({ input: fakeInput(['moveRight']) });
    s.step(10);
    expect(s.tr().facing).toBeCloseTo(Math.PI / 2, 3); // facing +x
  });

  it('records the previous position for interpolation', () => {
    const s = setup({ input: fakeInput(['moveUp']) });
    s.step(1);
    const tr = s.tr();
    expect(tr.prevZ).toBe(0);
    expect(tr.z).toBeLessThan(0);
  });
});

describe('click-to-move', () => {
  it('walks to the clicked point and clears the target on arrival', () => {
    const settings = { ...defaultSettings(), moveMode: 'click' as const };
    const s = setup({ settings, input: fakeInput([], true), pickGround: () => ({ x: 3, z: 4 }) });
    s.step(1);
    expect(s.world.get(s.e, MoveTarget)).toEqual({ x: 3, z: 4 });
    s.ctx.input = fakeInput([], false);
    s.step(70); // 5 m at 5 m/s ≈ 60 ticks
    expect(s.tr().x).toBeCloseTo(3, 5);
    expect(s.tr().z).toBeCloseTo(4, 5);
    expect(s.world.has(s.e, MoveTarget)).toBe(false);
  });

  it('ignores WASD in click mode', () => {
    const settings = { ...defaultSettings(), moveMode: 'click' as const };
    const s = setup({ settings, input: fakeInput(['moveUp']) });
    s.step(30);
    expect(s.tr().z).toBe(0);
  });
});
