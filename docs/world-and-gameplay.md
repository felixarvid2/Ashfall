# Ashfall – World Design and Gameplay

This document describes **how the world of Ashfall is built and how the game should feel to play**. It complements `ASHFALL_INSTRUCTIONS.md`, which covers technology, classes, skills, loot and the asset pipeline. If the two documents conflict, this document wins for everything related to the world, level design, enemies, quests and player experience.

**The game is English only.** All place names, enemy names, NPC names, dialogue, quest text and UI must be in English.

**Build the world one region at a time.** Do not build all regions in parallel. Finish one region until it passes the checklist in section 15, let me play it, and wait for my feedback before moving on to the next region.

---

## 1. Design pillars

Everything in the world and the player experience must support these five pillars. If you are unsure about a design decision, choose the option that best strengthens them.

1. **Danger and atmosphere (Diablo 2).** The world is hostile. Darkness, sound and environment should make the player feel small and exposed. Safety exists only in hubs.
2. **Power and flow (Diablo 3).** Combat must be fast, clear and satisfying. The player should often feel powerful, especially when a build starts to come together.
3. **Discovery (Diablo 4).** The world rewards exploration. Behind every side path there should be something: a chest, a small dungeon, a lore note, an event or a permanent bonus.
4. **The loot hunt.** Any enemy can drop something that changes the game. The world must be built so the player keeps killing enemies at a steady pace and sees loot drop.
5. **Readability.** Despite the darkness, the player must always be able to see what is dangerous, what is interactive and where they can go.

## 2. World structure

### 2.1 Open world + instances
Ashfall combines Diablo 4's **open connected world** with Diablo 2 and 3's **randomized dungeons**:

- **Open world:** Five regions connected seamlessly. The player can walk from one region to the next without a loading screen (streamed loading). Regions have a fixed, hand-designed layout so landmarks, roads and story beats are always in the same place.
- **Instances:** Dungeons, bunkers (small mini-dungeons) and boss chambers load as separate instances. Their layouts are generated procedurally from modular pieces each time they are created, just like in Diablo 2.
- **Hubs:** Safe towns or bases where combat is disabled.

### 2.2 Scale and density
- A region should take **5–7 minutes** to walk straight through without fighting, and **3–5 hours** to explore fully with all side quests, dungeons and secrets.
- Each region is divided into **3–4 subzones**, each with its own visual identity.
- **Enemy density:** One enemy pack roughly every 15–25 meters along main roads. The player should rarely go more than 5–8 seconds without combat in dangerous areas. Roads between hubs can be sparser.
- **Points of interest (POIs):** Something to discover at least every 30–40 seconds of exploration.

### 2.3 Navigation
- **Teleporters** (the equivalent of waypoints): One in every hub and 3–5 scattered across each region. They must be discovered on foot before they can be used.
- **Fog of war:** The map starts black and is revealed as the player explores. The percentage of the map revealed counts toward the region's exploration rewards.
- **Vehicle:** From region 2 the player can unlock an **all-terrain motorbike** (the equivalent of the mount in Diablo 4) for faster travel in the open world. It cannot be used in dungeons or hubs, and the player is knocked off if hit by a strong attack.
- **Paths and landmarks:** Each region has 2–3 large landmarks visible from far away (a burning refinery smokestack, a crashed freighter, a gigantic Lumen tree). The player should be able to orient by them without a map.

### 2.4 Level scaling
- **During the campaign**, each region has a recommended level range (see section 5). Enemies in a region scale within that range based on the player's level, so the player can never completely outlevel a region but is never completely overwhelmed either.
- **After the campaign**, the entire world scales to the player's level and World Tier, so every region stays relevant in the endgame.

## 3. Points of interest (POIs) – building blocks for every region

All regions are built from the same set of building blocks. Each one must be a reusable template in code, filled with region-specific content.

| Type | Description | Count per region |
|------|-------------|------------------|
| **Hub** | Safe zone with vendors, blacksmith, Technician (aspects), stash, teleporter, quest givers | 1 (+ strongholds that become hubs) |
| **Stronghold** | Enemy-fortified area with several waves and a boss. When reclaimed, it becomes a new hub and unlocks new side quests | 1–2 |
| **Dungeon** | Instance with procedural layout, objective and final boss. Grants a Codex aspect the first time | 3–5 |
| **Bunker** | Mini-dungeon (1–3 minutes): a short sequence of rooms with a single objective and a chest | 6–10 |
| **World event** | Timed event at a fixed location | 6–8 locations |
| **Echo Relic** | Hidden relic from the first colonists. Grants a small **permanent** stat bonus to all characters on the account (the equivalent of Altars of Lilith) | 8–12 |
| **Lore object** | Audio logs, data pads, journals | 10–15 |
| **Signal Tower** | Can be activated to reveal the nearby map | 2–3 |
| **Supply crates** | Chests with loot, sometimes locked and requiring a keycard found nearby | Scattered |
| **Stim Pylon** | Grants a powerful temporary buff for 60 seconds (the equivalent of shrines) | 4–6 |
| **Unique feature** | A location with its own mechanic, for example a crane that can crush enemies | 1–3 |

### 3.1 Stim Pylons (types)
- **Overcharge:** +50% damage.
- **Kinetic:** +40% attack speed and movement speed.
- **Barrier:** Absorbs all damage for 10 seconds.
- **Chain Reaction:** Every enemy that dies explodes.
- **Magnet:** Killed enemies grant double experience.
- **Overclock:** Skills have no cooldown for 8 seconds.

### 3.2 Region Restoration (the equivalent of Renown)
Each region has a **Restoration meter** that fills as the player completes side quests, discovers teleporters, finds Echo Relics, clears dungeons, reclaims strongholds and reveals the map. The meter has 5 tiers with rewards: extra skill points, Matrix points, more stash space, more health injectors and gold. Rewards apply to all characters on the account.

## 4. Enemy roster and reuse

Enemies are expensive to create (both in Meshy credits and in animation work), so **every enemy that has been made must be used in the game, and enemies are reused throughout the game**, not only in the region they were created for.

### 4.1 Rules
- **Check first.** Before planning a new enemy for a region, check `docs/enemy-roster.md`, `assets/manifest.json` and `src/data/enemies/`. If an existing enemy (or a variant of one) can fill the role, use it.
- **No unused enemies.** Every enemy model that exists must appear somewhere in the game: in the open world, a dungeon, an event, a stronghold, a boss fight or the endgame. Run `npm run assets:check` to find unused ones.
- **Each region's roster mixes old and new.** A new region should have roughly **40–60% returning enemies** (as variants adapted to the region) and **40–60% new enemies**. This keeps the world consistent and makes the story of Lumen spreading feel real.
- **Variants first.** When a region needs more variety, make a variant of an existing enemy (retexture, tint, scale, attachments, new behavior or affixes) before generating a new model. See section 9.4 of `ASHFALL_INSTRUCTIONS.md`.
- **Bosses use existing enemies as adds.** Bosses summon or are accompanied by enemies that already exist.
- **The endgame uses every enemy.** Deep Rifts, Ash Harvests and world events draw from the full enemy roster of all regions.

### 4.2 Examples of reuse in this world
- **Ash Walkers** (region 1) return in the Refinery District as **Scorched Walkers** (burned retexture, fire damage on death), in the Hydroponic Vaults as **Overgrown Walkers** (covered in vines), in the Deep Mines as **Crystal-Bound Walkers**, and in the Core as **Memory Shades**.
- **Spore Hounds** (region 1) return as **Slag Hounds** in region 2 and as **Blind Hounds** that hunt by sound in the darkness of region 4.
- **Sentry Drones** (region 1) appear in every region with new weapon loadouts and the governor's security colors in region 4.
- **Bloaters** (region 1) return in every region with a new explosion element (fire, toxic, crystal shards, void).
- **The Core** (region 5) deliberately features distorted versions of enemies from every earlier region.

### 4.3 The enemy roster document
`docs/enemy-roster.md` must list every enemy with: name, asset id, role (section 8.2), family, regions and content it appears in, and variants. Update it whenever an enemy is added or reused.

## 5. The regions

For each region the document lists theme, story function, subzones, landmarks, enemies, environmental hazards, dungeons, stronghold, boss and mood. Use this as the foundation, but feel free to add your own ideas in the same spirit. Names of places, enemies and NPCs may be refined. Enemies listed as "returning" must reuse existing models as variants.

---

### Region 1: Cinder Flats (levels 1–10)
**Theme:** A devastated landing zone, ash fields, crashed landers and abandoned checkpoints. Constantly falling ash.
**Story:** The player lands in an escape pod after answering the governor's distress signal. Introduction to Lumen, the colony's fate and the main characters. The act ends when the player learns that the governor himself kept the drills running despite the warnings.
**Mood:** Loneliness, silence, wind. Ash swirling around. Far away, metal creaks.

**Hub:** **Outpost Ember**, a barricaded fuel station where a handful of survivors live. The vendor is a former cook, the blacksmith a miner, and the Technician a young data engineer.

**Subzones:**
1. **The Impact Fields:** Craters, burning wreckage. The introduction area with weak enemies.
2. **Route 7:** An elevated highway with abandoned vehicles and convoys. Plenty of supply crates.
3. **Ash Valley:** A depression with a thick ash storm that limits visibility.
4. **Checkpoint Sierra:** A military area with bunkers and watchtowers.

**Landmarks:** The crashed freighter *Meridian* (visible across the whole region), a gigantic space elevator foundation broken halfway up, and the burning refinery on the horizon (pointing the way to region 2).

**Enemies (all new – this region establishes the base roster):**
- **Ash Walker:** Infected colonists. Slow, come in large groups. Basic enemy.
- **Spore Hound:** Mutated mining dogs. Fast, attack in packs and flank.
- **Sentry Drone:** Hijacked security drones that shoot from range.
- **Bloater:** Swollen infected that explode in a toxic cloud on death.
- **Elite: Contaminated Sergeant:** Former soldier with a shield and machine gun.

**Environmental hazard:** **Ash Storm.** Periodically a storm rolls over parts of the region. Visibility drops sharply and enemies are hard to see until they are close. Lumen glow shines through the storm, however, making infected enemies easier to spot.

**Dungeons:**
1. **Meridian's Hold:** Inside the crashed freighter. Tilted floors, narrow corridors. Objective: restore power by activating 3 generators.
2. **Bunker Sierra-4:** A multi-level military bunker. Objective: find 2 keycards to open the final room.
3. **The Drainage Tunnels:** Underground sewer channels. Objective: destroy all spore nests.

**Stronghold:** **Checkpoint Sierra.** Infected soldiers have fortified the checkpoint. The player must destroy three Spore Feeders that empower the enemies, then defeat **Commandant Hale**, half-consumed by Lumen.

**Region boss: The First.** The first colonist ever infected, now a gigantic creature of fused bodies and scrap metal.
- **Phase 1:** Slow, heavy blows with clear warning areas. Summons Ash Walkers.
- **Phase 2 (at 60% life):** Tears metal plates out of the ground and throws them. Creates cover the player can use.
- **Phase 3 (at 25% life):** Collapses into a half-torn form and moves faster. Spore fields cover parts of the arena.

**Side quest ideas:** Find the missing daughter of a survivor in the hub (she turns out to be infected), collect logs from a scientist who suspected what would happen, escort a water tanker back to the outpost.

---

### Region 2: The Refinery District (levels 10–20)
**Theme:** A huge industrial area on fire. Pipe alleys, slag lakes, smelters, conveyor belts and gigantic cranes.
**Story:** The player follows the governor's trail to the refinery, where a group of survivors calling themselves **the Smelters** have barricaded themselves. They believe fire purifies and have started sacrificing the infected, and sometimes the healthy. The conflict is about what people are willing to do to survive.
**Mood:** Heat, alarms, screaming metal, a constant rumble. Orange light from the smelters against black smoke.

**Hub:** **The Coolant Works**, a pump house where the cooling systems still function. The only cool place in the district.

**Subzones:**
1. **The Conveyor Lines:** A gigantic network of conveyor belts on several levels. Some belts move the player and enemies.
2. **The Slag Fields:** Black fields of hardened slag with rivers of molten metal.
3. **The Smelters' Cathedral:** An old control hall turned into a temple.
4. **The Smokestack Forest:** Hundreds of smokestacks and pipes, a labyrinthine area.

**Landmarks:** The largest smokestack (*The Pillar*) spewing fire, a gigantic crane hanging over the slag fields, and the Smelters' Cathedral with burning windows.

**Returning enemies (variants):**
- **Scorched Walker** (Ash Walker variant): Burned, leave a small fire patch on death.
- **Slag Hound** (Spore Hound variant): Glowing-hot hide, burning bite.
- **Sentry Drone** with flamethrower loadout.
- **Bloater** with a fire explosion instead of toxic.

**New enemies:**
- **Smelter (human):** Fanatical survivors with flamethrowers and improvised weapons. Can block with fire shields.
- **Slagborn:** Creatures of molten metal and Lumen. Slow, very durable, leave fire behind.
- **Cargo Loader:** Hijacked industrial robots with huge claws.
- **Smelter Priest (elite):** Empowers nearby Smelters and can revive a fallen one once.
- **Welder:** Fast enemies that lunge at the player with glowing cutting torches.

**Environmental hazard:** **Vents.** Vents and pipes periodically blast fire and steam. They warn with a clear light and sound signal 1.5 seconds before. Smart players can lure enemies into the blasts. Molten metal damages everyone standing in it, including enemies.

**Unique feature:** **The Crane.** The player can activate the crane over the slag fields to drop a heavy load where many enemies have gathered.

**Dungeons:**
1. **Smelter 3:** The furnace heats up gradually. The player must get through before it gets too hot. Objective: shut off the cooling pumps in the right order.
2. **The Pipe Alleys:** Narrow, labyrinthine tunnels on several levels. Objective: follow a damaged robot that shows the way.
3. **The Cathedral Crypt:** The Smelters' sacrifice chamber. Objective: free 4 prisoners before they are burned.
4. **The Cold Hall:** A frozen hall where the cooling system failed. Enemies can be frozen in place.

**Stronghold:** **Pump Station Delta.** The Smelters have taken the station that controls cooling for the whole district. The player must defend technicians while they unlock the systems, wave by wave.

**Region boss: High Priestess Vire.** The leader of the Smelters, who secretly let Lumen take her and now wields fire and spores.
- **Phase 1:** A fight against Vire and her guards in the cathedral. She throws fireballs and hides behind her guards.
- **Phase 2:** She sets the cathedral on fire. The floor gradually collapses into molten metal and the arena shrinks.
- **Phase 3:** She reveals her infected form. Lumen tentacles rise from the floor and fire and spores combine. She summons Scorched Walkers.

**Side quest ideas:** Help a Smelter defector escape, sabotage the Smelters' weapons cache, find spare parts for the motorbike (unlocks the vehicle).

---

### Region 3: The Hydroponic Vaults (levels 20–30)
**Theme:** The colony's gigantic farming domes, completely overtaken by Lumen. What were once crops has become an alien jungle of glowing fungi, crystals and fleshy vines wrapping around the metal.
**Story:** The player finds the colony's chief biologist, **Dr. Amara Okafor**, living in isolation in a lab and studying Lumen. She reveals that Lumen is not evil. It has a will of its own, and perhaps it can be communicated with. The region is about doubt: is Lumen an enemy to destroy, or something else entirely?
**Mood:** Humid, stifling and unsettlingly beautiful. Green mist, bioluminescence and a constant pulsing sound, like a heartbeat.

**Hub:** **Lab 9**, a sealed research facility with filtered air.

**Subzones:**
1. **The Outer Domes:** Partly infected crops, a transition between civilization and jungle.
2. **The Green Sea:** Completely overgrown domes with fungal trees dozens of meters tall.
3. **The Seed Bank:** The colony's gene bank, frozen but now infected.
4. **The Root Network:** Lumen's roots that have broken up through the ground. An organic underworld.

**Landmarks:** **The Mother Tree**, a gigantic Lumen tree that has broken through the roof of the largest dome, a collapsed irrigation dam, and Lab 9's warning lights.

**Returning enemies (variants):**
- **Overgrown Walker** (Ash Walker variant): Covered in vines, can root the player briefly.
- **Spore Hound** in its original form, now in larger packs.
- **Bloater** with a spore-cloud explosion that spawns small spore swarms.
- **Slagborn** variant **Mossborn**: same body, overgrown with fungus, heals nearby Lumen creatures.

**New enemies:**
- **Vine Weaver:** Plant-like creatures that lash with tentacles and can pull the player toward them.
- **Spore Swarm:** Swarms of flying insects. Hard to hit, spread poison.
- **Cocoon Warden:** Guards spore nests and calls more enemies if not killed quickly.
- **Mutated Botanist:** Former researchers with spore-based attacks.
- **Lumen Giant (elite):** An enormous creature of fungus and crystal. Slow but devastating, and it regrows from nearby fungi unless they are destroyed.

**Environmental hazard:** **Spore Fields.** Parts of the region are covered in spores that slowly poison the player. The player must move between "clean" zones (near air filters or bunkers) and can activate air filters to clear areas permanently.
**Positive environmental mechanic:** **Glowing crystals** can be destroyed to create a light burst that blinds nearby enemies for 3 seconds.

**Dungeons:**
1. **Seed Bank Depths:** A frozen and infected storage facility. Objective: find 3 seeds that Okafor needs.
2. **The Cocoon Chamber:** A cave full of cocoons that hatch as the player passes through. Objective: destroy the Mother Cocoon.
3. **The Irrigation System:** Half-flooded tunnels. Objective: drain the water level by level to proceed.
4. **The Sleeping Lab:** A lab where Okafor's colleagues died. Lore-heavy. Objective: recover their research data.

**Stronghold:** **Dome Gamma.** One of the largest spore nests. The player must destroy five Root Nodes spread across the dome while Lumen responds with increasingly strong counterattacks.

**Region boss: The Warden of the Mother Tree.** A gigantic hybrid of an old harvesting machine and Lumen that protects the tree.
- **Phase 1:** The Warden moves around the arena firing spore beams. The player must destroy armor plates to expose weak points.
- **Phase 2:** The Warden takes root and the arena fills with vines. The player must destroy Root Nodes to free it. Overgrown Walkers emerge from the vines.
- **Phase 3:** The Mother Tree itself joins the fight. Huge roots slam down into the arena.

**Moral choice:** After the boss, the player chooses whether to burn or spare the Mother Tree. The choice affects some dialogue, a unique item and which NPC follows the player to region 4. It must **not** lock out any important content.

**Side quest ideas:** Collect Lumen samples for Okafor, save an infected researcher (or don't), find the source of a strange melody heard in the jungle.

---

### Region 4: The Deep Mines (levels 30–40)
**Theme:** The colony's deep mines, where it all began. Shafts reaching kilometers into the rock, crystal caves, old drilling machines and ancient structures not built by humans.
**Story:** The player descends to where the drills woke Lumen. Here it is revealed that Lumen is not an organism but the remains of an extinct civilization that uploaded itself into the planet's biosphere. The governor is down here, trying to control Lumen for his own ends.
**Mood:** Claustrophobic, dark and echoing. Light comes mostly from the player's own lamp, the crystals and approaching enemies. Sounds of dripping, collapsing and whispering.

**Hub:** **Elevator Station Zero**, the last working elevator, where a group of miners have barricaded themselves.

**Subzones:**
1. **The Upper Shafts:** Human mining tunnels with rails, carts and drilling machines.
2. **The Crystal Caves:** Natural caves filled with enormous glowing crystals.
3. **Drill Lake:** An underground lake with a gigantic drill half-sunk in the water.
4. **The Elder Halls:** The extinct civilization's architecture, geometric and alien.

**Landmarks:** **The Main Drill** (dozens of meters tall, still sporadically active), a crystal pillar reaching from floor to ceiling, and the first gate to the Elder Halls.

**Returning enemies (variants):**
- **Crystal-Bound Walker** (Ash Walker variant): Crystal growths that reflect some projectiles.
- **Blind Hound** (Spore Hound variant): Hunts by sound, ignores stealth but is confused by noise.
- **Sentry Drone** in the governor's security colors with shield generators.
- **Cargo Loader** variant **Ore Crusher**: larger, slower, ground-slam attack.
- **Bloater** with a crystal-shard explosion.

**New enemies:**
- **Burrower:** Tunneling creatures that emerge from the ground beneath the player.
- **Crystal Sentinel:** Creatures of crystal that reflect damage and are immune to certain damage types until shattered.
- **Infected Miner:** With drills and explosives.
- **Echo:** Ghostly, half-transparent beings from the extinct civilization. Can teleport.
- **Drill Colossus (elite):** A mining machine taken over by Lumen.
- **Governor's Security (human):** Elite soldiers with advanced tech, used in the stronghold and boss fight.

**Environmental hazard:** **Darkness.** Large parts of the region are almost completely dark. The player's lamp lights a radius around the player. Enemies in the dark show only as glowing eyes until they are close. Light sources (flares, generators, crystals) can be activated to permanently light parts of the area. Some enemies (Echoes) take extra damage in light.
**Additional hazard:** **Cave-ins.** Some tunnels collapse as the player runs through, with a clear warning (dust and creaking).

**Dungeons:**
1. **Shaft 13:** A shaft going straight down. The player rides an elevator between levels while enemies attack the elevator.
2. **The Crystal Labyrinth:** Crystals that reflect light. Objective: redirect light beams to open doors.
3. **The Sunken Drill:** Inside the gigantic drill under water.
4. **The Archive:** The extinct civilization's archive, lore-heavy. Objective: activate 4 memory crystals.
5. **The Burial Chamber:** The extinct civilization's burial site. A hard dungeon with an extra strong boss.

**Stronghold:** **Mining Station Aurum.** The governor's private security force has taken over the station. Here the player fights humans with advanced technology, not just the infected.

**Region boss: Governor Castellan.** The governor has connected himself to Lumen-amplifying armor.
- **Phase 1:** A fight against the governor in his control room. He uses shields, Sentry Drones and an energy cannon.
- **Phase 2:** He connects himself to the Main Drill. The drill activates and the player must dodge the drill head while destroying the connections.
- **Phase 3:** Lumen takes him over. He becomes a fusion of human, machine and light and teleports around the arena.

**Side quest ideas:** Find a missing mining crew, repair the elevators to create shortcuts between levels, translate fragments of the extinct civilization's script.

---

### Region 5: The Core (levels 40–50)
**Theme:** Lumen's heart, deep beneath the planet's surface. A place where organic and technological fuse. Walls that breathe, light structures that sing, gravity that does not work as it should.
**Story:** The player reaches the source. Lumen is trying to reach the orbital station through a space elevator shaft going straight up. The player must decide how it ends and faces Lumen's core: an entity made of everyone it has taken, including people the player has met.
**Mood:** Surreal, majestic and frightening. Huge open spaces where the ceiling is hard to see. The music becomes sacred and choir-like.

**Hub:** **The Last Camp**, a temporary camp the player's allies set up in a sealed section of the space elevator shaft.

**Subzones:**
1. **The Borderland:** Where the mine turns into Lumen's world. Technology slowly "melting" into the organic.
2. **The Hanging Gardens:** Floating islands of Lumen matter. The player travels between them on energy bridges.
3. **The Memory Halls:** Places where Lumen recreates memories from those it has taken, as distorted versions of earlier regions.
4. **The Heart:** The core itself.

**Landmarks:** The space elevator shaft rising straight up through the rock, visible everywhere, Lumen's heart pulsing with light, and a mirror image of Outpost Ember upside down on the ceiling.

**Returning enemies:** The Core deliberately reuses enemies from **every earlier region** as **Memory Shades**: distorted, glowing versions of Ash Walkers, Spore Hounds, Smelters, Vine Weavers, Crystal Sentinels and others, stronger and with new abilities. Bosses from earlier regions can return as Memory Shade minibosses.

**New enemies:**
- **Light Beings:** Pure Lumen creations, fast and unpredictable.
- **Core Guardians:** Large, stately creatures that protect important places and can shield other enemies.
- **The Absorbed:** Former allies and NPCs that Lumen has taken. Each one has a name and a short line of dialogue. Reuse existing NPC models with a Lumen variant.
- **Choir (elite):** A group of fused creatures that sing and empower all nearby enemies until killed.

**Environmental hazard:** **Unstable Gravity.** In some areas gravity shifts periodically. Projectiles curve, the player and enemies are pulled in one direction and small objects float. Always warned in advance by a visual shimmer.
**Additional mechanic:** **Memory Mirrors.** The player can step into mirrors that lead to short, distorted versions of places from earlier regions, with lore and rewards. These reuse existing environment kits and enemies.

**Dungeons:**
1. **Memory of Ember:** A distorted version of Outpost Ember, the first hub.
2. **The Endless Shaft:** A vertical dungeon that gets harder with each level.
3. **The Singing Halls:** A dungeon where sound and music are a mechanic. Enemies are drawn by sound.
4. **The Chamber of Creation:** Where Lumen creates new creatures. Objective: close four hatching portals (each portal spawns enemies from a different earlier region).

**Stronghold:** **The Elevator Base.** The last defense before the space elevator shaft. A massive battle with waves of enemies and several minibosses, where the player's allies from earlier regions come to help.

**Final boss: Lumen, The One Who Remembers.** Lumen's core in its true form.
- **Phase 1:** Lumen appears as a gigantic light structure. It uses attacks from every earlier boss in new combinations.
- **Phase 2:** The arena transforms into a memory of each earlier region in quick succession (ash fields, fire, jungle, darkness), each with its environmental hazards and enemies.
- **Phase 3:** Lumen takes the form of one of the player's allies and tries to convince the player to stop fighting. The player can keep fighting or listen. Both paths lead to a final fight, but the ending sequence differs.
- **Phase 4:** A short, intense final phase where Lumen's core is exposed and the player must give everything.

**After the campaign:** Lumen is not completely gone. The rest of the planet stays infected, and that is where the endgame takes place. The Core becomes available as an endgame area with stronger enemies.

---

## 6. Dungeon design

### 6.1 Procedural generation (Diablo 2 style)
- Each dungeon has a **themed set of modular rooms** (corridors, junctions, large rooms, dead ends, boss rooms).
- The layout is generated with a seed every time the dungeon is created. Rules ensure that:
  - There is a clear main path from entrance to boss.
  - There are 2–4 side branches with chests, extra enemies or lore.
  - No rooms are unreachable.
  - The dungeon takes roughly **8–12 minutes** to clear.
- Some rooms are **hand-designed key rooms** (for example the boss room and certain objective rooms) that are always the same.
- Dungeon enemy pools draw from the enemy roster (section 4), not just from new enemies.

### 6.2 Objective types
Each dungeon has a main objective before the boss room opens. Vary objectives across dungeons:
- **Clear:** Kill all enemies in an area.
- **Collect:** Find and carry keycards, power cores or samples (the player cannot use some skills while carrying the item).
- **Activate:** Power up generators, terminals or light sources (enemies attack while it charges).
- **Defend:** Protect an NPC or object through waves.
- **Hunt:** Chase and kill a fleeing enemy.
- **Solve:** Simple puzzles (light beams, valves, sequences). These must never take more than 1–2 minutes and must never block the player completely.

### 6.3 Dungeon events (Diablo 3 style)
In 30–40% of dungeons an **extra event** is rolled, for example:
- A trapped survivor who must be defended.
- A cursed cache: open it to trigger waves of enemies, and if the player survives there is great loot.
- A "loot runner": an enemy carrying loot that flees. If the player kills it in time, it drops a lot of loot.
- A room with an extra elite that has a unique name.

## 7. The three gameplay loops

### 7.1 The moment (0–30 seconds)
The player sees an enemy pack, engages, uses skills in a rhythm (build resource, spend resource, defend, reposition), kills enemies and sees loot drop. Every such fight must:
- Have a clear start (enemies notice the player with a sound and a reaction).
- Give a sense of power when skills hit many enemies.
- Have at least one thing the player must react to (an elite, a warning area, a fleeing enemy).
- End with a short reward (loot, gold, experience, resource).

### 7.2 The session (10–30 minutes)
The player has a goal: a main quest, a dungeon, a stronghold or an event. Along the way the player finds side locations, gets loot that changes the build, and returns to the hub to sell, craft and upgrade.

### 7.3 The long journey (hours and weeks)
The player advances the story, restores regions, unlocks the endgame and optimizes their build. Every session should give the player at least one clear win (a level, a better item, a new skill, a finished region).

## 8. Combat pacing and enemy packs

### 8.1 Pack composition
Enemy packs must be **mixed**, not the same enemy repeated. A typical pack:
- 4–8 **fodder enemies** (weak, come in groups).
- 1–2 **specialists** (ranged, support, explosive).
- 0–1 **heavy enemy** (slow, durable).

The variety gives the player choices: who should die first?

### 8.2 Enemy roles
Every enemy belongs to a role with clear behavior:
- **Charger:** Runs straight at the player.
- **Shooter:** Keeps distance and shoots.
- **Flanker:** Tries to get behind the player.
- **Tank:** Slow, durable, blocks the path.
- **Support:** Heals, buffs or shields other enemies.
- **Summoner:** Creates more enemies.
- **Trap:** Stationary, creates dangerous areas.
- **Kamikaze:** Explodes on contact or death.

### 8.3 Elites
Enemies can appear as:
- **Champions** (blue names): A group of 3–4 empowered enemies sharing 1–2 affixes.
- **Rare elites** (yellow names): A single empowered enemy with a randomly generated name (for example "Kaal the Rotting, Warden of Ash"), 2–4 affixes and minions. They drop better loot.
- **Named minibosses** (orange names): Hand-placed in the world, with their own design and guaranteed good loot.

**Elite affixes (examples):**
- **Shielded:** Gains a shield when first damaged.
- **Burning:** Leaves fire fields behind.
- **Teleporting:** Teleports to the player.
- **Snaring:** Creates trapping fields around the player.
- **Spore Spreader:** Creates toxic clouds.
- **Force Wall:** Creates walls that block the path.
- **Laser Grid:** Rotating laser beams around the enemy.
- **Explodes on Death:** Explodes when it dies.
- **Vampiric:** Heals itself from damage dealt to the player.
- **Mirroring:** Creates copies of itself.
- **Freezing:** Freezes the player on hit.
- **Fast:** Increased movement and attack speed.

Combinations should be able to become truly dangerous at higher difficulties. Some combinations can be blocked to avoid impossible situations.

### 8.4 Telegraphing
All dangerous attacks must be clearly warned:
- **Red areas on the ground** for area attacks that fill up before triggering.
- **Animations** that start with a clear wind-up (the enemy pulls back its arm, glows, makes a sound).
- **Sounds** unique to each dangerous attack.
- The warning time must be **0.8–1.5 seconds** for normal attacks and up to **2.5 seconds** for devastating boss attacks.

## 9. Boss design – principles

1. **Every boss must feel like an event.** An introduction with a camera move, the name on screen and its own music.
2. **Phases** with clear transitions (the boss changes appearance, the arena changes).
3. **Readable patterns.** The player must be able to learn the boss. Death should always feel like the player's own fault, never random.
4. **The arena as part of the fight.** Use terrain, hazards and changes.
5. **No damage sponges.** Bosses must not just have huge health pools. They must have mechanics that demand attention.
6. **Reward.** At least one guaranteed Legendary the first time, and a chance at Uniques.
7. **Reuse:** Bosses summon or are accompanied by existing enemies. All bosses can be fought again in the endgame at higher difficulty with better loot.

## 10. Environment and interaction

- **Destructible objects:** Crates, barrels, scrap and crystals break when hit and can sometimes contain gold or items.
- **Explosive barrels:** Red barrels that explode and damage everyone nearby, including enemies.
- **Traps:** Both the player and enemies can trigger traps. Players who lure enemies into traps should be rewarded.
- **Doors and gates:** Some gates open when an area is cleared, creating natural "arena fights".
- **Light:** Light sources affect visibility and enemy behavior (see the Deep Mines).
- **Shortcuts:** Each region must have shortcuts that open once the player has passed through an area (a ladder lowered, a door unlocked from the other side).
- **Environmental storytelling:** Places should tell what happened. A barricade with empty shell casings and a written message, a table with a half-eaten meal, a child's drawing on a wall.
- **Reuse environment kits:** Modular environment pieces from earlier regions can be reused in later regions with new materials, lighting and Lumen overgrowth.

## 11. Quest design

### 11.1 Main quests
- Drive the story forward and lead the player through the region.
- Every main quest has a clear objective marker on the map.
- Often end with a cutscene or a conversation in the hub.
- Must introduce new mechanics, enemies and areas.

### 11.2 Side quests
- 10–15 per region.
- Must have their own small story with a beginning, middle and end. No empty "kill 10 enemies" quests.
- Reward experience, gold, Restoration points and sometimes Unique items.
- Vary the types: investigate, escort, hunt, collect, defend, choose.

### 11.3 Mysteries (hidden quests)
- Each region has 1–2 hidden quests that only start if the player finds a specific thing (a note, a strange sound, an unusual item).
- They often lead to secret areas, Unique items or lore.

### 11.4 Dialogue and tone
- NPCs speak briefly, seriously and wearily. No upbeat humor, but dark humor and humanity are welcome.
- Main conversations can be 3–6 lines. Side conversations should be shorter.
- All text is in **English**.

## 12. World events

### 12.1 World events (examples)
- **Defend the Convoy:** Protect a vehicle driving through the region.
- **Purge the Spore Nest:** Destroy a growing spore nest before it hatches.
- **Rescue Operation:** Save survivors before time runs out.
- **Signal Jam:** Defend a transmitter while it charges.
- **Elite Hunt:** A named elite roams the region.
- **Supply Drop:** A supply crate falls from the sky. Reach it before the enemies do.

Events have Bronze, Silver and Gold tiers depending on how well the player performs (for example time taken or survivors saved). Event enemy pools draw from the full region roster, including returning enemies.

### 12.2 Ash Harvest (endgame event)
- One region at a time is struck by an **Ash Harvest** for a set period.
- More and stronger enemies, elites everywhere and more events.
- Enemies drop **Ash Shards** that are used to open special **Harvest Caches** with guaranteed good loot.
- If the player dies, they lose half of their shards.
- Ash Harvests mix enemies from the affected region with enemies from other regions.

### 12.3 World bosses
- Every three hours of playtime, a world boss appears at a fixed location in a random region.
- Announced 10 minutes in advance.
- The boss has a lot of life and several phases, but is designed for a single player (since the game is single-player).

## 13. Death, difficulty and penalties

- **Death:** The player respawns at the nearest teleporter or at the dungeon entrance. Equipment takes durability damage (repaired for gold at the blacksmith).
- **Bosses:** If the player dies during a boss fight, the boss resets.
- **Difficulty:** World Tiers control enemy strength and loot (see the main instructions).
- **Hardcore mode (Diablo 2 style):** Optional when creating a character. If the character dies, it is dead forever. Hardcore characters have a separate stash and their own icon.

## 14. Readability and feedback

- **Enemies** must always stand out from the background. Use rim lighting and give enemies slightly more saturated colors or glow.
- **The player's own effects** must not hide enemy warning areas. Enemy warning areas always render on top.
- **Items on the ground:** The name is shown in its rarity color. Legendary and Unique items have a light beam visible from far away.
- **Interactive objects** get a faint outline when the player is near.
- **Damage:** Clear numbers, different colors for critical hits and damage types.
- **Life:** The player's life orb flashes and the screen edges turn red at low life.
- **Sound:** Every important event (a Legendary drops, an elite appears, a boss approaches, low health) must have a unique sound.

## 15. Working method: one region at a time

### 15.1 Process for each region
1. **Plan:** Write a region plan in `docs/regions/<region-name>.md` with a map (a simple sketch or ASCII diagram), subzones, all POIs with positions, the enemy list (marking which enemies are returning variants and which are new), dungeons, stronghold, boss and quests. Show me the plan before building.
2. **Check the roster:** Go through `docs/enemy-roster.md` and the asset manifest. List which existing enemies and environment pieces will be reused and how they will be varied, and which new assets are actually needed. Include this list and the estimated Meshy credit cost in the plan.
3. **Greybox:** Build the region layout with simple shapes. Place roads, landmarks, POIs and enemies. Test that pacing and density feel right.
4. **Playability:** Implement enemies, quests, events, dungeons and boss with placeholders.
5. **Assets:** Create the region's variants and new assets through the Meshy pipeline and replace the placeholders. Generate only what step 2 identified as needed.
6. **Atmosphere:** Lighting, fog, particles, sound and music.
7. **Polish and balance:** Play through the region, tune difficulty and loot.
8. **Report:** Summarize what is done, what remains and what I should test. Wait for my feedback.

### 15.2 Checklist – a region is done when:
- [ ] The whole region can be explored from start to finish without blocking bugs.
- [ ] The hub works with all NPCs and services.
- [ ] All main quests in the region can be completed.
- [ ] At least 10 side quests are done.
- [ ] All dungeons generate correctly and can be completed.
- [ ] The stronghold can be reclaimed and becomes a hub.
- [ ] The region boss works in all phases.
- [ ] Every POI type from section 3 exists in the region in the right numbers.
- [ ] The Restoration meter works with rewards.
- [ ] World events roll and can be completed.
- [ ] The region's environmental hazard works and is clearly communicated.
- [ ] Enemy density and pacing follow sections 2.2 and 8.
- [ ] The region uses returning enemies according to section 4 (from region 2 onward).
- [ ] `npm run assets:check` reports no unused enemies or other orphan assets.
- [ ] `docs/enemy-roster.md` is updated.
- [ ] The region holds 60 FPS on the target hardware.
- [ ] All text is in English.
- [ ] The region connects seamlessly to the previous region (from region 2 onward).

### 15.3 Playtest protocol
After each region, measure and report:
- Time to complete the main quests.
- Time to fully explore the region.
- Average time between fights.
- Number of Legendary items dropped in one playthrough.
- Number of deaths per difficulty (do a simulated or manual playthrough).
- Any places where the player can get stuck or lose direction.
- Meshy credits spent on the region and how many assets were reused versus newly generated.

Put the measurements in `docs/regions/<region-name>-playtest.md`.

## 16. Example: the first 15 minutes

This is how the first 15 minutes of the game should feel. Use it as a reference when building region 1.

1. **0:00–1:00:** A short intro cutscene: the distress signal, the descent through the ash cloud and the escape pod crashing. The player wakes up in the wreck.
2. **1:00–3:00:** The player gets out of the wreck. The first fight against 3 Ash Walkers introduces the basic attack. Loot drops: a first weapon.
3. **3:00–5:00:** The player follows a road toward a light in the distance. More combat, a Bloater that explodes (introducing warning areas). First level-up and the first skill point.
4. **5:00–7:00:** The player finds an abandoned checkpoint with audio logs that introduce the story. A small pack of Spore Hounds attacks.
5. **7:00–10:00:** The first elite (a champion pack). A harder fight, and the player finds their first Magic or Rare item.
6. **10:00–12:00:** The player reaches Outpost Ember. The hub is introduced: vendor, blacksmith and the first side quests.
7. **12:00–15:00:** The player leaves the hub for the first main quest. The first teleporter is discovered. The first bunker is visible beside the road, tempting the player to explore.

After 15 minutes the player should have: reached level 3–4, had at least 2 new skills to choose between, found at least one blue or yellow item, visited the hub and understood the basic tone of the story.
