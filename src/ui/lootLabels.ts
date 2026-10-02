/** Clickable name labels over loot on the ground (always for magic+, all while Alt is held). */
import { GroundGold, GroundItem, Transform } from '../core/components';
import type { Entity, World } from '../core/ecs';
import { t } from '../data/i18n';
import { CRYSTAL_DEFS, rarityDef } from '../data/loot/db';
import { itemDisplayName } from './itemTooltip';

type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

const MAX_DISTANCE = 24;

export class LootLabels {
  private readonly layer: HTMLDivElement;
  private readonly labels = new Map<Entity, HTMLDivElement>();
  private readonly screen = { x: 0, y: 0 };

  constructor(root: HTMLElement, private readonly onPick: (e: Entity) => void) {
    this.layer = document.createElement('div');
    this.layer.className = 'loot-labels';
    root.appendChild(this.layer);
  }

  update(world: World, playerX: number, playerZ: number, showAll: boolean, project: Project): void {
    const seen = new Set<Entity>();
    const pending: { label: HTMLDivElement; x: number; y: number; w: number }[] = [];
    for (const e of world.query(GroundItem, Transform)) {
      const g = world.req(e, GroundItem);
      const tr = world.req(e, Transform);
      const dist = Math.hypot(tr.x - playerX, tr.z - playerZ);
      const visible = g.age > 0.35 && dist < MAX_DISTANCE && (showAll || g.item.rarity !== 'common' || g.item.crystal || dist < 5);
      if (!visible || !project(tr.x, 0.4, tr.z, this.screen)) continue;
      seen.add(e);
      let label = this.labels.get(e);
      if (!label) {
        label = document.createElement('div');
        label.className = 'loot-label';
        label.textContent = itemDisplayName(g.item);
        label.style.color = g.item.crystal ? (CRYSTAL_DEFS.get(g.item.crystal.id)?.color ?? '#fff') : rarityDef(g.item.rarity).color;
        label.addEventListener('mousedown', (ev) => {
          ev.stopPropagation();
          this.onPick(e);
        });
        this.layer.appendChild(label);
        this.labels.set(e, label);
        label.dataset.w = String(label.offsetWidth || 120);
      }
      pending.push({ label, x: this.screen.x, y: this.screen.y - 18, w: Number(label.dataset.w) });
    }
    // Stack overlapping labels upward, nearest-to-camera (lowest on screen) first.
    pending.sort((a, b) => b.y - a.y);
    const placed: { x: number; y: number; w: number }[] = [];
    for (const p of pending) {
      let y = p.y;
      for (let guard = 0; guard < 20; guard++) {
        const hit = placed.find((q) => Math.abs(q.x - p.x) < (q.w + p.w) / 2 + 4 && Math.abs(q.y - y) < 19);
        if (!hit) break;
        y = hit.y - 19;
      }
      placed.push({ x: p.x, y, w: p.w });
      p.label.style.transform = `translate(${p.x}px, ${y}px) translate(-50%, -100%)`;
    }
    if (showAll) {
      for (const e of world.query(GroundGold, Transform)) {
        const tr = world.req(e, Transform);
        if (Math.hypot(tr.x - playerX, tr.z - playerZ) > MAX_DISTANCE || !project(tr.x, 0.3, tr.z, this.screen)) continue;
        seen.add(e);
        let label = this.labels.get(e);
        if (!label) {
          label = document.createElement('div');
          label.className = 'loot-label gold';
          label.textContent = t('ui.gold', { gold: world.req(e, GroundGold).amount });
          this.layer.appendChild(label);
          this.labels.set(e, label);
        }
        label.style.transform = `translate(${this.screen.x}px, ${this.screen.y - 14}px) translate(-50%, -100%)`;
      }
    }
    for (const [e, label] of this.labels) {
      if (seen.has(e)) continue;
      label.remove();
      this.labels.delete(e);
    }
  }
}
