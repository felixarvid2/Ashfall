/**
 * Names for keys and pad buttons, and which device the prompts speak for (round 3, A06/A10).
 *
 * `keyLabel(code)` names one key ("KeyW" -> "W") or pad button ("Pad0" -> "A"). `actionLabel(action)` names the first
 * binding of an action on the device used last: the pad glyph while the pad was touched last and the action has a
 * button, else the key. The game installs the live bindings with `setPromptSource`; until then the defaults apply.
 * The language layer fills `{key:skills}` in strings from `actionLabel`, so rebinding updates the text.
 */
import { DEFAULT_KEYBINDINGS, DEFAULT_PADBINDINGS, type Action, type PadAction } from '../data/settings';

/** Readable names for keys whose code is not what the key cap shows (rebinding, B042). */
const KEY_NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  IntlBackslash: '<',
  Backspace: 'Bksp',
  CapsLock: 'Caps',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Escape: 'Esc',
};

/** Standard-mapping button names (Xbox style; the face buttons and bumpers read the same on most pads). */
const PAD_NAMES: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'Select',
  9: 'Start',
  10: 'L3',
  11: 'R3',
  12: 'D-pad ↑',
  13: 'D-pad ↓',
  14: 'D-pad ←',
  15: 'D-pad →',
  16: 'Home',
};

/** "KeyW" -> "W", "Digit1" -> "1", "F3" -> "F3", "Pad2" -> "X". */
export function keyLabel(code: string): string {
  const pad = /^Pad(\d+)$/.exec(code);
  if (pad) return PAD_NAMES[Number(pad[1])] ?? code;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Backquote') return '§';
  if (code === 'Space') return 'Space';
  if (code.startsWith('Shift')) return 'Shift';
  if (code.startsWith('Alt')) return 'Alt';
  if (code.startsWith('Control')) return 'Ctrl';
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return KEY_NAMES[code] ?? code;
}

export interface PromptSource {
  keys: () => Record<Action, string[]>;
  pad: () => Record<PadAction, string[]>;
  /** The pad was used last (prompts show buttons). */
  padActive: () => boolean;
}

let source: PromptSource = {
  keys: () => DEFAULT_KEYBINDINGS,
  pad: () => DEFAULT_PADBINDINGS,
  padActive: () => false,
};

export function setPromptSource(next: PromptSource): void {
  source = next;
}

/** True while prompts name pad buttons. */
export function padPrompts(): boolean {
  return source.padActive();
}

/** The first binding of an action on the device used last; `keys` overrides the installed keyboard bindings. */
export function actionLabel(action: Action | PadAction, keys?: Record<Action, string[]>): string {
  if (source.padActive()) {
    const button = source.pad()[action as PadAction]?.[0];
    if (button) return keyLabel(button);
  }
  const code = (keys ?? source.keys())[action as Action]?.[0];
  return code ? keyLabel(code) : '?';
}
