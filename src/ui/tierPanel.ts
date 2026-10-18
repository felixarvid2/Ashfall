/**
 * Tier Beacon panel (left side, opened from the Tier Beacon in each hub): pick any unlocked World Tier and
 * see what each one changes (docs/endgame.md). Locked tiers show how they unlock; picking is disabled in combat.
 */
import { t } from '../data/i18n';
import { TIER_TABLE, WORLD_TIERS, type WorldTier } from '../data/endgame/tiers';

export interface TierPanelActions {
  /** Highest tier the account has unlocked. */
  unlocked(): number;
  /** The tier in effect. */
  chosen(): number;
  inCombat(): boolean;
  pick(tier: WorldTier): void;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

/** Short HUD label: "WT II Veteran". */
export function tierBadgeText(tier: number): string {
  return t('worldTiers.badge', { roman: ROMAN[tier] ?? String(tier), name: t(`worldTiers.${tier}.name`) });
}

/** The effect lines of a tier, in the order the table lists them. */
export function tierEffectLines(tier: WorldTier): string[] {
  const m = TIER_TABLE[tier];
  const lines = [t(tier >= 2 ? 'worldTiers.effects.levelPlayer' : 'worldTiers.effects.levelZone')];
  if (tier === 1) return lines;
  lines.push(t('worldTiers.effects.enemies', { life: m.enemyLife, damage: m.enemyDamage }));
  lines.push(t('worldTiers.effects.rewards', { xp: m.xp, gold: m.gold }));
  lines.push(t('worldTiers.effects.loot', { power: m.itemPower, greater: Math.round(m.greaterChance * 100), rare: m.rareDrops }));
  return lines;
}

export class TierPanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly actions: TierPanelActions) {
    this.root = document.createElement('div');
    this.root.className = 'panel tier-panel';
    this.root.hidden = true;
    this.root.dataset.testid = 'tier-panel';
    const title = document.createElement('h2');
    title.textContent = t('worldTiers.title');
    const close = document.createElement('button');
    close.className = 'service-close';
    close.textContent = '×';
    close.addEventListener('click', () => this.close());
    this.body = document.createElement('div');
    this.root.append(close, title, this.body);
    parent.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.refresh();
  }

  close(): void {
    this.root.hidden = true;
  }

  refresh(): void {
    if (!this.open) return;
    const unlocked = this.actions.unlocked();
    const chosen = this.actions.chosen();
    const combat = this.actions.inCombat();
    const rows: HTMLElement[] = [];
    const intro = document.createElement('p');
    intro.className = 'tier-note';
    intro.textContent = t(combat ? 'worldTiers.combat' : 'worldTiers.intro');
    rows.push(intro);
    for (const tier of WORLD_TIERS) {
      const locked = tier > unlocked;
      const row = document.createElement('button');
      row.className = `tier-row${tier === chosen ? ' current' : ''}`;
      row.dataset.testid = `tier-${tier}`;
      row.disabled = locked || combat || tier === chosen;
      const name = document.createElement('div');
      name.className = 'tier-name';
      name.textContent = `${ROMAN[tier]} · ${t(`worldTiers.${tier}.name`)}${tier === chosen ? ` · ${t('worldTiers.active')}` : ''}`;
      row.appendChild(name);
      if (locked) {
        const lock = document.createElement('div');
        lock.className = 'tier-lock';
        lock.textContent = t(`worldTiers.${tier}.unlock`);
        row.appendChild(lock);
      } else {
        const fx = document.createElement('div');
        fx.className = 'tier-effects';
        fx.replaceChildren(...tierEffectLines(tier).flatMap((line, i) => (i === 0 ? [document.createTextNode(line)] : [document.createElement('br'), document.createTextNode(line)])));
        row.appendChild(fx);
      }
      row.addEventListener('click', () => {
        this.actions.pick(tier);
        this.refresh();
      });
      rows.push(row);
    }
    this.body.replaceChildren(...rows);
  }
}
