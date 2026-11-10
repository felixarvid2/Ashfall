# Round 4, group B (tech, performance and builds): status

Items B01-B20 of docs/improvements/round4.md. Decisions and the reasoning: docs/decisions.md, 2026-11-08 "Round 4 tech".

| Item | Status | What is there |
|---|---|---|
| B01 Animation LOD | done | `src/render/lod.ts` + `GameRenderer.sync`: mixers every frame within 22 m, 30 Hz to 40 m, 15 Hz beyond, none off screen; skipped time is kept. Synthetic crowd of 100 mixers (24 bones, 48 tracks): 0.685 to 0.318 ms per frame (-54 %), 46 of 100 mixers updated per frame. tests/renderLod.test.ts. No screenshot taken (no skinned model loads in the headless test renderer); the catch-up step means no pose is left behind. |
| B02 Shadow LOD | done | Only the nearest 10 enemies cast real shadows, the rest a blob disc; `renderer.lodStats` reports it; tests/crowdBudget.test.ts. |
| B03 Crowd perf budget | done | tests/crowdBudget.test.ts (in `npm run perf:quick`): 100 enemies in Hydroponic Vaults, sim 0.45 ms/tick and render prep 0.98 ms/frame here; budgets 3 ms and 4 ms. Render prep runs `GameRenderer.sync/render` against a GL-less renderer (tests/fakeGl.ts) with placeholder boxes, so it guards the CPU side of the loop, not skinning. |
| B04 Zone leak test | done | tests/zoneLeak.test.ts: ten round trips Cinder Flats / Vaults keep geometries, materials and textures flat. It found a real leak (ambient decals never freed), fixed in `src/render/decals.ts`. |
| B05 Bot 10-50 | done | `scripts/sim/stages.ts`, `playthrough({ stage, startLevel })`; `npm run balance:report` has the Level 10 to 50 section (4 regions x 4 classes). Level 1-10 bands unchanged. |
| B06 Fighting dummy | done | `simulate(build, s, seed, { fightBack: true })` and the Survivability table: deaths, time below 30 %, lowest life, damage per second. |
| B07 Save backups | done | `SaveStore` keeps 3 backups per slot, at least 5 min apart; Settings > Data lists them and restores one. tests/saveBackups.test.ts, tests/dataTabDom.test.ts. |
| B08 Import validation | done | `checkImport` (six readable reasons), a before/after confirm sheet, the replaced character kept as a backup. |
| B09 Offline web build | done | `tools/serviceWorkerPlugin.ts`, `src/core/pwa.ts`; only the plain web build (artifact, Android, Linux get no `sw.js`). Headless offline reload passes (`npm run e2e -- --scenario offline --url http://localhost:4173/`). |
| B10 Android back | done, Java untested | Back closes panels, else asks, second press quits (`AshfallBridge.quit`). The JS side is tested (tests/host.test.ts); the Java side was not compiled here (no Android SDK in this container), only checked for syntax. |
| B11 Linux ranges | done | `serve.js` `fileResponse`/`parseRange`: 206 + Content-Range, 416, Accept-Ranges; tests/linuxHost.test.ts runs it on real files. |
| B12 Linux window state | done | `linux/windowState.js`; shipped in the .deb. |
| B13 Zone loading progress | done | A progress bar and "Loading 3 / 12" on the zone change card (models loaded of models to load). Bytes are not shown: the runtime manifest carries no sizes (keeping it slim). tests/zoneProgress.test.ts; not run in the e2e zone scenario (it enters zones without the fade). |
| B14 Bundle trim | partial | `npm run bundle:analyze` (per-source bytes from the source maps). Nothing worth dropping: no unused export of any size, three.js is already tree-shaken (445 of 2100 kB). Main JS total 2318 kB (index 389, game-data 598, game-ui 250, lang 218, vendor-three 660, vendor-zod 93, panels 9-27 each), unchanged by this round except for its own additions. |
| B15 Asset prefetch | done | `src/world/prefetch.ts`: the zone behind a gate is fetched in idle time within 60 m (once, not while locked). tests/prefetch.test.ts. |
| B16 Graphics auto-detect | done | `src/render/autoGraphics.ts`: first run, 2 s after a 0.5 s warm-up, steps down only. tests/autoGraphics.test.ts. |
| B17 FPS limiter | done | Settings > Display: no limit / 30 / 60 / 120; `GameLoop.maxFps`. tests/fpsLimiter.test.ts. |
| B18 Error log | done | `src/core/errorLog.ts` (last 200 console warnings/errors, uncaught errors, rejections), Settings > Data > Copy log. |
| B19 Stale docs | done | PROGRESS.md known issues and current-phase list refreshed, `docs/decisions.md` has an index (`npm run docs:decisions`). |
| B20 Variant tests | done | tests/variantIntegrity.test.ts (ids, files, bones, clips). |

## Balance bot findings (docs/balance-report.md)

The new sections are in the report; the first run shows the Core (levels 40-50) is where the simple bot dies a lot, and that the L10-20 and
L20-30 stages take 14 to 22 game minutes for the whole region. Numbers are first guesses like the rest of the endgame, only a person can say if it feels right.
