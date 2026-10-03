# The Refinery District — playtest report

Measurements required by docs/world-and-gameplay.md §15.3. Reproduce with `npm run region:report -- district`.

**How these were measured:** no human playthrough yet. As for Cinder Flats, the numbers combine the real
region data (roads, 292 pack spawns, POIs, dungeon layouts) with the bot's measured kill rate from
`npm run play`, scaled down by how much more life the district roster has than region 1's
(0.52 → ≈ 0.34 kills/s). They are estimates to sanity-check pacing; your own playtest replaces them.

| Measurement | Result | Target (§2.2) |
|---|---|---|
| Walk straight through (border crossing → Cathedral along Route 7 and Foundry Road, no fights) | 1 912 m ≈ 5.5 min | 5–7 min |
| Main quests (6), incl. Pump Station Delta, the Cathedral Crypt and Vire | ≈ 27 min (walk 8, fights 2, set pieces 17) | — |
| Full exploration (map sweep, all packs, 4 dungeons + 6 bunkers, set pieces) | ≈ 3 h 50 min | 3–5 h |
| One dungeon (14–15 rooms) | Smelter 3 8:46 · Pipe Alleys 8:20 · Cathedral Crypt 8:38 · Cold Hall 8:40 | 8–12 min |
| Average walking time between fights on the roads | ≈ 5.4 s | 5–8 s in dangerous areas |
| Legendary-or-better items in one playthrough | 20–30 (mean 24.8; ~9 guaranteed) | — |
| Deaths | not measured for levels 10–20 (the bot plays levels 1–10 in the test arena) | — |
| Stuck spots (POIs, teleporters, NPCs, quest objects inside collision) | none (the shrine got a clearing among the stacks after the first report flagged it) | none |
| Meshy credits for Region 2 | 808 credits for 23 new assets (5 rigged characters, 3 creatures, 7 environment pieces, 3 landmarks, 5 props); 8 earlier assets reused in the layout plus 5 enemy models as variants | ≈ 985 planned |

## Observations and suggested tuning
- **Dungeons were short at first** (≈ 7 min); main paths went from 7–8 to 8–9 rooms (Pipe Alleys 9–10)
  and side branches from 3–4 to 4–5. Now 8–9 minutes.
- **Roads are within the target** (5.4 s); district packs are spaced 31 m apart instead of 26 m.
- **Legendaries are generous** for the region, as in Cinder Flats (dungeon caches always hold one).
- **Light:** the district is darker than Cinder Flats. Every smokestack now has an ember glow at its
  base and ambient light was raised; tell me if it still reads too dark on your screen.
- **Not measured:** FPS on real hardware (the headless browser renders on the CPU), deaths at levels
  10–20 (the bot's playthrough stops at level 10), sound (Phase 8).

## Checklist (§15.2)
- [x] The whole region can be explored from start to finish (no stuck spots; quest step positions are
  kept out of molten metal by a test).
- [x] The hub works with all NPCs and services (Gus trades, Ines reforges, Mara runs the aspect bench,
  stash at the Coolant Works).
- [x] All main quests can be completed (6; the first one starts in Cinder Flats once The First is dead).
- [x] At least 10 side quests (10 + the mystery *The Fireproof Man*).
- [x] All dungeons generate correctly and can be completed (connectivity over 40 seeds each; each new
  objective has a test).
- [x] The stronghold can be reclaimed and becomes a hub (Pump Station Delta, with its teleporter and
  Kofi Osei, who gives two side quests).
- [x] The region boss works in all phases (guards and fireballs; floor collapse in three steps;
  infected form with tentacles; reset on death).
- [x] Every POI type from §3 exists in the right numbers (1 hub + reclaimed stronghold, 1 stronghold,
  4 dungeons, 6 bunkers, 6 events, 10 relics, 12 logs, 3 towers, crates and 6 locked chests, 6 pylons,
  2 features: The Crane and three coolant valves).
- [x] The Restoration meter works with rewards (per region; points from the same sources as region 1).
- [x] World events roll and can be completed (Runaway Belt, Slag Tide, Purge the Furnace, Smelter Raid,
  Elite Hunt, Supply Drop).
- [x] Environmental hazards work and are telegraphed (vents warn 1.5 s ahead; molten metal; belts).
- [x] Enemy density and pacing follow §2.2 and §8 (see the table).
- [x] Returning enemies: 5 of 10 regular types are region 1 models (4 fire variants + the Sergeant).
- [x] `npm run assets:check` reports no unused or missing assets.
- [x] `docs/enemy-roster.md` is updated.
- [ ] 60 FPS on target hardware — needs a measurement on your machine.
- [x] All text is in English.
- [x] Connects to the previous region: Route 7 continues past The Maw to the border crossing (zone
  change behind a short fade; map tabs for both regions; teleport between them).
