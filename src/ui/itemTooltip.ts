/** Item tooltip: rarity-coloured name, stats, sockets and a comparison against equipped gear. */
import { t } from '../data/i18n';
import { ASPECT_DEFS, BASE_ITEMS, CRYSTAL_DEFS, rarityDef } from '../data/loot/db';
import { PERCENT_STATS, type Item, type Slot, type StatKey } from '../data/loot/schemas';
import { canEquip, crystalSlotGroup, salvageValue } from '../systems/loot/generate';
import { MASTERWORK } from '../data/endgame/crafting';
import { effectiveAffixes } from '../systems/endgame/itemMods';
import { artUrl, itemArtUrl } from './art';
import { affixRollRange, isHighRoll, powerDelta, powerDeltaText } from './inventoryLogic';

export function formatStat(stat: StatKey, value: number): string {
  const sign = value >= 0 ? '+' : '−';
  const abs = Math.abs(value);
  const num = PERCENT_STATS.has(stat) ? `${(abs * 100).toFixed(abs * 100 < 10 ? 1 : 0)}%` : `${Math.round(abs)}`;
  return `${sign}${num} ${t(`stats.${stat}`)}`;
}

export function itemDisplayName(item: Item): string {
  if (item.crystal) {
    const prefix = t(`items.crystalTier.${item.crystal.tier}`);
    return `${prefix ? prefix + ' ' : ''}${t(`items.crystals.${item.crystal.id}`)}`;
  }
  if (item.unique) return t(`uniques.${item.unique}.name`);
  if (item.aspect) return `${t(`aspects.${item.aspect.id}.name`)} ${t(`items.bases.${item.base}`)}`;
  return item.name;
}

/** Aspect description with its rolled value filled in. */
export function aspectText(id: string, value: number): string {
  const def = ASPECT_DEFS.get(id);
  const shown = def?.display === 'flat' ? String(Math.round(value)) : `${Math.round(value * 100)}%`;
  return t(`aspects.${id}.desc`, { value: shown });
}

export interface Comparison {
  /** Stat differences (candidate − equipped). */
  stats: { stat: StatKey; delta: number }[];
  damagePct: number;
  life: number;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Build tooltip contents for an item. `equipped` marks the item as currently worn. */
/**
 * Phones held upright: a tooltip beside its item would run off the narrow screen, so it spans the
 * width instead, on the half of the screen away from the finger (CSS `.tip-top` / `.tip-bottom`).
 * Returns false when the caller should place it beside the anchor as usual.
 */
export function placeTooltipForPortrait(tooltip: HTMLElement, anchor: DOMRect): boolean {
  const portrait = tooltip.closest('#ui')?.classList.contains('portrait') ?? false;
  tooltip.classList.toggle('tip-top', portrait && anchor.top + anchor.height / 2 > window.innerHeight / 2);
  tooltip.classList.toggle('tip-bottom', portrait && !tooltip.classList.contains('tip-top'));
  if (!portrait) return false;
  tooltip.style.left = '';
  tooltip.style.top = '';
  return true;
}

export function renderItemTooltip(
  item: Item,
  classId: string,
  opts: {
    equipped?: boolean;
    comparison?: Comparison | null;
    /** The sheet pins icon, name, type and power above the scrolling body. */
    noHeader?: boolean;
    /**
     * Desktop hover (B006-B009): every slot the item could go to, with what is worn there. Replaces `comparison`
     * with one "vs <item>" block per slot, adds the item-power delta to the header and a delta on each affix.
     */
    targets?: CompareTarget[];
    /** The target compared first (its delta goes in the header). */
    defaultSlot?: Slot;
    /** Print the possible roll range after each affix (B009). */
    ranges?: boolean;
    /** Where the item's aspect stands, as a status line under it (B017). */
    aspectStatus?: 'codex' | 'cache' | 'new';
    /** Extra muted lines at the very end, e.g. key hints (B011/B018). */
    hints?: string[];
  } = {},
): HTMLElement {
  const root = el('div', 'item-tip');
  const rarity = rarityDef(item.rarity);
  root.style.setProperty('--rarity', rarity.color);
  const base = BASE_ITEMS.get(item.base);
  const targets = opts.equipped ? [] : (opts.targets ?? []);
  const mainTarget = targets.find((x) => x.slot === opts.defaultSlot) ?? targets[0];
  const mainWorn = mainTarget?.equipped ? effectiveAffixes(mainTarget.equipped) : null;

  if (!opts.noHeader) {
    // The painted icon beside the name, in its rarity's look.
    const art = itemArtUrl(item);
    if (art) root.appendChild(Object.assign(document.createElement('img'), { src: art, alt: '', className: 'item-tip-icon' }));
    root.appendChild(el('div', 'item-tip-name', itemDisplayName(item)));
    root.appendChild(el('div', 'item-tip-type', itemTypeLine(item)));
    if (!item.crystal) {
      const power = el('div', 'item-tip-power', t('items.itemPower', { power: item.itemPower }));
      const delta = !opts.equipped && targets.length > 0 ? powerDelta(item, mainTarget?.equipped) : 0;
      if (delta !== 0) {
        const chip = el('span', `item-tip-delta ${delta > 0 ? 'up' : 'down'}`, `${delta > 0 ? '▲' : '▼'} ${powerDeltaText(delta)}`);
        chip.title = t(delta > 0 ? 'items.bag.better' : 'items.bag.worse');
        power.appendChild(chip);
      }
      root.appendChild(power);
    }
  }
  if (opts.equipped) root.appendChild(el('div', 'item-tip-equipped', t('items.equipped')));
  if (item.locked) {
    const flag = el('div', 'item-tip-flag locked', t('items.lockedLine'));
    flag.prepend(el('span', 'cell-lock'));
    root.appendChild(flag);
  }
  else if (item.junk) root.appendChild(el('div', 'item-tip-flag junk', t('items.junkLine')));

  if (item.crystal) {
    const c = CRYSTAL_DEFS.get(item.crystal.id);
    if (c) {
      const list = el('div', 'item-tip-stats');
      for (const group of ['weapon', 'armor', 'jewelry'] as const) {
        const row = el('div', 'item-tip-crystal');
        row.appendChild(el('span', 'muted', `${t(`items.crystalWhere.${group}`)}: `));
        row.appendChild(el('span', '', formatStat(c[group].stat, c[group].values[item.crystal.tier] ?? 0)));
        list.appendChild(row);
      }
      root.appendChild(list);
    }
  } else {
    if (item.implicits.length) {
      const imp = el('div', 'item-tip-implicits');
      for (const s of item.implicits) imp.appendChild(el('div', '', formatStat(s.stat, s.value)));
      root.appendChild(imp);
    }
    const affixes = effectiveAffixes(item);
    if (affixes.length) {
      const aff = el('div', 'item-tip-stats');
      affixes.forEach((s, i) => {
        const cls = s.tempered ? 'tempered' : s.greater ? 'greater' : '';
        const mark = s.tempered ? '⚒ ' : s.greater ? '◆ ' : '';
        const row = el('div', cls, `${mark}${formatStat(s.stat, s.value)}${s.boosted ? ' ▲' : ''}`);
        if (s.tempered) row.title = t('crafting.tooltip.tempered');
        else if (s.greater) row.title = t('items.greater');
        if (mainWorn) row.appendChild(affixDeltaMark(s.stat, s.value, mainWorn));
        const range = opts.ranges && !s.tempered ? affixRollRange(item, i) : null;
        if (range) {
          const high = isHighRoll(s.value, range);
          const r = el('span', `affix-range${high ? ' high' : ''}`, `[${rangeText(s.stat, range.min)}–${rangeText(s.stat, range.max)}]`);
          r.title = t('items.rollRange', { min: rangeText(s.stat, range.min), max: rangeText(s.stat, range.max) });
          row.appendChild(r);
        }
        aff.appendChild(row);
      });
      root.appendChild(aff);
    }
    if (item.masterwork) root.appendChild(el('div', 'item-tip-masterwork', t('crafting.tooltip.masterwork', { rank: item.masterwork, max: MASTERWORK.maxRank })));
    if (item.aspect) {
      const asp = el('div', 'item-tip-aspect', `✦ ${aspectText(item.aspect.id, item.aspect.value)}`);
      const icon = artUrl(`aspects/${item.aspect.id}`);
      if (icon) asp.prepend(Object.assign(document.createElement('img'), { src: icon, alt: '', className: 'aspect-icon' }));
      root.appendChild(asp);
      if (opts.aspectStatus) root.appendChild(el('div', `item-tip-aspect-status${opts.aspectStatus === 'new' ? ' new' : ''}`, t(`items.aspectStatus.${opts.aspectStatus}`)));
    }
    if (item.unique) {
      root.appendChild(el('div', 'item-tip-aspect unique', `✦ ${t(`uniques.${item.unique}.effect`)}`));
      root.appendChild(el('div', 'item-tip-flavor', t(`uniques.${item.unique}.flavor`)));
    }
    if (item.sockets.length && base) {
      const group = crystalSlotGroup(base.type);
      const sock = el('div', 'item-tip-sockets');
      for (const s of item.sockets) {
        if (!s) {
          sock.appendChild(el('div', 'muted', `◇ ${t('items.emptySocket')}`));
          continue;
        }
        const c = CRYSTAL_DEFS.get(s.crystal);
        if (!c) continue;
        const row = el('div', '', `◆ ${formatStat(c[group].stat, c[group].values[s.tier] ?? 0)}`);
        row.style.color = c.color;
        sock.appendChild(row);
      }
      root.appendChild(sock);
    }
    if (base?.classes && !canEquip(base, classId)) {
      const names = base.classes.map((c) => t(`items.classes.${c}`)).join(', ');
      root.appendChild(el('div', 'item-tip-req', t('items.requiresClass', { cls: names })));
    }
  }

  if (targets.length > 0) {
    // Default target first; a ring is compared with both worn rings (B006).
    const ordered = mainTarget ? [mainTarget, ...targets.filter((x) => x !== mainTarget)] : targets;
    for (const x of ordered) if (x.comparison) root.appendChild(renderComparison(x.comparison, targetHeading(x, targets.length > 1)));
  } else if (opts.comparison) root.appendChild(renderComparison(opts.comparison));

  if (!opts.equipped) root.appendChild(el('div', 'item-tip-salvage muted', t('items.salvageFor', { gold: salvageValue(item) })));
  for (const hint of opts.hints ?? []) root.appendChild(el('div', 'item-tip-hint muted', hint));
  return root;
}

/** "vs Etched Ring (70)"; with two slots "vs Ring 1: Etched Ring (70)"; an empty slot "vs empty Ring 2" (B006). */
export function targetHeading(target: CompareTarget, dual: boolean): string {
  if (!target.equipped) return t('items.compareVsEmpty', { slot: target.label });
  const name = itemDisplayName(target.equipped);
  const power = target.equipped.itemPower;
  return dual ? t('items.compareVsSlot', { slot: target.label, name, power }) : t('items.compareVs', { name, power });
}

/** A roll bound without sign: "5.0%" or "24". */
function rangeText(stat: StatKey, value: number): string {
  const abs = Math.abs(value);
  return PERCENT_STATS.has(stat) ? `${(abs * 100).toFixed(abs * 100 < 10 ? 1 : 0)}%` : `${Math.round(abs)}`;
}

/** Muted "(+2.7)" against the worn item's same stat, or an accent dot when the worn item lacks the stat (B008). */
function affixDeltaMark(stat: StatKey, value: number, worn: { stat: StatKey; value: number }[]): HTMLElement {
  const same = worn.filter((w) => w.stat === stat);
  if (same.length === 0) {
    const dot = el('i', 'affix-new');
    dot.title = t('items.newStat');
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', t('items.newStat'));
    return dot;
  }
  const delta = value - same.reduce((sum, w) => sum + w.value, 0);
  const pct = PERCENT_STATS.has(stat);
  if (Math.abs(delta) < (pct ? 0.0005 : 0.5)) return el('span', 'affix-delta', '(=)');
  const num = pct ? (Math.abs(delta) * 100).toFixed(1) : String(Math.round(Math.abs(delta)));
  return el('span', `affix-delta ${delta > 0 ? 'up' : 'down'}`, `(${delta > 0 ? '+' : '−'}${num})`);
}

/** Everything the `/` search looks at: names, type, stats, aspect and unique text (B015). */
export function itemSearchText(item: Item): string {
  const parts: string[] = [itemDisplayName(item), item.name, itemTypeLine(item)];
  if (item.crystal) return parts.join(' ');
  parts.push(t(`items.bases.${item.base}`));
  for (const s of [...item.implicits, ...effectiveAffixes(item)]) parts.push(formatStat(s.stat, s.value));
  if (item.aspect) parts.push(t(`aspects.${item.aspect.id}.name`), aspectText(item.aspect.id, item.aspect.value));
  if (item.unique) parts.push(t(`uniques.${item.unique}.name`), t(`uniques.${item.unique}.effect`));
  return parts.join(' ');
}

function itemTypeLine(item: Item): string {
  const base = BASE_ITEMS.get(item.base);
  return item.crystal ? t('items.types.crystal') : `${t(`items.rarity.${item.rarity}`)} ${base ? t(`items.types.${base.type}`) : ''}`;
}

/** The comparison block: a heading ("Compared to equipped" or "vs Etched Ring (70)") and one line per stat difference. */
export function renderComparison(comparison: Comparison, heading?: string): HTMLElement {
  const cmp = el('div', 'item-tip-compare');
  cmp.appendChild(el('div', 'muted item-tip-compare-head', heading ?? t('items.compare')));
  const line = (label: string, delta: number, pct: boolean) => {
    if (Math.abs(delta) < (pct ? 0.0005 : 0.5)) return;
    const up = delta > 0;
    const text = pct ? `${(Math.abs(delta) * 100).toFixed(1)}%` : `${Math.round(Math.abs(delta))}`;
    cmp.appendChild(el('div', up ? 'up' : 'down', `${up ? '▲' : '▼'} ${text} ${label}`));
  };
  line(t('items.damageEstimate'), comparison.damagePct, true);
  line(t('stats.maxLife'), comparison.life, false);
  for (const d of comparison.stats) {
    if (d.stat === 'maxLife' || d.stat === 'weaponDamage') continue;
    line(t(`stats.${d.stat}`), d.delta, PERCENT_STATS.has(d.stat));
  }
  return cmp;
}

/** The headline of a comparison as short chips: "+0.2% Damage", "+152 Armor", "−1 socket" (at most four). */
export function compareVerdict(comparison: Comparison, item: Item, equipped: Item | null): { text: string; up: boolean }[] {
  const parts: { text: string; up: boolean }[] = [];
  if (Math.abs(comparison.damagePct) >= 0.0005) {
    const d = comparison.damagePct;
    parts.push({ text: `${d > 0 ? '+' : '−'}${(Math.abs(d) * 100).toFixed(1)}% ${t('items.damageEstimate')}`, up: d > 0 });
  }
  if (Math.abs(comparison.life) >= 0.5) parts.push({ text: formatStat('maxLife', comparison.life), up: comparison.life > 0 });
  const stats: { text: string; up: boolean }[] = [];
  for (const d of comparison.stats) {
    if (d.stat === 'maxLife' || d.stat === 'weaponDamage') continue;
    if (Math.abs(d.delta) < (PERCENT_STATS.has(d.stat) ? 0.0005 : 0.5)) continue;
    stats.push({ text: formatStat(d.stat, d.delta), up: d.delta > 0 });
  }
  const sockets: { text: string; up: boolean }[] = [];
  const socketDelta = item.sockets.length - (equipped?.sockets.length ?? 0);
  if (socketDelta !== 0) {
    sockets.push({ text: t(Math.abs(socketDelta) === 1 ? 'items.verdict.socketOne' : 'items.verdict.socketMany', { n: `${socketDelta > 0 ? '+' : '−'}${Math.abs(socketDelta)}` }), up: socketDelta > 0 });
  }
  return [...parts, ...stats].slice(0, 4 - sockets.length).concat(sockets);
}

/** One slot an item could be worn in, with what is there now (P053: rings have two). */
export interface CompareTarget {
  slot: Slot;
  /** "Ring 1", "Helm". */
  label: string;
  equipped: Item | null;
  comparison: Comparison | null;
}

export interface ItemSheetOptions {
  /** The item is worn: no comparison, no salvage line. */
  equipped?: boolean;
  /** Where the item could go; empty for crystals and items that are not gear. */
  targets?: CompareTarget[];
  /** The target compared first. */
  defaultSlot?: Slot;
  /** Extra lines under the item, e.g. what socketing would add. */
  extra?: HTMLElement[];
}

/** The symbols the tooltip uses, explained (P057). Touch screens have no `title` hover text. */
export function renderAffixLegend(): HTMLElement {
  const box = el('div', 'item-legend');
  box.appendChild(el('div', 'muted', t('items.legend.title')));
  const rows: [string, string][] = [
    ['◆', t('items.legend.greater')],
    ['⚒', t('crafting.tooltip.tempered')],
    ['▲', t('items.legend.boosted')],
    ['✦', t('items.legend.aspect')],
    ['◇', t('items.legend.emptySocket')],
  ];
  for (const [symbol, text] of rows) {
    const row = el('div', 'item-legend-row');
    row.append(el('span', 'item-legend-symbol', symbol), el('span', '', text));
    box.appendChild(row);
  }
  return box;
}

let legendShown = false;

/**
 * Item details for the bottom sheet (P055, P056, P057): a pinned header with the name, power and a one-line
 * verdict, tabs "This item | Equipped | Changes" for gear that can be compared, and a symbol legend behind "i".
 */
export function renderItemSheet(item: Item, classId: string, opts: ItemSheetOptions = {}): HTMLElement {
  const root = el('div', 'item-sheet');
  root.style.setProperty('--rarity', rarityDef(item.rarity).color);
  const targets = opts.equipped ? [] : (opts.targets ?? []);
  let target = targets.find((x) => x.slot === opts.defaultSlot) ?? targets[0];

  // Pinned part: identity, verdict, tabs.
  const pin = el('div', 'item-sheet-pin');
  const id = el('div', 'item-sheet-id');
  const art = itemArtUrl(item);
  if (art) id.appendChild(Object.assign(document.createElement('img'), { src: art, alt: '', className: 'item-sheet-icon' }));
  const names = el('div', 'item-sheet-names');
  names.append(el('div', 'item-tip-name', itemDisplayName(item)));
  const sub = item.crystal ? itemTypeLine(item) : `${itemTypeLine(item)} · ${t('items.itemPower', { power: item.itemPower })}`;
  names.append(el('div', 'item-tip-type', sub));
  const info = Object.assign(document.createElement('button'), { type: 'button', className: 'item-legend-btn', textContent: 'i' });
  info.setAttribute('aria-label', t('items.legend.title'));
  info.setAttribute('aria-expanded', 'false');
  id.append(names, info);
  const verdict = el('div', 'item-sheet-verdict');
  const tabsRow = el('div', 'item-sheet-tabs');
  const slotRow = el('div', 'item-sheet-tabs item-sheet-slots');
  pin.append(id, verdict);

  const legend = renderAffixLegend();
  legend.hidden = true;
  const setLegend = (open: boolean) => {
    legend.hidden = !open;
    info.setAttribute('aria-expanded', String(open));
    info.classList.toggle('on', open);
  };
  info.addEventListener('click', () => setLegend(legend.hidden !== false));
  // Shown once on the first legendary tooltip of the session.
  if (!legendShown && (item.rarity === 'legendary' || item.rarity === 'unique' || item.rarity === 'mythic')) {
    legendShown = true;
    setLegend(true);
  }

  const view = el('div', 'item-sheet-view');
  type ViewName = 'item' | 'equipped' | 'changes';
  let current: ViewName = 'item';

  const render = () => {
    const comparison = target?.comparison ?? null;
    verdict.replaceChildren();
    if (comparison) {
      const parts = compareVerdict(comparison, item, target?.equipped ?? null);
      const power = item.crystal ? 0 : powerDelta(item, target?.equipped);
      if (power !== 0) verdict.appendChild(el('span', `chip ${power > 0 ? 'up' : 'down'}`, `${power > 0 ? '▲' : '▼'} ${powerDeltaText(power)} ${t('items.powerShort')}`));
      else if (parts.length === 0) verdict.appendChild(el('span', 'chip', t('items.sheet.noChange')));
      for (const p of parts) verdict.appendChild(el('span', `chip ${p.up ? 'up' : 'down'}`, p.text));
    }
    verdict.hidden = !comparison;
    for (const b of tabsRow.querySelectorAll('button')) b.classList.toggle('on', (b as HTMLElement).dataset.view === current);
    for (const b of slotRow.querySelectorAll('button')) b.classList.toggle('on', (b as HTMLElement).dataset.slot === target?.slot);
    const body: HTMLElement[] = [];
    if (current === 'equipped') {
      body.push(
        target?.equipped
          ? renderItemTooltip(target.equipped, classId, { equipped: true })
          : el('div', 'muted item-sheet-empty', t('items.sheet.nothingEquipped', { slot: target?.label ?? '' })),
      );
    } else if (current === 'changes') {
      body.push(
        comparison
          ? renderComparison(comparison, target ? targetHeading(target, targets.length > 1) : undefined)
          : el('div', 'muted', t('items.sheet.noChange')),
      );
    } else {
      body.push(renderItemTooltip(item, classId, { equipped: opts.equipped, noHeader: true }), ...(opts.extra ?? []));
    }
    view.replaceChildren(...body);
  };

  if (targets.length > 0) {
    const names3: [ViewName, string][] = [
      ['item', t('items.sheet.tabItem')],
      ['equipped', t('items.sheet.tabEquipped')],
      ['changes', t('items.sheet.tabChanges')],
    ];
    for (const [name, label] of names3) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className: 'seg-btn' });
      b.dataset.view = name;
      b.addEventListener('click', () => {
        current = name;
        render();
      });
      tabsRow.appendChild(b);
    }
    pin.appendChild(tabsRow);
    if (targets.length > 1) {
      for (const x of targets) {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: t('items.sheet.vs', { slot: x.label }), className: 'seg-btn' });
        b.dataset.slot = x.slot;
        b.addEventListener('click', () => {
          target = x;
          render();
        });
        slotRow.appendChild(b);
      }
      pin.appendChild(slotRow);
    }
  }
  root.append(pin, legend, view);
  render();
  return root;
}
