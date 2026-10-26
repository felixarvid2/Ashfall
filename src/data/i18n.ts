/**
 * Tiny translation layer. All player-visible text goes through t().
 * Add a language by dropping `<code>.json` next to en.json and registering it.
 */
import { actionLabel } from '../core/inputLabels';
import { ACTIONS, PAD_ACTIONS, type Action } from './settings';
import en from './lang/en.json';

type Dict = { [key: string]: string | Dict | string[] };

const languages: Record<string, Dict> = { en };
let active: Dict = en;
const fallback: Dict = en;

export function setLanguage(code: string): void {
  const dict = languages[code];
  if (!dict) throw new Error(`Unknown language: ${code}`);
  active = dict;
}

export function registerLanguage(code: string, dict: Dict): void {
  languages[code] = dict;
}

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | string[] | undefined = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, string | Dict | string[]>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Does a string exist for this key (in the active language or the English fallback)? */
export function hasText(key: string): boolean {
  return (lookup(active, key) ?? lookup(fallback, key)) !== undefined;
}

/** Phone wording ("Tap", "your target") instead of mouse wording ("Click", "the cursor"); the game sets it. */
let touchWording = false;

export function setTouchWording(on: boolean): void {
  touchWording = on;
}

const KEY_ACTIONS: ReadonlySet<string> = new Set<string>([...ACTIONS, ...PAD_ACTIONS]);

/** Aim phrases in skill texts: [mouse, touch]. A touch player has no cursor; skills aim at the target. */
const AIM_TOKENS: Record<string, [string, string]> = {
  aim: ['at the cursor', 'at your target'],
  aimTo: ['to the cursor', 'toward your target'],
  aimNear: ['near the cursor', 'near your target'],
  aimNearest: ['nearest the cursor', 'nearest you'],
};

/** Translate `key` (dot path), replacing `{name}` placeholders. Missing keys return the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = (lookup(active, key) ?? lookup(fallback, key) ?? key).replace(/\{(aim\w*)\}/g, (match, name: string) => {
    const pair = AIM_TOKENS[name];
    return pair ? pair[touchWording ? 1 : 0] : match;
  });
  // `{key:skills}` names the current binding of an action (key, or pad button while the pad is in use).
  const keyed = template.includes('{key:') ? template.replace(/\{key:(\w+)\}/g, (match, name: string) => (KEY_ACTIONS.has(name) ? actionLabel(name as Action) : match)) : template;
  if (!params) return keyed;
  return keyed.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** `key` with its phone wording (`<key>Touch`) when touch controls are on and such a string exists. */
export function touchText(key: string, params?: Record<string, string | number>): string {
  if (touchWording && (lookup(active, `${key}Touch`) ?? lookup(fallback, `${key}Touch`)) !== undefined) return t(`${key}Touch`, params);
  return t(key, params);
}
