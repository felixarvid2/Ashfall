# Region 3 plan: The Hydroponic Vaults (levels 20–30)

Source: docs/world-and-gameplay.md §5 (Region 3). Units are metres; +x east, +z north. As in the first two
regions, positions are written in design coordinates (x, z ∈ [−340, 340]) and multiplied by 2.2 in the game
(1500 × 1500 m). The region continues north from the Refinery District: a new road leaves the Smelters'
Cathedral steps and crosses into the Vaults at their south edge, following Governor Kade's trail.

**Story in one line:** the colony's farming domes have become an alien jungle. In Lab 9 the player finds the
chief biologist, Dr. Amara Okafor, who believes Lumen has a will of its own and might be reasoned with. The
region is about doubt: an enemy to destroy, or something else? It ends at the Mother Tree with a choice to
burn it or spare it.

**No new 3D models this region** (Meshy credits are used up). Every model below is an existing asset, varied
with tint, glow and scale, or built from simple shapes in the renderer (glass dome ribs, water). Ground
textures start from the current set and can be replaced with Gemini textures later, as in regions 1 and 2.

## Map

```
 z ▲
340 ┌──────────────────────────────────────────────────────────────────────────┐
    │  THE ROOT NETWORK (roots, spore fields)      ✿ THE MOTHER TREE           │
    │   D2 Cocoon Chamber   R   T4▲        (The Great Dome, region boss) ☠     │
240 │        B4   ░░░spores░░░          ══════╗          SEED BANK (frozen)    │
    │   (event: Root Eruption)                ║      T5▲   D1 Seed Bank Depths │
120 │  ░░░░░░░ ══════════ ring ═══════════════╬════════════════╗   B5          │
    │  THE GREEN SEA (fungal trees)    T3▲    ║  ≈ COLLAPSED   ║  (event)      │
  0 │   ░░░spores░░░   B3                     ║  ≈ DAM (basin) ║               │
    │      (event: Spore Bloom)     D3 Irrigation System       ║    B6         │
−120│  ▣ DOME GAMMA (stronghold)        OUTER DOMES (crops)    ║               │
    │     B1          T2▲   B2        D4 Sleeping Lab   ⚗ LAB 9 (hub, T1)      │
−240│                                                    ═════╝                │
    │                                                   ║ ← from the Refinery  │
−340└───────────────────────────────────────────────────╨──────────────────────┘
   −340                              0                       150             340  x ▶
```

## Subzones
| # | Subzone | Area | Identity |
|---|---|---|---|
| 1 | The Outer Domes | S, centre (20, −190) | rows of half-infected crops, irrigation pipes, tanks; the transition zone |
| 2 | The Green Sea | W, centre (−190, −10) | fully overgrown domes; fungal trees tens of metres tall; spore fields |
| 3 | The Seed Bank | E, centre (210, 130) | the frozen gene bank, now infected; frost vents, cold blue light |
| 4 | The Root Network | NW, centre (−150, 250) | Lumen roots broken up through the ground; an organic maze; spore fields |

**Landmarks:** *The Mother Tree* (a giant Lumen tree beside the Great Dome, centre north
(60, 270), visible from everywhere; built just west of the arena so its canopy never hides the fight), the *collapsed irrigation dam* in the middle (40, 40) with a flooded
basin, and *Lab 9's warning lights* near the entrance. Glass domes are drawn as rings of ribs over each
subzone.

**Hazard: Spore Fields.** Areas of the Green Sea, the Root Network and Dome Gamma are full of spores that
build up poison while you stand in them (a slowly rising damage over time, shown on screen). Clean air:
near an active air filter, in bunkers and in hubs. **Air filters** (6) can be switched on to clear their
area for good (saved). Enemies are not hurt by spores.
**Positive mechanic: glowing crystals.** Breaking a crystal releases a light burst that blinds nearby enemies
for 3 seconds (they stop attacking and moving). Crystals grow back after a while.

## Points of interest (targets from §3)
| Type | Count | Notes |
|---|---|---|
| Hub | 1 (+1) | Lab 9 (110, −240); Dome Gamma becomes a hub when reclaimed |
| Stronghold | 1 | Dome Gamma (−270, −170): destroy 5 Root Nodes while Lumen counterattacks harder after each |
| Dungeon | 4 | D1 Seed Bank Depths, D2 The Cocoon Chamber, D3 The Irrigation System, D4 The Sleeping Lab |
| Bunker | 6 | air-filter stations and hydro maintenance rooms (short, one objective, a cache) |
| World event | 6 | Spore Bloom, Swarm Migration, Root Eruption, Rescue Operation, Elite Hunt, Supply Drop |
| Echo Relic | 10 | hidden: under fungal trees, on dam rubble, deep in root tunnels |
| Lore object | 12 | Okafor's field notes, her dead colleagues' recordings, Kade's trail toward the Deep Mines |
| Signal Tower | 3 | one per outer subzone |
| Supply crates | ~40 | 6 locked ones need a keycard nearby |
| Stim Pylon | 6 | one of each type |
| Unique feature | 2 | air filters (clear spore fields), glowing crystals (blinding burst) |
| Teleporter | 1 + 5 | Lab 9 (hub), Zone Gate, Outer Domes, Green Sea, Seed Bank, Root Network |

## Enemies (§4: 40–60 % returning)
| Enemy | Role | Placeholder model (existing) | Returning or new | Behaviour |
|---|---|---|---|---|
| Overgrown Walker | Charger | enemy.infected_colonist, moss tint | **returning** (variant) | covered in vines; every few hits roots the player for 1 s |
| Spore Hound | Flanker | enemy.spore_hound | **returning** (original) | larger packs (5–7) |
| Swarm Bloater | Kamikaze | enemy.spore_carrier, green | **returning** (variant) | spore-cloud blast that releases 3 small Spore Swarms |
| Mossborn | Tank / support | enemy.slagborn, moss tint | **returning** (variant of a region 2 enemy) | heals nearby Lumen creatures |
| Vine Weaver | Controller | enemy.lumen_tentacle (moves slowly) | new | lashes from range and pulls the player toward it |
| Spore Swarm | Swarm | enemy.security_drone, small, green | new | hard to hit (dodges some attacks), poisons |
| Cocoon Warden | Guard | enemy.sergeant, moss tint | new | guards spore nests; calls reinforcements if not killed within ~8 s |
| Mutated Botanist | Shooter | enemy.smelter, green tint | new | spore spray cone and lingering spore clouds |
| Lumen Giant | Elite | boss.the_first ×1.5, crystal glow | new | slow, devastating slams; regrows from nearby fungi unless they are destroyed |
| Warden of the Mother Tree | Region boss | enemy.cargo_loader ×2.4, green glow | new | three phases (below) |

Returning: 4 of 9 regular types (44 %). New types use existing models with new tints, sizes and
behaviours. Bosses use region enemies as adds.

## Dungeons (procedural, modular rooms; 8–12 minutes)
1. **Seed Bank Depths** — frozen and infected; frost vents freeze anyone standing in them. Objective: find
   3 seed vaults (3 objects in side rooms). Boss: The Keeper (Mossborn champion, frost tint).
2. **The Cocoon Chamber** — cocoons hatch as the player passes. Objective: destroy the Mother Cocoon (a
   stationary target that keeps spawning Spore Swarms), guarded by two Cocoon Wardens.
3. **The Irrigation System** — half-flooded tunnels; water slows everyone. Objective: drain the water level
   by level (3 pump levers, each clears the water from a section). Boss: Vine Matriarch (large Vine Weaver).
4. **The Sleeping Lab** — where Okafor's colleagues died; lore-heavy. Objective: recover research data
   from 4 terminals (each plays a short log). Boss: Dr. Ilse Varga (Mutated Botanist champion).

## Stronghold: Dome Gamma
One of the largest spore nests. Five Root Nodes (existing spore-nest model) are spread across the dome.
Each one destroyed sends a stronger counterattack (Overgrown Walkers → Vine Weavers and Mossborn → a Lumen
Giant). The dome is a spore field until it is reclaimed. Reclaimed, its filters come back on: it becomes a
hub with a teleporter and two new side quests.

## Region boss: The Warden of the Mother Tree (The Great Dome)
A giant hybrid of an old harvesting machine and Lumen.
- **Phase 1:** it walks the arena firing telegraphed spore beams. It takes very little damage until its 3
  armour plates (separate targets on its body) are destroyed, exposing the weak points.
- **Phase 2 (60 %):** it takes root and cannot be hurt; vines cover the floor (slowing). The player destroys
  4 Root Nodes to free it while Overgrown Walkers climb out of the vines.
- **Phase 3 (30 %):** the Mother Tree joins: huge roots slam down at telegraphed spots near the player while
  the Warden fights on.

**Moral choice:** after the fight, at the foot of the Mother Tree: **burn** it or **spare** it. It changes a
few lines of dialogue, which unique item you get (*Ashen Heartwood* or *Seed of Accord*) and who follows you
to region 4 (Corporal Ruiz from Dome Gamma, or Dr. Okafor). It locks out no content. Saved per character.

## Quests (English text; dialogue tone as §11.4)
**Main quests (6):** *The Green Door* (cross into the Vaults, reach Lab 9), *Clean Air* (switch on the first
air filter; introduces spore fields), *Okafor's Seeds* (Seed Bank Depths), *Gamma* (reclaim Dome Gamma),
*The Sleepers* (the Sleeping Lab: what happened to Okafor's team), *The Mother Tree* (defeat the Warden and
make the choice; Kade's trail leads down into the Deep Mines).

**Side quests (10):** *Samples* (collect 5 Lumen samples for Okafor), *The Infected Researcher* (save him or
end it — a choice), *The Melody* (find the source of a strange melody in the jungle), *Dam Repair* (turn three
dam valves to lower the basin), *Swarm Queen* (hunt a named Spore Swarm), *Lost Harvest* (bring food crates to
Lab 9), *Crystal Light* (blind 10 enemies with crystals), *Seed Courier* (escort a technician to the Seed
Bank), *Overgrown Patrol* (find a missing patrol's tags), *Cold Storage* (restore power to the Seed Bank
freezers). **Mystery:** *The Gardener* — someone keeps tending one perfect row of crops in the Outer Domes.

## Hub: Lab 9
A sealed research facility with filtered air, built from existing pieces (pump house, walls, terminals,
generators, emergency lights). NPCs use existing NPC models re-tinted: Dr. Amara Okafor (main quests),
a quartermaster (vendor), a blacksmith, an aspect technician, plus the account stash.

## Restoration
Same 5-tier meter per region with account-wide rewards. Points from teleporters, side quests, 4 dungeons,
6 bunkers, the stronghold, the boss, events, relics, air filters and the revealed map.

## Engine work this region needs
- **Third zone and border:** a road from the Cathedral steps to the Refinery District's north edge; crossing
  loads the Vaults (same fade and per-zone state as before).
- **Spore fields and air filters** (poison build-up, clean areas, filters that clear an area for good, saved).
- **Glowing crystals** (breakable, blind enemies in a radius for 3 s, grow back).
- **Water** that slows everyone and can be drained (Irrigation System, dam basin).
- **New statuses and behaviours:** rooted (cannot move), pulled toward an enemy, dodging swarms, healing
  allies, calling reinforcements, regrowing near fungi, spawning swarms on death.
- **New dungeon objectives:** collect 3 seeds, hatching cocoons + Mother Cocoon, drain levers, data terminals.
- **Stronghold with escalating waves** per Root Node destroyed.
- **Boss:** armour plates as separate targets, an immune rooted phase with Root Nodes, telegraphed root slams.
- **Moral choice** stored in the save (version 8), two unique items, a follower flag for region 4.
- **Renderer:** glass dome ribs and a Mother Tree landmark built from existing models at large scale.

## Reuse and Meshy budget (§15.1 step 2)
**Meshy credits: 0.** All models are reused:

| Need | Existing model |
|---|---|
| Overgrown Walker, Spore Hound, Swarm Bloater, Mossborn | infected_colonist, spore_hound, spore_carrier, slagborn (tinted) |
| Vine Weaver, boss roots | lumen_tentacle (scaled) |
| Spore Swarm | security_drone (small, green) |
| Cocoon Warden | sergeant (moss tint) |
| Mutated Botanist, Dr. Ilse Varga | smelter (green tint) |
| Lumen Giant | the_first (×1.5, crystal glow) |
| Warden of the Mother Tree | cargo_loader (×2.4, green glow) |
| Root Nodes, cocoons, Mother Cocoon | spore_nest, spore_feeder (scaled) |
| Fungal trees, Mother Tree, crystals | lumen_growth (very large / tinted), lumen_wrath |
| Air filters | compressor, generator |
| Lab 9 and domes | pump_house, industrial_wall, wall_segment, control_terminal, generator, emergency_light, pipe_section, water_tanker |
| Hub NPCs | technician, cook, blacksmith, pump_engineer (re-tinted) |
| Icons | existing icons (samples, seeds and data reuse the relic, keycard and lore icons) |

When credits are available again, the assets worth replacing first are: the Warden boss, Vine Weaver, Spore
Swarm, Mutated Botanist, the Mother Tree, a fungal tree and a glass dome.
