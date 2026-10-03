# Enemy roster

Every enemy model must be used somewhere (`npm run assets:check`). Variants reuse a model with a new
tint, scale, behaviour or affixes (docs/world-and-gameplay.md §4).

| Enemy | Data id | Asset | Role | Family | Appears in | Variants |
|---|---|---|---|---|---|---|
| Ash Walker | infected_colonist | enemy.infected_colonist | Charger | infected | Cinder Flats (open world, all dungeons, events, stronghold, boss adds) | later: Scorched / Overgrown / Crystal-Bound Walker, Memory Shade |
| Sentry Drone | security_drone | enemy.security_drone | Shooter | machine | Cinder Flats (open world, Bunker Sierra-4, Meridian's Hold, events) | later: flamethrower, governor colours |
| Bloater | bloater | enemy.spore_carrier | Kamikaze | infected | Cinder Flats (open world, Drainage Tunnels, Brood Mother adds, events) | — |
| Spore Carrier | spore_carrier | enemy.spore_carrier (tinted) | Support | infected | Cinder Flats (packs, Spore Nest event, stronghold) | — |
| Spore Hound | spore_hound | enemy.spore_hound | Flanker | beast | Cinder Flats (open world, Ash Valley, events) | later: Slag Hound, Blind Hound |
| Contaminated Sergeant | sergeant | enemy.sergeant | Tank / Elite | infected | Cinder Flats (military packs, Bunker Sierra-4, Meridian's Hold) | Sergeant Vos and the Hold Warden (dungeon bosses: sergeant ×9–10 life + affixes) |
| Commandant Hale | commandant_hale | enemy.sergeant (×1.4, Lumen glow) | Stronghold boss | infected | Checkpoint Sierra | phase 2 Lumen frenzy (speed and tempo) |
| Brood Mother | brood_mother | enemy.spore_carrier (×2.1, glow) | Dungeon boss | infected | The Drainage Tunnels | summons Bloaters, phase 2 faster |
| The First | the_first | boss.the_first | Region boss | lumen | Cinder Flats (The Maw) | 3 phases (adds; thrown plates as cover; fast + spore fields); later: Memory Shade miniboss in the Core |

## Elites (all regions)
Champions (blue, packs of up to 4 sharing 1–2 affixes) and rare elites (yellow, generated name, 2–4
affixes by level, 2–3 minions) can roll on any pack. Affixes: Shielded, Burning, Teleporting, Snaring,
Spore Spreader, Explodes on Death, Vampiric, Fast, Freezing, Mirroring (src/data/elites.ts).
Force Wall and Laser Grid arrive with later regions.
