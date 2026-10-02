/** Wave encounter for the test arena: spawn a wave, wait until it is cleared, repeat. */
import { Dead, EncounterState, PlayerControlled, Transform, WaveMember } from '../core/components';
import type { GameContext } from '../core/context';
import type { World } from '../core/ecs';
import { ENCOUNTERS } from '../data/db';
import { spawnEnemy } from '../world/spawn';

export function encounterSystem(world: World, dt: number, ctx: GameContext): void {
  const id = world.first(EncounterState);
  if (id === undefined) return;
  const state = world.req(id, EncounterState);

  let alive = 0;
  for (const e of world.query(WaveMember)) if (!world.has(e, Dead)) alive++;
  state.alive = alive;

  if (state.phase === 'active') {
    if (alive === 0) {
      ctx.events.push({ type: 'waveCleared', wave: state.wave });
      const enc = ENCOUNTERS.get(state.encounterId);
      state.phase = 'intermission';
      state.timer = enc?.intermission ?? 3;
    }
    return;
  }

  state.timer -= dt;
  if (state.timer <= 0) startNextWave(world, ctx);
}

/** Spawn the next wave immediately (also used by the debug panel). */
export function startNextWave(world: World, ctx: GameContext): void {
  const id = world.first(EncounterState);
  if (id === undefined) return;
  const state = world.req(id, EncounterState);
  const enc = ENCOUNTERS.get(state.encounterId);
  if (!enc) return;
  const player = world.first(PlayerControlled, Transform);
  const ptr = player !== undefined ? world.req(player, Transform) : { x: 0, z: 0 };

  const index = Math.min(state.wave, enc.waves.length - 1);
  const extra = Math.max(0, state.wave - (enc.waves.length - 1));
  const lifeMul = 1 + extra * enc.endlessLifeScale;
  const wave = enc.waves[index]!;
  state.wave++;
  const rng = ctx.rng.fork(`wave-${state.wave}-${ctx.tick}`);
  const lim = ctx.worldHalfSize - 2;
  let count = 0;
  for (const group of wave.groups) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(enc.spawnRing[0], enc.spawnRing[1]);
    const cx = clamp(ptr.x + Math.sin(angle) * dist, -lim, lim);
    const cz = clamp(ptr.z + Math.cos(angle) * dist, -lim, lim);
    for (let i = 0; i < group.count; i++) {
      const x = clamp(cx + rng.range(-enc.groupSpread, enc.groupSpread), -lim, lim);
      const z = clamp(cz + rng.range(-enc.groupSpread, enc.groupSpread), -lim, lim);
      spawnEnemy(world, group.enemy, x, z, { lifeMul, aggro: true, wave: state.wave });
      count++;
    }
  }
  state.phase = 'active';
  state.alive = count;
  ctx.events.push({ type: 'wave', wave: state.wave, enemies: count });
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
