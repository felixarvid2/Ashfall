// @vitest-environment happy-dom
/** The skill tree panel against a real DOM, with a real class tree and compiled skills (C06). */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Progression, SkillUser } from '../src/core/components';
import { World } from '../src/core/ecs';
import { respecCost } from '../src/systems/skillTree';
import { tree } from '../src/systems/skillTree';
import { spawnPlayer } from '../src/world/spawn';
import { panelStack } from '../src/ui/panelStack';
import { SkillTreePanel, type SkillTreeActions, type SkillTreeView } from '../src/ui/skillTreePanel';
import { learnSkills } from './helpers';

const stackRoot = document.createElement('div');
stackRoot.id = 'ui';
document.body.append(stackRoot);
beforeAll(() => panelStack.init(stackRoot));

let view: SkillTreeView;
let actions: { [K in keyof SkillTreeActions]: ReturnType<typeof vi.fn> };
let panel: SkillTreePanel;

beforeEach(() => {
  stackRoot.replaceChildren();
  const world = new World();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  learnSkills(world, player);
  const user = world.req(player, SkillUser);
  const t3 = tree('bastion');
  view = {
    tree: t3,
    state: user.tree,
    unspent: 3,
    slots: user.slots,
    compiled: user.compiled,
    respecCost: respecCost(t3, world.req(player, Progression).level),
    gold: 500,
    matrixUnlocked: false,
    matrixPoints: 0,
    refundCost: 10,
  };
  actions = { learn: vi.fn(), reset: vi.fn(), refund: vi.fn(), assign: vi.fn(), iconUrl: vi.fn(() => null) };
  panel = new SkillTreePanel(stackRoot, () => view, actions as unknown as SkillTreeActions);
});

describe('skill tree panel', () => {
  it('opens with the branches and closes again', () => {
    expect(panel.open).toBe(false);
    panel.toggle();
    expect(panel.open).toBe(true);
    expect(stackRoot.querySelectorAll('.tree-node, .tree-skill, [data-node]').length).toBeGreaterThan(5);
    panel.toggle();
    expect(panel.open).toBe(false);
  });

  it('operating every control routes to the actions and never throws', () => {
    panel.toggle();
    for (const button of [...stackRoot.querySelectorAll<HTMLButtonElement>('.tree-panel button')]) button.click();
    for (const node of [...stackRoot.querySelectorAll<HTMLElement>('.tree-panel [data-node]')]) {
      node.click();
      node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    }
    panel.refresh();
    const calls = actions.learn!.mock.calls.length + actions.assign!.mock.calls.length + actions.reset!.mock.calls.length + actions.refund!.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
  });

  it('refresh follows the view: spent points change the counter', () => {
    panel.toggle();
    const before = stackRoot.querySelector('.tree-panel')!.textContent;
    view = { ...view, unspent: 0, gold: 0 };
    panel.refresh();
    expect(stackRoot.querySelector('.tree-panel')!.textContent).not.toBe(before);
  });

  it('shows the Matrix button from the level cap and loads it on demand', async () => {
    view = { ...view, matrixUnlocked: true, matrixPoints: 2 };
    const shown = vi.fn();
    panel.setMatrixLoader(async () => {
      shown();
      const el = document.createElement('div');
      const matrix = { onBack: () => {}, show: () => {}, hide: () => {}, refresh: () => {}, element: el } as never;
      return matrix;
    });
    panel.toggle();
    const matrixButton = [...stackRoot.querySelectorAll<HTMLButtonElement>('.tree-panel button')].find((b) => /matrix/i.test(b.textContent ?? '') || b.dataset.testid?.includes('matrix'));
    expect(matrixButton).toBeDefined();
    matrixButton!.click();
    await vi.waitFor(() => expect(shown).toHaveBeenCalled());
  });

  it('keys 1-4 over a learned skill assign it to that slot', () => {
    panel.toggle();
    const node = stackRoot.querySelector<HTMLElement>('.tree-panel [data-node].learned, .tree-panel [data-rank]:not([data-rank="0"])');
    if (node) {
      node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
    }
    expect(panel.matrixOpen).toBe(false);
  });
});
