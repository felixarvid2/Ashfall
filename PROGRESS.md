# Ashfall — Progress

> Read this first at the start of every session. Full design brief: [docs/design-brief.md](docs/design-brief.md).

## Current phase

**Phase 6 – Region 2: The Refinery District ✅ built — waiting for your playtest feedback** before
Region 3. Plan: docs/regions/refinery-district.md, measurements and checklist:
docs/regions/refinery-district-playtest.md.
- Player characters remodelled (HD models, 10 animations each, weapons in hand).
- Several zones: Route 7 continues past The Maw to a border gate; crossing loads the district behind a
  short fade (and back). Each zone keeps its own map, teleporters and found objects (save v7); the map
  (M) has a tab per visited region and travels to any discovered teleporter, in either zone.
- The district: Coolant Works hub, 4 subzones, The Pillar, the giant crane and the Smelters' Cathedral,
  conveyor belts, molten metal rivers and vents; 9 new enemy types (4 fire variants of region 1 enemies),
  6 main + 10 side quests + a mystery, Pump Station Delta, High Priestess Vire, 4 dungeons with new
  objectives, 6 bunkers, 6 events, The Crane, coolant valves and the motorbike (B).
- 23 new Meshy assets for 808 credits (balance 311).
- Fixes found on the way: heavy melee bosses in region 1 (Brood Mother, The First) now attack; Cinder
  Flats' autocannon and fuel depot work (they were map markers only).

Region 1 (Cinder Flats) is built; measurements and checklist: docs/regions/cinder-flats-playtest.md.
Phase 2's 60 FPS check is still open (needs a measurement on real hardware).

## Done

### Phase 5 – Region 1: Cinder Flats (levels 1–10)
- **Open world** (1500 × 1500 m): escape pod → Route 7 → Outpost Ember → Ash Valley, Checkpoint Sierra,
  The Maw. Roads, ~260 enemy packs that wake/sleep by distance and respawn, landmarks (Meridian,
  elevator foundation, refinery glow), fog of war, camera-aligned minimap and full map (M) with
  teleporter travel, safe hubs. Save v6.
- **Interactables (E):** supply crates, locked chests + keycards, 6 Stim Pylons, 10 Echo Relics
  (account-wide bonuses), 12 lore logs, 3 signal towers, explosive barrels that chain.
- **Quests:** 6 main, 10 side, 1 mystery; tracker, quest log (J), map markers, conversations with
  choices; hub NPCs Benny, Hekla, Pell, Tomas.
- **Hub services:** trader (buy/sell), blacksmith (affix reroll, salvage junk), Technician (extract and
  imprint aspects), shared stash.
- **Enemies:** Bloater, Spore Hound, Contaminated Sergeant; champions and rare elites with 10 affixes,
  generated names and minions.
- **Instances:** 3 procedural dungeons (generators / keycards / spore nests) with bosses, 6 bunkers.
- **Set pieces:** Checkpoint Sierra stronghold (Spore Feeders → Commandant Hale → becomes a hub) and
  The First (3 phases, arena gates, reset on death).
- **Systems:** 6 world events (Bronze/Silver/Gold), Ash Storm, Region Restoration (5 tiers).
- Tools: `npm run assets:check`, `npm run region:report`; F3 region helpers. 239 unit tests.

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

### Phase 4b – Xenomant (see docs/classes.md)
- **Xenomant** (Intelligence, **Biomass**: +8 when an enemy dies within 14 m, basics generate a little,
  rots slowly out of combat): 10 skills — Spore Dart, Scalpel Slash, Spore Burst, Parasite Link,
  Chitin Armor, Spore Cocoon, Raise Corpse, Grasping Tendrils, Corpse Explosion, Wrath of Lumen — full
  tree with 3 key passives (Hive Mind, Pandemic, Symbiote), 9 aspects, 2 uniques (Mother of Spores,
  Crown of the Hive), new base Scalpel Blade. Selectable on the class picker.
- **Corpses** linger 20 s. **Minions** are the dead enemies themselves, raised, re-teamed and glowing
  green; they guard you, drones shoot, and their hits use your gear and passives. Enemies fight them.
- New mechanics: draining tethers, poison clouds (paler than enemy clouds), corpse explosions, a
  stationary summon that taunts and slams, life steal, Chitin (damage reduction + thorns), Rooted.
- Poison stacks to 10 (a full stack replaces its weakest instance). Enemy toxic resistance lowered.
- Meshy: rigged + animated Xenomant, the Wrath of Lumen colossus, 10 skill icons and the Scalpel Blade
  icon. **Credits used: 928 of 3100** (2172 left).
- `npm run sim` covers all three classes on a neutral dummy (L10: Bastion 132, Spectre 118–166,
  Xenomant 125–165 DPS; corpse builds get a steady corpse supply).
- The Meshy CLI now refuses to run twice at once (a parallel run had silently undone an approval).
- 186 unit tests.

### Phase 4c – Balance to level 10 (see docs/balance.md)
- `npm run play`: a bot plays the real waves from level 1 to 10 with 9 builds (3 per class) while
  enemies fight back; reports time per level, deaths, life and damage taken by type.
- Tuned until every build reaches level 10 in about 7–13 minutes; melee builds of the ranged classes
  are riskier (2–9 deaths for the bot), everything else 0–2.
- Found and fixed: Seismic Shock knockback made melee chase enemies; drones out-ranged ranged
  classes; Bastion too slow, Spectre too fragile, Xenomant ranged too fast (details in docs/balance.md).
- 187 unit tests.

## How to run

```bash
cd ashfall
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # typecheck + production build into dist/
npm run sim        # balance simulator (DPS of sample builds, all classes)
npm run play       # bot playthrough level 1→10 for every class and build
npm run assets:check   # orphan / missing Meshy assets
npm run region:report  # Cinder Flats pacing estimates (docs/regions/cinder-flats-playtest.md)
npm run region:report -- district   # Refinery District (docs/regions/refinery-district-playtest.md)
```

Meshy pipeline (needs `MESHY_API_KEY` in `ashfall/.env`): `npm run meshy -- status`.
Behind a proxy (cloud sessions) prefix with `NODE_USE_ENV_PROXY=1`.

Controls: **WASD** move · **LMB/RMB/1–4** the six action-bar slots (set them in the skill tree) ·
**K** skill tree · **I** inventory · **C** character · **M** map · **J** quests ·
**E** pick up / interact / talk · **Alt** show loot labels ·
**Space** dodge · **Q** stim pack · **B** motorbike (once unlocked) · **mouse wheel** zoom · **F3** debug panel ·
**F5/F9** quick save/load · **R** respawn. Skills aim at the cursor.
Click-to-move (debug panel): left-click ground to walk, left-click an enemy to attack it,
Shift + left-click to attack in place.

## What to test (Phase 6 – The Refinery District)
1. Finish Cinder Flats' story (or use F3 → skip quest step) and follow *The Burning Road*: Route 7 past
   The Maw to the border gate in the north-east corner. The screen fades and you are in the district.
2. Open the map (M): one tab per region; click a teleporter in either region to travel.
3. At the Coolant Works: Mara (aspects), Gus (trade), Ines (blacksmith), Tobin. *Cold Comfort* teaches the
   vents — step off a glowing grate.
4. Ride a conveyor belt; cross a slag river on a bridge, or open a coolant valve and walk through the
   steam. Watch enemies step out of molten metal.
5. New enemies: Smelters raise fire shields when you close in (hit them from the side), Welders dash
   along a yellow line, Cargo Loaders throw you every third swing, Priests revive fallen Smelters.
6. Pump Station Delta (keep the technicians alive), the four dungeons (pumps in the order the objective
   line shows; follow the robot; free the prisoners before the pyres; defend the compressor and lure
   enemies into the frost vents), and High Priestess Vire in the Cathedral.
7. *Spare Parts* (Ines) unlocks the motorbike: B in the open world. *The Crane Operator* unlocks the crane.
8. **Tell me:** is the district readable (too dark?), are the new enemies fair, do the dungeon
   objectives make sense, and how is the FPS?

## What to test (Phase 5 – Cinder Flats)
1. Make a new character: you wake by the escape pod. Follow the quest tracker (right) — *Wake Up*,
   then *Signal in the Ash* to Outpost Ember. Talk to Benny, Hekla, Pell and Tomas (E); ! means a new
   quest, ? means they are waiting on you.
2. Open the map (M) and the quest log (J). Discover teleporters and travel by clicking them on the map.
3. Try the trader, Hekla's reroll, Pell's aspect bench and the stash (the green chest in the hub).
4. Along the roads: crates, pylons (buffs show above the action bar), relics, logs, signal towers,
   red barrels (shoot them near enemies).
5. Enter a dungeon (orange rings on the map) and a bunker; try Checkpoint Sierra and The Maw.
6. Wait for an Ash Storm in Ash Valley, and run into a world event (yellow diamonds).
7. Shortcuts for testing (F3): +1 level, unlock teleporters, spawn rare elite, start ash storm,
   enter/leave dungeon, skip quest step, god mode.
8. **Tell me:** is the region the right size and density? Too many fights or too few? Do the quests
   read well? What feels confusing? And the FPS on your machine.

## What to test (Phase 4b)
1. Create a **Xenomant** on the character select. Spore Dart with LMB; watch the green Biomass orb fill
   when enemies die near you.
2. Level up (F3 → "+1 level"). Kill a pack, then **Raise Corpse** on the bodies: glowing minions fight
   for you. Try **Corpse Explosion** on fresh corpses.
3. **Spore Burst** clouds, **Parasite Link** (green beam heals you), **Chitin Armor** while surrounded,
   **Grasping Tendrils** to hold a pack, and the ultimate **Wrath of Lumen**.
4. Three builds: minions (Hive Mind), disease (Pandemic), melee leech (Symbiote).
5. **Tell me how the three classes compare** — which feels best, weakest, most fun?

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
- Region 1: no sound or music yet (Phase 8); no durability on death (§13); Codex unlocks, tempering and
  masterworking come with Phase 7; Force Wall and Laser Grid elite affixes come later.
- Region 1: dungeons are a bit short (~6 min) and road packs a bit dense — see the playtest report.
- Region 2: the bot's balance playthrough covers levels 1–10 only, so district difficulty (levels 10–20)
  is untested beyond unit tests; leaving the district mid-escort or mid-event restarts it next time;
  the zone change destroys loot left on the ground in the zone you leave.
- Region 2 boss arenas (and The Maw) are rings of wall segments with gaps; you can step out of them.
- Enemies still have no pathfinding; in dungeons they slide along walls toward you.
- No sound yet (Howler.js audio system is planned for Phase 8; loot sounds come with Phase 3).
- Enemies have no pathfinding around crates (they slide along them via collision); fine for the open arena,
  needs a nav grid when dungeons arrive (Phase 5).
- **60 FPS not verified**: only measured in a headless CPU-rendered browser (4–6 FPS there — not
  representative). Skinned enemies are not instanced (one draw call each + shadows); if 100 enemies is too
  slow, next steps are GPU-instanced crowd animation (vertex-baked) and shadow LOD.
- Textures are WebP, not KTX2 (no `toktx` binary here) — see docs/decisions.md.
- The drone was asked for "no rotors" but has small ones; acceptable for now.
- The balance simulator's dummy doesn't fight back, so it only measures damage, not survivability.
- Minions are re-raised enemy bodies, so their look depends on what died (colonists, drones, carriers).
- Weapons in hand are one model per class (hammer, pistols, scalpel), not the equipped item's model yet.
- Raw Meshy downloads (`assets/source/**/*.glb`) are not in git; re-download within 3 days or regenerate.
- Saves store position only; health/heat/waves reset on load (fine until progression exists in Phase 3).
- Settings UI (key rebinding, text size) is not built yet; settings exist in data and are persisted.

## Next steps
- **Your playtest feedback on the Refinery District** (and Cinder Flats) → then Region 3 (The Hydroponic
  Vaults) with the same process.
- Your playtest feedback on Phase 1 → tune numbers in `src/data/` (all values are data-driven).
- FPS measurement on real hardware (closes Phase 2).
- Your playtest feedback on Phase 4a/4b (Spectre and Xenomant feel, character select).
- Phase 4c: level 1–10 balance pass for all three classes, 3 builds each in the simulator.
