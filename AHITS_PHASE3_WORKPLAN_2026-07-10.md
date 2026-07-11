# AHITS — Phase 3 Detailed Workplan
### Holistic, sequenced, grounded · 2026-07-10

> ## ⛔️ PRODUCTION CUTOVER IS DEFERRED — see `AHITS_PROD_CUTOVER_DEFERRED.md`
> **The prod cutover (Workstream 1 / CC-04 / CC-05 / PR #144 / the `AHITS_PROD_*` secrets / the held W0-10 4b′+4c) is POSTPONED by decision on 2026-07-10. It is its own separate step, it is NOT started, and it does NOT gate anything else in this plan.** Production is a from-scratch standup that waits for actual go-live; the pilot runs entirely on staging; the money loop is un-gated regardless. Everything else in Phase 3 proceeds on `development` → staging without it. When re-reading, do not resurrect this as a blocker — it is intentionally parked.

*This plan operationalizes the Master Roadmap and the North Star v3 into an executable Phase-3 sequence, corrected against the actual state of the code at `development` HEAD and against a live walkthrough of staging. It absorbs the six-seat audit (strategy, adversarial code, calibration, operator-UX, SRE/release-safety, integration-consistency) and this session's product decisions. Companion: `AHITS_STATE_OF_THE_APP_2026-07-10.md` (the assessment) and `AHITS_CLAUDE_CODE_INSTRUCTIONS_2026-07-10.md` (the paste-ready implementation packets).*

> **This document extends and re-baselines the existing plan — it does not rewrite it.** The canonical sources stand: `AHITS_MASTER_ROADMAP.md` remains the phase map and the integration matrix (§8 CONV-# flows); `AHITS_PHASE3_WORKPLAN_v2.md` remains the canonical tactical register (`FND-#`, `W0-#`, `P3-*`, `CARRY-#`); `AHITS_PHASE3PLUS_NORTH_STAR_v3.md` remains the canonical strategy (the two loops, the friction budget, the `NS-#`/`N-#`/`MID-#` bets and triggers); the `AHITS_ROADMAP_EXEC_SUMMARY.md` remains the grounding one-pager. **All existing IDs are carried, not re-minted** — every item below cross-references its roadmap/workplan/North-Star ID. What this document adds is exactly three things the corpus did not yet have: (1) a **verified re-baseline of the code at HEAD** (what actually landed since the 07-03 roadmap — e.g. the money loop is now un-gated, W0-11's rename is live, FND-21 is closed), which reorders the *remaining* work without changing the strategy; (2) the **audit's new findings** (the data-integrity cluster, the release-safety gaps, the dead-end records) folded into the existing Wave-0 discipline; and (3) **this session's three locked decisions** (§1). Where it changes sequence versus the July-7 detailed workplan, it says so and why — it supersedes *ordering*, never the strategy or the parked list.

---

## 0. How this plan is organized

- **§1 — The decisions that shape everything** (locked this session).
- **§2 — The corrected sequencing doctrine** and what changed vs. the roadmap.
- **§3 — WORKSTREAM 0: Release-safety & data-integrity hardening** — the trust floor. Does not add features; makes the base safe to build on. Highest priority.
- **§4 — WORKSTREAM 1: Prod cutover** — take the empty production current (your decision).
- **§5 — WORKSTREAM 2: Field-feedback waves A/B/C** — the reactive fixes, re-ordered and de-collided.
- **§6 — WORKSTREAM 3: The operator's day** — NS-10 Today + NS-11 close-out (the adoption product).
- **§7 — WORKSTREAM 4: The capstones** — Map (with your route-history + crew-visibility decision) → QR → Time/Invoicing.
- **§8 — WORKSTREAM 5: The manager's week** — N-5 board.
- **§9 — WORKSTREAM 6: Consistency, tidiness & dead-code** — the "tidy without losing an iota" pass.
- **§10 — The ambition layer** — mounted collection units, evidence probe, and what to build at the app's most advanced.
- **§11 — Sequenced milestone calendar** with dependencies and gates.
- **§12 — The A6 device gate.**
- **§13 — Governance decisions still open.**
- **§14 — How the 6-agent team runs each build** (the standing process).

Each build item carries: an ID, the goal tags it serves ([SIM] simplicity · [FUN] functionality/trust · [TRA] transferability/cross-platform · [SPK] everything-speaks-to-everything), effort (S <½day · M ½–2d · L multi-day/new-model), dependencies, and the file-level entry points the audit found. Items map to a numbered Claude Code instruction packet (CC-#) in the companion doc.

---

## 1. The decisions that shape everything (locked 2026-07-10)

**D1 · Production cutover is DEFERRED (revised 2026-07-10).** *The earlier "cutover-first" framing here was based on a mistaken belief that prod was an existing empty environment needing one secret. It is not — production does not exist and standing it up is a full from-scratch job (new Supabase project, 11 secrets, migrations, first admin, prod cron, isolation checks).* Per the Executive Summary and North Star, **the pilot runs on staging and production is a deliberate later, go-live step.** Deferring costs nothing: the money loop is un-gated (PR-4a landed the readers), and the held W0-10 4b′/4c stay held indefinitely with no downside. **Workstream 1 below is therefore parked as its own separate step (see `AHITS_PROD_CUTOVER_DEFERRED.md`) and does NOT gate any other work.** This resolves the four-document contradiction in the runbook's favor: the "prod does not exist" banner was correct.

**D2 · The Map grows deliberately — route history + crew visibility, scoped.** This overrides two written anti-goals *by explicit product decision, recorded here* (not by silent edit):
- **Route history** = *where a rig has been, per check-in* — the historical breadcrumb assembled from the daily-check GPS points the Map capstone already captures. It is **not** live "where is it right now." The standing anti-goal against **real-time GPS tracking remains fully in force.** This is read-side work over attestation data; zero new operator taps.
- **Crew visibility** = operators can see one another's **last-known** position (from their last attestation), for the operational purpose of coordinating a gear swap or requesting help. This overrides the North Star's "crew visibility, declined by name." It rides the same attestation data — never continuous tracking — and must be framed as coordination, not surveillance.
- Net: the Map capstone carries admin pins (v1) + per-rig check-in history trail + last-known peer positions. All three ride GPS-on-attestation. No live tracking anywhere.

**D3 · Admin-held rigs are excluded from the money loop.** An admin may hold a deployment and accept transfers/handoffs operationally, but admin-held rigs are excluded from payroll attribution and flagged distinctly in missed-check scans and dashboards. This policy is written into the attribution resolver and the cron scan **before** the role gates are relaxed — and the role-gate relaxation is sequenced **after** the W0-10 4b′ patch lands, to avoid a file collision (both edit the transfer/handoff routes).

**Inherited and unchanged:** the non-negotiable gates (A6 = the pilot line; FND-8 email verified before the invoice email; FND-7/FND-14 before offline money writes; FND-6 closed before the public QR form); the friction budget (every required operator tap removes ≥1 tap/text/call); one meaningful bet per quarter; park-with-trigger discipline for everything not on the short list.

---

## 2. Corrected sequencing doctrine

The roadmap's doctrine stands — Wave 0 first; capstones in contract order Map → QR → Time/Invoicing; the North-Star loops decide what fills the space around them. Three corrections from the audit:

1. **The money loop is un-gated now.** PR-4a landed the W0-10 readers; the irreversible DROP is elective defense-in-depth, not the invoicing gate. Time/Invoicing schema and design work can begin in parallel with the fix waves. (This is the single biggest re-baseline; the roadmap §1.2 is stale in the good direction.)

2. **Data-integrity and release-safety outrank the feature waves.** The audit found a cluster of inventory-leak and hold-corruption defects and a release pipeline where the irreversible drop is guarded only by human memory. Because "zero defects in the money-and-data path" is the multiplier on every other value number, Workstream 0 comes first — it is cheap, mostly S/M, and it protects the pilot and the money loop that follow.

3. **A6 is a gate that has drifted to "someday," and field usage has already started.** The existence of field feedback proves operators are on staging *ahead of* the offline-safety gate meant to protect them. A6 is a human-run procedure (~45–60 min/device) that parallelizes with all build work. It moves to "this week," not "after freeze" (the freeze never comes).

---

## 3. WORKSTREAM 0 — Release-safety & data-integrity hardening (the trust floor)

**Objective:** make the base safe to build the money loop on and safe to promote to prod. All items are fixes, not features; most are S. This is the highest-priority workstream and several items gate Workstream 1.

### 3A · Release-safety guards (gate the prod cutover) [FUN][TRA]
- **W0-SAFE-1 · Quarantine the held patches + add the CI drop-guard.** Move `batch5-pr4b-writers-nullable.patch` and `batch5-pr4c-drop.patch` into `held/` with a README; add a ~6-line CI job that hard-fails any PR targeting `production` whose added migrations `DROP` the three W0-10 columns unless the PR carries an explicit `destructive-migration-approved` label. Closes the "one mis-merge reaches prod" path. **S.** → CC-01
- **W0-SAFE-2 · Fix the preview-deploy email sandbox.** Add `EMAIL_SANDBOX=true` to the `make cloud-run-deploy` call in `pr-staging-deploy.yml:84-90`. **S.** → CC-01
- **W0-SAFE-3 · Harden `check-migration-safety.sh`:** strip comments + normalize whitespace before grepping; extend the regex to `ALTER COLUMN … TYPE | DROP INDEX | DROP CONSTRAINT | DELETE FROM | RENAME VALUE | DROP TYPE`; scope the `acknowledged` waiver per-statement, and make it a hard FAIL (not warning) on production-targeting PRs without the approval label. **S–M.** → CC-01
- **W0-SAFE-4 · Fix the break-glass recovery script.** Add the third fallback (latest-ended PRIMARY) before the `SET NOT NULL`, plus a zero-NULL assertion. **S.** → CC-01
- **W0-SAFE-5 · Make FND-23 invariants present in the CI test DB.** After `prisma db push` in `verify.yml`, apply the known raw-SQL partial indexes (or switch test-prep to `migrate deploy`) so the 409-on-conflict branches are actually exercised. **S–M.** → CC-01
- **W0-SAFE-6 · Add cron overlap protection** (`pg_try_advisory_lock` around the dispatch body) so a double-fire can't double-email. **S.** → CC-01

### 3B · Data-integrity fixes (the inventory-truth tier) [FUN][SPK]
Sequence these before the money loop multiplies the transfer/hold paths. Each is code-traced.
- **W0-INT-1 · The hold-race pair (highest severity).** In `deployment-requests.ts`: make the cancel path's reserve-release and guarded status-flip atomic and throw on mismatch (`:613-621`); add `AND releasedAt IS NULL` to `claimHeldStock`'s locked re-read and make the `claimedQty` update conditional, falling back to a free draw rather than aborting checkout (`:827-847`). **M.** → CC-02
- **W0-INT-2 · Ended-rig transfer decline & cancel restore.** Copy the decline route's ended-rig restore block into cancel (`transfers/[id]/route.ts`); add `restoreToHub`+`resyncItemTotal` for consumables in the ended-rig decline branch (`decline/route.ts:70-104`). **M.** → CC-02
- **W0-INT-3 · Ended-rig kit-item double-transfer guard.** Claim the kit item with a conditional `updateMany` in accept; kill sibling PENDING `transfer_items` for the same kitItemId on end/decline/accept (or add a partial-unique index). (`transfers/[id]/accept/route.ts:100-115`) **M.** → CC-02
- **W0-INT-4 · Vehicle remove-with-transfer brick.** For TRANSFER dispositions, leave the RigVehicle row open (mirror the end route). (`deployments/[id]/vehicles/route.ts:160-186`) **S.** → CC-02
- **W0-INT-5 · Honor `returnCondition` on end-of-deployment HUB returns** — reuse the single-item route's condition→status mapping. (`end/route.ts:118-152`) **S.** → CC-02
- **W0-INT-6 · Atomic quantity decrements** in transfer accept; replace bulk-return blind increment with `resyncItemTotal`. **S.** → CC-02
- **W0-INT-7 · Require disposition coverage at end-of-deployment** (400 on uncovered kit items, or default HUB-to-home-hub). (`end/route.ts:84-100`) **S.** → CC-02
- **W0-INT-8 · The IN_TRANSIT / hub-receipt custody loop.** Decision (per D2's need for a real custody loop): **write `IN_TRANSIT` at hub-return time**, making RECEIVED and DISCREPANCY meaningful; make Dismiss reset the unit status and keep the discrepancy note viewable. This also closes the field-reported strand. **M.** → CC-02 / CC-08 (pairs with the Hubs UX fix)
- **W0-INT-9 · The drift-report cron.** Wire the SRE seat's invariant SQL (held↔reserved mirror, orphan holds, custody strands, non-negativity, drawn-conservation) into the existing dispatch cron step, raising `createAlert` interrupts instead of `console.error`. Ship the read-only drift queries first; this is also CONV-16. **M.** → CC-02

### 3C · The offline / trust one-liners [FUN][TRA]
- **W0-INT-10 · Return 401 for expired-session `/api/*`** instead of redirecting to `/login` (`proxy.ts:129-131, 188-190`) — restores the queue's 401-parking. **The single highest-value bug fix in the report. S.** → CC-03
- **W0-INT-11 · `withIdempotency` must never re-execute** — on claim-loss, poll with backoff then return 409/425, never run the handler (`idempotency.ts:133-146`); wrap `/api/checkout` and `/api/maintenance/[id]/complete`. **S–M.** → CC-03
- **W0-INT-12 · Extend the SW field-reads matcher** to include `/api/transfers`, `/api/handoffs`, `/api/deployment-requests`, `/api/hubs`, `/api/notifications`. **S.** → CC-03
- **W0-INT-13 · Clamp daily-check date server-side** to the business date (kills the pre-date/miss-dodge). **S.** → CC-03
- **W0-INT-14 · Mount the offline banner in the admin shell.** **S.** → CC-03

**Workstream-0 exit:** the release guards are in CI; the data-integrity cluster is closed and the drift cron alerts; the offline one-liners are merged; and the three still-pending Wave-0 patches (EmailLog-FAILED alert, URL-filters rollout, date-unify — independent, reviewed, safe) are landed here. Prod cutover (Workstream 1) may proceed.

---

## 4. WORKSTREAM 1 — Prod cutover — ⛔️ DEFERRED / PARKED (not a gate) [FUN][TRA]

> **This entire workstream is postponed (see `AHITS_PROD_CUTOVER_DEFERRED.md`).** It is its own separate step, revisited only at actual go-live, and it blocks nothing else. The steps below are retained for that future moment; **do not action CC-04/CC-05 now, and do not treat any item here as a prerequisite for the pilot, the capstones, or the money loop.** Production is a full from-scratch standup per `PROD_CUTOVER_RUNBOOK.md`, not a promote to an existing environment.

_Retained for go-live. Per the runbook, not for now:_

- **W1-1 · Create `AHITS_PROD_MIGRATE_URL`** in Secret Manager (prod session pooler, port 5432, IPv4), ENABLED version; confirm the deploy SA has `secretmanager.secretAccessor`. → CC-04 (operator steps, not code)
- **W1-2 · Run the invariant gate on prod BEFORE merging #144:** the SRE top-5 queries #1 (every active rig has exactly one open PRIMARY) and #2 (legacy vs assignment PRIMARY parity — a non-zero result is a payroll-attribution incident to reconcile by hand). Capture a PITR/backup restore point + UTC timestamp as the rollback anchor. → CC-04
- **W1-3 · Merge PR #144**, watch the migrate job (confirm the secret read didn't error and the additive migration set is as expected), smoke prod. → CC-04
- **W1-4 · Land the held chain on the now-current prod:** 4b′ → soak → 4c behind its full §11 go/no-go (prod invariant queries zero, archive taken, PITR confirmed). With prod empty, "soak" is nominal; the real gates are the invariant queries + archive + PITR. → CC-05
- **W1-5 · Post-cutover prod ops:** create the prod Cloud Scheduler cron (else prod has no alerts / TTL-release / reap), pin Cloud Run flags, confirm automated backups + retention + a restore drill. → CC-04
- **W1-6 · Correct the cutover runbook banner** and `docs/INDEX.md`. → CC-13 (doc hygiene)

**Note:** the migration-safety CI guards from Workstream 0 are what make this safe; do not reorder W1 before W0-SAFE-1/3.

---

## 5. WORKSTREAM 2 — Field-feedback waves (re-ordered, de-collided) [SIM][FUN]

The field plan's waves, corrected for the collision Fable found (admin-as-operator edits the same routes the held 4b′ rewrites) and re-anchored so operator surfaces target the coming "Today" shell, not the dashboard it replaces.

### Wave A — quick wins + feel (land alongside/after Workstream 0)
- **A-1 · Dashboard "—" fix** — `requireAdmin → requireAuth` on `/api/dashboard` + a `res.ok` guard (do it via the shared `fetchJson` helper so it fixes the class). Confirmed live as Operator 1. **S.** → CC-06
- **A-2 · Mobile quick-win triage (leaf-level only)** — responsive breakpoints, the two clipping drawers (560/540px → responsive), debounce inventory search, kill the duplicate Team-page project filter, fix the "Loading checklist" static heading, virtualize the 2–3 worst tables. **Stay out of the monolith's state graph** (that's Batch 6b). **M.** → CC-07
- **A-3 · Vehicle-type enum reconcile** — add `BOBCAT`, reconcile UTV/ATV labels, centralize the type→label map (currently duplicated in 4 places). **S.** → CC-06
- **A-4 · Hubs stranded-IN_TRANSIT integrity fix** — folded into W0-INT-8 (do it there). **S–M.**
- *(Admin-as-operator moves to Wave B, post-4b′ — see A-5 below.)*

### Wave B — flow completeness (build mobile-first, after 4b′ lands)
- **B-1 · Fulfilled-reservation → "Awaiting Pickup" thread** — surface FULFILLED reservations with unclaimed holds as "Awaiting Pickup" cards that seed checkout from the held lines; **acceptance criteria include** the TTL-pause (a visible awaiting-pickup hold must pause/extend the 72h sweep) and the residual-hold release wired into checkout-complete. Route these cards into the Today shell (§6), not the old dashboard. One glossary term per state. **M–L.** → CC-09
- **B-2 · Field-fixed issue logging** — one operator-accessible endpoint that writes a `MaintenanceTask{isDamageReport, resolutionPath:'IN_FIELD', status:'COMPLETED'}` skipping the IN_MAINTENANCE flip and DAMAGE_REPORTED alert; a "Log a fixed issue" button on the vehicle drawer + maintenance page; add the missing **vehicle** damage path. Reconcile with the existing heavyweight damage flow into ONE mental model (which path when). **M.** → CC-10
- **B-3 · Hubs discrepancy review + bulk verify** — a discrepancy detail view querying `StatusLinkEvent` with a resolution verb; make Dismiss deliberate + viewable (pairs with W0-INT-8); a bulk-select verify slice as the first consumer of a shared multi-select pattern (the operator kit card already has the pattern to copy). **M.** → CC-08
- **A-5 · Admin-as-operator (moved here, post-4b′)** — relax the two role gates + roster to allow ADMIN; add admins to the deployment-builder dropdowns; **implement against the `deployment_assignments` PRIMARY, and wire the D3 money-loop exclusion** (admin-held rigs excluded from payroll attribution + flagged in scans). **S–M.** → CC-11

### Wave C — structural
- **C-1 · Bulk-editing shared pattern rollout** — extend the Wave-B multi-select component to inventory receive, requests, maintenance. Demand-pulled per list, not a sweep. **M.** → CC-08
- **C-2 · Mounted collection units** — see §10 (the ambition layer); gated on a design decision. **L.**
- **C-3 · Deep Performance & Feel pass + Batch 6b** — the monolith split + SWR/query-cache freshness substrate + profiler-driven optimization, run as one workstream. Underpins the Today view. Includes the outbox view + the 401-parked-queue prompt + "data as of HH:MM" freshness stamps. **L.** → CC-12

---

## 6. WORKSTREAM 3 — The operator's day (the adoption product) [SIM][FUN][SPK]

The North Star's headline, still unbuilt. Not new scope so much as *how* the planned work gets built. Sequence after Batch 6b's substrate (C-3) provides the SWR/split foundation, but the design lands now so Wave-B surfaces target it.

- **P1-1 · NS-10 "Today" view** — replace the static 4-card dashboard with the operator's day: current deployment + project (with site/access notes read-only), per-vehicle daily-check state (done/due, one tap in), transfers/handoffs waiting on me, my open requests + Awaiting-Pickup cards (B-1), and — post-2C — today's clock state. One contextual primary action. Pure read-side assembly (`GET /api/operator/today` aggregate, added to the SW field-reads matcher). **M.** Falsifier: session analytics — if operators deep-link past Today, redesign. → CC-14
- **P1-2 · NS-5 odometer sanity at entry** — inline warning vs last known reading; never blocks. **S.** → CC-14
- **P1-3 · NS-11 close-out ritual** — designed into P3-TIME's clock-out (§7C): confirm hours → surface unfinished items as optional one-tap fixes → "Day closed — you logged 9.5 h." ~zero marginal if designed in now.
- **P1-4 · Pilot instrumentation** — daily-check time-to-complete client timing; the N-3 variance check in pilot month one.
- **P1-5 · Operator IA fixes** — Requests into the bottom nav (or replace the redundant "Check Out / Check In" card); transfer badge on the bottom-bar tab; confirm dialog on request Cancel; searchable Autocomplete for the roster/item pickers. **S–M.** → CC-14

---

## 7. WORKSTREAM 4 — The capstones (contract order) [FUN][SPK]

### 7A · Capstone 1 — Deployment Map (+ route history + crew visibility per D2)
Smallest, de-risks GPS plumbing. Step order:
1. **Migration:** 3 additive nullable columns `DailyCheck.gpsLat/gpsLng/gpsAccuracy Float?`. Merge early — additive.
2. **Capture:** `getCurrentPosition` in the daily-check `buildPayload()`; resolve-or-skip before enqueue (never blocks submit). Verify the late-response answer-wipe (FND-35) is fixed first — same file.
3. **Secrets:** `AHITS_MAPBOX_TOKEN` server-side (never `NEXT_PUBLIC_`); Secret Manager ENABLED before the deploy that mounts it; Makefile `--set-secrets` mapping in the same change.
4. **Admin map (v1):** one pin per active deployment at latest-check coords; recency colors (green <24h / amber / red, businessDate-aware); tooltip deep-links via URL params.
5. **Route history (D2):** a read-side per-rig trail connecting that rig's daily-check GPS points over time — "where has this rig been," from check-ins. Not live. A polyline/point-sequence view on the admin map + the deployment drawer.
6. **Crew visibility (D2):** operators see one another's **last-known** position (from last attestation) on an operator-facing map, framed for coordination (swap gear / request help). No live tracking; no continuous location. Respect the friction budget (positions come from checks already submitted).
7. **Rider (after Map): NS-4 weather stamps** — nightly server job stamps deployment-day weather from GPS + businessDate; zero operator taps.
- **Anti-goal guard (revised per D2):** no **real-time** tracking, ever; positions are last-known from attestations. Route history is historical only. **L** (larger than the original Map because of D2's additions). → CC-15

### 7B · Capstone 2 — No-app QR daily-check
Security preconditions: CSP ✅, rate-limits ✅, **FND-6's last shard closed** (the `Date.now()` idempotency key at `s/[token]/page.tsx:158` — do this in Workstream 0), public-surface tests. Steps per roadmap §7.2B: extract authed daily-check side-effects into `lib/daily-check.ts`; sentinel external user for `DailyCheck.operatorId`; `StatusLink.vehicleId` subject + `DAILY_CHECK` type; public form reusing the token primitive; wire the missed-check chase to carry the QR link. Also fix the public read-after-revoke leak (`s/[token]/route.ts` serves full inventory payload for REVOKED/EXPIRED links — return minimal body when not actionable). **M.** → CC-16

### 7C · Capstone 3 — Time/Invoicing/Availability (THE MONEY LOOP)
**Un-gated now** (PR-4a landed the readers; the DROP is elective). Schema/design work can start in parallel with the fix waves. Gates that remain: FND-8 email verified-in-staging (invoice email), FND-7/FND-14 (A6-proven), and the D3 admin-exclusion policy in the attribution resolver. Build per roadmap §7.2C:
- **Decisions first:** real single-row `Settings` model (not the `NotificationConfig` phantom); rate precedence (`OperatorRate` > `TaskType.defaultRate` > `User.hourlyRate`) with one SQL-computed resolver; the `TaskType` seed incl. exception types (Weather Delay, Breakdown, No Access, Travel, Sampling, Maintenance, Training, Incident) with `payable`/`productive` booleans; Incident as its own task type.
- **Migration (one additive PR):** `TaskType`, `OperatorRate`, `TimeEntry` (own `projectId` snapshot at clock-in), `Expense`, `Invoice`, `InvoiceLineItem`, `Availability` + the `Settings` decision + nullable `region` column on the money models.
- **API (~8-10 routes on the W0-C primitives):** clock-in/out with `withIdempotency` from day one; missed-clock-out reconciliation; expenses + mileage; availability CRUD; invoice lifecycle (SQL-summed lines) → INVOICE StatusLink + email template + PDF + PAID back-write; **attribution via `deployment_assignments`, admin-held rigs excluded per D3**; SQL-computed totals everywhere (never JS float summing — FND-26).
- **Offline:** clock writes ride the queue + idempotency; the Today view shows queued clock state.
- **Operator UI:** clock-in from Today; task-type picker with exception states one tap deep; **NS-11 close-out ritual as clock-out**; **MID-3 earnings view** ("you've earned $X this period") in the definition of done.
- **Admin UI:** time review/approval, invoice pipeline, availability grid, missed-clock-out exceptions.
- **Acceptance:** one pilot payroll period runs clock → approve → invoice → emailed → PAID with zero manual corrections; an operator answers "how much did I earn this week?" in ≤2 taps.
- **L (the long pole, 6–10 wks).** Do not parallelize another bet against it. → CC-17 (multi-part)

---

## 8. WORKSTREAM 5 — The manager's week (N-5 board) [SPK][SIM-for-managers]

After the URL-filter rollout (Wave A / batch8) and ideally after 2C's availability layer, but degradable. Read-only timeline: deployments (rows) × days (columns) with typed annotations. **v1 = layers L1–L5 + L8–L9** (all sources exist today); L6 Availability + L7 exception days light up once 2C is adopted and producing rows. Every chip click-throughs via URL params to the owning page. No drag-to-reschedule, no auto-assignment. **L (2–4 wks).** Falsifier: if the ops lead's Monday still starts in a spreadsheet after a month, iterate or stop. → CC-18

---

## 9. WORKSTREAM 6 — Consistency, tidiness & dead-code [SIM][SPK]

The "tidy without losing an iota" pass. All verified zero-importer or byte-identical.
- **T-1 · Response-envelope + `fetchJson` consolidation** — adopt `ok()/fail()` and a shared `fetchJson` guard across loaders (fixes the dashboard-"—" bug *class*); land the `withAuth`/`withAdmin` wrapper (FND-43). **M.** → CC-19
- **T-2 · Date unification** — land `batch6a-date-unify.patch` (~30 `toLocale*` sites; leaves numeric formatting alone). **S.** → CC-19
- **T-3 · Extract the shared RespondDialog** (2-3 near-duplicate accept/decline blocks). **S.** → CC-19
- **T-4 · Dead-code deletion** — 6 dead exports in `lib/deployment-assignments.ts`; `GET /api/inventory/stock`; `GET /api/checkout` (keep POST tombstone); the dead `lib/shipments.ts` (keep the `Shipment` *model* dormant); `@emotion/cache`+`@emotion/server` deps; evaluate `@mui/x-date-pickers` removal. Re-run `tsc` after. **S–M.** → CC-19
- **T-5 · Stale-comment + false-comment cleanup** — the PR-4a-contradicting comments (`cron/dispatch:134`, `transfers/route.ts:31-32`); the false `inventory/stock` comment. **S.** → CC-19
- **T-6 · Doc hygiene** — delete the 37 root duplicates, archive North Star v1/v2 + session records + WAVE0 logs, update `docs/INDEX.md`, archive the 10 landed `.patch` files (keep held + pending), annotate `slice4_drop_legacy.sql`. **S.** → CC-13
- **T-7 · Dead-end record readers** — the daily-check admin viewer (unblocks the failed/missed-check loops + photo timeline at once — the single cheapest high-leverage stitch), resolved-transfer/handoff history views, `RequestLineEvent` surfacing, StatusLink EXPIRED persistence + sweep, and auto-resolve wiring for the linger-forever alerts (PIN_LOCKED on reset, MATERIAL_REQUEST on fulfill/deny, EQUIPMENT_NOT_RETURNED on return). **M.** → CC-20

---

## 10. The ambition layer — what AHITS could be

Beyond the fix-and-finish, four bets worth naming (three ride data that already exists):

**Mounted collection units (the revenue-instrument gap).** The Giddings and Wintex sampling rigs — the equipment that generates revenue — have no model representation. This is a gap in the executive summary's own thesis. **Decision required before building:** evaluate a non-motorized `Vehicle` subtype or `Equipment`/`InventoryUnit` reuse against a new `MountedUnit` table — reuse likely saves re-plumbing four subsystems (daily-check, maintenance, QR, alerts, all keyed to `Vehicle`/`InventoryUnit`). **Design the combined operator flow as ONE guided sequence** ("check rig → check collection unit") or operators skip one. High field value; **L**; scheduled as a design spike (decision only) then a build slot that competes with a capstone. → CC-21 (spike)

**The evidence probe (prices an entire value lane for one week's work).** The daily-check admin viewer (T-7) + photo timeline + a per-deployment evidence bundle (checks+GPS, custody, photos, weather, time, costs) rendered as one artifact, put in front of whoever faces auditors and the sample-system owners. Obey the answer: want it → the evidence lane earns a quarter; shrug → it collapses to passive capture permanently. Read-side over data that exists. **M.**

**Crew coordination as a first-class tool (per D2).** Route history + last-known crew positions, built under the friction budget on attestation data, turn the Map from an admin-only compliance view into an operator coordination surface — the thing that lets a crew swap gear or send help without a phone tree. This is the ambition the Map capstone unlocks once D2's scope is in.

**Cost intelligence, when the actuals are believed.** After a season of P3-TIME data: the fleet TCO columns + idle-vs-rental nudge (cheap, rides FND-26), then — trigger-gated — N-7 job costing ("this project costs $X/sampling-day") and eventually the quote estimator. Do not front-run the data.

Everything else stays parked with its trigger (Shippo >5 shipments/month, dispatch ranking after the board ships, predictive maintenance after a season of variance-checked data, multi-region on a second operating region). The parked list is a deliverable, not a leftovers pile.

---

## 11. Sequenced milestone calendar (dependency-honest)

| # | Milestone | Workstream | Depends on | Gate it clears |
|---|---|---|---|---|
| M0 | Release-safety guards + data-integrity cluster + offline one-liners + 3 pending patches | §3 | — | Safe base for the money loop |
| ~~M1~~ | ~~Prod cutover~~ — ⛔️ **DEFERRED, own separate step at go-live, gates nothing** (see `AHITS_PROD_CUTOVER_DEFERRED.md`) | §4 | — | *parked* |
| M2 | Field Wave A (dashboard fix, mobile triage, enum) | §5 | M0 | Broken first impression gone; feel |
| ~~M3~~ | ~~4c drop~~ — deferred with prod (held 4b′/4c stay held; elective) | §4 | — | *parked* |
| M4 | Field Wave B (Awaiting-Pickup, field-fix log, Hubs discrepancy) + admin-as-operator | §5 | M0 (built directly on `deployment_assignments`; no longer waits on 4b′) | Flow gaps closed |
| M5 | A6 device pass (parallel, human-run) | §12 | M0-ish build stable | **THE PILOT LINE** |
| M6 | Batch 6b + Perf/Feel + Today view + close-out design | §5C/§6 | M2 | Adoption substrate + front door |
| M7 | Capstone 1 Map (+ route history + crew visibility) | §7A | M6 (rename/split), FND-7 | Map contract (D2 scope) |
| M8 | Capstone 2 QR | §7B | FND-6 shard closed (M0) | Compliance loop |
| M9 | Capstone 3 Time/Invoicing (money loop) | §7C | FND-8 verified, A6 (M5); NOT gated on 4c | The money loop |
| M10 | N-5 Week board | §8 | URL-filter rollout, M9 availability (degradable) | Manager's week |
| M11 | Evidence probe + mounted-units spike | §10 | M7 (GPS), T-7 viewer | Prices the next quarters |
| M12 | Tidiness/consistency pass (rolling) | §9 | — | Tidy base |

**Quarter shape (labels are directional; the sequence + gates are the commitment):** now → M0 + M2 + A6 (prod cutover M1/M3 is deferred and off this path); then the operator's day + Map/QR around the pilot; then the money loop (the long pole, Q4→Q1); then the board; then the probe + basket. One meaningful bet per quarter after the fixes.

---

## 12. The A6 device gate

Run the 22-row × 5-target matrix per `AHITS_A6_DEVICE_CHECKLIST.md` on real iOS + Android hardware (SW-drop → warm → offline ritual; overnight iOS eviction row; add-items-to-offline-rig row). **This is a human-run procedure (~45-60 min/device), parallelizable with all build work — run it this week, not "after freeze."** Record signed results. A clean pass is the pilot line; a keystone failure freezes Wave-B feature work until the offline floor is solid (building mobile-first features on a broken offline base is waste). The code-readiness for this gate is assessed in the integration report; the two biggest code-level risks are the SW cold-start-needs-prior-online-load and the detect-don't-prevent iOS eviction of queued checks/photos.

---

## 13. Governance decisions still open

To adjudicate early (½-day): the `P3-NOTIF-*` push-vs-45s-polling question; the `CARRY-*` build-or-descope items; declaring the Requests redesign supersedes PRD §F; the mounted-units reuse-vs-new-model decision (§10); and whether the crew-visibility surface is operator-only or also a manager view. Governance is not engineering; schedule it as a decision meeting with the workplan recommendations carried.

---

## 14. How the 6-agent team runs each build (standing process)

Every code change ships through the discipline this session used and the handoff documents: **build → multi-agent adversarial review (Antagonist for defects, Fable for strategic/scope soundness, Calibration for claims-vs-code, Operator-lens for UX/friction, SRE for reversibility/release-safety, Integration for everything-speaks) → fixes incorporated → verified patch that applies cleanly onto `development`.** Schema-touching patches always run CI `tsc` with a fresh `make db-generate` as the authoritative type gate (the Prisma client can't be regenerated offline). Nothing lands to production except through the PR + GitHub Actions flow; the held W0-10 patches land only on explicit go behind their §11 gate. The Claude Code instruction packets (companion doc) are written so a non-technical operator can drive each build by paste, with the review seats named per packet.
