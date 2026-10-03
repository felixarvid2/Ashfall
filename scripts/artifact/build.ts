/**
 * npm run build:artifact — a production build for publishing as a claude.ai artifact, in
 * dist-artifact/. Artifacts don't serve .glb, so every model becomes an embedded glTF (.gltf.json:
 * the same JSON with its binary buffer as a base64 data URI). Source maps are dropped.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const out = join(root, 'dist-artifact');
execSync('npx vite build --outDir dist-artifact --emptyOutDir', { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_MODEL_FORMAT: 'json' } });

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}

let converted = 0;
for (const file of walk(out)) {
  if (file.endsWith('.map') || file.endsWith('.gitkeep')) {
    rmSync(file);
    continue;
  }
  if (!file.endsWith('.glb')) continue;
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB`);
  let offset = 12;
  let json: { buffers?: { byteLength: number; uri?: string }[] } | null = null;
  let bin: Buffer | null = null;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error(`${file} has no JSON chunk`);
  if (bin && json.buffers?.[0]) json.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
  writeFileSync(file.replace(/\.glb$/, '.gltf.json'), JSON.stringify(json));
  rmSync(file);
  converted++;
}
const files = walk(out);
const bytes = files.reduce((s, f) => s + statSync(f).size, 0);
console.log(`Converted ${converted} models. ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB in dist-artifact/.`);
