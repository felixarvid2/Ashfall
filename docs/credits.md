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
| Fonts: Rajdhani (Indian Type Foundry), Share Tech Mono (Carrois Type Design) | [Google Fonts](https://fonts.google.com) | SIL Open Font License 1.1 (`public/assets/fonts/OFL-*.txt`) | `public/assets/fonts/` |

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
