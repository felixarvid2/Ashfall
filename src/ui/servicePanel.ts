/**
 * Hub service panel (left side, opened from a conversation or the stash): the trader's stock,
 * the blacksmith's reroll, the Technician's aspect extraction/imprinting and the shared stash.
 * The inventory opens beside it (portrait: below it, services.css splits the screen); clicking a backpack
 * item routes to the open service.
 *
 * Mobile-portrait rules (docs/ui/mobile-portrait-audit-panels.md, P084-P094):
 *  - the gold readout lives in the shared panel header (`.panel-header-extra`), not in the body;
 *  - buying and selling go through the item sheet on touch screens (price, comparison, gold after) and a
 *    confirm sheet on the desktop for valuable items; costly crafting and every destroy action use the
 *    two-tap `armConfirm`; "salvage all" asks first and lists what it takes;
 *  - the blacksmith is three accordion sections under a pinned item card.
 */
import type { Inventory } from '../core/components';
import { t, touchText } from '../data/i18n';
import { PERCENT_STATS, slotsFor, type Item, type StatKey } from '../data/loot/schemas';
import {
  buyPrice,
  canImprint,
  extractCost,
  imprintCost,
  rerollCost,
  sellPrice,
} from '../systems/hub/services';
import { codexEntries, MASTERWORK, RECIPE_DEFS, TEMPERING, type RecipeOption } from '../data/endgame/crafting';
import {
  canMasterwork,
  canTemper,
  codexImprintCost,
  masterworkCost,
  masterworkResetCost,
  temperChargesLeft,
  temperCost,
} from '../systems/endgame/crafting';
import { effectiveAffixes } from '../systems/endgame/itemMods';
import { salvagePreview } from '../systems/endgame/crafting';
import { powerScale, roundStat, salvageValue } from '../systems/loot/generate';
import { renderItemCell } from './inventoryPanel';
import { FILTER_CHIPS, SORT_MODES, filterMatches, isJunk, upgradeSign, type FilterChip, type SortMode } from './inventoryLogic';
import {
  ASPECT_CATEGORIES,
  STASH_PAGE_SIZE,
  clampPage,
  codexVisible,
  pageIndexes,
  stashPageCount,
  type AspectCategory,
} from './serviceLogic';
import type { BuybackEntry } from '../systems/hub/services';
import { artUrl } from './art';
import { aspectText, formatStat, itemDisplayName, placeTooltipForPortrait, renderItemTooltip, type Comparison } from './itemTooltip';
import { BASE_ITEMS, rarityDef } from '../data/loot/db';
import { armConfirm, confirmSheet } from './confirmSheet';
import { panelStack } from './panelStack';
import { tooltipSheet, useSheet } from './tooltipSheet';

export type ServiceKind = 'vendor' | 'blacksmith' | 'technician' | 'stash';

export interface ServiceActions {
  inventory(): Inventory;
  classId(): string;
  iconUrl(iconId: string): string | null;
  stock(): (Item | null)[];
  stash(): (Item | null)[];
  /** Does the item beat what is worn? Drives the upgrade arrows and the "Better" chip (B020, B022). */
  compare(item: Item): Comparison | null;
  /** Items sold to the trader since the last restock, newest first (B023). */
  buyback(): readonly BuybackEntry[];
  buyBack(index: number): void;
  /** Reorder the stash itself with the same rules as the backpack sort (B020). */
  sortStash(mode: SortMode): void;
  buy(index: number): void;
  /** D05: gold for the next stock reroll, and the reroll itself (pays, then rolls new stock). */
  rerollCost?(): number;
  rerollStock?(): void;
  /** D10: materials the character carries and the ones in the shared stash; moving them all either way. */
  materials?(): { character: Readonly<Record<string, number>>; stash: Readonly<Record<string, number>> };
  depositMaterials?(): void;
  withdrawMaterials?(): void;
  sell(gridIndex: number): void;
  reroll(gridIndex: number, affixIndex: number): void;
  /** Salvage the common and magic items of the backpack, except the grid indexes in `keep`. */
  salvageJunk(keep?: ReadonlySet<number>): void;
  extract(gridIndex: number): void;
  imprint(cacheIndex: number, gridIndex: number): void;
  toStash(gridIndex: number): void;
  fromStash(index: number): void;
  /** Endgame crafting (docs/endgame.md): the account/character state the panel shows, and the actions. */
  endgame(): { tierUnlocked: number; recipes: readonly string[]; materials: Readonly<Record<string, number>>; codex: readonly string[] };
  codexValue(aspectId: string, itemPower: number): number;
  temper(gridIndex: number, recipeId: string, slot?: number): void;
  masterworkRankUp(gridIndex: number): void;
  masterworkReset(gridIndex: number): void;
  codexImprint(aspectId: string, gridIndex: number): void;
}

/** Costs from this many gold, and any rare or better item, ask for a second tap (P013). */
export const CONFIRM_GOLD = 300;
const VALUABLE: ReadonlySet<string> = new Set(['rare', 'legendary', 'unique', 'mythic']);

/** Does buying or selling this item for `gold` need a confirmation? */
export function needsConfirm(item: Item, gold: number): boolean {
  return VALUABLE.has(item.rarity) || gold >= CONFIRM_GOLD;
}

/** The junk items of a backpack grid (common, magic and player-marked; never locked) with their grid index and total salvage gold. */
export function junkSummary(grid: readonly (Item | null)[]): { items: { index: number; item: Item }[]; gold: number } {
  const items: { index: number; item: Item }[] = [];
  grid.forEach((item, index) => {
    if (item && isJunk(item)) items.push({ index, item });
  });
  return { items, gold: items.reduce((sum, e) => sum + salvageValue(e.item), 0) };
}

/** The range a tempering recipe option rolls at this item power. */
export function temperRange(option: RecipeOption, itemPower: number): { min: number; max: number } {
  const scale = powerScale(option.scaling, itemPower);
  return { min: roundStat(option.min * scale), max: roundStat(option.max * scale) };
}

function numText(stat: StatKey, value: number): string {
  const abs = Math.abs(value);
  return PERCENT_STATS.has(stat) ? `${(abs * 100).toFixed(abs * 100 < 10 ? 1 : 0)}%` : `${Math.round(abs)}`;
}

/** "+3.0–5.0% Critical Strike Chance" */
export function rangeText(option: RecipeOption, itemPower: number): string {
  const { min, max } = temperRange(option, itemPower);
  const pct = PERCENT_STATS.has(option.stat) ? '%' : '';
  return `+${numText(option.stat, min).replace('%', '')}–${numText(option.stat, max).replace('%', '')}${pct} ${t(`stats.${option.stat}`)}`;
}

type Section = 'reroll' | 'temper' | 'master';

export class ServicePanel {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly body: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private kind: ServiceKind | null = null;
  /** Backpack item selected for the blacksmith or Technician. */
  private selected: number | null = null;
  /** Tempered affix that the next tempering replaces once an item has two. */
  private temperSlot = 0;
  /** The open blacksmith section (one at a time). */
  private section: Section = 'reroll';
  /** The Codex's locked group is folded away until asked for. */
  private codexLockedOpen = false;
  /** Codex filters (B026): only aspects that fit the selected item, and one slot group. */
  private codexFits = true;
  private codexCategory: AspectCategory | null = null;
  /** Stash view state (B020, B021): page, filter chip, sort menu. */
  private stashPage = 0;
  private stashFilter: FilterChip = 'all';
  private stashSortMode: SortMode | null = null;
  private stashMenuOpen = false;
  /** Keeps the selected backpack cell highlighted when the backpack redraws. */
  private bagWatch: MutationObserver | null = null;

  constructor(parent: HTMLElement, private readonly actions: ServiceActions) {
    this.root = document.createElement('div');
    this.root.className = 'panel service-panel';
    this.root.hidden = true;
    this.root.dataset.testid = 'service-panel';
    // The shared panel header (panelStack.register) takes this heading and adds the close button and gold slot.
    this.title = document.createElement('h2');
    this.body = document.createElement('div');
    this.body.className = 'service-body';
    this.root.append(this.title, this.body);
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'item-tooltip';
    this.tooltip.hidden = true;
    parent.append(this.root, this.tooltip);
    // The stash sort menu closes on a click anywhere else.
    document.addEventListener('click', (e) => {
      if (this.stashMenuOpen && !(e.target as HTMLElement | null)?.closest('.stash-tools .inv-tools')) {
        this.stashMenuOpen = false;
        this.refresh();
      }
    });
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
    const wasOpen = this.open;
    this.kind = kind;
    this.selected = null;
    this.temperSlot = 0;
    this.section = 'reroll';
    this.codexLockedOpen = false;
    this.codexFits = true;
    this.codexCategory = null;
    this.stashPage = 0;
    this.stashFilter = 'all';
    this.stashMenuOpen = false;
    this.root.hidden = false;
    this.root.scrollTop = 0;
    this.title.textContent = t(`services.${kind}.title`);
    this.refresh();
    this.watchBag();
    if (wasOpen) this.refreshTip();
    this.onToggle(true);
  }

  /** Another service replaced the open one: the first-open tip must say what the new one does. */
  private refreshTip(): void {
    const hint = this.body.querySelector('.inv-hint');
    const text = ((hint?.querySelector('.hint-touch') ?? hint)?.textContent ?? '').trim();
    const span = this.root.querySelector('.panel-tip > span');
    if (span && text) span.textContent = text;
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.tooltip.hidden = true;
    this.bagWatch?.disconnect();
    this.bagWatch = null;
    if (tooltipSheet.isOpen) tooltipSheet.hide();
    this.onToggle(false);
  }

  /** A backpack item was clicked while this panel is open. */
  backpackClick(index: number): void {
    const inv = this.actions.inventory();
    const item = inv.grid[index];
    switch (this.kind) {
      case 'vendor':
        if (item) this.trade('sell', item, sellPrice(item), () => {
          if (this.actions.inventory().grid[index] === item) this.actions.sell(index);
        });
        break;
      case 'stash':
        this.actions.toStash(index);
        break;
      default:
        this.selected = this.selected === index ? null : index;
        this.temperSlot = 0;
        break;
    }
    this.refresh();
  }

  refresh(): void {
    if (!this.open || !this.kind) return;
    const inv = this.actions.inventory();
    this.updateGold(inv);
    const rows: HTMLElement[] = [];
    if (this.kind === 'vendor') rows.push(...this.vendor(inv));
    else if (this.kind === 'stash') rows.push(...this.stash());
    else if (this.kind === 'blacksmith') rows.push(...this.blacksmith(inv));
    else rows.push(...this.technician(inv));
    this.body.replaceChildren(...rows);
    // The pinned card sticks right under the header, whatever its height at this text size.
    const header = this.root.querySelector<HTMLElement>('.panel-header');
    if (header) this.root.style.setProperty('--svc-head', `${header.offsetHeight}px`);
    this.markSelected();
  }

  // ---- header gold and backpack highlight ---------------------------------------------------------

  /** One gold readout, in the sticky header's extra slot (P011, P086). */
  private updateGold(inv: Inventory): void {
    const extra = this.root.querySelector('.panel-header-extra');
    if (!extra) return;
    let gold = extra.querySelector<HTMLElement>('.service-gold');
    if (!gold) {
      gold = div('service-gold', '');
      gold.dataset.testid = 'service-gold';
      extra.prepend(gold);
    }
    gold.textContent = t('ui.gold', { gold: inv.gold.toLocaleString('en-US') });
  }

  private bagGrid(): HTMLElement | null {
    return this.root.closest('#ui')?.querySelector<HTMLElement>('.inventory-panel .inv-grid') ?? null;
  }

  /** The chosen backpack item stays highlighted while its card is pinned here (P084). */
  private markSelected(): void {
    const grid = this.bagGrid();
    if (!grid) return;
    [...grid.children].forEach((cell, i) => cell.classList.toggle('svc-selected', i === this.selected && this.kind !== 'vendor' && this.kind !== 'stash'));
  }

  private watchBag(): void {
    this.bagWatch?.disconnect();
    const grid = this.bagGrid();
    if (!grid || typeof MutationObserver === 'undefined') return;
    this.bagWatch = new MutationObserver(() => this.markSelected());
    this.bagWatch.observe(grid, { childList: true });
  }

  // ---- vendor ----------------------------------------------------------------------------------------

  private vendor(inv: Inventory): HTMLElement[] {
    const grid = div('inv-grid service-grid', '');
    this.actions.stock().forEach((item, i) => {
      const slot = div('stock-slot', '');
      slot.dataset.testid = `stock-${i}`;
      const cell = renderItemCell(item, (id) => this.actions.iconUrl(id));
      slot.append(cell);
      if (item) {
        this.badge(cell, item);
        const price = buyPrice(item);
        const pill = div('price-pill', price.toLocaleString('en-US'));
        pill.dataset.testid = `price-${i}`;
        slot.classList.toggle('unaffordable', price > inv.gold);
        slot.append(pill);
        slot.addEventListener('click', () => this.trade('buy', item, price, () => {
          if (this.actions.stock()[i] === item) this.actions.buy(i);
          this.refresh();
        }));
        this.hover(slot, item, t('services.vendor.price', { gold: price }));
      } else {
        slot.classList.add('sold');
        slot.append(div('price-pill', t('services.vendor.sold')));
      }
      grid.appendChild(slot);
    });
    const out: HTMLElement[] = [div('inv-hint', touchText('services.vendor.hint')), grid];
    const cost = this.actions.rerollCost?.();
    if (cost !== undefined) {
      const reroll = button(t('services.vendor.reroll', { gold: cost.toLocaleString('en-US') }), () => {
        this.actions.rerollStock?.();
        this.refresh();
      });
      reroll.dataset.testid = 'vendor-reroll';
      reroll.title = t('services.vendor.rerollHint');
      reroll.classList.toggle('unaffordable', cost > inv.gold);
      reroll.disabled = cost > inv.gold;
      out.push(reroll);
    }
    out.push(...this.buybackRow(inv));
    return out;
  }

  /** B023: the last items sold, one line of cells at the stock cell size; a click buys one back at the sale price. */
  private buybackRow(inv: Inventory): HTMLElement[] {
    const sold = this.actions.buyback();
    if (sold.length === 0) return [];
    const row = div('buyback-row', '');
    row.dataset.testid = 'buyback-row';
    sold.forEach((entry, i) => {
      const slot = div('stock-slot buyback-slot', '');
      slot.dataset.testid = `buyback-${i}`;
      const cell = renderItemCell(entry.item, (id) => this.actions.iconUrl(id));
      this.badge(cell, entry.item);
      const pill = div('price-pill', entry.price.toLocaleString('en-US'));
      slot.classList.toggle('unaffordable', entry.price > inv.gold);
      slot.append(cell, pill);
      slot.addEventListener('click', () => {
        if (this.actions.buyback()[i] === entry) this.actions.buyBack(i);
        this.refresh();
      });
      this.hover(slot, entry.item, t('services.vendor.buybackPrice', { gold: entry.price }));
      row.append(slot);
    });
    const label = div('service-sub', t('services.vendor.buyback', { n: sold.length }));
    label.dataset.testid = 'buyback-title';
    return [label, row];
  }

  /** Item power and the upgrade arrow in a cell's corners, like the backpack (B022). No size change. */
  private badge(cell: HTMLElement, item: Item): void {
    if (item.crystal) return;
    const power = document.createElement('span');
    power.className = 'cell-power';
    power.textContent = String(item.itemPower);
    cell.appendChild(power);
    const cmp = this.actions.compare(item);
    const sign = cmp ? upgradeSign(cmp) : 0;
    if (!sign) return;
    const up = sign > 0;
    const arrow = document.createElement('span');
    arrow.className = `cell-arrow ${up ? 'up' : 'down'}`;
    arrow.textContent = up ? '▲' : '▼';
    arrow.setAttribute('role', 'img');
    arrow.setAttribute('aria-label', t(up ? 'items.bag.better' : 'items.bag.worse'));
    cell.dataset.sign = String(sign);
    cell.appendChild(arrow);
  }

  /**
   * Buy or sell one item. On touch screens the item sheet shows the item, the price and the gold afterwards; a
   * valuable item arms its button for a second tap. With a mouse, cheap common deals stay one click and the rest
   * ask in a confirm sheet.
   */
  private trade(mode: 'buy' | 'sell', item: Item, price: number, run: () => void): void {
    const inv = this.actions.inventory();
    const afford = mode === 'sell' || inv.gold >= price;
    const arm = afford && needsConfirm(item, price);
    const after = mode === 'buy' ? inv.gold - price : inv.gold + price;
    const gold = price.toLocaleString('en-US');
    const priceLine = t(mode === 'buy' ? 'services.trade.buyLine' : 'services.trade.sellLine', {
      gold,
      have: inv.gold.toLocaleString('en-US'),
      after: after.toLocaleString('en-US'),
    });
    if (!useSheet()) {
      if (!arm) return run();
      void confirmSheet({
        title: itemDisplayName(item),
        body: priceLine,
        confirmLabel: t(mode === 'buy' ? 'services.trade.buy' : 'services.trade.sell', { gold }),
      }).then((ok) => {
        if (ok) run();
      });
      return;
    }
    const tip = renderItemTooltip(item, this.actions.classId());
    const priceRow = div('tooltip-price service-price', priceLine);
    priceRow.dataset.testid = 'trade-price';
    tip.appendChild(priceRow);
    const equipped = this.equippedFor(item);
    tooltipSheet.show({
      title: t(mode === 'buy' ? 'services.vendor.buyTitle' : 'services.vendor.sellTitle'),
      content: tip,
      compare: equipped ? renderItemTooltip(equipped, this.actions.classId(), { equipped: true }) : undefined,
      actions: [
        {
          label: t(mode === 'buy' ? 'services.trade.buy' : 'services.trade.sell', { gold }),
          primary: true,
          disabled: !afford,
          // Armed: the first tap is swallowed by armConfirm, the second runs `go` itself.
          onClick: arm ? () => {} : run,
        },
        { label: t('panels.cancel'), onClick: () => {} },
      ],
    });
    if (arm) {
      const primary = panelStack.container.querySelector<HTMLButtonElement>('.tooltip-sheet .sheet-action.primary');
      if (primary) {
        armConfirm(primary, {
          armedLabel: t('services.trade.confirm', { gold }),
          run: () => {
            tooltipSheet.hide();
            run();
          },
        });
      }
    }
  }

  /** The worn item the given one would replace, for the side-by-side comparison. */
  private equippedFor(item: Item): Item | null {
    const base = BASE_ITEMS.get(item.base);
    if (!base || item.crystal) return null;
    const inv = this.actions.inventory();
    for (const slot of slotsFor(base.type)) {
      const worn = inv.equipped[slot];
      if (worn) return worn;
    }
    return null;
  }

  // ---- stash -----------------------------------------------------------------------------------------

  private stash(): HTMLElement[] {
    const slots = this.actions.stash();
    const used = slots.filter((s) => s !== null).length;
    const out: HTMLElement[] = [];
    const count = div('service-count', t('services.stash.count', { used, total: slots.length }));
    count.dataset.testid = 'stash-count';
    out.push(count);
    if (used === 0) {
      const empty = div('service-empty', t('services.stash.empty'));
      empty.dataset.testid = 'stash-empty';
      out.push(empty);
    }
    out.push(this.stashTools(slots));
    this.stashPage = clampPage(this.stashPage, slots.length);
    const grid = div('inv-grid service-grid stash-grid', '');
    grid.dataset.testid = 'stash-grid';
    for (const i of pageIndexes(this.stashPage, slots.length)) {
      const item = slots[i] ?? null;
      const cell = renderItemCell(item, (id) => this.actions.iconUrl(id));
      cell.dataset.stash = String(i);
      if (item) {
        this.badge(cell, item);
        cell.addEventListener('click', () => {
          this.actions.fromStash(i);
          this.refresh();
        });
        this.hover(cell, item);
      }
      if (!filterMatches(item, this.stashFilter, cell.dataset.sign === '1')) cell.classList.add('filtered-out');
      grid.appendChild(cell);
    }
    out.push(grid);
    const junk = junkSummary(this.actions.inventory().grid);
    const free = slots.length - used;
    const store = button(t('services.stash.storeJunk', { n: junk.items.length }), () => {
      // Every move saves the account; the free-slot count keeps this from running into a full stash.
      for (const e of junk.items.slice(0, free)) this.actions.toStash(e.index);
      this.refresh();
    });
    store.dataset.testid = 'stash-store-junk';
    store.disabled = junk.items.length === 0 || free === 0;
    out.push(store, ...this.materialButtons(), div('inv-hint', touchText('services.stash.hint')));
    return out;
  }

  /** D10: "Deposit all materials" (and "Take all materials" back) for the endgame materials, which are otherwise per character. */
  private materialButtons(): HTMLElement[] {
    const m = this.actions.materials?.();
    if (!m) return [];
    const sum = (r: Readonly<Record<string, number>>) => Object.values(r).reduce((a, b) => a + b, 0);
    const mine = sum(m.character);
    const kept = sum(m.stash);
    const out: HTMLElement[] = [];
    const deposit = button(t('services.stash.depositMaterials', { n: mine }), () => {
      this.actions.depositMaterials?.();
      this.refresh();
    });
    deposit.dataset.testid = 'stash-deposit-materials';
    deposit.disabled = mine === 0;
    deposit.title = Object.entries(m.character).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${t(`crafting.materials.${id}`)}`).join(', ');
    out.push(deposit);
    if (kept > 0) {
      const take = button(t('services.stash.withdrawMaterials', { n: kept }), () => {
        this.actions.withdrawMaterials?.();
        this.refresh();
      });
      take.dataset.testid = 'stash-withdraw-materials';
      take.title = Object.entries(m.stash).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${t(`crafting.materials.${id}`)}`).join(', ');
      out.push(take);
    }
    return out;
  }

  /** Sort, pages and filter chips of the stash (B020, B021), in the backpack's own styles. */
  private stashTools(slots: (Item | null)[]): HTMLElement {
    const tools = div('stash-tools', '');
    const top = div('stash-tools-row', '');
    const group = div('inv-tools', '');
    const sortBtn = button(t('items.bag.sort'), () => {
      this.stashMenuOpen = !this.stashMenuOpen;
      this.refresh();
    });
    sortBtn.className = 'inv-tool inv-sort-btn';
    sortBtn.dataset.testid = 'stash-sort';
    sortBtn.setAttribute('aria-haspopup', 'true');
    sortBtn.setAttribute('aria-expanded', String(this.stashMenuOpen));
    group.append(sortBtn);
    if (this.stashMenuOpen) {
      const menu = div('inv-sort-menu', '');
      menu.setAttribute('role', 'menu');
      for (const mode of SORT_MODES) {
        const b = button(t(`items.bag.sortBy.${mode}`), () => {
          this.stashMenuOpen = false;
          this.stashSortMode = mode;
          this.actions.sortStash(mode);
          this.refresh();
        });
        b.className = 'inv-sort-option';
        b.dataset.mode = mode;
        b.setAttribute('role', 'menuitem');
        b.classList.toggle('on', mode === this.stashSortMode);
        menu.append(b);
      }
      group.append(menu);
    }
    top.append(group);
    const pages = stashPageCount(slots.length);
    if (pages > 1) {
      const nav = div('stash-pages', '');
      nav.setAttribute('role', 'group');
      nav.setAttribute('aria-label', t('services.stash.pages'));
      for (let p = 0; p < pages; p++) {
        const b = button(String(p + 1), () => {
          this.stashPage = p;
          this.refresh();
        });
        b.className = 'inv-chip stash-page';
        b.dataset.testid = `stash-page-${p + 1}`;
        b.classList.toggle('on', p === this.stashPage);
        b.setAttribute('aria-pressed', String(p === this.stashPage));
        b.setAttribute('aria-label', t('services.stash.page', { n: p + 1 }));
        b.title = `${p * STASH_PAGE_SIZE + 1}-${Math.min(slots.length, (p + 1) * STASH_PAGE_SIZE)}`;
        nav.append(b);
      }
      top.append(nav);
    }
    const chips = div('inv-chips stash-chips', '');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', t('items.bag.filterLabel'));
    for (const chip of FILTER_CHIPS) {
      const b = button(t(`items.bag.filters.${chip}`), () => {
        this.stashFilter = chip;
        this.refresh();
      });
      b.className = 'inv-chip';
      b.dataset.testid = `stash-chip-${chip}`;
      b.classList.toggle('on', chip === this.stashFilter);
      b.setAttribute('aria-pressed', String(chip === this.stashFilter));
      chips.append(b);
    }
    tools.append(top, chips);
    return tools;
  }

  // ---- shared pieces -----------------------------------------------------------------------------------

  private selectedItem(inv: Inventory): Item | null {
    return this.selected !== null ? (inv.grid[this.selected] ?? null) : null;
  }

  /** The pinned card of the selected item: icon, name, power, every affix as a chip (P087, P093). */
  private itemCard(item: Item, withAspect = false): HTMLElement {
    const card = div('service-card', '');
    card.dataset.testid = 'service-card';
    const cell = renderItemCell(item, (id) => this.actions.iconUrl(id));
    cell.classList.add('card-icon');
    const info = div('card-info', '');
    const name = div('service-item', itemDisplayName(item));
    name.style.color = rarityDef(item.rarity).color;
    const meta = [t('items.itemPower', { power: item.itemPower })];
    if (item.masterwork) meta.push(t('crafting.tooltip.masterwork', { rank: item.masterwork, max: MASTERWORK.maxRank }));
    info.append(name, div('card-meta', meta.join(' · ')));
    const chips = div('card-chips', '');
    effectiveAffixes(item).forEach((a, i) => {
      const cls = a.tempered ? 'tempered' : a.greater ? 'greater' : '';
      const chip = div(`chip ${cls}`.trim(), `${a.tempered ? '⚒ ' : a.greater ? '◆ ' : ''}${formatStat(a.stat, a.value)}${a.boosted ? ' ▲' : ''}`);
      chip.dataset.affix = String(i);
      chips.append(chip);
    });
    info.append(chips);
    if (withAspect && item.aspect) {
      const aspect = div('card-aspect', `✦ ${t(`aspects.${item.aspect.id}.name`)}: ${aspectText(item.aspect.id, item.aspect.value)}`);
      aspect.dataset.testid = 'card-aspect';
      info.append(aspect);
    }
    card.append(cell, info);
    return card;
  }

  /** A button that does `run` at once, or after a second tap when `armedLabel` is given. */
  private action(label: string, armedLabel: string | null, run: () => void): HTMLButtonElement {
    // With arming, armConfirm runs `run` itself on the second tap; the click handler must not run it again.
    const b = button(label, armedLabel ? () => {} : run);
    if (armedLabel) armConfirm(b, { armedLabel, run });
    return b;
  }

  /** "Confirm - 585 gold" for costs from CONFIRM_GOLD up, otherwise null (one tap). */
  private armFor(gold: number, always = false): string | null {
    return always || gold >= CONFIRM_GOLD ? t('services.trade.confirm', { gold: gold.toLocaleString('en-US') }) : null;
  }

  private chip(text: string, ok: boolean, testid?: string): HTMLElement {
    const c = div(`chip cost ${ok ? 'have' : 'lack'}`, text);
    if (testid) c.dataset.testid = testid;
    return c;
  }

  // ---- blacksmith ----------------------------------------------------------------------------------------

  private blacksmith(inv: Inventory): HTMLElement[] {
    const item = this.selectedItem(inv);
    const out: HTMLElement[] = [];
    if (!item) out.push(div('inv-hint', t('services.blacksmith.hint')));
    else {
      out.push(this.itemCard(item));
      const eg = this.actions.endgame();
      const rerollable = !item.unique && item.affixes.length > 0;
      const temperSummary =
        eg.tierUnlocked < TEMPERING.tierRequired
          ? t('crafting.temper.lockedShort')
          : canTemper(item)
            ? t('crafting.temper.charges', { n: temperChargesLeft(item), max: TEMPERING.charges })
            : t('crafting.temper.cannotShort');
      const masterSummary = canMasterwork(item) ? t('crafting.masterwork.rank', { rank: item.masterwork ?? 0, max: MASTERWORK.maxRank }) : t('crafting.masterwork.cannotShort');
      out.push(
        this.accordion('reroll', t('services.blacksmith.sectionReroll'), rerollable ? t('services.blacksmith.rerollCount', { n: item.affixes.length }) : '–', () => this.rerolls(inv, item)),
        this.accordion('temper', t('crafting.temper.title'), temperSummary, () => this.tempering(inv, item)),
        this.accordion('master', t('crafting.masterwork.title'), masterSummary, () => this.masterwork(inv, item)),
      );
    }
    out.push(this.salvageAll());
    return out;
  }

  /** One collapsible section; opening one closes the others (P088). */
  private accordion(id: Section, title: string, summary: string, content: () => HTMLElement[]): HTMLElement {
    const open = this.section === id;
    const wrap = div(`service-section${open ? ' open' : ''}`, '');
    wrap.dataset.testid = `section-${id}`;
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'service-section-head';
    head.dataset.testid = `section-${id}-head`;
    head.setAttribute('aria-expanded', String(open));
    head.append(div('section-title', title), div('section-summary', summary), div('section-caret', open ? '▾' : '▸'));
    head.addEventListener('click', () => {
      this.section = id;
      this.refresh();
    });
    wrap.append(head);
    if (open) {
      const body = div('service-section-body', '');
      body.replaceChildren(...content());
      wrap.append(body);
    }
    return wrap;
  }

  private rerolls(inv: Inventory, item: Item): HTMLElement[] {
    if (item.unique || item.affixes.length === 0) return [div('service-note', t('services.blacksmith.cannot'))];
    const cost = rerollCost(item);
    const out: HTMLElement[] = [div('service-note', t('services.blacksmith.rerollNote', { power: item.itemPower }))];
    item.affixes.forEach((a, i) => {
      const b = this.action(
        `${formatStat(a.stat, a.value)}  →  ${t('services.blacksmith.reroll', { gold: cost })}`,
        this.armFor(cost),
        () => {
          this.actions.reroll(this.selected!, i);
          this.refresh();
        },
      );
      b.dataset.testid = `reroll-${i}`;
      b.disabled = inv.gold < cost;
      // The affix about to be rerolled lights up on the pinned card.
      const mark = (on: boolean) => this.body.querySelector(`.service-card [data-affix="${i}"]`)?.classList.toggle('hl', on);
      b.addEventListener('focus', () => mark(true));
      b.addEventListener('blur', () => mark(false));
      out.push(b);
    });
    return out;
  }

  private salvageAll(): HTMLElement {
    const junk = junkSummary(this.actions.inventory().grid);
    const b = button(
      junk.items.length === 0
        ? t('services.blacksmith.salvageNone')
        : t(junk.items.length === 1 ? 'services.blacksmith.salvageCountOne' : 'services.blacksmith.salvageCount', { n: junk.items.length, gold: junk.gold.toLocaleString('en-US') }),
      () => void this.confirmSalvage(),
    );
    b.classList.add('service-salvage');
    b.dataset.testid = 'salvage-junk';
    b.disabled = junk.items.length === 0;
    return b;
  }

  /** Lists the first eight junk items with a Keep toggle, then salvages the rest (P091). */
  private async confirmSalvage(): Promise<void> {
    const junk = junkSummary(this.actions.inventory().grid);
    if (junk.items.length === 0) return;
    const keep = new Set<number>();
    const summary = div('salvage-summary', '');
    summary.dataset.testid = 'salvage-summary';
    const update = () => {
      const taken = junk.items.filter((e) => !keep.has(e.index));
      const dust = salvagePreview(taken.map((e) => e.item)).lumen_dust;
      // D09: the materials come before the player confirms.
      summary.textContent =
        t(taken.length === 1 ? 'services.blacksmith.salvageSummaryOne' : 'services.blacksmith.salvageSummary', {
          n: taken.length,
          gold: taken.reduce((sum, e) => sum + salvageValue(e.item), 0).toLocaleString('en-US'),
        }) + (dust > 0 ? ` ${t('items.bag.salvageMaterials', { n: dust, material: t('crafting.materials.lumen_dust') })}` : '');
    };
    const list = div('salvage-list', '');
    for (const e of junk.items.slice(0, 8)) {
      const row = document.createElement('label');
      row.className = 'salvage-item';
      const check = Object.assign(document.createElement('input'), { type: 'checkbox' });
      check.dataset.testid = `salvage-keep-${e.index}`;
      check.addEventListener('change', () => {
        if (check.checked) keep.add(e.index);
        else keep.delete(e.index);
        update();
      });
      const name = Object.assign(document.createElement('span'), { className: 'salvage-name', textContent: itemDisplayName(e.item) });
      name.style.color = rarityDef(e.item.rarity).color;
      row.append(name, Object.assign(document.createElement('span'), { className: 'salvage-keep', textContent: t('services.blacksmith.keep') }), check);
      list.append(row);
    }
    if (junk.items.length > 8) list.append(div('salvage-more', t('services.blacksmith.salvageMore', { n: junk.items.length - 8 })));
    update();
    const ok = await confirmSheet({
      title: t('services.blacksmith.salvageTitle'),
      body: [summary, list],
      confirmLabel: t('services.blacksmith.salvageConfirm'),
      danger: true,
    });
    if (!ok) return;
    this.actions.salvageJunk(keep);
    this.selected = null;
    this.refresh();
  }

  // ---- technician ----------------------------------------------------------------------------------------

  private technician(inv: Inventory): HTMLElement[] {
    const item = this.selectedItem(inv);
    const out: HTMLElement[] = [];
    if (!item) out.push(div('inv-hint', t('services.technician.hint')));
    else out.push(this.itemCard(item, true));
    const cache = inv.aspects ?? [];
    if (item?.aspect && !item.unique) {
      const cost = extractCost(item);
      const aspectName = t(`aspects.${item.aspect.id}.name`);
      const b = this.action(t('services.technician.extract', { aspect: aspectName, gold: cost }), this.armFor(cost, true), () => {
        this.actions.extract(this.selected!);
        this.selected = null;
        this.refresh();
      });
      b.classList.add('danger');
      b.dataset.testid = 'extract';
      b.disabled = inv.gold < cost;
      out.push(b, div('service-note', t('services.technician.extractWarn')));
    }
    out.push(div('service-sub', t('services.technician.cache', { n: cache.length })));
    if (cache.length === 0) out.push(div('service-note', t('services.technician.empty')));
    cache.forEach((a, i) => {
      const row = div('aspect-row', '');
      const icon = artUrl(`aspects/${a.id}`);
      if (icon) row.append(Object.assign(document.createElement('img'), { src: icon, alt: '', className: 'aspect-icon' }));
      row.append(div('aspect-name', t(`aspects.${a.id}.name`)), div('aspect-desc', aspectText(a.id, a.value)));
      // The desktop shows one 44 px row; the full text is on hover (B025).
      row.classList.add('aspect-compact');
      row.title = `${t(`aspects.${a.id}.name`)}: ${aspectText(a.id, a.value)}`;
      if (item && canImprint(item, a.id)) {
        row.append(this.beforeAfter(item, a.id, a.value));
        const cost = imprintCost(item);
        const b = this.action(t('services.technician.imprint', { gold: cost }), this.armFor(cost), () => {
          this.actions.imprint(i, this.selected!);
          this.refresh();
        });
        b.dataset.testid = `imprint-${i}`;
        b.disabled = inv.gold < cost;
        row.appendChild(b);
      }
      out.push(row);
    });
    out.push(...this.codex(inv, item));
    return out;
  }

  /** "Aspect: none -> Brutal +7% damage", and what it replaces (P093). */
  private beforeAfter(item: Item, aspectId: string, value: number): HTMLElement {
    const now = item.aspect ? t(`aspects.${item.aspect.id}.name`) : t('services.technician.noAspect');
    const row = div('aspect-change', t('services.technician.change', { from: now, to: `${t(`aspects.${aspectId}.name`)} ${aspectText(aspectId, value)}` }));
    if (item.aspect) row.append(div('aspect-replaces', t('services.technician.replaces', { aspect: now })));
    return row;
  }

  // ---- tempering and masterwork --------------------------------------------------------------------------

  /** Tempering (endgame): add or replace a tempered affix from a learned recipe. */
  private tempering(inv: Inventory, item: Item): HTMLElement[] {
    const out: HTMLElement[] = [];
    const eg = this.actions.endgame();
    if (eg.tierUnlocked < TEMPERING.tierRequired) return [div('service-note', t('crafting.temper.locked'))];
    if (!canTemper(item)) return [div('service-note', t('crafting.temper.cannot'))];
    const left = temperChargesLeft(item);
    const tempered = item.tempered ?? [];
    out.push(div('temper-charges', t('crafting.temper.charges', { n: left, max: TEMPERING.charges })));
    for (const a of tempered) out.push(div('tempered', `${formatStat(a.stat, a.value)}  (${t(`crafting.recipes.${a.affix}.name`)})`));
    const recipes = eg.recipes.filter((id) => RECIPE_DEFS.has(id));
    if (recipes.length === 0) return [...out, div('service-note', t('crafting.temper.noRecipes'))];
    const cost = temperCost(item);
    const full = tempered.length >= TEMPERING.maxAffixes;
    // With both slots filled, one choice of which affix to replace applies to every recipe.
    if (full) {
      this.temperSlot = Math.min(this.temperSlot, tempered.length - 1);
      out.push(div('service-note', t('crafting.temper.pickReplace')));
      const pick = div('temper-slots', '');
      tempered.forEach((a, i) => {
        const b = button(t('crafting.temper.replace', { stat: t(`stats.${a.stat}`) }), () => {
          this.temperSlot = i;
          this.refresh();
        });
        b.classList.toggle('active', i === this.temperSlot);
        b.setAttribute('aria-pressed', String(i === this.temperSlot));
        b.dataset.testid = `temper-slot-${i}`;
        pick.appendChild(b);
      });
      out.push(pick);
    }
    for (const id of recipes) {
      const recipe = RECIPE_DEFS.get(id)!;
      const row = div('recipe-row', '');
      row.dataset.testid = `recipe-${id}`;
      const head = div('recipe-head', '');
      head.append(div('recipe-name', t(`crafting.recipes.${id}.name`)), div('chip group', t(`crafting.groups.${recipe.group}`)));
      row.append(head);
      // The range each option rolls at this item's power.
      const ranges = div('recipe-ranges', '');
      for (const text of new Set(recipe.options.map((o) => rangeText(o, item.itemPower)))) ranges.append(div('recipe-range', text));
      row.append(ranges);
      if (full) row.append(div('recipe-replaces', t('crafting.temper.replacing', { stat: t(`stats.${tempered[this.temperSlot]!.stat}`) })));
      const foot = div('recipe-foot', '');
      foot.append(this.chip(t('ui.gold', { gold: cost.toLocaleString('en-US') }), inv.gold >= cost));
      const b = this.action(t('crafting.temper.add'), this.armFor(cost, true), () => {
        this.actions.temper(this.selected!, id, full ? this.temperSlot : undefined);
        this.refresh();
      });
      b.dataset.testid = `temper-${id}`;
      b.disabled = inv.gold < cost || left <= 0;
      foot.append(b);
      row.append(foot);
      out.push(row);
    }
    return out;
  }

  /** Masterworking (endgame): ranks 0–12 for gold and materials, reset for gold. */
  private masterwork(inv: Inventory, item: Item): HTMLElement[] {
    if (!canMasterwork(item)) return [div('service-note', t('crafting.masterwork.cannot'))];
    const out: HTMLElement[] = [];
    const rank = item.masterwork ?? 0;
    const mats = this.actions.endgame().materials;
    const dust = mats['lumen_dust'] ?? 0;
    const shards = mats['rift_shard'] ?? 0;
    out.push(div('masterwork-rank', t('crafting.masterwork.rank', { rank, max: MASTERWORK.maxRank })), div('service-note', t('crafting.masterwork.note')));
    const cost = masterworkCost(item);
    if (!cost) out.push(div('service-note', t('crafting.masterwork.maxed')));
    else {
      const chips = div('cost-chips', '');
      chips.dataset.testid = 'masterwork-costs';
      chips.append(
        this.chip(t('ui.gold', { gold: cost.gold.toLocaleString('en-US') }), inv.gold >= cost.gold, 'cost-gold'),
        this.chip(`${cost.lumen_dust} ${t('crafting.materials.lumen_dust')} (${dust})`, dust >= cost.lumen_dust, 'cost-dust'),
      );
      if (cost.rift_shard > 0) chips.append(this.chip(`${cost.rift_shard} ${t('crafting.materials.rift_shard')} (${shards})`, shards >= cost.rift_shard, 'cost-shards'));
      out.push(chips);
      // What the next rank does to the numbers.
      const next = effectiveAffixes({ ...item, masterwork: rank + 1 });
      const lines = effectiveAffixes(item)
        .map((a, i) => ({ a, to: next[i]!.value }))
        .filter((e) => Math.abs(e.to - e.a.value) > 1e-9)
        .slice(0, 4);
      if (lines.length > 0) {
        const preview = div('masterwork-preview', '');
        preview.dataset.testid = 'masterwork-preview';
        for (const e of lines) preview.append(div('preview-line', `${t(`stats.${e.a.stat}`)} ${numText(e.a.stat, e.a.value)} → ${numText(e.a.stat, e.to)}`));
        if ((MASTERWORK.upgradeRanks as readonly number[]).includes(rank + 1)) preview.append(div('preview-line', t('crafting.masterwork.upgradeNote')));
        out.push(preview);
      }
      const reasons: string[] = [];
      if (inv.gold < cost.gold) reasons.push(t('crafting.masterwork.needGold'));
      if (dust < cost.lumen_dust) reasons.push(t('crafting.masterwork.needDust'));
      if (shards < cost.rift_shard) reasons.push(t('crafting.masterwork.needShards'));
      const b = this.action(t('crafting.masterwork.raise', { rank: rank + 1 }), this.armFor(cost.gold, true), () => {
        this.actions.masterworkRankUp(this.selected!);
        this.refresh();
      });
      b.classList.add('big');
      b.dataset.testid = 'masterwork-up';
      b.disabled = reasons.length > 0;
      out.push(b);
      if (reasons.length > 0) out.push(div('service-note lack', reasons.join(' · ')));
    }
    if (rank > 0) {
      const gold = masterworkResetCost(item);
      const b = this.action(t('crafting.masterwork.reset', { gold }), this.armFor(gold, true), () => {
        this.actions.masterworkReset(this.selected!);
        this.refresh();
      });
      b.classList.add('quiet');
      b.dataset.testid = 'masterwork-reset';
      b.disabled = inv.gold < gold;
      out.push(b);
    }
    return out;
  }

  // ---- codex ---------------------------------------------------------------------------------------------

  /** The Codex of Power (endgame): unlocked aspects first with their imprint buttons, the locked ones folded (P092). */
  private codex(inv: Inventory, item: Item | null): HTMLElement[] {
    const eg = this.actions.endgame();
    const entries = codexEntries();
    const open = entries.filter(([, aspect]) => eg.codex.includes(aspect));
    const locked = entries.filter(([, aspect]) => !eg.codex.includes(aspect));
    const out: HTMLElement[] = [div('service-sep', ''), div('service-sub', t('crafting.codex.title', { n: open.length, total: entries.length })), div('service-note', t('crafting.codex.hint')), this.codexFilters(item)];
    const shown = open.filter(([, aspect]) => codexVisible(aspect, item, this.codexFits, this.codexCategory));
    if (open.length > 0 && shown.length === 0) {
      const none = div('service-note', t('crafting.codex.noMatch'));
      none.dataset.testid = 'codex-none';
      out.push(none);
    }
    for (const [, aspect] of shown) {
      const row = div('aspect-row codex-row aspect-compact', '');
      row.dataset.testid = `codex-${aspect}`;
      const icon = artUrl(`aspects/${aspect}`);
      if (icon) row.append(Object.assign(document.createElement('img'), { src: icon, alt: '', className: 'aspect-icon' }));
      row.append(div('aspect-name', t(`aspects.${aspect}.name`)));
      const preview = this.actions.codexValue(aspect, item?.itemPower ?? 100);
      row.append(div('aspect-desc', aspectText(aspect, preview)));
      row.title = `${t(`aspects.${aspect}.name`)}: ${aspectText(aspect, preview)}`;
      if (item && canImprint(item, aspect)) {
        row.append(this.beforeAfter(item, aspect, this.actions.codexValue(aspect, item.itemPower)));
        const cost = codexImprintCost(item);
        const b = this.action(t('crafting.codex.imprint', { gold: cost }), this.armFor(cost), () => {
          this.actions.codexImprint(aspect, this.selected!);
          this.refresh();
        });
        b.dataset.testid = `codex-imprint-${aspect}`;
        b.disabled = inv.gold < cost;
        row.appendChild(b);
      }
      out.push(row);
    }
    if (locked.length === 0) return out;
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'service-section-head codex-locked-head';
    head.dataset.testid = 'codex-locked-head';
    head.setAttribute('aria-expanded', String(this.codexLockedOpen));
    head.append(
      div('section-title', t('crafting.codex.lockedTitle', { n: locked.length })),
      div('section-summary', t('crafting.codex.progress', { done: open.length, total: entries.length })),
      div('section-caret', this.codexLockedOpen ? '▾' : '▸'),
    );
    const bar = div('codex-progress', '');
    bar.style.setProperty('--fill', `${Math.round((open.length / entries.length) * 100)}%`);
    head.addEventListener('click', () => {
      this.codexLockedOpen = !this.codexLockedOpen;
      this.refresh();
    });
    out.push(head, bar);
    if (this.codexLockedOpen) {
      for (const [dungeon, aspect] of locked.filter(([, a]) => codexVisible(a, null, false, this.codexCategory))) {
        const row = div('aspect-row codex-row aspect-compact locked', '');
        row.dataset.testid = `codex-${aspect}`;
        const icon = artUrl(`aspects/${aspect}`);
        if (icon) row.append(Object.assign(document.createElement('img'), { src: icon, alt: '', className: 'aspect-icon' }));
        row.append(div('aspect-name', t(`aspects.${aspect}.name`)), div('aspect-desc', t('crafting.codex.locked', { dungeon: t(`instances.names.${dungeon}`) })));
        out.push(row);
      }
    }
    return out;
  }

  /** B026: "Fits this item" (on by default, needs a selected item) and one slot group, in one row of chips. */
  private codexFilters(item: Item | null): HTMLElement {
    const bar = div('codex-filters inv-chips', '');
    bar.dataset.testid = 'codex-filters';
    bar.setAttribute('role', 'group');
    const fits = button(t('crafting.codex.fits'), () => {
      this.codexFits = !this.codexFits;
      this.refresh();
    });
    fits.className = 'inv-chip';
    fits.dataset.testid = 'codex-fits';
    fits.disabled = !item;
    fits.classList.toggle('on', this.codexFits && !!item);
    fits.setAttribute('aria-pressed', String(this.codexFits && !!item));
    bar.append(fits);
    for (const cat of ASPECT_CATEGORIES) {
      const b = button(t(`crafting.codex.cat.${cat}`), () => {
        this.codexCategory = this.codexCategory === cat ? null : cat;
        this.refresh();
      });
      b.className = 'inv-chip';
      b.dataset.testid = `codex-cat-${cat}`;
      b.classList.toggle('on', this.codexCategory === cat);
      b.setAttribute('aria-pressed', String(this.codexCategory === cat));
      bar.append(b);
    }
    return bar;
  }

  /** Desktop hover tooltip; touch screens use the item sheet instead (a tap also fires mouseenter). */
  private hover(cell: HTMLElement, item: Item, extra?: string): void {
    if (useSheet()) return;
    cell.addEventListener('mouseenter', () => {
      const tip = renderItemTooltip(item, this.actions.classId());
      if (extra) tip.appendChild(div('tooltip-price', extra));
      else if (this.kind === 'vendor') tip.appendChild(div('tooltip-price', t('services.vendor.sellFor', { gold: sellPrice(item) })));
      this.tooltip.replaceChildren(tip);
      this.tooltip.hidden = false;
      const rect = cell.getBoundingClientRect();
      if (placeTooltipForPortrait(this.tooltip, rect)) return;
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
  b.type = 'button';
  b.className = 'service-btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
