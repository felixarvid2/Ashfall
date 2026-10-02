/** Item tooltip: rarity-coloured name, stats, sockets and a comparison against equipped gear. */
import { t } from '../data/i18n';
import { ASPECT_DEFS, BASE_ITEMS, CRYSTAL_DEFS, rarityDef } from '../data/loot/db';
import { PERCENT_STATS, type Item, type StatKey } from '../data/loot/schemas';
import { canEquip, crystalSlotGroup, salvageValue } from '../systems/loot/generate';

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
export function renderItemTooltip(item: Item, classId: string, opts: { equipped?: boolean; comparison?: Comparison | null } = {}): HTMLElement {
  const root = el('div', 'item-tip');
  const rarity = rarityDef(item.rarity);
  root.style.setProperty('--rarity', rarity.color);
  const base = BASE_ITEMS.get(item.base);

  root.appendChild(el('div', 'item-tip-name', itemDisplayName(item)));
  const typeLine = item.crystal
    ? t('items.types.crystal')
    : `${t(`items.rarity.${item.rarity}`)} ${base ? t(`items.types.${base.type}`) : ''}`;
  root.appendChild(el('div', 'item-tip-type', typeLine));
  if (!item.crystal) root.appendChild(el('div', 'item-tip-power', t('items.itemPower', { power: item.itemPower })));
  if (opts.equipped) root.appendChild(el('div', 'item-tip-equipped', t('items.equipped')));

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
    if (item.affixes.length) {
      const aff = el('div', 'item-tip-stats');
      for (const s of item.affixes) {
        const row = el('div', s.greater ? 'greater' : '', `${s.greater ? '◆ ' : ''}${formatStat(s.stat, s.value)}`);
        if (s.greater) row.title = t('items.greater');
        aff.appendChild(row);
      }
      root.appendChild(aff);
    }
    if (item.aspect) {
      const asp = el('div', 'item-tip-aspect', `✦ ${aspectText(item.aspect.id, item.aspect.value)}`);
      root.appendChild(asp);
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

  if (opts.comparison) {
    const cmp = el('div', 'item-tip-compare');
    cmp.appendChild(el('div', 'muted', t('items.compare')));
    const line = (label: string, delta: number, pct: boolean) => {
      if (Math.abs(delta) < (pct ? 0.0005 : 0.5)) return;
      const up = delta > 0;
      const text = pct ? `${(Math.abs(delta) * 100).toFixed(1)}%` : `${Math.round(Math.abs(delta))}`;
      cmp.appendChild(el('div', up ? 'up' : 'down', `${up ? '▲' : '▼'} ${text} ${label}`));
    };
    line(t('items.damageEstimate'), opts.comparison.damagePct, true);
    line(t('stats.maxLife'), opts.comparison.life, false);
    for (const d of opts.comparison.stats) {
      if (d.stat === 'maxLife' || d.stat === 'weaponDamage') continue;
      line(t(`stats.${d.stat}`), d.delta, PERCENT_STATS.has(d.stat));
    }
    root.appendChild(cmp);
  }

  if (!opts.equipped) root.appendChild(el('div', 'item-tip-salvage muted', t('items.salvageFor', { gold: salvageValue(item) })));
  return root;
}
