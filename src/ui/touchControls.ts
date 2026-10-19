/**
 * On-screen controls for phones and tablets: a floating joystick on the left, the action bar turned
 * into thumb buttons on the right (attack, five skills, dodge, potion), a menu row for the panels,
 * a tappable interact prompt and long-press as right-click inside panels. The `.touch-ui` class on the
 * UI root switches the HUD to the touch layout; `.portrait` on top of it (phone held upright) moves
 * everything out of the thumbs' way.
 */
import { cssUrl } from './art';
import type { Input } from '../core/input';
import { t } from '../data/i18n';
import { fullscreenOrFallback, isFullscreen, onFullscreenChange } from './fullscreen';
import type { Action } from '../data/settings';
import type { TouchMenuEntry } from './soundPanel';
import { haptic } from './haptics';
import { panelStack } from './panelStack';

/** Touch screens without a precise pointer (phones, tablets). */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
}

/** The action bar slots in order: attack, RMB skill, skills 1–4, dodge, potion. */
const SLOT_ACTIONS: ({ hold: Action } | { button: number } | { attack: true } | { tap: Action })[] = [
  { attack: true },
  { button: 2 },
  { hold: 'skill1' },
  { hold: 'skill2' },
  { hold: 'skill3' },
  { hold: 'skill4' },
  { tap: 'dodge' },
  { tap: 'potion' },
];

/** Menu button icons live in public/assets/ui/menu/ (white glyphs, tinted through a CSS mask). */
const menuIconUrl = (id: string): string => `${import.meta.env.BASE_URL}assets/ui/menu/${id}.svg`;

/** The five panel buttons that stay on the menu row (44 px); everything else lives behind the "more" button. */
const MENU: { id: string; action: Action }[] = [
  { id: 'inventory', action: 'inventory' },
  { id: 'character', action: 'character' },
  { id: 'skills', action: 'skills' },
  { id: 'map', action: 'map' },
  { id: 'quests', action: 'quests' },
];
/** Rarely used buttons, in the overflow popover (the flare button only while the zone has flares). */
const OVERFLOW: { id: string; action: Action }[] = [
  { id: 'mount', action: 'mount' },
  { id: 'flare', action: 'flare' },
];

/** The panels the menu buttons toggle, by the class of their root element. */
const TOGGLE_PANELS: { selector: string; action: Action }[] = [
  { selector: '.inventory-panel', action: 'inventory' },
  { selector: '.character-panel', action: 'character' },
  { selector: '.tree-panel', action: 'skills' },
  { selector: '.map-panel', action: 'map' },
  { selector: '.quest-log', action: 'quests' },
];
/** Panels that also count as "a panel is open" (they cover the HUD) and close through their own button. */
const OTHER_PANELS = ['.sound-panel', '.service-panel', '.tier-panel', '.rift-panel', '.dialogue-panel', '.lore-panel'];

/** Joystick travel in CSS pixels at full deflection. */
export const STICK_RADIUS = 56;
/** Finger jitter inside this radius (CSS px) does not move the hero. */
export const STICK_DEAD_ZONE = 8;
/** Two taps on attack within this time lock auto-attack (ms). */
const DOUBLE_TAP = 300;
/** Holding a skill button this long shows its tooltip (ms), which stays up for TOOLTIP_MS after release. */
const TOOLTIP_HOLD = 350;
const TOOLTIP_MS = 2500;

/**
 * Stick reading for a finger offset (screen px, y down) from the stick base: nothing inside the dead zone, then
 * a linear ramp to full deflection at STICK_RADIUS. `y` is flipped so +y is up.
 */
export function stickReading(dx: number, dy: number): { x: number; y: number } | null {
  const len = Math.hypot(dx, dy);
  if (len <= STICK_DEAD_ZONE) return null;
  const mag = Math.min(1, (len - STICK_DEAD_ZONE) / (STICK_RADIUS - STICK_DEAD_ZONE));
  return { x: (dx / len) * mag, y: -(dy / len) * mag };
}

/**
 * Drag-follow: a finger further than STICK_RADIUS from the base pulls the base along, so the stick always sits
 * one radius behind the thumb and reversing takes a short swing. Returns the new base and the knob offset.
 */
export function followStick(origin: { x: number; y: number }, dx: number, dy: number): { origin: { x: number; y: number }; dx: number; dy: number } {
  const len = Math.hypot(dx, dy);
  if (len <= STICK_RADIUS) return { origin, dx, dy };
  const k = STICK_RADIUS / len;
  const excess = len - STICK_RADIUS;
  return { origin: { x: origin.x + (dx / len) * excess, y: origin.y + (dy / len) * excess }, dx: dx * k, dy: dy * k };
}
/** Long-press time that opens the right-click action inside panels (ms). */
const LONG_PRESS = 450;

/** Status icons double as the dodge and potion glyphs (public/assets/ui/status/, white, tinted through a CSS mask). */
const statusIcon = (id: string): string => `${import.meta.env.BASE_URL}assets/ui/status/${id}.svg`;

type SlotAction = (typeof SLOT_ACTIONS)[number];

/** Pointer capture keeps a drag on its button; it throws when the pointer is already gone, which must not stop the press. */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture?.(pointerId);
  } catch {
    // The pointer ended between the event and this call.
  }
}

export class TouchControls {
  private readonly elements: HTMLElement[] = [];
  private readonly stickBase: HTMLDivElement;
  private readonly stickKnob: HTMLDivElement;
  private readonly stickZone: HTMLElement;
  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  /** Full deflection was reached in this drag (a tick tells the thumb); re-armed below 80 %. */
  private stickAtEdge = false;
  private active = false;
  private wasPortrait = false;
  private dead = false;
  private readonly cleanups: (() => void)[] = [];
  /** Release handlers of the thumb buttons, so a rotation or a death can let go of everything. */
  private readonly slotReleases: (() => void)[] = [];
  private attackLocked = false;
  private lastAttackTap = 0;
  private attackEl: HTMLElement | null = null;
  private tooltipTimer: ReturnType<typeof setTimeout> | null = null;
  private tooltipHide: ReturnType<typeof setTimeout> | null = null;
  private readonly menu: HTMLElement;
  private readonly more: HTMLElement;
  private readonly moreButton: HTMLButtonElement;
  private readonly fabSheet: HTMLElement;
  private readonly fabButton: HTMLButtonElement;
  private readonly flareButton: HTMLButtonElement | null = null;
  private readonly dots = new Map<string, HTMLElement>();
  private panelsWere = new Set<string>();

  constructor(
    private readonly root: HTMLElement,
    private readonly input: Input,
    slotElements: HTMLElement[],
    /** Extra buttons at the end of the menu row (sound). */
    extraMenu: TouchMenuEntry[] = [],
    /** Short hints (the full-screen button when the browser cannot do it). */
    notify: (message: string) => void = () => {},
  ) {
    // Joystick: a zone over the lower left; the base jumps to wherever the thumb lands.
    const zone = document.createElement('div');
    zone.className = 'touch-stick-zone';
    zone.dataset.testid = 'touch-stick';
    this.stickZone = zone;
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'touch-stick-base';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'touch-stick-knob';
    this.stickBase.appendChild(this.stickKnob);
    zone.appendChild(this.stickBase);
    zone.addEventListener('pointerdown', (e) => this.stickDown(e, zone));
    zone.addEventListener('pointermove', (e) => this.stickMove(e));
    zone.addEventListener('pointerup', (e) => this.stickUp(e));
    zone.addEventListener('pointercancel', (e) => this.stickUp(e));

    // Menu row: the five panel buttons and a "more" button; the rest sits in a popover.
    const menu = document.createElement('div');
    menu.className = 'touch-menu';
    this.menu = menu;
    const menuButton = (id: string, label: string, onClick: () => void, iconId = id): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = 'touch-menu-btn';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.dataset.testid = `touch-menu-${id}`;
      const icon = document.createElement('span');
      icon.className = 'touch-menu-icon';
      icon.style.setProperty('--icon', cssUrl(menuIconUrl(iconId)));
      b.appendChild(icon);
      // Press state and a tick on the finger-down, not on the click that follows the lift.
      b.addEventListener('pointerdown', () => {
        b.classList.add('pressed');
        haptic('tap');
      });
      const unpress = () => b.classList.remove('pressed');
      b.addEventListener('pointerup', unpress);
      b.addEventListener('pointercancel', unpress);
      b.addEventListener('pointerleave', unpress);
      b.addEventListener('click', onClick);
      return b;
    };
    for (const m of MENU) {
      const b = menuButton(m.id, t(`touch.menu.${m.id}`), () => this.openPanel(m.action));
      const dot = document.createElement('span');
      dot.className = 'touch-menu-dot';
      b.appendChild(dot);
      this.dots.set(m.id, dot);
      menu.appendChild(b);
    }

    // Overflow popover: bike, flare (Deep Mines only), full screen, sound.
    const more = document.createElement('div');
    more.className = 'touch-menu-more';
    more.hidden = true;
    this.more = more;
    const closeMore = () => this.setMoreOpen(false);
    for (const m of OVERFLOW) {
      const b = menuButton(m.id, t(`touch.menu.${m.id}`), () => {
        this.input.pressAction(m.action);
        closeMore();
      });
      if (m.id === 'flare') {
        b.hidden = true;
        this.flareButton = b;
      }
      more.appendChild(b);
    }
    // Always shown: where the browser cannot go full screen the tap opens the game in its own tab or says how.
    const fs = menuButton('fullscreen', t('touch.menu.fullscreen'), () => {
      closeMore();
      void fullscreenOrFallback().then((outcome) => {
        if (outcome === 'needsTab') notify(t('touch.fullscreen.needsTab'));
        else if (outcome === 'needsHomeScreen') notify(t('touch.fullscreen.needsHomeScreen'));
      });
    });
    // The icon and label follow the real state (the browser can also leave full screen by itself).
    const sync = () => {
      const on = isFullscreen();
      const label = t(on ? 'touch.menu.fullscreenExit' : 'touch.menu.fullscreen');
      fs.title = label;
      fs.setAttribute('aria-label', label);
      fs.setAttribute('aria-pressed', String(on));
      fs.querySelector<HTMLElement>('.touch-menu-icon')?.style.setProperty('--icon', cssUrl(menuIconUrl(on ? 'fullscreen-exit' : 'fullscreen')));
    };
    this.cleanups.push(onFullscreenChange(sync));
    more.appendChild(fs);

    for (const entry of extraMenu) {
      const b = menuButton(entry.id, entry.label, () => {
        entry.onClick();
        closeMore();
      });
      entry.onBuilt?.(b);
      more.appendChild(b);
    }

    const moreButton = menuButton('more', t('touch.menu.more'), () => this.setMoreOpen(this.more.hasAttribute('hidden')));
    moreButton.setAttribute('aria-haspopup', 'true');
    moreButton.setAttribute('aria-expanded', 'false');
    this.moreButton = moreButton;
    menu.append(moreButton, more);
    // A tap anywhere else closes the popover.
    const outside = (e: PointerEvent) => {
      if (!this.more.hidden && !(e.target as HTMLElement | null)?.closest('.touch-menu')) this.setMoreOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    this.cleanups.push(() => document.removeEventListener('pointerdown', outside, true));

    // Thumb-reach menu (portrait): a round button above the stick zone that opens the five panels as a vertical sheet.
    const fab = document.createElement('div');
    fab.className = 'touch-fab';
    const sheet = document.createElement('div');
    sheet.className = 'touch-fab-sheet';
    sheet.hidden = true;
    this.fabSheet = sheet;
    for (const m of MENU) {
      const b = menuButton(`fab-${m.id}`, t(`touch.menu.${m.id}`), () => {
        this.setFabOpen(false);
        this.input.pressAction(m.action);
      }, m.id);
      sheet.appendChild(b);
    }
    this.fabButton = menuButton('fab', t('touch.menu.menu'), () => this.setFabOpen(this.fabSheet.hasAttribute('hidden')));
    this.fabButton.classList.add('touch-fab-btn');
    this.fabButton.setAttribute('aria-haspopup', 'true');
    this.fabButton.setAttribute('aria-expanded', 'false');
    fab.append(sheet, this.fabButton);
    const fabOutside = (e: PointerEvent) => {
      if (!this.fabSheet.hidden && !(e.target as HTMLElement | null)?.closest('.touch-fab')) this.setFabOpen(false);
    };
    document.addEventListener('pointerdown', fabOutside, true);
    this.cleanups.push(() => document.removeEventListener('pointerdown', fabOutside, true));

    this.elements.push(zone, menu, fab);
    root.append(...this.elements);
    for (const el of this.elements) el.hidden = true;

    // The action bar's slots become thumb buttons.
    slotElements.forEach((el, i) => this.bindSlot(el, SLOT_ACTIONS[i]!));
    // The dodge and potion buttons are icons on touch (the text label is hidden by CSS).
    for (const [i, icon] of [[6, 'evasive'], [7, 'barrier']] as const) slotElements[i]?.style.setProperty('--icon', cssUrl(statusIcon(icon)));

    const onResize = () => this.updatePortrait();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    this.cleanups.push(() => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    });
    // Panels show and hide through the `hidden` attribute; keep `.touch-panel-open`, `.dead` and the flare button in step with it.
    const watch = new MutationObserver(() => this.onHiddenChange());
    watch.observe(root, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    this.cleanups.push(() => watch.disconnect());
    this.installLongPress();
  }

  get shown(): boolean {
    return this.active;
  }

  /** Show or hide the touch controls (and switch the HUD layout). */
  setActive(on: boolean): void {
    this.active = on;
    this.root.classList.toggle('touch-ui', on);
    document.documentElement.classList.toggle('touch-device', on);
    for (const el of this.elements) el.hidden = !on;
    this.input.touch = on ? { stick: null, attack: false } : null;
    this.releaseAll();
    this.updatePortrait();
  }

  /** Thumb layout: 'left' mirrors the stick and the buttons (`#ui.lefty`), `scale` multiplies the button sizes. */
  setLayout(layout: 'right' | 'left', scale = 1): void {
    this.root.classList.toggle('lefty', layout === 'left');
    this.root.style.setProperty('--btn-scale', String(scale));
  }

  /** Per-frame HUD facts: enemies near (secondary HUD dims) and unspent skill points (dot on the Skills button). */
  sync(combat: boolean, skillPoints: number): void {
    if (this.root.classList.contains('in-combat') !== combat) this.root.classList.toggle('in-combat', combat);
    this.setDot('skills', skillPoints > 0);
  }

  /** A small dot on a menu button (new points, new items, a quest step); cleared when its panel opens. */
  setDot(id: string, on: boolean): void {
    const dot = this.dots.get(id);
    const panel = { inventory: '.inventory-panel', quests: '.quest-log', skills: '.tree-panel' }[id];
    if (on && panel && this.panelOpen(panel)) return;
    if (dot && dot.parentElement && dot.parentElement.classList.contains('has-dot') !== on) dot.parentElement.classList.toggle('has-dot', on);
  }

  /** Opens a panel from the menu; in portrait the other main panels close first (one at a time). */
  private openPanel(action: Action): void {
    this.setMoreOpen(false);
    this.input.pressAction(action);
  }

  // Setting `hidden` again, even to the same value, is a mutation the observer on the UI root sees: check first.
  private setFabOpen(open: boolean): void {
    if (this.fabSheet.hasAttribute('hidden') === !open) return;
    this.fabSheet.hidden = !open;
    this.fabButton.setAttribute('aria-expanded', String(open));
    this.fabButton.classList.toggle('open', open);
  }

  private setMoreOpen(open: boolean): void {
    if (this.more.hasAttribute('hidden') === !open) return;
    this.more.hidden = !open;
    this.moreButton.setAttribute('aria-expanded', String(open));
    this.moreButton.classList.toggle('open', open);
  }

  private bindSlot(el: HTMLElement, action: SlotAction): void {
    const isAttack = 'attack' in action;
    let pressedWith: HTMLElement | null = null;
    let downAt = { x: 0, y: 0 };
    const clearTooltipTimer = () => {
      if (this.tooltipTimer) clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    };
    const down = (e: PointerEvent) => {
      if (!this.active) return;
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      capture(target, e.pointerId);
      pressedWith = target;
      downAt = { x: e.clientX, y: e.clientY };
      el.classList.add('pressed');
      // An empty slot is a "+" that opens the skills panel.
      if (el.dataset.category === 'empty') {
        haptic('tap');
        this.input.pressAction('skills');
        return;
      }
      // A blocked press (cooldown, no resource) shakes the button instead of silently doing nothing.
      if (!isAttack && el.classList.contains('unusable')) {
        el.classList.remove('denied');
        void el.offsetWidth;
        el.classList.add('denied');
        haptic('tick');
      } else haptic('tap');
      if (isAttack) {
        const now = performance.now();
        if (this.attackLocked) {
          this.setAttackLock(false);
          if (this.input.touch) this.input.touch.attack = false;
          this.lastAttackTap = 0;
          return;
        }
        if (now - this.lastAttackTap < DOUBLE_TAP) this.setAttackLock(true);
        this.lastAttackTap = now;
        if (this.input.touch) this.input.touch.attack = true;
      } else if ('button' in action) this.input.holdButton(action.button, true);
      else if ('hold' in action) this.input.holdAction(action.hold, true);
      else {
        if ('tap' in action && action.tap === 'dodge') {
          haptic('dodge');
          // Dodging also lets go of a locked auto-attack.
          if (this.attackLocked) {
            this.setAttackLock(false);
            if (this.input.touch) this.input.touch.attack = false;
          }
        } else if ('tap' in action && action.tap === 'potion') haptic('potion');
        this.input.pressAction(action.tap);
      }
      // Holding a skill button shows what it does (the cast has already started).
      if ('button' in action || 'hold' in action) {
        clearTooltipTimer();
        this.tooltipTimer = setTimeout(() => {
          this.tooltipTimer = null;
          if (!pressedWith) return;
          if (this.tooltipHide) clearTimeout(this.tooltipHide);
          el.dispatchEvent(new MouseEvent('mouseenter'));
          haptic('longPress');
        }, TOOLTIP_HOLD);
      }
    };
    const move = (e: PointerEvent) => {
      if (this.tooltipTimer && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 16) clearTooltipTimer();
    };
    const up = () => {
      const wasShown = this.tooltipTimer === null && pressedWith !== null;
      pressedWith = null;
      clearTooltipTimer();
      el.classList.remove('pressed');
      if (isAttack) {
        // A locked auto-attack keeps going after the finger lifts.
        if (this.input.touch && !this.attackLocked) this.input.touch.attack = false;
      } else if ('button' in action) this.input.holdButton(action.button, false);
      else if ('hold' in action) this.input.holdAction(action.hold, false);
      if (wasShown && ('button' in action || 'hold' in action)) {
        if (this.tooltipHide) clearTimeout(this.tooltipHide);
        this.tooltipHide = setTimeout(() => el.dispatchEvent(new MouseEvent('mouseleave')), TOOLTIP_MS);
      }
    };
    const targets = [el];
    if (isAttack) {
      this.attackEl = el;
      // An invisible ring around the attack button (CSS) makes the one button that is held for minutes easy to keep.
      const halo = document.createElement('div');
      halo.className = 'slot-halo';
      el.parentElement?.append(halo);
      targets.push(halo);
    }
    for (const target of targets) {
      target.addEventListener('pointerdown', down);
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
      target.addEventListener('lostpointercapture', up);
    }
    this.slotReleases.push(() => {
      if (isAttack) {
        this.setAttackLock(false);
        if (this.input.touch) this.input.touch.attack = false;
      }
      up();
    });
  }

  private setAttackLock(on: boolean): void {
    this.attackLocked = on;
    this.attackEl?.classList.toggle('locked', on);
  }

  /** Lets go of the stick, every held thumb button and the auto-attack lock (rotation, death, controls off). */
  private releaseAll(): void {
    this.resetStick();
    for (const release of this.slotReleases) release();
  }

  private stickDown(e: PointerEvent, zone: HTMLElement): void {
    if (this.stickPointer !== null) return;
    e.preventDefault();
    capture(zone, e.pointerId);
    this.stickPointer = e.pointerId;
    this.stickAtEdge = false;
    this.stickOrigin = { x: e.clientX, y: e.clientY };
    this.placeStickBase();
    this.stickBase.classList.add('active');
    this.stickMove(e);
  }

  /** The base follows `stickOrigin`; it stays inside the zone. */
  private placeStickBase(): void {
    const rect = this.stickZone.getBoundingClientRect();
    this.stickOrigin.x = Math.min(rect.right, Math.max(rect.left, this.stickOrigin.x));
    this.stickOrigin.y = Math.min(rect.bottom, Math.max(rect.top, this.stickOrigin.y));
    this.stickBase.style.left = `${this.stickOrigin.x - rect.left}px`;
    this.stickBase.style.top = `${this.stickOrigin.y - rect.top}px`;
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickPointer || !this.input.touch) return;
    const followed = followStick(this.stickOrigin, e.clientX - this.stickOrigin.x, e.clientY - this.stickOrigin.y);
    if (followed.origin !== this.stickOrigin) {
      this.stickOrigin = followed.origin;
      this.placeStickBase();
    }
    // The knob follows the raw finger (clamped to the ring); the reading ignores the dead zone.
    this.stickKnob.style.transform = `translate(${followed.dx}px, ${followed.dy}px)`;
    const reading = stickReading(followed.dx, followed.dy);
    this.input.touch.stick = reading;
    const mag = reading ? Math.hypot(reading.x, reading.y) : 0;
    if (mag >= 0.99 && !this.stickAtEdge) {
      this.stickAtEdge = true;
      haptic('tick');
    } else if (mag < 0.8) this.stickAtEdge = false;
  }

  private stickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickPointer) return;
    this.resetStick();
  }

  private resetStick(): void {
    this.stickPointer = null;
    this.stickAtEdge = false;
    this.stickKnob.style.transform = '';
    this.stickBase.classList.remove('active');
    this.stickBase.style.left = '';
    this.stickBase.style.top = '';
    if (this.input.touch) this.input.touch.stick = null;
  }

  private panelOpen(selector: string): boolean {
    const el = this.root.querySelector(selector);
    return !!el && !el.hasAttribute('hidden');
  }

  /** Called whenever any `hidden` attribute under the UI root changes. */
  private onHiddenChange(): void {
    const open = [...TOGGLE_PANELS.map((p) => p.selector), ...OTHER_PANELS].filter((sel) => this.panelOpen(sel));
    this.root.classList.toggle('touch-panel-open', open.length > 0);
    // Opening a panel clears its dot (Bag, Skills, Quests) and lets go of a locked auto-attack.
    const now = new Set(open);
    const dotFor: Record<string, string> = { '.inventory-panel': 'inventory', '.tree-panel': 'skills', '.quest-log': 'quests', '.character-panel': 'character' };
    for (const sel of now) {
      if (!this.panelsWere.has(sel) && dotFor[sel]) this.dots.get(dotFor[sel]!)?.parentElement?.classList.remove('has-dot');
    }
    if (open.length > 0 && this.panelsWere.size === 0) {
      this.setMoreOpen(false);
      this.setFabOpen(false);
    }
    this.panelsWere = now;
    if (this.flareButton) {
      // Only write on a change: this runs from a MutationObserver on `hidden`, and a write would re-trigger it forever.
      const hide = this.root.querySelector('.flare-count')?.hasAttribute('hidden') !== false;
      if (this.flareButton.hidden !== hide) this.flareButton.hidden = hide;
    }
    // Death: the overlay takes the screen, so the stick and every held button let go.
    const dead = this.panelOpen('.death-screen');
    if (dead !== this.dead) {
      this.dead = dead;
      this.root.classList.toggle('dead', dead);
      if (dead) this.releaseAll();
    }
  }

  /** `.portrait` on the UI root while a touch screen is held upright (the camera follows the canvas aspect itself). */
  private updatePortrait(): void {
    const portrait = this.active && window.innerHeight > window.innerWidth;
    this.root.classList.toggle('portrait', portrait);
    // Rotating or resizing mid-drag must not leave the hero running or a button held.
    if (portrait !== this.wasPortrait) {
      this.wasPortrait = portrait;
      this.releaseAll();
    }
  }

  /**
   * Phones have no right mouse button: holding a finger on an inventory item, a skill slot or another
   * panel element sends it a contextmenu event (equip, unequip, clear) and swallows the click after it.
   */
  private installLongPress(): void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start = { x: 0, y: 0 };
    let fired = false;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onDown = (e: PointerEvent) => {
      if (!this.active || e.pointerType !== 'touch') return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.panel, .inv-cell, .tree-slot')) return;
      fired = false;
      start = { x: e.clientX, y: e.clientY };
      cancel();
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y }));
        haptic('longPress');
      }, LONG_PRESS);
    };
    const onMove = (e: PointerEvent) => {
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
    };
    const onClick = (e: MouseEvent) => {
      if (!fired) return;
      fired = false;
      e.stopPropagation();
      e.preventDefault();
    };
    // Android also fires its own contextmenu on long-press; ours already did the job.
    const onContext = (e: MouseEvent) => {
      if (this.active && e.isTrusted && (e.target as HTMLElement | null)?.closest('.panel, .inv-cell, .tree-slot')) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', cancel, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContext, true);
  }
}
