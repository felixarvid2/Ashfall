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
| `npm run blender:autorig -- --ids <id>` | Rigs and animates an unrigged Meshy model with a donor's skeleton and clips, optimizes it and renders a contact sheet ("Rigging without Meshy" below). |
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

## Named NPCs, ground loot and interactable models (`spec/npcs_loot.json`)

- **NPCs** (`src/data/variants/npcs.ts`, `part.npc_*`, builders in `builders_npcs_loot.py`): every named NPC is one variant of one of the five bodies (`npc.cook`,
  `blacksmith`, `technician`, `pump_engineer`, `defector`): a pale `look.tint` plus one to three accessories (caps, hard hats, headsets, goggles, scarves,
  packs, tool belts, aprons...). One person is one variant wherever they stand (Hekla in Ember and the Last Camp, the three Okafors, Lumen's phase-3
  form). The quest files, `elevatorBase.ts` allies and `worldEvents.ts` survivors use the `variant.npc_*` id. Frames: head parts hang on `Head` (head centre
  y 0.12, brow y about 0.17), chest and back parts on `Spine01`, belt parts on `Hips`; body surfaces are bulkier than they look (hip items sit at x 0.25).
  Pvt. Danner and the two Ruizes are on `enemy.sergeant`, not one of the five bodies, and are unchanged. Tints multiply dark bodies: keep them pale.
  Dr. Okafor has her own model since the Blender rig (`npc.okafor`, below): `variant.npc_okafor` is that model with its old tint and no parts (the id stays valid
  for the quests and Lumen's form).
- **Ground loot** (`prop.loot_cache`, `prop.loot_crystal`, `prop.loot_gold`, about 120-380 triangles, colours only; `src/render/lootVisuals.ts`, ids in
  `src/data/loot/lootModels.ts`, prefetched through `zoneAssetIds`/`INSTANCE_SHARED`): the box and cylinder stay as the stand-in until the model has loaded.
  The cache's trim (the one material painted `#c8c8c8`) and the crystal's `lumen_crystal` material are cloned once per rarity/crystal colour and tinted in code.
- **Interactables**: `prop.keycard` (keycard poi and the dungeon collect objective) and `prop.rift_obelisk` replace a scaled cargo crate and `core_column`.
  They carry their own emissive parts, so their VISUAL entries have no `glow` (a Renderable `glow` overwrites every material's emissive). The `data` objective
  still uses `prop.control_terminal`: a terminal reads as data, no extra model.
- Contact sheets of many variants: render each with the game camera from the decoded GLBs (see `sheet.py`); `look.tint` is not drawn by the shipped sheet,
  multiply it into the base colour texture first (what the NPC sheet did).

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

## Deep Mines and Core looks (`part.dc_*`, `variants/deepCore.ts`)

Every Deep Mines enemy and boss, the Core's shades, the Absorbed, Lumen, the Core bosses and the five world bosses have their own
silhouette: 40 ids, 54 parts and two whole models (the miner, the trooper and Holm now have their own models, see "Rigging without Meshy"). Parts live in `scripts/blender/spec/deep_core.json` and are built by one generic
builder, `deep_kit` (`builders_deep_core.py`, docstring at the top): a list of primitives (box, cylinder, cone, sphere, crystal
shard, ring, drill, tube, with a `radial` repeat) written in the **game's axes**, so a part reads like its `position`/`rotation` in
the variant. Parts are shared across ids with different scale and placement (one violet shade halo on seven bodies, the gold Kade
plates on the shield officer, a colour variant is a second spec entry of a few KB).

- Unrigged bases (drone, loader, Slagborn, tentacle, the First, the hound) and the Core's imported models take root parts, measured
  from the model's feet. `enemy.core_guardian` and `enemy.choir_singer` are not Meshy rigs and have no `rig`: root parts only, so
  they do not follow the clips (keep them on the torso or above the head), and their models are *not* normalised to
  `heightMeters` (the def's `scale` 0.55 / 1.45 does that): design the part in model units and compensate with the variant's `scale`.
- Shades (`look: 'shade'`), the Absorbed and the Core machines (`look: 'lumen'`) keep the look on the `EnemyDef`: the renderer
  repaints the base after `create` (fresnel rim intact) and leaves parts alone, so the variants carry no `look`. Only an
  object-form variant look (Deep Mines, world bosses) is applied by `AssetLibrary`; a `LOOKS` key there still loses its rim.
  The enemy's `glow` replaces a variant's emissive at runtime (only the tint stays).
- `enemy.lumen_turret` (the Lumen Turret) and `enemy.lumen_heart` (the Heart, `lumen`) are whole Blender models of primitives
  (`models` in the spec; 18 and 24 KB, about 95 KB together with their LODs). Their `lumen` look flattens the colours, so the silhouette and the rim carry them.
- The optimizer used to write nothing for a model whose smallest colour primitive simplifies to zero triangles in an LOD
  (the meshopt encoder then asserted); `simplifyTo` now keeps such a primitive whole.

## Rigging without Meshy (`autorig.py`)

When the Meshy credits are out, a textured, unrigged Meshy model (`assets/source/<id>/refined.glb`) can be rigged and animated for free:
the skeleton and clips of a model that is already rigged (the donor) are fitted to it. Five models were done this way: `npc.okafor`,
`enemy.infected_miner`, `enemy.security_trooper`, `boss.security_chief_holm`, `boss.brother_ash`.

```sh
npm run blender:autorig -- --ids npc.okafor,boss.brother_ash   # rig + optimize + contact sheet (needs Blender and libegl1, see Install)
npm run blender:autorig -- --ids boss.brother_ash --raw        # rig only (animated.glb + a sheet of it), nothing optimized or written to the manifest
npm run blender:autorig -- --ids boss.brother_ash --sheet      # only the contact sheet of the shipped file
#   --out <dir>   sheets and landmark pictures (default $TMPDIR/ashfall-autorig);   --debug   landmark picture of the fitted skeleton
```

Which model gets which donor and which of its clips play for which state is in `scripts/blender/autorig.json` (`donor`: a rigged GLB under
`public/assets`, `clips`: game state to donor clip, `hints`: overrides). The states must be the `rig.actions` of the manifest entry. The donors:
`enemies/sergeant.glb` (idle, walk, attack, attack2, hit, death) for soldiers, `enemies/vire.glb` (the same with cast and cast2 played as `attack`
and `attack2`) for robed figures and civilians.

Files: `autorig.ts` (decodes the GLBs, runs Blender, puts the clips in the order of `rig.actions` because the optimizer names them by index, then
runs the same `optimizeAssets` as `npm run meshy -- optimize`), `autorig.py` (the rig, in Blender), `autorig_sheet.py` (the contact sheet),
`autorig.json` (the jobs), `decode.ts` (shared with `build.ts`). It writes `assets/source/<id>/animated.glb` (git-ignored, like the Meshy one) and
sets what the optimizer sets (`file`, `stats`, `meshy.clips`, status `optimized`) plus a `credit` line saying how the rig was made.

Method (`autorig.py`):

1. **Normalise** the mesh: uniform scale to the manifest `heightMeters`, feet on y = 0, centred between the feet, facing +z like the donor (Meshy models do).
2. **Landmarks** from the mesh, starting from the donor's proportions: feet and ankles from cross-sections of area-weighted surface samples, the arm axis
   from a line fit through the points beyond the torso (so it follows a T-pose and an A-pose alike), elbow and wrist along it. The result is symmetrical.
   `--debug` draws the fitted skeleton over the see-through mesh (front, side, game camera). Wrong joint? Put it in the job's `hints.joints`
   (`{"LeftLeg": [x, y, z]}`, metres, x = the creature's left); `hints.ratios`, `ankle_x`, `hip_x`, `arm_cut` ... are listed in `landmarks()`.
3. **Skeleton**: the donor's 24 joints, names and hierarchy, in centimetres under an armature object scaled 0.01, like the Meshy rigs (so
   `RIG_JOINTS`, variants and the animator work unchanged).
4. **Clips by world orientation.** The donor's glTF clips set absolute local rotations, so each joint has a world orientation per frame that does not
   depend on the rest pose. The target gets exactly those orientations (positions follow from its own bone offsets, the hips' travel is scaled by the leg
   length). The skin deformation of a joint is then `Ra(t) * Rbind_target^-1`; as the target's bind pose differs from the donor's by the shortest-arc
   rotation `D` of each bone direction, that is "swing the A-pose arm up to the T-pose, then animate". That is why an A-pose (trooper, Holm) needs
   no repose and no clip compensation. The 30 Hz keys are baked into actions, one per state.
5. **Skinning**: bone heat on a voxel-remeshed proxy (1.2 cm; Meshy meshes are non-manifold), the weights transferred to the real mesh (nearest face,
   barycentric), then cleaned: seams welded by position, vertices without weight filled from their neighbours (otherwise the exporter adds a
   `neutral_bone` joint), two smoothing passes (shards, chains and cloth edges the proxy missed take their neighbours' weights; without it a
   crystal shard stretches over the whole body), optional `hints.pins` (a box in fractions of the height that follows one bone), four influences, normalised.
6. **Floor**: where the posed mesh dips below the floor (a lying body is thicker than the donor's) the hips are lifted for those frames.
7. **Export** with Blender's glTF exporter (skin, the original three textures, one animation per state, 72 channels each like the donor).

Checks: the sheet (`<out>/<id>-sheet.png`) has rest pose front and side, idle, walk at two phases, the attack at its peak, the last frame of the death,
and the game camera; the script also prints `feet <clip>: lowest ... m` (the lowest vertex over the clip: about 0 is planted, negative is through the floor).
Look at it for candy-wrapper twists at shoulders and hips, stretched shards, torn coats and the feet.

Limits:

- Bipeds with a donor body plan only: the clips are the donor's (the walk is the Meshy hunched walk, a cast is a cast), nothing is authored. Quadrupeds,
  machines and anything with extra limbs have no donor.
- The skeleton is fitted to landmarks found by proportions and cross-sections: a very unusual build (huge pauldrons, a tail, a skirt hiding the legs) may
  need `hints`. Loose parts fused to the body (a slung rifle, a censer) follow the nearest bones; pin them with `hints.pins` if they stretch.
- Textures are the Meshy model's, untouched (the normal and metal-roughness maps survive the export); the optimizer resizes them to `textureSize`.
- The rig is made from `refined.glb`, so a new Meshy generation needs the command again; nothing is kept in the repo but the optimized GLB.
- A model's default pose is its own bind pose: the trooper and Holm are A-posed, so parts placed on their arm bones are measured from the A-pose, not the T-pose
  this document assumes for Meshy rigs.
- The hips are lifted wherever any vertex of the posed mesh dips below the floor: a planted foot may float up to 4 cm for a few frames of a walk, and a lying
  body rests on whatever pokes lowest (an arm, a generator). Invisible at the game camera, but a trade, not a fix.
