# The Hydroponic Vaults — playtest report

Measurements required by docs/world-and-gameplay.md §15.3. Reproduce with `npm run region:report -- vaults`.

**How these were measured:** no human playthrough yet. As for the first two regions, the numbers combine
the real region data (roads, 215 pack spawns, POIs, dungeon layouts) with the bot's measured kill rate
from `npm run play`, scaled down by how much more life the Vaults roster has than region 1's
(0.52 → ≈ 0.29 kills/s). They are estimates to sanity-check pacing; your own playtest replaces them.

| Measurement | Result | Target (§2.2) |
|---|---|---|
| Walk straight through (border crossing → Great Dome along the Service Road, no fights) | 1 322 m ≈ 3.8 min | 5–7 min — **short**, see below |
| Main quests (6), incl. the Seed Bank Depths, Dome Gamma, the Sleeping Lab and the Warden | ≈ 47 min (walk 13, fights 6, set pieces 28) | — |
| Full exploration (map sweep, all packs, 4 dungeons + 6 bunkers, set pieces) | ≈ 4 h 08 min | 3–5 h |
| One dungeon (14 rooms) | Seed Bank Depths 9:06 · Cocoon Chamber 10:25 · Irrigation System 11:06 · Sleeping Lab 9:27 | 8–12 min |
| Average walking time between fights on the roads | ≈ 5.5 s | 5–8 s in dangerous areas |
| Legendary-or-better items in one playthrough | 14–23 (mean 18.8; 6 guaranteed + 3 quest legendaries) | — |
| Deaths | not measured for levels 20–30 (the bot plays levels 1–10 in the test arena) | — |
| Stuck spots (POIs, teleporters, NPCs, quest objects inside collision) | none (the first report found a fungal tree on the Green Sea teleporter, Dace inside a terminal and a dam valve in rubble; all fixed) | none |
| Meshy credits for Region 3 | **0** — every model is reused (14 earlier assets in the layout; every new enemy is an earlier model with a new tint, size and behaviour) | 0 (credits are used up) |

## Observations and suggested tuning
- **The straight walk is short** (3.8 min against 5–7). The map is as large as the district, but the
  Service Road runs nearly straight from the border to the Great Dome. Two options: let the road wind
  round the dam basin and through the outer domes' crop rows (≈ +500 m), or move the Great Dome deeper
  into the Root Network. Tell me which you prefer; I did not want to reshuffle the layout before your
  first look.
- **Main quests are long** (≈ 47 min against ≈ 27 in the district) because three of the six include a
  dungeon or set piece of 9–11 minutes, and Dome Gamma's five escalating waves add ≈ 5 minutes. That
  fits a later region, but Gamma's waves are the easiest knob (`GAMMA_TUNING` in
  `src/world/vaultSetPieces.ts`).
- **The Irrigation System is the longest dungeon** (11 min): wading through undrained water is slow.
- **Legendaries are fewer** than in the district (18.8 vs 24.8) because the Vaults have fewer packs
  (215 vs 292) with tougher members. Still generous.
- **Models are placeholders.** The Warden is a big glowing Cargo Loader, the Mother Tree a giant Lumen
  growth, Root Nodes are spore nests and the domes are drawn by the renderer. When credits are available,
  the plan lists what to replace first (Warden, Vine Weaver, Spore Swarm, Mutated Botanist, Mother Tree,
  fungal tree, glass dome).
- **Not measured:** FPS on real hardware, deaths at levels 20–30, sound (Phase 8).

## Checklist (§15.2)
- [x] The whole region can be explored from start to finish (no stuck spots; quest step positions are
  kept out of water by a test).
- [x] The hub works with all NPCs and services (Quill trades, Brann reforges, Dace runs the aspect bench,
  stash at Lab 9; Dr. Okafor gives the story).
- [x] All main quests can be completed (6; the first one starts in the Refinery District once Vire is
  dead; the last ends in the burn-or-spare choice, each option paying its own unique item).
- [x] At least 10 side quests (10 + the mystery *The Gardener*; *The Infected Researcher* is a choice).
- [x] All dungeons generate correctly and can be completed (each new objective has a test: seed cases,
  research terminals with logs, drain levers, cocoons and the Mother Cocoon).
- [x] The stronghold can be reclaimed and becomes a hub (Dome Gamma: five Root Nodes with escalating
  waves, then the Gamma Bloom; teleporter and Corporal Ruiz with two quests).
- [x] The region boss works in all phases (armour plates as separate targets + spore beams; rooted and
  immune until four Root Nodes die, vines slow the floor; Mother Tree roots, green root slams and beams;
  reset on death).
- [x] Every POI type from §3 exists in the right numbers (1 hub + reclaimed stronghold, 1 stronghold,
  4 dungeons, 6 bunkers, 6 events, 10 relics, 12 logs, 3 towers, crates and 6 locked chests, 6 pylons, 6 air filters,
  24 crystals).
- [x] The Restoration meter works with rewards (points also from air filters).
- [x] World events roll and can be completed (Spore Bloom, Swarm Migration, Root Eruption, Rescue,
  Elite Hunt with a Vine Weaver, Supply Drop).
- [x] Environmental hazards work and are telegraphed (spore fields build up exposure with a HUD meter;
  air filters clear them for good; water slows; crystals blind; beams and slams are telegraphed).
- [x] Enemy density and pacing follow §2.2 and §8 (see the table; straight walk flagged above).
- [x] Returning enemies: Spore Hound and Sergeant return as-is; nine region 1–2 models return as new
  Vaults variants.
- [x] `npm run assets:check` reports no unused or missing assets.
- [x] `docs/enemy-roster.md` is updated.
- [ ] 60 FPS on target hardware — needs a measurement on your machine.
- [x] All text is in English.
- [x] Connects to the previous region: a road from the Cathedral steps runs to the Refinery District's
  north edge; the border gate fades into the Vaults.
