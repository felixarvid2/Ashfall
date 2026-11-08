// @vitest-environment happy-dom
/** B13: the zone change card shows real loading progress. */
import { describe, expect, it } from 'vitest';
import { FeelUi, loadFraction } from '../src/ui/feelUi';

describe('zone loading progress (round 4 B13)', () => {
  it('turns done/total into a 0..1 share and treats nothing to load as done', () => {
    expect(loadFraction(0, 10)).toBe(0);
    expect(loadFraction(5, 10)).toBe(0.5);
    expect(loadFraction(12, 10)).toBe(1);
    expect(loadFraction(0, 0)).toBe(1);
  });

  it('the card bar follows the loaded count, is a labelled progressbar and hides when a new card starts', () => {
    const fade = document.createElement('div');
    const feel = new FeelUi(document.createElement('div'), fade);
    const bar = fade.querySelector<HTMLElement>('[data-testid="zone-progress"]')!;
    expect(bar.hidden).toBe(true);
    feel.setProgress(3, 12);
    expect(bar.hidden).toBe(false);
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(bar.querySelector<HTMLElement>('.zone-card-bar')!.style.width).toBe('25%');
    expect(bar.textContent).toBe('Loading 3 / 12');
    feel.setProgress(12, 12);
    expect(bar.querySelector<HTMLElement>('.zone-card-bar')!.style.width).toBe('100%');
    feel.setCard('Deep Mines', true);
    expect(bar.hidden).toBe(true);
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
  });
});
