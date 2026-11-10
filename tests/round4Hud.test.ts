// @vitest-environment happy-dom
/** Round 4 HUD items: C09 damage number modes. */
import { describe, expect, it } from 'vitest';
import { defaultSettings, SettingsSchema } from '../src/data/settings';
import { DamageNumbers, showsNumber, type DamageNumberMode } from '../src/ui/damageNumbers';
import type { GameEvent } from '../src/core/events';

const hit = (over: Partial<Extract<GameEvent, { type: 'damage' }>> = {}): GameEvent => ({
  type: 'damage', target: 1 as never, x: 0, y: 0, z: 0, amount: 50, absorbed: 0, crit: false, damageType: 'physical' as never, toPlayer: false, dot: false, ...over,
});

function make(mode: DamageNumberMode) {
  const root = document.createElement('div');
  const dn = new DamageNumbers(root, 80, () => 1000, () => mode);
  const count = () => root.querySelectorAll('.damage-layer > div').length;
  return { root, dn, count };
}

describe('damage number modes (C09)', () => {
  it('defaults to full and old settings without the key keep working', () => {
    expect(defaultSettings().damageNumbers).toBe('full');
    expect(SettingsSchema.parse({ textScale: 1 }).damageNumbers).toBe('full');
  });

  it('off shows nothing, not even heals or damage taken', () => {
    const { dn, count } = make('off');
    dn.handle(hit());
    dn.handle(hit({ crit: true }));
    dn.handle(hit({ toPlayer: true }));
    dn.handle({ type: 'heal', target: 1 as never, x: 0, y: 0, z: 0, amount: 10 });
    expect(count()).toBe(0);
  });

  it('full shows every hit as before', () => {
    const { dn, count } = make('full');
    dn.handle(hit({ amount: 1 }));
    dn.handle(hit({ amount: 1, crit: true }));
    expect(count()).toBe(2);
  });

  it('compact drops small plain hits and small DoT ticks but keeps crits, big hits and damage taken', () => {
    expect(showsNumber('compact', {}, 5, 1000)).toBe(false);
    expect(showsNumber('compact', { dot: true }, 30, 1000)).toBe(false);
    expect(showsNumber('compact', { dot: true }, 80, 1000)).toBe(true);
    expect(showsNumber('compact', { crit: true }, 5, 1000)).toBe(true);
    expect(showsNumber('compact', {}, 50, 1000)).toBe(true);
    expect(showsNumber('compact', { toPlayer: true }, 1, 1000)).toBe(true);
    const { dn, root, count } = make('compact');
    dn.handle(hit({ amount: 5 }));
    expect(count()).toBe(0);
    dn.handle(hit({ amount: 60, crit: true }));
    expect(count()).toBe(1);
    expect(root.querySelector('.dmg-compact.dmg-crit')).toBeTruthy();
  });

  it('compact merges a burst on one target into one number', () => {
    const { dn, count } = make('compact');
    dn.handle(hit({ amount: 40 }));
    dn.handle(hit({ amount: 40 }));
    expect(count()).toBe(1);
  });
});

// ---- C11 / C12 on the real HUD ----------------------------------------------------------------------------
import { beforeEach, vi } from 'vitest';
import { Hud, type HudState } from '../src/ui/hud';
import { HEARTBEAT_PERIOD_MS, LOW_LIFE_SHARE, heartbeatRunning, setHeartbeat } from '../src/audio/heartbeat';

function hudState(over: Partial<HudState> = {}): HudState {
  return {
    life: { current: 80, max: 100, barrier: 0 },
    resource: { kind: 'heat', current: 30, max: 100, overheating: false },
    slots: [
      { id: 'bastion.hydraulic_strike', cooldown: 0, cooldownMax: 1, affordable: true },
      { id: 'bastion.seismic_shock', cooldown: 3, cooldownMax: 6, affordable: true },
      { id: null, cooldown: 0, cooldownMax: 0, affordable: true },
      { id: null, cooldown: 0, cooldownMax: 0, affordable: true },
      { id: null, cooldown: 0, cooldownMax: 0, affordable: true },
      { id: null, cooldown: 0, cooldownMax: 0, affordable: true },
    ],
    dodge: { cooldown: 0, max: 2 },
    potion: { charges: 2, max: 3, recharge: 0, rechargeMax: 10 },
    wave: null,
    target: null,
    dead: false,
    xp: { level: 5, current: 40, next: 100, skillPoints: 0 },
    ...over,
  };
}

describe('ability cooldown sweep and ready flash (C11)', () => {
  let root: HTMLElement;
  let hud: Hud;
  beforeEach(() => {
    document.body.replaceChildren();
    root = document.createElement('div');
    root.id = 'ui';
    document.body.append(root);
    hud = new Hud(root, () => {});
  });

  it('paints a radial sweep that shrinks with the cooldown, and flashes the button when it ends', () => {
    hud.update(hudState(), 0.016);
    const slot = [...root.querySelectorAll<HTMLElement>('.slot')].find((s) => s.classList.contains('cooling'))!;
    expect(slot).toBeTruthy();
    const sweep = slot.querySelector<HTMLElement>('.slot-cd')!;
    expect(sweep.style.background).toContain('conic-gradient');
    expect(slot.classList.contains('ready')).toBe(false);
    const cooled = hudState();
    cooled.slots[1] = { ...cooled.slots[1]!, cooldown: 0 };
    hud.update(cooled, 0.016);
    expect(slot.classList.contains('cooling')).toBe(false);
    expect(slot.classList.contains('ready')).toBe(true);
  });
});

describe('low-life feedback (C12)', () => {
  let root: HTMLElement;
  let hud: Hud;
  beforeEach(() => {
    document.body.replaceChildren();
    root = document.createElement('div');
    root.id = 'ui';
    document.body.append(root);
    hud = new Hud(root, () => {});
  });

  it('turns the vignette on below 25 % life and off above it, and reports the crossing once', () => {
    expect(LOW_LIFE_SHARE).toBe(0.25);
    const calls: boolean[] = [];
    hud.onLowLife = (low) => calls.push(low);
    hud.update(hudState({ life: { current: 30, max: 100, barrier: 0 } }), 0.016);
    expect(root.querySelector('.low-life-vignette')!.classList.contains('on')).toBe(false);
    hud.update(hudState({ life: { current: 24, max: 100, barrier: 0 } }), 0.016);
    hud.update(hudState({ life: { current: 20, max: 100, barrier: 0 } }), 0.016);
    expect(root.querySelector('.low-life-vignette')!.classList.contains('on')).toBe(true);
    hud.update(hudState({ life: { current: 60, max: 100, barrier: 0 } }), 0.016);
    expect(root.querySelector('.low-life-vignette')!.classList.contains('on')).toBe(false);
    expect(calls).toEqual([true, false]);
  });

  it('the heartbeat starts and stops on its own timer', () => {
    vi.useFakeTimers();
    setHeartbeat(true);
    expect(heartbeatRunning()).toBe(true);
    vi.advanceTimersByTime(HEARTBEAT_PERIOD_MS * 2);
    setHeartbeat(false);
    expect(heartbeatRunning()).toBe(false);
    vi.useRealTimers();
  });
});

// ---- C10 boss phases ---------------------------------------------------------------------------------------
import { bossPhaseLabel, bossPhaseTicks } from '../src/ui/hud';
import { BOSS_SCRIPTS } from '../src/data/bosses';
import { t } from '../src/data/i18n';

describe('boss bar phases (C10)', () => {
  it('reports the tick positions and the current phase of a scripted boss, and nothing for others', () => {
    expect(bossPhaseTicks(undefined)).toEqual({});
    expect(bossPhaseTicks('no_such_script')).toEqual({});
    expect(bossPhaseTicks('the_first')).toEqual({ phases: [0.6, 0.25] });
    expect(bossPhaseLabel('the_first', 1)).toEqual({ phase: { index: 1, count: 3 } });
    expect(bossPhaseLabel(undefined)).toEqual({});
  });

  it('every phase after the first of every boss script has a banner that resolves to text', () => {
    for (const [id, list] of Object.entries(BOSS_SCRIPTS)) {
      list.slice(1).forEach((p, i) => {
        expect(p.banner, `${id} phase ${i + 2}`).toBeTruthy();
        expect(t(p.banner!)).not.toBe(p.banner);
      });
    }
  });

  it('the boss frame shows "Phase 2/3", dims passed ticks and flashes on a new phase', () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    root.id = 'ui';
    document.body.append(root);
    const hud = new Hud(root, () => {});
    const boss = (current: number, index: number) =>
      hudState({ target: { name: 'The First', current, max: 100, statuses: [], phases: [0.6, 0.25], phase: { index, count: 3 } } });
    hud.update(boss(90, 0), 0.016);
    const label = root.querySelector<HTMLElement>('.target-phase')!;
    expect(label.hidden).toBe(false);
    expect(label.textContent).toBe('Phase 1/3');
    expect(root.querySelectorAll('.target-tick.passed')).toHaveLength(0);
    expect(label.classList.contains('entered')).toBe(false);
    hud.update(boss(55, 1), 0.016);
    expect(label.textContent).toBe('Phase 2/3');
    expect(label.classList.contains('entered')).toBe(true);
    expect(root.querySelectorAll('.target-tick.passed')).toHaveLength(1);
    hud.update(hudState({ target: { name: 'Rat', current: 5, max: 5, statuses: [] } }), 0.016);
    expect(root.querySelector<HTMLElement>('.target-phase')!.hidden).toBe(true);
  });
});

// ---- C15 subtitles -------------------------------------------------------------------------------------------
import { Subtitles, SUBTITLE_MAX, subtitleSeconds } from '../src/ui/subtitles';

describe('subtitles for barks (C15)', () => {
  it('shows speaker and line in a live region, and nothing when the setting is off', () => {
    let on = true;
    const root = document.createElement('div');
    const sub = new Subtitles(root, () => on);
    expect(sub.element.getAttribute('aria-live')).toBe('polite');
    expect(sub.say('Benny', 'Fuel is thirsty work.')).toBe(true);
    expect(root.querySelector('.subtitle-speaker')!.textContent).toBe('Benny');
    expect(root.querySelector('.subtitle-text')!.textContent).toBe('Fuel is thirsty work.');
    on = false;
    expect(sub.say('Benny', 'Hello')).toBe(false);
    expect(sub.count).toBe(1);
    on = true;
    expect(sub.say('Benny', '   ')).toBe(false);
  });

  it('keeps two lines, times them by length and removes them when done', () => {
    const sub = new Subtitles(document.createElement('div'));
    for (const w of ['a', 'b', 'c']) sub.say('X', `line ${w}`);
    expect(sub.count).toBe(SUBTITLE_MAX);
    expect(subtitleSeconds('hi')).toBe(2.5);
    expect(subtitleSeconds('x'.repeat(500))).toBe(8);
    sub.update(2.6);
    expect(sub.count).toBe(0);
  });
});

// ---- C19 first-time hints -----------------------------------------------------------------------------------
import { afterEach } from 'vitest';
import { CoachMarks, DESKTOP_ORDER, HintScript } from '../src/ui/onboarding';

describe('first-time hints: map and stash (C19)', () => {
  it('covers dodge, potion, skills, map and stash', () => {
    for (const h of ['dodge', 'potion', 'skill', 'map', 'stash'] as const) {
      expect(DESKTOP_ORDER).toContain(h);
      expect(t(`onboarding.${h}`)).not.toBe(`onboarding.${h}`);
    }
    expect(t('onboarding.never')).toBe("Don't show again");
  });

  it('the map tip starts when a teleporter is found and ends when the map opens', () => {
    const s = new HintScript(['click', 'strike']);
    expect(s.next()).toBeNull();
    s.signal('discovered');
    expect(s.next()).toBe('map');
    s.signal('mapOpened');
    expect(s.next()).toBeNull();
    expect(s.done.has('map')).toBe(true);
  });

  it('the stash tip starts in a hub and ends when the stash is used', () => {
    const s = new HintScript(['click', 'strike']);
    s.signal('hubEntered');
    expect(s.next()).toBe('stash');
    s.signal('stashUsed');
    expect(s.done.has('stash')).toBe(true);
    // A finished tip never starts again.
    s.signal('hubEntered');
    expect(s.next()).toBeNull();
  });

  it('dismiss removes a waiting tip for good', () => {
    const s = new HintScript(['click', 'strike']);
    s.signal('lootDropped');
    expect(s.next()).toBe('loot');
    expect(s.dismiss('loot')).toBe(true);
    s.signal('lootDropped');
    expect(s.next()).toBeNull();
  });
});

describe('"Don\'t show again" on the coach mark (C19)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the shown tip, keeps it away after a reload, and leaves other tips alone', () => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.replaceChildren();
    const root = document.createElement('div');
    root.id = 'ui';
    document.body.append(root, Object.assign(document.createElement('div'), { className: 'action-bar' }));
    const bar = Object.assign(document.createElement('div'), { className: 'action-bar' });
    const slots = Object.assign(document.createElement('div'), { className: 'slots' });
    for (let i = 0; i < 6; i++) slots.append(Object.assign(document.createElement('div'), { className: 'slot' }));
    root.append(bar, slots);
    const coach = new CoachMarks(root);
    coach.signal('clicked');
    coach.signal('attacked');
    coach.signal('lootDropped');
    vi.advanceTimersByTime(1100);
    expect(coach.showing).toBe('loot');
    const never = root.querySelector<HTMLButtonElement>('[data-testid=coach-never]')!;
    expect(never.textContent).toBe("Don't show again");
    never.click();
    expect(coach.showing).toBeNull();
    expect(root.querySelector<HTMLElement>('[data-testid=coach-mark]')!.hidden).toBe(true);
    // The loot tip does not come back, but a potion tip still can.
    coach.signal('lootDropped');
    coach.signal('lowLife');
    vi.advanceTimersByTime(1100);
    expect(coach.showing).toBe('potion');
    // A new session reads the same progress.
    const again = new CoachMarks(root);
    again.signal('lootDropped');
    vi.advanceTimersByTime(1100);
    expect(again.showing).not.toBe('loot');
  });
});
