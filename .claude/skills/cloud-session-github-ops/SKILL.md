---
name: cloud-session-github-ops
description: Git and GitHub operations from a Claude Code cloud session (proxy, MCP GitHub tools, multiple repos, releases, PRs). Use when pushing, releasing, creating repos, splitting a repo, merging PRs or working across several repositories from a remote container.
---

# GitHub work from a cloud session

## What the environment allows

- **Push branches** through the git proxy. Blocked (tested): tag pushes, creating a tag ref via the REST API
  ("Write access to this GitHub API path is not permitted"), and creating or editing releases via REST or
  `gh release` ("not permitted for this session type"; `gh release edit` also needs GraphQL, which is off).
  Releases therefore go through a workflow that uses its own `GITHUB_TOKEN`:
  - best: the workflow also runs on `push` to main with `paths: ['docs/releases/v*.md']`, takes the tag from
    the changed file name and uses that file as the release body (`body_path`, `overwrite_files: true`).
    Merging a PR with a new notes file creates the release; editing the file updates it.
  - or `workflow_dispatch` with a `tag` input, triggered via the GitHub MCP `actions_run_trigger`.
  Confirm with `get_release_by_tag`. A personal access token in `GH_TOKEN` (environment secret) is the
  documented way to run `gh release` directly, if the user wants to set one up.
- **No repo creation** (`create_repository` returns 403): ask the user to create it, then `add_repo` (push access)
  and clone once with a long timeout.
- **Force pushes can be denied** by the auto-mode classifier: after a PR merge, bring the branch up to date with
  `git fetch origin main && git merge --ff-only origin/main` and a normal push.
- Moved repos: GitHub's "repository moved" notice is harmless; fix the remote URL.
- No `gh` CLI: use the MCP GitHub tools (create/merge PR, read checks, comments). Merge only when the user says so.

## Splitting a project into its own repo

1. Copy the subtree (or filter history), `git gc --prune=now` to shrink it, push to the new repo's branch, open a
   PR, merge on approval.
2. Move gitignored essentials by hand (e.g. `.env` with API keys) before deleting the old folder; check for
   untracked, unsaved files (hash-compare against both repos) and save the unique ones to an assets repo.
3. In the old repo: remove the folder, fix READMEs/CLAUDE.md/agents that referenced it, keep the asset library.
   Exclude leftover local folders via `.git/info/exclude`, not a commit.

## Habits

- Branch from the default branch; commit with the required attribution trailers; push with
  `git push -u origin <branch>`; retry network failures with backoff.
- Scan the staged diff for secrets before each commit (`git diff --cached | grep -cE "<key regex>"` must be 0);
  require 12+ chars after the prefix so the check's own pattern doesn't match.
- The stop hook flags uncommitted work: commit checkpoints when checks pass; when agents are mid-edit, explain
  instead of committing broken code.
- Subscribe to the PR after opening it; repos without CI need no fixing — say so and wait for the user.
- Keep the README and the source-of-truth copies in sync when the same skills/agents live in two repos.
