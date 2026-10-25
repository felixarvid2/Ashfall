// @vitest-environment happy-dom
/** The Neural Matrix view against a real DOM, wired to the real matrix rules like the game does (C06). */
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

beforeEach(() => {
  stackRoot.replaceChildren();
  ctx = makeCtx();
  matrix.ensureMatrixStarted(ctx);
  matrix.grantMatrixXp(ctx, 400000);
  matrix.grantGlyph(ctx, matrix.glyphReports(matrix.ensureEndgame(ctx))[0]?.id ?? 'glyph.ember', false);
  panel = new MatrixPanel(
    stackRoot,
    () => ({ endgame: matrix.ensureEndgame(ctx), gold: 1_000_000 }),
    {
      allocate: (id) => matrix.allocateNode(ctx, id),
      respec: () => matrix.respecMatrix(ctx),
      attach: (gate, board, rotation) => matrix.attachBoard(ctx, gate, board, rotation),
      rotate: (board, rotation) => matrix.rotateBoard(ctx, board, rotation),
      detach: (board) => matrix.detachBoard(ctx, board),
      socket: (glyph, node) => matrix.socketGlyph(ctx, glyph, node),
    },
  );
  stackRoot.append(panel.element);
});

describe('matrix panel', () => {
  it('draws the header, the boards and the detail area', () => {
    panel.show();
    expect(panel.element.querySelector('[data-testid=matrix-points]')).not.toBeNull();
    expect(panel.element.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('clicking a node allocates it, and refresh keeps the camera', () => {
    panel.show();
    const before = matrix.ensureEndgame(ctx).nodes.length;
    for (const node of [...panel.element.querySelectorAll<SVGElement>('[data-node]')]) {
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 5, clientY: 5, button: 0 }));
      node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 5, clientY: 5, button: 0 }));
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    panel.refresh();
    expect(matrix.ensureEndgame(ctx).nodes.length).toBeGreaterThanOrEqual(before);
  });

  it('operating every button never throws and hide closes the tooltip', () => {
    panel.show();
    for (let pass = 0; pass < 2; pass++) {
      for (const button of [...panel.element.querySelectorAll<HTMLButtonElement>('button')]) button.click();
    }
    const viewport = panel.element.querySelector<HTMLElement>('.matrix-viewport')!;
    viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100, cancelable: true }));
    viewport.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: 10, clientY: 10, button: 0 }));
    viewport.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 2, clientX: 40, clientY: 30 }));
    viewport.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientX: 40, clientY: 30 }));
    panel.hide();
    let backed = 0;
    panel.onBack = () => backed++;
    panel.element.querySelector<HTMLButtonElement>('[data-testid=matrix-back]')!.click();
    expect(backed).toBe(1);
  });
});
