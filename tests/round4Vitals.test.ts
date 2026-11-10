import { describe, expect, it } from 'vitest';
import { EncounterState, Health, Resource, StatusEffects } from '../src/core/components';
import { World } from '../src/core/ecs';
import { SaveDataSchema, parseSave, serializeSave } from '../src/core/save';
import { applyStatus } from '../src/systems/combat';
import { captureVitals, restoreVitals } from '../src/systems/saveSnapshot';
import { spawnPlayer } from '../src/world/spawn';
import { makeCtx } from './helpers';

describe('A17 saves keep state', () => {
  it('stores life, resource, buff time and the wave, and restores them', () => {
    const world = new World();
    const ctx = makeCtx();
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const enc = world.create();
    world.add(enc, EncounterState, { encounterId: 'enc.arena', wave: 4, phase: 'intermission', timer: 2.5, alive: 0 });
    world.req(player, Health).current = 37;
    world.req(player, Resource).current = 21;
    applyStatus(world, ctx, player, { status: 'blessed', duration: 20 }, { team: 'player', level: 1, attacker: player });
    applyStatus(world, ctx, player, { status: 'burning', duration: 8, dps: 3 }, { team: 'enemy', level: 1 });
    world.req(player, StatusEffects).list.find((s) => s.id === 'blessed')!.remaining = 12.5;

    const state = captureVitals(world, player);
    expect(state.health).toBe(37);
    expect(state.resource).toBe(21);
    expect(state.buffs.map((b) => b.id)).toEqual(['blessed']);
    expect(state.wave).toMatchObject({ wave: 4, phase: 'intermission', timer: 2.5 });

    // A fresh world (a reload) at full life with nothing running.
    const world2 = new World();
    const p2 = spawnPlayer(world2, 'bastion', 0, 0);
    const enc2 = world2.create();
    world2.add(enc2, EncounterState, { encounterId: 'enc.arena', wave: 0, phase: 'intermission', timer: 3, alive: 0 });
    restoreVitals(world2, p2, parseState(state));
    expect(world2.req(p2, Health).current).toBe(37);
    expect(world2.req(p2, Resource).current).toBe(21);
    const blessed = world2.req(p2, StatusEffects).list.find((s) => s.id === 'blessed')!;
    expect(blessed.remaining).toBe(12.5);
    expect(world2.req(enc2, EncounterState)).toMatchObject({ wave: 4, phase: 'intermission', timer: 2.5 });
  });

  it('never loads someone dead, clamps to the max and ignores a block that is missing', () => {
    const world = new World();
    const p = spawnPlayer(world, 'bastion', 0, 0);
    const max = world.req(p, Health).max;
    restoreVitals(world, p, { health: 0, resource: 0, buffs: [], wave: null });
    expect(world.req(p, Health).current).toBe(1);
    restoreVitals(world, p, { health: max * 5, resource: 1e6, buffs: [{ id: 'nonsense', remaining: 5, duration: 5, amount: 0 }], wave: null });
    expect(world.req(p, Health).current).toBe(max);
    expect(world.req(p, StatusEffects).list.find((s) => s.id === ('nonsense' as never))).toBeUndefined();
    world.req(p, Health).current = 10;
    restoreVitals(world, p, undefined);
    expect(world.req(p, Health).current).toBe(10);
  });

  it('survives the JSON round trip and older saves without the block still parse', () => {
    const base = parseSave(readSample());
    expect(base.state).toBeUndefined();
    const withState = { ...base, state: { health: 12, resource: 3, buffs: [{ id: 'blessed', remaining: 4, duration: 10, amount: 0 }], wave: null } };
    expect(parseSave(serializeSave(withState)).state).toEqual(withState.state);
  });
});

function parseState(s: ReturnType<typeof captureVitals>) {
  return SaveDataSchema.shape.state.parse(JSON.parse(JSON.stringify(s)));
}
import { readFileSync } from 'node:fs';
function readSample(): string {
  return readFileSync(new URL('./fixtures/save-v8.json', import.meta.url), 'utf8');
}
