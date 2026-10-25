---
name: playwright-webgl-testing
description: Test, screenshot and debug a WebGL/three.js browser game with Playwright in a headless cloud container (SwiftShader, no GPU) - setup, seeding state, driving the game, desktop and mobile emulation, tap/overlap/size assertions, catching one-frame glitches, regression tests, screenshots for READMEs. Use when verifying a browser game change in the real page, checking HUD or mobile layout, hunting flicker/black frames, playtesting a feature, or taking game screenshots without a display.
---

# Playwright testing of a WebGL game (headless, no GPU)

Learned on Krabba-passet (static HTML/JS, three.js) and Ashfall (Vite/TypeScript, Three.js, DOM HUD). Paths
below are from those containers; check them.

## Setup

- Serve the game:
  - static folder: `(npx http-server -p 8765 -s -c-1 . &)` (`-c-1` = no cache);
  - Vite project: a **production build** + `npx vite preview --outDir <dir> --port <unique>`. Avoid the dev
    server when anyone else edits files: HMR reloads kill the run.
  - Start and stop servers by PID; never `pkill -f` a pattern that matches your own shell.
  - The server dies with the container; check with `curl -s -o /dev/null http://localhost:<port>/` first.
- Playwright: a global install (`NODE_PATH=/opt/node22/lib/node_modules node test/x.js`) or the project's
  `playwright-core`. Chromium is preinstalled (point `executablePath` at it if needed); never run
  `playwright install`.
- WebGL without a GPU:
  `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })`.
  Add `--autoplay-policy=no-user-gesture-required` to test audio.
- Expect **1–20 fps**. Anything timing-based (flicker, adaptive resolution, short key presses) won't reproduce
  by just playing: force the trigger, **hold** keys for several frames, wait on state rather than time, and
  use a DOM `.click()` when Playwright's click times out.

## Seeding state and driving the game

- Seed before load with `page.addInitScript(() => localStorage.setItem(KEY, JSON.stringify({...})))`: mode,
  quality, `tutorialDone`, the current `lastVersion` (so a "what's new" dialog doesn't cover the menu; bump it
  when the version changes), account/save state for late-game checks.
- Use the game's own API in `page.evaluate` rather than synthetic input (`NV.game.startWeek(3)`,
  `g.setMode('hd2d')`, or a debug API behind `?debug` such as `window.ashfall`: enter zone, teleport, god mode,
  spawn, kill all, state dumps like `audioDebug`). For deterministic checks step the loop yourself:
  `for (...) { w.update(1/30); } w.render(1/30, w.zone());`.
- Typed input can arrive before the UI is ready. Call the component's API (`terminal.submit(cmd)`); some
  actions only prefill input that still has to be submitted.
- The camera may show only ~20 m: spawn or teleport what you check next to the player.
- Collect `pageerror`, console errors and failed asset requests (404) in every run and fail on them; an exit
  code of 0 is not enough.
- Write **one script** per check that does every step and saves every screenshot, then look only at the shots
  you need.

## Desktop, mobile and layout assertions

- Viewports: desktop 1280×720; mobile with `hasTouch`, `isMobile` in portrait 390×844, 360×780, 320×640, and
  landscape 844×390, so a fix for one doesn't break another. DPR 2 can hang under SwiftShader; DPR 1 is fine.
- `document.elementFromPoint(x, y)` at a button's centre proves it's tappable (catches `pointer-events: none`
  ancestors, overlays above buttons, a canvas swallowing taps).
- Bounding-box overlap scans across HUD elements, at every viewport, with many elements visible at once.
- Sizes from `getBoundingClientRect` / `getComputedStyle`: tap targets ≥44 px, text ≥12 px.
- Screenshots during CSS animations can show half-faded elements; confirm with the DOM.

## Catching one-frame glitches

- Wrap `world.render` and, right after drawing, `drawImage(renderer.domElement)` into a 32×18 canvas and read
  `getImageData`. With `preserveDrawingBuffer: false` this only works in the same task as the draw, which is
  exactly when the browser would composite it. Log frames whose mean brightness drops below ~60 % of the
  running median, or whose alpha is 0 (cleared canvas), with a state snapshot (camera, zoom, zone).
- A cleared canvas reads as alpha 0; the user sees the page background (often near-black).

## Regression tests

- Add the check to the project's browser test, run it, then prove it catches the bug:
  `git stash push -- path/to/fixed.js && node test/x.js; git stash pop`. Report both numbers
  (e.g. canvas alpha 0 before, 255 after; tooltip height 259 px before, 34 px after).
- Measure DOM state synchronously after the action; the game loop may reset it before an `await` returns.
- Do not switch branches, stash, or rewrite files while a background test run, or another agent, is reading
  them.

## Screenshots for docs

- 1280×720 viewport, wait 4–9 s after starting for models, toasts and intro animations; hide leftover toasts
  in `evaluate` before the shot.
- Convert PNG to JPEG without extra tools: `page.setContent('<img src="data:image/png;base64,...">')` then
  `page.screenshot({ type: 'jpeg', quality: 86 })` (~1 MB -> ~150 kB).
- Look at every screenshot before using it (crop, overlays, half-typed commands).

## Running the suite and known pitfalls

- Browser tests take 1–5 min each on SwiftShader; run them in a background loop that writes one line per test
  to a file, and wait on that file. A foreground command is killed at 10 min; `run_in_background` jobs have
  their own time limit, so set it high for a full suite.
- Several Chromium instances at once (e.g. parallel agents) run the box out of memory (renderer OOM): one
  browser at a time.
- A `MutationObserver` watching `hidden` that itself writes `hidden` re-fires forever and freezes the page at
  boot; guard such writes (write only on change).
