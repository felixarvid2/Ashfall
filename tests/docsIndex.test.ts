import { describe, expect, it } from 'vitest';
import { buildIndex, slug, withIndex } from '../scripts/docs/decisionsIndex';

const sample = `# Decisions log

Short records.

### 2026-10-02 — Player-facing language is English
text

### 2026-10-02 — Same title
text

### 2026-10-02 — Same title
text
`;

describe('decisions index (round 4 B19)', () => {
  it('makes GitHub-style anchors', () => {
    expect(slug('2026-10-02 — Player-facing language is English')).toBe('2026-10-02--player-facing-language-is-english');
    expect(slug('Round 4 tech (B01-B20)')).toBe('round-4-tech-b01-b20');
  });

  it('lists every entry, numbering anchors of repeated titles like GitHub does', () => {
    const lines = buildIndex(sample).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('- [2026-10-02 — Player-facing language is English](#2026-10-02--player-facing-language-is-english)');
    expect(lines[1]).toContain('(#2026-10-02--same-title)');
    expect(lines[2]).toContain('(#2026-10-02--same-title-1)');
  });

  it('inserts the index once and is stable when run again or after a new entry', () => {
    const once = withIndex(sample);
    expect(once).toContain('## Index');
    expect(withIndex(once)).toBe(once);
    const more = withIndex(`${once}\n### 2026-11-08 — New\ntext\n`);
    expect(more.match(/## Index/g)).toHaveLength(1);
    expect(more).toContain('- [2026-11-08 — New](#2026-11-08--new)');
    // The index itself is not indexed.
    expect(more.match(/Player-facing language/g)!.length).toBe(2);
  });
});
