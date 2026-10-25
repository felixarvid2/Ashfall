/**
 * Guards for the build, the bundle and CI (C02, C10, C11, C12): source-level checks that keep the lazy panels
 * lazy, the three.js imports to a known list and the workflows running what they promise.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const tsFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tsFiles(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []));

describe('lazy panels (C02)', () => {
  const lazy = ['characterPanel', 'skillTreePanel', 'settingsPanel'];

  it('only dynamic imports reach the character, skill tree and settings panels from the game', () => {
    const importing: string[] = [];
    for (const f of tsFiles('src')) {
      const text = read(f);
      for (const name of lazy) {
        // A value import (not `import type`) of the module would pull it into the main bundle.
        if (new RegExp(`^import\\s+(?!type\\b)[^;]*from\\s+'[^']*/${name}';`, 'm').test(text)) importing.push(`${f} -> ${name}`);
      }
    }
    expect(importing).toEqual([]);
  });

  it('the bundler keeps them out of the game-ui chunk', () => {
    const config = read('vite.config.ts');
    for (const name of lazy) expect(config).toContain(name);
  });

  it('the panels are registered lazily, with their keys and tabs wired before they load', () => {
    const registry = read('src/ui/panelRegistry.ts');
    for (const id of ['character', 'skills', 'settings']) expect(registry).toContain(`registerLazy({ id: '${id}'`);
    const game = read('src/game.ts');
    expect(game).toContain("this.characterPanel.run((p) => p.toggle())");
    expect(game).toContain("this.skillTreePanel.run((p) => p.toggle())");
  });
});

describe('three.js imports (C10)', () => {
  it('the game imports only the three.js examples it uses', () => {
    const used = new Set<string>();
    for (const f of tsFiles('src')) {
      if (f.startsWith('src/devtools/')) continue; // the asset viewer is a dev page, not part of the game chunk
      for (const m of read(f).matchAll(/from\s+'(three\/examples\/[^']+)'/g)) used.add(m[1]!);
    }
    expect([...used].sort()).toEqual([
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/postprocessing/EffectComposer.js',
      'three/examples/jsm/postprocessing/OutputPass.js',
      'three/examples/jsm/postprocessing/RenderPass.js',
      'three/examples/jsm/postprocessing/ShaderPass.js',
      'three/examples/jsm/postprocessing/UnrealBloomPass.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
    ]);
  });

  it('nothing in the game imports the whole examples folder or the WebGPU build', () => {
    for (const f of tsFiles('src')) expect(read(f), f).not.toMatch(/from\s+'three\/(webgpu|tsl|addons)/);
  });
});

describe('workflows (C11, C12)', () => {
  it('CI runs the build, the asset checks and the quick perf budget besides tsc and the tests', () => {
    const ci = read('.github/workflows/ci.yml');
    for (const step of ['npx tsc --noEmit -p .', 'npx vitest run', 'npm run build', 'npm run assets:check', 'npm run perf:quick']) expect(ci).toContain(step);
  });

  it('the release typechecks, and fails when the zip holds source maps', () => {
    const release = read('.github/workflows/release.yml');
    expect(release).toContain('npx tsc --noEmit -p .');
    expect(release).toMatch(/unzip -Z1 .*grep -E '\\\.map\$'/);
    expect(release).toMatch(/exit 1/);
  });

  it('package.json has the scripts the workflows call', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    for (const name of ['build', 'assets:check', 'perf:quick']) expect(scripts[name], name).toBeTruthy();
  });
});
