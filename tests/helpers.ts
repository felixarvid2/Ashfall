/** Shared test helpers: a headless GameContext, fake input and a tick runner. */
import type { GameContext, InputState } from '../src/core/context';
import { SkillUser } from '../src/core/components';
import { World, type Entity } from '../src/core/ecs';
import { EventQueue } from '../src/core/events';
import { Rng } from '../src/core/rng';
import { SpatialHash } from '../src/core/spatial';
import { classDef } from '../src/data/db';
import { defaultSettings, type Action } from '../src/data/settings';
import { recomputePlayer } from '../src/systems/stats';

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

/** Learn skills at rank 1 (default: the class's starting action bar) and put them on the bar. */
export function learnSkills(world: World, player: Entity, skills?: (string | null)[]): void {
  const user = world.req(player, SkillUser);
  const bar = skills ?? classDef(user.classId).actionBar;
  for (const id of bar) if (id) user.tree.ranks[`n.${id.split('.')[1]}`] = 1;
  user.slots = [...bar, null, null, null, null, null, null].slice(0, 6);
  recomputePlayer(world, player);
}
