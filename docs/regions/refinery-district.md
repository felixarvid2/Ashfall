# Region 2 plan: The Refinery District (levels 10–20)

Source: docs/world-and-gameplay.md §5 (Region 2). Units are metres; +x east, +z north. Like Cinder
Flats, positions are written in design coordinates (x, z ∈ [−340, 340]) and multiplied by 2.2 in the
game (1500 × 1500 m), so the main road takes ~5 minutes to walk. The region continues where Route 7
leaves Cinder Flats past The Maw, toward the refinery glow players have seen on the horizon since the
escape pod.

**Story in one line:** the player follows Governor Kade's trail to the refinery and finds the Smelters,
survivors who believe fire purifies and burn the infected (and sometimes the healthy). Their High
Priestess Vire secretly let Lumen take her. Kade's last shipment left from the refinery's rail yard.

## Map

```
 z ▲
340 ┌──────────────────────────────────────────────────────────────────────────┐
    │  SMOKESTACK FOREST (labyrinth of stacks)        ⛪ SMELTERS' CATHEDRAL   │
    │   D2 Pipe Alleys   R      T4▲        R          (Vire, region boss) ☠    │
200 │       B4      ║ ║ ║ ║ ║            D3 Cathedral Crypt      T5▲          │
    │   (event: Purge the Furnace)   ┃ THE PILLAR (landmark)       B6         │
100 │   R        ║ ║ ║ ║      ═══ FOUNDRY ROAD ════════════════╗              │
    │ ═══════════╩═════════════T3▲══════════════╗               ║  (event)    │
  0 │  CONVEYOR LINES (moving belts)   B3        ║    ⚙ CRANE   ║             │
    │  ⇉⇉⇉⇉⇉⇉⇉⇉⇉⇉   (event: Runaway Belt)      ║  SLAG FIELDS ║  D1 Smelter 3│
−80 │  ⇉⇉⇉  ❄ COOLANT WORKS (hub, T2)            ║ ~~molten~~~~ ║             │
    │  B1        D4 Cold Hall                     ║ ~~rivers~~~  ║  B5         │
−170│     T1▲  ▣ PUMP STATION DELTA (stronghold)   ║ (event: Slag Tide)         │
    │  ═══╝ ← ROUTE 7 from Cinder Flats (zone gate, SW corner)                 │
−340└──────────────────────────────────────────────────────────────────────────┘
   −340                              0                                       340  x ▶
```

## Subzones
| # | Subzone | Area | Identity |
|---|---|---|---|
| 1 | The Conveyor Lines | W, centre (−220, −20) | belt networks that carry the player and enemies, loading cranes, crates |
| 2 | The Slag Fields | E, centre (150, −90) | black slag plains, rivers of molten metal, the giant crane |
| 3 | The Smelters' Cathedral | NE, centre (200, 250) | the old control hall turned temple, burning windows, cages |
| 4 | The Smokestack Forest | NW, centre (−180, 230) | hundreds of stacks and pipes; narrow, winding paths |

**Landmarks:** *The Pillar* (the largest smokestack, a column of fire, centre north), the giant crane over
the Slag Fields, the Cathedral's burning windows. **Hazard:** Vents (fire and steam blasts, 1.5 s light
warning, hurt enemies too) and molten metal (damages everyone standing in it). **Unique feature:** The
Crane — activate it to drop its load on a crowd (3 fixed drop zones, cooldown). Second feature: coolant
valves that flood a slag river with steam for a few seconds (crossing shortcut).

## Points of interest (targets from §3)
| Type | Count | Notes |
|---|---|---|
| Hub | 1 (+1) | The Coolant Works (−150, −90); Pump Station Delta becomes a hub when reclaimed |
| Stronghold | 1 | Pump Station Delta (−90, −190): defend 3 technicians wave by wave while they unlock the cooling |
| Dungeon | 4 | D1 Smelter 3, D2 The Pipe Alleys, D3 The Cathedral Crypt, D4 The Cold Hall |
| Bunker | 6 | maintenance tunnels and control rooms (short, one objective, a cache) |
| World event | 6 | Runaway Belt, Slag Tide, Purge the Furnace, Smelter Raid, Elite Hunt, Supply Drop |
| Echo Relic | 10 | hidden: on belt ends, behind smokestacks, on slag islands |
| Lore object | 12 | Smelter sermons, refinery shift logs, Kade's shipping orders (continues the governor thread) |
| Signal Tower | 3 | one per outer subzone |
| Supply crates | ~40 | 6 locked ones need a keycard nearby |
| Stim Pylon | 6 | one of each type |
| Unique feature | 2 | The Crane, coolant valves |
| Teleporter | 1 + 5 | Coolant Works (hub), Zone Gate, Conveyor Lines, Foundry Road, Smokestack Forest, Cathedral Steps |

## Enemies (§4: 40–60 % returning)
| Enemy | Role | Model | Returning or new | How |
|---|---|---|---|---|
| Scorched Walker | Charger | enemy.infected_colonist | **returning** (variant) | burned tint, ember glow, fire patch on death |
| Slag Hound | Flanker | enemy.spore_hound | **returning** (variant) | glowing-hot tint, burning bite |
| Flame Drone | Shooter (short range) | enemy.security_drone | **returning** (variant) | flamethrower loadout: short fire cone |
| Fire Bloater | Kamikaze | enemy.spore_carrier | **returning** (variant) | fire explosion and burning ground instead of toxic |
| Contaminated Sergeant | Tank | enemy.sergeant | **returning** | refinery security, in Pump Station Delta and the rail yard |
| Smelter | Shooter / blocker | **new** (rigged human) | new | flamethrower or improvised weapon; raises a fire shield (front block) |
| Welder | Charger / lunger | **new** (rigged human) | new | fast; telegraphed lunge with a glowing cutting torch |
| Slagborn | Tank | **new** (static, procedural animation) | new | molten metal and Lumen; slow, very durable, leaves fire behind |
| Cargo Loader | Heavy | **new** (static robot, procedural animation) | new | hijacked loader; wide claw slam, grabs and throws |
| Smelter Priest | Support elite | Smelter model (variant) | variant of a new enemy | robe tint and halo glow; empowers Smelters, revives one fallen once |
| High Priestess Vire | Region boss | **new** (rigged human) | new | three phases (below) |

Returning: 5 of 10 regular types (50 %). The Priest is a variant of the new Smelter model, so it costs no
credits. Bosses use existing enemies as adds (Smelters, Scorched Walkers, Flame Drones).

## Dungeons (procedural, modular rooms; 8–12 minutes)
1. **Smelter 3** — the furnace heats up over time (a rising heat meter: burning ticks and then real damage).
   Objective: shut the 3 cooling pumps in the order shown on a panel. Boss: Foreman Krell (Cargo Loader).
2. **The Pipe Alleys** — narrow, winding corridors. Objective: follow a damaged maintenance robot that leads
   the way and stops when enemies are near (protect it). Boss: a Slagborn champion pack.
3. **The Cathedral Crypt** — the sacrifice chamber. Objective: free 4 prisoners from their cages before the
   pyres light (timer per cage). Boss: Pyre Warden (Smelter Priest variant).
4. **The Cold Hall** — the cooling failed into frost. Frost vents freeze anyone who stands in them —
   enemies too, which the player can use. Objective: restart the compressor (defend it for 60 s). Boss:
   The Frozen Welder.

## Stronghold: Pump Station Delta
The Smelters hold the station that controls cooling for the district. The player defends 3 technicians
(NPCs with life) while they unlock the systems: 4 waves of Smelters, Welders and a Cargo Loader, then the
Smelter commander Brother Ash (Smelter Priest variant). Reclaimed, it becomes a hub with a teleporter and
two new side quests.

## Region boss: High Priestess Vire (The Smelters' Cathedral)
- **Phase 1:** Vire and 3 guards. She throws telegraphed fireballs and stays behind her guards (moves to
  keep a guard between herself and the player).
- **Phase 2 (60 %):** she sets the cathedral on fire. The floor collapses into molten metal from the
  edges inward; the arena shrinks in three steps.
- **Phase 3 (25 %):** her infected form (same model, Lumen glow, larger). Lumen tentacles rise from the
  floor (stationary enemies that lash out), fire and spores combine (burning spore fields); she summons
  Scorched Walkers.

## Quests (English text; dialogue tone as §11.4)
**Main quests (6):** *The Burning Road* (cross into the district, reach the Coolant Works), *Cold Comfort*
(help the hub restart its pumps; introduces vents), *The Faithful* (meet the Smelters' envoy, learn of the
sacrifices), *Delta* (reclaim Pump Station Delta), *Ashes of the Faithful* (the Cathedral Crypt), *Vire*
(defeat the High Priestess; Kade's trail points down into the Hydroponic Vaults).

**Side quests (10):** *The Defector* (help a Smelter escape — escort), *Spare Parts* (find 3 motorbike parts
— **unlocks the motorbike**), *Sabotage* (destroy the Smelters' weapons cache), *Shift Change* (find the last
refinery crew's logs), *Belt Rider* (ride the conveyors to a hidden cache), *Heat Sick* (bring coolant to a
fevered survivor), *The Crane Operator* (restore the crane — unlocks the unique feature), *Red Hound* (hunt a
named Slag Hound), *Choir* (choose whether to expose a Smelter preacher to the hub or let him go), *Last
Shipment* (Kade's rail-yard records). **Mystery:** *The Fireproof Man* — a figure seen walking through
molten metal.

## Vehicle: the motorbike (§2.3, from region 2)
Unlocked by *Spare Parts*. Summon with a key in the open world (not in hubs or dungeons); faster travel,
the player dismounts when hit by a strong attack. Works in Cinder Flats too once unlocked.

## Restoration
Same 5-tier meter per region with account-wide rewards (skill points, potion charge, gold find, stash).
Points from teleporters, side quests, 4 dungeons, 6 bunkers, the stronghold, the boss, events, relics and
the revealed map.

## Engine work this region needs
- **Several zones and a seamless border:** Route 7 leaves Cinder Flats at its north-east edge and enters
  the district at its south-west gate; crossing loads the other zone behind a short fade. Each zone keeps
  its own explored map, teleporters, found objects and set-piece state (save v7); the map (M) can switch
  regions and travel between their teleporters.
- **Moving conveyor belts** (push everything on them), **molten metal areas** (damage everyone, enemies
  avoid them when they can), **vents** (timed, warned blasts that hit everyone).
- **New enemy behaviours:** flamethrower cone, fire shield block, lunge, claw slam and throw, revive ally,
  fire trail; a heat meter for Smelter 3; frost vents.
- **New dungeon objectives:** ordered valves, follow a guide robot, timed cage rescue, defend a machine.
- **Stronghold defense waves** around NPCs, **boss arena that shrinks**, stationary tentacle enemies.
- **The motorbike.**
- Note: the engine is flat (no real multi-level walking). "Several levels" of conveyors and pipe alleys
  are suggested with raised belts, catwalk props and ramps the player walks around, not on.

## Reuse and Meshy budget (§15.1 step 2)
Reused at no cost: 5 enemy models (variants above), the Cinder Flats prop kit where it fits (crates,
barricades, pipes, terminals, fuel tanks, generators, walls, emergency lights, barrels, supply chests,
pylons, relics, towers, teleporters), and the Region 1 hub NPC models re-tinted for one or two
background NPCs.

New assets (estimated credits; concept → image-to-3D → rig for humans, text-to-3D for the rest):

| Asset | Method | Credits |
|---|---|---|
| Smelter, Welder | concept + image-to-3D + rig + animations | 2 × ~60 |
| High Priestess Vire | concept + image-to-3D + rig + animations | ~60 |
| Slagborn, Cargo Loader | text-to-3D, procedural animation | 2 × 30 |
| Lumen tentacle (boss phase 3) | text-to-3D, procedural animation | 30 |
| 2 hub NPCs (pump engineer, Smelter defector) | concept + image-to-3D + rig + idle | 2 × ~45 |
| Landmarks: The Pillar, the giant crane, the Smelters' Cathedral | text-to-3D | 3 × 30 |
| Environment kit: conveyor belt, smokestack, pipe cluster, slag rock, furnace block, catwalk, industrial wall, Coolant Works pump house | text-to-3D | 8 × 30 |
| Interactables: vent, valve, prisoner cage, compressor, crane load, motorbike | text-to-3D | 6 × 30 |
| Icons: motorbike part, coolant canister, crane key | text-to-image | ~15 |
| **Total** | | **~985** (balance 1462 → ~475 left) |

This is above the 800-credit threshold in total, so it needs your approval. It would run in two batches
(characters and boss ~330, environment and interactables ~655), each below 800.
