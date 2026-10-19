/**
 * In-game HUD: life and resource orbs, action bar with cooldowns, wave tracker,
 * target frame and death screen. DOM is only touched when a value changes.
 */
import { cssUrl } from './art';
import { BannerQueue, type BannerItem } from './bannerQueue';
import { haptic, setLowLife } from './haptics';
import { capStatuses, isExpiring, statusSlots } from './statusTiles';
import { classDef, skill } from '../data/db';
import { t } from '../data/i18n';
import type { Action, MoveMode } from '../data/settings';
import type { SkillDef } from '../data/schemas';
import { BOSS_SCRIPTS } from '../data/bosses';

/** "KeyW" → "W", "Digit1" → "1", "F3" → "F3". */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Backquote') return '§';
  if (code === 'Space') return 'Space';
  if (code.startsWith('Shift')) return 'Shift';
  return code;
}

/** Life fractions where the boss script changes phase (tick marks on its bar); `{}` for a script with one phase. */
export function bossPhaseTicks(script: string | undefined): { phases?: number[] } {
  if (!script) return {};
  const phases = (BOSS_SCRIPTS[script] ?? []).map((p) => p.below).filter((b) => b < 1);
  return phases.length > 0 ? { phases } : {};
}

export interface SlotState {
  id: string | null;
  cooldown: number;
  cooldownMax: number;
  affordable: boolean;
}

/** One status tile above the action bar. */
/** A status effect's icon (public/assets/ui/status/, from game-icons.net). */
export const statusIconUrl = (id: string): string => `${import.meta.env.BASE_URL}assets/ui/status/${id}.svg`;

export interface HudStatus {
  id: string;
  remaining: number;
  color: string;
  /** Harmful (burning, slowed, stunned…): drawn with a red frame after the boons. */
  harmful?: boolean;
  /** Show the countdown (statuses refreshed every tick have none). */
  timed?: boolean;
  stacks?: number;
}

export interface HudState {
  life: { current: number; max: number; barrier: number };
  resource: { kind: string; current: number; max: number; overheating: boolean };
  slots: SlotState[];
  dodge: { cooldown: number; max: number };
  potion: { charges: number; max: number; /** Seconds until the next charge (touch recharge ring). */ recharge?: number; rechargeMax?: number };
  /** Enemies within about 15 m: the touch HUD dims its secondary parts while this is true. */
  combat?: boolean;
  wave: { wave: number; alive: number; phase: 'intermission' | 'active'; timer: number } | null;
  /** Open world: region and subzone name, shown where the wave tracker sits in the arena. */
  location?: { title: string; sub: string };
  /** World Tier badge text ('WT II Veteran'), shown under the region name once a tier above I is unlocked. */
  tier?: string;
  target: { name: string; current: number; max: number; statuses: string[]; color?: string; affixes?: string[]; portrait?: string; /** Life fractions where a boss changes phase (tick marks on its bar). */ phases?: number[] } | null;
  /** World event in progress near the player. */
  event?: { title: string; text: string };
  /** Statuses on the player: pylon buffs, wards, and harm like burning or poison. */
  buffs?: HudStatus[];
  /** Spore exposure 0..1 (Hydroponic Vaults). */
  exposure?: number;
  /** Flares left (Deep Mines). */
  flares?: { charges: number; max: number; key: string };
  dead: boolean;
  xp: { level: number; current: number; next: number; skillPoints: number };
}

/** Seconds after dying before the touch respawn button can be tapped. */
const DEATH_LOCK = 1.2;

const SLOT_LABELS = ['LMB', 'RMB', '1', '2', '3', '4'];

class Orb {
  readonly el: HTMLDivElement;
  private readonly ghost: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly shield: HTMLDivElement;
  private readonly text: HTMLDivElement;
  /** Portrait bar: caption ("HEAT"), value, barrier ("+40") and the overheat word; the desktop orb shows only the value. */
  private readonly cap: HTMLSpanElement;
  private readonly val: HTMLSpanElement;
  private readonly extraEl: HTMLSpanElement;
  private last = '';
  private lastCur = -1;
  private wasWarn = false;
  private label: string;

  private kind: string;

  constructor(kind: string, label: string) {
    this.kind = kind;
    this.label = label;
    this.el = document.createElement('div');
    this.el.className = `orb orb-${kind}`;
    this.el.title = label;
    this.ghost = document.createElement('div');
    this.ghost.className = 'orb-ghost';
    this.fill = document.createElement('div');
    this.fill.className = 'orb-fill';
    this.shield = document.createElement('div');
    this.shield.className = 'orb-shield';
    this.text = document.createElement('div');
    this.text.className = 'orb-text';
    this.cap = Object.assign(document.createElement('span'), { className: 'orb-cap', textContent: label });
    this.val = Object.assign(document.createElement('span'), { className: 'orb-val' });
    this.extraEl = Object.assign(document.createElement('span'), { className: 'orb-extra' });
    const over = Object.assign(document.createElement('span'), { className: 'orb-over', textContent: t('hud.overheating') });
    this.text.append(this.cap, this.val, this.extraEl, over);
    const glass = document.createElement('div');
    glass.className = 'orb-glass';
    this.el.append(this.ghost, this.fill, this.shield, glass, this.text);
  }

  /** Switch colour scheme and label (Heat, Focus, Biomass). */
  setKind(kind: string, label: string): void {
    if (kind === this.kind) return;
    this.el.classList.replace(`orb-${this.kind}`, `orb-${kind}`);
    this.kind = kind;
    this.label = label;
    this.el.title = label;
    this.cap.textContent = label;
    this.last = '';
  }

  set(current: number, max: number, extra = 0, warn = false): void {
    const key = `${Math.ceil(current)}/${max}/${Math.ceil(extra)}/${warn}`;
    if (key === this.last) return;
    this.last = key;
    const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    // Fractions as custom properties: the orb grows its fill upwards, the portrait bar sideways.
    this.el.style.setProperty('--fill', String(pct));
    this.el.style.setProperty('--shield', String(Math.min(1, extra / Math.max(1, max))));
    this.val.textContent = `${Math.ceil(current)} / ${Math.round(max)}`;
    this.extraEl.textContent = extra > 0 ? ` +${Math.ceil(extra)}` : '';
    this.el.setAttribute('aria-label', `${this.label} ${this.val.textContent}${this.extraEl.textContent}`);
    this.el.classList.toggle('warn', warn);
    // A single hit of more than a tenth of the bar flashes it white (H006).
    if (this.kind === 'life' && this.lastCur >= 0 && this.lastCur - current > max * 0.1) this.flash();
    this.lastCur = current;
    // Overheating starts: one buzz (H008).
    if (warn && !this.wasWarn && this.kind !== 'life') haptic('overheat');
    this.wasWarn = warn;
  }

  private flash(): void {
    this.el.classList.add('hit');
    setTimeout(() => this.el.classList.remove('hit'), 120);
  }

  /** Brief ring of light when the character levels up (H063). */
  pulse(): void {
    this.el.classList.add('levelup');
    setTimeout(() => this.el.classList.remove('levelup'), 700);
  }
}

/** Extra touch-button state for `Slot.set`. */
interface SlotExtra {
  /** Corner badge (potion charges). */
  badge?: string;
  /** False when only the resource is missing (not the cooldown). */
  affordable?: boolean;
  /** Resource cost shown at the bottom of the button. */
  cost?: string;
}

class Slot {
  readonly el: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly cd: HTMLDivElement;
  private readonly cdText: HTMLDivElement;
  private last = '';

  constructor(label: string, private readonly onHover: (slot: Slot | null) => void) {
    this.el = document.createElement('div');
    this.el.className = 'slot';
    const key = document.createElement('div');
    key.className = 'slot-key';
    key.textContent = label;
    this.name = document.createElement('div');
    this.name.className = 'slot-name';
    this.cd = document.createElement('div');
    this.cd.className = 'slot-cd';
    this.cdText = document.createElement('div');
    this.cdText.className = 'slot-cd-text';
    this.el.append(this.name, this.cd, this.cdText, key);
    this.el.addEventListener('mouseenter', () => this.onHover(this));
    this.el.addEventListener('mouseleave', () => this.onHover(null));
  }

  skillId: string | null = null;

  set(name: string, category: string, cooldown: number, max: number, usable: boolean, icon: string | null = null, extra: SlotExtra = {}): void {
    const frac = max > 0 ? Math.min(1, cooldown / max) : 0;
    const key = `${name}|${category}|${frac.toFixed(2)}|${usable}|${cooldown > 0 ? Math.ceil(cooldown) : 0}|${icon}|${extra.badge ?? ''}|${extra.affordable ?? ''}|${extra.cost ?? ''}`;
    if (key === this.last) return;
    this.last = key;
    // Touch buttons: a flash when the cooldown ends, a red tint when only the resource is missing, a charge/cost badge.
    const wasCooling = this.el.classList.contains('cooling');
    this.el.classList.toggle('cooling', cooldown > 0);
    if (wasCooling && cooldown <= 0) {
      this.el.classList.remove('ready');
      void this.el.offsetWidth;
      this.el.classList.add('ready');
    }
    this.el.classList.toggle('no-resource', extra.affordable === false && cooldown <= 0 && category !== 'empty');
    if (extra.badge !== undefined) this.el.dataset.badge = extra.badge;
    else delete this.el.dataset.badge;
    if (extra.cost) this.el.dataset.cost = extra.cost;
    else delete this.el.dataset.cost;
    if (icon) {
      this.name.replaceChildren(Object.assign(document.createElement('img'), { src: icon, alt: name, className: 'slot-icon' }));
    } else {
      this.name.textContent = name;
    }
    this.el.dataset.category = category;
    this.cd.style.background =
      frac > 0 ? `conic-gradient(rgba(0,0,0,0.72) ${frac * 360}deg, transparent 0deg)` : 'transparent';
    this.cdText.textContent = cooldown > 0.05 && max >= 1 ? String(Math.ceil(cooldown)) : '';
    this.el.classList.toggle('unusable', !usable);
  }

  private lastRecharge = '';

  /** Fraction (0..1) of the way to the next charge left to wait: the touch layout draws it as a ring. */
  setRecharge(frac: number): void {
    const v = frac.toFixed(2);
    if (v === this.lastRecharge) return;
    this.lastRecharge = v;
    this.el.style.setProperty('--recharge', v);
  }
}

export class Hud {
  private readonly hint: HTMLDivElement;
  private readonly lifeOrb = new Orb('life', t('hud.life'));
  private readonly heatOrb = new Orb('heat', t('hud.heat'));
  private readonly slots: Slot[];
  private readonly dodgeSlot: Slot;
  private readonly potionSlot: Slot;
  private readonly waveTitle: HTMLDivElement;
  private readonly waveSub: HTMLDivElement;
  private readonly tierBadge: HTMLDivElement;
  private readonly target: HTMLDivElement;
  private readonly targetName: HTMLDivElement;
  private readonly targetFill: HTMLDivElement;
  private readonly targetStatus: HTMLDivElement;
  private readonly targetAffix: HTMLSpanElement;
  private readonly targetSep: HTMLSpanElement;
  private readonly targetStatusText: HTMLSpanElement;
  private readonly targetPct: HTMLSpanElement;
  private readonly targetTrack: HTMLDivElement;
  /** Portrait: the left column under the menu (target, statuses, region label, endgame stack) flows in here. */
  readonly leftColumn: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private readonly levelChip: HTMLDivElement;
  private readonly levelNum: HTMLSpanElement;
  private readonly levelDot: HTMLSpanElement;
  private readonly xpBar: HTMLDivElement;
  private readonly banners = new BannerQueue();
  private lastXpCurrent = -1;
  private lastXpLevel = -1;
  private xpFlash = 0;
  private lastRegion = { name: '', at: -Infinity };
  private labelAge = 0;
  private labelReveal = 0;
  private readonly root: HTMLElement;
  private readonly buffBar: HTMLDivElement;
  private lastBuffs = '';
  private readonly exposure: HTMLDivElement;
  private readonly exposureFill: HTMLDivElement;
  private readonly exposureText: HTMLDivElement;
  private readonly flares: HTMLDivElement;
  private lastFlares = '';
  private lastExposure = -1;
  private readonly eventBox: HTMLDivElement;
  private lastEvent = '';
  private readonly banner: HTMLDivElement;
  /** Boss portrait in the target frame, and the intro card when a boss joins the fight. */
  private readonly targetPortrait: HTMLImageElement;
  private readonly bossCard: HTMLDivElement;
  private bossCardTimer = 0;
  private readonly death: HTMLDivElement;
  private readonly deathHint: HTMLDivElement;
  private readonly riseButton: HTMLButtonElement;
  /** Seconds left before the touch respawn button works (counts down while dead). */
  private deathLock = 0;
  private deathAt = 0;
  private lastRiseSecs = -1;
  private wasDead = false;
  private readonly tooltip: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly xpText: HTMLDivElement;
  private lastXp = '';
  private lastWave = '';
  private lastTarget = '';
  private respawnKey = 'R';
  private resolveSkill: (id: string) => SkillDef = skill;
  private resolveIcon: (id: string) => string | null = () => null;

  /** Use effective (compiled) skill numbers and generated icons in the bar and tooltips. */
  setSkillResolvers(def: (id: string) => SkillDef, icon: (id: string) => string | null): void {
    this.resolveSkill = def;
    this.resolveIcon = icon;
  }

  constructor(root: HTMLElement, onRespawn: () => void) {
    this.root = root;
    const title = document.createElement('div');
    title.className = 'hud-title';
    const h1 = document.createElement('h1');
    h1.textContent = t('game.title');
    const sub = document.createElement('p');
    sub.textContent = t('game.subtitle');
    this.hint = document.createElement('p');
    this.hint.className = 'hud-hint';
    title.append(h1, sub, this.hint);

    const bar = document.createElement('div');
    bar.className = 'action-bar';
    const slotRow = document.createElement('div');
    slotRow.className = 'slots';
    this.slots = SLOT_LABELS.map((label) => new Slot(label, (s) => this.showTooltip(s)));
    this.dodgeSlot = new Slot('Space', () => {});
    this.potionSlot = new Slot('Q', () => {});
    this.dodgeSlot.el.classList.add('slot-small');
    this.potionSlot.el.classList.add('slot-small');
    slotRow.append(...this.slots.map((s) => s.el), this.dodgeSlot.el, this.potionSlot.el);
    const middle = document.createElement('div');
    middle.className = 'bar-middle';
    const xp = document.createElement('div');
    xp.className = 'xp-bar';
    this.xpBar = xp;
    this.xpFill = document.createElement('div');
    this.xpFill.className = 'xp-fill';
    this.xpText = document.createElement('div');
    this.xpText.className = 'xp-text';
    xp.append(this.xpFill, this.xpText);
    middle.append(slotRow, xp);
    bar.append(this.lifeOrb.el, middle, this.heatOrb.el);

    const wave = document.createElement('div');
    wave.className = 'wave-tracker';
    this.waveTitle = document.createElement('div');
    this.waveTitle.className = 'wave-title';
    this.waveSub = document.createElement('div');
    this.waveSub.className = 'wave-sub';
    this.tierBadge = document.createElement('div');
    this.tierBadge.className = 'tier-badge';
    this.tierBadge.hidden = true;
    wave.append(this.waveTitle, this.waveSub, this.tierBadge);

    this.target = document.createElement('div');
    this.target.className = 'target-frame';
    this.targetName = document.createElement('div');
    this.targetName.className = 'target-name';
    const track = document.createElement('div');
    track.className = 'target-track';
    this.targetFill = document.createElement('div');
    this.targetFill.className = 'target-fill';
    track.appendChild(this.targetFill);
    this.targetTrack = track;
    this.targetStatus = document.createElement('div');
    this.targetStatus.className = 'target-status';
    this.targetAffix = Object.assign(document.createElement('span'), { className: 'target-affix' });
    this.targetSep = Object.assign(document.createElement('span'), { className: 'target-sep', textContent: '  |  ' });
    this.targetStatusText = Object.assign(document.createElement('span'), { className: 'target-state' });
    this.targetStatus.append(this.targetAffix, this.targetSep, this.targetStatusText);
    this.targetPct = Object.assign(document.createElement('span'), { className: 'target-pct' });
    this.targetPortrait = Object.assign(document.createElement('img'), { className: 'target-portrait', alt: '' });
    this.targetPortrait.hidden = true;
    this.target.append(this.targetPortrait, this.targetName, this.targetPct, track, this.targetStatus);
    this.target.hidden = true;
    // The quest tracker steps below a wide boss frame: its height goes to the CSS (--boss-frame-h).
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => {
        const h = this.target.classList.contains('boss') && !this.target.hidden ? this.target.offsetHeight : 0;
        root.style.setProperty('--boss-frame-h', `${h}px`);
      }).observe(this.target);
    }
    this.bossCard = document.createElement('div');
    this.bossCard.className = 'boss-card';
    this.bossCard.hidden = true;

    this.banner = document.createElement('div');
    this.banner.className = 'center-banner';

    this.death = document.createElement('div');
    this.death.className = 'death-screen';
    const dt = document.createElement('h2');
    dt.textContent = t('hud.youDied');
    this.deathHint = document.createElement('p');
    // Touch: a deliberate button after a short lock, so a thumb still mashing attack/dodge cannot respawn by accident.
    this.riseButton = document.createElement('button');
    this.riseButton.className = 'death-respawn';
    this.riseButton.dataset.testid = 'respawn';
    this.riseButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.deathLock <= 0) onRespawn();
    });
    this.death.append(dt, this.deathHint, this.riseButton);
    this.death.hidden = true;
    this.death.addEventListener('click', () => {
      if (!this.touch) onRespawn();
    });

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.hidden = true;

    this.eventBox = document.createElement('div');
    this.eventBox.className = 'event-box';
    this.eventBox.dataset.testid = 'event-box';
    this.eventBox.hidden = true;
    this.buffBar = document.createElement('div');
    this.buffBar.className = 'buff-bar';
    this.buffBar.dataset.testid = 'buff-bar';

    // Spore exposure meter: fills while you breathe spores, drains in clean air.
    this.exposure = document.createElement('div');
    this.exposure.className = 'exposure-meter';
    this.exposure.dataset.testid = 'exposure';
    this.exposureFill = document.createElement('div');
    this.exposureFill.className = 'exposure-fill';
    this.exposureText = document.createElement('div');
    this.exposureText.className = 'exposure-text';
    this.exposure.append(this.exposureFill, this.exposureText);
    this.exposure.hidden = true;
    // Flares: charges left in the dark.
    this.flares = document.createElement('div');
    this.flares.className = 'flare-count';
    this.flares.dataset.testid = 'flares';
    this.flares.hidden = true;

    // Low-life vignette: first in the root, so every HUD element paints over it (H005).
    this.vignette = document.createElement('div');
    this.vignette.className = 'low-life-vignette';
    root.prepend(this.vignette);
    // Level chip left of the bars (H003), shown in portrait only.
    this.levelChip = document.createElement('div');
    this.levelChip.className = 'level-chip';
    this.levelChip.dataset.testid = 'level-chip';
    this.levelNum = Object.assign(document.createElement('span'), { className: 'level-num' });
    this.levelDot = Object.assign(document.createElement('span'), { className: 'level-dot' });
    this.levelDot.hidden = true;
    this.levelChip.append(Object.assign(document.createElement('span'), { className: 'level-lv', textContent: 'LV' }), this.levelNum, this.levelDot);
    // The portrait left column: a flex column that keeps the target frame, status tiles, region label and the
    // endgame stack from overlapping each other. Elsewhere `display: contents` leaves every child where it was.
    this.leftColumn = document.createElement('div');
    this.leftColumn.className = 'hud-left';
    this.leftColumn.append(this.target, this.buffBar, this.flares, this.eventBox, wave);
    root.append(title, bar, this.leftColumn, this.levelChip, this.bossCard, this.banner, this.death, this.tooltip, this.exposure);
    // Portrait: where the left column ends goes to the CSS (--left-bottom), so loot labels pile up below it.
    if (typeof ResizeObserver !== 'undefined') {
      const col = this.leftColumn;
      new ResizeObserver(() => {
        if (root.classList.contains('portrait') && col.offsetHeight > 0) root.style.setProperty('--left-bottom', `${col.offsetTop + col.offsetHeight}px`);
        else root.style.removeProperty('--left-bottom');
      }).observe(col);
    }
    // A tap on the minimap brings the region label back (H067).
    root.addEventListener('pointerdown', (e) => {
      if ((e.target as Element | null)?.closest?.('.minimap')) this.revealLabel();
    });
  }

  updateHint(moveMode: MoveMode, bindings: Record<Action, string[]>): void {
    const first = (a: Action) => keyLabel(bindings[a][0] ?? '?');
    const move =
      moveMode === 'wasd'
        ? [first('moveUp'), first('moveLeft'), first('moveDown'), first('moveRight')].join('')
        : t('moveMode.clickHint');
    this.hint.textContent = t(moveMode === 'click' ? 'hud.controlsHintClick' : 'hud.controlsHint', {
      move,
      lmb: 'LMB',
      rmb: 'RMB',
      dodge: first('dodge'),
      potion: first('potion'),
      inv: first('inventory'),
      skills: first('skills'),
      map: first('map'),
      quests: first('quests'),
      pickup: first('pickup'),
      debug: first('toggleDebug'),
    });
    this.respawnKey = first('respawn');
    this.deathHint.textContent = this.touch ? t('hud.respawnTap') : t('hud.respawnHint', { key: this.respawnKey });
  }

  private touch = false;

  /** Touch controls on: the action bar becomes on-screen buttons (styled by `.touch-ui`). */
  setTouch(on: boolean): void {
    this.touch = on;
    this.deathHint.textContent = on ? t('hud.respawnTap') : t('hud.respawnHint', { key: this.respawnKey });
  }

  /** True in the upright phone layout (the root carries `portrait`). */
  get portrait(): boolean {
    return this.root.classList.contains('portrait');
  }

  /** The action bar's slot elements in bar order: LMB, RMB, 1–4, dodge, potion. */
  get slotElements(): HTMLElement[] {
    return [...this.slots.map((s) => s.el), this.dodgeSlot.el, this.potionSlot.el];
  }

  /**
   * Big centred message (wave start/clear). Banners queue: a second one waits for the first (H062). The
   * 'levelup' variant is the gold banner with a "spend skill points" button (H063).
   */
  showBanner(text: string, seconds = 2, extra: Pick<BannerItem, 'variant' | 'sub' | 'onTap'> = {}): void {
    if (text === '') return;
    this.banners.push({ text, seconds, ...extra });
  }

  /** Level up: gold banner, a ring of light over the life bar and the level-up buzz. */
  levelUp(skillPoints: number, text: string, sub: string, onTap: () => void): void {
    this.showBanner(text, 3.4, { variant: 'levelup', ...(skillPoints > 0 ? { sub, onTap } : {}) });
    this.lifeOrb.pulse();
    haptic('levelUp');
  }

  private renderBanner(item: BannerItem | null): void {
    const banner = this.banner;
    if (!item) {
      banner.classList.remove('show');
      return;
    }
    banner.classList.toggle('levelup', item.variant === 'levelup');
    if (item.variant === 'levelup' && item.sub) {
      const sub = Object.assign(document.createElement('button'), { className: 'banner-sub', textContent: item.sub });
      sub.dataset.testid = 'banner-sub';
      sub.addEventListener('click', () => item.onTap?.());
      banner.replaceChildren(Object.assign(document.createElement('div'), { className: 'banner-main', textContent: item.text }), sub);
    } else {
      // The text sits in its own element so the phone layout can clamp it to two lines.
      banner.replaceChildren(Object.assign(document.createElement('span'), { className: 'banner-main', textContent: item.text }));
    }
    banner.classList.add('show');
  }

  /** The region label (permanent in the left column) fades after a while; this brings it back for a moment. */
  revealLabel(): void {
    this.labelReveal = 3;
  }

  /** Entering a region: its painting and name, cinema-style, for a few seconds. */
  regionCard(image: string, name: string, subtitle: string): void {
    // Walking back and forth over a border: the card was just there (H064).
    const now = performance.now();
    const portrait = this.root.classList.contains('portrait');
    if (portrait && name === this.lastRegion.name && now - this.lastRegion.at < 60_000) return;
    this.lastRegion = { name, at: now };
    this.bossIntroCard('region-card', image, name, subtitle, portrait ? 2.6 : 4);
  }

  /** A boss joins the fight: its portrait and name sweep in for a few seconds. */
  bossIntro(name: string, portrait: string, subtitle: string): void {
    this.bossIntroCard('boss-card', portrait, name, subtitle, 3.2);
  }

  private bossIntroCard(kind: 'boss-card' | 'region-card', portrait: string, name: string, subtitle: string, seconds: number): void {
    this.bossCard.className = kind;
    this.bossCard.style.setProperty('--card-time', `${seconds}s`);
    this.bossCard.replaceChildren(
      Object.assign(document.createElement('img'), { src: portrait, alt: '' }),
      Object.assign(document.createElement('div'), { className: 'card-name', textContent: name }),
      Object.assign(document.createElement('div'), { className: 'card-sub', textContent: subtitle }),
    );
    this.bossCard.hidden = false;
    // Restart the CSS animation.
    this.bossCard.classList.remove('show');
    void this.bossCard.offsetWidth;
    this.bossCard.classList.add('show');
    this.bossCardTimer = seconds;
  }

  update(state: HudState, dt: number): void {
    if (this.bossCardTimer > 0) {
      this.bossCardTimer -= dt;
      if (this.bossCardTimer <= 0) this.bossCard.hidden = true;
    }
    const evKey = state.event ? `${state.event.title}|${state.event.text}` : '';
    if (evKey !== this.lastEvent) {
      this.lastEvent = evKey;
      this.eventBox.hidden = !state.event;
      if (state.event) {
        this.eventBox.replaceChildren(
          Object.assign(document.createElement('div'), { className: 'event-title', textContent: state.event.title }),
          Object.assign(document.createElement('div'), { className: 'event-text', textContent: state.event.text }),
        );
      }
    }
    // A phone shows what fits the left column (eight tiles at most) and one "+N" for the rest (H043).
    const portrait = this.root.classList.contains('portrait');
    const { shown: buffs, more } = capStatuses(state.buffs ?? [], portrait ? statusSlots(window.innerWidth, window.innerHeight) : Infinity);
    const buffKey = buffs.map((b) => `${b.id}:${b.timed ? Math.ceil(b.remaining) : ''}:${b.stacks ?? 1}`).join('|') + `+${more}`;
    if (buffKey !== this.lastBuffs) {
      this.lastBuffs = buffKey;
      this.buffBar.replaceChildren(
        ...buffs.map((b) => {
          const el = document.createElement('div');
          el.className = `${b.harmful ? 'buff harmful' : 'buff'}${isExpiring(b) ? ' expiring' : ''}`;
          el.dataset.status = b.id;
          el.style.setProperty('--status-color', b.color);
          el.title = t(`statuses.${b.id}`);
          // The icon is a white game-icons.net glyph used as a mask, so it takes the status colour.
          const icon = document.createElement('div');
          icon.className = 'buff-icon';
          icon.style.setProperty('--icon', cssUrl(statusIconUrl(b.id)));
          el.append(icon);
          if (b.timed) el.append(Object.assign(document.createElement('div'), { className: 'buff-time', textContent: `${Math.ceil(b.remaining)}` }));
          if ((b.stacks ?? 1) > 1) el.append(Object.assign(document.createElement('div'), { className: 'buff-stacks', textContent: `${b.stacks}` }));
          return el;
        }),
        ...(more > 0 ? [Object.assign(document.createElement('div'), { className: 'buff buff-more', textContent: `+${more}` })] : []),
      );
    }
    const exposure = Math.round((state.exposure ?? 0) * 100);
    if (exposure !== this.lastExposure) {
      this.lastExposure = exposure;
      this.exposure.hidden = exposure <= 0;
      this.exposureFill.style.width = `${exposure}%`;
      this.exposureText.textContent = t('hud.exposure', { pct: exposure });
      this.exposure.classList.toggle('high', exposure >= 70);
    }
    const flares = state.flares ? `${state.flares.charges}/${state.flares.max}/${state.flares.key}` : '';
    if (flares !== this.lastFlares) {
      this.lastFlares = flares;
      this.flares.hidden = !state.flares;
      if (state.flares) {
        this.flares.textContent = t('hud.flares', { n: state.flares.charges, max: state.flares.max, key: state.flares.key });
        this.flares.classList.toggle('empty', state.flares.charges === 0);
      }
    }
    const lowLife = state.life.current / state.life.max < 0.3;
    this.lifeOrb.set(state.life.current, state.life.max, state.life.barrier, lowLife);
    // Low life shows on the playfield too: a red vignette, and the potion button asks to be pressed (H005).
    const urgent = lowLife && !state.dead;
    this.vignette.classList.toggle('on', urgent);
    this.potionSlot.el.classList.toggle('urgent', urgent && state.potion.charges > 0);
    setLowLife(urgent);
    this.heatOrb.setKind(state.resource.kind, t(`resources.${state.resource.kind}`));
    this.heatOrb.set(state.resource.current, state.resource.max, 0, state.resource.overheating);

    state.slots.forEach((s, i) => {
      const slot = this.slots[i]!;
      slot.skillId = s.id;
      if (!s.id) {
        slot.set('', 'empty', 0, 0, false);
        return;
      }
      const def = this.resolveSkill(s.id);
      const [cls, name] = s.id.split('.') as [string, string];
      slot.set(t(`skills.${cls}.${name}.name`), def.category, s.cooldown, s.cooldownMax, s.affordable && s.cooldown <= 0, this.resolveIcon(s.id), {
        affordable: s.affordable,
        ...(def.resourceCost > 0 ? { cost: String(Math.round(def.resourceCost)) } : {}),
      });
    });
    this.dodgeSlot.set(t('hud.dodge'), 'dodge', state.dodge.cooldown, state.dodge.max, state.dodge.cooldown <= 0);
    // The potion recharge shows as the dark sweep on the button while a charge is on its way.
    const recharging = state.potion.charges < state.potion.max && (state.potion.rechargeMax ?? 0) > 0;
    this.potionSlot.set(`${t('hud.potion')} ×${state.potion.charges}`, 'potion', 0, 0, state.potion.charges > 0, null, { badge: String(state.potion.charges) });
    this.potionSlot.setRecharge(recharging ? (state.potion.recharge ?? 0) / state.potion.rechargeMax! : 0);

    let waveKey = '';
    if (state.wave) {
      waveKey =
        state.wave.phase === 'active'
          ? `${t('hud.wave', { wave: state.wave.wave })}|${t('hud.hostiles', { count: state.wave.alive })}`
          : `${t('hud.wave', { wave: state.wave.wave })}|${t('hud.nextWave', { seconds: Math.ceil(state.wave.timer) })}`;
    } else if (state.location) {
      waveKey = `${state.location.title}|${state.location.sub}`;
    }
    if (waveKey !== this.lastWave) {
      this.lastWave = waveKey;
      const [a = '', b = ''] = waveKey.split('|');
      this.waveTitle.textContent = a;
      this.waveSub.textContent = b;
      this.labelAge = 0;
    }
    // The region label fades to 35% after 6 s and away after 12 s without a zone change (H067); waves keep it.
    this.labelAge += dt;
    this.labelReveal = Math.max(0, this.labelReveal - dt);
    const labelState = state.wave || this.labelReveal > 0 || this.labelAge < 6 ? '' : this.labelAge < 12 ? 'dim' : 'gone';
    if (this.waveTitle.parentElement!.dataset.fade !== labelState) this.waveTitle.parentElement!.dataset.fade = labelState;

    const tierText = state.wave ? '' : (state.tier ?? '');
    if (this.tierBadge.textContent !== tierText) {
      this.tierBadge.textContent = tierText;
      this.tierBadge.hidden = tierText === '';
    }

    const targetKey = state.target
      ? `${state.target.name}|${Math.ceil(state.target.current)}|${state.target.max}|${state.target.statuses.join(',')}|${state.target.phases?.join(',') ?? ''}`
      : '';
    if (targetKey !== this.lastTarget) {
      this.lastTarget = targetKey;
      this.target.hidden = !state.target;
      if (state.target) {
        this.targetName.textContent = state.target.name;
        this.targetPortrait.hidden = !state.target.portrait;
        if (state.target.portrait && this.targetPortrait.getAttribute('src') !== state.target.portrait) this.targetPortrait.src = state.target.portrait;
        this.target.classList.toggle('has-portrait', !!state.target.portrait);
        this.targetName.style.color = state.target.color ?? '';
        const frac = Math.max(0, state.target.current / state.target.max);
        this.targetFill.style.width = `${frac * 100}%`;
        // A boss (portrait or phases) gets the wide frame with a percentage and a tick at every phase change (H069).
        const boss = !!state.target.portrait || !!state.target.phases?.length;
        this.target.classList.toggle('boss', boss);
        this.targetPct.textContent = `${Math.ceil(frac * 100)}%`;
        this.targetTrack.querySelectorAll('.target-tick').forEach((tick) => tick.remove());
        for (const below of state.target.phases ?? []) {
          this.targetTrack.append(Object.assign(document.createElement('i'), { className: 'target-tick' }));
          (this.targetTrack.lastElementChild as HTMLElement).style.left = `${below * 100}%`;
        }
        // Elite affixes first (in the elite's colour), then statuses; portrait puts them on their own lines.
        const affixes = state.target.affixes?.join(' · ') ?? '';
        const statuses = state.target.statuses.map((s) => t(`statuses.${s}`)).join(' · ');
        this.targetAffix.textContent = affixes;
        this.targetAffix.style.color = state.target.color ?? '';
        this.targetSep.hidden = !(affixes && statuses);
        this.targetStatusText.textContent = statuses;
      }
    }

    this.death.hidden = !state.dead;
    if (state.dead !== this.wasDead) {
      this.wasDead = state.dead;
      this.deathAt = performance.now();
      this.lastRiseSecs = -1;
      this.deathLock = state.dead ? DEATH_LOCK : 0;
    }
    if (state.dead) {
      // Wall-clock, not the (clamped) frame time: the lock must feel the same at 60 and at 10 FPS.
      this.deathLock = Math.max(0, DEATH_LOCK - (performance.now() - this.deathAt) / 1000);
      const secs = Math.ceil(this.deathLock);
      if (secs !== this.lastRiseSecs) {
        this.lastRiseSecs = secs;
        this.riseButton.disabled = secs > 0;
        this.riseButton.textContent = secs > 0 ? `${t('hud.riseAgain')} (${secs})` : t('hud.riseAgain');
      }
    }

    const xpKey = `${state.xp.level}|${Math.floor(state.xp.current)}|${state.xp.next}|${state.xp.skillPoints}`;
    if (xpKey !== this.lastXp) {
      this.lastXp = xpKey;
      const xpFrac = Math.min(1, state.xp.current / Math.max(1, state.xp.next));
      this.xpFill.style.width = `${xpFrac * 100}%`;
      // The bar flashes when experience comes in, and glows when the next level is close (H004).
      if (this.lastXpCurrent >= 0 && (state.xp.level > this.lastXpLevel || state.xp.current > this.lastXpCurrent)) this.xpFlash = 0.25;
      this.lastXpCurrent = state.xp.current;
      this.lastXpLevel = state.xp.level;
      this.xpBar.classList.toggle('near', xpFrac > 0.9);
      this.levelNum.textContent = String(state.xp.level);
      this.levelDot.hidden = state.xp.skillPoints <= 0;
      this.levelChip.title = `${t('ui.level', { level: state.xp.level })}${state.xp.skillPoints > 0 ? ` · ${state.xp.skillPoints} SP` : ''}`;
      const points = state.xp.skillPoints > 0 ? ` · ${state.xp.skillPoints} SP` : '';
      this.xpText.textContent = `${t('ui.level', { level: state.xp.level })} · ${t('ui.xp', {
        xp: Math.floor(state.xp.current),
        next: state.xp.next,
      })}${points}`;
    }

    if (this.xpFlash > 0) {
      this.xpFlash = Math.max(0, this.xpFlash - dt);
      this.xpBar.classList.toggle('gain', this.xpFlash > 0);
    }

    if (this.banners.tick(dt)) this.renderBanner(this.banners.current);
  }

  private showTooltip(slot: Slot | null): void {
    if (!slot || !slot.skillId) {
      this.tooltip.hidden = true;
      return;
    }
    const def = this.resolveSkill(slot.skillId);
    const [cls, name] = def.id.split('.') as [string, string];
    const resource = t(`resources.${classDef(def.classId).resource.id}`);
    const lines = [`<strong>${t(`skills.${cls}.${name}.name`)}</strong>`, t(`skills.${cls}.${name}.desc`)];
    if (def.resourceCost > 0) lines.push(t('hud.cost', { amount: def.resourceCost, resource }));
    if (def.resourceGain > 0) lines.push(t('hud.generates', { amount: def.resourceGain, resource }));
    if (def.cooldown > 0) lines.push(t('hud.cooldown', { seconds: Number(def.cooldown.toFixed(1)) }));
    this.tooltip.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    const rect = slot.el.getBoundingClientRect();
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltip.style.top = `${rect.top - 8}px`;
  }
}
