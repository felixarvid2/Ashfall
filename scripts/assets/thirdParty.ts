/**
 * npm run assets:third-party — downloads the free third-party assets Ashfall uses and turns them into
 * game files. Downloads are cached in assets-src/third-party/ (gitignored). See docs/credits.md.
 *
 *  Poly Haven (CC0)    an HDRI as the scene's environment light   → public/assets/env/
 *                      small props for scatter                     → assets/source/<id>/refined.glb
 *                      (then `npm run meshy -- optimize --ids …` like any other model)
 *  Quaternius, Kenney  enemies and props (R5, the Core): the model     → assets/source/<id>/refined.glb
 *  (CC0)               files are kept by hand in assets-src/third-party/models/ (or THIRD_PARTY_MODELS_SRC);
 *                      run `npm run assets:third-party -- local-models` to convert only these
 *  ambientCG (CC0)     rock PBR maps for the cave walls            → public/assets/textures/rock/
 *  game-icons.net      status effect icons (CC BY 3.0)             → public/assets/ui/status/
 *  game-icons.net,     touch menu icons (CC BY 3.0; Kenney is CC0) → public/assets/ui/menu/
 *  Kenney Game Icons
 *  Google Fonts (OFL)  Rajdhani and Share Tech Mono                → public/assets/fonts/
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

const ROOT = new URL('../..', import.meta.url).pathname;
const CACHE = join(ROOT, 'assets-src', 'third-party');
const PUBLIC = join(ROOT, 'public', 'assets');

/** Poly Haven HDRIs: file name in the game → Poly Haven id. */
export const HDRIS = { burnt_warehouse: 'burnt_warehouse' } as const;

/** Poly Haven models used as scatter clutter: asset id → Poly Haven id. */
export const POLYHAVEN_MODELS: Record<string, string> = {
  'env.oil_drum': 'barrel_03',
  'env.steel_drum': 'Barrel_01',
  'env.trash_can': 'metal_trash_can',
  'env.old_tyre': 'old_tyre',
  'env.wheel_rim': 'rusted_wheel_rim_01',
  'env.jerrycan': 'metal_jerrycan_green',
  'env.propane_tank': 'propane_tank',
  'env.military_crate': 'old_military_crate',
  'env.ammo_box': 'ammo_box',
  'env.trash_bag': 'trashbag',
  'env.utility_box': 'utility_box_01',
  'env.moon_rock_a': 'moon_rock_01',
  'env.moon_rock_b': 'moon_rock_03',
  'env.moon_rock_c': 'moon_rock_06',
};

/**
 * Free CC0 models kept as files (no download): asset id → file under assets-src/third-party/models/ (override
 * the folder with THIRD_PARTY_MODELS_SRC). .gltf with external or embedded buffers becomes one .glb.
 * Skinned models keep their size and clips; optimize.ts skips normalise for them, so the game scales them
 * (EnemyDef.scale) and the clip→state mapping lives in the manifest entry (`meshy.clips`, no `rig`).
 */
export const LOCAL_MODELS: Record<string, string> = {
  // Quaternius Cyberpunk Game Kit
  'enemy.light_being': 'quaternius-cyberpunk-game-kit/Enemy_Flying.gltf',
  'enemy.guardian_lancer': 'quaternius-cyberpunk-game-kit/Enemy_Large.gltf',
  // Quaternius Ultimate Space Kit
  'enemy.light_mote': 'quaternius-ultimate-space-kit/Enemy_ExtraSmall.gltf',
  // Quaternius Animated Mech Pack (Flat Colors glTF from the pack's Google Drive folder)
  'enemy.core_guardian': 'quaternius-animated-mech-pack/Stan.gltf',
  // Quaternius Modular SciFi MegaKit (Standard)
  'enemy.choir_singer': 'quaternius-modular-scifi-megakit/Alien_Oculichrysalis.gltf',
  'prop.core_column': 'quaternius-modular-scifi-megakit/Column_Pipes.gltf',
  'prop.core_wall_panel': 'quaternius-modular-scifi-megakit/WallAstra_Straight.gltf',
  'prop.core_platform': 'quaternius-modular-scifi-megakit/Platform_Round1.gltf',
  'prop.core_console': 'quaternius-modular-scifi-megakit/Prop_Computer.gltf',
  'prop.core_cable': 'quaternius-modular-scifi-megakit/Prop_Cable_3.gltf',
  'prop.core_door': 'quaternius-modular-scifi-megakit/Door_Frame_Square.gltf',
  // Kenney Space Station Kit
  'prop.core_pipe': 'kenney-space-station-kit/pipe.glb',
  'prop.core_pipe_ring': 'kenney-space-station-kit/pipe-ring.glb',
};

/** Models whose origin is not at the feet: lift (metres, before the game's scale) so the lowest point is y = 0. */
const LOCAL_LIFT: Record<string, number> = {
  'enemy.choir_singer': 0.87, // the chrysalis hangs 0.87 m below its origin
};

/** Models that stand upright on Poly Haven but should lie on the ground. */
const LIE_FLAT = new Set(['env.old_tyre', 'env.wheel_rim']);

/** ambientCG material for the cave walls. */
const ROCK = 'Rock035';

/** game-icons.net icon per status (author/name). */
export const STATUS_ICONS: Record<string, string> = {
  burning: 'carl-olsen/flame',
  poisoned: 'lorc/poison-bottle',
  chilled: 'lorc/snowflake-2',
  frozen: 'lorc/frozen-block',
  stunned: 'delapouite/knocked-out-stars',
  vulnerable: 'lorc/broken-shield',
  barrier: 'lorc/bubble-field',
  marked: 'delapouite/crosshair',
  stealth: 'lorc/hood',
  evasive: 'lorc/sprint',
  chitin: 'lorc/beetle-shell',
  rooted: 'delapouite/tree-roots',
  wading: 'lorc/waves',
  overcharge: 'lorc/power-lightning',
  kinetic: 'lorc/fist',
  aegis: 'lorc/shield-reflect',
  chainReaction: 'lorc/explosion-rays',
  magnet: 'lorc/magnet',
  overclock: 'lorc/stopwatch',
};

/**
 * Touch menu icon per button: game-icons.net author/name, or `kenney:<name>` for a Kenney Game Icons
 * PNG (CC0, white 2x) copied from the asset library in assets/ui/game-icons/.
 */
export const MENU_ICONS: Record<string, string> = {
  inventory: 'lorc/knapsack',
  character: 'lorc/visored-helm',
  skills: 'delapouite/skills',
  map: 'lorc/treasure-map',
  quests: 'lorc/scroll-unfurled',
  mount: 'delapouite/scooter',
  flare: 'delapouite/torch',
  fullscreen: 'kenney:larger',
  close: 'kenney:cross',
};

const KENNEY_ICONS = join(ROOT, '..', 'assets', 'ui', 'game-icons', 'PNG', 'White', '2x');

const FONTS = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap';

async function fetchTo(url: string, file: string, headers: Record<string, string> = {}): Promise<Buffer> {
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  return buf;
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

/** HDRI → a tone-mapped 8-bit equirect (the game blurs it into an environment map; LDR is plenty). */
async function hdris(): Promise<void> {
  for (const [name, id] of Object.entries(HDRIS)) {
    const files = await json<{ hdri: Record<string, { hdr: { url: string } }> }>(`https://api.polyhaven.com/files/${id}`);
    const raw = await fetchTo(files.hdri['1k']!.hdr.url, join(CACHE, 'hdri', `${id}_1k.hdr`));
    const hdr = new HDRLoader().setDataType(1015 /* FloatType */).parse(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
    const { width, height, data } = hdr as unknown as { width: number; height: number; data: Float32Array };
    const px = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      for (let c = 0; c < 3; c++) {
        // Reinhard with a little exposure, then sRGB.
        const v = data[i * 4 + c]! * 1.4;
        const t = v / (1 + v);
        px[i * 3 + c] = Math.round(255 * Math.min(1, Math.pow(t, 1 / 2.2)));
      }
    }
    const out = join(PUBLIC, 'env', `${name}.webp`);
    mkdirSync(dirname(out), { recursive: true });
    await sharp(px, { raw: { width, height, channels: 3 } }).resize(1024, 512).webp({ quality: 88 }).toFile(out);
    console.log(`✓ env/${name}.webp`);
  }
}

async function rock(): Promise<void> {
  const zip = await fetchTo(`https://ambientcg.com/get?file=${ROCK}_1K-JPG.zip`, join(CACHE, 'ambientcg', `${ROCK}_1K-JPG.zip`));
  const dir = join(CACHE, 'ambientcg', ROCK);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    execFileSync('python3', ['-I', '-c', 'import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', join(CACHE, 'ambientcg', `${ROCK}_1K-JPG.zip`), dir]);
  }
  void zip;
  const pick = (suffix: string) => join(dir, readdirSync(dir).find((f) => f.endsWith(`_${suffix}.jpg`))!);
  const outDir = join(PUBLIC, 'textures', 'rock');
  mkdirSync(outDir, { recursive: true });
  await sharp(pick('Color')).webp({ quality: 85 }).toFile(join(outDir, 'color.webp'));
  await sharp(pick('NormalGL')).webp({ quality: 90 }).toFile(join(outDir, 'normal.webp'));
  await sharp(pick('Roughness')).webp({ quality: 85 }).toFile(join(outDir, 'roughness.webp'));
  console.log(`✓ textures/rock (${ROCK})`);
}

/** Poly Haven glTF (1k textures) → one GLB per model where the Meshy pipeline expects a refined model. */
async function models(): Promise<void> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const [assetId, id] of Object.entries(POLYHAVEN_MODELS)) {
    const out = join(ROOT, 'assets', 'source', assetId, 'refined.glb');
    const dir = join(CACHE, 'polyhaven', id);
    const files = await json<{ gltf: Record<string, { gltf: { url: string; include: Record<string, { url: string }> } }> }>(`https://api.polyhaven.com/files/${id}`);
    const g = files.gltf['1k']!.gltf;
    await fetchTo(g.url, join(dir, `${id}.gltf`));
    for (const [rel, f] of Object.entries(g.include)) await fetchTo(f.url, join(dir, rel));
    const thumb = `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=512`;
    await fetchTo(thumb, join(dir, 'thumb.png')).catch(() => undefined);
    if (!existsSync(out)) {
      const doc = await io.read(join(dir, `${id}.gltf`));
      // Scatter is instanced, which doesn't take morph targets (the wheel rim has a dent shape key).
      for (const mesh of doc.getRoot().listMeshes()) {
        mesh.setWeights([]);
        for (const prim of mesh.listPrimitives()) for (const target of prim.listTargets()) {
          prim.removeTarget(target);
          target.dispose();
        }
      }
      if (LIE_FLAT.has(assetId)) {
        const scene = doc.getRoot().listScenes()[0]!;
        const flat = doc.createNode('LieFlat').setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
        for (const child of scene.listChildren()) {
          scene.removeChild(child);
          flat.addChild(child);
        }
        scene.addChild(flat);
      }
      mkdirSync(dirname(out), { recursive: true });
      await io.write(out, doc);
    }
    console.log(`✓ ${assetId} ← polyhaven/${id}`);
  }
}

/** Local CC0 model files (see LOCAL_MODELS) → one GLB per model where the Meshy pipeline expects a refined model. */
async function localModels(): Promise<void> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const src = process.env.THIRD_PARTY_MODELS_SRC ?? join(CACHE, 'models');
  for (const [assetId, rel] of Object.entries(LOCAL_MODELS)) {
    const from = join(src, rel);
    if (!existsSync(from)) throw new Error(`${assetId}: missing ${from} (set THIRD_PARTY_MODELS_SRC or add the file, see docs/credits.md)`);
    const doc = await io.read(from);
    const lift = LOCAL_LIFT[assetId];
    if (lift) {
      const scene = doc.getRoot().listScenes()[0]!;
      const root = doc.createNode('Lift').setTranslation([0, lift, 0]);
      for (const child of scene.listChildren()) {
        scene.removeChild(child);
        root.addChild(child);
      }
      scene.addChild(root);
    }
    const out = join(ROOT, 'assets', 'source', assetId, 'refined.glb');
    mkdirSync(dirname(out), { recursive: true });
    await io.write(out, doc);
    console.log(`✓ ${assetId} ← ${rel}`);
  }
}

async function icons(): Promise<void> {
  const outDir = join(PUBLIC, 'ui', 'status');
  mkdirSync(outDir, { recursive: true });
  for (const [status, icon] of Object.entries(STATUS_ICONS)) {
    // White on transparent, so the game can use it as a CSS mask and colour it per status.
    const svg = await fetchTo(`https://game-icons.net/icons/ffffff/transparent/1x1/${icon}.svg`, join(CACHE, 'game-icons', `${icon}.svg`));
    writeFileSync(join(outDir, `${status}.svg`), svg);
  }
  console.log(`✓ ui/status (${Object.keys(STATUS_ICONS).length} icons)`);

  const menuDir = join(PUBLIC, 'ui', 'menu');
  mkdirSync(menuDir, { recursive: true });
  for (const [id, icon] of Object.entries(MENU_ICONS)) {
    if (icon.startsWith('kenney:')) {
      copyFileSync(join(KENNEY_ICONS, `${icon.slice('kenney:'.length)}.png`), join(menuDir, `${id}.png`));
    } else {
      writeFileSync(join(menuDir, `${id}.svg`), await fetchTo(`https://game-icons.net/icons/ffffff/transparent/1x1/${icon}.svg`, join(CACHE, 'game-icons', `${icon}.svg`)));
    }
  }
  console.log(`✓ ui/menu (${Object.keys(MENU_ICONS).length} icons)`);
}

async function fonts(): Promise<void> {
  // A browser user agent makes Google Fonts answer with woff2; keep only the Latin subset.
  const ua = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' };
  const css = (await fetchTo(FONTS, join(CACHE, 'fonts', 'fonts.css'), ua)).toString();
  const outDir = join(PUBLIC, 'fonts');
  mkdirSync(outDir, { recursive: true });
  for (const block of css.split('/* ').slice(1)) {
    if (!block.startsWith('latin */')) continue;
    const family = /font-family: '([^']+)'/.exec(block)![1]!;
    const weight = /font-weight: (\d+)/.exec(block)![1]!;
    const url = /url\((https:[^)]+\.woff2)\)/.exec(block)![1]!;
    const name = `${family.toLowerCase().replace(/ /g, '-')}-${weight}.woff2`;
    writeFileSync(join(outDir, name), await fetchTo(url, join(CACHE, 'fonts', name)));
    console.log(`✓ fonts/${name}`);
  }
}

// `npm run assets:third-party -- local-models` runs only the local model conversion (no downloads).
if (process.argv[2] === 'local-models') {
  await localModels();
} else {
  await hdris();
  await rock();
  await models();
  await localModels();
  await icons();
  await fonts();
}
