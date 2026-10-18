# Region 5 plan: The Core (levels 40–50)

Source: docs/world-and-gameplay.md §5 (Region 5) and docs/design-brief.md ("Kärnan": Lumen's heart, organic
architecture fused with technology). Units are metres; +x east, +z north. Positions are design coordinates
(x, z ∈ [−340, 340]) multiplied by 2.2 in the game (1500 × 1500 m), as in the earlier regions.

**Story in one line:** Kade's Main Drill broke through into the place where the light began. Below it lies the
Core: Lumen's heart, a cathedral-sized cavern where machine and organism have grown into each other, and in its
middle the old space elevator shaft rising straight up through the rock. Lumen is climbing it towards the
orbital station. The player follows, faces the people Lumen has taken, and decides how it ends.

**Mood:** surreal, majestic, frightening. Huge open spaces with no visible ceiling, light that pulses like a
heartbeat, walls that breathe. Not dark like the mines: the Core is lit from within, gold-white and violet.

## Scope of this region (decisions)

Built now:
- The zone, the gate from the Deep Mines, the hub, four subzones, Unstable Gravity, energy bridges.
- The roster (Memory Shades, Light Beings, Core Guardians, The Absorbed, the Choir), four dungeons, three
  Memory Mirrors, the Elevator Base stronghold, Memory Shade minibosses, and Lumen with four phases.
- Main quests to the end of the campaign, side quests, events.

Simplified, with the reason:
- **Lumen phase 3** (Lumen takes an ally's form and asks the player to stop) is one scripted beat built on the
  dialogue-choice system from the Vaults' moral choice: *Listen* or *Fight*. Both lead into phase 4; the choice
  only changes the epilogue text. No branching boss fight.
- **Memory Mirrors** are three short instances on the existing instance system (bunker-sized), each a
  distorted piece of an earlier region built from that region's kit and enemies. They replace the bunkers.
- **The Endless Shaft** gets harder per floor through pack density, champion share and elite affixes, not
  through monster level: levels stop at 50 (`maxLevel`), and dungeons already cap at zone max + 1.

Deferred, not part of this region:
- **The Core as an endgame area** with stronger enemies after the campaign, World Tiers, Deep Rifts, Ash
  Harvest: none of these systems exist yet; they belong to the endgame phase.
- **Choir-like sacred music:** the zone uses existing tracks; a fitting CC0 track is a follow-up.

## Map

```
 z ▲
340 ┌──────────────────────────────────────────────────────────────────────────┐
    │                         THE HEART (Lumen, arena)                         │
    │                    ☠ Lumen's heart       D4 Chamber of Creation ◈         │
240 │          ~ gravity ~        ║                                              │
    │                             ║ heart causeway                               │
    │  THE HANGING GARDENS        ║                     THE MEMORY HALLS         │
140 │  ◯──◯  islands on           ▣ ELEVATOR BASE       ash · fire · jungle ·    │
    │   ╲ ╱  energy bridges       ┃ (stronghold, at     dark patches             │
 40 │  ◯──◯──◯   ~ gravity ~      ┃  the shaft's foot)  D1 Memory of Ember ◈      │
    │   D3 Singing Halls ◈        ┃ space elevator      ⬡ M1 ⬡ M2 mirrors         │
    │   ⬡ M3                      ┃ shaft (landmark)                             │
−60 │═══════════════════════ melt road ═══╬════════════════════════════════════  │
    │                            ⌂ THE LAST CAMP (hub, sealed shaft section)     │
−180│           THE BORDERLAND (mine turning into Lumen matter)                  │
    │      D2 The Endless Shaft ◈                                                │
−300│                         ▼ drill bore from the Deep Mines (gate)            │
−340└──────────────────────────────────────────────────────────────────────────┘
      −340                              0                                   340 x
```

- **Gate:** the bore Kade's Main Drill punched through the floor (Deep Mines, at `MAIN_DRILL`) drops into the
  Borderland's south edge. It opens when the Deep Mines' last main quest is done.
- **The space elevator shaft** stands at the centre (0, 60): a column of light and steel rising out of sight,
  visible from everywhere, like the Mother Tree and the crystal pillar before it.
- **Ceiling:** high above the Memory Halls hangs a mirror image of Outpost Ember, upside down (renderer
  decoration made from Cinder Flats props).

## Subzones

1. **The Borderland** (south, levels 40–42): mine tunnels and machinery melting into Lumen matter. Rock walls
   like the mines near the gate, opening into the cavern. Walkable everywhere except the melt pools.
2. **The Hanging Gardens** (west, 43–46): floating islands of Lumen matter over a glowing abyss, joined by
   energy bridges. Only islands and bridges are walkable (a walkability mask like the mines' caves). Some
   bridges flicker on and off on a cycle. Unstable Gravity here.
3. **The Memory Halls** (east, 43–46): Lumen's distorted copies of earlier regions as patches: ash fields,
   refinery fire, vault jungle, mine darkness, each with that region's ground, props and shades. Two mirrors.
4. **The Heart** (north, 47–50): the core chamber around Lumen's pulsing heart. Unstable Gravity in waves.
   Reached over the heart causeway after the Elevator Base.

## Environmental hazard: Unstable Gravity

Areas marked as gravity fields shift periodically: 1.5 s of visible shimmer (ground ripples, floating dust)
warns, then for 4 s everything inside is pulled in one direction (player and enemies drift; projectiles
curve). Pull strength is about a third of walking speed, so it pushes without trapping. Fields in the
Hanging Gardens push towards the abyss edges (the edge itself still blocks), fields in the Heart rotate.

## Enemies (§4: 40–60 % returning)

Every third-party model here is a pure Lumen creation and gets the Lumen look (a dark indigo body with a low
violet glow and a gold-white fresnel rim; the ground is pale, so a bright body would wash out), which hides its
low-poly style. Shades and the Absorbed reuse existing models through the
variant path the earlier regions use (tint, glow, scale, hologram).

| Enemy | Role | Model | Returning or new | Behaviour |
|---|---|---|---|---|
| Shade Walker | Charger | enemy.infected_colonist, shade look | **returning** (memory shade) | on death splits into two short-lived echoes |
| Shade Hound | Flanker | enemy.spore_hound, shade look | **returning** | blinks a short distance before its leap |
| Shade Smelter | Heavy | enemy.smelter, shade look | **returning** | its fire pools drift with gravity |
| Shade Weaver | Controller | the Vaults' vine weaver, shade look | **returning** | roots, and its vines pull towards it |
| Shade Sentinel | Tank | Crystal Sentinel (enemy.slagborn), shade look | **returning** | reflects projectiles while its shell holds |
| Shade Drone | Shooter | enemy.security_drone, shade look | **returning** | shots curve towards the player |
| Light Being | Skirmisher | Quaternius Cyberpunk *Enemy_Flying*, Lumen look | new | fast, erratic strafing, short blinks |
| Light Mote | Swarm | Quaternius Space Kit *Enemy_ExtraSmall*, Lumen look | new | swarms of 5–8, headbutt, burst on death |
| Core Guardian | Heavy / support | Quaternius Animated Mech (*Stan*) ×1.6, Lumen look | new | slow, stately; projects a shield on allies nearby |
| Guardian Lancer | Shooter | Quaternius Cyberpunk *Enemy_Large*, Lumen look | new | charged beam shots with a telegraph line |
| The Absorbed | Named elites | existing NPC models, Lumen variant | new | each has a name and one line; fights with its old trade's tools |
| Choir | Elite group | Quaternius MegaKit aliens (*Oculichrysalis*), Lumen look | new | 3 rooted singers; empower all enemies in range until killed |

Returning: 6 of 11 regular types (55 %). Models without a death clip die by a fade-and-shrink in code.
Earlier region bosses return as **Memory Shade minibosses** (The First, Vire, the Warden, Governor Kade) in the
Memory Halls, the Elevator Base and the dungeons.

New enemy defs set `family` (machine for guardians and lancers, organic for shades and the Absorbed, a new
`light` family for Light Beings, Motes and the Choir) so their deaths have the right sound.

## Dungeons (procedural, modular rooms; 8–12 minutes)

1. **Memory of Ember** (D1, Memory Halls): a distorted Outpost Ember built from Cinder Flats pieces, tinted and
   wrong. Boss: Shade of The First.
2. **The Endless Shaft** (D2, Borderland): a vertical dungeon of floors; each floor adds density, champions and
   elite affixes. Ends when the player leaves or dies; best floor is remembered.
3. **The Singing Halls** (D3, Hanging Gardens): sound is the mechanic: enemies hunt by hearing (the mines'
   hearing behaviour), and choir pillars that ring draw every enemy in the room. Boss: the First Choir.
4. **The Chamber of Creation** (D4, the Heart): close four hatching portals; each spawns enemies from a
   different earlier region. Boss: the Brood Engine.

**Memory Mirrors** M1–M3: three short instances (ash, refinery, vault memories) with lore and a reward chest.

## Stronghold: The Elevator Base

The last defence before the shaft. Waves of shades and Lumen creatures with three Memory Shade minibosses
(Vire, the Warden, Kade). Allies from earlier regions arrive as fighting NPCs during the waves. Clearing it
opens the heart causeway and turns the Base into a fast-travel point.

## Final boss: Lumen, The One Who Remembers (the Heart)

- **Phase 1:** a gigantic light structure using attacks of every earlier boss in new combinations (the existing
  boss attack primitives).
- **Phase 2:** the arena turns into a memory of each earlier region in quick succession (ash fog, heat vents,
  spores, darkness), about 15 s each, each with its hazard and a few of its enemies.
- **Phase 3:** Lumen takes an ally's form and speaks: *Listen* or *Fight* (dialogue choice). Both lead to
  phase 4; the choice sets the epilogue.
- **Phase 4:** Lumen's core is exposed; short and intense.

Then the epilogue card and the credits.

## Quests (English text; dialogue tone as §11.4)

- 6 main quests: The Bore, The Last Camp, Bridges of Light, What Lumen Remembers, The Elevator Base, The One
  Who Remembers.
- 8 side quests (the Absorbed, mirror lore, the shaft's best floor, a lost ally from each earlier region).
- A mystery across the Memory Halls.

## Hub: The Last Camp

A sealed section of the elevator shaft's service tunnel, held by the allies from every region: blacksmith,
vendor, technician and stash as in the other hubs, plus returning NPCs.

## Engine work this region needs

- Gate unlock on a finished quest (if gates can't do that yet).
- Walkability mask for the Hanging Gardens (islands and bridges, reusing the mines' cave grid) and bridges that
  switch on and off.
- Unstable Gravity (fields, shimmer telegraph, pull on movement and projectiles).
- The Lumen look for third-party models and the shade look for returning enemies.
- Fade-and-shrink death for models without a death clip.
- Core Guardian ally shield and the Choir's empower aura (reuse the ward and elite-affix systems where possible).
- Endless Shaft floor scaling; portal objective for the Chamber of Creation.
- Lumen phase 2 arena changes and the phase 3 dialogue beat with an epilogue flag.

## Look (renderer: `src/render/coreLook.ts`, zone data in `theCore.ts`)

Lit from within, not dark like the mines: a gold-white hemisphere light over a violet bounce, violet fog, a warm
colour grade (`ZoneDef.hemisphere`, `fog`, `grade`). The ground is **Lumen matter** (`lumen_matter.webp`, made
by `scripts/art/lumenMatter.ts`): pale pearl stone with gold and violet veins that glow. The mines' rusty plate
survives only along the bore and fades out over the Borderland (ground patches, no road ribbons); the Last
Camp and the Elevator Base have clean concrete slabs; each Memory Hall keeps its region's ground.

- **Abyss:** the ground plane is cut open over the abyss and the bridge strips by a smoothed mask, so island edges
  are round; a soft gold lip glows along them, rock hangs below each island (tapering to a point) and a deep
  violet and gold glow lies far under everything. Glow motes rise out of it instead of ash falling.
- **Bridges:** thin gold rails with posts and a translucent band of running light that fades in and out with its
  cycle (flicker as the warning).
- **The shaft:** a steel core with six columns round its foot and a column of light rising out of sight
  (`ZoneDef.beams`); Lumen's heart has a violet one. The camera sees about 20 m of ground ahead, so the
  light is read from near the shaft; from afar the minimap's Elevator Base marker is the guide.
- **Memory Halls:** each memory scatters its region's props as distorted copies (`ScatterDef.within` with
  `tilt`, `lift`, `ghost`): leaning, floating a little, violet-rimmed and see-through at the edges.
- Columns are 5 m at scale 1: the shaft core is 17 m (scale 3.4), everything else 6–7 m. Never give a column a
  `glow` (a flat emissive over metal turns it cream).

## Assets (free libraries, no Meshy)

All CC0, recorded in docs/credits.md, sources kept in the felixarvid2/assets repository under `third-party/`:
- Quaternius Cyberpunk Game Kit (Enemy_Flying, Enemy_Large), Ultimate Space Kit (Enemy_ExtraSmall), Animated
  Mech Pack (Stan), Modular SciFi MegaKit (alien Oculichrysalis; walls, columns, platforms and props for the
  Elevator Base and the Borderland's machinery).
- Kenney Space Station Kit pipes for the melting machinery.
- ambientCG MetalPlates017A for the Base floors.

## Build order

- **R5-A** zone, gate from the mines, Borderland walls, Hanging Gardens islands and bridges, Unstable Gravity,
  the shaft landmark, greybox of hub, POIs and packs; model imports.
- **R5-B** the enemies and their behaviours, Lumen and shade looks.
- **R5-C** content: Last Camp NPCs and quests, 4 dungeons, mirrors, Elevator Base, minibosses, Lumen, events,
  epilogue.
- **R5-D** region report, playtest numbers, docs, screenshots, artifact; then I wait for your feedback.
