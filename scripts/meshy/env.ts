/** Reads MESHY_API_KEY from the environment or ashfall/.env. Node only — never imported under src/. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');

export function loadApiKey(): string {
  if (process.env.MESHY_API_KEY) return process.env.MESHY_API_KEY.trim();
  const envPath = resolve(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*MESHY_API_KEY\s*=\s*(.+?)\s*$/);
      if (m?.[1]) return m[1].replace(/^['"]|['"]$/g, '');
    }
  }
  throw new Error('MESHY_API_KEY is not set. Put it in ashfall/.env or the environment.');
}
