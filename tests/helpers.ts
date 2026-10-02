/** Shared test helpers: a headless GameContext, fake input and a tick runner. */
import type { GameContext, InputState } from '../src/core/context';
import { World } from '../src/core/ecs';
import { EventQueue } from '../src/core/events';
import { Rng } from '../src/core/rng';
import { SpatialHash } from '../src/core/spatial';
import { defaultSettings, type Action } from '../src/data/settings';

export function fakeInput(held: Action[] = [], mouseDown: number[] = []): InputState {
  return {
    isDown: (a) => held.includes(a),
    wasPressed: (a) => held.includes(a),
    isMouseDown: (b = 0) => mouseDown.includes(b),
    wasMousePressed: (b = 0) => mouseDown.includes(b),
  };
}

export function makeCtx(overrides: Partial<GameContext> = {}): GameContext {
  return {
    input: fakeInput(),
    settings: defaultSettings(),
    rng: new Rng('test'),
    tick: 0,
    time: 0,
    cameraYaw: 0,
    worldHalfSize: 40,
    pickGround: () => null,
    events: new EventQueue(),
    spatial: new SpatialHash(4),
    debug: { godMode: false },
    stats: { kills: 0 },
    loot: { rng: new Rng('test-loot'), seq: 0 },
    rewards: [],
    zoneLevels: [1, 10],
    ...overrides,
  };
}

export type SystemFn = (world: World, dt: number, ctx: GameContext) => void;

/** Run systems in order for `ticks` fixed 60 Hz steps. */
export function run(world: World, ctx: GameContext, systems: SystemFn[], ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    for (const s of systems) s(world, 1 / 60, ctx);
    world.flushDestroyed();
    ctx.tick++;
    ctx.time += 1 / 60;
  }
}
