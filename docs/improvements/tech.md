# Tech audit: performance, loading, robustness and code health (T001-T025)

Scope: bundle size, asset loading, sim and frame hot spots, GPU/memory lifecycle, saves, error handling, test gaps, dead code, TypeScript strictness. No UI-feature items, nothing that needs paid generation. Source was not edited; this file is the only change.

**Method.** `npm run build` (output quoted below), byte counts from `ls`/`du`/`ffprobe`, GLB headers parsed in node, the sourcemap of the production chunk decoded to attribute bytes, `tsc` with extra flags, grep with file:line, and micro-benchmarks run with `npx tsx` against the real modules (zones, spawn, collision, navigation, ground splat, save). **All timings are "node/tsx, this container" (one core, warm JIT); treat them as ratios, not as phone frame times.** No browser was launched (another auditor owns it), so draw-call and GPU numbers are marked "to capture". The bench sources are in the appendix so every Verify line can be re-run.

**Legend.** Priority 1 = measurable cost on every session or a way to lose player data, 2 = clear improvement, 3 = hygiene. Effort S = under about 2 h in one or two files, M = a day or several files, L = several days or a structural change.

## Summary

- Items: 25. Priority 1: 8, priority 2: 9, priority 3: 8. Effort S: 14, M: 9, L: 2.
- Baseline: `npm run build` emits one 2,071 kB chunk (572 kB gzip, 7.56 MB sourcemap); `npx vitest run` is 76 files / 957 tests in 29 s; `tsc --noEmit` is clean. `public/assets` is 70 MB (236 GLB files 48 MB, audio 10 MB, webp 13 MB).
- Biggest runtime finding: the simulation spends about 95 % of its measured time re-inserting thousands of **static** colliders into the spatial hash, twice per tick (T001). In Hydroponic Vaults that is 7.3 ms of a 16.7 ms tick budget before a single enemy thinks.
- Biggest loading findings: the game downloads and decodes all 92 models plus their LODs (48 MB) before the character select appears (T003), and 18.75 MB of the 21.8 MB of LOD files is the same texture bytes embedded again (T002). Entering a zone costs 1.7-3.7 s of pure main-thread noise maths that is identical every time (T004).
- Biggest robustness findings: a parse failure of the account blob silently resets the shared stash on the next autosave (T009); autosave failures are invisible (T010); applying a save is not transactional and the item/skill ids in it are never checked (T011); there is no WebGL-missing, context-lost or global-error handling at all (T013).
- Not a problem (measured, left out): HUD text lookups (`t()` is 0.15-0.6 us), minimap redraw (already throttled to 0.15 s), nav grid rebuild (0.5-1.2 ms every 0.3 s while hunted), localStorage access in the UI (all wrapped in try/catch).

## Top 5

1. T001: static colliders are hashed twice per tick (7.3 ms/tick in Hydroponic Vaults); keep a persistent static grid.
2. T004: zone entry runs a 1.7-3.7 s ground-splat noise pass that is deterministic per zone; compute coarse, cache, or bake it.
3. T002: LOD files re-embed identical textures; 18.75 MB of duplicate bytes and 748 decoded images where 250 are unique.
4. T009: `loadAccount` swallows any parse error and the next autosave overwrites the shared stash, relics and World Tier unlocks.
5. T003: boot blocks on every model and every zone's ground texture (48 MB + 6.8 MB); load the selected class and zone first and the rest on demand.

Also priority 1: T005 (the 2.07 MB chunk), T010 (silent autosave failure), T013 (WebGL/context loss).

---

## Items

### T001: Static colliders are re-hashed twice per tick
- **Area:** Sim performance (`src/core/spatial.ts`, `src/systems/collision.ts`)
- **Problem:** `spatialSystem` (scheduler, `src/game.ts:341`) calls `ctx.spatial.clear()` and re-inserts every living `Transform + Collider`; `collisionSystem` (`src/game.ts:364`) does the same again at `src/systems/collision.ts:24` before resolving. A zone's props are all colliders that never move: Hydroponic Vaults has 3,419 colliders, all 3,419 static (`spawnArenaProps` makes 3,749 entities). Bench (node/tsx, this container, 120 enemies + the zone's props, 600 ticks): `spatial` 3.35 ms/tick, `collision` 3.93 ms/tick, `enemyAI` 0.19, `status` 0.11, everything else under 0.04. That is 7.3 of 7.7 ms measured, against a 16.7 ms tick at 60 Hz. `SpatialHash.queryCircle` also allocates a `new Set` per call (`spatial.ts:46`).
- **Change:** Split the hash into a static layer built once per zone/instance entry (and patched when a destructible breaks or a crystal regrows) and a dynamic layer cleared per tick. `queryCircle` reads both. Insert statics from `populateZone`/instance setup, not from a system. Replace the per-query `Set` with a generation-stamped `Uint32Array`/`Map` reused across calls. Remove the second rebuild by re-indexing only dynamic entities after movement. Callers that rely on dead statics being absent (`collision.ts` loop, `navigation.ts:174-177`, `targeting.ts`) must skip `Dead` statics explicitly.
- **Files:** `src/core/spatial.ts`, `src/systems/collision.ts`, `src/core/context.ts`, `src/game.ts` (zone/instance entry), `src/world/interactables.ts` (breakDestructible), `tests/` (new `spatial.test.ts`).
- **Verify:** `npx tsx scripts/perf/tick.ts hydroponic_vaults` (T019; source in the appendix) prints per-system ms/tick; expect `spatial + collision` below 1.0 ms (now 7.3). `npx vitest run` stays green (collision, navigation, enemyAI, interactables tests); new test: a static collider added, queried, broken (Dead) and no longer returned from `livingInCircle`.
- **Effort:** M. **Priority:** 1.

### T002: LOD files re-embed identical textures
- **Area:** Asset size and decode cost (`scripts/meshy/optimize.ts`, `src/render/assets.ts`)
- **Problem:** 72 of 92 models list two extra LOD files (144 files, 21.8 MB). Parsing the GLB headers shows each LOD carries its own copy of the base model's textures: 18.75 MB of the 21.8 MB is byte-identical image data (md5 match with the LOD0 file). Example: `props/signal_tower.glb` 343 kB (5,550 vertices), `_lod1` 309 kB (2,444), `_lod2` 290 kB (783); the geometry is a few tens of kB, the rest is textures. `AssetLibrary.preload` (`assets.ts:76-77`) loads all three files, so at boot the loader decodes 748 images (2.2 GB as RGBA) where only 250 are unique (815 MB). Second-order: 13 props under 1.5 m tall still ship 1024x1024 textures (2.09 MB of images); 105 prop and 32 enemy textures are 1024 px.
- **Change:** (a) In the optimize pipeline write LOD1/LOD2 without images (geometry and material parameters only). (b) In `AssetLibrary.preload`, after loading, point each LOD material's `map`/`normalMap`/`metalnessMap` at the LOD0 material's textures (match by material index) so GPU upload happens once. (c) Optional second step: cap textures to 512 px for props under 1.5 m, and consider KTX2/Basis for GPU-compressed textures (4x less VRAM; needs `toktx` in the pipeline).
- **Files:** `scripts/meshy/optimize.ts` (LOD export), `src/render/assets.ts`, `assets/manifest.json` (re-run `npm run assets:check`), `public/assets/{props,enemies,environment}/*_lod*.glb`.
- **Verify:** `du -sh public/assets` goes from 70 MB to about 50 MB. Re-run the LOD-duplicate script (appendix): `dupBytesInLODs` 18,751,212 becomes 0 and `images decoded at boot` 748 becomes about 250. Unit test for the material re-linking with fake `THREE.MeshStandardMaterial`s: `LOD1.map === LOD0.map`.
- **Effort:** M. **Priority:** 1.

### T003: Boot loads every model and every zone texture; character select waits for it
- **Area:** Loading (`src/main.ts:41-45`, `src/game.ts:869-877`, `src/render/assets.ts:56-105`)
- **Problem:** `main.ts` does a top-level `await game.loadAssets(...)` before the character select is created. `loadAssets` runs `assets.preload` (every `optimized` non-icon manifest entry: 92 models, 236 files, 48.2 MB including LODs) and `preloadGround(ZONES.map(z => z.ground))` (all five zones' ground textures, 6.8 MB). By prop and pack-enemy usage a single zone needs 11.9-17.1 MB of that (Cinder Flats 25 %, Refinery 34 %, Hydroponic 25 %, Mines 34 %, Core 35 %; bench in the appendix, class models and bosses extra). "Switch character" and "To character select" call `location.reload()` (`game.ts:801`, `:834`), so the whole boot, including the decode of 748 images, repeats from the HTTP cache each time.
- **Change:** Show the character select immediately. Give `AssetLibrary` an `ensure(ids): Promise<void>` that loads missing models (deduplicated, concurrency-limited, each placeholder-safe). Boot loads the HUD/UI set only; `playCharacter` ensures the class model plus the start zone's set; `enterZone` ensures the target zone's set while the fade is running (the fade already exists in `crossGate`). Compute the set from `ZoneDef.props`, pack templates and boss/instance defs (the appendix code does it for props and packs). Load other zones' ground textures when the zone is entered. Keep the old "load everything" path behind `?preload=all` for the artifact build. Replace the two `location.reload()` calls by returning to the select screen (T016 covers the disposal this needs).
- **Files:** `src/main.ts`, `src/game.ts`, `src/render/assets.ts`, `src/render/gameRenderer.ts` (`preloadGround`), new `src/data/assetSets.ts`, `scripts/artifact/build.ts` (keep the eager path).
- **Verify:** New test `tests/assetSets.test.ts`: for every zone `zoneAssetIds(zone)` summed with `fs.statSync` on `public/assets` is at most 18 MB, the boot set is at most 6 MB, and every id exists in the manifest. In a browser (to capture): bytes transferred before the select screen is interactive, `npm run e2e -- --scenario boot`, expect under 10 MB (now about 55 MB).
- **Effort:** L. **Priority:** 1.

### T004: Zone entry runs a 1.7-3.7 s noise pass that is the same every time
- **Area:** Zone-change stall (`src/render/groundSplat.ts`, `src/render/gameRenderer.ts:519-530`)
- **Problem:** `texturedGroundMaterial` calls `buildGroundSplat(def.patches, size, 1024, seed, count)` on every `buildArena`. `seed` is `arena.id` and `size = halfSize*2 + 40` (1,536 for all zones), so the output is a pure function of static zone data and is recomputed on every entry, including coming back to a zone. Bench (node/tsx, this container): Cinder Flats 1,745 ms, Refinery 2,017, Hydroponic 3,669 (1,206 patches), Deep Mines 2,745, The Core 2,459-2,910. The dominant cost is not the patches: the single-channel "variation" noise pass (1M `fbm` calls, three `at()` each, a closure and two `%` per corner) takes 2,378 ms alone with zero patches; at 512 px it is 609 ms and at 256 px 158 ms. The variation noise has about 21 cells across the zone (`x / 70` over 1,536 m), so 1,024^2 samples are 16x more than it can express. `game.ts:1025` already notes that "building it can stall the page".
- **Change:** (1) Compute the variation channel on a 256^2 grid and bilinearly upsample into the alpha channel. (2) Make `ValueNoise.at` allocation-free (hoist `g`, precompute wrapped indices). (3) Memoize the result per `arena.id` for the session; optionally (4) bake all five splat sets at build time into `public/assets/splat/<zone>.png` (lossless) and load them instead of computing, which also removes the cost from the first entry.
- **Files:** `src/render/groundSplat.ts`, `src/render/gameRenderer.ts`, optionally `scripts/art/bakeSplat.ts`, `tests/ground.test.ts`.
- **Verify:** `npx tsx scripts/perf/splat.ts` (appendix): every zone at most 400 ms (now 1,745-3,669), second entry of a zone about 0 ms. `npx vitest run tests/ground.test.ts` passes (determinism, patch centre = 255, layers 3-5 in the second texture); add a test that the new alpha channel stays within 3/255 of the old one on a 64^2 crop.
- **Effort:** M. **Priority:** 1.

### T005: One 2,071 kB entry chunk
- **Area:** Bundle (`vite.config.ts`, `src/main.ts`, `src/game.ts`)
- **Problem:** `npm run build`: `dist/assets/index-*.js` 2,071.46 kB (gzip 571.63 kB), CSS 171.59 kB, plus the 26.5 kB meshopt decoder; `chunkSizeWarningLimit: 900` makes Vite warn, and the comment in `vite.config.ts` defers code-splitting to "streaming zones (Phase 5)". `src/` has no dynamic `import()` except the meshopt decoder. Sourcemap attribution of the minified output: three.js 521 kB (`three.core` 257, `three.module` 200, GLTFLoader 45), zod 94 kB, game.ts 59, gameRenderer 36, hud 26, servicePanel 24, inventoryPanel 24, minimap 22, matrixPanel 18, skillTreePanel 14, touchControls 13, zones data 77, skill trees 35, quests 35, enemies 33. About 265 kB of JSON is inlined (`en.json` 171 kB and `assets/manifest.json` 93 kB, minified); the sourcemap credits unmapped bytes to the neighbouring source, so per-file attribution near JSON imports is approximate. `main.ts` statically imports `validate.ts` (dev-only, called under `import.meta.env.DEV`).
- **Change:** (1) Vendor split with `build.rolldownOptions.output.codeSplitting` (the option the build output names): `three` and `zod` in their own long-cacheable chunks. (2) Lazy-load panels that open on demand (`matrixPanel`, `skillTreePanel`, `servicePanel`, `settingsPanel`, `characterPanel`, `riftPanel`, `tierPanel`, epilogue, devtools) with `import()` at first open; `src/ui/panelRegistry.ts` (`registerGamePanels`) already centralises panel registration. (3) `await import('./data/validate')` inside the `DEV` branch. (4) Move `en.json` to its own chunk loaded in parallel at boot (`t()` is sync, `main.ts` already awaits). (5) Follow-up: lazy per-zone data (`ZONES` is read synchronously by `zoneDef()`, so this needs the async `ensure` from T003). Realistic result: no change in total bytes, but the app chunk drops below the 900 kB warning, three/zod/lang stop invalidating on every deploy, and the initial gzip falls by the lazy panels (about 100 kB minified) and validate (12 kB).
- **Files:** `vite.config.ts`, `src/main.ts`, `src/game.ts` (panel construction), `src/ui/panelRegistry.ts`.
- **Verify:** `npm run build`: no "larger than 900 kB" warning, the largest chunk at most 900 kB, `vendor-three` about 520 kB, entry gzip at most 450 kB (now 572). `npm run build:artifact` still produces a working `artifact-page.html` (that build is one file; check it inlines chunks). `npx vitest run` unchanged.
- **Effort:** M. **Priority:** 1.

### T006: The full Meshy manifest ships in the client
- **Area:** Bundle (`src/render/assets.ts:7`, `src/data/validate.ts:6`, `assets/manifest.json`)
- **Problem:** `assets/manifest.json` (136 kB on disk, 93 kB minified) is imported by the renderer and is entirely inlined: all 162 asset `prompt` strings are present in the production chunk (checked by substring). At runtime `AssetLibrary` reads only `id, category, status, file, lods, placeholder, glow, heightMeters, meshy.clips`. A slim projection of those fields is 34 kB minified.
- **Change:** A tiny Vite plugin (or a `prebuild` script) that writes `manifest.runtime.json` with just those fields; `AssetLibrary` and `AssetManifestSchema` get a `RuntimeEntry` type; `validate.ts` and the Meshy tools keep reading the full file.
- **Files:** `vite.config.ts` or `scripts/assets/runtimeManifest.ts`, `src/data/assetManifest.ts`, `src/render/assets.ts`, `tests/data.test.ts`.
- **Verify:** `npm run build`: the entry chunk shrinks by about 59 kB minified; `grep -c "heavy armored space marine" dist/assets/*.js` is 0 (now 1 line). `npx vitest run` passes.
- **Effort:** S. **Priority:** 3.

### T007: The 7.5 MB sourcemap rides in the release zip
- **Area:** Shipping size (`vite.config.ts:11`, `.github/workflows/release.yml:66`)
- **Problem:** `build.sourcemap: true` writes `dist/assets/index-*.js.map` (7,561,514 bytes) and `release.yml` zips the whole of `dist` (`cd dist && zip -qr ...`), so every web release and every deployed build carries it, and the minified chunk has a `//# sourceMappingURL` pointing at it.
- **Change:** `sourcemap: 'hidden'` (no URL comment) for production, and exclude `*.map` from the zip (`zip -qr ... . -x '*.map'`), or upload it as a separate release asset for debugging.
- **Files:** `vite.config.ts`, `.github/workflows/release.yml`.
- **Verify:** `unzip -l ashfall-*-web.zip | grep -c '\.map'` is 0; `ls -l dist/assets/*.map` still exists locally for debugging; the zip is about 7 MB smaller before compression.
- **Effort:** S. **Priority:** 3.

### T008: Decoded music is never evicted
- **Area:** Memory (`src/audio/engine.ts:163,310-320,326,401`)
- **Problem:** `load()` fetches and `decodeAudioData`s a whole file into `buffers` and never releases it. Eight music tracks total 320 s (ffprobe: 26-70 s each), the SFX sprite is 55 s, ambience loops 13.5 s: about 390 s of stereo PCM, which is roughly 135-150 MB as float32 at 44.1/48 kHz, all resident once the player has visited each zone. The menu track (37 s, about 13 MB decoded) stays after the game starts.
- **Change:** Keep a small LRU for music buffers (current + next + boss), drop the menu track when play starts, and drop the previous zone's ambience when the crossfade ends. For long music consider streaming through an `HTMLAudioElement` + `MediaElementAudioSourceNode` instead of decoding.
- **Files:** `src/audio/engine.ts`, `src/audio/music.ts`, `tests/audio.test.ts`.
- **Verify:** Test with a fake `AudioContext`: after switching through 4 tracks the number of resident music buffers (expose `loadedBuffers()`) is at most 3. In a browser (to capture): Chrome task manager audio memory after visiting all five zones, expect under 50 MB.
- **Effort:** M. **Priority:** 2.

### T009: A bad account blob silently resets the shared stash
- **Area:** Save robustness (`src/core/account.ts:44-58`, `src/game.ts:1086`)
- **Problem:** `loadAccount` wraps `AccountSchema.parse(JSON.parse(json))` in `try { } catch { return emptyAccount(); }`. `autosave()` (`game.ts:1086`) then calls `saveAccount`, which writes the empty account over the stored one on the next run of the 60 s timer, on tab hide and on `beforeunload`. The account holds the shared stash (50+ slots), Echo Relics, Region Restoration, World Tier unlocks, Codex, best Deep Rift and play time. Any schema change (the schema is `version: z.literal(1)` with no migrations), a hand-edited key, or truncated storage wipes all of it with no message. There are no tests: `grep -l "loadAccount\|saveAccount" tests/*.ts` finds nothing.
- **Change:** On a parse failure copy the raw string to `ashfall.account.bak` (keep the last two) before returning the empty account, have `loadAccount` return `{ account, recovered }` and show a toast; add `migrateAccount` mirroring `save.ts`'s chain; do not write the account while `recovered` is set until the player confirms. Cover with tests.
- **Files:** `src/core/account.ts`, `src/game.ts`, new `tests/account.test.ts`.
- **Verify:** `npx vitest run tests/account.test.ts`: corrupt JSON in, `ashfall.account.bak` present with the original string and `recovered === true`; a valid v1 blob round-trips; an unknown extra key does not drop the stash.
- **Effort:** S. **Priority:** 1.

### T010: Autosave failures are silent, and saves are pretty-printed
- **Area:** Save robustness (`src/game.ts:1085-1093`, `src/core/save.ts:218-220`)
- **Problem:** `autosave()` is `try { saves.write(...) } catch { /* the manual save shows the error */ }`. Autosave is the only save most players ever trigger (60 s timer, tab hide, unload), so a full or blocked localStorage means progress is lost with no signal. `serializeSave` uses `JSON.stringify(..., null, 2)`: a save with 100 generated items is 112,042 bytes pretty vs 69,364 compact (-38 %); three slots plus the account approach the 5 MB quota sooner than they need to (bench in the appendix; zod parse on write is 0.6 ms).
- **Change:** `SaveStore.write` returns `{ ok: true } | { ok: false, reason: 'quota' | 'blocked' | 'unknown' }` (catching `DOMException` names `QuotaExceededError`/`SecurityError`). `Game.autosave` records the failure, shows one persistent toast ("Cannot save: storage full. Use Export save.") and retries each interval, clearing the toast on success. Store compact JSON; keep pretty only for `exportSave`.
- **Files:** `src/core/save.ts`, `src/game.ts`, `src/data/lang/en.json`, `tests/save.test.ts`.
- **Verify:** `npx vitest run tests/save.test.ts`: a `Storage` whose `setItem` throws `QuotaExceededError` makes `write` return `{ ok: false, reason: 'quota' }`; the compact serialization is shorter than the pretty form and `parseSave` of both is equal.
- **Effort:** S. **Priority:** 1.

### T011: Applying a save is not transactional and its ids are never checked
- **Area:** Save robustness (`src/game.ts:2333-2395`, `src/data/loot/schemas.ts:221`)
- **Problem:** `ItemSchema.base` is `z.string()` and the same holds for unique, aspect, crystal and skill-rank ids, so a save that references a renamed or removed id parses fine. Readers are tolerant (`BASE_ITEMS.get(item.base)` with a null check in `inventory.ts:26,36`, `itemTooltip.ts`, `inventoryLogic.ts`; `baseItem()` that throws is only called from `generate.ts`), so an unknown base does not crash: it produces an orphan item that cannot be equipped (`equipFromGrid` returns `notEquippable`) and shows the raw key `items.bases.<id>` in its tooltip, with no message to the player. Separately, `applySave` mutates the live game step by step (respawn as the class, RNG, player transform, progression, skill tree, inventory, zones, then `enterZone`) and `load()` only toasts if anything in that sequence throws. I did not find a concrete throw in the current code, so this is a structural risk: with quick-load (`game.ts:1113`) or `importSave` during play, a mid-way exception would leave a half-applied world that the next autosave writes over the good slot. `tests/save.test.ts` covers migrations but not references.
- **Change:** After `parseSave`, run `sanitizeSave(data)` that reports items/aspects/crystals with unknown ids and skill ranks for unknown nodes (`{ data, dropped: string[] }`: drop or convert to a refunded currency, and tell the player once); build the new state first and swap it in only when every step succeeded; after a failed `load()` suppress autosave until a successful load or a new game.
- **Files:** `src/core/save.ts` (or new `src/core/saveRefs.ts`), `src/game.ts`, `tests/save.test.ts`.
- **Verify:** New test: a v8 save with `base: 'removed_base'` in the grid and a skill rank for `n.nope` returns `dropped.length === 2` from `sanitizeSave`; a test double whose `applySave` throws after the inventory step leaves `autosaveSuppressed === true` and the slot unchanged.
- **Effort:** M. **Priority:** 3.

### T012: Corrupt or newer saves can be overwritten; migrations have no backup
- **Area:** Save robustness (`src/core/save.ts:175-216`, `src/game.ts:891-937`)
- **Problem:** `parseSave` raises `SaveError('save is from a newer version')` for a newer save and the select screen shows it as "corrupt" (`game.ts:908`); creating a character in that slot or deleting it overwrites the data (`game.ts:913`, `:937`). Migrations run in memory and the migrated result replaces the raw JSON on the next autosave, so a faulty migration destroys the original irreversibly.
- **Change:** `SaveStore.quarantine(slot)` copies the raw string to `<prefix><slot>.corrupt.<timestamp>` before any overwrite/delete of a slot that failed to parse (keep two). When `migrate` changes the version, write the original to `<prefix><slot>.v<N>.bak` once. Distinguish "newer version" from "corrupt" in the slot label.
- **Files:** `src/core/save.ts`, `src/game.ts`, `src/ui/characterSelect.ts`, `src/data/lang/en.json`, `tests/save.test.ts`.
- **Verify:** `npx vitest run tests/save.test.ts`: write garbage to `slot0`, call the new-character path, assert a `.corrupt.*` key holds the garbage; load a v7 fixture and assert `slot0.v7.bak` holds the original string.
- **Effort:** S. **Priority:** 2.

### T013: No WebGL-missing, context-lost or global error handling
- **Area:** Error handling (`src/render/gameRenderer.ts:74`, `src/main.ts:41-45`, `src/core/loop.ts:68-74`)
- **Problem:** `new THREE.WebGLRenderer(...)` is unguarded, so a device without WebGL (or a blocked context) throws inside the `Game` constructor and the page stays blank. `grep -rn "webglcontextlost\|unhandledrejection\|window.onerror" src` finds nothing: a lost context on a phone (tab backgrounded, GPU reset) leaves a frozen canvas while the loop runs. The top-level `await game.loadAssets(...)` has no catch, so an exception leaves the "Loading" text forever. An exception inside `step()` propagates before `requestAnimationFrame` is re-armed in `frame`, so the first throw kills the loop with no message.
- **Change:** New `src/core/errorScreen.ts`: a full-screen message with the reason and a Reload button (English text via `t()`). Wrap renderer creation and `loadAssets` in try/catch in `main.ts`. Add canvas `webglcontextlost` (preventDefault, stop the loop, autosave, show the overlay) and `webglcontextrestored` (rebuild arena and post-processing targets, then resume; reload as the fallback). Install `window` `error`/`unhandledrejection` handlers that autosave once and show the overlay for fatal ones. Catch per-tick exceptions in `GameLoop.step`, count them, and stop with the overlay after, say, 5 in a second instead of dying silently.
- **Files:** `src/main.ts`, `src/core/loop.ts`, `src/render/gameRenderer.ts`, `src/render/postfx.ts`, new `src/core/errorScreen.ts`, `src/data/lang/en.json`, `tests/loop.test.ts`.
- **Verify:** Unit tests with an `EventTarget` canvas: dispatching `webglcontextlost` calls `onLost` once and stops the loop; a throwing `update` three times trips the guard. In a browser (to capture): `ashfall.renderer.renderer.getContext().getExtension('WEBGL_lose_context').loseContext()` shows the overlay and the slot's `savedAt` updates.
- **Effort:** M. **Priority:** 1.

### T014: One missing LOD file turns the whole model into a placeholder, silently
- **Area:** Asset error handling (`src/render/assets.ts:75-100`)
- **Problem:** `Promise.all(files.map(loadModel))` rejects if any of the (up to) three files fails, and the `catch` falls back to a placeholder box for the entire asset with a `console.warn` only. A 404 on a `_lod2.glb` therefore shows a grey box where a good model exists, and nothing tells the player or the developer how many assets failed. There is no retry for a transient network error.
- **Change:** Load with `Promise.allSettled`; keep the levels that loaded (LOD0 required), record failures in `assets.failed: { id, file, reason }[]`, retry each failed file once after 1 s, and surface `failed.length` in the debug panel (and a toast when LOD0 of a character model failed). Make the loader injectable so it is testable.
- **Files:** `src/render/assets.ts`, `src/ui/devtools.ts`, new `tests/assets.test.ts`.
- **Verify:** `npx vitest run tests/assets.test.ts` with a fake loader that rejects `*_lod2.glb`: `hasModel(id)` is true, the object has 2 LOD levels, `failed` has one entry; a loader that fails LOD0 gives a placeholder plus one `failed` entry.
- **Effort:** S. **Priority:** 2.

### T015: Every static prop is an ECS entity and a scene object, walked every frame
- **Area:** Frame time (`src/render/gameRenderer.ts:1084-1260`, `src/world/arena.ts`)
- **Problem:** `spawnArenaProps` turns the five zones' prop lists (752 / 1,166 / 2,284 / 394 / 639 definitions) into 1,684 / 2,115 / 3,749 / 595 / 829 entities. `renderer.sync` queries `Transform + Renderable` (a fresh array each frame), allocates a `Set` of all of them, does 3-4 map lookups, a distance cull and an `occludes()` test per static prop, and a reaping loop over `this.objects`. A skeleton of that loop without any Three.js work costs 0.53 ms/frame for 2,800 entities (node/tsx, this container). Each prop is its own `Object3D` (a `THREE.LOD` with three cloned levels for the 72 assets that have LODs), so draw calls scale with the prop count inside the camera frustum. Draw-call counts were not captured (no browser); `renderer.stats.drawCalls` exposes them.
- **Change:** Static, non-interactive props (no `Mover`, `Interactable`, `Destructible`, `Health`) get built once in `buildArena`/`syncSetPieces` into chunk groups (for example 64 m cells) with one visibility toggle per chunk by distance, and `InstancedMesh` batches for single-mesh assets repeated more than N times (the `instancingParts` helper exists). The entity keeps only its `Collider`. `sync` then iterates dynamic entities only, and reuses a persistent `Set`/array.
- **Files:** `src/render/gameRenderer.ts`, `src/render/assets.ts`, `src/world/arena.ts`, `src/core/components.ts`, new `tests/staticProps.test.ts`.
- **Verify:** In a browser (to capture, e2e `--scenario zone` on Hydroponic): `ashfall.renderer.stats.drawCalls` before vs after, target at least 40 % fewer, and the frame cost of `sync` under 0.1 ms. In node: the sync-loop skeleton at 3,749 entities drops from about 0.7 ms to under 0.1 ms.
- **Effort:** L. **Priority:** 2.

### T016: Per-entity geometry and materials are never disposed
- **Area:** GPU memory lifecycle (`src/render/assets.ts:156-171`, `src/render/gameRenderer.ts:1253-1260`, `:1294-1345`, `:738-758`)
- **Problem:** `assets.create(id, true)` clones each `MeshStandardMaterial` per entity (hit flash, tint). `addDroneMarks` builds a `CircleGeometry`, a `RingGeometry`, a `SpriteMaterial` and two `MeshBasicMaterial`s per drone; `addEyes` a `SpriteMaterial` per enemy. When an entity disappears, `sync` only does `scene.remove(obj)` and deletes map entries. Three tracks per-object GPU state in WeakMaps, so this is reclaimed only when the garbage collector gets to the wrappers, not deterministically and not as a hard leak. Unlike `disposeZone` (`:605-623`, which guards on `userData.own`/`shared`), `exitInstance` (`:738-758`) disposes everything under the instance root without a guard; today that root holds only renderer-built floor, wall and water meshes (nothing from the asset cache is parented there), so this is a code-health observation, not a live bug. None of this was measured in a browser.
- **Change:** Track per-entity owned resources in `obj.userData.owned` (materials from `create(..., true)`, drone/eye geometry and materials) and dispose exactly those in the reaping loop; create the drone ground/ring geometry once and share it. Give `exitInstance` the same `userData.own`/`shared` guard as `disposeZone` so a later change cannot dispose cached assets.
- **Files:** `src/render/gameRenderer.ts`, `src/render/assets.ts`, a fake-scene unit test of the reaper under `tests/`.
- **Verify:** Browser (to capture): kill 200 drones in the test arena, `ashfall.renderer.renderer.info.memory.geometries` returns to its starting value (within 2) instead of growing by about 2 per drone. Node: the reaper test counts `dispose` calls on owned resources and zero on shared ones.
- **Effort:** S. **Priority:** 2.

### T017: Per-frame allocations in the render/HUD path
- **Area:** Frame time (`src/render/gameRenderer.ts:1084-1087,1401-1475`, `src/game.ts:1137-1235,1397-1437`)
- **Problem:** Every frame: `sync` allocates a `Set`; `applyTint` runs for every character and builds a `priority` array literal, runs `find` with an inner `some` closure, and calls `enemyDef()`; `updateEnemyBars` allocates a `blips` array and an info object per enemy within range; `questMarkers()` is called twice per frame (`game.ts:1214` and `:1447`) and each call allocates and does `pois.find` over 150-200 POIs; the dark-zone branch builds two arrays for `setDynamicLights` and resets `lightTimer`. None of these is large alone; together they are steady GC pressure on phones.
- **Change:** Hoist the status priority list to a module const and cache the "active tint status" on `StatusEffects` when the list changes; reuse arrays (`length = 0`); call `questMarkers` once per frame and share the result; only call `setDynamicLights` when the set of lit lights changes (key string like `sporeKey`).
- **Files:** `src/render/gameRenderer.ts`, `src/game.ts`.
- **Verify:** With the T019 harness extended by a render-less frame: heap delta per 600 ticks under `node --expose-gc` falls by at least 30 %; `tests/feedbackUi.test.ts` and `tests/combatUiPass.test.ts` still pass.
- **Effort:** S. **Priority:** 3.

### T018: The fixed-step catch-up can spiral on slow devices
- **Area:** Robustness / frame time (`src/core/loop.ts:25-27,51-60`)
- **Problem:** `maxFrameTime = 0.25` lets one frame run up to 15 simulation ticks. At the measured 7.7 ms/tick in a busy zone (T001), a 0.25 s stall costs 115 ms of catch-up on this machine; a phone that is 3-4x slower needs 350-460 ms per frame, which is itself a longer-than-0.25 s frame again, so the loop never recovers (spiral of death). Returning to a hidden tab produces a large `frameTime` too.
- **Change:** Cap ticks per frame (for example 5) and drop the remaining accumulator; additionally measure the wall time of the update loop and stop catching up once it exceeds a budget (for example 12 ms), and show a slow-device hint in the debug panel.
- **Files:** `src/core/loop.ts`, `tests/loop.test.ts`.
- **Verify:** New test: `step(0.25)` with an `update` that takes 20 ms of fake time yields at most 5 updates and an accumulator below one tick; the existing stepping tests in `tests/loop.test.ts` still pass for normal frame times.
- **Effort:** S. **Priority:** 2.

### T019: No performance harness; regressions like T001 go unseen
- **Area:** Tooling (`src/core/ecs.ts` `Scheduler`, `scripts/`)
- **Problem:** `Scheduler.tick` runs about 45 named systems with no timing, and nothing in `npm run` measures sim cost; the figures in this audit came from ad-hoc scripts. The `sim`/`play` scripts balance combat, not time.
- **Change:** `Scheduler` keeps an optional per-system cumulative time (`profile = true`, `performance.now()`), exposed on the debug handle and in the devtools panel. Add `scripts/perf/tick.ts` (appendix source) plus `npm run perf:tick -- <zone>` that prints ms/tick per system, and a vitest guard `tests/perf.test.ts` with a generous budget (for example total tick under 6 ms on Hydroponic with 120 enemies) that runs only when `PERF=1`.
- **Files:** `src/core/ecs.ts`, `scripts/perf/tick.ts`, `package.json`, `src/ui/devtools.ts`, `tests/perf.test.ts`.
- **Verify:** `npm run perf:tick -- hydroponic_vaults` prints a table whose total is within 10 % of the appendix benchmark (7.7 ms/tick before T001); `PERF=1 npx vitest run tests/perf.test.ts` passes after T001.
- **Effort:** S. **Priority:** 2.

### T020: `World.query` allocates on every call (112 call sites)
- **Area:** Sim performance (`src/core/ecs.ts:86-100`)
- **Problem:** `query()` builds a new array and runs a `types.every(...)` closure test per candidate entity. With 800 entities: `query(A, B, C)` 19.9 us, `query(A, B)` 26.3 us, `query(A, B).filter(!has D)` 39.8 us (node/tsx, this container). There are 112 `.query(` call sites (17 in `game.ts`, 7 in `vfx.ts`, 6 in `interactables.ts`, 5 each in `enemyAI.ts` and `minions.ts`), most of them every tick or every frame; `destroy()` also iterates all stores. Not a bottleneck today (T001 is), but it scales with the entity counts T015 would reduce anyway. Also `blastSystem` (`interactables.ts:429`) scans every `Destructible` per explosion.
- **Change:** Add `world.forEach(types, fn)` (no result array; indexed loop over the smallest store's keys, inline `has` checks) and `world.queryInto(out, ...types)` for callers that need an array; migrate the per-tick systems (`enemyAI`, `collision`, `status`, `projectiles`, `minions`) first. Optionally keep cached query results invalidated on add/remove of the involved component types.
- **Files:** `src/core/ecs.ts`, the systems above, `tests/ecs.test.ts`.
- **Verify:** The ECS bench in the appendix: `query(A, B)` at 800 entities under 12 us; `tests/ecs.test.ts` gains forEach/queryInto equivalence with `query`, including entities destroyed during iteration.
- **Effort:** M. **Priority:** 3.

### T021: Instance floors reload textures; VFX pools only grow
- **Area:** Memory lifecycle (`src/render/gameRenderer.ts:708-715`, `src/render/vfx.ts:192-209`)
- **Problem:** `instanceFloorTexture` creates a new `TextureLoader().load(...)` for every dungeon entry instead of reusing `groundTexture(name)` (which caches the zone ground textures), so each entry re-decodes a 1024 px webp and uploads a new GPU texture that `exitInstance` disposes again. `VfxLayer.acquire` creates a new group (with new geometry for the `pillar`/`beam`/`hazard` keys) whenever no inactive pool entry exists and never shrinks the pools; keys include colour and band values, so the key space grows with content (`hazard:${color}:${band}`).
- **Change:** Reuse the shared ground texture and `clone()` it for the repeat (clones share the source image). Create the cylinder/ring geometries once per key family; on zone change trim pool entries beyond a cap (for example 8 per key) and dispose them.
- **Files:** `src/render/gameRenderer.ts`, `src/render/vfx.ts`.
- **Verify:** Browser (to capture): enter and leave a dungeon five times; `renderer.info.memory.textures` returns to the same value and the network panel shows one request for the floor texture. Node: a fake-scene test that `acquire` beyond the cap followed by a trim disposes the surplus geometries.
- **Effort:** S. **Priority:** 3.

### T022: Systems and render helpers without tests
- **Area:** Test gaps (`tests/`)
- **Problem:** Files in `src/systems`, `src/world`, `src/core`, `src/render`, `src/audio` that no test imports (checked by import path across `tests/` and `scripts/sim`): `src/world/instanceObjectives.ts` (492 lines), `src/systems/minesAI.ts` (210), `src/world/features.ts` (167), `src/core/input.ts` (203), `src/systems/impact.ts` (97), `src/systems/targeting.ts` (53), `src/render/assets.ts` (306), `src/render/animator.ts` (84), `src/render/decals.ts` (125), `src/render/choirLinks.ts` (109), `src/audio/music.ts` (99), `src/audio/lootSounds.ts`, `src/audio/uiSounds.ts`, `src/audio/wind.ts`; plus `src/core/account.ts` (T009) and `src/game.ts` (2,768 lines) / `gameRenderer.ts` (1,798) as a whole. Some are covered indirectly by region tests, but regressions in burrowers, instance objectives and targeting would not fail anything named after them.
- **Change:** Add focused tests in priority order: `targeting` (nearest/livingInCircle with burrowed and dead entities), `minesAI` (burrow, emerge, cooldown), `instanceObjectives` (each objective type completes and fails), `input` (key rebinding, chord, blur resets), `impact`, `animator` (clip selection, crossfade with a stub mixer), `music` (scene change picks the track; boss override; duck).
- **Files:** `tests/targeting.test.ts`, `tests/minesAI.test.ts`, `tests/instanceObjectives.test.ts`, `tests/input.test.ts`, `tests/impact.test.ts`, `tests/animator.test.ts`, `tests/music.test.ts`.
- **Verify:** `npx vitest run` (now 76 files / 957 tests) grows by at least 7 files with the suite still green; with `@vitest/coverage-v8` added as a devDependency, `npx vitest run --coverage --coverage.include='src/systems/**'` shows each listed system above 60 % statements (the listed files have no direct tests now).
- **Effort:** M. **Priority:** 2.

### T023: No pull-request CI; slow test start-up
- **Area:** Code health / tooling (`.github/workflows/`, `vite.config.ts`)
- **Problem:** The only workflow, `release.yml`, runs on release notes, tags and manual dispatch; it runs `npx vitest run` and `npm run build`, but nothing checks pull requests or pushes, and `npm run assets:check` (manifest vs files) runs nowhere in CI. `npx vitest run` takes 29.3 s with 53 % in "import": 272 modules evaluated 947 times (37 s summed), mostly the eager zod parse of game data (`src/data/db.ts`, `loot/db.ts`) per test file. Vitest's own hint is 5.5 s saved by `isolate: false`.
- **Change:** Add `.github/workflows/ci.yml` on `pull_request` and `push` to main: `npm ci`, `npx tsc --noEmit -p .`, `npx vitest run`, `npm run assets:check`, `npm run build`. Try `test: { isolate: false }` and fix any test that relies on module-level state (`i18n` language, `enemyAI` shared `cur`, the item namer); alternatively lazy-parse the data maps on first access.
- **Files:** `.github/workflows/ci.yml`, `vite.config.ts`, any test found to depend on isolation.
- **Verify:** The workflow is green on a PR; `time npx vitest run` is at most 24 s (now 29.3 s) with all 957 tests still passing; removing a file referenced in `assets/manifest.json` makes the `assets:check` step fail.
- **Effort:** S. **Priority:** 2.

### T024: TypeScript strictness gaps and dead code
- **Area:** Code health (`tsconfig.json`)
- **Problem:** `strict` and `noUncheckedIndexedAccess` are on, but `noUnusedLocals`/`noUnusedParameters` are not: `tsc --noUnusedLocals --noUnusedParameters` reports 21 errors (4 in `tests/`, 3 in `scripts/`), for example unused `STATUS_DEFS`, `revealedFraction` and `PYLONS` in `src/game.ts:56,61,120`, `WEST_MACHINERY` in `src/data/quests/theCore.ts:37`, `unproject` in `src/ui/minimap.ts:238`, `ACTIONS` in `settingsPanel.ts:11`, `panelStack` and `menu` in `touchControls.ts:15,132`, `GlyphState` in `endgame/matrix.ts:43`, `PoiDef` in `interactables.ts:37`. Nine exports are referenced nowhere in `src/`, `tests/`, `scripts/` or `tools/`: `RECIPE_GROUPS`, `MATERIAL_IDS` (`data/endgame/crafting.ts`), `WORLD_BOSS_DEFS`, `DEEP_MINES_INSTANCES`, `hasAffix` (`systems/elites.ts`), `learnedRecipes` (`systems/endgame/crafting.ts`), `freeCells` (`systems/loot/inventory.ts`), `isBurrowed` (`systems/minesAI.ts`), `hapticsEnabled` (`ui/haptics.ts`). `exactOptionalPropertyTypes` would give 56 errors (27 in `enemyAI.ts`); there are 10 `as unknown as` casts and roughly 190 non-null assertions (regex count).
- **Change:** Delete the unused locals and the nine dead exports (check `WORLD_BOSS_DEFS`/`DEEP_MINES_INSTANCES` against the docs first: they may be data awaiting wiring), then turn on `noUnusedLocals` and `noUnusedParameters` in `tsconfig.json`. Plan `exactOptionalPropertyTypes` as a follow-up per file (start with `enemyAI.ts`). Replace the `arena as unknown as Parameters<typeof caveGrid>[0]` casts (`arena.ts:47`, `decals.ts:54`, `gameRenderer.ts:136`) with a shared `CaveSource` type.
- **Files:** the files listed, `tsconfig.json`.
- **Verify:** `npx tsc --noEmit -p . --noUnusedLocals --noUnusedParameters 2>&1 | grep -c "error TS"` goes from 21 to 0, then `npx tsc --noEmit -p .` passes with the flags in `tsconfig.json`; `npx vitest run` green.
- **Effort:** S. **Priority:** 3.

### T025: Determinism and shared mutable state
- **Area:** Code health (`src/game.ts:1012`, `src/systems/enemyAI.ts:270`, UI storage helpers, `game.ts` size)
- **Problem:** `src/core/rng.ts:6` says gameplay never uses `Math.random`, but `enterZone` places raised minions with `Math.random() * Math.PI * 2` (`game.ts:1012`), so a seeded replay differs after a zone change. `enemyAI.ts:270` keeps a module-level `cur = { world: null as unknown as World, ctx: ..., ai: ... }` that every AI helper reads: it is non-reentrant and hides data flow (a nested call such as a boss script inside a hit callback would clobber it). Seven UI files each repeat the same `try { localStorage... } catch {}` pair (`characterPanel`, `characterSelect`, `panelHeader`, `onboarding`, `questUi`, `inventoryPanel`, `hud`). `game.ts` is 2,768 lines with 118 imports, and 43 silent `catch {` blocks exist across `src/` versus 4 that bind the error.
- **Change:** Use `this.ctx.rng` (or a forked stream) for the minion angle. Pass `cur` fields as arguments or make a small context object per call, and assert non-reentrancy in dev. Add `src/core/localPrefs.ts` with `getPref(key)`/`setPref(key, value)` and use it in the seven files. Split `Game` along its existing seams (save/load, inventory actions, quest UI wiring, audio) as a later step, and replace silent catches that can hide logic errors with a dev-only `console.warn`.
- **Files:** `src/game.ts`, `src/systems/enemyAI.ts`, `src/core/localPrefs.ts`, the seven UI files.
- **Verify:** `grep -rn "Math.random" src/game.ts src/systems src/world` returns nothing (now 1 line); a determinism test runs a 600-tick sim with a zone change twice with the same seed and asserts identical `ctx.rng` state and minion positions; `grep -rln "localStorage" src/ui | wc -l` falls from 7 to 1.
- **Effort:** S. **Priority:** 3.

---

## Appendix: benchmark sources (node/tsx, this container)

Save under `scripts/perf/` when T019 is done; paths are relative to that folder. All use real modules, no mocks of game code.

**Sim tick per system (T001, T019).** Spawns a zone's props, 120 enemies around the first hub and runs 600 ticks with per-system timing:

```ts
import { ZONES } from '../../src/data/zones';
import { createZoneRuntime } from '../../src/world/zone';
import { spawnArenaProps } from '../../src/world/arena';
import { spawnEnemy, spawnPlayer } from '../../src/world/spawn';
import { World } from '../../src/core/ecs';
import { collisionSystem, spatialSystem } from '../../src/systems/collision';
import { enemyAISystem } from '../../src/systems/enemyAI';
import { navigationSystem } from '../../src/systems/navigation';
import { statusSystem } from '../../src/systems/status';
import { movementSystem } from '../../src/systems/movement';
import { projectileSystem } from '../../src/systems/projectiles';
import { skillSystem } from '../../src/systems/skills';
import { deathSystem } from '../../src/systems/death';
import { makeCtx } from '../../tests/helpers';
const id = `zone.${process.argv[2] ?? 'hydroponic_vaults'}`;
const z = ZONES.find((z) => z.id === id)!;
const w = new World(); spawnArenaProps(w, z);
const ctx = makeCtx(); ctx.zone = createZoneRuntime(z); ctx.worldHalfSize = z.halfSize;
const hub = z.hubs[0]!; spawnPlayer(w, 'bastion', hub.x, hub.z);
const defs = ['infected_colonist', 'security_drone', 'bloater', 'spore_hound'];
for (let i = 0; i < 120; i++) spawnEnemy(w, defs[i % 4]!, hub.x + Math.cos(i * 2.4) * (8 + (i % 30)), hub.z + Math.sin(i * 2.4) * (8 + (i % 30)), { level: 10 });
const systems: [string, any][] = [['spatial', spatialSystem], ['skills', skillSystem], ['navigation', navigationSystem], ['enemyAI', enemyAISystem], ['status', statusSystem], ['movement', movementSystem], ['collision', collisionSystem], ['projectiles', projectileSystem], ['death', deathSystem]];
const t: Record<string, number> = Object.fromEntries(systems.map(([n]) => [n, 0]));
const N = 600;
for (let k = 0; k < N + 60; k++) {
  for (const [n, f] of systems) { const s = performance.now(); f(w, 1 / 60, ctx); if (k >= 60) t[n]! += performance.now() - s; }
  w.flushDestroyed(); ctx.tick++; ctx.time += 1 / 60;
}
let tot = 0; for (const [n] of systems) { tot += t[n]!; console.log(n.padEnd(12), (t[n]! / N).toFixed(3), 'ms/tick'); }
console.log('total', (tot / N).toFixed(3), 'ms/tick; entities', w.entityCount);
```

Result in this container: spatial 3.353, skills 0.028, navigation 0.038, enemyAI 0.194, status 0.106, movement 0.035, collision 3.925, projectiles 0.005, death 0.006, total 7.691 ms/tick, 3,870 entities. (Navigation is idle because nothing is aggroed; with enemies hunting, `buildNav` adds 0.5-1.2 ms every 0.3 s.)

**Ground splat (T004).** For each zone with `ground.base`, time `buildGroundSplat(g.patches, z.halfSize * 2, 1024, 'seed', Math.min(g.layers.length, 6))` with `performance.now()`. Results: Cinder Flats 1,745 ms, Refinery 2,017, Hydroponic 3,669, Deep Mines 2,745, The Core 2,459 (2,910 on a second run); the same call with `[]` patches at 1024 / 512 / 256 px for Deep Mines: 2,378 / 609 / 158 ms.

**LOD duplicate textures (T002).** For each manifest asset with a `.glb` file: read the GLB JSON chunk (`b.readUInt32LE(12)` is its length; the binary chunk starts at `20 + len + 8`), slice each `images[]` bufferView, md5 it, and compare each LOD's image hashes with LOD0's. Results: 92 models, 144 LOD files (21,838,344 bytes), image bytes in LODs identical to LOD0: 18,751,212; 748 images decoded at boot, 250 unique; 189 images are 1024x1024, 84 are 512x512.

**Per-zone asset sets (T003).** For each zone: the union of `props[].asset` and, via `zone.packs[].template` -> `PACK_TEMPLATES[].members[].enemy` -> `ENEMY_DEFS.get(id).assetId`, summed with the sizes of `file` + `lods` from the manifest: Cinder Flats 20 assets 11.9 MB, Refinery 27 / 16.5 MB, Hydroponic 22 / 12.1 MB, Deep Mines 27 / 16.2 MB, The Core 40 / 17.1 MB (of 48.2 MB total; class models, bosses and instance-only enemies not counted).

**Spatial rebuild per tick (T001).** `spawnArenaProps` for Hydroponic, then `spatialSystem` 500 times: 2.24 ms per rebuild for 3,419 colliders, all static; `collisionSystem` including its own rebuild 2.22 ms.

**ECS query (T020).** 800 entities with components A, B (all), C (half), D (every tenth): `query(A,B,C)` 19.9 us, `query(A,B)` 26.3 us, `query(A,B).filter(e => !has(e, D))` 39.8 us, create + 3 components + destroy 0.4 us, destroy with 70 stores 0.8 us. Render-sync skeleton (query `Transform, Renderable`, a `Set`, two `req`, one `has`, a distance cull) over 2,800 entities: 0.53 ms/frame.

**Save size (T010).** 100 generated items (`generateItem`) in the grid, five zones with a 6,000-character fog string: `serializeSave` 112,042 characters; compact `JSON.stringify(SaveDataSchema.parse(save))` 69,364 (-38 %); `serializeSave` 0.59 ms, `parseSave` 0.49 ms.

**Bundle attribution (T005).** `dist/assets/index-*.js.map` decoded (VLQ `mappings`), bytes of generated code credited to each source: three 521 kB, `node_modules/zod/v4` 94 kB, `src/data/zones` 77 kB, `src/game.ts` 59 kB, `src/render/gameRenderer.ts` 36 kB, `src/data/skillTree` 35 kB, `src/data/quests` 35 kB, `src/data/enemies.ts` 33 kB. About 265 kB of JSON is inlined (`en.json` 170,834 characters minified, `manifest.json` 93,387 minified); the sourcemap credits unmapped bytes to the neighbouring source, so per-file attribution near JSON imports is approximate (the 147 kB first credited to `loot/db.ts` was such an artefact and is not listed).
