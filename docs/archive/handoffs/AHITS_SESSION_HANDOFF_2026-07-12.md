> ⤴ **ARCHIVED (superseded) — moved 2026-07-22.** Historical record; current state lives in `STATUS.md` + the newest handoff. Kept for provenance only — do not act on it.

# AHITS — Session Handoff · 2026-07-12 (session 5)

> STATUS: canonical · UPDATED: 2026-07-12 · READ-WITH: `STATUS.md`, `DECISIONS.md`

## What shipped

**CC-11 · Admin-as-operator (PR #181, merged `a97079b`).** An admin can now hold a rig, be a transfer/handoff recipient, and accept transfers/handoffs — all writing `deployment_assignments` PRIMARY rows, never the legacy `Rig.operatorId` path. Landed:

- Role gates relaxed: `deployments/[id]/transfer`, `deployments/[id]/handoff`, `/api/operators` roster.
- Admin selectable in the admin deployment-builder (New Deployment, Add Operator, Reassign Primary, and the "All Operators" table filter).
- FND-23 index A (one open PRIMARY per operator) race now surfaces a friendly 409 instead of a raw constraint message on `transfers/accept` and `handoffs/accept` — required a real fix (see below), not just the first pass.
- Admin-held rigs are flagged distinctly (not excluded outright) in the missed-check cron alert and in **both** dashboard missed-check surfaces (Active Alerts chip + the separate "Missed checks today" feed panel), and are excluded from payroll attribution per D3 via a `role`-carrying hook — no attribution consumer exists yet (Time/Invoicing is CC-17, unbuilt).
- Verify gate: `tsc`/`eslint` clean locally; `npm test` could not run in the working sandbox (no Docker for the throwaway test DB) — CI's `verify` workflow ran it and passed.
- Staging smoke-tested live: admin held a rig, was reassigned primary via the handoff path, cleaned up after.

**Self-review pass, medium effort (8 finder agents + verification), found and fixed 6 real gaps before merge:**
1. The new FND-23 friendly-409 guard was dead code — Prisma surfaces a raw `$executeRaw` unique violation as `P2010` with the real code nested at `err.meta.code`, not top-level `err.code`. Fixed with a new `isUniqueViolationAnywhere()` helper in `src/lib/api-errors.ts`.
2. `deployment-requests/awaiting-pickup` still 403'd ADMIN sessions — an admin holding a rig with a fulfilled reservation had no way to see it. Fixed.
3. The dashboard's second, independent "Missed checks today" feed panel (`dashboard/feeds/route.ts`) didn't carry the admin-held signal the Active Alerts panel got. Fixed.
4. The "All Operators" table filter dropdown was the one place CC-11 missed updating. Fixed.
5. A `?? 'OPERATOR'` fallback default was unreachable dead code that also defaulted in the wrong direction for D3 safety. Removed.
6. `getVehicleOperators`'s own attribution-hook comment claimed a role join it never got. Added.

One process-level finding not resolved unilaterally: **D8** (new, see `DECISIONS.md`) — D3 called for the resolver-and-cron work to land *before* the role gates relax; CC-11 landed the cron half concurrently since no resolver exists yet. Flagged for Max, not treated as a blocker.

**Reflection-increment doc corpus merged into the canonical docs this session** (was sitting uncommitted from an earlier session): `AHITS_CLAUDE_CODE_INSTRUCTIONS.md` is now the canonical packet doc (packets CC-22–CC-28 queued); `AHITS_AMENDMENTS_2026-07-12.md`'s edits are applied to `STATUS.md` (SESSION CLOSE step 7 + §1≡§2 invariant), `DECISIONS.md` (D5–D7 appended as PENDING, CC-20 remainder added to the parked registry), and `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md` (new landing order + CC-22–27 smoke lines).

## Merge mechanics note

PR #181 needed an admin-override merge (`gh pr merge --admin`) — `development`'s branch protection requires 1 approving review, and GitHub blocks a PR author from self-approving. I (Claude, authenticated as the same account that opened the PR) could not satisfy that gate through a normal review. Max explicitly authorized the admin-override after reviewing the self-review summary. Worth deciding whether that's the intended path going forward or whether a second human reviewer should be looped in for future PRs.

## Resume points

1. **D5–D8 are open PENDING decisions** (`DECISIONS.md`) — need Max's call before the pilot fortnight starts. D5 in particular (hold pilot for Today, or ship CC-28 bridge) gates the landing order below.
2. **Next packets in order** (per the updated `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`): CC-22 (pilot ops rider) → CC-23 (tokens/design) → CC-24 (subtraction) → CC-25 (live QR) → CC-12 (Batch 6b/perf) → CC-14 (Today) → CC-26 (daily-check viewer, must land before the pilot fortnight) → pilot fortnight (CC-27 as filler) → CC-15/16/17/18.
3. **A6 device pass** — still not started; run in parallel with the packets above.
4. **CC-22's Sentry/heartbeat wiring** needs Max to create the `AHITS_SENTRY_DSN` Secret Manager version and a healthchecks.io check before the activation deploy turns them on live.

## Doc-lifecycle note

The four reflection-increment files (`AHITS_CLAUDE_CODE_INSTRUCTIONS.md`, `AHITS_AMENDMENTS_2026-07-12.md`, `AHITS_PILOT_CHARTER.md`, `AHITS_DESIGN_AND_REFLECTION_2026-07-12.md`, `AHITS_IDEA_COMPENDIUM.md`) were sitting untracked with restrictive file permissions from an earlier session and were never committed. Content was verified as legitimate and confirmed by Max before being treated as current. They're committed as part of this session's close — see git log for this date.
