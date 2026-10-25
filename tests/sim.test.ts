import { describe, expect, it } from 'vitest';
import { BUILDS } from '../scripts/sim/builds';
import { simulate } from '../scripts/sim/sim';

describe('balance simulator', () => {
  it('runs every sample build and damage grows with level', () => {
    const results = BUILDS.map((b) => simulate(b, 10));
    for (const r of results) expect(r.dps).toBeGreaterThan(0);
    const level1 = results.filter((_, i) => BUILDS[i]!.level === 1);
    const level30 = results.filter((_, i) => BUILDS[i]!.level === 30);
    const maxL1 = Math.max(...level1.map((r) => r.dps));
    expect(Math.min(...level30.map((r) => r.dps))).toBeGreaterThan(maxL1 * 5);
  });

  it('is deterministic for a seed', () => {
    const b = BUILDS[1]!;
    expect(simulate(b, 5, 'x').dps).toBe(simulate(b, 5, 'x').dps);
  });
});

describe('packs and neutral dummies (G010)', () => {
  it('a pack of five does at least as much damage as one target for every build', () => {
    for (const b of BUILDS) {
      const single = simulate(b, 10, 'sim', { dummy: 'security_trooper' }).dps;
      const pack = simulate(b, 10, 'sim', { dummy: 'security_trooper', pack: 5 }).dps;
      // Crit rolls differ a little once more enemies are hit, hence the margin.
      expect(pack, b.name).toBeGreaterThanOrEqual(single * 0.95);
    }
  });

  it('a dummy outside the corrupted families removes the Lightbearer bonus', () => {
    const exorcist = BUILDS.find((b) => b.name.includes('L30 (Lightbearer) exorcist'))!;
    const corrupted = simulate(exorcist, 30).dps;
    const neutral = simulate(exorcist, 30, 'sim', { dummy: 'security_trooper' }).dps;
    expect(neutral).toBeLessThan(corrupted * 0.7);
    // Classes without a corrupted bonus do not care which dummy they hit.
    const bastion = BUILDS.find((b) => b.name.includes('L30 (Bastion) shockwave'))!;
    expect(simulate(bastion, 30, 'sim', { dummy: 'security_trooper' }).dps).toBeCloseTo(simulate(bastion, 30).dps, 5);
  });

  it('the area builds gain far more from a pack than the single-target ones', () => {
    const gain = (name: string) => {
      const b = BUILDS.find((x) => x.name.includes(name))!;
      return simulate(b, 20, 'sim', { dummy: 'security_trooper', pack: 5 }).dps / simulate(b, 20, 'sim', { dummy: 'security_trooper' }).dps;
    };
    expect(gain('(Bastion) shockwave')).toBeGreaterThan(2.5);
    expect(gain('(Xenomant) disease')).toBeGreaterThan(3);
    expect(gain('(Spectre) sniper')).toBeLessThan(gain('(Spectre) trapper'));
  });
});
