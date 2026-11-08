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

// ---- B11: byte ranges ------------------------------------------------------------------------------------------
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterAll } from 'vitest';

const { parseRange, fileResponse } = createRequire(import.meta.url)('../linux/serve.js') as {
  parseRange: (header: string | null | undefined, size: number) => { start: number; end: number } | 'unsatisfiable' | null;
  fileResponse: (file: string, range?: string | null) => Response;
};
const scratch = mkdtempSync(join(tmpdir(), 'ashfall-linux-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('byte ranges (round 4 B11)', () => {
  it('parses a-b, a-, suffix and ignores what it cannot use', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=10-5000', 1000)).toEqual({ start: 10, end: 999 });
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('items=0-5', 1000)).toBeNull();
    expect(parseRange('bytes=5-2', 1000)).toBeNull();
    expect(parseRange('bytes=0-5,10-20', 1000)).toBeNull();
    expect(parseRange('bytes=-', 1000)).toBeNull();
  });

  const data = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const file = join(scratch, 'sound.ogg');
  writeFileSync(file, data);

  it('answers a range with 206, Content-Range, the right bytes and the file type', async () => {
    const res = fileResponse(file, 'bytes=16-31');
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 16-31/256');
    expect(res.headers.get('Content-Length')).toBe('16');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Type')).toBe('audio/ogg');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(data.subarray(16, 32));
  });

  it('answers an open range and a suffix range', async () => {
    const tail = fileResponse(file, 'bytes=250-');
    expect(tail.headers.get('Content-Range')).toBe('bytes 250-255/256');
    expect(Buffer.from(await tail.arrayBuffer())).toEqual(data.subarray(250));
    const last = fileResponse(file, 'bytes=-4');
    expect(Buffer.from(await last.arrayBuffer())).toEqual(data.subarray(252));
  });

  it('answers without a range with 200 and the whole file, and says ranges are welcome', async () => {
    const res = fileResponse(file, null);
    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Range')).toBeNull();
    expect(Buffer.from(await res.arrayBuffer())).toEqual(data);
  });

  it('answers a range past the end with 416 and the size', () => {
    const res = fileResponse(file, 'bytes=999-');
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */256');
  });

  it('an empty file is a 200 with no body', async () => {
    const empty = join(scratch, 'empty.json');
    writeFileSync(empty, '');
    const res = fileResponse(empty, null);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it('main.js serves through fileResponse, not net.fetch', () => {
    const main = readFileSync(join(ROOT, 'linux/main.js'), 'utf8');
    expect(main).toContain('fileResponse(file, request.headers.get(\'range\'))');
    expect(main).not.toContain('net.fetch');
  });
});

// ---- B12: window state -----------------------------------------------------------------------------------------
const ws = createRequire(import.meta.url)('../linux/windowState.js') as {
  MIN_SIZE: { width: number; height: number };
  readState: (file: string) => Record<string, unknown> | null;
  writeState: (file: string, state: Record<string, unknown>) => boolean;
  fitToDisplays: (state: Record<string, number> | null, areas: { x: number; y: number; width: number; height: number }[]) => Record<string, number>;
  track: (win: unknown, file: string, opts?: { delayMs?: number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (t: unknown) => void }) => () => void;
};
const screenA = { x: 0, y: 0, width: 1920, height: 1080 };
const screenB = { x: 1920, y: 0, width: 1280, height: 1024 };

describe('window state (round 4 B12)', () => {
  it('round trips size, position and the two flags, and survives a missing or broken file', () => {
    const file = join(scratch, 'state', 'window-state.json');
    expect(ws.readState(file)).toBeNull();
    expect(ws.writeState(file, { x: 100, y: 50, width: 1280, height: 720, fullscreen: true, maximized: false })).toBe(true);
    expect(ws.readState(file)).toEqual({ x: 100, y: 50, width: 1280, height: 720, fullscreen: true, maximized: false });
    writeFileSync(file, '{oops');
    expect(ws.readState(file)).toBeNull();
    writeFileSync(file, JSON.stringify({ width: 'wide', height: 5 }));
    expect(ws.readState(file)).toBeNull();
    writeFileSync(file, JSON.stringify({ width: 1000, height: 600 }));
    expect(ws.readState(file)).toEqual({ width: 1000, height: 600, fullscreen: false, maximized: false });
  });

  it('keeps a position that is on a display and drops one that is not', () => {
    expect(ws.fitToDisplays({ x: 2000, y: 100, width: 1200, height: 700 }, [screenA, screenB])).toEqual({ x: 2000, y: 100, width: 1200, height: 700 });
    // The second monitor is gone: centre on what is left.
    expect(ws.fitToDisplays({ x: 2000, y: 100, width: 1200, height: 700 }, [screenA])).toEqual({ width: 1200, height: 700 });
    // Mostly off the edge, but enough of it shows.
    expect(ws.fitToDisplays({ x: -1000, y: 0, width: 1200, height: 700 }, [screenA])).toMatchObject({ x: -1000 });
    expect(ws.fitToDisplays({ x: -1100, y: 0, width: 1200, height: 700 }, [screenA])).not.toHaveProperty('x');
  });

  it('never opens smaller than the minimum or bigger than the biggest display; defaults without a state', () => {
    expect(ws.fitToDisplays({ width: 100, height: 100 }, [screenA])).toEqual({ width: ws.MIN_SIZE.width, height: ws.MIN_SIZE.height });
    expect(ws.fitToDisplays({ width: 9000, height: 9000 }, [screenA])).toEqual({ width: 1920, height: 1080 });
    expect(ws.fitToDisplays(null, [screenA])).toEqual({ width: 1600, height: 900 });
  });

  it('tracks a window: saves once after the resizing settles, and at close; fullscreen keeps the normal bounds', () => {
    const file = join(scratch, 'tracked.json');
    const handlers = new Map<string, (() => void)[]>();
    const win = {
      bounds: { x: 10, y: 20, width: 1300, height: 800 },
      full: false,
      max: false,
      on: (ev: string, fn: () => void) => handlers.set(ev, [...(handlers.get(ev) ?? []), fn]),
      getNormalBounds() { return this.bounds; },
      isFullScreen() { return this.full; },
      isMaximized() { return this.max; },
    };
    const timers: (() => void)[] = [];
    let cleared = 0;
    ws.track(win, file, { setTimer: (fn) => (timers.push(fn), timers.length), clearTimer: () => cleared++ });
    const fire = (ev: string) => handlers.get(ev)!.forEach((fn) => fn());
    // A drag fires many events and nothing is written until the timer runs.
    for (let i = 0; i < 20; i++) fire('resize');
    expect(ws.readState(file)).toBeNull();
    expect(cleared).toBe(19);
    timers.at(-1)!();
    expect(ws.readState(file)).toMatchObject({ x: 10, y: 20, width: 1300, height: 800, fullscreen: false });
    win.full = true;
    win.bounds = { x: 10, y: 20, width: 1300, height: 800 };
    fire('enter-full-screen');
    timers.at(-1)!();
    expect(ws.readState(file)).toMatchObject({ fullscreen: true, width: 1300 });
    win.full = false;
    win.max = true;
    fire('close');
    expect(ws.readState(file)).toMatchObject({ fullscreen: false, maximized: true });
  });

  it('main.js restores the state before the window shows, and the package ships the module', () => {
    const main = readFileSync(join(ROOT, 'linux/main.js'), 'utf8');
    expect(main).toContain('windowState.readState');
    expect(main).toContain('windowState.track(win, stateFile)');
    expect(readFileSync(join(ROOT, 'scripts/linux/build.ts'), 'utf8')).toContain("'windowState.js'");
  });
});
