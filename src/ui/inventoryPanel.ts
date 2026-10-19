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
import {
  FILTER_CHIPS,
  SORT_MODES,
  defaultTargetSlot,
  filterMatches,
  needsSalvageConfirm,
  upgradeSign,
  type FilterChip,
  type SortMode,
} from './inventoryLogic';
import {
  formatStat,
  itemDisplayName,
  placeTooltipForPortrait,
  renderItemSheet,
  renderItemTooltip,
  type CompareTarget,
  type Comparison,
} from './itemTooltip';
import { armConfirm, confirmSheet } from './confirmSheet';
import { haptic } from './haptics';
import { tooltipSheet, useSheet } from './tooltipSheet';

export interface InventoryActions {
  /** Equip the backpack item at `index`; `slot` picks one of two ring slots. */
  equip(index: number, slot?: Slot): void;
  unequip(slot: Slot): void;
  salvage(index: number): void;
  salvageMany(indices: number[]): void;
  /** Salvage every common and magic item. */
  salvageJunk(): void;
  sort(mode: SortMode): void;
  socket(crystalIndex: number, target: { grid: number } | { slot: Slot }): void;
  compare(item: Item, slot?: Slot): Comparison | null;
  iconUrl(iconId: string): string | null;
}

const SORT_KEY = 'ashfall.invSort';

function storedSort(): SortMode | null {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return SORT_MODES.find((m) => m === v) ?? null;
  } catch {
    return null;
  }
}

function storeSort(mode: SortMode): void {
  try {
    localStorage.setItem(SORT_KEY, mode);
  } catch {
    // Private mode: the choice just is not remembered.
  }
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
  private readonly sortMenu: HTMLDivElement;
  private readonly chips: HTMLDivElement;
  private readonly banners: HTMLDivElement;
  private readonly selbar: HTMLDivElement;
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
    const tools = el('div', 'inv-tools');
    tools.append(this.sortBtn, this.selectBtn, this.sortMenu);
    this.toolbar = el('div', 'inv-toolbar');
    this.toolbar.append(tools, this.chips);
    this.banners = el('div', 'inv-banners');
    this.selbar = el('div', 'inv-selbar');
    this.selbar.hidden = true;

    const hint = el('div', 'inv-hint');
    // The touch layout swaps in the phone wording (style.css shows one of the two).
    hint.append(el('span', 'hint-mouse', t('items.hint')), el('span', 'hint-touch', t('items.hintTouch')));
    this.root.append(title, this.doll, this.toolbar, this.banners, this.summary, this.grid, this.selbar, hint);
    this.tooltip = el('div', 'item-tooltip');
    this.tooltip.hidden = true;
    parent.append(this.root, this.tooltip);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
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
    this.hideTooltip();
    tooltipSheet.hide();
    this.toggleSortMenu(false);
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
    if (!this.open) return;
    const inv = this.getInventory();
    const classId = this.getClassId();
    const used = inv.grid.filter((i) => i !== null).length;
    this.goldText.textContent = t('ui.gold', { gold: inv.gold.toLocaleString('en-US') });
    this.countText.textContent = t('items.bag.count', { used, max: inv.grid.length });
    this.countText.classList.toggle('full', used >= inv.grid.length);
    // Gold and capacity sit in the shared header when the panel stack gave the panel one and the screen is wide
    // enough for the title to stay on one line; on a very narrow screen they get their own line above the grid.
    const extra = this.root.querySelector('.panel-header-extra');
    const textScale = (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 15) / 15;
    const inHeader = !!extra && window.innerWidth / textScale >= 380;
    if (inHeader && this.summary.parentElement !== extra) extra.prepend(this.summary);
    else if (!inHeader && this.summary.parentElement !== this.root) this.grid.before(this.summary);

    this.root.classList.toggle('select-mode', this.selectMode);
    this.root.classList.toggle('socket-mode', this.selectedCrystal !== null);
    this.selectBtn.classList.toggle('on', this.selectMode);
    this.selectBtn.setAttribute('aria-pressed', String(this.selectMode));
    this.selectBtn.textContent = this.selectMode ? t('items.bag.selectDone') : t('items.bag.select');
    this.selectBtn.hidden = !!this.gridClick;
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
        if (item) this.hover(cell, item, true);
        if (this.selectedCrystal !== null) this.markSocketTarget(cell, item);
        if (this.sheetFor && 'slot' in this.sheetFor && this.sheetFor.slot === slot) cell.classList.add('selected');
        return cell;
      }),
    );

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
        if (!filterMatches(item, this.filter, better)) cell.classList.add('filtered-out');
        if (this.selectedCrystal !== null) this.markSocketTarget(cell, item, index === this.selectedCrystal);
        cell.addEventListener('contextmenu', () => {
          if (item && !item.crystal && !this.selectMode) this.actions.equip(index);
        });
        cell.addEventListener('click', (e) => this.onGridClick(e, index, item));
        if (item) this.hover(cell, item, false);
        return cell;
      }),
    );

    this.renderBanners(inv, used);
    this.renderSelbar(inv);
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

  private onGridClick(e: MouseEvent, index: number, item: Item | null): void {
    if (!item) return;
    if (this.gridClick) {
      this.gridClick(index);
      this.hideTooltip();
      return;
    }
    if (this.selectMode) {
      if (this.selection.has(index)) this.selection.delete(index);
      else this.selection.add(index);
      haptic('tick');
      this.refresh();
      return;
    }
    const touch = useSheet();
    if (!touch && e.shiftKey) {
      this.actions.salvage(index);
      this.hideTooltip();
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
    const defaultSlot = defaultTargetSlot(slots, inv.equipped);
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
        label: t('items.bag.salvage', { gold }),
        danger: true,
        keepOpen: confirm,
        onClick: () => {
          if (!confirm) {
            this.actions.salvage(where.grid);
            return;
          }
          void confirmSheet({
            title: t('items.bag.salvageOneTitle', { name: itemDisplayName(item) }),
            body: t('items.bag.salvageOneBody', { gold }),
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
        const bonus = (['weapon', 'armor', 'jewelry'] as const)
          .map((g) => `${t(`items.crystalWhere.${g}`)} ${formatStat(def[g].stat, def[g].values[crystal.crystal!.tier] ?? 0)}`)
          .join(' · ');
        const banner = el('div', 'inv-banner socket');
        banner.dataset.testid = 'socket-banner';
        banner.append(
          el('span', 'inv-banner-text', t('items.bag.socketBanner', { crystal: itemDisplayName(crystal), bonus })),
          button('inv-banner-btn', t('items.bag.socketCancel'), () => {
            this.selectedCrystal = null;
            this.refresh();
          }),
        );
        out.push(banner);
      }
    }
    if (used >= inv.grid.length) {
      const junk = inv.grid.reduce((sum, i) => (i && !i.crystal && !needsSalvageConfirm(i) ? sum + salvageValue(i) : sum), 0);
      const banner = el('div', 'inv-banner full');
      banner.dataset.testid = 'bag-full';
      banner.appendChild(el('span', 'inv-banner-text', t('items.bag.full')));
      if (junk > 0) {
        // Two taps: the first arms the button, the second (within 3 s) runs it.
        const b = button('inv-banner-btn', t('items.bag.salvageJunk', { gold: junk }), () => undefined);
        armConfirm(b, { armedLabel: t('items.bag.salvageJunkArmed', { gold: junk }), run: () => this.actions.salvageJunk() });
        banner.appendChild(b);
      }
      out.push(banner);
    }
    this.banners.replaceChildren(...out);
    this.banners.hidden = out.length === 0;
  }

  private renderSelbar(inv: Inventory): void {
    this.selbar.hidden = !this.selectMode;
    if (!this.selectMode) return;
    const items = [...this.selection].map((i) => inv.grid[i]).filter((i): i is Item => !!i);
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
      const indices = [...this.selection];
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
        body: t('items.bag.salvageManyBody', { gold }),
        confirmLabel: t('items.bag.salvageButton'),
        danger: true,
      }).then((ok) => {
        if (ok) doIt();
      });
    });
    this.selbar.replaceChildren(run);
  }

  // ---- Desktop hover tooltip ---------------------------------------------------------------------------

  private hover(cell: HTMLElement, item: Item, equipped: boolean): void {
    cell.addEventListener('mouseenter', () => {
      // Touch screens fire a mouseenter on tap; the item sheet is their tooltip.
      if (useSheet()) return;
      const base = BASE_ITEMS.get(item.base);
      const comparable = !equipped && base && slotsFor(base.type).length > 0;
      const tip = renderItemTooltip(item, this.getClassId(), {
        equipped,
        comparison: comparable ? this.actions.compare(item) : null,
      });
      this.tooltip.replaceChildren(tip);
      this.tooltip.hidden = false;
      const rect = cell.getBoundingClientRect();
      if (placeTooltipForPortrait(this.tooltip, rect)) return;
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
