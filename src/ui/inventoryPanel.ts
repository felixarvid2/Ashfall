/**
 * Inventory panel (I): equipment slots, gold and a Diablo 4-style backpack grid where
 * every item takes one cell. Right-click equips/unequips, Shift+click salvages,
 * click a crystal then an item to socket it. Hover shows a tooltip with comparison.
 */
import type { Inventory } from '../core/components';
import { t } from '../data/i18n';
import { BASE_ITEMS, CRYSTAL_DEFS, rarityDef } from '../data/loot/db';
import { SLOTS, slotsFor, type Item, type Slot } from '../data/loot/schemas';
import { itemDisplayName, renderItemTooltip, type Comparison } from './itemTooltip';

export interface InventoryActions {
  equip(index: number): void;
  unequip(slot: Slot): void;
  salvage(index: number): void;
  socket(crystalIndex: number, target: { grid: number } | { slot: Slot }): void;
  compare(item: Item): Comparison | null;
  iconUrl(iconId: string): string | null;
}

/** Layout of the paper doll (column, row) on a 3×5 grid. */
const DOLL: Record<Slot, [number, number]> = {
  helm: [2, 1],
  amulet: [3, 1],
  chest: [2, 2],
  mainHand: [1, 2],
  offHand: [3, 2],
  gloves: [1, 3],
  pants: [2, 3],
  ring1: [3, 3],
  boots: [2, 4],
  ring2: [3, 4],
};

export class InventoryPanel {
  private readonly root: HTMLDivElement;
  private readonly doll: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly gold: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private selectedCrystal: number | null = null;
  /** While a hub service is open, clicking a backpack item goes to it (sell, stash, select). */
  private gridClick: ((index: number) => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly getInventory: () => Inventory,
    private readonly getClassId: () => string,
    private readonly actions: InventoryActions,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'inventory-panel panel';
    this.root.hidden = true;
    const title = document.createElement('h2');
    title.textContent = t('ui.inventory');
    this.doll = document.createElement('div');
    this.doll.className = 'inv-doll';
    this.gold = document.createElement('div');
    this.gold.className = 'inv-gold';
    this.grid = document.createElement('div');
    this.grid.className = 'inv-grid';
    const hint = document.createElement('div');
    hint.className = 'inv-hint';
    hint.textContent = t('items.hint');
    this.root.append(title, this.doll, this.gold, this.grid, hint);
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'item-tooltip';
    this.tooltip.hidden = true;
    parent.append(this.root, this.tooltip);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setGridClick(fn: ((index: number) => void) | null): void {
    this.gridClick = fn;
  }

  toggle(force?: boolean): void {
    this.root.hidden = force === undefined ? !this.root.hidden : !force;
    this.selectedCrystal = null;
    this.hideTooltip();
    if (this.open) this.refresh();
  }

  refresh(): void {
    if (!this.open) return;
    const inv = this.getInventory();
    this.gold.textContent = t('ui.gold', { gold: inv.gold.toLocaleString('en-US') });

    this.doll.replaceChildren(
      ...SLOTS.map((slot) => {
        const item = inv.equipped[slot] ?? null;
        const cell = this.cell(item, t(`items.slots.${slot}`));
        const [c, r] = DOLL[slot];
        cell.style.gridColumn = String(c);
        cell.style.gridRow = String(r);
        cell.classList.add('slot-cell');
        cell.addEventListener('contextmenu', () => this.actions.unequip(slot));
        cell.addEventListener('click', () => {
          if (this.selectedCrystal !== null && item) {
            this.actions.socket(this.selectedCrystal, { slot });
            this.selectedCrystal = null;
          }
        });
        if (item) this.hover(cell, item, true);
        return cell;
      }),
    );

    this.grid.replaceChildren(
      ...inv.grid.map((item, index) => {
        const cell = this.cell(item);
        if (index === this.selectedCrystal) cell.classList.add('selected');
        cell.addEventListener('contextmenu', () => {
          if (item && !item.crystal) this.actions.equip(index);
        });
        cell.addEventListener('click', (e) => {
          if (!item) return;
          if (this.gridClick) {
            this.gridClick(index);
            this.hideTooltip();
            return;
          }
          if (e.shiftKey) {
            this.actions.salvage(index);
            this.hideTooltip();
            return;
          }
          if (item.crystal) {
            this.selectedCrystal = this.selectedCrystal === index ? null : index;
            this.refresh();
            return;
          }
          if (this.selectedCrystal !== null) {
            this.actions.socket(this.selectedCrystal, { grid: index });
            this.selectedCrystal = null;
          }
        });
        if (item) this.hover(cell, item, false);
        return cell;
      }),
    );
  }

  private cell(item: Item | null, emptyLabel = ''): HTMLDivElement {
    return renderItemCell(item, (id) => this.actions.iconUrl(id), emptyLabel);
  }

  private hover(cell: HTMLElement, item: Item, equipped: boolean): void {
    cell.addEventListener('mouseenter', () => {
      const base = BASE_ITEMS.get(item.base);
      const comparable = !equipped && base && slotsFor(base.type).length > 0;
      const tip = renderItemTooltip(item, this.getClassId(), {
        equipped,
        comparison: comparable ? this.actions.compare(item) : null,
      });
      this.tooltip.replaceChildren(tip);
      this.tooltip.hidden = false;
      const rect = cell.getBoundingClientRect();
      const tipRect = this.tooltip.getBoundingClientRect();
      let left = rect.left - tipRect.width - 10;
      if (left < 8) left = rect.right + 10;
      const top = Math.max(8, Math.min(window.innerHeight - tipRect.height - 8, rect.top - 20));
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${top}px`;
    });
    cell.addEventListener('mouseleave', () => this.hideTooltip());
  }

  private hideTooltip(): void {
    this.tooltip.hidden = true;
  }
}

export function renderItemCell(item: Item | null, iconUrl: (id: string) => string | null, emptyLabel = ''): HTMLDivElement {
  const cell = document.createElement('div');
  cell.className = 'inv-cell';
  if (!item) {
    cell.classList.add('empty');
    if (emptyLabel) cell.appendChild(Object.assign(document.createElement('span'), { textContent: emptyLabel, className: 'slot-label' }));
    return cell;
  }
  const color = item.crystal ? (CRYSTAL_DEFS.get(item.crystal.id)?.color ?? '#fff') : rarityDef(item.rarity).color;
  cell.style.setProperty('--rarity', color);
  cell.classList.add(`r-${item.rarity}`);
  const iconId = item.crystal ? (CRYSTAL_DEFS.get(item.crystal.id)?.icon ?? '') : (BASE_ITEMS.get(item.base)?.icon ?? '');
  const url = iconUrl(iconId);
  if (url) {
    cell.appendChild(Object.assign(document.createElement('img'), { src: url, alt: '', draggable: false }));
  } else {
    cell.appendChild(Object.assign(document.createElement('span'), { textContent: abbreviate(itemDisplayName(item)), className: 'abbr' }));
  }
  if (item.sockets.length) {
    const dots = document.createElement('div');
    dots.className = 'sockets';
    for (const s of item.sockets) {
      const d = document.createElement('i');
      if (s) d.style.background = CRYSTAL_DEFS.get(s.crystal)?.color ?? '#fff';
      dots.appendChild(d);
    }
    cell.appendChild(dots);
  }
  return cell;
}

function abbreviate(name: string): string {
  return name
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
