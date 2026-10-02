/**
 * Tiny translation layer. All player-visible text goes through t().
 * Add a language by dropping `<code>.json` next to en.json and registering it.
 */
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

/** Translate `key` (dot path), replacing `{name}` placeholders. Missing keys return the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = lookup(active, key) ?? lookup(fallback, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
