/**
 * In-game HUD: life and resource orbs, action bar with cooldowns, wave tracker,
 * target frame and death screen. DOM is only touched when a value changes.
 */
import { cssUrl } from './art';
import { BannerQueue, type BannerItem } from './bannerQueue';
import { haptic, setLowLife } from './haptics';
import { setAffixChips } from './enemyBars';
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
  if (code.startsWith('Alt')) return 'Alt';
  if (code.startsWith('Control')) return 'Ctrl';
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return KEY_NAMES[code] ?? code;
}

/** Readable names for keys whose code is not what the key cap shows (rebinding, B042). */
const KEY_NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  IntlBackslash: '<',
  Backspace: 'Bksp',
  CapsLock: 'Caps',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Escape: 'Esc',
};

/** Life fractions where the boss script changes phase (tick marks on its bar); `{}` for a script with one phase. */
export function bossPhaseTicks(script: string | undefined): { phases?: number[] } {
  if (!script) return {};
  const phases = (BOSS_SCRIPTS[script] ?? []).map((p) => p.below).filter((b) => b < 1);
  return phases.length > 0 ? { phases } : {};
}

/**
 * The number on a cooling-down slot: whole seconds (rounded up) from 2 s, one decimal below it so a short cooldown
 * doesn't sit on "1" for a second. Skills with a cooldown under 0.75 s show nothing (A002).
 */
export function cooldownLabel(cooldown: number, max: number): string {
  if (cooldown <= 0.05 || max < 0.75) return '';
  return cooldown < 2 ? cooldown.toFixed(1) : String(Math.ceil(cooldown));
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
  target: { name: string; current: number; max: number; statuses: string[]; color?: string; affixes?: string[]; /** Affix ids, parallel to `affixes` (names): the chips pick their icons from them. */ affixIds?: string[]; /** Elite kind: the frame's border colour (A022). */ tier?: 'champion' | 'rare' | 'named'; portrait?: string; /** Life fractions where a boss changes phase (tick marks on its bar). */ phases?: number[] } | null;
  /** World event in progress near the player. */
  event?: { title: string; text: string };
  /** Statuses on the player: pylon buffs, wards, and harm like burning or poison. */
  buffs?: HudStatus[];
  /** Spore exposure 0..1 (Hydroponic Vaults). */
  exposure?: number;
  /** Flares left (Deep Mines). */
  flares?: { charges: number; max: number; key: string };
  dead: boolean;
  /** "Slain by Champion Ash Walker - Molten" while dead (A046); empty when nothing named hit the hero. */
  deathCause?: string;
  xp: { level: number; current: number; next: number; skillPoints: number };
  /** Learned active skills that are not on the action bar (B036): an accent dot on the Skills entry while above 0. */
  unassignedSkills?: number;
}

/** Seconds after dying before the touch respawn button can be tapped. */
const DEATH_LOCK = 1.2;

const HINTS_KEY = 'ashfall.hintsSeen';
function readHintsSeen(): boolean {
  try {
    return localStorage.getItem(HINTS_KEY) === '1';
  } catch {
    return false;
  }
}
function writeHintsSeen(): void {
  try {
    localStorage.setItem(HINTS_KEY, '1');
  } catch {
    /* storage blocked: the hint simply shows again next session */
  }
}

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

  /** A refused skill press: the orb border flashes red for 200 ms (A004). */
  denied(): void {
    this.el.classList.add('denied');
    setTimeout(() => this.el.classList.remove('denied'), 200);
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

  constructor(label: string, private readonly onHover: (slot: Slot | null) => void, onEmptyClick?: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'slot';
    // An empty slot opens the Skills panel on desktop (touch has its own handler in touchControls) (A005).
    if (onEmptyClick) this.el.addEventListener('click', () => this.el.dataset.category === 'empty' && onEmptyClick());
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
    const cdLabel = cooldownLabel(cooldown, max);
    const key = `${name}|${category}|${frac.toFixed(2)}|${usable}|${cdLabel}|${icon}|${extra.badge ?? ''}|${extra.affordable ?? ''}|${extra.cost ?? ''}`;
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
    this.cdText.textContent = cdLabel;
    this.cdText.classList.toggle('fine', cdLabel.includes('.'));
    this.el.classList.toggle('unusable', !usable);
  }

  /** A denied press: the button shakes once (A004). */
  deny(): void {
    this.el.classList.remove('denied');
    void this.el.offsetWidth;
    this.el.classList.add('denied');
    setTimeout(() => this.el.classList.remove('denied'), 160);
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
  private buffData = new Map<string, HudStatus>();
  private hoveredBuff: string | null = null;
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
  private readonly deathCause: HTMLParagraphElement;
  private readonly riseButton: HTMLButtonElement;
  /** Seconds left before the touch respawn button works (counts down while dead). */
  private deathLock = 0;
  private deathAt = 0;
  /** Pale strip behind the target's life: it lags the fill so a big hit shows (A023). */
  private readonly targetGhost: HTMLDivElement;
  private lastTargetName = '';
  /** Control hints fade after 20 s of play or the first skill use; the title after 8 s; F1 / ? bring the hints back (A019). */
  private readonly titleEl: HTMLDivElement;
  private playTime = 0;
  private hintsSeen = false;
  private hintShow = 0;
  /** Life at the last update, for the hit flash on the vignette (A033). */
  private lastLife = -1;
  private hitTimer = 0;
  private lastRiseSecs = -1;
  private wasDead = false;
  private readonly tooltip: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly xpText: HTMLDivElement;
  private lastXp = '';
  /** Desktop: the dot at the end of the XP bar for learned skills off the bar (B036); `skillsDotKey` is the last value written. */
  private readonly skillsDot: HTMLSpanElement;
  private skillsDotKey = '';
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
    this.titleEl = title;
    this.hintsSeen = readHintsSeen();
    this.hint.classList.toggle('faded', this.hintsSeen);
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'F1' || e.key === '?') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        if (e.key === 'F1') e.preventDefault();
        this.hintShow = 12;
      }
    });

    const bar = document.createElement('div');
    bar.className = 'action-bar';
    const slotRow = document.createElement('div');
    slotRow.className = 'slots';
    this.slots = SLOT_LABELS.map((label) => new Slot(label, (s) => this.showTooltip(s), () => !this.touch && this.onOpenSkills?.()));
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
    this.skillsDot = Object.assign(document.createElement('span'), { className: 'skills-dot', hidden: true });
    this.skillsDot.setAttribute('role', 'img');
    xp.append(this.xpFill, this.xpText, this.skillsDot);
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
    this.targetGhost = document.createElement('div');
    this.targetGhost.className = 'target-ghost';
    track.append(this.targetGhost, this.targetFill);
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
    this.riseButton.style.setProperty('--lock-time', `${DEATH_LOCK}s`);
    this.riseButton.dataset.testid = 'respawn';
    this.riseButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.deathLock <= 0) onRespawn();
    });
    this.deathCause = document.createElement('p');
    this.deathCause.className = 'death-cause';
    this.deathCause.dataset.testid = 'death-cause';
    this.death.append(dt, this.deathCause, this.deathHint, this.riseButton);
    this.death.hidden = true;
    // A click elsewhere does nothing (A045): a thumb mashing LMB must not skip the screen; the button and R respawn.

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
    this.buffBar.addEventListener('mouseover', (e) => {
      if (this.touch) return;
      const tile = (e.target as Element | null)?.closest<HTMLElement>('.buff[data-status]');
      if (tile) this.showBuffTooltip(tile.dataset.status ?? null);
    });
    this.buffBar.addEventListener('mouseleave', () => {
      if (this.hoveredBuff) {
        this.hoveredBuff = null;
        this.tooltip.hidden = true;
      }
    });

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
  /** Desktop: a click on an empty action-bar slot opens the Skills panel (A005); set by the game. */
  onOpenSkills?: () => void;

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

  /** Accessibility: `reduce-flashing` on the root stops the low-life pulse and the hit flash (settings.reduceFlashing). */
  setReduceFlashing(on: boolean): void {
    this.root.classList.toggle('reduce-flashing', on);
  }

  /** True during the short lock after dying: neither the button nor R respawns yet (A045). */
  get respawnLocked(): boolean {
    return !this.wasDead || this.deathLock > 0;
  }

  /** Hints fade after 20 s of play or the first skill use, the title after 8 s; F1 or ? show the hints for 12 s (A019). */
  private updateHints(state: HudState, dt: number): void {
    if (!state.dead) this.playTime += dt;
    if (!this.hintsSeen && (this.playTime > 20 || state.slots.some((s) => s.cooldown > 0))) {
      this.hintsSeen = true;
      writeHintsSeen();
    }
    this.hintShow = Math.max(0, this.hintShow - dt);
    const hintFaded = this.hintsSeen && this.hintShow <= 0;
    if (this.hint.classList.contains('faded') !== hintFaded) this.hint.classList.toggle('faded', hintFaded);
    const titleFaded = this.playTime > 8;
    if (this.titleEl.classList.contains('faded') !== titleFaded) this.titleEl.classList.toggle('faded', titleFaded);
  }

  /** Red edge flash when a hit takes 5 % of max life or more (A033). */
  private updateHit(life: number, max: number): void {
    if (this.lastLife >= 0 && max > 0 && !this.root.classList.contains('reduce-flashing')) {
      const share = (this.lastLife - life) / max;
      if (share >= 0.05) {
        this.vignette.style.setProperty('--hit-op', String(Math.min(0.5, 0.15 + 0.5 * share).toFixed(2)));
        this.vignette.classList.add('hit');
        clearTimeout(this.hitTimer);
        this.hitTimer = window.setTimeout(() => this.vignette.classList.remove('hit'), 140);
      }
    }
    this.lastLife = life;
  }

  update(state: HudState, dt: number): void {
    this.updateHints(state, dt);
    this.root.classList.toggle('has-target', !!state.target);
    this.root.classList.toggle('hud-dead', state.dead);
    this.updateHit(state.life.current, state.life.max);
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
      this.buffData = new Map(buffs.map((b) => [b.id, b]));
      this.buffBar.replaceChildren(
        ...buffs.map((b, i) => {
          const el = document.createElement('div');
          // The first harmful tile after a boon starts the second group: a gap and a divider (A013).
          const groupStart = b.harmful && i > 0 && !buffs[i - 1]!.harmful;
          el.className = `${b.harmful ? 'buff harmful' : 'buff'}${isExpiring(b) ? ' expiring' : ''}${groupStart ? ' group-start' : ''}`;
          el.dataset.status = b.id;
          el.style.setProperty('--status-color', b.color);
          el.setAttribute('aria-label', t(`statuses.${b.id}`));
          // Desktop shows the HUD tooltip on hover (A014); the native title is for touch only.
          if (this.touch) el.title = t(`statuses.${b.id}`);
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
      // The tiles were rebuilt under the pointer: keep the tooltip on the same status with its new time.
      if (this.hoveredBuff) this.showBuffTooltip(this.hoveredBuff);
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
    this.potionSlot.set(this.touch ? `${t('hud.potion')} ×${state.potion.charges}` : t('hud.potion'), 'potion', 0, 0, state.potion.charges > 0, null, { badge: String(state.potion.charges) });
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
      ? `${state.target.name}|${Math.ceil(state.target.current)}|${state.target.max}|${state.target.statuses.join(',')}|${state.target.phases?.join(',') ?? ''}|${state.target.affixIds?.join(',') ?? ''}`
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
        // The ghost jumps to a new target's life and lags behind the fill on the same one (A023).
        if (state.target.name !== this.lastTargetName) {
          this.lastTargetName = state.target.name;
          this.targetGhost.classList.add('snap');
          this.targetGhost.style.width = `${frac * 100}%`;
          void this.targetGhost.offsetWidth;
          this.targetGhost.classList.remove('snap');
        } else {
          this.targetGhost.style.width = `${frac * 100}%`;
        }
        if (state.target.tier) this.target.dataset.tier = state.target.tier;
        else delete this.target.dataset.tier;
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
        const ids = state.target.affixIds;
        const names = state.target.affixes ?? [];
        // Chips (icon or two letters, the full name on hover) when the ids are known, else the names as text (A025).
        const affixes = ids?.length ? ids.join(',') : names.join(' · ');
        if (ids?.length) setAffixChips(this.targetAffix, ids.map((id, i) => ({ id, name: names[i] ?? id })), state.target.color ?? '#ffd23a');
        else {
          this.targetAffix.dataset.key = '';
          this.targetAffix.textContent = affixes;
        }
        const statuses = state.target.statuses.map((s) => t(`statuses.${s}`)).join(' · ');
        this.targetAffix.style.color = state.target.color ?? '';
        this.targetSep.hidden = !(affixes && statuses);
        this.targetStatusText.textContent = statuses;
      }
    }

    this.death.hidden = !state.dead;
    const cause = state.dead ? (state.deathCause ?? '') : '';
    if (this.deathCause.textContent !== cause) {
      this.deathCause.textContent = cause;
      this.deathCause.hidden = cause === '';
    }
    if (state.dead !== this.wasDead) {
      this.wasDead = state.dead;
      this.deathAt = performance.now();
      this.lastRiseSecs = -1;
      this.deathLock = state.dead ? DEATH_LOCK : 0;
      // Dying clears the banner queue: "Quest complete" must not hang above "You have fallen" (A043).
      if (state.dead) {
        this.banners.clear();
        this.renderBanner(null);
      }
    }
    if (state.dead) {
      // Wall-clock, not the (clamped) frame time: the lock must feel the same at 60 and at 10 FPS.
      this.deathLock = Math.max(0, DEATH_LOCK - (performance.now() - this.deathAt) / 1000);
      const secs = Math.ceil(this.deathLock);
      if (secs !== this.lastRiseSecs) {
        this.lastRiseSecs = secs;
        this.riseButton.disabled = secs > 0;
        // Desktop: a fixed "Rise (R)" whose fill shows the lock; touch counts the seconds (A045).
        this.riseButton.textContent = !this.touch
          ? t('hud.riseKey', { key: this.respawnKey })
          : secs > 0
            ? `${t('hud.riseAgain')} (${secs})`
            : t('hud.riseAgain');
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
      // Unspent points are their own span so the CSS can colour them and add a dot (A012).
      this.xpText.replaceChildren(
        `${t('ui.level', { level: state.xp.level })} · ${t('ui.xp', {
          xp: Math.floor(state.xp.current),
          next: state.xp.next,
        })}`,
        ...(points ? [' · ', Object.assign(document.createElement('span'), { className: 'xp-sp', textContent: `${state.xp.skillPoints} SP` })] : []),
      );
    }

    // Learned skills that are not on the bar (B036); written only when the count changes. Touch has its own dot on the menu button.
    const off = this.touch ? 0 : (state.unassignedSkills ?? 0);
    if (String(off) !== this.skillsDotKey) {
      this.skillsDotKey = String(off);
      this.skillsDot.hidden = off <= 0;
      const label = off > 0 ? t('hud.unassignedSkills', { n: off }) : '';
      if (label) this.skillsDot.setAttribute('aria-label', label);
      else this.skillsDot.removeAttribute('aria-label');
      this.skillsDot.title = label;
    }

    if (this.xpFlash > 0) {
      this.xpFlash = Math.max(0, this.xpFlash - dt);
      this.xpBar.classList.toggle('gain', this.xpFlash > 0);
    }

    if (this.banners.tick(dt)) this.renderBanner(this.banners.current);
  }

  /** Hover tooltip for a status tile: name, effect and time left (A014). Desktop only. */
  private showBuffTooltip(id: string | null): void {
    const b = id ? this.buffData.get(id) : undefined;
    const el = id ? this.buffBar.querySelector<HTMLElement>(`.buff[data-status="${id}"]`) : null;
    this.hoveredBuff = b && el ? id : null;
    if (!b || !el) {
      this.tooltip.hidden = true;
      return;
    }
    const lines = [`<strong>${t(`statuses.${b.id}`)}</strong>`, t(`statusDesc.${b.id}`)];
    if ((b.stacks ?? 1) > 1) lines.push(t('hud.statusStacks', { count: b.stacks! }));
    if (b.timed) lines.push(t('hud.statusLeft', { seconds: Math.ceil(b.remaining) }));
    this.tooltip.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    const rect = el.getBoundingClientRect();
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltip.style.top = `${rect.top - 8}px`;
  }

  /** A skill press was refused for lack of resource: the unaffordable slots shake and the orb flashes (A004). */
  denyResource(): boolean {
    if (this.touch) return false;
    for (const s of this.slots) if (s.el.classList.contains('no-resource')) s.deny();
    this.heatOrb.denied();
    return true;
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
