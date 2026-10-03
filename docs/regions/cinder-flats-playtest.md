# Cinder Flats — playtest report

Measurements required by docs/world-and-gameplay.md §15.3. Reproduce with `npm run region:report`.

**How these were measured:** no human playthrough yet. The numbers combine the real region data
(roads, ~260 pack spawns, POIs, dungeon layouts) with the bot's measured kill rate from `npm run play`
(Bastion, Seismic Shock build: 0.52 kills/s in the test arena, 0 deaths to level 9). They are estimates
to sanity-check pacing; your own playtest replaces them.

| Measurement | Result | Target (§2.2) |
|---|---|---|
| Walk straight through (pod → The Maw along Route 7, no fights) | ≈ 5 min | 5–7 min |
| Main quests (6), incl. stronghold, Meridian's Hold and The First | ≈ 23–24 min (walk 7, fights 4, set pieces 12.5) | — |
| Full exploration (map sweep, all packs, 3 dungeons + 6 bunkers, set pieces; side quests on the way) | ≈ 3 h | 3–5 h |
| One dungeon (Meridian's Hold, ~11 rooms) | ≈ 6 min | 8–12 min |
| Average walking time between fights on the roads | ≈ 4.4 s | 5–8 s in dangerous areas |
| Legendary-or-better items in one playthrough | 14–22 (mean 17.6; ~7 guaranteed) | — |
| Deaths | bot: 0–2 for most builds, 2–9 for melee Spectre/Xenomant builds (Phase 4c, test arena) | — |
| Stuck spots (POIs, teleporters, NPCs, quest objects inside collision) | none (POIs are nudged out of props automatically) | none |
| Meshy credits for Region 1 | 710 credits for 24 new assets (21 models, 3 icons); 10 earlier assets reused in the layout plus all enemy models from Phase 1–4 | ≈ 850 planned |

## Observations and suggested tuning
- **Dungeons are a little short** (≈ 6 min vs 8–12). Easy levers: `main`/`branches` room counts or
  `packsPerRoom` in `src/data/instances.ts`.
- **Roads are slightly denser than the target** (4.4 s between fights). Pack spacing is `alongRoad(…, 26)`
  in `src/data/zones/cinderFlats.ts`; 30–32 m would give ~5 s.
- **Legendaries may be generous** for levels 1–10: dungeon caches always contain one, plus quest and
  boss rewards. If they feel cheap, drop the cache legendary after the first clear.
- **Places to lose direction:** the mystery quest has no markers by design; everything else has a map
  marker. Dungeon minimap shows explored rooms only.
- **Not measured:** FPS on real hardware (the headless browser renders on the CPU at 4–6 FPS, which
  says nothing about a real GPU), sound (Phase 8).

## Checklist (§15.2)
- [x] The whole region can be explored from start to finish (no stuck spots found; all quests have reachable targets).
- [x] The hub works with all NPCs and services (trader, blacksmith, Technician, stash, quest givers).
- [x] All main quests can be completed (6; covered by quest-engine tests and set-piece tests).
- [x] At least 10 side quests (10 + 1 mystery).
- [x] All dungeons generate correctly and can be completed (connectivity test over 40 seeds per dungeon).
- [x] The stronghold can be reclaimed and becomes a hub.
- [x] The region boss works in all phases (phase changes, plates, spore fields, reset on death).
- [x] Every POI type from §3 exists in the right numbers (1 hub + reclaimed stronghold, 1 stronghold, 3 dungeons, 6 bunkers, 6 events, 10 relics, 12 logs, 3 towers, crates, 6 pylons, 2 features).
- [x] The Restoration meter works with rewards.
- [x] World events roll and can be completed (Bronze/Silver/Gold).
- [x] The environmental hazard (Ash Storm) works and is announced on the HUD.
- [~] Enemy density and pacing follow §2.2 and §8 (slightly dense on roads, dungeons slightly short — see above).
- [n/a] Returning enemies (from region 2 onward).
- [x] `npm run assets:check` reports no unused or missing assets.
- [x] `docs/enemy-roster.md` is updated.
- [ ] 60 FPS on target hardware — needs a measurement on your machine.
- [x] All text is in English.
- [n/a] Connects to the previous region (from region 2 onward).
