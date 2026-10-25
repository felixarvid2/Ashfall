import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STATUSES } from '../src/data/statuses';
import { t } from '../src/data/i18n';
import { cooldownLabel } from '../src/ui/hud';

const css = readFileSync(new URL('../src/ui/desktop/hud.css', import.meta.url), 'utf8');

describe('cooldown label (A002)', () => {
  it('shows whole seconds (rounded up) from 2 s and one decimal below', () => {
    expect(cooldownLabel(5.2, 8)).toBe('6');
    expect(cooldownLabel(2, 8)).toBe('2');
    expect(cooldownLabel(1.96, 8)).toBe('2.0');
    expect(cooldownLabel(1.44, 8)).toBe('1.4');
    expect(cooldownLabel(0.8, 2.1)).toBe('0.8');
  });

  it('is empty when ready, almost ready, or for very short cooldowns', () => {
    expect(cooldownLabel(0, 8)).toBe('');
    expect(cooldownLabel(0.04, 8)).toBe('');
    expect(cooldownLabel(0.3, 0.5)).toBe('');
  });
});

describe('status tooltips (A014)', () => {
  it('has a name and an effect line for every status', () => {
    for (const id of Object.keys(STATUSES)) {
      expect(t(`statuses.${id}`), id).not.toMatch(/^statuses\./);
      expect(t(`statusDesc.${id}`), id).not.toMatch(/^statusDesc\./);
    }
  });
});

describe('desktop action bar CSS (A001-A015)', () => {
  // Every rule added after the section header either targets `#ui:not(.touch-ui)` / `#ui.reduce-flashing` or is a keyframe/media block.
  const section = css.slice(css.indexOf('/* ==== Action bar'));
  const selectors = section
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '')
    .replace(/@media[^{]*\{/g, '')
    .split('}')
    .map((r) => r.split('{')[0]!.trim())
    .filter((s) => s.length > 0);

  it('keeps every rule off the touch layouts', () => {
    expect(selectors.length).toBeGreaterThan(20);
    const global = selectors.filter((s) => s.split(',').some((p) => !/^#ui(:not\(\.touch-ui\))?(\.reduce-flashing|:not\(\.reduce-flashing\))?\s/.test(p.trim()) && !p.trim().startsWith('#ui:not(.touch-ui)')));
    // The one deliberate global rule: the one-decimal cooldown text (the touch buttons have room for it).
    expect(global).toEqual(['.slot-cd-text.fine']);
  });

  it('never makes a slot, orb or tile bigger', () => {
    expect(section).not.toMatch(/(^|[;{\s])(width|height|min-height|font-size):\s*(?:6[3-9]|[7-9]\d|1\d\d)px/m);
  });

  it('turns the pulsing and flashing looks off with reduce-flashing', () => {
    for (const hook of ['.slot.ready', '.slot.urgent', '.orb-life.hit::after', '.xp-bar.gain', '.buff.expiring']) {
      expect(css, hook).toMatch(new RegExp(`reduce-flashing[^{]*${hook.replace(/[.()]/g, '\\$&')}`));
    }
  });
});
