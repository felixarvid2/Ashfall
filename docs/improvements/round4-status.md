# Improvement round 4: implementation status

Status of the 80 items in `round4.md` (A, B, C, D) in this folder, checked against the code on this branch. Group B
(tech) has its own table and balance findings in `round4-status-tech.md`.

Checks: `tsc --noEmit` clean; vitest 175 files, 1776 tests pass; `assets:check` 0 orphans; `build` OK;
`build:artifact` 488 of 500 files; `perf:quick` OK; `balance:check` 31 of 31. Headless browser run on the production
build: boot, settings tabs, photo mode, loot filter, Hardcore toggle, a Core event, rare elite names, ambient
particles, mobile 390x844 without overflow; no page errors.

Totals: done 72, partial 8, skipped 0.

Partial (8): B14, C05, C11, C16, C17, D02, D07, D19. Done with a caveat (2): A16 is checked by tests and projection
only, A19 mounts are not checked on screen.

Not verified here:

- Android Java (no Android SDK in this container): B10 is checked in JS only.
- Linux changes inside Electron (B11, B12): checked by tests of the server and window-state code.
- Real GPU skinning cost (B01 and B03 measure the CPU side only).
- Pickup log (C13), durability repair on screen (A12), Force Wall and Laser Grid on screen (A05, A06).

Follow-up from the final check: status icons loaded from a doubled `assets/assets/` path (relative `url()` in CSS
variables). Fixed with absolute URLs.

| ID | Status | Note |
|---|---|---|
| A01 | done | Core event: the bridge gives way after a warning; fall damage or respawn at the near end; rebuilds after 30 s. |
| A02 | done | Core event: choir singers wake in waves around a resonance stone; bronze/silver/gold by time. |
| A03 | done | Core event: shades pour from a memory rift for 60 s; three interactions close it. |
| A04 | done | Core event: gravity fields pull projectiles and the player; two anchors to destroy. The Core has 9 events in total (`src/world/coreEvents.ts`). |
| A05 | done | Elite affix Force Wall: short walls block movement and projectiles (`src/systems/eliteTraps.ts`). Not seen on screen. |
| A06 | done | Elite affix Laser Grid: telegraphed rotating lasers that damage on touch (`src/systems/eliteTraps.ts`). Not seen on screen. |
| A07 | done | Energy barriers seal the Maw, Vire's cathedral and the Warden's dome during fights (`src/world/sealedArena.ts`). |
| A08 | done | A killed world boss stays dead after a reload within its window. |
| A09 | done | Ash Shards drop as a pile where you died; pick up within 5 min. |
| A10 | done | Escorts and events resume within 10 min. Not on disk in this check. |
| A11 | done | Ground loot survives a zone change for 5 min, per zone. |
| A12 | done | 10 durability lost per death; broken items keep base stats; Repair all at the blacksmith. The tooltip does not show durability yet. |
| A13 | done | Hardcore characters: one life, a skull on the slot, a separate stash. |
| A14 | done | Core dungeons 11:08–11:48 (were 17–21 min). |
| A15 | done | Cinder Flats dungeons 6:42–7:29; road pack density −15 %. |
| A16 | done | Camera pulls back up to 2.4× for Lumen. Checked by tests and projection only. |
| A17 | done | Saves keep life, resource, buff time and the arena wave. |
| A18 | done | Idle-only rigs borrow sergeant walk, attack, hit and death clips at runtime. |
| A19 | done | Two Blender weapon models (power sword, sun staff) swap in hand. Pose not checked on screen. |
| A20 | done | Four rift modifiers, with icons from existing art. |
| B01 | done | Animation LOD: full rate within 22 m, 30 Hz to 40 m, 15 Hz beyond, none off screen. Synthetic 100-mixer crowd 0.685 → 0.318 ms per frame. |
| B02 | done | Only the nearest 10 enemies cast real shadows. |
| B03 | done | Crowd budget test: 100 enemies, sim 0.39 ms per tick, render prep 0.95 ms. |
| B04 | done | Zone leak test found a decal leak; fixed. |
| B05 | done | Balance report covers levels 10–50. |
| B06 | done | Fighting dummy in the balance report: deaths, time below 30 % life. |
| B07 | done | Three save backups per slot; Settings > Data restores one. |
| B08 | done | Checked import with six reject reasons and a before/after confirm. |
| B09 | done | Service worker for the plain web build only (not artifact, Android or Linux). |
| B10 | done | Android Back asks before quitting. Java not compiled here. |
| B11 | done | Linux server answers byte ranges with 206 and Content-Range. |
| B12 | done | Linux window size, position and fullscreen are remembered. |
| B13 | done | Zone loading bar: "Loading n / m". Bytes are not shown. |
| B14 | partial | `npm run bundle:analyze` added; nothing worth dropping. Main JS 2328 kB. |
| B15 | done | Next zone prefetched in idle time when the player nears a gate. |
| B16 | done | First run picks a graphics preset from a short benchmark; steps down only. |
| B17 | done | FPS cap: no limit, 30, 60 or 120. |
| B18 | done | Settings > Data > Copy log (last 200 warnings and errors). |
| B19 | done | PROGRESS.md known issues refreshed; decisions index via `npm run docs:decisions`. |
| B20 | done | Variant integrity tests: ids, files, bones, clips. |
| C01 | done | Loot filter hides common and magic drops; gold and crystals always show; Alt shows all. |
| C02 | done | Inventory sort by slot, rarity or item power. |
| C03 | done | Text filter in the stash. |
| C04 | done | Rarity shapes and patterns on frames and beams (setting). |
| C05 | partial | UI scale 80–140 % on desktop; touch limited to banners, toasts, boss card and log (85–115 %). |
| C06 | done | Photo mode: F8 or the pause menu; HUD hidden, camera orbits and zooms. |
| C07 | done | Minimap zoom in 3 steps: wheel, `-`/`+`, map buttons, pad bumpers on the map. |
| C08 | done | Up to three quests pinned to the tracker. |
| C09 | done | Damage numbers: off, compact or full. |
| C10 | done | Boss phase ticks and a name label per phase. |
| C11 | partial | Ready flash added to landscape touch buttons. Not seen on screen. |
| C12 | done | Vignette and heartbeat below 25 % life; reduce-motion aware. |
| C13 | done | Pickup log at the bottom left. Not seen on screen. |
| C14 | done | Accessible names on every control and panel; focus outlines; lint test over the DOM. |
| C15 | done | Bark subtitles (setting). |
| C16 | partial | Set bonus tooltip block built; the game has no item sets yet. |
| C17 | partial | Lore and relics on the map; feat targets not, since feats have no positions. |
| C18 | done | Compare on hover in stash and vendor, same block as inventory. |
| C19 | done | First-time hints for dodge, potion, skills, map and stash; "Don't show again". |
| C20 | done | Matrix pinch and pan confirmed in a mobile emulator. |
| D01 | done | Core music: CC0 "Heavenly Loop" by isaiah658 (OpenGameArt); licence in `docs/credits.md`. |
| D02 | partial | A Blender portrait for the Ashen Colossus was tried and dropped; it did not read as the Colossus. |
| D03 | done | Barrier passives have their own emblem. |
| D04 | done | Minions get a uniform tint and bone shards. |
| D05 | done | Six new uniques, two per region 3–5 theme. |
| D06 | done | Eight new legendary aspects. |
| D07 | partial | Three bounties: pylon is switch-on and clear, no defend waves. |
| D08 | done | Twelve new lore notes. |
| D09 | done | Barks for 23 hub NPCs: three idle, two reactions. |
| D10 | done | Ambient life in all regions: moths, spores, motes, Lumen sparks (particles). |
| D11 | done | Weather in Cinder Flats (ash rain), the Vaults (spore drift) and the Core (light rain of motes). |
| D12 | done | Rare elites get generated names per region. |
| D13 | done | Two signature drops per boss. |
| D14 | done | One more world event per region 1–4. |
| D15 | done | Ten feats, three with titles. |
| D16 | done | Ten Blender props placed in every zone. |
| D17 | done | Decals fade over time from a 40-slot pool. |
| D18 | done | Machine deaths: twitch, topple, sparks. |
| D19 | partial | Bestiary pages with kill counts; no 3D turntable. |
| D20 | done | Credits page on character select. |

Behaviour changes to note:

- Ash Shards drop where you die and can be picked up again (5 min). Ground loot and escorts survive a zone change.
- Durability is lost on death; broken items keep base stats until repaired at the blacksmith.
- Hardcore characters have one life and their own stash.
- Saves store life, resource, buff time and the arena wave.
- Settings gain UI scale, damage number modes, loot filter, FPS cap, graphics auto-detect and the copy-log button.
