/** Floating damage numbers as pooled DOM elements positioned over the canvas. */
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
}

export type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

export class DamageNumbers {
  private readonly layer: HTMLDivElement;
  private readonly pool: Num[] = [];
  private readonly screen = { x: 0, y: 0 };

  constructor(root: HTMLElement, private readonly max = 80) {
    this.layer = document.createElement('div');
    this.layer.className = 'damage-layer';
    root.appendChild(this.layer);
  }

  handle(event: GameEvent): void {
    if (event.type === 'damage') {
      const total = event.amount + event.absorbed;
      if (total < 0.5) return;
      let cls = 'dmg';
      if (event.toPlayer) cls += ' dmg-taken';
      else if (event.crit) cls += ' dmg-crit';
      if (event.dot) cls += ' dmg-dot';
      if (event.amount < 0.5 && event.absorbed > 0) cls += ' dmg-absorbed';
      this.spawn(event.x, event.y, event.z, String(Math.round(total)), cls);
    } else if (event.type === 'miss') {
      this.spawn(event.x, event.y, event.z, 'Miss', 'dmg dmg-dot');
    } else if (event.type === 'heal') {
      this.spawn(event.x, event.y, event.z, `+${Math.round(event.amount)}`, 'dmg dmg-heal');
    }
  }

  update(dt: number, project: Project): void {
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
      const pop = t < 0.12 ? 1 + (0.12 - t) * 4 : 1;
      n.el.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -50%) scale(${pop})`;
      n.el.style.opacity = String(t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1);
    }
  }

  private spawn(x: number, y: number, z: number, text: string, cls: string): void {
    let n = this.pool.find((p) => !p.active);
    if (!n) {
      if (this.pool.length >= this.max) {
        // Recycle the oldest number when the screen is flooded.
        n = this.pool.reduce((a, b) => (a.age > b.age ? a : b));
      } else {
        const el = document.createElement('div');
        this.layer.appendChild(el);
        n = { el, x: 0, y: 0, z: 0, age: 0, life: 0.9, drift: 0, active: false };
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
    n.el.style.display = 'none';
  }
}
