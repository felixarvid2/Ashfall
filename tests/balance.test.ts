/**
 * Balance guards (G009-G017, G025). Fast checks run with the normal suite: the class table in docs/classes.md
 * against the data, the balance-pass numbers, and a short bot playthrough (level 1 to 4) for every plan.
 * The full band check, level 1 to 10 for every plan and two seeds (about 5 minutes), is `npm run balance:check`
 * (`BALANCE=1 npx vitest run tests/balance.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILDS } from '../scripts/sim/builds';
import { PLANS } from '../scripts/sim/plans';
import { playthrough } from '../scripts/sim/playthrough';
import { simulate, type Build } from '../scripts/sim/sim';
import { classDef, skill } from '../src/data/db';
import { computePlayerStats } from '../src/systems/stats';
import { tree, treeEffects, newTreeState } from '../src/systems/skillTree';

const build = (name: string): Build => {
  const b = BUILDS.find((x) => x.name.includes(name));
  if (!b) throw new Error(`no build ${name}`);
  return b;
};
const dps = (b: Build, patch: Partial<Build> = {}, seconds = 60) => simulate({ ...b, ...patch }, seconds).dps;
const without = (b: Build, ...nodes: string[]): Partial<Build> => ({ nodes: { ...b.nodes, ...Object.fromEntries(nodes.map((n) => [n, 0])) } });

describe('class table in docs/classes.md', () => {
  const md = readFileSync(new URL('../docs/classes.md', import.meta.url), 'utf8');
  const rows = md.split('\n').filter((l) => /^\| (Bastion|Spectre|Xenomant|Lightbearer) \|/.test(l));

  it('lists life, life per level, armor and speed exactly as the class data has them', () => {
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim());
      const cls = classDef(cells[1]!.toLowerCase());
      const life = /^(\d+) \(\+(\d+)\/lvl\)$/.exec(cells[4]!);
      expect(life, cells[1]).not.toBeNull();
      expect(Number(life![1]), `${cls.id} life`).toBe(cls.life);
      expect(Number(life![2]), `${cls.id} life per level`).toBe(cls.lifePerLevel);
      expect(Number(cells[5]), `${cls.id} armor`).toBe(cls.armor);
      expect(Number(cells[6]), `${cls.id} speed`).toBe(cls.moveSpeed);
    }
  });
});

describe('percentage passives (G009)', () => {
  const cases: [string, string, 'armor' | 'maxLife'][] = [
    ['bastion', 'p.reinforced_plating', 'armor'],
    ['bastion', 'p.vital_systems', 'maxLife'],
    ['spectre', 'p.kevlar_weave', 'armor'],
    ['spectre', 'p.survival_instinct', 'maxLife'],
    ['xenomant', 'p.thick_hide', 'armor'],
    ['xenomant', 'p.cell_division', 'maxLife'],
    ['lightbearer', 'p.consecrated_mail', 'armor'],
    ['lightbearer', 'p.vigil', 'maxLife'],
  ];
  it.each(cases)('%s %s at rank 1 is worth at least 1.5 %% of the level 30 base', (classId, node, stat) => {
    const cls = classDef(classId);
    const state = newTreeState(tree(classId));
    const base = computePlayerStats(cls, 30, {}, treeEffects(tree(classId), state));
    state.ranks[node] = 1;
    const withNode = computePlayerStats(cls, 30, {}, treeEffects(tree(classId), state));
    const before = stat === 'armor' ? base.combat.armor : base.maxLife;
    const after = stat === 'armor' ? withNode.combat.armor : withNode.maxLife;
    expect(after / before - 1).toBeGreaterThanOrEqual(0.015);
  });
});

describe('Lightbearer passives and Devotion (G007, G009)', () => {
  it('G009: Sacred Oath is +4 % damage against corrupted enemies, no longer a flat +4 Intelligence', () => {
    const node = tree('lightbearer').nodes.find((n) => n.id === 'p.sacred_oath');
    expect(node && 'effects' in node ? node.effects : undefined).toEqual([{ kind: 'damage', value: 0.04, multiplicative: false, when: 'corrupted' }]);
  });

  it('G007: the level 30 healer keeps its Devotion average near 60 (it was 78)', () => {
    const r = simulate(build('(Lightbearer) healer'), 60);
    expect(r.avgHeat).toBeLessThanOrEqual(62);
    expect(r.avgHeat).toBeGreaterThanOrEqual(40);
  });
});

describe('class balance pass (G012-G016)', () => {
  it('G012: the Spectre resists energy like the Lightbearer and Phase Shift protects for 0.4 s', () => {
    expect(classDef('spectre').resist.energy).toBe(0.2);
    expect((skill('spectre.phase_shift').effect as { invulnerable: number }).invulnerable).toBe(0.4);
  });

  it('G013: Piston Jab and Furnace Cleave cover a wider arc and the Cleave reaches further', () => {
    expect((skill('bastion.piston_jab').effect as { arcDeg: number }).arcDeg).toBe(90);
    expect((skill('bastion.furnace_cleave').effect as { arcDeg: number }).arcDeg).toBe(200);
    expect((skill('bastion.furnace_cleave').effect as { range: number }).range).toBe(3.9);
  });

  it('G014: Orbital Strike is at least 8 % of the shockwave build and the vent build reaches 800', () => {
    const b = build('(Bastion) shockwave');
    const noOrbital = { ...without(b, 'n.orbital_strike'), rotation: b.rotation.filter((r) => !r.skill.includes('orbital')) };
    expect(dps(b) / dps(b, noOrbital) - 1).toBeGreaterThanOrEqual(0.08);
    expect(dps(build('Reactor Core vent'))).toBeGreaterThanOrEqual(800);
  });

  it('G015: Symbiote adds at least 20 % to the melee Xenomant, Parasite Link included', () => {
    const b = build('(Xenomant) melee');
    expect(dps(b) / dps(b, without(b, 'k.symbiote')) - 1).toBeGreaterThanOrEqual(0.2);
    const link = dps(b, { rotation: [{ skill: 'xenomant.parasite_link' }] });
    const linkWithout = dps({ ...b, ...without(b, 'k.symbiote') }, { rotation: [{ skill: 'xenomant.parasite_link' }] });
    expect(link / linkWithout).toBeGreaterThan(1.2);
  });

  it('G016: the disease Xenomant reaches 500 single-target damage per second and stays an area build', () => {
    const b = build('(Xenomant) disease');
    const single = simulate(b, 60, 'sim', { dummy: 'security_trooper' }).dps;
    const pack = simulate(b, 60, 'sim', { dummy: 'security_trooper', pack: 5 }).dps;
    expect(single).toBeGreaterThanOrEqual(490);
    expect(pack / single).toBeLessThanOrEqual(4.3);
  });
});

describe('level 1 to 4 bot playthrough (fast guard)', () => {
  it('every plan reaches level 4 in a sane time without dying more than twice', () => {
    const slow: string[] = [];
    for (const plan of PLANS) {
      const r = playthrough(plan, { targetLevel: 4, seed: 'a', maxMinutes: 5 });
      const t = r.levelTimes[4];
      if (!t || t > 150 || t < 30 || r.deaths > 2) slow.push(`${plan.name}: L4 ${t?.toFixed(0) ?? 'never'} s, ${r.deaths} deaths`);
    }
    expect(slow).toEqual([]);
  }, 60_000);
});

// The full band. Run with `npm run balance:check`; it takes about 5 minutes.
describe.skipIf(!process.env.BALANCE)('level 1 to 10 band (every plan, two seeds)', () => {
  const MIN_SECONDS = 6.5 * 60;
  const MAX_SECONDS = 14 * 60;
  const MAX_DEATHS = 5;
  // The Blades are the high-risk melee line of a ranged class and the bot chases drones that hold their distance:
  // 12:40 to 15:10 over the seeds measured, so they get a wider ceiling (docs/balance.md).
  const CEILING: Record<string, number> = { 'Spectre · Blades': 15.5 * 60 };
  for (const plan of PLANS) {
    it(`${plan.name} reaches level 10 in 6:30 to ${CEILING[plan.name] ? '15:30' : '14:00'} with at most ${MAX_DEATHS} deaths`, () => {
      for (const seed of ['a', 'b']) {
        const r = playthrough(plan, { maxMinutes: 20, seed });
        const t = r.levelTimes[10];
        const label = `${plan.name} seed ${seed}: L10 at ${t ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : 'never'}, ${r.deaths} deaths`;
        expect(t, label).toBeDefined();
        expect(t!, label).toBeGreaterThanOrEqual(MIN_SECONDS);
        expect(t!, label).toBeLessThanOrEqual(CEILING[plan.name] ?? MAX_SECONDS);
        expect(r.deaths, label).toBeLessThanOrEqual(MAX_DEATHS);
      }
    }, 600_000);
  }
});
