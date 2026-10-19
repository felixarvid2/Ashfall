/**
 * Tier Beacon panel (left side, opened from the Tier Beacon in each hub): pick any unlocked World Tier and
 * see what each one changes (docs/endgame.md). Locked tiers show how they unlock; picking is disabled in combat.
 */
import { t } from '../data/i18n';
import { RIFT } from '../data/endgame/rifts';
import { TIER_TABLE, WORLD_TIERS, type WorldTier } from '../data/endgame/tiers';
import { armConfirm } from './confirmSheet';

export interface TierPanelActions {
  /** Highest tier the account has unlocked. */
  unlocked(): number;
  /** The tier in effect. */
  chosen(): number;
  inCombat(): boolean;
  pick(tier: WorldTier): void;
  /** Best Deep Rift level cleared (the progress shown on locked tiers). */
  riftBest?(): number;
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

/** A one-line effect chip; `tone` marks how the tier differs from the one in effect (P097). */
export interface TierChip {
  text: string;
  tone: '' | 'harder' | 'easier' | 'better' | 'worse';
}

const pct = (factor: number): number => Math.round((factor - 1) * 100);

/** The short effect chips of a tier, compared with `current` (the tier in effect). */
export function tierChips(tier: WorldTier, current: number): TierChip[] {
  const m = TIER_TABLE[tier];
  const c = TIER_TABLE[(current as WorldTier) in TIER_TABLE ? (current as WorldTier) : 1];
  if (tier === 1) return [{ text: t('worldTiers.chips.campaign'), tone: tier === current ? '' : 'easier' }];
  const cmp = (a: number, b: number, up: TierChip['tone'], down: TierChip['tone']): TierChip['tone'] => (a > b ? up : a < b ? down : '');
  return [
    {
      text: t('worldTiers.chips.enemies', { life: pct(m.enemyLife), damage: pct(m.enemyDamage) }),
      tone: cmp(m.enemyLife + m.enemyDamage, c.enemyLife + c.enemyDamage, 'harder', 'easier'),
    },
    {
      text: m.xp === m.gold ? t('worldTiers.chips.rewards', { pct: pct(m.xp) }) : t('worldTiers.chips.rewardsSplit', { xp: pct(m.xp), gold: pct(m.gold) }),
      tone: cmp(m.xp + m.gold, c.xp + c.gold, 'better', 'worse'),
    },
    { text: t('worldTiers.chips.loot', { power: m.itemPower }), tone: cmp(m.itemPower, c.itemPower, 'better', 'worse') },
  ];
}

/** Deep Rift level that unlocks a tier, or null for tiers that unlock another way. */
function riftLevelFor(tier: WorldTier): number | null {
  return RIFT.tierUnlocks.find((u) => u.tier === tier)?.level ?? null;
}

export class TierPanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  /** The state the body was last built from; it is rebuilt only when this changes (P096). */
  private builtKey = '';

  constructor(parent: HTMLElement, private readonly actions: TierPanelActions) {
    this.root = document.createElement('div');
    this.root.className = 'panel tier-panel';
    this.root.hidden = true;
    this.root.dataset.testid = 'tier-panel';
    // The shared panel header (panelStack.register) takes this heading and adds the close button.
    const title = document.createElement('h2');
    title.textContent = t('worldTiers.title');
    this.body = document.createElement('div');
    this.root.append(title, this.body);
    parent.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.builtKey = '';
    this.refresh();
  }

  close(): void {
    this.root.hidden = true;
  }

  /**
   * The game calls this twice a second. The buttons are rebuilt only when the unlocked tier, the chosen tier or
   * the combat state changed: a rebuild between touchstart and touchend would swallow the tap.
   */
  refresh(): void {
    if (!this.open) return;
    const unlocked = this.actions.unlocked();
    const chosen = this.actions.chosen();
    const combat = this.actions.inCombat();
    const best = this.actions.riftBest?.() ?? 0;
    const key = `${unlocked}|${chosen}|${combat}|${best}`;
    if (key === this.builtKey) return;
    this.builtKey = key;
    const rows: HTMLElement[] = [];
    if (combat) {
      const banner = document.createElement('div');
      banner.className = 'tier-banner';
      banner.dataset.testid = 'tier-combat';
      banner.setAttribute('role', 'status');
      banner.textContent = t('worldTiers.combatBanner');
      rows.push(banner);
    }
    const intro = document.createElement('p');
    intro.className = 'tier-note';
    intro.textContent = t(combat ? 'worldTiers.combat' : 'worldTiers.intro');
    rows.push(intro);
    for (const tier of WORLD_TIERS) rows.push(this.row(tier, { unlocked, chosen, combat, best }));
    this.body.replaceChildren(...rows);
  }

  private row(tier: WorldTier, s: { unlocked: number; chosen: number; combat: boolean; best: number }): HTMLElement {
    const locked = tier > s.unlocked;
    const active = tier === s.chosen;
    const row = document.createElement('div');
    row.className = `tier-row${active ? ' current' : ''}${locked ? ' locked' : ''}`;
    row.dataset.testid = `tier-row-${tier}`;
    const name = document.createElement('div');
    name.className = 'tier-name';
    name.textContent = `${ROMAN[tier]} · ${t(`worldTiers.${tier}.name`)}`;
    // One button per row: Switch (two taps), or the reason there is none.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tier-pick';
    btn.dataset.testid = `tier-${tier}`;
    btn.disabled = locked || s.combat || active;
    btn.textContent = locked ? t('worldTiers.locked') : active ? t('worldTiers.active') : t('worldTiers.switch');
    if (!btn.disabled) {
      armConfirm(btn, {
        armedLabel: t('panels.confirm'),
        run: () => {
          this.actions.pick(tier);
          this.refresh();
        },
      });
    }
    row.append(name, btn);
    const detail = document.createElement('div');
    detail.className = 'tier-detail';
    if (locked) {
      const lock = document.createElement('div');
      lock.className = 'tier-lock';
      lock.textContent = t(`worldTiers.${tier}.unlock`);
      detail.append(lock);
      const need = riftLevelFor(tier);
      if (need !== null) {
        const progress = document.createElement('div');
        progress.className = 'tier-progress';
        progress.dataset.testid = `tier-progress-${tier}`;
        progress.textContent = t('worldTiers.progress', { best: Math.min(s.best, need), need });
        const bar = document.createElement('span');
        bar.className = 'tier-progress-bar';
        bar.style.setProperty('--fill', `${Math.min(100, Math.round((s.best / need) * 100))}%`);
        progress.append(bar);
        detail.append(progress);
      }
    } else {
      for (const chip of tierChips(tier, s.chosen)) {
        const c = document.createElement('span');
        c.className = `tier-chip${chip.tone ? ` ${chip.tone}` : ''}`;
        c.textContent = chip.text;
        detail.append(c);
      }
    }
    row.append(detail);
    return row;
  }
}
