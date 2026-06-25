# AHITS — State of the Application, Wave 1 Plan & Forward Roadmap

**Agricarbon Hardware Inventory & Tracking System**
Independent assessment and implementation plan · prepared 2026‑06‑17

> This document is a fresh, independent read of the application as it stands on `feature/20260617/Agricarbon-USA-wave0-foundation-fixes` (HEAD `4be46f7`), measured against `AHITS_PRD_v1` including its **June 2026 "Post Wave 0" status update**. It complements the earlier `AHITS_STATE_ANALYSIS.md`: where that document set the four‑wave direction, this one confirms what Wave 0 actually landed, specifies Wave 1 in build‑ready detail, and lays out everything after it — through Phase 3 — as a roadmap. Where I make a non‑obvious claim I cite the file. Where I could not verify something from the sandbox (no live DB, no `gh`, Prisma engine offline), I say so rather than assert it.

---

## 1. Executive summary

AHITS is a genuinely capable field‑operations PWA for an organization that today runs on "text messages, paper forms, and ad‑hoc spreadsheets" (PRD §2.1). The stack matches every resolved decision in the PRD's open‑questions table — Next.js 16 App Router, TypeScript, Prisma 5, Supabase, Material UI, Serwist PWA, GCP Cloud Run — and the data model is the strongest artifact in the repo. The type‑checker passes clean. In a handful of sprints it reached a working daily‑check flow, QR‑based unit lookup, and a rigs/kits/deployments/transfers system that runs **ahead** of the original Phase‑1 scope.

**Wave 0 is done, and it mattered.** The single most important structural fix — inventory source‑of‑truth — has landed: `InventoryItem.status` was removed and counts are now derived from per‑unit `InventoryUnit` records (`PRD_ADDITIONS_V2.md`; confirmed by the `unitCounts`/`availableUnits` shape in `/api/inventory`). The previously‑404ing `POST /api/inventory/[id]/units` route now exists (`src/app/api/inventory/[id]/units/route.ts`). Login has rate limiting and admin lockout (`src/lib/rate-limit.ts`, `auth/login`), an ESLint flat config exists (`eslint.config.mjs`), the dead admin "checked out" tile was corrected and an Active Deployments tile added (commit `4be46f7`), and false‑success toasts were addressed in the Wave 0 commit. That clears the worst of the integrity and security debt the prior analysis flagged as Critical.

**The honest headline now is the one the PRD itself names: the offline‑first promise is still mostly unfulfilled, and that is the whole reason this app exists.** Only the daily check survives a no‑signal site. Equipment check‑in/out (the scan page) and *every* mutation on the operator's richest screen (My Rig — ~15 raw `fetch` calls across a 1,567‑line file) are online‑only; their sole offline handling is a "Network error" toast or silent failure. The durable queue that does exist has three correctness gaps that make even its pending‑count dishonest. This is exactly Wave 1, and it is where this session's build work goes.

Two themes shape everything below:

1. **Offline is a system property, not a feature you bolt onto one screen.** Making it real means a durable queue that seeds and flushes correctly, *idempotent* replay (because check‑out/transfer/end are not naturally idempotent the way the daily‑check `upsert` is), honest sync indicators, cold‑start precaching, and a defined behavior when a queued write conflicts with server state. All five must move together or the field operator gets a worse experience than texting a photo — the PRD's explicit adoption bar (§4.1).

2. **"Every element speaks to one another" is a discipline, not a coat of paint.** The cleanest way to keep the app consistent is the single spine the data model already implies: **Asset → Unit → Kit/Deployment → CheckLog → Alert.** Every operator action is a CheckLog against a Unit; every problem becomes an Alert; every state is *derived* from the log, never hand‑maintained. Wave 0's inventory fix was the first big step onto that spine (status is now derived). Wave 1 keeps it there by ensuring offline replay produces exactly one CheckLog per real‑world action.

The rest of this document is the evidence and the plan.

---

## 2. What AHITS is, and the end‑state it reaches for

AHITS replaces a distributed soil‑sampling operation's informal tracking with one always‑available system. The design has to hold **three** stakeholders in mind at once, and the PRD is explicit that one of them never logs in.

**The field operator / contractor** (20–90 users, personal iPhone/Android, often no signal). Submits a daily vehicle check, checks equipment in and out, scans existing QR labels, reports damage with a photo, and — in the Phase‑3 end‑state — tracks hours, mileage and expenses and generates invoices (PRD §7.12). Their adoption bar is brutal and stated plainly: *faster than texting a photo, completable in under two minutes, no password to forget, works with no internet* (§4.1). They are contractors, not employees — which is why time/expense/invoicing is a first‑class future module, not an afterthought.

**The admin / operations manager** (2–5 users, desktop + iPad). Needs one screen showing the true state of everything — where every item is, what's overdue, who hasn't checked in — plus the ability to edit inventory and vehicles, schedule and complete maintenance, manage users and PINs, configure alert thresholds and cutoff times, see a live deployment map, and review/approve invoices (§7.1, §7.8, §7.11, §7.12). Operators must **not** see cost/spend data (§6.2 role table) — a permission line the current API does not yet enforce.

**The external / receiving parties** — maintenance shops and the invoice‑processing addresses. They never see the UI, but the system holds their data (`shopName`, `shopAddress`, repair type, hub destinations) and, in the end‑state, **emails them**: damage/repair alerts to admins, and approved invoices automatically to "a pre‑configured list of processing addresses" (§7.12). They are first‑class consumers of the app's *output*. Today that output layer is almost entirely greenfield — alert *rows* are created, but there is no email send wired for most events, and no shop‑facing artifact (work order, shipping label) exists at all.

**The end‑state**, synthesizing PRD §3 and §11: an offline‑first PWA where every asset has a known location and status at all times, 95%+ of daily checks land on time, nothing goes missing for more than 24 hours, preventative maintenance is never missed, a live map shows where every crew is, and the full contractor billing loop closes inside the app. The deployment map (§7.11) and time‑tracking/invoicing/availability module (§7.12) are the Phase‑3 capstones, and the PRD already specifies their data models (`TimeEntry`, `Expense`, `Invoice`, `InvoiceLineItem`, `Availability`, `TaskType`, `OperatorRate`, plus `User.hourlyRate` and `DailyCheck.gpsLat/gpsLng/gpsAccuracy`).

---

## 3. Where the build stands vs. the PRD phases (post Wave 0)

Status key: ✅ built & sound · 🟡 built but partial/with issues · ⛔ stubbed or missing.

**Phase 1 — Foundation** (PRD target: "50% by end of June")
- ✅ PIN + admin login, now with rate limiting + admin lockout (Wave 0).
- ✅ Inventory model — single source of truth via `InventoryUnit`; `POST …/units` route now exists (Wave 0). Remaining: `DELETE` still appears to hard‑delete despite a soft‑delete column; consumable accounting still grabs arbitrary units (Wave 2).
- 🟡 Vehicle CRUD — exists; PATCH is still unvalidated mass‑assignment (Wave 2).
- ✅ Daily vehicle check — the best‑built flow; durable offline via `upsert` idempotency on `@@unique([vehicleId, date, operatorId])` (`api/daily-check/route.ts:64`).
- 🟡 Equipment check in/out — works **online** from the scan page; **online‑only** (Wave 1). The `/operator/checkout` page is a one‑line redirect stub (`checkout/page.tsx`), and `POST /api/checkout` is intentionally `410 Gone`, redirecting callers to `/api/deployments/[id]/items`.
- 🟡 Admin dashboard — stat cards + Active Deployments tile render; the PRD §7.1 **feeds/tables** (missed checks, maintenance due, currently checked‑out, last‑10 activity) are not built.
- ✅ QR association/lookup — **the PRD's Post‑Wave‑0 note supersedes §7.7's "generation":** the app does *not* generate or print labels; it associates and reads existing ones. Lookup works (`/api/inventory/units/by-qr/[qrCodeId]`). **Association‑on‑create is a Wave 1 item** and is not yet built.
- ✅ Settings — categories + hubs management exists. Alert‑threshold/cutoff‑time config (§7.8) not wired.
- ✅ Rigs/Kits/Deployments + transfers — built ahead of schedule; correctness items remain (Wave 2).

**Phase 2 — Core Operations** (PRD target: "95% by end of July")
- ⛔ Offline for *all* operator workflows — **Wave 1.** Only daily‑check is durable.
- ⛔ Maintenance scheduling/tracking — schema is rich, but the "mark complete → recalc next due → spawn next task" loop and the mileage trigger don't exist; the admin Maintenance page is a stub (Wave 2/3).
- ⛔ Photo capture — no capture UI anywhere; no compression; no upload‑on‑sync (Wave 2).
- ⛔ Push + email notifications — alert rows created for some events; daily‑check‑fail email is wired (`api/daily-check/route.ts:117`), but the other five alert types and any push are not (Wave 3).
- 🟡 Item disposition — implemented in API and operator UI, with consumable unit‑selection bugs (Wave 2).

**Phase 3 — Scale & Polish** (deployment map; time/invoicing/availability; advanced reporting): **not started.** None of the new models are in the schema; GPS lives on `Photo`, not `DailyCheck`.

**Realistic completion:** Phase 1 ≈ 80% (Wave 0 lifted it materially; dashboard feeds, QR‑on‑create, and a few CRUD hardening items remain). Phase 2 ≈ 25% (disposition + transfers exist; offline, photos, maintenance logic, notifications largely don't). "95% by end of July" is not reachable without descoping; Wave 1 → Wave 2 consolidation is the prerequisite, as the PRD's own status update now acknowledges.

---

## 4. Architecture & data model

The stack is sound and matches the PRD's resolved decisions. Migrations are ordered and internally consistent. A few model‑level observations that shape the roadmap:

- **"Deployment" is implemented as `Rig`.** The PRD's June status update now makes the call explicit: treat Rig and Deployment as **one** concept and standardize on **"Deployment"** across every screen, label, button, message, and the API/data‑model naming — *unless the team prefers the field‑native "Rig."* This is a Wave 2 unification, but Wave 1 should not deepen the inconsistency (e.g. new QR‑scan routing should use one noun).
- **Per‑unit tracking is now the source of truth** (Wave 0). The remaining drift risk is consumables, which still have no link from a `KitItem` to specific units (Wave 2, §5 below).
- **`DailyCheck.checklistJson` is a `Json` blob** — flexible but not queryable; acceptable until per‑item reporting is required.
- **`Alert` has no uniqueness constraint** on `(type, sourceTable, sourceId, resolved)`, allowing duplicate unresolved alerts.
- **GPS is on `Photo`, not `DailyCheck`.** The map (§7.11) needs `gpsLat/gpsLng/gpsAccuracy` on `DailyCheck`; that's a Phase‑3 schema addition, not a reuse.
- **No `TrustedDevice`/session model.** The PRD's "up to 3 trusted devices" (§6.1) and any server‑side session revocation are impossible without one. Sessions are currently stateless JWTs.
- **No idempotency/dedup store.** This is the gap Wave 1 must close before any non‑idempotent write is queued offline (§6 and §8 below).

---

## 5. Correctness & data integrity — what Wave 0 fixed, what remains

**Fixed in Wave 0 (verified by route/schema shape and commit messages):** the two‑sources‑of‑truth inventory problem (status now derived from units), the missing `POST …/units` endpoint, the structurally‑wrong dashboard "checked out" tile, dead/mislabeled controls, and unconditional success toasts.

**Still open, in priority order (Wave 2 unless noted):**

1. **Consumable unit accounting grabs arbitrary units — High.** Non‑serialized kit items have `inventoryUnitId = null`, so check‑in/disposition does `findMany({ inventoryItemId, status:'CHECKED_OUT' }).take(qty)` and flips arbitrary units. With two operators holding the same consumable, returns can flip units "belonging" to the other's active deployment. Fix: either link consumable kit items to specific units, or model consumables as pure counts with no unit rows — pick one and apply it everywhere.
2. **Over‑allocation on deployment creation — High.** The consumable branch of `deployments/route.ts` can create a `KitItem` with the requested quantity even when fewer units are available, unlike the serialized path. Add the availability guard everywhere.
3. **Competing transfer handlers — High (consolidate + verify).** `transfers/[id]/accept`, `…/decline`, and a dynamic `…/[action]` all exist; the front‑end calls `/{id}/{action}`. App‑Router precedence means the *static* handlers should win, making `[action]` dead code — but three handlers for one action is a hazard that depends on framework precedence a maintainer can't see. Collapse to one accept + one decline and add an integration test asserting which runs.
4. **Mass‑assignment PATCH routes — High.** `maintenance/[id]`, `inventory/[id]`, `vehicles/[id]` are raw `prisma.update({ data: body })` with no zod, whitelist, or try/catch. A client can write any column and malformed input leaks raw Prisma errors. Add zod + field whitelist + try/catch uniformly, and a shared `requireAdmin()`/`requireAuth()` helper (the `role !== 'ADMIN'` string check is copy‑pasted across ~20 routes).
5. **`deployments/[id]/end` has no surrounding try/catch** — any failure returns an opaque 500. Wrap it.
6. **Maintenance "mark complete" does nothing automatic — High (missing logic).** No recalc of `nextDue`, no history preservation, no next‑task spawn, no mileage trigger. Until built, maintenance is a static list, not a system.

**Idempotency / offline replay — Medium now, Critical the moment Wave 1 ships.** Daily‑check is safely idempotent via `upsert`; the queue deletes an item only on `res.ok`, so a write that commits but whose response is lost will replay. Check‑out/transfer/end are **not** idempotent — queue them naively and a single field action becomes duplicate deployments, kit‑items, and CheckLogs and double‑moved units. **This is why Wave 1 builds an idempotency key before it queues anything non‑idempotent** (§8).

---

## 6. Security & deployment

**Improved in Wave 0:** login rate limiting + admin lockout now exist; ESLint runs.

**Still open:**
- **Sessions can't be revoked.** Stateless JWT, `getSession` never re‑checks `isActive`/role against the DB, so deactivating or demoting a user has no effect until the token expires. The PRD wants 30‑day idle sessions on up to 3 trusted devices (§6.1) — both need a session/device model. (High)
- **Invite tokens use `cuid()`, not a CSPRNG**, on public, unthrottled `invite/validate` + `invite/complete` endpoints; the invite carries the role, so a guessed token could mint an **admin**. Switch to `crypto.randomUUID()`/32‑byte random and throttle. (High)
- **Photos aren't wired to Supabase Storage.** `Photo.url` is a free‑form string stored verbatim — no private bucket, no signed URLs, a stored‑XSS/SSRF vector when rendered. The PRD requires private storage + signed URLs (§7.10, §9). (High — Wave 2 when capture lands)
- **Operators can read cost/spend fields** on vehicles/inventory/maintenance, violating the §6.2 role table. (Medium)
- **Supabase service‑role key** is provisioned into Cloud Run but used nowhere in code — RLS‑bypassing attack surface for zero benefit; remove until needed. (Medium)
- **Deploy hardening:** the Docker build does **not** run migrations (the CLAUDE.md workflow leans on a manual `make db-migrate` before each PR — a schema‑drift footgun); there's no `/api/health` route or Cloud Run startup probe; CI branch‑name gating should be confirmed so prod PRs actually run lint/type‑check; `serverActions.allowedOrigins: ['*']` disables CSRF origin checks. (Medium — Wave 3)

**Build health:** `tsc --noEmit` passes clean. The test suite is a handful of integration cases requiring a live local Postgres, with **zero auth tests** — the most security‑critical code is untested. A dedicated, guarded test DB is now configured (`vitest.config.ts` requires `DATABASE_URL_TEST`; `tests/setup.ts` refuses any non‑local/non‑`*test*` DB), which is the prerequisite the PRD status update calls out before expanding tests.

---

## 7. Offline / PWA / cross‑platform — the heart of Wave 1

This is the gap between what AHITS promises and what it does. Verified against the code:

- **Only daily‑check enqueues offline** (`daily-check/page.tsx:101`). The scan page's **Return to Hub** and **Add to My Kit** are raw `fetch`es whose `catch` only sets a "Network error" string (`scan/page.tsx:135,168`). My‑Rig's ~15 mutations — transfer, accept/decline, add/remove vehicles & items, log usage, end deployment, create deployment, add vehicle — are all plain `fetch` (`my-rig/page.tsx:159,390,692,736,758,790,843,…`). None touch the queue.
- **The queue's pending count is dishonest.** `queueSize` initializes to `0` and is **never seeded from IndexedDB on mount** (`useOfflineQueue.ts:20`), so after any app restart the badge shows "0 pending" even with items waiting — the operator believes everything synced when it hasn't.
- **No flush on mount.** The queue flushes only on the `online` event (`useOfflineQueue.ts:60`); if the device is already online at launch, nothing flushes until the next offline→online transition. iOS Safari has no Background Sync, so there is no fallback.
- **Items wedge the queue forever.** `flush` deletes an item only on `res.ok` and swallows everything else (`useOfflineQueue.ts:48‑53`). A permanently‑rejected write (validation 400, conflict 409) is retried indefinitely and blocks nothing behind it from a clean state; there's no retry cap, no terminal handling, no surfacing to the user.
- **Cold offline navigation fails.** The service worker runtime‑caches only API GETs (`sw.ts:20‑41`); pages are cached only after a first online visit. A freshly‑installed PWA opened at a no‑signal site falls through to `/~offline`, which only offers "return to login." Operator routes must be **precached**.
- **Cache freshness is 12h with a 64‑entry cap** (`sw.ts:35‑38`) vs. the PRD's 7 days (§7.9). The cap can evict the very deployment/vehicle reads an operator depends on, and there's no "data as of…" indicator.
- **No conflict resolution of any kind.** Zero version/`updatedAt`/ETag checking. The PRD wants last‑write‑wins on independent fields plus a manual prompt for conflicting status changes (§7.9).
- **Photos are 0% implemented** (online or offline); the queue body is JSON‑only so it couldn't carry an image even if capture existed (Wave 2).
- **Cross‑platform specifics:** `manifest.json` forces `portrait` (may fight an iPad‑kiosk landscape station per PRD §5.1); no iOS safe‑area handling; no `navigator.storage.persist()` so iOS may evict the queue; the computed "Syncing" state is never displayed.

---

## 8. Wave 1 — build‑ready design (what this session implements)

The PRD's June status update defines Wave 1 as five things: **durably queue check‑in/out and rig actions; honest sync/pending indicators; pre‑cache operator screens; basic conflict handling; plus QR association‑on‑create and context‑aware re‑scan routing** (§7.7). Here is the design, in the order it should be built. Every queued write is idempotent or it is not queued.

### 8.1 A durable, honest offline queue (`useOfflineQueue`)
- **Seed `queueSize` from IndexedDB on mount** (count the store) so the badge is true after a restart.
- **Flush on mount** when `navigator.onLine`, in addition to the existing `online` listener and a periodic/`visibilitychange` retry (covers iOS's missing Background Sync).
- **Terminal vs. retryable handling.** On `res.ok` → delete. On a terminal client error (400/401/403/404/409/410/422) → move the item to a small **"needs attention"** set and stop retrying it. On network failure or 5xx/408/429 → increment `retries`, keep, retry with backoff up to a cap. Surface both counts.
- **Expose a single status object** — `{ online, offline, syncing, pending, failed }` — for one consistent indicator across the AppBar badge, `OfflineBanner`, and dashboards (kills the "0 pending" lie and the never‑shown "Syncing" state).

### 8.2 Idempotent replay (the part that makes queuing *safe*)
- **Client:** every queued mutation carries a stable `idempotencyKey` (a `crypto.randomUUID()` generated when the action is taken, persisted with the queue item) sent as an `Idempotency-Key` header. Replays reuse the same key.
- **Server:** a tiny `withIdempotency(key, handler)` wrapper records processed keys and their response, and on replay returns the stored response instead of re‑executing. To avoid a Prisma‑client regeneration (not possible in this environment), the store is a dedicated `idempotency_key` table accessed via `$queryRaw`/`$executeRaw`, created by a migration. The wrapper **degrades safely** (best‑effort: if the table is absent pre‑migration, it executes normally) so a deploy before `make db-migrate` doesn't hard‑break — with a clear note that the migration is required to get the guarantee.
- This is wired into the genuinely non‑idempotent mutation routes that Wave 1 queues: `POST /api/deployments/[id]/items`, `DELETE …/items/[kitItemId]`, `POST …/transfer`, `POST …/end`, and the transfer accept/decline path.

### 8.3 Queue the operator mutations
- Introduce a shared `queuedFetch(endpoint, init, { idempotencyKey })` helper that tries the network and, on failure, enqueues — the same pattern daily‑check already uses, but centralized so all screens behave identically.
- Wire **scan‑page check‑in/out** (Return to Hub, Add to Kit) and the **My‑Rig mutations** through it. After enqueue, update local UI optimistically and show the honest "queued — will sync" state instead of "Network error."

### 8.4 Cold‑start precache + freshness
- Precache the operator shell routes (`/operator/dashboard`, `/operator/daily-check`, `/operator/scan`, `/operator/my-rig`) so a cold, no‑signal launch lands on a usable screen.
- Lift API read freshness toward the PRD's 7 days and raise the entry cap so a day's deployment/vehicle reads aren't evicted; give `/~offline` a useful cached landing rather than only "return to login."

### 8.5 Basic conflict handling
- Wave 0's server‑side availability guards already return a 4xx when a stale offline check‑out can't be honored. Wave 1 makes that **visible**: such items land in the "needs attention" set with a plain‑language "this changed on the server — re‑scan to continue" prompt, rather than retrying forever or silently dropping. This satisfies the PRD's "basic conflict handling for concurrent edits" without over‑building a full merge engine (deferred to a later pass).

### 8.6 QR association‑on‑create + context‑aware scan routing (PRD §7.7, Wave 1)
- **Associate on create:** when an admin creates a serialized item or a vehicle, a "scan or enter code" field captures the *existing* physical label's code and stores it as the record's QR id (accepts a USB handheld scanner or manual entry on desktop, plus optional live camera scan). No in‑app generation — the PRD explicitly descoped that.
- **Context‑aware re‑scan routing:** a scan resolves the record and opens the right next step based on status — Available → Check Out / View; Checked Out → Check In / View / Report Issue; Vehicle → Start Daily Check / View; In Maintenance → View / Contact Admin (§7.7 "Scan Actions"). Today the scan page hard‑codes Return/Add only; routing should branch on type+status using one shared status vocabulary.

> **Scope note for this session.** 8.1, 8.3, 8.4, 8.5, and the client half of 8.2 are pure client/SW changes verifiable with `tsc` and are implemented now. The server half of 8.2 ships as a defensive helper plus a migration file (it cannot be migration‑tested from this sandbox — no live DB). The QR work in 8.6 is specified here and staged for implementation alongside; where a piece touches routes I can't runtime‑exercise, I flag it in the PR description so you can verify on staging.

---

## 9. UX consistency & every‑surface review (the "everything speaks to one another" goal)

**Operator journey.** Coherent for daily‑check; broken for check‑in/out (online‑only until Wave 1; the `/operator/checkout` route is a redirect stub). My‑Rig is powerful but has three different UIs for removing a kit item (per‑item Return, Log Daily Usage, bulk Disposition) all hitting the same endpoint with different payloads — the clearest place the "single fluid logic" has diverged (Wave 2 unification). The operator nav and the "My Rig" vs "Deployment" naming need the §7.7/§8 noun decision.

**Admin journey.** Dashboard stat cards render (incl. the new Active Deployments tile), but the four PRD §7.1 feeds/tables (missed checks, maintenance due, currently checked‑out, last‑10 activity) are not built, and several admin destinations are stubs (Maintenance, and per the prior analysis, Vehicles/Projects/Reports). Mass‑assignment PATCH routes mean admin edits are also a security surface (Wave 2). Cost fields leak to operators (Wave 2).

**External / receiving parties.** Exist only as data fields (`shopName`, `shopAddress`, `repairType`, hub destinations). There is no generated shop‑facing artifact and no email loop for most events — only daily‑check‑fail email is wired. If receiving parties matter to the end‑state (they do, per §7.8 and §7.12), this output layer is greenfield and lands in Wave 3.

**Cross‑cutting primitives.** The prior analysis catalogued "four of everything" (confirm dialogs, toast systems, status‑color maps, item‑removal flows). The durable fix is a small shared library — one `ConfirmDialog`, one queued `Toast`, one `StatusChip`, one `EntityPicker` — plus the single‑noun decision, so the front‑end can't drift again. That is Wave 2; Wave 1 introduces one shared piece (the queue/status indicator) and avoids adding new variants.

---

## 10. Risk register (updated post Wave 0)

| # | Risk | Severity | Status |
|---|------|----------|--------|
| R1 | Inventory two‑sources‑of‑truth | ~~Critical~~ | **Resolved in Wave 0** (status derived from units) |
| R2 | Offline workflows fail in the field (check‑in/out, My‑Rig, cold nav, dishonest pending count) | Critical | **Open — Wave 1 (this session)** |
| R3 | Non‑idempotent writes duplicate on replay once queued | Critical (latent) | **Closed by Wave 1 idempotency design** |
| R4 | Login rate limiting / admin lockout | ~~Critical~~ | **Resolved in Wave 0** |
| R5 | Sessions can't be revoked; no trusted‑device model | High | Open — Wave 2/3 |
| R6 | Photos unimplemented (capture, compression, storage, signed URLs) | High | Open — Wave 2 |
| R7 | Consumable check‑in/disposition flips wrong units | High | Open — Wave 2 |
| R8 | Over‑allocation on deployment creation | High | Open — Wave 2 |
| R9 | Maintenance complete‑loop + mileage trigger missing | High | Open — Wave 2/3 |
| R10 | Competing transfer handlers | High | Open — Wave 2 |
| R11 | Mass‑assignment PATCH routes | High | Open — Wave 2 |
| R12 | Invite tokens non‑CSPRNG on public endpoint (admin escalation) | High | Open — Wave 2 |
| R13 | No conflict resolution for concurrent offline edits | Med‑High | **Partially addressed in Wave 1** (visible, terminal handling) |
| R14 | Schema drift: Docker doesn't migrate; confirm prod CI gate | Medium | Open — Wave 3 |
| R15 | No email/push for 5 of 6 alert types; external recipients get nothing | Medium | Open — Wave 3 |
| R16 | Operators can read cost/spend fields (role‑table violation) | Medium | Open — Wave 2 |

---

## 11. The path forward

### Wave 1 — Make offline real *(this session; 1–2 weeks to fully land + verify on staging)*
The design in §8: durable/honest queue, idempotent replay, queue the operator mutations, cold‑start precache + 7‑day freshness, visible conflict handling, and QR association‑on‑create + context‑aware scan routing. **Exit criteria:** an operator can install the PWA, go fully offline, complete a daily check *and* a check‑out/return *and* a My‑Rig action, see an honest pending count and "syncing" state, reconnect, and have every action apply exactly once with no duplicates and a clear prompt on any conflict.

### Wave 2 — Correctness & consolidation *(1–2 weeks)*
Fix consumable unit accounting; add the availability guard everywhere; consolidate the transfer handlers (+ integration test); add zod/whitelist/try‑catch to all PATCH routes and a shared `requireAdmin()`/`requireAuth()`; build the maintenance complete‑loop + mileage trigger; unify the UI primitives and settle the Rig/Deployment noun; implement photos end‑to‑end (capture, 1200px/JPEG‑85 compression, Supabase private bucket + signed URLs, offline blob storage in the queue); lock cost fields away from operators; CSPRNG invite tokens + throttling.

### Wave 3 — Close Phase 2, then resume Phase 3 *(ongoing)*
Email + push for all six alert types and the maintenance‑shop / invoice‑processing outputs; finish the admin dashboard feeds/tables and the stub pages; harden deployment (migrate‑on‑deploy, `/api/health` + startup probe, confirm CI gating); expand tests, **auth first** (PIN lockout, session expiry/revocation, invite flow). Then build Phase‑3: `DailyCheck` GPS fields + **deployment map** (Mapbox GL JS, §7.11), and the **time‑tracking / invoicing / availability** module (§7.12) with its seven new models and the invoice→processing‑address email loop. Add a trusted‑device/session model along the way (§6.1) and revisit conflict resolution toward true field‑level last‑write‑wins.

### Roadmap beyond V1 (PRD §10 "Out of Scope — V1", parked but not architected away)
Airtable export, QuickBooks/accounting sync, project‑management integrations (Asana/Monday/Notion), live GPS vehicle tracking, the no‑app QR web form (§7.7 Phase‑2 stretch), automated reorder purchasing, certification tracking, multi‑language, a client‑facing reporting portal, and advanced cost‑trending analytics.

### The one rule that keeps it consistent
Enforce in review: **every asset state change goes through a CheckLog, and every state is derived, never hand‑maintained.** Wave 0 put inventory on that spine; Wave 1 keeps it there by guaranteeing one CheckLog per real‑world action even across offline replay. Pair it with the small shared‑component library so the UI can't drift into "four of everything" again.

---

## 12. How I verified this — and the deploy reality

Findings come from reading the Prisma‑backed routes and operator pages directly (cited inline), the full PRD including its June status update, and the existing in‑repo analyses. `tsc --noEmit` passes clean on the current branch. I confirmed Wave 0's landmarks in code: the `POST /api/inventory/[id]/units` route now exists, inventory status is derived from units, ESLint config and rate‑limit module are present, and the Active Deployments tile is in HEAD.

**Environment limits you should know about (they shape what this session can finish end‑to‑end):** this workspace has **no `gh` CLI**, Prisma's engine download is blocked (offline), and the only `DATABASE_URL` available is the **live Supabase** instance — which must not be migrated from here. So the code and branch are prepared in your repo, but the documented `make db-migrate` → `gh pr create` → `gh workflow run pr-staging-deploy.yml` steps need to run on your machine, where the CLI and database live. Exact copy‑paste commands are provided when the branch is ready.
