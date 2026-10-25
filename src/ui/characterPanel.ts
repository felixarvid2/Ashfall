/**
 * Character panel (C): a header card (portrait, name, level, XP, gold, resource), collapsible sections for
 * attributes, offense, defense and utility, and shortcuts to the skill and inventory panels. The DOM is built
 * once; the numbers refresh in place (four times a second), so an open section or an open stat sheet survives.
 */
import type { CombatStats, DerivedStats, Health, Progression } from '../core/components';
import { t } from '../data/i18n';
import { armorMitigation } from '../systems/damage';
import { xpToNext } from '../systems/loot/generate';
import { panelStack } from './panelStack';
import { tooltipSheet } from './tooltipSheet';
import { getJsonPref, setJsonPref } from '../core/localPrefs';

export interface CharacterSnapshot {
  className: string;
  /** The hero's own name; the class name when none was chosen. */
  name?: string;
  classId?: string;
  progression: Progression;
  combat: CombatStats;
  derived: DerivedStats;
  health: Health;
  resourceMax: number;
  resource?: { kind: string; current: number; max: number };
  gold?: number;
  /** Mean item power of the worn gear (B034); the row is hidden when nothing is worn. */
  gearPower?: number;
  bag?: { used: number; max: number };
  portraitUrl?: string | null;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** One displayed number. `info` is the key under `ui.statInfo` that explains it. */
interface StatRow {
  key: string;
  label: string;
  value: string;
  info: string;
}

type SectionKey = 'attributes' | 'offense' | 'defense' | 'utility';

/** Sections open the first time the panel is shown (P058). */
const DEFAULT_OPEN: Record<SectionKey, boolean> = { attributes: true, offense: true, defense: true, utility: false };
const OPEN_KEY = 'ashfall.charSections';

function loadOpen(): Record<SectionKey, boolean> {
  const raw = getJsonPref<Record<string, unknown>>(OPEN_KEY, {});
  const out = { ...DEFAULT_OPEN };
  for (const k of Object.keys(out) as SectionKey[]) if (typeof raw[k] === 'boolean') out[k] = raw[k] as boolean;
  return out;
}

function saveOpen(open: Record<SectionKey, boolean>): void {
  // Storage may be blocked; the sections just reset next time.
  setJsonPref(OPEN_KEY, open);
}

/** The numbers of every section, from a snapshot. Exported for tests. */
export function characterRows(s: CharacterSnapshot): Record<SectionKey, StatRow[]> {
  const c = s.combat;
  const a = s.derived.attributes;
  const row = (key: string, label: string, value: string, info = key): StatRow => ({ key, label, value, info });
  const resist = (id: 'heat' | 'cold' | 'toxic' | 'energy' | 'void', label: string) => row(`resist.${id}`, label, pct(c.resist[id] ?? 0), 'resist');
  return {
    attributes: [
      row('strength', t('stats.strength'), String(Math.round(a.strength))),
      row('dexterity', t('stats.dexterity'), String(Math.round(a.dexterity))),
      row('intelligence', t('stats.intelligence'), String(Math.round(a.intelligence))),
      row('willpower', t('stats.willpower'), String(Math.round(a.willpower))),
    ],
    offense: [
      row('damage', t('items.damageEstimate'), s.derived.damageEstimate.toFixed(1)),
      row('weaponDamage', t('stats.weaponDamage'), c.weaponDamage.toFixed(0)),
      row('critChance', t('stats.critChance'), pct(c.critChance)),
      row('critDamage', t('stats.critDamage'), pct(c.critDamage)),
      row('attackSpeed', t('stats.attackSpeed'), pct(c.attackSpeed)),
      ...c.additive.map((b, i) => row(`bonus.${i}.${b.source ?? 'damage'}`, t(`stats.${b.source ?? 'damage'}`), pct(b.value), 'bonus')),
    ],
    defense: [
      row('maxLife', t('stats.maxLife'), String(Math.round(s.health.max))),
      row('armor', t('stats.armor'), String(Math.round(c.armor))),
      row('armorReduction', t('ui.armorReduction'), pct(armorMitigation(c.armor, s.progression.level))),
      resist('heat', t('stats.resistHeat')),
      resist('cold', t('stats.resistCold')),
      resist('toxic', t('stats.resistToxic')),
      resist('energy', t('stats.resistEnergy')),
      resist('void', t('stats.resistVoid')),
      row('damageReduction', t('stats.damageReduction'), pct(c.damageReduction)),
    ],
    utility: [
      row('cooldownReduction', t('stats.cooldownReduction'), pct(c.cooldownReduction)),
      row('resourceGen', t('stats.resourceGen'), pct(c.resourceGen)),
      row('moveSpeed', t('stats.moveSpeed'), pct(s.derived.moveSpeedBonus)),
      row('barrierBonus', t('stats.barrierBonus'), pct(c.barrierBonus)),
      row('potionHealing', t('stats.potionHealing'), pct(c.potionHealing)),
      row('lifeOnKill', t('stats.lifeOnKill'), String(Math.round(c.lifeOnKill))),
    ],
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

interface SectionView {
  list: HTMLElement;
  head: HTMLButtonElement;
  /** Row keys and labels as built, to know when the set of rows changed. */
  signature: string;
  values: Map<string, HTMLElement>;
}

export class CharacterPanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly open_: Record<SectionKey, boolean> = loadOpen();
  private readonly sections = new Map<SectionKey, SectionView>();
  private readonly card = el('div', 'char-card');
  private readonly portrait = el('div', 'char-card-portrait');
  private readonly nameEl = el('div', 'char-card-name');
  private readonly subEl = el('div', 'char-card-sub');
  private readonly gearEl = el('div', 'char-card-gear');
  private readonly xpFill = el('i');
  private readonly xpText = el('div', 'char-xp-text');
  private readonly goldEl = el('div', 'char-card-gold');
  private readonly resourceEl = el('div', 'char-resource');
  private readonly resourceFill = el('i');
  private readonly resourceText = el('span');
  private readonly skillsBtn = el('button', 'char-go char-go-skills');
  private readonly bagBtn = el('button', 'char-go char-go-bag');
  private portraitUrl: string | null | undefined;
  /** The stat whose explanation sheet is open, and the element that shows its value. */
  private statSheet: { row: string; value: HTMLElement } | null = null;
  private last: Record<SectionKey, StatRow[]> | null = null;

  constructor(parent: HTMLElement, private readonly snapshot: () => CharacterSnapshot) {
    this.root = el('div', 'character-panel panel');
    this.root.hidden = true;
    const title = el('h2', undefined, t('ui.character'));
    this.body = el('div', 'char-body');

    const text = el('div', 'char-card-text');
    const xpBar = el('div', 'char-xp');
    xpBar.append(this.xpFill);
    this.gearEl.dataset.testid = 'char-gear-power';
    text.append(this.nameEl, this.subEl, this.gearEl, xpBar, this.xpText);
    this.card.append(this.portrait, text, this.goldEl);
    const resourceBar = el('span', 'char-resource-bar');
    resourceBar.append(this.resourceFill);
    this.resourceEl.append(resourceBar, this.resourceText);

    const sections = el('div', 'char-sections');
    for (const key of ['attributes', 'offense', 'defense', 'utility'] as const) sections.appendChild(this.buildSection(key));

    this.skillsBtn.type = 'button';
    this.skillsBtn.dataset.testid = 'char-go-skills';
    this.skillsBtn.addEventListener('click', () => this.go('skills'));
    this.bagBtn.type = 'button';
    this.bagBtn.dataset.testid = 'char-go-bag';
    this.bagBtn.addEventListener('click', () => this.go('inventory'));
    const footer = el('div', 'char-footer');
    footer.append(this.skillsBtn, this.bagBtn);

    this.body.append(this.card, this.resourceEl, sections, footer);
    this.root.append(title, this.body);
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    if (this.open) this.refresh();
    else tooltipSheet.hide();
  }

  /** Switch to another panel: this one closes first, so a phone never has two main panels stacked. */
  private go(id: string): void {
    if (!panelStack.has(id)) return;
    if (panelStack.has('character') && panelStack.isOpen('character')) panelStack.close('character');
    panelStack.open(id);
  }

  private buildSection(key: SectionKey): HTMLElement {
    const block = el('div', 'char-section');
    block.dataset.section = key;
    const head = el('button', 'char-section-head');
    head.type = 'button';
    head.append(el('h3', undefined, t(`ui.sections.${key}`)), el('span', 'char-section-chev', '▾'));
    const list = el('div', 'char-rows');
    const apply = () => {
      const open = this.open_[key];
      block.classList.toggle('collapsed', !open);
      head.setAttribute('aria-expanded', String(open));
      list.hidden = !open;
    };
    head.addEventListener('click', () => {
      this.open_[key] = !this.open_[key];
      saveOpen(this.open_);
      apply();
    });
    apply();
    block.append(head, list);
    this.sections.set(key, { list, head, signature: '', values: new Map() });
    return block;
  }

  refresh(): void {
    if (!this.open) return;
    const s = this.snapshot();
    this.refreshCard(s);
    const rows = characterRows(s);
    this.last = rows;
    for (const key of ['attributes', 'offense', 'defense', 'utility'] as const) this.refreshSection(key, rows[key]);
    if (this.statSheet) {
      const found = Object.values(rows).flat().find((r) => r.key === this.statSheet!.row);
      if (found) this.statSheet.value.textContent = found.value;
    }
  }

  private refreshCard(s: CharacterSnapshot): void {
    const level = s.progression.level;
    const next = xpToNext(level);
    this.nameEl.textContent = s.name || s.className;
    // The class name is the name when the hero was not named: then the second line is just the level.
    this.subEl.textContent = s.name && s.name !== s.className ? `${s.className} · ${t('ui.level', { level })}` : t('ui.level', { level });
    this.gearEl.textContent = s.gearPower ? t('ui.charPanel.gearPower', { n: s.gearPower }) : '';
    const ratio = next > 0 && Number.isFinite(next) ? Math.min(1, s.progression.xp / next) : 1;
    this.xpFill.style.width = `${(ratio * 100).toFixed(1)}%`;
    this.xpText.textContent = t('ui.xp', { xp: Math.floor(s.progression.xp), next });
    this.goldEl.textContent = s.gold === undefined ? '' : t('ui.gold', { gold: s.gold.toLocaleString('en-US') });
    if (s.portraitUrl !== this.portraitUrl) {
      this.portraitUrl = s.portraitUrl;
      this.portrait.replaceChildren(
        s.portraitUrl
          ? Object.assign(document.createElement('img'), { src: s.portraitUrl, alt: '', className: 'char-portrait', draggable: false })
          : el('div', 'char-portrait placeholder', s.className.slice(0, 1)),
      );
    }
    const r = s.resource;
    this.resourceEl.hidden = !r || r.max <= 0;
    if (r && r.max > 0) {
      this.resourceEl.dataset.kind = r.kind;
      this.resourceFill.style.width = `${Math.max(0, Math.min(100, (r.current / r.max) * 100)).toFixed(1)}%`;
      this.resourceText.textContent = `${t(`resources.${r.kind}`)} ${Math.round(r.current)} / ${Math.round(r.max)}`;
    }
    const points = s.progression.skillPoints;
    this.skillsBtn.textContent = points > 0 ? t('ui.charPanel.skillsPoints', { n: points }) : t('ui.charPanel.skills');
    this.skillsBtn.classList.toggle('has-points', points > 0);
    this.bagBtn.textContent = s.bag ? t('ui.charPanel.bagFull', { used: s.bag.used, max: s.bag.max }) : t('ui.charPanel.bag');
  }

  /** Same rows: only the numbers change. A different set of rows (a new damage bonus) rebuilds that section. */
  private refreshSection(key: SectionKey, rows: StatRow[]): void {
    const view = this.sections.get(key)!;
    const signature = rows.map((r) => `${r.key}:${r.label}`).join('|');
    if (signature !== view.signature) {
      view.signature = signature;
      view.values.clear();
      view.list.replaceChildren(
        ...rows.map((r) => {
          // A div, not a button: the touch layout makes every button 44 px high and a list of 25 would run long.
          const b = el('div', 'char-row');
          b.setAttribute('role', 'button');
          b.tabIndex = 0;
          b.dataset.stat = r.key;
          const value = el('span', 'char-row-value', r.value);
          b.append(el('span', 'char-row-label', r.label), value);
          b.addEventListener('click', () => this.showStat(r.key));
          b.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            this.showStat(r.key);
          });
          view.values.set(r.key, value);
          return b;
        }),
      );
      return;
    }
    for (const r of rows) {
      const v = view.values.get(r.key);
      if (v && v.textContent !== r.value) v.textContent = r.value;
    }
  }

  /** Tap a number: what it does and how it is made, in a sheet whose value keeps updating (P059). */
  private showStat(key: string): void {
    const row = this.last ? Object.values(this.last).flat().find((r) => r.key === key) : undefined;
    if (!row) return;
    const content = el('div', 'char-stat-sheet');
    const value = el('div', 'char-stat-value', row.value);
    content.append(value, el('p', undefined, t(`ui.statInfo.${row.info}`)));
    this.statSheet = { row: key, value };
    tooltipSheet.show({
      content,
      title: row.label,
      onClose: () => {
        if (this.statSheet?.value === value) this.statSheet = null;
      },
    });
  }
}
