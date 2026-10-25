/**
 * Serves `virtual:asset-manifest`: assets/manifest.json cut down to what the game reads at runtime
 * (scripts/assets/runtimeManifest.ts), so prompts and Meshy bookkeeping are not bundled (T006).
 * Runs for the dev server, the build and vitest alike.
 */
import type { Plugin } from 'vite';
import { readRuntimeManifest } from '../scripts/assets/runtimeManifest.ts';

const ID = 'virtual:asset-manifest';
const RESOLVED = `\0${ID}`;

export function runtimeManifestPlugin(): Plugin {
  const file = new URL('../assets/manifest.json', import.meta.url).pathname;
  return {
    name: 'ashfall-runtime-manifest',
    resolveId: (id) => (id === ID ? RESOLVED : null),
    load(id) {
      if (id !== RESOLVED) return null;
      this.addWatchFile(file);
      return `export default ${JSON.stringify(readRuntimeManifest())};`;
    },
  };
}
