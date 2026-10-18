# Headless-browser checks (`scripts/e2e/`)

Small playwright-core kit for looking at the running game: boot it, press buttons, take screenshots and
collect page errors. No browsers are downloaded; Chromium is preinstalled. The path comes from env
`CHROMIUM_PATH` (default `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, falling back to
`/opt/pw-browsers/chromium`). WebGL runs in software (swiftshader), so the game is slow (about 4 FPS).

## Run

```sh
npm run dev                      # in another shell (http://localhost:5173/)
npm run e2e -- --scenario portrait --out /tmp/shots
```

Options: `--scenario <name> --out <dir> [--url http://localhost:5173/] [--viewport 390x844] [--mobile]
[--class bastion|spectre|xenomant] [--poi <id>] [--zone <id>] [--timeout <seconds, default 300>]`.

Each run starts from an empty save, opens the game with `?debug` (this exposes `window.ashfall`), creates a
character in slot 0 and waits for the simulation to tick. It prints one JSON line,
`{ scenario, screenshots, errors, notes }`, and exits with code 1 on page errors or a timeout (a
`<scenario>-failure.png` screenshot is then added).

To check a build, point `--url` at a static server of `dist/` or `dist-artifact/` (for example
`npx vite preview --port 4173`). The scenarios use only `window.ashfall`, so they work there too; a new
scenario that needs `import('/src/...')` (a module `window.ashfall` does not expose) works on the dev server only.

## Scenarios

| Scenario | Viewport | What it does |
|---|---|---|
| `boot` | 1100x760 | Class select screenshot, then the in-game HUD. |
| `portrait` | 390x844 touch | HUD, then opens and closes inventory, skills, map and quests through the touch menu (`touch-menu-<id>`, `.touch-close`), one screenshot each. Notes: action-bar slot rectangles and which panels stay open after closing. |
| `tooltip` | 390x844 touch | Taps an equipped item and a skill-tree node; notes the visible `.item-tooltip` class and rect. |
| `instance` | 1100x760 | `--poi` (default `dungeon.drainage`): `enterInstance`, screenshot, `exitInstance`. Fails on an unknown poi and lists the valid ones. |
| `zone` | 1100x760 | `--zone <id>` (for example `zone.deep_mines`, required): `enterZone(id, 0, 0)`, kills enemies, zooms in, hides the HUD, screenshot. |
| `landscape` | 844x390 touch | HUD screenshot in landscape. |

`lib.mjs` has the helpers for new scenarios: `launch`, `startGame`, `hideHud`, `shot`.
