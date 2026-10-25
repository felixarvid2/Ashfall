/**
 * Gamepad input (round 3, A01/A05/A07/A08): polls `navigator.getGamepads()` and turns the active pad into button
 * edges ("Pad0".."Pad16", the standard-mapping button indexes), two dead-zoned sticks, hot-plug events and rumble.
 *
 * Usage: `Input` owns one (`input.gamepad`); `pad.start()` runs the poll on its own animation-frame loop so menus
 * stay navigable while the simulation is paused. Tests build `new GamepadInput({ getGamepads })` and call `poll()`.
 *  - `onButton((code, down) => ...)` every button change of the active pad (triggers count as pressed past 0.5);
 *  - `left` / `right`: stick deflection with +y UP (the Gamepad API reports +y down), radial dead zone applied;
 *  - `lastDevice`: 'pad' once the pad was touched, 'kbm' after the next key or mouse input (`noteKeyboardMouse`);
 *  - `onConnection` fires for plugging and unplugging, `capture` takes the next button press (rebinding).
 */

/** Button indexes of the standard mapping. */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  HOME: 16,
} as const;

/** The binding code of a pad button ("Pad0" is A). */
export const padCode = (index: number): string => `Pad${index}`;
export const isPadCode = (code: string): boolean => /^Pad\d+$/.test(code);
export const padIndex = (code: string): number => Number(code.slice(3));

/** Sticks below this deflection are ignored; above it the range is stretched back to 0..1. */
export const STICK_DEAD_ZONE = 0.22;
/** A stick counts as a menu direction (and as device activity) past this deflection. */
export const STICK_NAV = 0.55;
/** Analog triggers count as pressed past this value. */
export const TRIGGER_THRESHOLD = 0.5;

/** Radial dead zone: inside it nothing, outside it the length is rescaled so the edge of the zone is 0. */
export function applyDeadZone(x: number, y: number, dead = STICK_DEAD_ZONE): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < dead) return { x: 0, y: 0 };
  const scale = Math.min(1, (len - dead) / (1 - dead)) / len;
  return { x: x * scale, y: y * scale };
}

interface RumbleEffect {
  startDelay?: number;
  duration: number;
  weakMagnitude: number;
  strongMagnitude: number;
}

/** The slice of the Gamepad interface that is read here (a test passes plain objects). */
export interface GamepadLike {
  index: number;
  id: string;
  connected: boolean;
  buttons: ArrayLike<{ pressed: boolean; value: number }>;
  axes: ArrayLike<number>;
  vibrationActuator?: { playEffect?: (type: 'dual-rumble', params: RumbleEffect) => Promise<unknown> } | null;
}

export type PadDevice = 'pad' | 'kbm';

export interface GamepadOptions {
  getGamepads?: () => ArrayLike<GamepadLike | null | undefined>;
}

export class GamepadInput {
  /** Sticks, +y up, dead zone applied. */
  readonly left = { x: 0, y: 0 };
  readonly right = { x: 0, y: 0 };
  lastDevice: PadDevice = 'kbm';

  private readonly getPads: () => ArrayLike<GamepadLike | null | undefined>;
  private active = -1;
  private readonly known = new Map<number, string>();
  private readonly held = new Map<number, boolean[]>();
  private readonly buttonListeners = new Set<(code: string, down: boolean) => void>();
  private readonly connectionListeners = new Set<(event: 'connected' | 'disconnected', name: string, wasActive: boolean) => void>();
  private readonly deviceListeners = new Set<(device: PadDevice) => void>();
  private readonly pollListeners = new Set<() => void>();
  private captureFn: ((code: string) => void) | null = null;
  private raf = 0;
  private started = false;

  constructor(opts: GamepadOptions = {}) {
    this.getPads =
      opts.getGamepads ??
      (() => {
        try {
          return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? (navigator.getGamepads() as ArrayLike<GamepadLike | null>) : [];
        } catch {
          return [];
        }
      });
  }

  /** A pad is plugged in and has been used. */
  get hasPad(): boolean {
    return this.active >= 0;
  }

  /** Name of the active pad (for the toast). */
  get name(): string {
    return this.known.get(this.active) ?? '';
  }

  /** Is this standard-mapping button of the active pad held? */
  isButtonDown(index: number): boolean {
    return this.held.get(this.active)?.[index] ?? false;
  }

  onButton(fn: (code: string, down: boolean) => void): () => void {
    this.buttonListeners.add(fn);
    return () => this.buttonListeners.delete(fn);
  }

  onConnection(fn: (event: 'connected' | 'disconnected', name: string, wasActive: boolean) => void): () => void {
    this.connectionListeners.add(fn);
    return () => this.connectionListeners.delete(fn);
  }

  onDevice(fn: (device: PadDevice) => void): () => void {
    this.deviceListeners.add(fn);
    return () => this.deviceListeners.delete(fn);
  }

  /** After every poll (focus navigation repeats held directions from here). */
  onPoll(fn: () => void): () => void {
    this.pollListeners.add(fn);
    return () => this.pollListeners.delete(fn);
  }

  /** The next button press goes to `fn` alone (no other listener sees it); returns the cancel function. */
  capture(fn: (code: string) => void): () => void {
    this.captureFn = fn;
    return () => {
      if (this.captureFn === fn) this.captureFn = null;
    };
  }

  /** Key or mouse input: the prompts and the menu focus go back to the keyboard. */
  noteKeyboardMouse(): void {
    this.setDevice('kbm');
  }

  private setDevice(device: PadDevice): void {
    if (this.lastDevice === device) return;
    this.lastDevice = device;
    for (const fn of this.deviceListeners) fn(device);
  }

  /** Read the pads once. Safe to call many times a frame: only changes since the last call produce events. */
  poll(): void {
    const pads: GamepadLike[] = [];
    const list = this.getPads();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p && p.connected) pads.push(p);
    }
    // Hot-plug: pads that appeared or went away since the last poll.
    const present = new Set(pads.map((p) => p.index));
    for (const p of pads) {
      if (!this.known.has(p.index)) {
        this.known.set(p.index, p.id);
        this.held.set(p.index, []);
        for (const fn of this.connectionListeners) fn('connected', p.id, false);
      }
    }
    for (const [index, name] of [...this.known]) {
      if (present.has(index)) continue;
      const wasActive = index === this.active;
      if (wasActive) this.releaseAll(index);
      this.known.delete(index);
      this.held.delete(index);
      if (wasActive) {
        this.active = -1;
        this.left.x = this.left.y = this.right.x = this.right.y = 0;
        // Prompts and menu focus go back to the keyboard with the pad gone.
        this.setDevice('kbm');
      }
      for (const fn of this.connectionListeners) fn('disconnected', name, wasActive);
    }

    // Who is being used? A new button press or a pushed stick makes a pad the active one.
    for (const p of pads) {
      const was = this.held.get(p.index) ?? [];
      const now = readButtons(p);
      const stick = Math.max(Math.hypot(p.axes[0] ?? 0, p.axes[1] ?? 0), Math.hypot(p.axes[2] ?? 0, p.axes[3] ?? 0));
      const pressed = now.some((d, i) => d && !was[i]);
      if (p.index !== this.active && (pressed || stick > STICK_NAV)) {
        if (this.active >= 0) this.releaseAll(this.active);
        this.active = p.index;
      }
    }
    const pad = pads.find((p) => p.index === this.active);
    if (pad) this.readActive(pad);
    for (const fn of this.pollListeners) fn();
  }

  private readActive(pad: GamepadLike): void {

    const was = this.held.get(pad.index) ?? [];
    const now = readButtons(pad);
    const l = applyDeadZone(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0));
    const r = applyDeadZone(pad.axes[2] ?? 0, -(pad.axes[3] ?? 0));
    this.left.x = l.x;
    this.left.y = l.y;
    this.right.x = r.x;
    this.right.y = r.y;
    const busy = Math.hypot(pad.axes[0] ?? 0, pad.axes[1] ?? 0) > STICK_NAV || Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0) > STICK_NAV;
    const length = Math.max(now.length, was.length);
    let anyPress = false;
    for (let i = 0; i < length; i++) {
      const d = !!now[i];
      if (d === !!was[i]) continue;
      if (d) anyPress = true;
    }
    if (anyPress || busy) this.setDevice('pad');
    this.held.set(pad.index, now);
    for (let i = 0; i < length; i++) {
      const d = !!now[i];
      if (d === !!was[i]) continue;
      this.emit(padCode(i), d);
    }
  }

  private emit(code: string, down: boolean): void {
    if (down && this.captureFn) {
      const fn = this.captureFn;
      this.captureFn = null;
      fn(code);
      return;
    }
    for (const fn of this.buttonListeners) fn(code, down);
  }

  /** Release everything a pad was holding (it went away or another one took over). */
  private releaseAll(index: number, keepState = false): void {
    const was = this.held.get(index) ?? [];
    // With `keepState` the buttons stay "held" here, so a press has to be made again to count (focus loss).
    if (!keepState) this.held.set(index, []);
    was.forEach((d, i) => {
      if (d) for (const fn of this.buttonListeners) fn(padCode(i), false);
    });
  }

  /** Rumble the active pad (A07). Browsers without `vibrationActuator` do nothing. */
  rumble(strong: number, weak: number, ms: number): void {
    const pad = [...Array.from(this.getPads())].find((p) => p && p.index === this.active);
    try {
      void pad?.vibrationActuator?.playEffect?.('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong })?.catch?.(() => undefined);
    } catch {
      // No actuator, or the browser refuses before a user gesture: nothing to report.
    }
  }

  /** Poll on every animation frame. Idempotent. */
  start(): void {
    if (this.started || typeof requestAnimationFrame !== 'function') return;
    this.started = true;
    const tick = () => {
      this.poll();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    // A button held across a focus loss must press again to count.
    if (typeof window !== 'undefined') window.addEventListener('blur', () => this.releaseAll(this.active, true));
  }

  stop(): void {
    this.started = false;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
  }
}

function readButtons(p: GamepadLike): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < p.buttons.length; i++) {
    const b = p.buttons[i]!;
    out.push(i === PAD.LT || i === PAD.RT ? b.pressed || b.value > TRIGGER_THRESHOLD : b.pressed);
  }
  return out;
}
