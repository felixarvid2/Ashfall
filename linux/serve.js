'use strict';
/**
 * Pure helpers for the custom `app://ashfall/` scheme: which file a URL means and which Content-Type it gets.
 * Kept free of Electron imports so tests/linuxHost.test.ts can load it under plain Node.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

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

/**
 * Reads a `Range: bytes=...` header against a file of `size` bytes (B11). Returns null when there is no usable range
 * header (answer 200 with the whole file; a malformed header or a multi-range request is ignored the way servers may),
 * `{ start, end }` (inclusive) for a satisfiable range, and `'unsatisfiable'` when it starts past the end (416).
 * Supports `a-b`, `a-` and the suffix form `-n` (the last n bytes).
 */
function parseRange(header, size) {
  if (typeof header !== 'string') return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return 'unsatisfiable';
    return size === 0 ? 'unsatisfiable' : { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  let end = m[2] === '' ? size - 1 : Number(m[2]);
  if (start >= size) return 'unsatisfiable';
  if (end < start) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

/**
 * The response for a file: 200 with the whole body, or 206 with `Content-Range` for a byte range, or 416. Streams from
 * disk, so a large .glb or music file is not read into memory. Every answer says `Accept-Ranges: bytes`.
 * Throws when the file cannot be read (the caller answers 404).
 */
function fileResponse(file, rangeHeader) {
  const size = fs.statSync(file).size;
  const headers = new Headers({ 'Content-Type': mimeType(file), 'Accept-Ranges': 'bytes' });
  const range = parseRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  headers.set('Content-Length', String(size === 0 ? 0 : end - start + 1));
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  const body = size === 0 ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, { status: range ? 206 : 200, headers });
}

module.exports = { MIME, mimeType, resolveAppPath, parseRange, fileResponse };
