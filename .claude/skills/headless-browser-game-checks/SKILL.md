---
name: headless-browser-game-checks
description: Check a WebGL/Three.js browser game in headless Chromium with Playwright (desktop and mobile emulation), with screenshots and DOM assertions. Use for any visual or layout check, playtesting a feature, or reproducing a UI bug in a cloud container without a GPU.
---

# Headless browser checks for a WebGL game

## Launch

- Chromium with software GL: `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
  (pre-installed browsers: point `executablePath` at the bundled Chromium; never `playwright install`).
- Audio tests: add `--autoplay-policy=no-user-gesture-required`.
- Mobile: `hasTouch`, `isMobile`, a portrait viewport (390×844, 360×780, 320×640), and also check desktop
  1280×720 and landscape 844×390 so fixes don't break them. DPR 2 can hang under software GL; DPR 1 is fine.
- Serve a **production build** with `vite preview` on a unique port, start/stop by PID. Avoid the dev server
  when others are editing files (HMR reloads kill runs). Don't `pkill` by pattern — it can kill your own shell.

## Driving the game

- Expose a debug API behind `?debug` (`window.<game>`: enter zone, teleport, god mode, spawn, kill all, state
  dumps like `audioDebug`). Set account/save state through `localStorage` before load.
- The game renders at ~4 FPS here: **hold** keys for several frames instead of quick presses; wait on state, not
  on time; use DOM `.click()` when Playwright's click times out.
- Write **one script** that does every step and saves every screenshot; budget turns, read only the key shots.

## Assertions that catch real bugs

- `document.elementFromPoint(x, y)` at a button's centre: proves it's tappable (catches `pointer-events: none`
  ancestors, overlays above buttons, a canvas swallowing taps).
- Bounding-box overlap scans across HUD elements at each viewport size.
- Font sizes and tap-target sizes from `getComputedStyle`/`getBoundingClientRect` (≥44 px targets, ≥12 px text).
- Page errors, console errors and 404s for asset requests.

## Pitfalls seen

- A `MutationObserver` watching `hidden` that writes `hidden` re-fires forever and freezes the page — guard
  writes (only write on change).
- Several agents running Chromium at once run the box out of memory (renderer OOM). One browser at a time.
- The camera only shows ~20 m: spawn or teleport the thing you're checking near the player.
- Screenshots during CSS animations can show half-faded elements; verify with the DOM instead.
