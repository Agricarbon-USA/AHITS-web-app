# AHITS — Session Handoff · CC-31 (accuracy floor + /admin/pilot dashboard) · 2026-07-28

> READ-WITH: `STATUS.md` (§3 CC-31 entry) · `DECISIONS.md` · `AHITS_CC29-31_PILOT_FLOOR_PACKETS.md` (CC-31 packet) · `AHITS_SIX_SEAT_REVIEW_2026-07-28.md` (§3.1/§3.3/§3.5/§3.6/§3.10/§3.11/§4.5)

## What shipped (code complete — 3 PRs)

CC-31 executed the tier-3 accuracy + admin-eyes batch as three independently-shippable PRs.

- **PR-1 · cron truth — on `development` (`616cc6e`), green after #213.**
  - INV-5 false-alarm fix: the strandless OR arm now age-qualifies (`72h`) and excludes units explained by an in-flight flow — an active un-expired HUB_RETURN link (`state IN ('ISSUED','VIEWED')`) or a PENDING transfer matched **through the kit item** (the end route sets `TransferItem.kitItemId` only). End-of-deployment no longer cries wolf.
  - Alert auto-resolves: PIN_LOCKED (users/[id] PATCH on pin/unlockPin), MATERIAL_REQUEST (a wrapper around `applyRequestTransition` so the public status-link path converges), EQUIPMENT_NOT_RETURNED (end route), INVENTORY_DRIFT INV-1..5 + per-item. **Every resolve runs only in the `else` of a query that SUCCEEDED** — a thrown detector never reads as "all clean".
  - Tests (CI): `tests/cc31-inv5-custody-strand.test.ts`, `tests/cc31-alert-autoresolve.test.ts`.
- **PR-2 · #215 (OPEN + green).** Expired HUB_RETURN unjam (`applyTransition` `bypassExpiry`, admin receive only; state gate untouched; public `/s/[token]` still 409s; "Expired link" chip) · `forOperatorId` in `listRequests` + **client Cancel gated by `requestedById`** · durationMs stamped before the GPS wait · two additive indexes + a hand-written migration. Tests: `tests/cc31-expired-hub-return.test.ts` + extended `new3-request-for-operator.test.ts`.
- **PR-3 · #214 (OPEN + green).** `/admin/pilot` + metrics API — snapshot-per-day eligibility (no retroactive shift), GPS grant rate, duration buckets + `<20s` flag, the day's checks list (deep-links the CC-26 viewer via `/admin/vehicles?check=<id>`, D12), per-rig operator+vehicle breakdown (D3 `isAdminHeld`), nav 'Pilot' admin-only. Tests: extended `tests/cc14-pilot-metrics.test.ts`.

## The incident (read before touching git history)

PR-1's commit **landed directly on `development`** with no PR: a **parallel CC-32 session sharing this working tree moved HEAD to `development` mid-commit**, so my `git commit` + `git push -u origin HEAD` went to `development` (a fast-forward). Branch protection then blocked a clean rewind (force-push rejected). **Max's call: leave PR-1 on `development` and smoke it retroactively.** From that point I worked in an **isolated git worktree** (`ahits-cc31-worktree`) so my HEAD no longer raced the parallel session.

`development` then went **red** from PR-1's test fallout — three causes, all fixed in **#213 (MERGED)**:
1. `account_audit_log` was missing from the `tests/setup.ts` teardown (its user FK has no cascade; my PIN test was the first ever to write it) — the one-line fix Max routed.
2. 8 `alerts` mocks stubbed only `createAlert`; my new `resolveActiveAlert` calls (end route + `applyRequestTransition`) broke any test reaching those paths (`transfer-lifecycle` did) — added the export to all eight.
3. My INV-5 test's `ageUnit` used `make_interval(days => $1)`; Prisma binds bigint (`42883`) — compute the timestamp in JS instead.

## Also done this session (per Max's follow-up)

Shepherded **CC-32's parked PRs to merge** after `development` went green (CC-32's session had closed): **#210** (branch-updated → green → merged), **#211** (retargeted to `development`, one-line `OfflineBanner` conflict resolved keeping its 44px thumb hit-area → green → merged), **#212** (docs merged). CC-32 is fully landed.

## Resume points (highest value first)

1. **Smoke + merge #215, then #214** on staging (the packet's "never waive a smoke" gate — I deliberately did not self-merge these).
2. **PR-1's owed retroactive staging smoke** — one full cron force-run watched in the alert bell (no stranded-units alert on a normal end), and confirm a PIN reset clears PIN_LOCKED without a manual Resolve.
3. Then **CC-16S** (public-surface security) → **CC-33**.

## Non-goals held / flagged

- **NO EXPIRED-link persistence sweep** (PARKED — trigger: expired-link volume makes the computed check a real cost).
- **NO secondary-operator Today rework** (own pre-CC-17 packet, review §3.2) — item 4 was only the `forOperatorId` scope line + the read-only Cancel gating.
- Migration is **additive-only** (two `CREATE INDEX`).
- **Discovered latent bug (out of scope, NOT fixed):** the cron's step-7 stale-hold release uses `make_interval(hours => $1)` which throws `42883` (Prisma bigint bind) but is swallowed by its `try/catch` — so stale-hold TTL release has been silently no-op'ing. Needs its own fix (same class as the test bug I hit).

## Process note for the next session

The `node_modules` symlink trick used to run `tsc`/`eslint` in a worktree can be scooped by `git add -A` (the repo's `.gitignore` uses `node_modules/`, which does not match a *symlink*). **Stage explicit paths, never `-A`, in a worktree.**
