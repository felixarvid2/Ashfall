# Enemy roster

Every enemy model must be used somewhere (`npm run assets:check`). Variants reuse a model with a new
tint, scale, behaviour or affixes (docs/world-and-gameplay.md §4).

| Enemy | Data id | Asset | Role | Family | Appears in | Variants |
|---|---|---|---|---|---|---|
| Ash Walker | infected_colonist | enemy.infected_colonist | Charger | infected | Cinder Flats (open world, all dungeons, events, stronghold, boss adds) | later: Scorched / Overgrown / Crystal-Bound Walker, Memory Shade |
| Sentry Drone | security_drone | enemy.security_drone | Shooter | machine | Cinder Flats (open world, Bunker Sierra-4, Meridian's Hold, events) | later: flamethrower, governor colours |
| Bloater | bloater | enemy.spore_carrier | Kamikaze | infected | Cinder Flats (open world, Drainage Tunnels, boss phase 3) | Brood Mother (dungeon boss, ×1.8) |
| Spore Carrier | spore_carrier | enemy.spore_carrier (tinted) | Support | infected | Cinder Flats (packs, Spore Nest event, stronghold) | — |
| Spore Hound | spore_hound | enemy.spore_hound | Flanker | beast | Cinder Flats (open world, Ash Valley, events) | later: Slag Hound, Blind Hound |
| Contaminated Sergeant | sergeant | enemy.sergeant | Tank / Elite | infected | Cinder Flats (Checkpoint Sierra, Bunker Sierra-4, rare elites) | Commandant Hale (×1.4), Sergeant Vos, Hold Warden |
| The First | the_first | boss.the_first | Region boss | lumen | Cinder Flats (The Maw) | later: Memory Shade miniboss in the Core |
