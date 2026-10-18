/**
 * Ash Harvest HUD (docs/endgame.md), under the minimap: "Ash Harvest: Refinery District — 12:40 left" while a
 * region is under the Harvest, and the Ash Shard counter while the player is in that region or carries shards.
 */
import { HARVEST } from '../data/endgame/harvest';
import { t } from '../data/i18n';
import { clock, type HarvestView } from '../world/harvest';

export class HarvestHud {
  private readonly el: HTMLDivElement;
  private readonly line: HTMLDivElement;
  private readonly shards: HTMLDivElement;
  private last = '';
  private lastShards = -1;
  private gain = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'harvest-hud';
    this.el.dataset.testid = 'harvest-hud';
    this.el.hidden = true;
    this.line = document.createElement('div');
    this.line.className = 'harvest-line';
    this.shards = document.createElement('div');
    this.shards.className = 'harvest-shards';
    this.shards.dataset.testid = 'harvest-shards';
    this.el.append(this.line, this.shards);
    root.append(this.el);
  }

  update(view: HarvestView | null, shards: number, dt: number): void {
    const showShards = (view?.here ?? false) || shards > 0;
    this.el.hidden = !view && !showShards;
    if (this.el.hidden) return;
    this.line.hidden = !view;
    if (view) {
      const text = t('harvest.line', { region: t(`zones.${view.zoneKey}.name`), time: clock(view.active.remaining) });
      if (text !== this.last) this.line.textContent = this.last = text;
    }
    this.shards.hidden = !showShards;
    // The counter flashes when shards come in.
    if (this.lastShards >= 0 && shards > this.lastShards) this.gain = 0.6;
    this.lastShards = shards;
    this.gain = Math.max(0, this.gain - dt);
    this.shards.classList.toggle('gain', this.gain > 0);
    this.shards.classList.toggle('ready', shards >= HARVEST.cacheCost);
    const text = t(view?.here ? 'harvest.shardsCache' : 'harvest.shards', { n: shards, cost: HARVEST.cacheCost });
    if (this.shards.textContent !== text) this.shards.textContent = text;
  }
}
