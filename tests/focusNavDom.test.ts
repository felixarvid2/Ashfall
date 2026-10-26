// @vitest-environment happy-dom
/** Pad menu navigation (A03) against a real DOM: focus moves by position, A clicks, B backs, modals trap, focus returns. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GamepadInput } from '../src/core/gamepad';
import { focusNav } from '../src/ui/focusNav';
import { panelStack } from '../src/ui/panelStack';

let root: HTMLElement;
const pad = new GamepadInput({ getGamepads: () => [] });
const flush = () => new Promise<void>((r) => queueMicrotask(r));

beforeAll(() => {
  root = document.createElement('div');
  root.id = 'ui';
  document.body.append(root);
  panelStack.init(root);
  focusNav.attach(pad);
});

/** Give an element a box (happy-dom lays nothing out). */
function place(el: HTMLElement, x: number, y: number, w = 80, h = 30): HTMLElement {
  el.getBoundingClientRect = () => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON: () => ({}) }) as DOMRect;
  return el;
}

function button(label: string, x: number, y: number, onClick?: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  place(b, x, y);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function panel(id: string, kind: 'main' | 'modal', children: HTMLElement[]): HTMLElement {
  const el = document.createElement('div');
  el.className = `${id} panel`;
  el.hidden = true;
  el.append(...children);
  root.append(el);
  panelStack.register({ id, el, kind, header: false, close: () => (el.hidden = true) });
  return el;
}

describe('focus navigation', () => {
  it('moves focus by position, A clicks, B closes the panel and focus goes back', async () => {
    const opener = button('open', 0, 400);
    root.append(opener);
    opener.focus();
    const clicked = vi.fn();
    const a = button('A', 10, 10);
    const b = button('B', 110, 10, clicked);
    const c = button('C', 10, 60);
    const p = panel('nav1', 'main', [a, b, c]);
    pad.lastDevice = 'pad';
    panelStack.open('nav1');
    await flush();
    // A screen opens with a focused control.
    expect(document.activeElement).toBe(a);
    focusNav.press('right');
    expect(document.activeElement).toBe(b);
    focusNav.press('a');
    expect(clicked).toHaveBeenCalledTimes(1);
    focusNav.press('left');
    focusNav.press('down');
    expect(document.activeElement).toBe(c);
    focusNav.press('down');
    expect(document.activeElement).toBe(c);
    focusNav.press('b');
    expect(p.hidden).toBe(true);
    await flush();
    expect(document.activeElement).toBe(opener);
  });

  it('a modal traps focus: nothing outside it can be reached', async () => {
    const under = button('under', 10, 10);
    const below = button('below', 10, 200);
    panel('nav2', 'main', [under, below]);
    const yes = button('Yes', 10, 120);
    const no = button('No', 120, 120);
    panel('nav3', 'modal', [no, yes]);
    pad.lastDevice = 'pad';
    panelStack.open('nav2');
    await flush();
    panelStack.open('nav3');
    await flush();
    expect(document.activeElement === no || document.activeElement === yes).toBe(true);
    for (const dir of ['up', 'up', 'down', 'down', 'down', 'left', 'right'] as const) {
      focusNav.press(dir);
      expect([no, yes]).toContain(document.activeElement);
    }
    focusNav.press('b');
    expect(panelStack.isOpen('nav3')).toBe(false);
    expect(panelStack.isOpen('nav2')).toBe(true);
    panelStack.close('nav2');
  });

  it('left and right change a slider; bumpers switch tabs', async () => {
    const slider = place(document.createElement('input'), 10, 10, 200, 20) as HTMLInputElement;
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.1';
    slider.value = '0.5';
    const seen: string[] = [];
    slider.addEventListener('input', () => seen.push(slider.value));
    const tab1 = button('One', 10, 100);
    const tab2 = button('Two', 100, 100);
    for (const [i, tb] of [tab1, tab2].entries()) {
      tb.setAttribute('role', 'tab');
      tb.setAttribute('aria-selected', String(i === 0));
      tb.addEventListener('click', () => {
        tab1.setAttribute('aria-selected', String(tb === tab1));
        tab2.setAttribute('aria-selected', String(tb === tab2));
      });
    }
    panel('nav4', 'main', [slider, tab1, tab2]);
    pad.lastDevice = 'pad';
    panelStack.open('nav4');
    await flush();
    slider.focus();
    focusNav.press('right');
    focusNav.press('right');
    focusNav.press('left');
    expect(seen).toEqual(['0.6', '0.7', '0.6']);
    focusNav.press('rb');
    expect(tab2.getAttribute('aria-selected')).toBe('true');
    focusNav.press('lb');
    expect(tab1.getAttribute('aria-selected')).toBe('true');
    panelStack.close('nav4');
  });

  it('held directions repeat after a pause; a direction held while the menu opened waits for release', async () => {
    const items = [button('a', 10, 10), button('b', 10, 50), button('c', 10, 90), button('d', 10, 130)];
    panel('nav5', 'main', items);
    pad.lastDevice = 'pad';
    panelStack.open('nav5');
    await flush();
    expect(document.activeElement).toBe(items[0]);
    // Simulate the D-pad held down through `isButtonDown`.
    let down = true;
    const original = pad.isButtonDown.bind(pad);
    pad.isButtonDown = (i: number) => (i === 13 ? down : original(i));
    focusNav.tick(1000);
    expect(document.activeElement).toBe(items[1]);
    focusNav.tick(1100);
    expect(document.activeElement).toBe(items[1]);
    focusNav.tick(1500);
    expect(document.activeElement).toBe(items[2]);
    focusNav.tick(1620);
    expect(document.activeElement).toBe(items[3]);
    down = false;
    focusNav.tick(1700);
    pad.isButtonDown = original;
    panelStack.close('nav5');
  });
});
