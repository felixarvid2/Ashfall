# Game feel, audio, VFX, readability, onboarding and QoL: 25 improvements (F001-F025)

Audit only; no source was edited. All changes below need no paid art: CC0 sound clips (already pipeline `scripts/audio/build.ts`) or procedural VFX/DOM/CSS.

## Summary and honesty note

Method: production build served with `vite preview` on port 5296 (stopped by PID), one headless Chromium (SwiftShader, 1280x720, `?debug`, autoplay allowed), driven by `window.ashfall`. Scripts: `/tmp/claude-0/-home-user/91b10048-104f-50d9-baf1-7585dd3fa3ee/scratchpad/imp-f/cap.mjs`, `cap2.mjs`; log `cap2.log`; 45 screenshots in `.../imp-f/shots/` (`00-title`, `01-classselect`, `02-first-frame`, `03-after-5s`, `04-click-moving`, `skill-<class>-<n>-<skill>`).

Limits (the audit ran out of turns): software GL ran at about 1 frame/s (median frame 1041 ms, `cap.mjs` `click` line), so nothing timing-based was judged by eye; I did **not open the screenshots**, so no item rests on a visual judgement. Only skill slot 1 of each class is unlocked on a level-1 character (`compiled:false` for the other 9 skills of every class, `cap2.log`), so the sweep exercised one skill per class and the Lightbearer's VFX/sounds beyond Censer Strike are **from code**. Each item is tagged `[measured]` (a number from the runs) or `[code]` (read from source, verify before building). No page errors and no 4xx responses in any run.

Top 5 (highest value per effort): F001, F003, F004, F007, F009.

## Items

### F001 - Player damage has no screen feedback beyond a number [code], P1, S
- Area: hit feedback.
- Problem: damage to the player pushes `hit.player` (one sound for every damage type, `src/audio/eventSounds.ts:83-84`) and a red number (`src/render/vfx.ts:142`); `toPlayer` otherwise only drives haptics (`src/game.ts:1238`). `src/systems/combat.ts` pushes no `hitstop`/`shake` event for hits taken, and I found no vignette in `hud.ts`.
- Change: on `damage` with `toPlayer && !dot`, scale a red edge vignette (CSS overlay, opacity from amount/maxHealth, 250 ms decay), add shake trauma `min(0.35, 0.8*amount/max)` and a 40 ms hitstop above 15% max life. Respect the existing `screenShake`/`reduceFlashing` settings.
- Files: `src/game.ts` (handleEvents ~1250), `src/ui/style.css`, `src/render/gameRenderer.ts:989`.
- Verify: unit test mapping amount fraction to trauma; e2e: god mode off, take a hit, assert `.hit-vignette` opacity > 0 then 0 after 400 ms.

### F002 - Enemy swings and the player's whiffs share identical sound clips [measured], P2, S
- Area: audio.
- Problem: `catalog.gen.ts` gives `melee.swing` clips at 10.55 s and 11.02 s, identical to `miss`'s first two clips; `enemySlash`, `minionSlash` and the player's `slash` all map to `melee.swing` (`eventSounds.ts:25-27`). Run log: enemy `vfx:enemySlash` produced `melee.swing` right next to the player's own (`cap2.log`, spectre rows).
- Change: add `swing.enemy` and `swing.minion` (lower pitch, noisier) built from existing clips with a playbackRate/gain offset, or two new CC0 whooshes; remove the shared clips between `miss` and `melee.swing`.
- Files: `src/audio/soundIds.ts`, `scripts/audio/build.ts`, `src/audio/eventSounds.ts`, `catalog.gen.ts` (generated).
- Verify: `npx vitest run` catalog test; `audioDebug.recent` shows `swing.enemy` for enemy slashes.

### F003 - Lightbearer is nearly silent and shares one hit sound [code], P1, M
- Area: audio/VFX per class.
- Problem: `holy` casts reuse `heal` (`eventSounds.ts:47`), `holyRing` is `null` (`:48`), and 7 of 8 Lightbearer impacts are `energy` (grep of `src/data/skills/lightbearer.ts`), so nearly every hit plays the single `hit.energy` (gain 0.7, clips of 0.8 s each, `catalog.gen.ts`). Sanctuary/Guardian Light ground pulses have no sound at all.
- Change: new ids `cast.holy` (bell + choir swell, from CC0 bell/chime pack) and `holy.pulse` (soft tick, rate-limited to one per 0.6 s); trim `hit.energy` clips to <= 0.35 s so rapid hits do not smear; add a `hit.holy` variant used when the skill has `holy` VFX.
- Files: `soundIds.ts`, `eventSounds.ts`, `scripts/audio/build.ts`, `src/data/skills/lightbearer.ts` (impact tag).
- Verify: cast each Lightbearer skill at level 20, `audioDebug.recent` contains the new ids, no 404 in `/assets/audio/`.

### F004 - New hero has one skill and no "you learned/choose" moment [measured], P1, M
- Area: onboarding.
- Problem: on a fresh character only slot 1 compiled (`compiled:true` for `hydraulic_strike`, `quick_shot`, `spore_dart`, `censer_strike`; `false` for the other nine, `cap2.log`). The level-up banner only offers a tap on desktop via `pressAction('skills')` (`game.ts:1284`) with no pointer to the new point or what to spend it on.
- Change: first level-up (and first unspent point) opens a one-time modal-lite callout over the skill-bar slot 2: "New skill point: press K". Pulse the K/skills button until the first point is spent; mark the recommended first node in the tree with a ring (data: `recommended: true` on one node per class).
- Files: `src/ui/hud.ts:651`, `src/game.ts:1281`, `src/ui/skillTreePanel.ts`, `src/ui/style.css`.
- Verify: new character -> `addLevel()` -> `.coach-callout` visible and persists in `localStorage`; disappears after `learn`.

### F005 - No ground-click destination marker [code], P2, S
- Area: movement/click-to-move.
- Problem: click-to-move is the default (`playerControl.ts` clickMode) but grep for a marker/destination effect in `src` finds none, so a click on distant ground gives no confirmation, and a blocked/unreachable click is silent.
- Change: a procedural ring decal (two expanding rings, 0.4 s) at the `MoveTarget`; red X-shaped pulse and a soft `ui.error` if pathing fails.
- Files: `src/render/decals.ts`, `src/systems/playerControl.ts`, `src/render/gameRenderer.ts`.
- Verify: e2e click on ground, assert marker object count 1 at the click position (`.name==='moveMarker'`), gone after arrival.

### F006 - Desktop onboarding is a text hint that fades; touch has coach marks, desktop none [code], P2, M
- Area: onboarding.
- Problem: `src/ui/onboarding.ts` states it "does nothing outside touch play"; desktop gets `HintFade` (title fades at 8 s, key hints at 20 s or first skill, `hintFade.ts:4-8`). Nothing teaches potion (Q), dodge (Space), pickup (E), Shift-attack, or inventory/loot.
- Change: reuse `CoachMarks` for desktop with hints keyed to actions: move (click), attack, potion once health < 50% first time, dodge when the first telegraph appears, pickup when the first loot drops, inventory after the first item picked up. Each shows once; "Skip tips" in settings.
- Files: `src/ui/onboarding.ts`, `src/data/lang/en.json` (onboarding.*), `src/game.ts`.
- Verify: fresh desktop run, `ashfall.hints` in `localStorage` records each tip done; unit test the order.

### F007 - First objective is far and the route is not pointed out [measured], P1, S
- Area: first quest / world readability.
- Problem: at the start (-660,-501) the nearest NPCs are 486-498 m away (`cap2.log` "around": benny, pell, tomas, hekla), the nearest interactable (lore) 39 m and the nearest enemy 39 m; tracked quest `mq.wake_up`. Only a tracker line and `quest.start` sound; no on-ground path or edge-arrow evidence was checked (screenshots `02-first-frame`, `03-after-5s` not reviewed).
- Change: for the first main quest show a golden dotted guide line on the ground (existing `navOverlay.ts` data) to the objective for the first 3 steps, fading when within 15 m; add a one-time banner "Follow the marked road to Outpost Ember".
- Files: `src/render/navOverlay.ts`, `src/ui/edgeArrows.ts`, `src/game.ts` questUi.
- Verify: new character, `.guide-line` exists in the scene for `mq.wake_up`; absent after step 3.

### F008 - Hit reaction animation is throttled to once per 0.8 s per enemy [code], P2, S
- Area: hit feedback.
- Problem: `gameRenderer.ts:1385` only plays `hit` when `this.time - lastHit > 0.8`, and the white flash is 0.1 s (`:988`). Fast attackers (Spectre Barrage, Xenomant tick hits) show nearly no reaction between the first and sixth hit.
- Change: keep the animation throttle but add a procedural 80 ms squash/recoil (scale 1.0 -> 0.94 -> 1.0 along the hit direction, plus 0.15 m position offset) on every non-DoT hit; larger on crit; skip for bosses.
- Files: `src/render/gameRenderer.ts` (~1383-1470), `animator.ts`.
- Verify: unit test of the pure recoil curve; `reduceFlashing` disables the flash but keeps the recoil.

### F009 - Light weapons have 10-15 ms hitstop and no shake [measured], P1, S
- Area: hit feedback.
- Problem: Spectre `quick_shot` produced `hitstop` 15 ms and no shake; Xenomant `spore_dart` 10 ms and no shake (`cap2.log`). Crits do not change hitstop/shake at all: `eventSounds.ts` only adds a `hit.crit` sound and `impact.ts:44-47` only reads the skill's static values.
- Change: on a crit multiply hitstop by 1.6 (cap 120 ms) and add `shake +0.08`; on killing blow add 20 ms hitstop; on elite/boss kill add 0.35 trauma + slow-mo 0.25 for 250 ms (`loop.timeScale`).
- Files: `src/systems/combat.ts` (dealHit), `src/systems/impact.ts`, `src/game.ts:1253`.
- Verify: vitest on a crit hit emits a larger `hitstop` than a normal one; boss kill event list contains `shake` >= 0.35.

### F010 - Every enemy attack telegraph sounds the same [measured], P2, S
- Area: audio.
- Problem: `telegraph` -> one id (`eventSounds.ts:93`); in the run it repeated as "telegraph, telegraph, telegraph" for different enemies (`cap2.log` audio arrays). The visual telegraphs are well built (`vfx.ts:61-69`, A024) but sound gives no information about shape/danger.
- Change: pass `kind` (cone / circle / line / charge) and `danger` to the cue; three pitched variants (low rumble for slam, rising whine for beam, short tick for melee), plus a 1-beat rising cue for boss telegraphs only.
- Files: `src/core/events.ts` (telegraph payload), `eventSounds.ts`, `soundIds.ts`.
- Verify: `soundsForEvent` unit test per kind.

### F011 - Kills stack `cast.bio` on top of `death.organic` [measured], P3, S
- Area: audio mix.
- Problem: each infected kill logged `cast.bio` then `death.organic` (`cap2.log` rows for scalpel_slash, holy_light): `corpseBurst` -> `cast.bio` (`eventSounds.ts:49`) while the death plays its own sound, so common kills are two overlapping bursts and a `cast.*` cue that reads as a skill cast.
- Change: make `corpseBurst` silent (`null`) unless the event is from Corpse Explosion; keep `death.organic` as the only kill sound; add a 120 ms duck of `hit.*` on the same entity.
- Files: `eventSounds.ts`, `src/core/events.ts` (add `source` to vfx corpseBurst).
- Verify: kill a colonist, `audioDebug.recent` shows only `death.organic`.

### F012 - The Core reuses the Deep Mines music and a 4.5 s hum loop [code], P2, M
- Area: audio.
- Problem: `src/data/audio.ts:24-27` marks the Core's `music.deep_mines` as a PLACEHOLDER; the boss track for Refinery, Hydroponic and Core is the same `music.boss`. Ambience loops are 4.5 s each (`catalog.gen.ts` amb.*), which will audibly repeat.
- Change: add `music.the_core` (CC0 choral/drone, 60 s+) and `music.boss_core`; make ambience 20 s+ by crossfading two offset layers (procedural, like `wind.ts`).
- Files: `src/data/audio.ts`, `src/audio/soundIds.ts`, `scripts/audio/build.ts`, `src/audio/wind.ts`.
- Verify: `audioDebug.music === 'music.the_core'` after `enterZone('zone.the_core')`; test that loop durations >= 20 s.

### F013 - Zone transitions: a hard 0.3 s black dip and a synchronous swap, no loading info [code], P1, M
- Area: transitions.
- Problem: `ZONE_FADE = 0.35` with a 0.3 s CSS opacity transition (`game.ts:197`, `style.css:581`); the swap runs inside the `setTimeout` on the main thread (`game.ts:1071-1082`), and `fade.on` is removed immediately afterwards, so a slow swap freezes the screen mid-fade (hitches grow with zone size). Boot to title measured 16.9 s in software GL with no progress indicator observed in `00-title` (not reviewed).
- Change: show a short loading card during the swap (region name, a tip from a list of 20, a progress bar fed by build stages) and keep the fade black until the first rendered frame (`requestAnimationFrame` x2). Music ducks to 30% during the fade and returns.
- Files: `src/game.ts` fadeTo, `src/ui/style.css`, `src/data/lang/en.json` (tips).
- Verify: record `.zone-fade` class timeline during `teleportTo`; assert black overlay present across the whole swap (no un-faded frame via canvas luminance sampling, see playwright skill).

### F014 - Death and respawn are instant and unframed [code], P1, M
- Area: death/respawn flow.
- Problem: `respawn()` (`game.ts:2031-2068`) clears Dead, heals fully and `snapTo`s the camera with no fade, no death summary and no cost; the 2 s `Invulnerable` has no visual. `deathHint` is a single line (`hud.ts:618`).
- Change: 0.4 s fade-out/in around respawn (reuse `fadeTo`), show "You were killed by X / Y damage" on the death overlay (data from `deathCause.ts`), a fading golden shield shimmer on the player for the invulnerable 2 s, and play a rising `respawn` cue; slow-mo 0.3x plus desaturation on death.
- Files: `src/game.ts`, `src/ui/deathCause.ts`, `src/render/postfx.ts`, `soundIds.ts`.
- Verify: set health 0, assert `.death-overlay` shows cause; press R, assert `.zone-fade.on` toggled and `Invulnerable` shimmer uniform > 0.

### F015 - Footsteps are one sound for every ground [code], P3, M
- Area: audio / world.
- Problem: `footsteps.ts` has a single cadence clock and the `footstep` sound has 4 clips at gain 0.5 (`catalog.gen.ts`), identical on ash, metal grating, mud and glass. Regions differ strongly visually.
- Change: add surface tags per zone (ash / metal / wet / crystal) and map to playbackRate and filter variation of the existing clips (no new assets); optionally 3 CC0 metal-step clips.
- Files: `src/audio/footsteps.ts`, `src/data/zones/*` (surface), `src/game.ts` footstep call.
- Verify: unit test of surface -> rate; `audioDebug.recent` unchanged ids but distinct `rate` in the debug struct.

### F016 - Pause does not say what it pauses [code], P3, S
- Area: pause/resume.
- Problem: `PauseMenu` freezes the sim (`game.ts:2732-2755`) but nothing in code ducks the music/ambience or stops the procedural wind while paused (not verified in browser).
- Change: low-pass and -9 dB the music/ambience bus while paused, restore over 0.25 s on resume; "Paused" label already exists (`--paused-label`), also pause the Ash Storm wind generator.
- Files: `src/audio/engine.ts`, `music.ts`, `wind.ts`, `game.ts`.
- Verify: Escape, then `audioDebug` shows bus gain < 0.5; resume restores.

### F017 - Level-up has a banner and sound but no world effect [code], P2, S
- Area: game feel.
- Problem: `levelUp` event -> `levelUp` sound and `hud.levelUp` banner (`game.ts:1281-1285`); `grep levelUp` shows no renderer effect.
- Change: procedural golden ring + vertical light column at the player (0.8 s, reuse `holy`/`holyRing` VFX), brief 0.15 s radial glow in postfx, enemies within 6 m get a small knockback-free stagger.
- Files: `src/render/vfx.ts`, `src/render/gameRenderer.ts:989`.
- Verify: `addLevel()` then a `levelUp` vfx object exists for 0.8 s; screenshot diff of player region.

### F018 - Camera has no combat framing and no rotate, so tall props hide the hero [code], P2, M
- Area: camera.
- Problem: `camera.ts` DEFAULTS pitch 55, yaw fixed 45, distance 14-24, `followSharpness` 8; focus is the player only. `gameRenderer.ts:1035/1139` fade occluding objects, but enemies or telegraphs behind walls are not outlined.
- Change: (a) subtle look-ahead of 1.5 m toward the cursor/aim during combat; (b) pull the camera out 10% when 5+ hostile enemies are within 12 m; (c) show an enemy silhouette (flat colour pass) when occluded.
- Files: `src/render/camera.ts`, `gameRenderer.ts`, `postfx.ts`.
- Verify: unit test of `lookAhead` limits; screenshot with an enemy behind a wall shows the outline.

### F019 - Interactables are only distinguishable by proximity prompt [measured], P2, M
- Area: world readability.
- Problem: around spawn the interactables are lore (39 m), chests (46, 119, 183 m), a teleporter (156 m), relic, locked chest (`cap2.log`). `discover` is a 0.12 s tick (`catalog.gen.ts`).
- Change: idle shimmer per kind (gold chest sparkle, blue teleporter ring, grey lore dust) visible at 25 m with fog compensation, and a minimap pip colour per kind; distance-gated so only the nearest 6 render.
- Files: `src/render/ash.ts`/`particles.ts`, `src/world/interactables.ts`, `src/ui/minimap`.
- Verify: scene contains N shimmer emitters = interactables within 25 m (debug counter).

### F020 - Loot pickup lacks tiered audio and a vacuum feel [code], P2, S
- Area: loot feel.
- Problem: loot beams exist (`lootVisuals.ts` beamLook), sounds in `lootSounds.ts` are synthesised; the `loot` event maps to nothing in `eventSounds.ts` default (comment line ~127), so the drop moment itself is silent except those procedural sounds (verify the drop sound by rarity in a run).
- Change: on the `loot` event play a rarity-tiered drop sound (white thud, blue chime, gold rising arpeggio, unique/mythic with sub-bass + 60 ms hitstop) and let gold/small items magnet to the player within 3 m.
- Files: `src/audio/lootSounds.ts`, `src/systems/loot/*`, `src/game.ts`.
- Verify: `spawnLoot()` then `audioDebug.recent` includes distinct per-rarity ids.

### F021 - Boss and elite intro lacks a camera beat [code], P3, M
- Area: game feel.
- Problem: boss phase banners play `boss.banner` only (`eventSounds.ts:105`); `Boss` encounters give no camera zoom or letterbox.
- Change: 1.2 s soft zoom-in on the boss plus letterbox bars at engage, input stays live; skip if `reduceMotion` is set.
- Files: `src/render/camera.ts` (`pulseZoom`), `src/systems/boss.ts` event, `style.css`.
- Verify: boss engage sets `rig.distance` smaller for 1.2 s then restores.

### F022 - Ground telegraph vs ambient decals can compete in busy zones [code], P2, S
- Area: VFX readability.
- Problem: telegraphs deepen slowly with a late brightening (`vfx.ts:61-69`) but share colours with hazard pools; no rule separates "will hurt in x s" from "hurts now" for colour-blind players.
- Change: telegraph = red hatched outline + filling sweep; hazards = solid orange with pulse; add a `colourBlind` palette in settings. Verify in the Hydroponic Vaults and Core (many green/gold hazards).
- Files: `src/render/vfx.ts`, `groundSplat.ts`, `src/data/settings.ts`.
- Verify: screenshot comparison on `?debug` with both palettes; luminance contrast of telegraph vs ground > 3:1 (sampled).

### F023 - Combat music never reacts to danger below boss level [code], P3, M
- Area: audio.
- Problem: `pickMusic` only switches to boss tracks (`src/data/audio.ts`); regular fights, champion packs and low health leave the exploration track unchanged.
- Change: add a procedural combat layer (drum/percussion stem or filtered boost of the existing track) fading in over 1.5 s when 3+ enemies are aggroed or health < 30%, out after 6 s of calm.
- Files: `src/audio/music.ts`, `src/data/audio.ts` (`AudioScene.threat`).
- Verify: unit test of `threat` thresholds; `audioDebug` exposes `layer`.

### F024 - Damage-type sound set has no gain match for long clips [measured], P3, S
- Area: audio mix.
- Problem: clip lengths vary 0.12 s (`hit.physical`) to 0.8 s (`hit.energy`) with gains 0.7-1.0 (`catalog.gen.ts`); `VoiceLimiter` caps repeats (`engine.ts:353`) so rapid energy hits drop sounds while physical stays crisp. Observed audio arrays show only one `hit.*` per volley in multi-hit casts (`cap2.log`).
- Change: LUFS-match per type, cap clip length to 0.35 s for rapid-hit types, per-id cooldown 40 ms with a pitch jitter of +/-6%.
- Files: `scripts/audio/build.ts`, `src/audio/engine.ts`.
- Verify: `npm run audio:build` report; vitest that no hit clip > 0.4 s.

### F025 - First-loot and first-quest-complete have no tutorial tie-in [code], P2, S
- Area: onboarding.
- Problem: quest events give a sound (`quest.complete`) and the starter kit is granted silently (`newCharacter` -> `grantStarterKit`, `game.ts:910-930`); no toast tells the player what was equipped or that unspent gear can be compared.
- Change: after the first pick-up, highlight the inventory icon for 6 s with "Upgrade! Right-click to equip"; after the first quest completion, a one-time reward summary toast; mention Q for potion at the first time health < 50%.
- Files: `src/game.ts`, `src/ui/toast.ts`, `en.json`.
- Verify: e2e: pick up an item -> `.pulse` on the bag icon; `localStorage` flag set after.
