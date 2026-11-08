// @vitest-environment happy-dom
/** Round 4 map items: C07 minimap zoom (C17 map markers are added below). */
import { beforeEach, describe, expect, it } from 'vitest';
import { MapUi, MINI_RANGES, parseMiniStep, stepMiniZoom } from '../src/ui/minimap';

const noop = new Proxy(() => undefined, { get: (_t, k) => (k === 'canvas' ? {} : noop), apply: () => noop }) as unknown;
HTMLCanvasElement.prototype.getContext = (() => noop) as never;

/** happy-dom's WheelEvent has no clientX: a MouseEvent with a wheel delta stands in. */
function wheel(x: number, y: number, deltaY: number): Event {
  const e = new MouseEvent('wheel', { clientX: x, clientY: y, cancelable: true });
  Object.defineProperty(e, 'deltaY', { value: deltaY });
  return e;
}

describe('minimap zoom steps (C07)', () => {
  it('has three steps, clamps at both ends and reads stored values safely', () => {
    expect(MINI_RANGES).toHaveLength(3);
    expect(stepMiniZoom(1, 1)).toBe(2);
    expect(stepMiniZoom(2, 1)).toBe(2);
    expect(stepMiniZoom(0, -1)).toBe(0);
    expect(stepMiniZoom(1, -5)).toBe(0);
    expect(parseMiniStep(null)).toBe(1);
    expect(parseMiniStep('2')).toBe(2);
    expect(parseMiniStep('7')).toBe(1);
    expect(parseMiniStep('abc')).toBe(1);
  });
});

describe('MapUi minimap zoom (C07)', () => {
  let root: HTMLElement;
  let map: MapUi;
  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
    root = document.createElement('div');
    document.body.append(root);
    map = new MapUi(root, () => undefined, () => ({ x: 0, z: 0, facing: 0 }), () => {}, () => []);
  });

  it('starts on the middle step and shows fewer metres when zoomed in', () => {
    expect(map.miniStep).toBe(1);
    const mid = map.miniRange;
    map.zoomMini(1);
    expect(map.miniStep).toBe(2);
    expect(map.miniRange).toBeLessThan(mid);
    map.zoomMini(1);
    expect(map.miniStep).toBe(2);
    map.zoomMini(-1);
    map.zoomMini(-1);
    expect(map.miniStep).toBe(0);
    expect(map.miniRange).toBeGreaterThan(mid);
  });

  it('remembers the step and restores it', () => {
    map.zoomMini(1);
    expect(localStorage.getItem('ashfall.minimapZoom')).toBe('2');
    root.replaceChildren();
    const again = new MapUi(root, () => undefined, () => ({ x: 0, z: 0, facing: 0 }), () => {}, () => []);
    expect(again.miniStep).toBe(2);
  });

  it('the full map has - and + buttons that zoom too', () => {
    const buttons = root.querySelectorAll<HTMLButtonElement>('.map-minizoom button');
    expect(buttons).toHaveLength(2);
    expect(buttons[1]!.ariaLabel).toBeTruthy();
    buttons[1]!.click();
    expect(map.miniStep).toBe(2);
    buttons[0]!.click();
    buttons[0]!.click();
    expect(map.miniStep).toBe(0);
    expect(root.querySelector('.map-minizoom-label')!.textContent).toContain('1/3');
  });

  it('a keyboard - / + zooms when the minimap is shown, but not while typing', () => {
    const mini = root.querySelector<HTMLCanvasElement>('canvas.minimap')!;
    mini.hidden = false;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Equal' }));
    expect(map.miniStep).toBe(2);
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Minus', bubbles: true }));
    expect(map.miniStep).toBe(2);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Minus' }));
    expect(map.miniStep).toBe(1);
  });

  it('the mouse wheel over the minimap zooms it, elsewhere it does not', () => {
    const mini = root.querySelector<HTMLCanvasElement>('canvas.minimap')!;
    mini.hidden = false;
    mini.getBoundingClientRect = () => ({ left: 100, top: 10, right: 280, bottom: 190, width: 180, height: 180, x: 100, y: 10, toJSON: () => ({}) });
    window.dispatchEvent(wheel(150, 60, -100));
    expect(map.miniStep).toBe(2);
    window.dispatchEvent(wheel(20, 60, 100));
    expect(map.miniStep).toBe(2);
    window.dispatchEvent(wheel(150, 60, 100));
    expect(map.miniStep).toBe(1);
  });
});
