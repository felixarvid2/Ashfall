import { afterEach, describe, expect, it } from 'vitest';
import { registerLanguage, setLanguage, setTouchWording, t, touchText } from '../src/data/i18n';

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
