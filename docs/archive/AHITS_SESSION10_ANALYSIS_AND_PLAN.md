# AHITS — Session 10: State Analysis, Two New Workstreams, and Execution Plan

_Prepared 2026-06-24. A from-source re-analysis of the application following Session 9, an interrogation of the codebase for risk, two net-new workstreams folded into the roadmap (**Shippo shipment-tracking integration** and **operator read-only visibility**), and the execution record for the work started this session (the **#29 deployment-model refactor**). This document is additive to — not a replacement for — `AHITS_ROADMAP_THROUGH_PHASE3.md` (the ordered plan) and `AHITS_CONSOLIDATED_TRACKER.md` (the risk register); where it disagrees with them on current state, this document is the more recent reading._

---

## 0. How this session was scoped

You asked for three things: a full, honest analysis of where the app actually is; resolution of outstanding issues and a path to finish the roadmap; and to begin executing — with two new elements woven in (Shippo, and operator read-only visibility into seven pages). After building context from source, three decisions were confirmed with you to avoid spending effort in the wrong direction:

- **Build focus this session:** the **#29 deployment-model refactor** — the roadmap's explicit "do first" foundational item.
- **Operator-visibility architecture:** a **shared read-only mode** threaded through the existing admin pages (one source of truth, no duplicate UI).
- **Delivery:** a **PR to `development`** following the documented `feature/<date>/<user>-<desc>` flow.

The analysis and both feature designs below are delivered regardless of build focus; the code work this session is the #29 foundation (§8).

---

## 1. Executive summary

AHITS is a mature, offline-first PWA for tracking field equipment from the Home Lab to operators and back, built on Next.js (App Router) + Prisma + Postgres (Supabase), deployed to Cloud Run via GitHub Actions. The expensive, load-bearing half — the offline operator loop, single-source inventory truth, the maintenance lifecycle, the notification dispatcher, and the tokenized external-link primitive — is built and hardened. As of Session 9 the integrated tree is green (`tsc` 0 / `lint` 0, 24 linear migrations) on `development` and live on staging.

What remains clusters into: **three operational pilot gates** (production DB standup, migrate-on-deploy automation, real-device offline pass), the **deployment-model refactor (#29)** that the rest of M6 and several Phase-3 items depend on, the **hub fulfillment** external portal, and the **Phase-3 capstones** (Deployment Map, Time/Invoicing, no-app QR form). The single biggest *latent* risk is not a feature gap — it is **process**: a `db push` against a shared database caused a prior staging outage, and the migrate-before-code-lands ordering remains manual. Both new workstreams you asked for are well-supported by the existing architecture and slot in cleanly: operator read-only visibility is unusually cheap here because the read APIs already authorize any authenticated user; Shippo reuses the same dispatcher + webhook patterns already in place.

The honest one-line status: **pilot-ready on features, blocked on three operational gates; the codebase is healthy, the delivery process is where the residual risk lives.**

---

## 2. How I derived current state (method)

I did not trust the planning docs as ground truth — Session 9 itself opened by finding the docs stale. State here is re-derived from source: the Prisma schema (24 migrations, `schema.prisma`), the route handlers under `src/app/api`, the auth/session and proxy layers, the admin and operator page trees, the shared component library, and the git history (branch + commit log). The planning trail (`AHITS_PRD_v2.md`, the addendum, the independent assessment, the Wave 1/2 and Session 4/5/9 records, the consolidated tracker, the roadmap) was read for intent and cross-checked against the code. Where the tracker (dated 2026-06-22) lists a risk that the code has since closed, that is flagged in §4.

Build toolchain was verified live in the analysis sandbox: `tsc --noEmit` exits 0 and the generated Prisma client is present. The one constraint that shapes execution: the Prisma engine download is firewalled in the build sandbox, so the generated client cannot be regenerated here — new tables are reached via raw SQL (`$queryRaw`/`$executeRaw`), the same discipline Sessions 5–9 used. CI (which regenerates) remains the schema-validation source of truth, and `make db-generate`/`make db-migrate` are your-local-machine steps per `CLAUDE.md`.

---

## 3. Current state of the application

### 3.1 Architecture at a glance

- **Framework:** Next.js App Router with three route groups — `(auth)` (login/setup), `(operator)` (`/operator/*`), `(admin)` (`/admin/*`) — plus the public tokenized `/s/[token]` external-link surface.
- **Auth:** PIN/password → HS256 JWT in an httpOnly `ahits_session` cookie (24h). `src/proxy.ts` (Next middleware) gates by role at the edge; `(admin)/layout.tsx` re-checks `role === 'ADMIN'` server-side. `getSession()` re-validates the JWT against the DB on **every request** (isActive, tokenVersion, role, mustChangePin) so suspend/force-logout/demote/forced-PIN-reset take effect immediately. `requireAuth()` = any logged-in user; `requireAdmin()` = ADMIN only.
- **Data:** Prisma over Postgres. ~30 models. Newer additive tables (status links, checklist templates, hub email, deployment requests, rate-limit store, notification config, idempotency) are deliberately reached via raw SQL so they need no client regen and touch no existing model.
- **Offline:** IndexedDB durable queue with idempotent replay (`useOfflineQueue`, `lib/idempotency.ts` with CR-2 body-hash binding), service worker, offline photo blob stashing with upload-on-reconnect.
- **Notifications:** cron-driven dispatcher (`/api/cron/dispatch`, secret-gated) → admin email (Resend) + in-app bell, idempotent via `Alert.notifiedAt` + `Notification` unique constraint.
- **External delivery:** the **tokenized StatusLink primitive** — a capability URL granting one external party (shop/hub/processor) scoped, time-bounded, login-less write-back to one record; only `sha256(token)` is stored. This is the most strategically valuable primitive in the codebase: it already backs work-order links and hub-return receipts, and is the natural substrate for the invoice loop, the no-app QR form, and condition-acknowledgment.

### 3.2 What is built and hardened

The inbound operator loop (checkout → daily check → damage report → transfer → end deployment) is built, offline-capable, and idempotent. Inventory is single-source with serialized-unit and consumable-quantity accounting (the consumable double-spend, CR-1, is closed via `KitItem.drawnQuantity` restoring exactly what was drawn). The maintenance lifecycle — damage report → admin Maintenance inbox → shop/hub assignment → repair tracking → per-case return destination (Addendum §A.4) → recurrence roll-forward — is complete. The full ~16-item daily checklist with required failing-item notes, per-vehicle-type custom checklists, photo gallery + lightbox, and the maintenance-spend dashboard nudge all landed in M5. The notification dispatcher and the tokenized outbound link are live and verified on staging.

### 3.3 Phase completion (re-read, Session 10)

| Phase (PRD) | Status | Note |
|---|---|---|
| Phase 1 · Foundation | ~95% | Stable; residual is hygiene + the M0 operational gates. |
| Phase 2 · Core Operations | ~88% | M5 complete; M6 hub-fulfillment + requests underway; #29 is the keystone left. |
| Phase 3 · Scale & Polish | ~3% | Mileage trigger shipped early; GPS/map not seeded; Time/Invoicing not started. |
| **Pilot readiness** | **3 operational gates** | Prod DB standup, migrate-on-deploy, A6 real-device offline pass. |

### 3.4 The seven surfaces operators will get read-only visibility into (today's reality)

All seven targets already exist as admin pages, and — importantly — most of their **read** APIs already authorize any authenticated user (`requireAuth`, not `requireAdmin`), e.g. `GET /api/inventory` and `GET /api/deployments`. The gate keeping operators out today is the **route group** (`/admin/*` redirect in `proxy.ts` + the admin layout role check) and the **UI controls**, not the data layer. That asymmetry is what makes the read-only-visibility feature unusually cheap here (see §6).

---

## 4. Risk & gap interrogation

This is the part you asked me to be most thorough on: weak spots, missing gaps, risks, and the things not yet discussed. I separate what is **genuinely still open** from what the older tracker lists but the code has since **closed**, because conflating the two is itself a project risk.

### 4.1 Already closed since the 2026-06-22 tracker (verify, then retire the rows)

The consolidated tracker predates Sessions 5–9 and over-states open risk. Cross-checked against migrations and source, these are **done** and the tracker rows should be marked resolved:

- **CR-1 / CR-1a** consumable double-spend — closed by `KitItem.drawnQuantity` (migration `…230000_kititem_drawn_quantity`) + symmetric restore in checkout/return.
- **CR-2** idempotency body-hash binding — closed (`IdempotencyKey.bodyHash`, migration `…230000_idempotency_body_hash`).
- **CR-3 / CR-4** in-memory rate limiter / spoofable XFF — shared-store limiter shipped (`RateLimitHit`, migration `…190000_rate_limit_shared_store`). _Verify the trusted-XFF pin is actually wired before public `/s/` traffic — see 4.2._
- **CR-5** `createAlert` TOCTOU — closed via `Alert.activeKey` unique upsert.
- **CR-8** hard-delete FK 500s — soft-delete (`deletedAt`) on Vehicle/Maintenance landed (migration `…220000_soft_delete_vehicle_maintenance`); confirm Inventory is covered too.
- **UX-1/2/3/6/12** admin stubs, transfer notifications, photo capture, offline-failing primary paths, alert→record deep links — all addressed across Waves B/E/F and M1.
- **N-PIN / mustChangePin** — change-PIN screen + enforcement + discoverable nav entry shipped (PR #63/#69).

**Action:** a 30-minute pass to reconcile the tracker against this list, marking resolved rows with "verified from source 2026-06-24," would remove the most misleading artifact in the repo.

### 4.2 Genuinely open — operational / pilot-blocking (highest severity)

1. **No production database (PIPE-2).** Prod would currently share staging's DB and secrets. This is a true footgun — until prod is stood up with its own Supabase project and eleven `AHITS_PROD_*` secrets, you cannot pilot for real. Code is ready (`Makefile SECRET_NS`); this is your-hands execution per `AHITS_PIPE2_PROD_DB_RUNBOOK.md`.
2. **Migrate-on-deploy is manual (A2/PIPE-1).** `deploy.yml` and the Docker image do **not** run migrations. A revision referencing a not-yet-applied table errors at runtime — this has bitten three times. The fix (an authenticated `make cloud-run-migrate` step before deploy) is the single highest-leverage operational change left.
3. **A6 real-device offline pass (PIPE-3).** The full operator loop has never been signed off on real iOS + Android hardware, specifically Safari private-mode IndexedDB eviction (the silent queued-write-loss risk), offline deployment-create, queued-photo upload-on-reconnect, and transfer-blocked-offline messaging.
4. **Confirm CR-3/CR-4 trusted-XFF pin is live.** The shared-store limiter exists, but the public `/s/` links are the only unauthenticated write surface; confirm `clientIp()` is pinned to Cloud Run's trusted-proxy position before shops use links heavily.

### 4.3 Genuinely open — correctness / consistency (medium)

- **`VehicleType` duplicated in 4 files** (`lib/checklist-templates.ts`, `lib/deployment-requests.ts`, `ChecklistTemplatesSection.tsx`, `requests/page.tsx`) — correct but drift-prone. Centralize into one `@/types` export. (Carry-over from Session 9.)
- **Dashboard "missed checks" semantics** — confirm per-operator keying and that `submittedAt` = sync time matches PRD intent (flagged by Session 9's adversarial review; pre-existing).
- **Two active rigs per operator** — guarded on create (`OPERATOR_HAS_ACTIVE_RIG`) but **not** by a DB constraint; the transfer-accept path (CR-14) still lacks a partial unique index `(operatorId) WHERE endedAt IS NULL`. The #29 refactor is the right moment to add this as a real invariant.
- **Stray `Installation directory…` folder** in the repo root from a gcloud install attempt — untracked junk the sandbox can't delete; remove locally.
- **Raw-SQL tables aren't type-checked against the schema** — a deliberate trade for not regenerating the client in-sandbox, but it means CI is the only guard. Once prod migrate-on-deploy lands, a periodic `prisma generate` + typed-client migration of these access layers would remove the foot-gun.

### 4.4 Cross-role gaps (the part "not yet discussed")

You asked me to consider every party — operator, admin, and the external recipients. The under-served edges:

- **Operators are blind to the big picture.** Today an operator sees only their own rig + daily check; they cannot see inventory availability, where a teammate's deployment is, or whether a vehicle they need is in maintenance. This is exactly the gap your read-only-visibility request closes — and it has a real operational payoff: fewer "is X available?" radio calls to the admin.
- **Maintenance shops** receive a tokenized work-order link but there is no structured parts/labor cost capture coming back — only a free-text status. Fine for v1; a Phase-3 enhancement.
- **Hub operators** get the internal admin oversight view (shipped M6) but the **external login-less hub portal** (door-side condition check on inbound units) is still scoped, not built — it's the natural consumer of the Shippo inbound signal (see §5).
- **Invoice processors** (Phase 3) are a designed-but-unbuilt StatusLink consumer (`INVOICE` type already in the enum).

### 4.5 Device / platform / offline matrix (explicit)

| Surface | Desktop web | Android (Chrome PWA) | iOS (Safari PWA) | Offline |
|---|---|---|---|---|
| Operator loop | Works | Primary target; works | Works; **IDB eviction risk** in private mode | Durable queue + idempotent replay; **untested on real hardware (A6)** |
| Admin pages | Primary target | Usable, not optimized | Usable, not optimized | Read-only-ish; not designed offline |
| Push notifications | Email + in-app bell | Web Push possible (parked) | **iOS 16.4+ PWA Web Push** parked pending A6 | n/a |
| Tokenized `/s/` links | Works (any browser, no install) | Works | Works | n/a (external party online) |

The two new features must respect this matrix: operator read-only views inherit the operator app shell (bottom-nav, ≥44px targets, safe-area) and must degrade gracefully offline (show "data as of HH:MM," not a crash); Shippo is server-side + webhook, so it is unaffected by client connectivity but its *surfacing* (a tracking chip on a maintenance/return record) must render offline from last-synced data.

---

## 5. New workstream A — Shippo shipment-tracking integration (Phase 3)

**Goal.** Track shipments from the field back to the Home Lab (and Home Lab → shop → hub) inside AHITS, so "where is this unit right now and when does it arrive?" is answerable without leaving the app. This is the missing physical-transit leg between the `IN_TRANSIT` status the schema already models and the hub-receipt confirmation the StatusLink already captures. It is correctly a **Phase 3** item; it depends on nothing in #29 and can be built in parallel once the pilot gates are green.

### 5.1 Why it fits cleanly

AHITS already has every primitive Shippo needs to plug into: an outbound notification dispatcher, a tokenized external-link surface, an `EquipmentStatus.IN_TRANSIT` state, `ReturnDestinationType` (HUB/DEPLOYMENT/OTHER_HUB) on maintenance close, and a `Hub` model with addresses. Shippo is additive — a new `Shipment` model plus a webhook endpoint — and follows the exact raw-SQL + secret-in-Secret-Manager pattern the codebase already uses.

### 5.2 Data model (additive, raw-SQL access — no client coupling)

```
model Shipment {
  id                String          // cuid
  provider          String          // 'SHIPPO'
  shippoObjectId    String?         // Shippo transaction/shipment id
  trackingNumber    String?
  carrier           String?         // 'usps' | 'ups' | 'fedex' | ...
  status            ShipmentStatus  // UNKNOWN/PRE_TRANSIT/TRANSIT/DELIVERED/RETURNED/FAILURE
  statusDetail      String?
  etaAt             DateTime?
  lastEventAt       DateTime?
  trackingUrl       String?         // Shippo-hosted public tracking page
  // Polymorphic subject — exactly one set:
  maintenanceTaskId String?         // SHIP_TO_HUB / SHIP_FOR_REPAIR / repair return
  inventoryUnitId   String?         // a unit physically in transit
  hubId             String?         // destination hub
  fromAddressJson   Json?
  toAddressJson     Json?
  createdById       String
  createdAt         DateTime
  updatedAt         DateTime
}
enum ShipmentStatus { UNKNOWN PRE_TRANSIT TRANSIT DELIVERED RETURNED FAILURE }
```

`Shipment` is intentionally polymorphic the same way `StatusLink` is, so a single tracker serves repair-ship, hub-return, and (later) deployment-stage transit.

### 5.3 Integration surface

1. **Outbound register.** When a maintenance task is set to `SHIP_TO_HUB`/`SHIP_FOR_REPAIR`, or a hub-return is initiated, register tracking with Shippo. Two modes: (a) **track an existing tracking number** (`POST /tracks` — the common case, operator/shop already has a label) and (b) optionally **buy a label** (a later enhancement; out of scope for the first cut). Store the `Shipment` row, flip the unit to `IN_TRANSIT`.
2. **Webhook ingest.** `POST /api/webhooks/shippo` — a new **public** path (add to `proxy.ts PUBLIC_PATHS`, but **HMAC-verify** the Shippo signature; do not rely on obscurity). On `track_updated`, update the `Shipment` row (status, ETA, last event) and, on `DELIVERED`, raise the existing tokenized **HUB_RETURN** receipt flow / clear the `IN_TRANSIT` flag pending hub confirmation. Idempotent on Shippo event id.
3. **Polling fallback.** A cron step (reuse the dispatcher's secret-gated cron) reconciles any `Shipment` in a non-terminal state older than N hours, for the case a webhook is missed — same belt-and-suspenders pattern the notification dispatcher uses.
4. **Surfacing.** A small **tracking chip** (`StatusChip`-style) on the Maintenance task detail, the unit detail, and the admin Hubs inbound view — carrier + status + ETA, linking to `trackingUrl`. Renders from last-synced data so it is offline-safe. Optionally a dashboard feed: "arriving today / overdue in transit."
5. **Alerting.** A new `AlertType.SHIPMENT_EXCEPTION` (carrier reports `FAILURE`/return-to-sender) and `SHIPMENT_DELAYED` (past ETA, still in transit) routed through the existing dispatcher → admin email + bell. This directly serves the PRD's "zero equipment missing > 24h" metric by making a stuck shipment visible.

### 5.4 Secrets, security, ops

- `AHITS_SHIPPO_API_TOKEN` and `AHITS_SHIPPO_WEBHOOK_SECRET` created in Secret Manager **before** the deploy that mounts them, and added to the `--set-secrets` line in the `Makefile` (per the non-negotiable DB/secret ordering rules).
- Webhook endpoint is public but **signature-verified**; rate-limited via the shared-store limiter; treats the body as untrusted.
- No PII beyond shipping addresses (already in `Hub`/shop records). Tracking URLs are Shippo-hosted; we store the id and surface the link.

### 5.5 Roadmap placement

Phase 3, sequenced **after** the Map (smallest capstone) and **alongside/independent of** Time/Invoicing. Effort: 1 model + 1 webhook + 1 cron step + 1 client lib + chips/alerts ≈ a focused 1–2 session slice. Reuses the dispatcher and StatusLink patterns, so it is materially cheaper than a from-scratch integration. **Decision needed:** track-only first cut (recommended) vs. label-purchase in scope (defer).

---

## 6. New workstream B — Operator read-only visibility (shared read-only mode)

**Goal.** Operators get full visibility into seven surfaces — **Dashboard, Inventory, Deployments, Vehicles, Maintenance, Hubs, Projects** — to see the whole operational picture, with **read-only** permissions on every one. No operator can mutate anything on these pages.

### 6.1 Chosen architecture: one shared read-only mode

We render the **same** pages operators and admins see, gated by a single role-aware `readOnly` signal, rather than duplicating seven pages or opening `/admin` wholesale. This is the most consistent with your "every element speaks to one another" goal: one source of truth, one look, zero drift. The design has three layers, defense-in-depth:

**Layer 1 — Routing & shell.** Operators reach these surfaces under the **operator** information architecture (so the app shell, bottom-nav, and mobile ergonomics are inherited), e.g. `/operator/inventory`, `/operator/vehicles`, etc., OR — simpler and preferred — a shared route group that renders the existing page components with a `readOnly` context. `proxy.ts` and the layout grant operators access to exactly these seven view routes and nothing else (Users, Settings, Requests-write remain admin-only).

**Layer 2 — UI capability gating (the visible half).** A single `useCanEdit()` / `<ReadOnlyProvider>` context exposes `canEdit` (true only for ADMIN on these pages). Every mutating control — "Add," "Edit," "Delete," "Assign," "Resolve," "Start deployment," "Mark complete," form submits, drag handles — reads `canEdit` and renders **hidden or disabled-with-tooltip** ("View only"). To make this consistent and non-drift-prone, mutating controls are funneled through a small set of shared primitives (`<EditAction>`, `<MutationButton>`) that respect `canEdit` centrally, rather than each page checking the role ad hoc.

**Layer 3 — API authorization (the load-bearing half).** UI hiding is not security. Every **write** route for these resources must reject operators server-side. Good news from the audit: the write routes already use `requireAdmin()` (which 403s operators), and the **read** routes already use `requireAuth()` (which operators pass) — so the data layer is, by happy accident, already shaped correctly. The work is to **audit every route** touching these seven resources and confirm: reads = `requireAuth`, writes = `requireAdmin`. Any write still on `requireAuth` is a bug to fix as part of this feature. A new `requireViewer(resource)` helper can formalize "logged-in and allowed to view this resource."

### 6.2 Per-surface behavior (every page, every button considered)

| Surface | Operators see | Hidden/disabled for operators |
|---|---|---|
| **Dashboard** | All operational feeds, alert banner, stat cards, maintenance-watch. Cards drill through to read-only detail. | "Resolve alert," any admin action on a feed row. |
| **Inventory** | Item list, availability, unit status, location, hub, photos, low-stock state. | Add/edit/delete item, edit units, adjust quantity, retire, QR reprint. |
| **Deployments** | All active + historical deployments, who holds what, vehicles/kits, secondary operators. | Start/end deployment, edit, force-transfer, add/remove items or operators. |
| **Vehicles** | Fleet list, detail, insurance/registration status, maintenance + daily-check history. | Add/edit/delete vehicle, edit insurance dates, change status. |
| **Maintenance** | Task inbox, status, shop/hub assignment, repair detail, photos, cost. | Create/assign/close task, set return destination, issue work-order link. |
| **Hubs** | Hub list, inbound/awaiting-receipt, discrepancy flags, contact. | Add/edit hub, set email, confirm receipt, resolve discrepancy. |
| **Projects** | Project list, status, assigned deployments/equipment. | Create/edit/delete project, assign equipment. |

Operators do **not** get: Users, Settings, Requests (write), or any account/security surface.

### 6.3 Cross-role & consistency rules (so the logic is uniform)

- **One vocabulary.** Read-only views route all status display through `lib/status` + `StatusChip` (the same components admin uses) — no operator-specific status rendering.
- **Scoping decision (needs your call).** Do operators see **everything** (all deployments, all hubs) or **only what's relevant to them** (their hub, deployments they're on, available inventory)? Your phrasing — "see the full picture" — reads as **all**, read-only. I will implement org-wide read unless you say scope it down. Note the one privacy consideration: deployments expose operator names; org-wide visibility means operators see each other's assignments (almost certainly fine for a field team, but worth a conscious yes).
- **Deep links stay role-correct.** An alert or card that deep-links to a record resolves to the read-only render for an operator and the editable render for an admin — same URL, role-aware affordances.

### 6.4 Devices / offline

These views inherit the operator PWA shell: bottom-nav tab bar, ≥44px targets, iOS safe-area. They are read-heavy, so they cache the last-synced payload and show a "data as of HH:MM" freshness line; offline they render last-known data rather than erroring (consistent with the M1 freshness-UI direction). No write controls means no offline-queue complexity on these pages — a genuine simplification.

### 6.5 Why this is cheap here (and the one caveat)

Because the read APIs already authorize any authenticated user and the write APIs already require admin, the backend is ~90% ready. The real work is front-end: the `readOnly` context, funneling mutating controls through shared capability-aware primitives, and the routing/nav grants — plus a disciplined **route-by-route write-auth audit** so UI hiding is never the only guard. The caveat is exactly that audit: seven complex pages have many buttons, and "hidden in the UI but the API still accepts an operator's write" is the failure mode to prevent. The audit is mechanical and I will produce it as a checklist artifact when we build this.

### 6.6 Roadmap placement

This is **net-new, high operator-adoption value, low blast radius** — it does not depend on #29 and can ship before it. Best slotted into **M1 (presentation-layer unification)**, because it both benefits from and reinforces the shared-component direction M1 is already pushing (one toast system, one dialog, one status vocabulary, capability-aware controls). Building it as part of M1 means the shared `canEdit` primitives are designed once and reused by every later screen. **Recommendation:** schedule it as the first concrete M1 deliverable after the M0 gates, unless you want it pulled even earlier as a quick adoption win (it is self-contained enough to do in a single focused session).

---

## 7. The integrated roadmap (both workstreams folded in)

The existing milestone sequence (M0 → P3) holds. The two new workstreams slot in without reordering the critical path:

| Milestone | Adds from this session | Status |
|---|---|---|
| **M0 — Pilot gates** | _(unchanged)_ prod DB, migrate-on-deploy, A6 device pass, rate-limit XFF confirm, CSP enforce | ⏳ operational, your-hands |
| **M1 — Presentation unification** | **+ Operator read-only visibility (new B)** as the first concrete deliverable — designed on the same `canEdit`/shared-control primitives M1 introduces | ⬜ next code milestone |
| **M2 — Admin completeness** | _(unchanged)_ E-R cost report, Vehicles/Projects pages, dashboard feeds, audit-log viewer | partially landed |
| **M3 — Notification completion** | _(unchanged)_ low-inventory alert, operator bell/badge, optional Web Push (parked) | landed |
| **M4 — Security/hygiene tail** | _(unchanged)_ + reconcile the stale tracker rows (§4.1); centralize `VehicleType`; add the operator-active-rig partial unique index | partially landed |
| **M5 — Maintenance/daily-check depth** | _(unchanged)_ | ✅ complete |
| **M6 — Deployment model + hub fulfillment** | **#29 foundation started this session (§8)**; then #31 second half; then external hub portal | 🔄 in progress |
| **P3 — Capstones** | Map → no-app QR form → Time/Invoicing, **+ Shippo integration (new A)** sequenced after the Map, independent of Time/Invoicing | ⬜ not started |

The ordering rule from the prior roadmap still governs: **finish pilot infra (M0), unify presentation before building more screens (M1 — now including operator visibility), then complete the loops, then the model refactor (#29), then the Phase-3 capstones (including Shippo).** The one nuance: #29 is being started now (ahead of a fully-finished M1) because you chose it as this session's focus and because its **schema foundation** is additive and regression-safe to land early — the readers/UI half stays sequenced after M1.

---

## 8. This session's execution — #29 deployment-model refactor (foundation)

### 8.1 Why a foundation-first PR, not the whole refactor

#29 is the highest-blast-radius item in the plan: it refactors the live `Rig` / `RigOperator` / `Rig.projectId` tables that ~21 files and 31 `prisma.rig*` call sites read. The roadmap is explicit: **"Schema refactor + full regression pass before any UI."** Doing the entire refactor (schema + rewiring every reader + the handoff UI) in one PR is exactly the pattern that caused prior outages. So this session ships the **load-bearing, riskiest, additive part** — the new tables + a backfill that reconstructs history from existing data + a data-access layer — **without rewiring any live reader or adding UI**. That makes the PR deploy-safe even before its migration is applied (no rendered page depends on the new tables yet), and leaves the reader-migration and handoff UI as clean follow-on PRs.

### 8.2 What the foundation introduces

1. **`DeploymentProject`** — a many-to-many join between `Rig` (deployment) and `Project`, replacing the single `Rig.projectId`. Backfilled: every `Rig` with a non-null `projectId` gets one `DeploymentProject` row. `Rig.projectId` is **retained** during the transition (dual-source) so existing readers keep working.
2. **`DeploymentAssignment`** — operator-handoff history with `role` (`PRIMARY`/`SECONDARY`) and `startedAt`/`endedAt`, folding in `RigOperator`. Backfilled: each `Rig` gets a `PRIMARY` assignment (operator = `Rig.operatorId`, started = `Rig.startedAt`, ended = `Rig.endedAt`); each `RigOperator` gets a `SECONDARY` assignment. `Rig.operatorId` and `rig_operators` are **retained** during the transition.
3. **A data-access layer** (`src/lib/deployment-assignments.ts`) in the proven raw-SQL style: read a deployment's projects and assignment history, add/end a project link, add/end an assignment, and the primitives a future handoff-accept flow needs — none wired into a route or page yet.
4. **The active-rig invariant** noted in §4.3 (partial unique index on one active PRIMARY assignment per operator) is set up so the follow-on reader migration can enforce it as a real DB constraint.

### 8.3 Deploy-safety & DB-rule compliance

Per the non-negotiable rules in `CLAUDE.md`: the migration is a **committed** migration (not `db push`); it must be applied with `make db-migrate` **before** the code that reads the new tables lands — but since **no code in this PR reads them at runtime**, deploying the PR before the migration cannot error. The follow-on reader-migration PR is where migrate-before-deploy ordering becomes load-bearing. Because the build sandbox cannot reach the Prisma engine download or a database, the new tables are accessed via raw SQL and the migration is hand-authored to match repo conventions; **you run `make db-generate` + `make db-migrate` locally** before merge, exactly as your workflow specifies.

### 8.4 Files in this change

- `prisma/schema.prisma` — +53 lines: `DeploymentAssignmentRole` enum, `DeploymentProject`, `DeploymentAssignment` (additive; no existing model touched).
- `prisma/migrations/20260624000000_deployment_model_foundation/migration.sql` — create types/tables/indexes/FKs + the three backfill `INSERT … SELECT` statements.
- `src/lib/deployment-assignments.ts` — raw-SQL data layer (list/add/remove project links; list/add/end assignments; `getActivePrimary`). Dormant: imported by nothing yet.
- `AHITS_SESSION10_ANALYSIS_AND_PLAN.md` — this document.

### 8.5 Verification (run live this session)

- **`tsc --noEmit` → exit 0.** Clean, including the new data layer.
- **`eslint .` → 0 errors / 26 warnings** — the warnings are the pre-existing `react-hooks/set-state-in-effect` family, unchanged from Session 9; the new file is 0/0.
- **Prisma schema validate** — could not run in-sandbox (the schema-engine binary download is firewalled, the documented constraint). The added models follow the exact syntax/convention of the existing `DeploymentRequest`/`DeploymentRequestLine` models; **CI regenerates and validates** on PR, and the diff is purely additive. The migration SQL was hand-checked against the real table/column names (`rigs`, `rig_operators(rigId, operatorId, addedAt)`, `projects`, `users`); `gen_random_uuid()` is available on the Supabase Postgres.
- **Tests** — the vitest specs need a Postgres service container (no Docker in-sandbox); they run in CI. Nothing in this change alters an existing tested path (no reader rewired), so regression risk is minimal.

### 8.6 What this change deliberately does NOT do (the follow-on PRs)

1. **Reader migration** — point `GET /api/deployments`, the deployments admin page, `my-rig`, dashboard feeds, and the operators route at `deployment_assignments`/`deployment_projects` instead of `Rig.operatorId`/`projectId`/`rig_operators`. This is where migrate-before-deploy ordering becomes load-bearing.
2. **Self-service handoff UI** — operator-initiated handoff using the existing transfer-accept pattern (admin can force), audit-logged, plus the secondary-operator UI.
3. **Enforce the invariant** — add the partial unique index `(operatorId) WHERE role='PRIMARY' AND endedAt IS NULL` once all writers go through the new table.
4. **Retire legacy columns** — only after all readers are migrated and a release has baked, drop `Rig.projectId`/`Rig.operatorId`/`rig_operators` in a final cleanup migration.

---

## 9. Handoff — your-hands steps & decisions

### 9.1 Why the PR + migrate + deploy are your local steps

Three things this environment can't do, by design: it has no database (so `make db-migrate` can't run — and your DB rules say the migration must be applied as a committed migration, never `db push`), it has no `gh` CLI (so the PR/deploy can't be triggered), and a stale `.git/index.lock` it can't clear blocks committing. So I prepared the complete, verified change in your working tree and hand you the exact sequence. Nothing here was pushed or deployed.

### 9.2 Recommended sequence (clean, independent PR off `development`)

```bash
cd "<repo root>"
# 1. Park the foundation files, branch fresh off development, restore them
git stash push --include-untracked -- \
  prisma/schema.prisma \
  prisma/migrations/20260624000000_deployment_model_foundation \
  src/lib/deployment-assignments.ts \
  AHITS_SESSION10_ANALYSIS_AND_PLAN.md
git checkout development && git pull
GH_USER=$(gh api user --jq .login)
git checkout -b "feature/$(date +%Y%m%d)/${GH_USER}-m6-deployment-model-foundation"
git stash pop

# 2. Regenerate the client and APPLY the migration (your DB rules: migrate before code lands)
make db-generate
make db-migrate          # applies the backfill against the target DB

# 3. Commit + push
git add prisma/schema.prisma \
        prisma/migrations/20260624000000_deployment_model_foundation \
        src/lib/deployment-assignments.ts \
        AHITS_SESSION10_ANALYSIS_AND_PLAN.md
git commit -m "#29 foundation: DeploymentProject + DeploymentAssignment (additive + backfill)"
git push -u origin HEAD

# 4. PR to development + staging deploy
gh pr create --base development \
  --title "#29 foundation: deployment-model tables + backfill" \
  --body "Additive DeploymentProject (Rig↔Project M2M) + DeploymentAssignment (PRIMARY/SECONDARY history) with backfill. No reader rewired; deploy-safe. See AHITS_SESSION10 §8."
PR=$(gh pr view --json number --jq .number)
gh workflow run pr-staging-deploy.yml -f pr_number=$PR
gh run watch
```

If you'd rather **stack** this on the still-open `feature/20260623/…-m6-deployment-requests` branch (it's 4 commits ahead of `development`), skip the stash/checkout and just do steps 2–4 on that branch — simpler, but the PR will carry the deployment-requests commits too.

> **Note:** your working tree also has uncommitted Session-9 carry-over (the `hubs/page.tsx` pluralization fix, a `ROADMAP` edit, the untracked `AHITS_SESSION9_RECORD.md`). The sequence above touches only the four foundation files and leaves that work untouched for you to commit separately.

### 9.3 Decisions still open (to lock before the next builds)

1. **Operator-visibility scope** — org-wide read (everything) vs. scoped to the operator's own hub/deployments/available inventory. Your "see the full picture" reads as org-wide; confirm, given operators would then see each other's assignments.
2. **Operator-visibility timing** — schedule as the first M1 deliverable (recommended), or pull earlier as a standalone quick adoption win.
3. **Shippo first cut** — track-only (recommended) vs. include label purchase.
4. **#29 follow-on** — confirm the reader-migration + handoff UI is the next session's focus (it's the half that carries real blast radius).

### 9.4 The three M0 pilot gates remain your-hands (unchanged)

Production DB standup (PIPE-2), migrate-on-deploy automation (A2), and the A6 real-device offline pass — none are code, all gate a real pilot. The migrate-on-deploy automation in particular would retire the manual step in §9.2.

