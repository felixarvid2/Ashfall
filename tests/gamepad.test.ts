import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamepadInput, PAD, applyDeadZone, padCode, type GamepadLike } from '../src/core/gamepad';
import { Input } from '../src/core/input';
import { actionLabel, keyLabel, setPromptSource } from '../src/core/inputLabels';
import { AttackTarget, Collider, MoveTarget, SkillUser, Transform } from '../src/core/components';
import type { InputState } from '../src/core/context';
import { World } from '../src/core/ecs';
import { DEFAULT_KEYBINDINGS, DEFAULT_PADBINDINGS, defaultSettings, resolvePadBindings } from '../src/data/settings';
import { t } from '../src/data/i18n';
import { CINDER_FLATS } from '../src/data/zones/cinderFlats';
import { setHaptics, haptic, setRumbleSink } from '../src/ui/haptics';
import { spatialSystem } from '../src/systems/collision';
import { movementSystem } from '../src/systems/movement';
import { groundUnreachable, playerControlSystem } from '../src/systems/playerControl';
import { spawnEnemy, spawnPlayer } from '../src/world/spawn';
import { createZoneRuntime } from '../src/world/zone';
import { emptyAccount } from '../src/core/account';
import { makeCtx, run } from './helpers';

/** A fake pad whose buttons and axes the test sets before each poll. */
function fakePad(index = 0) {
  const pad: GamepadLike = {
    index,
    id: 'Test Pad (STANDARD GAMEPAD Vendor: 0000)',
    connected: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
  return {
    pad,
    press: (i: number, down = true) => {
      (pad.buttons as { pressed: boolean; value: number }[])[i] = { pressed: down, value: down ? 1 : 0 };
    },
    trigger: (i: number, value: number) => {
      (pad.buttons as { pressed: boolean; value: number }[])[i] = { pressed: false, value };
    },
  };
}

function rig(pads: ReturnType<typeof fakePad>[]) {
  const list: (GamepadLike | null)[] = pads.map((p) => p.pad);
  const gp = new GamepadInput({ getGamepads: () => list });
  return { gp, list };
}

describe('GamepadInput', () => {
  it('reports button edges once, with the standard indexes as codes', () => {
    const a = fakePad();
    const { gp } = rig([a]);
    const seen: string[] = [];
    gp.onButton((code, down) => seen.push(`${code}${down ? '+' : '-'}`));
    gp.poll();
    a.press(PAD.A);
    gp.poll();
    gp.poll();
    a.press(PAD.A, false);
    gp.poll();
    expect(seen).toEqual(['Pad0+', 'Pad0-']);
  });

  it('counts analog triggers as pressed past half way', () => {
    const a = fakePad();
    const { gp } = rig([a]);
    const seen: string[] = [];
    gp.onButton((code, down) => seen.push(`${code}${down ? '+' : '-'}`));
    gp.poll();
    a.trigger(PAD.RT, 0.3);
    gp.poll();
    a.trigger(PAD.RT, 0.8);
    gp.poll();
    a.trigger(PAD.RT, 0);
    gp.poll();
    expect(seen).toEqual(['Pad7+', 'Pad7-']);
  });

  it('applies a radial dead zone and flips the stick so up is +y', () => {
    expect(applyDeadZone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    const full = applyDeadZone(1, 0);
    expect(full.x).toBeCloseTo(1);
    const mid = applyDeadZone(0.61, 0);
    expect(mid.x).toBeGreaterThan(0.4);
    expect(mid.x).toBeLessThan(0.6);
    const a = fakePad();
    const { gp } = rig([a]);
    gp.poll();
    a.pad.axes = [0, -1, 0.9, 0.05];
    gp.poll();
    expect(gp.left.y).toBeCloseTo(1);
    expect(gp.right.x).toBeGreaterThan(0.8);
    expect(Math.abs(gp.right.y)).toBeLessThan(0.1);
  });

  it('last device: the pad wins on use, keyboard and mouse win it back', () => {
    const a = fakePad();
    const { gp } = rig([a]);
    const flips: string[] = [];
    gp.onDevice((d) => flips.push(d));
    gp.poll();
    expect(gp.lastDevice).toBe('kbm');
    a.press(PAD.B);
    gp.poll();
    expect(gp.lastDevice).toBe('pad');
    gp.noteKeyboardMouse();
    expect(gp.lastDevice).toBe('kbm');
    expect(flips).toEqual(['pad', 'kbm']);
  });

  it('hot-plug: connecting and disconnecting report, and held buttons are released', () => {
    const a = fakePad();
    const { gp, list } = rig([]);
    const log: string[] = [];
    gp.onConnection((event, name, wasActive) => log.push(`${event}:${wasActive}:${name.split(' ')[0]}`));
    gp.onButton((code, down) => log.push(`${code}${down ? '+' : '-'}`));
    gp.poll();
    list.push(a.pad);
    a.press(PAD.X);
    gp.poll();
    expect(log).toEqual(['connected:false:Test', 'Pad2+']);
    list.length = 0;
    gp.poll();
    expect(log.slice(2)).toEqual(['Pad2-', 'disconnected:true:Test']);
    expect(gp.hasPad).toBe(false);
  });

  it('capture takes the next press alone', () => {
    const a = fakePad();
    const { gp } = rig([a]);
    const other: string[] = [];
    const got: string[] = [];
    gp.onButton((c, down) => down && other.push(c));
    gp.poll();
    gp.capture((c) => got.push(c));
    a.press(PAD.Y);
    gp.poll();
    a.press(PAD.Y, false);
    gp.poll();
    a.press(PAD.Y);
    gp.poll();
    expect(got).toEqual(['Pad3']);
    expect(other).toEqual(['Pad3']);
  });

  it('rumble plays a dual-rumble effect on the active pad', () => {
    const a = fakePad();
    const playEffect = vi.fn(() => Promise.resolve());
    a.pad.vibrationActuator = { playEffect };
    const { gp } = rig([a]);
    gp.poll();
    a.press(PAD.A);
    gp.poll();
    gp.rumble(0.5, 0.2, 100);
    expect(playEffect).toHaveBeenCalledWith('dual-rumble', { startDelay: 0, duration: 100, weakMagnitude: 0.2, strongMagnitude: 0.5 });
  });
});

describe('Input with a pad', () => {
  class FakeCanvas extends EventTarget {
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 100 };
    }
  }
  let win: EventTarget;
  let a: ReturnType<typeof fakePad>;
  let gp: GamepadInput;
  let input: Input;
  beforeEach(() => {
    win = new EventTarget();
    vi.stubGlobal('window', win);
    vi.stubGlobal('HTMLInputElement', class extends EventTarget {});
    vi.stubGlobal('HTMLTextAreaElement', class extends EventTarget {});
    a = fakePad();
    gp = new GamepadInput({ getGamepads: () => [a.pad] });
    input = new Input(new FakeCanvas() as unknown as HTMLElement, structuredClone(DEFAULT_KEYBINDINGS), structuredClone(DEFAULT_PADBINDINGS), gp);
    gp.poll();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a bound pad button is the action: held, and pressed once per tick', () => {
    a.press(PAD.B);
    gp.poll();
    expect(input.isDown('dodge')).toBe(true);
    expect(input.wasPressed('dodge')).toBe(true);
    input.endTick();
    expect(input.wasPressed('dodge')).toBe(false);
    expect(input.isDown('dodge')).toBe(true);
    a.press(PAD.B, false);
    gp.poll();
    expect(input.isDown('dodge')).toBe(false);
  });

  it('follows rebinding', () => {
    input.setBindings(structuredClone(DEFAULT_KEYBINDINGS), { ...DEFAULT_PADBINDINGS, dodge: ['Pad3'] });
    a.press(PAD.B);
    gp.poll();
    expect(input.isDown('dodge')).toBe(false);
    a.press(PAD.Y);
    gp.poll();
    expect(input.isDown('dodge')).toBe(true);
  });

  it('a menu owns the pad: nothing reaches the world, and a held button does not carry over', () => {
    let menu = true;
    input.padBlocked = () => menu;
    a.press(PAD.B);
    gp.poll();
    expect(input.isDown('dodge')).toBe(false);
    menu = false;
    expect(input.isDown('dodge')).toBe(false);
  });

  it('exposes sticks and the two basic slots only while the pad was used last', () => {
    expect(input.pad).toBeNull();
    a.pad.axes = [1, 0, 0, -1];
    a.press(PAD.X);
    gp.poll();
    const s = input.pad!;
    expect(s.stick!.x).toBeGreaterThan(0.9);
    expect(s.aim!.y).toBeGreaterThan(0.9);
    expect(s.attack).toBe(true);
    expect(s.alt).toBe(false);
    // A key press hands the game back to the keyboard.
    win.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code: 'KeyW', repeat: false }));
    expect(input.pad).toBeNull();
    expect(gp.lastDevice).toBe('kbm');
  });
});

describe('pad play (playerControl)', () => {
  function setup() {
    const world = new World();
    const zone = createZoneRuntime({ ...CINDER_FLATS, pois: [], packs: [] });
    const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: 200, cameraYaw: 0 });
    const player = spawnPlayer(world, 'bastion', 0, 0);
    const tick = (pad: NonNullable<InputState['pad']>, held: string[] = [], ticks = 1) => {
      ctx.input = {
        isDown: (a) => held.includes(a),
        wasPressed: (a) => held.includes(a),
        isMouseDown: () => false,
        wasMousePressed: () => false,
        pad,
      };
      run(world, ctx, [spatialSystem, playerControlSystem, movementSystem], ticks);
    };
    return { world, ctx, player, tick };
  }
  const idle = { stick: null, aim: null, attack: false, alt: false };

  it('the left stick walks, relative to the camera', () => {
    const s = setup();
    s.tick({ ...idle, stick: { x: 0, y: 1 } }, [], 30);
    expect(s.world.req(s.player, Transform).z).toBeLessThan(-1);
    expect(s.world.has(s.player, MoveTarget)).toBe(false);
  });

  it('attack with nothing in reach swings toward the stick; with an enemy it attacks it', () => {
    const s = setup();
    s.tick({ ...idle, attack: true }, [], 1);
    expect(s.world.req(s.player, SkillUser).request?.slot).toBe(0);
    const enemy = spawnEnemy(s.world, 'infected_colonist', 5, 0);
    s.tick({ ...idle, attack: true }, [], 1);
    expect(s.world.get(s.player, AttackTarget)?.target).toBe(enemy);
  });

  it('twin-stick: the right stick aims the basic attack while the left keeps walking', () => {
    const s = setup();
    s.tick({ stick: { x: 1, y: 0 }, aim: { x: 0, y: -1 }, attack: true, alt: false }, [], 1);
    const req = s.world.req(s.player, SkillUser).request!;
    expect(req.slot).toBe(0);
    // y = -1 is toward the camera (+z); x stays at the player.
    expect(req.aimZ).toBeGreaterThan(1);
    expect(Math.abs(req.aimX)).toBeLessThan(0.5);
    expect(s.world.req(s.player, Transform).x).toBeGreaterThan(0);
  });

  it('the second-skill button casts slot 1 and skill buttons come through the action keys', () => {
    const s = setup();
    const user = s.world.req(s.player, SkillUser);
    user.slots[1] = user.slots[0] ?? null;
    s.tick({ ...idle, alt: true }, [], 1);
    expect(s.world.req(s.player, SkillUser).request?.slot).toBe(1);
    const s2 = setup();
    const user2 = s2.world.req(s2.player, SkillUser);
    user2.slots[2] = user2.slots[0] ?? null;
    s2.tick(idle, ['skill1'], 1);
    expect(s2.world.req(s2.player, SkillUser).request?.slot).toBe(2);
  });
});

describe('unreachable ground click (A09)', () => {
  it('a click inside a rock is flagged, open ground is not, far outside the grid is not judged', () => {
    const world = new World();
    const zone = createZoneRuntime({ ...CINDER_FLATS, pois: [], packs: [] });
    const ctx = makeCtx({ zone, account: emptyAccount(), worldHalfSize: 200 });
    const player = spawnPlayer(world, 'bastion', 0, 0);
    expect(groundUnreachable(world, ctx, player, 8, 0)).toBe(false);
    expect(groundUnreachable(world, ctx, player, 500, 0)).toBe(false);
    const rock = world.create();
    world.add(rock, Transform, { x: 10, y: 0, z: 0, facing: 0, prevX: 10, prevY: 0, prevZ: 0, prevFacing: 0 });
    // A wide static collider blocks the nav cells under it.
    world.add(rock, Collider, { radius: 3, mass: Infinity, layer: 'ground', isStatic: true });
    spatialSystem(world, 1 / 60, ctx);
    expect(groundUnreachable(world, ctx, player, 10, 0)).toBe(true);
  });
});

describe('prompts and rebound key text (A06, A10)', () => {
  afterEach(() => setPromptSource({ keys: () => DEFAULT_KEYBINDINGS, pad: () => DEFAULT_PADBINDINGS, padActive: () => false }));

  it('names pad buttons', () => {
    expect(keyLabel(padCode(0))).toBe('A');
    expect(keyLabel('Pad4')).toBe('LB');
    expect(keyLabel('Pad7')).toBe('RT');
    expect(keyLabel('KeyW')).toBe('W');
  });

  it('actionLabel speaks for the device used last', () => {
    expect(actionLabel('dodge')).toBe('Space');
    let pad = true;
    setPromptSource({ keys: () => DEFAULT_KEYBINDINGS, pad: () => DEFAULT_PADBINDINGS, padActive: () => pad });
    expect(actionLabel('dodge')).toBe('B');
    // No pad button: the key is shown rather than nothing.
    expect(actionLabel('showLabels')).toBe('Alt');
    pad = false;
    expect(actionLabel('dodge')).toBe('Space');
  });

  it('strings fill {key:action} from the current bindings', () => {
    expect(t('feel.tips.0')).toBe('Dodge with Space: the roll is invulnerable for a moment.');
    const keys = { ...DEFAULT_KEYBINDINGS, dodge: ['KeyX'] };
    setPromptSource({ keys: () => keys, pad: () => DEFAULT_PADBINDINGS, padActive: () => false });
    expect(t('feel.tips.0')).toContain('Dodge with X:');
    setPromptSource({ keys: () => keys, pad: () => resolvePadBindings(defaultSettings()), padActive: () => true });
    expect(t('feel.tips.0')).toContain('Dodge with B:');
    expect(t('onboarding.potion')).not.toContain('{key');
  });
});

describe('rumble (A07)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'setInterval', 'clearInterval'] });
    vi.advanceTimersByTime(50_000_000);
    vi.stubGlobal('navigator', {});
  });
  afterEach(() => {
    setRumbleSink(null);
    setHaptics(true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('big moments rumble a pad even where the browser cannot vibrate, and the setting turns it off', () => {
    const sink = vi.fn();
    setRumbleSink(sink);
    setHaptics(true);
    haptic('bigHit');
    expect(sink).toHaveBeenCalledWith(0.6, 0.3, 140);
    vi.advanceTimersByTime(1000);
    haptic('tick');
    expect(sink).toHaveBeenCalledTimes(1);
    setHaptics(false);
    vi.advanceTimersByTime(1000);
    haptic('boss');
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
