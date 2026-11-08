// @vitest-environment happy-dom
/** C20: the endgame matrix pans with one finger and pinch-zooms with two (touch pointer events). */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { GameContext } from '../src/core/context';
import * as matrix from '../src/systems/endgame/matrix';
import { MatrixPanel } from '../src/ui/matrixPanel';
import { panelStack } from '../src/ui/panelStack';
import { makeCtx } from './helpers';

const stackRoot = document.createElement('div');
stackRoot.id = 'ui';
document.body.append(stackRoot);
beforeAll(() => {
  panelStack.init(stackRoot);
  globalThis.requestAnimationFrame ??= ((fn: FrameRequestCallback) => setTimeout(() => fn(0), 0) as unknown as number) as typeof requestAnimationFrame;
});

let ctx: GameContext;
let panel: MatrixPanel;
let viewport: HTMLElement;

beforeEach(() => {
  stackRoot.replaceChildren();
  ctx = makeCtx();
  matrix.ensureMatrixStarted(ctx);
  matrix.grantMatrixXp(ctx, 400000);
  panel = new MatrixPanel(stackRoot, () => ({ endgame: matrix.ensureEndgame(ctx), gold: 1_000_000 }), {
    allocate: (id) => matrix.allocateNode(ctx, id),
    respec: () => matrix.respecMatrix(ctx),
    attach: (gate, board, rotation) => matrix.attachBoard(ctx, gate, board, rotation),
    rotate: (board, rotation) => matrix.rotateBoard(ctx, board, rotation),
    detach: (board) => matrix.detachBoard(ctx, board),
    socket: (glyph, node) => matrix.socketGlyph(ctx, glyph, node),
  });
  stackRoot.append(panel.element);
  panel.show();
  viewport = panel.element.querySelector<HTMLElement>('.matrix-viewport')!;
  // happy-dom has no layout: a 300 x 400 viewport at the origin.
  Object.defineProperty(viewport, 'clientWidth', { value: 300, configurable: true });
  Object.defineProperty(viewport, 'clientHeight', { value: 400, configurable: true });
  viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 400, width: 300, height: 400, x: 0, y: 0, toJSON: () => ({}) });
  viewport.setPointerCapture = () => {};
});

const world = () => panel.element.querySelector<SVGGElement>('.matrix-svg g[transform]')!;
const transform = () => {
  const m = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(world().getAttribute('transform') ?? '');
  return { tx: Number(m?.[1]), ty: Number(m?.[2]), scale: Number(m?.[3]) };
};
const touch = (type: string, id: number, x: number, y: number) =>
  viewport.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, button: 0 }));

describe('matrix touch gestures (C20)', () => {
  it('the viewport takes no browser touch handling, so the gestures reach the panel', () => {
    // style.css: .matrix-viewport { touch-action: none }
    const css = require('node:fs').readFileSync('src/ui/style.css', 'utf8') as string;
    expect(/\.matrix-viewport\s*\{[^}]*touch-action:\s*none/.test(css)).toBe(true);
    expect(/\.matrix-svg\s*\{[^}]*touch-action:\s*none/.test(css)).toBe(true);
  });

  it('one finger drags the board', () => {
    const before = transform();
    touch('pointerdown', 1, 100, 100);
    touch('pointermove', 1, 130, 120);
    touch('pointermove', 1, 160, 150);
    touch('pointerup', 1, 160, 150);
    const after = transform();
    expect(after.tx - before.tx).toBeCloseTo(60);
    expect(after.ty - before.ty).toBeCloseTo(50);
    expect(after.scale).toBeCloseTo(before.scale);
  });

  it('two fingers spreading zoom in and pinching zooms out', () => {
    const before = transform();
    touch('pointerdown', 1, 100, 200);
    touch('pointerdown', 2, 200, 200);
    touch('pointermove', 2, 260, 200);
    touch('pointermove', 1, 70, 200);
    const zoomed = transform();
    expect(zoomed.scale).toBeGreaterThan(before.scale * 1.3);
    touch('pointermove', 2, 150, 200);
    touch('pointermove', 1, 120, 200);
    expect(transform().scale).toBeLessThan(zoomed.scale);
    touch('pointerup', 1, 120, 200);
    touch('pointerup', 2, 150, 200);
  });

  it('a pinch is not a tap: nothing is allocated, and a one-finger drag after it still works', () => {
    const nodes = matrix.ensureEndgame(ctx).nodes.length;
    const node = panel.element.querySelector<SVGElement>('[data-node]')!;
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200, button: 0 }));
    touch('pointerdown', 2, 200, 200);
    touch('pointermove', 2, 240, 200);
    touch('pointerup', 2, 240, 200);
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200, button: 0 }));
    expect(matrix.ensureEndgame(ctx).nodes.length).toBe(nodes);
    const before = transform();
    touch('pointerdown', 3, 50, 50);
    touch('pointermove', 3, 80, 50);
    touch('pointerup', 3, 80, 50);
    expect(transform().tx - before.tx).toBeCloseTo(30);
  });

  it('the + and - buttons zoom for a player who cannot pinch', () => {
    const before = transform().scale;
    panel.element.querySelector<HTMLButtonElement>('.matrix-zoom button')!.click();
    expect(transform().scale).toBeGreaterThan(before);
  });
});
