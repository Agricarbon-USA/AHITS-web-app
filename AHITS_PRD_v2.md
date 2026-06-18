# AHITS — Product Requirements Document, v2 (Comprehensive)

**Agricarbon Hardware Inventory & Tracking System**
Version 2.0 · prepared 2026‑06‑18 · supersedes `AHITS_PRD_v1` and its June "Post Wave 0" status update

---

## 0. Document control

**v2 is a superset of v1 — nothing has been dropped.** This document preserves every product specification from v1 in full (problem statement, goals, personas, platform, authentication, all feature specifications 7.1–7.12 including the Deployment Map and the Time‑Tracking/Invoicing/Availability module, the data model, non‑functional requirements, out‑of‑scope list, phases, open questions, and glossary). On top of that enduring spec, v2 folds in everything learned and shipped during the latest implementation‑and‑QA cycle: a build‑status matrix, a session changelog, the deploy/commit state and loose ends, hands‑on QA verification results, a **severity‑ranked operator defect punch list slotted into the wave/phase where each item should be fixed**, an updated forward work plan, and a sweep of gaps in the PRD, codebase, and workflow. **Where v2 differs from v1, v2 takes precedence.**

**How to read this document.** Sections 1–5 are the *current state* (status, changelog, QA, punch list) — the freshest material. Sections 6–20 are the *enduring product specification* carried forward from v1, annotated with a short **Build status** line per feature so the spec doubles as a live tracker. Status key used throughout: ✅ built & verified · 🟢 built, light verification · 🟡 partial / has defects · ⛔ not started.

**Companion repo documents** (current; in the repo root):
`AHITS_PRD_v2.1_ADDENDUM.md` (maintenance states · account management · Kit/Rig/Deployment — folds into this PRD) · `AHITS_INDEPENDENT_ASSESSMENT_AND_ROADMAP.md` (independent code+staging review, issue/risk register, wave roadmap) · `AHITS_QA_STAGING_ISSUES.md` (raw QA record).

**Historical / superseded docs** have been moved to `docs/archive/` (see `docs/archive/README.md`): the earlier `AHITS_WAVE1_ANALYSIS_AND_ROADMAP.md`, `AHITS_STATE_ANALYSIS.md`, `AHITS_SIMPLIFICATION_REVIEW.md`, `AUDIT_REPORT.md`, `AHITS_REVIEW(_V2).md`, `PRD_ADDITIONS_V2.md`, `AHITS_QA_RESUME_CHECKLIST.md`, and the `CLAUDE_SPRINT_*` / `CLAUDE_*_FEATURE.md` build logs. They remain available for engineering detail but are pinned to older baselines.

**Stack (all decisions RESOLVED).** Next.js 16 (App Router) · TypeScript · Prisma 5 · Supabase (Auth/Storage/Realtime) · Material UI · Serwist PWA · GCP Cloud Run (us‑central1) via GitHub Actions. Mobile is web‑first PWA; a React Native wrapper is deferred to Phase 3.

---

## 1. Executive summary

Agricarbon is a distributed field organization performing soil sampling across cropland, rangeland, and forestry projects in multiple countries. Field crews operate across multiple regions simultaneously, deploying a fleet of trucks, UTVs, ATVs, trailers, and supporting equipment. Today, equipment location, maintenance status, and daily vehicle safety checks are tracked inconsistently — across text messages, paper forms, and ad‑hoc spreadsheets — causing lost equipment, deferred maintenance and expensive breakdowns, and no centralized visibility for operations management.

AHITS is a purpose‑built, full‑service application that gives every field operator and administrator a single, always‑available system for tracking equipment, logging vehicle checks, managing maintenance schedules, and coordinating gear across projects. It is designed to work in low‑connectivity field environments and scale from a small core team to a full contractor network of 100+ users.

**Target outcome:** 95% of daily vehicle checks submitted on time, zero equipment "lost" for more than 24 hours, and a 25%+ reduction in equipment costs through preventative maintenance — within 6 months of full deployment.

**Where the build stands now.** The product has moved from "broad but shallow" to a genuinely working core. Wave 0 (inventory source‑of‑truth, login hardening) was completed earlier; this cycle landed **Wave 1 in full** — the offline‑first promise that is the product's entire reason for existing — plus QR association/scan‑routing, a consolidation pass, and a string of correctness fixes surfaced by hands‑on QA of the live staging app as two real operators. The load‑bearing flows now work and were verified end‑to‑end on staging: daily checks (online and offline, with idempotent sync), kit assembly, equipment check‑in/out, transfers (create/accept/decline across two operators), damage/inoperable reporting, and context‑aware QR scanning. The remaining defects are all non‑architectural and are ranked and slotted in §5. The next move remains **consolidation before new features**: finish Wave 2 correctness, close Phase 2 (photos, maintenance loop, notifications), then build the Phase 3 capstones (Deployment Map; Time‑Tracking/Invoicing/Availability).

---

## 2. Build status — phases × waves (current)

**Phase 1 — Foundation** (v1 target "50% by end of June") ≈ **85%**
- ✅ PIN + admin login, with login rate limiting + admin lockout (Wave 0).
- ✅ Inventory single source of truth (`InventoryUnit`‑derived counts); `availableUnits` restored this cycle.
- 🟡 Vehicle CRUD — works; PATCH still unvalidated mass‑assignment (Wave 2).
- ✅ Daily vehicle check — verified online **and** offline with idempotent sync.
- ✅ Equipment check in/out — verified via scan and My‑Rig; now durable offline.
- 🟡 Admin dashboard — stat cards + Active Deployments tile; §11.1 feeds/tables not built.
- ✅ QR association/lookup — associate/read existing labels, no generation; association‑on‑create (vehicles + units) shipped.
- 🟡 Settings — categories + hubs management; alert‑threshold/cutoff config not wired.
- ✅ Rigs/Kits/Deployments + transfers — verified end‑to‑end across two operators.

**Phase 2 — Core Operations** (v1 target "95% by end of July") ≈ **35%**
- ✅ **Offline + background sync — Wave 1, shipped and verified** (queue, honest indicators, idempotent replay, sync on reconnect and on mount).
- 🟡 Maintenance scheduling/tracking — damage‑report tasks are created (verified); the "mark complete → recalc next due → spawn next task" loop and the mileage trigger are not built.
- ⛔ Photo capture — no in‑app capture anywhere; no compression; no upload‑on‑sync.
- 🟡 Notifications — daily‑check‑fail email is wired; `DAMAGE_REPORTED` alert rows are created; the other five alert types and any push are not.
- ✅ Item disposition (INOPERABLE / damage) — verified (unit status + maintenance task + alert).

**Phase 3 — Scale & Polish** (v1 target Q4 2026): ⛔ **not started.** Deployment Map, time/invoicing/availability, advanced reporting. None of the new models exist; GPS is currently on `Photo`, not `DailyCheck`.

"95% by end of July" still requires descoping; Wave 2 is the prerequisite.

---

## 3. Session changelog — what shipped this cycle

All work is on branch `feature/20260617/maxwellslater-wave1-offline-real`. Staging is live on commit **`9a7ae50`** (`https://ahits-web-app-staging-vdz5yvke2a-uc.a.run.app`). Each item was type‑checked (`tsc --noEmit`) and linted before deploy.

**Wave 1 — Make offline real (`413cf2d`).** The product's central promise, previously unbuilt beyond the daily check.
- Durable IndexedDB queue that **seeds its pending count on mount** and **flushes on mount / on `online` / on `visibilitychange` / on interval** (previously flushed only on the `online` event and always showed "0 pending").
- **Terminal‑vs‑retryable handling:** 4xx → a "needs attention" set; 5xx/network → backoff to a cap (no more wedged queue).
- **Idempotent replay:** every queued mutation carries a `crypto.randomUUID()` `Idempotency-Key`; a server `withIdempotency` wrapper (raw‑SQL `idempotency_key` table, degrades safely pre‑migration) dedupes replays. Wired into the non‑idempotent deployment routes.
- A shared `mutate()` helper so the scan page and all My‑Rig mutations queue identically; honest **offline banner + AppBar sync state**; service‑worker **precache of operator routes** + 7‑day field‑read cache; iOS safe‑area + `storage.persist()`; manifest unlocked to landscape (iPad kiosk).

**Wave 1 — QR association‑on‑create + context‑aware scan routing (`f917fda`).** Per the v1 QR addendum (no in‑app generation): `POST /api/vehicles` and `POST /api/inventory/[id]/units` accept an existing label's code (with 409 conflict handling); a shared `QrScanField` (type / USB‑scan / camera); a `vehicles/by-qr/[qrCodeId]` lookup; and the operator scan page resolves a code to a **unit or vehicle** and presents status‑based actions (Available→Add, Checked‑out→Return, Vehicle→Start Daily Check with the vehicle pre‑selected).

**Consolidation / cleanup (`b6851d0`).** Behavior‑preserving simplification: deleted the backslash‑named junk route tree; one shared status vocabulary (`src/lib/status.ts` + `StatusChip`) replacing duplicated maps; one shared `ConfirmDialog` replacing three copies (with a `try/finally` so the button can't wedge); `parseScannedCode()` helper de‑duping the QR parse; dropped the `queueSize` alias. (Cleanup #4 — the `requireAdmin`/`requireAuth` consolidation — see loose ends in §3.1.)

**Correctness fixes found by QA, shipped live:**
- `fe2c54e` — **kit‑builder crash fixed.** Add Items *and* Build Kit threw React #31 (rendering a `{id,name}` category object). Both now render `category?.name`, matching the API contract.
- `5008d1c` — **unit pickers restored.** `/api/inventory` was no longer returning the documented `availableUnits` array, so the Build‑Kit/Add‑Items unit dropdowns were empty even when units were available. Restored at the API.
- `94537e1` — `requireAuth`/`requireAdmin` helpers added to `session.ts`.
- `9a7ae50` — **operator transfers unblocked.** My Rig built the transfer destination list from admin‑only `/api/users` (403 for operators → empty dropdown). Added an auth‑readable `/api/operators` roster (id/name/role only).

### 3.1 Deploy state & loose ends (must‑do housekeeping)

**Deployed & live on `9a7ae50`:** everything above *except* the route‑level auth refactor below.

✅ **RESOLVED — the Cleanup #4 auth‑helper route transforms are committed.** Commit `0d5591c` ("Fix 15 Wave 1 code‑review bugs + complete requireAdmin refactor", merged via PR #18) committed the route files using `requireAdmin()` / `requireAuth()`. At HEAD `3c7516c`, 39 of 43 API routes use the helpers; the remaining handful are legitimately non‑admin. *(This loose end is closed; retained here for history.)*

✅ **RESOLVED — the two diagnosed fixes:**
- **Operator vehicle remove** (Punch #1) — fixed in `0d5591c`; the UI now sends `{vehicles:[{vehicleId,dispositionType:'AVAILABLE'}],note}`.
- **Consumable‑transfer banner quantity** (Punch #2) — fixed in **Wave 1.5**; the incoming/outgoing banners now render the transfer line's quantity (`TransferItem.quantity`), not the source total.

---

## 4. QA verification results — proven working on staging

Driven hands‑on through the live app as **Field Op 1 and Field Op 2** (and via direct API/IndexedDB inspection). Everything below is confirmed working:

- **Daily check:** pass; fail + required summary + admin email; fail‑validation; **offline submit → durable queue (with idempotency key) → auto‑sync on reconnect and on app reload → exactly one DB record (no duplicate).**
- **Kit:** Build Kit + Launch deployment; Add Items (serialized, with unit picker); Log Daily Usage (consumable qty); per‑item Return; bulk Remove Items; **damage disposition** (Inoperable → unit `IN_MAINTENANCE` + maintenance task `"Damage repair: …"` created).
- **Transfer (two operators):** create → **accept** (item moves, unit status correct) → and **decline** (item correctly stays with the sender; unit status verified consistent via API). The duplicate `accept`/`decline`/`[action]` handler concern **did not manifest** — the safe static handlers run.
- **Consumable transfer:** create + accept; **Field Op 1 received the correct quantity (10)** — verified in `/api/deployments`.
- **End Deployment:** rich per‑item disposition flow; all items returned to hub.
- **Scan QR routing (Wave 1):** vehicle → Start Daily Check **with the vehicle pre‑selected**; available unit → Add to Kit; checked‑out unit → Return to Hub; unregistered code → clear error.

**⏸ Open verifications (do on the admin walkthrough):** confirm Field Op 2's Bakery Bag **decremented 83 → 73** after the transfer (no consumable double‑count); confirm the `DAMAGE_REPORTED` alert fired for the Hand Corer report (admin‑only endpoint).

**🧪 Test gaps (need a real device / dedicated harness, not blockers):** service‑worker **cold‑offline launch**; **terminal‑failure "needs attention"** queue path; **conflict resolution** (two devices, same unit, offline); **auth tests** remain at **zero** (PIN lockout, session expiry, invite flow are the most security‑critical untested code).

---

## 5. Operator defect punch list — ranked & slotted

Every item traces to `AHITS_QA_STAGING_ISSUES.md`. **Slot** = where it should be fixed. Severity: 🔴 High · 🟡 Med · ⚪ Polish.

| # | Sev | Defect | Root cause | Fix | Slot |
|---|-----|--------|------------|-----|------|
| 1 | ✅ | **Operator vehicle remove fails** ("Request failed", 400) — **FIXED (`0d5591c`)** | `DELETE /api/deployments/[id]/vehicles` expected `{vehicles:[{vehicleId,dispositionType}],note}`; UI sent `{vehicleIds,…}` | UI now sends `vehicles:[{vehicleId,dispositionType:'AVAILABLE'}]` | ~~Wave 2~~ **Done** |
| 2 | ✅ | **Consumable‑transfer banner shows wrong qty** (×83 not ×10) — **FIXED (Wave 1.5)** | Banner read source `kitItem.quantity`, not the transfer line's qty | Banners render `ti.quantity ?? ti.kitItem.quantity` | ~~Wave 2~~ **Done** |
| 3 | 🔴 | **Consumables can't be added to a kit via UI** | Add‑Items/Build‑Kit filter on `unitCounts.available > 0`; consumables have no unit rows → excluded | Include consumables with a quantity input (transfer Select‑Items already does this) | **Wave 2 — Correctness** |
| 4 | ✅ | **Pending‑transfer "Waiting…/Cancel" banner leaks to recipient** — **FIXED (Wave 1.5)** | UI passed `?direction=incoming/outgoing` but `GET /api/transfers` **ignored** the param, so both banners got identical data | API now filters by `direction` relative to the current user | ~~Wave 2~~ **Done** |
| 5 | ✅ | **UI doesn't auto‑refresh** after mutations — **FIXED (`0d5591c`)** | Handlers didn't re‑run `load()` on success | `await load()` after every operator mutation | ~~Wave 2~~ **Done** |
| 6 | 🟡 | **"Needs maintenance" quick return creates no task/alert** (silent `IN_MAINTENANCE`) while disposition path does | Per‑item `kitItem` DELETE only flips status; no task/`createAlert` | Decide whether the simple path also spawns a task/alert (likely yes) | **Wave 2 — Correctness** |
| 7 | 🟡 | **No damage‑photo capture** (daily‑check fails, check‑in damage) | Photo capture unimplemented app‑wide | Build photo capture end‑to‑end (§11.10 / Wave 2 photos) | **Wave 2 — Photos** |
| 8 | 🟡 | **No operator‑side UI to add a secondary operator** to a deployment | Model supports `RigOperator`; no operator UI | Confirm flow (admin‑assigns vs. operator‑shares); build it | **Wave 2/3** |
| 9 | 🟡 | **Consumable category mislabel** — "Bakery Bag" chip shows category "Storage" while peers show "CONSUMABLE" | Inconsistent item‑type vs. category rendering | Standardize the chip via shared `StatusChip`/vocabulary | **Wave 2 — UI unification** |
| 10 | ⚪ | **No "pending transfer" indicator** on items awaiting a decision | No visual cue in sender's kit | Add a pending badge | Wave 2 — UX |
| 11 | ⚪ | **React #418 hydration warning** recurs on transitions | Server/client mismatch — likely a date/relative‑time field | Render dates deterministically | Wave 2/3 |
| 12 | ⚪ | **Transfer empty‑state** shows a blank dropdown when no targets | No "no other operators" message | Add empty‑state copy | Wave 2 — UX |
| 13 | ⚪ | **Kit list re‑sorts** after each action | Re‑fetch reorders | Stable ordering | Wave 2 — UX |
| 14 | ⚪ | **Sparse daily‑check "Pass" review** (no echo of vehicle/odometer/site) | Pass branch omits the Fail‑branch summary | Echo submitted values | Wave 2 — UX |
| 15 | ⚪ | **Per‑item daily‑check note optional** (only overall fail summary required) | Validation only checks summary | Require a note per failing item (§11.4 intent) | Wave 2 — Correctness |
| 16 | 🟡 | **Checklist condensed** (9 items vs §11.4's ~16) and **no per‑vehicle‑type custom items** | Hard‑coded default checklist; no admin config | Expand to the full list; add per‑type/per‑project checklists | **Phase 2/3 — Per‑project checklists** |

**✅ Fixed this cycle (closed):** kit‑builder crash (React #31), empty unit pickers (`availableUnits`), operator transfer roster (`/api/operators`). See §3.

---

## 6. Problem statement

### 6.1 Current state

Agricarbon currently has no unified system for equipment or vehicle management. The following operational problems exist today:

- **No inventory visibility:** No one can answer "where is Christie Drill #2 right now?" without calling multiple people. Equipment gets left at field sites, borrowed between crews, or simply lost.
- **Inconsistent vehicle checks:** Daily pre‑deployment safety checks are performed informally or not at all. When equipment fails in the field, there is no record of its last inspection, making it impossible to identify patterns or hold anyone accountable.
- **Reactive maintenance only:** Maintenance happens when something breaks, not on a schedule. Oil changes, belt inspections, and fluid checks are missed until failure occurs — causing expensive downtime during active sampling seasons.
- **No check‑in/check‑out system:** Contractors pick up and return equipment without any formal logging. There is no record of who had what, when, or in what condition it was returned.
- **Zero cost visibility:** Total spend on equipment, maintenance, and replacements is unknown. There is no way to know the true cost per project or identify high‑cost equipment categories.

### 6.2 Impact

These gaps compound during the active sampling season (fall/spring) when 10–15 crews may be deployed simultaneously across multiple states. A single missing Christie Drill can delay a project by days. A truck breakdown without a spare tool kit can strand a crew for hours. A missed oil change can cost $4,000+ in engine damage.

---

## 7. Goals & success metrics

| Goal | Success metric |
|------|----------------|
| Operational visibility | 100% of equipment has a known location and status at all times |
| Daily check compliance | 95%+ of daily vehicle checks submitted on time (before field deployment) |
| Check‑in/out tracking | Zero equipment "missing" for more than 24 hours after 60 days post‑launch |
| Preventative maintenance | 0 missed scheduled maintenance items within 14 days of due date |
| Cost reduction | 25% reduction in unplanned equipment repair/replacement spend within 6 months |
| Adoption | 90%+ of field operators complete at least one daily check within 2 weeks of launch |
| Alert response time | Admin notified of damage or missed check within 15 minutes of trigger event |

---

## 8. User personas

| Role | Est. users | Primary device | Access scope |
|------|-----------|----------------|--------------|
| Field Operator / Contractor | 20–90 | iPhone / Android | Daily checks, check‑in/out, view own assignments, photo uploads |
| Admin / Operations | 2–5 | Web browser + iPad | Full access: inventory, vehicles, maintenance, reports, alerts, user management |

**8.1 Field Operator / Contractor.** Works outdoors, often in remote areas with limited or no cell signal. Uses a personal smartphone. Needs to complete tasks in under 2 minutes with minimal training. Primary actions: submit daily vehicle check before deployment, check equipment in or out, scan QR codes on assets, report damage with photo. Key need: dead‑simple UI, zero friction, works without internet, PIN login (no passwords to forget). Pain point today: no system exists, so nothing gets tracked. Will only adopt if the app is faster than texting a photo.

**8.2 Admin / Operations Manager.** Works from an office, truck cab, or iPad. Responsible for 10–30 contractors across multiple simultaneous projects. Needs at‑a‑glance visibility into fleet status and rapid response capability when things go wrong. Primary actions: review dashboard, respond to alerts, add/edit inventory, assign equipment to projects, mark maintenance complete, generate reports. Key need: one screen that shows the current state of everything; push alerts for problems; easy editing without needing a developer. **Must not see cost/spend data exposed to operators** — currently still leaks (see §16).

**8.3 External / receiving parties.** Maintenance shops and invoice‑processing addresses never log in, but the system holds their data (`shopName`, `shopAddress`, repair type, hub destinations) and, in the end‑state, **emails** them (repair/damage alerts; approved invoices to a pre‑configured address list). This output layer is still largely greenfield.

---

## 9. Platform & architecture

### 9.1 Target platforms

| Platform | Notes |
|----------|-------|
| iOS (iPhone) | Primary field operator device. iOS 15+. PWA (React Native wrapper deferred to Phase 3). |
| Android | Required for contractors on personal Android devices. Same feature parity as iOS. |
| Web (browser) | Admin dashboard. Chrome, Safari, Firefox, Edge. Responsive minimum 1024px width. |
| Tablet (iPad) | Base‑camp kiosk for check‑in/out station. Same web app, tablet‑optimized views (manifest unlocked to landscape this cycle). |

### 9.2 Architecture overview

AHITS is built as a Progressive Web App (PWA) — with a React Native mobile wrapper deferred to Phase 3 for app‑store distribution — backed by a cloud database with real‑time sync capability. The architecture must support:

- Full offline operation on mobile (all core workflows available without network) — **delivered in Wave 1.**
- Automatic background sync when connectivity is restored — **delivered in Wave 1**, with idempotent replay.
- Real‑time updates on the admin web dashboard.
- QR code **association and scanning** in‑app (generation/printing is out of scope — see §11.7).
- Photo capture and compressed upload from mobile camera — ⛔ not yet built.
- Push notifications to admin devices — ⛔ not yet built.

**Resolved stack:** Next.js 16 (App Router) + TypeScript + Prisma 5 + Supabase (Auth, Storage, Realtime) + GCP Cloud Run (us‑central1) via GitHub Actions CI/CD.

### 9.3 Future integrations (out of scope for V1)

Airtable sync for reporting/export · QuickBooks / accounting system for spend tracking · project management tools (Asana, Monday.com, Notion) · SMS gateway for non‑smartphone users.

---

## 10. Authentication & access control

### 10.1 Login method

Field operators authenticate with a simple numeric PIN (4–6 digits). PINs are set by an Admin when an account is created. PIN must be entered on first launch; subsequent logins on the same device use the cached session (no re‑login unless explicitly logged out or the session expires after 30 days of inactivity).

- **PIN length:** configurable by Admin, default 6 digits.
- **Failed attempts:** lock account after 10 consecutive failed PIN attempts; Admin can unlock. *(Login rate‑limit + admin lockout shipped in Wave 0.)*
- **Session:** persistent on trusted devices; expires after 30 days idle or explicit logout. *(Note — see §16: sessions are currently stateless 24h JWTs and can't be revoked; the trusted‑device model is not yet built.)*
- **Admin login:** email + password (or SSO if configured). PIN login is for operators only.
- **Device trust:** a device is "trusted" after first successful PIN login. Up to 3 devices can be trusted per user.

### 10.2 Role‑based permissions

| Feature / Action | Field Operator | Admin / Operations |
|------------------|----------------|--------------------|
| Submit daily vehicle check | YES — own assignments | YES — any vehicle |
| Check equipment in / out | YES — own assignments | YES — any item |
| View equipment status | YES — own project | YES — full inventory |
| Scan QR codes | YES | YES |
| Upload photos | YES | YES |
| Edit inventory / add items | NO | YES |
| Add / edit vehicles | YES — rental vehicles, trailers, UTV only | YES |
| Create / edit maintenance tasks | YES | YES |
| View all projects | YES | YES |
| Manage users & PINs | NO | YES |
| View cost / spend data | NO | YES *(currently leaks to operators — see §16)* |
| Export reports | NO | YES |
| Configure alert thresholds | NO | YES |
| Access admin dashboard | NO | YES |

---

## 11. Feature specifications

### 11.1 Admin dashboard

The primary landing screen for Admin users — a real‑time operational overview of the entire fleet and inventory.

**Required stat cards:** total inventory items (count); items currently checked out (count + %); items in maintenance or retired (count); maintenance tasks overdue or due this week (count, color‑coded); active vehicles vs. total; daily checks submitted today vs. expected (e.g., 8 of 12); total inventory value ($).

**Required feeds / tables:** missed daily checks today (vehicle, operator, last submitted time); maintenance due within 14 days (asset, task, priority, due date); currently checked‑out equipment (item, operator, project, expected return, overdue flag); last 10 activity‑log entries (timestamp, action, item, operator).

**Mobile/tablet view:** collapses to a stack of summary cards with tap‑to‑expand detail. Stat cards remain visible at top. Most critical alert (if any) is pinned as a red banner.

**Build status:** 🟡 stat cards + an Active Deployments tile exist; the four feeds/tables and the pinned‑alert banner are not yet built.

### 11.2 Equipment inventory

A searchable, filterable list of all Agricarbon equipment. One record per unique item type OR per unique serialized item (e.g., Christie Drill #1 is one record; a box of 500 sample bags is a different record type).

**Data fields per item:** Item Name; Category (Sampling Equipment, Vehicle, Power Tools, Hand Tools, Safety Gear, Electronics/GPS, Storage, Other); SKU/PLU; Quantity (total owned, separate from checked‑out count); Unit Cost ($); Reorder URL; Supplier/Brand; Status (Available / Checked Out / In Maintenance / Retired); Current Location (warehouse, vehicle ID, or project name); QR Code (existing physical label, code registered for lookup); Photos (up to 5); Notes.

**Operator view:** operators can search by name or scan a QR code to look up an item, see status and location (but not edit), and initiate a check‑out from the item detail screen.

**Build status:** ✅ single source of truth in place — serialized items derive counts from individual `InventoryUnit` rows; consumables use `quantity`. `availableUnits` array restored this cycle. ⚠️ Consumable accounting still has the §16 issue and consumables can't yet be added to a kit via UI (Punch #3).

### 11.3 Vehicle fleet management

Tracks all vehicles and mobile assets: trucks, trailers, Polaris UTVs, Can‑Am UTVs, Christie soil drills, ATVs.

**Data fields per vehicle:** Vehicle Name/ID; Type (Truck / Trailer / Polaris UTV / Can‑Am UTV / Christie Drill / ATV / Other); Year/Make/Model; VIN/Serial; License Plate; Current Odometer (mi, updated via daily check); Status (Active / In Maintenance / Out of Service / Retired); Current Location (synced from last daily check or manual); Assigned Operator (default, overridable per project); Insurance Expiration (alert 30 days prior); Registration Expiration (alert 30 days prior); QR Code (existing physical label); Maintenance History; Daily Check History; Photos (up to 10).

**Build status:** 🟡 CRUD works and QR association‑on‑create shipped; PATCH endpoint still needs validation hardening (mass‑assignment — §16).

### 11.4 Daily vehicle check

Highest‑volume workflow: up to 12 submissions/day across 12 operators in 12 locations. Must be completable in under 90 seconds on a phone with poor signal.

**Trigger flow:** open app (cached, no login if session active) → tap "Daily Check" or scan vehicle QR → vehicle auto‑selected (from QR) or chosen from assigned vehicles → confirm location (GPS auto‑fill, manual override) → enter current odometer → tap through inspection checklist (Yes / No / N/A) → if any item is "No": required notes, and if damage: required photo → submit. App queues for sync if offline; confirmation shown immediately.

**Standard checklist items (~16):** tire pressure (all 4, or UTV tracks); tire condition/wear; headlights, brake lights, reverse lights; windshield/wipers; engine oil level; coolant level; fuel level; brake fluid level; seatbelts (all positions); horn; no visible fluid leaks; emergency roadside kit; first aid kit stocked; fire extinguisher charged; trailer hitch secure (if towing); load secured (if hauling).

**Admin configurability:** add, remove, or re‑order checklist items; custom items per vehicle type (e.g., "Drive belt visual inspection" for Polaris only).

**Offline behavior:** the full form loads and is submittable with no network. Submissions are stored locally and uploaded when connectivity returns, timestamped at submission (not sync). Operator sees a "Queued — will sync" banner.

**Build status:** ✅ verified online and offline with idempotent sync (exactly one DB record on replay). 🟡 the checklist is currently condensed (~9 items) with no per‑vehicle‑type custom items (Punch #16); the Pass review screen is sparse (Punch #14) and per‑item failing notes aren't required (Punch #15).

### 11.5 Equipment check in / out

**Check‑out flow:** scan QR or search by name → select your name (roster) and project → enter destination/field site → set expected return date → optional notes → submit. Item status → "Checked Out", location → destination.

**Check‑in flow:** scan QR or select from "My Checked‑Out Items" → select condition (Good / Minor Damage / Needs Repair / Missing Parts) → if Minor Damage or worse: **required** photo(s) → enter return location (auto‑suggests last warehouse) → optional notes → submit. Status/location update; damage alert sent to Admin if applicable.

**Admin overrides:** check any item in/out on behalf of an operator, override return dates, bulk‑update location of multiple items, and mark items retired or in‑maintenance directly.

**Build status:** ✅ verified via scan and My‑Rig (now durable offline). ⚠️ damage‑photo capture is not yet built (Punch #7); the "Needs maintenance" simple path doesn't create a task/alert (Punch #6).

### 11.6 Maintenance scheduling & tracking

**Record fields:** Asset; Task (e.g., Oil & Filter Change, Drive Belt Inspection); Interval (mileage‑based, e.g. every 5,000 mi, or time‑based, monthly/annually); Priority (High/Medium/Low); Last Completed (date + odometer); Next Due (calculated from interval + last completed, or manual); Status (Upcoming / Due Soon (within 14 days or 500 mi) / Overdue / In Progress / Completed); Estimated Cost ($); Actual Cost ($, logged on completion); Assigned To (optional); Attachments (receipts, invoices, photos); Notes (shop, parts, observations).

**Mark‑complete flow:** Admin taps "Mark Complete" → enters actual completion date, actual cost, notes, optional photo/receipt → system auto‑calculates next due date from interval → task history preserved, new upcoming task created automatically.

**Mileage‑based trigger:** when an operator submits a daily check with an odometer reading, the system compares against maintenance thresholds and auto‑updates "Due Soon" / "Overdue" status as the mileage threshold is approached/exceeded.

**Breakdown / repair states (NEW — PRD v2.1 Addendum §A).** Beyond scheduled maintenance, the app must be comprehensive of what happens when a tool breaks **in the field**. An inoperable report (unit → `IN_MAINTENANCE`, task + alert) is followed by one of three **resolution paths**: **(A) Fixed in-field** — operator marks it operable and logs a *lightweight completed* `IN_FIELD_REPAIR` record (note required, cost/photo optional); unit rejoins the rig. **(B) Hub repair** — item is *shipped to the hub now* (leaves the rig) **or** *carried back at end of deployment* (stays with the rig, flagged `IN_MAINTENANCE`). **(C) Shop repair** — operator *delivers* or *ships* to a shop (`shopName`/`shopAddress`), which generates a **work order** to the shop. On close of a hub/shop repair, the **return destination must be explicitly selected** (no default — the repair can't close until one is chosen): originating hub (→ `AVAILABLE`), an active deployment (→ `CHECKED_OUT`), or a different hub. Location during repair is tracked as **status + a free-text location note** (no transit-state enum). This single flow **replaces the two divergent "needs maintenance" paths** (Punch #6) and is the home for *all* repair history (in-field included).

**Build status:** 🟡 damage‑report tasks are created (verified). The mark‑complete recurrence loop and the mileage trigger are **not built** (Wave 3). The **breakdown resolution-path flow above is specified and slotted into Wave 2B** (Addendum §A.7).

### 11.7 QR code system

QR codes are a core feature. Every vehicle and serialized item gets a QR sticker; scanning is the fastest path to any record.

**Scope (supersedes v1 §7.7 "Generation"):** the app does **not** generate or print QR codes. The requirement is to (a) associate an existing physical QR label with a serialized item or unit by reading or entering its code, and (b) read those codes to look up the associated record.

**Labeling & association:** QR labels are sourced/printed externally; each encodes a unique code the app reads to look up the record. Physical label spec: 2"×2" minimum, weatherproof/vinyl recommended for outdoor equipment. **Associate on create (Wave 1):** when an admin creates a serialized item or vehicle, they scan or enter the code printed on its existing label, and that code becomes the record's QR id — so any later scan resolves straight to it. **Input methods (Wave 1):** a "scan or enter code" field accepting a handheld USB scanner or manual entry (works on desktop), plus optional live camera scan (webcam or phone).

**Scan actions (context‑aware action sheet by current status):** Available → Check Out, View Details. Checked Out → Check In, View Details, Report Issue. Vehicle → Start Daily Check, View Details, Check Out Equipment. In Maintenance → View Details, Contact Admin.

**QR scanning — no app required (Phase 2/stretch):** in a future phase, QR codes can be scanned with any standard phone camera (no app install) and redirect to a mobile‑optimized web form for daily checks.

**Build status:** ✅ association‑on‑create (vehicles + units, with 409 conflict handling) and context‑aware scan routing shipped and verified this cycle. The no‑app web‑form remains a Phase 3 item.

### 11.8 Automated notifications & alerts

All automated alerts go to Admin / Operations users. Operators receive only direct confirmations of their own actions.

| Alert trigger | Notification details |
|---------------|----------------------|
| Maintenance task overdue | Push + email to Admin at 12:00pm on due date if not complete; repeats daily until resolved; HIGH shown red |
| Daily check not submitted by cutoff | Push + email if an expected check is not submitted by configurable cutoff (default 9:00am local); lists vehicle + operator |
| Equipment not returned by expected date | Push + email at 8:00am the day after expected return; shows item, operator, project, days overdue |
| Damage reported on check‑in | Immediate push + email on submission; item, operator, condition, photo thumbnail, notes |
| Repair needed immediately | Immediate push + email when operator selects "Needs Repair"/"Missing Parts"; flags item In Maintenance automatically |
| Inventory running low | Push + email when a consumable falls below a configurable threshold |
| Insurance / registration expiring | Email 30 days before and again 7 days before expiration on any vehicle |

**Channels:** push (iOS + Android) primary for time‑sensitive; email secondary (always sent alongside for archival); in‑app alert badge + notification center (persists until resolved). **Admin config:** cutoff time for daily‑check alerts, low‑inventory thresholds per item, which alert types are enabled, and which admins receive which types.

**Build status:** 🟡 daily‑check‑fail email is wired and `DAMAGE_REPORTED` alert rows are created; the other five alert types and any push are **not** built (Wave 3). Resend is already a dependency.

### 11.9 Offline mode & sync

The app must function identically offline as online for all operator workflows.

**Offline‑available features:** daily vehicle check (full form, queued submission); equipment check in/out (status updated locally, synced when online); QR scanning (resolves to locally cached record); view own assignments and checked‑out items; view vehicle/equipment details (last synced); photo capture (stored locally, uploaded on sync).

**Sync behavior:** background sync triggers automatically when any network is detected; conflicts resolved server‑side with last‑write‑wins on independent fields and a manual‑resolution prompt for conflicting status changes; sync status indicator in app header (Online / Offline / Syncing / X items pending); full data sync on app foreground if offline more than 4 hours.

**Data freshness:** admin dashboard requires online connection; operator cache refreshes on every app open while online; locally cached data valid for up to 7 days without a sync.

**Build status:** ✅ Wave 1 delivered the durable queue, honest indicators, idempotent replay, precache of operator routes, and 7‑day field‑read cache — verified end‑to‑end. The **conflict‑resolution** prompt is specified but unbuilt; the SW cold‑offline launch and conflict paths still need a real‑device pass. The implementation adds an **idempotency contract** (per‑action UUID + server dedup) that the PRD now formalizes (§16/§18).

### 11.10 Photo capture & attachments

| Context | Photo behavior |
|---------|----------------|
| Damage on check‑in | REQUIRED. 1–5 photos. Must be taken in‑app (no gallery upload for damage). Timestamp + GPS embedded. |
| Daily check issue noted | Required when any checklist item is "No". 1 photo minimum. |
| Maintenance receipt/record | Optional. Up to 3 photos/PDFs per task. Gallery upload permitted. |
| Inventory item reference | Optional. Up to 5 per item. Admin only. Gallery upload permitted. |
| Vehicle reference photos | Optional. Up to 10 per vehicle. Admin only. |

**Technical handling:** photos compressed to max 1200px longest edge, JPEG 85% before upload; stored in cloud object storage (Supabase Storage); thumbnails generated server‑side; stored locally when offline and uploaded on next sync; damage photos cannot be deleted by operators (Admin only).

**Build status:** ⛔ not built anywhere — no in‑app capture, compression, private storage, or upload‑on‑sync (Wave 2, Punch #7). Currently `Photo.url` is a free‑form string (a stored‑XSS/SSRF risk — §16).

### 11.11 Deployment map

A live map on the admin dashboard showing the current location of every active deployment. Location is captured automatically from the operator's phone GPS when they submit their daily check — giving admins instant situational awareness without any manual reporting.

**User stories — Admin:** see a map of all active deployments; click a pin to see that deployment's details (operator name, project, rig summary, last‑updated time); see how long ago a location was updated (to know if a crew hasn't checked in). **Operator:** location is captured automatically on daily‑check submit — nothing extra to do.

**How location is captured:** recorded from the operator's phone browser at daily‑check submission via `navigator.geolocation`, stored alongside the daily‑check record. If the operator denies location access, the check still submits — location fields are left blank and the pin does not appear until a successful location is recorded.

**Map behavior:** provider Mapbox GL JS; default view zooms to show all active pins (centers on the continental US if none). One pin per active deployment at the most recent daily‑check GPS coordinates. Pin color indicates recency: green if updated within 24h, amber 24–48h, red if >48h since last check‑in. Clicking a pin opens a tooltip: operator name, project (if assigned), rig summary (vehicle names), kit item count, and "Last updated [relative time]" with a link to the full deployment detail.

**Dashboard placement:** full‑width card below the KPI summary row; collapses to a compact, still‑interactive view on mobile.

**Data model changes required:** three new optional fields on `DailyCheck` — `gpsLat` (Float), `gpsLng` (Float), `gpsAccuracy` (Float, accuracy radius in metres for a display‑quality indicator).

**Out of scope (for now):** route history/path tracking; distance/mileage reports per deployment; real‑time tracking (location only updates on daily‑check submission); an operator‑facing full map (operators see only their own pin).

**Build status:** ⛔ not started (Phase 3). GPS currently lives on `Photo`, not `DailyCheck`.

### 11.12 Time tracking, invoicing & availability calendar

Operators are contractors. This feature lets them track hours, log mileage and expenses, and generate invoices to submit to Agricarbon for payment — all inside the app. It also includes an availability calendar so admins can see who is free for upcoming assignments.

**User stories — Operator (time tracking):** clock in/out with time auto‑linked to the current deployment and project; log the task type being worked (each has a different rate): In‑field/Coring, Travel, Rest Day, Weather Delay; add mileage and out‑of‑pocket expenses for reimbursement; review all logged hours and expenses for any period; generate and download a PDF invoice for a date range showing hours by project and task type plus all expenses.
**Operator (calendar):** mark days/ranges available for new assignments; mark time off (personal days, vacations) so admins know they're not reachable; see upcoming project assignments on a calendar.
**Admin:** see all operators' availability, time off, and assignments in a single calendar view, filterable by operator; see total hours and costs per project with a breakdown by operator and task type; review and approve submitted invoices — once approved, the system automatically emails the invoice to the designated processing addresses.

**Clock‑in flow:** operators can clock in any time (no active deployment required). On "Clock In", the app checks recent activity: if >48h since the last clock‑in, it asks "Are you working with a new deployment?" (yes → create/assign a deployment; no → select an existing one). If <48h, it asks "Are you working on the same deployment as last time?" (yes → links to the same deployment and prompts the daily vehicle/equipment checklist before recording the clock‑in; no → select a different deployment). After the deployment is confirmed, the operator selects the task type and the system records the clock‑in time. They tap "Clock Out" when done; duration is calculated automatically. Optional note describing the work.

**Task types:** four standard, each carrying a rate multiplier or fixed override per operator — In‑field/Coring (active sampling, ~1.0×); Travel (driving between sites/hub, e.g. 0.75×); Rest Day (mandatory rest, typically non‑billable or fixed day rate); Weather Delay (work stopped, admin‑configurable, e.g. 0.5× or flat per diem). Admin‑configurable using the same editable‑dropdown pattern as equipment categories. Each operator has a base hourly rate in their profile.

**Expenses:** log individual expenses with fields type (Mileage, Fuel, Lodging, Equipment Purchase, Other), amount ($), date, description, optional receipt photo (Supabase Storage). Auto‑linked to the current deployment and project. Mileage uses a configurable per‑mile reimbursement rate set by an admin in Settings.

**Invoice generation & approval:** an operator creates an invoice by selecting a date range; the system compiles all time entries and expenses in that period, calculates totals (hours × rates + expenses), and generates a PDF containing operator name/contact, Agricarbon billing address, line items by project and task type, expense items with descriptions, grand total, and an auto‑incremented invoice number. Statuses: Draft → Submitted (operator) → Approved (admin) → Paid (admin). On approval, the system automatically emails a copy to a pre‑configured list of processing addresses (set in admin Settings) — no manual forwarding.

**Availability calendar:** operator view — a monthly calendar with green blocks (available), grey (unavailable/time off), blue (active deployment assignments), and clock icons (days with logged time); tap any day to add/edit availability or log time off. Admin view — the same calendar showing all operators in a scrollable grid (one row per operator), filterable by operator, to answer "who is free next week?" before assigning a deployment.

**Data model (new models required):**
- `TaskType` — name, rateMultiplier, fixedRate (optional), isActive
- `OperatorRate` — operatorId, taskTypeId, customRate (overrides TaskType rate for that operator)
- `TimeEntry` — operatorId, projectId (optional), deploymentId (optional), taskTypeId, clockIn, clockOut, durationMinutes (computed), notes, hourlyRateApplied
- `Expense` — operatorId, projectId (optional), deploymentId (optional), type, amount, date, description, receiptUrl (optional)
- `Invoice` — operatorId, invoiceNumber, periodStart, periodEnd, status (DRAFT/SUBMITTED/APPROVED/PAID), subtotalHours, subtotalExpenses, grandTotal, pdfUrl, submittedAt, approvedAt, approvedById, paidAt
- `InvoiceLineItem` — invoiceId, type (TIME or EXPENSE), description, quantity, rate, subtotal
- `Availability` — operatorId, date, type (AVAILABLE/UNAVAILABLE/TIME_OFF), notes (optional)
- Also add `hourlyRate` (Decimal) to the `User` model for each operator's base rate, and `milesReimbursementRate` to the `Settings` model.

**Out of scope (for now):** integration with external payroll (QuickBooks, Gusto); automatic overtime calculations; two‑way calendar sync (Google Calendar, Outlook); expense approval as a separate workflow (expenses are included in the invoice and approved at invoice level).

**Build status:** ⛔ not started (Phase 3). None of the seven models exist yet.

### 11.13 Deployment Requests (pre-deployment provisioning)

Lets an Operator or Admin pre-specify the equipment a deployment needs — the **kit and rig, at the item-type + quantity level** ("2× GPS, 1× truck, 1× Christie drill, 500× bags"), with optional specific-asset requests — at a **target Hub**, *before* arriving to pick it up. This turns provisioning from a reactive scramble into a planned hand-off and is the proactive complement to the existing transfer/disposition flows.

**Three-step flow.** (1) **Request** — operator/admin builds the pick list; submitting creates a Deployment in `REQUESTED` and notifies the hub's fulfiller(s). (2) **Stage** — a **per-hub fulfiller** (an operator or admin assigned to that Hub, or any admin) resolves each line to **specific** units/vehicles, **reserves** them, runs a **per-item operable + presence quality check** (a failed item routes into the breakdown/maintenance flow, §11.6), substitutes as needed, and marks the rig `STAGED` (notifying the requester it's ready). (3) **Check-out** — the operator arrives, scans/confirms the staged rig, which flips reserved units to `CHECKED_OUT`, opens their `PRIMARY` assignment, and sets the Deployment `ACTIVE`; last-minute changes allowed. This reuses the existing check-out/transfer mechanic, seeded earlier in the timeline.

**Lifecycle:** `DRAFT → REQUESTED → STAGED → ACTIVE → COMPLETED` (`CANCELLED` releases reservations). **Reservation:** a new `RESERVED` equipment status removes staged gear from the available pool so it can't be double-booked; an unfulfillable line surfaces a **shortage** (feeds low-stock/reorder). **Roles:** request = operator (own) **or admin (who can create on anyone's behalf and assign the operator[s])**; stage = hub assignees or admin; check-out = the assigned operator (or admin on their behalf). Operators may request a **specific named serialized asset**, not just a type; a request can start a new Rig **or** clone a parked Rig template; **no separate approval gate** — hub fulfillment is the gate. New models: `DeploymentRequestLine`, `HubAssignment`, plus `Deployment` lifecycle/request fields and `RESERVED` on units/vehicles.

**Build status:** ⛔ not started — **fully specified in PRD v2.1 Addendum §F**; slotted as a dedicated **Wave 3** block (depends on the Wave 2B Deployment model; reads best with the Wave 3 notifications dispatcher).

---

## 12. Core data entities

Primary data objects in AHITS. Detailed schema (types, constraints, relationships) is defined during technical design.

| Entity | Key fields | Primary relationships |
|--------|-----------|----------------------|
| User | name, role, PIN hash, email, assigned vehicles, trusted devices, hourlyRate | Many projects; many check‑out logs |
| InventoryItem | name, category, SKU, qty, cost, status, location, QR code ID | Many check‑out logs; many photos; many units |
| InventoryUnit | itemId, status, QR code ID | One item (serialized count source of truth) |
| Vehicle | name, type, VIN, plate, odometer, status, location | Many daily checks; many maintenance tasks; many photos |
| CheckOutLog | timestamp, action (in/out), item, operator, project, location, condition, photos | One item; one user; one project |
| DailyVehicleCheck | date, vehicle, operator, site, odometer, checklist responses, issues, photos, pass/fail, (future: gpsLat/gpsLng/gpsAccuracy) | One vehicle; one user |
| MaintenanceTask | asset, task, interval, priority, last done, next due, status, cost | One vehicle or item; many history records |
| Project | name, type, location, start/end, status, lead, equipment list | Many users; many inventory items |
| Alert | type, trigger time, target (admin), resolved, link to triggering record | One admin user; one source record |
| Photo | URL, thumbnail URL, timestamp, GPS, uploader, context (damage/check/maintenance) | Polymorphic — linked to any parent |
| Hub | name, state, address | Many rigs; many kits |
| Rig | name, type, status, hubId | One hub; many kits; many deployments |
| Kit | name, rigId, status, itemCount | One rig; many kit items |
| KitItem | kitId, inventoryItemId, qty | One kit; one inventory item |
| Deployment | rigId, projectId, operatorId, startDate, endDate, status | One rig; one project; one operator |
| RigOperator | rigId, operatorId | Secondary operators on a deployment |
| TransferRequest | fromHubId, toHubId, requestedById, status | Many items; two hubs |
| Category | name, type, sortOrder | Many inventory items; admin‑managed |
| TaskType | name, multiplier, billable | Many time entries; admin‑managed |
| TimeEntry | userId, deploymentId, taskTypeId, startTime, endTime, hours | One user; one task type; one deployment |
| Expense | userId, deploymentId, type, amount, receiptUrl | One user; one deployment |
| Invoice | userId, period, status, totalAmount | One user; many line items |
| InvoiceLineItem | invoiceId, description, amount | One invoice |
| Availability | userId, date, type | One user |
| idempotency_key | key, scope, response | Dedup store for offline replay (shipped this cycle) |

---

## 13. Non‑functional requirements

| Requirement | Specification |
|-------------|---------------|
| Performance — form submission | Daily check confirms within 200ms (offline) or 2s (online) — ✅ met (queued instantly offline) |
| Performance — QR scan | Resolves to record within 500ms of scan (cached or online) — ✅ met |
| Performance — admin dashboard load | Loads fully within 3 seconds on standard broadband |
| Uptime | 99.5% availability during business hours (6am–8pm local across US time zones) |
| Security — PIN storage | PINs stored as salted bcrypt hashes; never plaintext — ✅ |
| Security — data in transit | All API communication over HTTPS/TLS 1.2+ — ✅ |
| Security — photo storage | Photos in private cloud storage with signed‑URL access; not publicly accessible — ⛔ not yet wired |
| Accessibility | WCAG 2.1 AA on core operator workflows — 🟡 pinch‑zoom restored, iOS safe‑area handled; broader audit pending |
| Browser support | Chrome 100+, Safari 15+, Firefox 100+, Edge 100+ |
| Mobile OS support | iOS 15+, Android 11+ |
| Data retention | All check logs retained 3 years minimum; soft‑delete for retired items — verify configured |
| Backup | Daily automated DB backups with 30‑day retention — verify configured |

**Security — outstanding (see §16):** session revocation; CSPRNG invite tokens + throttling; private photo storage + signed URLs; operator cost‑data lockout; removal of the unused Supabase service‑role key.

---

## 14. Out of scope — Version 1

Explicitly excluded from V1 to keep a focused, deliverable product. Each should be a backlog item for V2 planning; nothing in V1 should be architected to prevent later addition.

Airtable integration/sync · QuickBooks/accounting integration · third‑party PM‑tool integration · GPS real‑time vehicle tracking (live location on map) · QR‑code‑only web forms (no app install) — Phase 2 · automated reorder purchasing (links to supplier only) · contractor certification / UTV‑ATV course tracking · multi‑language support · customer/client‑facing reporting portal · advanced analytics / cost‑trending dashboards · fleet insurance management portal · employee scheduling/routing · external payroll integration · two‑way calendar sync (Google Calendar, Outlook).

---

## 15. Implementation phases & wave roadmap

The original v1 **phases** define product scope; the **waves** are the consolidation/build increments layered on top during execution.

### 15.1 Phases (v1)

**Phase 1 — Foundation (target end of June 2026, "50%"):** PIN + Admin login; basic inventory CRUD; vehicle fleet CRUD; daily vehicle check (online); equipment check in/out (online); admin web dashboard (read‑only stats); QR label association for all assets (register existing labels; no in‑app generation); settings management; Rigs, Kits & Deployments (creation, management, transfer requests between hubs). → **≈85% (§2).**

**Phase 2 — Core Operations (target end of July 2026, "95%"):** offline mode + background sync for all operator workflows; maintenance scheduling & tracking; photo capture (required for damage); automated push + email notifications (all 6 alert types); admin dashboard — full editable interface; per‑project equipment checklists; QR label registration workflow (bulk‑associate); mobile app (iOS + Android via PWA/RN wrapper); photo viewing gallery with damage badge + lightbox; Item Disposition workflow (INOPERABLE status, admin review, repair/write‑off). → **≈35% (§2).**

**Phase 3 — Scale & Polish (target Q4 2026):** advanced cost reporting & spend analytics; mileage‑triggered maintenance auto‑status; QR‑only web form (no app install); admin mobile optimization; contractor onboarding (self‑service PIN setup); **Deployment Map** (§11.11); **Time Tracking, Invoicing & Availability Calendar** (§11.12). → **not started.**

### 15.2 Waves (execution increments)

**Wave 0 — ✅ done.** Single source of truth for inventory; restored unit/QR sub‑system; corrected dashboard "checked out"; removed dead/mislabeled controls; success messages only on real success; login rate‑limit + admin lockout; automated linting.

**Wave 1 — ✅ done & verified.** Durable offline queue + honest indicators + idempotent sync (on reconnect and on mount); QR association‑on‑create + context‑aware scan routing. *(Caveat: SW cold‑launch + conflict paths await a real‑device pass.)*

**Wave 2 — Correctness & consolidation (immediate next block).** Fold the §5 punch list into the existing Wave‑2 scope:
1. **Hotfix the blockers** (#1 vehicle remove, #2 consumable banner) and **commit/deploy the uncommitted auth‑route transforms** (§3.1).
2. **Consumable accounting:** fix where consumable check‑in/disposition/transfer flips arbitrary `CHECKED_OUT` units; verify the transfer decrement; decide whether consumables are unit‑tracked or pure counts and apply everywhere (incl. #3 adding consumables to a kit); add an availability guard to deployment/kit creation.
2a. **Deployment model (PRD v2.1 Addendum §C) — do first in 2B.** Adopt Kit ⊂ Rig ⊂ Deployment; make `Deployment ↔ Project` many‑to‑many (`DeploymentProject`); add `DeploymentAssignment` (operator handoff history, PRIMARY/SECONDARY) folding in `RigOperator`. Prerequisite for 2b below.
2b. **Equipment lifecycle & breakdown flow (PRD v2.1 Addendum §A).** One inoperable→resolution-path state machine (in-field / hub[ship|carry] / shop[deliver|ship]); per-case return destination; expanded `Disposition` enum; `MaintenanceTask.kind`/`resolutionPath` fields. Unifies the two "needs maintenance" paths (#6).
3. **Transfer handlers:** collapse the duplicate `accept`/`decline`/`[action]` routes to one each + an integration test asserting which runs.
4. **Validation hardening:** zod + field whitelist + try/catch on the mass‑assignment PATCH routes (`vehicles/[id]`, `inventory/[id]`, `maintenance/[id]`); finish the shared `requireAdmin()`/`requireAuth()` adoption.
5. **Maintenance loop:** build "mark complete → recalc `nextDue`/`nextOdometer` → preserve history → spawn next task," plus the daily‑check **odometer → Due Soon/Overdue** mileage trigger. *(Note: the breakdown resolution-path flow is item 2b above; this item 5 is the **scheduled/time-driven** loop, deferred to Wave 3 with notifications.)*
5a. **Account Management & Auth (Wave 2A.5 — PRD v2.1 Addendum §B).** After the Wave 2A security pass: account lifecycle (reset PIN/unlock, **suspend with immediate session revocation** — pulls forward a minimal `Session` model), roles & permissions with last-admin guardrails, invites/bulk-onboard/per-operator defaults (consumes the CSPRNG invite-token fix), and an `AccountAuditLog`.
6. **UI unification:** finish shared‑component adoption (one ConfirmDialog/Toast/StatusChip/EntityPicker); adopt the **Kit/Rig/Deployment** vocabulary app-wide and rename operator **"My Rig" → "My Deployment"** (Addendum §C.2); one disposition/status enum; fix refresh‑after‑mutation gaps (#5), the consumable chip (#9), and polish items (#10–#15).
7. **Photos end‑to‑end (#7):** in‑app capture, 1200px/JPEG‑85 compression, Supabase private bucket + signed upload/download URLs, offline blob storage in the queue, damage‑photo‑required enforcement.
8. **Security carryovers:** CSPRNG invite tokens + throttling; lock cost/spend fields away from operators; remove the unused Supabase service‑role key from the runtime.

*Wave 2 exit criteria:* every punch‑list blocker fixed; consumables addable and correctly accounted (no double‑count); one transfer handler each; all edit endpoints validated; maintenance complete‑loop + mileage trigger working; photos captured and stored privately; UI primitives unified and panels refresh after every mutation.

**Wave 3 — Close Phase 2, then resume Phase 3.**
9. **Notifications:** email + push for all six alert types (Resend already a dependency); the maintenance‑shop output (work order / shipping label) and the invoice→processing‑address email loop.
10. **Admin completeness:** the §11.1 dashboard feeds/tables; build the stub pages (Vehicles, Maintenance, Projects, Reports); the review‑inoperable admin flow; secondary‑operator assignment UI (#8).
11. **Deployment hardening:** run `prisma migrate deploy` in the container entrypoint (Docker currently doesn't migrate — schema‑drift footgun); add `/api/health` + a Cloud Run startup probe; confirm CI gates prod PRs; tighten `serverActions.allowedOrigins`.
12. **Sessions/devices:** add a trusted‑device/session model (§10.1 "up to 3 trusted devices"; 30‑day idle) so deactivate/demote takes effect and sessions can be revoked.
13. **Tests:** expand coverage, **auth first** (PIN lockout, session expiry/revocation, invite flow), then transfer/consumable/idempotency integration tests, then a real‑device offline pass. *(A dedicated test database must be set up first — the current suite would otherwise run against, and erase, production data.)*
14. **Deployment Requests (§11.13 / Addendum §F).** Request → stage (hard‑reserve + per‑item quality check) → check‑out; `HubAssignment` (per‑hub fulfiller), `RESERVED` status, `DeploymentRequestLine`, and request notifications (in‑app first, then via the item‑9 dispatcher). **Depends on the Wave 2B Deployment model** (lifecycle states, `DeploymentAssignment`, M2M projects); shippable in two increments (in‑app, then push/email).

**Phase 3 capstones (after Wave 3):** Deployment Map (§11.11); Time Tracking/Invoicing/Availability (§11.12); advanced reporting; QR‑only web form; contractor self‑onboarding; admin mobile optimization.

---

## 16. Gaps & recommendations — PRD, codebase, workflow

**Gaps in the PRD itself (worth adding):**
- **Idempotency / offline‑replay contract.** v1 specifies offline sync but not idempotency. The implementation now relies on idempotency keys + a dedup store; the PRD should formalize this as a requirement for every non‑idempotent write.
- **"Needs maintenance" vs "Inoperable" semantics.** v1 treats damage as one path; the app has two with different side effects (#6). Define whether a routine "needs maintenance" return notifies admin / creates a task.
- **Consumable model.** v1 is silent on whether consumables are unit‑tracked. The codebase has them count‑based, which drives several defects (#3, consumable accounting). State the intended model explicitly.
- **Secondary operators.** The data model has `RigOperator` (deployment sharing) but the PRD never specifies the sharing workflow or who initiates it (#8).
- **Conflict resolution detail.** v1 says "last‑write‑wins + manual prompt for status conflicts"; this is unbuilt and under‑specified. Define the exact conflict UX.
- **Rig vs. Deployment — RESOLVED (PRD v2.1 Addendum §C).** Three nested concepts: **Kit ⊂ Rig ⊂ Deployment** (Kit = tools/gear; Rig = Kit + vehicles; Deployment = operator(s) + Rig, spanning 1+ projects, movable between operators). Align labels, API, and data model accordingly: `Deployment ↔ Project` becomes many‑to‑many and operator assignment becomes a `DeploymentAssignment` history.

**Gaps in the codebase (beyond the punch list):**
- **Sessions can't be revoked** (stateless 24h JWT; no `isActive`/role re‑check); no trusted‑device model.
- **Invite tokens use `cuid()` not a CSPRNG** on public, unthrottled endpoints — a guessable token could mint an **admin** account.
- **Photos not wired to Supabase Storage** — `Photo.url` is a free‑form string (stored‑XSS/SSRF when rendered); no private bucket / signed URLs.
- **Operators can read cost/spend fields** (violates the §10.2 role table).
- **Mass‑assignment PATCH routes** (no zod/whitelist/try‑catch).
- **Maintenance complete‑loop + mileage trigger** missing.
- **Admin dashboard feeds/tables + four stub pages** not built.
- **Zero auth tests**; integration suite needs a (now‑configured) isolated test DB.

**Gaps in the workflow / process:**
- **Docker build doesn't run migrations.** The `CLAUDE.md` flow leans on a manual `make db-migrate` per PR — a schema‑drift footgun. Move migration into the deploy (entrypoint or a gated CI step).
- **No `/api/health` + Cloud Run startup probe** — and it means external QA can't cleanly verify a deploy without logging in (the auth proxy redirects everything).
- **CI branch‑name gating** — confirm prod PRs actually run lint/type‑check; the dev/deploy branch names have drifted historically.
- **Commit discipline** — this cycle ended with a substantive refactor (37 auth routes) uncommitted (§3.1). Worth a "no orphaned working‑tree" check before calling work done.
- **Real‑device offline testing** isn't in the loop — the SW cold‑launch and conflict paths can only be confirmed on a phone in airplane mode.

---

## 17. Open questions

| Question | Owner / notes |
|----------|---------------|
| Tech stack? | RESOLVED: Next.js 16 (App Router) + TypeScript + Prisma + Supabase + GCP Cloud Run |
| Hosting environment? | RESOLVED: GCP Cloud Run (us‑central1) via GitHub Actions CI/CD |
| PWA or native RN for app stores? | RESOLVED: Next.js PWA (web‑first); RN wrapper deferred to Phase 3 |
| Default daily‑check cutoff time? | RESOLVED: configurable in Settings; default 9:00am |
| How are contractors onboarded? | RESOLVED: Admin creates accounts via Team Management; operators receive PIN by email |
| Low‑inventory threshold for consumables? | Needs per‑item configuration; default ~20% of standard order quantity |
| Capture GPS automatically on daily‑check submit? | Privacy consideration for personal phones; recommend opt‑in (Deployment Map, §11.11) |
| Who manages QR sticker printing/affixing? What label stock? | Recommend Avery 22805 vinyl (2"×2", weatherproof); Piedmont walk‑through is the target date |
| Consumable model — unit‑tracked or pure count? | OPEN (Wave 2 decision, drives #3 and consumable accounting) |
| Rig vs. Deployment — one concept or two, and which user‑facing noun? | **RESOLVED: three nested concepts — Kit ⊂ Rig ⊂ Deployment.** Kit = tools/gear; Rig = Kit + vehicles; Deployment = operator(s) + Rig, spanning 1+ projects and movable between operators. Operator page "My Rig" → "My Deployment". (PRD v2.1 Addendum §C.) |
| Maintenance/repair states — in-field vs hub vs shop? | **RESOLVED:** three resolution paths; in-field = lightweight completed fix log; hub = ship-now or carry-at-deployment-end; shop = deliver or ship (triggers a work order). Return destination chosen per-case; tracking is status + location note (no transit enum). (Addendum §A.) |
| Account management scope on Admin page? | **RESOLVED: build all four** — account lifecycle (reset PIN/unlock/suspend-with-revoke), roles & permissions, invites & bulk onboarding + per-operator defaults, account audit log. (Addendum §B.) |

---

## 18. Data model additions required

- **`idempotency_key`** (shipped this cycle, raw‑SQL/Prisma model) — dedup store for offline replay.
- **`DailyCheck.gpsLat/gpsLng/gpsAccuracy`** (Phase 3 map) — GPS currently lives on `Photo`.
- **Trusted‑device / session model** (Wave 3) — for the "3 trusted devices", 30‑day idle, and revocation.
- **Phase‑3 module** (§11.12): `TaskType`, `OperatorRate`, `TimeEntry`, `Expense`, `Invoice`, `InvoiceLineItem`, `Availability`; `User.hourlyRate`; `Settings.milesReimbursementRate`.
- **`Alert` uniqueness** on `(type, sourceTable, sourceId, resolved)` to prevent duplicate unresolved alerts.

---

## 19. Exit criteria by wave (scorecard)

- **Wave 0 — ✅ done.** Inventory truth, login hardening, dead‑control fixes.
- **Wave 1 — ✅ done & verified.** Offline durable queue + honest indicators + idempotent sync; QR association‑on‑create + context‑aware scan routing. *(Caveat: SW cold‑launch + conflict paths await a real‑device pass.)*
- **Wave 2 — in progress.** Exit when the punch‑list blockers are fixed, consumables are addable & correctly accounted, one transfer handler each, all edit endpoints validated, the maintenance loop works, photos are captured & stored privately, and the UI is unified with reliable post‑mutation refresh.
- **Wave 3 — not started.** Notifications (all six alert types + shop/invoice outputs), admin completeness, deploy hardening, sessions/devices, test expansion.
- **Phase 3 — not started.** Deployment Map; Time/Invoicing/Availability; advanced reporting.

---

## 20. Appendix — glossary

| Term | Definition |
|------|------------|
| Christie Drill | Christie Engineering soil sampling probe — primary sampling tool. |
| UTV | Utility Task Vehicle — Polaris Ranger or Can‑Am Defender used for field access. |
| Kit | A collection of *tools and gear* required to perform a project's sampling work (serialized equipment + consumables). **Does not include vehicles.** (See PRD v2.1 Addendum §C.) |
| Rig | **Kit + vehicles** (truck, trailer, UTV, ATV, Christie drill, etc.) — the complete set of an operator's gear and vehicles. *Rig = Kit ∪ Vehicles.* |
| Deployment | **Operator(s) + the Rig** they are responsible for. Spans **1 or more projects** over its lifespan and **may move between operators** (handoff). The unit of field accountability; nesting is **Kit ⊂ Rig ⊂ Deployment.** |
| Check‑Out | Formal logging of equipment leaving warehouse/base camp with an operator. |
| Check‑In | Formal logging of equipment returning from field, with condition assessment. |
| Daily Check | Pre‑deployment vehicle safety inspection submitted by the assigned operator. |
| PWA | Progressive Web App — a web app that installs on a phone and works offline. |
| QR Code | Quick Response code — a scannable label registered to equipment for instant lookup. |
| SKU / PLU | Stock Keeping Unit / Price Look‑Up — supplier part numbers for reordering. |
| Piedmont | Agricarbon's primary equipment base, used as the central warehouse reference. |
| Offline‑first | Architecture pattern where the app functions without network, with sync as a secondary step. |
| Wave | A consolidation/work increment (0–3) layered over the v1 phases; Waves 0–1 are complete. |
| Idempotency key | A per‑action UUID stamped on a queued write so a replay applies exactly once. |
| Disposition | The choice made when an item leaves a kit/rig: Return to Hub / Transfer / Mark Inoperable → resolution path / Retire. (Expanded in PRD v2.1 Addendum §A.5.) |
| Secondary operator | An additional operator sharing one deployment (`role = SECONDARY` on `DeploymentAssignment`; formerly `RigOperator`). |
| Resolution path | After an item is marked inoperable, how it is repaired: **In-field** (lightweight fix log), **Hub** (ship now or carry back at deployment end), or **Shop** (deliver or ship). On repair close, the return destination is chosen per-case. (PRD v2.1 Addendum §A.) |
| Handoff | Transfer of an entire **Deployment** from one operator to another — closes the current PRIMARY `DeploymentAssignment` and opens a new one. **Operators can initiate, confirm, and receive handoffs without admin help** (transfer-accept pattern); admins can initiate/confirm any portion. All handoffs are audit-logged. Distinct from a per-item transfer. |
| Deployment Request | A pre-deployment "pick list": an operator/admin specifies the equipment a deployment needs (kit + rig, by type × qty) at a target Hub *before* pickup. Modeled as a Deployment in a `REQUESTED → STAGED → ACTIVE` lifecycle. (PRD v2.1 Addendum §F.) |
| Staging | The Hub fulfiller resolving a request's lines to specific units/vehicles, **reserving** them, running a per-item operable+presence quality check, and marking the rig ready for pickup. |
| Reserved | An equipment status (`RESERVED`) for a unit/vehicle the Hub has staged for a specific Deployment — removed from the available pool until check-out (or released on cancel). |

**Immediate next actions (recommended order):** (1) commit + deploy the auth‑route transforms and the two diagnosed fixes (#1, #2); (2) run the admin‑side walkthrough to close the open verifications (consumable decrement, damage alert) and exercise admin flows; (3) begin Wave 2 with consumable accounting + addability (#3) and the maintenance loop.
