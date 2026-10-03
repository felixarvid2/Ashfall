# Region 4 plan: The Deep Mines (levels 30–40)

Source: docs/world-and-gameplay.md §5 (Region 4). Units are metres; +x east, +z north. As in the earlier
regions, positions are design coordinates (x, z ∈ [−340, 340]) multiplied by 2.2 in the game (1500 × 1500 m).
The region continues from the Hydroponic Vaults: past the Great Dome, an old freight lift at the Vaults'
north edge drops into the mines, following Governor Kade and the four sleepers he took.

**Story in one line:** the player descends to where the drills woke Lumen. In the Elder Halls it becomes
clear that Lumen is not an organism but the remains of an extinct civilisation that uploaded itself into the
planet's biosphere. Governor Kade is down here, trying to bend it to his will. The region ends at the Main
Drill, where Kade wires himself into Lumen-amplifying armour.

**Naming:** the design document calls the governor *Castellan*; every earlier region's text names him
**Governor Kade**, so the game keeps Kade.

**No new 3D models** (Meshy credits are still used up, unless you tell me otherwise). Every model is an existing
asset varied with tint, glow, scale or the hologram look, or geometry built by the renderer (rock walls,
elder pillars, light beams). Ground textures start from the current set; Gemini texture instructions come
once the layout is settled, as in regions 1–3.

## Map

```
 z ▲
340 ┌──────────────────────────────────────────────────────────────────────────┐
    │                 THE ELDER HALLS (alien geometry, Echoes)                   │
    │   D4 The Archive ◈            ◇ D5 Burial Chamber (hard)                  │
260 │        B5          ════ elder causeway ════        T5▲                     │
    │                         ▣ ELDER GATE (landmark)                            │
150 │  ════════════════════════╬═══════════════════ DRILL CONTROL ☠ (boss)       │
    │  THE CRYSTAL CAVES       ║                    ≈≈≈ DRILL LAKE ≈≈≈           │
 60 │   ✦ crystal pillar  T3▲  ║   B3              ≈  ⚙ MAIN DRILL  ≈  T4▲        │
    │   D2 Crystal Labyrinth   ║                    ≈ D3 Sunken Drill ≈          │
  0 │        B2   (event)      ║                    ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈            │
    │  ════════════════════════╬═════════════════════════╗     B4                │
−120│        THE UPPER SHAFTS (rails, carts, drills)     ║   ▣ MINING STATION    │
    │   D1 Shaft 13      T2▲      B1                     ║     AURUM (stronghold)│
−240│                                                    ║                       │
    │          ⚗ ELEVATOR STATION ZERO (hub, T1)  ◄═ lift down from the Vaults  │
−340└──────────────────────────────────────────────────────────────────────────┘
   −340                              0                                    340  x ▶
```

The mines are **not open ground**: the walkable area is a network of tunnels (the "roads", 7–14 m wide)
joining caverns (open circles 40–120 m across). Everything else is solid rock, drawn as dark walls along the
edges and blocked for movement. That keeps it claustrophobic without hand-building corridors.

## Subzones
| # | Subzone | Area | Identity |
|---|---|---|---|
| 1 | The Upper Shafts | S, centre (0, −170) | human tunnels: rails, ore carts, drilling machines, timber props, work lamps (mostly broken) |
| 2 | The Crystal Caves | W, centre (−210, 40) | natural caverns full of huge glowing crystals; the crystal pillar from floor to ceiling |
| 3 | Drill Lake | E, centre (200, 50) | an underground lake; the Main Drill half-sunk in it; shore platforms and catwalks |
| 4 | The Elder Halls | N, centre (0, 250) | the extinct civilisation's architecture: geometric pillars, glyph walls, cold blue light |

**Landmarks:** **the Main Drill** (dozens of metres tall, its head turning now and then; built from the giant
crane, the pillar and pipe sections at large scale), **the crystal pillar** (Lumen growths stacked and tinted
blue, floor to ceiling), and **the Elder Gate** (renderer-built geometric arch of glowing slabs).

## Environmental hazards
- **Darkness.** Large parts are almost black: low ambient light and dense dark fog. The player carries a lamp
  that lights a radius around them (≈ 14 m). Enemies outside the light show only as **glowing eyes** until they
  come close. **Floodlights** (8 old generators and 10 crystal braziers) can be switched on to light an area
  for good (saved, like the air filters; restoration points). **Flares** (a new hotkey, F, 3 charges that
  recharge) light a spot for 20 s. **Echoes take double damage in light** and avoid lit ground.
- **Cave-ins.** Marked tunnel stretches creak and drop dust (2 s warning, a red circle under the falling
  rock), then rubble falls: damage and a short-lived pile that blocks the way for a few seconds.
- **Drill Lake water** slows (reused from the Vaults).

## Points of interest (targets from §3)
| Type | Count | Notes |
|---|---|---|
| Hub | 1 (+1) | Elevator Station Zero (20, −290); Mining Station Aurum becomes a hub when reclaimed |
| Stronghold | 1 | Mining Station Aurum (240, −190): the governor's security force (humans) |
| Dungeon | 5 | D1 Shaft 13, D2 The Crystal Labyrinth, D3 The Sunken Drill, D4 The Archive, D5 The Burial Chamber |
| Bunker | 6 | old safety refuges and pump rooms (short, one objective, a cache) |
| World event | 6 | Cave-in Rescue, Burrower Swarm, Lights Out, Security Patrol, Elite Hunt, Supply Drop |
| Echo Relic | 10 | hidden: behind crystals, under the lake catwalks, in dead-end elder alcoves |
| Lore object | 12 | miners' logs, Kade's orders, elder glyph slabs (the revelation is spread across them) |
| Signal Tower | 3 | repeater masts, one per outer subzone |
| Supply crates | ~45 | 6 locked ones need a keycard nearby |
| Stim Pylon | 6 | one of each type |
| Unique feature | 3 | floodlights (permanent light), flares, cave-in tunnels |
| Teleporter | 1 + 5 | Station Zero (hub), Lift Bottom, Upper Shafts, Crystal Caves, Drill Lake, Elder Halls (+ Aurum when reclaimed) |

## Enemies (§4: 40–60 % returning)
| Enemy | Role | Placeholder model (existing) | Returning or new | Behaviour |
|---|---|---|---|---|
| Crystal-Bound Walker | Charger | enemy.infected_colonist, crystal-blue glow | **returning** (variant) | crystal growths reflect some projectiles back |
| Blind Hound | Flanker | enemy.spore_hound, pale | **returning** (variant) | hunts by sound: ignores stealth, drawn to noise (flares, explosions confuse it) |
| Governor's Drone | Shooter | enemy.security_drone, gold/blue | **returning** (variant) | projects a small shield on the nearest ally |
| Ore Crusher | Heavy | enemy.cargo_loader ×1.3, rust | **returning** (variant) | slower, wide ground slam that knocks back |
| Shard Bloater | Kamikaze | enemy.spore_carrier, crystal blue | **returning** (variant) | explodes into a ring of crystal shards (projectiles) |
| Burrower | Ambusher | enemy.lumen_tentacle, dark | new | travels underground (dust trail, untargetable), surfaces under the player with a warning circle, bites, burrows again |
| Crystal Sentinel | Tank | enemy.slagborn, crystal glow | new | crystal shell: reflects part of the damage and ignores elemental damage until the shell breaks |
| Infected Miner | Brawler / thrower | enemy.welder | new | drill lunge; throws telegraphed dynamite |
| Echo | Skirmisher | char.spectre as a hologram (translucent cyan) | new | teleports beside the player; double damage taken in light; flees light |
| Governor's Security | Human soldiers | enemy.sergeant, blue (Trooper) / with energy shield (Shield Officer) | new | Troopers shoot bursts from cover; Shield Officers raise a dome that blocks shots for allies inside |
| Drill Colossus | Elite | enemy.cargo_loader ×1.9, Lumen glow | new | spinning drill sweep (rotating line), charges through rubble |

Returning: 5 of 10 regular types (50 %). Bosses use region enemies as adds.

## Dungeons (procedural, modular rooms; 8–12 minutes; D5 harder)
1. **Shaft 13** — a shaft going straight down. Objective: ride the elevator down three levels: the platform
   moves while waves climb on (defend it); each stop opens a level to clear. Boss: Foreman Dray (Infected
   Miner champion with dynamite volleys).
2. **The Crystal Labyrinth** — crystals reflect light. Objective: turn 3 crystal mirrors so a light beam reaches
   the door (each mirror has four positions; the beam is drawn as you turn them). Boss: The Prism (Crystal
   Sentinel champion).
3. **The Sunken Drill** — inside the drill under the lake; half-flooded (water slows). Objective: destroy the
   drill's 3 power cores while the drill's machinery keeps sweeping the corridors. Boss: The Drowned Engine
   (Drill Colossus).
4. **The Archive** — the elder archive, lore-heavy. Objective: activate 4 memory crystals; each plays a
   fragment of the revelation. Boss: The Archivist (Echo champion that splits into copies).
5. **The Burial Chamber** — the elder burial site, recommended level +3. Objective: clear it. Boss: The Elder
   Guardian (boss.the_first ×1.6, cyan glow; three phases, guaranteed legendary).

## Stronghold: Mining Station Aurum
The governor's private security has taken the station: humans with advanced technology, not infected.
Three **shield generators** make every defender nearby invulnerable; destroy them while Troopers, Shield
Officers and Governor's Drones counterattack, then **Security Chief Marta Holm** (Trooper ×1.4, shield and a
grenade barrage). Reclaimed, the miners move in: a hub with a teleporter and two side quests.

## Region boss: Governor Kade (Drill Control)
Kade has wired himself into Lumen-amplifying powered armour (placeholder: the Bastion armour ×1.35, gold glow).
- **Phase 1 — the control room:** he fights behind a frontal energy shield (hit him from the sides or behind),
  calls Governor's Drones, and fires a telegraphed energy cannon (a beam, reused from the Warden).
- **Phase 2 (60 %) — the drill wakes:** he plugs into the Main Drill and becomes immune; the drill head sweeps
  the arena as a slow rotating beam that must be dodged, while the player destroys 4 power conduits.
- **Phase 3 (30 %) — Lumen takes him:** a fusion of man, machine and light (bigger, cyan glow). He teleports
  around the arena, leaving light pulses where he lands, and Echoes join the fight.

**After the fight:** Kade's last log reveals where the uploaded civilisation's core lies (the Core, region 5).
Whoever followed you from the Vaults (Okafor if you spared the Mother Tree, Ruiz if you burned it) has a short
scene and their own side quest in Station Zero.

## Quests (English text; dialogue tone as §11.4)
**Main quests (6):** *Going Down* (ride the lift, reach Station Zero), *Lights in the Dark* (switch on the
first floodlight; teaches darkness and flares), *The Missing Shift* (Shaft 13), *Aurum* (reclaim the station),
*The Elder Gate* (the Archive: the revelation), *The Governor* (defeat Kade at the Main Drill).

**Side quests (10):** *Lost Crew* (find a missing mining crew), *Shortcuts* (repair three elevators: each
unlocks a teleporter), *Rosetta* (translate 5 elder glyph fragments), *The Blind One* (a named Blind Hound),
*Dynamite* (recover stolen explosives from Infected Miners), *Crystal Song* (tune three crystals by breaking
them in order), *The Drowned* (the Sunken Drill), *Prism* (the Crystal Labyrinth), *Canary* (find the last
canary before the gas does), and the follower's own quest (*Okafor: Roots Below* or *Ruiz: Old Orders*).
**Mystery:** *The Whisper* — a voice in the Elder Halls that says your name.

## Hub: Elevator Station Zero
The last working elevator, barricaded by miners. Built from existing pieces (elevator foundation, pump house,
barricades, generators, emergency lights, cargo crates). NPCs reuse the NPC models: Foreman Hana Brask (story),
a quartermaster (vendor), a blacksmith, an aspect technician, the stash, and the follower from region 3.

## Restoration
Same 5-tier meter. Points from teleporters, side quests, 5 dungeons, 6 bunkers, the stronghold, the boss,
events, relics, floodlights and the revealed map.

## Engine work this region needs
- **Fourth zone and border:** a freight lift at the Vaults' north edge; crossing loads the mines.
- **Walkable area:** tunnels and caverns as the only walkable ground (collision pushes back into it),
  rendered rock walls along the edges, minimap shows only tunnels.
- **Darkness:** very low ambient, the player's lamp, glowing eyes for enemies outside the light,
  floodlights that light an area for good (saved), flares (F, 3 charges), light-sensitive Echoes.
- **Cave-ins:** warned rockfalls on marked tunnel stretches with temporary rubble.
- **New behaviours:** burrowing (untargetable travel + surfacing ambush), reflecting projectiles, damage
  shells immune to elements, dynamite throws, teleporting, ally shield domes, frontal boss shields, sound
  hunting (drawn to flares and explosions).
- **New dungeon objectives:** moving elevator defence, light-beam mirrors, power cores in a sweeping drill,
  memory crystals (reusing the data terminals).
- **Stronghold with shield generators** that make nearby defenders invulnerable.
- **Boss:** frontal shield, rotating drill-head sweep, teleporting phase.
- **Follower:** an NPC chosen by the region 3 choice (read from the finished-quest record).

## Reuse and Meshy budget (§15.1 step 2)
**Meshy credits: 0.** All models are reused:

| Need | Existing model |
|---|---|
| Crystal-Bound Walker, Blind Hound, Governor's Drone, Ore Crusher, Shard Bloater | infected_colonist, spore_hound, security_drone, cargo_loader, spore_carrier (tinted) |
| Burrower | lumen_tentacle (dark, low) |
| Crystal Sentinel, The Prism | slagborn (crystal glow) |
| Infected Miner, Foreman Dray | welder |
| Echo, The Archivist | char.spectre drawn as a hologram |
| Governor's Security, Security Chief Holm | sergeant (blue) |
| Drill Colossus, The Drowned Engine | cargo_loader ×1.9 |
| The Elder Guardian | boss.the_first ×1.6 |
| Governor Kade | char.bastion ×1.35 (powered armour) |
| Main Drill | giant_crane, the_pillar, pipe_section at large scale |
| Crystals, crystal pillar | lumen_growth / lumen_wrath tinted blue |
| Rails, carts, timber, lamps | catwalk, cargo_crate, wall_segment, emergency_light |
| Floodlights | generator, emergency_light, stim_pylon (crystal brazier) |
| Station Zero | elevator_foundation, pump_house, barricade, generator, cargo_crate |
| Elder architecture | renderer-built geometric slabs and pillars (no model) |
| Hub NPCs | technician, cook, blacksmith, pump_engineer, defector |

When credits return, the assets worth replacing first are: Governor Kade, the Echo, the Burrower, the Crystal
Sentinel, the Main Drill and an elder pillar.

## Build order
- **R4-A** zone, lift from the Vaults, tunnels and caverns, walls, darkness, floodlights, flares, cave-ins,
  greybox of landmarks, hub, POIs and packs.
- **R4-B** the enemies and their behaviours.
- **R4-C** content: Station Zero NPCs and quests, 5 dungeons, bunkers, Aurum, Kade, events, follower.
- **R4-D** region report, playtest numbers, docs, screenshots; then I wait for your feedback.
