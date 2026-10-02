/**
 * Dev-server-only endpoints for the asset viewer (/asset-viewer):
 *   GET  /__assets/manifest          → assets/manifest.json
 *   GET  /__assets/source/<id>/<f>   → raw Meshy downloads (preview/refined GLB + thumbnails)
 *   POST /__assets/review            → { id, action: 'approve-preview' | 'approve' | 'reject' }
 * Never part of the production build.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { applyReview, type ReviewAction } from '../scripts/meshy/actions';
import { loadManifest, saveManifest, SOURCE_DIR } from '../scripts/meshy/manifest';

const TYPES: Record<string, string> = { glb: 'model/gltf-binary', png: 'image/png', jpg: 'image/jpeg', json: 'application/json' };

export function assetViewerPlugin(): Plugin {
  return {
    name: 'ashfall-asset-viewer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (url === '/asset-viewer' || url === '/asset-viewer/') {
          req.url = '/asset-viewer.html';
          return next();
        }
        if (url === '/__assets/manifest') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(loadManifest()));
          return;
        }
        if (url.startsWith('/__assets/source/')) {
          const rel = decodeURIComponent(url.slice('/__assets/source/'.length).split('?')[0] ?? '');
          const file = resolve(SOURCE_DIR, rel);
          if (!file.startsWith(SOURCE_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) {
            res.statusCode = 404;
            res.end('not found');
            return;
          }
          res.setHeader('Content-Type', TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream');
          createReadStream(file).pipe(res);
          return;
        }
        if (url === '/__assets/review' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const { id, action } = JSON.parse(body) as { id: string; action: ReviewAction };
              if (!['approve-preview', 'approve', 'reject'].includes(action)) throw new Error('bad action');
              const manifest = loadManifest();
              const entry = manifest.assets.find((a) => a.id === id);
              if (!entry) throw new Error(`unknown asset ${id}`);
              const message = applyReview(entry, action);
              saveManifest(manifest);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, message }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, message: (err as Error).message }));
            }
          });
          return;
        }
        next();
      });
    },
  };
}
