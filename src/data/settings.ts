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
};

export const MoveModeSchema = z.enum(['wasd', 'click']);
export type MoveMode = z.infer<typeof MoveModeSchema>;

const actionShape = Object.fromEntries(ACTIONS.map((a) => [a, z.array(z.string())])) as Record<
  Action,
  z.ZodArray<z.ZodString>
>;

/** Bumped when a change to the controls should reset older players' movement mode. */
export const CONTROLS_VERSION = 1;

export const SettingsSchema = z.object({
  moveMode: MoveModeSchema.default('click'),
  /** Settings saved before click-to-move became the default (version 0) switch to it once. */
  controlsVersion: z.number().int().default(0),
  /** Touch controls: 'auto' shows them on touch screens. */
  touchControls: z.enum(['auto', 'on', 'off']).default('auto'),
  screenShake: z.boolean().default(true),
  showFps: z.boolean().default(true),
  graphics: z.enum(['low', 'medium', 'high']).default('high'),
  textScale: z.number().min(0.75).max(2).default(1),
  language: z.string().default('en'),
  keybindings: z.object(actionShape).partial().default({}),
});

export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  return migrateSettings(SettingsSchema.parse({}));
}

/** Diablo-style click-to-move replaced WASD as the default (controls version 1). */
export function migrateSettings(settings: Settings): Settings {
  if (settings.controlsVersion < 1) settings.moveMode = 'click';
  settings.controlsVersion = CONTROLS_VERSION;
  return settings;
}

/** Resolved bindings: user overrides on top of the defaults. */
export function resolveKeybindings(settings: Settings): Record<Action, string[]> {
  return { ...DEFAULT_KEYBINDINGS, ...settings.keybindings } as Record<Action, string[]>;
}

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
