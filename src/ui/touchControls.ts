/**
 * On-screen controls for phones and tablets: a floating joystick on the left, the action bar turned
 * into thumb buttons on the right (attack, five skills, dodge, potion), a menu row for the panels,
 * a tappable interact prompt and long-press as right-click inside panels. The `.touch-ui` class on the
 * UI root switches the HUD to the touch layout; `.portrait` on top of it (phone held upright) moves
 * everything out of the thumbs' way.
 */
import type { Input } from '../core/input';
import { t } from '../data/i18n';
import type { Action } from '../data/settings';

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
const menuIconUrl = (id: string): string => `${import.meta.env.BASE_URL}assets/ui/menu/${id}.${id === 'fullscreen' || id === 'close' ? 'png' : 'svg'}`;

const MENU: { id: string; action: Action }[] = [
  { id: 'inventory', action: 'inventory' },
  { id: 'character', action: 'character' },
  { id: 'skills', action: 'skills' },
  { id: 'map', action: 'map' },
  { id: 'quests', action: 'quests' },
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

/** Joystick travel in CSS pixels at full deflection. */
const STICK_RADIUS = 56;
/** Long-press time that opens the right-click action inside panels (ms). */
const LONG_PRESS = 450;

export class TouchControls {
  private readonly elements: HTMLElement[] = [];
  private readonly stickBase: HTMLDivElement;
  private readonly stickKnob: HTMLDivElement;
  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private active = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly input: Input,
    slotElements: HTMLElement[],
  ) {
    // Joystick: a zone over the lower left; the base jumps to wherever the thumb lands.
    const zone = document.createElement('div');
    zone.className = 'touch-stick-zone';
    zone.dataset.testid = 'touch-stick';
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

    // Menu row: one icon button per panel.
    const menu = document.createElement('div');
    menu.className = 'touch-menu';
    const menuButton = (id: string, label: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = 'touch-menu-btn';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.dataset.testid = `touch-menu-${id}`;
      const icon = document.createElement('span');
      icon.className = 'touch-menu-icon';
      icon.style.setProperty('--icon', `url("${menuIconUrl(id)}")`);
      b.appendChild(icon);
      b.addEventListener('click', onClick);
      return b;
    };
    for (const m of MENU) menu.appendChild(menuButton(m.id, t(`touch.menu.${m.id}`), () => this.input.pressAction(m.action)));
    if (document.fullscreenEnabled) {
      menu.appendChild(
        menuButton('fullscreen', t('touch.menu.fullscreen'), () => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen().catch(() => {});
        }),
      );
    }

    // Portrait panels cover the menu and a phone has no Escape key: a close button floats over them.
    const close = menuButton('close', t('touch.menu.close'), () => {
      for (const p of TOGGLE_PANELS) if (this.panelOpen(p.selector)) this.input.pressAction(p.action);
    });
    close.classList.add('touch-close');

    this.elements.push(zone, menu, close);
    root.append(...this.elements);
    for (const el of this.elements) el.hidden = true;

    // The action bar's slots become thumb buttons.
    slotElements.forEach((el, i) => this.bindSlot(el, SLOT_ACTIONS[i]!));

    const onResize = () => this.updatePortrait();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    this.cleanups.push(() => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    });
    // Panels show and hide through the `hidden` attribute; keep `.touch-panel-open` in step with it.
    const watch = new MutationObserver(() => this.updatePanelOpen());
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
    this.resetStick();
    this.updatePortrait();
  }

  private bindSlot(el: HTMLElement, action: (typeof SLOT_ACTIONS)[number]): void {
    const down = (e: PointerEvent) => {
      if (!this.active) return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('pressed');
      if ('attack' in action) {
        if (this.input.touch) this.input.touch.attack = true;
      } else if ('button' in action) this.input.holdButton(action.button, true);
      else if ('hold' in action) this.input.holdAction(action.hold, true);
      else this.input.pressAction(action.tap);
    };
    const up = () => {
      el.classList.remove('pressed');
      if ('attack' in action) {
        if (this.input.touch) this.input.touch.attack = false;
      } else if ('button' in action) this.input.holdButton(action.button, false);
      else if ('hold' in action) this.input.holdAction(action.hold, false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  private stickDown(e: PointerEvent, zone: HTMLElement): void {
    if (this.stickPointer !== null) return;
    e.preventDefault();
    zone.setPointerCapture?.(e.pointerId);
    this.stickPointer = e.pointerId;
    const rect = zone.getBoundingClientRect();
    this.stickOrigin = { x: e.clientX, y: e.clientY };
    this.stickBase.style.left = `${e.clientX - rect.left}px`;
    this.stickBase.style.top = `${e.clientY - rect.top}px`;
    this.stickBase.classList.add('active');
    this.stickMove(e);
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickPointer || !this.input.touch) return;
    let dx = e.clientX - this.stickOrigin.x;
    let dy = e.clientY - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx *= STICK_RADIUS / len;
      dy *= STICK_RADIUS / len;
    }
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Screen y grows downward; the stick reports +y as up.
    this.input.touch.stick = { x: dx / STICK_RADIUS, y: -dy / STICK_RADIUS };
  }

  private stickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickPointer) return;
    this.resetStick();
  }

  private resetStick(): void {
    this.stickPointer = null;
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

  private updatePanelOpen(): void {
    this.root.classList.toggle('touch-panel-open', TOGGLE_PANELS.some((p) => this.panelOpen(p.selector)));
  }

  /** `.portrait` on the UI root while a touch screen is held upright (the camera follows the canvas aspect itself). */
  private updatePortrait(): void {
    this.root.classList.toggle('portrait', this.active && window.innerHeight > window.innerWidth);
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
        navigator.vibrate?.(20);
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
