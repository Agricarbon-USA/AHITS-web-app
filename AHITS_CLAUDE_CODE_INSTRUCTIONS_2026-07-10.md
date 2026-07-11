# AHITS — Claude Code Instruction Packets
### Paste-ready prompts to execute the Phase 3 workplan · 2026-07-10

*How to use this: each packet below is a self-contained instruction you paste directly into Claude Code (CC) in your repo. They're written so you don't need to be technical — you copy the block, paste it, and let CC do the engineering. Packets are ordered by the workplan's sequence; each names the review seats that must sign off before the patch lands. Every packet assumes the standing rules in your `CLAUDE.md` (feature branch → change → `make db-generate && npx tsc --noEmit && npx eslint src && npm test` → PR to `development` → staging deploy; nothing to prod except through the PR flow; the held W0-10 patches stay held).*

**The golden rule to paste at the top of any session:** "Follow CLAUDE.md and AGENTS.md exactly. This is a modified Next.js — read the relevant guide in node_modules/next/dist/docs/ before writing code. Build on a feature branch, run the full verify gate (make db-generate && npx tsc --noEmit && npx eslint src && npm test) before opening a PR to `development`, and do NOT touch the held W0-10 patches (batch5-pr4b, batch5-pr4c) or merge anything to `production` unless I explicitly say so."

**Recommended order:** CC-01 → CC-02 → CC-03 (Workstream 0, the trust floor) → CC-04/CC-05 (prod cutover, your call on timing) → CC-06/CC-07 (Wave A) → then the rest as the calendar in the workplan §11 dictates. Run the A6 device pass (no CC needed — it's manual, see the checklist doc) in parallel starting now.

---

## PHASE 0 — Release-safety & data-integrity (do these first)

### CC-01 · Release-safety guards
**Review seats:** SRE (primary), Antagonist, Calibration.

```
Harden our release pipeline so the irreversible W0-10 database drop can't reach production by accident, and fix two CI safety gaps. Make these changes on a feature branch:

1. Move the two held patch files `batch5-pr4b-writers-nullable.patch` and `batch5-pr4c-drop.patch` from the repo root into a new `held/` directory, and add a short `held/README.md` explaining they are the W0-10 completion patches that land only on explicit go behind the migration plan's §11 gate.

2. Add a CI job (in .github/workflows/ci.yml) that HARD-FAILS any pull request whose base branch is `production` if its added migrations contain a DROP of `operatorId`, `rig_operators`, or `assignedOperatorId`, UNLESS the PR carries a label named `destructive-migration-approved`.

3. Harden scripts/check-migration-safety.sh: before grepping, strip SQL `--` comments and normalize whitespace across newlines (so a multi-line `ADD COLUMN ... NOT NULL` is caught); extend the destructive-pattern regex to also match `ALTER COLUMN ... TYPE`, `DROP INDEX`, `DROP CONSTRAINT`, `DELETE FROM`, `RENAME VALUE`, and `DROP TYPE`; scope the `-- migration-safety: acknowledged` waiver to the single statement it precedes (not the whole file); and make an acknowledged destructive statement a HARD FAIL (not a warning) when the PR's base branch is `production` and the `destructive-migration-approved` label is absent.

4. In .github/workflows/pr-staging-deploy.yml, the preview-deploy step that calls `make cloud-run-deploy` is missing `EMAIL_SANDBOX=true`, so preview deploys can email real people. Add `EMAIL_SANDBOX=true` to that make invocation.

5. Fix prisma/recovery/W0-10_forward_fix_readd_operator_columns.sql: before the `ALTER TABLE "rigs" ALTER COLUMN "operatorId" SET NOT NULL` line, add a third backfill that sets operatorId from the latest-ended PRIMARY assignment for any rig still NULL (SELECT the operatorId from deployment_assignments where rigId matches and role='PRIMARY' ORDER BY endedAt DESC NULLS FIRST LIMIT 1), and add a guard SELECT that asserts zero NULLs remain before the SET NOT NULL.

6. In .github/workflows/verify.yml (or wherever the test DB is prepared with `prisma db push`), after the push, apply the FND-23 partial-unique indexes from the committed migrations as raw SQL (or switch the test-DB prep to `prisma migrate deploy`) so the partial-unique invariants exist under test.

7. Add pg_try_advisory_lock overlap protection around the body of the cron dispatch handler (src/app/api/cron/dispatch/route.ts) so two concurrent fires can't double-email.

Explain each change in the PR body. Do not modify the held patch contents themselves.
```

### CC-02 · Data-integrity fixes (inventory truth)
**Review seats:** Antagonist (primary), SRE, Integration.

```
Fix a cluster of data-integrity defects in the transfer / end-of-deployment / hold-claim paths. Each is a real inventory-leak or ledger-corruption bug. Work on a feature branch; add or extend tests for each; verify with the full gate.

1. HOLD RACE (highest priority), src/lib/deployment-requests.ts: (a) around line 613-621, the cancel path calls releaseReservedStock BEFORE the guarded status flip and returns STATE_MISMATCH without throwing, so the reserve decrement commits even when the flip matched zero rows — make the release and the guarded flip atomic and THROW on mismatch so the transaction rolls back. (b) around line 827-847, claimHeldStock selects candidate lines with `releasedAt IS NULL` unlocked, then re-reads under FOR UPDATE reading only heldQty/claimedQty — add `AND releasedAt IS NULL` to the locked re-read and make the claimedQty UPDATE conditional on the line still being unreleased with enough remaining; if a line was released mid-claim, fall back to a free draw instead of aborting the whole checkout.

2. ENDED-RIG TRANSFER DECLINE, src/app/api/transfers/[id]/decline/route.ts (~line 70-104): the ended-rig branch restores serialized units but never credits consumable stock back — add restoreToHub(itemId, drawnHubId ?? item.hubId, drawnQuantity) + resyncItemTotal for consumable kit items with drawnQuantity > 0, matching the bulk-return path.

3. ENDED-RIG TRANSFER CANCEL, src/app/api/transfers/[id]/route.ts (~line 27-61): the DELETE/cancel closes vehicle rows for ended rigs but never restores kit items, stranding them forever — copy the decline route's ended-rig restore block (stamp kitItem.removedAt, flip units AVAILABLE, log CHECK_IN, restore consumable stock).

4. ENDED-RIG KIT-ITEM DOUBLE-TRANSFER, src/app/api/transfers/[id]/accept/route.ts (~line 100-115): the ended-rig branch of the "still present" guard matches ANY kit item of the rig including already-removed ones — change accept to CLAIM the kit item via a conditional updateMany (only where removedAt is null / not already claimed), and on end/decline/accept mark or delete sibling PENDING transfer_items for the same kitItemId. Consider a partial-unique index on transfer_items(kitItemId) where the parent transfer is PENDING.

5. VEHICLE REMOVE-WITH-TRANSFER BRICK, src/app/api/deployments/[id]/vehicles/route.ts (~line 160-186): for TRANSFER dispositions the code closes the RigVehicle row before creating the transfer, so accept always 409s — for TRANSFER dispositions, leave the RigVehicle row OPEN (mirror what the end route does).

6. RETURN CONDITION IGNORED, src/app/api/deployments/[id]/end/route.ts (~line 118-152): end-of-deployment HUB returns write returnCondition to the log but flip the unit to AVAILABLE unconditionally — reuse the single-item return route's condition→unit-status mapping so a damaged unit returns IN_MAINTENANCE/INOPERABLE.

7. ATOMIC DECREMENTS: in transfer accept (~line 112-114, 156-184) replace the read-then-write of source kitItem quantity with a guarded updateMany decrement; in bulk return (src/app/api/deployments/[id]/items/route.ts ~line 374-379) replace the blind quantity increment with resyncItemTotal.

8. REQUIRE DISPOSITION COVERAGE, end/route.ts (~line 84-100): reject with 400 when any open kit item lacks a disposition (or default missing ones to HUB-to-home-hub) so nothing strands open on an ended rig.

9. IN_TRANSIT CUSTODY LOOP: today no code writes EquipmentStatus.IN_TRANSIT so hub "Received" is a no-op and a discrepancy never quarantines a unit. Make the hub-return flow set units to IN_TRANSIT at return time so the RECEIVED transition (status-links.ts ~line 299-302) actually flips IN_TRANSIT→AVAILABLE, and make DISCREPANCY hold the unit for review. Make "Dismiss"/revoke (src/app/api/status-links/[id]/revoke/route.ts) reset the unit status appropriately instead of leaving it stranded, and keep the discrepancy note viewable.

10. DRIFT-REPORT CRON: extend the cron dispatch handler's existing inventory-drift step so that instead of only console.error, it raises createAlert interrupts. Add these read-only invariant checks (I have the exact SQL — ask me and I'll paste it, or derive equivalents): held↔reserved mirror (reservedQty must equal the sum of outstanding holds on FULFILLED lines per item/hub), orphan holds (unreleased holds whose parent request isn't FULFILLED), reserved-must-not-exceed-quantity, stock non-negativity, and custody strands (units IN_TRANSIT > 14 days, or CHECKED_OUT with no open kit item on an active rig).
```

### CC-03 · Offline & trust one-liners
**Review seats:** SRE, Operator-lens, Antagonist.

```
Fix five offline/trust issues. Feature branch, full verify gate.

1. HIGHEST VALUE: in src/proxy.ts (~line 129-131 and 188-190), when there's no session cookie or the JWT is expired/invalid and the request path starts with `/api/`, return `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })` instead of redirecting to /login. (The offline queue only parks items on a literal 401; the redirect currently defeats it and marks field data as failed.) Keep the redirect behavior for non-API navigations.

2. In src/lib/idempotency.ts (~line 133-146): a claim-loser currently polls 4×50ms then runs the handler anyway, which can double-apply slow writes. Change it to poll longer with backoff and, if the original still hasn't committed, return a 409/425 "in flight, retry" — never execute the handler. (This hardens the paths already wrapped — deployments/[id]/items and transfers/accept.) Then: confirm POST /api/deployments/[id]/items is already withIdempotency-wrapped (it is — no change needed; the legacy POST /api/checkout is a 410 tombstone, leave it alone) and wrap the one genuinely-unwrapped ledger-mover, POST /api/maintenance/[id]/complete, in withIdempotency.

3. Extend the service-worker field-reads cache matcher (src/app/sw.ts) to also cache /api/transfers, /api/handoffs, /api/deployment-requests, /api/hubs, and /api/notifications.

4. In src/app/api/daily-check/route.ts, clamp the client-supplied `date` to the current business date server-side (use the existing lib/business-date helper) so a check can't be pre-dated/future-dated to dodge the missed-check alert.

5. Mount the OfflineBanner in the admin layout (src/app/(admin)/layout.tsx) the same way the operator layout does.
```

---

## PHASE 1 — Prod cutover — ⛔️ DEFERRED (do not run CC-04 / CC-05 now)

> **Postponed by decision 2026-07-10 (see `AHITS_PROD_CUTOVER_DEFERRED.md`).** Production does not exist yet and standing it up is a full from-scratch job for actual go-live, not a promote to an existing environment. **It gates nothing** — the pilot and the money loop run on staging. Skip both packets below; leave PR #144 a Draft; leave the held W0-10 patches held. The packets are retained here only for the eventual go-live, at which point follow `PROD_CUTOVER_RUNBOOK.md` (new Supabase project → 11 secrets → migrations → first admin → prod cron → isolation checks) rather than these condensed versions.

### CC-04 · Prod cutover (operator steps, mostly not code) — DEFERRED
**Review seats:** SRE (primary). This is an operations runbook, not a code change — run it deliberately.

```
We are taking the empty production environment current. Walk me through this step by step and STOP for my confirmation between each numbered step:

1. Confirm AHITS_PROD_MIGRATE_URL exists in Secret Manager (prod session pooler, port 5432, IPv4) with an ENABLED version, and that the deploy service account has secretmanager.secretAccessor. If it doesn't exist, give me the exact gcloud commands to create it (I'll run them) — do not proceed until it's confirmed ENABLED.

2. Before merging PR #144, run these two invariant queries against the PROD database and show me the results — both MUST return zero rows: (a) every active rig has exactly one open PRIMARY assignment; (b) the legacy rigs.operatorId matches the assignment-table PRIMARY for every active rig. A non-zero result on (b) is a payroll-attribution incident I must reconcile by hand first. Also capture a prod PITR/backup restore point and note the UTC timestamp as our rollback anchor.

3. Only after (1) and (2) are green: merge PR #144. Watch the production-branch deploy run — confirm the migrate job's secret read did NOT error and the migration set is additive as expected. Then smoke-test prod.

4. After #144 is live and smoked, tell me we're ready for the held 4b′ patch (that's a separate step, CC-05).

Do not merge anything or run any mutating command yourself — give me the commands and the go/no-go at each step.
```

### CC-05 · Land held 4b′ then 4c (explicit go only)
**Review seats:** SRE (primary), Antagonist, Calibration.

```
Production is now current (PR #144 live, smoked). We're completing the W0-10 retirement. STOP for my confirmation between phases:

1. Apply held/batch5-pr4b-writers-nullable.patch onto development (git apply --3way), run the full verify gate, open a PR to development, deploy to staging, smoke. This removes the legacy writers and makes operatorId nullable; columns still exist.

2. Once 4b′ is live and smoked on staging AND promoted+smoked on prod, and only on my explicit go: apply held/batch5-pr4c-drop.patch — note it needs its prisma/recovery/ hunk dropped because that file is already committed. Before landing 4c, re-run the two prod invariant queries (must be zero), confirm the archive step runs, and confirm the PITR anchor is captured. This is the irreversible DROP — do not proceed without all three green and my explicit go.
```

---

## PHASE 2 — Field-feedback Wave A

### CC-06 · Dashboard fix + vehicle-type enum
**Review seats:** Antagonist, Operator-lens.

```
Two small fixes on a feature branch, full verify gate:

1. DASHBOARD "—" BUG: src/app/api/dashboard/route.ts uses requireAdmin(), but operators are allowed to view /admin/dashboard read-only, so they get a 403 and every KPI card renders "—". Change requireAdmin() to requireAuth() (the counts are non-sensitive and mirror /api/dashboard/feeds which already uses requireAuth). Also add a res.ok guard on the page fetch in src/app/(admin)/admin/dashboard/page.tsx so a real failure toasts instead of silently rendering "—". Prefer routing the fetch through a shared fetchJson helper if one exists or is being introduced.

2. VEHICLE TYPE ENUM: add BOBCAT to the VehicleType enum (additive migration) and reconcile the UTV/ATV/Can-Am labels with the real fleet. The type→label map is currently duplicated in ~4 files (RequestComposer, admin/requests, my-deployment's VEHICLE_TYPE_ORDER, and others) — centralize it into one shared module and import it everywhere so a new enum value never renders as raw SNAKE_CASE.
```

### CC-07 · Mobile quick-win triage (leaf-level only)
**Review seats:** Operator-lens (primary), SRE.

```
A mobile/feel quick-win pass. IMPORTANT: stay OUT of the my-deployment monolith's state graph — that's a separate structural task (Batch 6b). Only touch leaf components, layout, and breakpoints. Feature branch, verify gate.

1. Make the two clipping detail drawers responsive: admin/deployments (width 560) and admin/inventory (width 540) → { xs: '100%', sm: 560/540 }, matching how vehicles/maintenance/projects already do it.
2. Debounce the inventory search input (admin/inventory ~line 1140) so it doesn't fetch on every keystroke.
3. Fix the duplicated project-filter block on the Team page (src/app/(admin)/admin/users/page.tsx ~line 349-373 renders it twice) — delete the duplicate.
4. Fix the static "Loading checklist" heading that shows even when loaded on the public portal (src/app/s/[token]/page.tsx ~line 210).
5. Add mobile card fallbacks (or prune columns) for the worst 2-3 admin tables at xs: vehicles (12 cols), projects (12 cols), reports (11 cols).
```

---

## PHASE 3 — Field-feedback Wave B (after 4b′ lands)

### CC-08 · Hubs discrepancy review + bulk verify + IN_TRANSIT
**Review seats:** Integration, Operator-lens, Antagonist. (Pairs with CC-02 #9.)

```
Fix the Hubs Inbound dead-end and add bulk verify. Feature branch, verify gate.

1. Add a Discrepancy review view: query StatusLinkEvent for DISCREPANCY events (note, actor, timestamp, unit) and render them with a RESOLUTION verb so an admin can close the loop (accept the hub's count / override / adjust inventory) — not just read it. Today the note is one caption line that vanishes when the row is actioned.
2. Make "Dismiss" deliberate: add a confirm dialog, reset the unit's status appropriately (this pairs with the IN_TRANSIT custody work in the data-integrity PR), and keep dismissed items viewable behind a "Dismissed/Resolved" filter with a resolution note. Rename consistently — "Dismiss" and "Revoke" currently both appear for the same action; pick one term.
3. Add a bulk select-many action bar on Hubs Inbound (Receive/Dismiss) as the FIRST consumer of a reusable multi-select pattern — build it as a shared component (the operator kit card already has a multi-select remove to model it on) so it can be rolled out to other lists later.
```

### CC-09 · Fulfilled-reservation → Awaiting Pickup thread
**Review seats:** Integration (primary), Antagonist, Operator-lens.

```
Close the invisible pickup thread. The backend already holds stock for a fulfilled reservation (snapshotHeldLines / claimHeldStock); the operator just can't see or act on it. Feature branch, verify gate. THESE TWO STATE-LOGIC ITEMS ARE ACCEPTANCE CRITERIA, not optional:

1. Operator "Awaiting Pickup" surface: list FULFILLED reservations with unclaimed holds (heldQty > claimedQty AND releasedAt IS NULL AND status='FULFILLED' matching the operator). Render as "Deployment — Awaiting Pickup" cards. Build these as cards that will live in the new Today view (see CC-14) — don't bolt them permanently to the old static dashboard.
2. "Pick up / Check Out" entry that seeds the existing scan/checkout flow with the held lines (heldHubId → sourceHubId, pre-fill held consumables + serialized units), lets the operator add/edit/remove, and submits to POST /api/deployments which already claims the hold.
3. ACCEPTANCE — TTL race: a visible awaiting-pickup hold MUST pause or extend the 72h cron sweep (or the sweep must skip holds with an active pickup surface), so a Friday-fulfilled/Monday-pickup deployment doesn't silently evaporate.
4. ACCEPTANCE — residual-hold zombie: if the operator removes a held line at checkout, wire releaseHold/releaseHeldLine into checkout-complete for the removed/leftover lines so the card doesn't persist forever.
5. Lock ONE glossary term per state across every surface (button/badge/header/toast). Today the flow overloads Fulfill/Pick up/Check Out/scan/claim — pick one word per state and use it everywhere.
6. Optional: add a nullable requestId on Rig for traceability of which fulfilled reservation the deployment came from.
```

### CC-10 · Field-fixed issue logging (+ vehicle damage path)
**Review seats:** Integration, Operator-lens.

```
Let field users log a fixed-in-field issue on a vehicle or unit, and add the missing vehicle damage path. Feature branch, verify gate.

1. Add one operator-accessible endpoint (e.g. POST /api/maintenance/log-fixed, or a mode:'FIELD_FIX' branch) that writes MaintenanceTask{ isDamageReport:true, resolutionPath:'IN_FIELD', status:'COMPLETED', completedAt:now, notes, vehicleId OR itemId } and SKIPS the IN_MAINTENANCE flip and the DAMAGE_REPORTED alert.
2. Add a "Log a fixed issue" button/dialog on the vehicle drawer and the maintenance page (reuse the existing notes + IN_FIELD inputs), dead-simple on mobile.
3. Surface these COMPLETED field-fix records in the per-vehicle maintenance list.
4. Add a vehicle damage path (today only units/equipment can be damage-reported from the field; vehicles have no path).
5. Reconcile with the existing heavyweight damage flow into ONE mental model — document which path is for what (quick field-fix log vs. open-a-repair-task) and make the UI guide the user to the right one.
```

### CC-11 · Admin-as-operator (post-4b′, with money-loop exclusion)
**Review seats:** Antagonist, SRE, Fable. (Do NOT run before 4b′ has landed.)

```
Allow an admin to hold a rig and accept transfers/handoffs, implemented against the deployment_assignments model (post-W0-10), with admin-held rigs EXCLUDED from the money loop per our decision. Feature branch, verify gate.

1. Relax the role gates that block ADMIN as a transfer recipient (src/app/api/deployments/[id]/transfer/route.ts ~line 84) and handoff target (.../handoff/route.ts ~line 47), and include admins in the /api/operators destination roster (role: { in: ['OPERATOR','ADMIN'] }).
2. Add admins to the admin deployment-builder dropdowns (if an admin can hold a rig they must be selectable).
3. An admin holding a rig writes a PRIMARY assignment (not the legacy column). Surface a clear message if accepting a transfer would create a second open PRIMARY (the FND-23 index A 409) rather than a confusing dead-end.
4. POLICY (required): admin-held rigs must be EXCLUDED from payroll attribution and flagged distinctly in missed-check scans and dashboards. Implement the exclusion in the cron missed-check scan now, and leave a clearly-commented hook in the attribution logic so the Time/Invoicing capstone inherits the exclusion. Do not let admin-held rigs enter the money loop.
```

### CC-12 · Batch 6b + Performance & Feel (structural)
**Review seats:** SRE, Operator-lens, Antagonist.

```
The structural performance workstream. Feature branch(es); this is large — propose a PR breakdown before writing code. Verify gate on each.

1. Split the my-deployment monolith (src/app/(operator)/operator/my-deployment/page.tsx, ~2025 lines / ~58 useState) along its component seams so a state change doesn't re-render the whole page. Do the same triage for admin/deployments (~1521) and admin/inventory (~1355) if time allows.
2. Introduce SWR (or an equivalent query cache) for list reads, with revalidateOnReconnect, powering a "data as of HH:MM" freshness indicator across cached views.
3. Add an OUTBOX view: render the offline queue's existing per-item labels and lastError, with per-item retry/discard, replacing the current blind bulk "Dismiss" of all failed items.
4. Add a 401-parked-queue prompt: when a flush hits 401 with pending items > 0, show "Session expired — sign in to send N saved actions" with a login link (instead of the queue silently reading "waiting to sync" forever).
5. Profiler pass on the worst offenders: memoize/virtualize large lists, cut redundant fetches.
```

---

### CC-13 · Documentation hygiene
**Review seats:** Calibration.

```
Tidy the documentation without losing anything. Feature branch. This is doc-only — no code, no verify gate needed beyond confirming nothing under src/ changed.
1. Delete the ~37 markdown files in the repo root that are byte-identical duplicates of copies already in docs/archive/ (verify each with `cmp` before deleting; if a root file DIFFERS from its archive copy, keep the newer and note it — do NOT blind-delete).
2. Archive (move to docs/archive/, don't delete) the superseded strategy docs: AHITS_PHASE3PLUS_NORTH_STAR.md (v1) and AHITS_PHASE3PLUS_NORTH_STAR_v2.md — v3 supersedes them; diff the root v2 against the archive v2 first and keep the newer.
3. Archive the historical current-cycle records: AHITS_SESSION_RECORD_2026-06-29/06-30, the WAVE0_BATCH1..4 execution logs, AHITS_CODEBASE_SWEEP_2026-07-03.
4. Archive the 10 verified-landed .patch files (batch4b, batch4c, batch5-pr1/pr2/pr2b/pr2c/pr4a, batch7a, batch8-url-filters-fnd48, fix-ur005b). KEEP in place: the held patches (now under held/) and the 3 pending patches (emaillog-failed-alert, batch8-urlfilters-rollout, batch6a-date-unify).
5. Update docs/INDEX.md — it's frozen at 2026-07-03 and still lists North Star v1 as current; make it reflect v3, the Master Roadmap, the W0-10 migration plan, the 07-10 handoff/fix-plan, and this session's new docs.
6. Annotate docs/prepared/slice4_drop_legacy.sql + slice4_precheck.sql: note they're superseded for the operator columns by the held batch5-pr4c, but remain the only written plan for the separate rigs.projectId drop (which W0-10 does not cover).
7. Correct the PROD_CUTOVER_RUNBOOK.md banner that says production "does not exist yet" — production exists (frozen at the 2026-06-26 promote); reconcile the banner with the current state.
```

---

## PHASE 4 — The operator's day

### CC-14 · NS-10 Today view + NS-5 + operator IA
**Review seats:** Operator-lens (primary), Integration, Fable.

```
Build the operator's "Today" front door, replacing the static 4-card dashboard. Feature branch, verify gate. Read the North Star v3 NS-10 spec first.

1. Add one GET /api/operator/today aggregate (pure read-side over Rig/RigVehicle/DailyCheck/TransferRequest/DeploymentHandoff/DeploymentRequest — every query already exists somewhere). Add it to the SW field-reads cache matcher.
2. Replace the dashboard with the operator's day: current deployment + project (with DailyCheck.site + access notes read-only), per-vehicle daily-check state (done/due, one tap in), transfers/handoffs waiting on ME, my open requests + the Awaiting-Pickup cards from CC-09, and a slot for today's clock state (post-Time/Invoicing). One contextual primary action: before check → "Start daily check"; after → "You're set."
3. NS-5 odometer sanity: on the daily-check odometer field, show an inline warning if the entered value is less than the vehicle's last known reading or an implausibly large jump — never block submit.
4. Operator IA fixes: add Requests to the bottom nav (or replace the redundant "Check Out / Check In" card, which routes to the same place as Scan); put the pending-transfer badge on the bottom-bar tab (not just the drawer); add a confirm dialog on the operator request Cancel action; replace the flat roster/item dropdowns with a searchable Autocomplete as a shared component.
5. Instrument daily-check time-to-complete (client timing, no new capture).
Falsifier to note in the PR: if session analytics show operators deep-linking past Today into the old flows, we redesign.
```

---

## PHASE 5 — Capstones

### CC-15 · Capstone 1 — Deployment Map (+ route history + crew visibility)
**Review seats:** Fable (scope — this carries the D2 anti-goal override), Antagonist, SRE, Operator-lens.

```
Build the Deployment Map capstone. IMPORTANT SCOPE NOTE: per an explicit product decision, this includes route history and crew visibility, but NEVER real-time tracking — all positions come from GPS captured on daily-check attestations the operator already submits. Read the workplan §7A and the Master Roadmap §7.2A first. Feature branch, verify gate.

1. Migration: 3 additive nullable columns DailyCheck.gpsLat/gpsLng/gpsAccuracy Float?. Merge early.
2. Capture: getCurrentPosition in the daily-check buildPayload(); resolve-or-skip before enqueue (never block submit; denied permission → no coords). Confirm FND-35 (late-response answer wipe) is fixed first since it's the same file.
3. Secrets: AHITS_MAPBOX_TOKEN server-side only (NOT NEXT_PUBLIC_); create the Secret Manager version ENABLED before the deploy that mounts it and add the --set-secrets mapping in the same change.
4. Admin map v1: one pin per active deployment at latest-check coords; recency colors (green <24h / amber 24-48h / red >48h, businessDate-aware); tooltip deep-links to the deployment drawer via URL params.
5. ROUTE HISTORY (per decision): a read-side per-rig trail connecting that rig's daily-check GPS points over time — "where has this rig been," from check-ins. This is historical only, NOT live position. Render as a point-sequence/polyline on the admin map and in the deployment drawer.
6. CREW VISIBILITY (per decision): an operator-facing map showing other operators' LAST-KNOWN positions (from their most recent attestation), framed for coordination (swap gear / request help). No live tracking, no continuous location, zero new operator taps.
7. After Map ships: NS-4 weather stamps (nightly server job stamps deployment-day weather from GPS + businessDate; zero operator taps).
Anti-goal guard: no real-time tracking anywhere; positions are last-known from attestations only.
```

### CC-16 · Capstone 2 — No-app QR daily-check
**Review seats:** Antagonist (public surface), SRE, Integration.

```
Build the no-app QR daily-check web form. Security preconditions must be true first: CSP nonce (done), rate limits (done), and FND-6's last shard — close it as step 0. Feature branch, verify gate. Read Master Roadmap §7.2B.

0. Close the FND-6 residual: in src/app/s/[token]/page.tsx ~line 158, replace the Date.now()-based line-action idempotency key with a stable content key (`${token}:${lineId}:${action}`). Also fix the read-after-revoke leak: src/app/api/s/[token]/route.ts serves the full subject payload (including live hub inventory) for REVOKED/EXPIRED links — when the link is not actionable, return only { type, state, actionable:false }.
1. Extract the authed daily-check side-effects (createAlert DAILY_CHECK_FAILED / resolveActiveAlert / EQUIPMENT_NOT_RETURNED chain) into lib/daily-check.ts so the public path can't drift from the authed path.
2. Schema: add StatusLink.vehicleId subject column + index and StatusLinkType='DAILY_CHECK'. Use a sentinel "external" user for DailyCheck.operatorId (keeps the unique key intact). The missed-check cron and resolveActiveAlert must key on the presence of ANY DailyCheck row for (vehicleId, businessDate), operatorId ignored, so either path resolves the alert.
3. API: ALLOWED_ACTIONS entry + applyTransition branch calling lib/daily-check.ts (same alerts, same photos via the rate-limited upload path).
4. UI: printable per-vehicle QR (qrCodeId already on Vehicle) → public mobile form; token treated exactly like every other status-link token.
5. Wire the DAILY_CHECK_MISSED chase email/notification to include the QR-form link.
6. Tests: public auth-less path, idempotency dedupe, failing-check side-effects from the public path, revoked/expired token denied.
```

### CC-17 · Capstone 3 — Time/Invoicing/Availability (the money loop)
**Review seats:** ALL SIX (this is the long pole and the money-and-data path). Break into sub-PRs.

```
Build the Time Tracking / Invoicing / Availability capstone — the money loop. This is un-gated now (W0-10 readers landed; the DROP is elective). Gates that DO apply: FND-8 email verified in staging before the invoice email; FND-7/FND-14 (offline dates/queue) proven by the A6 pass; and admin-held rigs excluded from attribution (our decision). Read Master Roadmap §7.2C and the workplan §7C first. Propose the sub-PR breakdown before coding. Verify gate on each.

DECISIONS TO CONFIRM WITH ME BEFORE THE MIGRATION:
- A real single-row Settings model (not extending NotificationConfig) for milesReimbursementRate, invoice numbering, processor allowlist.
- Rate precedence: OperatorRate (per-operator, per-task-type, effective-dated) > TaskType.defaultRate > User.hourlyRate. ONE SQL-computed resolver; never JS float summing.
- TaskType seed including exception types: Weather Delay, Breakdown/Repair Wait, No Access, Travel, Sampling, Maintenance, Training, Incident — each with payable + productive booleans. Incident is its OWN task type (liability-separable), not folded into Breakdown.

MIGRATION (one additive PR): TaskType, OperatorRate (immutable snapshots, effective-from), TimeEntry (with its OWN projectId snapshot at clock-in), Expense, Invoice, InvoiceLineItem, Availability (@@unique(operatorId,date)), the Settings model, and a nullable region column on the money models.

API (~8-10 routes on the existing primitives): clock-in/out with withIdempotency from day one (server timestamps authoritative; businessDate bucketing); the clock-in >48h/<48h "new deployment?/same as last?" flow per the PRD; GET time-entries (mine/admin); missed-clock-out reconciliation; expenses CRUD + mileage; availability CRUD; invoice lifecycle (SQL-summed lines = time × resolved-rate snapshots + expenses) → INVOICE StatusLink + email template + applyTransition INVOICE branch + PDF + VIEWED→PAID back-write with audit; recipients from a server-side allowlist (SSRF guard). ATTRIBUTION via deployment_assignments only, and EXCLUDE admin-held rigs.

OFFLINE: clock writes ride useOfflineQueue.mutate() + idempotency; the Today view shows queued clock state ("clock-out saved, will sync").

OPERATOR UI: clock-in from Today; task-type picker with exception states one tap deep; NS-11 close-out ritual as clock-out (confirm hours → surface unfinished items as optional one-tap fixes → "Day closed — you logged 9.5 h"); MID-3 earnings view ("you've earned $X this period") — part of the definition of done.

ADMIN UI: time review/approval, invoice pipeline (draft→issued→viewed→paid with EmailLog + StatusLink state inline), availability grid, missed-clock-out exceptions.

ACCEPTANCE: one pilot payroll period runs clock → approve → invoice → emailed → PAID with zero manual corrections; an operator answers "how much did I earn this week?" in ≤2 taps.
```

---

## PHASE 6 — Manager's week + consistency + ambition

### CC-18 · N-5 Week board
**Review seats:** Integration, Operator-lens, Fable.

```
Build the read-only week board (manager's week). Read Master Roadmap §7.2D / North Star N-5 first. Feature branch, verify gate. Requires the URL-param filter rollout to be in place first.
1. No schema. One GET /api/week-board?start= aggregate returning deployment-rows × day-cells with typed annotations.
2. UI: timeline grid, deployments as rows, days as columns; annotation chips per the layer registry; every chip click-throughs via URL-param filters to the owning page (the board is a lens, not a copy — no new detail surfaces).
3. v1 scope = layers L1-L5 + L8-L9 only (deployment bars, maintenance due, rental windows, request deadlines, missed/failed checks, in-transit/awaiting-receipt, people events) — all sources exist today. L6 Availability and L7 exception days light up only after Time/Invoicing is adopted and producing rows.
4. Anti-goal guard: no drag-to-reschedule, no auto-assignment, read-only v1.
```

### CC-19 · Consistency & dead-code pass
**Review seats:** Calibration (primary), Antagonist, SRE.

```
A tidy-without-losing-functionality pass. Feature branch, verify gate; run tsc + tests after each deletion to prove nothing broke.
1. Adopt the ok()/fail() response envelope and a shared fetchJson guard across the loaders that currently skip res.ok; land the withAuth/withAdmin wrapper (FND-43) to replace the ~75 hand-rolled auth preambles incrementally.
2. Land batch6a-date-unify.patch (unifies ~30 toLocale* date sites to formatDate/formatDateTime; leaves numeric formatting alone).
3. Extract the 2-3 near-duplicate accept/decline "respond" dialogs into one shared RespondDialog.
4. Delete verified dead code (run tsc after EACH deletion). The exact 7 unused exports in lib/deployment-assignments.ts are: getActivePrimary, listDeploymentProjects, listProjectDeployments, removeProjectLink, listAssignments, addAssignment, endAssignment. IMPORTANT: do NOT delete getDeploymentRosters — it has no external importer but IS called internally by getDeploymentRoster, so it is not dead. Also delete: GET /api/inventory/stock (its "used by checkout dialogs" comment is false — the frontend uses /api/inventory/[id]/stock); GET /api/checkout (keep the POST 410 tombstone); the dead lib/shipments.ts (but KEEP the Shipment model dormant — it's reserved for the Shippo trigger); remove the @emotion/cache and @emotion/server deps; evaluate removing @mui/x-date-pickers (only a LocalizationProvider wrapper in providers.tsx, no picker rendered).
5. Fix the stale/false comments: the PR-4a-contradicting comments at cron/dispatch ~line 134 and transfers/route.ts ~line 31-32, and the false comment at lib/deployment-auth.ts ~line 9-10 claiming the legacy columns "were dropped in PR-4" (they were not — 4c is held).
```

### CC-20 · Dead-end record readers
**Review seats:** Integration (primary), Operator-lens.

```
Close the "record with no reader" dead-ends so every captured event is legible. Feature branch, verify gate.
1. HIGHEST LEVERAGE: an admin daily-check viewer — a surface that reads submitted checks (checklist answers, odometer, photos), reachable from the vehicle/deployment drawers and from the failed/missed-check alerts. Today no admin surface reads a submitted check at all. This one viewer unblocks the failed-check loop, the missed-check loop, and the photo timeline.
2. Resolved transfer/handoff history views (today every surface fetches ?status=PENDING only).
3. Surface RequestLineEvent (the hub Confirm/Edit/Deny audit trail) in the request drawer.
4. Persist StatusLink EXPIRED (add a cron sweep) so pending counts stop overstating and someone is told when a hub never acted.
5. Wire auto-resolve for the linger-forever alerts: PIN_LOCKED on PIN reset, MATERIAL_REQUEST on fulfill/deny, EQUIPMENT_NOT_RETURNED on return.
6. Fix notification deep-links to carry record ids where they don't (alert-display.ts), and point HUB_RETURN discrepancy/receipt notifications at the Hubs Inbound tab, not /admin/inventory.
```

### CC-21 · Mounted collection units — design spike (decision first, no build)
**Review seats:** Fable (scope), Integration, SRE.

```
DESIGN SPIKE ONLY — do not build yet. Produce a short design doc (not code) evaluating how to represent mounted collection units (Giddings on Bobcat, Wintex on Can-Am) — the sampling equipment that generates revenue and currently has no model representation.
1. Compare three options: (a) a non-motorized Vehicle subtype, (b) reuse of the Equipment/InventoryUnit model, (c) a new MountedUnit table. For each, list what re-plumbing it costs across the four subsystems keyed to Vehicle/InventoryUnit today (daily-check, maintenance, QR, alerts) and whether it collides with any W0-10 or money-loop assumptions.
2. Design the combined operator flow: the operator now runs TWO checks per deployment (carrier vehicle + mounted collection unit) — these must be ONE guided sequence ("check rig → check collection unit"), dead-simple on mobile, or operators skip one. Sketch that flow.
3. Recommend one option with rationale, and estimate the build. I'll make the call before any build packet is written.
```

---

## Manual (no Claude Code) — run in parallel starting now

**A6 device pass.** Follow `AHITS_A6_DEVICE_CHECKLIST.md` on real iOS + Android hardware: the 22-row × 5-target matrix (SW-drop → warm → offline ritual; the overnight iOS eviction row; the add-items-to-offline-rig row). Record signed results. A clean pass is the pilot line. This needs no code and no CC session — it's you (or a tester) on real phones. Run it this week; a failure redirects the Wave-B work, so earlier is better.

**Sentry DSN.** Error tracking (FND-17) is blocked only on you providing a Sentry DSN. Once you have it, a short CC packet wires it up (request-IDs are already live in the code, waiting for a consumer).
