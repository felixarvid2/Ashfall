# Credits

Most of Ashfall's art is generated for the game: 3D models and icons with Meshy, 2D art with FLUX.2
Turbo (see `scripts/meshy/` and `scripts/art/`). The rest comes from free libraries, fetched and
processed by `npm run assets:third-party` (`scripts/assets/thirdParty.ts`).

| What | Source | Licence | In the game |
|---|---|---|---|
| Environment light: *Burnt Warehouse* HDRI | [Poly Haven](https://polyhaven.com/a/burnt_warehouse) | CC0 | `public/assets/env/burnt_warehouse.webp` |
| Scatter props: barrel_03, Barrel_01, metal_trash_can, old_tyre, rusted_wheel_rim_01, metal_jerrycan_green, propane_tank, old_military_crate, ammo_box, trashbag, utility_box_01, moon_rock_01/03/06 | [Poly Haven](https://polyhaven.com/models) | CC0 | `public/assets/environment/` (`env.oil_drum` and so on; `credit` in `assets/manifest.json`) |
| Enemies for the Core: *Enemy_Flying* (`enemy.light_being`), *Enemy_Large* (`enemy.guardian_lancer`) from the Cyberpunk Game Kit | [Quaternius](https://quaternius.com/packs/cyberpunkgamekit.html) | CC0 | `public/assets/enemies/` (`credit` in `assets/manifest.json`) |
| Enemy: *Enemy_ExtraSmall* (`enemy.light_mote`) from the Ultimate Space Kit. Its `License.txt` header wrongly says "Ultimate Platformer Pack"; the [pack page](https://quaternius.com/packs/ultimatespacekit.html) states CC0 | [Quaternius](https://quaternius.com/packs/ultimatespacekit.html) | CC0 | `public/assets/enemies/light_mote.glb` |
| Enemy: *Stan* (`enemy.core_guardian`) from the Animated Mech Pack (Flat Colors glTF from the pack's Google Drive folder) | [Quaternius](https://quaternius.com/packs/animatedmechpack.html) | CC0 | `public/assets/enemies/core_guardian.glb` |
| Enemy: *Alien_Oculichrysalis* (`enemy.choir_singer`); props `prop.core_column` (Column_Pipes), `core_wall_panel` (WallAstra_Straight), `core_platform` (Platform_Round1), `core_console` (Prop_Computer), `core_cable` (Prop_Cable_3), `core_door` (Door_Frame_Square) from the Modular SciFi MegaKit (Standard) | [Quaternius](https://quaternius.com/packs/modularscifimegakit.html) | CC0 | `public/assets/enemies/choir_singer.glb`, `public/assets/props/core_*.glb` |
| Props: pipe, pipe-ring (`prop.core_pipe`, `prop.core_pipe_ring`) from the Space Station Kit | [Kenney](https://kenney.nl/assets/space-station-kit) | CC0 | `public/assets/props/core_pipe*.glb` |
| Cave wall rock: *Rock035* | [ambientCG](https://ambientcg.com/view?id=Rock035) | CC0 | `public/assets/textures/rock/` |
| Status icons | [game-icons.net](https://game-icons.net): Lorc, Delapouite, Carl Olsen | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | `public/assets/ui/status/` |
| Touch menu icons | [game-icons.net](https://game-icons.net): Lorc, Delapouite | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | `public/assets/ui/menu/*.svg` |
| Touch menu icon: close (*cross*) | [Kenney Game Icons](https://kenney.nl/assets/game-icons) | CC0 | `public/assets/ui/menu/close.png` |
| Fonts: Rajdhani (Indian Type Foundry), Share Tech Mono (Carrois Type Design) | [Google Fonts](https://fonts.google.com) | SIL Open Font License 1.1 (`public/assets/fonts/OFL-*.txt`) | `public/assets/fonts/` |
| Sound effects: [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds), [Impact Sounds](https://kenney.nl/assets/impact-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds), [Digital Audio](https://kenney.nl/assets/digital-audio), [RPG Audio](https://kenney.nl/assets/rpg-audio), [UI Audio](https://kenney.nl/assets/ui-audio), [Music Jingles](https://kenney.nl/assets/music-jingles) (level-up and quest jingles) | Kenney | CC0 | `public/assets/audio/sfx.*`, `amb/` (built by `npm run audio:build`; which file is which sound is in `scripts/audio/build.ts`) |
| Music: *Music Loop Bundle* (Dark Portents, Dust Bowl, Magnetic Tape, Primordial Soup, Pull Me Down) | [Abstraction](https://tallbeard.itch.io/music-loop-bundle) (Ben Burnes) | CC0; credit to "Abstraction" is appreciated, not required | `public/assets/audio/music/` |

The Quaternius and Kenney model files are kept by hand in `assets-src/third-party/models/<pack>/` (gitignored, with
each pack's licence file; `THIRD_PARTY_MODELS_SRC` points elsewhere). `npm run assets:third-party -- local-models`
converts them to `assets/source/<id>/refined.glb` (the list is `LOCAL_MODELS` in `scripts/assets/thirdParty.ts`), then
`npm run meshy -- optimize --ids …` builds the game files. Their animation clips are mapped to game states in each
manifest entry's `meshy.clips`.

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
| close (over portrait panels) | cross | Kenney (CC0) |
