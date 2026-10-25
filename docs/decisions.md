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
Each rarity has its own procedural sound (brief §5.6). They stay synthesised and now play through the
effects bus of the audio engine (2026-10-18), not through Howler.js.

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

### 2026-10-03 — Zones swap behind a fade instead of streaming
The brief asks for regions connected without loading screens. Each region is ~1 500 m across with
thousands of props, so both are never live at once: walking into the border gate at the end of Route 7
fades to black for 0.35 s, clears everything but the player and their minions, rebuilds the scene and
drops you at the paired gate. Each zone keeps its own runtime (map, teleporters, found objects,
set pieces); save v7 stores them per zone. Teleporting to another region's teleporter uses the same
swap.

### 2026-10-03 — Quests and NPCs carry a zone
Steps happen in their quest's zone unless a step says otherwise; steps elsewhere spawn nothing and their
map marker points at the border gate. NPCs only exist in their zone, and a reclaimed stronghold's people
appear through `requires` (a found point of interest).

### 2026-10-03 — District ids are prefixed `rd.`
Relics, logs and restoration points are stored by id across the account; prefixing every Refinery
District point of interest and pack avoids collisions with Cinder Flats (validated at startup).

### 2026-10-03 — Painted ground textures blended by a splat map
Cinder Flats' ground uses five tileable textures (`public/assets/textures/ground/`, generated outside
Meshy): ash everywhere, and scorched earth, Lumen-infested ground and military concrete painted in soft
patches with ragged edges. A zone's `ground` lists the patches (subzones plus one per fire, wreck and
growth); the renderer turns them into a 1024² splat map and blends in one shader. The base is sampled
twice at different scales and angles, mixed by slow noise, so its 9 m repeat doesn't show. Roads use
cracked asphalt with alpha-faded edges. The road ribbons used to face down and were culled, so roads had
never shown before this change. The Refinery District got its own set later: refinery grit, slag crust
(Slag Fields), half-cooled glowing crust around molten metal, steel plating (belts and hubs) and scorched
flagstones (Cathedral). Up to six overlays use two splat maps; each texture's scale, brightness and glow
(green Lumen, orange slag cracks) live in `GROUND_LOOK`, and the generated shader gets a program cache key
per layer set.
The Hydroponic Vaults use vault soil as the base, with fungal moss (Green Sea, Gamma), a root mat (Root
Network, around the Great Dome and the Mother Tree), frosted concrete (Seed Bank), dry silt (the dam basin)
overgrown asphalt roads, and worn lab tiles with drain grates in Lab 9.

### 2026-10-03 — Click-to-move is the default; phones get touch controls
The game plays like Diablo: left-click moves, attacks the enemy under the cursor, or walks to an item
or object and uses it (`InteractTarget`). Settings saved before this switch once to click mode
(`controlsVersion`); WASD stays available. Touch screens (`pointer: coarse`, or the first touch with
"auto") get a floating joystick, the action bar restyled as thumb buttons (attack and skills auto-aim at
the nearest enemy), a menu row, a tappable interact prompt, long-press as right-click in panels. Taps on the canvas are left-clicks, so everything a click does works by touch too.

### 2026-10-03 — Region 3 reuses every model
Meshy credits ran out, so the Hydroponic Vaults are built entirely from existing models: enemies are
earlier models with new tints, sizes and glows (the Warden is a Cargo Loader at ×2.1), fungal trees and
the Mother Tree are Lumen growths at huge scale with a prop `glow`, Root Nodes are spore nests, and the
glass domes are merged rib geometry drawn by the renderer. The plan lists which placeholders to replace
first once credits return.

### 2026-10-03 — The Mother Tree choice lives in the quest record
The plan called for save version 8 to store the burn-or-spare decision and Okafor's follower flag. The
finished-quest map already stores the chosen option (`quests.done['mq.mother_tree']` is `burn` or
`spare`), so no new save field or migration was needed; region 4 reads the follower flag from there.

### 2026-10-03 — Boss parts as separate targets
Armour plates and Root Nodes are ordinary targetable entities with life, tracked on the `Boss`
component. The boss's own `damageTaken` multiplier (applied in `applyDamage`) is 0.2 while any plate
stands and 0 while rooted; destroying the last node restores its speed and removes the vines. Everything
is destroyed on reset and on death.

### 2026-10-04 — Underground zones: a walkable grid instead of hand-built corridors
The Deep Mines are drawn on the same 1500 m square as the other regions, but only the tunnels (the zone's
roads), caverns and hubs are walkable. They are rasterised into a 2 m grid (`src/data/zones/caves.ts`)
shared by layout code, a collision step (`rockSystem`: slide back along the wall, spend bolts that hit rock)
and the renderer (black caps over the rock, rough walls along every edge, built once per zone).

### 2026-10-04 — Darkness is rendering plus a light test
Dark zones set very low ambient light and black fog; the player's existing point light is the lamp.
Enemies get two small glowing "eye" sprites, and their glow and rim fade with distance from the camera
focus, so they read as eyes in the dark. Floodlights (saved as found POIs) and flares feed the pooled point
lights. Gameplay asks `isLit(x, z)` (lamp radius, lit floodlights, burning flares) — Echoes take double
damage in light.

### 2026-10-04 — The governor is called Kade
The design document names the region 4 boss Governor Castellan; every earlier region's text already named
him Governor Kade, so the game keeps Kade.

### 2026-10-04 — The region 3 follower is read from the finished-quest record
NPCs can require a choice (`choice: { quest, option }`): Okafor follows you into the mines if you spared the
Mother Tree, Ruiz if you burned it. Each has their own side quest; no save change was needed.

### 2026-10-04 — Enemy pathfinding with a flow field around the player
While anything is chasing the player, the navigation system builds a 108 m flow field around them
(1.5 m cells, rebuilt every 0.3 s or when they cross a cell): rock from the underground grid and every
static collider (dungeon walls, crates, barricades, rubble, gates) block cells, and one Dijkstra pass from
the player's cell gives each reachable cell its walking distance. An enemy heading for the player walks
straight while the line is clear and otherwise aims a few cells down the field, so it goes round walls,
through doorways and along winding tunnels. One field serves every enemy (≈ 0.7 ms per build in the mines,
≈ 2.7 ms in the busiest open zones); beyond the window, or for targets other than the player (decoys,
minions), they still walk straight.


### 2026-10-04 — Enemy wayfinding: shared grid, fields per target, senses and tactics
The flow field grew into a wayfinding system (`src/systems/navigation.ts`, steering in `enemyAI.ts`):
- **One grid, several fields.** The 1.5 m grid round the player (now 120 m) is built once per rebuild;
  the player and up to two decoys or minions that enemies are chasing each get a Dijkstra field on it.
  Taunted enemies now find their way round walls to a decoy too.
- **Danger costs, walls block.** The player's burning ground and clouds, lit fuses, molten metal, vents
  and a tunnel about to cave in cost 90 per cell (a plain step is 10), water 6. Walking lines refuse to
  enter danger, so enemies go round a fire patch unless every way leads through it.
- **Sight is not walking.** Rock and colliders of radius ≥ 1 m block sight; crates block walking only.
- **Melee ring.** Melee attackers chasing the same target get evenly spaced places round it (in the
  order they stand, rotated to move them least); those that don't fit wait on an outer ring, places in
  rock are dropped (in a tunnel they come straight on), and an attacker takes its place before
  swinging. A place on the far side is reached by going round, not through, the target.
- **Gunners need a clear line.** No wind-up without line of sight; a gunner behind rock follows a lazy
  "firing spot" layer (cells in sight 5–11 m from the target) and turns its strafe back before walls.
- **Retreat by safety map.** Backing off (gunners, lungers, supports) follows the field ×−1.2 relaxed
  again, which leads away toward open ground instead of into a corner.
- **Senses.** Noticing needs a line of sight unless the target is within 3 m (Blind Hounds still hear);
  a "!" pops over the enemy and, a beat later, its pack. Losing the target (stealth) sends it to the
  last place it saw you, to look round and check two spots nearby, with a "?" over it, then it gives up.
- **A\*** (octile, danger-aware, string-pulled) takes enemies anywhere else: search spots, a Blind
  Hound's noise, a support's place behind its pack.
- **Crowd and stuck handling.** A light separation keeps packs from walking in single file; an enemy
  that meant to walk 2 m but moved under 0.45 m slides off sideways for 0.6 s.
- **Debug overlay** (debug panel, or `?nav`): flow arrows coloured by distance, danger in orange, walls
  in red, and a line from every hunting enemy to where it is heading, coloured by why.

Cost (Node, median): grid and field ≈ 1.2 ms in open zones, 0.8 ms in the mines, every 0.3 s while
something hunts; the sight, firing-spot and safety layers add 2–4 ms only when a gunner asks, once per
rebuild. The safety map's all-sources Dijkstra is the biggest part and the first thing to speed up if needed.

### 2026-10-05 — Painted sprite effects generated with FLUX.2 Turbo (deviation from brief §9.5)
At the owner's request the flat coloured effects (fire, spore clouds, explosions, hits) gained painted
sprites. Brief §9.5 asks for effects made with particle systems and shaders; this keeps that — every
effect is still a code-driven particle system — but the particles now carry 59 generated textures
instead of being plain discs and points.
- **Generation:** `npm run vfx:generate` (fal.ai `fal-ai/flux-2/turbo`, key `FAL_KEY` in the gitignored
  `.env`, never imported under `src/`). 992 × 992 keeps each image under one megapixel: $0.008 each.
  All 59 were usable on the first pass: **$0.472** in total (`scripts/vfx/ledger.json`); the script
  has a hard $1.50 budget.
- **Packing:** `npm run vfx:pack` turns black into transparency (brightest channel = alpha for colour
  sprites; white masks for smoke, dust, cracks and splats that the game tints), fades the edges and
  packs an 8 × 8 atlas of 256 px cells (`public/assets/vfx/atlas.webp`, ≈ 1 MB) plus
  `src/render/vfxAtlas.ts`. Processed 512 px copies are kept in `assets-src/vfx/` for repacking.
- **Rendering:** `src/render/particles.ts` — one instanced draw call; premultiplied colours with
  (one, one-minus-src-alpha) blending let additive fire and alpha-blended smoke share it. Caps
  900 / 2200 / 4000 particles for low / medium / high graphics (low also emits half as many).
- **Effects** (`src/render/spriteFx.ts`): burning ground and burning creatures, explosions with smoke,
  heat ring and a cooling scorch, flamethrower cones, fire vents, spore and toxic clouds, poison
  bubbles, frost bursts and chill glints, hit sparks, projectile trails, slashes, dust rings and
  ground cracks on slams, healing light, teleport swirls, trap and mark runes, spirit wisps, falling
  dust before cave-ins, smoke screens and embers off molten metal. Rings and telegraphs stay as exact
  shapes so attack areas keep reading clearly; under painted hazards the disc is faint and only the
  edge shows.

### 2026-10-05 — Painted art from FLUX.2 Turbo: icons, portraits, frames, decals, cards and maps
At the owner's request a second batch of art was generated (`scripts/art/catalog.ts`,
`npm run art:generate`, `npm run art:process`; budget cap $2.60, log in `scripts/art/ledger.json`).
209 generations cost **$1.712** in total (180 pictures plus re-rolls for items that came with
backgrounds, decals with stickers, one flagged prompt).
- **Item icons:** every base in three looks — worn (common, magic), military (rare, legendary) and
  masterwork (mythic) — plus one icon per unique. Rarity frames (one per rarity) sit over every slot.
  Tooltips show the icon; aspects show their emblem in tooltips and at the Technician.
- **Skill tree:** passive nodes show an emblem for the stat they raise.
- **Bosses:** a portrait for each of the 20 bosses, in the target frame and on an intro card when the
  boss engages.
- **World:** `mine_rock` is the Deep Mines base ground; 14 decals (stains, scorch, puddles, rubble,
  stripes, grates, manholes, tracks, moss, crystal shards, bones) are scattered per zone along roads,
  around hubs and across open ground; 16 more effect sprites joined the particle atlas (now 9 × 9):
  rune circles under big telegraphed attacks, the orbital beam, lightning, a void rift for teleports,
  muzzle flashes, rock debris and dust waves on slams, ash after explosions, green Lumen fire, ichor.
- **Cards and menus:** a painting per region on a card when you arrive; the title scene behind the
  menu and a splash per class in the class picker.
- **Maps:** each region's map was painted with the edit endpoint from a drawing of its real layout
  (roads, caverns, hubs, water, domes), so it lines up with the world; the full map and minimap show
  it only where you have explored.
- **Notes:** decals use a chroma key (green, or magenta where the decal is green; magenta keyed
  cleaner); stickers the model kept adding under some decals are cut off by a per-decal `keep`; the
  painted art falls back to the old icons when a file is missing. The camera never shows the sky, so
  the "backdrops" became the region cards and map paintings.

### 2026-10-05 — Damage over time on the player stops after 4 s; drones are marked

- **DoT cap:** burning and poison used to be refreshed or stacked for as long as an enemy kept
  hitting, so standing near a fire field or a spore swarm could kill you with no way out but running.
  Now each damage-over-time status on the player (`PLAYER_DOT` in `src/systems/combat.ts`) lasts at
  most 4 s from when it first took hold, however often it is reapplied; after it wears off it can take
  hold again 1.5 s later. Poison stacks at most 3 deep on a player (still 10 on enemies). Enemies
  are not capped: the players' own DoT builds are unchanged.
- **Drones:** hovering enemies are drawn 25 % larger with a stronger rim, carry a blinking beacon
  in their glow colour (gold for the Governor) and cast a shadow with a coloured ring on the ground
  right beneath them, so you can tell where a drone is, not just see a speck above the clutter. The
  marks hide when the drone dies.

### 2026-10-14 — Free library assets: environment light, rock walls, road clutter, fonts, status icons

- **Environment light:** the scene had no environment map, so metal looked flat. A Poly Haven HDRI
  (a burnt-out warehouse, CC0) is blurred into one; it lights every zone at 0.35 and the dark Deep
  Mines at 0.05, so the lamp still rules underground. It is stored as an 8-bit equirect (WebP): the
  map is blurred anyway, and artifacts only serve standard web formats.
- **Cave walls:** ambientCG's Rock035 (colour, normal and roughness maps, CC0) on the Deep Mines
  walls, with UVs along the walls; the old dark vertex shading now only varies the texture.
- **Road clutter:** 14 Poly Haven models (oil drums, tyres, wheel rims, jerrycans, crates, ammo
  boxes, trash, a utility box and three rocks) go through the same optimizer as the Meshy models
  (`source: "external"`, `credit`, 512 px textures). Scatter can now lie along the road shoulders
  (`near: 'roads'`) or round the hubs (`near: 'hubs'`); that clutter uses the full-detail mesh and
  every mesh of a model, not just the first. It is visual only: no collision.
- **Interface:** Rajdhani for text and Share Tech Mono for numbers (OFL, self-hosted). The bar
  above the action bar now shows everything affecting the player as an icon tile with a countdown,
  stacks for poison, boons first and harm in red frames; the icons are game-icons.net glyphs (CC BY
  3.0) used as CSS masks so each takes its status colour. Credits are on the character select
  screen and in docs/credits.md.

### 2026-10-15 — Instance floors you can see; homing Spore Darts

- **Floors:** dungeon and bunker floors were one procedural texture stretched over the whole layout
  and multiplied by a dark theme colour, and the player's lamp (sized for the open world) barely
  reached them: the Drainage Tunnels read as a black floor. Each instance theme now names one of the
  painted ground textures (`ground`: grit for the tunnels, steel plating on the freighter, concrete
  in bunkers, flagstones in the crypt, lab tiles, mine rock, crystal floor…), tiled every 7 m and
  only tinted toward the theme colour; indoors the lamp is brighter and wider (160, 18 m), and
  goes back to the zone's on the way out.
- **Homing:** projectile skills can home (`homing: { turnDeg, seek }`). A shot locks onto the
  enemy nearest the aim point, or else the nearest one within `seek` m ahead of it (80° either
  side of its heading, not one it already hit), and turns toward it. Xenomant's basic Spore Dart
  homes (420°/s, 7 m) and flies 30 % longer for the curved path. The melee basic (Scalpel Slash)
  is unchanged.

### 2026-10-15 — Touch works held upright
The turn-sideways hint is gone. When the screen is taller than wide, `TouchControls` adds `.portrait` to
`#ui` and the HUD rearranges: life and resource as bars top left (the orb fill is driven by `--fill` and
`--shield` custom properties, so the same element grows upwards as an orb and sideways as a bar), the
menu as a 4-column grid of icon buttons (`public/assets/ui/menu/`, CSS masks like the status icons), the
minimap top right, the joystick on the left half of the lower 40 % and the thumb buttons on an arc
(r 118, 46 px) around the attack button with dodge and potion above it. Panels span the screen and
cover the menu, so a close button floats over them (there is no Escape on a phone). The camera reads the
canvas aspect itself (`viewForAspect` in `camera.ts`): below 1 the vertical FOV grows by 34° per unit of
missing aspect, the follow distance ×1.15, and `setViewOffset` pushes the picture up so the player sits
at 37.5 % from the top, clear of the thumbs. This applies to any portrait window, touch or not.

### 2026-10-18 — Audio on plain WebAudio instead of Howler.js
The brief named Howler.js. The audio engine (`src/audio/engine.ts`) uses the WebAudio API directly:
- **One audio context.** The game already had a WebAudio core for the loot sounds, so music, effects and
  loot share it.
- **Category buses.** The brief asks for a separate volume per category. Howler has no category buses; here
  master feeds music, effects and interface through plain gain nodes.
- **No untestable fallback.** Howler's HTML5-audio fallback plays through `<audio>` elements, whose behaviour
  under the claude.ai artifact CSP can't be verified here. Files are fetched and decoded with fetch +
  `decodeAudioData`, the same path the painted art already uses.
- **Ogg and MP3.** Safari can't be relied on to decode Ogg Vorbis, so both formats ship and the engine picks
  Ogg where `canPlayType` allows it, MP3 otherwise.
- **One sprite for effects.** The 47 effects are one file with offsets, which keeps the artifact's file count
  low. The MP3 encoder delay (1105 samples) is dropped so each offset lands exactly on its sound.
- Loot sounds stay synthesised (see 2026-10-02) and now go through the effects bus.

### 2026-10-18 — Free low-poly models only where a light treatment hides their style
Region 5's Lumen creatures are CC0 models from Quaternius and Kenney that wear the Lumen look (dark indigo
body, gold-white rim), which hides their low-poly style. Shades and the Absorbed reuse the game's own models.
- **Sources:** kept in felixarvid2/assets under `third-party/models`; built by
  `npm run assets:third-party -- local-models`.

### 2026-10-18 — Region 5 scope: what is cut to fit levels 40–50
- **Lumen phase 3 is one dialogue choice** (Listen or Fight) that changes only the epilogue.
- **Memory Mirrors are three small instances** that replace bunkers.
- **The Endless Shaft scales by density, champions and affixes**, since levels stop at 50.
- **The Core as an endgame area is deferred.**

### 2026-10-18 — Zone gates can require a finished quest
A zone gate can now check for a finished quest, as the bore from the Deep Mines does (it needs `mq.governor`).

### 2026-10-18 — Endgame: tiers, rifts, world bosses, harvest, matrix
The numbers are in docs/endgame.md ("As built"). The choices behind them:
- **World bosses every 45 minutes of play, not every 3 hours.** The brief's three hours would mean most players never
  see one in a browser session. The interval, warning (5 min) and lifetime (15 min) are data (`WORLD_BOSS`). The
  schedule is a pure function of the account's play time, so it needs no timer state and survives reloads. The cost:
  a killed boss comes back after a reload inside its window.
- **Deep Rifts suspend World Tiers.** A rift has its own scaling (×1.06 per level on level 50), so a tier on top would
  make rift levels mean different things per tier. Outside a rift the tier is unchanged; the badge reads WT I inside.
- **Ash Shards are lost on death.** Half of the carried shards vanish (the brief had them drop on the ground). With
  the shard counter on the character, a pickup would need ground entities that persist across zone loads; this keeps
  the Harvest simple and still makes dying cost something.
- **Matrix rules.** Points cost 60 % of the last campaign level's XP, +2 % per point already earned, to a cap of 200.
  Boards are 9×9 and join only at an allocated gate, rotatable while untouched, so a build is a path you commit to.
  Glyphs scale the normal and magic nodes of their family within radius 3 (+8 % per glyph level, 21 levels) and
  unlock a bonus at 8 or 16 attribute points. Upgrades succeed always up to rift level / 5, then fall 25 points per level.
- **Leaving a running rift needs a second use of the exit within 8 seconds** instead of a browser `confirm()`: a modal
  can be blocked inside the artifact iframe (it would return "no" and trap the player), and a toast works on touch.
  The cleared-rift warning already worked this way.
- **The shops and quests follow the World Tier.** Trader stock rolls with the tier's item power and greater-affix
  chance; rerolls add the tier's greater-affix chance but keep the item's own power (it already carries its tier);
  quest XP gets the tier's XP multiplier.
- **One status column for the endgame HUD.** Rift timer, world boss countdown and Harvest line share a column instead
  of each claiming a corner, so they cannot overlap each other or the minimap and quest tracker.

### 2026-10-25 — A fourth class: the Lightbearer (support)
The owner asked for a support class in the spirit of Ragnarok Online's Priest, one that can still deal
damage. The game is single-player, so a healer needs targets, and the class must be fun to play alone.
- **Targets.** Support needs allies, so the Lightbearer heals, shields and blesses itself plus a Guardian
  Light (a summon, up to two) and, where present, Xenomant-style allies. Heals and shields reach the caster
  as well, so the class works without a party.
- **Damage identity.** Taken from the Ragnarok Priest's "Heal hurts undead": light burns corrupted enemies
  (infected and lumen families) harder. It is kept per skill (`corruptedMul` on each hit) and modest, because
  those two families are about half of all enemies, so a larger bonus would make the class a corrupted-only
  specialist.
- **Devotion rewards healing, not hitting.** The resource grows with every life healed or shielded (0.5 per
  1 % of an ally's max life; overheal excluded) and by 3 per second on its own. `resourceGen` on the tree and
  gear scales it.
- **Few new effect kinds.** Three new kinds (`allyArea`, `sanctum`, `guardian`) plus data fields on buffs
  (`damageMul`, `hasteMul`, `damageTakenMul`, `cheatDeath`). Per-status code was avoided, so later classes
  can reuse the same effects.
- **Assets.** The character model was generated with Meshy (about 71 credits), the icons and portrait with
  Meshy (33 credits), and the item, aspect and menu art with FLUX ($0.168). There is no separate weapon
  model: the censer and staff are a procedural lantern-censer.


### 2026-10-25 — Refunding one skill rank (UI pass B032)
Right-clicking a learned tree node (mouse only) takes one rank back. Rules, all in `systems/skillTree.ts`
(`canRefund`, `refundRank`, `refundCost`): the free first rank of the starting skill stays; the last rank of a skill
or enhancement is kept while an enhancement or modifier still hangs on it; and a rank cannot go if a learned node
would drop below its branch's unlock total. It costs 20 % of the full respec price (`REFUND_COST_SHARE`) behind a
confirm sheet, so it is a small tax on trying a build, not a replacement for the full Reset. Touch has no refund
action yet.

### 2026-10-25 — Lightbearer balance pass (G001-G008)
Measured with `npm run sim`, a corrupted and a neutral (`security_trooper`) dummy, and `npm run play`. Numbers are
the L30 exorcist (`k.zealot`, Rapid, Radiant, Litany) on the corrupted dummy unless stated.
- **Stacking is capped, not the passives.** Magnus Exorcismus: pulse interval floor 0.35 s after all modifiers
  (`SANCTUM_MIN_INTERVAL` in the compiler), at most two live sigils per owner (`maxConcurrent`), Rapid -30 % to
  -20 %, Litany 0.15-0.30 to 0.08-0.15. The full aspect build went from 2,703 to 1,223 DPS; Rapid is worth +20 %
  (was +47 %). Sanctuary: one zone per owner (a recast replaces it) and duration bonuses stop at 2.5x (17.5 s).
- **Benediction is a save, not a state.** The first lethal blow leaves 1 life, spends the status and gives 1.5 s of
  invulnerability; the skill has `minCooldown: 30` that no reduction goes under (was 9 s with the aspect).
- **Lex Aeterna became "Judged".** +35 % damage taken from every source for 6 s, not consumed (the consumed
  double made the exorcist 6.5 % slower to cast it). Burst 0.3 to 0.8; Harsh Judgment is +1.5 radius and +4 s.
- **Less corrupted dependence, more base damage.** corruptedMul: Censer 1.25 to 1.2, Holy Light 1.5 to 1.3, Magnus
  1.8 to 1.5, Sanctuary 2.0 to 1.6, guardian bolt 1.5 to 1.3; Zealot's corrupted bonus 25 % to 15 %. Magnus base
  stays 0.6 (not the proposed 0.78) and Censer rises 0.9 to 1.15: the bot exorcist fell below the 7-minute band
  with 0.78, and the melee Shepherd plan needed the Censer to come under 13 minutes. neutral/corrupted DPS ratio:
  exorcist 0.47 to 0.61, healer 0.22 to 0.42. `light` was not added to the corrupted families (owner's call).
- **Holy Light is a basic.** 0.45 to 0.6 (recovery 0.18 to 0.14, about 2.3 coefficient per second). Healer L10
  (bot, seeds a/b/c) 23:26/16:16 to 12:49/11:17/10:53; Shepherd 16:15/13:38 to 12:51/11:45/13:15.
- **Heal costs real Devotion.** Cost 25 to 35, cooldown 1.5 to 2.5 s, Holy Light +5 to +3 Devotion, Censer +6 to
  +4; its corrupted burst 1.8 to 2.2 to keep the healer's damage. Heal casts per minute 42 to 27; average Devotion
  72 to 33 in the L10 row but only 82 to 76 for the L30 healer (target 60 not met: basics keep it near the cap).
  Not met: the L10 healer sim row is 100, not 135.
- **Guardian Light is worth a cast.** Bolt 0.4 to 0.7, shots every 0.8 s, bolts burst in 1.5 m. L30 shepherd 220 to
  425 single target; L15 sim row 118 to 185.
- **Magnus Exorcismus costs 40 Devotion (was 35).** After the pass above the bot exorcist reached L10 at 6:18 on seed b,
  under the 6:30 floor. The cost is a flat early-game throttle (the first sigils are Devotion-limited) and leaves the
  per-pulse numbers and the L30 coefficients alone; a coefficient of 0.5 gave the same band but costs 17 % of every
  later pulse. Exorcist L10 (bot) seeds a/b/c 8:10/6:18/7:01 to 8:48/7:23/6:53; seeds d/e/f now 7:41/7:02/7:18.

### 2026-10-25 — Balance pass for Bastion, Spectre and Xenomant (G009-G017, G025)
Measured with `npm run sim` (new `--dummy`, `--pack`, `--filter` and ten L30 builds) and `npm run play`; the table is
in `docs/balance.md`. Real decisions:
- **Percentage passives.** `maxLifePct` and `armorPct` (stat keys, applied after the flat sum) replace the flat +12-20
  life/armor nodes of Bastion, Spectre and Xenomant: +2.5 % life, +4 % armor per rank. The Lightbearer's flat
  nodes (`p.vigil`, `p.consecrated_mail`, `p.sacred_oath`) were left to its own pass.
- **Spectre survives drones by resisting them.** Energy resistance 10 to 20 % (the Lightbearer's value) and Phase
  Shift protects for 0.4 s. The larger part of the Blades' deaths turned out to be the bot: a melee plan kept
  casting its ranged starter at drones 11 m away and never closed in. Melee plans now only fire projectile
  skills within 4 m. Blades deaths 11 / 7 to 0 / 0, L10 16:45 / 15:35 to 12:43 / 15:08. The Blades keep a
  15:30 ceiling in the band test (the others 14:00): the bot's seeds vary by two minutes for them.
- **Bastion coverage, not damage.** Piston Jab arc 90 and Furnace Cleave arc 200 so packs that surround you are
  still hit (Cleave 11:19 / 12:08 to 10:24 / 11:13; target 10:30 met on one seed). Orbital Strike 16x (8.8 % of
  the shockwave build) and Heat Vent 2 + 0.10 x Heat every 10 s (vent build 601 to 744, the 800 goal is not
  reached: the build's weakness is the Reactor Core key, not the vent).
- **Disease is lifted by its key passive.** Raising Spore Dart's hit or the cloud also speeds up level 1-10 (the
  bot dropped under the 6:30 floor), so single-target disease went 390 to 502 through Pandemic (x1.3 to x1.9 on
  Poisoned), a Spore Burst hit of 1.0 and Spore Dart poison 0.3. Symbiote names Parasite Link (+10 % to +25 %).
- **Potions refill on kills:** 0.75 s per kill (elite 3, boss 8), surplus carries. The 18 s timer stays for
  a player who does not fight.
- **No 0.3 s unavoidable hits.** Melee, cone and lunge wind-ups are at least 0.4 s (`MIN_WINDUP`, `quick: true`
  on a def exempts it); hounds 0.35 to 0.45, swarms and motes 0.3 to 0.4. Flankers and lunges telegraph 0.15 s
  earlier (`TELEGRAPH_LEAD`) and their cooldown is 0.15 s shorter, so the swing rate does not change.

### 2026-10-25 — Progression pass: death toll, XP fall-off, strongholds, elites, rifts (G018-G024, C011)
- **A small death toll.** Dying in the campaign (open world and dungeons) costs 5 % of carried gold (at most
  40 x level) and halves the potion charges (rounded down, never below 1 while any were left); a toast says so.
  No durability (the world-and-gameplay design sketched repairs at the blacksmith, which the game never built) and
  no XP loss: a toll that a few kills return, so a boss retry is not a punishment spiral. Rifts and the Endless
  Shaft already end the run, so they are exempt. Save version unchanged: nothing new is stored. Revisit if players
  find deaths free; the next step would be a repair cost, not a bigger toll.
- **Overlevelling is slow, not blocked.** Above the zone's top level kill XP falls by 30 % per level (floor 10 %).
  Completionists no longer arrive at the next region 10 levels ahead. Quest XP does not fall off, and World Tier 2+
  (monsters follow the player) and Rifts are exempt. Mines and Core quest XP was cut (x0.52, x0.38) to about 80 % of
  what their levels need, so the story fills a band without overflowing it.
- **Regions 2-4 shoot back.** Drones and troopers join 15 pack templates until 12-14 % of spawns are ranged
  (they were 0-2 %), reusing existing enemies. Welder and botanist keep their attacks.
- **The stronghold is the warm-up.** Stronghold bosses get 3.5 % life per level, not 12 %, so each is 0.45-0.97x
  of its zone boss; the zone boss stays the high point.
- **Elites grow with the region** (rare life 4 + 0.05 x level, damage 1.5 + 0.01 x level, champion life
  2 + 0.02 x level, five rare affixes from level 30) and **Rift damage grows slower than life** (1.035 against
  1.06 per level) so rift 40 hits x4 like a World Tier 4 enemy would, not x10. Rift cache item power now grows to
  rift 100 and the cache can hold a unique, rarely a mythic, giving a goal past rift 40.

### 2026-10-25 — Finishing the partial balance items (G007, G009, G013, G014)
- **Lightbearer passives are percentages.** Vigil +2 % life, Consecrated Mail +4 % armor (`maxLifePct`, `armorPct`),
  Sacred Oath +4 % damage against corrupted enemies instead of +4 Intelligence.
- **Late Devotion, not early.** Raising Heal's cost or lowering `onHeal`/`idleRate` slowed the level 1-10 healer
  (average Devotion there is already 25-33). The surplus at level 30 came from gain multipliers, so Devout lost its
  +15 % Devotion gain (Heal, Kyrie, Sanctuary stay 35 % stronger) and Piety went 5 to 3 % per rank. L30 healer average
  Devotion 78 to 59; Healer L10 12:49 / 11:17 unchanged. A +1 Heal cost on Devout also worked (62) but the average
  falls off a cliff there (+3 gives 35), so the gain multipliers are the smoother lever.
- **Furnace Cleave gets reach, not damage.** Range 3.4 to 3.9 m (L10 10:24 / 11:13 to 8:51 / 8:46; seeds c / d 8:26 /
  9:37). Raising the coefficient to 3.0 gave 10:52 on seed a and 3.3 broke the "+10 % on the L15 row" limit.
- **Heat Vent** `perResource` 0.10 to 0.15: the L30 vent build 744 to 816.

### 2026-10-25 — Round 3 gameplay (D01-D14)
- **Halo of the Penitent** keeps its twice-as-long Sanctuary but the cooldown is now twice as long too (x2, was
  x1.5): uptime 14 s / 40 s = 35 % (was 47 %). A test in `lightbearer.test.ts` pins it.
- **Zealot stacking was real.** Zealot (+15 % ranged, multiplicative) with Sacred Flame and Radiant on all four slots
  that take it measured 1,982 DPS (corrupted dummy) against 936 for the plain exorcist, well past the best other
  L30 build (Bastion 972, mythic 1,100). Radiant became additive and 4-7 % (was multiplicative 10-20 %): the same
  stack is 1,151 DPS (+23 %, and 791 on a neutral dummy). `balance.test.ts` fails if the stacked build goes above
  1.1x the best build of another class. The sim has a new "Radiant on 4 slots" build for this.
- **Daily rift.** The level is seeded from the local date (8 to 28, never above the highest open level), the rooms
  come from the date too. It pays like a clear (glyph attempts, cache) but does not move the open levels, the best
  level, the tiers or the class records; its times live in `account.dailyRifts` (last 30 days).
- **Local records** (`account.riftRecords`, class -> level -> seconds), **feats** (`account.feats`: counters, done
  times, worn title), the trader's reroll count (`account.vendor`) and the shared materials (`account.materials`)
  are new account fields with defaults, so the account version stays 1 and old blobs load unchanged (tested).
- **Trader reroll** costs 60 x (1 + 0.12 x level) x 1.6^(rerolls today); the count restarts on a new local date.
- **Materials are per character**, so "Deposit all materials" moves them into an account pool and the stash panel
  offers "Take all materials" to bring them into any character (crafting reads the character's own).
- **Salvage junk now pays Lumen Dust** for marked legendaries (it paid gold only), and every salvage confirmation
  names the dust before the player confirms.
