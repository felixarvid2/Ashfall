# Ashfall — Progress

> Read this first at the start of every session. Full design brief: [docs/design-brief.md](docs/design-brief.md).

## Current phase

**Phase 4 – All classes: 4a ✅ done** (class framework, character select, Spectre). Next: **4b** — Xenomant
(Biomass, corpses, minions), then **4c** — balance all three classes to level 10.
Phase 2's 60 FPS check is still open (needs a measurement on real hardware).

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

### Phase 3a – Levels, items and loot (see docs/loot.md)
- Levels 1–50 with an XP curve, skill points per level, attribute growth, full heal on level-up, XP bar.
- Monsters scale to the player's level within the zone range (Cinder Flats 1–10).
- Items: 10 slots, 17 bases (incl. future Spectre/Xenomant gear for the 85 % own-class rule), 29 affixes
  with per-type pools, greater affixes, item power scaling, sockets and 3 crystals with 3 tiers.
- Rarities common/magic/rare drop now; legendary/unique/mythic are defined but switched on in 3b.
- Data-driven drop tables per enemy plus a reward cache when a wave is cleared; separate seeded loot RNG.
- Ground loot with rarity colours, light beams, pop-out animation, clickable labels (Alt shows all),
  synthesised drop sounds per rarity, gold auto-pickup, `E` picks up the nearest item.
- Inventory (I): paper doll + 40-cell backpack, Meshy icons, right-click equip, Shift+click salvage,
  crystal socketing, tooltips with ▲/▼ comparison. Character panel (C) with all stats.
- Player stats aggregate class + level + gear into the damage model (attack speed, CDR, resource gen,
  barrier/potion bonuses, damage reduction, life on kill).
- Save format v2 with automatic migration from v1.
- 18 item icons generated with Meshy (54 credits). Credits used in total: ~669 of 3100.
- 135 unit tests.

### Phase 3b – Skill tree, aspects, uniques (see docs/skill-tree.md)
- **Skill tree (K)** for Bastion: 7 branches unlocking by points spent, 10 active skills with ranks,
  enhancements, choose-one modifiers, ranked passives, 3 key passives (pick one), respec for gold,
  action-bar editor. New characters start with only Hydraulic Strike.
- **6 new skills**: Piston Jab, Furnace Cleave, Coolant Flush, Magnetic Pull (pulls enemies in),
  Heat Vent (spends all Heat), Orbital Strike (delayed ultimate at the cursor).
- Shared **effects system** (stat / damage / skillMod / overheat) used by tree nodes, aspects and uniques;
  skills are recompiled from base + rank + every modifier whenever gear or the tree changes.
- **Legendary** items with 16 rolled **aspects**; **unique** items (Governor's Crucible, Ashwalker Treads,
  Fist of Kharos) and the **mythic** Heart of Lumen with build-changing effects. All rarities now drop.
- Burning ground hazards from modifiers/aspects, attacker conditions (≥ 70 % Heat, has barrier).
- **Balance simulator**: `npm run sim` (sample builds vs. a training dummy, real combat systems).
- 10 **skill icons** generated with Meshy (30 credits). Credits used in total: ~699 of 3100.
- Save format v3 (tree + action bar) with migration from v2/v1. Extended data validation
  (tree/aspect/unique references, every skill field exists, all language keys).
- Debug "Drop loot" now also drops 2 legendaries, a unique and a mythic.
- 158 unit tests.

### Phase 4a – Character select and Spectre (see docs/classes.md)
- **Character select**: 3 save slots, one character each (name, class, level), class picker with Meshy
  portraits and a short pitch, delete with confirmation. Autosave every 60 s, on level-up and when the
  tab closes. Save format v4 (character name + class); older saves become a Bastion in slot 1.
- **Spectre** (Dexterity, **Focus**: regenerates on its own, +4 per crit, +10 per dodged hit):
  10 skills — Quick Shot, Vibro Slash, Piercing Shot, Pistol Barrage, Holo Decoy, Smoke Cloak, Phase Shift,
  Minefield, Cluster Grenade, Death Mark — full tree with enhancements, modifiers, passives and 3 key
  passives (Deadeye, Saboteur, Ghost). 9 aspects, 2 uniques (Widowmaker, Echo Holsters), new base Twin Pistols.
- **Class framework**: player projectiles (pierce, spread, explode), grenades with bomblets, mines,
  blink, decoys that taunt, stealth (enemies lose you, next hit crits), Marked (more damage taken,
  Focus refund on death), "evasive" window after dodges, resource rules per class in data.
  Enemies now pick targets (player, decoys — later minions) and ignore stealthed players.
- HUD resource orb and tooltips follow the class (Heat orange, Focus blue).
- Assets (Meshy): rigged + animated Spectre (idle, run, shoot, slash, throw, hit, death), 10 Spectre skill
  icons, Twin Pistols icon, 3 class portraits. **Credits used: 803 of 3100** (2297 left).
- `npm run sim` now covers both classes (Spectre L1 26 DPS ≈ Bastion; L10 builds 118–166 vs Bastion 132).
- 171 unit tests.

## How to run

```bash
cd ashfall
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # typecheck + production build into dist/
npm run sim        # balance simulator (DPS of sample builds, both classes)
```

Meshy pipeline (needs `MESHY_API_KEY` in `ashfall/.env`): `npm run meshy -- status`.
Behind a proxy (cloud sessions) prefix with `NODE_USE_ENV_PROXY=1`.

Controls: **WASD** move · **LMB/RMB/1–4** the six action-bar slots (set them in the skill tree) ·
**K** skill tree · **I** inventory · **C** character · **E** pick up · **Alt** show loot labels ·
**Space** dodge · **Q** stim pack · **mouse wheel** zoom · **F3** debug panel ·
**F5/F9** quick save/load · **R** respawn. Skills aim at the cursor.
Click-to-move (debug panel): left-click ground to walk, left-click an enemy to attack it,
Shift + left-click to attack in place.

## What to test (Phase 4a)
1. Reload the page: the character select appears. An old save shows up as a Bastion in slot 1.
2. Create a **Spectre** in an empty slot. Shoot with LMB (Quick Shot) — Focus (blue orb) refills on its own
   and faster on crits. Dodge through attacks to gain Focus.
3. Level up (F3 → "+1 level") and try the skills: Piercing Shot through a line, Pistol Barrage up close,
   Holo Decoy (enemies chase the hologram), Smoke Cloak (enemies lose you; next hit crits), Phase Shift,
   Minefield, Cluster Grenade and Death Mark.
4. Try three builds: sniper (Piercing Shot + Deadeye), trapper (Minefield/Grenade + Saboteur),
   blades (Vibro Slash + Phase Shift + Ghost).
5. F3 → "Character select" returns to the menu (progress is saved). Make a Bastion too and switch.
6. **Tell me how Spectre feels compared to Bastion** — too fragile, too strong, fun?

## What to test (Phase 3b)
1. Start a new character (F3 → delete save, reload): only Hydraulic Strike is on the bar.
2. Level up (fight, or F3 → "+1 level" a few times) and open the **skill tree (K)**. Spend points:
   branches unlock at 2/5/9/14/20/28 points. Learn an enhancement, then pick one of its two modifiers.
3. Newly learned skills go to free slots. Click a slot in the tree, then a learned skill, to rebind.
4. Try the new skills: Magnetic Pull then Seismic Shock, Heat Vent at high Heat, Orbital Strike on a pack,
   Coolant Flush when near overheating.
5. F3 → "Drop loot": legendaries (orange, with an aspect line), a unique (gold) and the mythic Heart of
   Lumen (red). Equip them and check that skills change (e.g. Fist of Kharos makes Hydraulic Strike spin).
6. Reset the tree (costs gold) and check that points come back and the bar empties except the basic skill.
7. F5 / reload / F9 — tree and action bar should survive.
8. `npm run sim` — compare build DPS. **Tell me which skills feel weak or too strong.**

## What to test (Phase 3a)
1. Fight waves: enemies drop items and gold; clearing a wave drops a reward cache next to you.
2. Hold **Alt** to see all labels; click a label to walk there and pick it up (or press **E** nearby).
3. **I** opens the inventory: hover to compare, right-click to equip, Shift+click to salvage.
   Click a crystal, then an item with an empty socket.
4. **C** shows your stats — equip items and watch them change. Level up and check the XP bar.
5. F5 / reload / F9: inventory, gold and level should survive. An old save (v1) should still load.
6. Debug (F3): "+1 level" and "Drop loot" speed testing up.

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
- The balance simulator's dummy doesn't fight back, so it only measures damage, not survivability.
- Xenomant is shown as "Coming soon" on the class picker until Phase 4b.
- Spectre's weapons are not visible in its hands (animations only); shots come from the body.
- Raw Meshy downloads (`assets/source/**/*.glb`) are not in git; re-download within 3 days or regenerate.
- Saves store position only; health/heat/waves reset on load (fine until progression exists in Phase 3).
- Settings UI (key rebinding, text size) is not built yet; settings exist in data and are persisted.

## Next steps
- Your playtest feedback on Phase 1 → tune numbers in `src/data/` (all values are data-driven).
- FPS measurement on real hardware (closes Phase 2).
- Your playtest feedback on Phase 4a (Spectre feel, character select).
- Phase 4b: Xenomant (Biomass, corpses, minion AI, DoT clouds, life steal, Wrath of Lumen), assets.
- Phase 4c: level 1–10 balance pass for all three classes, 3 builds each in the simulator.
