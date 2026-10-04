# Enemy roster

Every enemy model must be used somewhere (`npm run assets:check`). Variants reuse a model with a new
tint, scale, behaviour or affixes (docs/world-and-gameplay.md §4).

| Enemy | Data id | Asset | Role | Family | Appears in | Variants |
|---|---|---|---|---|---|---|
| Ash Walker | infected_colonist | enemy.infected_colonist | Charger | infected | Cinder Flats (open world, all dungeons, events, stronghold, boss adds) | Scorched Walker (Refinery District); later: Overgrown / Crystal-Bound Walker, Memory Shade |
| Sentry Drone | security_drone | enemy.security_drone | Shooter | machine | Cinder Flats (open world, Bunker Sierra-4, Meridian's Hold, events) | Flame Drone (Refinery District); later: governor colours |
| Bloater | bloater | enemy.spore_carrier | Kamikaze | infected | Cinder Flats (open world, Drainage Tunnels, Brood Mother adds, events) | — |
| Spore Carrier | spore_carrier | enemy.spore_carrier (tinted) | Support | infected | Cinder Flats (packs, Spore Nest event, stronghold) | — |
| Spore Hound | spore_hound | enemy.spore_hound | Flanker | beast | Cinder Flats (open world, Ash Valley, events) | Slag Hound (Refinery District); later: Blind Hound |
| Contaminated Sergeant | sergeant | enemy.sergeant | Tank / Elite | infected | Cinder Flats (military packs, Bunker Sierra-4, Meridian's Hold) | Sergeant Vos and the Hold Warden (dungeon bosses: sergeant ×9–10 life + affixes) |
| Commandant Hale | commandant_hale | enemy.sergeant (×1.4, Lumen glow) | Stronghold boss | infected | Checkpoint Sierra | phase 2 Lumen frenzy (speed and tempo) |
| Brood Mother | brood_mother | enemy.spore_carrier (×2.1, glow) | Dungeon boss | infected | The Drainage Tunnels | summons Bloaters, phase 2 faster |
| The First | the_first | boss.the_first | Region boss | lumen | Cinder Flats (The Maw) | 3 phases (adds; thrown plates as cover; fast + spore fields); later: Memory Shade miniboss in the Core |
| Scorched Walker | scorched_walker | enemy.infected_colonist (ember glow) | Charger | infected | Refinery District (roads, stacks, events, Vire adds) | burning hits, burning patch on death |
| Slag Hound | slag_hound | enemy.spore_hound (glowing hot) | Flanker | beast | Refinery District (Slag Fields, events, Slag Heart adds) | burning bite; Red (named, *Red* side quest) |
| Flame Drone | flame_drone | enemy.security_drone (fire tint) | Short-range shooter | machine | Refinery District (roads, Conveyor Lines, Delta, Smelter Raid) | flamethrower cone |
| Fire Bloater | fire_bloater | enemy.spore_carrier (fire tint) | Kamikaze | infected | Refinery District (Slag Fields, stacks, Slag Tide) | fire blast, burning ground |
| Smelter | smelter | enemy.smelter | Shooter / blocker | human | Refinery District (roads, Cathedral, Delta waves, boss guards) | flamethrower, raises a fire shield at close range |
| Welder | welder | enemy.welder | Charger / lunger | human | Refinery District (Conveyor Lines, Delta waves, Krell adds) | telegraphed dash through you |
| Slagborn | slagborn | enemy.slagborn | Tank | lumen | Refinery District (Slag Fields) | burning trail; The Slag Heart (Pipe Alleys boss) |
| Cargo Loader | cargo_loader | enemy.cargo_loader | Heavy | machine | Refinery District (Conveyor Lines, Delta wave 4) | wide slams, every third swing grabs and throws; Foreman Krell (Smelter 3 boss) |
| Smelter Priest | smelter_priest | enemy.smelter (gold glow) | Support elite | human | Refinery District (Cathedral packs, Delta wave 3) | empowers allies, revives a fallen Smelter/Welder; Deacon Hask (named) |
| Brother Ash | brother_ash | enemy.smelter (×1.35) | Stronghold boss | human | Pump Station Delta | flamethrower, shield, revives twice; phase 2 Welders and fireballs |
| Pyre Warden | pyre_warden | enemy.smelter (×1.3, gold) | Dungeon boss | human | The Cathedral Crypt | Smelter guards, revives, phase 2 fireballs |
| The Frozen Welder | frozen_welder | enemy.welder (×1.35, frost) | Dungeon boss | human | The Cold Hall | long chilling lunges; phase 2 faster |
| High Priestess Vire | vire | boss.vire | Region boss | human | The Smelters' Cathedral | 3 phases (guards + fireballs; collapsing floor; infected form) |
| Lumen Tentacle | lumen_tentacle | enemy.lumen_tentacle | Stationary add | lumen | Vire phase 3 | — |
| Overgrown Walker | overgrown_walker | enemy.infected_colonist (moss tint) | Charger | infected | Hydroponic Vaults (everywhere, event waves, Gamma, Warden adds) | roots you every third hit that lands; Thorn (named, *Overgrown Patrol*) |
| Spore Hound | spore_hound | enemy.spore_hound | Flanker | beast | Hydroponic Vaults (outer domes, Green Sea) — returning from region 1 | — |
| Swarm Bloater | swarm_bloater | enemy.spore_carrier (green) | Kamikaze | infected | Hydroponic Vaults (Green Sea, Cocoon Chamber, Swarm Migration) | releases Spore Swarms when it dies |
| Mossborn | mossborn | enemy.slagborn (moss) | Support tank | lumen | Hydroponic Vaults (Green Sea, Root Network, Gamma waves) | heals Lumen creatures around it |
| Vine Weaver | vine_weaver | enemy.lumen_tentacle (×0.9, mobile) | Puller | lumen | Hydroponic Vaults (Root Network, Elite Hunt prey) | telegraphed lash that drags you in |
| Spore Swarm | spore_swarm | enemy.security_drone (small, green) | Evasive swarm | insect | Hydroponic Vaults (everywhere, swarm bloater deaths) | slips some hits ("Miss"); The Swarm Queen (named) |
| Cocoon Warden | cocoon_warden | enemy.sergeant (moss) | Elite tank | infected | Hydroponic Vaults (Seed Bank, Gamma wave 5) | calls reinforcements if not killed quickly |
| Mutated Botanist | mutated_botanist | enemy.smelter (green) | Lobber | human | Hydroponic Vaults (outer domes, Seed Bank, Sleeping Lab) | telegraphed spore clouds |
| Lumen Giant | lumen_giant | boss.the_first (×0.8, crystal glow) | Heavy | lumen | Hydroponic Vaults (Root Network) | regrows while a Lumen Fungus stands near it |
| Mother Root | mother_root | enemy.lumen_tentacle (×1.5) | Stationary add | lumen | Vine Matriarch and Warden phase 3, Root Eruption event | — |
| The Keeper | the_keeper | enemy.slagborn (×1.3, frost) | Dungeon boss | lumen | The Seed Bank Depths | Overgrown adds; phase 2 Spore Swarms, faster |
| The Brood Warden | brood_warden | enemy.sergeant (×1.45) | Dungeon boss | infected | The Cocoon Chamber | swarms; phase 2 Swarm Bloaters |
| The Vine Matriarch | vine_matriarch | enemy.lumen_tentacle (×1.6) | Dungeon boss | lumen | The Irrigation System | Vine Weavers; phase 2 Mother Roots |
| Dr. Ilse Varga | ilse_varga | enemy.smelter (×1.3, green) | Dungeon boss | human | The Sleeping Lab | Botanist guards; phase 2 spore fields and walkers |
| The Gamma Bloom | gamma_bloom | boss.the_first (×0.95, green) | Stronghold boss | lumen | Dome Gamma | spore spreader; phase 2 spore fields and a Cocoon Warden |
| The Warden of the Mother Tree | warden | enemy.cargo_loader (×2.1, green glow) | Region boss | machine | The Great Dome | 3 phases (armour plates + spore beams; rooted, immune until 4 Root Nodes die; Mother Tree roots, slams and beams) |
| Crystal-Bound Walker | crystal_walker | enemy.infected_colonist (crystal-blue glow) | Charger | infected | Deep Mines (tunnels, caves, event waves) | throws some ranged hits back at the shooter |
| Blind Hound | blind_hound | enemy.spore_hound (pale) | Flanker | beast | Deep Mines (caves, lake, Cave-in Rescue) | hunts by sound: notices you only up close (even stealthed), runs to flares and explosions; Old Ears (named) |
| Governor's Drone | governor_drone | enemy.security_drone (gold) | Shooter | machine | Deep Mines (Aurum, Kade adds) | hardens the nearest ally (chitin) |
| Ore Crusher | ore_crusher | enemy.cargo_loader (×1.3, rust) | Heavy | machine | Deep Mines (shafts, lake, Elite Hunt) | wide ground slam that knocks back |
| Shard Bloater | shard_bloater | enemy.spore_carrier (crystal blue) | Kamikaze | infected | Deep Mines (tunnels, caves) | bursts into a ring of crystal shards |
| Burrower | burrower | enemy.lumen_tentacle (×0.8, dark) | Ambusher | lumen | Deep Mines (shafts, lake, Burrower Swarm, Sunken Drill) | travels underground (untargetable), surfaces under you after a warning |
| Crystal Sentinel | crystal_sentinel | enemy.slagborn (crystal glow) | Tank | lumen | Deep Mines (caves, Elder Halls, Burial Chamber) | shell ignores elemental damage and reflects part of each hit until it breaks |
| Infected Miner | infected_miner | enemy.welder (amber glow) | Brawler / thrower | infected | Deep Mines (shafts, tunnels) | drill lunge and telegraphed dynamite |
| Echo | echo | char.spectre (hologram) | Skirmisher | lumen | Deep Mines (Elder Halls, Lights Out, Kade phase 3) | blinks beside you; double damage taken in light |
| Security Trooper | security_trooper | enemy.sergeant (blue) | Human shooter | human | Deep Mines (Aurum, Security Patrol) | three-round bursts |
| Shield Officer | shield_officer | enemy.sergeant (×1.05, blue) | Human support | human | Deep Mines (Aurum, Security Patrol) | dome that cuts ranged damage to allies inside |
| Drill Colossus | drill_colossus | enemy.cargo_loader (×1.9, Lumen glow) | Elite | machine | Deep Mines (lake) | drill spins all the way round |
| Foreman Dray | foreman_dray | enemy.welder (×1.3) | Dungeon boss | infected | Shaft 13 | lunges, dynamite; phase 2 dynamite volleys |
| The Prism | the_prism | enemy.slagborn (×1.3, white glow) | Dungeon boss | lumen | The Crystal Labyrinth | crystal shell; phase 2 light beams |
| The Drowned Engine | drowned_engine | enemy.cargo_loader (×1.95) | Dungeon boss | machine | The Sunken Drill | spinning drill; phase 2 sweeping drill head |
| The Archivist | archivist | char.spectre (hologram, ×1.3) | Dungeon boss | lumen | The Archive | blinks; phase 2 blinking pulses and Echoes |
| The Elder Guardian | elder_guardian | boss.the_first (×1.6, cyan) | Dungeon boss (hard) | lumen | The Burial Chamber | beams; blinking pulses; sweeping storm |
| Security Chief Holm | security_chief_holm | enemy.sergeant (×1.4) | Stronghold boss | human | Mining Station Aurum | bursts, dome; phase 2 drones and grenade barrages |
| Governor Kade | governor_kade | char.bastion (×1.75 with boss scaling, gold glow) | Region boss | human | Drill Control | 3 phases (frontal shield, drones, energy cannon; plugged into the drill, four conduits, sweeping drill head; Lumen form that blinks with Echoes) |

## Elites (all regions)
Champions (blue, packs of up to 4 sharing 1–2 affixes) and rare elites (yellow, generated name, 2–4
affixes by level, 2–3 minions) can roll on any pack. Affixes: Shielded, Burning, Teleporting, Snaring,
Spore Spreader, Explodes on Death, Vampiric, Fast, Freezing, Mirroring (src/data/elites.ts).
Force Wall and Laser Grid arrive with later regions.
