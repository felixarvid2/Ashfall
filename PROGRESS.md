# Ashfall — Progress

> Read this first at the start of every session. Full design brief: [docs/design-brief.md](docs/design-brief.md).

## Current phase

**Phase 2 – Meshy pipeline: ✅ done, except the 60 FPS check** (needs a measurement on real hardware).
Next up: **Phase 3 – Loot and progression** (plan to be approved first).

## Done

### Phase 0 – Foundation
- Project setup: TypeScript (strict) + Vite + Three.js + Zod + Vitest, folder layout per brief §8.3.
- `src/core/loop.ts` — fixed-timestep loop (60 Hz logic, interpolated rendering, frame clamp, `timeScale` ready for hit-stop).
- `src/core/ecs.ts` — minimal ECS (`World`, components, ordered `Scheduler`, deferred destroy).
- `src/core/input.ts` — keyboard via data-driven key bindings, mouse (NDC + buttons), wheel.
- `src/core/save.ts` — versioned saves validated with Zod, migration chain, `localStorage` store, JSON export/import.
- `src/core/rng.ts` — seeded sfc32 RNG with `fork()`, weighted picks and save/restore of state.
- Movement: WASD (camera-relative) **or** click-to-move, selectable in the debug panel (persisted in settings).
- Rendering: near-isometric follow camera (55° pitch, 45° yaw, smooth follow, wheel zoom), dark lighting with fog,
  emergency lights, Lumen glow, player light radius, shadows, falling ash particles, instanced debris (700 rocks, 1 draw call).
- Asset placeholders driven by `assets/manifest.json`: every placeholder is tied to an asset id
  (`char.bastion`, `prop.cargo_crate`, …) so Meshy models can replace them automatically in Phase 2.
- UI: English text via `src/data/lang/en.json` + `t()`; HUD hint, toasts, FPS meter, debug panel (F3 / §).
- Dev-mode data validation at startup (`src/data/validate.ts`).
- 44 unit tests (RNG, ECS, saves + migrations, i18n, movement, click-to-move, loop, data, settings).

### Phase 1 – Core combat
- **Bastion** with the **Heat** resource: built by Hydraulic Strike hits and by taking damage, decays out of combat,
  and **overheats** (self-damage) if kept at 100 for more than 1.5 s.
- **4 skills** (data in `src/data/skills/bastion.ts`): Hydraulic Strike (basic, arc, ignites above 70 Heat),
  Seismic Shock (core, 35 Heat, knockback + Vulnerable), Rocket Leap (leap, stun on landing),
  Energy Shield (barrier = 35 % life, cleanses stuns/slows). Plus **dodge** (Space, i-frames) and **stim packs** (Q).
- Skill casting with wind-up/recovery, **input buffering**, cooldowns, resource costs, cursor aiming.
- **3 enemy types with distinct AI** (`src/data/enemies.ts`): Infected Colonist (rusher, telegraphed claw),
  Security Drone (hovering ranged, keeps distance, strafes, telegraphed bolts),
  Spore Carrier (support: hides behind the pack, shields allies, leaves a poison cloud on death).
  Group aggro, wandering when idle.
- **Damage model** with additive/multiplicative buckets, crits, armor and resistances — see
  [docs/damage-formula.md](docs/damage-formula.md).
- **Statuses**: Burning, Poisoned (stacking), Chilled, Frozen, Stunned, Vulnerable, Barrier (+ DoT ticks).
  Chilled/Frozen are implemented but nothing applies them yet (Spectre / cold enemies later).
- **Combat feel**: hit-stop, screen shake (toggle in debug panel), floating damage numbers (crits, DoTs,
  damage taken, absorbed, heals), hit flashes, status tints, sparks, slash arcs, shockwaves, telegraph decals
  that fill up until the attack lands, barrier bubbles, stun rings, enemies knocked back and toppling over.
- **Collision**: circle colliders with a spatial hash; crowds push each other; crates and posts block movement;
  drones fly over ground units.
- **Test arena waves** (`src/data/encounters.ts`): 5 waves then endless with +15 % life per wave.
- **HUD**: life orb (with barrier), Heat orb (pulses when overheating), action bar with cooldown sweeps and
  tooltips, wave tracker, target frame with statuses, death screen with respawn (R / click).
- Debug panel: next wave, kill all, spawn 100 enemies, god mode, screen shake.
- 103 unit tests (damage formula, statuses, DoTs, heat/overheat, every skill, dodge/potion, buffering,
  all three AIs, collision, spatial hash, waves).

### Phase 2 – Meshy pipeline and real assets
- `npm run meshy -- <command>` (scripts/meshy): `status`, `preview`, `approve-preview`, `reject`, `refine`,
  `rig`, `approve`, `optimize`, `sheet`. Manifest-driven, asks before batches over **800 credits**,
  `--dry-run`, saves every task id immediately (crash-safe, resumable), honours rate limits, downloads
  results at once (Meshy deletes them after 3 days).
- Two generation paths: text-to-3D (preview → refine) and, for creatures, concept image → image-to-3D.
- Rigging + library animations for humanoids (Bastion: idle/run/attack/cast/hit/death; colonist and spore
  carrier: idle/walk/attack-or-cast/hit/death). The drone is animated procedurally (hover bob).
- Optimizer (gltf-transform + meshoptimizer): polycount budget, scale/pivot normalisation, clips renamed to
  game states, WebP textures at 1024 px, meshopt compression, LOD1/LOD2 for props.
- **14 assets in game** (6.3 MB total): Bastion, 3 enemies, and a Cinder Flats kit (crate, emergency light,
  Lumen growth, debris, crashed lander, wall segment, pipe, barricade, terminal, fuel tank). The test arena
  now uses them, with multi-circle colliders for long props.
- Game: GLB loading with placeholder fallback, `THREE.LOD` for props, character animator (cross-fades,
  attack clips fitted to skill timings, hit reactions, death clips), loading screen.
- Post-processing: bloom, vignette and a cold desaturated grade; graphics presets Low/Medium/High (F3).
- Dev-only **asset viewer** at `/asset-viewer`: thumbnails, triangles, file size, 3D view of every version,
  clip playback, approve/reject.
- Credits used: **615** of 3100 (2485 left). See the per-asset numbers with `npm run meshy -- status`.

## How to run

```bash
cd ashfall
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # typecheck + production build into dist/
```

Meshy pipeline (needs `MESHY_API_KEY` in `ashfall/.env`): `npm run meshy -- status`.
Behind a proxy (cloud sessions) prefix with `NODE_USE_ENV_PROXY=1`.

Controls: **WASD** move · **LMB** Hydraulic Strike · **RMB** Seismic Shock · **1** Rocket Leap ·
**2** Energy Shield · **Space** dodge · **Q** stim pack · **mouse wheel** zoom · **F3** debug panel ·
**F5/F9** quick save/load · **R** respawn. Skills aim at the cursor.
Click-to-move (debug panel): left-click ground to walk, left-click an enemy to attack it,
Shift + left-click to attack in place.

## What to test (Phase 2)
1. `npm run dev` — the arena should show the real models: Bastion, colonists, drones, spore carriers and
   the Cinder Flats props. Characters should animate (idle, run, attack, hit, death).
2. **FPS:** F3 → "Spawn 100" and read the FPS meter (target 60 on a laptop with integrated graphics).
   If it is low, try Graphics → Medium/Low and tell me the numbers.
3. Open http://localhost:5173/asset-viewer, look through the models and approve or reject them.
4. Tell me if anything faces the wrong way, looks too big/small, or the lighting is too dark/bright.

## What to test (Phase 1)
1. Fight the waves. Hold LMB to swing, build Heat, spend it on RMB (Seismic Shock) when surrounded.
2. Watch the red telegraphs: step out of a colonist's cone or a drone's line before it fills, or dodge (Space).
3. Kill the Spore Carrier first — or avoid its green death cloud.
4. Ride Heat at 100 and notice the overheat warning and self-damage.
5. Rocket Leap (1) into a pack, then Energy Shield (2) when low. Use stim packs (Q).
6. Die once and respawn (R).
7. Debug panel (F3) → "Spawn 100" and check the FPS meter on your machine (target 60 FPS with ~100 enemies).
8. Try click-to-move mode too, and tell me which feels better.
9. **Most important:** is it fun? Too easy/hard, too slow/fast, too much/little shake?

## Known issues / limitations
- No sound yet (Howler.js audio system is planned for Phase 8; loot sounds come with Phase 3).
- Enemies have no pathfinding around crates (they slide along them via collision); fine for the open arena,
  needs a nav grid when dungeons arrive (Phase 5).
- **60 FPS not verified**: only measured in a headless CPU-rendered browser (4–6 FPS there — not
  representative). Skinned enemies are not instanced (one draw call each + shadows); if 100 enemies is too
  slow, next steps are GPU-instanced crowd animation (vertex-baked) and shadow LOD.
- Rigged models keep only the base-colour texture (Meshy's rig/animation output drops the PBR maps);
  static props keep full PBR.
- Textures are WebP, not KTX2 (no `toktx` binary here) — see docs/decisions.md.
- The drone was asked for "no rotors" but has small ones; acceptable for now.
- Raw Meshy downloads (`assets/source/**/*.glb`) are not in git; re-download within 3 days or regenerate.
- Saves store position only; health/heat/waves reset on load (fine until progression exists in Phase 3).
- Settings UI (key rebinding, text size) is not built yet; settings exist in data and are persisted.
- Skill icons are text labels until icons are generated (brief §9.5).

## Next steps
- Your playtest feedback on Phase 1 → tune numbers in `src/data/` (all values are data-driven).
- FPS measurement on real hardware (closes Phase 2).
- Phase 3 – Loot and progression: rarities, affixes, aspects, item power, drop tables, inventory, levels,
  Bastion skill tree, stats/damage model integration (plan to be approved first).
