import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { capFor, over, scanTextures, shrinkFile } from '../scripts/assets/textureCaps';

describe('texture size caps (C07)', () => {
  it('every texture in public/assets is within its category cap', async () => {
    const rows = await scanTextures();
    expect(rows.length).toBeGreaterThan(300);
    expect(rows.filter(over).map((r) => `${r.file} ${r.width}x${r.height} > ${r.cap}`)).toEqual([]);
  }, 120000);

  it('unknown categories fall back to the default cap', () => {
    expect(capFor('art')).toBe(1280);
    expect(capFor('nothing')).toBe(1024);
  });

  it('shrinkFile downsizes an image and a model texture and the model still loads', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ashfall-tex-'));
    try {
      const png = join(dir, 'big.webp');
      await sharp({ create: { width: 2048, height: 1024, channels: 3, background: '#884422' } }).webp().toFile(png);
      await shrinkFile(png, 512);
      const m = await sharp(png).metadata();
      expect([m.width, m.height]).toEqual([512, 256]);

      const doc = new Document();
      const buf = doc.createBuffer();
      const tex = doc.createTexture('t').setMimeType('image/png').setImage(new Uint8Array(await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#224488' } }).png().toBuffer()));
      const mat = doc.createMaterial('m').setBaseColorTexture(tex);
      const prim = doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buf));
      doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
      const glb = join(dir, 'model.glb');
      writeFileSync(glb, await io.writeBinary(doc));
      await shrinkFile(glb, 256);
      await MeshoptDecoder.ready;
      const back = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).readBinary(new Uint8Array(readFileSync(glb)));
      expect(back.getRoot().listMeshes()).toHaveLength(1);
      expect(back.getRoot().listTextures()[0]!.getSize()).toEqual([256, 256]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
