import { afterEach, describe, expect, it } from 'vitest';
import { registerLanguage, setLanguage, t } from '../src/data/i18n';

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
