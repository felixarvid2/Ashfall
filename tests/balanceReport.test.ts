/** D14: the balance report's layout (the measuring itself is `npm run balance:report`). */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderReport, type BuildRow, type StageRow } from '../scripts/sim/balanceReport';

describe('balance report (D14)', () => {
  const rows: BuildRow[] = [
    { name: 'L30 test build', level: 30, classId: 'bastion', corrupted: 1234.4, neutral: 800, pack: 2400 },
    { name: 'L10 test build', level: 10, classId: 'spectre', corrupted: 100, neutral: 90, pack: 200 },
  ];

  it('writes a markdown table per section with the numbers rounded and the pack ratio', () => {
    const md = renderReport([{ name: 'Bastion · Hammer', l10: 8 * 60 + 5, deaths: 1 }, { name: 'Slow plan', deaths: 7 }], rows, '2026-10-25');
    expect(md).toContain('# Balance report');
    expect(md).toContain('| Bastion · Hammer | 8:05 | 1 |');
    expect(md).toContain('| Slow plan | never | 7 |');
    expect(md).toContain('| L30 test build | bastion | 30 | 1,234 | 800 | 2,400 | 3.00x |');
    expect(md).toContain('| bastion | 800 | 1,234 | 1 |');
    expect(md).not.toContain('| spectre | 90 |'); // only level 30 builds are summed per class
  });

  it('adds the level 10 to 50 and survivability sections when it has the rows (B05, B06)', () => {
    const withSurvival: BuildRow[] = [{ ...rows[0]!, survival: { deaths: 2, below30: 0.065, minLife: 0.018, avgLife: 0.7, takenPerSecond: 52.9, potions: 6 } }];
    const stages: StageRow[] = [
      { stage: 'Deep Mines (30-40)', plan: 'Bastion · Seismic Shock', classId: 'bastion', from: 30, to: 40, reached: 40, first: 90, mid: 500, end: 1240, deaths: 3, avgLife: 0.64 },
      { stage: 'Deep Mines (30-40)', plan: 'Spectre · Sniper', classId: 'spectre', from: 30, to: 40, reached: 36, first: 80, deaths: 9, avgLife: 0.5 },
    ];
    const md = renderReport([], withSurvival, '2026-11-08', stages);
    expect(md).toContain('## Level 10 to 50 (bot, one plan per class)');
    expect(md).toContain('### Deep Mines (30-40)');
    expect(md).toContain('| bastion | Bastion · Seismic Shock | 40/40 | 1:30 | 8:20 | 20:40 | 3 | 64 % |');
    expect(md).toContain('| spectre | Spectre · Sniper | 36/40 | 1:20 | never | never | 9 | 50 % |');
    expect(md).toContain('## Survivability (dummies that hit back)');
    expect(md).toContain('| L30 test build | bastion | 30 | 2 | 7 % | 2 % | 53 |');
    // Without the extra rows the sections stay out.
    const plain = renderReport([], rows, '2026-11-08');
    expect(plain).not.toContain('Survivability');
    expect(plain).not.toContain('Level 10 to 50');
  });

  it('the npm script exists, and a generated report is checked in once it has been run', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['balance:report']).toContain('balanceReport.ts');
    const file = new URL('../docs/balance-report.md', import.meta.url);
    if (existsSync(file)) expect(readFileSync(file, 'utf8')).toContain('## Builds (damage per second)');
  });
});
