/** The Linux desktop shell (docs/linux.md): which file app://ashfall/ URLs mean and which Content-Type they get. */
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const { MIME, mimeType, resolveAppPath } = createRequire(import.meta.url)('../linux/serve.js') as {
  MIME: Record<string, string>;
  mimeType: (file: string) => string;
  resolveAppPath: (root: string, url: string) => string | null;
};
const www = '/opt/ashfall/resources/app/www';

describe('app:// scheme helpers', () => {
  it('maps the root and folders to index.html and files to themselves', () => {
    expect(resolveAppPath(www, 'app://ashfall/')).toBe(join(www, 'index.html'));
    expect(resolveAppPath(www, 'app://ashfall')).toBe(join(www, 'index.html'));
    expect(resolveAppPath(www, 'app://ashfall/assets/index-abc.js?x=1#y')).toBe(join(www, 'assets/index-abc.js'));
    expect(resolveAppPath(www, 'app://ashfall/assets/a%20b.glb')).toBe(join(www, 'assets/a b.glb'));
  });

  it('refuses other hosts, schemes and paths that leave the folder', () => {
    expect(resolveAppPath(www, 'app://evil/index.html')).toBeNull();
    expect(resolveAppPath(www, 'https://ashfall/index.html')).toBeNull();
    expect(resolveAppPath(www, 'not a url')).toBeNull();
    expect(resolveAppPath(www, 'app://ashfall/%2e%2e/%2e%2e/etc/passwd')).toBe(resolve(www, 'etc/passwd'));
    expect(resolveAppPath(www, 'app://ashfall/assets/%00.js')).toBeNull();
    expect(resolveAppPath(www, 'app://ashfall/%E0%A4%A')).toBeNull();
    for (const url of ['app://ashfall/../../etc/passwd', 'app://ashfall/..%2f..%2fetc/passwd']) {
      const file = resolveAppPath(www, url);
      expect(file === null || file.startsWith(www + '/')).toBe(true);
    }
  });

  it('gives the types the game needs: modules, wasm, models, textures, audio, fonts', () => {
    const expected: Record<string, string> = {
      'a.js': 'text/javascript',
      'a.wasm': 'application/wasm',
      'a.glb': 'model/gltf-binary',
      'a.ktx2': 'image/ktx2',
      'a.webp': 'image/webp',
      'a.png': 'image/png',
      'a.ogg': 'audio/ogg',
      'a.json': 'application/json',
      'a.css': 'text/css',
      'a.html': 'text/html',
      'a.woff2': 'font/woff2',
      'a.svg': 'image/svg+xml',
    };
    for (const [file, type] of Object.entries(expected)) expect(mimeType(file), file).toContain(type);
    expect(mimeType('A.JS')).toContain('text/javascript');
    expect(mimeType('a.unknown')).toBe('application/octet-stream');
  });

  it('covers every extension under public/', () => {
    const exts = new Set<string>();
    const walk = (dir: string): void => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        if (e.isDirectory()) walk(`${dir}/${e.name}`);
        else if (extname(e.name) && e.name !== '.gitkeep') exts.add(extname(e.name).toLowerCase());
      }
    };
    walk('public');
    for (const ext of [...exts, '.js', '.wasm', '.ktx2', '.html', '.css']) expect(MIME[ext], ext).toBeTruthy();
  });
});
