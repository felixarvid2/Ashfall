# Credits

Most of Ashfall's art is generated for the game: 3D models and icons with Meshy, 2D art with FLUX.2
Turbo (see `scripts/meshy/` and `scripts/art/`). The rest comes from free libraries, fetched and
processed by `npm run assets:third-party` (`scripts/assets/thirdParty.ts`).

| What | Source | Licence | In the game |
|---|---|---|---|
| Environment light: *Burnt Warehouse* HDRI | [Poly Haven](https://polyhaven.com/a/burnt_warehouse) | CC0 | `public/assets/env/burnt_warehouse.webp` |
| Scatter props: barrel_03, Barrel_01, metal_trash_can, old_tyre, rusted_wheel_rim_01, metal_jerrycan_green, propane_tank, old_military_crate, ammo_box, trashbag, utility_box_01, moon_rock_01/03/06 | [Poly Haven](https://polyhaven.com/models) | CC0 | `public/assets/environment/` (`env.oil_drum` and so on; `credit` in `assets/manifest.json`) |
| Cave wall rock: *Rock035* | [ambientCG](https://ambientcg.com/view?id=Rock035) | CC0 | `public/assets/textures/rock/` |
| Status icons | [game-icons.net](https://game-icons.net): Lorc, Delapouite, Carl Olsen | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | `public/assets/ui/status/` |
| Touch menu icons | [game-icons.net](https://game-icons.net): Lorc, Delapouite | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | `public/assets/ui/menu/*.svg` |
| Touch menu icons: fullscreen (*larger*), close (*cross*) | [Kenney Game Icons](https://kenney.nl/assets/game-icons) | CC0 | `public/assets/ui/menu/fullscreen.png`, `close.png` |
| Fonts: Rajdhani (Indian Type Foundry), Share Tech Mono (Carrois Type Design) | [Google Fonts](https://fonts.google.com) | SIL Open Font License 1.1 (`public/assets/fonts/OFL-*.txt`) | `public/assets/fonts/` |
| Sound effects: [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds), [Impact Sounds](https://kenney.nl/assets/impact-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds), [Digital Audio](https://kenney.nl/assets/digital-audio), [RPG Audio](https://kenney.nl/assets/rpg-audio), [UI Audio](https://kenney.nl/assets/ui-audio), [Music Jingles](https://kenney.nl/assets/music-jingles) (level-up and quest jingles) | Kenney | CC0 | `public/assets/audio/sfx.*`, `amb/` (built by `npm run audio:build`; which file is which sound is in `scripts/audio/build.ts`) |
| Music: *Music Loop Bundle* (Dark Portents, Dust Bowl, Magnetic Tape, Primordial Soup, Pull Me Down) | [Abstraction](https://tallbeard.itch.io/music-loop-bundle) (Ben Burnes) | CC0; credit to "Abstraction" is appreciated, not required | `public/assets/audio/music/` |

The CC BY icons are credited on the character select screen, as their licence asks. Which icon
stands for which status is listed in `STATUS_ICONS` in `scripts/assets/thirdParty.ts`:

| Status | Icon | Author |
|---|---|---|
| burning | flame | Carl Olsen |
| poisoned | poison-bottle | Lorc |
| chilled | snowflake-2 | Lorc |
| frozen | frozen-block | Lorc |
| stunned | knocked-out-stars | Delapouite |
| vulnerable | broken-shield | Lorc |
| barrier | bubble-field | Lorc |
| marked | crosshair | Delapouite |
| stealth | hood | Lorc |
| evasive | sprint | Lorc |
| chitin | beetle-shell | Lorc |
| rooted | tree-roots | Delapouite |
| wading | waves | Lorc |
| overcharge | power-lightning | Lorc |
| kinetic | fist | Lorc |
| aegis | shield-reflect | Lorc |
| chainReaction | explosion-rays | Lorc |
| magnet | magnet | Lorc |
| overclock | stopwatch | Lorc |

The touch menu buttons (`MENU_ICONS` in the same script):

| Button | Icon | Author |
|---|---|---|
| inventory | knapsack | Lorc |
| character | visored-helm | Lorc |
| skills | skills | Delapouite |
| map | treasure-map | Lorc |
| quests | scroll-unfurled | Lorc |
| mount | scooter | Delapouite |
| flare | torch | Delapouite |
| fullscreen | larger | Kenney (CC0) |
| close (over portrait panels) | cross | Kenney (CC0) |
