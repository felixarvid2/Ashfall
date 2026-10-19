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
import { CODEX_ASPECTS, MASTERWORK, RECIPE_DEFS, TEMPERING, type RecipeOption } from '../data/endgame/crafting';
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
import { powerScale, roundStat, salvageValue } from '../systems/loot/generate';
import { renderItemCell } from './inventoryPanel';
import { artUrl } from './art';
import { aspectText, formatStat, itemDisplayName, placeTooltipForPortrait, renderItemTooltip } from './itemTooltip';
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
  buy(index: number): void;
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

/** The common and magic items of a backpack grid ("junk") with their grid index and total salvage gold. */
export function junkSummary(grid: readonly (Item | null)[]): { items: { index: number; item: Item }[]; gold: number } {
  const items: { index: number; item: Item }[] = [];
  grid.forEach((item, index) => {
    if (item && !item.crystal && (item.rarity === 'common' || item.rarity === 'magic')) items.push({ index, item });
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
    return [div('inv-hint', touchText('services.vendor.hint')), grid];
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
    const grid = div('inv-grid service-grid stash-grid', '');
    slots.forEach((item, i) => {
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
    out.push(store, div('inv-hint', touchText('services.stash.hint')));
    return out;
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
      summary.textContent = t(taken.length === 1 ? 'services.blacksmith.salvageSummaryOne' : 'services.blacksmith.salvageSummary', {
        n: taken.length,
        gold: taken.reduce((sum, e) => sum + salvageValue(e.item), 0).toLocaleString('en-US'),
      });
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
    const entries = Object.entries(CODEX_ASPECTS);
    const open = entries.filter(([, aspect]) => eg.codex.includes(aspect));
    const locked = entries.filter(([, aspect]) => !eg.codex.includes(aspect));
    const out: HTMLElement[] = [div('service-sep', ''), div('service-sub', t('crafting.codex.title', { n: open.length, total: entries.length })), div('service-note', t('crafting.codex.hint'))];
    for (const [, aspect] of open) {
      const row = div('aspect-row codex-row', '');
      row.dataset.testid = `codex-${aspect}`;
      const icon = artUrl(`aspects/${aspect}`);
      if (icon) row.append(Object.assign(document.createElement('img'), { src: icon, alt: '', className: 'aspect-icon' }));
      row.append(div('aspect-name', t(`aspects.${aspect}.name`)));
      const preview = this.actions.codexValue(aspect, item?.itemPower ?? 100);
      row.append(div('aspect-desc', aspectText(aspect, preview)));
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
      for (const [dungeon, aspect] of locked) {
        const row = div('aspect-row codex-row locked', '');
        row.dataset.testid = `codex-${aspect}`;
        const icon = artUrl(`aspects/${aspect}`);
        if (icon) row.append(Object.assign(document.createElement('img'), { src: icon, alt: '', className: 'aspect-icon' }));
        row.append(div('aspect-name', t(`aspects.${aspect}.name`)), div('aspect-desc', t('crafting.codex.locked', { dungeon: t(`instances.names.${dungeon}`) })));
        out.push(row);
      }
    }
    return out;
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
