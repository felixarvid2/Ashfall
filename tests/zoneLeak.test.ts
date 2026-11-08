// @vitest-environment happy-dom
/**
 * B04: ten zone round trips must not grow what the renderer keeps on the GPU. node has no GL, so the renderer is a stand-in
 * (tests/fakeGl.ts) whose census counts every geometry, material and texture the scene draws until it is disposed:
 * the same numbers as `renderer.info.memory`.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PlayerControlled, Transform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { ZONES } from '../src/data/zones';
import { spawnArenaProps } from '../src/world/arena';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { FakePostFx, FakeWebGLRenderer, gpu, installFakeCanvas } from './fakeGl';

vi.mock('../src/render/postfx', () => ({ PostFx: FakePostFx }));
vi.mock('three', async (orig) => ({ ...(await orig<typeof import('three')>()), WebGLRenderer: FakeWebGLRenderer }));

describe('fake GPU census', () => {
  it('counts what the scene draws and forgets what is disposed', async () => {
    const THREE = await import('three');
    const { FakeGpu } = await import('./fakeGl');
    const g = new FakeGpu();
    const scene = new THREE.Scene();
    const geo = new THREE.BoxGeometry();
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
    scene.add(new THREE.Mesh(geo, mat));
    g.upload(scene);
    expect(g.counts).toEqual({ geometries: 1, materials: 1, textures: 1 });
    geo.dispose();
    mat.map!.dispose();
    expect(g.counts).toEqual({ geometries: 0, materials: 1, textures: 0 });
  });
});

describe('zone change leaks (round 4 B04)', () => {
  beforeAll(() => installFakeCanvas());

  it('ten round trips between two zones leave the geometry, material and texture counts where one trip left them', async () => {
    gpu.enabled = true;
    const { GameRenderer } = await import('../src/render/gameRenderer');
    const renderer = new GameRenderer(document.createElement('canvas'));
    const zoneA = ZONES.find((z) => z.id === 'zone.cinder_flats')!;
    const zoneB = ZONES.find((z) => z.id === 'zone.hydroponic_vaults')!;

    /** What the game does on a zone change: drop the old entities, build the new arena, spawn, draw some frames. */
    const enter = (zone: typeof zoneA) => {
      const world = new World();
      renderer.buildArena(zone);
      spawnArenaProps(world, zone);
      const hub = zone.hubs[0]!;
      spawnPlayer(world, 'bastion', hub.x, hub.z);
      for (let i = 0; i < 20; i++) spawnEnemy(world, i % 2 ? 'infected_colonist' : 'security_drone', hub.x + 6 + i, hub.z + 4, { level: 5 });
      for (let f = 0; f < 3; f++) {
        renderer.sync(world, 0.5, 1 / 60);
        const tr = world.req(world.query(PlayerControlled)[0]!, Transform);
        renderer.render(1 / 60, tr.x, 0, tr.z);
      }
    };

    const trip = () => {
      enter(zoneA);
      enter(zoneB);
    };
    trip();
    trip(); // the second trip warms every cache (shared textures, pooled effects)
    const baseline = { ...gpu.counts };
    for (let i = 0; i < 10; i++) trip();
    const after = { ...gpu.counts };
    console.log('zone leak census', JSON.stringify({ baseline, after }));
    expect(baseline.geometries).toBeGreaterThan(10);
    expect(after.geometries, 'geometries').toBeLessThanOrEqual(baseline.geometries);
    expect(after.materials, 'materials').toBeLessThanOrEqual(baseline.materials);
    expect(after.textures, 'textures').toBeLessThanOrEqual(baseline.textures);
  }, 120000);
});
