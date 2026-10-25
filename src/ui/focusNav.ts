/**
 * Menu focus navigation for the gamepad (round 3, A03): the D-pad and the left stick move focus between the
 * controls of the top panel by position, A clicks the focused control, B backs out like Escape, the bumpers switch
 * tabs. Focus stays inside the top panel (a modal traps it), starts on a control when a screen opens (pad in use)
 * and goes back to where it was when the screen closes.
 *
 * Usage: `focusNav.attach(gamepad)` once; a panel with its own cursor (the inventory grid) registers a handler:
 * `focusNav.register('inventory', { enter, press })`. `press` gets a direction or a button name and returns true when
 * it used the press; the generic navigation runs when it did not. `nearestInDirection` is pure and tested alone.
 */
import { STICK_NAV, PAD, padIndex, isPadCode, type GamepadInput } from '../core/gamepad';
import { panelStack } from './panelStack';

export type NavDir = 'up' | 'down' | 'left' | 'right';
export type NavButton = NavDir | 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'start' | 'select';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The box to move to from `from` in direction `dir`, among `boxes`; -1 when none lies that way. Boxes must lie beyond
 * the centre of `from` along the direction and within about 60 degrees of it; the score favours the nearest one and
 * punishes sideways offset, with a gap on the other axis counting three times as much as a centre offset.
 */
export function nearestInDirection(from: Box, boxes: readonly Box[], dir: NavDir): number {
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  const fc = centre(from);
  let best = -1;
  let bestScore = Infinity;
  boxes.forEach((b, i) => {
    const c = centre(b);
    const along = ((horizontal ? c.x - fc.x : c.y - fc.y) * sign);
    if (along <= 1) return;
    const side = Math.abs(horizontal ? c.y - fc.y : c.x - fc.x);
    // Empty space between the boxes on the cross axis (0 when they overlap there).
    const gap = horizontal ? Math.max(0, Math.max(from.top, b.top) - Math.min(from.bottom, b.bottom)) : Math.max(0, Math.max(from.left, b.left) - Math.min(from.right, b.right));
    const reach = horizontal ? (from.bottom - from.top + (b.bottom - b.top)) / 2 : (from.right - from.left + (b.right - b.left)) / 2;
    if (side > along * 1.7 + reach) return;
    const score = along + side * 0.5 + gap * 3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

function centre(b: Box): { x: number; y: number } {
  return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
}

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [data-nav]';
/** Skipped when a screen opens: the header close button is never the first thing to land on. */
const NOT_FIRST = '.panel-close, .panel-help';

/** A panel's own pad handling. */
export interface PanelNav {
  /** The panel opened with the pad in use: put the cursor somewhere. True when it did. */
  enter?: () => boolean;
  /** A direction or button; true when the panel used it. */
  press?: (button: NavButton) => boolean;
}

/** First press repeats after this long (ms), then at this interval. */
const REPEAT_FIRST = 380;
const REPEAT_EVERY = 110;

class FocusNav {
  private pad: GamepadInput | null = null;
  private readonly handlers = new Map<string, PanelNav>();
  private readonly openers = new Map<string, HTMLElement | null>();
  private known = new Set<string>();
  private heldDir: NavDir | null = null;
  private nextAt = 0;
  /** A direction held when the menu opened is ignored until it is let go. */
  private suppressed: NavDir | null = null;

  register(panelId: string, handler: PanelNav): void {
    this.handlers.set(panelId, handler);
  }

  attach(pad: GamepadInput): void {
    if (this.pad) return;
    this.pad = pad;
    pad.onButton((code, down) => {
      if (down && isPadCode(code)) this.onButton(padIndex(code));
    });
    pad.onPoll(() => this.tick(typeof performance !== 'undefined' ? performance.now() : Date.now()));
    panelStack.onChange((open) => this.onPanels(open));
  }

  // ---- input --------------------------------------------------------------------------------------

  private onButton(index: number): void {
    if (panelStack.top() === null) return;
    const map: Partial<Record<number, NavButton>> = { [PAD.A]: 'a', [PAD.B]: 'b', [PAD.X]: 'x', [PAD.Y]: 'y', [PAD.LB]: 'lb', [PAD.RB]: 'rb', [PAD.START]: 'start', [PAD.SELECT]: 'select' };
    const button = map[index];
    if (button) this.press(button);
  }

  /** Held directions (D-pad or left stick) fire at once, then repeat. */
  tick(now: number): void {
    const pad = this.pad;
    if (!pad) return;
    if (panelStack.top() === null) {
      this.heldDir = null;
      this.suppressed = null;
      return;
    }
    const dir = this.currentDir(pad);
    if (dir === null) {
      this.heldDir = null;
      this.suppressed = null;
      return;
    }
    if (dir === this.suppressed) return;
    if (dir !== this.heldDir) {
      this.heldDir = dir;
      this.nextAt = now + REPEAT_FIRST;
      this.press(dir);
    } else if (now >= this.nextAt) {
      this.nextAt = now + REPEAT_EVERY;
      this.press(dir);
    }
  }

  private currentDir(pad: GamepadInput): NavDir | null {
    if (pad.isButtonDown(PAD.UP)) return 'up';
    if (pad.isButtonDown(PAD.DOWN)) return 'down';
    if (pad.isButtonDown(PAD.LEFT)) return 'left';
    if (pad.isButtonDown(PAD.RIGHT)) return 'right';
    const { x, y } = pad.left;
    // The stick is dead-zoned and rescaled, so half way is already a firm push.
    const edge = (STICK_NAV - 0.22) / 0.78;
    if (Math.hypot(x, y) < edge) return null;
    return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'up' : 'down';
  }

  /** One pad press inside a menu (also called by tests). */
  press(button: NavButton): void {
    const top = panelStack.top();
    if (top === null) return;
    const handler = this.handlers.get(top);
    if (handler?.press?.(button)) return;
    const scope = this.scope(top);
    if (!scope) return;
    const active = this.focusedIn(scope);
    switch (button) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        this.move(scope, active, button);
        break;
      case 'a':
        if (!active) this.focusInitial(top, scope);
        else active.click();
        break;
      case 'b':
        if (active instanceof HTMLInputElement && active.type === 'text') active.blur();
        else panelStack.escape();
        break;
      case 'start':
        panelStack.escape();
        break;
      case 'select':
        if (top === 'map') panelStack.escape();
        break;
      case 'lb':
      case 'rb':
        this.switchTab(scope, button === 'rb' ? 1 : -1);
        break;
      default:
        break;
    }
  }

  // ---- focus --------------------------------------------------------------------------------------

  /** The elements navigation may use: the top panel, plus the other open main panels when the top one is not a modal. */
  private scope(top: string): HTMLElement[] | null {
    const p = panelStack.panel(top);
    if (!p) return null;
    const out = [p.el];
    if (p.kind === 'main' || p.kind === 'service') {
      for (const id of panelStack.openIds()) {
        const other = panelStack.panel(id);
        if (id !== top && other && (other.kind === 'main' || other.kind === 'service')) out.push(other.el);
      }
    }
    return out;
  }

  private focusables(scope: HTMLElement[]): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const root of scope) {
      for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE)) if (usable(el)) out.push(el);
    }
    return out;
  }

  private focusedIn(scope: HTMLElement[]): HTMLElement | null {
    const a = document.activeElement;
    return a instanceof HTMLElement && scope.some((r) => r.contains(a)) && a !== document.body ? a : null;
  }

  private move(scope: HTMLElement[], active: HTMLElement | null, dir: NavDir): void {
    if (!active) {
      this.focusInitial(panelStack.top()!, scope);
      return;
    }
    if (active instanceof HTMLInputElement && active.type === 'range' && (dir === 'left' || dir === 'right')) {
      stepRange(active, dir === 'right' ? 1 : -1);
      return;
    }
    const items = this.focusables(scope).filter((el) => el !== active);
    const idx = nearestInDirection(toBox(active), items.map(toBox), dir);
    const next = items[idx];
    if (next) focusEl(next);
  }

  private focusInitial(top: string, scope: HTMLElement[]): void {
    const handler = this.handlers.get(top);
    if (handler?.enter?.()) return;
    const items = this.focusables(scope);
    const pick =
      items.find((el) => el.matches('[data-pad-default], .primary, [autofocus]')) ??
      items.find((el) => !el.matches(NOT_FIRST)) ??
      items[0];
    if (pick) focusEl(pick);
  }

  private switchTab(scope: HTMLElement[], step: number): void {
    const tabs = this.focusables(scope).filter((el) => el.getAttribute('role') === 'tab');
    if (tabs.length < 2) return;
    const at = tabs.findIndex((el) => el.getAttribute('aria-selected') === 'true' || el.classList.contains('active'));
    const next = tabs[(Math.max(0, at) + step + tabs.length) % tabs.length]!;
    next.click();
    focusEl(next);
  }

  // ---- screens opening and closing ---------------------------------------------------------------------------

  private onPanels(open: string[]): void {
    const now = new Set(open);
    for (const id of open) {
      if (this.known.has(id)) continue;
      // A screen opened: remember where focus was, and give it a focused control when the pad is in use.
      const prev = document.activeElement;
      this.openers.set(id, prev instanceof HTMLElement && prev !== document.body ? prev : null);
      if (this.pad?.lastDevice === 'pad') {
        this.suppressed = this.heldDir ?? (this.pad ? this.currentDir(this.pad) : null);
        queueMicrotask(() => {
          const top = panelStack.top();
          const scope = top ? this.scope(top) : null;
          if (top === id && scope && !this.focusedIn(scope)) this.focusInitial(id, scope);
        });
      }
    }
    for (const id of this.known) {
      if (now.has(id)) continue;
      const back = this.openers.get(id);
      this.openers.delete(id);
      const top = panelStack.top();
      const a = document.activeElement;
      const lost = !a || a === document.body || (a instanceof HTMLElement && !a.isConnected) || (a instanceof HTMLElement && a.offsetParent === null);
      if (back && back.isConnected && (lost || this.pad?.lastDevice === 'pad')) {
        // Back to the control that opened the screen (the panel below, or the page).
        const scope = top ? this.scope(top) : null;
        if (!scope || scope.some((r) => r.contains(back))) back.focus({ preventScroll: true });
      }
    }
    this.known = now;
  }
}

function usable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled || el.hidden || el.closest('[hidden], [inert]')) return false;
  if (el.getAttribute('tabindex') === '-1' && !el.hasAttribute('data-nav')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function toBox(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function focusEl(el: HTMLElement): void {
  el.focus({ preventScroll: true });
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** Left/right on a slider: one step, with the events a drag would send. */
function stepRange(input: HTMLInputElement, dir: number): void {
  const step = Number(input.step) || 1;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Math.min(max, Math.max(min, Number(input.value) + dir * step));
  if (value === Number(input.value)) return;
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The shared instance. */
export const focusNav = new FocusNav();
