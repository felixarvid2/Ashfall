---
name: claude-artifact-game-publish
description: Build and publish a Vite/Three.js browser game as a claude.ai artifact (and update it in place). Use when a web game or other multi-file app must run inside a claude.ai artifact, when an artifact publish is refused, or when models/textures/audio fail to load there.
---

# Publishing a browser game as a claude.ai artifact

The artifact page runs in a sandboxed iframe under a strict CSP. Most surprises come from that.

## What the artifact environment blocks

- **WebAssembly** (meshopt/Draco decoders) and **`data:` fetches**. Decode meshopt at build time and ship each
  model as JSON (`{ "glb": "<base64>" }`) with its textures as `data:` image URIs inside the glTF; images load
  through `<img>`, which is allowed. `.glb` files themselves are not served.
- **`<audio>` elements** are unverified there; use `fetch` + `AudioContext.decodeAudioData`.
- **Native `confirm()` / `alert()` / `prompt()`** are blocked in the iframe. Use an in-page confirm sheet.
- **Fullscreen** works only if the iframe allows it (it usually doesn't). Hide or replace the button
  (e.g. open the page in its own tab) when `document.fullscreenEnabled` is false.
- A relative `url()` inside a **CSS custom property** resolves against the stylesheet, not the page: build
  absolute URLs from `document.baseURI` when setting such variables from JS.

## Build

1. A dedicated build script (`npm run build:artifact`) runs `vite build` into its own folder with source maps
   off, converts models as above, drops LOD files the artifact doesn't use, and writes an
   **`artifact-page.html`**: the game's markup without the document skeleton (the service adds one), pointing at
   the hashed `index-*.js` / `index-*.css` read from the built `index.html`.
2. Keep **one CSS bundle**: import all stylesheets from the JS entry in a fixed order (not extra `<link>` tags),
   so the page wrapper only has to reference one hashed CSS file.
3. Remove PWA files (manifest, icons) from the artifact output; they belong to the standalone build only.

## Publish (update in place)

- Publish with `file_path` = `artifact-page.html`, `url` = the existing artifact, and `files` mapping every
  **new or changed** asset path → local file. Pass `null` for the old hashed bundles and for any file no longer
  in the build. `index.html` can't be a `files` path (the page is always the index).
- Compare against the published listing by **content hash** where possible; size-only comparison misses
  regenerated assets of equal size.
- A publish to an artifact not read in this conversation is refused and returns the live version: read it,
  merge, publish again. Never `force`.
- Build from a **clean checkout of the commit** (`git worktree add … HEAD`) when other agents are editing the
  working tree, so half-finished edits don't ship.

## Verify

- After publishing, list the artifact's files and confirm the page references the new bundles.
- Local checks can't prove the CSP case: ask the user to open the artifact and confirm audio plays and models
  load, or check one asset fetch in the real page.
