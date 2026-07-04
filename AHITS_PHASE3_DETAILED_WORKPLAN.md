# AHITS — Phase 3 Detailed Workplan & State-of-the-App Review

_Prepared 2026-06-30. A single, exhaustive entry document for Phase 3 ("Scale & Polish"). It folds together (a) the reconciled state of the app at the Phase-3 doorstep, (b) a full severity-ranked findings register from an eight-stream code audit **plus** a first-hand live walkthrough of staging as Admin + both Operators, and (c) a sequenced, build-ready Phase-3 plan with model/API/UI specs, acceptance criteria, tests, dependencies, KPI mapping, and a risk register._

**How this document was produced.** Eight parallel read-only specialist audits of the codebase (data model, API/RBAC, security, frontend/UX, offline/PWA, dead-code/tests, notifications/external, and a PRD/context reconciliation), a live click-through of every Admin screen and the full Operator loop on `ahits-web-app-staging` (Admin `ops@`, Operator 1, Operator 2), and an adversarial verification pass that re-checked the highest-stakes claims against source with `file:line` evidence (and corrected one). The nine raw audit files are referenced in the Appendix; this document is the synthesis and the plan.

**Reconciliation rule.** Where planning docs and live reality disagree, **live + git HEAD win** and the drift is flagged. Several long-standing "open" items in the older docs are in fact **done** (confirmed live); a few "done/fixed" items are in fact **still open** (confirmed live). Both directions are corrected below.

---

## 0. Executive summary

**The product is at the pilot doorstep, and it is in materially better shape than the planning docs imply.** Phase 1 (Foundation) and Phase 2 (Core Operations) are functionally ~100% complete under the agreed descopes. The admin surface is broad and polished, the operator loop works end-to-end, security and the API layer are production-grade, and the offline core is well-engineered. **Phase 3 ("Scale & Polish") is ~0% started** — it is a net-new feature program, not hardening.

**The one thing between today and a real-operator pilot is the A6 real-device offline pass.** The fix for its last blocker (UR-038, offline client-side navigation) is built and merged, but **every cell of the device matrix is still unchecked** — the pass has not been re-run on real hardware since the fix landed. That sign-off *is* the pilot line.

**What I'd fix before writing a line of Phase-3 feature code (a short, high-leverage "Wave 0" hardening pass):**

1. **The A6 device pass** — the pilot gate (run it; it's a procedure, not a build).
2. **Three live bugs found this review** — an admin page that **crashes outright**, a transfer that *looks* like it failed, and a transfer an operator **can't accept** in a common state. Details in §3 and §5.
3. **The offline "create-deployment-then-add-items" loop is non-functional** — it can pass A6's create-only test yet fail the moment an operator packs a kit with no signal. Scope it honestly or build it properly *before* Phase-3 adds more offline-first writes (time-clock).
4. **The systemic API/data hygiene that ~25 new Phase-3 routes would otherwise copy** — unbounded pagination, unguarded soft-deletes (500s), the missing indexes, email with no retry/log, and the legacy-column retirement that invoicing must not build on top of.

**Phase-3 capstones, smallest→largest, with the leverage already in place:** **(1) Deployment Map** (3 GPS fields on `DailyCheck` + a Mapbox admin card), **(2) No-app QR daily-check form** (reuses the production-grade tokenized `StatusLink` primitive), **(3) Time Tracking / Invoicing / Availability** (the heavy one — 7 models). Plus advanced cost analytics, admin-mobile, and contractor self-onboarding. The tokenized-link primitive and the durable offline queue are the two biggest pieces of pre-built leverage; sequencing to reuse them makes several capstones much cheaper.

**Top risks to manage:** the irreversible legacy-column drop (do it snapshot-first, after invoicing's attribution source is settled); iOS storage eviction silently dropping queued field data; the public/token attack surface widening (CSP + rate-limit hardening must precede the No-app form); and billing email that currently fails silently.

**Bottom line:** finish the device pass and the Wave-0 hardening, then build Map → QR → Invoicing on a clean base. The hard architectural work is largely done; Phase 3 is mostly additive if the base is tidied first.

---

## 1. State of the app entering Phase 3 (reconciled, live-confirmed)

### 1.1 Phase completion (latest wins)

| Phase (PRD §15) | Status | Notes |
|---|---|---|
| **Phase 1 · Foundation** | **~100%** | Dashboard operational feeds, pinned-alert banner, clickable stat cards, Settings alert-config all shipped and live-confirmed. Older docs saying ~85–92% are stale. |
| **Phase 2 · Core Operations** | **~100%** under descopes | All required code merged; private photo bucket + cron both done. Descopes: Web Push → P3; RN wrapper → out; per-project checklists → optional; external non-admin alert recipients → deferred. |
| **Phase 3 · Scale & Polish** | **~0%** | Net-new feature program. No Phase-3 models exist; GPS lives on `Photo`, not `DailyCheck`. |
| **Pilot readiness** | **1 gate: A6 device pass** | UR-038 fix merged; device matrix all-unchecked. This sign-off is the pilot line. |

### 1.2 What is actually built (correcting the stale "stub/future" framing)

These were carried in older docs as stubs or future work; **all are built and were exercised live**:

- **Admin Reports** = a complete **Equipment Cost & Utilization** report (date range; All/Vehicles/Units/Rentals tabs; KPI cards — Maint Spend, Maint Events, Avg Utilization, Downtime days, 83 tracked assets; sortable per-asset table with VIN/days-out/util%/spend/downtime/rental-cost; CSV export). This is the business "scoreboard" for the 25%-repair-spend KPI.
- **Admin Vehicles** = full fleet management (14 vehicles, grouped/sortable/filterable; insurance & registration expiry; per-vehicle maintenance + daily-check history; rental management + Ownership filter). The old "dead deep-link to a stub" is resolved.
- **Admin Projects, Hubs (+ Inbound view), Users (+ audit-log "Activity" + invite), Maintenance (+ inoperable-review banner + tokenized shop work-order), Settings (alert config + daily-check cutoff + per-vehicle-type checklist editor + categories)** — all built and live.
- **Deployment Requests + Hub fulfillment** = built and merged (Active/Closed, filters, per-line confirm/edit/deny fulfillment checklist, hard-reserve "Stage", tokenized hub portal). Not a future Phase-3 item.
- **Operator loop** = phone-first home, **16-item** daily check with required failing notes + review echo, deployment wizard (Build Rig → Build Kit → Launch with inline gating), transfers, handoffs, scan-based check-out/in, notification bell, self-service **Change PIN**, bottom-nav + iOS safe-area.
- **"Maintenance watch (90-day spend)"** prediction nudge is already on the admin dashboard.

### 1.3 Stale "done" claims that are actually still open (live-confirmed)

- **Dead dependencies are NOT removed.** The live `package.json` still contains `@mui/x-data-grid`, `html5-qrcode`, and `iron-session` — all with zero usages in `src` (the app uses raw MUI `<Table>`, `jsqr`, and `jose` respectively). The register's "UR-022 fixed — uninstalled" is aspirational; the removal didn't land.
- **The 16-vs-9 daily-checklist contradiction (UR-025) is resolved in the app's favor:** the live operator daily check renders the **full 16 items**, matching the Settings "default 16." The docs that say the live list is a condensed 9 are stale. (This retires an M5 line item.)
- **`dailyCheckCutoff` is configured but orphaned** — it's editable in Settings but read by nothing; there is no "missed daily-check" alert (see H-2).

### 1.4 Architecture & code health (verified)

Next.js **16.2.9** (App Router; note the middleware gate is `src/proxy.ts` — Next 16 renamed `middleware`→`proxy`), React 19, MUI v6, Prisma 5.22, Supabase, Serwist PWA. ~27k LOC across 122 `.ts` + 54 `.tsx`; 80 API route handlers; 57 Prisma models/enums; 39 migrations; 22 test files; CI `verify` runs lint/type-check/build/test on every PR. `tsc` clean; ESLint 0 errors / 33 warnings (all the pre-existing `set-state-in-effect` advisories — none are bugs); 0 TODO/FIXME/HACK; 0 `@ts-ignore`; effectively 0 `any`. **Auth/authz is production-grade** (per-request DB re-validation of `isActive`/`tokenVersion`/role; bcrypt-12 + per-account lockout incl. admin; hashed-at-rest 256-bit invite & status-link tokens; shared-store rate limiter with trusted-XFF pinning; enforcing CSP; body-hash-bound idempotency; magic-byte upload sniffing + private photo bucket). **No route is missing its auth check; no IDOR on the sensitive write paths.** This is an unusually disciplined pre-pilot codebase.

### 1.5 Per-user assessment

- **Operator (field, phone-first, offline):** Strong. The daily-check and deployment-launch forms are the best in the app (stepper gating, inline reasons, queued/confirmed/failed toasts). Gaps that bite operators specifically: the **offline add-items loop** (can't pack a kit on a rig started offline), **no data-freshness / itemized outbox** indicator, the **transfer-not-acceptable-without-active-deployment** trap, sub-44px touch targets on the most-used controls, and reaching desktop-only admin tables in read-only "Browse."
- **Admin (ops, desktop):** Broad and capable. Gaps: the **ended-deployments page crash**, desktop-only tables that overflow on phones, email failures that vanish silently, an audit log that only surfaces handoffs, and several unguarded mutations that 500 on a stale id.
- **External recipients (repair shops, hubs, invoice processors):** The tokenized `/s/[token]` portal is genuinely well-built (hashed tokens, least-privilege payload, no PII/photo leakage, idempotent transitions). Gaps: hubs with **no email** get undeliverable links (live: both staging hubs have no email), the **invoice→processor** link type is a stub (no issuer/template/back-write), and **email has no retry/log** so a failed shop/hub/invoice send is invisible.

---

## 2. Live walkthrough — what I exercised and saw (staging)

Full interaction as all three logins (no external emails triggered). Console was clean across every screen (only an unrelated MetaMask extension warning). Every Admin nav item, the operator daily-check + deployment + transfer loops, and the Operator-1→Operator-2 transfer handshake were exercised end-to-end. Highlights and confirmations:

**Confirmed working (representative):** admin dashboard feeds + clickable cards + 90-day maintenance-spend nudge; inventory serialized-unit detail with inline status + QR-label registration; the 4-step deployment wizards (admin + operator) with Launch gated on a required note; the **16-item** daily check with required failing-notes (Next is blocked with a banner until a "No" item has a note) → review echo ("16 OK · 0 fail · 0 N/A") → submit → unified toast; the maintenance repair drawer + tokenized "Send to shop"; the hub Inbound view ("13 awaiting receipt", with a "No contact email — share links manually" nudge); the Users audit-log "Activity" dialog and invite dialog; the Reports cost/utilization scoreboard; the operator notification bell (rich types); operator **Change PIN**; and the full **Operator 1 → Operator 2 transfer**: send → Op2 notified ("tap to review") → Op2 accepts → item moves (verified after reload). Double-allocation is prevented (a vehicle on Op1's active deployment was absent from Op2's picker).

**New issues found live (all reproduced; root-caused in §3/§5):** the admin "Show ended" deployments **crash**; the transfer-accept **stale-render**; the **transfer-not-reviewable-without-active-deployment** trap; 4-of-6 request lines showing a bare **"Item"** with no name; both hubs missing email; a possible **duplicate inbound row**; the **two cards + one nav tab all routing to the same Scan screen** (the dedicated check-out flow is scan-only now); and admin **data tables clipping** at mobile width (which operators also reach via read-only Browse).

**Not testable via this tooling (defer to A6 / on-device):** true offline behavior (no network-disable hook in the browser tools), the camera QR scan, and true ≤430px phone width (the test window floored at ~614px). These are exactly the A6 device-pass concerns.

---

## 3. The three live bugs (verified against source)

These are new this review, reproduced live, and confirmed (or corrected) against code by the verification pass. They are the highest-value fixes because two are user-facing breakage and all three are small.

### B1 — Admin "Show ended" deployments page crashes outright · **HIGH**
- **Symptom (live):** `/admin/deployments` → toggle **Show ended** → the whole page drops to the Next.js error boundary ("This page couldn't load"). `/api/deployments?active=false` returns **200** (server fine); the client throws `TypeError: Cannot read properties of null (reading 'name')`.
- **Root cause (verified):** `src/app/(admin)/admin/deployments/page.tsx:1401-1402` renders `rig.operator.name` (avatar + label) inside `rigs.map(...)`, but **`rig.operator` is `null` for every ended deployment.** The GET builds `operator` from the assignment roster (`api/deployments/route.ts:131`), and the roster reads only **open** assignments (`lib/deployment-assignments.ts:55`, `WHERE endedAt IS NULL`); ending a deployment closes the PRIMARY assignment (`.../end/route.ts:92` → `endAllAssignmentsForRig`), so the roster returns no operator and the GET emits `operator: null`. The list then dereferences `.name`. This is not an edge case — it is true for **all** ended rows, so the entire historical view is unreachable.
- **Why it matters:** admins cannot review any ended deployment — no history, no "who had it" attribution. This is the live manifestation of UR-032 and is coupled to the legacy-column retirement (the retained `rigs.operatorId` is still populated and could hydrate the operator server-side).
- **Fix (minimal → durable):** (a) guard the render — `rig.operator?.name` + a fallback label — and loosen the row interface to `operator: {...} | null`; (b) better, hydrate `operator` server-side for ended rigs from the retained `rigs.operatorId` (schema:254, still `NOT NULL`) so attribution displays; (c) fold into the UR-032 "display-roster returns latest assignment regardless of `endedAt`" work so it's correct, not just non-crashing.

### B2 — Transfer **accept** renders stale until reload · **MEDIUM** (cause re-scoped by verification)
- **Symptom (live):** as the receiving operator, tapping **Accept** shows the success toast "Transfer accepted," but the incoming-transfer banner persists (still offering Accept/Decline) and the item does not appear in "My Kit" until a manual page reload. After reload the state is correct (item is in the kit) — so the accept **did** succeed server-side.
- **Verification correction:** the obvious diagnosis ("the client never refetches") is **wrong** — `my-rig/page.tsx:703` does `await load()` after the toast, and `load()` re-fetches deployments + transfers. The symptom is therefore consistent with a **read-after-write/commit-timing** issue: the refetch GET fires immediately after the 200 and can read state before the accept's write is visible (transaction commit ordering / replica or connection-pool read lag).
- **Fix:** treat this as a server/data-consistency item, not a UI refetch. Options: ensure the accept endpoint's transaction is fully committed before it returns 200; or **return the updated deployment+kit in the accept response** and have the client apply that payload directly (optimistic, no follow-up read race); or pin the immediate post-accept read to the primary. Add a regression test that accepts and asserts the kit reflects the moved item without a reload.

### B3 — Incoming transfer is **not reviewable without an active deployment** · **MEDIUM-HIGH**
- **Symptom (live):** Operator 2, with no active deployment, receives "Incoming equipment transfer — tap to review," taps it, and lands on the empty "No active deployment" screen with **no Accept/Decline anywhere**. The transfer is invisible until they happen to start a deployment (after which the banner appears).
- **Root cause (verified):** the incoming-transfer banner + respond dialog render only inside the active-rig branch (`my-rig/page.tsx:1084-1116`, dialog `1815-1840`), past the `if (!rig) return` early return (960). The empty state (961-1052) renders incoming **handoffs** but **not transfers**. `loadTransfers()` runs regardless, so the data is fetched but never displayed when rig-less.
- **Why it matters:** equipment can sit in pending-transfer limbo; the receiving operator has no path forward and the notification deep-link dead-ends. Directly threatens the "zero equipment missing >24h" KPI.
- **Fix:** lift the incoming-transfer banner + `respondDialog` into the empty/no-rig state, mirroring the handoff treatment already there. (Decide product intent: can you receive equipment without an active deployment? If yes — show it always; if no — the notification + empty state must explain "start a deployment to receive this," not dead-end.)

---

## 4. Consolidated findings register (audit + live, severity-ranked)

Evidence is `file:line` or a live observation. "Fix wave" points to §5/§6. Nothing here is a Phase-3 *blocker*; the value is doing the systemic items **before** new routes/screens copy the gaps.

### 4.1 Critical
- **C1 · Offline dependent-write loop is non-functional (create-deployment → add-items, both offline).** The remap machinery (`offline-remap.ts`) is correct but **never receives a placeholder-referencing dependent write**: after an offline launch `mutate()` returns `queued:true`, `onSuccess()/load()` isn't called (`my-rig/page.tsx:306-308`), `rig` stays `null`, and every add path is gated `if(!rig)return` (`:869`) and targets the **real** `rig.id` (`:901`). A6 step 6 only tests create-only, which passes — so this can ship "green" and fail in the field. _Sev is Critical-as-feature-gap (no data corruption; the loop simply can't run)._ → Wave 0.

### 4.2 High
- **H-DB1 · Legacy-column retirement is mid-migration; the irreversible drop is the single largest data risk (UR-002/#29).** Operator attribution is **triple-stored** (`rigs.operatorId` + `rig_operators` + `deployment_assignments`); writers still dual-write; the one-active-PRIMARY partial-unique index isn't created; **no `DROP COLUMN` exists yet** (verified). Invoicing/time attribution must source from `deployment_assignments`, not the legacy columns, or it re-entrenches them. → Wave 0 / pre-Invoicing.
- **H-DB2 · Missing indexes on hot, status-filtered tables (UR-009).** `TransferRequest` has **zero** `@@index`; `MaintenanceTask.{vehicleId,itemId,status}`, `DailyCheck.{operatorId,submittedAt}`, `Alert.{resolved,…}`, `Kit.rigId`, `Rig.projectId` all unindexed on live query paths. Dashboard + operator inbox + maintenance lists all hit these. Ship the index migration before Time/Invoicing adds heavy `GROUP BY` reports. → Wave 0.
- **H-API1 · Unbounded list pagination (`pageSize` via bare `parseInt`, no clamp).** `inventory` GET, `daily-check` GET, `checkout` GET; only `users/audit` clamps. `inventory` is worst (deep includes per row). A client can request `pageSize=1000000`. Add a shared `clampPageSize`. → Wave 0.
- **H-API2 · `maintenance` GET is unbounded **and side-effecting** — it runs a `createAlert` loop on every read (`maintenance/route.ts:16-43`). Reads should not write; move overdue-alerting to the cron (which already does it). → Wave 0.
- **H-API3 · `reports/equipment` loads the entire fleet + all units into memory and aggregates in JS (`:114-129`).** Fine now; a multi-second admin request + memory spike as history grows. Push the window filter into SQL. → Wave 0 (or early Phase-3 analytics).
- **H-OFF1 · No IndexedDB-eviction detection or warning.** Only a best-effort `persist()` (`useOfflineQueue.ts:263`); no `estimate()`/`persisted()` check; IDB-open failure is a **silent drop** ("Safari private mode — write silently dropped"). On iOS ITP (7-day) or private mode, queued daily-checks/returns + photos can vanish with zero signal. → Wave 0 / before time-clock.
- **H-NOTIF1 · Email failures are silently swallowed everywhere — no retry, no log, no surfacing** (`resend.ts` throws; every caller catches-and-drops). A failed shop/hub/invoice/invite send just disappears. **Hard blocker for the invoice→processor billing email.** → Wave 0 (log/surface) + Invoicing (retry/dead-letter).
- **H-NOTIF2 · The "missed daily-check" alert does not exist.** `dailyCheckCutoff` is stored + editable but read by nothing; there is no `DAILY_CHECK_MISSED` AlertType and no cron scan (verified). The dashboard "missed checks" feed is passive, un-gated, no-alert. Directly under the 95%-on-time KPI. → pairs with the No-app QR form.
- **H-NOTIF3 · Staging can email real external parties from `agricarbon.com` with no sandbox guard** — highest risk is **HUB_RETURN auto-firing on disposition with no explicit send click** (`status-links.ts:136`). Add an `EMAIL_SANDBOX`/staging-host guard **before** the next staging QA pass that touches dispositions or send-to-shop. → Wave 0.
- **H-TEST1 · The only unauthenticated write surface, `POST /s/[token]/transition`, has zero test coverage**, and its primitives (`status-links`, `idempotency`, `rate-limit`) are untested. Any new public/token route (the No-app form) inherits this blind spot. → Wave 0 + per-capstone.
- **B1 (admin ended-deployments crash), B3 (transfer-not-reviewable)** — see §3. → Wave 0.

### 4.3 Medium
- **M-SEC1 · CSP allows `'unsafe-inline'` + `'unsafe-eval'` on `script-src`** (`next.config.ts:31`) — enforcing but weak vs XSS. Migrate to nonce-based `script-src` **before** the public No-app QR page widens untrusted input. → Wave 0 / pre-QR.
- **M-SEC2 · `/api/uploads` and `/api/photos/[...path]` are not rate-limited** (auth-gated today). The No-app form may upload from an **unauthenticated** tokenized context — that path must be rate-limited + magic-byte-gated from day one (reuse `photo-security.ts`). → pre-QR.
- **M-SEC3 · 6-digit PIN hardening:** reject trivial PINs (000000/123456/sequential) at set-time; make the failed-attempt counter atomic (`increment`); consider a per-IP distinct-account-lockout ceiling. → Wave 0 / before contractor self-onboarding.
- **M-OFF1 · Public `/s/[token]` idempotency key includes `Date.now()`** (`s/[token]/page.tsx:100`) → a double-tap/retry generates a different key, so the server can't dedupe → duplicate transitions on a flaky connection. Key on a stable per-action token. → pre-QR.
- **M-OFF2 · RSC-nav cache miss offline has no fallback** for un-warmed routes (`sw.ts` fallback only matches `destination==='document'`) — residual A6 step-3 flakiness. **M-OFF3 · No "data as of HH:MM" freshness indicator; the outbox is aggregate-only (dismiss-all), no per-item label/retry/discard.** → Wave 0 (freshness) + ongoing.
- **M-API1 · Unguarded `prisma.update`/`delete` on a possibly-missing id → unhandled 500 (P2025)** across `inventory/units/[unitId]`, `maintenance/[id]` DELETE, `vehicles/[id]` DELETE, `inventory/[id]` DELETE, `hubs/[id]`, `categories/[id]`, `status-links/[id]/revoke`. Wrap → 404. **M-API2 · raw `err.message` returned** on several catch fall-throughs (can leak Prisma constraint/column names). **M-API3 · `hubs`/`categories` use manual (non-zod) validation.** → Wave 0 (shared `wrapWrite` helper).
- **M-UX1 · `FulfillmentChecklist` is a complete parallel design system** (raw div/button/select, own palette, sub-44px buttons) used in admin Requests **and** the external `/s/` page. **M-UX2 · "My Rig"→"My Deployment" rename is cosmetic-only** — route/folder/component are still `my-rig`, and the bottom-tab says "Deploy" (a third name). Phase-3 Map deep-links will hardcode `my-rig`. **M-UX3 · Data layer is bespoke `fetch+useState`, not SWR** (despite SWR being a dep) — no revalidation/stale-while-revalidate; `my-rig` is a 1939-line monolith with ~35 `useState`. **M-UX4 · Transfer accept/decline "respond" dialog is duplicated** verbatim (operator + admin). → Wave 0 (rename + SWR foundation) / Phase-3 consistency.
- **M-DATA1 · 4-of-6 request lines render as a bare "Item" with no name** (live) — freeform/unlinked lines show no description; admin can't tell what was requested. **M-DATA2 · possible duplicate HUB_RETURN inbound row** (live: Garmin Glo2 01 ×2) — resend may leave stale awaiting rows. **M-DATA3 · B2 transfer-accept read-after-write** (see §3). → Wave 0.
- **M-NOTIF1 · Operator awareness is 45s polling, foreground-only** (PRD "push is primary" unmet; Web Push parked). **M-NOTIF2 · `EQUIPMENT_NOT_RETURNED` only fires when the operator submits a check on a >90-day rig** — a rig whose operator stops checking in never triggers it; move the scan into cron. **M-NOTIF3 · recipient `*_UPDATE` notifications are in-app only, never emailed.** → Phase-3 / decision.

### 4.4 Low (cleanup tail — batch into Wave 0 or pre-go-live)
- **Dead code:** `lib/shipments.ts` (97 LOC, 0 importers — Shippo groundwork, decide wire-or-delete); `checkout` GET orphaned + POST is a 410 stub (delete once clients confirmed off); 6 of 8 fns in `lib/utils.ts`; 8 orphaned email builders in `email/templates.ts`; unused types in `types/index.ts`; `lowStockByHub`/`isPlaceholderId` (tested but unwired). ~150 LOC safe deletion.
- **Dead dependencies (still present, verified live):** `@mui/x-data-grid`, `html5-qrcode`, `iron-session` — remove (≈ bundle weight). **Dead secret:** `ADMIN_EMAIL` mounted in the Makefile, 0 code refs — wire or drop.
- **Migration hygiene:** duplicate timestamp `20260625060000_{backfill_consumable_stock,r4_stock_reserve}` (rename before prod); empty `sprint7_schema_gaps` no-op migration; prior `db push` + `migrate resolve` drift (history now consistent). **UR-012** dead `EquipmentStatus.IN_TRANSIT` enum value.
- **A11y:** ~35 `IconButton`, only ~5 `aria-label`; sub-44px targets on the daily-check toggle group, my-kit per-item icon buttons, and FulfillmentChecklist actions; `/s/` labels not `htmlFor`-associated.
- **Audit log** only surfaces handoffs (no login / PIN-reset / role-change / deactivation entries). **Doc hygiene:** ~40 untracked `AHITS_*.md` planning docs; several stale "done/open" statuses (corrected in this doc).

---

## 5. Wave 0 — pre-Phase-3 hardening (do before building capstones)

The point of Wave 0 is twofold: **reach the pilot line**, and **tidy the base so ~25 new Phase-3 routes/screens don't copy today's gaps.** It is small, high-leverage, and mostly already-diagnosed. Suggested order:

**0.1 — Reach the pilot line (gating).**
- **A6 real-device offline pass (the gate).** Deploy the UR-038 offline-RSC-nav fix; re-run **exactly** per the procedure: fully drop the old SW on each device (uninstall/reinstall the PWA, or DevTools unregister + clear storage), open the app **online and wait ~10 s** so `RoutePrefetcher` warms routes, **then** go offline and run step 3. Complete all 18 rows on 5 targets (Desktop / iOS web / Android web / iOS PWA / Android PWA), including the **overnight iOS storage-eviction** watch-item and the **add-items-to-offline-rig** step (add it to the matrix — it's currently untested and currently broken; see C1). Record sign-off. **Clean pass = pilot line.**

**0.2 — Fix the three live bugs (§3).** B1 (guard + server-hydrate ended-deployment operator), B3 (lift transfer banner into the no-rig state), B2 (fix the accept read-after-write — return updated state or guarantee commit-before-200).

**0.3 — Decide & scope the offline add-items loop (C1).** Either build a true local offline-rig model so add-items can target `pending-<id>` and ride the existing remap, **or** scope offline honestly: after an offline launch, show "deployment will start when you reconnect — add items then," and block add-items until synced. Do **not** advertise a loop that can't run. This decision also informs how the Phase-3 **time-clock** (another offline-first dependent write) is built.

**0.4 — Systemic API/data hygiene (so new routes start clean).**
- Shared `clampPageSize(n, max=100)` applied to every paginated GET (H-API1); paginate/strip the side-effect from `maintenance` GET (H-API2); push `reports/equipment` aggregation into SQL (H-API3, or defer to analytics).
- Shared `wrapWrite` that maps `P2025→404` and known sentinels→messages, returning a generic string on fall-through (M-API1/2); port `hubs`/`categories` to zod (M-API3).
- The **index migration** (H-DB2): add the enumerated `@@index`es (TransferRequest, MaintenanceTask, DailyCheck, Alert, Kit, Rig.projectId, …) — and ship Time/Invoicing's own composite indexes from day one.

**0.5 — Email reliability + staging guard (H-NOTIF1/H-NOTIF3).** Add an `EMAIL_SANDBOX`/staging-host guard in `sendEmail` (redirect `to` to a test inbox off-prod) **now**; add a send-attempt/delivery log + retry (or at minimum persist `emailed:false` and surface it in the relevant admin UI) — required before the invoice email ships.

**0.6 — Security hardening that precedes the public surface (M-SEC1/2/3, M-OFF1).** Nonce-based `script-src` (drop `'unsafe-inline'`/`'unsafe-eval'`); rate-limit `/api/uploads` + `/api/photos`; trivial-PIN rejection + atomic attempt counter; IDB `persisted()`/`estimate()` checks + an explicit "couldn't save offline / storage at risk" surface instead of a silent drop.

**0.7 — Legacy-column retirement groundwork (H-DB1, UR-002/#29 slice 3c→4).** Finish migrating readers onto `deployment_assignments`/`inventory_stock`; add the one-active-PRIMARY partial-unique index; **snapshot first**, then the irreversible `DROP COLUMN` — sequenced so it lands **before** invoicing builds on attribution. Apply the migration before the code that needs it (per the non-negotiable DB rules in `CLAUDE.md`).

**0.8 — Consistency + freshness foundation (M-UX1/2/3/4).** Finish the My Rig→My Deployment rename (route/folder/component/bottom-tab label/comments) so Phase-3 deep-links are stable; extract the duplicated transfer-respond dialog; introduce **SWR** for list reads (powers a "data as of HH:MM" indicator + revalidation) and an **itemized outbox** — before the time-clock lands on bespoke `fetch+useState`; decide the `FulfillmentChecklist`/`/s/` design-system story (unify vs. document-as-intentional-external).

**0.9 — Cleanup tail (batch).** Remove the 3 dead deps + ~150 LOC dead code + dead `ADMIN_EMAIL` secret; rename the duplicate-timestamp migration; add the `DAILY_CHECK_MISSED` cutoff scan (H-NOTIF2, pairs with QR); a11y labels + 44px targets; test the public token surface (H-TEST1).

> **Wave-0 exit criteria:** A6 signed off (pilot line), the three live bugs fixed, the offline add-items decision made, and the shared API/data/email/security/consistency primitives in place. After this, capstones are largely additive.

---

## 6. Phase 3 capstones & polish — detailed build specs

Sequencing rationale (smallest→largest, max reuse): **Map → No-app QR → Time/Invoicing**, with analytics/admin-mobile/onboarding interleaved as polish. The tokenized `StatusLink` primitive and the durable offline queue are the leverage; the legacy-column retirement (Wave 0.7) is the prerequisite that unblocks invoicing's attribution.

### Capstone 1 — Deployment Map (smallest; do first to de-risk GPS plumbing)

**Goal.** A live admin-dashboard map of every active deployment's most-recent location, captured opt-in from the operator's phone on daily-check submit.

**Data model.** Three additive nullable columns on `DailyCheck`: `gpsLat Float?`, `gpsLng Float?`, `gpsAccuracy Float?` (mirror the existing `Photo.gpsLat/Lng` typing; `gpsAccuracy` is new anywhere). One additive migration. No new model. Index only if the map filters by bounding box (initially no).

**Capture (operator).** In `daily-check`, call `navigator.geolocation.getCurrentPosition` and attach `{lat,lng,accuracy}` into `buildPayload()` so it rides the existing `mutate()` durable-queue + idempotency machinery. **Critical offline rule:** resolve-or-skip GPS **before** enqueue (geolocation is async + promptable); never block submit on a fix; if denied/unavailable, submit without coords (the pin simply doesn't appear). `Permissions-Policy: geolocation=(self)` is already set.

**API.** Extend the `daily-check` POST zod schema (`daily-check/route.ts:8`) with an optional `gps` object + persist the columns. The route is already operator-auth'd and ownership-free by design — a clean hook.

**Admin map.** Mapbox GL JS (new dep + `AHITS_MAPBOX_TOKEN` secret — add to Secret Manager **before** the deploy that mounts it, per the DB/secret rules, and to the Makefile `--set-secrets`). Full-width dashboard card below the KPI row; one pin per active deployment at its latest daily-check coords; **pin color = recency** (green <24h / amber 24–48h / red >48h); click → tooltip (operator, project, rig/vehicle summary, kit count, "last updated [relative]" + link to the deployment — use the **renamed** stable route from Wave 0.8). Collapses to a compact interactive view on mobile. Default view fits all pins (centers on continental US if none).

**Out of scope.** Route/path history; real-time tracking (updates only on check submit); operator-facing full map (operators see only their own pin). Later synergy: REQUESTED/STAGED deployments as "pending pickup" pins.

**Acceptance criteria.** Opt-in prompt on submit; denial still submits; coords persist and survive offline replay; pins render with correct recency colors; tooltip links resolve; CSP `connect-src`/`img-src` updated for Mapbox tiles. **Tests:** payload-with-gps round-trip; denied-permission submit path; recency-bucket color logic. **Effort:** small. **Risk:** low — additive, de-risks the GPS plumbing the analytics later reuse.

### Capstone 2 — No-app QR daily-check web form (reuses the token primitive)

**Goal.** A daily check completable from any phone camera, no install, via a tokenized mobile web form — the cheapest capstone because the `/s/[token]` primitive is production-grade.

**Reuse.** Add a `StatusLinkType` (e.g. `DAILY_CHECK`) + a subject FK (vehicle or deployment) on `StatusLink`; an `ALLOWED_ACTIONS['DAILY_CHECK']` entry; a branch in `applyTransition` that **creates a `DailyCheck` and runs the same side-effects the authed route does** (`DAILY_CHECK_FAILED` alert, odometer→mileage-task flip, `EQUIPMENT_NOT_RETURNED`); a public form UI under `/s/` (the external design system already models big-touch-target, login-less forms — reuse `FulfillmentChecklist`/`s` patterns and the 16-item list).

**Security (non-negotiable, from the security audit).** Treat the token exactly like a status-link token: 256-bit CSPRNG, sha256-at-rest, explicit expiry, state-machine-bounded/single-use, least-privilege payload (no PII/photos/inventory). **Rate-limit + magic-byte-gate** any photo upload from this **unauthenticated** context (reuse `photo-security.ts` + a per-token limiter). **Key idempotency on a stable per-action token, not `Date.now()`** (fixes M-OFF1, which otherwise duplicates submits). Do the **CSP nonce** migration (Wave 0.6) first.

**Pairing.** Build the **`DAILY_CHECK_MISSED` cutoff scan** (H-NOTIF2) alongside — a no-app form is most valuable paired with "nag if not submitted by the configured cutoff."

**Acceptance criteria.** Scanning a printed QR opens the form with no app; submit creates a real `DailyCheck` with identical side-effects; double-submit is deduped; token expiry/revoke enforced; no PII leak. **Tests:** the public transition handler (currently zero coverage — H-TEST1), idempotency dedupe, failing-check alert from the public path. **Effort:** small-medium. **Risk:** medium — it widens the unauthenticated write surface; the Wave-0 security items must land first.

### Capstone 3 — Time Tracking, Invoicing & Availability (the heavy one)

**Goal.** Operators-as-contractors clock in/out (auto-linked to deployment+project), log expenses + mileage with receipts, and generate PDF invoices Draft→Submitted→Approved→Paid, with the approved invoice **auto-emailed** to a processing-address list (reusing the notification dispatcher).

**The 7 models** (per PRD §11.12/§18). Field sketches: **`TaskType`**(name, rateMultiplier, fixedRate?, isActive); **`OperatorRate`**(operatorId, taskTypeId, customRate — overrides TaskType for that operator); **`TimeEntry`**(operatorId, **rigId/deploymentId**, projectId?, taskTypeId, clockIn, clockOut?, durationMinutes computed, notes?, hourlyRateApplied); **`Expense`**(operatorId, projectId?, deploymentId?, vehicleId? for rental tie-in, type[Mileage/Fuel/Lodging/Equipment/Other], amount, date, description, receiptUrl?); **`Invoice`**(operatorId, invoiceNumber, periodStart, periodEnd, status[DRAFT/SUBMITTED/APPROVED/PAID], subtotalHours, subtotalExpenses, grandTotal, pdfUrl?, submittedAt?, approvedAt?, approvedById?, paidAt?); **`InvoiceLineItem`**(invoiceId, type[TIME|EXPENSE], description, quantity, rate, subtotal, source ref); **`Availability`**(operatorId, date, type[AVAILABLE/UNAVAILABLE/TIME_OFF], notes?). Add `milesReimbursementRate` to settings. `User.hourlyRate` already exists (wired, **but NOT seeded** — set it for seeded users).

**Critical prerequisites (from the data-model audit).** (1) **Attribution must source from `deployment_assignments`** (immutable history), **not** legacy `rig.operatorId` — so finish Wave 0.7 first. (2) **Pick one rate source** — `User.hourlyRate` default vs `OperatorRate`/`TaskType` — don't create a third dual-write. (3) **TimeEntry references the Rig (deployment)** and resolves project via `deployment_projects`, or carries its own `projectId` — pick one, avoid the legacy `rig.projectId` trap. (4) Money uses `validation.money()`; cost-stripping for operators is an established pattern to copy. (5) Time/clock writes are **offline-first** — reuse `useOfflineQueue.mutate()` + idempotency, and **sharpen the IDB-eviction warning (H-OFF1)** because a lost clock-out is a payroll problem; prefer server timestamps + a "missed clock-out" reconciliation report over trusting client wall-clock.

**Clock-in flow (per PRD).** Clock in anytime (no active deployment required); >48h since last → "new deployment?" (yes→create/assign; no→pick existing); <48h → "same as last time?" (yes→link + prompt the daily checklist before recording; no→pick different).

**Invoice email (reuses the dispatcher).** The `INVOICE` `StatusLinkType` + default expiry + `ALLOWED_ACTIONS['INVOICE']` already exist, but there is **no issuer, no `invoiceEmail` template, and no back-write handler** — build all three. **Blocker: email reliability (H-NOTIF1)** — a money email cannot fail silently; ship the retry + delivery log from Wave 0.5 first. Any outbound target comes from a server-side allowlist (no recipient-supplied URLs → SSRF).

**Availability.** Operator monthly calendar (available/unavailable/time-off/assignments/logged-time; tap to edit); admin grid (row per operator, filterable) answering "who's free next week?". Index `Availability(operatorId, date)`.

**Out of scope.** External payroll (QuickBooks/Gusto); auto-overtime; two-way calendar sync; expenses as a separate approval workflow (approved at invoice level).

**Acceptance criteria.** Clock in/out persists offline and reconciles; durations + rates compute correctly; expenses attach receipts via the private bucket; invoice PDF renders hours-by-project/task + expenses; lifecycle transitions gated by role; approved invoice emails reliably (with a delivery record); availability grid answers the scheduling question. **Tests:** rate resolution (TaskType vs OperatorRate vs User.hourlyRate), duration math, invoice totals, offline clock round-trip, the money-email retry/log. **Effort:** large (7 models, PDF, offline, email). **Risk:** medium-high — the heaviest item; gated by the legacy-column retirement and email reliability.

### Polish 4 — Advanced cost analytics & maintenance prediction nudge
Build on the **already-shipped** Equipment Cost & Utilization report: spend-trending over time, and the prediction nudge ("approaching service interval / cost $X in 90 days") — the dashboard "Maintenance watch (90-day spend)" card is the seed. Push aggregation into SQL (resolves H-API3). **Effort:** small-medium. **Moves the 25%-repair-spend KPI.**

### Polish 5 — Admin-mobile optimization
10 admin screens use raw `<Table>` with no mobile fallback; operators reach them via read-only Browse on phones. Add responsive card-fallbacks at `xs` (or a horizontal-scroll wrapper), give the 2 non-clickable StatCards a drill-through, standardize Skeleton-vs-CircularProgress. The admin shell already collapses to a hamburger drawer — the tables are the gap. **Effort:** medium. **Moves adoption** (operators on phones).

### Polish 6 — Contractor self-onboarding (self-service PIN setup)
The building blocks are done (CSPRNG invite tokens, `mustChangePin` server gate, the operator Change-PIN screen). The remaining piece is the self-service flow so a contractor completes setup without an admin hand-minting a PIN — reuse the invite primitive; pair with trivial-PIN rejection (M-SEC3). **Effort:** small.

### Polish 7 — React Native wrapper · **DESCOPE recommended**
Every doc recommends **not** building it unless iOS Web Push proves insufficient — a wrapper buys app-store presence at the cost of a second codebase the PWA doesn't need. Formalize the descope (governance #3) and instead scope **iOS 16.4+ PWA Web Push** if "push is primary" (M-NOTIF1) must be met for the pilot.

---

## 7. Cross-platform & per-user readiness matrix

| Surface | Desktop (web) | Android (web/PWA) | iOS (web/PWA) | Offline | Phase-3 note |
|---|---|---|---|---|---|
| **Operator loop** (home, daily-check, deploy, transfer, scan, bell) | ✅ | ✅ phone-first; bottom-nav | ✅ safe-area handled; **PWA cold-launch + overnight eviction unverified (A6)** | ⚠️ daily-check/deploy-create/return queue; **add-items-to-offline-rig broken (C1)**; **no eviction warning (H-OFF1)** | GPS capture + time-clock land here; reuse `mutate()`; fix eviction warning before clock |
| **Admin console** | ✅ broad & polished | ⚠️ hamburger nav OK but **data tables clip (no card fallback)** | ⚠️ same | n/a (admin online) | **Admin-mobile (Polish 5)**; operators also hit these via read-only Browse |
| **External `/s/` portal** (shop/hub/processor) | ✅ best touch sizing in app | ✅ | ✅ | ❌ live-only by design (recipients at a desk) | No-app QR form + invoice link extend this; **idempotency `Date.now()` dup (M-OFF1)**; rate-limit public uploads |
| **Ended-deployment review** (admin) | ❌ **crashes (B1)** | ❌ | ❌ | — | fix in Wave 0.2 |
| **Transfer receive w/o active deployment** | ❌ **invisible (B3)** | ❌ | ❌ | — | fix in Wave 0.2 |

**Net:** the live-online experience is solid on all platforms for both roles (modulo the admin-table mobile gap). The genuine cross-platform risk is concentrated in **iOS-PWA offline** — exactly what the A6 device pass exists to validate, and exactly where C1 (add-items) and H-OFF1 (eviction) live. Do not declare the pilot line reached on emulators; it requires real iOS + Android hardware.

---

## 8. Governance decisions to lock (before sequencing locks)

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Deployment Requests — in/out** | **Moot — already built & merged** (live-confirmed). Only confirm the full Addendum-§F `RESERVED`/lifecycle state machine is complete. |
| 2 | **Trusted-device / 30-day-idle sessions — retire vs build** | **Retire** (recommended): the revocation goal is already met by the 24h JWT + per-request `isActive`/`tokenVersion` re-check. Make the call explicitly so §10.1 doesn't reopen scope. |
| 3 | **React Native wrapper — descope** | **Descope** (recommended): favor iOS 16.4+ PWA Web Push if "push is primary" is required. Formalize the sign-off. |
| 4 | **Time/Invoicing/Availability — confirm as P3** | Confirm scope/timing (heaviest item, 7 models). **Gate it behind the legacy-column retirement** so attribution is built on `deployment_assignments`. |
| + | **"Push is primary" for pilot?** | If yes, scope **operator Web Push** (M-NOTIF1); the bell/badge data sources already exist. If no, the 45s polling is the accepted pilot mechanism — state it. |
| + | **Email sandbox + reliability** | Approve the staging email guard + delivery-log/retry as Wave-0 (blocks the invoice email and protects real hub/shop contacts now). |

---

## 9. Sequenced milestone plan

```
WAVE 0  Pre-Phase-3 hardening (gate + base) ── §5
  0.1 A6 device pass ........................ [GATE = pilot line]
  0.2 Fix B1, B2, B3 (live bugs)
  0.3 Decide/scope offline add-items (C1)
  0.4 API/data hygiene (clampPageSize, wrapWrite→P2025/404, zod, indexes)
  0.5 Email sandbox guard + delivery log/retry
  0.6 Security: CSP nonce, rate-limit uploads/photos, trivial-PIN, IDB eviction warn
  0.7 Legacy-column retirement (snapshot → DROP)  [prereq for Invoicing]
  0.8 Rename my-rig→my-deployment; SWR + freshness/outbox; extract respond dialog
  0.9 Cleanup: dead deps/code/secret; dup-timestamp migration; DAILY_CHECK_MISSED; a11y; test /s/

M-MAP    Capstone 1 — Deployment Map ............ (after 0.1 GPS hook; seed GPS early)
M-QR     Capstone 3 — No-app QR daily-check ..... (after 0.6 security; pair DAILY_CHECK_MISSED)
M-DATA   Pre-prod data/scale: UR-032 attribution, finish #29 contract, indexes verified
M-INV    Capstone 2 — Time/Invoicing/Availability (after 0.5 email + 0.7 retirement)  [heaviest]
M-POLISH Analytics+nudge (4), Admin-mobile (5), Contractor onboarding (6); Web Push if chosen
PRE-GO-LIVE  Prod-DB standup (Option A) + isolation check; prod cron scheduler; backups/retention;
             migration-baseline; security/cleanup tail; RN descope sign-off (3)
```

**Three honest lines:** **Pilot** = Wave 0.1 (+ 0.2/0.3 strongly recommended). **Credible Phase-3 v1** = Wave 0 → Map → QR. **Full Phase 3** = + Invoicing + polish, then pre-go-live. All Phase-3 work ships on `ahits-web-app-staging` until the deferred prod cutover.

---

## 10. KPI mapping (PRD §7 → work)

| PRD §7 metric | Phase-3 (and Wave-0) work that moves it |
|---|---|
| **100% known location & status** | **Map** (GPS on check) · UR-032 + B1 fix (ended-deployment "who has it") · transfers/hub-receipt (shipped) |
| **95%+ daily checks on time** | **16-item check (already live)** · **DAILY_CHECK_MISSED cutoff scan** · **No-app QR form** · operator ergonomics (done) |
| **Zero equipment missing >24h** | **A6 pass** · **B3 fix** (transfers can't strand) · hub receive/return-receipt (built) · C1 offline integrity |
| **0 missed maintenance ≤14d** | recurrence + mileage trigger (shipped) · M5 resolution paths · low-inventory + threshold (live) · cron (fixed) |
| **25% repair-spend reduction** | **Reports scoreboard (live)** · **advanced analytics + prediction nudge** · shop work-order loop + rental cost (shipped) |
| **90%+ operator adoption (2wk)** | **A6 offline reliability + C1** · freshness/outbox UI · **admin-mobile** (operators browse it) · Change-PIN (done) |
| **Admin notified ≤15 min** | dispatcher + bell (shipped) · **email retry/log** · cutoff alert · optional **Web Push** · shared-store rate limit (done) |

---

## 11. Risk register (top risks)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Irreversible legacy-column drop loses/forks data** | Med | **High** | Snapshot first; finish reader migration + dual-write stop; add one-active-PRIMARY index; drop only after invoicing's attribution source is settled (Wave 0.7 before M-INV) |
| **iOS storage eviction silently drops field data** (queued checks/returns/clock-outs) | Med (iOS ITP/private) | **High** | H-OFF1: `persisted()`/`estimate()` checks + explicit "storage at risk / couldn't save" surface; server-side reconciliation for clock events; A6 overnight watch-item |
| **Offline add-items loop fails in the field** (C1) despite green A6 | **High** if unaddressed | Med-High | Wave 0.3 decision: build local offline-rig model or scope honestly + add the A6 row |
| **Widened public/token surface (No-app QR) is exploited** | Low-Med | High | CSP nonce + rate-limit + magic-byte-gate + stable idempotency key + least-privilege payload **before** M-QR; test the public transition handler |
| **Billing email fails silently** (invoice→processor) | Med | High | H-NOTIF1: retry + delivery log + surface `emailed:false`; staging sandbox guard so QA can't email real parties |
| **A6 never actually re-run on hardware** → pilot ships on emulator confidence | Med | High | Treat 0.1 as a hard gate with recorded sign-off across 5 real targets |
| **New routes copy today's gaps** (pagination/500s/raw errors) | Med | Med | Wave 0.4 shared helpers land before capstone routes |
| **Staging emails real hubs/shops during QA** | Med (today) | Med | Wave 0.5 sandbox guard **now** (HUB_RETURN auto-fires with no send click) |

---

## 12. Test & verification strategy

- **Highest-risk untested code (close before/with Phase 3):** the unauthenticated `POST /s/[token]/transition` + its `status-links`/`idempotency`/`rate-limit` libs (zero coverage); auth/vehicles **handler** tests (incl. the operator-rental 201 / fleet 403 boundary); the cron dispatcher; the offline queue's dependent-write/remap path. 22 test files today cover libs better than route handlers.
- **Per-capstone tests:** Map (gps payload round-trip, denied-permission submit, recency buckets); QR (public transition handler, idempotency dedupe, failing-check side-effects from the public path); Invoicing (rate resolution, duration/total math, offline clock round-trip, money-email retry/log).
- **Regression tests for this review's bugs:** B1 (ended-deployments render with null operator), B2 (accept reflects the moved item without reload), B3 (transfer acceptable with no active deployment).
- **Device matrix (A6):** the 18-row × 5-target sheet — must include the SW-drop+warm offline-nav ritual (step 3), **add-items-to-offline-rig** (new row), and the **overnight iOS eviction** watch-item. CI already gates lint/type-check/build/test on every PR; keep that green on `development`.
- **High-stakes verification:** for irreversible or money-adjacent work (legacy-column drop, invoicing), run a dedicated adversarial verification pass against source (as done for this review) before merge.

---

## 13. Appendix — source audit files

Full detail behind this synthesis lives in the review's raw audit set (scratchpad `outputs/audit/`): `01_prd_phase3_baseline.md` (scope/KPIs/issue inventory), `02_data_model.md` (schema, indexes, retirement, GPS + 7-model specs), `03_api_rbac.md` (80-route table), `04_security.md` (OWASP review), `05_frontend_ux.md` (consistency/cross-platform), `06_offline_pwa.md` (SW/queue/eviction/A6), `07_deadcode_tests.md` (dead code/deps/coverage), `08_notifications_external.md` (alerts/email/token flows), `09_live_walkthrough.md` (this review's staging click-through), `10_verification.md` (adversarial re-check with `file:line`). Primary specs remain `AHITS_PRD_v2.md` + `_v2.1_ADDENDUM.md` (frozen) and the live `AHITS_ULTRA_REVIEW_ISSUE_REGISTER.xlsx`.

_End of workplan._



