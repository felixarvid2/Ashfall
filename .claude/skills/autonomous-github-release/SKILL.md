---
name: autonomous-github-release
description: Cut a GitHub release end to end on your own, including from a Claude Code cloud session where tag pushes and the releases API are blocked - pick the version, write release notes from what was merged since the last release, ship them as docs/releases/vX.Y.Z.md in a PR whose merge triggers the release workflow, then verify the release and its files. Also sets that workflow up in a repo that lacks it. Use when asked to make, publish or update a release, bump the version, or write release notes.
---

# Autonomous GitHub release

A release is a normal PR: merging `docs/releases/vX.Y.Z.md` to the default branch runs the release workflow,
which builds the project, creates (or updates) release `vX.Y.Z`, attaches the build and uses the file as the
release text. Nothing needs a tag push, the Actions UI or release API access.

## What a cloud session can and can't do (tested)

| Way | Result |
|---|---|
| `git push` of a tag | blocked |
| create a tag ref via REST (`POST /git/refs`) | 403 "Write access to this GitHub API path is not permitted" |
| create/edit a release via REST or `gh release` | 403 "not permitted for this session type" (`gh release edit` also needs GraphQL, which is off) |
| `workflow_dispatch` via the GitHub MCP `actions_run_trigger` | works |
| merge a notes file that the workflow listens for | works (preferred: reviewable, and editing the file updates the text) |
| reading releases (`get_release_by_tag`, `gh api repos/{o}/{r}/releases/tags/{tag}`) | works |

A personal access token in `GH_TOKEN` (environment secret) is the documented way to run `gh release` directly;
only suggest it if the user wants that.

## Approval

A user asking for a release approves opening and merging the release PR (notes file and version bump only).
Unmerged feature work that should be in the release needs its own go-ahead: ask before merging it.

## Steps

1. **Ready?** Default branch green (the repo's own checks, e.g. `tsc` + `vitest`); your working branch merged
   or empty. If an open PR holds work the user expects in this release, ask.
2. **Since when?** Last release: GitHub MCP `get_latest_release`. What changed:
   `git fetch origin main --tags` then `git log --oneline <lastTag>..origin/main` (or the merged PRs since
   its date). Read PR titles/bodies rather than every commit.
3. **Version** (semver): fixes only → patch; new features → minor; incompatible saves/APIs or a big
   overhaul → major. If the repo keeps a version in a file (`package.json`, a version constant), bump it
   in the same PR.
4. **Notes** in `docs/releases/vX.Y.Z.md`: a `## What's new since vA.B.C` heading, grouped user-facing
   bullets (features, balance, fixes), a line on save/compat migration if any. No internal IDs or agent
   talk. The workflow prepends the download/how-to-play lines itself. (`scribe` can draft it from facts.)
5. **PR**: branch from the default branch, commit the notes (+ version bump), push, open the PR, merge it
   with a merge commit and `expectedHeadSha` = the full 40-character SHA (a short SHA is rejected).
6. **Watch the run**: GitHub MCP `actions_list` → `list_workflow_runs` for the release workflow (event
   `push`, head = the merge commit). Don't `sleep`: schedule a check-in (`send_later`, ~2–4 min) or wait
   for the next event. On failure read `get_job_logs` (failed only), fix in a new PR; editing the notes
   file re-runs the release.
7. **Verify**: `get_release_by_tag` → body has the notes, the expected asset is attached (name, size,
   updated time). Then report the release URL, the asset and the highlights.
8. **Follow-ups**: anything else the project ships separately (e.g. a hosted demo or claude.ai artifact)
   if its code changed since that was last published.

## Setting the workflow up

Copy `templates/release.yml` to `.github/workflows/release.yml` and fill in the build and asset steps. It
needs:

- triggers: `push` to the default branch with `paths: ['docs/releases/v*.md']`, plus `push: tags: ['v*']`
  and `workflow_dispatch` with a `tag` input as fallbacks (path filters are ignored for tag pushes);
- `permissions: contents: write`, `actions/checkout` with `fetch-depth: 0`;
- a step that picks the tag: dispatch input, else the pushed tag, else the newest changed notes file
  (`git diff --name-only "${{ github.event.before }}" "${{ github.sha }}" -- 'docs/releases/v*.md' | sort -V | tail -1`),
  checked against `^v[0-9]+\.[0-9]+\.[0-9]+$`;
- `softprops/action-gh-release@v2` with `tag_name`, `body_path` (notes file plus a short header) and
  `overwrite_files: true`, so re-running updates an existing release instead of failing.

Ship the workflow in its own PR first; the release itself is the next PR (or add the first notes file to
the same PR and the merge releases it).

Pitfalls: a merge that changes several notes files releases only the newest; editing an old notes file
re-releases that old tag (rebuilds from the current default branch); the tag is created on the merge
commit, so the release always contains everything merged up to it.

## In Ashfall

Notes in `docs/releases/`, workflow `.github/workflows/release.yml` (runs `vitest`, builds, zips `dist/`
as `ashfall-vX.Y.Z-web.zip`). After a release that changed game code, republish the claude.ai artifact
(`claude-artifact-game-publish`) if that wasn't done yet.
