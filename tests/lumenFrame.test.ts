import { describe, expect, it } from 'vitest';
import { Health, Transform } from '../src/core/components';
import { emptyAccount } from '../src/core/account';
import { World } from '../src/core/ecs';
import { LUMEN_HEART, THE_CORE } from '../src/data/zones/theCore';
import { CameraRig, screenExtent } from '../src/render/camera';
import { bossSystem } from '../src/systems/boss';
import { spatialSystem } from '../src/systems/collision';
import { createQuestRuntime } from '../src/systems/quests';
import { LUMEN_TUNING, lumenCameraFocus, lumenCameraFrame } from '../src/world/lumen';
import { setPieceSystem, syncSetPieces } from '../src/world/setPieces';
import { spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { makeCtx, run } from './helpers';

const H = LUMEN_HEART;
function fight() {
  const world = new World();
  const zone = createZoneRuntime(THE_CORE);
  const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize, zoneLevels: [40, 50] });
  const player = spawnPlayer(world, 'bastion', H.x, H.z - 20);
  world.req(player, Health).max = world.req(player, Health).current = 1e9;
  syncSetPieces(world, zone);
  run(world, ctx, [spatialSystem, setPieceSystem, bossSystem], 2);
  const boss = zone.setPieces.lumen!.boss!;
  return { world, zone, player, boss };
}

/** The 4 points on the arena edge (the player may stand anywhere in it) and the framing from each. */
const EDGE = [0, 90, 180, 270].map((deg) => ({ x: H.x + Math.sin((deg * Math.PI) / 180) * (H.radius - 2), z: H.z + Math.cos((deg * Math.PI) / 180) * (H.radius - 2) }));
const F = LUMEN_TUNING.frame;
const bossPoints = (x: number, z: number) => [{ x, y: F.height, z }, ...[0, 1, 2, 3].map((i) => ({ x: x + Math.sin((i * Math.PI) / 2) * F.radius, y: 0, z: z + Math.cos((i * Math.PI) / 2) * F.radius }))];

describe('A16 Lumen on screen', () => {
  it.each([
    ['landscape 16:9', 16 / 9],
    ['phone portrait 9:16 (taller frustum)', 9 / 16],
  ])('from every edge of the arena the whole boss fits (%s)', (_name, aspect) => {
    const { world, zone, boss } = fight();
    const bt = world.req(boss, Transform);
    const rig = new CameraRig(aspect);
    const distance = rig.baseDistance;
    const fov = rig.camera.fov;
    let pulledBack = 0;
    for (const p of EDGE) {
      const old = lumenCameraFocus(world, zone, p.x, p.z);
      const before = screenExtent({ x: old.x, y: 1, z: old.z }, distance, rig.camera.aspect, bossPoints(bt.x, bt.z), fov);
      const frame = lumenCameraFrame(world, zone, p.x, p.z, distance, rig.camera.aspect, fov);
      const after = screenExtent({ x: frame.x, y: 1, z: frame.z }, distance * frame.zoom, rig.camera.aspect, bossPoints(bt.x, bt.z), fov);
      expect(Math.max(after.x, after.y), `edge ${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBeLessThanOrEqual(1);
      expect(frame.zoom).toBeLessThanOrEqual(F.maxZoom + 1e-9);
      if (Math.max(before.x, before.y) > 1) pulledBack++;
    }
    // The old framing lost Lumen from at least one edge point: that is what this fixes.
    expect(pulledBack).toBeGreaterThan(0);
  });

  it('next to Lumen nothing changes: no pull-back, the old lean', () => {
    const { world, zone } = fight();
    const near = { x: H.x, z: H.z - 12 };
    const frame = lumenCameraFrame(world, zone, near.x, near.z, 19, 16 / 9, 38);
    expect(frame.zoom).toBeGreaterThanOrEqual(1);
    const old = lumenCameraFocus(world, zone, near.x, near.z);
    if (frame.zoom === 1) expect(frame.z).toBeGreaterThanOrEqual(old.z - 1e-9);
  });

  it('outside the fight the camera is untouched', () => {
    const world = new World();
    const zone = createZoneRuntime(THE_CORE);
    expect(lumenCameraFrame(world, zone, 10, 20, 19, 16 / 9, 38)).toEqual({ x: 10, z: 20, zoom: 1 });
  });

  it('the rig eases its pull-back in and out', () => {
    const rig = new CameraRig(16 / 9);
    rig.snapTo(0, 0, 0);
    const d0 = rig.effectiveDistance;
    rig.setFrameZoom(2);
    for (let i = 0; i < 120; i++) rig.update(0, 0, 0, 1 / 60);
    expect(rig.effectiveDistance).toBeGreaterThan(d0 * 1.7);
    rig.setFrameZoom(1);
    for (let i = 0; i < 240; i++) rig.update(0, 0, 0, 1 / 60);
    expect(rig.effectiveDistance).toBeCloseTo(d0, 0);
  });
});
