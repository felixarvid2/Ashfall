# Ashfall

A dark sci-fi isometric action RPG for the browser: TypeScript, Vite, Three.js and a small ECS. Start
with `PROGRESS.md` (current phase and how to run), `docs/design-brief.md` and `docs/decisions.md`
(past design choices; respect them or say why one should change). The game's text is English only.

## Layout

- `src/data/` game data (classes, skills, items, enemies, zones, quests, `lang/en.json`)
- `src/systems/` simulation (combat, AI, skills, projectiles, status effects)
- `src/render/` Three.js rendering; `src/ui/` DOM HUD and panels (`style.css`)
- `scripts/` asset pipelines: Meshy (`meshy/`), FLUX art (`art/`, `vfx/`), free libraries
  (`assets/thirdParty.ts`), the artifact build (`artifact/`)
- `assets/manifest.json` every 3D asset; `public/assets/` the optimized game files
- `tests/` vitest; `docs/credits.md` third-party credits and licences

## Commands

- `npm run dev` play locally; `npm run build` typecheck and production build into `dist/`
- `npx tsc --noEmit -p .` and `npx vitest run` must pass before anything is done
- `npm run build:artifact` the self-contained build for a claude.ai artifact (`dist-artifact/`) and the page to
  publish (`dist-artifact/artifact-page.html`)
- `npm run e2e -- --scenario <boot|portrait|tooltip|instance|zone|landscape> --out <dir>` headless
  browser checks with screenshots (`scripts/e2e/README.md`; start `npm run dev` first)
- Releases: push a tag `vX.Y.Z`; `.github/workflows/release.yml` builds the game and attaches
  `ashfall-vX.Y.Z-web.zip` to a GitHub release

## Rules

- API keys (Meshy, fal.ai) live only in `.env` (gitignored) and are never imported under `src/`.
- Say what a Meshy or FLUX generation will cost before running it; both are budgeted in their scripts.
- Third-party assets need their licence recorded in `docs/credits.md` (and on the character select
  screen when the licence asks for credit).

## Who does what

Work is split by model; the subagents live in `.claude/agents/`.

| Work | Who | Model |
|---|---|---|
| Finding files and symbols, reading code, answering "where/how" | `Explore` | Haiku |
| Running tsc / vitest / assets:check and reporting only the verdict and failures | `verifier` | Haiku |
| Simple mechanical edits that are already fully specified (renames, strings, data values, the same small change in many places) | `mechanic` | Haiku |
| Docs from a short summary: decisions, credits, PROGRESS, release notes, commit and PR bodies | `scribe` | Haiku |
| Shipping: commit, push, PR, artifact rebuild and publish, release workflow (merge only after the user approves) | `shipper` | Haiku |
| Regular coding: implementing a specified feature or fix, tests, planned refactors | `implementer` | Sonnet |
| Game content in `src/data` (enemies, items, skills, quests, dialogue, strings) | `content` | Sonnet |
| Visual checks in a headless browser (HUD, panels, mobile, zones, dungeons), reported as text | `playtester` | Sonnet |
| Architecture, trade-offs, hard bugs with an unknown cause, risk review | the main session, or `architect` when the main session runs a smaller model | Opus |

The point is to keep the main session's context small: it plans, decides and reviews; subagents do
the reading, running and writing and return short reports.

- Delegate search and reading to `Explore` instead of reading many files yourself, and pass it the
  question, not a file list to dump.
- Hand `implementer` / `content` a clear spec (what, where, how to verify); hand `mechanic` the
  exact change; hand `scribe` the facts. Run independent pieces in parallel.
- Never read raw test output or screenshots in the main session: `verifier` and `playtester` report
  in text, and the main session opens an image only when a report says something is wrong.
- Keep decisions here: choosing an approach, reviewing what subagents return (the diff and the
  verifier's verdict) before anything is shipped, and anything that spans several systems.
- Paid generation (Meshy API stages, `npm run art:generate` / `vfx:generate`) is never delegated:
  the main session states the cost, gets the user's go-ahead, and runs it.
- `shipper` merges a pull request only when told that the user approved that merge.

## Skills

Project skills live in `.claude/skills/` (copies of the general ones are in felixarvid2/claude-skills):
`ashfall-region-pipeline` (how a region or phase is built), `parallel-subagent-builds`,
`claude-artifact-game-publish`, `headless-browser-game-checks`, `mobile-portrait-game-ui`,
`free-game-asset-pipeline` and `cloud-session-github-ops`.
