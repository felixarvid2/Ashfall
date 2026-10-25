import { defineConfig } from 'vitest/config';
import { assetViewerPlugin } from './tools/assetViewerPlugin';
import { runtimeManifestPlugin } from './tools/runtimeManifestPlugin';

export default defineConfig({
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
        // Libraries in their own long-cacheable chunks: they change far less often than the game.
        codeSplitting: {
          groups: [
            { name: 'vendor-three', test: /node_modules[\\/]three[\\/]/, priority: 2 },
            { name: 'vendor-zod', test: /node_modules[\\/]zod[\\/]/, priority: 2 },
          ],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
