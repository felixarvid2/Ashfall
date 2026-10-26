/**
 * Player settings and key bindings. Validated with Zod, persisted separately
 * from save games so they apply to every character.
 */
import { z } from 'zod';

export const ACTIONS = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'dodge',
  'potion',
  'forceStand',
  'respawn',
  'pickup',
  'inventory',
  'character',
  'skills',
  'map',
  'quests',
  'showLabels',
  'skill1',
  'skill2',
  'skill3',
  'skill4',
  'toggleDebug',
  'quickSave',
  'quickLoad',
  'mount',
  'flare',
  'toggleMute',
] as const;

export type Action = (typeof ACTIONS)[number];

/** Keys are KeyboardEvent.code values so layouts (QWERTY/AZERTY) map by position. */
export const DEFAULT_KEYBINDINGS: Record<Action, string[]> = {
  moveUp: ['KeyW', 'ArrowUp'],
  moveDown: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  dodge: ['Space'],
  potion: ['KeyQ'],
  forceStand: ['ShiftLeft', 'ShiftRight'],
  respawn: ['KeyR'],
  pickup: ['KeyE'],
  inventory: ['KeyI', 'Tab'],
  character: ['KeyC'],
  skills: ['KeyK'],
  map: ['KeyM'],
  quests: ['KeyJ'],
  showLabels: ['AltLeft', 'AltRight'],
  skill1: ['Digit1'],
  skill2: ['Digit2'],
  skill3: ['Digit3'],
  skill4: ['Digit4'],
  toggleDebug: ['F3', 'Backquote'],
  quickSave: ['F5'],
  quickLoad: ['F9'],
  mount: ['KeyB'],
  flare: ['KeyF'],
  // M is the map; N toggles all sound.
  toggleMute: ['KeyN'],
};

export const MoveModeSchema = z.enum(['wasd', 'click']);
export type MoveMode = z.infer<typeof MoveModeSchema>;

const actionShape = Object.fromEntries(ACTIONS.map((a) => [a, z.array(z.string())])) as Record<
  Action,
  z.ZodArray<z.ZodString>
>;

/** Bumped when a change to the controls should reset older players' movement mode. */
export const CONTROLS_VERSION = 1;

/** Volumes 0..1 per bus (master scales all three), and a mute switch that keeps the sliders where they are. */
export const AudioSettingsSchema = z.object({
  master: z.number().min(0).max(1).default(0.8),
  music: z.number().min(0).max(1).default(0.5),
  sfx: z.number().min(0).max(1).default(0.8),
  ui: z.number().min(0).max(1).default(0.6),
  muted: z.boolean().default(false),
});
export type AudioSettings = z.infer<typeof AudioSettingsSchema>;

export const SettingsSchema = z.object({
  moveMode: MoveModeSchema.default('click'),
  /** Settings saved before click-to-move became the default (version 0) switch to it once. */
  controlsVersion: z.number().int().default(0),
  /** Touch controls: 'auto' shows them on touch screens. */
  touchControls: z.enum(['auto', 'on', 'off']).default('auto'),
  screenShake: z.boolean().default(true),
  /** Accessibility: no slow-motion, push-in, letterbox, camera look-ahead, crowd pull-back or hit squash (B01). */
  reduceMotion: z.boolean().default(false),
  /** Onboarding tips and hints (the coach, the first-run banners); "Reset tips" shows them again (B06). */
  showTips: z.boolean().default(true),
  /** Freeze the simulation while a menu is open and no enemy is within 12 m (always safe in the hub). */
  pauseInMenus: z.boolean().default(true),
  /** Vibration on touch devices (src/ui/haptics.ts). */
  haptics: z.boolean().default(true),
  /** Thumb layout: 'left' mirrors the joystick and the action buttons for left-handed play (`#ui.lefty`). */
  touchLayout: z.enum(['right', 'left']).default('right'),
  /** Size of the thumb buttons (`--btn-scale` on `#ui`). */
  buttonScale: z.number().min(0.8).max(1.3).default(1),
  showFps: z.boolean().default(true),
  graphics: z.enum(['low', 'medium', 'high']).default('high'),
  textScale: z.number().min(0.75).max(2).default(1),
  language: z.string().default('en'),
  keybindings: z.object(actionShape).partial().default({}),
  /** Gamepad buttons per action ("Pad0" is A); only actions that differ from DEFAULT_PADBINDINGS are stored (A02). */
  padBindings: z.record(z.string(), z.array(z.string())).default({}),
  /** Accessibility: soften screen flashes, hit flashes and pulsing (docs/ui/diablo-audit-panels.md B044). */
  reduceFlashing: z.boolean().default(false),
  /** Accessibility: colour-blind palette for rarity, life/danger and status colours (B044). */
  colorblind: z.enum(['off', 'protanopia', 'deuteranopia', 'tritanopia']).default('off'),
  /** Scene brightness multiplier (B045). */
  brightness: z.number().min(0.6).max(1.5).default(1),
  /** Ground loot labels shown from this rarity up; lower ones keep only their beam (B046). */
  lootLabelMin: z.enum(['all', 'magic', 'rare', 'legendary']).default('magic'),
  /** Settings saved before the sound system have none: the defaults apply. */
  audio: AudioSettingsSchema.default({ master: 0.8, music: 0.5, sfx: 0.8, ui: 0.6, muted: false }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  return migrateSettings(SettingsSchema.parse({}));
}

/** Diablo-style click-to-move replaced WASD as the default (controls version 1). */
export function migrateSettings(settings: Settings): Settings {
  // Settings objects built by hand (tests, older callers) may predate the sound options.
  settings.audio = AudioSettingsSchema.parse(settings.audio ?? {});
  if (settings.controlsVersion < 1) settings.moveMode = 'click';
  settings.controlsVersion = CONTROLS_VERSION;
  return settings;
}

/** Resolved bindings: user overrides on top of the defaults. */
export function resolveKeybindings(settings: Settings): Record<Action, string[]> {
  return { ...DEFAULT_KEYBINDINGS, ...settings.keybindings } as Record<Action, string[]>;
}

// ---- Key rebinding (docs/ui/diablo-audit-panels.md B042) ---------------------------------------------

/** Keys that cannot be bound: Escape closes menus and opens the pause menu; Meta/OS keys belong to the browser. */
export function isBindableKey(code: string): boolean {
  return code !== 'Escape' && !code.startsWith('Meta') && !code.startsWith('OS') && code !== 'ContextMenu' && code !== '';
}

/** Actions other than `action` that already use `code`. */
export function bindingConflicts(bindings: Record<Action, string[]>, action: Action, code: string): Action[] {
  return ACTIONS.filter((a) => a !== action && bindings[a].includes(code));
}

/** Most keys one action can hold (primary and secondary). */
export const MAX_KEYS_PER_ACTION = 2;

export interface RebindResult {
  /** The new overrides to store (only actions that differ from the defaults); null when the key is taken and `force` is off. */
  keybindings: Settings['keybindings'] | null;
  /** The actions that hold the key now. */
  conflicts: Action[];
}

/**
 * Bind `code` to slot `slot` (0 primary, 1 secondary) of `action`. A key another action holds is a conflict: without
 * `force` nothing changes (the panel warns); with `force` the other action takes over the key this slot had (a swap),
 * or just loses the key when the slot was empty. An action never ends up with no key through a swap.
 */
export function rebindKey(settings: Settings, action: Action, slot: number, code: string, force = false): RebindResult {
  const current = resolveKeybindings(settings);
  const conflicts = bindingConflicts(current, action, code);
  if (conflicts.length > 0 && !force) return { keybindings: null, conflicts };
  const next: Record<Action, string[]> = {} as Record<Action, string[]>;
  for (const a of ACTIONS) next[a] = [...current[a]];
  const old = next[action][slot];
  for (const other of conflicts) {
    next[other] = next[other].filter((k) => k !== code);
    if (old !== undefined && !next[other].includes(old)) next[other].push(old);
  }
  const keys = next[action];
  if (slot >= keys.length) keys.push(code);
  else keys[slot] = code;
  next[action] = keys.filter((k, i) => keys.indexOf(k) === i).slice(0, MAX_KEYS_PER_ACTION);
  return { keybindings: overridesOf(next), conflicts };
}

/** Back to the default keys of one action. A key another action took in the meantime goes back too (a swap). */
export function resetBinding(settings: Settings, action: Action): Settings['keybindings'] {
  const current = resolveKeybindings(settings);
  const next: Record<Action, string[]> = {} as Record<Action, string[]>;
  for (const a of ACTIONS) next[a] = [...current[a]];
  const wanted = DEFAULT_KEYBINDINGS[action];
  for (const other of ACTIONS) {
    if (other !== action) next[other] = next[other].filter((k) => !wanted.includes(k));
  }
  next[action] = [...wanted];
  // An action that lost its only key gets its default back, so nothing is left unbound.
  for (const a of ACTIONS) if (next[a].length === 0) next[a] = [...DEFAULT_KEYBINDINGS[a]];
  return overridesOf(next);
}

/** Only the actions whose keys differ from the defaults are stored. */
export function overridesOf(bindings: Record<Action, string[]>): Settings['keybindings'] {
  const out: Settings['keybindings'] = {};
  for (const a of ACTIONS) {
    const keys = bindings[a];
    const def = DEFAULT_KEYBINDINGS[a];
    if (keys.length !== def.length || keys.some((k, i) => k !== def[i])) out[a] = [...keys];
  }
  return out;
}

// ---- Gamepad bindings (round 3, A02) --------------------------------------------------------------

/**
 * What a pad button can do: the rebindable keyboard actions that make sense on a pad, plus the two basic slots that
 * the mouse buttons cover on a keyboard (`attack` = left button, `altAttack` = right button) and `pause` (Start).
 */
export const PAD_ACTIONS = [
  'attack',
  'altAttack',
  'skill1',
  'skill2',
  'skill3',
  'skill4',
  'dodge',
  'potion',
  'pickup',
  'mount',
  'flare',
  'inventory',
  'character',
  'skills',
  'quests',
  'map',
  'pause',
] as const;
export type PadAction = (typeof PAD_ACTIONS)[number];

/**
 * Pad buttons are "Pad<n>" with n the standard-mapping index: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Select,
 * 9 Start, 10 L3, 11 R3, 12-15 D-pad up/down/left/right. The sticks move and aim and are not rebindable; menus use
 * the D-pad, A, B, X, Y and the bumpers as fixed buttons (src/ui/focusNav.ts).
 */
export const DEFAULT_PADBINDINGS: Record<PadAction, string[]> = {
  attack: ['Pad2'],
  altAttack: ['Pad3'],
  skill1: ['Pad4'],
  skill2: ['Pad5'],
  skill3: ['Pad6'],
  skill4: ['Pad7'],
  dodge: ['Pad1'],
  potion: ['Pad12'],
  pickup: ['Pad0'],
  mount: ['Pad13'],
  flare: ['Pad14'],
  inventory: ['Pad15'],
  character: ['Pad10'],
  skills: ['Pad11'],
  quests: [],
  map: ['Pad8'],
  pause: ['Pad9'],
};

export function resolvePadBindings(settings: Settings): Record<PadAction, string[]> {
  const out = { ...DEFAULT_PADBINDINGS };
  // Settings built by hand (tests) or saved before the pad layer have none; unknown action names are ignored.
  for (const a of PAD_ACTIONS) {
    const own = settings.padBindings?.[a];
    if (own) out[a] = [...own];
  }
  return out;
}

/** Pad buttons that can be bound: any face, shoulder, stick-click or D-pad button except Home (the system button). */
export function isBindablePadButton(code: string): boolean {
  const n = /^Pad(\d+)$/.exec(code)?.[1];
  return n !== undefined && Number(n) <= 15;
}

/** Actions other than `action` that already use the button. */
export function padConflicts(bindings: Record<PadAction, string[]>, action: PadAction, code: string): PadAction[] {
  return PAD_ACTIONS.filter((a) => a !== action && bindings[a].includes(code));
}

/** Only the actions whose buttons differ from the defaults are stored. */
export function padOverridesOf(bindings: Record<PadAction, string[]>): Settings['padBindings'] {
  const out: Settings['padBindings'] = {};
  for (const a of PAD_ACTIONS) {
    const keys = bindings[a];
    const def = DEFAULT_PADBINDINGS[a];
    if (keys.length !== def.length || keys.some((k, i) => k !== def[i])) out[a] = [...keys];
  }
  return out;
}

export interface PadRebindResult {
  padBindings: Settings['padBindings'] | null;
  conflicts: PadAction[];
}

/** Same rules as `rebindKey`: a taken button warns first, `force` swaps it over; an action never loses its last button by a swap. */
export function rebindPad(settings: Settings, action: PadAction, slot: number, code: string, force = false): PadRebindResult {
  const current = resolvePadBindings(settings);
  const conflicts = padConflicts(current, action, code);
  if (conflicts.length > 0 && !force) return { padBindings: null, conflicts };
  const next = {} as Record<PadAction, string[]>;
  for (const a of PAD_ACTIONS) next[a] = [...current[a]];
  const old = next[action][slot];
  for (const other of conflicts) {
    next[other] = next[other].filter((k) => k !== code);
    if (old !== undefined && !next[other].includes(old)) next[other].push(old);
  }
  const keys = next[action];
  if (slot >= keys.length) keys.push(code);
  else keys[slot] = code;
  next[action] = keys.filter((k, i) => keys.indexOf(k) === i).slice(0, MAX_KEYS_PER_ACTION);
  return { padBindings: padOverridesOf(next), conflicts };
}

/** Back to the default buttons of one action; a button another action took in the meantime goes back too (a swap). */
export function resetPadBinding(settings: Settings, action: PadAction): Settings['padBindings'] {
  const current = resolvePadBindings(settings);
  const next = {} as Record<PadAction, string[]>;
  for (const a of PAD_ACTIONS) next[a] = [...current[a]];
  const wanted = DEFAULT_PADBINDINGS[action];
  for (const other of PAD_ACTIONS) if (other !== action) next[other] = next[other].filter((k) => !wanted.includes(k));
  next[action] = [...wanted];
  for (const a of PAD_ACTIONS) if (next[a].length === 0) next[a] = [...DEFAULT_PADBINDINGS[a]];
  return padOverridesOf(next);
}

// ---- Reset to defaults (B047) -------------------------------------------------------------------

export type SettingsTabId = 'sound' | 'display' | 'controls';

/**
 * The defaults of one Settings tab (the Sound tab has its own sliders and is not reset here). Phones keep their own
 * defaults for graphics and the FPS meter (see the first-run rule in game.ts).
 */
export function tabDefaults(tab: SettingsTabId, touch = false): Partial<Settings> {
  const d = defaultSettings();
  if (tab === 'display') {
    return {
      textScale: d.textScale,
      graphics: touch ? 'medium' : d.graphics,
      screenShake: d.screenShake,
      reduceMotion: d.reduceMotion,
      showTips: d.showTips,
      showFps: touch ? false : d.showFps,
      haptics: d.haptics,
      pauseInMenus: d.pauseInMenus,
      reduceFlashing: d.reduceFlashing,
      colorblind: d.colorblind,
      brightness: d.brightness,
      lootLabelMin: d.lootLabelMin,
    };
  }
  if (tab === 'controls') {
    return { moveMode: d.moveMode, touchControls: d.touchControls, touchLayout: d.touchLayout, buttonScale: d.buttonScale, keybindings: {}, padBindings: {} };
  }
  return {};
}

// ---- Accessibility (B044) -----------------------------------------------------------------------

/** Brightness slider range (B045): the setting allows a little more, the slider stays in a useful span. */
export const BRIGHTNESS_RANGE = { min: 0.8, max: 1.4, step: 0.05 } as const;

const SETTINGS_KEY = 'ashfall.settings';

export function loadSettings(storage: Storage | undefined): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = SettingsSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return migrateSettings(parsed.data);
    }
  } catch {
    // Corrupt or blocked storage: fall through to defaults.
  }
  return defaultSettings();
}

export function saveSettings(storage: Storage | undefined, settings: Settings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be full or blocked; settings simply won't persist.
  }
}
