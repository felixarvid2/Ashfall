import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BannerQueue } from '../src/ui/bannerQueue';
import en from '../src/data/lang/en.json';

const css = (path: string) => readFileSync(new URL(`../src/ui/${path}`, import.meta.url), 'utf8');
const feedback = css('desktop/feedback.css');

/** Every rule in the desktop file whose selector list mentions `.target-` etc. is scoped to desktop or is a neutral base rule. */
describe('desktop feedback CSS (A019-A050)', () => {
  it('keeps desktop-only rules under #ui:not(.touch-ui)', () => {
    for (const sel of ['.hud-title.faded', '.target-pct', '.target-tick', '.target-frame.boss', '.center-banner.levelup', '.region-card', '.death-respawn', '.has-target']) {
      expect(feedback).toContain(`#ui:not(.touch-ui)${sel.startsWith('.has') ? sel : ' ' + sel}`.replace('#ui:not(.touch-ui) .has-target', '#ui:not(.touch-ui).has-target'));
    }
  });

  it('shows the low-life vignette on every layout and honours reduced motion and flashing', () => {
    const portrait = css('portrait/hud.css');
    expect(portrait).toContain('#ui .low-life-vignette {');
    expect(portrait).not.toContain('#ui.touch-ui .low-life-vignette');
    expect(feedback).toContain('#ui.reduce-flashing .low-life-vignette.on { animation: none');
  });

  it('does not enlarge the normal target frame or the region card', () => {
    expect(feedback).not.toMatch(/\.target-frame \{[^}]*width/);
    expect(feedback).toContain('min(420px, 86vw)');
  });

  it('gives the desktop respawn button a 180 x 36 size and a lock fill', () => {
    expect(feedback).toMatch(/\.death-respawn \{[^}]*width: 180px;[^}]*height: 36px/s);
    expect(feedback).toContain('rise-fill');
    expect(en.hud.riseKey).toContain('{key}');
  });

  it('moves toasts and the event box off the target frame', () => {
    expect(feedback).toMatch(/\.has-target \.toast-stack \{ top: max\(128px/);
    expect(feedback).toMatch(/\.has-target \.event-box \{[^}]*right: 14px; top: 290px; width: 230px/);
  });
});

describe('dying clears the banner queue (A043)', () => {
  it('drops the current and the waiting banners', () => {
    const q = new BannerQueue();
    q.push({ text: 'Quest complete', seconds: 2 });
    q.push({ text: 'Level 3', seconds: 2 });
    q.tick(0);
    q.clear();
    expect(q.current).toBeNull();
    expect(q.length).toBe(0);
  });
});
