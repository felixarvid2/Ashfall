import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return sources(rel);
    return rel.endsWith('.ts') ? [rel] : [];
  });
}

describe('determinism guards', () => {
  it('gameplay code never calls Math.random (src/core/rng.ts)', () => {
    const files = ['src/game.ts', ...sources('src/systems'), ...sources('src/world')];
    const offenders = files.filter((f) => /Math\.random\s*\(/.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the UI keeps preferences in core/localPrefs instead of touching localStorage itself', () => {
    const offenders = sources('src/ui').filter((f) => /\blocalStorage\s*\./.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
