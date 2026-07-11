# AHITS — Wave 0, Batch 2 · Execution Log

_2026-07-03. Continues the Wave-0 execution from `AHITS_WAVE0_BATCH1_EXECUTION_LOG.md`. Both fixes here are **time-clock prerequisites** (FND-7 date bucketing, FND-14 offline-queue durability) — they had to land before Capstone 3 (Time/Invoicing) can trust either its day boundaries or its offline clock writes. Implemented on a clean HEAD (`b66c1af`) sandbox, type-checked, linted, production-built, and — for the pure-logic part — executed to prove red-green._

## Verification (all green)

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `eslint` (changed files) | **0 errors** (3 pre-existing `set-state-in-effect` warnings in `my-rig`, none introduced) |
| `next build --webpack` | **passes** — all 63 routes |
| FND-7 executed (tsx) | **PASS** — the 11:49pm-Central instant that the old client filed as `2026-07-03` now resolves to `2026-07-02` |
| FND-7 unit test | authored + typechecked (`tests/fnd7-business-date.test.ts`) |

## What was fixed

### FND-7 · HIGH · business-date split-brain (patch `FND-7_business_date.patch` + `_test.patch`)

The client stamped daily-check dates with `new Date().toISOString().slice(0,10)` — the **UTC** day — while the missed-check cron matched the **Central** day. In the evening window (roughly 6pm–midnight Central, when UTC has already rolled over) a check was filed under *tomorrow*, which (a) tripped a false `DAILY_CHECK_MISSED` alert + admin email and (b) mis-keyed the `(vehicleId, date, operatorId)` unique row. Confirmed live this session: at 11:49pm Central the form pre-filled `07/03/2026`.

Fix: one authoritative helper `src/lib/business-date.ts` — `businessDate()` and `businessDateTime()` (Intl, `America/Chicago`, no new dependency) — now used by **all three** consumers so they can't drift:
- **Client** (`daily-check/page.tsx`): the date field defaults to `businessDate()` (both the initial state and the post-submit reset).
- **Cron** (`cron/dispatch/route.ts`): the inline Intl block is replaced by `businessDateTime(now)` (date + wall-clock hour/minute for the cutoff).
- **Feeds** (`dashboard/feeds/route.ts`): "today's checks" now counts by the business `date` (`new Date(businessDate(now))`) instead of `submittedAt >= server-UTC-midnight`, aligning the dashboard count with the cron's definition of "today."

**Executed proof** (real red-green, DB-free): for the instant `2026-07-03T04:49:00Z` — old `toISOString()` → `2026-07-03`; `businessDate()` → **`2026-07-02`**; `businessDateTime()` → `{date:'2026-07-02', hour:23, minute:49}`. A daytime instant is unchanged. The committed unit test also covers the CST (winter, UTC-6) boundary.

### FND-14 · HIGH · offline-queue poisoning (patch `FND-14_offline_queue_poisoning.patch`)

Two ways a queued field write could be silently lost or dead-end on reconnect — both must be closed before the offline time-clock, where a lost clock-out is a payroll incident.

- **(b) Expired-JWT 401 marked writes failed** — `useOfflineQueue.ts` had `401` in `TERMINAL_STATUSES`, so if an operator's 24h JWT lapsed while offline, every queued write was marked `failed` on reconnect and surfaced only as a dismiss-to-discard banner → **field-data loss to a credential technicality**. Fix: a 401 during replay now **parks** the item (stays `pending`, no retry burned, stops the pass) so it replays after re-auth; `401` removed from the terminal set.
- **(a) Reconnect after an offline launch didn't re-load** — when the queued deploy-create drained, `pendingDeployCreate` flipped `true→false` but `my-rig` didn't re-fetch, so it kept showing the "Start Deployment" empty state against a rig that now existed → tapping Start **409'd**. Fix: `my-rig` re-runs `load()` on that transition, so the real active rig appears (fixes A6 row 19 as written).

## Apply (adds to the existing Batch-1/2 branch flow)

```bash
# From the repo root, off development (independent of Batch 0/1 — no file overlap):
git checkout development && git checkout -b feature/20260703/maxwellslater-wave0-batch2
git apply outputs/wave0_batch2/FND-7_business_date.patch        && git commit -am "fix(dates): unify business-date across client/cron/feeds (FND-7)"
git apply outputs/wave0_batch2/FND-7_business_date_test.patch   && git commit -am "test(dates): business-date tz-boundary coverage (FND-7)"
git apply outputs/wave0_batch2/FND-14_offline_queue_poisoning.patch && git commit -am "fix(offline): park 401 + re-load on deploy-create drain (FND-14)"
# or everything at once:
git apply outputs/wave0_batch2/wave0_batch2_ALL.patch
```

Open PR `--base development`; CI `verify` runs the new unit test. No schema change, no migration.

## Wave 0 status after Batch 2

**Landed / ready (verified patches):** FND-1 (crash), FND-2 (+regression tests), FND-3, FND-11, FND-12, FND-15/16 (Batch 0/1); **FND-7, FND-14 (this batch).** That's the correctness/security/release/offline-durability core of Wave 0.

**Still open (unchanged rationale):**

| Item | Why not here |
|---|---|
| **W0-1 · A6 device pass** | Manual, on real hardware — the pilot gate. FND-14 + FND-7 make its offline rows trustworthy; run after these land. |
| **W0-3 · merge the 3 security branches** | Exist already; need your push/CI (csp-nonce after a staging smoke-test). |
| **FND-8 · email retry/delivery-log** | Next candidate; unblocks the invoice email. |
| **W0-8 hygiene** (wrapWrite coverage, maintenance GET, claim-first invariants, hubs envelope, index migration) | Ready to spec/implement as a batch. |
| **W0-9 hub loop** (mark-received/reissue/dismiss, HUB_RETURN dedupe) | Ready; small, high-visibility. |
| **W0-10 · legacy-column retirement** | Do not automate — snapshot + explicit sign-off; gates invoicing attribution. |
| **W0-11 · rename + SWR + monolith split** | Larger; sequence before GPS/clock UI lands. |

Natural next batch: **FND-8 (email reliability)** + **W0-9 (hub loop)** — both self-contained and high-visibility, or **W0-8 (API hygiene)** if you'd rather harden the shared route primitives before more Phase-3 routes are written.
