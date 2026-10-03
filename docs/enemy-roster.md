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

## Elites (all regions)
Champions (blue, packs of up to 4 sharing 1–2 affixes) and rare elites (yellow, generated name, 2–4
affixes by level, 2–3 minions) can roll on any pack. Affixes: Shielded, Burning, Teleporting, Snaring,
Spore Spreader, Explodes on Death, Vampiric, Fast, Freezing, Mirroring (src/data/elites.ts).
Force Wall and Laser Grid arrive with later regions.
