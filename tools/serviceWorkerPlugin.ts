/**
 * B09: the offline web build. After a normal web build this writes `sw.js` next to index.html: a service worker that
 * precaches the app shell (page, scripts, styles, fonts, icons), keeps models, audio and art in the cache as they are
 * used, and lets the game run with no network after one online visit. The artifact, Android and Linux builds do not get
 * one (see `pwaEnabled`).
 *
 * Updates are never stuck behind an old cache: the cache name carries the build time, the worker calls skipWaiting and
 * claims its clients, the page itself is fetched network-first, and only the two newest caches are kept (the previous
 * one so a tab still running the old scripts can load its lazy chunks).
 */
import { createHash } from 'node:crypto';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

/** True for the plain web build: not the claude.ai artifact (VITE_MODEL_FORMAT=json) and not a packaged host (ASHFALL_TARGET). */
export function pwaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ASHFALL_TARGET === undefined && env.VITE_MODEL_FORMAT !== 'json' && env.ASHFALL_PWA !== '0';
}

const SHELL_EXT = /\.(html|js|css|woff2?|webmanifest|png|wasm)$/;

/** Files that make the app start offline: everything at the top of the build, the hashed chunks and the fonts. */
export function precacheList(outDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, deep: boolean): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = relative(outDir, path).split('\\').join('/');
      if (statSync(path).isDirectory()) {
        // Fonts live in a folder of their own; the model, audio and art folders stay out (cached when used).
        if (deep || rel === 'assets' || rel === 'assets/fonts') walk(path, deep);
        continue;
      }
      if (name === 'sw.js' || name.endsWith('.map') || !SHELL_EXT.test(name)) continue;
      if (rel.includes('/') && !/^assets\/(fonts\/)?[^/]+$/.test(rel)) continue;
      out.push(rel);
    }
  };
  walk(outDir, false);
  return out.sort();
}

/** The worker's source for a build. `built` is the build time in ms (it orders the caches), `files` the precache list. */
export function workerSource(files: readonly string[], built: number): string {
  const hash = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10);
  return WORKER.replace('__BUILD__', `${String(built).padStart(13, '0')}-${hash}`).replace('__FILES__', JSON.stringify(files));
}

const WORKER = `'use strict';
/* Ashfall service worker (tools/serviceWorkerPlugin.ts). Generated; do not edit. */
const BUILD = '__BUILD__';
const CACHE = 'ashfall-' + BUILD;
const SHELL = __FILES__;
const KEEP = 2;
const HASHED = /\\/assets\\/[^/]+-[A-Za-z0-9_-]{8}\\.(js|css|wasm)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter((k) => k.startsWith('ashfall-')).sort().reverse();
    await Promise.all(names.slice(KEEP).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function store(cache, request, response) {
  // Only whole, same-origin answers; a quota error must never break the page.
  if (response && response.ok && response.status === 200 && (response.type === 'basic' || response.type === 'default')) {
    try { await cache.put(request, response.clone()); } catch (e) { /* storage full */ }
  }
  return response;
}

/** Any cache that has it, the current one first. */
async function lookup(request) {
  const current = await caches.open(CACHE);
  return (await current.match(request, { ignoreSearch: true, ignoreVary: true })) || (await caches.match(request, { ignoreSearch: true, ignoreVary: true }));
}

/**
 * The page asks for what it fetched before this worker took control (the first visit): those files are fetched again
 * (mostly from the browser's HTTP cache) and kept, so the first visit already works offline.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const raw of data.urls.slice(0, 600)) {
      try {
        const url = new URL(String(raw), self.location.href);
        if (url.origin !== self.location.origin || url.pathname.endsWith('/sw.js')) continue;
        const request = new Request(url.href);
        if (await cache.match(request, { ignoreSearch: true, ignoreVary: true })) continue;
        await store(cache, request, await fetch(request));
      } catch (e) { /* offline, or gone: skipped */ }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // The page: the network first, so a new build is seen at once; the cached page when offline.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        return await store(cache, new Request('index.html'), await fetch(request));
      } catch (e) {
        return (await lookup(new Request('index.html'))) || Response.error();
      }
    })());
    return;
  }

  if (HASHED.test(url.pathname)) {
    // Scripts and styles named by content: the cached copy is always right.
    event.respondWith((async () => {
      const hit = await lookup(request);
      if (hit) return hit;
      const cache = await caches.open(CACHE);
      return store(cache, request, await fetch(request));
    })());
    return;
  }

  // Models, audio, art, icons: the cached copy now, refreshed behind it (a conditional request, 304 when unchanged).
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
    const fresh = fetch(request).then((res) => store(cache, request, res));
    if (hit) { fresh.catch(() => undefined); return hit; }
    try { return await fresh; } catch (e) { return (await lookup(request)) || Response.error(); }
  })());
});
`;

export function serviceWorkerPlugin(): Plugin {
  let outDir = '';
  let root = '';
  return {
    name: 'ashfall-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
      root = config.root;
    },
    closeBundle() {
      if (!pwaEnabled() || !outDir || !root) return;
      writeFileSync(join(outDir, 'sw.js'), workerSource(precacheList(outDir), Date.now()));
    },
  };
}

