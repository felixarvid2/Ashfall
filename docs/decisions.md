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

### 2026-10-02 — Meshy budget prompt threshold: 800 credits
The owner raised the confirmation threshold from the brief's 200 to **800 credits** per batch.
Stored as `DEFAULT_BUDGET_CREDITS` in `scripts/meshy/config.ts`; the design brief was updated to match.

### 2026-10-02 — Meshy model and texture settings
Meshy 7.1 (`ai_model: "latest"`) for all 3D tasks, with automatic fallback to `meshy-6` if the account
lacks entitlement. `target_polycount` is set per asset at generation, so Meshy already delivers close to
the budget; our optimizer only trims further and builds LODs. PBR textures at 2K with baked lighting
removed; the optimizer downsizes to 1024 px WebP for the game.

### 2026-10-02 — Concept image → image-to-3D for creatures
Text-to-3D kept turning "infected colonist with fungal growth" and "bloated spore carrier" into plain
humans with arms down (twice). For those, the cheap preview is a concept image (text-to-image,
`nano-banana-2`, 6 credits, T-pose) that the owner approves, and the refine step is image-to-3D with
textures (30 credits). Manifest field `source: "image"` + `conceptPrompt`.

### 2026-10-02 — WebP instead of KTX2 textures
The brief asks for KTX2/Basis. That needs the KTX-Software `toktx` binary, which isn't available in this
environment. WebP (via sharp) gives most of the download-size win; GPU memory is higher than KTX2.
Switching later is a one-line change in `scripts/meshy/optimize.ts` once `toktx` is installed.

### 2026-10-02 — Simplification across UV seams
Meshy meshes have many small UV islands, which stop meshoptimizer's normal simplifier. The optimizer
uses meshoptimizer's "Permissive" mode and falls back to sloppy simplification for aggressive LOD
targets, then recomputes smooth normals.

### 2026-10-02 — LODs for static props only
Props get LOD1 (50 %) and LOD2 (20 %) files used through `THREE.LOD`. Skinned characters use a single
level: their polycount is already low (4–12k) and swapping skinned LODs mid-animation is complex.

### 2026-10-02 — Raw Meshy downloads are not committed
`assets/source/**/*.glb` is git-ignored (tens of MB). Thumbnails, contact sheets, the manifest (with all
task ids) and the optimized `public/assets` files are committed. Meshy keeps task outputs for 3 days, so
raw files can be re-downloaded in that window; after that, regenerate from the manifest prompts.

### 2026-10-02 — Phase 3 split into 3a (loot core) and 3b (skill tree, aspects, uniques)
Legendary, unique and mythic rarities exist in data but are disabled (`enabled: false`) until aspects and
unique effects are implemented in 3b, so no item drops with a promised power it can't deliver.

### 2026-10-02 — Diablo 4-style inventory (one cell per item)
Approved by the owner. Simpler UI, no inventory Tetris; 40 cells.

### 2026-10-02 — Separate loot RNG stream
`ctx.loot.rng` is forked from the game seed. Combat crit rolls no longer shift which items drop, and the
loot stream's state is saved so a loaded game continues the same sequence.

### 2026-10-02 — Rewards are queued, not handled inside `kill()`
`kill()` pushes a reward request (table, level, position); `rewardSystem` turns it into XP and ground loot.
Keeps combat code free of loot logic and lets wave caches reuse the same path.

### 2026-10-02 — Item icons from Meshy text-to-image
18 icons with `nano-banana` (3 credits each, transparent background), trimmed and resized to 128 px WebP
by `npm run meshy -- icons`. Consistent painted style via a shared icon prompt.

### 2026-10-02 — Loot sounds are synthesised (WebAudio)
Each rarity has its own procedural sound (brief §5.6) until the Howler.js audio system and recorded/
generated sound files arrive in Phase 8.

### 2026-10-02 — One effect vocabulary for tree nodes, aspects and uniques
`src/data/effects.ts` defines four effect kinds (stat, damage, skillMod, overheat). Skills are recompiled
from base data + rank + all effects whenever gear or the tree changes (`user.compiled`), so combat code
reads a finished skill definition and never needs to know where a bonus came from.

### 2026-10-02 — Skill tree replaces the fixed action bar
New characters know only Hydraulic Strike; every other skill is learned in the tree (D4 style). Old saves
get their skill points back (`level − 1`) via the v2 → v3 migration.

### 2026-10-02 — Skill icons are full-bleed painted emblems
Skill icons use their own prompt (no background removal, 8 % inset crop to drop the generator's rounded
frame) so they read as abilities, not items. 10 icons, 30 credits.

### 2026-10-02 — Balance simulator uses the real systems
`scripts/sim` runs the actual skill/status/hazard/resource systems headless against a dummy instead of a
separate spreadsheet model, so it can't drift from the game.

### 2026-10-02 — Phase 4 plan approved: 4a framework + Spectre, 4b Xenomant, 4c balance
Owner approved: three save slots (one character each), Spectre first, Xenomant minions reuse the killed
enemy's own model with a Lumen glow (no extra credits), skills are not locked to weapon types.

### 2026-10-02 — Enemies choose targets instead of always chasing the player
`enemyAI` builds a candidate list once per tick (living, visible player-team entities). A decoy's taunt
radius wins; otherwise the nearest target. Stealthed players are skipped. This also covers Xenomant
minions in 4b without more AI code.

### 2026-10-02 — Player projectiles compute damage on impact
Enemy bolts keep their fire-time damage, but skill projectiles carry the skill id and call the normal
hit path when they connect, so crits, conditions (Marked, Vulnerable), per-skill bonuses and statuses
all work the same as for melee skills.

### 2026-10-02 — Resource rules are class data
Focus and Biomass are not separate systems: the class resource config gained `onCrit`, `onAvoid` and
`onNearbyDeath`, next to Heat's `gainPerLifePercentLost` and `overheat`.

### 2026-10-02 — Character select shown before the game loop starts
The world is built behind the menu; choosing or creating a character replaces the placeholder player
entity and starts the loop. "Character select" in the debug panel saves and reloads the page.

### 2026-10-02 — Minions are the enemies' own bodies
Raise Corpse re-teams the dead enemy entity (removes EnemyAI/WaveMember, adds MinionAI and Summon,
heals it, adds a Lumen glow) instead of spawning a new model — no extra Meshy credits, and the
renderer, animations and collider are reused. Minion hits copy the owner's offence every tick.

### 2026-10-02 — Corpses linger 20 s
Enemy `Dead` entities carry `corpse: true` and stay 20 s (sinking in the last second) so corpse skills
have material; skills mark a corpse used and it sinks away at once.

### 2026-10-02 — Poison stacks to 10 and keeps the strongest stacks
With a cap of 5, rapid weak stacks (Spore Dart) pushed out stronger short ones (Spore Burst clouds), so
cloud damage was mostly lost. A full stack now replaces its weakest instance (damage left), never a
stronger one.

### 2026-10-02 — Lower toxic resistance on Cinder Flats enemies
Every act-1 enemy is Lumen-infected; 30–50 % toxic resistance made Xenomant (mostly toxic) far weaker in
the first zone. Colonist 30 → 10 %, Spore Carrier 50 → 25 %. The simulator dummy is now neutral
(armor 30, no resistances) so class comparisons are fair.

### 2026-10-02 — One Meshy CLI run at a time
A background icon job saved its stale copy of the manifest after models were approved, reverting them.
The CLI now takes `assets/.manifest.lock` (pid; stale locks from crashed runs are taken over).

### 2026-10-02 — Balance by bot playthroughs, not only DPS
A training dummy cannot show survivability, chasing or ranged pressure. `npm run play` runs the real
waves with a deliberately average bot; numbers are tuned so all nine builds reach level 10 in a
similar time band. The bot's limits (no pathfinding, 35 % dodges) are documented in docs/balance.md.

### 2026-10-03 — Instances live far outside the zone, not in a separate scene
Dungeons and bunkers are built at x ≈ 2000 in the same world. The open world keeps its state
(packs, quests, interactables) without unloading; leaving deletes everything in instance space. The
renderer swaps floor, fog and the lamp pool while inside.

### 2026-10-03 — Cinder Flats scaled 2.2× after measuring
The first layout took ~2 minutes to cross; §2.2 asks for 5–7. Positions are design coordinates × 2.2
(hubs, compounds, arenas and props keep their size). Save v6 scales stored positions and resets the
fog-of-war bitmap.

### 2026-10-03 — Account-wide progress in its own store
Echo Relics, Region Restoration and the stash are shared by all characters, so they live in
`ashfall.account` (localStorage), not in a character slot. Restoration skill points are granted per
character once (`progression.restorationGranted`).

### 2026-10-03 — Quests listen to signals, not to the event queue
Kills, interactions and objectives push small signals that the quest system consumes every tick, so
quest logic stays deterministic and testable without the presentation event queue.
