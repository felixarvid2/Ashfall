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
import { CODEX_ASPECTS, MASTERWORK, RECIPE_DEFS, TEMPERING } from '../data/endgame/crafting';
import {
  canMasterwork,
  canTemper,
  codexImprintCost,
  masterworkCost,
  masterworkResetCost,
  temperChargesLeft,
  temperCost,
} from '../systems/endgame/crafting';
import { renderItemCell } from './inventoryPanel';
import { artUrl } from './art';
import { aspectText, formatStat, itemDisplayName, placeTooltipForPortrait, renderItemTooltip } from './itemTooltip';
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
  /** Endgame crafting (docs/endgame.md): the account/character state the panel shows, and the actions. */
  endgame(): { tierUnlocked: number; recipes: readonly string[]; materials: Readonly<Record<string, number>>; codex: readonly string[] };
  codexValue(aspectId: string, itemPower: number): number;
  temper(gridIndex: number, recipeId: string, slot?: number): void;
  masterworkRankUp(gridIndex: number): void;
  masterworkReset(gridIndex: number): void;
  codexImprint(aspectId: string, gridIndex: number): void;
}

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
        this.temperSlot = 0;
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
    if (item) out.push(...this.tempering(inv, item), ...this.masterwork(inv, item));
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
      const icon = artUrl(`aspects/${a.id}`);
      if (icon) row.append(Object.assign(document.createElement('img'), { src: icon, alt: '', className: 'aspect-icon' }));
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
    out.push(...this.codex(inv, item));
    return out;
  }

  /** Tempering (endgame): add or replace a tempered affix from a learned recipe. */
  private tempering(inv: Inventory, item: Item): HTMLElement[] {
    const out: HTMLElement[] = [div('service-sep', ''), div('service-sub', t('crafting.temper.title'))];
    const eg = this.actions.endgame();
    if (eg.tierUnlocked < TEMPERING.tierRequired) return [...out, div('inv-hint', t('crafting.temper.locked'))];
    if (!canTemper(item)) return [...out, div('inv-hint', t('crafting.temper.cannot'))];
    const left = temperChargesLeft(item);
    const tempered = item.tempered ?? [];
    out.push(div('temper-charges', t('crafting.temper.charges', { n: left, max: TEMPERING.charges })));
    for (const a of tempered) out.push(div('tempered', `${formatStat(a.stat, a.value)}  (${t(`crafting.recipes.${a.affix}.name`)})`));
    const recipes = eg.recipes.filter((id) => RECIPE_DEFS.has(id));
    if (recipes.length === 0) return [...out, div('inv-hint', t('crafting.temper.noRecipes'))];
    const cost = temperCost(item);
    const full = tempered.length >= TEMPERING.maxAffixes;
    // With both slots filled, one choice of which affix to replace applies to every recipe.
    if (full) {
      this.temperSlot = Math.min(this.temperSlot, tempered.length - 1);
      const pick = div('temper-slots', '');
      tempered.forEach((a, i) => {
        const b = button(t('crafting.temper.replace', { stat: t(`stats.${a.stat}`) }), () => {
          this.temperSlot = i;
          this.refresh();
        });
        b.classList.toggle('active', i === this.temperSlot);
        b.dataset.testid = `temper-slot-${i}`;
        pick.appendChild(b);
      });
      out.push(pick);
    }
    for (const id of recipes) {
      const recipe = RECIPE_DEFS.get(id)!;
      const row = div('recipe-row', '');
      row.append(
        div('recipe-name', `${t(`crafting.recipes.${id}.name`)} · ${t(`crafting.groups.${recipe.group}`)}`),
        div('recipe-desc', t('crafting.temper.options', { stats: [...new Set(recipe.options.map((o) => t(`stats.${o.stat}`)))].join(', ') })),
      );
      const b = button(t('crafting.temper.add', { gold: cost }), () => {
        this.actions.temper(this.selected!, id, full ? this.temperSlot : undefined);
        this.refresh();
      });
      b.dataset.testid = `temper-${id}`;
      b.disabled = inv.gold < cost || left <= 0;
      row.appendChild(b);
      out.push(row);
    }
    return out;
  }

  /** Masterworking (endgame): ranks 0–12 for gold and materials, reset for gold. */
  private masterwork(inv: Inventory, item: Item): HTMLElement[] {
    const out: HTMLElement[] = [div('service-sep', ''), div('service-sub', t('crafting.masterwork.title'))];
    if (!canMasterwork(item)) return [...out, div('inv-hint', t('crafting.masterwork.cannot'))];
    const rank = item.masterwork ?? 0;
    const mats = this.actions.endgame().materials;
    out.push(
      div('masterwork-rank', t('crafting.masterwork.rank', { rank, max: MASTERWORK.maxRank })),
      div('inv-hint', t('crafting.masterwork.note')),
      div('inv-hint', t('crafting.masterwork.have', { dust: mats['lumen_dust'] ?? 0, shards: mats['rift_shard'] ?? 0 })),
    );
    const cost = masterworkCost(item);
    if (!cost) out.push(div('inv-hint', t('crafting.masterwork.maxed')));
    else {
      const enough = inv.gold >= cost.gold && (mats['lumen_dust'] ?? 0) >= cost.lumen_dust && (mats['rift_shard'] ?? 0) >= cost.rift_shard;
      out.push(div('inv-hint', t('crafting.masterwork.cost', { gold: cost.gold, dust: cost.lumen_dust, shards: cost.rift_shard })));
      const b = button(t('crafting.masterwork.raise', { rank: rank + 1 }), () => {
        this.actions.masterworkRankUp(this.selected!);
        this.refresh();
      });
      b.dataset.testid = 'masterwork-up';
      b.disabled = !enough;
      out.push(b);
    }
    if (rank > 0) {
      const gold = masterworkResetCost(item);
      const b = button(t('crafting.masterwork.reset', { gold }), () => {
        this.actions.masterworkReset(this.selected!);
        this.refresh();
      });
      b.dataset.testid = 'masterwork-reset';
      b.disabled = inv.gold < gold;
      out.push(b);
    }
    return out;
  }

  /** The Codex of Power (endgame): every dungeon's aspect, imprintable without limit once unlocked. */
  private codex(inv: Inventory, item: Item | null): HTMLElement[] {
    const eg = this.actions.endgame();
    const entries = Object.entries(CODEX_ASPECTS);
    const unlocked = entries.filter(([, aspect]) => eg.codex.includes(aspect)).length;
    const out: HTMLElement[] = [div('service-sep', ''), div('service-sub', t('crafting.codex.title', { n: unlocked, total: entries.length })), div('inv-hint', t('crafting.codex.hint'))];
    for (const [dungeon, aspect] of entries) {
      const row = div('aspect-row codex-row', '');
      const open = eg.codex.includes(aspect);
      row.dataset.testid = `codex-${aspect}`;
      if (!open) row.classList.add('locked');
      const icon = artUrl(`aspects/${aspect}`);
      if (icon) row.append(Object.assign(document.createElement('img'), { src: icon, alt: '', className: 'aspect-icon' }));
      row.append(div('aspect-name', t(`aspects.${aspect}.name`)));
      if (!open) {
        row.append(div('aspect-desc', t('crafting.codex.locked', { dungeon: t(`instances.names.${dungeon}`) })));
        out.push(row);
        continue;
      }
      const preview = this.actions.codexValue(aspect, item?.itemPower ?? 100);
      row.append(div('aspect-desc', aspectText(aspect, preview)));
      if (item && canImprint(item, aspect)) {
        const cost = codexImprintCost(item);
        const b = button(t('crafting.codex.imprint', { gold: cost }), () => {
          this.actions.codexImprint(aspect, this.selected!);
          this.refresh();
        });
        b.dataset.testid = `codex-imprint-${aspect}`;
        b.disabled = inv.gold < cost;
        row.appendChild(b);
      }
      out.push(row);
    }
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
  b.className = 'service-btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
