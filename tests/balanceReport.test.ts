/** D14: the balance report's layout (the measuring itself is `npm run balance:report`). */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderReport, type BuildRow } from '../scripts/sim/balanceReport';

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

  it('the npm script exists, and a generated report is checked in once it has been run', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['balance:report']).toContain('balanceReport.ts');
    const file = new URL('../docs/balance-report.md', import.meta.url);
    if (existsSync(file)) expect(readFileSync(file, 'utf8')).toContain('## Builds (damage per second)');
  });
});
