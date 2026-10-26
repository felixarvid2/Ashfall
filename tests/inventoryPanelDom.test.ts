// @vitest-environment happy-dom
/** The backpack panel against a real DOM with a real, populated inventory (C06). */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Inventory } from '../src/core/components';
import { World } from '../src/core/ecs';
import { Rng } from '../src/core/rng';
import { baseItem } from '../src/data/loot/db';
import { generateItem, itemPowerFor } from '../src/systems/loot/generate';
import { addToGrid } from '../src/systems/loot/inventory';
import { InventoryPanel, type InventoryActions } from '../src/ui/inventoryPanel';
import { panelStack } from '../src/ui/panelStack';
import { spawnPlayer } from '../src/world/spawn';
import { equipStarterKit } from '../scripts/sim/fixtures';
import { makeCtx } from './helpers';

const stackRoot = document.createElement('div');
stackRoot.id = 'ui';
document.body.append(stackRoot);
beforeAll(() => panelStack.init(stackRoot));

let inv: Inventory;
let actions: { [K in keyof InventoryActions]: ReturnType<typeof vi.fn> };
let panel: InventoryPanel;

beforeEach(() => {
  stackRoot.replaceChildren();
  const world = new World();
  const ctx = makeCtx();
  const player = spawnPlayer(world, 'bastion', 0, 0);
  equipStarterKit(world, player, ctx);
  inv = world.req(player, Inventory);
  inv.gold = 1234;
  const rng = new Rng('inv-ui');
  for (const [i, rarity] of (['common', 'magic', 'rare', 'legendary'] as const).entries()) {
    const baseId = ['plated_vest', 'combat_helm', 'hydraulic_hammer', 'mag_boots'][i]!;
    addToGrid(inv, generateItem(rng, { itemPower: itemPowerFor(10, rng), classId: 'bastion', uid: `u${i}`, rarity, baseId }));
  }
  expect(baseItem('plated_vest')).toBeDefined();
  actions = {
    equip: vi.fn(), unequip: vi.fn(), salvage: vi.fn(), salvageMany: vi.fn(), salvageJunk: vi.fn(), sort: vi.fn(),
    bestCount: vi.fn(() => 2), equipBest: vi.fn(), socket: vi.fn(), compare: vi.fn(() => null), iconUrl: vi.fn(() => null),
    marked: vi.fn(), notify: vi.fn(), codex: vi.fn(() => []),
  };
  panel = new InventoryPanel(stackRoot, () => inv, () => 'bastion', actions as unknown as InventoryActions);
});

describe('inventory panel', () => {
  it('opens with the paper doll and the grid, and shows the gold', () => {
    expect(panel.open).toBe(false);
    panel.toggle(true);
    expect(panel.open).toBe(true);
    expect(stackRoot.querySelectorAll('.inv-grid > *').length).toBe(inv.grid.length);
    expect(stackRoot.textContent).toContain('1,234');
    panel.toggle(false);
    expect(panel.open).toBe(false);
  });

  it('operating every button and slot calls the actions or shows a tooltip, and never throws', () => {
    panel.toggle(true);
    for (const cell of [...stackRoot.querySelectorAll<HTMLElement>('.inv-grid > *, .inv-doll .slot, .inv-doll > *')]) {
      cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      cell.click();
      cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      cell.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    }
    for (const button of [...stackRoot.querySelectorAll<HTMLButtonElement>('button')]) button.click();
    panel.refresh();
    const used = Object.values(actions).reduce((n, fn) => n + fn.mock.calls.length, 0);
    expect(used).toBeGreaterThan(0);
  });

  it('the grid click hook can be taken over by a service and given back', () => {
    const hook = vi.fn();
    panel.toggle(true);
    panel.setGridClick(hook);
    stackRoot.querySelector<HTMLElement>('.inv-grid > *')!.click();
    expect(hook).toHaveBeenCalled();
    panel.setGridClick(null);
  });
});
