# Region 1 plan: Cinder Flats (levels 1–10)

Source: docs/world-and-gameplay.md §5 (Region 1). Units are metres; +x east, +z north. The region is a
square 680 × 680 m (x, z ∈ [−340, 340]); the main road from the escape pod to The First is ~1.6 km
(≈ 5 minutes on foot without fighting).

## Map

```
 z ▲                                         · · Refinery glow on the horizon (NE, visual only)
340 ┌──────────────────────────────────────────────────────────────────────────┐
    │  ASH VALLEY (ash storms)                    [M] Meridian freighter        │
    │        L  Lumen fields     T4 ▲ Ash Valley   D1 Meridian's Hold    [E]─┐ │
200 │   B4          (event: Spore Nest)                      T5▲  ☠ THE FIRST │ │  Space elevator
    │        R  R           B5      L                             (The Maw)   │ │  foundation [E]
100 │              ┌ Drainage culvert D3                                       │
    │  R           │                  ROUTE 7 ═══════════════════════════════▶ │
  0 │      ═════════╪══════T3▲═════════╝  (convoy event)          B6          │
    │  ═══ ROUTE 7 ═╝   (signal jam)        B3                                 │
−80 │ ⌂ OUTPOST EMBER (hub, T2)                       T6▲ CHECKPOINT SIERRA ▣ │
    │  B1                      (rescue)              (stronghold, Hale)        │
−170│  IMPACT FIELDS  B2                                     D2 Bunker S-4     │
    │  ✕ escape pod  T1▲   craters, burning wrecks                             │
−340└──────────────────────────────────────────────────────────────────────────┘
   −340                              0                                       340  x ▶
```

## Subzones
| # | Subzone | Area | Identity |
|---|---|---|---|
| 1 | The Impact Fields | SW, centre (−250, −200) | craters, burning wreckage, the escape pod, weak enemies |
| 2 | Route 7 | the highway from (−260, −60) via the hub to (330, 60) | abandoned convoys, barricades, many supply crates |
| 3 | Ash Valley | N, centre (−40, 190) | ash storms, Lumen fields, the Meridian freighter |
| 4 | Checkpoint Sierra | SE, centre (230, −130) | military walls, watchtowers, bunkers |

## Points of interest (target counts from §3)
| Type | Count | Positions |
|---|---|---|
| Hub | 1 (+1) | Outpost Ember (−150, −80); Checkpoint Sierra becomes a hub when reclaimed |
| Stronghold | 1 | Checkpoint Sierra (230, −130): 3 Spore Feeders, then Commandant Hale |
| Dungeon | 3 | D1 Meridian's Hold (70, 230), D2 Bunker Sierra-4 (290, −220), D3 Drainage Tunnels (−60, 60) |
| Bunker | 6 | (−250, −110), (−80, −200), (110, −50), (−190, 120), (150, 150), (320, 10) |
| World event | 6 | Defend the Convoy (Route 7), Purge the Spore Nest (−170, 210), Rescue Operation (60, −160), Signal Jam (−20, −20), Elite Hunt (Ash Valley), Supply Drop (3 spots) |
| Echo Relic | 10 | hidden off-road, see `src/data/zones/cinderFlats.ts` |
| Lore object | 12 | audio logs and data pads along the main and side paths |
| Signal Tower | 3 | (−290, −20), (40, 120), (180, −220) |
| Supply crates | ~40 | scattered; 6 locked ones need a keycard found nearby |
| Stim Pylon | 5 | one of each of 5 types on rotation, near combat-heavy spots |
| Unique feature | 2 | the Sierra autocannon (player can fire it at packs), the Fuel Depot (shoot the tanks to blow up everything nearby) |
| Teleporter | 1 + 5 | Ember (hub) plus Impact Fields, Route 7, Ash Valley, Sierra Approach, The Maw |

## Enemies (§4: region 1 establishes the base roster)
| Enemy | Role | Asset | New or reused |
|---|---|---|---|
| Ash Walker | Charger (fodder) | enemy.infected_colonist | **reused** (renamed) |
| Sentry Drone | Shooter | enemy.security_drone | **reused** (renamed) |
| Bloater | Kamikaze | enemy.spore_carrier | **reused** model, new behaviour (walks up and bursts) |
| Spore Carrier | Support | enemy.spore_carrier (tinted) | **reused** (shields allies, toxic cloud) |
| Spore Hound | Flanker | enemy.spore_hound | **new** (static model, procedural run/lunge) |
| Contaminated Sergeant | Elite / Tank | enemy.sergeant | **new** (rigged: shield and machine gun) |
| Commandant Hale | Stronghold boss | enemy.sergeant, scaled ×1.4, Lumen tint | variant |
| The First | Region boss | boss.the_first | **new** (static model, procedural animation) |

Packs follow §8.1: 4–8 fodder, 1–2 specialists, 0–1 heavy. Champions (blue, 3–4 sharing 1–2
affixes) and rare elites (yellow, generated names, 2–4 affixes, minions) roll on packs.

## Dungeons
1. **Meridian's Hold** — inside the freighter; restore power at 3 generators; boss: Hold Warden (rare
   sergeant).
2. **Bunker Sierra-4** — find 2 keycards to open the final room; boss: Sergeant Vos (named elite).
3. **The Drainage Tunnels** — destroy all spore nests; boss: Brood Mother (huge Bloater variant).

Layouts are generated from modular rooms (corridor, junction, large room, dead end, boss room) with a
seed every time; a main path plus 2–4 side branches.

## Stronghold: Checkpoint Sierra
Destroy 3 Spore Feeders (each empowers nearby enemies: +damage, shield), then Commandant Hale
(phases: shield wall and machine gun → Lumen frenzy). Afterwards the checkpoint becomes a hub
with a teleporter and two new side quests.

## Region boss: The First (The Maw)
- Phase 1: slow heavy slams with red warning areas; summons Ash Walkers.
- Phase 2 (60 %): tears metal plates out of the ground and throws them; the plates stay as cover.
- Phase 3 (25 %): faster half-torn form; spore fields cover parts of the arena.

## Quests
Main quests (6): *Wake Up* (escape pod → road), *Signal in the Ash* (reach Outpost Ember),
*Fuel for the Living* (Route 7 convoy fuel, introduces events), *The Governor's Orders* (Checkpoint
Sierra stronghold), *Black Box* (Meridian's Hold), *The First* (region boss; reveals the governor kept
the drills running).
Side quests (10): *A Daughter Lost* (she is infected), *The Scientist's Logs* (collect 5 logs),
*Water for Ember* (escort the water tanker), *Cook's Spices*, *Old Dog* (a Spore Hound that was a
pet), *Radio Silence* (repair 3 relays), *Rations Run*, *The Deserter*, *Lights Out* (light the
road beacons), *Last Letter* (deliver a letter found on a body). Mystery: *The Whistle in the Ash*.

## Hazard: Ash Storm
Every 3–5 minutes an ash storm rolls over a subzone (always in Ash Valley, sometimes elsewhere),
warned 5 s ahead on the HUD. Fog thickens sharply and enemy name plates hide until close, but
infected (Lumen) enemies glow through the storm.

## Restoration
Points from: teleporters, side quests, dungeons, stronghold, Echo Relics, map revealed. 5 tiers:
+1 skill point, +1 potion charge, +10 % gold find, +1 skill point, +20 stash slots (Matrix points
arrive with Phase 7). Account-wide.

## Reuse and Meshy budget (§15.1 step 2)
Reused: 3 enemy models (4 enemy types), the whole Cinder Flats prop kit (crate, light, Lumen growth,
debris, lander, wall, pipe, barricade, terminal, fuel tank), the Wrath of Lumen model.

New assets and estimated credits (concept → image-to-3D → rig for humanoids; text-to-3D for the rest):

| Asset | Method | Credits |
|---|---|---|
| Spore Hound | text-to-3D, procedural animation | 30 |
| Contaminated Sergeant | concept + image-to-3D + rig + 6 animations | ~60 |
| The First | text-to-3D (large), procedural animation | 30 |
| 3 hub NPCs (cook, miner-blacksmith, data engineer) | concept + image-to-3D + rig + idle | ~3 × 45 |
| Landmarks: Meridian freighter, space elevator foundation, refinery silhouette | text-to-3D | 90 |
| Escape pod, Outpost Ember fuel station | text-to-3D | 60 |
| Interactables: teleporter, stim pylon, echo relic, signal tower, supply chest, spore feeder, spore nest, generator, explosive barrel | text-to-3D | 9 × 30 |
| Icons: keycard, lore log, pylon buffs | text-to-image | ~30 |
| **Total** | | **~850** (2172 left) |

Each Meshy batch stays below the 800-credit prompt threshold.

## Status (as built)
Everything above is implemented. The layout uses design coordinates × 2.2 (`CINDER_SCALE` in
`src/data/zones/cinderFlats.ts`) so the region takes ~5 minutes to cross; the ASCII map above is in
design coordinates. Measurements and the §15.2 checklist: [cinder-flats-playtest.md](cinder-flats-playtest.md).
