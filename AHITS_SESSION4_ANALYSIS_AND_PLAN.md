# AHITS — Session 4 State Analysis, Risk Register & Staged Execution Plan

**Date:** 2026-06-18
**Baseline:** PRD v2.3 / WAVE2_COMPLETE.md (Session 3), branch `docs/20260618/maxwellslater-wave2-completion-prd-v2.3`
**Method:** Full read of the PRD trail + six independent deep audits of the live codebase (correctness/security, data model/offline, UX/cross-platform, delivery/CI-CD, plus documentation reconciliation and roadmap interrogation). Highest-stakes findings were verified directly against source.

---

## 1. Executive summary

AHITS is in good architectural shape and a poor delivery-pipeline shape. The hard part — an offline-first field engine with idempotent replay, a single-source-of-truth inventory model, revocable auth, a rebuilt consumable model, a unified maintenance lifecycle, and schema hardening — is genuinely built and largely sound. What remains is **consolidation, completion of the admin half, the entire outbound/notification layer, and a delivery pipeline that is currently unsafe to ship through.**

Three things are true at once and need to be held together:

1. **The product foundation is real.** The operator's core loop (daily check → scan → check in/out → transfer → end deployment) works on staging and survives offline replay for single-operator, single-action cases. This is the expensive 70% and it exists.

2. **The delivery pipeline is the most urgent risk, and it is not a code-quality risk — it is a "you could ship a broken build or a schema mismatch to production without anything stopping you" risk.** CI is wired to branches that don't match reality, `next build` never runs in CI, deploy isn't gated on CI, and database migrations are applied **by hand from a developer's laptop** because neither the Docker image nor the deploy workflow runs them. Any of these can take production down independent of how good the application code is.

3. **Several "done" features quietly depend on a feature that does not exist.** Photo capture is plumbed for throughout the damage/inoperable/hand-off flows but `NotePhotoDialog` always returns an empty array and nothing in the frontend ever calls the upload endpoint. Damage reports, inoperable evidence, and the maintenance-shop hand-off are all built on top of a photo that is never captured.

A gap to hold in view across everything we build is that **nothing leaves the building automatically.** The system captures maintenance-shop details, repair types, hub destinations, and (in the end-state) invoice data, but there is no notification dispatcher — no email or push reaches a maintenance shop, a hub, an admin, or an invoice processor. The internal half of this (admins notified of damage/missed checks) has near-term value and is wired into the success metrics; the external half (work orders to shops, invoices to processors) is real but a later-stage fix that should be designed around now rather than jumping the queue ahead of the pipeline and correctness work below.

**Recommended posture:** do not run a field pilot until a short pre-pilot hardening wave closes the delivery-pipeline and data-corruption risks below. Everything after that is sequenced in §7.

---

## 2. What AHITS is (so the plan is grounded)

**Problem.** A distributed soil-sampling operation runs 10–15 crews across multiple states each season with trucks, trailers, UTVs/ATVs, and Christie soil drills. Today it's run on texts, paper, and spreadsheets. The pain: no inventory visibility ("where is Christie Drill #2?"), inconsistent safety checks, reactive-only maintenance ($4k+ engine damage from a missed oil change), no check-in/out log, and zero cost visibility.

**The design spine** (the part worth protecting): every operator action is a **CheckLog** against a **Unit**; every problem becomes an **Alert**; every state is **derived from the log**, never hand-maintained. Concretely: `Asset → Unit → Kit/Rig/Deployment → CheckLog → Alert`.

**The nesting that the UI still blurs:** **Kit** = tools/gear only. **Rig** = Kit + vehicles. **Deployment** = operator(s) + Rig across 1+ projects. (`Kit ⊂ Rig ⊂ Deployment`.)

**The four humans the system serves:**

- **Field operator** (20–90 users, personal phone, often no signal). PIN login, offline-first, every action <2 min. Cannot see cost/spend.
- **Admin / ops manager** (2–5 users, desktop/iPad). Dashboard, alerts, inventory/fleet, maintenance scheduling, user management, thresholds, reports.
- **Hub operator / fulfiller** (no separate role — an operator or admin assigned to a hub). Receives deployment requests, stages and reserves equipment, runs a per-item quality check, confirms returns.
- **External receiving parties** (maintenance shops, invoice processors). Never log in; the system holds their data and, in the end-state, emails them. **Today nothing reaches them automatically — a gap worth designing around in everything we build, but a later-stage fix rather than a near-term priority.**

---

## 3. Current state: claimed vs. verified

The documentation is unusually self-aware about its own drift (the Independent Assessment dedicates a section to "corrections to the record"), so the honest read is below.

**Genuinely built and verified on staging:** daily check (pass/fail, offline-idempotent — exactly one row on replay), build kit + launch deployment, add items / log usage / per-item return / bulk remove, damage disposition, transfer create→accept and create→decline across two operators, consumable transfer, end deployment, QR scan routing. Auth with revocable sessions (`tokenVersion`, per-request DB re-check). Security pass (invite-token CSPRNG, mass-assignment whitelists, cost-field gating, email escaping, seed hardening, transfer idempotency). Rebuilt consumable model (total-owned / derived-availability). Unified maintenance/breakdown lifecycle (DAT-5). Schema hardening (DAT-7). Isolated test DB with strong dual guards against wiping production.

**Claimed done but materially incomplete:**

| Area | Reality |
|---|---|
| Photo capture | **Does not exist anywhere.** `NotePhotoDialog.onConfirm(note, [])` always sends `[]`; `/api/uploads` is never called from the frontend. Every damage/inoperable/hand-off photo is permanently empty. |
| Admin surface | **4 of 9 admin nav links are 12-line stubs** ("implementation in progress"): Vehicles, Maintenance, Projects, Reports — all linked live in nav, several referenced by dashboard counts and alerts with nowhere to act. |
| Outbound / notifications | **Greenfield.** No dispatcher; no email/push reaches shops, hubs, admins, or invoice processors. Alert rows are created but never delivered. |
| Hub operator UI | **No hub-centric view exists.** No "what's at / inbound to this hub," no return-receipt confirmation. The hub operator's core journey is unsupported. |
| Auth tests | **Zero.** The most security-critical code (PIN lockout, session expiry/revocation, invite flow, last-admin guardrail) is entirely mocked out in tests. |
| OFF-3 offline path | **Not proven on a real device.** The highest-value manual QA remaining before any pilot. |
| CSP | **Report-Only** — provides no protection until flipped to enforcing. |

**Phase completion, reconciled to a single point in time:** Phase 1 (Foundation) ~90%; Phase 2 (Core Operations) ~50%; Phase 3 (Scale/Polish) not started. (The PRD's 95%/60% and the Assessment's 85%/35% are the same project measured at different commits, not a disagreement.)

---

## 4. Findings by domain

Severities: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low. Items already fixed in Sessions 1–3 are omitted; these are the **open** findings.

### 4A. Correctness & security

- 🔴 **C1 — Consumable check-out is not race-safe and silently over-promises stock.** `api/deployments/route.ts` and `.../[id]/items/route.ts`: the serialized path correctly guards the status flip with `updateMany(where: status:'AVAILABLE')` + count check, but the consumable path does a read-then-write with no status precondition, so two concurrent check-outs can claim the same units. The *create* route also builds the `KitItem` with the requested quantity even when fewer units are available — no error, just wrong inventory. **Fix:** mirror the serialized guard; reconcile `result.count` against requested quantity.
- 🟠 **H1 — A vehicle can be "stolen" from another operator's active rig.** `api/deployments/[id]/vehicles/route.ts` claims to verify a vehicle isn't already in another active rig but only checks existence, then unconditionally reassigns `assignedOperatorId`. With `skipDuplicates` the prior `RigVehicle` row isn't removed, leaving the vehicle in two rigs. **Fix:** reject vehicles with an open `RigVehicle (removedAt:null)` in a different rig.
- 🟠 **H4 — Daily-check accepts any `vehicleId`** with no ownership/assignment check, polluting history and triggering "check failed" alerts for arbitrary vehicles. **Fix:** verify the vehicle is in the operator's active rig.
- 🟠 **H5 — Daily-check alert work is a floating, error-swallowing promise** (`.then(...).catch(()=>{})`, not awaited) — unreliable in serverless and silently dropped; also fires `EQUIPMENT_NOT_RETURNED` for every kit item on every passing check once a rig is >90 days old (alert spam). **Fix:** `await` inside the handler; dedup.
- 🟠 **H2 — Invite tokens stored in plaintext at rest.** The token is the sole bearer credential to mint an account (incl. admin). Generation is correct (256-bit CSPRNG); storage is the gap. **Fix:** store `SHA-256(token)`, look up by hash.
- 🟠 **H3 — Admin password strength effectively unenforced** (`length >= 8` only; `"password"` passes). Combined with H2, a clean admin-takeover primitive. **Fix:** real strength check on the ADMIN branch.
- 🟡 **M-set** — non-transactional unit-status change + mislabeled audit action; CheckLog actor attribution wrong for secondary operators/admins (recorded as primary); audit writes not atomic with the mutation they describe; hard-delete of inventory orphans history and DELETEs 500 on missing id; `toOperatorId`/`inventoryUnitId` unvalidated on transfer creation; unbounded/unvalidated pagination params (`pageSize` uncapped, `parseInt` with no NaN guard); several `await req.json()` without `.catch`; add-vehicles POST missing idempotency.
- ⚪ **Low** — raw `err.message` leaked to clients in several 500/409 paths; in-memory rate limiter is per-instance (scales N× on Cloud Run); 6-digit PIN is a small offline keyspace if a hash leaks.
- **S6 (open, lands with photos)** — `Photo.url` unvalidated (stored-XSS/SSRF) once capture exists.

*Verified false positive worth recording:* there is **no cost-field leak on `/api/vehicles`** — the `Vehicle` model has no financial fields. The real cost fields (`User.hourlyRate`, `InventoryItem.unitCost`, `MaintenanceTask.*Cost`) **are** correctly admin-gated. Add an explicit `select` whitelist on the vehicle GETs as defense-in-depth.

### 4B. Data model, offline & sync

- 🟠 **Multi-operator divergence (core risk).** Shared rigs + transfers + 7-day stale caches + **no optimistic-concurrency control anywhere** (no `updatedAt`/`If-Match`/version) + last-writer-wins. Two operators acting offline on the same unit/kit both succeed on replay; the later write silently overwrites. Idempotency keys prevent duplicate application of the *same* action but do nothing for *conflicting distinct* actions. **Fix:** add `If-Match`/`updatedAt` checks to unit/kit-item mutations, return 409 (queue already treats 409 as terminal/needs-attention).
- 🟠 **Replay of dependent writes referencing same-session server ids breaks.** If offline you add a unit (gets optimistic `pending-<id>`) then return it, the queued DELETE carries the optimistic id in its URL; on replay the server id differs → 404 → terminal fail → silent divergence. **Fix:** id remapping on replay, or causal chaining that blocks dependents.
- 🟠 **Migration history no longer matches production.** A "gap migration" reconstructs tables originally created via `db push` using `IF NOT EXISTS`/`DO $$ EXCEPTION` guards, and `sprint7_schema_gaps` is an empty migration papering over a push. The Wave 2A.5 migration is hand-authored and **not idempotent** — if any object already exists via push, it fails on apply. `prisma migrate status/diff` can no longer be fully trusted. **Fix:** baseline/reconcile migration history; never `db push` against shared DBs again.
- 🟠 **`onDelete: SetNull` on history/audit FKs destroys provenance.** `CheckLog.operatorId/projectId`, `Photo.*`, `MaintenanceTask.vehicleId/itemId` null out on parent delete — audit-log corruption for an asset-tracking system. Inconsistent soft-delete across entities compounds it. **Fix:** `Restrict` + uniform soft-delete policy.
- 🟡 Idempotency keys are never pruned (unbounded growth; eventual re-execution after manual deletion). `itemType`/`checklistJson` should be DB-typed. `qrCodeId @unique` + soft-delete means a retired item permanently reserves its QR code. `skipWaiting + clientsClaim` with **no update prompt** + 7-day NetworkFirst cache → silent app/data version skew; cached authed API responses aren't partitioned by user (risk on shared field devices). Silent write loss when IndexedDB is unavailable (iOS private mode). No "data as of …" freshness indicator anywhere.

### 4C. UX & cross-platform (per role)

**Operator**
- 🔴 No photo capture (see above) — blocks damage/inoperable/hand-off evidence.
- 🟠 Daily-check uses `enqueue` directly, not the `mutate` queue path — a *server* 4xx is shown inline and **lost** on navigation, unlike the rest of the app.
- 🟠 "Check Out / Check In" dashboard card is a mislabeled redirect to Scan; there's no real check-out screen and no nav entry for it.
- 🟡 No pending-transfer indicator on the landing dashboard (only inside My Rig); no notification feed; no operator-side "add secondary operator" (endpoint exists, wired only into admin UI).
- 🟡 "Failed action" dismissal is destructive/opaque (clears all failed items at once, no list, no per-item retry); optimistic state isn't rolled back on a failed queued action.

**Admin**
- 🔴 4 stub pages linked live (Vehicles, Maintenance, Projects, Reports). No fleet-vehicle management despite insurance/registration expiry alerts; no maintenance workflow UI despite a real DAT-5 backend; no reports/export despite cost data; no projects management.
- 🟡 Dashboard is a read-only number wall — 6 of 7 stat cards aren't clickable; alerts can be resolved but not investigated (no link to the offending unit, no resolution note); fetch errors are swallowed (permanent dashes, no retry).

**Hub operator**
- 🔴 No hub-centric view at all — no inbound/at-hub list, no return-receipt confirmation. Operators mark "Return to Hub" but nobody on the hub side can confirm receipt or see expected arrivals. Entire journey unsupported.

**Cross-platform / consistency**
- 🟠 iOS safe-area handled only on the offline page, **not in the real app shell** — notch/home-indicator collisions in installed PWA (the operator's primary mode).
- 🟠 Three different toast systems, multiple hand-rolled dialogs vs the shared `ConfirmDialog`, split return/disposition flows with different option sets and casing ("Needs maintenance" vs "IN_MAINTENANCE"), and the unresolved **"Rig" vs "Deployment" vs "Kit"** terminology split (even within one screen). `lib/status.ts` + `StatusChip` is a good single source of truth but isn't used everywhere, so labels will keep drifting.
- 🟡 QR is single-still-photo capture (no live video scanner, torch, or manual-entry fallback) — slow/error-prone in the field. Small touch targets (`size="small"` icon buttons) on the primary mobile screen. No mobile bottom nav (four destinations buried behind a hamburger). Deprecated MUI `<Grid item>` on the admin dashboard. Missing loading/empty states on admin Deployments and operator Dashboard.

### 4D. Delivery, deployment & testing

- 🔴 **CI is wired to the wrong branches.** `ci.yml` runs only on PRs whose **base** is `production` or `develop`; the repo deploys from `production`/`development` and CLAUDE.md says PRs target `main`. **Net effect: a PR to `main` runs no lint, no type-check, no tests.** (Verified directly.)
- 🔴 **Migrations are applied by hand from a laptop.** Neither the Docker image (`CMD node server.js`, no entrypoint) nor any deploy workflow runs `prisma migrate deploy`; the only path is a manual `make db-migrate` against the real DB before opening the PR. Forget it, or point `.env` at the wrong DB, and prod runs new code against an old schema. CI only does `db push`, so a malformed migration is never caught. **This is the schema-drift footgun the team already flagged but hasn't closed.**
- 🔴 **CLAUDE.md ↔ workflow contradiction:** CLAUDE.md says merging to `main` auto-deploys prod, but `deploy.yml` triggers only on push to `production`/`development`, **not `main`.** Either main isn't wired to deploy or the docs are wrong — a release-correctness bug. (Verified directly.)
- 🟠 CI never runs `next build` — build-only failures (Serwist/webpack/standalone) surface only at deploy. Deploy isn't gated on CI success. No `/api/health` (everything redirects to `/login`, so "deploy succeeded" only means "port opened"); no startup/liveness HTTP probe; no error monitoring.
- 🟠 **Test coverage is a thin slice:** ~8 cases across 4 files, all on the transfer/return inventory logic. **Auth/RBAC is mocked out everywhere** (zero real tests). No idempotency test, no offline/sync test, no E2E/device test. (Strength: test-DB isolation is genuinely excellent.)
- 🟡 Prod secrets are uploaded from a developer's local `.env` (no staging/prod separation, pinned to `:latest`). `NEXT_PUBLIC_*` supplied only at runtime risks `undefined` in the client bundle (Next inlines these at build). Node 22 (CI) vs 24 (prod). PR-staging previews disable the service worker, so offline behavior is never previewed. No `concurrency:` guard on deploy (racing deploys).

---

## 5. Consolidated risk register (prioritized)

| # | Risk | Domain | Sev | Pilot-blocker? |
|---|------|--------|-----|----------------|
| R1 | CI on wrong branches; deploy not gated; `next build` never run | Delivery | 🔴 | Yes |
| R2 | Migrations applied by hand; no migrate-on-deploy; CLAUDE.md/workflow contradiction | Delivery | 🔴 | Yes |
| R3 | Photo capture doesn't exist but damage/hand-off flows depend on it | UX/Product | 🔴 | Yes (for damage flows) |
| R4 | Consumable check-out race + silent over-promise (C1) | Correctness | 🔴 | Yes |
| R5 | No `/api/health` / startup probe; no error monitoring | Delivery | 🟠 | Yes |
| R6 | Multi-operator divergence: no optimistic-concurrency control | Data/Sync | 🟠 | Yes (for shared rigs) |
| R7 | OFF-3 real-device offline path unproven | Offline | 🟠 | Yes |
| R8 | Zero auth tests on the most security-critical code | Testing | 🟠 | Yes |
| R9 | Vehicle theft between rigs (H1); daily-check no ownership (H4); floating alert (H5) | Correctness | 🟠 | Yes |
| R10 | Dependent-write replay (`pending-` ids) → silent divergence | Offline | 🟠 | Strongly advised |
| R11 | Migration history ≠ production; non-idempotent hand-authored migration | Data | 🟠 | Strongly advised |
| R12 | Invite tokens plaintext (H2) + weak admin password (H3) | Security | 🟠 | Strongly advised |
| R13 | 4 admin stub pages linked live; no fleet/maintenance/reports UI | UX/Admin | 🔴 (scope) | No (but blocks admin value) |
| R14 | No outbound notification dispatcher (nothing reaches shops/hubs/processors) | Product | 🔴 (value) | No (but it's the core value) |
| R15 | No hub-operator UI / return-receipt handshake | UX/Hub | 🔴 (scope) | No |
| R16 | `onDelete:SetNull` audit-provenance loss; inconsistent soft-delete | Data | 🟡 | No |
| R17 | iOS safe-area in shell; touch targets; no bottom nav | UX | 🟡 | Advised before pilot |
| R18 | Three toast systems / dialog & terminology inconsistency | UX | 🟡 | No |
| R19 | SW `skipWaiting` no update prompt; 7-day stale; cache not user-partitioned | PWA | 🟡 | No |
| R20 | CSP Report-Only; per-instance rate limit; secrets from laptop | Security/Ops | 🟡 | No |

---

## 6. Roadmap interrogation & feature gaps

### 6.1 What the existing roadmap gets right

The documented sequence — Wave 2C (photos) → 2D (consistency) → Wave 3 (notifications, admin completeness, scheduled maintenance, sessions, deploy/infra, tests, scanner/conflicts, Deployment Requests) → Phase 3 (Deployment Map, Time-tracking/Invoicing) — is **well-reasoned and dependency-aware.** Photos-first is correct (it unblocks "done" damage flows). The notification dispatcher is correctly named the highest-leverage next investment. Sequencing the small Deployment Map before the seven-model invoicing build is right.

### 6.2 Where the roadmap is wrong or incomplete

1. **It under-weights the delivery pipeline.** R1/R2/R5 are scattered as "Wave 3 infra" items (W1/W2/W3), but they gate *everything* — a broken pipeline can negate any feature work. They belong **before** the next feature wave, not inside Wave 3.
2. **The hub operator is treated as a Deployment-Requests sub-feature, but the hub has an unmet need today** (no receive/inbound view, no return-receipt). Returns already happen; nobody can confirm them. A minimal hub view should land with notifications, not wait for the full Deployment Requests build.
3. **Sync conflict handling (R6/R10) is filed as a low-priority Wave 3 polish item** ("conflict resolution is bulk-dismiss only"). For a multi-operator, shared-rig, offline product this is a data-integrity issue, not polish, and should move up.
4. **The roadmap assumes photo capture is a hardening follow-up in places** — it's net-new build. (PRD v2.3 now corrects this, but the effort estimate should reflect "build," not "harden.")
5. **No explicit data-housekeeping track** (idempotency-key reaper, QR-code reuse on retirement, migration-history baselining). These are quiet time-bombs.

### 6.3 New feature opportunities and where they slot in

These came out of the audits as natural extensions of flows that already exist — each is described with its slot-in point so it reuses hardened paths rather than adding parallel ones.

- **Return-receipt handshake (hub).** Today an operator marks "Return to Hub" and the loop ends. Add a hub-side "confirm receipt" that flips the unit to AVAILABLE only on confirmation — and, as part of that confirmation, the hub performs a quick condition assessment on each item (e.g. Good / Needs maintenance / Inoperable) before it rejoins the available pool. A non-Good result routes the unit into the maintenance/inoperable lifecycle instead of back to AVAILABLE, so damage is caught at the door rather than discovered on the next deployment. This mirrors the per-item operable+presence quality check the hub already runs when *staging* equipment, keeping the receive and dispatch sides symmetric. *Slots into:* the existing disposition flow + a new minimal Hub view; reuses CheckLog / Alert / the DAT-5 maintenance path. **Now formalized as a named deliverable, F-R, in the execution plan (§7, Wave F)** alongside the notification dispatcher.
- **Operator notification feed + pending-transfer badge.** The landing dashboard shows no incoming transfer or admin flag. *Slots into:* the operator dashboard (currently hollow) + the notification dispatcher's in-app channel — one build serves both.
- **"Data as of HH:MM" freshness indicator.** SWR already exposes `dataUpdatedAt`; surface it in the AppShell. Cheap, and directly mitigates the stale-cache confusion behind R6/R19. *Slots into:* AppShell, alongside the existing offline/sync indicator.
- **`mustChangePin` enforcement screen.** The flag is already set and returned at login but never enforced, so admin PIN resets don't actually rotate. *Slots into:* the login flow as a forced interstitial. Small, security-relevant, already half-built.
- **Admin audit-log viewer.** `AccountAuditLog` is written but never surfaced. *Slots into:* the Team page or a Reports sub-tab. Turns an invisible compliance asset into a visible one.
- **Equipment utilization & cost report.** Fills the Reports stub with something concrete: check-out frequency, days-out, maintenance spend per asset, cost-of-downtime. *Slots into:* the Reports page using existing CheckLog + MaintenanceTask + cost data (admin-gated). **Now formalized as a named deliverable, E-R, in the execution plan (§7, Wave E)** rather than left as a loose idea.
- **Bulk QR generation/printing workflow.** QR association-on-create exists, but onboarding a hub of equipment one item at a time is slow. *Slots into:* Settings/Inventory as a batch action.
- **Idempotency-key reaper + QR-reuse-on-retire.** Housekeeping cron + a partial-unique-index change so retired QR codes can be reissued. *Slots into:* the same scheduled-task infrastructure the notification dispatcher's cron triggers will introduce.
- **Condition acknowledgment on hand-off.** When a Deployment is handed between operators, capture the receiving operator's condition sign-off (and, once photos exist, a photo). *Slots into:* the existing handoff/`DeploymentAssignment` flow. **Now formalized as a named deliverable, H-A, in the execution plan (§7, Wave H).**

---

## 7. Staged execution plan

Sequenced by dependency and risk. Each wave is independently shippable. Estimates are rough order-of-magnitude for one focused developer; treat as relative sizing, not commitments. **I will pause for your go-ahead before writing any code.**

### Wave A — Pre-pilot hardening (BLOCKER) · ~1–1.5 weeks
*Goal: make it safe to deploy and safe to put in a field crew's hands. Nothing else ships until this is green.*
- **A1 (R1/R3-contradiction):** Reconcile branch names across `ci.yml`/`deploy.yml`/CLAUDE.md; run lint+type-check+test+`next build` on every PR to the real base branch; gate deploy on CI success; add `concurrency:` guard.
- **A2 (R2):** Move `prisma migrate deploy` into the release path (pre-deploy job using `DIRECT_URL` from Secret Manager, or a guarded entrypoint). Retire the manual-laptop step from CLAUDE.md.
- **A3 (R5):** Add unauthenticated `/api/health` with a DB ping; wire a Cloud Run startup/liveness HTTP probe.
- **A4 (R4/R9):** Fix C1 (consumable race + over-promise), H1 (vehicle cross-rig), H4 (daily-check ownership), H5 (floating/duplicating alert).
- **A5 (R8):** First auth tests — PIN lockout, session expiry/revocation, invite claim/last-admin guardrail, RBAC on a representative set of routes.
- **A6 (R7):** Real-device OFF-3 pass (submit each converted write offline → reconnect → confirm single clean sync, no dupes) on iOS + Android.

### Wave B — Photos end-to-end (BLOCKER for damage flows) · ~1 week
In-app capture → 1200px/JPEG-85 compression → offline blob store (separate from the JSON queue) → signed upload to a **private** Supabase bucket on sync → `Photo` rows with validated URLs (closes S6). Enforce damage-photo-required where the flows already assume it. *Unblocks several "done" features.*

### Wave C — Sync integrity + consistency unification · ~1–1.5 weeks
- **C1 (R6):** Optimistic-concurrency control (`updatedAt`/`If-Match` → 409) on unit/kit-item mutations.
- **C2 (R10):** Id remapping (or causal chaining) so dependent offline writes survive replay.
- **C3 (R18/R17):** One mutation pipeline, one response envelope, one vocabulary (`lib/status.ts` everywhere; rename "My Rig" → "My Deployment"), collapse the three toast systems and hand-rolled dialogs into the shared primitives; apply iOS safe-area in the app shell, fix touch targets, add mobile bottom nav. Folds in operator punch items #9–#15.
- **C4 (R19):** SW update prompt instead of silent `skipWaiting`; "data as of …" freshness indicator; partition cached authed API responses by user.

### Wave D — Security & data-hygiene tail · ~3–5 days
H2 (hash invite tokens), H3 (admin password strength), `mustChangePin` enforcement screen, flip CSP to enforcing (after observing `/api/csp-report` on staging), shared-store rate limiting + `X-Forwarded-For` fix, idempotency-key reaper, migration-history baseline/reconcile (R11), `onDelete` provenance fix + uniform soft-delete (R16).

### Wave E — Admin completeness · ~1.5–2 weeks
Build the four stub pages: **Vehicles** (fleet CRUD, insurance/registration expiry actions), **Maintenance** (drive the DAT-5 backend; scheduled + breakdown views), **Projects**, and **Reports**. Make dashboard stat cards clickable; add the §11.1 feeds (missed checks, maintenance-due, checked-out, last-10 activity) and pinned-alert banner; link alerts to the offending unit + resolution note; surface the `AccountAuditLog`. Fill the operator dashboard with live data + pending-transfer badge + notification feed.

- **E-R — Equipment utilization & cost report (named deliverable).** This is the substance behind the Reports stub and is broken out so it's planned, not assumed. Scope: per-asset check-out frequency and days-out, utilization rate (days deployed ÷ days owned), maintenance spend per asset, and cost-of-downtime; filterable by hub, project, category, and date range; exportable (CSV first, PDF later). Admin-gated, built entirely on existing `CheckLog` + `MaintenanceTask` + cost data — no schema change. It directly serves the PRD's "25%+ reduction in unplanned repair spend" success metric by making spend and underused assets visible. Sized at ~2–3 days within the Wave E envelope; if Wave E runs long, it can split into its own short follow-on wave without dependencies on the other three pages.

### Wave F — Notification dispatcher (highest business leverage) · ~1.5–2 weeks
One escaped channel for all six alert types over email + push; cron triggers for overdue/not-returned/expiry; in-app notification center; per-admin/per-type routing; **external delivery** — maintenance-shop work orders and the invoice→processor loop (the external piece is designed in here but can land in a later increment without blocking the internal alerting that serves the success metrics).

- **F-R — Hub receive/inbound view + return-receipt handshake (named deliverable).** A minimal hub-centric view (what's at / inbound to this hub) plus a hub-side "confirm receipt" that flips a returned unit to AVAILABLE only on confirmation. As part of confirmation the hub runs a quick per-item condition assessment (Good / Needs maintenance / Inoperable); a non-Good result routes the unit into the maintenance/inoperable lifecycle instead of back to AVAILABLE, catching damage at the door. *Slots into:* the existing disposition flow + the new hub view; reuses CheckLog / Alert / the DAT-5 maintenance path, and shares the same condition vocabulary as the hand-off acknowledgment (Wave H, H-A) and the hub staging quality check — every condition checkpoint stays consistent. Sized at ~3–4 days within the Wave F envelope.

### Wave G — Scheduled maintenance loop + mileage trigger · ~1 week
Mark-complete → recalc `nextDue` → preserve history → spawn next task; daily-check odometer → Due-Soon/Overdue. Builds on Wave E's Maintenance UI and Wave F's dispatcher.

### Wave H — Deployment model refactor + Deployment Requests + Hub fulfillment · ~2–3 weeks
`Deployment↔Project` M2M (`DeploymentProject`), `DeploymentAssignment` handoff history, then the full request→stage→check-out lifecycle with `RESERVED` status, `DeploymentRequestLine`, `HubAssignment`, and the full hub fulfiller UI. Two increments (in-app, then push/email). Trusted-device/30-day-idle session model lands here too.

- **H-A — Condition acknowledgment on hand-off (named deliverable).** When a Deployment is handed between operators, the receiving operator records a condition sign-off on the Rig's vehicles and key items (and, once photos exist, a photo) before the handoff closes. This makes "what state was it in when I took it" explicit, so disputes and undocumented damage don't fall between operators. *Slots into:* the `DeploymentAssignment` handoff flow being built in this wave; reuses CheckLog / the DAT-5 maintenance path and the same condition vocabulary as the hub return-receipt (Wave F, F-R) — keeping every condition checkpoint in the system consistent. Sized at ~2–3 days within the Wave H envelope.

### Phase 3 — Scale capstones (Q4 2026)
Deployment Map (GPS on `DailyCheck`, Mapbox, recency pins) first; then Time-tracking/Invoicing (seven models, PDF generation, approval→auto-email); live camera scanner + manual-entry fallback; advanced cost reporting; QR-only no-app web form; contractor self-onboarding; React Native wrapper.

---

## 8. Open decisions for Max

1. **Pilot gating:** confirm that no field pilot runs before Wave A is green. (Strongly recommended.)
2. **Multi-operator model:** are shared rigs (two operators, same rig, both offline) a real near-term scenario? If yes, Wave C's OCC work is a blocker; if rigs are effectively single-operator until handoff, it can move later.
3. **External delivery scope for Wave F:** do maintenance shops get email work orders only, or also a no-login status link? Does the invoice→processor loop need to be in the first dispatcher increment or can it wait for Phase 3 invoicing?
4. **Migration-history reconciliation:** are you willing to baseline the Prisma migration history (one-time, coordinated) to end the `db push` drift, or must we keep working around it?
5. **Terminology:** confirm the "My Rig" → "My Deployment" rename (it touches operator-facing copy and any training material).

---

---

## 9. Session 4 execution log & newly tracked items

**Merged to `development` and verified on staging:**

- **Correctness blockers C1/H1/H4/H5** — fixed on `feature/20260618/maxwellslater-wave-a-correctness`, merged via **PR #34** (commit `4c75a82`), with regression tests (`tests/wave-a-correctness.test.ts`, full suite 15/15 green) and **verified live on staging**: daily-check 403/201, deployment-create vehicle conflict 409, add-vehicle 409, and the serialized-vs-consumable reservation logic.
- **A1 — CI/deploy gating** (commits `50c1ab6`, `b46a5b5`) — `ci.yml` trigger fixed (`develop` → `development`); shared reusable `verify.yml` (lint + type-check + build + tests) gates both PRs and deploys; `concurrency` guards added; `CLAUDE.md` corrected (no `main`; `development`→staging, `production`→prod). *Note: CLAUDE.md's "migrations are manual" line (§Notes) goes stale once the A2 redo merges — update it then.*
- **A2 — migrate-on-deploy — built → reverted → redone (branch, pending merge).** First build added `verify → migrate → deploy` + `make cloud-run-migrate`. It failed in CI (P1001): Supabase **direct** connections are IPv6-only and GitHub Actions runners are IPv4-only, so the migrate job couldn't reach the DB. The job was removed from `deploy.yml` to unblock deploys (commit `33413e5`). It was then **redone correctly** on branch `feature/20260618/maxwellslater-a2-session-pooler` (commit `6583aaf`, pushed, **PR pending**): the migrate job now reads `AHITS_MIGRATE_URL` — the Supabase **session pooler** (IPv4, port 5432, session mode), validated via `prisma migrate status`. **Gated on creating the `AHITS_MIGRATE_URL` secret + SA grant before merge.** Until merged, migrations remain manual (`make db-migrate`).
- **A3 — health endpoint + startup probe** — `GET /api/health` (DB ping, unauthenticated, in `proxy.ts` allowlist) on branch `feature/20260618/maxwellslater-wave-a3-health` (commit `c14a9c3`, pushed, **PR pending**), plus a Cloud Run **HTTP startup probe** on `/api/health` applied imperatively to the live staging service (replaced the old TCP-port probe; **not codified in the repo** — re-apply if a service is recreated, and apply to prod when it's created). New instances must reach the DB before receiving traffic — this would have caught the `itemType` drift 500s at the instance level.
- **DAT-5/DAT-7 drift reconciliation** — the staging 500s were caused by `itemType`/`ResolutionPath` enums (plus `Alert.activeKey`, indexes) that were `db push`ed onto the shared DB and deployed but never merged into `development` or captured in a migration. Resolved by restoring the migration files (`20260618190000_maintenance_lifecycle`, `20260618200000_dat7_schema_hardening`), `migrate resolve --applied` on the DB, and forward-porting the canonical schema (enums + `MaintenanceTask` fields + `Alert.activeKey` + `binaryTargets`). Migration history now reconciled (11 migrations, no drift); all staging endpoints return 200.
- **Infrastructure-ownership discovery** — the production database (`psdamtaqegltlcavvfqh` / "ahits-ps", region `us-east-1`) was found to live in the **contractor's Supabase org (Orobo Consulting)**, not Max's account. Max has since been granted **Owner** access. The project still sits in the contractor's org (see carry-forward).

**Built, on branches, PR/merge pending:**

- **A3** — `feature/20260618/maxwellslater-wave-a3-health` (`c14a9c3`, pushed). Open a PR → `development`.
- **A2 redo** — `feature/20260618/maxwellslater-a2-session-pooler` (`6583aaf`, pushed). Open a PR → `development`, **after** the `AHITS_MIGRATE_URL` secret + SA grant exist.
- *Working-tree note:* the A2 branch's checkout carries a stray, uncommitted A3 `proxy.ts` edit + untracked `src/app/api/health/` (leakage from branch-switching in a shared checkout). The **committed** A2 branch is clean. When committing on the A2 branch, stage explicitly (`git add .github/workflows/deploy.yml Makefile`) — **never `git add -A`**, or you'll bundle the A3 change into the A2 PR.

**Newly tracked items (carry forward):**

- **🔴 Rotate the exposed DB password** — the Supabase `postgres` superuser connection string was exposed in plaintext during diagnosis. Now that Max has Owner access, rotate it in the dashboard, update `AHITS_DATABASE_URL` / `AHITS_DIRECT_URL`, and **redeploy staging** (Cloud Run resolves secrets at deploy time — running instances hold the old password until redeployed). Confirm via `curl …/api/health` → 200. *(In progress.)*
- **🟠 Create `AHITS_MIGRATE_URL` secret + grant SA** — the session-pooler string (5432, session mode, rotated password) as a new Secret Manager secret, with `roles/secretmanager.secretAccessor` for the deployer SA. **Gates the A2-redo merge** — the migrate job reads it on the first post-merge deploy.
- **🟠 Update CLAUDE.md after A2 redo merges** — the §Notes line still says migrations are manual / automation is "a tracked item"; once A2 redo lands, migrations auto-apply via the session pooler (manual `make db-migrate` becomes the fallback).
- **🟠 Regain full ownership of the stack** — Supabase Owner access is granted, but the project still lives in the **contractor's org (Orobo Consulting)** with `alsigman@gmail.com` as a co-Owner. Transfer the project to Max's own Supabase org and remove contractor access. Confirm/transfer Owner on the rest of the stack too: **GCP project + billing, domain/DNS, GitHub repo/org, Resend** (email).
- **🟠 Stand prod up with its own database** — prod (`ahits-web-app`) is **not deployed yet**; only staging exists. The deploy config injects the same `AHITS_*` secrets regardless of service, so a first prod deploy would share staging's DB. Fix at creation: give prod its own Supabase project + secret set, and apply the `/api/health` startup probe to the prod service then.
- **🟡 Root-cause process fix** — `db push` to shared databases + unmerged feature branches caused the drift. Stop `db push` against shared DBs; everything goes through migrations. Until the A2 redo merges, apply `make db-migrate` manually before merging any schema PR — the only safeguard against another drift incident.
- **⚪ Residual cosmetic drift** — a few `check_logs`/`inventory_units` indexes exist on the DB but not in migrations (no runtime impact); capture in one follow-up migration if a perfectly clean `migrate diff` is wanted.

**Wave A scorecard:** A1 ✅ merged · A4 (C1/H1/H4/H5) ✅ merged+verified · DAT-5/DAT-7 drift ✅ resolved · A3 ✅ built (PR pending) · A2 redo ✅ built (PR pending, gated on secret) · **A5 (first auth tests) ⬜ not started** · **A6 (real-device offline pass) ⬜ not started (needs a physical device).**

---

*This document is a snapshot for Session 4 planning. Findings were produced by independent audits and the highest-stakes items (CI/deploy wiring, photo capture, consumable race) were verified directly against source. File paths reference the repo root.*
