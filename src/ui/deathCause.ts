/** "Slain by Champion Ash Walker - Molten": the death screen's cause line, from the player's last hit (A046). */
import type { HitRecord, HitSource } from '../core/components';
import { t } from '../data/i18n';

/** Hits older than this (s) are not named: the hero died of something else (a hazard, a burn). */
export const CAUSE_WINDOW = 20;

/** "sporeSpreader" / "spore_spreader" -> "Spore Spreader": a readable stand-in for an id with no translation. */
function prettifyId(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The line to show, or '' when nothing named hit the hero recently. `now` is the game time. */
export function deathCauseLine(src: HitSource | undefined, now: number, tr: (key: string, params?: Record<string, string | number>) => string = t): string {
  if (!src || now - src.at > CAUSE_WINDOW) return '';
  const base = src.displayKey ? (src.literal ? src.displayKey : tr(src.displayKey)) : tr(`enemies.${src.defId}`);
  const name = src.elite === 'champion' && !src.displayKey ? `${tr('elites.champion')} ${base}` : base;
  const affixes = (src.affixes ?? []).map((a) => {
    const key = `elites.affixes.${a}`;
    const name = tr(key);
    return name === key ? prettifyId(a) : name;
  });
  return affixes.length > 0 ? tr('hud.slainByAffix', { name, affix: affixes.join(', ') }) : tr('hud.slainBy', { name });
}

export interface DeathRecap {
  /** "Ash Walker - 42 heat" for each of the last three direct hits, oldest first. */
  lines: string[];
  /** Damage taken in the last `window` seconds before the end (all sources, damage over time included). */
  total: number;
  /** "Last 5 s: 312 damage taken" (empty when nothing was recorded). */
  summary: string;
}

type Tr = (key: string, params?: Record<string, string | number>) => string;

/** A hit's source name: the enemy (elite name or prefix as in the cause line) or "Environment". */
function sourceName(src: HitSource | undefined, tr: Tr): string {
  if (!src) return tr('hud.recap.environment');
  const base = src.displayKey ? (src.literal ? src.displayKey : tr(src.displayKey)) : tr(`enemies.${src.defId}`);
  return src.elite === 'champion' && !src.displayKey ? `${tr('elites.champion')} ${base}` : base;
}

/**
 * The death screen's recap (B04): the last `hits` direct hits (source, damage, type) and the damage taken in the last
 * `window` seconds. `now` is the game time; with no records the recap is empty.
 */
export function deathRecap(records: readonly HitRecord[] | undefined, now: number, tr: Tr = t, hits = 3, window = 5): DeathRecap {
  const all = records ?? [];
  const direct = all.filter((h) => !h.dot && now - h.at <= CAUSE_WINDOW).slice(-hits);
  const total = all.filter((h) => now - h.at <= window).reduce((sum, h) => sum + h.amount, 0);
  const lines = direct.map((h) => tr('hud.recap.line', { name: sourceName(h.src, tr), amount: Math.round(h.amount), type: tr(`hud.recap.types.${h.damageType}`) }));
  return { lines, total: Math.round(total), summary: total > 0 ? tr('hud.recap.total', { seconds: window, amount: Math.round(total) }) : '' };
}
