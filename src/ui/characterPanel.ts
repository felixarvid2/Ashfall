/** Character panel (C): attributes, offense, defense and utility numbers. */
import type { CombatStats, DerivedStats, Health, Progression } from '../core/components';
import { t } from '../data/i18n';
import { armorMitigation } from '../systems/damage';
import { xpToNext } from '../systems/loot/generate';

export interface CharacterSnapshot {
  className: string;
  progression: Progression;
  combat: CombatStats;
  derived: DerivedStats;
  health: Health;
  resourceMax: number;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export class CharacterPanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly snapshot: () => CharacterSnapshot) {
    this.root = document.createElement('div');
    this.root.className = 'character-panel panel';
    this.root.hidden = true;
    const title = document.createElement('h2');
    title.textContent = t('ui.character');
    this.body = document.createElement('div');
    this.root.append(title, this.body);
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    if (this.open) this.refresh();
  }

  refresh(): void {
    if (!this.open) return;
    const s = this.snapshot();
    const c = s.combat;
    const a = s.derived.attributes;
    const sections: [string, [string, string][]][] = [
      [
        'attributes',
        [
          [t('stats.strength'), String(Math.round(a.strength))],
          [t('stats.dexterity'), String(Math.round(a.dexterity))],
          [t('stats.intelligence'), String(Math.round(a.intelligence))],
          [t('stats.willpower'), String(Math.round(a.willpower))],
        ],
      ],
      [
        'offense',
        [
          [t('items.damageEstimate'), s.derived.damageEstimate.toFixed(1)],
          [t('stats.weaponDamage'), c.weaponDamage.toFixed(0)],
          [t('stats.critChance'), pct(c.critChance)],
          [t('stats.critDamage'), pct(c.critDamage)],
          [t('stats.attackSpeed'), pct(c.attackSpeed)],
          ...c.additive.map((b) => [t(`stats.${b.source ?? 'damage'}`), pct(b.value)] as [string, string]),
        ],
      ],
      [
        'defense',
        [
          [t('stats.maxLife'), String(Math.round(s.health.max))],
          [t('stats.armor'), String(Math.round(c.armor))],
          [t('ui.armorReduction'), pct(armorMitigation(c.armor, s.progression.level))],
          [t('stats.resistHeat'), pct(c.resist.heat ?? 0)],
          [t('stats.resistCold'), pct(c.resist.cold ?? 0)],
          [t('stats.resistToxic'), pct(c.resist.toxic ?? 0)],
          [t('stats.resistEnergy'), pct(c.resist.energy ?? 0)],
          [t('stats.resistVoid'), pct(c.resist.void ?? 0)],
          [t('stats.damageReduction'), pct(c.damageReduction)],
        ],
      ],
      [
        'utility',
        [
          [t('stats.cooldownReduction'), pct(c.cooldownReduction)],
          [t('stats.resourceGen'), pct(c.resourceGen)],
          [t('stats.moveSpeed'), pct(s.derived.moveSpeedBonus)],
          [t('stats.barrierBonus'), pct(c.barrierBonus)],
          [t('stats.potionHealing'), pct(c.potionHealing)],
          [t('stats.lifeOnKill'), String(Math.round(c.lifeOnKill))],
        ],
      ],
    ];
    const head = document.createElement('div');
    head.className = 'char-head';
    head.textContent = `${s.className} · ${t('ui.level', { level: s.progression.level })} · ${t('ui.xp', {
      xp: Math.floor(s.progression.xp),
      next: xpToNext(s.progression.level),
    })}`;
    const blocks = sections.map(([key, rows]) => {
      const block = document.createElement('div');
      block.className = 'char-section';
      const h = document.createElement('h3');
      h.textContent = t(`ui.sections.${key}`);
      const dl = document.createElement('dl');
      for (const [label, value] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dl.append(dt, dd);
      }
      block.append(h, dl);
      return block;
    });
    this.body.replaceChildren(head, ...blocks);
  }
}
