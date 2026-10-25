import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/core/input';
import { DEFAULT_KEYBINDINGS } from '../src/data/settings';

/** Node has no DOM: a window and a canvas made from EventTargets, plus the element classes Input checks with instanceof. */
class FakeInputField extends EventTarget {}
class FakeTextArea extends EventTarget {}
class FakeCanvas extends EventTarget {
  getBoundingClientRect() {
    return { left: 100, top: 50, width: 400, height: 200 };
  }
}

let win: EventTarget;
let canvas: FakeCanvas;
let input: Input;

const key = (type: 'keydown' | 'keyup', code: string, extra: object = {}): Event => {
  const ev = Object.assign(new Event(type, { cancelable: true }), { code, repeat: false }, extra);
  win.dispatchEvent(ev);
  return ev;
};
const mouse = (target: EventTarget, type: string, init: object): Event => {
  const ev = Object.assign(new Event(type, { cancelable: true }), { button: 0, clientX: 0, clientY: 0 }, init);
  target.dispatchEvent(ev);
  return ev;
};

beforeEach(() => {
  win = new EventTarget();
  canvas = new FakeCanvas();
  vi.stubGlobal('window', win);
  vi.stubGlobal('HTMLInputElement', FakeInputField);
  vi.stubGlobal('HTMLTextAreaElement', FakeTextArea);
  input = new Input(canvas as unknown as HTMLElement, structuredClone(DEFAULT_KEYBINDINGS));
});
afterEach(() => vi.unstubAllGlobals());

describe('keyboard', () => {
  it('maps key codes to actions through the bindings, any of several keys', () => {
    key('keydown', 'KeyW');
    expect(input.isDown('moveUp')).toBe(true);
    key('keyup', 'KeyW');
    expect(input.isDown('moveUp')).toBe(false);
    key('keydown', 'ArrowUp');
    expect(input.isDown('moveUp')).toBe(true);
  });

  it('reports a press once per tick; auto-repeat is not a new press', () => {
    key('keydown', 'KeyE');
    expect(input.wasPressed('pickup')).toBe(true);
    input.endTick();
    expect(input.wasPressed('pickup')).toBe(false);
    expect(input.isDown('pickup')).toBe(true);
    key('keydown', 'KeyE', { repeat: true });
    expect(input.wasPressed('pickup')).toBe(false);
  });

  it('follows a rebinding at once', () => {
    input.setBindings({ ...DEFAULT_KEYBINDINGS, pickup: ['KeyG'] });
    key('keydown', 'KeyE');
    expect(input.isDown('pickup')).toBe(false);
    key('keydown', 'KeyG');
    expect(input.isDown('pickup')).toBe(true);
  });

  it('stops the browser acting on bound keys only', () => {
    expect(key('keydown', 'Tab').defaultPrevented).toBe(true);
    expect(key('keydown', 'KeyZ').defaultPrevented).toBe(false);
  });

  it('ignores typing in form fields', () => {
    const ev = new Event('keydown', { cancelable: true });
    // Event.target is a getter; a typed-into field is the target of the real event.
    Object.defineProperties(ev, { code: { value: 'KeyQ' }, repeat: { value: false }, target: { value: new FakeInputField() } });
    win.dispatchEvent(ev);
    expect(input.isDown('potion')).toBe(false);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('forgets held keys, buttons and on-screen holds when the window loses focus', () => {
    key('keydown', 'KeyW');
    input.holdAction('dodge', true);
    input.holdButton(2, true);
    mouse(canvas, 'mousedown', { button: 0 });
    expect(input.isDown('moveUp') && input.isDown('dodge') && input.isMouseDown(0) && input.isMouseDown(2)).toBe(true);
    win.dispatchEvent(new Event('blur'));
    expect(input.isDown('moveUp')).toBe(false);
    expect(input.isDown('dodge')).toBe(false);
    expect(input.isMouseDown(0)).toBe(false);
    expect(input.isMouseDown(2)).toBe(false);
  });
});

describe('on-screen controls', () => {
  it('hold gives a press edge once, tap gives only an edge', () => {
    input.holdAction('dodge', true);
    input.holdAction('dodge', true);
    expect(input.wasPressed('dodge')).toBe(true);
    input.endTick();
    expect(input.wasPressed('dodge')).toBe(false);
    expect(input.isDown('dodge')).toBe(true);
    input.holdAction('dodge', false);
    expect(input.isDown('dodge')).toBe(false);
    input.pressAction('potion');
    expect(input.wasPressed('potion')).toBe(true);
    expect(input.isDown('potion')).toBe(false);
  });
});

describe('mouse', () => {
  it('converts the position to normalized device coordinates, +y up', () => {
    mouse(canvas, 'mousemove', { clientX: 300, clientY: 150 });
    expect(input.mouseNdc.x).toBeCloseTo(0);
    expect(input.mouseNdc.y).toBeCloseTo(0);
    mouse(canvas, 'mousemove', { clientX: 500, clientY: 50 });
    expect(input.mouseNdc.x).toBeCloseTo(1);
    expect(input.mouseNdc.y).toBeCloseTo(1);
    expect(input.mouseSeen).toBe(true);
  });

  it('tracks buttons: pressed edge once, held until mouseup anywhere in the window', () => {
    mouse(canvas, 'mousedown', { button: 0 });
    expect(input.wasMousePressed(0) && input.isMouseDown(0)).toBe(true);
    input.endTick();
    expect(input.wasMousePressed(0)).toBe(false);
    expect(input.isMouseDown(0)).toBe(true);
    mouse(win, 'mouseup', { button: 0 });
    expect(input.isMouseDown(0)).toBe(false);
  });

  it('sums wheel steps by sign and clears them when consumed', () => {
    mouse(canvas, 'wheel', { deltaY: 120 });
    mouse(canvas, 'wheel', { deltaY: 40 });
    mouse(canvas, 'wheel', { deltaY: -3 });
    expect(input.consumeWheel()).toBe(1);
    expect(input.consumeWheel()).toBe(0);
  });
});

describe('touch', () => {
  const touches = (...points: [number, number][]) => points.map(([clientX, clientY]) => ({ clientX, clientY }));
  const touch = (type: string, all: [number, number][], changed = all) => {
    const ev = Object.assign(new Event(type, { cancelable: true }), { touches: touches(...all), changedTouches: touches(...changed) });
    canvas.dispatchEvent(ev);
  };

  it('a tap acts as a held left click and lifting the finger releases it', () => {
    touch('touchstart', [[300, 150]]);
    expect(input.isMouseDown(0) && input.wasMousePressed(0)).toBe(true);
    expect(input.mouseNdc.x).toBeCloseTo(0);
    touch('touchend', []);
    expect(input.isMouseDown(0)).toBe(false);
  });

  it('two fingers pinch into wheel steps and drop the click', () => {
    touch('touchstart', [[300, 150]]);
    touch('touchstart', [[200, 150], [300, 150]], [[300, 150]]);
    expect(input.isMouseDown(0)).toBe(false);
    // Fingers together by 100 px: two and a half steps of 40 px, zoom out (positive).
    touch('touchmove', [[250, 150], [300, 150]]);
    expect(input.consumeWheel()).toBe(1);
    touch('touchmove', [[290, 150], [300, 150]]);
    expect(input.consumeWheel()).toBe(1);
    // Fingers apart zoom in.
    touch('touchmove', [[100, 150], [300, 150]]);
    expect(input.consumeWheel()).toBe(-4);
  });
});
