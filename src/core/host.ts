/**
 * The Android host (AYN Thor APK, docs/android.md): the Java app injects `window.AshfallAndroid` before the page
 * runs and calls `window.__ashfallPad(...)` / `window.__ashfallCommand(name)`; the game calls back through
 * `AshfallAndroid.rumble` and `AshfallAndroid.panelState`. In a browser none of this exists and every function
 * here does nothing.
 *
 * Usage: `installHost()` first thing in main.ts (defines `__ashfallPad`, adds `html.host-android`);
 * `game.connectHost()` later calls `installHostCommands(...)`. `GamepadInput` reads `hostPadSource` on the host.
 * This file imports only types, so gamepad.ts and the UI can use it without cycles.
 */
import type { Action } from '../data/settings';
import type { GamepadLike } from './gamepad';

interface AndroidBridge {
  platform?: () => string;
  secondScreen?: () => boolean;
  rumble?: (strong: number, weak: number, ms: number) => void;
  panelState?: (json: string) => void;
}

declare global {
  interface Window {
    AshfallAndroid?: AndroidBridge;
    __ashfallPad?: (connected: boolean, name: string, axes: ArrayLike<number>, buttons: ArrayLike<number>) => void;
    __ashfallCommand?: (name: string) => void;
  }
}

/** True inside the Android app (the bridge object is there). */
export function isAndroidHost(): boolean {
  return typeof window !== 'undefined' && !!window.AshfallAndroid;
}

// ---- Pad source ----------------------------------------------------------------------------------------------

/** Standard-mapping buttons that are analog (LT, RT): pressed past half travel; the others press at any value. */
const ANALOG_BUTTONS: ReadonlySet<number> = new Set([6, 7]);

let hostPad: GamepadLike | null = null;
const NO_PADS: GamepadLike[] = [];

/** Turns one `__ashfallPad` call into a pad (index 0, standard mapping). Exported for tests. */
export function padFromHost(connected: boolean, name: string, axes: ArrayLike<number>, buttons: ArrayLike<number>): GamepadLike {
  return {
    index: 0,
    id: `${name || 'Controller'} (STANDARD GAMEPAD Vendor: 0000)`,
    connected,
    axes: Array.from(axes, (v) => Number(v) || 0),
    buttons: Array.from(buttons, (v, i) => {
      const value = Number(v) || 0;
      return { pressed: ANALOG_BUTTONS.has(i) ? value > 0.5 : value > 0, value };
    }),
  };
}

/** A `getGamepads` source for `GamepadInput`: the last state the host sent, nothing while disconnected. */
export function hostPadSource(): ArrayLike<GamepadLike | null> {
  return hostPad && hostPad.connected ? [hostPad] : NO_PADS;
}

/** The pad state as the host last reported it (tests reset it with `resetHostPad`). */
export function resetHostPad(): void {
  hostPad = null;
}

// ---- Commands ------------------------------------------------------------------------------------------------

export const HOST_COMMANDS = ['back', 'pause', 'inventory', 'character', 'skills', 'quests', 'map', 'potion', 'flare', 'mount', 'pickup'] as const;
export type HostCommand = (typeof HOST_COMMANDS)[number];

/** The game's side of the commands: Escape, the pad's Start button, and a tap on a bound action. */
export interface HostCommandHandlers {
  escape: () => void;
  pause: () => void;
  press: (action: Action) => void;
}

/** Runs one command by name; unknown names are ignored. Returns whether it was one. */
export function runHostCommand(name: string, h: HostCommandHandlers): boolean {
  if (!(HOST_COMMANDS as readonly string[]).includes(name)) return false;
  const command = name as HostCommand;
  if (command === 'back') h.escape();
  else if (command === 'pause') h.pause();
  else h.press(command);
  return true;
}

/** Defines `window.__ashfallCommand`. Does nothing off the host. */
export function installHostCommands(h: HostCommandHandlers): void {
  if (!isAndroidHost()) return;
  window.__ashfallCommand = (name) => {
    try {
      runHostCommand(String(name), h);
    } catch (err) {
      console.error('[ashfall] host command failed', name, err);
    }
  };
}

// ---- Install ---------------------------------------------------------------------------------------------------

/** On the host: define `__ashfallPad` and mark the page (`html.host-android`). Safe to call twice; false off the host. */
export function installHost(): boolean {
  if (!isAndroidHost()) return false;
  document.documentElement.classList.add('host-android');
  window.__ashfallPad = (connected, name, axes, buttons) => {
    hostPad = padFromHost(!!connected, String(name ?? ''), axes ?? [], buttons ?? []);
  };
  return true;
}

// ---- Game -> host ----------------------------------------------------------------------------------------------

/** Controller rumble through the host (the haptics setting is checked by `haptic()` before this runs). */
export function hostRumble(strong: number, weak: number, ms: number): void {
  try {
    window.AshfallAndroid?.rumble?.(strong, weak, ms);
  } catch {
    // The bridge refused (activity going away): rumble is optional.
  }
}

/** What the bottom screen shows (docs/android.md). */
export interface PanelState {
  hp: number;
  hpMax: number;
  res: number;
  resMax: number;
  resName: string;
  level: number;
  xpPct: number;
  zone: string;
  gold: number;
  potions: number;
  potionsMax: number;
  inGame: boolean;
}

/** Minimum gap between two `panelState` calls (at most 4 a second). */
export const PANEL_STATE_GAP_MS = 250;
let lastPanelState = -Infinity;

/**
 * Sends the panel state, at most every 250 ms. `build` only runs when a send is due, and nothing runs off the host.
 * `now` is a millisecond clock (a test passes its own).
 */
export function sendPanelState(build: () => PanelState, now: number = typeof performance !== 'undefined' ? performance.now() : Date.now()): boolean {
  const bridge = typeof window !== 'undefined' ? window.AshfallAndroid : undefined;
  if (!bridge?.panelState) return false;
  if (now - lastPanelState < PANEL_STATE_GAP_MS) return false;
  lastPanelState = now;
  try {
    bridge.panelState(JSON.stringify(build()));
    return true;
  } catch {
    return false;
  }
}

/** Forget the throttle (tests). */
export function resetPanelStateThrottle(): void {
  lastPanelState = -Infinity;
}
