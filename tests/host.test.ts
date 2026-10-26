// @vitest-environment happy-dom
/** The Android host bridge (docs/android.md): pad source, commands, touch overlay, rumble and panelState. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOST_COMMANDS,
  PANEL_STATE_GAP_MS,
  hostPadSource,
  hostRumble,
  installHost,
  installHostCommands,
  isAndroidHost,
  resetHostPad,
  resetPanelStateThrottle,
  runHostCommand,
  sendPanelState,
  type HostCommandHandlers,
  type PanelState,
} from '../src/core/host';
import { GamepadInput, PAD, padCode } from '../src/core/gamepad';
import { isTouchDevice } from '../src/ui/touchControls';
import { hapticsSupported } from '../src/ui/haptics';

type Win = Window & { AshfallAndroid?: object; __ashfallPad?: unknown; __ashfallCommand?: unknown };
const win = window as unknown as Win;

const bridge = () => ({ rumble: vi.fn(), panelState: vi.fn(), platform: () => 'android', secondScreen: () => false });
const zeros = (n: number) => Array.from({ length: n }, () => 0);
const state = (over: Partial<PanelState> = {}): PanelState => ({
  hp: 10, hpMax: 20, res: 5, resMax: 100, resName: 'Heat', level: 3, xpPct: 40, zone: 'Cinder Flats', gold: 7, potions: 2, potionsMax: 3, inGame: true, ...over,
});

beforeEach(() => {
  resetHostPad();
  resetPanelStateThrottle();
});
afterEach(() => {
  delete win.AshfallAndroid;
  delete win.__ashfallPad;
  delete win.__ashfallCommand;
  document.documentElement.classList.remove('host-android');
  vi.restoreAllMocks();
});

describe('host detection and install', () => {
  it('is off in a browser: nothing is defined or marked', () => {
    expect(isAndroidHost()).toBe(false);
    expect(installHost()).toBe(false);
    expect(win.__ashfallPad).toBeUndefined();
    expect(document.documentElement.classList.contains('host-android')).toBe(false);
  });

  it('on the host defines __ashfallPad and marks the page', () => {
    win.AshfallAndroid = bridge();
    expect(isAndroidHost()).toBe(true);
    expect(installHost()).toBe(true);
    expect(typeof win.__ashfallPad).toBe('function');
    expect(document.documentElement.classList.contains('host-android')).toBe(true);
  });
});

describe('pad source', () => {
  const send = (connected: boolean, axes: number[], buttons: number[], name = 'AYN Thor') =>
    (win.__ashfallPad as (c: boolean, n: string, a: number[], b: number[]) => void)(connected, name, axes, buttons);
  beforeEach(() => {
    win.AshfallAndroid = bridge();
    installHost();
  });

  it('starts empty and maps axes and buttons after a state arrives', () => {
    expect(hostPadSource().length).toBe(0);
    const buttons = zeros(17);
    buttons[PAD.A] = 1;
    buttons[PAD.LT] = 0.3;
    buttons[PAD.RT] = 0.8;
    buttons[PAD.UP] = 1;
    send(true, [0.5, -0.25, 0, 1], buttons);
    const pads = hostPadSource();
    expect(pads.length).toBe(1);
    const pad = pads[0]!;
    expect(pad.index).toBe(0);
    expect(pad.connected).toBe(true);
    expect(pad.id).toContain('AYN Thor');
    expect(pad.id).toContain('STANDARD GAMEPAD');
    expect(Array.from(pad.axes)).toEqual([0.5, -0.25, 0, 1]);
    expect(pad.buttons.length).toBe(17);
    expect(pad.buttons[PAD.A]).toEqual({ pressed: true, value: 1 });
    expect(pad.buttons[PAD.B]).toEqual({ pressed: false, value: 0 });
    // Analog triggers press past half travel; digital buttons at any value.
    expect(pad.buttons[PAD.LT]).toEqual({ pressed: false, value: 0.3 });
    expect(pad.buttons[PAD.RT]).toEqual({ pressed: true, value: 0.8 });
    expect(pad.buttons[PAD.UP]!.pressed).toBe(true);
  });

  it('a disconnect empties the list, a reconnect brings the pad back', () => {
    send(true, zeros(4), zeros(17));
    expect(hostPadSource().length).toBe(1);
    send(false, zeros(4), zeros(17));
    expect(hostPadSource().length).toBe(0);
    send(true, zeros(4), zeros(17));
    expect(hostPadSource().length).toBe(1);
  });

  it('the default GamepadInput reads it: buttons fire, sticks move, lastDevice turns pad', () => {
    const input = new GamepadInput();
    const events: [string, boolean][] = [];
    input.onButton((code, down) => events.push([code, down]));
    const connection: string[] = [];
    input.onConnection((e) => connection.push(e));
    input.poll();
    expect(input.lastDevice).toBe('kbm');

    const buttons = zeros(17);
    buttons[PAD.START] = 1;
    send(true, [0, 0, 0, 0], buttons);
    input.poll();
    expect(connection).toEqual(['connected']);
    expect(events).toEqual([[padCode(PAD.START), true]]);
    expect(input.lastDevice).toBe('pad');
    expect(input.isButtonDown(PAD.START)).toBe(true);

    buttons[PAD.START] = 0;
    send(true, [1, 0, 0, -1], buttons); // left stick right; right stick up (the Gamepad API reports +y down)
    input.poll();
    expect(events.at(-1)).toEqual([padCode(PAD.START), false]);
    expect(input.left.x).toBeGreaterThan(0.9);
    expect(input.right.y).toBeGreaterThan(0.9);

    send(false, zeros(4), zeros(17));
    input.poll();
    expect(connection).toEqual(['connected', 'disconnected']);
    expect(input.lastDevice).toBe('kbm');
    expect(input.left).toEqual({ x: 0, y: 0 });
  });

  it('a browser GamepadInput does not use the host source', () => {
    delete win.AshfallAndroid;
    send(true, zeros(4), [1, ...zeros(16)]);
    const input = new GamepadInput();
    const events: string[] = [];
    input.onButton((code) => events.push(code));
    input.poll();
    expect(events).toEqual([]);
  });
});

describe('commands', () => {
  const handlers = () => ({ escape: vi.fn<HostCommandHandlers['escape']>(), pause: vi.fn<HostCommandHandlers['pause']>(), press: vi.fn<HostCommandHandlers['press']>() });

  it('back is Escape, pause is the pause path, the rest press the same-named action', () => {
    const h = handlers();
    expect(runHostCommand('back', h)).toBe(true);
    expect(h.escape).toHaveBeenCalledTimes(1);
    expect(runHostCommand('pause', h)).toBe(true);
    expect(h.pause).toHaveBeenCalledTimes(1);
    for (const name of HOST_COMMANDS.filter((n) => n !== 'back' && n !== 'pause')) runHostCommand(name, h);
    expect(h.press.mock.calls.map((c) => c[0])).toEqual(['inventory', 'character', 'skills', 'quests', 'map', 'potion', 'flare', 'mount', 'pickup']);
    expect(h.escape).toHaveBeenCalledTimes(1);
    expect(h.pause).toHaveBeenCalledTimes(1);
  });

  it('ignores unknown names', () => {
    const h = handlers();
    expect(runHostCommand('reboot', h)).toBe(false);
    expect(runHostCommand('', h)).toBe(false);
    expect(runHostCommand('constructor', h)).toBe(false);
    expect(h.escape).not.toHaveBeenCalled();
    expect(h.press).not.toHaveBeenCalled();
  });

  it('installs __ashfallCommand on the host only', () => {
    const h = handlers();
    installHostCommands(h);
    expect(win.__ashfallCommand).toBeUndefined();
    win.AshfallAndroid = bridge();
    installHostCommands(h);
    const cmd = win.__ashfallCommand as (n: string) => void;
    cmd('inventory');
    cmd('nonsense');
    cmd('back');
    expect(h.press).toHaveBeenCalledWith('inventory');
    expect(h.press).toHaveBeenCalledTimes(1);
    expect(h.escape).toHaveBeenCalledTimes(1);
  });

  it('a throwing handler does not escape into the host', () => {
    const h = handlers();
    h.escape.mockImplementation(() => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    win.AshfallAndroid = bridge();
    installHostCommands(h);
    expect(() => (win.__ashfallCommand as (n: string) => void)('back')).not.toThrow();
  });
});

describe('touch, haptics and rumble', () => {
  it('the touch overlay is off on the host even for a coarse pointer', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    try {
      expect(isTouchDevice()).toBe(true);
      win.AshfallAndroid = bridge();
      expect(isTouchDevice()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rumble goes to the bridge; a missing or throwing bridge is harmless', () => {
    expect(() => hostRumble(1, 0.5, 100)).not.toThrow();
    const b = bridge();
    win.AshfallAndroid = b;
    hostRumble(0.6, 0.3, 140);
    expect(b.rumble).toHaveBeenCalledWith(0.6, 0.3, 140);
    b.rumble.mockImplementation(() => {
      throw new Error('gone');
    });
    expect(() => hostRumble(1, 1, 1)).not.toThrow();
  });

  it('navigator.vibrate is not used on the host (the host rumbles instead)', () => {
    vi.stubGlobal('navigator', { ...navigator, vibrate: () => true });
    try {
      expect(hapticsSupported()).toBe(true);
      win.AshfallAndroid = bridge();
      expect(hapticsSupported()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('panelState', () => {
  it('does no work off the host', () => {
    const build = vi.fn(state);
    expect(sendPanelState(build, 1000)).toBe(false);
    expect(build).not.toHaveBeenCalled();
  });

  it('sends the JSON and throttles to four a second', () => {
    const b = bridge();
    win.AshfallAndroid = b;
    const build = vi.fn(() => state());
    expect(sendPanelState(build, 1000)).toBe(true);
    expect(JSON.parse(b.panelState.mock.calls[0]![0] as string)).toEqual(state());
    expect(sendPanelState(build, 1000 + PANEL_STATE_GAP_MS - 1)).toBe(false);
    expect(build).toHaveBeenCalledTimes(1); // a throttled call builds nothing
    expect(sendPanelState(() => state({ hp: 1 }), 1000 + PANEL_STATE_GAP_MS)).toBe(true);
    expect(b.panelState).toHaveBeenCalledTimes(2);
    expect(JSON.parse(b.panelState.mock.calls[1]![0] as string).hp).toBe(1);
    // 60 frames over one second: four sends.
    b.panelState.mockClear();
    for (let i = 0; i < 60; i++) sendPanelState(build, 5000 + i * (1000 / 60));
    expect(b.panelState.mock.calls.length).toBeLessThanOrEqual(4);
    expect(b.panelState.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('survives a throwing bridge', () => {
    const b = bridge();
    b.panelState.mockImplementation(() => {
      throw new Error('detached');
    });
    win.AshfallAndroid = b;
    expect(() => sendPanelState(() => state(), 10)).not.toThrow();
  });
});
