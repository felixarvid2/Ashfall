/**
 * C05: no silent failure. A `catch` block needs a statement or a comment saying why ignoring the error is right,
 * and a promise `.catch(() => {})` / `.catch(() => undefined)` needs a comment on its line or the line above.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;

function tsFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return tsFiles(rel);
    return rel.endsWith('.ts') ? [rel] : [];
  });
}

const FILES = ['src', 'scripts', 'tools'].flatMap(tsFiles);
const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

describe('silent catches', () => {
  it('no empty catch block without a comment', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      for (const m of text.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{(\s*)\}/g)) offenders.push(`${f}:${lineOf(text, m.index!)}`);
    }
    expect(offenders, 'add a comment (or handle the error) in each empty catch').toEqual([]);
  });

  it('no swallowing .catch(() => {}) without a comment', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/\.catch\(\s*\(\)\s*=>\s*(\{\s*\}|undefined|null)\s*\)/.test(line)) return;
        if (/\/\/|\/\*/.test(line) || /^\s*(\/\/|\*|\/\*)/.test(lines[i - 1] ?? '')) return;
        offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the scanner sees the catches that exist', () => {
    // Guards the guard: the regexes above must still match the shapes they police.
    expect('try { x() } catch { }'.match(/\bcatch\s*(?:\([^)]*\))?\s*\{(\s*)\}/)).not.toBeNull();
    expect('try { x() } catch (e) {\n}'.match(/\bcatch\s*(?:\([^)]*\))?\s*\{(\s*)\}/)).not.toBeNull();
    expect('p.catch(() => {})'.match(/\.catch\(\s*\(\)\s*=>\s*(\{\s*\}|undefined|null)\s*\)/)).not.toBeNull();
    expect(FILES.length).toBeGreaterThan(100);
  });
});
