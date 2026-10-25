import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamepadInput } from '../src/core/gamepad';
import {
  DEFAULT_PADBINDINGS,
  MAX_KEYS_PER_ACTION,
  PAD_ACTIONS,
  SettingsSchema,
  defaultSettings,
  isBindablePadButton,
  padConflicts,
  rebindPad,
  resetPadBinding,
  resolvePadBindings,
  tabDefaults,
  type Settings,
} from '../src/data/settings';
import { t } from '../src/data/i18n';
import { nearestInDirection, type Box } from '../src/ui/focusNav';

const withPad = (patch: Settings['padBindings']): Settings => ({ ...defaultSettings(), padBindings: patch });

describe('pad bindings (A02)', () => {
  it('every action has a name and no button is bound twice by default', () => {
    const seen = new Map<string, string>();
    for (const a of PAD_ACTIONS) {
      expect(t(`settings.padActions.${a}`), a).not.toBe(`settings.padActions.${a}`);
      for (const b of DEFAULT_PADBINDINGS[a]) {
        expect(seen.get(b), `${b} is bound to both ${seen.get(b)} and ${a}`).toBeUndefined();
        expect(isBindablePadButton(b)).toBe(true);
        seen.set(b, a);
      }
    }
  });

  it('overrides on top of the defaults; settings without the field still resolve', () => {
    expect(resolvePadBindings(defaultSettings())).toEqual(DEFAULT_PADBINDINGS);
    expect(resolvePadBindings(withPad({ dodge: ['Pad9'] })).dodge).toEqual(['Pad9']);
    const old = SettingsSchema.parse({});
    delete (old as Partial<Settings>).padBindings;
    expect(resolvePadBindings(old).attack).toEqual(DEFAULT_PADBINDINGS.attack);
    // An action name from the future is ignored.
    expect(resolvePadBindings(withPad({ nonsense: ['Pad1'] })).dodge).toEqual(DEFAULT_PADBINDINGS.dodge);
  });

  it('rebinding to a free button stores only the difference; a taken one is reported', () => {
    // Pad9 (Start) is the pause button; quests has none by default and Pad5 is skill 2.
    const free = rebindPad(defaultSettings(), 'quests', 0, 'Pad5');
    expect(free.padBindings).toBeNull();
    expect(free.conflicts).toEqual(['skill2']);
    const forced = rebindPad(defaultSettings(), 'quests', 0, 'Pad5', true);
    // The slot was empty, so skill 2 just loses the button.
    expect(forced.padBindings).toEqual({ quests: ['Pad5'], skill2: [] });
  });

  it('a taken button is a conflict: nothing changes without force, a swap with it', () => {
    const s = defaultSettings();
    expect(padConflicts(DEFAULT_PADBINDINGS, 'dodge', 'Pad2')).toEqual(['attack']);
    const blocked = rebindPad(s, 'dodge', 0, 'Pad2');
    expect(blocked.padBindings).toBeNull();
    const swapped = rebindPad(s, 'dodge', 0, 'Pad2', true);
    const resolved = resolvePadBindings(withPad(swapped.padBindings!));
    expect(resolved.dodge).toEqual(['Pad2']);
    // The other action takes over the button dodge had (B).
    expect(resolved.attack).toEqual(['Pad1']);
  });

  it('a second button is added in slot 1 and the list never exceeds the maximum', () => {
    const s = defaultSettings();
    const two = rebindPad(s, 'quests', 0, 'Pad9', true);
    let cur = withPad(two.padBindings!);
    const more = rebindPad(cur, 'quests', 1, 'Pad10', true);
    cur = withPad(more.padBindings!);
    expect(resolvePadBindings(cur).quests.length).toBeLessThanOrEqual(MAX_KEYS_PER_ACTION);
    expect(resolvePadBindings(cur).quests).toContain('Pad10');
    // Rebinding the same button twice does not duplicate it.
    const same = rebindPad(cur, 'quests', 1, 'Pad9', true);
    expect(new Set(resolvePadBindings(withPad(same.padBindings!)).quests).size).toBe(resolvePadBindings(withPad(same.padBindings!)).quests.length);
  });

  it('reset puts an action back, and takes its default button back from whoever used it', () => {
    const s = defaultSettings();
    const swapped = withPad(rebindPad(s, 'dodge', 0, 'Pad2', true).padBindings!);
    const reset = withPad(resetPadBinding(swapped, 'dodge'));
    expect(resolvePadBindings(reset)).toEqual(DEFAULT_PADBINDINGS);
    expect(resetPadBinding(defaultSettings(), 'attack')).toEqual({});
  });

  it('Home is not bindable; the controls tab reset clears pad overrides', () => {
    expect(isBindablePadButton('Pad16')).toBe(false);
    expect(isBindablePadButton('KeyA')).toBe(false);
    expect(tabDefaults('controls').padBindings).toEqual({});
  });
});

describe('GamepadInput without options reads navigator.getGamepads', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('works with a fake navigator and survives its absence', () => {
    vi.stubGlobal('navigator', {});
    expect(() => new GamepadInput().poll()).not.toThrow();
    const pad = { index: 0, id: 'x', connected: true, buttons: [{ pressed: true, value: 1 }], axes: [0, 0] };
    vi.stubGlobal('navigator', { getGamepads: () => [pad, null] });
    const gp = new GamepadInput();
    const log: string[] = [];
    gp.onButton((c, d) => log.push(`${c}${d}`));
    gp.poll();
    expect(log).toEqual(['Pad0true']);
  });
});

describe('spatial focus choice (A03)', () => {
  const box = (left: number, top: number, w = 40, h = 30): Box => ({ left, top, right: left + w, bottom: top + h });

  it('picks the nearest control in the direction pressed', () => {
    // A 3x2 grid of buttons.
    const cells = [box(0, 0), box(50, 0), box(100, 0), box(0, 40), box(50, 40), box(100, 40)];
    const from = cells[1]!;
    const others = cells.filter((c) => c !== from);
    expect(others[nearestInDirection(from, others, 'right')]).toBe(cells[2]);
    expect(others[nearestInDirection(from, others, 'left')]).toBe(cells[0]);
    expect(others[nearestInDirection(from, others, 'down')]).toBe(cells[4]);
    expect(nearestInDirection(from, others, 'up')).toBe(-1);
  });

  it('prefers the aligned control over a nearer diagonal one', () => {
    const from = box(100, 100);
    const aligned = box(100, 200);
    const diagonal = box(160, 150);
    const boxes = [diagonal, aligned];
    expect(boxes[nearestInDirection(from, boxes, 'down')]).toBe(aligned);
  });

  it('does not jump to something far off to the side, and a wide row is reached from below', () => {
    const from = box(0, 0);
    expect(nearestInDirection(from, [box(40, 600)], 'right')).toBe(-1);
    const wide = box(0, 60, 400, 30);
    const narrow = box(300, 0);
    expect(nearestInDirection(narrow, [wide], 'down')).toBe(0);
  });
});
