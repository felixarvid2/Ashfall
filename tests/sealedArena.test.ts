import { describe, expect, it } from 'vitest';
import { Collider, Transform } from '../src/core/components';
import { World } from '../src/core/ecs';
import { emptyAccount } from '../src/core/account';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import { REFINERY_DISTRICT, CATHEDRAL } from '../src/data/zones/refineryDistrict';
import { HYDROPONIC_VAULTS, GREAT_DOME } from '../src/data/zones/hydroponicVaults';
import { kill } from '../src/systems/combat';
import { createQuestRuntime } from '../src/systems/quests';
import { spawnArenaProps } from '../src/world/arena';
import { MAW, setPieceSystem, setPiecesOnDeath } from '../src/world/setPieces';
import { seamCentre, sealRing } from '../src/world/sealedArena';
import { spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import type { ZoneDef } from '../src/data/zones/zoneTypes';
import { makeCtx, run } from './helpers';

/** Can a circle of `radius` walk from (sx, sz) to anywhere `far` metres from the centre? Grid flood fill over the static colliders. */
function canLeave(world: World, cx: number, cz: number, ring: number, far: number, radius = 0.45): boolean {
  const cell = 0.4;
  const half = far + 4;
  const n = Math.ceil((half * 2) / cell);
  const blocked = new Uint8Array(n * n);
  for (const e of world.query(Collider, Transform)) {
    const c = world.req(e, Collider);
    if (!c.isStatic) continue;
    const t = world.req(e, Transform);
    const r = c.radius + radius;
    const i0 = Math.max(0, Math.floor((t.x - r - cx + half) / cell));
    const i1 = Math.min(n - 1, Math.floor((t.x + r - cx + half) / cell));
    const j0 = Math.max(0, Math.floor((t.z - r - cz + half) / cell));
    const j1 = Math.min(n - 1, Math.floor((t.z + r - cz + half) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const px = cx - half + (i + 0.5) * cell;
        const pz = cz - half + (j + 0.5) * cell;
        if (Math.hypot(px - t.x, pz - t.z) < r) blocked[j * n + i] = 1;
      }
  }
  const mid = Math.floor(n / 2);
  const seen = new Uint8Array(n * n);
  const stack = [mid * n + mid];
  seen[mid * n + mid] = 1;
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % n;
    const j = (k - i) / n;
    const px = cx - half + (i + 0.5) * cell;
    const pz = cz - half + (j + 0.5) * cell;
    if (Math.hypot(px - cx, pz - cz) > ring + (far - ring) / 2) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nk = nj * n + ni;
      if (seen[nk] || blocked[nk]) continue;
      seen[nk] = 1;
      stack.push(nk);
    }
  }
  return false;
}

const ARENAS: { name: string; def: ZoneDef; at: { x: number; z: number; radius: number }; boss: (zone: ReturnType<typeof createZoneRuntime>) => number | null }[] = [
  { name: 'The Maw', def: CINDER_FLATS, at: MAW, boss: (z) => z.setPieces.maw.boss },
  { name: "the Smelters' Cathedral", def: REFINERY_DISTRICT, at: CATHEDRAL, boss: (z) => z.setPieces.district!.vire.boss },
  { name: 'the Great Dome', def: HYDROPONIC_VAULTS, at: GREAT_DOME, boss: (z) => z.setPieces.vaults!.warden.boss },
];

describe('A07 sealed boss arenas', () => {
  for (const a of ARENAS) {
    it(`${a.name}: nobody can leave while the fight runs; the way opens on a win or a reset`, () => {
      const world = new World();
      const zone = createZoneRuntime(a.def);
      const ctx = makeCtx({ zone, quests: createQuestRuntime(), account: emptyAccount(), worldHalfSize: zone.def.halfSize });
      spawnArenaProps(world, a.def);
      const player = spawnPlayer(world, 'bastion', a.at.x, a.at.z);
      // Before the fight the ring leaks (that is why the barrier exists) and the entrances are open.
      expect(canLeave(world, a.at.x, a.at.z, a.at.radius, a.at.radius + 30)).toBe(true);
      run(world, ctx, [setPieceSystem], 1);
      world.flushDestroyed();
      const boss = a.boss(zone);
      expect(boss).not.toBeNull();
      expect(canLeave(world, a.at.x, a.at.z, a.at.radius, a.at.radius + 30)).toBe(false);
      expect(canLeave(world, a.at.x, a.at.z, a.at.radius, a.at.radius + 30, 0.2)).toBe(false);

      // A reset (the player died) opens it again.
      setPiecesOnDeath(world, zone);
      world.flushDestroyed();
      expect(canLeave(world, a.at.x, a.at.z, a.at.radius, a.at.radius + 30)).toBe(true);

      // A second attempt, won this time.
      run(world, ctx, [setPieceSystem], 1);
      world.flushDestroyed();
      expect(canLeave(world, a.at.x, a.at.z, a.at.radius, a.at.radius + 30)).toBe(false);
      kill(world, ctx, a.boss(zone)!, 0);
      run(world, ctx, [setPieceSystem], 2);
      world.flushDestroyed();
      expect(canLeave(world, a.at.x, a.at.z, a.at.radius, a.at.radius + 30)).toBe(true);
      expect(player).toBeDefined();
    });
  }

  it('seams lie between the segments and the barrier covers their whole length', () => {
    const ring = { x: 10, z: -4, radius: 28, segments: 20 };
    const world = new World();
    const made = sealRing(world, ring, '#fff');
    expect(made.length).toBeGreaterThanOrEqual(ring.segments * 4);
    const s = seamCentre(ring, 0);
    expect(Math.hypot(s.x - ring.x, s.z - ring.z)).toBeCloseTo(ring.radius, 5);
    expect(s.length).toBeCloseTo(2 * 28 * Math.sin(Math.PI / 20), 5);
  });
});
