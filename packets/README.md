# Requests

One request per PR, written after the previous PR has merged. Keep it short.
Name: `REQ-<letter or number>_<short-name>.md`.
`paused/` holds the six October packets, parked on Nov 11, 2026. Do not build them as written.
Paths and line numbers inside the paused packets are as of Oct 23–26, 2026. Removed files: `git show docs-archive-2026-11-11:<path>`.

## Template

```
# REQ-X: <title: what changes for users>

## Why
2-3 lines. Who has the problem today, and what it costs them.

## Changes
- `path/to/file`: what changes, and what its new or changed test proves
- Optional: "Must not change" — screens, rules or data that stay exactly as they are.

## How to tell it worked
1-3 live checks. Say who does each: Claude Code (as admin, through the screens) or the owner (his phone or PIN).
1. ...

## Merge rule
Any time. OR, for a database or app-update change: evening (or 0 Active Deployments), and alone.

## CHANGELOG line
YYYY-MM-DD · #PR · what changed for users
(Written inside the PR, never edited afterwards. The live revision and the live-check result go in a comment on the PR.)
```

How a request is built, tested and shipped: `CLAUDE.md`.
