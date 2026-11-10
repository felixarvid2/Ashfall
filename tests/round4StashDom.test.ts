// @vitest-environment happy-dom
/** Round 4 interface items on the service panel: C02 sort, C03 stash search, C18 compare on hover (stash and vendor). */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rng } from '../src/core/rng';
import { hiddenByLootFilter } from '../src/data/loot/filter';
import { defaultSettings } from '../src/data/settings';
import { generateItem } from '../src/systems/loot/generate';
import { emptyInventory } from '../src/systems/loot/inventory';
import { sortGrid } from '../src/ui/inventoryLogic';
import { panelStack } from '../src/ui/panelStack';
import { ServicePanel, type ServiceActions } from '../src/ui/servicePanel';
import type { Item } from '../src/data/loot/schemas';

const rng = new Rng('r4-stash');
let n = 0;
const make = (baseId: string, rarity: 'common' | 'magic' | 'rare' | 'legendary' = 'rare', power = 100): Item =>
  generateItem(rng, { itemPower: power, classId: 'bastion', uid: `s-${n++}`, rarity, baseId });

const root = document.createElement('div');
root.id = 'ui';
document.body.append(root);
beforeAll(() => panelStack.init(root));

let stash: (Item | null)[];
let compare: ReturnType<typeof vi.fn>;
let panel: ServicePanel;

beforeEach(() => {
  root.replaceChildren();
  stash = Array.from({ length: 48 }, () => null);
  stash[0] = make('plated_vest');
  stash[30] = make('hydraulic_hammer');
  stash[31] = make('combat_helm', 'legendary', 140);
  compare = vi.fn(() => ({ stats: [], damagePct: 0.05, life: 10 }));
  const inv = emptyInventory(20);
  const actions = {
    inventory: () => inv,
    classId: () => 'bastion',
    iconUrl: () => null,
    stock: () => [],
    stash: () => stash,
    compare,
    buyback: () => [],
    sortStash: (mode: Parameters<typeof sortGrid>[1]) => {
      stash = sortGrid(stash, mode);
    },
    toStash: vi.fn(),
    fromStash: vi.fn(),
    sell: vi.fn(),
    buy: vi.fn(),
    salvageJunk: vi.fn(),
    endgame: () => ({ tierUnlocked: 0, recipes: [], materials: {}, codex: [] }),
  } as unknown as ServiceActions;
  panel = new ServicePanel(root, actions);
  panel.show('stash');
});


describe('stash search (C03)', () => {
  it('has a search box, and a query narrows the grid to matches over every page', () => {
    const box = root.querySelector<HTMLInputElement>('[data-testid=stash-search]')!;
    expect(box).toBeTruthy();
    const before = root.querySelectorAll('.stash-grid [data-stash]').length;
    box.value = 'helm';
    box.dispatchEvent(new Event('input'));
    const after = [...root.querySelectorAll<HTMLElement>('.stash-grid [data-stash]')];
    expect(after.length).toBeLessThan(before);
    // The helm sits on page two (index 31) and still shows.
    expect(after.map((c) => c.dataset.stash)).toEqual(['31']);
  });

  it('shows a message when nothing matches and restores the grid when cleared', () => {
    const box = root.querySelector<HTMLInputElement>('[data-testid=stash-search]')!;
    box.value = 'zzzzqq';
    box.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-testid=stash-no-match]')).toBeTruthy();
    const next = root.querySelector<HTMLInputElement>('[data-testid=stash-search]')!;
    next.value = '';
    next.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-testid=stash-no-match]')).toBeNull();
    expect(root.querySelectorAll('.stash-grid [data-stash]').length).toBe(24);
  });

  it('opening the stash again starts with an empty search', () => {
    const box = root.querySelector<HTMLInputElement>('[data-testid=stash-search]')!;
    box.value = 'helm';
    box.dispatchEvent(new Event('input'));
    panel.show('stash');
    expect(root.querySelector<HTMLInputElement>('[data-testid=stash-search]')!.value).toBe('');
  });
});

describe('stash sort (C02)', () => {
  it('sorts by item power through the sort menu', () => {
    root.querySelector<HTMLButtonElement>('[data-testid=stash-sort]')!.click();
    root.querySelector<HTMLButtonElement>('.inv-sort-option[data-mode=power]')!.click();
    expect(stash[0]!.itemPower).toBeGreaterThanOrEqual(stash[1]!.itemPower);
    expect(stash[0]!.itemPower).toBe(Math.max(...stash.filter(Boolean).map((i) => i!.itemPower)));
  });
});

describe('compare on hover (C18)', () => {
  it('shows a "vs worn" comparison block in the stash tooltip', () => {
    const cell = root.querySelector<HTMLElement>('.stash-grid [data-stash="0"]')!;
    cell.dispatchEvent(new Event('mouseenter'));
    expect(compare).toHaveBeenCalled();
    const tip = root.querySelector<HTMLElement>('.item-tooltip')!;
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector('.tip-compare, .compare, [class*=compare]')).toBeTruthy();
  });
});

describe('loot filter (C01)', () => {
  it('hides common and magic drops only when on, never crystals, and Alt shows all', () => {
    expect(defaultSettings().hideLowLoot).toBe(false);
    expect(hiddenByLootFilter('common', false, false)).toBe(false);
    expect(hiddenByLootFilter('common', false, true)).toBe(true);
    expect(hiddenByLootFilter('magic', false, true)).toBe(true);
    expect(hiddenByLootFilter('rare', false, true)).toBe(false);
    expect(hiddenByLootFilter('legendary', false, true)).toBe(false);
    expect(hiddenByLootFilter('common', true, true)).toBe(false);
    expect(hiddenByLootFilter('common', false, true, true)).toBe(false);
  });
});
