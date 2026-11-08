# Improvement round 4 (80 items)

No paid or remote APIs: no Meshy, no FLUX/fal, no other generation service. New looks come from Blender
(scripts/blender), runtime variants, existing art and code. Free CC0 downloads are allowed where an item says so.
Each item: what to change and how to verify. Sources: PROGRESS.md "Known issues", round 3 leftovers, playtest notes.

## A. Gameplay and world (A01–A20)

- **A01 Core event: bridge collapse.** A light bridge in the Core gives way under the player after a warning
  crackle; fall damage or a respawn at the near end, the bridge rebuilds after 30 s. Verify: event test.
- **A02 Core event: choir awakening.** Choir singers wake in waves around a resonance stone; break the stone
  to end it. Bronze/silver/gold by time. Verify: event test.
- **A03 Core event: memory surge.** Shades of earlier bosses' adds pour out of a memory rift for 60 s; close it
  with three interactions. Verify: event test.
- **A04 Core event: gravity storm.** Gravity fields drift across an area and pull projectiles and the player;
  survive and destroy two anchors. Verify: event test.
- **A05 Elite affix: Force Wall.** The elite raises short walls that block movement and projectiles. Verify: AI
  test, nav blocked.
- **A06 Elite affix: Laser Grid.** Rotating laser lines from the elite that damage on touch, telegraphed. Verify:
  test.
- **A07 Sealed boss arenas.** Region 2 boss arenas and The Maw close their gaps while the fight runs (energy
  barrier segments), open on win or reset. Verify: nav test can't leave the arena mid-fight.
- **A08 World boss kill saved.** A killed world boss stays dead after a reload within its window. Verify: save
  round trip.
- **A09 Ash Shard pickup.** Shards lost on death drop as a glowing pile where you died; pick it up within 5 min
  to get them back. Verify: test.
- **A10 Escort/event persistence.** Leaving a district mid-escort or mid-event keeps its progress for 10 min.
  Verify: zone round trip test.
- **A11 Ground loot persists.** Loot on the ground survives a zone change for 5 min (per zone). Verify: test.
- **A12 Durability on death.** Death costs 10 % durability on equipped items; repair at the blacksmith; broken
  items lose their affixes until repaired. Verify: test.
- **A13 Hardcore characters.** A Hardcore toggle on character creation: one life, a skull on the slot, a
  separate stash. Verify: account tests.
- **A14 Core dungeon length.** Trim the Core dungeons from 16–19 min toward 10–12 (fewer rooms or packs).
  Verify: dungeon length sim.
- **A15 Region 1 dungeons and road packs.** Cinder Flats dungeons +1 room (~8 min), road pack density −15 %.
  Verify: sims/tests.
- **A16 Lumen on screen.** The camera pulls back or pans so Lumen is fully on screen from the whole arena edge.
  Verify: in-game screenshot from 4 edge points.
- **A17 Saves keep state.** Saves store health, resource, buffs' remaining time and the active wave; load
  restores them. Verify: save round trip.
- **A18 Shared clips.** All Meshy rigs share one skeleton: the Absorbed NPC enemies and any variant with only
  an idle clip borrow walk/attack/hit/death clips from a donor (sergeant) at runtime. Verify: animator test.
- **A19 Weapon in hand by item.** The weapon model in hand follows the equipped weapon's type where a model
  exists (Blender-built variants per base type: hammer/maul, pistols/revolvers, scalpel/blade, censer/mace).
  Verify: equip test + screenshot.
- **A20 Rift modifiers.** Four new rift modifiers (e.g. volatile dead, shrinking arena, elite storm, Lumen
  surges) with their own icons from existing art. Verify: rift tests.

## B. Tech, performance and builds (B01–B20)

- **B01 Animation LOD.** Skinned enemies far from the camera update their mixers at a lower rate; off-screen
  ones not at all. Verify: perf test, no visual pop in a screenshot.
- **B02 Shadow LOD.** Only the nearest N enemies cast shadows; the rest use the blob shadow. Verify: perf test.
- **B03 Crowd perf budget test.** A headless perf test with 100 enemies in one zone that guards the per-frame
  CPU time of sim + render prep. Verify: test.
- **B04 Zone change leak test.** Ten zone round trips must not grow geometries/textures/materials. Verify: test
  with renderer.info.
- **B05 Bot coverage 10–50.** The balance bot plays levels 10–50 (districts, Vaults, Mines, Core) and reports
  times. Verify: npm run balance:report updated.
- **B06 Dummy that fights back.** The sim dummy deals damage so the report shows survivability (deaths, time
  below 30 % life). Verify: report columns.
- **B07 Save backups.** Keep the last three saves per slot; Settings > Data can restore one. Verify: test.
- **B08 Save import validation.** Importing a save shows what will change and rejects corrupt files with a
  readable message. Verify: test.
- **B09 Offline web build (PWA).** A service worker caches the web build so it runs offline and installs as an
  app; not in the artifact or Android/Linux builds. Verify: headless offline reload.
- **B10 Android back.** Back with nothing open asks to quit (second press quits). Verify: host test.
- **B11 Linux range requests.** The Electron server answers byte ranges with 206 + Content-Range. Verify: test.
- **B12 Linux window state.** The desktop app remembers window size, position and fullscreen. Verify: test.
- **B13 Zone loading progress.** The zone change card shows real progress (bytes/assets) instead of a spinner.
  Verify: e2e zone scenario.
- **B14 Bundle trim.** Find and drop the biggest unused code from the main bundle (rollup visualizer locally);
  record before/after sizes. Verify: build sizes.
- **B15 Asset prefetch.** Prefetch the next zone's assets in idle time when the player nears a gate. Verify:
  test that the set is requested.
- **B16 Graphics auto-detect.** First run picks a preset from a quick GPU benchmark (frame time over 2 s).
  Verify: unit test of the chooser.
- **B17 FPS limiter.** Settings: 30/60/120/unlimited frame cap (battery on Thor and laptops). Verify: test.
- **B18 Error log export.** Settings > Data: "Copy log" with the last 200 console warnings/errors. Verify: test.
- **B19 Stale docs.** Refresh PROGRESS.md known issues (settings UI exists, regions use variants, etc.) and
  docs/decisions.md index. Verify: review.
- **B20 Variant tests.** Every variant id resolves, every part file exists, every bone name is in RIG_JOINTS,
  every variant's base has the clips its enemy needs. Verify: test.

## C. Interface and feel (C01–C20)

- **C01 Loot filter.** Settings: hide common/magic drops on the ground (gold and crystals always show), with a
  hotkey to show all. Verify: test.
- **C02 Inventory sort.** A sort button (by slot, rarity, item power). Verify: test.
- **C03 Stash search.** A text filter in the stash. Verify: test.
- **C04 Colour-blind rarity.** Rarity shapes/patterns on frames and beams in addition to colour (setting).
  Verify: screenshot.
- **C05 UI scale.** A UI scale slider (80–140 %) separate from text size. Verify: screenshot at 80 and 140.
- **C06 Photo mode.** A key hides the HUD, pauses and lets the camera orbit/zoom; Escape returns. Verify:
  e2e screenshot.
- **C07 Minimap zoom.** Mouse wheel / pad bumpers zoom the minimap in 3 steps. Verify: test.
- **C08 Quest pinning.** Pin up to 3 quests to the tracker from the quest log. Verify: test.
- **C09 Damage numbers.** Settings: off / compact / full; crit and DoT styles. Verify: test.
- **C10 Boss health bar phases.** Phase markers on boss bars and a short name banner per phase. Verify: test.
- **C11 Ability cooldown sweep.** A radial sweep and a ready-flash on skill buttons (desktop and touch).
  Verify: screenshot.
- **C12 Low-life feedback.** Screen-edge vignette and heartbeat below 25 % life (reduce-motion aware). Verify:
  test.
- **C13 Pickup log.** A short log of picked-up items and gold at the bottom left. Verify: test.
- **C14 Aria labels.** All buttons and panels have accessible names; focus outlines visible. Verify: a11y lint
  test over the DOM.
- **C15 Subtitles for barks.** NPC/boss voice-style barks show as subtitles (setting). Verify: test.
- **C16 Set bonus tooltips.** Tooltips list set pieces owned and the bonus thresholds. Verify: test.
- **C17 Map markers for feats.** The map shows uncollected lore, relics and feat targets in explored areas.
  Verify: test.
- **C18 Compare on hover in stash/vendor.** Same comparison block as inventory. Verify: test.
- **C19 Tutorial hints review.** First-time hints for dodge, potion, skills, map and stash with "don't show
  again". Verify: test.
- **C20 Matrix panel touch.** Pinch-zoom and pan on the endgame matrix work in a mobile emulator. Verify: e2e.

## D. Content and polish (D01–D20)

- **D01 Core music.** Replace the placeholder Core music with a fitting CC0 ambient/choir track (downloaded,
  licence recorded), or a WebAudio choir pad if none fits. Verify: audio catalog test.
- **D02 Ashen Colossus portrait.** A boss portrait from a Blender render of its model in the portrait frame
  style. Verify: intro card shows it.
- **D03 Passive emblems.** The two barrierBonus passives get their own emblem (Blender-rendered icon in the
  icon style). Verify: no generic emblem left.
- **D04 Minion look.** Re-raised minions get a uniform tint and a small Blender part (bone shards) so they read
  as the player's. Verify: screenshot.
- **D05 Six new uniques.** Two per region 3–5 theme, using existing icon art. Verify: loot tests.
- **D06 Eight new legendary aspects.** Built from existing systems. Verify: aspect tests.
- **D07 Three new bounty types.** Defend a pylon, collect samples, assassinate a named elite. Verify: tests.
- **D08 Lore pages.** Twelve new lore notes filling gaps (Kade's orders, Okafor's logs, Core history). Verify:
  string lint.
- **D09 NPC barks.** Each hub NPC gets 3 idle barks and 2 reactions to the player's progress. Verify: tests.
- **D10 Ambient life.** Small ambient props/creatures per region (ash moths, drifting spores, crystal motes,
  Lumen sparks) as cheap particles. Verify: screenshot.
- **D11 Weather variants.** Cinder Flats ash rain, Vaults spore drift, Core light rain of motes; toggles with
  graphics preset. Verify: screenshot.
- **D12 Elite names.** Rare elites get generated names (prefix + suffix tables per region). Verify: test.
- **D13 Boss loot tables.** Each boss has 2 signature drops with raised chance. Verify: loot test.
- **D14 More world event variety.** One more world event per region 1–4 using existing systems. Verify: tests.
- **D15 Feats round 2.** Ten more feats, three with titles. Verify: feat tests.
- **D16 Blender props.** Ten new set-dressing props for under-dressed spots (crates of crystals, broken
  turrets, server racks, spore pods), placed in zones. Verify: assets:check, budgets.
- **D17 Decals.** Blood/oil/ash/scorch decals under deaths and explosions fade over time. Verify: screenshot.
- **D18 Death animations for clipless models.** Unrigged enemies (drones, machines) get a code-driven
  death (spark burst, topple, sink). Verify: screenshot.
- **D19 Codex entries.** Codex pages for every enemy family with kill counts and a 3D turntable from the model.
  Verify: test.
- **D20 Credits screen.** An in-game credits page listing all third-party packs and tools from docs/credits.md.
  Verify: test.
