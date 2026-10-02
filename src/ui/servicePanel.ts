/**
 * Hub service panel (left side, opened from a conversation or the stash): the trader's stock,
 * the blacksmith's reroll, the Technician's aspect extraction/imprinting and the shared stash.
 * The inventory opens beside it; clicking a backpack item routes to the open service.
 */
import type { Inventory } from '../core/components';
import { t } from '../data/i18n';
import type { Item } from '../data/loot/schemas';
import {
  buyPrice,
  canImprint,
  extractCost,
  imprintCost,
  rerollCost,
  sellPrice,
} from '../systems/hub/services';
import { renderItemCell } from './inventoryPanel';
import { aspectText, formatStat, itemDisplayName, renderItemTooltip } from './itemTooltip';
import { rarityDef } from '../data/loot/db';

export type ServiceKind = 'vendor' | 'blacksmith' | 'technician' | 'stash';

export interface ServiceActions {
  inventory(): Inventory;
  classId(): string;
  iconUrl(iconId: string): string | null;
  stock(): (Item | null)[];
  stash(): (Item | null)[];
  buy(index: number): void;
  sell(gridIndex: number): void;
  reroll(gridIndex: number, affixIndex: number): void;
  salvageJunk(): void;
  extract(gridIndex: number): void;
  imprint(cacheIndex: number, gridIndex: number): void;
  toStash(gridIndex: number): void;
  fromStash(index: number): void;
}

export class ServicePanel {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly body: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private kind: ServiceKind | null = null;
  /** Backpack item selected for the blacksmith or Technician. */
  private selected: number | null = null;

  constructor(parent: HTMLElement, private readonly actions: ServiceActions) {
    this.root = document.createElement('div');
    this.root.className = 'panel service-panel';
    this.root.hidden = true;
    this.root.dataset.testid = 'service-panel';
    this.title = document.createElement('h2');
    this.body = document.createElement('div');
    const close = document.createElement('button');
    close.className = 'service-close';
    close.textContent = '×';
    close.addEventListener('click', () => this.close());
    this.root.append(close, this.title, this.body);
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'item-tooltip';
    this.tooltip.hidden = true;
    parent.append(this.root, this.tooltip);
  }

  /** Called when the panel opens or closes, so the game can wire the inventory to it. */
  onToggle: (open: boolean) => void = () => {};

  get open(): boolean {
    return !this.root.hidden;
  }

  get current(): ServiceKind | null {
    return this.open ? this.kind : null;
  }

  show(kind: ServiceKind): void {
    this.kind = kind;
    this.selected = null;
    this.root.hidden = false;
    this.title.textContent = t(`services.${kind}.title`);
    this.refresh();
    this.onToggle(true);
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.tooltip.hidden = true;
    this.onToggle(false);
  }

  /** A backpack item was clicked while this panel is open. */
  backpackClick(index: number): void {
    switch (this.kind) {
      case 'vendor':
        this.actions.sell(index);
        break;
      case 'stash':
        this.actions.toStash(index);
        break;
      default:
        this.selected = this.selected === index ? null : index;
        break;
    }
    this.refresh();
  }

  refresh(): void {
    if (!this.open || !this.kind) return;
    const inv = this.actions.inventory();
    const rows: HTMLElement[] = [div('inv-gold', t('ui.gold', { gold: inv.gold.toLocaleString('en-US') }))];
    if (this.kind === 'vendor') rows.push(...this.vendor());
    else if (this.kind === 'stash') rows.push(...this.stash());
    else if (this.kind === 'blacksmith') rows.push(...this.blacksmith(inv));
    else rows.push(...this.technician(inv));
    this.body.replaceChildren(...rows);
  }

  private vendor(): HTMLElement[] {
    const grid = div('inv-grid service-grid', '');
    this.actions.stock().forEach((item, i) => {
      const cell = renderItemCell(item, (id) => this.actions.iconUrl(id));
      cell.dataset.testid = `stock-${i}`;
      if (item) {
        cell.appendChild(div('price', String(buyPrice(item))));
        cell.addEventListener('click', () => {
          this.actions.buy(i);
          this.refresh();
        });
        this.hover(cell, item, t('services.vendor.price', { gold: buyPrice(item) }));
      }
      grid.appendChild(cell);
    });
    return [grid, div('inv-hint', t('services.vendor.hint'))];
  }

  private stash(): HTMLElement[] {
    const grid = div('inv-grid service-grid', '');
    this.actions.stash().forEach((item, i) => {
      const cell = renderItemCell(item, (id) => this.actions.iconUrl(id));
      if (item) {
        cell.addEventListener('click', () => {
          this.actions.fromStash(i);
          this.refresh();
        });
        this.hover(cell, item);
      }
      grid.appendChild(cell);
    });
    return [grid, div('inv-hint', t('services.stash.hint'))];
  }

  private selectedItem(inv: Inventory): Item | null {
    return this.selected !== null ? (inv.grid[this.selected] ?? null) : null;
  }

  private selectedHeader(item: Item | null, hintKey: string): HTMLElement[] {
    if (!item) return [div('inv-hint', t(hintKey))];
    const name = div('service-item', itemDisplayName(item));
    name.style.color = rarityDef(item.rarity).color;
    return [name];
  }

  private blacksmith(inv: Inventory): HTMLElement[] {
    const item = this.selectedItem(inv);
    const out = this.selectedHeader(item, 'services.blacksmith.hint');
    if (item) {
      if (item.unique || item.affixes.length === 0) out.push(div('inv-hint', t('services.blacksmith.cannot')));
      else {
        const cost = rerollCost(item);
        item.affixes.forEach((a, i) => {
          const b = button(`${formatStat(a.stat, a.value)}  →  ${t('services.blacksmith.reroll', { gold: cost })}`, () => {
            this.actions.reroll(this.selected!, i);
            this.refresh();
          });
          b.dataset.testid = `reroll-${i}`;
          b.disabled = inv.gold < cost;
          out.push(b);
        });
      }
    }
    out.push(div('service-sep', ''));
    out.push(
      button(t('services.blacksmith.salvageJunk'), () => {
        this.actions.salvageJunk();
        this.selected = null;
        this.refresh();
      }),
    );
    return out;
  }

  private technician(inv: Inventory): HTMLElement[] {
    const item = this.selectedItem(inv);
    const out = this.selectedHeader(item, 'services.technician.hint');
    const cache = inv.aspects ?? [];
    if (item?.aspect && !item.unique) {
      const cost = extractCost(item);
      const b = button(t('services.technician.extract', { gold: cost }), () => {
        this.actions.extract(this.selected!);
        this.selected = null;
        this.refresh();
      });
      b.dataset.testid = 'extract';
      b.disabled = inv.gold < cost;
      out.push(b, div('inv-hint', t('services.technician.extractWarn')));
    }
    out.push(div('service-sub', t('services.technician.cache', { n: cache.length })));
    if (cache.length === 0) out.push(div('inv-hint', t('services.technician.empty')));
    cache.forEach((a, i) => {
      const row = div('aspect-row', '');
      row.append(div('aspect-name', t(`aspects.${a.id}.name`)), div('aspect-desc', aspectText(a.id, a.value)));
      if (item && canImprint(item, a.id)) {
        const cost = imprintCost(item);
        const b = button(t('services.technician.imprint', { gold: cost }), () => {
          this.actions.imprint(i, this.selected!);
          this.refresh();
        });
        b.dataset.testid = `imprint-${i}`;
        b.disabled = inv.gold < cost;
        row.appendChild(b);
      }
      out.push(row);
    });
    return out;
  }

  private hover(cell: HTMLElement, item: Item, extra?: string): void {
    cell.addEventListener('mouseenter', () => {
      const tip = renderItemTooltip(item, this.actions.classId());
      if (extra) tip.appendChild(div('tooltip-price', extra));
      else if (this.kind === 'vendor') tip.appendChild(div('tooltip-price', t('services.vendor.sellFor', { gold: sellPrice(item) })));
      this.tooltip.replaceChildren(tip);
      this.tooltip.hidden = false;
      const rect = cell.getBoundingClientRect();
      const tipRect = this.tooltip.getBoundingClientRect();
      this.tooltip.style.left = `${Math.min(window.innerWidth - tipRect.width - 8, rect.right + 10)}px`;
      this.tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - tipRect.height - 8, rect.top - 20))}px`;
    });
    cell.addEventListener('mouseleave', () => {
      this.tooltip.hidden = true;
    });
  }
}

function div(cls: string, text: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text) d.textContent = text;
  return d;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'service-btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
