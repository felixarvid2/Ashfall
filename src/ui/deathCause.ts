/** "Slain by Champion Ash Walker - Molten": the death screen's cause line, from the player's last hit (A046). */
import type { HitSource } from '../core/components';
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
