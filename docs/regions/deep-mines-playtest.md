# The Deep Mines — playtest report

Measurements required by docs/world-and-gameplay.md §15.3. Reproduce with `npm run region:report -- mines`.

**How these were measured:** no human playthrough yet. As for the earlier regions, the numbers combine the
real region data (tunnels and caverns, 213 pack spawns, POIs, dungeon layouts) with the bot's measured kill
rate from `npm run play`, scaled down by how much more life the mines' roster has than region 1's
(0.52 → ≈ 0.24 kills/s). Underground, walking legs are counted 35 % longer than the straight line (tunnels
wind) and the map sweep covers only the open ground (≈ 10 % of the square).

| Measurement | Result | Target (§2.2) |
|---|---|---|
| Walk straight through (freight lift → Drill Control along the main drift and the east tunnel, no fights) | 1 380 m ≈ 4.0 min | 5–7 min — short, like the Vaults |
| Main quests (6), incl. Shaft 13, Mining Station Aurum, the Archive and Governor Kade | ≈ 47 min (walk 10, fights 6, set pieces 31) | — |
| Full exploration (sweep of the tunnels, all packs, 5 dungeons + 6 bunkers, set pieces) | ≈ 3 h 15 min | 3–5 h |
| One dungeon (14–16 rooms) | Shaft 13 11:30 · Crystal Labyrinth 11:57 · Sunken Drill 10:07 · Archive 10:14 · Burial Chamber 14:37 (the hard one) | 8–12 min |
| Average walking time between fights on the tunnels | ≈ 6.0 s | 5–8 s in dangerous areas |
| Legendary-or-better items in one playthrough | 21–23 (mean 22.2; 7 guaranteed + 4 quest legendaries) | — |
| Deaths | not measured for levels 30–40 (the bot plays levels 1–10 in the test arena) | — |
| Stuck spots (POIs, teleporters, NPCs, quest objects inside collision) | none (two supply crates the props pushed into others were dropped); every POI and teleporter is reachable from the lift (flood fill in a test) | none |
| Meshy credits for Region 4 | **0** — every model is reused (18 earlier assets in the layout; every new enemy and boss is an earlier model with a new tint, size, glow or the hologram look) | 0 |

## Observations and suggested tuning
- **Darkness is strong on purpose** (your "very dark" default). Outside the lamp the screen is close to
  black; enemies show red eyes and lose their glow and rim light until they are about 15 m away. Floodlights
  and flares make a big difference. If it is too much on your screen, the knobs are the zone's ambient and
  fog in `src/data/zones/deepMines.ts` and the lamp in `playerLight`.
- **The straight walk is short again** (4.0 min): the tunnels are long but fairly direct. Same trade-off as
  the Vaults; tell me if you want a winding main drift.
- **The Burial Chamber runs long** (≈ 14.5 min) because it is the hard dungeon: longer main path, two packs
  per room and a three-phase boss. It is optional.
- **Echoes** take double damage in light. In the lamp's radius they melt; in the dark they are dangerous.
  Throwing a flare before a fight in the Elder Halls is the intended trick.
- **Models are placeholders.** Kade is the Bastion armour at ×1.35 with a gold glow; Echoes are the
  Spectre as a hologram; the Main Drill is the giant crane and the pillar. The plan lists what to replace
  first when credits return.
- **Not measured:** FPS on real hardware (the rock walls add one large mesh per zone), deaths at levels
  30–40, sound (Phase 8).

## Checklist (§15.2)
- [x] The whole region can be explored from start to finish (walkable-area flood fill reaches every POI,
  teleporter and quest step from the lift; steps are on open ground by test).
- [x] The hub works with all NPCs and services (Oona trades, Gerd reforges, Nils runs the aspect bench,
  stash at Station Zero; Foreman Brask gives the story; the follower from the Vaults is there).
- [x] All main quests can be completed (6; the first starts in the Vaults once the Mother Tree is decided).
- [x] At least 10 side quests (10 + The Whisper; the follower's quest depends on the Mother Tree choice).
- [x] All dungeons generate correctly and can be completed (each new objective has a test: the elevator,
  mirrors, power cores, memory crystals).
- [x] The stronghold can be reclaimed and becomes a hub (Mining Station Aurum, with a teleporter and Teo
  Vasquez, who gives a main and a side quest).
- [x] The region boss works in all phases (frontal shield + drones + energy cannon; plugged into the drill,
  immune, four conduits under the sweeping drill head; Lumen form that blinks and calls Echoes; reset on
  death with the tunnels opened).
- [x] Every POI type from §3 exists in the right numbers (1 hub + reclaimed stronghold, 1 stronghold,
  5 dungeons, 6 bunkers, 6 events, 10 relics, 12 logs, 3 towers, crates and 6 locked chests, 6 pylons,
  10 floodlights, 16 crystals).
- [x] The Restoration meter works with rewards (points also from floodlights).
- [x] World events roll and can be completed (Cave-in Rescue, Burrower Swarm, Lights Out, Security Patrol,
  Elite Hunt with an Ore Crusher, Supply Drop).
- [x] The region's environmental hazard works and is clearly communicated (darkness with lamp, eyes,
  floodlights and flares; cave-ins warned with dust, creaking and a circle; the lake's water slows).
- [x] Enemy density and pacing follow §2.2 and §8 (see the table; straight walk flagged above).
- [x] Returning enemies: 5 of 10 regular types are variants of earlier enemies.
- [x] `npm run assets:check` reports no unused or missing assets.
- [x] `docs/enemy-roster.md` is updated.
- [ ] 60 FPS on target hardware — needs a measurement on your machine.
- [x] All text is in English.
- [x] Connects to the previous region: a road past the Great Dome leads to a freight lift that loads the
  mines.
