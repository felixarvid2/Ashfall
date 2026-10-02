# Meshy asset pipeline (Phase 2)

Node scripts that generate 3D assets with the Meshy AI API, driven by `assets/manifest.json`.
Not built yet — see the design brief §9 and PROGRESS.md.

The API key is read from `ashfall/.env` (`MESHY_API_KEY=...`, git-ignored) or the environment.
It must never be imported by anything under `src/`.
