# Decisions log

Short records of important technical and design decisions, newest last.

### 2026-10-02 — Player-facing language is English
The brief (§11) asked for Swedish; the owner later asked for the game to be in **English**.
All text lives in `src/data/lang/en.json` and goes through `t()`, so Swedish (`sv.json`) or other
languages can be added later without code changes. Missing keys fall back to English.

### 2026-10-02 — Project lives in `ashfall/` inside the repository
The repository already contains other projects, so Ashfall is self-contained in its own folder.

### 2026-10-02 — Small hand-written ECS instead of a library
Entities are numbers, components are plain data in per-type Maps, systems are functions run in a fixed
order. It is tiny, fully typed and easy to debug. If profiling with ~100 enemies shows Map lookups as a
bottleneck, stores can move to typed arrays (SoA) behind the same API.

### 2026-10-02 — Fixed 60 Hz logic tick with render interpolation
Makes combat timing, AI and seeded randomness independent of frame rate, so a seed + inputs reproduce
a bug. `GameLoop.timeScale` will drive hit-stop in Phase 1.

### 2026-10-02 — sfc32 + cyrb128 for seeded randomness
Fast, small, good statistical quality, and its 128-bit state is trivially saved and restored.
`rng.fork(label)` gives each subsystem (loot, dungeons) its own stream so adding a roll in one place
doesn't reshuffle another.

### 2026-10-02 — Asset manifest is the single source of truth for 3D assets
`assets/manifest.json` (schema in `src/data/assetManifest.ts`) lists every asset id with its Meshy prompt,
status, task ids and a placeholder shape. The game resolves asset ids through `AssetLibrary`, which
builds the placeholder until the asset is `optimized`. The Meshy pipeline (Phase 2) updates the same file.

### 2026-10-02 — Camera: 55° pitch, 45° yaw, 38° FOV
Near-isometric diagonal view as in the brief. WASD is camera-relative (W = up the screen).

### 2026-10-02 — Collision deferred to Phase 1
Phase 0 only needs a capsule on a plane. Simple circle-vs-circle/AABB collision comes with combat,
when enemies need it too; Rapier will only be added if the simple approach falls short.

### 2026-10-02 — Combat events decouple logic from presentation
Systems push `GameEvent`s (damage, hit-stop, shake, telegraph, vfx…) to `ctx.events`; the renderer,
damage numbers and HUD drain them once per frame. Logic stays headless-testable and never waits on visuals.

### 2026-10-02 — Hit-stop freezes simulation time, not rendering
`GameLoop.timeScale` drops to 0 for the hit-stop duration (real time). The world freezes for 45–90 ms while
effects, camera shake and UI keep animating, which reads as impact without input lag.

### 2026-10-02 — Enemy attacks are checked when they land, not when they start
Telegraphs show the danger zone; the hit test happens at the end of the wind-up. Stepping out of the
cone/line or dodging (i-frames) avoids the hit, so player skill matters. Drone aim locks at wind-up start.

### 2026-10-02 — DoTs snapshot outgoing damage, mitigate per tick
Matches the damage model doc: buffs on the attacker apply when the DoT is applied; target-side changes
(Vulnerable, resistances) apply on each 0.5 s tick.

### 2026-10-02 — Simple circle collision + spatial hash instead of Rapier
Circle-vs-circle separation with mass weighting covers crowds, the player and props, and the 4 m grid
keeps queries cheap with 100+ enemies. Rapier stays an option if dungeons need more.

### 2026-10-02 — Starter numbers
Bastion: 220 life, 60 armor, 14 weapon damage, 20 Strength. Enemies 30–70 life, 12–14 damage.
First pass only; tune after playtesting.
