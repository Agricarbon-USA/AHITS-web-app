# AHITS — Wave 2 Completion Record (Session 3)

**Agricarbon Hardware Inventory & Tracking System**
Session date: 2026-06-18 · Author: assessment-driven build session ("Session 3")
Baseline at session start: `staging/20260618-final` (HEAD `ae0ebfd`), which already contained Wave 0, Wave 1, Wave 1.5, Wave 2A (security), Wave 2A.5 (account management), CI test-gating, and the forward-ported API endpoints.
Outcome: the assessment-identified Wave 2 work — the consumable-model rebuild, the remaining security hardening, the no-migration correctness cluster, the maintenance lifecycle, and schema hardening — implemented, verified, and shipped as a stack of reviewable PRs.

> **What this document is.** A clean, durable record of everything done in this session: the work, why it was done, the exact files and migrations, verification status, the two open caveats, the recommended workflow changes that came out of the session, and the forward backlog. It is the companion to `AHITS_Comprehensive_Assessment_2026-06-18.md` (the assessment that kicked the session off) and the updated `AHITS_PRD_v2.md` (the living spec). Read the **Executive Summary** and **§4 Verification & Caveats** if you read nothing else.

---

## 1. Executive summary

The session began with a full, independent re-assessment of the app (`AHITS_Comprehensive_Assessment_2026-06-18.md`), which confirmed the foundation is sound (offline-first engine, idempotent replay, revocable auth) and that remaining work was consolidation: one Critical credential leak, a structurally broken consumable inventory model, the tail of the security-hardening pass, a cluster of correctness gaps, and two integrity/lifecycle improvements that needed schema migrations.

All of it is now done and shipped:

1. **SEC-1 (Critical)** — closed a credential leak where `GET /api/vehicles/[id]` serialized full `User` rows (incl. bcrypt `pinHash`) to any authenticated operator.
2. **DAT-1** — rebuilt the consumable inventory model (was half-implemented as anonymous serialized units and couldn't be checked out at all) onto a clean total-owned / derived-availability model, applied consistently across checkout, return, transfer, disposition, end-deployment, and both UI builders.
3. **Wave 2A′** — finished the security hardening: vehicle-PII minimization for operators, upload magic-byte validation + SVG block + rate limit, enforced security headers + a Report-Only CSP with a violation sink, removal of the `serverActions` CSRF footgun, and a real session-expiry UX.
4. **Wave 2B-A** — the no-migration correctness cluster: routed the offline-bypass writes through the durable queue (with idempotency wrapping), converted hard-deletes to soft-deletes with in-use guards, and made transfer status flips atomic.
5. **DAT-5** — the maintenance lifecycle: a single unified damage-report path, a `MaintenanceTask`↔unit link so completing a repair returns that exact unit to service, and `resolutionPath`/`locationNote` so an in-repair unit's location is answerable.
6. **DAT-7** — schema hardening: `itemType` String→enum, serial-number uniqueness within an item, and atomic alert de-duplication via a nullable-unique `activeKey`.

Everything is type-checked and ESLint-clean; the migration-bearing changes (DAT-5, DAT-7) were applied to the dev DB, the client regenerated, the full `make verify` run, and `prisma migrate status` confirmed in sync. Two items remain explicitly **unverified-by-tooling** and need a human pass — see §4.

---

## 2. The work, in detail

Each item below: the problem, the change, the files touched, any migration, and how it was verified. Commit hashes and branches are in §3.

### 2.1 SEC-1 — vehicles/[id] credential & PII leak (Critical)

**Problem.** `GET /api/vehicles/[id]` used `include: { dailyChecks: { include: { operator: true } } }`, which serialized the entire `User` row for every operator who had filed a daily check on that vehicle — including the bcrypt `pinHash`, email, and `hourlyRate` — to **any** authenticated caller. Operator PINs are 6 digits (10⁶ keyspace), so a leaked bcrypt hash is trivially brute-forced offline → account takeover, and admin takeover if an admin ever filed a check. This was the single `operator: true` in the codebase; every other route already used `select: { id, name }`.

**Change.** Scoped the include to `operator: { select: { id: true, name: true } }`.

**Files.** `src/app/api/vehicles/[id]/route.ts`.

**Migration.** None. **Verification.** `tsc` + ESLint clean; grep-confirmed it was the only occurrence.

### 2.2 DAT-1 — consumable inventory model rebuild (Critical correctness)

**Problem.** Consumables were declared in `lib/inventory.ts` as "pure counts" (`InventoryItem.quantity` authoritative) but implemented as anonymous serialized units: checkout tried to reserve `InventoryUnit` rows that pure consumables don't have, so they failed with "Only 0 units available"; `InventoryItem.quantity` was **never** decremented or incremented anywhere; and the kit-add UI filtered consumables out entirely (it gated on `unitCounts.available > 0`). There was no working path to put a consumable in a kit.

**Decision (chosen by the product owner).** *Total-owned with derived availability:* `InventoryItem.quantity` is the total owned and is mutated **only** on permanent loss (field usage / write-off), never on checkout or hub-return; availability is derived as `quantity − Σ(open consumable reservations)`. Consumables never touch `InventoryUnit` rows.

**Change.** New `src/lib/consumables.ts` centralizes the model: `reservedConsumableQty` / `reservedConsumableMap` (the open-reservation sum), `assertConsumableAvailable` (a row-locked availability guard that serializes concurrent checkouts via `SELECT … FOR UPDATE`), `consumeConsumableStock` (the guarded decrement), and an `InsufficientStockError`. `deriveQuantities` now derives consumable availability from the reserved sum. Applied across: build-kit (`deployments` POST), add-items (`deployments/[id]/items` POST), hub return, end-of-deployment, and transfer-decline — all of which now branch on the item's real `itemType` and leave unit rows alone for consumables. A new `RETURN` vs `CONSUME` mode on the per-item return endpoint distinguishes "back to the shelf" from "used in the field" (the latter decrements owned stock). The My-Rig and admin deployment builders now gate and bound consumables on `availableQuantity`.

**Files.** `src/lib/consumables.ts` (new), `src/lib/inventory.ts`, `src/app/api/deployments/route.ts`, `src/app/api/deployments/[id]/items/route.ts`, `src/app/api/deployments/[id]/items/[kitItemId]/route.ts`, `src/app/api/deployments/[id]/end/route.ts`, `src/app/api/transfers/[id]/decline/route.ts`, `src/app/api/inventory/route.ts`, `src/app/api/inventory/[id]/route.ts`, `src/app/(operator)/operator/my-rig/page.tsx`, `src/app/(admin)/admin/deployments/page.tsx`, `tests/consumable-model.test.ts` (new).

**Migration.** None — reused existing schema. **Verification.** `tsc` + ESLint clean; `tests/consumable-model.test.ts` covers the full lifecycle (reserve → derive → return → consume → insufficient-stock) and runs against the Postgres CI/test DB.

### 2.3 Wave 2A′ — finish security hardening

**Problem.** The prior security pass (Wave 2A) had merged, but the assessment found the tail still open: operators received vehicle VIN/plate/insurance PII; the upload endpoint trusted the client-declared `file.type` (SVG-with-script could pass) and wrote to a public bucket with no rate limit; there were no security headers or CSP; `serverActions.allowedOrigins: ['*']` disabled Next's CSRF origin check; and `useAuth` ignored 401s so an expired session looked logged-in.

**Change.**
- **SEC-2:** role-aware `select` on `/api/vehicles` and field-strip on `/api/vehicles/[id]` so operators get only operational fields (no VIN/plate/insurance/registration/notes).
- **SEC-3:** new `src/lib/image-validation.ts` validates uploads by magic bytes (JPEG/PNG/WebP/GIF/HEIC), explicitly rejects SVG, stores the sniffed Content-Type, and a per-user rate limit caps abuse. (Private bucket + signed URLs deferred to Wave 2C, since photo capture isn't built yet.)
- **SEC-4:** `next.config.ts` now enforces HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Permissions-Policy`, and ships a **Report-Only** CSP tuned for Emotion/MUI/Serwist/Supabase with an `/api/csp-report` sink to tune before enforcing.
- **SEC-5:** removed `serverActions.allowedOrigins: ['*']` (verified zero Server Actions exist); session cookie stays `sameSite: 'lax'`.
- **UX-5:** `useAuth` now throws on non-OK, treats a 401 as logged-out, and redirects to `/login` instead of presenting a truthy `{error}` user.

**Files.** `next.config.ts`, `src/app/api/csp-report/route.ts` (new), `src/app/api/vehicles/route.ts`, `src/app/api/vehicles/[id]/route.ts`, `src/hooks/useAuth.ts`, `src/lib/image-validation.ts` (new), `src/app/api/uploads/route.ts`.

**Migration.** None. **Verification.** `tsc` + ESLint clean.

### 2.4 Wave 2B-A — no-migration correctness cluster

**Problem.** Three correctness gaps that needed no schema change: several operator writes (start-deploy, transfer create/accept/decline/cancel) bypassed the offline queue and failed hard (losing data) on a flaky connection; the inventory/vehicle DELETE routes hard-deleted (throwing RESTRICT-FK 500s and ignoring the `deletedAt` soft-delete column); and transfer status flips were non-atomic (a double-accept under load could both succeed).

**Change.**
- **OFF-3:** routed the bypass writes through the durable `mutate()` queue, and wrapped `POST /api/deployments` and `DELETE /api/transfers/[id]` in `withIdempotency` so a queued replay applies exactly once. The transfer/start dialogs each take a scoped `useOfflineQueue()`.
- **DAT-2:** `inventory/[id]` DELETE → soft-delete (`deletedAt` on the item + its units) with an "in active deployment" guard; `vehicles/[id]` DELETE → retire (`status RETIRED`, unassign operator) with an "in active deployment" guard.
- **DAT-3:** transfer accept/decline/cancel flip status via a conditional `updateMany(where: { status: 'PENDING' })` (compare-and-set), so only one concurrent action wins.

**Files.** `src/app/api/transfers/[id]/route.ts`, `src/app/api/transfers/[id]/accept/route.ts`, `src/app/api/transfers/[id]/decline/route.ts`, `src/app/api/deployments/route.ts`, `src/app/api/inventory/[id]/route.ts`, `src/app/api/vehicles/[id]/route.ts`, `src/app/(operator)/operator/my-rig/page.tsx`.

**Migration.** None. **Verification.** `tsc` + ESLint clean. **Caveat:** OFF-3 changes offline behavior, which static checks can't prove — see §4.

### 2.5 DAT-5 — maintenance lifecycle (migration)

**Problem.** Two divergent "needs maintenance" paths: the quick per-item return flipped a unit's status **silently** (no task, no alert), while only the rich disposition path created a task + alert — so routine damage notified nobody. Repaired units had no way back: `MaintenanceTask` linked only to an *item*, not the specific *unit*, so completing a repair couldn't return that unit, and units stranded in `IN_MAINTENANCE` forever. And there was no representation of where an in-repair unit physically was.

**Change.** New `src/lib/maintenance.ts` `createDamageReport()` is the single damage path: it flips the unit (`IN_MAINTENANCE` if fixable, `INOPERABLE` if a write-off), opens a unit-linked `MaintenanceTask`, and raises exactly one `DAMAGE_REPORTED` alert. The add-items, end-deployment, and **quick per-item** return paths all call it. `PATCH /api/maintenance/[id]` now returns the linked unit to `AVAILABLE` when a task is completed (conditional on `IN_MAINTENANCE`, so it never resurrects a written-off/retired unit) and auto-stamps `completedAt`. New `resolutionPath` (IN_FIELD/HUB/SHOP, derived from `RepairType`) and `locationNote` answer "where is it?" (addendum A.3).

**Schema / migration (`20260618190000_maintenance_lifecycle`, additive).** New enum `ResolutionPath`; `MaintenanceTask.inventoryUnitId` (FK to `InventoryUnit`) + `resolutionPath` + `locationNote`; `InventoryUnit.maintenanceTasks` back-relation + index.

**Files.** `prisma/schema.prisma`, `src/lib/maintenance.ts` (new), `src/app/api/deployments/[id]/items/route.ts`, `src/app/api/deployments/[id]/end/route.ts`, `src/app/api/deployments/[id]/items/[kitItemId]/route.ts`, `src/app/api/maintenance/[id]/route.ts`. (Plus a `consumable-return-scoping.test.ts` update folded in.)

**Verification.** Migration applied to dev DB; client regenerated; `make verify` green; `prisma migrate status` → all migrations applied + in sync.

### 2.6 DAT-7 — schema hardening (migration)

**Problem.** `itemType` was a free `String` (a malformed value would silently route an item down the wrong path); `InventoryUnit.serialNumber` had no uniqueness; and `Alert` had no dedup, so the same source could spawn duplicate unresolved alerts (the `createAlert` dedup was a race-prone findFirst-then-create).

**Pre-flight.** Three read-only data checks confirmed the constraints could apply cleanly: only `SERIALIZED`/`CONSUMABLE` itemType values, zero duplicate serials, zero duplicate unresolved alerts.

**Change.** `itemType` → enum `ItemType { SERIALIZED, CONSUMABLE }` (the DB now enforces the vocabulary; inventory create schema tightened to `z.nativeEnum(ItemType)`). `@@unique([inventoryItemId, serialNumber])` on `InventoryUnit` (NULLs distinct, so unserialized units don't collide). Alert dedup via a nullable-unique `activeKey` set to `${type}:${sourceTable}:${sourceId}` on create and cleared on resolve — a standard unique constraint that enforces "at most one unresolved alert per source" atomically (replacing the race). `createAlert` now creates-then-catches `P2002`; the resolve endpoint nulls `activeKey`.

**Schema / migration (`20260618200000_dat7_schema_hardening`).** `CREATE TYPE ItemType` + column cast; the two unique indexes; `Alert.activeKey` column with a backfill for existing unresolved alerts (and a safety-net dedup `DELETE`).

**Files.** `prisma/schema.prisma`, `src/lib/alerts.ts`, `src/app/api/admin/alerts/[id]/resolve/route.ts`, `src/app/api/inventory/route.ts`. (Plus `tests/helpers/fixtures.ts` + 4 test files updated to the `ItemType` enum.)

**Verification.** Migration applied; client regenerated; `make verify` green; `migrate status` → all 11 migrations applied + in sync.

---

## 3. Branch / PR / migration map

The session was shipped as a **stack of PRs** off `main`, each retargeting automatically as its base merges.

| Order | Branch | Contents | Key commits | PR |
|---|---|---|---|---|
| 1 | `feature/20260618/maxwellslater-sec1-consumables` | SEC-1, DAT-1, docs (assessment exports), Wave 2A′ | `8a4b9f3` SEC-1 · `94879ae` DAT-1 · `1dbc0e7` docs · `f08133f` Wave 2A′ | (first PR, base `main`) |
| 2 | `feature/20260618/maxwellslater-wave2b-correctness` | Wave 2B-A (OFF-3, DAT-2, DAT-3) | `08653b9` | stacked |
| 3 | `feature/20260618/maxwellslater-dat5-maintenance-lifecycle` | DAT-5 | `f263ede` | **#31** |
| 4 | `feature/20260618/maxwellslater-dat7-schema-hardening` | DAT-7 | `e8215d6` | **#32** |

**Migrations added this session:** `20260618190000_maintenance_lifecycle`, `20260618200000_dat7_schema_hardening`. Both applied to the dev DB and confirmed in sync (11 migrations total).

**New source files:** `src/lib/consumables.ts`, `src/lib/maintenance.ts`, `src/lib/image-validation.ts`, `src/app/api/csp-report/route.ts`, `tests/consumable-model.test.ts`. **New doc files:** `AHITS_Comprehensive_Assessment_2026-06-18.md` (+ `.docx`), this record.

---

## 4. Verification status & open caveats

**Verified by tooling.** Every change is `tsc --noEmit` clean and ESLint-clean. The migration-bearing changes were applied to the dev database, the Prisma client regenerated, the full `make verify` (typecheck + lint + Postgres-backed vitest suite) run green, and `prisma migrate status` confirms the schema is in sync — so `prisma migrate deploy` will behave identically in CI/prod. Staging deploys completed for the merged work.

**Two items deliberately NOT proven by tooling — these need a human pass before relying on them:**

1. **OFF-3 offline behavior (real-device pass).** Routing the bypass writes through the queue is the right fix, but neither static analysis nor the unit suite can prove the runtime offline path. Before a field pilot, run: submit each converted action (start-deploy, transfer create/accept/decline/cancel) **offline** on a real phone, then reconnect and confirm a single clean sync with **no duplicates** and the correct final state. This is the highest-value manual QA remaining.

2. **CSP is Report-Only.** The Content-Security-Policy ships as `Content-Security-Policy-Report-Only` so it cannot break the live app. Watch `/api/csp-report` in Cloud Run logs on staging for genuine violations, tune the directives, then a one-line follow-up flips the header name to enforcing.

Smaller verification gaps worth a glance: confirm on staging that a consumable can be added to a kit through the UI end-to-end (the unit suite proves the API; the picker is the last mile), and that the quick "Needs maintenance" return now produces a `DAMAGE_REPORTED` alert (DAT-5).

---

## 5. Workflow recommendations (from this session)

Concrete process changes that this session's friction points argue for:

1. **Run the full Postgres test suite locally before opening any PR, not just `tsc`/ESLint.** Two existing tests (`consumable-return-scoping`, and the fixtures for `ItemType`) only failed when `make verify` actually executed them on a later cluster — because the sandbox that authored the code couldn't reach a database. Add `make verify` (which includes the vitest suite against the local test DB) to the definition-of-done for every branch, and keep it in CI as the merge gate (it already is). The lesson: `tsc` + ESLint is necessary but not sufficient; the DB-backed suite catches contract drift that types don't.

2. **Migration-bearing changes have a strict order: schema → generate → verify → commit.** A migration must be generated/applied (which regenerates the Prisma client) *before* `make verify` can pass, because the client types gate the typecheck. Codify this in `CLAUDE.md`'s deploy section: for any schema change, `prisma migrate dev` (or a hand-written migration + `migrate deploy`) and `prisma generate` come first, then `make verify`, then commit the `prisma/migrations/*` files **in the same branch**.

3. **Always run `prisma migrate status` after a hand-written migration.** When a migration is hand-authored (as DAT-5/DAT-7 were, because the partial-index and data-backfill steps can't be expressed in the Prisma schema), confirm it's recorded in `_prisma_migrations` and the DB is "in sync" — otherwise `migrate deploy` in CI/prod can try to re-run it and fail. `migrate status` is the cheap insurance.

4. **Gate destructive/constraint migrations on a data pre-check.** DAT-7's `serialNumber` uniqueness and `itemType` enum cast would have failed the migration if existing data violated them. The three read-only checks we ran (distinct values, duplicate serials, duplicate unresolved alerts) should be a standard pre-flight for any uniqueness/enum/NOT-NULL migration. Keep a small `scripts/` helper for this.

5. **Keep PRs stacked and single-concern; isolate migrations.** The session shipped cleanly as four stacked PRs (security/consumables → correctness → DAT-5 → DAT-7), each with one concern and at most one migration. This kept reviews legible and let staging validate increments. Recommend continuing: one migration per PR, and never bundle a data migration with unrelated code.

6. **Treat the Report-Only → enforce CSP flip as a tracked follow-up, not a someday.** It's a one-line change behind a short observation window; put it on the board so it doesn't linger in Report-Only indefinitely (which provides no protection).

---

## 6. What's next (forward backlog)

The Wave 2 plan is complete. Remaining, in dependency/value order:

**Wave 2C — Photos end-to-end + private storage (~1 week).** Photo *capture* still does not exist anywhere (`NotePhotoDialog` always returns `[]`; every `photoUrls` is empty). Build in-app capture → 1200px/JPEG-85 compression → an **offline blob store** (separate from the JSON queue, which can't carry Blobs) → signed upload to a **private** Supabase bucket on sync → `Photo` rows with validated URLs. This also completes the deferred half of SEC-3 (private bucket + signed URLs) and unblocks the damage-photo requirement that several "done" flows assume. Update the admin photo render paths to signed URLs.

**Wave 2D — Consistency unification (~3–5 days).** The app still has two dialects. Promote one response contract (the declared `{data}` envelope + a single `apiError()` helper + published DTOs), one vocabulary (extend `lib/status.ts` to every enum — `VehicleType`, `TransferStatus`, `Condition`, `Priority`, `AlertType` — and route all rendering through typed chips), one set of primitives (collapse the ~20 hand-rolled dialogs and 3 toast systems into `ConfirmDialog`/`useToast`/`StatusChip`), and one "Deployment" noun. Mostly deletion; erases the defensive `?? d` / `typeof d.error` hedges in the client.

**Wave 3 — Close Phase 2 + production hardening (~2–3 weeks).**
- **Notification dispatcher** — the biggest remaining product gap. Only two emails ever send; there is no push, no notification center, no scheduled triggers, and **nothing reaches external recipients** (maintenance shops, hub operators) despite the data being captured. DAT-5 now produces clean, unit-linked, de-duplicated maintenance tasks + alerts, so the dispatcher has a solid event stream to build on. Build: all six alert types over email + push through one escaped channel; scheduled (cron) triggers for overdue/not-returned/expiry; per-admin/per-type routing; an in-app notification center; and the **external maintenance-shop work-order email** (and the Phase-3-ready invoice→processor loop) through the same dispatcher.
- **Admin completeness** — the four stub pages (Vehicles, Maintenance, Projects, Reports). The **Maintenance** page especially now has a real backend to drive (the DAT-5 lifecycle: see open repairs, their `resolutionPath`/location, mark complete → unit returns to service). Plus the dashboard operational feeds and clickable cards, and a live operator dashboard.
- **Sessions/devices** — the trusted-device / per-device model and 30-day idle policy (the current 24h TTL + `tokenVersion` revocation is the floor).
- **Deploy & infra** — migrations in the deploy path (Docker entrypoint or a gated CI step) so the manual `make db-migrate` footgun goes away; `/api/health` + startup probe; shared-store rate limiting + the `X-Forwarded-For` parsing fix (SEC-6); flip CSP to enforcing.
- **Tests** — auth first (PIN lockout, session expiry/revocation, invite), then broaden the transfer/idempotency integration coverage, then the real-device offline pass.
- **Scanner & conflicts** — a live camera scanner with manual-entry fallback; per-item offline conflict-resolution inspector; deterministic date rendering (the React #418 hydration smell).

**Phase 3 — Scale capstones (Q4).** Deployment Map (smallest; reuses the hardened daily-check write), then Time-Tracking / Invoicing / Availability (reusing the Wave-3 dispatcher for the invoice→processor email), then advanced cost reporting and the React Native wrapper.

---

## 7. Forward recommendations & concerns

- **The outbound/notification layer is now the critical path to product value.** Everything inbound (operator capture, inventory truth, maintenance lifecycle) is solid; the system still mostly *holds* information rather than *delivering* it. The single highest-leverage next investment is the notification dispatcher (Wave 3), and it should be designed as one channel that serves admin push/email **and** external shop/processor email, with one escaped template path — so Phase-3 invoicing reuses it for free. Treat the external-recipient experience (shops, hubs) as a first-class design surface, not an afterthought.

- **Do the real-device offline pass before any field pilot.** OFF-3 and the broader offline engine are the app's differentiator, and they are the one area code review and the unit suite cannot fully validate. A single afternoon with a phone in airplane mode (cold-launch, submit-offline-then-sync for each write, and a two-device same-unit conflict) is worth more than another week of static review.

- **Photos are a hidden dependency, not a nice-to-have.** Several shipped "damage" flows assume a photo that is never captured. Until Wave 2C lands, mark every damage/inoperable workflow as *partial* in the tracker so no one assumes documentation is being captured, and prioritize 2C ahead of broader feature work.

- **Consolidate before adding breadth.** The consistency-unification work (Wave 2D) is unglamorous but compounding: once one mutation pipeline, one response contract, one vocabulary, and one set of primitives exist, every subsequent feature (notifications, admin pages, reporting) is cheaper and less bug-prone to build. Spending 3–5 days there before Wave 3 will pay for itself.

- **Watch the migration discipline.** The codebase has some historical drift (mixed `db push` / `migrate dev`, hand-authored SQL). This session added two clean, in-sync migrations and confirmed status each time. Keep that discipline: one migration per PR, data pre-checks for constraints, `migrate status` after hand-written SQL, and migrations in the automated deploy path (Wave 3) so production never depends on a human remembering to run `make db-migrate`.

- **Document hygiene.** The repo accumulated overlapping assessment docs across sessions. The canonical set going forward is: `AHITS_PRD_v2.md` (the living spec — now updated through this session), `AHITS_Comprehensive_Assessment_2026-06-18.md` (this session's assessment), this `WAVE2_COMPLETE.md` (the session record), `AHITS_QA_STAGING_ISSUES.md`, and `README`/`CLAUDE.md`/`AGENTS.md`. Move superseded snapshots into `docs/archive/` with a one-line "as of commit X" header.

---

*Appendix — verification commands used this session:* `npx tsc --noEmit`, `npx eslint <files>`, `make verify` (db-generate + typecheck + lint + vitest), `npx prisma migrate deploy`, `npx prisma generate`, `npx prisma migrate status`. *Assessment companion:* `AHITS_Comprehensive_Assessment_2026-06-18.md`. *Living spec:* `AHITS_PRD_v2.md` (§3 session changelog updated through Session 3).
