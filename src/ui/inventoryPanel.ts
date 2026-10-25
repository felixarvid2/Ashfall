/**
 * Inventory panel (I): equipment slots, gold and a Diablo 4-style backpack grid where every item takes one cell.
 * Desktop: hover shows a tooltip with comparison, right-click equips/unequips, Shift+click salvages, click a crystal
 * then an item to socket it. Touch: a tap opens the item sheet (src/ui/tooltipSheet.ts) with Equip, Salvage and
 * Socket buttons, so nothing needs a hold or a key; Select switches the grid to multi-select salvage.
 */
import type { Inventory } from '../core/components';
import { t } from '../data/i18n';
import { BASE_ITEMS, CRYSTAL_DEFS, rarityDef } from '../data/loot/db';
import { itemArtUrl, rarityFrameUrl } from './art';
import { SLOTS, slotsFor, type Item, type Slot } from '../data/loot/schemas';
import { canEquip, crystalSlotGroup, salvageValue } from '../systems/loot/generate';
import { salvagePreview } from '../systems/endgame/crafting';
import {
  FILTER_CHIPS,
  SORT_MODES,
  aspectStatus,
  bagFill,
  defaultTargetSlot,
  filterMatches,
  indexRange,
  isJunk,
  needsSalvageConfirm,
  otherSlot,
  setJunk,
  setLocked,
  textMatches,
  unlockedIndices,
  upgradeSign,
  type FilterChip,
  type SortMode,
} from './inventoryLogic';
import {
  formatStat,
  itemDisplayName,
  itemSearchText,
  placeTooltipForPortrait,
  renderItemSheet,
  renderItemTooltip,
  type CompareTarget,
  type Comparison,
} from './itemTooltip';
import { armConfirm, confirmSheet } from './confirmSheet';
import { haptic } from './haptics';
import { tooltipSheet, useSheet } from './tooltipSheet';
import { getPref, setPref } from '../core/localPrefs';

export interface InventoryActions {
  /** Equip the backpack item at `index`; `slot` picks one of two ring slots. */
  equip(index: number, slot?: Slot): void;
  unequip(slot: Slot): void;
  salvage(index: number): void;
  salvageMany(indices: number[]): void;
  /** Salvage every common and magic item. */
  salvageJunk(): void;
  sort(mode: SortMode): void;
  /** How many upgrades Equip best would make right now. */
  bestCount(): number;
  /** Wear the best gear from the bag (one toast, one save). */
  equipBest(): void;
  socket(crystalIndex: number, target: { grid: number } | { slot: Slot }): void;
  compare(item: Item, slot?: Slot): Comparison | null;
  iconUrl(iconId: string): string | null;
  /** A lock or junk mark changed (save soon). */
  marked?(): void;
  /** Short toast ("Locked", "Bag almost full"). */
  notify?(text: string): void;
  /** Aspect ids unlocked in the account's Codex of Power (tooltip status line, B017). */
  codex?(): readonly string[];
}

const SORT_KEY = 'ashfall.invSort';

function storedSort(): SortMode | null {
  const v = getPref(SORT_KEY);
  return SORT_MODES.find((m) => m === v) ?? null;
}

function storeSort(mode: SortMode): void {
  // Private mode: the choice just is not remembered.
  setPref(SORT_KEY, mode);
}

/** D09: " You also get 4 Lumen Dust." for the salvage confirmations; empty when the items give no materials. */
export function materialsLine(items: readonly Item[]): string {
  const dust = salvagePreview(items).lumen_dust;
  return dust > 0 ? ` ${t('items.bag.salvageMaterials', { n: dust, material: t('crafting.materials.lumen_dust') })}` : '';
}

/** The salvage button text: the gold, plus the materials when there are any. */
export function salvageLabel(gold: number, items: readonly Item[]): string {
  const dust = salvagePreview(items).lumen_dust;
  return dust > 0 ? t('items.bag.salvageWithMaterials', { gold, n: dust, material: t('crafting.materials.lumen_dust') }) : t('items.bag.salvage', { gold });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function hasFreeSocket(item: Item | null | undefined): item is Item {
  return !!item && !item.crystal && item.sockets.includes(null);
}

type Where = { grid: number } | { slot: Slot };

export class InventoryPanel {
  private readonly root: HTMLDivElement;
  private readonly doll: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly summary: HTMLSpanElement;
  private readonly goldText: HTMLSpanElement;
  private readonly countText: HTMLSpanElement;
  private readonly tooltip: HTMLDivElement;
  private readonly toolbar: HTMLDivElement;
  private readonly selectBtn: HTMLButtonElement;
  private readonly sortBtn: HTMLButtonElement;
  private readonly bestBtn: HTMLButtonElement;
  private readonly sortMenu: HTMLDivElement;
  private readonly chips: HTMLDivElement;
  private readonly banners: HTMLDivElement;
  private readonly tools: HTMLDivElement;
  /** Desktop: the bag-full warning sits in the tools row instead of a banner line, so the 4th bag row stays on screen at 720p (B001). */
  private fullInline: HTMLElement | null = null;
  private readonly selbar: HTMLDivElement;
  /** The equipped item shown beside the hovered one (B005). */
  private readonly tooltipEq: HTMLDivElement;
  private readonly helpBtn: HTMLButtonElement;
  private readonly helpTip: HTMLDivElement;
  private readonly searchBtn: HTMLButtonElement;
  private readonly searchRow: HTMLDivElement;
  private readonly searchInput: HTMLInputElement;
  private searchQuery = '';
  /** The item under the mouse, for the L key, the equipped tooltip and the doll highlight. */
  private hovered: { cell: HTMLElement; item: Item; equipped: boolean; where: Where } | null = null;
  private shiftDown = false;
  private lastFill: 'ok' | 'near' | 'full' = 'ok';
  /** Select mode drag (B016): the mouse is down and cells it enters are added or removed. */
  private dragMode: 'add' | 'remove' | null = null;
  private anchor: number | null = null;
  private suppressClick = false;
  private selectedCrystal: number | null = null;
  /** The cell whose sheet is open (touch). */
  private sheetFor: Where | null = null;
  private selectMode = false;
  private readonly selection = new Set<number>();
  private filter: FilterChip = 'all';
  /** Item uids the player has already seen in this panel; anything else gets a "new" dot. */
  private readonly seen = new Set<string>();
  private baselined = false;
  /** While a hub service is open, clicking a backpack item goes to it (sell, stash, select). */
  private gridClick: ((index: number) => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly getInventory: () => Inventory,
    private readonly getClassId: () => string,
    private readonly actions: InventoryActions,
  ) {
    this.root = el('div', 'inventory-panel panel');
    this.root.hidden = true;
    const title = el('h2', undefined, t('ui.inventory'));
    this.doll = el('div', 'inv-doll');
    // Gold and the capacity counter: they move into the panel header's right side once the stack has built it.
    this.summary = el('div', 'inv-gold');
    this.goldText = el('span', 'inv-gold-text');
    this.countText = el('span', 'inv-count');
    this.summary.append(this.goldText, this.countText);
    this.grid = el('div', 'inv-grid');

    this.sortBtn = button('inv-tool inv-sort-btn', t('items.bag.sort'), () => this.toggleSortMenu());
    this.sortBtn.setAttribute('aria-haspopup', 'true');
    this.sortBtn.setAttribute('aria-expanded', 'false');
    this.sortBtn.dataset.testid = 'inv-sort';
    this.sortMenu = el('div', 'inv-sort-menu');
    this.sortMenu.hidden = true;
    this.sortMenu.setAttribute('role', 'menu');
    this.selectBtn = button('inv-tool inv-select-btn', t('items.bag.select'), () => this.setSelectMode(!this.selectMode));
    this.selectBtn.dataset.testid = 'inv-select';
    this.bestBtn = button('inv-tool inv-best-btn', t('items.bag.best'), () => this.actions.equipBest());
    this.bestBtn.dataset.testid = 'inv-best';
    this.chips = el('div', 'inv-chips');
    this.chips.setAttribute('role', 'group');
    this.chips.setAttribute('aria-label', t('items.bag.filterLabel'));
    for (const chip of FILTER_CHIPS) {
      const b = button('inv-chip', t(`items.bag.filters.${chip}`), () => {
        this.filter = chip;
        this.refresh();
      });
      b.dataset.chip = chip;
      this.chips.appendChild(b);
    }
    this.searchBtn = button('inv-tool inv-search-btn', '/', () => this.openSearch());
    this.searchBtn.title = t('items.bag.search');
    this.searchBtn.setAttribute('aria-label', t('items.bag.search'));
    this.searchBtn.dataset.testid = 'inv-search-btn';
    this.searchRow = el('div', 'inv-search');
    this.searchRow.hidden = true;
    this.searchInput = el('input', 'inv-search-input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = t('items.bag.searchPlaceholder');
    this.searchInput.setAttribute('aria-label', t('items.bag.search'));
    this.searchInput.dataset.testid = 'inv-search';
    // Escape ends the search first (panelStack skips Escape from elements marked like this).
    this.searchInput.dataset.escLocal = '1';
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value;
      this.refresh();
    });
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeSearch();
      }
    });
    const searchClose = button('inv-search-close', '×', () => this.closeSearch());
    searchClose.setAttribute('aria-label', t('items.bag.searchClear'));
    this.searchRow.append(this.searchInput, searchClose);
    const tools = el('div', 'inv-tools');
    tools.append(this.sortBtn, this.selectBtn, this.bestBtn, this.searchBtn, this.sortMenu);
    this.tools = tools;
    this.toolbar = el('div', 'inv-toolbar');
    this.toolbar.append(tools, this.chips, this.searchRow);
    this.banners = el('div', 'inv-banners');
    this.selbar = el('div', 'inv-selbar');
    this.selbar.hidden = true;

    const hint = el('div', 'inv-hint');
    // The touch layout swaps in the phone wording (style.css shows one of the two).
    hint.append(el('span', 'hint-mouse', t('items.hint')), el('span', 'hint-touch', t('items.hintTouch')));
    this.root.append(title, this.doll, this.toolbar, this.banners, this.summary, this.grid, this.selbar, hint);
    this.tooltip = el('div', 'item-tooltip');
    this.tooltip.hidden = true;
    this.tooltipEq = el('div', 'item-tooltip item-tooltip-equipped');
    this.tooltipEq.hidden = true;
    this.helpBtn = button('inv-help', '?', () => undefined);
    this.helpBtn.setAttribute('aria-label', t('items.bag.help'));
    this.helpBtn.dataset.testid = 'inv-help';
    this.helpTip = el('div', 'item-tooltip inv-help-tip');
    this.helpTip.hidden = true;
    for (const key of ['equip', 'salvage', 'socket', 'lock', 'junk', 'shift']) this.helpTip.appendChild(el('div', undefined, t(`items.bag.helpLines.${key}`)));
    const showHelp = () => {
      if (useSheet()) return;
      this.helpTip.hidden = false;
      const rect = this.helpBtn.getBoundingClientRect();
      const w = this.helpTip.getBoundingClientRect().width;
      this.helpTip.style.left = `${Math.max(8, rect.right - w)}px`;
      this.helpTip.style.top = `${rect.bottom + 6}px`;
    };
    this.helpBtn.addEventListener('mouseenter', showHelp);
    this.helpBtn.addEventListener('focus', showHelp);
    this.helpBtn.addEventListener('mouseleave', () => (this.helpTip.hidden = true));
    this.helpBtn.addEventListener('blur', () => (this.helpTip.hidden = true));
    parent.append(this.root, this.tooltip, this.tooltipEq, this.helpTip);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => this.onKey(e, true));
    document.addEventListener('keyup', (e) => this.onKey(e, false));
    const endDrag = () => {
      this.dragMode = null;
      // The click that follows a mouse-up still has to be ignored; the next task is clear of it.
      setTimeout(() => (this.suppressClick = false), 0);
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', () => {
      this.shiftDown = false;
      endDrag();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.sortMenu.hidden && !(e.target as HTMLElement | null)?.closest('.inv-tools')) this.toggleSortMenu(false);
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setGridClick(fn: ((index: number) => void) | null): void {
    this.gridClick = fn;
    if (fn) this.setSelectMode(false);
  }

  toggle(force?: boolean): void {
    const was = this.open;
    this.root.hidden = force === undefined ? !this.root.hidden : !force;
    this.selectedCrystal = null;
    this.selectMode = false;
    this.selection.clear();
    this.sheetFor = null;
    this.hovered = null;
    this.hideTooltip();
    tooltipSheet.hide();
    this.toggleSortMenu(false);
    this.closeSearch();
    this.anchor = null;
    if (this.open) {
      // The first time the bag opens, everything in it counts as seen; later arrivals get the "new" dot.
      if (!this.baselined) {
        this.markSeen();
        this.baselined = true;
      }
      this.refresh();
    } else if (was) this.markSeen();
  }

  private markSeen(): void {
    const inv = this.getInventory();
    for (const item of [...inv.grid, ...Object.values(inv.equipped)]) if (item) this.seen.add(item.uid);
  }

  private setSelectMode(on: boolean): void {
    if (this.selectMode === on) return;
    this.selectMode = on;
    this.selection.clear();
    this.anchor = null;
    this.selectedCrystal = null;
    if (on) tooltipSheet.hide();
    this.refresh();
  }

  private toggleSortMenu(force?: boolean): void {
    const open = force ?? this.sortMenu.hidden;
    this.sortMenu.hidden = !open;
    this.sortBtn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const current = storedSort();
    this.sortMenu.replaceChildren(
      ...SORT_MODES.map((mode) => {
        const b = button('inv-sort-option', t(`items.bag.sortBy.${mode}`), () => {
          storeSort(mode);
          this.toggleSortMenu(false);
          haptic('tap');
          this.actions.sort(mode);
        });
        b.setAttribute('role', 'menuitem');
        b.dataset.mode = mode;
        b.classList.toggle('on', mode === current);
        return b;
      }),
    );
  }

  refresh(): void {
    // The "almost full" toast fires from pickups too, so the bag fill is watched even while the panel is closed (B014).
    const bag = this.getInventory();
    const bagUsed = bag.grid.filter((i) => i !== null).length;
    const fillNow = bagFill(bagUsed, bag.grid.length);
    if (fillNow === 'near' && this.lastFill === 'ok') this.actions.notify?.(t('items.bag.nearFull'));
    this.lastFill = fillNow;
    if (!this.open) return;
    const inv = bag;
    const used = bagUsed;
    this.goldText.textContent = t('ui.gold', { gold: inv.gold.toLocaleString('en-US') });
    this.countText.textContent = t('items.bag.count', { used, max: inv.grid.length });
    this.countText.classList.toggle('full', fillNow === 'full');
    this.countText.classList.toggle('near', fillNow === 'near');
    // Gold and capacity sit in the shared header when the panel stack gave the panel one and the screen is wide
    // enough for the title to stay on one line; on a very narrow screen they get their own line above the grid.
    const extra = this.root.querySelector('.panel-header-extra');
    const textScale = (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 15) / 15;
    const inHeader = !!extra && window.innerWidth / textScale >= 380;
    if (inHeader && this.summary.parentElement !== extra) extra.prepend(this.summary);
    else if (!inHeader && this.summary.parentElement !== this.root) this.grid.before(this.summary);
    // The key hints button sits in the header next to the close button (desktop; the phone layout hides it).
    if (extra && this.helpBtn.parentElement !== extra) extra.append(this.helpBtn);

    this.root.classList.toggle('select-mode', this.selectMode);
    this.root.classList.toggle('socket-mode', this.selectedCrystal !== null);
    this.selectBtn.classList.toggle('on', this.selectMode);
    this.selectBtn.setAttribute('aria-pressed', String(this.selectMode));
    this.selectBtn.textContent = this.selectMode ? t('items.bag.selectDone') : t('items.bag.select');
    this.selectBtn.hidden = !!this.gridClick;
    // Equip best: the number of upgrades is counted here, on every data change (this refresh), never on a timer.
    const upgrades = this.gridClick ? 0 : this.actions.bestCount();
    this.bestBtn.hidden = !!this.gridClick;
    this.bestBtn.disabled = upgrades === 0;
    this.bestBtn.textContent = upgrades > 0 ? t('items.bag.bestCount', { n: upgrades }) : t('items.bag.best');
    this.bestBtn.title = upgrades === 0 ? t('items.bag.bestNone') : upgrades === 1 ? t('items.bag.bestTitleOne') : t('items.bag.bestTitle', { n: upgrades });
    this.bestBtn.setAttribute('aria-label', this.bestBtn.title);
    for (const b of this.chips.querySelectorAll<HTMLElement>('.inv-chip')) {
      b.classList.toggle('on', b.dataset.chip === this.filter);
      b.setAttribute('aria-pressed', String(b.dataset.chip === this.filter));
    }

    // Is a backpack item better or worse than what is worn? One comparison per gear item per refresh.
    const sign = new Map<number, number>();
    inv.grid.forEach((item, index) => {
      if (!item || item.crystal) return;
      const base = BASE_ITEMS.get(item.base);
      if (!base || slotsFor(base.type).length === 0) return;
      const cmp = this.actions.compare(item);
      if (cmp) sign.set(index, upgradeSign(cmp));
    });

    this.doll.replaceChildren(
      ...SLOTS.map((slot) => {
        const item = inv.equipped[slot] ?? null;
        const cell = this.cell(item, t(`items.slots.${slot}`));
        cell.dataset.slot = slot;
        cell.classList.add('slot-cell');
        if (item) this.decorate(cell, item, { power: true });
        cell.addEventListener('contextmenu', () => this.actions.unequip(slot));
        cell.addEventListener('click', () => this.onDollClick(slot, item));
        if (item) this.hover(cell, item, true, { slot });
        if (this.selectedCrystal !== null) this.markSocketTarget(cell, item);
        if (this.sheetFor && 'slot' in this.sheetFor && this.sheetFor.slot === slot) cell.classList.add('selected');
        return cell;
      }),
    );

    const query = this.searchQuery.trim();
    const search = query ? (it: Item) => textMatches(itemSearchText(it), query) : undefined;
    this.grid.replaceChildren(
      ...inv.grid.map((item, index) => {
        const cell = this.cell(item);
        cell.dataset.index = String(index);
        const better = (sign.get(index) ?? 0) > 0;
        if (index === this.selectedCrystal) cell.classList.add('selected');
        if (this.sheetFor && 'grid' in this.sheetFor && this.sheetFor.grid === index) cell.classList.add('selected');
        if (item) {
          this.decorate(cell, item, { power: !item.crystal, sign: sign.get(index), isNew: this.baselined && !this.seen.has(item.uid), check: this.selectMode ? this.selection.has(index) : undefined });
          cell.setAttribute('role', 'button');
          cell.setAttribute('aria-label', itemDisplayName(item));
        }
        if (this.selection.has(index)) cell.classList.add('picked');
        if (!filterMatches(item, this.filter, better, search)) cell.classList.add('filtered-out');
        if (this.selectedCrystal !== null) this.markSocketTarget(cell, item, index === this.selectedCrystal);
        cell.addEventListener('contextmenu', (e) => {
          if (!item || item.crystal || this.selectMode) return;
          // Shift+right-click: the other ring slot (B011).
          const base = BASE_ITEMS.get(item.base);
          const other = e.shiftKey && base ? otherSlot(slotsFor(base.type), this.getInventory().equipped, (s) => this.actions.compare(item, s)) : undefined;
          if (other) this.actions.equip(index, other);
          else this.actions.equip(index);
        });
        cell.addEventListener('click', (e) => this.onGridClick(e, index, item));
        cell.addEventListener('pointerdown', (e) => this.onSelectPointerDown(e, index, item));
        cell.addEventListener('pointerenter', (e) => {
          if (this.dragMode && this.selectMode && e.pointerType === 'mouse') this.dragSelect(index);
        });
        if (item) this.hover(cell, item, false, { grid: index });
        return cell;
      }),
    );

    this.renderBanners(inv, used);
    this.renderSelbar(inv);
    this.rehover();
  }

  // ---- Marks, search, keys (UI audit B002, B003, B015) ------------------------------------------------------

  private toast(text: string): void {
    this.actions.notify?.(text);
  }

  private toggleLock(item: Item): void {
    setLocked(item, !item.locked);
    haptic('tick');
    this.actions.marked?.();
    this.refresh();
  }

  private toggleJunk(item: Item): void {
    setJunk(item, !item.junk);
    haptic('tick');
    this.toast(t(item.junk ? 'items.bag.junkMarked' : 'items.bag.junkUnmarked'));
    this.actions.marked?.();
    this.refresh();
  }

  openSearch(): void {
    if (!this.open || useSheet()) return;
    this.searchRow.hidden = false;
    this.chips.hidden = true;
    this.searchInput.focus({ preventScroll: true });
    this.searchInput.select();
  }

  closeSearch(): void {
    const had = this.searchQuery !== '' || !this.searchRow.hidden;
    this.searchQuery = '';
    this.searchInput.value = '';
    this.searchRow.hidden = true;
    this.chips.hidden = false;
    if (had && this.open) this.refresh();
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.key === 'Shift') {
      if (this.shiftDown === down) return;
      this.shiftDown = down;
      // Holding Shift hides the equipped item beside the hovered one (B005).
      if (this.hovered) this.placeEquipped();
      return;
    }
    if (!down || !this.open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === '/' && !useSheet()) {
      e.preventDefault();
      this.openSearch();
    } else if ((e.key === 'l' || e.key === 'L') && this.hovered && !useSheet()) {
      this.toggleLock(this.hovered.item);
    }
  }

  private cell(item: Item | null, emptyLabel = ''): HTMLDivElement {
    return renderItemCell(item, (id) => this.actions.iconUrl(id), emptyLabel);
  }

  /** Corner badges (P050): item power, upgrade arrow, "new" dot, selection check. */
  private decorate(cell: HTMLElement, item: Item, o: { power?: boolean; sign?: number; isNew?: boolean; check?: boolean }): void {
    if (o.power && !item.crystal) cell.appendChild(el('span', 'cell-power', String(item.itemPower)));
    if (o.sign) {
      const up = o.sign > 0;
      const arrow = el('span', `cell-arrow ${up ? 'up' : 'down'}`, up ? '▲' : '▼');
      arrow.setAttribute('role', 'img');
      arrow.setAttribute('aria-label', t(up ? 'items.bag.better' : 'items.bag.worse'));
      cell.appendChild(arrow);
    }
    if (o.isNew) {
      const dot = el('span', 'cell-new');
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', t('items.bag.new'));
      cell.appendChild(dot);
    }
    if (o.check !== undefined) cell.appendChild(el('span', `cell-check${o.check ? ' on' : ''}`, o.check ? '✓' : ''));
  }

  /** With a crystal picked: cells with a free socket pulse, the rest fade (P052). */
  private markSocketTarget(cell: HTMLElement, item: Item | null, isCrystal = false): void {
    if (isCrystal) return;
    cell.classList.add(hasFreeSocket(item) ? 'can-socket' : 'no-socket');
  }

  private onDollClick(slot: Slot, item: Item | null): void {
    if (!item) return;
    if (this.selectedCrystal !== null) {
      if (!hasFreeSocket(item)) return;
      if (useSheet()) this.openSocketPreview(item, { slot });
      else {
        this.actions.socket(this.selectedCrystal, { slot });
        this.selectedCrystal = null;
      }
      return;
    }
    if (useSheet()) this.openItemSheet(item, { slot });
  }

  /** Select mode with a mouse: pressing a cell starts a drag that adds (or removes) every cell it enters (B016). */
  private onSelectPointerDown(e: PointerEvent, index: number, item: Item | null): void {
    if (!this.selectMode || this.gridClick || !item || e.pointerType !== 'mouse' || e.button !== 0) return;
    this.suppressClick = true;
    if (e.shiftKey && this.anchor !== null) {
      for (const i of indexRange(this.anchor, index)) this.selectCell(i, true);
    } else {
      this.dragMode = this.selection.has(index) ? 'remove' : 'add';
      this.selectCell(index, this.dragMode === 'add', true);
    }
    this.anchor = index;
    this.paintSelection();
  }

  private dragSelect(index: number): void {
    if (!this.dragMode) return;
    this.selectCell(index, this.dragMode === 'add');
    this.paintSelection();
  }

  /** Add or remove one cell from the selection; locked items are never selected (a toast says so once per press). */
  private selectCell(index: number, on: boolean, announce = false): void {
    const item = this.getInventory().grid[index];
    if (!item) return;
    if (on && item.locked) {
      if (announce) this.toast(t('items.bag.lockedToast'));
      return;
    }
    if (on) this.selection.add(index);
    else this.selection.delete(index);
  }

  /** Update the picked marks and the select bar without rebuilding the cells (a drag must keep its cells). */
  private paintSelection(): void {
    this.grid.querySelectorAll<HTMLElement>('.inv-cell').forEach((cell) => {
      const picked = this.selection.has(Number(cell.dataset.index));
      cell.classList.toggle('picked', picked);
      const check = cell.querySelector('.cell-check');
      if (check) {
        check.classList.toggle('on', picked);
        check.textContent = picked ? '✓' : '';
      }
    });
    this.renderSelbar(this.getInventory());
  }

  private onGridClick(e: MouseEvent, index: number, item: Item | null): void {
    if (!item) return;
    const touch = useSheet();
    // Alt+click marks or unmarks junk (B003).
    if (!touch && e.altKey && !this.selectMode) {
      this.toggleJunk(item);
      return;
    }
    if (this.gridClick) {
      this.gridClick(index);
      this.hideTooltip();
      return;
    }
    if (this.selectMode) {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      if (this.selection.has(index)) this.selection.delete(index);
      else this.selectCell(index, true, true);
      this.anchor = index;
      haptic('tick');
      this.refresh();
      return;
    }
    if (!touch && e.shiftKey) {
      this.hideTooltip();
      if (item.locked) {
        this.toast(t('items.bag.lockedToast'));
        return;
      }
      if (!needsSalvageConfirm(item)) {
        this.actions.salvage(index);
        return;
      }
      // Rare and better ask first, like the touch sheet does (B004).
      const gold = salvageValue(item);
      void confirmSheet({
        title: t('items.bag.salvageOneTitle', { name: itemDisplayName(item) }),
        body: t('items.bag.salvageOneBody', { gold }) + materialsLine([item]),
        confirmLabel: t('items.bag.salvageButton'),
        danger: true,
      }).then((ok) => {
        if (ok && this.getInventory().grid[index] === item && !item.locked) this.actions.salvage(index);
      });
      return;
    }
    if (this.selectedCrystal !== null) {
      if (index === this.selectedCrystal) {
        this.selectedCrystal = null;
        this.refresh();
        return;
      }
      if (touch) {
        if (hasFreeSocket(item)) this.openSocketPreview(item, { grid: index });
        return;
      }
      this.actions.socket(this.selectedCrystal, { grid: index });
      this.selectedCrystal = null;
      return;
    }
    if (touch) {
      haptic('select');
      this.openItemSheet(item, { grid: index });
      return;
    }
    if (item.crystal) {
      this.selectedCrystal = this.selectedCrystal === index ? null : index;
      this.refresh();
    }
  }

  // ---- The item sheet (touch) --------------------------------------------------------------------------

  private slotLabel(slot: Slot, slots: Slot[]): string {
    return slots.length > 1 ? `${t(`items.slots.${slot}`)} ${slots.indexOf(slot) + 1}` : t(`items.slots.${slot}`);
  }

  private showSheet(where: Where, content: HTMLElement, actions: Parameters<typeof tooltipSheet.show>[0]['actions']): void {
    this.sheetFor = where;
    this.markSelected(where);
    tooltipSheet.show({
      content,
      actions,
      onClose: () => {
        if (this.sheetFor === where) this.sheetFor = null;
        for (const c of this.root.querySelectorAll('.inv-cell.selected')) {
          if (!('grid' in where) || (c as HTMLElement).dataset.index === String(where.grid)) {
            if (this.selectedCrystal === null || (c as HTMLElement).dataset.index !== String(this.selectedCrystal)) c.classList.remove('selected');
          }
        }
      },
    });
  }

  private markSelected(where: Where): void {
    const cells = 'grid' in where ? this.grid.querySelectorAll('.inv-cell') : this.doll.querySelectorAll('.inv-cell');
    for (const c of this.root.querySelectorAll('.inv-cell.selected')) {
      if ((c as HTMLElement).dataset.index !== String(this.selectedCrystal)) c.classList.remove('selected');
    }
    const target = 'grid' in where ? cells[where.grid] : this.doll.querySelector(`[data-slot='${where.slot}']`);
    target?.classList.add('selected');
  }

  private openItemSheet(item: Item, where: Where): void {
    const inv = this.getInventory();
    const classId = this.getClassId();
    const base = BASE_ITEMS.get(item.base);
    const isGrid = 'grid' in where;
    const slots = base ? slotsFor(base.type) : [];
    const targets: CompareTarget[] =
      isGrid && !item.crystal
        ? slots.map((slot) => ({
            slot,
            label: this.slotLabel(slot, slots),
            equipped: inv.equipped[slot] ?? null,
            comparison: this.actions.compare(item, slot),
          }))
        : [];
    const defaultSlot = defaultTargetSlot(slots, inv.equipped, (s) => this.actions.compare(item, s));
    const content = renderItemSheet(item, classId, { equipped: !isGrid, targets, defaultSlot });
    const buttons: NonNullable<Parameters<typeof tooltipSheet.show>[0]['actions']> = [];

    if (!isGrid) {
      buttons.push({ label: t('items.bag.unequip'), primary: true, onClick: () => this.actions.unequip(where.slot) });
    } else if (item.crystal) {
      const any = this.anySocketTarget();
      buttons.push({
        label: t('items.bag.socketInto'),
        primary: true,
        disabled: !any,
        onClick: () => {
          this.selectedCrystal = where.grid;
          this.refresh();
        },
      });
    } else if (base && slots.length > 0) {
      if (!canEquip(base, classId)) buttons.push({ label: t('items.bag.cannotEquip'), disabled: true, onClick: () => undefined });
      else if (slots.length === 1) buttons.push({ label: t('items.bag.equip'), primary: true, onClick: () => this.actions.equip(where.grid) });
      else {
        for (const slot of slots) {
          const worn = inv.equipped[slot];
          buttons.push({
            label: worn
              ? t('items.bag.equipSlot', { slot: this.slotLabel(slot, slots), item: itemDisplayName(worn) })
              : t('items.bag.equipSlotEmpty', { slot: this.slotLabel(slot, slots) }),
            primary: slot === defaultSlot,
            onClick: () => this.actions.equip(where.grid, slot),
          });
        }
      }
    }
    if (isGrid) {
      const gold = salvageValue(item);
      const confirm = needsSalvageConfirm(item);
      buttons.push({
        label: item.locked ? t('items.bag.locked') : salvageLabel(gold, [item]),
        danger: true,
        disabled: !!item.locked,
        keepOpen: confirm,
        onClick: () => {
          if (!confirm) {
            this.actions.salvage(where.grid);
            return;
          }
          void confirmSheet({
            title: t('items.bag.salvageOneTitle', { name: itemDisplayName(item) }),
            body: t('items.bag.salvageOneBody', { gold }) + materialsLine([item]),
            confirmLabel: t('items.bag.salvageButton'),
            danger: true,
          }).then((ok) => {
            if (!ok) return;
            tooltipSheet.hide();
            this.actions.salvage(where.grid);
          });
        },
      });
    }
    if (!item.crystal || isGrid) {
      buttons.push({ label: t(item.locked ? 'items.bag.unlock' : 'items.bag.lock'), onClick: () => this.toggleLock(item) });
    }
    this.showSheet(where, content, buttons);
  }

  private anySocketTarget(): boolean {
    const inv = this.getInventory();
    return inv.grid.some(hasFreeSocket) || Object.values(inv.equipped).some(hasFreeSocket);
  }

  /** The crystal picked, a target tapped: show what the socket would add before it is spent (P052). */
  private openSocketPreview(item: Item, where: Where): void {
    const inv = this.getInventory();
    const crystalIndex = this.selectedCrystal;
    const crystal = crystalIndex === null ? null : inv.grid[crystalIndex];
    const base = BASE_ITEMS.get(item.base);
    const def = crystal?.crystal ? CRYSTAL_DEFS.get(crystal.crystal.id) : undefined;
    if (!crystal?.crystal || !def || !base || crystalIndex === null) return;
    const group = crystalSlotGroup(base.type);
    const stat = formatStat(def[group].stat, def[group].values[crystal.crystal.tier] ?? 0);
    const note = el('div', 'item-sheet-socket-note', t('items.bag.socketPreview', { stat }));
    note.style.color = def.color;
    const content = renderItemSheet(item, this.getClassId(), { equipped: 'slot' in where, extra: [note] });
    this.showSheet(where, content, [
      {
        label: t('items.bag.socketAction'),
        primary: true,
        onClick: () => {
          this.actions.socket(crystalIndex, where);
          this.selectedCrystal = null;
        },
      },
    ]);
  }

  // ---- Banners and the multi-select bar ----------------------------------------------------------------

  private renderBanners(inv: Inventory, used: number): void {
    const out: HTMLElement[] = [];
    if (this.selectedCrystal !== null) {
      const crystal = inv.grid[this.selectedCrystal];
      const def = crystal?.crystal ? CRYSTAL_DEFS.get(crystal.crystal.id) : undefined;
      if (crystal?.crystal && def) {
        const groups = (['weapon', 'armor', 'jewelry'] as const).map((g) => ({
          group: g,
          stat: formatStat(def[g].stat, def[g].values[crystal.crystal!.tier] ?? 0),
        }));
        const bonus = groups.map((g) => `${t(`items.crystalWhere.${g.group}`)} ${g.stat}`).join(' · ');
        const banner = el('div', 'inv-banner socket');
        banner.dataset.testid = 'socket-banner';
        // Phones read the long sentence; the desktop banner is one row: name, three chips, Cancel (B012).
        const chips = el('span', 'inv-banner-chips');
        for (const g of groups) {
          const chip = el('span', 'inv-banner-chip', `${t(`items.crystalWhereShort.${g.group}`)} ${g.stat}`);
          chip.title = `${t(`items.crystalWhere.${g.group}`)} ${g.stat}`;
          chips.appendChild(chip);
        }
        banner.append(
          el('span', 'inv-banner-text', t('items.bag.socketBanner', { crystal: itemDisplayName(crystal), bonus })),
          el('span', 'inv-banner-name', itemDisplayName(crystal)),
          chips,
          button('inv-banner-btn', t('items.bag.socketCancel'), () => {
            this.selectedCrystal = null;
            this.refresh();
          }),
        );
        out.push(banner);
      }
    }
    const full = used >= inv.grid.length;
    const junkItems = inv.grid.filter((i): i is Item => isJunk(i));
    const junk = junkItems.reduce((sum, i) => sum + salvageValue(i), 0);
    this.fullInline?.remove();
    this.fullInline = null;
    if (full) {
      const banner = el('div', 'inv-banner full');
      banner.dataset.testid = 'bag-full';
      banner.appendChild(el('span', 'inv-banner-text', t('items.bag.full')));
      if (junk > 0) {
        // Two taps: the first arms the button, the second (within 3 s) runs it.
        // On desktop the warning shares the tools row with Equip best, so its button gets the short wording.
        const inline = !document.getElementById('ui')?.classList.contains('touch-ui');
        const b = button('inv-banner-btn', t(inline ? 'items.bag.salvageJunkShort' : 'items.bag.salvageJunk', { gold: junk }), () => undefined);
        armConfirm(b, { armedLabel: t(inline ? 'items.bag.salvageJunkArmedShort' : 'items.bag.salvageJunkArmed', { gold: junk }), run: () => this.actions.salvageJunk() });
        b.title = t('items.bag.salvageJunk', { gold: junk });
        banner.appendChild(b);
      }
      if (document.getElementById('ui')?.classList.contains('touch-ui')) out.push(banner);
      else {
        banner.classList.add('inline');
        this.tools.after(banner);
        this.fullInline = banner;
      }
    }
    this.banners.replaceChildren(...out);
    this.banners.hidden = out.length === 0;
  }

  private renderSelbar(inv: Inventory): void {
    this.selbar.hidden = !this.selectMode;
    if (!this.selectMode) return;
    const items = unlockedIndices(inv.grid, this.selection).map((i) => inv.grid[i]).filter((i): i is Item => !!i);
    const gold = items.reduce((sum, i) => sum + salvageValue(i), 0);
    const label =
      items.length === 0
        ? t('items.bag.selectPrompt')
        : t(items.length === 1 ? 'items.bag.selectedOne' : 'items.bag.selectedBar', { n: items.length, gold });
    const run = el('button', 'inv-selbar-btn', label);
    run.type = 'button';
    run.disabled = items.length === 0;
    run.dataset.testid = 'inv-salvage-selected';
    run.addEventListener('click', () => {
      const indices = unlockedIndices(inv.grid, this.selection);
      const doIt = () => {
        this.selection.clear();
        this.selectMode = false;
        this.actions.salvageMany(indices);
      };
      if (!items.some(needsSalvageConfirm)) {
        doIt();
        return;
      }
      void confirmSheet({
        title: t('items.bag.salvageManyTitle', { n: items.length }),
        body: t('items.bag.salvageManyBody', { gold }) + materialsLine(items),
        confirmLabel: t('items.bag.salvageButton'),
        danger: true,
      }).then((ok) => {
        if (ok) doIt();
      });
    });
    this.selbar.replaceChildren(run);
  }

  // ---- Desktop hover tooltip ---------------------------------------------------------------------------

  private hover(cell: HTMLElement, item: Item, equipped: boolean, where: Where): void {
    cell.addEventListener('mouseenter', () => {
      // Touch screens fire a mouseenter on tap; the item sheet is their tooltip.
      if (useSheet()) return;
      this.hovered = { cell, item, equipped, where };
      this.showTooltip();
    });
    cell.addEventListener('mouseleave', () => {
      if (this.hovered?.cell === cell) this.hovered = null;
      this.hideTooltip();
    });
  }

  /** The cells were rebuilt under a resting mouse: point the hover state and tooltips at the new cell. */
  private rehover(): void {
    const h = this.hovered;
    if (!h) return;
    const cell = 'grid' in h.where ? this.grid.children[h.where.grid] : this.doll.querySelector(`[data-slot='${h.where.slot}']`);
    const inv = this.getInventory();
    const item = 'grid' in h.where ? inv.grid[h.where.grid] : inv.equipped[h.where.slot];
    if (!(cell instanceof HTMLElement) || !item || item.uid !== h.item.uid) {
      this.hovered = null;
      this.hideTooltip();
      return;
    }
    this.hovered = { ...h, cell, item };
    this.showTooltip();
  }

  private showTooltip(): void {
    const h = this.hovered;
    if (!h) return;
    const { cell, item, equipped } = h;
    const inv = this.getInventory();
    const classId = this.getClassId();
    const base = BASE_ITEMS.get(item.base);
    const slots = !item.crystal && base ? slotsFor(base.type) : [];
    const comparable = !equipped && slots.length > 0;
    const defaultSlot = comparable ? defaultTargetSlot(slots, inv.equipped, (s) => this.actions.compare(item, s)) : undefined;
    const targets: CompareTarget[] = comparable
      ? slots.map((slot) => ({
          slot,
          label: this.slotLabel(slot, slots),
          equipped: inv.equipped[slot] ?? null,
          comparison: this.actions.compare(item, slot),
        }))
      : [];
    const tip = renderItemTooltip(item, classId, {
      equipped,
      targets,
      defaultSlot,
      ranges: true,
      aspectStatus: item.aspect && !item.unique ? aspectStatus(item.aspect.id, inv.aspects ?? [], this.actions.codex?.() ?? []) : undefined,
      hints: comparable && slots.length > 1 ? [t('items.otherRingHint')] : undefined,
    });
    this.tooltip.replaceChildren(tip);
    this.tooltip.hidden = false;
    const rect = cell.getBoundingClientRect();
    if (placeTooltipForPortrait(this.tooltip, rect)) {
      this.tooltipEq.hidden = true;
      return;
    }
    const tipRect = this.tooltip.getBoundingClientRect();
    let left = rect.left - tipRect.width - 10;
    if (left < 8) left = rect.right + 10;
    const top = Math.max(8, Math.min(window.innerHeight - tipRect.height - 8, rect.top - 20));
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;

    // The worn item in the default slot, beside the hovered one (B005); the doll slot it replaces is outlined (B010).
    const worn = defaultSlot ? inv.equipped[defaultSlot] : undefined;
    this.tooltipEq.replaceChildren(...(worn ? [renderItemTooltip(worn, classId, { equipped: true, ranges: true })] : []));
    this.placeEquipped();
    this.markDollTargets(comparable ? slots : []);
  }

  /** Put the equipped tooltip left of the main one (else right of it); hidden when Shift is held or there is no room. */
  private placeEquipped(): void {
    const eq = this.tooltipEq;
    if (this.tooltip.hidden || !this.hovered || this.shiftDown || eq.childElementCount === 0) {
      eq.hidden = true;
      return;
    }
    eq.hidden = false;
    const main = this.tooltip.getBoundingClientRect();
    const w = eq.getBoundingClientRect().width;
    let left = main.left - w - 10;
    if (left < 8) left = main.right + 10;
    // No room left of the tooltip: right of it, unless that lands on the inventory panel or off screen.
    const panel = this.root.getBoundingClientRect();
    if (left + w > window.innerWidth - 8 || (left >= main.right && left + w > panel.left && !this.root.hidden)) {
      eq.hidden = true;
      return;
    }
    const h = eq.getBoundingClientRect().height;
    eq.style.left = `${left}px`;
    eq.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, main.top))}px`;
  }

  /** Outline the doll slots a hovered bag item would go to (B010). */
  private markDollTargets(slots: readonly Slot[]): void {
    for (const c of this.doll.querySelectorAll('.compare-target')) c.classList.remove('compare-target');
    for (const slot of slots) this.doll.querySelector(`[data-slot='${slot}']`)?.classList.add('compare-target');
  }

  private hideTooltip(): void {
    this.tooltip.hidden = true;
    this.tooltipEq.hidden = true;
    this.markDollTargets([]);
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
  const url = itemArtUrl(item) ?? iconUrl(iconId);
  const frame = rarityFrameUrl(item);
  if (frame) cell.appendChild(Object.assign(document.createElement('img'), { src: frame, alt: '', draggable: false, className: 'rarity-frame' }));
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
  // Lock and junk marks are small corner glyphs inside the cell (B002, B003): the cell keeps its size.
  if (item.locked) {
    cell.classList.add('locked');
    const lock = Object.assign(document.createElement('span'), { className: 'cell-lock', title: t('items.bag.locked') });
    lock.setAttribute('role', 'img');
    lock.setAttribute('aria-label', t('items.bag.locked'));
    cell.appendChild(lock);
  } else if (item.junk) {
    cell.classList.add('junk');
    const slash = Object.assign(document.createElement('span'), { className: 'cell-junk', title: t('items.junkLine') });
    slash.setAttribute('role', 'img');
    slash.setAttribute('aria-label', t('items.junkLine'));
    cell.appendChild(slash);
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
