/**
 * On-screen controls for phones and tablets: a floating joystick on the left, the action bar turned
 * into thumb buttons on the right (attack, five skills, dodge, potion), a menu row for the panels,
 * a tappable interact prompt, long-press as right-click inside panels, and a hint to turn the phone
 * sideways. The `.touch-ui` class on the UI root switches the HUD to the touch layout.
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

const MENU: { id: string; action: Action }[] = [
  { id: 'inventory', action: 'inventory' },
  { id: 'character', action: 'character' },
  { id: 'skills', action: 'skills' },
  { id: 'map', action: 'map' },
  { id: 'quests', action: 'quests' },
  { id: 'mount', action: 'mount' },
];

/** Joystick travel in CSS pixels at full deflection. */
const STICK_RADIUS = 56;
/** Long-press time that opens the right-click action inside panels (ms). */
const LONG_PRESS = 450;

export class TouchControls {
  private readonly elements: HTMLElement[] = [];
  private readonly stickBase: HTMLDivElement;
  private readonly stickKnob: HTMLDivElement;
  private readonly rotate: HTMLDivElement;
  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private rotateDismissed = false;
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

    // Menu row: one button per panel.
    const menu = document.createElement('div');
    menu.className = 'touch-menu';
    for (const m of MENU) {
      const b = document.createElement('button');
      b.className = 'touch-menu-btn';
      b.textContent = t(`touch.menu.${m.id}`);
      b.dataset.testid = `touch-menu-${m.id}`;
      b.addEventListener('click', () => this.input.pressAction(m.action));
      menu.appendChild(b);
    }
    if (document.fullscreenEnabled) {
      const full = document.createElement('button');
      full.className = 'touch-menu-btn';
      full.textContent = t('touch.menu.fullscreen');
      full.addEventListener('click', () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => {});
      });
      menu.appendChild(full);
    }

    // Turn-sideways hint for portrait screens.
    this.rotate = document.createElement('div');
    this.rotate.className = 'touch-rotate';
    const msg = document.createElement('p');
    msg.textContent = t('touch.rotate');
    const anyway = document.createElement('button');
    anyway.className = 'btn';
    anyway.textContent = t('touch.playAnyway');
    anyway.addEventListener('click', () => {
      this.rotateDismissed = true;
      this.updateRotate();
    });
    this.rotate.append(msg, anyway);

    this.elements.push(zone, menu, this.rotate);
    root.append(...this.elements);
    for (const el of this.elements) el.hidden = true;

    // The action bar's slots become thumb buttons.
    slotElements.forEach((el, i) => this.bindSlot(el, SLOT_ACTIONS[i]!));

    const onResize = () => this.updateRotate();
    window.addEventListener('resize', onResize);
    this.cleanups.push(() => window.removeEventListener('resize', onResize));
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
    this.updateRotate();
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

  private updateRotate(): void {
    const portrait = window.innerHeight > window.innerWidth;
    this.rotate.hidden = !(this.active && portrait && !this.rotateDismissed);
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
