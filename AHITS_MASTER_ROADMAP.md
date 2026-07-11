# AHITS — Master Build Roadmap · One Sequence, Two Loops, Every Conversation

_Prepared 2026-07-03. **This document unifies — it does not supersede.** `AHITS_PHASE3_WORKPLAN_v2.md` remains the canonical tactical register (`FND-#`, `W0-#`, `P3-*`, `CARRY-#`); `AHITS_PHASE3PLUS_NORTH_STAR_v3.md` remains the canonical strategy (the two loops, the friction budget, the `NS-#`/`N-#`/`MID-#`/`X-#` bets and their triggers). This roadmap sequences both into a single phased build plan an engineering lead can execute from, adds a **verified re-baseline of what has already landed at HEAD** (§1 — a meaningful fraction of Wave 0 shipped between the workplan snapshot and this writing), and devotes its centerpiece (§8) to the **cross-cutting integration matrix**: how every subsystem talks to every other, designed as explicit end-to-end flows rather than left to accident. All IDs referenced here are defined in those two documents; nothing is re-derived, and no ID is minted except the `CONV-#` conversation flows in §8._

---

## 0. How to read this document

- **§1** is ground truth: what is verified in source **today**, including workplan items that have already landed (the workplan's register is ~1 day stale against HEAD — in the good direction).
- **§2–§3** are the frame: the app's four original goals and the non-negotiable constraints every phase respects.
- **§4** is the phase map and dependency graph — the ten-minute read.
- **§5–§7, §9–§11** are the phases, each workstream step-by-step (schema → API → offline → UI → tests → acceptance), with dependencies and goal tags.
- **§8 is the centerpiece**: sixteen designed conversations between subsystems, each traced trigger → records → operator surface → manager surface, with the **week board + exception feed + reports** specified as the convergence point where every flow becomes legible to the manager.
- **§12–§14**: effort/quarter mapping, goal-coverage matrix, and the honest list of assumptions, unverified claims, and tensions this document had to resolve.

**Sequencing doctrine (inherited, not invented):** Wave 0 first; capstones in workplan order **Map → QR → Time/Invoicing**; North-Star priorities (`NS-10` Today, `NS-11` close-out, `N-5` week board, the evidence probe) decide what fills the space *around* the capstones; **one meaningful bet per quarter**; everything else parked by name with a written trigger.

---

## 1. Verified ground truth at HEAD (re-baseline, 2026-07-03)

Every claim in this section was checked against the connected repo this session (`prisma/schema.prisma`, the full `src/app/api` route tree, `src/lib`, `Makefile`, `.github/workflows`). This matters because **the workplan's findings register is already partially stale**: a substantial Wave-0 tranche landed at HEAD after the workplan snapshot.

### 1.1 Workplan findings verified ALREADY LANDED at HEAD ✅

| Finding | Evidence in source (verified this session) |
|---|---|
| `FND-1` ended-deployment crash | `api/deployments/[id]/route.ts:90-104` hydrates `operator` from legacy `Rig.operatorId` fallback ("completes B1 for the single-rig GET") |
| `FND-2` consumable transfer stock leak | `api/transfers/[id]/accept/route.ts:158-180` carries `drawnQuantity`/`drawnHubId` onto the destination kit item, splits proportionally, decrements source |
| `FND-3` bulk-invite raw tokens | `api/users/bulk/route.ts:37-47` uses `generateInviteToken()`/`hashInviteToken()` |
| `FND-4` PIN lockout non-atomic | `lib/auth/pin.ts:30-35` uses `{ increment: 1 }` (pin-hardening merged) |
| `FND-5` CSP `unsafe-inline`/`unsafe-eval` | `src/proxy.ts:43-63` builds a per-request nonce CSP with `'strict-dynamic'`; `next.config.ts` keeps only non-CSP headers |
| upload rate limits (security branch 3) | `api/uploads/route.ts:14` (30/min per user), `api/photos/[...path]/route.ts:19` (120/min) |
| `FND-7` business-date split-brain | `src/lib/business-date.ts` exists; imported by the daily-check **client page**, `api/dashboard/feeds`, and `api/cron/dispatch` |
| `FND-8` email retry + delivery log | `EmailLog` model + migration `20260703000000_add_email_log`; `lib/email/resend.ts` does sandbox guard + retry (`MAX_ATTEMPTS`) + durable `email_logs` write; admin surface at `api/admin/email-log` |
| `FND-9` HUB_RETURN duplicate rows | `lib/status-links.ts:114-119` revokes prior active links on issue; `:304` completes sibling links on receipt (W0-9 comment in source) |
| `FND-10` read-only hub Inbound | `admin/hubs/page.tsx` wires Mark-received (`status-links/[id]/receive`), Reissue/Copy-link (`/reissue`), Dismiss (`/revoke`); `api/hubs/inbound` read route exists |
| `FND-14` offline queue 401 poisoning | `hooks/useOfflineQueue.ts:17-19` — 401 deliberately **not** in `TERMINAL_STATUSES`; `:191-198` parks the queue on 401 ("prevents silent field-data loss") |
| `FND-15` migrate-secret hardcoded | `Makefile:22,153` parameterizes `$(SECRET_NS)_MIGRATE_URL`; `deploy.yml:53-62` branches on ref and passes `SECRET_NS=AHITS_PROD` on `production` |
| `FND-16` `EMAIL_SANDBOX` unmounted | `Makefile:135` carries `EMAIL_SANDBOX=$(EMAIL_SANDBOX)` in `--set-env-vars`; `deploy-staging` sets `true`, `deploy-prod` sets `false` |
| `FND-46` index half | Migration `prisma/migrations/20260703010000_wave0_missing_indexes/migration.sql` is **committed** — creates all six `photos_*_idx` + `deployment_requests_requestType_idx` (`IF NOT EXISTS`, idempotent); schema `Photo` carries the matching six `@@index`. File verified on disk this session |

> ⚠️ Two residuals inside "landed" items: (a) **`FND-15` prereq** — `AHITS_PROD_MIGRATE_URL` must exist in Secret Manager before the first prod promote (the Makefile/workflow now read it, but secret existence is un-verifiable from the repo; `deploy.yml:56` says so itself). (b) **CLAUDE.md is now stale in the safe direction** — its "KNOWN BUG (fix before first prod promote)" warning describes the pre-fix Makefile; update the doc, keep the secret-creation prereq. Also verify `EMAIL_SANDBOX=true` is actually live on the running staging service (deploy-time flag; can't be confirmed from source).

### 1.2 Workplan findings verified STILL OPEN at HEAD ⬜

| Finding | Evidence it is still open |
|---|---|
| `FND-6` public `/s/[token]` line-actions | `api/s/[token]/transition/route.ts:44-66` routes on `lineId` with a token-scoped ownership join but **no `isLinkActionable` state/expiry gate on the line branch**; `app/s/[token]/page.tsx:100,158,174` still builds idempotency keys with `Date.now()` |
| `FND-21` requests POST not idempotent | `api/deployment-requests/route.ts` — zero `withIdempotency` matches |
| `W0-10` / `SOA-2` legacy-column retirement | `Rig.operatorId` still `String` NOT NULL in schema; `rig_operators` + `Vehicle.assignedOperatorId` still present; **`getActivePrimary()` in `lib/deployment-assignments.ts:153` still has zero importers outside its own file**; no `DROP COLUMN` migration in `prisma/migrations/` |
| `W0-11` rename + monolith | operator route dir is still `my-rig`; no SWR anywhere obvious; monolith split not evidenced |
| `P3-*` capstone models | **No** `TimeEntry`/`OperatorRate`/`Invoice`/`InvoiceLineItem`/`Expense`/`TaskType`/`Availability`/`Settings`/`Incident` models in schema (confirmed); no GPS columns on `DailyCheck`; `StatusLink` has **no `vehicleId` subject** (QR prereq); `StatusLinkType.INVOICE` exists as enum value only |
| `CARRY-13`/`NS-9` Shippo | `lib/shipments.ts` still has **zero importers**; `Shipment` model dormant in schema (`f2_shippo_groundwork` migration) |
| `FND-46` residual | Index half **landed** (§1.1 — migration verified on disk). What remains: the `EquipmentStatus.IN_TRANSIT` enum disposition (still present, unused — plausibly reserved for CONV-1's in-transit state; decide keep vs drop) + a general `prisma migrate diff --exit-code` CI guard so the schema-vs-migration drift *class* can't recur |

**Not verifiable from source, treated as open until demonstrated:** A6 device pass (the pilot gate), `FND-17` error tracking, `FND-12`/`FND-13` admin-trust fixes, `FND-19`/`FND-20`/`FND-22`–`FND-45`/`FND-47`–`FND-50` individually (spot-checks only where noted), staging runtime env, Cloud Run flag pinning (`FND-49`). §5 carries them all.

### 1.3 Structural facts the roadmap builds on (all verified)

- **Auth/session:** PIN + JWT (`tokenVersion` revocation, `mustChangePin`), 47-route hand-rolled auth preamble (`FND-43` still worth the `withAuth` wrapper).
- **The tokenized external primitive:** `StatusLink` (types `WORK_ORDER | HUB_RETURN | INVOICE | RESERVATION`; states `ISSUED→VIEWED→ACTED→COMPLETED/EXPIRED/REVOKED`; sha256-at-rest; `StatusLinkEvent` audit trail) — the single most leveraged asset for QR, invoicing, and every external conversation in §8.
- **The durable offline queue:** `useOfflineQueue` + `IdempotencyKey` (body-hash-bound) + `offline-remap` — the operator-loop backbone; 401-parking now in place.
- **Deployment model:** legacy `Rig.operatorId`/`rig_operators` still live **and** the successor tables `DeploymentAssignment` (PRIMARY/SECONDARY, started/ended history) + `DeploymentProject` (many-to-many) are backfilled and waiting for readers. `DeploymentHandoff` mirrors the transfer lifecycle.
- **Inventory:** `InventoryItem` (SERIALIZED/CONSUMABLE) + `InventoryUnit` + multi-hub `InventoryStock` (with `reservedQty`), `KitItem.drawnQuantity/drawnHubId` (now transfer-safe), `CheckLog` custody trail with `expectedReturn/actualReturn`.
- **Requests:** `DeploymentRequest` (RESERVATION | MATERIAL; DRAFT→REQUESTED→STAGED/FORWARDED→FULFILLED/CANCELLED/DENIED) + `DeploymentRequestLine` (KIT_ITEM | VEHICLE | NEW_PURCHASE | SHIPPING_LABEL; `heldQty/claimedQty` hold-through-claim; `shipToHubId/shipToAddress`; `resolvedUnitId/stagedCondition`) + `RequestLineEvent` per-line audit.
- **Rentals are first-class vehicles:** `Vehicle.isRental` + `rentalCompany/AgreementNumber/AgreementUrl/StartDate/EndDate/Location/ReturnLocation/CostAmount/CostPeriod(DAY|WEEK|MONTH|FLAT)/OneWay`.
- **Maintenance:** `MaintenanceTask` with `intervalType` incl. `MILEAGE`, `nextOdometer`, damage-report fields (`isDamageReport`, `repairType`, `resolutionPath`, `repairMethod`, `returnDestinationType/Id`), `shopName/shopAddress/purchaseOrder/invoiceNumber/estimatedCost/actualCost` — mileage-triggered status **shipped** (`P3-MAINT-1`).
- **Money-adjacent fields already in place:** `User.hourlyRate` (Decimal, unseeded), `InventoryItem.unitCost`, `MaintenanceTask.actualCost`, rental cost block — everything §8's costing conversations need except the P3-TIME models themselves.
- **Dormant groundwork:** `Shipment` (polymorphic: `maintenanceTaskId | inventoryUnitId | deploymentRequestLineId | hubId`; `ShipmentStatus` UNKNOWN→PRE_TRANSIT→TRANSIT→DELIVERED/RETURNED/FAILURE) — schema only, zero runtime wiring.
- **No calendar surface, no incident model, operator dashboard is a static 4-link menu** — North Star §1's three facts re-confirmed.

---

## 2. The app's original goals — the tagging scheme

Every workstream below is tagged against the four goals the app was founded on. A workstream that serves none of them should not exist (and none below does).

| Tag | Goal | Working definition used throughout |
|---|---|---|
| **[SIM]** | Simplicity | Friction budget respected (North Star §3): every required operator tap removes ≥1 existing tap/text/call; no bloat; parked list honored |
| **[FUN]** | Functionality | It works, offline-tolerant, zero defects in the money-and-data path; the trust bar of North Star §7.3/§8.4 |
| **[TRA]** | Transferability | PWA, cross-platform (desktop / Android / iOS), offline-capable, no native lock-in (`P3-RN-1` descoped); the A6 matrix is this goal's gate |
| **[SPK]** | "Everything speaks to everything else" | Shared components/envelopes, no orphaned data, no dead-end features; §8 is this goal made into an engineering artifact; `FND-48` URL-param filters are its plumbing |

---

## 3. Constraints & non-negotiables (all inherited, none new)

**Hard gates (workplan):**
1. **A6 22-row × 5-target real-device pass** = the pilot line (`W0-1`). Never declared on emulators.
2. **W0-10 readers (PR-4a, landed)** gate invoicing attribution; the **DROP** (4b′/4c) is elective and does NOT gate the money loop — `TimeEntry`/`Invoice` must read `deployment_assignments`, which is live on staging.
3. **`FND-8` email reliability before the invoice email** (✅ delivery-log/retry landed; keep the gate as "verified in staging" not just "code exists").
4. **`FND-7` + `FND-14` before any offline-first money write** (✅ both landed in code; the A6 pass is the proof).
5. **`FND-6` (+ CSP ✅, rate-limits ✅, `FND-45` public-surface tests) before the public QR form.**

**Database & release rules (CLAUDE.md, non-negotiable):** never `db push`/`migrate dev` against a shared DB; schema changes ship as committed backward-compatible migrations applied by the CI `migrate` job; migration lands **before** the code that needs it; a new secret exists in Secret Manager (ENABLED version) **before** the deploy that mounts it, and its `--set-secrets` mapping is added in the same change (applies imminently to `AHITS_MAPBOX_TOKEN` and `AHITS_PROD_MIGRATE_URL`); no laptop deploys to prod.

**Anti-goals (North Star, standing):** do **not** build the sample system (own the operation, never the sample); **no real-time GPS tracking** — GPS rides attestations the operator already submits; **dispatch ranks, humans schedule** — the week board is a view, not a scheduling engine (PRD §14 stays parked); no LIMS, no accounting system, no routing engine (link out to the maps app); no speculative multi-tenancy (the free nullable `region` column on new money models and nothing else); no operator↔office messaging (don't fight texting on texting's turf).

**Friction budget (North Star §3, enforced as process):** every PR adding a required operator interaction states taps-added vs. taps/texts/calls-removed in its description; reviewer enforces; daily-check time-to-complete is instrumented from pilot day one. Passive > piggyback > new tap; evidence must visibly benefit the person providing it. **Scope & exemption clause:** the tap-for-tap budget binds the **daily loop** (checks, clock, transfers, requests). Rare, liability-driven capture that replaces nothing — incident reporting (CONV-15) — is **exempt**: its justification is legal exposure, not tap arithmetic. To make "reviewer enforces" real rather than asserted, every operator-facing conversation in §8 carries its friction-ledger line inline.

**Team throughput:** one meaningful bet per quarter after Wave 0 and the contracted capstones. The phase plan below spends quarters exactly where North Star §6 says: operator's day → money loop → manager's week → evidence probe.

---

## 4. The phase map

```
PHASE 0  Wave-0 completion + A6 pilot gate          (§5)  [~2–4 wks remaining work + device pass]
   │        exit = A6 signed off on hardware; FND-6 closed; hygiene primitives in;
   │        W0-10 retirement DONE or landing; W0-11 rename/SWR/monolith done
   ▼
PHASE 1  Pilot-as-launch + the operator's front door (§6)  [runs concurrently with early Phase 2]
   │        NS-10 Today view · NS-5 odometer sanity · pilot instrumentation
   │        (time-to-complete, N-3 variance check) · FND-17 error tracking live
   ▼
PHASE 2  The contracted capstones, interleaved with the loops (§7)
   │  2A  Map (P3-MAP)            + NS-4 weather stamps rider          [small]
   │  2B  No-app QR (P3-QR)       + missed-check chase pairing         [small-med]
   │  2C  Time/Invoicing (P3-TIME) ⇐ THE MONEY LOOP: carries NS-11
   │        close-out ritual + MID-3 operator earnings view +
   │        Availability + region column                               [large]
   │  2D  N-5 Week board — the manager's product; consumes 2C's
   │        Availability + FND-48 URL-param filters                    [2–4 wks]
   ▼
PHASE 3  Consolidation, probes & pre-go-live (§9)
   │        NS-1 evidence probe (1 wk, prices the evidence lane) ·
   │        P3-AN-1 analytics (+N-2 TCO columns, fixes FND-26) ·
   │        P3-MOB-1 admin-mobile · P3-ONB-1 contractor onboarding ·
   │        NS-13 incident log · NS-14 photo timeline · NS-2 · NS-7 ·
   │        PROD CUTOVER track (Option A, CARRY-8 backups, flag pinning)
   ▼
PHASE 4+ Triggered bets — build ONLY on the named trigger (§10)
   │        N-7 job costing · N-2 recommendation surface · N-4 dispatch
   │        ranking · N-3 nudges · MID-2 predictive maint · MID-5 day-pack ·
   │        NS-9 Shippo wiring · NS-6 farm-gate · Web Push
   ▼
PHASE X  Parked / moonshot — no design work, triggers written down (§11)
            X-1 field-ops OS · X-2 contractor network · MID-4 multi-region ·
            sample-territory shelf · unified event spine
```

### 4.1 Ordered milestone list (dependency-honest)

| # | Milestone | Depends on | Gate it clears / serves |
|---|---|---|---|
| M1 | Close `FND-6` (+ public-surface tests from `FND-45`) | — | QR capstone security gate |
| M2 | W0-8 hygiene primitives (one envelope, `withAuth`, `withIdempotency` on requests POST, claim-first, partial-uniques) | — | "~25 new routes don't copy today's gaps" |
| M3 | W0-11: my-rig→my-deployment rename + redirect + notif links; monolith split; SWR + outbox; respond-dialog extraction | — | Map deep-links; NS-10 substrate |
| M4 | **W0-10: legacy-column retirement** (readers → `deployment_assignments`, ended-roster, partial-unique, snapshot, DROP) | M2 | **Invoicing attribution gate** |
| M5 | W0-12 tail + `FND-48` URL-param filters | — | Week-board click-through; dead-end links |
| M6 | **A6 device pass** (after M1–M3 so the run isn't tainted) | M1–M3 | **THE PILOT LINE** |
| M7 | Pilot launch fortnight + NS-10 Today view + NS-5 + instrumentation | M6 | Adoption (the 90% KPI) |
| M8 | Capstone 1 Map (+ NS-4 rider after) | M3 (rename), `FND-7`✅, `FND-35` | P3-MAP contract |
| M9 | Capstone 2 QR | M1, CSP✅, rate-limits✅ | P3-QR contract |
| M10 | **Capstone 3 Time/Invoicing** (+ NS-11 + earnings view + Availability) | **M4**, `FND-8`✅ verified, M6 | P3-TIME contract; the money loop |
| M11 | N-5 Week board | M5, M10 (availability layer; degradable) | Manager's week |
| M12 | NS-1 evidence probe (1 week) | M8 (GPS pins make the bundle credible) | Prices the evidence lane |
| M13 | Phase-3 polish set (AN/MOB/ONB, NS-13, NS-14) | various, see §9 | PRD coverage + liability |
| M14 | Prod cutover (Option A) | `FND-15`✅ + `AHITS_PROD_MIGRATE_URL` secret + CARRY-8 | Go-live |

Parallelism note for a small team: M1–M5 are independent of each other and can be worked as separate PR streams; M6 blocks the pilot but not Map schema work (GPS columns can merge early — additive); M10 is the long pole and its migration should not start until M4 is **merged and verified on staging**.

---

## 5. PHASE 0 — Wave-0 completion + the pilot gate

**Objective (unchanged from workplan §6):** reach the pilot line; leave the base clean enough that ~25 new Phase-3 routes don't copy today's gaps. **Re-baselined:** §1.1's landed tranche is verified — the remaining work is below. Tags: the whole phase is **[FUN]** (trust floor) + **[TRA]** (A6) + **[SPK]** (shared primitives); the friction items are **[SIM]**.

### W0-A · Verify-the-landed (½–1 day, do first)
1. Re-test End Deployment on staging (FND-1), a transfer-then-return of a consumable (FND-2), a bulk invite end-to-end (FND-3).
2. Confirm `EMAIL_SANDBOX=true` is live on `ahits-web-app-staging` (runtime env, not just Makefile).
3. Add `prisma migrate diff --exit-code` (shadow DB) as a **standing CI guard**. The specific `FND-46` drift is already closed — migration `20260703010000_wave0_missing_indexes` (all six `photos_*_idx` + `deployment_requests_requestType_idx`) is committed and verified (§1.1) — this guard keeps the *class* of bug dead. Also decide the `EquipmentStatus.IN_TRANSIT` disposition: keep (it maps cleanly onto CONV-1's future in-transit state) or drop; recommendation is keep-with-comment.
4. Update CLAUDE.md's now-stale `FND-15` warning; record that the code half is fixed and the **only** remaining prereq is creating `AHITS_PROD_MIGRATE_URL` (prod session pooler, port 5432, IPv4) in Secret Manager before the first prod promote.
5. Sweep `invite_tokens` for legacy plaintext rows written by the pre-fix bulk path (`FND-3` residue): revoke any unhashed-token rows.

### W0-B · Close `FND-6` — the public-surface gate (2–3 days) [FUN][SPK]
The one **High** from §5.1 still open. Steps:
1. In `api/s/[token]/transition/route.ts`, resolve the link first and run `isLinkActionable` (state ∈ ISSUED/VIEWED/ACTED, not expired, not revoked) **before** the `lineId` branch; add the same predicate to the raw-SQL ownership join (`AND sl.state IN (...) AND sl."expiresAt" > now() AND sl."revokedAt" IS NULL`).
2. In `app/s/[token]/page.tsx`, replace all three `Date.now()` idempotency keys with stable content keys (`${token}:${lineId}:${action}` / `${token}:${action}` — the body-hash binding in `IdempotencyKey` already rejects divergent replays).
3. Tests (`FND-45`, highest-risk zero-coverage surface): revoked link denied per-line; expired link denied; double-tap dedupes (same key, same body → replayed response); wrong-token lineId 404s. Add `status-links`/`idempotency`/`rate-limit` lib tests and a cron-dispatcher smoke test in the same PR series.
**Acceptance:** a revoked RESERVATION link can neither confirm nor deny a line; two rapid taps produce one `RequestLineEvent`.

### W0-C · API/data hygiene primitives (W0-8 remainder; ~1 wk) [SPK][FUN]
Do these **before** capstone routes multiply the patterns:
1. **One response envelope** + `withAuth`/`withAdmin` wrapper (`FND-43`); normalize `/api/hubs` to `{data}` (`FND-33`) and guard its three consumers.
2. `withIdempotency` on `POST /api/deployment-requests` (`FND-21` — verified still missing).
3. Claim-first writes (`FND-22`): port `updateMany(... WHERE endedAt IS NULL)` to bulk disposition + end-deployment.
4. Partial-unique invariants (`FND-23`): one-active-rig-per-operator, one-open-RigVehicle-per-vehicle — ship alongside W0-D since one-active-PRIMARY is part of the retirement.
5. `createAlert(tx)` (`FND-28`); maintenance GET stops alerting-on-read + paginates (`FND-24`); `wrapWrite` coverage on `hubs/[id]` PATCH, alerts resolve, users POST (`FND-27`).
6. Decide/close the Medium UX tail that touches trust: `FND-12` toast severity, `FND-13` retire/first-stock no-ops, `FND-19` transfer-accept returns updated deployment, `FND-20` picker latch, `FND-29`–`FND-36` per register. Batch as small PRs; none is architectural.

### W0-D · Legacy-column retirement (`W0-10`) — the invoicing gate (~1–1.5 wks) [FUN][SPK]
Verified still fully open (§1.2). The **single largest data risk**; sequence exactly:
1. **Readers first:** migrate every ownership check, cron scan, feed, and the two crash-fix fallback hydrations onto `deployment_assignments` (`getActivePrimary()` finally gets its importers) + `deployment_projects`. Build the **ended-rig assignment-history roster** so ended deployments render attribution without `Rig.operatorId` (replaces the `FND-1` fallback).
2. **Writers second:** all ~8 dual-writers write assignments only; `rig_operators` and `Vehicle.assignedOperatorId` go read-never.
3. **Invariant:** one-active-PRIMARY-per-operator partial unique index (migration; the handoff table already models the pattern).
4. **Snapshot** (`pg_dump` of the three legacy columns/tables to a dated artifact), then the **irreversible `DROP COLUMN` migration** — migration lands before the code that assumes absence, per the non-negotiables; ship the drop only after invoicing's attribution reads are settled on assignments (it is acceptable to enter Phase 2C with the drop staged but unmerged; it is NOT acceptable for TimeEntry code to read the legacy column).
**Acceptance:** grep for `rig.operatorId`/`operatorId` legacy reads returns only the migration/snapshot; ending + reviewing a 2-operator deployment shows the full historical roster.

### W0-E · Consistency & freshness foundation (`W0-11`; ~1–1.5 wks) [SIM][TRA][SPK]
1. Real rename `/operator/my-rig` → `/operator/my-deployment`: route dir, component, bottom-tab label (kill the third name "Deploy"), **permanent redirect**, and the six API routes that persist `/operator/my-rig` notification deep-links (write new links to the new path; redirect covers old rows).
2. Split the `my-rig` monolith (2014 LOC / 58 useState) along its marked seams **in the same PR series but before** the data-layer swap.
3. Introduce SWR for list reads (`revalidateOnReconnect` retires the `FND-31` infinite spinners; powers a "data as of HH:MM" freshness indicator) + an itemized outbox view of the offline queue.
4. Extract the 4× respond dialog → `RespondDialog`/`useRespondAction` (`FND-43`); one `formatDate`.
**Why here:** NS-10 Today is specified as "W0-11's first consumer" — this is the substrate for Phase 1's headline.

### W0-F · Cleanup tail (`W0-12`; batchable, ~3–5 days) [SIM][SPK]
Dead code/deps (`FND-41`/`FND-42` — **including deleting `lib/shipments.ts`**, see CONV-1 for why the model stays), a11y/44px (`FND-47`), **`FND-48` URL-param filters** (not optional polish — it is the week board's click-through plumbing and unlocks ~10 dead-end links), Cloud Run flag pinning (`FND-49`), notification presentation (`FND-50` — the exception feed depends on alerts naming their subject), doc hygiene (workplan §15), `FND-17` **error tracking + request IDs** (pilot prerequisite; a Sentry-class tracker was not found in source — treat as open).

### W0-G · A6 — the pilot gate (`W0-1`)
Run the 22-row × 5-target matrix per `AHITS_A6_DEVICE_CHECKLIST.md` on real hardware (SW-drop → warm → offline ritual; overnight iOS eviction row; add-items-to-offline-rig row). Run **after** W0-B/W0-C/W0-E so a stale bug doesn't taint it. Record signed results. **Clean pass = pilot line.** [TRA][FUN]

**Phase-0 exit criteria:** A6 signed off; `FND-6` closed with tests; hygiene primitives merged; W0-D at least through step 3 with the drop staged; rename/SWR/monolith done; error tracking live; `prisma migrate diff` clean in CI.

---

## 6. PHASE 1 — The pilot as a launch + the operator's front door

North Star §7.1: adoption is decided in the pilot's first two weeks; treat it as a **launch, not a test**. This phase overlaps Phase 2A/2B calendar-wise (Map/QR are small); its bet-of-the-quarter is **the operator's day**.

### P1-1 · NS-10 — the "Today" view (1–2 wks) [SIM][FUN][SPK]
Replace the static 4-link dashboard (verified: 135-line directory) with the operator's day.
- **Schema:** none. Pure read-side assembly over `Rig`/`RigVehicle`/`DailyCheck`/`TransferRequest`/`DeploymentHandoff`/`DeploymentRequest` — every query already exists somewhere.
- **API:** one `GET /api/operator/today` aggregate (or SWR composition of existing reads — prefer the aggregate: one round-trip, one SW cache entry for offline).
- **Offline:** add the aggregate to the SW field-reads matcher (extends the `FND-34` list); render from cache with the W0-E freshness stamp.
- **UI:** current deployment + project (with `DailyCheck.site` + access notes read-only); per-vehicle daily-check state (done/due, one tap in); transfers/handoffs waiting **on me**; my open requests; (post-2C) today's clock state. One contextual primary action: before check → "Start daily check"; after → "You're set."
- **Tests:** aggregate shape; check-state derivation across `businessDate` boundaries (the `FND-7` helper is the oracle); offline render.
- **Acceptance/falsifier (from NS-10):** session analytics — if operators deep-link past Today, redesign or admit the menu was fine.
- **Friction ledger:** taps added 0 (it's the landing surface); taps removed: the morning "where am I going / did I check?" text thread.

### P1-2 · NS-5 — odometer sanity at entry (hours) [SIM][FUN]
Inline warning on `DailyCheck.odometer` (compare last known `Vehicle.odometer`; warn on decrease or implausible jump; never block). Prevents a redo-tomorrow and a phone call — passes the budget with room. Feeds CONV-6's integrity.

### P1-3 · Pilot instrumentation & operations (days) [FUN]
- Daily-check **time-to-complete** client timing (no new capture) — the leading indicator the evidence thesis rests on (11 seconds = compliance artifact; 4 minutes = health dataset).
- **N-3's variance check** (the kept slice): month-one analysis of checklist answer variance — days of work, prices every downstream analytics ambition.
- Someone watches every operator's first close-out (once 2C ships; until then, first check + first transfer).
- `FND-17` tracker dashboards watched daily; `EmailLog` FAILED rows triaged (the CONV-13 loop, human-powered for now).

**Phase-1 exit:** ≥90% of pilot operators submitting checks through the app unprompted in week 2; zero lost entries (queue outbox empty after every reconnect); Today-view engagement confirms or falsifies NS-10.

---

## 7. PHASE 2 — The contracted capstones, interleaved with the loops

Order is contractual and unchanged: **Map → QR → Time/Invoicing** (smallest → largest, max reuse). The loops decide what rides along each capstone. Build specs live in workplan §7; this section sequences the steps and binds the North-Star riders.

### 2A · Capstone 1 — Deployment Map (`P3-MAP-1…7`) · small, low risk [FUN][SPK]

Step order:
1. **Migration:** 3 additive nullable columns `DailyCheck.gpsLat/gpsLng/gpsAccuracy Float?` (mirrors `Photo.gpsLat/Lng`). Merge early — additive and safe even before UI.
2. **Capture:** `getCurrentPosition` in the daily-check `buildPayload()`; resolve-or-skip before enqueue (never block submit; denied → no coords). `FND-35` (late-response answer wipe) must be verifiably fixed first — same file, collision risk.
3. **Secrets discipline:** `AHITS_MAPBOX_TOKEN` server-side (or Docker build-arg) — a `NEXT_PUBLIC_` var would be silently undefined (`FND-49` trap); Secret Manager version ENABLED **before** the deploy that mounts it; Makefile `--set-secrets` mapping in the same change.
4. **Admin map:** Mapbox GL JS card; one pin per active deployment at latest-check coords; recency colors (green <24h / amber 24–48h / red >48h — `businessDate`-aware, which is why `FND-7`✅ gates this); tooltip deep-links to the **renamed** `/operator/my-deployment`-backed admin drawer via `FND-48` URL params. CSP `connect-src`/`img-src` for Mapbox coordinated with the (now-landed) nonce CSP in `proxy.ts`.
5. **Tests:** GPS round-trip, denied-permission submit, recency bucketing.
- **Anti-goal guard:** ~~no route history~~ → route history (last-known crew visibility) is IN scope per DECISIONS.md D2; no real-time tracking (positions from checks only, never live); operator-facing map is IN scope for the capstone per D2. GPS-on-attestation only.
- **Rider (after MAP ships): NS-4 weather stamps** (3–5 days) — nightly server job stamps deployment-day weather from the day's GPS + `businessDate`; zero operator taps; the passive-capture model. Powers CONV-4 corroboration.
- **Friction ledger:** operator taps added: 0.

### 2B · Capstone 2 — No-app QR daily-check (`P3-QR-1…5`) · small-medium [TRA][SIM][FUN]

Security preconditions: CSP ✅ landed, rate-limits ✅ landed, **`FND-6` closed in W0-B**, public-surface tests in place. Steps:
1. **Refactor first:** extract the authed daily-check side-effects (the `createAlert('DAILY_CHECK_FAILED')`/`resolveActiveAlert`/`EQUIPMENT_NOT_RETURNED` chain verified inline at `api/daily-check/route.ts:126-170`) into `lib/daily-check.ts` so the public path can never drift from the authed path.
2. **Schema decision (before migration):** `DailyCheck.operatorId` is required; a no-app submit has no user. **Decision (overridable): sentinel "external" user** over nullable. Rationale: it spares every consumer a null-branch and keeps the `(vehicleId,date,operatorId)` unique key intact — but be honest about what that key buys: with one shared sentinel it dedupes **QR-to-QR same-day resubmits only** (one anonymous row per vehicle per day). It does **not** dedupe across paths — a QR row and an authed row for the same `(vehicleId, date)` can coexist. Therefore the **missed-check resolution rule is defined here**: the `DAILY_CHECK_MISSED` cron and `resolveActiveAlert` both key on the presence of **any** `DailyCheck` row for `(vehicleId, businessDate)` — sentinel or authed, operatorId ignored for this scan — so either path resolves the alert, and a same-day QR+authed pair is not an error (surface as an info chip "checked twice", never a second interrupt). The alternative (nullable `operatorId`) trades all consumers gaining a null-branch for no cross-path gain; override only if a consumer audit says otherwise.
3. **Migration:** `StatusLink.vehicleId` subject column + index (verified absent today) + `StatusLinkType='DAILY_CHECK'`.
4. **API:** `ALLOWED_ACTIONS` entry; `applyTransition` branch calling `lib/daily-check.ts` (same alerts, same photos via the rate-limited upload path).
5. **UI:** printable per-vehicle QR (the `qrCodeId` already on `Vehicle`) → public mobile form; token treated exactly like every status-link token (256-bit, sha256-at-rest, expiry, single-use-per-day semantics).
6. **Pairing:** wire the `DAILY_CHECK_MISSED` cron so the chase email/notification includes the QR-form link (CONV-11 closes).
7. **Tests:** public handler auth-less path, idempotency dedupe, failing-check side-effects from the public path, revoked/expired token.
- **Why it matters to the loops:** the QR form is the *transferability* answer for the operator who won't install anything — the check gets captured either way, and the manager's missed-check KPI stops arguing with reality.

### 2C · Capstone 3 — Time/Invoicing/Availability (`P3-TIME-1…10`) · **THE MONEY LOOP** · large [FUN][SIM][SPK]

This capstone **is** North Star §6.2. Its definition of done includes `NS-11` (close-out ritual) and `MID-3`'s first slice (operator earnings view). Gates: **W0-D merged & verified** (attribution), `FND-8` ✅ but verified-in-staging (invoice email), `FND-7`/`FND-14` ✅ (A6-proven). No exceptions, ever (North Star §7.6).

**Step 1 — Decisions before the migration (½ day, product owner present):**
- `Settings.milesReimbursementRate` home: the PRD's `Settings` model is a **phantom** (verified: only `NotificationConfig` exists). Decide: extend `NotificationConfig` (rename-scope creep) vs. a real single-row `Settings` model (recommended — invoicing will grow more knobs: invoice numbering prefix, processor allowlist).
- Rate precedence: `OperatorRate` (per-operator, per-task-type, effective-dated) > `TaskType.defaultRate` > `User.hourlyRate` (fallback; seed it). **One resolution function, SQL-computed totals**, `validation.money()` everywhere; never JS float summing (the reports route's sin, `FND-26`).
- `TaskType` seed list — include the exception types **by design**: `Weather Delay`, `Breakdown / Repair Wait`, `No Access`, `Travel`, `Sampling`, `Maintenance`, `Training`, **`Incident`**. One-tap exception telemetry as a byproduct of pay (CONV-4/CONV-15 depend on this list). Per-type `payable`/`productive` defaults are decided with the seed (e.g. `Sampling` payable+productive; exception types payable+non-productive by default) — `payable` is the policy knob CONV-4 reads.
- **Decision (overridable): `Incident` is its own task type, not a reuse of `Breakdown / Repair Wait`** — pay continuity during an incident is liability-relevant and must stay separately auditable (CONV-15's record should not blend into mechanical downtime), and folding it into Breakdown muddies L7 telemetry and N-7's downtime story. Cost: one more row in the picker.

**Step 2 — Migration (one PR, additive):** 7 models per PRD §11.12/§18 — `TaskType` (**incl. `payable Boolean` + `productive Boolean`** — CONV-4/CONV-8 read `payable` for exception-pay policy and N-7 reads `productive` for the cost-per-sampling-day denominator; the migration must create what the flows read), `OperatorRate` (immutable rate snapshots; effective-from), `TimeEntry` (with **own `projectId` snapshot at clock-in** — rig-derived project is ambiguous under many-to-many `deployment_projects`; verified), `Expense`, `Invoice`, `InvoiceLineItem`, `Availability` (`@@unique(operatorId,date)`) + the `Settings` decision + **nullable `region` column on the money models** (MID-4's free rider). Backward-compatible; lands before any code that reads it.

**Step 3 — API routes (~8–10 new, all on the W0-C primitives):**
- `POST /api/time-entries` (clock-in/out) — **`withIdempotency` from day one**; server timestamps authoritative; client wall-clock recorded but not trusted; `businessDate` for day-bucketing.
- Clock-in flow per PRD verbatim: >48h since last → "new deployment?"; <48h → "same as last?" (yes → link + prompt the daily check before recording).
- `GET /api/time-entries` (mine / admin-filtered), missed-clock-out reconciliation report (server-side detection of open entries > N hours).
- Expenses CRUD (+ mileage using the settled reimbursement rate); Availability CRUD (operator monthly calendar; admin filterable grid "who's free next week?").
- Invoice lifecycle: generate (SQL-summed lines: time entries × resolved-rate snapshots + expenses), review, issue → **INVOICE StatusLink**: issuer + email template + `applyTransition` INVOICE branch (verified: all three absent today; the enum value alone would log events but never advance state). Recipients from a **server-side allowlist** (SSRF guard). PDF render. Back-writes: VIEWED → PAID marks with `StatusLinkEvent` audit.
- Attribution: **every** entry resolves operator/deployment via `deployment_assignments` (`getActivePrimary()` becomes load-bearing at last) — never legacy columns.

**Step 4 — Offline:** clock writes ride `useOfflineQueue.mutate()` + idempotency; 401-parking (✅) protects the >24h case; generalize the C1 `pendingByEndpoint` queued-state to clock-in/out (extends `FND-32`'s idiom); the Today view shows queued clock state explicitly ("clock-out saved, will sync").

**Step 5 — UI, operator (the loop half):**
- Clock-in from Today (contextual primary action after the check).
- **Task-type picker with exception states one tap deep** (§3's friction rule; the telemetry byproduct).
- **NS-11 close-out ritual as clock-out:** confirm hours → surface unfinished items (check missing? transfer pending? item flagged?) as **optional one-tap fixes, never blockers** → "Day closed — you logged 9.5 h." Designed in now (~zero marginal); a week of retrofit later.
- **MID-3 earnings view (in the DoD):** my hours this week/period, resolved rate, expenses, invoice status, "you've earned $X this period" — visible money is the retention engine.
- Availability: monthly calendar, tap-to-toggle.
**UI, admin:** time review/approval (approve-before-invoice), invoice pipeline (draft → issued → viewed → paid, with `EmailLog` + StatusLink state inline), availability grid, missed-clock-out exceptions.

**Step 6 — Tests:** rate resolution ×3 sources; duration/total math (SQL vs fixture); offline clock round-trip incl. replay dedupe; invoice email retry/log path; attribution against a transferred + handed-off deployment (the CONV-7 hard case); close-out with every combination of unfinished items.

**Acceptance:** one pilot payroll period runs end-to-end — clock → approve → invoice → emailed → PAID — with **zero manual corrections**; an operator can answer "how much did I earn this week?" from their phone in ≤2 taps.

### 2D · N-5 — the week board (2–4 wks honest) [SPK][SIM-for-managers]

The manager's product; the convergence surface §8 pivots on. After `FND-48` (URL-param filters) and ideally after 2C (availability layer — but the board **degrades gracefully, and honestly**: build may start the moment 2C's migration lands if the quarter needs parallelism, but **v1 ships L1–L5 + L8–L9 only**, whose sources exist today. **L6 (Availability) and L7 (exception days) have no rows until 2C is operationally live and adopted** — weeks after its migration — so they light up as a fast-follow, not as v1 scope).
1. **Schema:** none. Read-only over `Rig.startedAt/endedAt`, `DeploymentRequest.neededBy`, `MaintenanceTask.nextDue`, `Vehicle.rentalStartDate/rentalEndDate`, `Project.startDate/endDate`, `TransferRequest`/`DeploymentHandoff` pending, `Availability` (post-2C), missed-check flags (cron output).
2. **API:** one `GET /api/week-board?start=` aggregate returning rows (deployments) × days with typed annotations (see §8.0 layer registry).
3. **UI:** timeline grid, deployments as rows, days as columns; annotation chips per §8.0; every chip **click-through via URL-param filters** to the owning page (no new detail surfaces — the board is a lens, not a copy).
4. **Anti-goal guard:** no drag-to-reschedule, no auto-assignment, v1 read-only. Dispatch ranks (later, parked N-4); humans schedule.
5. **Tests:** aggregate windowing across `businessDate` boundaries; annotation derivation fixtures.
**Falsifier (N-5's own):** if the ops lead's Monday still starts in a spreadsheet after a month — interview, iterate, or stop.

---

## 8. ★ THE INTEGRATION MATRIX — the conversations

**This is the owner's centerpiece requirement: integration designed, not accidental.** Sixteen end-to-end flows (`CONV-#`), each specified as *trigger → what fires → what records update → where it surfaces for the operator AND the manager*. The design rule they all obey is the fourth original goal — **everything speaks to everything else**: one field event should never need re-entry to become legible in a second subsystem, and no subsystem may terminate a flow into a dead end (a record no surface reads).

### 8.0 The convergence point — week board layers, exception feed taxonomy, reports

Every conversation below terminates (for the manager) in one of three surfaces. Specifying them once keeps sixteen flows from inventing sixteen dashboards:

**The week board (N-5) — layer registry.** Each layer is a typed annotation on a deployment-row × day-cell (or a hub lane at the bottom):
| Layer | Source of truth | Feeding conversations |
|---|---|---|
| L1 Deployment bars | `Rig.startedAt/endedAt` | CONV-7 |
| L2 Maintenance due | `MaintenanceTask.nextDue/nextOdometer/status` | CONV-5, CONV-6 |
| L3 Rental windows | `Vehicle.rentalStartDate/rentalEndDate` | CONV-2, CONV-12 |
| L4 Request deadlines | `DeploymentRequest.neededBy` + request status (**v1**; the logistics-ETA breach derivation joins post-NS-9 — see CONV-1) | CONV-1 |
| L5 Missed/failed checks | cron scan + `DAILY_CHECK_FAILED/MISSED` alerts | CONV-11, CONV-5 |
| L6 Availability (post-2C **adoption**) | `Availability` | CONV-10, CONV-3 |
| L7 Exception days (post-2C **adoption**) | `TimeEntry.taskType` ∈ exception types | CONV-4, CONV-15 |
| L8 In-transit / awaiting receipt | HUB_RETURN links + (triggered) `Shipment` | CONV-1, CONV-5, CONV-16 |
| L9 People events | assignments started/ended, handoffs pending | CONV-3, CONV-7 |

> **Board v1 scope = L1–L5 + L8–L9** (every source exists today). **L6/L7 have no rows until 2C is operationally live and adopted** — a migration creates tables, not data — so they light up as a fast-follow, not as v1 scope. Demand/procurement (CONV-9/NS-7) is deliberately **not** a layer: the registry stays closed at nine; demand truth lives in Reports.

**The exception feed** = the existing bell + alert pipeline, finished: `FND-50` naming (every alert says *who/what*), `FND-37` cron-side not-returned scan, dedupe via `Alert.activeKey` (✅ in schema). Taxonomy: it carries **interrupts** (act today: failed check, damage, missed check, lockout, low stock, overdue maintenance, incident, invoice-email FAILED); the board carries **schedule truth**; reports carry **aggregates**. A conversation may post to more than one, but each destination answers a different manager question ("what needs me now?" / "what is this week?" / "what happened this month?").

**Reports** = the shipped Equipment Cost & Utilization scoreboard, upgraded by `P3-AN-1` (SQL aggregation, `FND-26`) and extended by the costing conversations (CONV-2/8) with `FND-40` fixed so exports agree with the view.

---

### CONV-1 · Material request ↔ hub fulfillment ↔ transfer/shipment ↔ arrival receipt *(the Shippo conversation)*
**Serves:** [SPK][FUN] · **Phases:** request/fulfillment loop live today; receipt loop W0-9 ✅; `Shipment` wiring is Phase 4+ (NS-9 trigger) — **designed here so the trigger costs days, not a redesign.**
**Trigger:** an operator (or admin) submits a MATERIAL `DeploymentRequest` with `RequestLine`s the assigned hub cannot fill (insufficient `InventoryStock.quantity - reservedQty` at `fulfillerHubId`).
**The chain:**
1. Request → `REQUESTED`; RESERVATION-style hub portal link (`StatusLinkType='RESERVATION'`) or admin console shows per-line stock at the hub (`lib/inventory-stock`).
2. Hub can't fill line → per-line `DENY`/`EDIT` (`RequestLineEvent` audit) → request `FORWARDED` to a second hub **or** the line becomes a procurement/transfer decision:
   - **Hub-to-hub restock:** admin moves stock (`inventory/[id]/stock` Move Stock) — today an instantaneous ledger move with no in-transit state; **post-trigger**, a `Shipment` row (`deploymentRequestLineId` FK, `hubId` = destination) carries carrier/tracking, and the stock move happens at **receipt**, not at label creation (CONV-16 integrity rule).
   - **Inbound purchase:** `NEW_PURCHASE` line + `reorderUrl` → ordered outside AHITS → arrival = stock increment at the hub (CONV-9 closes the forecast loop).
   - **`SHIPPING_LABEL` line** (schema-verified: `shipToHubId`/`shipToAddress` + hub postal fields exist for exactly this): return-shipping for a unit; post-trigger, label creation writes `Shipment.labelUrl/trackingNumber`.
3. Fulfillment status reflects logistics: line `fulfilledQty` set on claim (hold-through-claim `heldQty/claimedQty` ✅ in schema); request → `FULFILLED` when every line is terminal.
4. **Arrival closes the loop:** physical receipt at the hub = the W0-9 receipt motion (HUB_RETURN link Mark-received or the hub Inbound admin action ✅ landed) → stock/unit status updated → sibling links completed (✅) → post-trigger, `Shipment.status=DELIVERED` reconciled against the receipt (a DELIVERED shipment with no receipt within 48h = an exception-feed interrupt: "carrier says delivered, hub hasn't confirmed").
**Operator sees:** request status chips (REQUESTED → STAGED/FORWARDED → FULFILLED) on Today/Requests; "your resupply arrives ~Thu" once `estimatedDelivery` exists (post-trigger).
**Manager sees:** board L4 chip on `neededBy` day — **L4 v1 derives from `neededBy` + request status only**, both present today. The red "logistics ETA > `neededBy`" breach is an explicit **post-NS-9 enhancement**, not part of L4's v1 definition: it needs `Shipment.estimatedDelivery`, which only populates once the Shippo trigger fires (Phase 4+), while the board itself is Phase 2D — still the one derived signal worth computing when the data arrives. Also: L8 in-transit lane (post-trigger); exception feed on DENIED lines, delivery-without-receipt, and `neededBy` breach; Requests page remains the workbench (click-through).
**Build notes & gaps:** the request pipeline and the receipt loop already interlock through `StatusLink`; the **only missing vertebra is the in-transit segment**, which is exactly the dormant `Shipment` model. Resolution of the workplan/North-Star tension (`CARRY-13` "wire or delete" vs NS-9 "default delete"): **delete the dead `lib/shipments.ts` (zero importers, FND-41), keep the `Shipment` table dormant** (costs nothing, resurrectable by migration history either way, and this CONV is its wiring spec). Trigger to build: **>5 real carrier shipments in a month** — when it fires, the build is: tracking-number entry field on the request line + hub Inbound, a poll/webhook updating `ShipmentStatus`, the L8 lane, and the receipt reconciliation interrupt (~1–2 wks).

### CONV-2 · Rentals ↔ fleet P&L *(the buy/rent/idle/retire conversation)*
**Serves:** [SPK] money-visible · **Phases:** cost columns Phase 3 (`P3-AN-1` + N-2's kept half); recommendation surface Phase 4+ (trigger: the columns demonstrably get read).
**Trigger:** a rental `Vehicle` exists (`isRental=true`) — it is already first-class (daily checks, maintenance, deployment assignment, transfers, reports all just work; schema comment says exactly this).
**The chain (exact fields):**
1. Cost normalization: `rentalCostAmount` × `rentalCostPeriod` (DAY|WEEK|MONTH|FLAT) ÷ period-days → **$/day**, accrued over `rentalStartDate→min(rentalEndDate, today)`; FLAT amortized across the window. Computed in SQL inside the `P3-AN-1` aggregation (`FND-26` fix).
2. TCO per vehicle = rental accrual (rentals) or maintenance `actualCost` Σ + (owned) acquisition amortization if/when captured, + damage-repair costs (CONV-5) — one `vehicle_cost_daily` view/CTE both Reports and (later) N-7 read, so the two never disagree.
3. Utilization from `RigVehicle.addedAt/removedAt` overlap-days ÷ window (the >100% bug dies in the same SQL rewrite).
4. **The nudge (N-2's kept slice):** `isRental=true AND active-on-a-rig` vehicle of type T while an owned type-T vehicle sits idle (no open `RigVehicle`, status ACTIVE) → one Reports/board callout: "Rental Polaris active ($95/day) while owned Polaris #2 idle at Hub X — $665 this week."
5. **Phase-4+ recommendation** (parked, trigger-gated): rent-vs-buy break-even from accrued rental $/day vs owned TCO $/day; retire candidate = owned TCO/day rising + utilization falling.
**Operator sees:** nothing (cost is admin-only — `FND-25`'s rule: strip `rentalCostAmount`/`rentalAgreementUrl`/VIN/insurance from operator-visible vehicle payloads; verify the strip landed before 2C multiplies exposure).
**Manager sees:** board L3 rental-window bars (return date approaching = amber, CONV-12); Reports TCO columns + the idle-vs-rental nudge; exception feed only for CONV-12's expiry interrupts.
**Friction ledger:** operator taps added 0 — the whole conversation is admin/read-side.
**Gaps:** owned-vehicle acquisition cost has no field today (TCO for owned = maintenance-only until one is added — flag in `P3-AN-1`; nullable `Vehicle.acquisitionCost/acquiredAt` is the additive fix).

### CONV-3 · Operator lifecycle ↔ manager-legible reporting *(onboard → visible everywhere → offboard)*
**Serves:** [SPK][FUN] · **Phases:** invite loop live (`FND-3` ✅); self-onboarding polish Phase 3 (`P3-ONB-1`); offboarding checklist Phase 4+ (North Star: "when churn actually bites").
**The chain, onboarding:**
1. Admin invite (single or bulk) → hashed `InviteToken` → email (now `EmailLog`-audited) → validate/complete → `User` with `mustChangePin` → first login forces PIN set (trivial-PIN rejection ✅ via pin-hardening); `homeHubId` set at invite (availability/dispatch geography).
2. First assignment: admin New Deployment or transfer-accept/handoff → `DeploymentAssignment(PRIMARY, startedAt)` (post-W0-D the only write path) → the operator **appears simultaneously**: board L1 (their deployment row) + L9 (assignment-started chip), availability grid (post-2C; empty = "not yet submitting"), Users/Team, and — post-2C — the earnings/time review pipeline from their first clock-in.
3. `AccountAuditLog` rows (INVITE_SENT, first login) give the manager the onboarding funnel: invited → activated → first check → first clock — **surface as a simple "new operator" card in Users**, not a new page.
**The chain, offboarding:** suspend (`isActive=false`) + force-logout (`tokenVersion` bump — kills the PWA JWT within a request) → **gear reclaim via custody**: their open `KitItem`s/`RigVehicle`s enumerated from the active rig → transfer to a successor (CONV-7) or end-deployment with HUB_RETURN links per unit → hub receipt (W0-9 ✅) closes each — the reclaim checklist is *a filtered view of records that already exist*, which is why the North Star prices it at days. Open `TimeEntry`s flush through the normal approve→invoice path (final paycheck; CONV-8). `DeploymentAssignment.endedAt` written; history immutable.
**The chain, auth interrupts (mid-lifecycle):** a PIN lockout mid-deployment is an *operational* event, not just a security one — a locked-out operator in the field can't check, clock, or receive. `PIN_LOCKED` already fires into the exception feed; finish its legibility: the interrupt names the operator **and their active deployment** (`FND-50` naming), the resolution path is the admin PIN-reset (`mustChangePin` re-arms on next login), and post-2B the chase can carry the vehicle's QR check link so the day's check isn't lost while auth is down. The offline queue's 401-parking (✅) already guarantees their un-synced work survives the lockout.
**Manager sees:** exception feed — PIN_LOCKED (exists), invite-expired-unused (add: cheap cron over `InviteToken.expiresAt/usedAt`); board L9 chips; the offboard checklist card until every unit is receipted ("2 units still with J. Doe — 1 awaiting hub receipt").
**Friction ledger:** operator taps added 0 to the daily loop (onboarding is one-time; offboarding is admin-driven); removed: the "who still has our gear?" call at offboard and the "are you locked out?" text at lockout.
**Gaps:** the onboarding-funnel card and invite-expiry sweep are small adds (Phase 3, inside `P3-ONB-1`); everything else exists.

### CONV-4 · Rain delay ↔ reporting *(one event, many legible destinations — the flagship "speaks-to" flow)*
**Serves:** [SIM][SPK] · **Phase:** 2C (task types) + 2A rider (NS-4) + 2D (board).
**Trigger:** weather makes the day unworkable. The operator does **one thing**: clocks time with task type **Weather Delay** (one tap deep in the picker — a 2C design requirement, §7 Step 1). No day-status feature, no incident form, no text to the office (North Star §3's worked example: `TaskType` already encodes it, and it *pays them*, so it gets logged).
**What fires from that single tap:**
1. `TimeEntry(taskType=WEATHER_DELAY, projectId snapshot, rate snapshot)` → the operator is **paid** for the covered delay (policy knob: which exception types are payable — a `TaskType.payable` boolean, decided in 2C Step 1).
2. **NS-4 corroboration:** the nightly weather-stamp job already stamped that deployment-day from GPS + `businessDate` → the delay claim carries independent evidence → **approval is faster, not slower** (evidence visibly benefits the provider — North Star §3.4).
3. Downstream, zero extra writes: board **L7 exception chip** on that deployment-day ("⛈ weather day, 2 rigs"); the manager's Friday time-review shows the entry pre-corroborated (auto-flag *mismatches* — weather-delay claim on a clear-stamped day — as the exception, not every claim); cost reports bucket delay hours as non-productive labor on the project (N-7's cost-per-*sampling*-day denominator excludes L7 days — a definitional decision to write into N-7); the operator's earnings view shows the paid delay line.
**Operator sees:** clock entry + "covered" state in earnings. **Manager sees:** L7 chip → click-through to the day's entries; weekly report "2 weather days this week, $X labor" — and nothing in the exception feed unless corroboration mismatches (interrupt only on anomaly).
**Friction ledger:** taps added 1 (the task-type pick inside a clock action the operator already performs — and it pays them); removed: the "rained out today" text and the office's follow-up call.
**Gaps:** all of this is configuration of 2C + the NS-4 rider + one L7 derivation — **zero net-new models**; the conversation exists to keep it that way.

### CONV-5 · Equipment failure ↔ reporting *(the full chain: check → damage → repair → cost → reliability → parts)*
**Serves:** [FUN][SPK] · **Phases:** steps 1–6 live today; costs into TCO Phase 3; reliability signal Phase 4+ (N-3 trigger); ship-to-repair segment joins CONV-1's Shipment trigger.
**The chain:**
1. Daily check item = "no" → `passFail=false` → `DAILY_CHECK_FAILED` alert (verified inline; extracted to `lib/daily-check.ts` in 2B) → exception feed interrupt naming vehicle + operator (`FND-50`).
2. Damage report: `MaintenanceTask(isDamageReport=true, repairType, resolutionPath, photos)` — from the check flow or scan; photos carry GPS (dispute evidence, CONV-14).
3. Triage: admin inoperable-review; `resolutionPath` IN_FIELD | HUB | SHOP answers "where is it?" (the zero-lost->24h KPI).
4. Repair logistics: AT_SHOP → **WORK_ORDER StatusLink** to the shop (issue→VIEWED→ACTED→COMPLETED with `invoiceNumber` — `FND-36`'s up-front label fix applies); SHIP_FOR_REPAIR → today a manual note; **post-CONV-1-trigger** a `Shipment(maintenanceTaskId)` leg out and back, with `repairMethod`/`returnDestinationType/Id` (✅ in schema) deciding the return leg's destination.
5. Cost lands: `actualCost` (+ `purchaseOrder`/`invoiceNumber`) on completion → CONV-2's TCO view → per-vehicle/per-unit repair spend → the 25%-repair-spend KPI and the retire-candidate signal.
6. Meanwhile the vehicle/unit is OUT: `VehicleStatus.IN_MAINTENANCE` / unit `INOPERABLE` → board L2 annotation on affected deployment-days ("truck in shop through Thu"); if the rig is blocked, the manager stages a replacement via CONV-1 (request) or CONV-7 (transfer) — click-through from the same chip.
7. **Parts:** repair consumes parts → hub `InventoryStock` decrement → `LOW_INVENTORY` alert → `reorderUrl` one-click or MATERIAL request → CONV-1/CONV-9. (Parts consumption today is a manual stock adjustment — an acceptable manual vertebra; a `MaintenanceTask ↔ parts` join is **not** planned. Anti-bloat.)
8. **Reliability exhaust (Phase 4+, N-3 trigger):** failure-item frequencies per vehicle/model from `checklistJson` variance — only after the pilot variance check proves the data is alive.
**Operator sees:** damage report status on Today ("your drill: at shop, back Thu" — read-side add in 2D's timeframe); repair-wait hours clocked under the Breakdown task type (paid; CONV-4's sibling).
**Manager sees:** interrupt (failed check → damage) → board L2 (due/out windows) → Reports (spend by vehicle) → the same story at three zoom levels without re-entry.

### CONV-6 · Odometer → mileage maintenance → scheduling *(the quiet loop that keeps trucks alive)*
**Serves:** [FUN][SIM] · **Phase:** live today (`P3-MAINT-1` shipped); NS-5 hardens it in Phase 1.
**The chain:** `DailyCheck.odometer` (one field the operator fills anyway) → NS-5 sanity check at entry (P1-2) → `Vehicle.odometer` current → `MaintenanceTask(intervalType=MILEAGE)` compares `nextOdometer` → status flips DUE_SOON/OVERDUE → cron alert (dedup via `activeKey`) → board L2 + exception feed → completion writes `lastOdometer`/`lastCompleted`, rolls `nextOdometer` forward → (parts → CONV-5 step 7).
**Manager sees:** L2 chips positioned on the *forecast* day (compute a projected due-date from average miles/day — a derived read in the board aggregate, no schema); "oil change due in ~300 mi ≈ Thursday" is the board's cheapest high-value annotation.
**Operator sees:** nothing new — one existing field, one passive warning. The friction budget's model citizen.
**Anti-goal guard:** the projected due-date is a **read-only annotation** — it never writes a schedule, books a shop, or creates a task; the board forecasts, humans schedule.
**Gap:** none blocking; the projected-due derivation is a Phase-2D nicety.

### CONV-7 · The deployment lifecycle end-to-end *(request → stage → deploy → checks → transfers → end → receipt → evidence)*
**Serves:** all four goals; this is the app's spine and §8's reference flow.
**The chain, with its owner at each step:**
1. **Request** (operator or admin): RESERVATION `DeploymentRequest` + lines (`neededBy`, project, `forOperatorId`) → hub portal link.
2. **Stage** (hub): per-line confirm/edit/deny (`RequestLineEvent`); stock held (`heldQty`, `InventoryStock.reservedQty`); units resolved (`resolvedUnitId`, `stagedCondition` door-side check).
3. **Deploy** (operator): rig created (or 409-guarded offline create); `RigVehicle` (+note+photos), `KitItem` with `drawnQuantity/drawnHubId` (✅ transfer-safe), claims release holds (`claimedQty`); `DeploymentAssignment(PRIMARY)` written (post-W0-D, the only truth).
4. **Run** (operator): daily checks (+GPS post-2A) per vehicle; CONV-4/5/6 fire as life happens; (post-2C) time entries accrue with project snapshots.
5. **Reshape** (operators): `TransferRequest` moves vehicles/kit-slices between rigs (stock-safe ✅); `DeploymentHandoff` moves PRIMARY (assignment history records both) — **attribution for time/costing survives every reshape because it reads assignments, never the rig row** (the whole point of W0-D).
6. **End** (operator or admin): dispositions per item (return-to-hub → HUB_RETURN links; keep; consume); `endedAt` claim-first (`FND-22`); ended roster renders from assignment history (no legacy fallback post-W0-D).
7. **Receipt** (hub): Inbound mark-received / portal link → unit AVAILABLE at hub, consumables restored to `drawnHubId` stock (✅), siblings completed (✅).
8. **Evidence** (system): the deployment's bundle already exists as rows — checks+GPS+photos, custody trail (`CheckLog`), transfers, weather stamps, time entries, costs. **NS-1's probe is "render this as one artifact"** — one week, read-side (Phase 3), and it prices the evidence lane.
**Operator sees:** each step is their existing flow; Today (NS-10) strings them into a day.
**Manager sees:** L1 bar from `startedAt`; L4 before it (request staging); L9 on reshapes; L8 at the end (receipts pending); the drawer remains the detail surface. **A deployment is never invisible between steps** — that is this CONV's acceptance test.

### CONV-8 · Time → earnings → invoicing → deployment profitability *(the money conversation)*
**Serves:** [FUN] trust, [SPK] · **Phases:** 2C, then N-7 v1 Phase 4 (trigger: a season of believed actuals).
**The chain:** `TimeEntry` (rate snapshot, projectId snapshot, taskType) → operator **earnings view** (real-time, pre-approval, clearly labeled "pending approval") → admin approve → `Invoice` + `InvoiceLineItem` (SQL-summed) + `Expense`s (mileage at the settled rate) → INVOICE StatusLink emailed (allowlist; `EmailLog` audited; FAILED → interrupt, CONV-13) → VIEWED/PAID back-writes → **labor cost per deployment/project** joins CONV-2's equipment TCO share + consumable draw (`KitItem.drawnQuantity` × `InventoryItem.unitCost`) → **N-7 v1: one number on the Project page** — "$X per sampling day (n=23)" (L7 days excluded from the denominator per CONV-4).
**Operator sees:** earnings now; invoice status ("issued Tue, viewed Wed, paid Fri") — visible money = retention.
**Manager sees:** Friday close-the-week: time-review queue (anomalies pre-flagged: missed clock-outs, corroboration mismatches, >12h days) → approve → invoice pipeline → Reports project-cost line. **One bad paycheck outweighs a season of dashboards** — the zero-exception gates (W0-D, FND-7/8/14) exist for this CONV.

### CONV-9 · Demand exhaust → procurement forecast *(never discard exhaust)*
**Serves:** [SPK] · **Phases:** capture is live today (free); the NS-7 view is Phase 3-adjacent (3–5 days, a **Reports annotation** — not a page, not a board layer); forecasting proper Phase 4+ (MID-2's gate).
**The chain:** every MATERIAL request line, every `NEW_PURCHASE` free-text line, every DENIED line (hub couldn't fill — **unmet demand**, the most valuable rows), every `LOW_INVENTORY` alert, every `drawnQuantity` draw → all already persisted with timestamps and hubs. NS-7 = a read-side rollup: consumption velocity per item×hub (`drawnQuantity` over time), request frequency, deny rate → "Hub X runs out of core bags ~every 3 weeks; 2 denials last month" → `reorderUrl` one click away (field exists on both `InventoryItem` and request lines).
**Manager sees:** a **Reports/Inventory annotation only — deliberately not a board layer** (the L1–L9 registry stays closed; the underlying request's own `neededBy` already surfaces on L4 via CONV-1, and "resupply lead time exceeds next `neededBy`" reads as a line in the demand rollup, not a chip). **Operator sees:** fewer denied requests — the flow's entire point.
**Guard:** no auto-ordering, no min/max engine (anti-bloat); AHITS forecasts, humans buy.

### CONV-10 · Availability → week board → dispatch *(ranks, never schedules)*
**Serves:** [SPK] · **Phases:** Availability 2C; board layer 2D; ranking Phase 4+ (N-4 trigger: board shipped **and** staffing observed flowing through AHITS).
**The chain:** operator taps unavailable days (monthly calendar, 2C) → `Availability(@@unique(operatorId,date))` → admin grid "who's free next week?" → board L6 (thin per-operator strip or roll-up count per day) → gap signal: deployment-day with zero available assigned operators = L6 warning → (post-N-4-trigger) ranked *suggestions* — availability + `homeHubId` proximity + current assignment — surfaced as a chip list the human picks from. **Never auto-assigned.**
**Operator sees:** their calendar; (post-N-4) nothing — ranking is manager-side by design (crew-visibility was declined, North Star §4).
**Anti-goal guard:** the gap warning and any future ranking are **read-only annotations — they never write an assignment, hold a slot, or block a save**; the board forecasts, humans schedule.
**Friction ledger:** taps added: monthly tap-to-toggle calendar (not daily-loop); removed: the "are you free next week?" text-thread roundtrip.

### CONV-11 · Missed daily check → the chase → the QR fallback *(the compliance KPI's closed loop)*
**Serves:** [TRA][SIM] · **Phases:** cron live (✅ `businessDate`-correct); QR pairing 2B; board flag 2D.
**The chain:** cron dispatch scans expected-but-absent checks per `businessDate` + cutoff (`NotificationConfig.dailyCheckCutoff`) → `DAILY_CHECK_MISSED` alert (named per `FND-50`) → admin bell/email — **and the chase carries the fix**: the notification includes the vehicle's QR daily-check form link (2B), so the resolution of "operator didn't use the app" is a form that needs no app. Late/QR submission → alert auto-resolves (`resolveActiveAlert` pattern ✅) → board L5 flag clears — per 2B's resolution rule, the scan and the resolver key on **any `DailyCheck` row for `(vehicleId, businessDate)`**, sentinel or authed, so a QR check and an app check each clear the same flag and a same-day pair never fires a second interrupt.
**Operator sees:** Today shows check-due state *before* the cutoff (NS-10 prevents the miss); the QR form catches the operator who won't install.
**Manager sees:** L5 flags; the 95%-on-time KPI trend in Reports; interrupts only after cutoff. Prevention (Today) → detection (cron) → recovery (QR) → measurement (Reports): one KPI, four subsystems, zero re-entry.
**Friction ledger:** zero required taps added for app users (Today's due-state is passive); for the no-app operator the QR form replaces the "did you check the truck?" phone chase.

### CONV-12 · Temporal compliance edges — insurance, registration, rental windows
**Serves:** [FUN] · **Phase:** alerts exist (`INSURANCE_EXPIRING`/`REGISTRATION_EXPIRING`); rental-end alert + board layer are small 2D adds.
**The chain:** `Vehicle.insuranceExpires/registrationExpires/rentalEndDate` → cron threshold alerts → exception feed; board L3 draws the rental bar ending mid-deployment (**the visual that actually changes decisions**: "rental ends Wednesday, deployment runs to Friday — extend or swap") → extend (edit `rentalEndDate`; CONV-2 accrual follows automatically) or swap (CONV-7 transfer). `rentalOneWay`/`rentalReturnLocation` inform the return errand.
**Gap (resolved — schema verified this session):** **no rental-end `AlertType` exists.** The enum carries exactly ten values (`MAINTENANCE_OVERDUE`, `EQUIPMENT_NOT_RETURNED`, `DAMAGE_REPORTED`, `LOW_INVENTORY`, `INSURANCE_EXPIRING`, `REGISTRATION_EXPIRING`, `PIN_LOCKED`, `MATERIAL_REQUEST`, `DAILY_CHECK_FAILED`, `DAILY_CHECK_MISSED`) — nothing rental. The add is one additive enum value (`RENTAL_ENDING`) + one cron threshold case off `Vehicle.rentalEndDate`, shipped with 2D's L3 layer.

### CONV-13 · The external-party conversation — StatusLink lifecycle + EmailLog *(did they get it, see it, act?)*
**Serves:** [FUN][SPK] — the meta-conversation every external flow (shop, hub, processor, QR) rides on.
**The chain:** issue link (revoke-prior ✅) → `EmailLog` SENT/FAILED/SKIPPED with attempts (✅) → FAILED = **interrupt** ("invoice #123 email failed twice — resend?") with one-click reissue+copy (✅ on hub Inbound; **generalize the affordance to WORK_ORDER and INVOICE surfaces in their capstones**) → `VIEWED` timestamp answers "did they see it" (surface as chips: sent ✓ / delivered ✓ / viewed ✓ / acted ✓ on request drawers, maintenance drawers, invoice pipeline) → `ACTED`/`COMPLETED` back-write the domain record → `EXPIRED` sweep (cron; part of FND-9's tail) keeps pending counts honest.
**Manager sees:** per-record chips, `/api/admin/email-log` as the audit backstop, feed interrupts only on FAILED/expiring-unviewed. **This CONV is why no external flow ever needs a phone call to confirm receipt — the app answers it.**

### CONV-14 · Photo exhaust → disputes & training *(NS-14)*
**Serves:** [SPK] cheap · **Phase:** 3 (3–5 days when adjacent work is open).
**The chain:** photos already captured at five contexts with GPS + thumbnails (verified) → NS-14 read-side timeline filterable by vehicle/unit/deployment/context → damage disputes settle by scrubbing condition-over-time (operator-exculpatory by design — evidence benefits the provider); "what a correctly-loaded trailer looks like" becomes onboarding material (CONV-3). **Gap:** none but the UI; `CARRY-5`'s fine-print conformance check rides this build.

### CONV-15 · Incident → day status → pay → posture *(NS-13)*
**Serves:** [FUN] liability · **Phase:** 3 (1–2 wks; the one legal-shaped gap — schema-verified: no noun for "someone got hurt").
**The chain:** operator taps "report incident" (Today's overflow — present but not prominent) → `Incident(type INJURY|NEAR_MISS|PROPERTY|OTHER, narrative, photos via the Photo pattern, parties, timestamps, deployment/vehicle links)` — append-only like the house's other logs → **immediate interrupt** to admins (new `AlertType.INCIDENT`) + admin `acknowledgedAt` → the interrupted day's hours ride CONV-4's mechanics (the dedicated **`Incident` task type seeded in 2C Step 1** — payable, non-productive; pay is not interrupted by the incident report; see the seed-list decision there) → board L7 marker → insurance/counsel export = print view, **not** an OSHA workflow engine (hard stop; ask whoever holds the insurance relationship before any growth — their answer also prices it).
**Steps:** migration (Incident + enum) → `POST/GET /api/incidents` (operator create incl. offline-queued; admin list/ack) → operator form (≤5 fields + photos) → admin surface + ack → tests (offline round-trip, ack flow, append-only).
**Friction ledger: exempt** under §3's exemption clause — incident capture is rare, liability-driven, and replaces nothing in the daily loop, so it is not paid for in taps; the ≤5-field form is still the design ceiling.

### CONV-16 · The stock ledger — one inventory truth *(the conversation underneath CONV-1/5/7/9)*
**Serves:** [FUN] — phantom stock is the inventory version of a wrong paycheck.
**The invariant:** every consumable movement is a balanced entry against `InventoryStock(itemId, hubId)`: checkout draws (`drawnQuantity/drawnHubId`) ⇄ returns restore exactly-what-was-drawn to where-it-was-drawn (✅ incl. across transfers post-FND-2); holds reserve (`reservedQty`) ⇄ claims/releases zero them (`claimedQty/releasedAt` ✅); hub-to-hub moves decrement source and credit destination **at receipt** once in-transit exists (CONV-1).
**Scope decision (overridable): internal-ledger reconciliation only.** CONV-16 audits the ledger against itself — Σ(open `KitItem.drawnQuantity`) + on-hand `quantity` + `reservedQty` (+ in-transit once it exists) per item×hub, cross-checked against the movement history — so any imbalance is a bug or an unrecorded movement, catchable with **zero physical counting**. Counted-vs-expected shrinkage is **out of scope**: `InventoryStock` has no `expectedQuantity` field and no count-capture model exists (schema-verified), and promising an audit of physical reality with no capture path is bloat. If ops later wants cycle counts, that is an explicit additive schema item (a `StockCount` entry model + `expectedQuantity`) with a named owner — parked, not implied.
**Build items:** `FND-13` first-stock affordance + real Retire semantics; a periodic **drift report** (the reconciliation above, per item×hub, against the ledger's own movement history) — a Phase-3 read-side query that would have caught FND-2 in week one, and the standing regression harness for every future stock-touching feature.
**Manager sees:** Inventory page truth + drift report; `LOW_INVENTORY` interrupts. **Operator sees:** stock numbers they can trust when composing requests (`FND-20`'s picker fix).

---

## 9. PHASE 3 — Consolidation, probes & pre-go-live

One-bet-per-quarter discipline: the headline bet here is **the evidence probe**; the rest are small, mostly read-side, and slot around it.

| Item | What & steps | Size | Gates/notes | Goals |
|---|---|---|---|---|
| **NS-1 evidence probe** | Render CONV-7 step 8 as one artifact (per-deployment bundle: checks+GPS, custody, photos, weather, time, costs); put it in front of whoever faces auditors + the sample-system owners; **obey the answer** (want it → evidence lane earns a quarter incl. NS-3 after asking the science side; shrug → lane collapses to passive capture permanently) | 1 wk | After 2A (GPS makes it credible) | [SPK] |
| **P3-AN-1 analytics** | Push aggregation into SQL (fixes `FND-26`, >100% utilization, unweighted averages); spend-trending + prediction nudge; **N-2 TCO columns** (CONV-2 steps 1–4) incl. the idle-vs-rental nudge; fix `FND-40` export/filter agreement; add `Vehicle.acquisitionCost` (additive) if owned-TCO is wanted honest | 1–2 wks | — | [SPK] |
| **P3-MOB-1 admin-mobile** | Card fallbacks for 13 raw tables at `xs`; fix the two 560/540px drawers that clip at 390px **first** (reachable by operators); URL-param filters already in from W0-F | 1–2 wks | after `FND-48` | [TRA] |
| **P3-ONB-1 contractor self-onboarding** | Invite→self-serve flow polish (`FND-3` ✅); `mustChangePin` gate ✅; CONV-3's funnel card + invite-expiry sweep | ~1 wk | — | [SIM][SPK] |
| **NS-13 incident log** | CONV-15 verbatim | 1–2 wks | ask the insurance holder before any growth | [FUN] |
| **NS-14 photo timeline** | CONV-14; + `CARRY-5` conformance check | 3–5 days | when adjacent | [SPK] |
| **NS-2 bag-draw gauge** | Campaign consumable gauge off draw data (post-FND-2 ✅ the numbers are true) | 2–4 days | retire if the sample system exposes its count | [SPK] |
| **NS-7 demand view** | CONV-9's rollup as a Reports annotation (not a page, not a board layer — §8.0) | 3–5 days | — | [SPK] |
| **CONV-16 drift report** | The stock-ledger integrity query + admin surface | 2–3 days | — | [FUN] |
| **Governance sweep** | Workplan §10 table: adjudicate `P3-NOTIF-1/2/3/4` (push vs 45s polling; once-vs-daily), `CARRY-1/2/3/6/7/9/12` build-or-descope, declare Requests-redesign supersedes PRD §F (`CARRY-10`), keep `CARRY-11` listed | ½ day mtg | do early in phase | — |
| **PRE-GO-LIVE track** | Prod standup Option A: create `AHITS_PROD_*` secrets (incl. `MIGRATE_URL`) **before** the deploy that mounts them; prod cron scheduler; `CARRY-8` backups (daily/30-day) + 3-yr retention + PITR verified & documented in the runbook; migration baseline; Cloud Run flags pinned (`FND-49`); CI guard on `make deploy-prod` from laptops; `P3-RN-1` descope signed; A6 re-run on the prod URL | ~1 wk spread | `FND-15` code ✅; secret existence is the live prereq | [FUN][TRA] |

---

## 10. PHASE 4+ — Triggered bets (build ONLY when the named trigger fires)

| Bet | Trigger (verbatim from North Star) | When it fires, build |
|---|---|---|
| **N-7 job costing v1 → estimator** | A season of P3-TIME actuals that are *believed* | One number on the Project page first (days, CONV-8); estimator ("quote a 400-sample cropland job") is the 3–6 wk follow-on only after the number is trusted |
| **N-2 recommendation surface** (rent/buy/idle/retire) | TCO columns + idle-rental nudge demonstrably get read | CONV-2 step 5 (3–6 wks) |
| **N-4 dispatch ranking** | N-5 shipped **and** staffing observed flowing through AHITS | CONV-10's ranked suggestions (ingredients — `Availability`, `homeHubId`, hub addresses — accrue regardless) |
| **N-3 reliability nudges** | Pilot variance check shows live data **and** the board exists to surface nudges | CONV-5 step 8 |
| **MID-2 predictive maintenance** | A full season of variance-checked checklist data **and** NS-7 demonstrably read | Threshold rules first; never before |
| **MID-5 offline day-pack** | A6 device data exists (identify what actually misses cache) | Deliberate pre-sync of the operator's day |
| **NS-9 Shippo wiring** | A real month with **>5 carrier shipments** | CONV-1's in-transit vertebra (~1–2 wks; the model is waiting) |
| **NS-6 farm-gate link** | Ops asks for it **by name** | The parked interview first |
| **Web Push** (`P3-NOTIF-1`) | Governance says "push is primary" for a cohort | iOS 16.4+ PWA Web Push (bell data exists); else 45s polling stands as the stated mechanism |
| **Offboarding tooling** | Churn actually bites | CONV-3's checklist card (days) |

---

## 11. PHASE X — Parked / moonshot (no design work; one line each, triggers written down)

- **X-1 field-ops OS / white-label:** keep the IP, keep the nullable `region` column discipline, stop writing prose. Trigger: external demand with a name on it.
- **X-2 contractor network:** meaningless before X-1-scale demand; MID-3 schema hygiene is the only live obligation.
- **MID-4 multi-region:** the free nullable `region` column on new money models (2C carries it), nothing else. Trigger: a second real operating region. (Re-verified: no tenant scoping anywhere in schema.)
- **Sample-territory shelf** (v1 N-1, MID-1, X-3): shelved; re-entry only by product-owner decision + pull from the sample system's owners. AHITS owns the operation, never the sample.
- **Unified event spine:** a triggered future decision, not a convention to adopt now.
- **Declined by name** (so nobody re-litigates): operator↔office messaging; crew-to-crew visibility; in-app navigation/routing; the OSHA-workflow growth of NS-13; auto-scheduling of any kind; `CARRY-11`'s v1 out-of-scope list (Airtable, QuickBooks, real-time GPS, payroll engine, SMS, …).

---

## 12. Effort & quarter map (honest sizing; one meaningful bet per quarter)

| Quarter (approx) | The bet | Also lands (small/riders) | Sized |
|---|---|---|---|
| Q3-2026 (now) | **Phase 0 close-out + A6 + pilot launch** | W0-B/C/D/E/F; verify-the-landed; `FND-17` | 2–4 wks work + pass + fortnight |
| Q3/Q4-2026 | **Operator's day** (NS-10 + NS-5 + instrumentation) → **Map** (2A) → **QR** (2B) | NS-4 rider; CONV-11 pairing | Today 1–2 wks · Map 1–2 wks · QR 2–3 wks |
| Q4-2026/Q1-2027 | **The money loop** (2C: P3-TIME + NS-11 + earnings + Availability) | region column; task-type telemetry | **6–10 wks** — the long pole; do not parallelize another bet against it |
| Q1-2027 | **Manager's week** (2D: N-5 board) | CONV-12 rental layer; L1–L9 registry | 2–4 wks honest |
| Q2-2027 | **Evidence probe** (NS-1) + Phase-3 basket | AN-1, MOB-1, ONB-1, NS-13, NS-14, NS-2, NS-7, drift report; PRE-GO-LIVE track threaded through | probe 1 wk; basket ~4–6 wks aggregate |
| Beyond | Phase 4+ strictly by trigger | — | per table §10 |

**Calendar honesty (read before believing the quarter labels):** the Q3/Q4-2026 row sums to ~5–8 wks of build plus the pilot fortnight — realistically **a quarter and a half**, which is why it straddles the boundary — and 2C's honest 6–10 wks means the money loop plausibly closes in Q1-2027, sliding the board toward Q1/Q2 and the probe toward Q2/Q3. The binding commitments are the **sequence, the gates, and one-bet-per-quarter** — not the quarter labels, which assume a small team with no interrupts and should be re-cut at each quarter boundary. On Map/QR placement: §4 puts them in Phase 2 while this table shows them riding alongside Phase 1's pilot quarter — that is the same statement (they're small, and §6 says Phase 1 "overlaps Phase 2A/2B calendar-wise"), not a contradiction; the operator's-day bet keeps headline status either way.

---

## 13. Goal-coverage matrix (the original goals, provably served)

| Workstream | SIM | FUN | TRA | SPK |
|---|:-:|:-:|:-:|:-:|
| Phase 0 hardening + A6 | · | ● | ● | ● |
| NS-10 Today / NS-11 close-out | ● | ● | · | ● |
| Map + NS-4 | ● (0 taps) | ● | · | ● |
| QR no-app check | ● | ● | ● (no install) | ● |
| Time/Invoicing + earnings | ● (1-tap exceptions) | ● (payroll trust) | ● (offline clock) | ● (CONV-4/8) |
| Week board | ● (managers) | · | · | ● (convergence) |
| Integration matrix (§8) as practice | ● | ● | · | ● (it IS the goal) |
| Phase-3 basket | · | ● (NS-13, drift) | ● (MOB-1) | ● (NS-14, NS-7) |

(●=primary, ·=incidental. No workstream serves zero goals; anything that would has been parked in §10/§11 — which is the anti-bloat goal working.)

---

## 14. Assumptions, unverified claims & tensions resolved

**Verified beyond doubt this session:** everything in §1.1/§1.2/§1.3 (file:line cited). **Assumed / not verifiable from the repo:**
1. A6 has still not been run on hardware (no artifact found; treated as open — it is the gate either way).
2. `AHITS_PROD_MIGRATE_URL` and the other `AHITS_PROD_*` secrets do not yet exist in Secret Manager (deploy.yml comments imply not; can't read Secret Manager from here).
3. `EMAIL_SANDBOX=true` is live on the running staging service (Makefile now carries it; the deployed revision's env is unverifiable from source).
4. `FND-12`/`FND-13`/`FND-19`/`FND-20`/`FND-22`–`FND-24`/`FND-26`–`FND-40`/`FND-47`–`FND-50` statuses were **not individually re-verified** (register assumed accurate where not spot-checked); W0-A includes re-checking any that block a step before building on them.
5. `FND-17`: no error-tracking SDK found in a light pass; treated as open, not proven absent.
6. `hourlyRate` unseeded; both staging hubs email-less — live-data claims inherited from the workplan, not re-observed. (A prior item here — whether the six `Photo` `@@index` declarations are migration-backed — was **resolved this session**: migration `20260703010000_wave0_missing_indexes` verified on disk, moved to §1.1.)

**Tensions found between the two source documents (or between them and HEAD), and how this roadmap resolves them:**
1. **Workplan register vs HEAD:** the §1.1 tranche of findings the workplan lists as open is fixed in source (incl. the FND-46 index half, migration verified on disk). Resolution: re-baseline (Phase 0 = verify + remainder), don't re-plan done work. The register stays canonical for IDs; this doc records dispositions.
2. **CLAUDE.md vs Makefile/deploy.yml:** the "KNOWN BUG" migrate-secret warning describes pre-fix code. Resolution: doc update in W0-A; the surviving prereq is secret creation only.
3. **Shippo — `CARRY-13` "wire or delete" vs `NS-9` "default delete" vs the owner's Shippo↔requests conversation:** resolved as *delete the dead lib, keep the dormant model, ship the design* (CONV-1) so the >5-shipments/month trigger buys a 1–2 wk build instead of a redesign.
4. **NS-8 custody-receipt generalization (cut) vs the integration matrix wanting receipts everywhere:** resolved by making CONV-1's post-trigger Shipment receipt the *second real consumer* that earns the generalization — components earned, not speculated.
5. **Week-board timing:** North Star's quarter-3 slot vs its dependency on 2C's Availability. Resolved: board follows 2C and is explicitly degradable — **v1 = L1–L5 + L8–L9**; L6/L7 light up only once 2C is operationally adopted and producing rows (a migration creates tables, not data). Build may start once 2C's migration lands.
6. **Incident log placement:** North-Star §4 sizes it small with no trigger; it is liability-shaped, so it sits in Phase 3 (not 4+), with the no-workflow-growth guard written down.
7. **QR anonymous submitter vs `DailyCheck.operatorId NOT NULL`:** decision = sentinel external user (consumers untouched; QR-to-QR same-day resubmits deduped) — honestly scoped: the sentinel does **not** dedupe across the QR/authed paths, so the missed-check scan keys on any row per `(vehicleId, businessDate)` regardless of operatorId (2B step 2). Recorded as an overridable decision for the 2B migration, not settled by fiat.
8. **Evidence ambition vs friction budget:** resolved wholesale by North Star §3 (passive/piggyback/tap-for-tap/benefit-the-provider) — §8's CONVs were each designed under it; CONV-4 is the template.
9. **`P3-NOTIF-*` / `CARRY-*` open governance:** not resolvable by engineering; scheduled as the Phase-3 governance sweep with the workplan §10 recommendations carried.

---

_The through-line, one last time: Wave 0 is nearly bought and partially banked (§1.1 is real, verified progress) — finish it honestly, pass A6 on hardware, and launch the pilot as a launch. Give the operator a front door (Today) and a closing ritual (clock-out), ship the three contracted capstones in order with the money loop carrying the earnings view, then give the manager the week. And through all of it, build to §8: every event captured once, speaking everywhere it's owed — request to shipment to receipt, odometer to maintenance to parts, rain to paycheck to project cost — converging on one board, one feed, one set of reports. That is the app the four original goals described._

_End of master roadmap._
