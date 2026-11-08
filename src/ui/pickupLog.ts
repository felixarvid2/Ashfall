/**
 * Pickup log (C13): a short log of picked-up items and gold at the bottom left. Gold adds up into one line while it
 * keeps coming, the same item picked up twice reads "x2", and every line fades after a few seconds. Magnet pulls
 * count too. It is a polite live region so a screen reader hears what was picked up.
 */
import { t } from '../data/i18n';
import { rarityDef } from '../data/loot/db';
import type { Rarity } from '../data/loot/schemas';

/** Lines kept on screen at once; the oldest makes room. */
export const LOG_MAX = 5;
/** Seconds a line stays before it fades out, and the fade itself. */
export const LOG_LIFE = 6;
export const LOG_FADE = 0.8;

interface Line {
  el: HTMLDivElement;
  key: string;
  age: number;
  count: number;
  label: string;
}

export class PickupLog {
  readonly element: HTMLDivElement;
  private readonly lines: Line[] = [];

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'pickup-log';
    this.element.dataset.testid = 'pickup-log';
    this.element.setAttribute('role', 'log');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-label', t('ux.pickupLog.label'));
    parent.append(this.element);
  }

  get count(): number {
    return this.lines.length;
  }

  gold(amount: number): void {
    const line = this.lines.find((l) => l.key === 'gold');
    if (line) {
      line.count += amount;
      line.age = 0;
      this.write(line, t('ux.pickupLog.gold', { gold: line.count.toLocaleString('en-US') }));
      return;
    }
    this.push('gold', t('ux.pickupLog.gold', { gold: amount.toLocaleString('en-US') }), amount, 'gold', '#ffd27a');
  }

  item(name: string, rarity: Rarity): void {
    const key = `item:${name}`;
    const line = this.lines.find((l) => l.key === key);
    if (line) {
      line.count += 1;
      line.age = 0;
      this.write(line, t('ux.pickupLog.itemMany', { name, n: line.count }));
      return;
    }
    this.push(key, name, 1, rarity, rarityDef(rarity).color);
  }

  private push(key: string, text: string, count: number, rarity: string, color: string): void {
    const el = document.createElement('div');
    el.className = 'pickup-line';
    el.dataset.rarity = rarity;
    el.style.setProperty('--line-color', color);
    const line: Line = { el, key, age: 0, count, label: text };
    el.textContent = text;
    this.lines.push(line);
    this.element.append(el);
    while (this.lines.length > LOG_MAX) this.remove(this.lines[0]!);
  }

  private write(line: Line, text: string): void {
    line.label = text;
    line.el.textContent = text;
    line.el.classList.remove('fading');
    line.el.style.opacity = '';
  }

  private remove(line: Line): void {
    line.el.remove();
    this.lines.splice(this.lines.indexOf(line), 1);
  }

  /** Ages the lines; call every frame with real elapsed seconds. */
  update(dt: number): void {
    for (const line of [...this.lines]) {
      line.age += dt;
      if (line.age >= LOG_LIFE + LOG_FADE) this.remove(line);
      else if (line.age > LOG_LIFE) line.el.style.opacity = String(1 - (line.age - LOG_LIFE) / LOG_FADE);
    }
  }

  clear(): void {
    for (const line of [...this.lines]) this.remove(line);
  }
}
