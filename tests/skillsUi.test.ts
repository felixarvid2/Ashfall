import { describe, expect, it } from 'vitest';
import { blockedInfo } from '../src/ui/skillTreePanel';
import { CELL, fitView, MIN_NODE_GAP_PX } from '../src/ui/matrixPanel';
import { BOARD_SIZE } from '../src/data/endgame/matrix';
import { layoutBoards } from '../src/systems/endgame/matrix';

describe('skill tree node state (P066)', () => {
  it('shows the reason and a lock for a node that cannot be learned yet', () => {
    expect(blockedInfo(0, 'requires')).toEqual({ reason: 'requires', lock: true });
    expect(blockedInfo(0, 'locked')).toEqual({ reason: 'locked', lock: true });
    expect(blockedInfo(0, 'exclusive')).toEqual({ reason: 'exclusive', lock: true });
  });

  it('shows a reason but no lock when only points or gold are missing, and nothing for learned or maxed nodes', () => {
    expect(blockedInfo(0, 'noPoints')).toEqual({ reason: 'noPoints', lock: false });
    expect(blockedInfo(2, 'noPoints')).toBeNull();
    expect(blockedInfo(0, 'maxed')).toBeNull();
    expect(blockedInfo(0, null)).toBeNull();
  });
});

describe('Neural Matrix camera (P067)', () => {
  const half = (BOARD_SIZE * CELL) / 2;
  const core = { x0: -half, y0: -half, x1: half, y1: half };

  it('fits the core board across the view with a 12 px margin and keeps nodes at least 40 px apart', () => {
    for (const [w, h] of [[360, 502], [330, 420], [290, 360]] as const) {
      const v = fitView(core, w, h);
      expect(v.scale * CELL).toBeGreaterThanOrEqual(MIN_NODE_GAP_PX - 1e-9);
      // The board is centred.
      expect(v.tx).toBeCloseTo(w / 2);
      expect(v.ty).toBeCloseTo(h / 2);
    }
    // A view wide enough for the margin fit: the board fills (w - 24) / w of the width.
    const wide = fitView(core, 500, 500);
    expect((core.x1 - core.x0) * wide.scale).toBeGreaterThanOrEqual(0.9 * 500 - 24);
  });

  it('many boards: the automatic fit centres on the start board at the node cap, the recenter button shows all', () => {
    const big = { x0: -half * 3, y0: -half * 3, x1: half * 3, y1: half * 3 };
    const auto = fitView(big, 360, 500);
    expect(auto.scale * CELL).toBeCloseTo(MIN_NODE_GAP_PX);
    expect(auto.tx).toBeCloseTo(180);
    const all = fitView(big, 360, 500, true);
    expect(all.scale).toBeLessThan(auto.scale);
    expect((big.x1 - big.x0) * all.scale).toBeLessThanOrEqual(360);
  });
});

describe('Neural Matrix gate ghost (P071)', () => {
  it('lays a board out at a gate for each rotation: same place, turned', () => {
    const base = [{ id: 'start', rotation: 0 }];
    const gate = 'start:4,0';
    const at = (rotation: number) => layoutBoards([...base, { id: 'ash', rotation, gate }] as Parameters<typeof layoutBoards>[0]).get('ash');
    const r0 = at(0);
    const r90 = at(90);
    expect(r0).toBeDefined();
    expect(r90).toBeDefined();
    expect(r0!.turns).toBe(0);
    expect(r90!.turns).toBe(1);
    expect(r90!.cx).toBe(r0!.cx);
    expect(r90!.cy).toBe(r0!.cy);
  });

  it('leaves a board out when its spot is taken (no ghost, Attach disabled)', () => {
    const boards = [{ id: 'start', rotation: 0 }, { id: 'ash', rotation: 0, gate: 'start:4,0' }, { id: 'forge', rotation: 0, gate: 'start:4,0' }] as Parameters<typeof layoutBoards>[0];
    const layout = layoutBoards(boards);
    expect(layout.has('ash')).toBe(true);
    expect(layout.has('forge')).toBe(false);
  });
});
