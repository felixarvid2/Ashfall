import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { assetViewerPlugin } from './tools/assetViewerPlugin.ts';
import { runtimeManifestPlugin } from './tools/runtimeManifestPlugin.ts';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // The version shown in the error report's "Copy details" (C13).
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Relative base so the build can be served from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [assetViewerPlugin(), runtimeManifestPlugin()],
  server: { host: true },
  build: {
    target: 'es2022',
    // 'hidden' writes the .map files (kept locally for debugging) without a sourceMappingURL comment;
    // the release zip leaves them out (T007).
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // Libraries in their own long-cacheable chunks (they change far less often than the game), the
        // texts and the content data apart from the code. The meshopt decoder stays its own lazy chunk:
        // artifact pages never load it. Panels that open late (the Neural Matrix, the epilogue, hub services, character, skills, settings) are dynamic imports
        // and stay out of `game-ui`, so they are fetched the first time they are used (T005).
        codeSplitting: {
          groups: [
            { name: 'vendor-three', test: /node_modules[\\/]three[\\/](?!examples[\\/]jsm[\\/]libs[\\/]meshopt)/, priority: 3 },
            { name: 'vendor-zod', test: /node_modules[\\/]zod[\\/]/, priority: 3 },
            { name: 'lang', test: /src[\\/]data[\\/]lang[\\/]/, priority: 2 },
            { name: 'game-data', test: /src[\\/]data[\\/]/, priority: 1 },
            { name: 'game-ui', test: /src[\\/]ui[\\/](?!matrixPanel|epilogue|servicePanel|characterPanel|skillTreePanel|settingsPanel).*\.ts$/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // `npm run coverage` (T022): a report, not a gate. No threshold in CI.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
