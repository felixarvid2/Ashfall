/** Floating damage numbers as pooled DOM elements positioned over the canvas. */
import type { Entity } from '../core/ecs';
import type { GameEvent } from '../core/events';

interface Num {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  drift: number;
  active: boolean;
  /** Screen-space drift in px over the number's life (damage taken floats left). */
  slide: number;
  /** Touch merging: the target and the running sum while the 120 ms window is open. */
  target: Entity | null;
  sum: number;
  kind: string;
  born: number;
  /** Pop-in peak scale (crits pop harder) and a fixed screen offset in px (damage taken sits beside the hero). */
  peak: number;
  offsetY: number;
}

/** Touch: hits on one target within this window become one number. */
export const MERGE_WINDOW = 0.12;
/** Touch: at most this many numbers live at once. */
export const TOUCH_MAX = 24;
/** Desktop: at most this many numbers live at once (the oldest makes room). */
export const DESKTOP_MAX = 40;
/** Seconds of the pop-in: normal hits swell to POP_NORMAL, crits to POP_CRIT, both settling to 1. */
export const POP_TIME = 0.12;
export const POP_NORMAL = 1.15;
export const POP_CRIT = 1.7;
/** Touch: damage-over-time ticks under this share of the target's life are not shown. */
export const DOT_MIN_SHARE = 0.03;

/** Whether a DoT tick is big enough to show on touch (an unknown max life shows everything). */
export function dotWorthShowing(amount: number, maxLife: number): boolean {
  return maxLife <= 0 || amount >= maxLife * DOT_MIN_SHARE;
}

/** "842", "12.3k", "1.23M": big hits stay short and comparable (A029). */
export function formatDamage(amount: number): string {
  const n = Math.round(amount);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) {
    const k = Math.round(n / 100) / 10;
    return k >= 1000 ? '1.00M' : `${k.toFixed(1)}k`;
  }
  return String(n);
}

/** Font scale of an outgoing number by its share of the target's life: 0.9 at nothing, 1.4 at a quarter or more (A028). */
export function damageScale(amount: number, maxLife: number): number {
  if (maxLife <= 0) return 1;
  return 0.9 + 0.5 * Math.min(1, amount / maxLife / 0.25);
}

/** Pop-in scale at `age` seconds: `peak` at birth, 1 from POP_TIME on (A026). */
export function popScale(age: number, peak: number): number {
  return age >= POP_TIME ? 1 : 1 + (peak - 1) * (1 - age / POP_TIME);
}

/** Element class of a damage type: heat is fire, energy is shock, toxic is toxin; the rest keep the cream colour (A031). */
export function elementClass(damageType: string): string {
  switch (damageType) {
    case 'heat':
      return 'dmg-el-fire';
    case 'energy':
      return 'dmg-el-shock';
    case 'toxic':
      return 'dmg-el-toxin';
    case 'cold':
      return 'dmg-el-cold';
    case 'void':
      return 'dmg-el-void';
    default:
      return '';
  }
}

export type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

export class DamageNumbers {
  private readonly layer: HTMLDivElement;
  private readonly pool: Num[] = [];
  private readonly screen = { x: 0, y: 0 };
  private clock = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly max = 80,
    /** Max life of an entity (0 when unknown), for the touch DoT filter. */
    private readonly maxLifeOf: (e: Entity) => number = () => 0,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'damage-layer';
    root.appendChild(this.layer);
  }

  private get touch(): boolean {
    return this.root.classList.contains('touch-ui');
  }

  handle(event: GameEvent): void {
    if (event.type === 'damage') {
      const total = event.amount + event.absorbed;
      if (total < 0.5) return;
      const touch = this.touch;
      if (touch && event.dot && !dotWorthShowing(total, this.maxLifeOf(event.target))) return;
      let cls = 'dmg';
      if (event.toPlayer) cls += ' dmg-taken';
      else if (event.crit) cls += ' dmg-crit';
      if (event.dot) cls += ' dmg-dot';
      if (event.amount < 0.5 && event.absorbed > 0) cls += ' dmg-absorbed';
      // Outgoing hits take their element's colour (taken numbers stay red).
      const element = event.toPlayer ? '' : elementClass(event.damageType);
      if (element) cls += ` ${element}`;
      // Touch merges every hit; desktop only sums plain hits (never crits or damage taken, A027).
      const mergeable = touch || (!event.crit && !event.toPlayer);
      if (mergeable && this.merge(event.target, cls, total)) return;
      const n = this.spawn(event.x, event.y, event.z, formatDamage(total), cls);
      if (mergeable) {
        n.target = event.target;
        n.sum = total;
        n.kind = cls;
      }
      if (touch) {
        if (event.toPlayer) n.slide = -44;
      } else {
        if (event.toPlayer) {
          // Beside the hero, not on top of the sprite and the heal numbers (A030).
          n.slide = -34;
          n.offsetY = 10;
        } else {
          n.el.style.setProperty('--dmg-scale', event.crit ? '1' : damageScale(total, this.maxLifeOf(event.target)).toFixed(2));
        }
        if (event.crit) n.peak = POP_CRIT;
      }
    } else if (event.type === 'miss') {
      // Misses are enemy evasion only; on a phone they just add noise.
      if (!this.touch) this.spawn(event.x, event.y, event.z, 'Miss', 'dmg dmg-dot');
    } else if (event.type === 'heal') {
      this.spawn(event.x, event.y, event.z, `+${formatDamage(event.amount)}`, 'dmg dmg-heal');
    }
  }

  /** Adds a hit to a number spawned for the same target moments ago (touch). */
  private merge(target: Entity, kind: string, amount: number): boolean {
    const n = this.pool.find((p) => p.active && p.target === target && p.kind === kind && this.clock - p.born < MERGE_WINDOW);
    if (!n) return false;
    n.sum += amount;
    n.el.textContent = formatDamage(n.sum);
    return true;
  }

  update(dt: number, project: Project): void {
    this.clock += dt;
    for (const n of this.pool) {
      if (!n.active) continue;
      n.age += dt;
      if (n.age >= n.life) {
        n.active = false;
        n.el.style.display = 'none';
        continue;
      }
      const t = n.age / n.life;
      if (!project(n.x + n.drift * t, n.y + t * 1.2, n.z, this.screen)) {
        n.el.style.display = 'none';
        continue;
      }
      n.el.style.display = '';
      const pop = popScale(n.age, n.peak);
      n.el.style.transform = `translate(${this.screen.x + n.slide * t}px, ${this.screen.y + n.offsetY}px) translate(-50%, -50%) scale(${pop})`;
      n.el.style.opacity = String(t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1);
    }
  }

  private spawn(x: number, y: number, z: number, text: string, cls: string): Num {
    let n: Num | undefined;
    // Keeps the screen readable: at most TOUCH_MAX (phone) or DESKTOP_MAX live numbers, the oldest makes room.
    const cap = this.touch ? TOUCH_MAX : Math.min(DESKTOP_MAX, this.max);
    const live = this.pool.filter((p) => p.active);
    if (live.length >= cap) n = live.reduce((a, b) => (a.age > b.age ? a : b));
    else n = this.pool.find((p) => !p.active);
    if (!n) {
      if (this.pool.length >= this.max) {
        // Recycle the oldest number when the screen is flooded.
        n = this.pool.reduce((a, b) => (a.age > b.age ? a : b));
      } else {
        const el = document.createElement('div');
        this.layer.appendChild(el);
        n = { el, x: 0, y: 0, z: 0, age: 0, life: 0.9, drift: 0, active: false, slide: 0, target: null, sum: 0, kind: '', born: 0, peak: POP_NORMAL, offsetY: 0 };
        this.pool.push(n);
      }
    }
    n.el.className = cls;
    n.el.textContent = text;
    n.x = x;
    n.y = y;
    n.z = z;
    n.age = 0;
    n.life = cls.includes('crit') ? 1.1 : 0.9;
    // Visual-only spread so stacked numbers don't overlap perfectly.
    n.drift = (Math.random() - 0.5) * 1.2;
    n.active = true;
    n.slide = 0;
    n.offsetY = 0;
    n.peak = POP_NORMAL;
    n.el.style.removeProperty('--dmg-scale');
    n.target = null;
    n.born = this.clock;
    n.el.style.display = 'none';
    return n;
  }
}
