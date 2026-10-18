# The Core — playtest report

Measurements required by docs/world-and-gameplay.md §15.3. Reproduce with `npm run region:report -- core`.

**How these were measured:** no human playthrough yet. As for the earlier regions, the numbers combine the
real region data (4 subzones, 227 pack spawns, POIs, dungeon layouts, the Elevator Base wave table, the
quests) with the bot's measured kill rate from `npm run play`, scaled down by how much more life the Core's
roster has than region 1's (0.56 → ≈ 0.14 kills/s). Walking legs are counted 15 % longer than the straight
line (the Core is open cavern, not winding tunnels, so the mines' 35 % does not apply). The Elevator Base
(420 s) and Lumen (480 s) are fixed estimates, not simulated. The Endless Shaft is timed as one floor.

| Measurement | Result | Target (§2.2) |
|---|---|---|
| Walk straight through (bore → Last Camp → spine → Elevator Base → causeway → Lumen, no fights) | 1 307 m ≈ 3:45 (≈ 4:20 with winding); hub → Heart alone 849 m ≈ 2:26 (≈ 2:48) | 5–7 min — short again, like the Vaults and the Mines |
| Main quests (6), incl. the Gardens, Memory of Ember, the Elevator Base and Lumen | ≈ 52 min (walk 9, fights 10, set pieces 33) | — |
| Full exploration (sweep, all 227 packs, 4 dungeons + 3 mirrors, set pieces) | ≈ 5 h 19 min (sweep 30 min, packs 3 h 05 min, instances 1 h 10 min) | 3–5 h — slightly over |
| One dungeon (14–15 rooms) | Memory of Ember 17:46 · Singing Halls 16:40 · Chamber of Creation 19:20 · Endless Shaft 10:39 (one floor, 9 rooms) | 8–12 min — three of four run long |
| One Memory Mirror (4 rooms) | Ash 2:25 · Refinery 1:27 · Vault 2:16 | bunker-sized |
| Packs per subzone | Memory Halls 67 · Borderland 59 · Great Cavern with the Base 55 · Heart 36 · Hanging Gardens 10 (one per island) | — |
| Enemies | 12 regular types in the roster, 6 returning (50 %); the open world uses 10 of them, 5 Absorbed and the Choir (16 kinds); returning types are ≈ 66 % of the ≈ 1 600 enemies the packs spawn | 40–60 % returning (§4) |
| Average walking time between fights on the roads | ≈ 8.0 s | 5–8 s in dangerous areas |
| Legendary-or-better items in one playthrough | 29–37 (mean 33.6; 6 guaranteed + 4 quest legendaries) | — |
| Quests | 15: 6 main, 8 side, 1 mystery; ≈ 312 600 XP in all (main ≈ 208 500, side ≈ 90 100) | — |
| Deaths | not measured for levels 40–50 (the bot plays levels 1–10 in the test arena) | — |
| Stuck spots (POIs, teleporters, NPCs, quest objects inside collision) | none; every POI, teleporter, pack and quest step is on open ground and reachable from the bore while the bridges are on (tests) | none |
| Meshy credits for Region 5 | **0** — 37 earlier assets in the layout; the new enemies come from free CC0 libraries (docs/credits.md) | 0 |

## Observations and suggested tuning
- **Shape of the map:** 4 subzones (Borderland, Hanging Gardens, Memory Halls, Heart) round the Great Cavern and
  the elevator shaft. The Gardens are 11 floating islands on 13 energy bridges; 3 of the bridges switch on a
  cycle (8 s on, last second flickering, 3 s off) and two of those are the only way to the outer islands.
- **Unstable Gravity:** 7 fields in the Gardens (pull towards the abyss, the edge still blocks) and 4 in the
  Heart (the pull turns each cycle). 1.5 s of shimmer warns, then 4 s of pull at about a third of walking
  speed. It pushes without trapping; if it feels weak or too strong the knobs are in the field definitions in
  `src/data/zones/theCore.ts`.
- **The straight walk is short again** (3:45): the roads run straight up the middle from the bore to the
  shaft. Same trade-off as the Vaults and the Mines; tell me if you want a longer main way.
- **Three of four dungeons run long** (17–19 min against 8–12). They are the Core's hard content and each
  has a real boss or objective (the Chamber's four portals and the Brood Engine take the longest). Fewer
  main rooms is the lever. Full exploration lands at ≈ 5 h 19 min for the same reason, partly 227 packs.
- **The Hanging Gardens have only 10 packs** because only islands are walkable; the Gardens quests and the
  Singing Halls carry the fighting there.
- **The Elevator Base** is 6 waves, 45 enemies, three Memory Shade minibosses (Vire, the Warden, Kade) and
  four allies from the earlier regions. Clearing it opens the heart causeway and the Base teleporter.
  Its 7 min is an estimate; allies will shorten it.
- **Lumen** has four phases (the earlier bosses' attacks, memory arenas of ash, fire, jungle and darkness,
  the Listen-or-Fight beat, the exposed core) and an epilogue that depends on the choice. Its 8 min is an
  estimate.
- **Known limitations:**
  - The enemies' balance at levels 40–50 is not tested by the bot beyond unit tests; expect tuning after a
    real playthrough.
  - The NPC models of the Absorbed have only idle clips, so they stand still apart from code motion.
  - Dungeon boss portraits are missing (no paid art yet).
  - The themed Core events (bridge collapse, choir awakening, memory surge, gravity storm) are not built; the
    5 events use existing types (2 signal jams, a rescue, an elite hunt, a supply drop).
  - Sacred choir music is deferred: the zone plays the Mines music with the hum.
  - The endgame (the Core after the campaign, World Tiers, Deep Rifts) is deferred.
- **Not measured:** FPS on real hardware (floating islands, abyss mask and gravity fields are new), deaths at
  levels 40–50, sound.

## Checklist (§15.2)
- [x] The whole region can be explored from start to finish (walkable-area flood fill reaches every POI,
  teleporter and quest step from the bore while the bridges are on; switching bridges are needed only for the
  two outer islands).
- [x] The hub works with all NPCs and services (The Last Camp: Hekla reforges, Gus trades, Dace runs the
  technician bench, stash; Maren and Idris give the story; allies from every region).
- [x] All main quests can be completed (6; the first starts in the Deep Mines once Governor Kade is dead).
- [ ] At least 10 side quests (8 side quests and a mystery quest, 9 in all, one short of the target;
  the Absorbed, mirror lore, the shaft's best floor and a lost ally from each region).
- [x] All dungeons generate correctly and can be completed (4 dungeons, each new objective has a test:
  keycards, floors, ringing pillars, portals; 3 Memory Mirrors).
- [x] The stronghold can be reclaimed and becomes a hub (the Elevator Base: 6 waves, 3 shade minibosses,
  allies; it opens the causeway and a teleporter).
- [x] The region boss works in all phases (Lumen: 4 phases, the choice beat, reset on death, epilogue).
- [x] Every POI type from §3 exists in the right numbers (1 hub, 1 stronghold, 4 dungeons, 3 mirrors, 5
  events, 10 relics, 12 logs, 3 towers, 86 chests and 6 locked chests, 6 keycards, 6 pylons, 14 crystals,
  1 boss).
- [x] The Restoration meter works with rewards (every quest rewards it; Lumen's quest 2 points).
- [x] World events roll and can be completed (5 events of existing types; the themed Core events are not
  built).
- [x] The region's environmental hazard works and is clearly communicated (Unstable Gravity with a 1.5 s
  shimmer warning; bridges flicker before they switch off and put whoever stands on them on the nearest edge).
- [ ] Enemy density and pacing follow §2.2 and §8 (straight walk and three dungeons are outside the targets,
  see the table).
- [x] Returning enemies: 6 of 12 regular types are variants of earlier enemies (memory shades).
- [x] `npm run assets:check` reports no unused or missing assets.
- [ ] `docs/enemy-roster.md` is updated for the Core's roster.
- [ ] 60 FPS on target hardware — needs a measurement on your machine.
- [x] All text is in English.
- [x] Connects to the previous region: the bore Kade's Main Drill made drops from the Deep Mines into the
  Borderland once the Mines' last main quest is done.
