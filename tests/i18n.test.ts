import { afterEach, describe, expect, it } from 'vitest';
import { registerLanguage, setLanguage, setTouchWording, t, touchText } from '../src/data/i18n';
import en from '../src/data/lang/en.json';
import { NPCS } from '../src/data/quests/db';

describe('i18n', () => {
  afterEach(() => setLanguage('en'));

  it('looks up nested keys', () => {
    expect(t('game.title')).toBe('Ashfall');
  });

  it('interpolates parameters and leaves unknown placeholders', () => {
    expect(t('save.importFailed', { reason: 'bad file' })).toBe('Could not import save: bad file');
    expect(t('save.importFailed')).toBe('Could not import save: {reason}');
  });

  it('returns the key for missing strings', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('falls back to English for keys missing in another language', () => {
    registerLanguage('xx', { game: { title: 'Askfall' } });
    setLanguage('xx');
    expect(t('game.title')).toBe('Askfall');
    expect(t('save.saved')).toBe('Game saved');
  });

  it('rejects unknown languages', () => {
    expect(() => setLanguage('zz')).toThrow();
  });
});

describe('touch wording', () => {
  afterEach(() => setTouchWording(false));

  it('fills the aim phrase of skill texts for mouse and touch', () => {
    expect(t('skills.bastion.orbital_strike.desc')).toContain('at the cursor');
    setTouchWording(true);
    expect(t('skills.bastion.orbital_strike.desc')).toContain('at your target');
    expect(t('skills.bastion.orbital_strike.desc')).not.toContain('{aim');
  });

  it('touchText picks the Touch variant only on touch', () => {
    expect(touchText('map.travel')).toMatch(/^Click/);
    setTouchWording(true);
    expect(touchText('map.travel')).toMatch(/^Tap/);
    // No variant: the plain string.
    expect(touchText('save.saved')).toBe('Game saved');
  });
});

/** Every string value in the language file with its dotted key. */
function strings(node: unknown, path: string[] = [], out: [string, string][] = []): [string, string][] {
  if (typeof node === 'string') out.push([path.join('.'), node]);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) strings(v, [...path, k], out);
  return out;
}

describe('language string lint (C022)', () => {
  const all = strings(en);
  /** Text outside {placeholders}. */
  const prose = (s: string) => s.replace(/\{[^}]*\}/g, '');
  const report = (bad: string[]) => expect(bad, bad.join('\n')).toEqual([]);

  it('has no double spaces and no leading or trailing spaces', () => {
    report(all.filter(([, v]) => / {2}/.test(v) || v !== v.trim()).map(([k]) => k));
  });

  it('uses British spelling (armour, defence, colour, centre, fervour)', () => {
    const american = /\b(armored|armor\w*|defen[s]e\w*|color\w*|center\w*|fervor\w*|labeled|recogniz\w*|authoriz\w*|meters?|gray|honor\w*)\b/i;
    // "meter" is a gauge, not a length, in a few UI strings; lengths are written in metres.
    report(all.filter(([, v]) => american.test(prose(v).replace(/\bmeters?\b/gi, ''))).map(([k, v]) => `${k}: ${v.slice(0, 60)}`));
  });

  it('names no real brand or other game', () => {
    report(all.filter(([, v]) => /\b(Kevlar|Diablo|iPhone)\b/.test(v)).map(([k]) => k));
  });

  it('has balanced {placeholders}', () => {
    report(
      all
        .filter(([, v]) => {
          let depth = 0;
          for (const c of v) {
            if (c === '{') depth++;
            else if (c === '}') depth--;
            if (depth < 0 || depth > 1) return true;
          }
          return depth !== 0;
        })
        .map(([k]) => k),
    );
  });
});

describe('NPC greetings (C023)', () => {
  const npcs = (en as unknown as { npcs: Record<string, Record<string, string>> }).npcs;

  it('every NPC has a greeting, and every greeting variant belongs to an NPC', () => {
    for (const id of NPCS.keys()) expect(npcs[id]?.greeting, id).toBeTruthy();
    for (const [id, entry] of Object.entries(npcs)) {
      expect(NPCS.has(id), `npcs.${id} is not an NPC`).toBe(true);
      for (const key of Object.keys(entry)) if (key.startsWith('greeting')) expect(['greeting', 'greetingLate', 'greetingEnd']).toContain(key);
    }
  });
});
