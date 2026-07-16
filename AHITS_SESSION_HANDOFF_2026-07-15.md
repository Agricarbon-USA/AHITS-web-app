# AHITS — Session Handoff · 2026-07-15 (session 6)

> STATUS: canonical · UPDATED: 2026-07-15 · READ-WITH: `STATUS.md`, `DECISIONS.md`

## What shipped

**CC-22 · Pilot ops rider — cron heartbeat + Sentry wiring (PR #182, merged `d3d1537`).** Two operability features so the pilot isn't flying blind, both designed to no-op cleanly when their secret is absent.

**Cron dead-man heartbeat:**
- External primary signal: a `fetch(CRON_HEARTBEAT_URL)` with a 3s timeout at the end of every successful cron run (`api/cron/dispatch`), `.catch()`'d so it never fails the run; skipped entirely when the env var is unset.
- In-app secondary signal: `notification_config.cronLastRunAt` stamped on every successful run (new nullable column + `recordCronHeartbeat`/`getCronLastRunAt` in `notification-config.ts`).
- `CRON_SILENT` alert raised on the **admin-alerts read path** (`api/admin/alerts` GET — verified this is the endpoint the dashboard's Active Alerts panel calls on every load, not the cron itself, since a dead cron can't self-report), when `cronLastRunAt` is >30 min stale. Guarded against a null `lastRunAt` so a fresh deploy never false-alarms. New `CRON_SILENT` AlertType (isolated additive enum migration, per the INVENTORY_DRIFT precedent) + label in `alert-display.ts`.
- Re-arm: the cron calls `resolveActiveAlert('CRON_SILENT', …)` on every successful run — load-bearing, or the alert would never clear. Source-identity constants (`CRON_SILENT_SOURCE_TABLE`/`_ID`) are shared from `lib/alerts.ts` so the raise and resolve sides can't drift.

**Sentry wiring (manual runtime init, NOT `@sentry/nextjs`'s build-time `NEXT_PUBLIC_SENTRY_DSN` auto-wiring — that was explicitly out of scope):**
- Server: `src/instrumentation.ts` `register()` reads `SENTRY_DSN` directly (server-only) and no-ops when unset; `onRequestError` captures uncaught request errors with `request_id` tagged.
- Client: `SENTRY_DSN` + the request's `x-request-id` are read server-side in `layout.tsx` and passed as props to a new `SentryProvider` (client) that runs `Sentry.init` once — so a client and server error for the same request correlate under one `request_id`. No `NEXT_PUBLIC_`, no hardcoded DSN.
- CSP `connect-src` in `proxy.ts` extended for the Sentry ingest hosts (`*.ingest.sentry.io`, `*.ingest.us.sentry.io`, `*.ingest.de.sentry.io`).
- Admin-gated diagnostics (`/api/debug/sentry-test` + a Sentry section on `/admin/settings`) to verify capture end-to-end once a real DSN is live — not a public throw endpoint.

- Verify gate: `make db-generate`/`tsc`/`eslint` clean locally (0 errors; the 35 pre-existing eslint warnings are all in untouched files); `npm run build` clean; boot-tested `npm start` both with no secrets (health 200, true no-op) and with dummy secrets (boots clean). `npm test` could not run in the sandbox (no Docker for the throwaway test DB, same as CC-11) — CI's `verify` ran the suite and passed.
- Staging smoke (post auto-deploy): health 200/DB up, root 307→`/login`, cron + admin-alerts routes auth-gated (401), and the CSP `connect-src` on staging now carries the Sentry ingest hosts (confirms the new code is live).

## The env-var naming fix (why there are two commits)

The first staging deploy **failed** at Cloud Run's `--set-secrets` validation: the Sentry env var was originally named `AHITS_SENTRY_DSN`, and the Makefile's `NAME=$(SECRET_NS)_NAME` convention already prepends the `AHITS_`/`AHITS_PROD_` namespace — so it resolved to a nonexistent secret `AHITS_AHITS_SENTRY_DSN` (doubled prefix). Max caught it. Fixed in a follow-up commit (`2d0412d`): the container env var is now `SENTRY_DSN`, resolving to secret `AHITS_SENTRY_DSN`. `CRON_HEARTBEAT_URL` was already bare/correct. Lesson for future secret-mounting packets: **the env-var name in code is bare; the Makefile adds the `AHITS_` namespace — don't prefix it yourself.**

## Merge mechanics note

Same as CC-11: PR #182 needed an admin-override merge (`gh pr merge --admin --squash`) because `development`'s branch protection requires 1 approving review and GitHub blocks the PR author from self-approving. Max explicitly authorized the override after the green-CI + clean-smoke report. This is now the second consecutive packet to merge this way — still worth deciding whether a second human reviewer should be looped in going forward, or whether admin-override is the accepted path for this solo-maintainer phase.

## Resume points

1. **CC-22 live acceptance pass (Max, on staging)** — the code shipped and smoked, but three checks need real credentials/timing that a sandbox can't exercise: (a) with the real `SENTRY_DSN`, use `/admin/settings` → Sentry diagnostics to confirm a server error and a client error both capture with `request_id` attached (client event passes CSP); (b) confirm the healthchecks.io ping fires on a real cron run; (c) stop the staging cron >30 min → confirm `CRON_SILENT` appears on the dashboard and the next run resolves it. The two secrets (`AHITS_CRON_HEARTBEAT_URL` real, `AHITS_SENTRY_DSN` placeholder/real) are already provisioned with secretAccessor granted to the deploy SA.
2. **Next packets in order** (per `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md`): **CC-23** (tokens/design) → CC-24 (subtraction) → CC-25 (live QR) → CC-12 (Batch 6b/perf) → CC-14 (Today) → CC-26 (daily-check viewer, must land before the pilot fortnight) → pilot fortnight (CC-27 as filler) → CC-15/16/17/18.
3. **D5/D6/D7 are open PENDING decisions** (`DECISIONS.md`) — need Max's call before the pilot fortnight starts. D5 (hold pilot for Today, or ship CC-28 bridge) gates the landing order. (D8 was resolved last session, folded into D3.)
4. **A6 device pass** — still not started; run in parallel with the packets above.
