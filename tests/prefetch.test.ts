import { describe, expect, it, vi } from 'vitest';
import { zoneAssetIds } from '../src/data/assetSets';
import { ZONES, zoneDef } from '../src/data/zones';
import { PREFETCH_RANGE, ZonePrefetcher, gatesToPrefetch } from '../src/world/prefetch';

const cinder = ZONES.find((z) => z.id === 'zone.cinder_flats')!;
const gate = cinder.gates[0]!;

function rig() {
  const ensured: string[][] = [];
  const grounds: string[] = [];
  const queue: (() => void)[] = [];
  const prefetcher = new ZonePrefetcher({
    hasZone: (id) => ZONES.some((z) => z.id === id),
    zoneDef,
    assetIds: zoneAssetIds,
    ensure: async (ids) => void ensured.push(ids),
    ground: async (z) => void grounds.push(z.id),
    idle: (fn) => queue.push(fn),
  });
  return { prefetcher, ensured, grounds, queue, runIdle: () => queue.splice(0).forEach((fn) => fn()) };
}

describe('asset prefetch at a gate (round 4 B15)', () => {
  it('picks the gates in range that are open and not asked for yet', () => {
    const near = [gate.x, gate.z] as const;
    expect(gatesToPrefetch(cinder.gates, ...near, new Set())).toContain(gate);
    expect(gatesToPrefetch(cinder.gates, gate.x + gate.radius + PREFETCH_RANGE + 5, gate.z, new Set())).not.toContain(gate);
    expect(gatesToPrefetch(cinder.gates, ...near, new Set([gate.to.zone]))).not.toContain(gate);
    expect(gatesToPrefetch(cinder.gates, ...near, new Set(), () => true)).toEqual([]);
  });

  it('walking up to a gate requests the far zone\'s models and ground in idle time, exactly once', async () => {
    const { prefetcher, ensured, grounds, queue, runIdle } = rig();
    // Far from every gate: nothing.
    expect(prefetcher.update(cinder, 0, 0)).toEqual([]);
    expect(queue).toHaveLength(0);
    // Near the gate: scheduled, not run yet.
    expect(prefetcher.update(cinder, gate.x, gate.z)).toEqual([gate.to.zone]);
    expect(ensured).toHaveLength(0);
    runIdle();
    await Promise.resolve();
    const target = zoneDef(gate.to.zone);
    expect(ensured).toHaveLength(1);
    expect(new Set(ensured[0])).toEqual(new Set(zoneAssetIds(target)));
    expect(ensured[0]!.length).toBeGreaterThan(10);
    expect(grounds).toEqual([target.id]);
    // Standing there does not ask again.
    expect(prefetcher.update(cinder, gate.x, gate.z)).toEqual([]);
    runIdle();
    expect(ensured).toHaveLength(1);
  });

  it('a locked gate is not prefetched until its quest is done', () => {
    const { prefetcher } = rig();
    const lockedGate = cinder.gates.find((g) => g.requires);
    const all = ZONES.flatMap((z) => z.gates.filter((g) => g.requires).map((g) => ({ zone: z, gate: g })));
    expect(all.length).toBeGreaterThan(0);
    const { zone, gate: g } = lockedGate ? { zone: cinder, gate: lockedGate } : all[0]!;
    expect(prefetcher.update(zone, g.x, g.z, () => true)).toEqual([]);
    expect(prefetcher.update(zone, g.x, g.z, () => false)).toContain(g.to.zone);
  });

  it('a failing fetch is swallowed', async () => {
    const warn = vi.fn();
    const p = new ZonePrefetcher({
      hasZone: () => true,
      zoneDef,
      assetIds: () => [],
      ensure: () => Promise.reject(new Error('offline')),
      ground: async () => undefined,
      idle: (fn) => fn(),
    });
    expect(() => p.update(cinder, gate.x, gate.z)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    void warn;
  });
});
