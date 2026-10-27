# Blender assets and runtime variants

Own looks for enemies, NPCs and bosses without a new full model: small parts built in Blender, attached at runtime to a
base model that already ships. Why: `docs/decisions.md` (2026-10-27). Code: `scripts/blender/`, `src/data/variants.ts`,
`AssetLibrary.create` in `src/render/assets.ts`.

## Install (only to rebuild or add parts; the game never needs Blender)

```sh
apt-get install -y blender python3-numpy          # Blender 4.0.2, CPU only
apt-get install -y libegl1 libgl1-mesa-dri        # only for the contact sheet (Workbench renders need an EGL library)
```

`npm run blender:build` stops with the install line when `blender` is not on PATH.

## Commands

| Command | What it does |
|---|---|
| `npm run blender:build` | Builds every entry of `scripts/blender/spec.json` in Blender, optimizes the GLBs with the repo's optimizer and registers them in `assets/manifest.json` (`source: "blender"`). |
| `npm run blender:build -- --only part.crystal_shard,part.x` | The same for some ids. |
| `npm run blender:build -- --sheet variant.crystal_walker [--out <dir>] [--glow]` | Contact sheet (6 views, the first at the game camera: pitch 55, yaw 45, FOV 38) of a variant's base with its parts, from the files in `public/assets`. `--glow` adds a Cycles still (24 samples, CPU, no denoiser). Default folder `$TMPDIR/ashfall-blender`. Changes no files in the repo. |
| `npm run assets:check` | Parts used by a variant count as used; `part.*` and `variant.*` ids written in code must exist. |
| `npm run e2e -- --scenario variant --out <dir> [--enemy crystal_walker] [--zone zone.deep_mines]` | Spawns the enemy in the real page (dev server running), checks that every part mesh is a child of its bone and moves with it, screenshots. |

Flow of `blender:build`: `build.py` (Blender, headless) writes `assets/source/<id>/refined.glb` (git-ignored) and
`assets/source/blender-report.json` (ignored) → `optimizeAssets` from `scripts/meshy/optimize.ts` (weld, simplify only when over
`targetPolycount`, meshopt; no textures; no LODs and no re-centring for parts) → `public/assets/parts/<name>.glb` (whole
models: `public/assets/blender/`) → the manifest entry gets `file` and `stats`. Builds are deterministic (seeded); commit the GLBs and the
manifest change.

## Add a part

1. In `scripts/blender/builders.py` use an existing builder (`crystal_cluster`, `crystal_shard`, `vine`, `kitbash`) or add one
   (a function taking the entry's `params`, returning Blender objects; `lib.py` has the helpers: clean scene, materials, bevelled
   kitbash primitives, crystal cluster, tube along a curve, decimate, apply transforms, set origin, export, cameras, renders).
2. Add an entry to `parts` in `scripts/blender/spec.json`: `id` (`part.<name>`), `builder`, `params`, `prompt` (what it is), `targetPolycount`.
3. `npm run blender:build -- --only part.<name>`.

Rules for a part: modelled in metres at the size it has on a 1.75 m character; **the origin is the attach point** (the base of the
crystal cluster); it grows along Blender +Z, which is +Y in the game; materials are plain colours (`lib.painted_metal`,
`rusted_metal`, `lumen_crystal`, `ember_glow`, `spore_flesh`, `rubber_cloth`), no textures, no UVs. Colours are written as sRGB hex like the rest of the game.
Lumen's cyan is `#5ac8ff` (Deep Mines), teal `#7affd8`. Keep a part under 800 triangles and about 12 KB (a test fails above that).

## Add a whole model

Put it under `models` in `spec.json` with `category` (`enemy`, `prop`, ...), `heightMeters`, `placeholder` and a builder (`kitbash` builds
one from bevelled boxes, cylinders, cones and spheres listed in the spec). It is optimized like a Meshy model (normalised to its height, pivot at the
feet, LODs) into `public/assets/blender/`. A new full model costs budget in every zone it appears in: prefer a variant.

## Add a variant

In `src/data/variants.ts` add a `VariantDef` and use its id (`variant.<name>`) as the `assetId` of an enemy (or the `asset` of an NPC, prop, quest object):

```ts
{ id: 'variant.crystal_walker', base: 'enemy.infected_colonist',
  look: { tint: '#9fb6cc', emissive: '#1d5f86', emissiveIntensity: 0.35, roughness: 0.75 },   // or an existing LOOKS key
  parts: [{ asset: 'part.crystal_cluster_large', bone: 'Spine02', position: [0, 0.2, -0.13], rotation: [-55, 0, 8] }, ...] }
```

- `bone` is one of the 24 joints of a Meshy rig (`RIG_JOINTS`: Hips, Spine02, Spine01, Spine, neck, Head, head_end, headfront, Left/Right Shoulder, Arm,
  ForeArm, Hand, UpLeg, Leg, Foot, ToeBase). Omit it to attach to the model root (the only choice for unrigged models: security drone, slagborn, ...).
- `position` (metres), `rotation` (Euler XYZ degrees) and `scale` are measured **from the joint along the model's axes in the default pose**
  (x = the creature's left, y up, z forward; a Meshy rig's default pose is a T-pose), not along the bone's own rolled axes. Parts grow along +Y, so a
  cluster on the back leaning up and away is `rotation: [-55, 0, 0]` (-Z is back). The library converts into the bone's frame once at create.
- `look.tint` multiplies the base colour, so its texture stays; `emissive`, `emissiveIntensity`, `roughness`, `metalness` replace. The look is applied to the base only, once
  per variant.
- A `LOOKS` key as `look` repaints colour and glow only: the per-entity material clones drop its fresnel rim (use the object form for variants).
- Run `npm run blender:build -- --sheet variant.<name>` to see it, then the e2e `variant` scenario for the real page. The contact sheet shows the shipped
  base with parts but not the runtime `look`.

`validate.ts` checks that the base is a rigged manifest model, every part a `part` entry, and every bone a joint. Nothing else is needed: `assetSets.ts` expands a variant into its base and
parts (so prefetching, `Game.settleAssets` and the budgets see them), and `AssetLibrary.has/entry/ensure/hasModel/clips/create` accept the variant id.

## Budget rule

A zone's byte budget (`tests/zoneBudget.test.ts`, `tests/assetSets.test.ts`) counts a variant as its base plus the **distinct** part files. Parts are 3-10 KB; the
base is usually in the zone already (it is what the enemy used before). So a variant normally costs the parts only. If the base is new to the zone, its full
size counts, and a budget is raised in the same change (with the new number in a comment), never silently. Parts are never worth a LOD.

## Runtime behaviour

- Created in `AssetLibrary.create` (cloned with SkeletonUtils for rigged bases, look applied, parts attached to the cloned bones by name): nothing per frame.
  The animator drives the bones, the parts follow.
- A variant is a placeholder (the base's, named with the variant id) until its base and all parts are loaded, then `onModelLoaded(variantId)` swaps it in. A
  part that fails to load is left off.
- Parts share geometry and materials across instances and are excluded from tint slots (`userData.noTint`): hit flashes and status colours do not touch them, the
  look (`Renderable.look`) does not repaint them. A missing bone attaches the part to the root and warns once per create.

## Things that bit while building this

- Blender 4.0 reads neither `EXT_meshopt_compression`, nor WebP, nor (reliably) quantized skinned meshes: the contact sheet decodes the shipped GLBs
  first (gltf-transform: meshopt decoded, `dequantize`, WebP to PNG).
- Blender's importer plays the first frame of the rig's idle animation; the game attaches in the default pose (T-pose). `sheet.py` drops the animation and
  zeroes the pose, and takes joint positions from the glTF nodes (what the game reads from the cloned bones), not from Blender's bones.
- Never name a script flag `--cycles...`: the Cycles add-on argparses `sys.argv` when it registers and fails on it, which silently removes the Cycles engine. The flag is `--glow`.
- Blender writes a harmless "Draco mesh compression is not available" error line on every glTF export, and exits 0 when a script raises
  unless `--python-exit-code 1` is passed (`build.ts` passes it).
- The optimizer re-centred every static model on x/z with its lowest point at y = 0: parts are exempt (that would destroy the attach point).
