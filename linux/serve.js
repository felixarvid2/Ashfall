'use strict';
/**
 * Pure helpers for the custom `app://ashfall/` scheme: which file a URL means and which Content-Type it gets.
 * Kept free of Electron imports so tests/linuxHost.test.ts can load it under plain Node.
 */
const path = require('node:path');

/** Content-Type per extension. Chromium refuses ES modules and WebAssembly without the right one. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ktx2': 'image/ktx2',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function mimeType(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/**
 * The absolute file under `root` that `url` asks for, or null when the URL is not for this app or escapes `root`.
 * `/` and any folder-like path map to index.html.
 */
function resolveAppPath(root, url, host = 'ashfall') {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'app:' || u.hostname !== host) return null;
  let rel;
  try {
    rel = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  if (rel === '' || rel.endsWith('/')) rel += rel === '' ? '/index.html' : 'index.html';
  const base = path.resolve(root);
  const file = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return file;
}

module.exports = { MIME, mimeType, resolveAppPath };
