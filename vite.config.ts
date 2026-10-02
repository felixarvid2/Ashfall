import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build can be served from any sub-path (e.g. GitHub Pages).
  base: './',
  server: { host: true },
  // three.js alone is ~600 kB minified; code-splitting comes with streaming zones (Phase 5).
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 900 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
