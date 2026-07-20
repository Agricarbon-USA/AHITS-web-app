# AHITS — Session Handoff · 2026-07-19b (session 11)

> STATUS: canonical · UPDATED: 2026-07-19 · READ-WITH: `STATUS.md`, `DECISIONS.md`

## What shipped — CC-14 "Today" (NS-10), the operator's front door

The adoption product: replace the static operator dashboard with the operator's day. Plan-first packet, built and merged as **five PRs** (four features + one test fix), all live on staging with the migration applied.

**PRE-FLIGHT (packet step 0).** The "add `Rig.requestId` if missing" step was **not needed** — the reservation→deployment link already shipped in **CC-09 as `Rig.fromRequestId`** (`String?`, raw-SQL, no relation). The Awaiting-Pickup cards join `DeploymentRequest → held lines → operator` and use it only as a back-reference, so they didn't even depend on it. **Zero schema for the link.**

**PR1 · read-side spine (#190).** `GET /api/operator/today` — pure assembly over Rig/RigVehicle/DailyCheck/TransferRequest/DeploymentHandoff/DeploymentRequest (every query already existed as a lib helper). Logic in `src/lib/operator-today.ts` (`getOperatorToday`, fixture-testable); route is a thin auth wrapper (OPERATOR or admin-as-operator). Added `/api/operator/` to the SW field-reads matcher (`src/app/sw.ts`). Tolerates the not-deployed case (null rig).

**PR2 · the Today view (#191).** `dashboard/page.tsx` rewritten **in place**, consuming the aggregate via `useFreshList` (+ `FreshnessIndicator` "Data as of HH:MM"). Composed from tested presentational components: `TodayPrimaryAction` (Start daily check → You're set), `AwaitingPickupCard` (CC-09), `WaitingOnMe` (transfers/handoffs), `DeploymentSummary`, `VehicleChecks` (per-vehicle done/due, one-tap `?vehicleId=` deep-link, read-only `Vehicle.location/notes` as the "access notes"), `MyRequestsSummary`, and the new demand-pull **`EmptyState`** primitive. Scan card (CC-24) kept. A code-level slot marks where the post-Time/Invoicing clock card lands.

**PR3 · daily-check NS-5 + instrumentation (#192).** `OdometerField` inline sanity warning — below last-known or >2000 mi jump — **warns, never blocks** (server already advances odometer forward-only). Passive time-to-complete → **nullable `DailyCheck.durationMs`** (additive, backward-compatible migration; recorded on first completion). Pilot Charter **metric-1 denominator**: `getDailyCheckAdoption` (eligible = vehicles on active deployments, done = eligible checked today) via admin-only `GET /api/admin/pilot-metrics`.

**PR4 · operator IA fixes (#193).** Requests → bottom nav (Scan card kept). Transfer/handoff badge moved onto the bottom-bar My-Deployment tab via a shared `useIncomingPendingCount` hook. `ConfirmDialog` on request Cancel. Shared **`SearchableSelect`** (Autocomplete) swapped into the roster/item dropdowns (TransferDialog, my-deployment handoff, DispositionDialog, RequestComposer for-operator + item — empty "fallback"/"unassigned" options preserved as explicit rows).

**PR5 · CUT.** The D9 glossary sweep (Fulfill/Pick-up/Check-out/Claim) was planned droppable; the session ran long, so it was cut and **re-deferred as D11** (owner: next session after CC-14, strings-only, precondition met). Not unfinished CC-14.

## Notable this session

- **The stacked-squash merge dance.** PR2–4 were built stacked (each on the prior branch) while Max ran the device pass. Merging in order needed, after each squash-merge, a `git rebase --onto origin/development <parent-tip>` to replay only that PR's own commit (a plain rebase re-applied the parent's already-squashed commits and conflicted). Clean history preserved.
- **CI caught a test bug the sandbox couldn't.** PR3's deploy went red on `verify / Tests`: `cc14-pilot-metrics` captured its `before` adoption snapshot **after** adding the fixtures, so the eligible delta was `+0` not `2`. Fixed in **#194** (snapshot before creating the rig; `fileParallelism:false` makes deltas deterministic) — and this time I **waited for CI green before merging** rather than admin-merging blind, since the DB suite needs Postgres I can't run locally. Lesson: global-aggregate DB tests must snapshot the baseline before any fixture creation.
- **Component-test acceptance met.** Every split/new component ships a component test (`test:ui` 61 total): EmptyState, the 5 Today sections, OdometerField, SearchableSelect, OperatorBottomNav. The DB reads have their own suite (`cc14-operator-today`, `cc14-pilot-metrics`).

## Decisions

- **D11 (ACTIVE)** — CC-14's D9 glossary sweep re-deferred; owner: next session after CC-14; precondition (the `Rig.fromRequestId` link) already met; strings-only.
- **D5** — effectively **Option A** now (building the full Today view = this packet is the pilot gate; no CC-28 bridge built), but **Max left it uninitialed**. Operative pilot-start recorded in Charter §5: **CC-14 on staging (done) AND charter signed AND A6 pass green.** Remaining pilot-start blockers are the signature + the A6 pass, not the Today view.

## Resume points

1. **Next packet: CC-26 (daily-check viewer)** — must land before the pilot fortnight. Then pilot fortnight (CC-27 filler) → CC-15/16/17/18.
2. **CC-14 v1 limitations to keep in mind (not bugs):** Today is **PRIMARY-only** (a secondary operator sees "No active deployment"); a not-deployed operator reaches the check via the bottom-nav Check tab; offline cold-open depends on the new SW cache (first-ever offline load with no cache shows error/empty). All recorded in STATUS §3.
3. **The pilot metric-1 denominator exists** (`/api/admin/pilot-metrics`) — surface it on whatever pilot dashboard is built. The Today "deep-link past" falsifier is instrumented only as far as the denominator + route hits.
4. **Open PENDING decisions before the pilot fortnight:** D5 (Max's initial), D6 (EMAIL_SANDBOX flip), D7 (second pilot-hours contact). D11 (glossary) is owned by the next session.
