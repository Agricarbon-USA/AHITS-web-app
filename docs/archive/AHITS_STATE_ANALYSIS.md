# AHITS — State of the Application & Path Forward

**Agricarbon Hardware Inventory & Tracking System**
Deep analysis and prioritized recommendations · prepared 2026‑06‑17

> Scope of this document: a full, evidence‑backed assessment of the app as it stands in the working branch `feature/20260617/maxwslater-bugfixes-and-features`, measured against `AHITS_PRD_v1`. It covers the data model, the API/business logic, the operator and admin front‑ends, offline/PWA/cross‑platform behavior, security, and deployment — then lays out what should come next and in what order. Every non‑obvious claim cites a file and line. Where a first reading was wrong, I verified it in code and say so.

---

## 1. Executive summary

AHITS is genuinely impressive for its age. In a handful of sprints it has become a real Next.js 16 + Prisma + Supabase PWA with role‑based auth, a rich 22‑model data schema, QR scanning, an operator daily‑check flow, and a deployments/rigs/kits/transfers system that goes well beyond the original PRD's Phase‑1 scope. The bones are good: the stack matches the PRD's resolved decisions, the schema is thoughtfully normalized, and several of the hardest concurrency patterns (optimistic check‑out of serialized units) are implemented correctly.

The honest headline, though, is this: **the app is broader than it is deep.** It has reached for Phase‑2 and Phase‑3 features (deployments, transfers, disposition) before Phase‑1's and Phase‑2's foundations are solid, and that has produced three classes of systemic problem:

1. **Two sources of truth for inventory that never reconcile.** `InventoryItem.quantity` and the per‑unit `InventoryUnit` table drift apart, the admin "Add Unit" button is wired to a route that doesn't exist, and the admin dashboard's "checked out" tile counts a field that no code path ever sets. Core inventory accounting — the entire reason the app exists — is not trustworthy.

2. **The offline‑first promise is mostly unfulfilled.** Only the daily check actually works offline. Equipment check‑in/out, the whole My‑Rig surface, photo capture, and conflict resolution are online‑only or unimplemented. An operator who drives to a no‑signal site — the central use case — will hit "Network error" or a dead‑end offline screen.

3. **Consistency has frayed as features were added in parallel.** Four different confirm‑dialog implementations, four toast systems, three ways to remove a kit item, dead buttons on the admin deployments table, duplicated status‑color maps, and one concept ("rig" / "deployment") shown under three names. This is the direct opposite of the "every element speaks to one another, fluid and consistent" end‑state you described.

None of this is fatal, and none of it is surprising for a fast‑built app. But it means the right next move is **a consolidation pass, not more features.** Fix the inventory truth model, make the offline path real for the workflows that need it, unify the UI primitives, and close the security gaps — *then* resume building toward the deployment map and time‑tracking/invoicing in Phase 3.

The rest of this document is the detail behind that verdict.

---

## 2. What AHITS is, and the end‑state it's reaching for

Synthesizing the PRD with what the code reveals, AHITS is a single system that replaces "text messages, paper forms, and ad‑hoc spreadsheets" for a distributed field‑sampling operation. It serves three kinds of stakeholder, and the design has to hold all three in mind at once:

- **The field operator / contractor** — on a personal iPhone or Android, often with no signal, needs to complete a daily vehicle safety check, check equipment in and out, scan QR codes, report damage with a photo, and (in the end‑state) track their own hours, expenses, and availability and generate invoices. Their bar is brutal: faster than texting a photo, completable in under two minutes, no password to forget, works with no internet.

- **The admin / operations manager** — on a desktop or iPad, needs one screen showing the true state of everything (where is every item, what's overdue, who hasn't checked in), the ability to edit inventory and vehicles, schedule and complete maintenance, manage users and PINs, configure alerts, and approve invoices.

- **The external / receiving parties** — the maintenance shops and repair hubs that equipment is shipped to, and the invoice‑processing addresses that approved invoices are emailed to. These parties don't log in, but the system holds their data (`shopName`, `shopAddress`, repair type, hub destinations) and, in the end‑state, sends them email. They are first‑class consumers of the app's *output* even though they never see its UI — which means the data captured about them, and the messages sent to them, have to be correct and complete.

The intended end‑state is an offline‑first PWA where every asset has a known location and status at all times, 95%+ of daily checks land on time, nothing goes missing for more than 24 hours, preventative maintenance is never missed, and the whole contractor billing loop closes inside the app. The deployment map and the time‑tracking/invoicing module (PRD §7.11–7.12) are the Phase‑3 capstones.

The mental model that makes everything "speak to one another" is a single spine: **Asset → Unit → Kit/Rig(Deployment) → CheckLog → Alert.** Every action an operator takes is a `CheckLog` against a `Unit` of an `Item`, optionally inside a `Rig`; every problem becomes an `Alert` to an admin; every state is derivable from that log. The app is closest to consistent when it honors that spine and least consistent where it bypasses it (e.g. mutating `InventoryUnit.status` directly without a CheckLog, or storing `quantity` as a separate hand‑maintained number).

---

## 3. Where the build actually stands vs. the PRD phases

The PRD targets "50% by end of June (Phase 1), 95% by end of July (Phase 2)." Here is the candid read, feature by feature, with status: ✅ built & sound · 🟡 built but broken/partial · ⛔ stubbed or missing.

**Phase 1 — Foundation**
- ✅ PIN + admin login (works; security caveats in §6)
- 🟡 Inventory CRUD — create/read/update exist, but the per‑unit model is broken (§5.1), and `DELETE` hard‑deletes despite a soft‑delete column (`inventory/[id]/route.ts:115`)
- 🟡 Vehicle CRUD — exists, but PATCH is unvalidated mass‑assignment (`vehicles/[id]/route.ts:25`)
- ✅ Daily vehicle check (the best‑built flow in the app)
- 🟡 Equipment check in/out — works online from the scan screen; **does not work offline** (§7) and the "checkout" page is just a redirect stub
- 🟡 Admin dashboard — 6 stat cards + alerts render, but the activity feed and the checked‑out / maintenance / missed‑check tables from PRD §7.1 are not built, and one stat tile is structurally always wrong (§5.1)
- ✅ QR generation (every item/vehicle gets a `qrCodeId`)
- 🟡 Settings — categories + hubs management exists; alert‑threshold and cutoff‑time config from PRD §7.8 is not wired
- ✅ Rigs/Kits/Deployments + transfers — built (ahead of schedule), but with the correctness issues in §5

**Phase 2 — Core Operations**
- ⛔ Offline mode + background sync "for all operator workflows" — only daily‑check is durable offline
- ⛔ Maintenance scheduling & tracking — the schema is rich, but `maintenance/[id]` PATCH is raw mass‑assignment with no "mark complete → recalculate next due → spawn next task" logic; the **Maintenance admin page is a 12‑line stub**
- ⛔ Photo capture — **no photo capture UI exists anywhere** (`NotePhotoDialog` always submits `[]`); no compression; no upload‑on‑sync
- ⛔ Automated push + email notifications — alert *rows* get created for some events, but there is no email send and no push
- ⛔ Per‑project equipment checklists — checklist is global, not per‑vehicle‑type or per‑project
- ⛔ QR sticker print sheet — not found
- 🟡 Mobile via PWA — installable, but the offline gaps undercut it
- 🟡 Photo gallery / disposition — disposition workflow (INOPERABLE) exists in the API; the photo gallery does not
- 🟡 Item disposition — implemented in API and operator UI, with unit‑selection correctness bugs (§5.2)

**Phase 3 — Scale & Polish** (deployment map, time‑tracking/invoicing, advanced reporting): **not started.** The PRD even specifies the new models (`TimeEntry`, `Expense`, `Invoice`, `InvoiceLineItem`, `Availability`, `TaskType`, `OperatorRate`) and the `DailyCheck.gpsLat/gpsLng/gpsAccuracy` fields for the map — none of these are in the schema yet (GPS currently lives on `Photo`, not `DailyCheck`).

**Realistic completion:** Phase 1 is ~70% (foundation present, inventory truth broken). Phase 2 is ~25% (disposition and transfers exist; offline, photos, maintenance‑logic, and notifications largely don't). Calling the system "95% by end of July" is not achievable without descoping; the consolidation work below is the prerequisite.

---

## 4. Architecture & data model

The stack is sound and matches the PRD's resolved decisions: Next.js 16 App Router, TypeScript (type‑check passes clean), Prisma 5 on Postgres/Supabase, Material UI, Serwist for the PWA, iron‑session‑style JWT auth via `jose`, GCP Cloud Run with `output: 'standalone'` set correctly. Migrations are ordered and internally consistent (6 migrations through `sprint7_schema_gaps`).

The schema is the strongest artifact in the repo. A few model‑level observations that shape everything downstream:

- **The PRD's "Deployment" entity is implemented as `Rig`.** This is fine as a modeling choice but it is the root of the worst terminology inconsistency in the UI (§8). One name should win.
- **Per‑unit tracking (`InventoryUnit`) was layered on top of an older quantity‑based model (`InventoryItem.quantity`)** without a reconciliation strategy. The two coexist; nothing keeps them in agreement. This is the central data‑integrity issue (§5.1).
- **`DailyCheck.checklistJson` is a `Json` blob.** Flexible, but it means checklist responses aren't queryable and there's no referential integrity on checklist item keys. Acceptable for now; worth revisiting if reporting on specific check items becomes a requirement.
- **`Alert` has no uniqueness constraint** on `(type, sourceTable, sourceId, resolved)`, which allows duplicate unresolved alerts (§5.3).
- **GPS is on `Photo`, not `DailyCheck`.** The PRD's deployment‑map feature (§7.11) explicitly requires `gpsLat/gpsLng/gpsAccuracy` on `DailyCheck`. When that phase starts, this is a schema addition, not a reuse.
- **No `TrustedDevice`/session model.** The PRD's "up to 3 trusted devices" and any server‑side session revocation are impossible without one (§6).

---

## 5. Correctness & data integrity (the priority you named)

This is where the most serious problems live. I verified each of these against the code directly.

### 5.1 Inventory has two sources of truth that never reconcile — **Critical**

`InventoryItem.quantity` is only ever written at item‑creation time (`inventory/route.ts:140`). Every operational flow — check‑out, check‑in, kits, transfers, disposition — moves `InventoryUnit.status` and `KitItem.quantity` instead, and **no code path ever updates `InventoryItem.quantity` afterward.** Consequences I confirmed:

- The admin‑facing `quantity` silently disagrees with the real per‑unit counts the detail API computes.
- The dashboard "items checked out" tile counts `InventoryItem.status === 'CHECKED_OUT'` (`dashboard/route.ts`), but **no route ever sets `InventoryItem.status`** — only `InventoryUnit.status` changes. That tile is structurally always near‑zero. Same logic breaks the low‑stock alert: `quantity` never moves, so `lowStockThreshold` can never trip.
- **The admin "+ Add Unit" button is broken.** `inventory/page.tsx:439` POSTs to `/api/inventory/{id}/units`, but **that route does not exist** (only `inventory/[id]/route.ts` and `inventory/units/[unitId]/route.ts` exist). The call 404s; the code doesn't check `res.ok`, so the UI silently does nothing. In practice, **units can only be created by the offline import script** (`prisma/import-field-inventory.ts:216`), never through the app.

The fix is a decision, then enforcement: pick `InventoryUnit` as the single source of truth for anything serialized, derive `quantity`/availability from unit counts (or keep `quantity` only for pure consumables and compute it in one place), build the missing `POST /api/inventory/[id]/units` route, and rewrite the dashboard tile to count units. This is the highest‑leverage fix in the whole codebase.

### 5.2 Consumable unit accounting grabs the wrong physical units — **High**

For non‑serialized (consumable) kit items, `inventoryUnitId` is null, so there's no link from a kit item to specific units. Check‑in then does `findMany({ inventoryItemId, status:'CHECKED_OUT' }).take(qty)` and flips arbitrary units to AVAILABLE (`deployments/[id]/items/route.ts:268`, `…/end/route.ts:104`). With two operators holding the same consumable, returning items flips units that may "belong" to the other operator's still‑active rig. The INOPERABLE/HUB paths do the same with an unguarded `findFirst` (`items/route.ts:305,351`), so the wrong physical unit can be retired from circulation. Fix: link consumable kit items to specific units (or model consumables as pure counts with no unit rows at all — but pick one and be consistent).

### 5.3 Over‑allocation on deployment creation — **High**

The consumable branch of `deployments/route.ts` (≈ lines 136–154) creates a `KitItem` with the requested quantity even when fewer (or zero) units are actually available — unlike the serialized path and unlike `items/route.ts:152`, which correctly returns "Only N available." A new deployment can claim `quantity: 10` while flipping only 3 units. Add the same availability guard everywhere.

### 5.4 Competing transfer‑accept handlers — **High (needs consolidation; verify runtime selection)**

There are three overlapping handlers: `transfers/[id]/accept/route.ts`, `transfers/[id]/decline/route.ts`, **and** a dynamic `transfers/[id]/[action]/route.ts`. The front‑end calls `/api/transfers/{id}/{action}` (`my-rig/page.tsx:681`, `deployments/page.tsx:1309`). 

Important nuance I want to be precise about: in the Next.js App Router, **static segments take precedence over a sibling dynamic segment**, so `/transfers/{id}/accept` should resolve to the *static* `accept/route.ts` (the safer handler with vehicle/quantity guards and unit‑status handling), making the dynamic `[action]` handler effectively dead code for the values actually sent. A first‑pass reading concluded the inferior dynamic handler wins; based on routing precedence the opposite is more likely. Either way, **three handlers for one action is a correctness hazard** — the behavior depends on framework precedence that isn't obvious to a maintainer, and a one‑line change to the fetch URL would silently flip to a handler that (in the dynamic version) does not restore unit status on decline or handle partial transfers. Collapse to exactly one accept and one decline handler and delete the rest. This is worth confirming with a quick integration test rather than reasoning alone.

### 5.5 Transactions and error handling — **High/Medium**

The good multi‑step writes (`items/route.ts`, `deployments/route.ts`) are correctly wrapped in `prisma.$transaction` with error translation. But `deployments/[id]/end/route.ts` runs its entire end‑of‑deployment transaction with **no surrounding try/catch**, so any failure returns an opaque 500 to the operator. Several PATCH routes (`maintenance/[id]`, `inventory/[id]`, `vehicles/[id]`) are raw `prisma.update({ data: body })` mass‑assignment with no zod and no try/catch — a client can write any column (including `qrCodeId`, `deletedAt`, `status`, costs) and malformed input leaks raw Prisma errors. Add zod schemas + field whitelists + try/catch uniformly.

### 5.6 Maintenance "mark complete" does nothing automatic — **High (missing logic)**

The PRD's core maintenance loop — complete a task, recalculate `nextDue`/`nextOdometer` from the interval, preserve history, and auto‑create the next recurring task — does not exist. `maintenance/[id]` PATCH just writes whatever body it's given. The mileage‑based trigger (daily‑check odometer → "Due Soon"/"Overdue") is also absent. Until this is built, maintenance tracking is a static list, not a system.

### 5.7 Idempotency / offline replay — **Medium (latent)**

Only daily‑check is queued offline, and it's safely idempotent via `upsert` on `@@unique([vehicleId, date, operatorId])`. But there's no request‑ID/dedup anywhere, and the queue deletes an item only on `res.ok` — so a write that commits but whose response is lost will replay. The moment check‑out/transfer/end are added to the offline queue (which §7 says they must be), they will create duplicate rigs/kit‑items/CheckLogs and double‑move units. Design an idempotency key before queueing any non‑idempotent write.

---

## 6. Security & deployment

**Critical / High:**

- **No login rate limiting.** PIN lockout is per‑user (5 attempts → 15‑min lock, then resets), but there is no IP/global rate limit, and the **admin email+password path has no lockout at all** (`auth/login/route.ts:31`). A 6‑digit PIN is 1,000,000 combinations; with auto‑resetting per‑user lock and parallelization across operator emails, it's grindable. Add IP‑based rate limiting (and a real lockout on the admin path).
- **Sessions can't be revoked.** JWTs are stateless with a 24h expiry (PRD wanted 30 days) and `getSession` never re‑checks `isActive`/role against the DB. Deactivating or demoting a user has no effect until the token expires (`session.ts`, `proxy.ts:49`). Add a server‑side session/version check or a short‑lived token + refresh.
- **A populated `.env` with live‑looking secrets sits in the project folder.** Good news: it is gitignored and **not** in git history (verified). Residual risk is the plaintext file on disk and `make-secrets.sh` pushing every value to GCP Secret Manager. Rotate anything that may have been shared and confirm least‑privilege.
- **The Supabase service‑role key is provisioned into Cloud Run but used nowhere in code** (`Makefile:101`; no references in `src`). That's a full‑DB, RLS‑bypassing key as pure attack surface for zero benefit. Remove it until/unless it's actually needed server‑side.
- **Invite tokens use `cuid()`, not a CSPRNG** (`schema.prisma:582`), and `invite/validate` + `invite/complete` are public and unthrottled. Since the invite carries the role, a guessed token could mint an **admin** account. Switch to `crypto.randomUUID()`/32‑byte random and throttle the endpoints.
- **Photo storage isn't wired to Supabase Storage at all.** No `storage.upload`/`createSignedUrl` anywhere; `Photo.url` is a free‑form string the API stores verbatim — so even once capture exists, there's no private‑bucket enforcement and the stored "URL" is an unvalidated string (stored‑XSS/SSRF/open‑redirect vector when rendered). The PRD's "private storage + signed URLs" is unimplemented.

**Medium / Low:** no single `requireAdmin()` helper — the `role !== 'ADMIN'` string check is copy‑pasted across ~20 routes (one typo = a hole); admin password is stored in the `pinHash` column (conflation risk); CI triggers on `develop` but the deploy branch is `development` and prod is `main`, so **PRs to prod run no lint/type‑check gate**; the Docker build does **not** run migrations (schema‑drift risk — a forgotten `make db-migrate` ships code ahead of the DB and 500s at runtime); no `/api/health` route or Cloud Run startup probe; `serverActions.allowedOrigins: ['*']` needlessly disables CSRF origin checks; operators can read all vehicles/projects/maintenance including cost fields (PRD says operators must not see cost data).

**Build health:** `tsc --noEmit` passes clean. **Lint is non‑functional** — there's no ESLint flat config (`eslint.config.js`) and `next lint` also breaks on the space in the folder path. The **test suite is 6 integration cases** (transfer lifecycle, check‑log condition, consumable scoping) requiring a live Postgres, with **zero auth tests** — the most security‑critical code is untested. The duplicate backslash‑named directories (`src/app/\(admin\)` etc.) are confirmed **empty** and harmless to the build, but they're scaffolding junk and should be deleted.

---

## 7. Offline / PWA / cross‑platform

This is the gap between what AHITS promises and what it does. The product's reason for existing is field use with no signal; today only one workflow survives that.

- **Only daily‑check enqueues offline** (`daily-check/page.tsx:101`). Equipment check‑in/return and add‑to‑kit on the scan screen, and *every* My‑Rig action (transfers, add/remove vehicles & items, end deployment, log usage) are plain `fetch` calls whose only offline handling is a "Network error" toast — or silent failure. PRD §7.9 requires all of these offline.
- **Cold offline navigation fails.** The service worker runtime‑caches only API GETs (`sw.ts:21‑41`); pages are only cached after a first online visit. An operator installing the PWA and opening `/operator/daily-check` for the first time with no signal falls through to `/~offline`, which only offers "Return to login." Precache the operator routes.
- **Pending‑count is wrong after a restart.** `queueSize` initializes to 0 and is never seeded from IndexedDB on mount (`useOfflineQueue.ts:20`), so every indicator (AppBar badge, OfflineBanner, dashboard) shows "0 pending" even with items waiting — the operator believes everything synced when it hasn't.
- **No flush on mount.** The queue flushes only on the `online` event; if the device is already online at launch, nothing flushes until the next offline→online transition. iOS Safari has no Background Sync, so there's no fallback.
- **No conflict resolution of any kind.** PRD requires last‑write‑wins on independent fields plus a manual prompt for conflicting status changes; there is zero version/`updatedAt`/ETag checking. Two devices checking out the same unit offline then syncing is unhandled (and a queued 409 would stick in the queue forever, since items only delete on `res.ok`).
- **Photos are 0% implemented offline (and online).** No capture UI, no 1200px/JPEG‑85 compression, no local blob storage, and the queue body is JSON‑only so it couldn't carry a photo even if capture existed.
- **Cache freshness is 12h, not the PRD's 7 days** (`sw.ts:37`), with a 64‑entry cap that can evict the deployment/vehicle reads an operator depends on; there's no "data as of…" indicator.
- **Cross‑platform specifics:** no iOS safe‑area handling (content renders under the notch given the translucent status bar + fixed AppBar), `maximumScale:1` disables pinch‑zoom (accessibility), no `navigator.storage.persist()` so iOS can evict the queue, and `manifest.json` forces `portrait` which may fight an iPad‑kiosk landscape setup. The "Syncing" state is computed but never displayed.

---

## 8. UX consistency & flows (your "everything speaks to one another" goal)

The app is at its best in the flows built early and carefully (login, setup‑account, daily‑check, the inventory item dialogs). It frays wherever features were added in parallel. The specific inconsistencies, all evidence‑backed:

**Dead and mislabeled controls.** On the admin deployments table the **"Transfer" icon button has no `onClick` — it does nothing** (`deployments/page.tsx:1426`), and the adjacent **"End" button just opens the detail drawer** rather than ending the deployment (verified at lines 1429‑1435). The New‑Deployment flow has a `projectId` state with no setter, so it always sends `undefined` — there's no project picker despite the data model supporting it.

**Navigation incoherence.** The operator nav has **two entries pointing at the same `/operator/scan` route** (both highlight at once), while the operator's richest screen — **My Rig — isn't in the nav at all** and isn't linked from the dashboard. Four admin nav items (**Vehicles, Maintenance, Projects, Reports**) link to 12‑line "implementation in progress" stubs, so 4 of 9 admin destinations are dead ends. There are no `loading.tsx`/`error.tsx`/`not-found.tsx` files, so bad URLs and render errors drop out of the themed shell entirely.

**Four of everything.** Four divergent confirm‑dialog implementations (several missing `try/finally`, so a thrown action leaves the button stuck on "Working…" forever); four toast/notification systems (the shared one has no queue, so rapid toasts overwrite); duplicated, diverging status‑color maps (`scan` vs `inventory`, and one is dead code); two add‑button conventions (`AddIcon` vs literal "+"); inconsistent step labels ("Next" vs "Continue"). The settings ConfirmDialog hardcodes a red **"Delete"** button even when used for hub **"Deactivate."**

**False success.** Many mutations never check `res.ok` and show the success toast unconditionally — operator transfers (`my-rig/page.tsx`), admin transfers and operator add/remove (`deployments/page.tsx`). An operator can be told "Transfer request sent" when the request 500'd.

**One concept, three names.** "Rig," "Deployment," and the My‑Rig page mix on the same screens; the type is `Rig`, the API is `/api/deployments`, the operator sees "Start Deployment / Launch Deployment" but also "My Rig / My Kit." Pick one user‑facing noun and use it everywhere. (Internally, "operator" is used consistently — good — though the PRD's term is "contractor.")

**Three ways to do one thing.** My‑Rig has three distinct UIs for removing a kit item (per‑item Return, Log Daily Usage, and the bulk Disposition dialog), all hitting the same endpoint with different payloads, plus two different end‑deployment paths that produce different data. This is the clearest place where the "single fluid logic" you want has diverged.

**Per‑role completeness.** The **operator** journey is mostly coherent for daily‑check but broken for check‑in/out (online‑only, redirect stub) and confusing in My‑Rig. The **admin** journey has a partial dashboard (no feeds/tables per PRD §7.1), four stub pages, and dead table buttons. The **external/maintenance‑shop** path exists only as data fields (`shopName`, `shopAddress`, `repairType`, repair hub) — there is no generated shop‑facing artifact (work order, shipping label, or email), and the invoice‑to‑processing‑address email loop (PRD §7.12) isn't built. If receiving parties matter to the end‑state, that output layer is entirely greenfield.

---

## 9. Risk register

| # | Risk | Severity | Likelihood | Where |
|---|------|----------|-----------|-------|
| R1 | Inventory counts untrustworthy (two sources of truth; dashboard tile wrong; Add Unit 404s) | Critical | Certain (already true) | §5.1 |
| R2 | Offline workflows fail in the field (check‑in/out, My‑Rig, cold nav) | Critical | High in real use | §7 |
| R3 | No login rate limiting; admin password unthrottled | Critical | Medium | §6 |
| R4 | Sessions can't be revoked on deactivate/demote | High | Medium | §6 |
| R5 | Photos unimplemented (capture, compression, storage, signed URLs) | High | Certain | §5, §6, §7 |
| R6 | Consumable check‑in/disposition flips wrong physical units | High | High under concurrency | §5.2 |
| R7 | Over‑allocation on deployment creation | High | Medium | §5.3 |
| R8 | Maintenance "mark complete" logic + mileage trigger missing | High | Certain | §5.6 |
| R9 | Competing transfer handlers; behavior depends on framework precedence | High | Low‑Med | §5.4 |
| R10 | Mass‑assignment PATCH routes (no zod/whitelist/try‑catch) | High | Medium | §5.5 |
| R11 | Invite tokens non‑CSPRNG on public unthrottled endpoint (admin escalation) | High | Low‑Med | §6 |
| R12 | Schema drift: Docker doesn't migrate; prod PRs have no CI gate | Medium | Medium | §6 |
| R13 | UX inconsistency erodes trust & training (dead buttons, false success, 4‑of‑everything) | Medium | Certain | §8 |
| R14 | No conflict resolution for concurrent offline edits | Medium‑High | Medium | §7 |
| R15 | No email/push despite alert rows; external recipients get nothing | Medium | Certain | §3, §8 |

---

## 10. Recommended path forward

I'd structure the next work in four waves. The first two are consolidation and should land before any Phase‑3 feature work resumes.

### Wave 0 — Stop‑the‑bleeding (days)
1. **Decide the inventory source of truth** and make it real: build `POST /api/inventory/[id]/units`, derive availability/`quantity` from units in one place, and fix the dashboard "checked out" tile to count units. (R1)
2. **Remove or wire the dead controls:** the admin Transfer button, the mislabeled End button, the duplicate operator nav entries, and add My Rig to the operator nav. (R13)
3. **Add IP rate limiting to `/api/auth/login`** and a real lockout on the admin path; remove the unused service‑role key from the runtime. (R3)
4. **Stop false‑success toasts** — check `res.ok` everywhere a mutation reports success. (R13)
5. **Delete the backslash junk directories** and add an ESLint flat config so lint runs.

### Wave 1 — Make offline real (1–2 weeks)
6. **Queue check‑in/out and the My‑Rig mutations** through the durable IndexedDB queue, with an **idempotency key** so replays don't duplicate. (R2, R7‑latent)
7. **Seed `queueSize` from IndexedDB on mount, flush on mount, and surface the "Syncing" state** so the pending count is honest. (R2)
8. **Precache the operator routes** and lift API cache freshness toward the 7‑day target; give `/~offline` a useful cached landing. (R2)
9. **Design conflict handling** — at minimum optimistic‑concurrency (`updatedAt`/version) with a clear operator‑facing "this changed on the server" prompt for status conflicts. (R14)

### Wave 2 — Correctness & consolidation (1–2 weeks)
10. **Fix consumable unit accounting** (link kit items to specific units, or model consumables as pure counts — pick one). (R6)
11. **Add the availability guard** to deployment creation. (R3/R7)
12. **Consolidate the transfer handlers** to one accept + one decline; add an integration test that asserts which runs. (R9)
13. **Add zod + whitelist + try/catch** to all mass‑assignment PATCH routes; introduce a shared `requireAdmin()`/`requireAuth()` helper. (R10)
14. **Build the maintenance "mark complete" loop** (recalculate next due, preserve history, spawn next task) and the mileage trigger. (R8)
15. **Unify the UI primitives:** one `ConfirmDialog`, one toast system (with a queue), one status‑color map, one item‑removal flow, one user‑facing noun for "deployment." (R13)
16. **Implement photos end‑to‑end:** capture UI, client compression to 1200px/JPEG‑85, Supabase private bucket + signed upload/download URLs, offline blob storage in the queue. (R5)

### Wave 3 — Close Phase 2, then resume Phase 3 (ongoing)
17. **Build the email layer** (Resend is already a dependency) for the six alert types and the invoice‑to‑processing‑address loop; add push later. Decide what the **maintenance shop / receiving party** actually receives (work order / shipping label / email) and generate it. (R15)
18. **Finish the admin dashboard** feeds/tables and the four stub pages (Vehicles, Maintenance, Projects, Reports).
19. **Harden deployment:** run `prisma migrate deploy` in the container entrypoint (or gate CI on `migrate status`), add `/api/health` + a Cloud Run startup probe, fix the CI branch‑name mismatch so prod PRs are gated. (R12)
20. **Expand tests**, especially auth (PIN lockout, session expiry/revocation, invite flow) — today there are zero. Then, on this foundation, begin Phase 3: `DailyCheck` GPS fields + deployment map, and the time‑tracking/invoicing/availability models.

### Cross‑cutting principle for "everything speaks to one another"
Adopt one rule and enforce it in review: **every asset state change goes through a CheckLog, and every state is derived, never hand‑maintained.** That single discipline collapses most of the integrity bugs (no more `quantity` drift, no more direct unit‑status edits that bypass the log) and gives the UI one consistent vocabulary to render. Pair it with a small shared‑component library (ConfirmDialog, Toast, StatusChip, EntityPicker) so the front‑end can't drift into "four of everything" again.

---

## 11. How I verified this, and one correction

These findings come from reading the Prisma schema and the route/page code directly, four parallel deep‑dive audits, and targeted spot‑checks. Things I confirmed in code rather than inferred: the dead/mislabeled admin deployment buttons (`deployments/page.tsx:1420‑1440`), the non‑existent `POST /api/inventory/[id]/units` endpoint behind the Add‑Unit button, that `InventoryUnit` rows are created only by the import script, that `.env` is gitignored and absent from git history, and that `tsc --noEmit` passes clean.

**One correction to a first‑pass reading worth flagging:** an initial audit concluded the inferior dynamic `transfers/[id]/[action]` handler is the one that runs in production. Next.js App Router precedence (static segments beat sibling dynamic segments) suggests the *safer* static `accept`/`decline` handlers actually run, making `[action]` dead code for the values sent. I did not run the app to confirm which executes, so I've framed this as "consolidate and verify with a test" rather than asserting live corruption. It's the kind of ambiguity that itself argues for deleting the redundant handler.

If you'd like, the natural next step is to start on **Wave 0** — I can fix the inventory source‑of‑truth and the dead controls on a feature branch and open a PR through your staging flow.
