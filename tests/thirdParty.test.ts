import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { StatusInstance } from '../src/core/components';
import { AssetManifestSchema } from '../src/data/assetManifest';
import { STATUS_DEFS } from '../src/data/db';
import { ZONES } from '../src/data/zones';
import { playerStatuses } from '../src/ui/statusTiles';
import { scatterInstances } from '../src/world/arena';

const status = (id: StatusInstance['id'], remaining: number, duration = remaining): StatusInstance => ({ id, remaining, duration, dps: 0, amount: 0, pending: 0, sourceTeam: 'enemy', attackerLevel: 1 });
const asset = (p: string) => new URL(`../public/assets/${p}`, import.meta.url).pathname;

describe('third-party assets', () => {
  it('every status has an icon and the fonts, environment map and rock maps exist', () => {
    for (const id of Object.keys(STATUS_DEFS)) expect(existsSync(asset(`ui/status/${id}.svg`)), id).toBe(true);
    for (const f of ['fonts/rajdhani-500.woff2', 'fonts/share-tech-mono-400.woff2', 'fonts/OFL-Rajdhani.txt', 'env/burnt_warehouse.webp', 'textures/rock/color.webp', 'textures/rock/normal.webp', 'textures/rock/roughness.webp']) {
      expect(existsSync(asset(f)), f).toBe(true);
    }
  });

  it('external models are credited and optimized', () => {
    const manifest = AssetManifestSchema.parse(JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')));
    const external = manifest.assets.filter((a) => a.source === 'external');
    expect(external.length).toBeGreaterThanOrEqual(14);
    for (const a of external) {
      expect(a.credit, a.id).toMatch(/\(CC0\)$/);
      expect(a.status, a.id).toBe('optimized');
      expect(existsSync(asset(a.file!)), a.id).toBe(true);
    }
  });

  it('road clutter lies on the road shoulders, never on the road or far from it', () => {
    const zone = ZONES.find((z) => z.id === 'zone.cinder_flats')!;
    const index = zone.scatter.findIndex((s) => s.asset === 'env.old_tyre');
    const spread = zone.scatter[index]!.spread!;
    const spots = scatterInstances(zone, index);
    expect(spots.length).toBeGreaterThan(50);
    for (const s of spots) {
      // Distance to the nearest road centre line, against that road's half width.
      let best = Infinity;
      let half = 0;
      for (const r of zone.roads) {
        for (let k = 1; k < r.points.length; k++) {
          const [ax, az] = r.points[k - 1]!;
          const [bx, bz] = r.points[k]!;
          const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
          const t = Math.max(0, Math.min(1, ((s.x - ax) * (bx - ax) + (s.z - az) * (bz - az)) / len2));
          const d = Math.hypot(s.x - (ax + (bx - ax) * t), s.z - (az + (bz - az) * t));
          if (d < best) [best, half] = [d, r.width / 2];
        }
      }
      expect(best).toBeLessThan(half + spread + 0.01);
    }
    // Most sit off the tarmac (a few land on a crossing road).
    const onRoad = spots.filter((s) => zone.roads.some((r) => r.points.some(([x, z]) => Math.hypot(s.x - x, s.z - z) < r.width / 2 - 0.5)));
    expect(onRoad.length).toBeLessThan(spots.length * 0.1);
  });

  it('the status bar shows one tile per status, stacks counted, boons first', () => {
    const tiles = playerStatuses([status('poisoned', 2, 3), status('poisoned', 2.5, 3), status('overcharge', 40, 60), status('burning', 1, 3), status('wading', 0.4, 0.5)]);
    expect(tiles.map((t) => t.id)).toEqual(['overcharge', 'poisoned', 'burning', 'wading']);
    expect(tiles.find((t) => t.id === 'poisoned')).toMatchObject({ stacks: 2, remaining: 2.5, harmful: true, timed: true });
    expect(tiles.find((t) => t.id === 'overcharge')).toMatchObject({ harmful: false, timed: true });
    expect(tiles.find((t) => t.id === 'wading')!.timed).toBe(false);
  });
});
