# AHITS — Comprehensive Assessment, Risk Register & Forward Roadmap

**Agricarbon Hardware Inventory & Tracking System**
Full-codebase, multi-axis review · prepared 2026-06-18
Baseline: working tree on branch `staging/20260618-reconciled-deploy`, HEAD `a4c97f8` ("reconciled integration" — Wave 2A security + Wave 2A.5 account management + CI merged)
Method: five parallel deep audits (security/RBAC, data model, API consistency, offline/PWA, UX/flows) run against the current code, reconciled against `AHITS_PRD_v2.md`, the `v2.1` addendum, the prior `AHITS_INDEPENDENT_ASSESSMENT_AND_ROADMAP.md` (06-17), and `AHITS_QA_STAGING_ISSUES.md`, with headline claims re-verified by hand.

> **How to read this document.** This is a fresh, independent pass written *after* the Wave 2A / 2A.5 security work merged, so it supersedes the 06-17 assessment wherever they disagree. Section 2 reconciles the record (what's now fixed, what's newly found, one false positive I caught and did **not** carry forward). Section 11 is the consolidated, severity-ranked risk register with current status. Section 12 is the roadmap, re-sequenced to what's actually left. If you read three things: the **Executive Summary**, the **Risk Register (§11)**, and **Immediate Next Actions (§13)**.

---

## 1. Executive summary

AHITS is in genuinely good shape for its age, and materially better than the 06-17 assessment reflects — that review predates the security hardening that has since merged. The load-bearing architecture is real and was confirmed in code: an offline-first operator workflow with a durable IndexedDB queue, idempotency-keyed replay, a single-source-of-truth inventory model, context-aware QR routing, JWT sessions with **DB-backed revocation**, bcrypt(12) credential hashing, CSPRNG invite tokens with atomic single-use claims, role-aware cost gating, and HTML-escaped email. The hard parts — offline correctness and the auth spine — are done and done well.

The work that remains is almost entirely **consolidation, not construction**: closing a small number of sharp correctness/security holes, making the app *consistent with itself*, and finishing the half-built admin and notification surfaces. There are no foundational rewrites pending. Five things matter most coming out of this review:

1. **One new Critical, verified by hand.** `GET /api/vehicles/[id]` does `include: { dailyChecks: { include: { operator: true } } }`, which serializes the **entire `User` row — including the bcrypt `pinHash` — to any authenticated operator.** Operator PINs are 6 digits (10⁶ keyspace); a leaked bcrypt hash is trivially brute-forced offline → account takeover, and admin takeover if an admin ever filed a daily check. This is a two-character fix (`operator: { select: { id, name } }`) and should ship today. It is the single most important finding in this report.

2. **The consumable inventory model is structurally broken.** Three different quantity representations (`InventoryItem.quantity`, `InventoryUnit` rows, `KitItem.quantity`) never reconcile. `InventoryItem.quantity` is **never incremented or decremented anywhere in the codebase** — for consumables the "available" number is a frozen constant — while the checkout path tries to reserve `InventoryUnit` rows that pure consumables don't have, so genuine consumables either fail checkout ("Only 0 units available") or silently drift. There is also no working UI path to add a consumable to a kit. This is the largest correctness defect and needs a single, decisive model choice applied across checkout, return, transfer, disposition, and kit-add.

3. **The app does not yet "speak to itself."** It has the *ingredients* for consistency — `mutate()`, `ConfirmDialog`, `StatusChip`, `lib/status.ts`, `withIdempotency` — but applies them unevenly. There are effectively two dialects: a clean offline-first **operator** dialect and a hand-rolled **admin** dialect. Concretely: **three** API success-envelope styles and **three** error-body shapes (the client type-probes `d.error` and `d.data ?? d` everywhere to compensate); a status/type vocabulary that's canonical for equipment status but raw-enum (`POLARIS_UTV`) or `replace(/_/g)` everywhere else; three toast systems; ~20 hand-rolled dialogs. This is the highest-leverage "make it fluid" work and it is mostly *deletion*.

4. **The "recipient" layer is almost entirely unbuilt.** Only **two** emails ever send (invite, daily-check-fail); the other seven templates are dead code. There is no push, no SMS, no notification center, no scheduled triggers (overdue/not-returned/expiry alerts only materialize when an admin happens to GET the right endpoint), and **nothing ever leaves the building to a maintenance shop or hub operator** even though shop/PO/invoice data is captured. For a system whose point is to replace "pick up the phone and text a photo," the outbound layer is the biggest product gap.

5. **Four of nine admin screens are still 12-line stubs** (Vehicles, Maintenance, Projects, Reports) — yet the nav links them as if real and the dashboard funnels admins toward two of them. The maintenance *loop* (mark-complete → recompute next-due → spawn next task; mileage trigger) — a headline ROI claim — has no working mechanism.

The through-line of the recommendation is unchanged from the prior review's instinct but sharper now that security has landed: **spend the next month making the app secure-at-the-edges, correct, and consistent rather than broader** — hotfix the pinHash leak and consumable banner today; finish the consumable model and unify the maintenance/return paths; build photos end-to-end (several "done" flows secretly depend on them); unify the mutation pipeline, vocabulary, and primitives so the app is self-consistent; then finish the admin surfaces and a single notification dispatcher that also serves external recipients; then the Phase-3 capstones. The foundation is sound enough to carry all of it.

---

## 2. Reconciliation with the record (read before trusting any single doc)

The repo carries several overlapping documents written at ≥3 commit baselines. The most valuable thing a fresh pass can do is say what is *true at HEAD*.

### 2.1 Prior assessment items that are now FIXED (verified in current code)

| Prior finding | Status at HEAD `a4c97f8` | Evidence |
|---|---|---|
| **S1** — guessable `cuid()` invite tokens, unthrottled public endpoints, TOCTOU on `usedAt` | **Fixed.** `crypto.randomBytes(32).base64url` 256-bit token, `@unique`, 48h expiry, IP-rate-limited validate/complete, atomic `updateMany(where usedAt:null)` claim in a tx. | `users/invite/complete/route.ts:50-54`; commit `71f66c9` |
| **S2** — mass-assignment on `vehicles/[id]`, `maintenance/[id]`, `inventory/[id]` PATCH | **Fixed.** All three use `.strict()` zod whitelists + try/catch. | `f1216ec`; routes verified |
| **S3** — no session revocation (deactivated user keeps access 24h) | **Fixed.** `tokenVersion` is re-checked against the DB on every `getSession`; suspend/demote/force-logout take effect immediately, fail-closed on DB error. | `session.ts:51-58`; Wave 2A.5 `b8dfb3d` |
| **S4** — default seed credentials in-repo | **Fixed.** Seed refuses `NODE_ENV=production`; admin password randomized + printed once. | `b2eedfd`; `seed.ts` |
| **S5** — cost fields leak to operators (inventory, maintenance) | **Fixed for inventory & maintenance.** `unitCost`/`estimatedCost`/`actualCost` stripped for non-admin. *(But see new C-1 vehicle PII / pinHash leak below.)* | `inventory/route.ts:110`; `maintenance/route.ts:40` |
| **S7** — email HTML injection | **Fixed.** `esc()` on every interpolated value. | `443f737`; `templates.ts` |
| **C1** (prior) — transfer accept/decline not idempotency-wrapped | **Fixed.** `withIdempotency` now wraps accept, decline, transfer, end, vehicles, items, items/[kitItemId]. | `fbe74da`; grep-confirmed 7 routes |
| **C2** (prior) — duplicate `[action]` transfer handler | **Resolved.** No `[action]` route remains; static `accept`/`decline`/`transfers/[id]` are the only handlers. | route tree |

**Net:** the prior review's entire "Wave 2A — Security hardening" block and its top correctness item have shipped. Do not re-do them.

### 2.2 The false positive I caught and did NOT carry forward

My automated security pass flagged **"`src/proxy.ts` is dead code — Next only runs `middleware.ts`, so all edge auth is silent."** **This is wrong, and I verified it directly.** Next.js **16.2.9** defines `PROXY_FILENAME = 'proxy'` as a first-class convention matched at `(?:src/)?proxy` (`node_modules/next/dist/lib/constants.js:289-290`), and `src/proxy.ts` exists at exactly that path. Edge auth runs. This is the *same* plausible-sounding trap the 06-17 reviewer explicitly flagged. Do **not** rename `proxy.ts` to `middleware.ts` — that would *break* a working layer. The app has genuine defense-in-depth: edge gate (`proxy.ts`) **plus** per-route `requireAuth`/`requireAdmin` **plus** the `(admin)`/`(operator)` layout guards (`layout.tsx`). Worth one belt-and-suspenders note: because the route-group layouts independently enforce auth, any *future* page added outside those two groups would rely on the edge gate alone — keep new pages inside the guarded groups.

### 2.3 Newly found at HEAD (not in prior docs, verified)

- **C-1 (Critical) — pinHash + PII leak via `vehicles/[id]`.** `include: { operator: true }` (`vehicles/[id]/route.ts:36`) returns full `User` rows to any authed operator. The single `operator: true` in the codebase; every other route uses `select:{id,name}`. **This is new and it is the top fix.**
- The consumable-model defect (Exec #2) is documented more completely here than anywhere prior — it is a *structural* schema issue, not just a UI filter.
- The API-consistency drift is systematized here (three envelope styles, three error shapes, vocabulary map) as the concrete backbone of the "make it consistent" request.

### 2.4 Documentation hygiene

There are still multiple overlapping `.md`/`.docx` assessment artifacts at the repo root. Recommended canonical set going forward: `AHITS_PRD_v2.md` (+ the `v2.1` addendum) as the spec, `AHITS_QA_STAGING_ISSUES.md` as the raw QA log, `README.md`/`CLAUDE.md`/`AGENTS.md`, and **this** document as the current assessment. Move superseded snapshots into `docs/archive/` with a one-line "as of commit X" header. The stale docs are actively producing contradictory status numbers — this is not busywork.

---

## 3. Current build state (grounded, reconciled to HEAD)

Status key: ✅ built & verified in code · 🟢 built, light verification · 🟡 partial/defects · ⛔ not started.

**Phase 1 — Foundation (~88%)**
- ✅ PIN + admin login; IP rate-limit + per-account bcrypt lockout; **session revocation via `tokenVersion`**; revocable "log out all devices"; invite/onboarding with CSPRNG tokens.
- ✅ Inventory single source of truth for *serialized* items (counts derived from `InventoryUnit`); 🟡 **consumables structurally broken** (§4 C-2).
- ✅ Edge auth (`proxy.ts`) + per-route guards + layout guards — defense-in-depth, verified.
- 🟡 Vehicle CRUD — works; PATCH now validated; but **`vehicles/[id]` leaks pinHash** (C-1) and VIN/plate PII to operators.
- ✅ Daily vehicle check — online + offline, idempotent `(vehicle,date,operator)` upsert.
- ✅ Equipment check-in/out via scan & My-Rig; durable offline queue.
- 🟡 Admin dashboard — stat cards + alert list; no operational feeds/tables; only 1 of 7 cards clickable; **no error states** (a failed fetch reads as "all clear").
- ✅ QR association-on-create + context-aware scan routing.
- 🟡 Settings — categories + hubs CRUD (cleanest admin surface); alert-threshold/cutoff config not wired.
- 🟡 Rigs/Kits/Deployments + transfers — work, with the consumable, concurrency, and two-return-paths issues in §4.

**Phase 2 — Core Operations (~35%)**
- ✅ Offline + replay (Wave 1) — durable queue, honest indicators, idempotent replay, operator precache, 7-day read cache.
- 🟡 Maintenance — damage-report tasks + `DAMAGE_REPORTED` alert created via the *rich* disposition path only; mark-complete loop, mileage trigger, and the admin Maintenance page are absent.
- ⛔ **Photo capture — nothing exists** (capture, compression, blob queue, upload-on-sync). `NotePhotoDialog` always returns `[]`; every `photoUrls` is permanently empty.
- 🟡 Notifications — daily-check-fail email + `DAMAGE_REPORTED` alert rows only; 5 other alert types and all push/external delivery unbuilt; triggers are lazy not scheduled.

**Phase 3 — Scale & Polish (⛔ not started)** — Deployment Map, Time/Invoicing/Availability, advanced reporting. None of the models exist.

**Admin nav reality:** 5 of 9 destinations are real (Dashboard, Inventory, Deployments, Users, Settings); **4 are 12-line stubs** (Vehicles, Maintenance, Projects, Reports) linked live.

---

## 4. Data model & integrity (exhaustive)

The schema (`prisma/schema.prisma`, 638 lines, 22 models, 9 migrations) is well-organized and the serialized-unit model is sound. The defects cluster in the consumable model, soft-delete consistency, concurrency, and constraints.

### 4.1 Inventory-unit lifecycle (status = `EquipmentStatus`)
```
AVAILABLE ──checkout──▶ CHECKED_OUT ──HUB return / decline / end──▶ AVAILABLE
CHECKED_OUT ──INOPERABLE & canBeFixed──▶ IN_MAINTENANCE
CHECKED_OUT ──INOPERABLE & !canBeFixed──▶ INOPERABLE
IN_MAINTENANCE / INOPERABLE ──▶ (no coded path back to AVAILABLE except admin unit PATCH)
```
Gaps: a *transferred* unit has no distinct status (stays `CHECKED_OUT`, disambiguated only by `KitItem.removedAt`); completing a `MaintenanceTask` does **not** transition the unit back, so repaired units strand in `IN_MAINTENANCE`; the addendum's `resolutionPath` (`IN_FIELD`/`HUB`/`SHOP`) + `locationNote` (A.3) do not exist, so "where is this in-repair item right now" is unrepresentable.

### 4.2 The consumable defect (Critical — C-2)
Three competing quantity representations never reconcile, and `InventoryItem.quantity` is **never mutated anywhere** (grep: zero `quantity:{increment|decrement}`). `deriveQuantities` returns `availableQuantity = item.quantity` unconditionally (`inventory.ts:99`), so a consumable's "available" is a frozen constant. Meanwhile the add-items handler reserves `InventoryUnit` rows for consumables (`deployments/[id]/items/route.ts:152-171`) that seeded consumables don't have → checkout fails ("Only 0 units available") or, if units exist, mutates them while `quantity` stays frozen. The two code paths disagree on what a consumable *is*. Returns for consumables flip arbitrary CHECKED_OUT unit rows (`getUnitsInOtherRigs` guard) — a no-op for true consumables. **Decision required:** make consumables pure counts (recommended — mutate `quantity`/derive available from open `CheckLog`s, add `CHECK (quantity >= 0)`), and stop routing them through `InventoryUnit`; then apply that model uniformly to checkout, return, transfer, disposition, and kit-add. This also fixes the "no UI path to add a consumable to a kit" QA item, which stems from the picker filtering on `unitCounts.available > 0`.

### 4.3 Referential integrity & soft-delete
FKs are dominantly `RESTRICT`, which protects history but makes the **hard-delete** routes unpredictable: `DELETE /api/inventory/[id]` (`route.ts:127`) and `DELETE /api/vehicles/[id]` (`route.ts:65`) call `prisma.*.delete()` and will throw P2003 (→ generic 500) once any `CheckLog`/`KitItem`/`DailyCheck` references the row — **and they never use the `deletedAt` soft-delete column the schema defines** (`schema.prisma:352`) and reads filter on. The UI says "history is preserved"; the code attempts a hard delete. Three soft-delete idioms coexist (`deletedAt` on items/units; `isActive` on users/hubs; `status=RETIRED` on vehicles); `Rig`, `Kit`, `KitItem`, `TransferRequest`, `Project`, `MaintenanceTask` have none. **Recommendation:** soft-delete consistently in the DELETE routes; guard FK violations; converge on one retirement idiom.

### 4.4 Concurrency
No interactive-transaction isolation level or row locks anywhere (grep: no `Serializable`/`FOR UPDATE`); all `$transaction`s run at READ COMMITTED; no optimistic-concurrency `version` column. The serialized-unit checkout race **is** handled correctly via conditional `updateMany(where status:'AVAILABLE') → count===0 → UNIT_CONFLICT` — this is the one well-guarded race, and it's the right pattern. But the **consumable/no-unit path** (`findMany take:n` then `updateMany`) is non-atomic and can over-allocate under concurrency; **transfer accept/decline** read `status!=='PENDING'` *outside* the tx and flip status unconditionally (inner `removedAt` guards catch most but not all double-applies); **decline restore** can restore units belonging to a different rig. Recommendation: conditional `updateMany` (compare-and-set) for status flips, `SELECT … FOR UPDATE SKIP LOCKED` or `Serializable` + retry on the consumable allocation path, and a `version` column on `Rig`/`KitItem`/`TransferRequest`.

### 4.5 Constraints & enums
Present and good: unique on `users.email`, `vehicles.{name,vin,qrCodeId}`, `inventory_items.qrCodeId`, `inventory_units.qrCodeId`, `rig_operators(rigId,operatorId)`, `daily_checks(vehicleId,date,operatorId)`, `invite_tokens.token`, `IdempotencyKey.key`. Missing/risky: **`itemType` is a free `String`, not an enum** (`schema.prisma:337`) — a malformed value silently routes an item down the wrong path; **`InventoryUnit.serialNumber` is not unique**; **no partial-unique index stopping a unit from being in two active kits** (`kit_items(inventoryUnitId) WHERE removedAt IS NULL`) — integrity rests entirely on runtime guards; **no constraint preventing duplicate PENDING transfers** of the same unit/vehicle; **`Alert` has no dedup key**, so `EQUIPMENT_NOT_RETURNED` can spawn duplicates on every daily-check submit. `Photo` polymorphism via 5 nullable FKs has no "exactly one set" check (orphan photos representable).

### 4.6 Audit & migrations
Two disjoint audit systems (`AccountAuditLog` for account actions, append-only but **swallowed on failure**; `CheckLog` for equipment movement). **No audit trail at all** for inventory/vehicle/maintenance/project edits or hard deletes — a compliance gap for an asset system. Migration hygiene shows `db push` mixed with `migrate dev` (an empty "schema_gaps" migration, hand-authored `wave2a5` SQL with a self-noted drift caveat, defensive `ADD COLUMN IF NOT EXISTS`) — history no longer guarantees provenance; tighten to migrate-only. The `idempotency_key` table has no TTL/GC, so a process killed between claim and release can leave a NULL-status row blocking that key forever — add a scheduled purge.

---

## 5. API consistency & contract drift (the "speak to itself" backbone)

The QA-flagged drift bugs (`availableUnits` dropped; `category` string→object React crash) are **fixed** (`inventory/route.ts:116-119`). But those were instances of a *systemic* pattern: untyped, unwrapped responses the client must guess at. The conventions are **declared, not enforced** — `src/types/index.ts` defines `ApiResponse<T>`/`PaginatedResponse<T>`, but ~17 routes ignore them.

**Three success-envelope styles coexist:** `{data}` / `{data,total,page,pageSize}` (the declared standard, ~30 routes), **bare object/array** (`transfers`, `hubs`, `categories`, all `deployments/*`, `auth/me`, the `by-qr` one-offs), and `{ok:true}` action acks (split with "return the bare updated object" on `deployments/*`). Symptom in the client: `setVehicles(d.data ?? d ?? [])`, `setHubs(d ?? [])` in one file vs `setHubs(d ?? d?.data ?? [])` in another **for the same endpoint**.

**Three error-body shapes coexist:** `{error:"string"}` (most), `{error:<zod flatten()>}` = `{formErrors,fieldErrors}` object (~20 routes), and `{error:<fieldErrors>}` bare object (4 routes). Symptom: every client error handler type-probes — `d.error?.formErrors?.[0] ?? d.error`, `typeof d.error === 'string' ? … : …`, and at `admin/inventory:255` literally `JSON.stringify(error)` dumped to the user. Delete contracts differ too (one route 204, the rest 200 `{ok:true}`); a few admin GETs return 403 for *unauthenticated* callers where 401 is correct.

**Vocabulary is canonical for equipment/vehicle *status* only** (`lib/status.ts` + `StatusChip`) — and even that is bypassed by half its consumers (admin inventory builds its own chips). **No shared label/color map exists for `VehicleType` (rendered raw as `POLARIS_UTV`), `itemType`, `TransferStatus`, `Condition`, `ProjectStatus/Type`, `MaintenanceStatus`, `Priority`, `AlertType`** — each is hand-formatted (raw enum, `replace(/_/g)`, ternary, or a local map). This is the root of the "Bakery Bag shows category 'Storage' next to peers showing 'CONSUMABLE'" confusion: the *category* chip and the *item-type* chip are styled identically with no rule about which is which.

**Pagination** is consistent on 3 routes (inventory, daily-check, checkout) and absent on the rest (`transfers`, `users`, `users/audit`, `maintenance`, `deployments`) — the client fakes "all" with `?pageSize=200`. Search param is `q` *or* `search` "for backward compat" — itself drift evidence.

**Fix (high leverage, mostly mechanical):** one `apiError(message, status, {fieldErrors?})` helper + one success-envelope helper (standardize on the already-declared `{data}`); publish response DTOs in `src/types/` (`InventoryItemDTO` with `category:{id,name}`, `unitCounts`, `availableUnits`, `availableQuantity`; `TransferDTO`; `UnitDTO`) and import them instead of re-declaring inline in four pages; extend the status module to every enum and route all rendering through typed chips; pick one delete/ack contract; normalize 401-vs-403; add real pagination. This single block erases nearly every defensive `?? d` / `typeof d.error` hedge in the frontend.

---

## 6. Offline / PWA / cross-platform (exhaustive)

The offline engine is the app's best work: a durable IndexedDB queue (`ahits_offline`), idempotency-keyed `mutate()`, retry caps with terminal-status handling, flush on mount/online/visibility/30s-interval, honest offline/pending/syncing/failed UI in the banner and app bar, cold-offline launch via precached operator shells + `/~offline` fallback. The gaps:

### 6.1 The core offline loop has a hole
**QR cannot be resolved offline for a never-seen tag.** Scan and My-Rig resolve a code via live `GET …/by-qr/…` *before* the queue-able action is reachable (`scan/page.tsx:98-110`; `my-rig:353,375,1266`). The SW does cache `/api/inventory*` and `/api/vehicles*` (NetworkFirst, 7-day), so a *previously-seen* unit may resolve from cache — but a fresh QR with no signal dead-ends. For a "scan a tag with no bars" app, this is the central reliability gap; it needs a cached unit/vehicle lookup table or an offline-resolvable QR payload.

### 6.2 No background sync; inconsistent queue coverage
There is **no Background Sync anywhere** — the queue only flushes while the app is foregrounded, so an operator who submits offline and locks the phone strands the write until they reopen AHITS (acute on iOS, which wouldn't support SW background sync regardless). And several writes **bypass the queue and fail hard offline** with a generic "Network error, try again," losing entered data: **start deployment** (`my-rig:393`), **transfer create** (`:162`), **accept/decline** (`:698`), **cancel** (`:723`), **inline rental vehicle** (`:1202`). Daily-check queues via `enqueue` directly and only in the network `catch` (an online 5xx isn't queued) — inconsistent with the rest, though server-side upsert makes it safe. Route every operator mutation through `mutate()`.

### 6.3 iOS-specific data-loss risks
`navigator.storage.persist()` is best-effort and frequently denied on iOS Safari; both the IndexedDB queue **and** the 7-day caches can be evicted after ~7 days of inactivity → **silent loss of queued writes and cached field data**. In Safari private mode, `enqueue` **swallows the IndexedDB failure silently** (`useOfflineQueue.ts:99`) — the operator believes their daily check saved when it didn't. Surface a hard error when persistence is unavailable, and warn when cached data is stale.

### 6.4 Scanning is single-photo, not live
`html5-qrcode` is a dependency but **never imported**; all scanning is `<input type="file" capture="environment">` → `jsQR` (one-shot). Upside: it sidesteps the worst iOS-standalone `getUserMedia` limitation and works without HTTPS for capture. Downside: no live preview/aiming/torch/continuous decode, error-prone in sun/glare, and the dedicated scan page has **no manual-entry fallback** (so it's unusable on a desktop without a camera). Either remove the dead dep or adopt a live scanner with an iOS-standalone path and a manual-entry fallback.

### 6.5 Freshness, responsiveness, hydration
SWR is used for exactly one thing (`/api/auth/me`); all operator field data is raw `fetch` in `useEffect`, so there's **no focus/reconnect revalidation** — reconnect flushes the queue but doesn't refetch lists, leaving stale data until navigation. Optimistic updates exist but aren't rolled back when a queued item later fails (the kit shows an item the server rejected; only the red banner hints). Responsiveness is good (MUI breakpoints, temporary drawer on mobile, no DataGrid on operator pages, pinch-zoom + safe-area retained). Hydration #418 is real and time/locale-driven: `dashboard:19-20` (`getGreeting()` + `toLocaleDateString`), `my-rig:946` (`toLocaleDateString` on `startedAt`), and `AppShell` `useMediaQuery` SSR/client divergence. Fix with mount-gated client state or a deterministic formatter.

### 6.6 Cross-platform matrix
| Surface | Desktop (admin) | Android Chrome (op) | iOS Safari/PWA (op) | Offline |
|---|---|---|---|---|
| Auth/session | ✅ edge+route+layout; 🟡 no 401 expiry UX | 🟡 same | 🟡 same | 🟡 401 replay reads as terminal-failed |
| Daily check | ✅ | ✅ | ✅ (safe-area ok) | ✅ idempotent upsert |
| Scan + check-in/out | ✅ (file/USB) | 🟡 one-shot scan | 🟡 one-shot scan | 🟡 cached QR only; fresh QR dead-ends |
| Photos | ⛔ none | ⛔ none | ⛔ none | ⛔ queue can't carry blobs |
| Start deploy / transfer create/respond/cancel / rental | ✅ | 🟠 bypass queue → lost offline | 🟠 same | 🟠 lost |
| Admin dashboard/CRUD | 🟡 4 stubs, no feeds, no error states | n/a | n/a | ⛔ online-only by design |
| Conflict handling | ⚪ bulk-dismiss, no per-item retry | ⚪ same | ⚪ same | 🟠 no reconcile/rollback |

**Needs a real-device pass** (unprovable from code): SW cold-offline launch, the terminal-failure "needs attention" path end-to-end, two-device same-unit conflict, and iOS persistence/eviction behavior. Make this a checklist gate before any field pilot.

---

## 7. Per-user analysis (every seat, including the one nobody logs in as)

### 7.1 The Operator (field contractor, phone, often offline)
The persona the architecture serves best — daily check, scan routing, kit ops, and transfers work offline with honest indicators. The concentrated friction:
- **Cannot attach a damage photo anywhere.** For a persona whose adoption test is "faster than texting a photo," this is the biggest single gap — until photos work the app is *slower* than texting for the one moment that matters.
- **The obvious "Needs maintenance"/Inoperable single-item return creates no task and no alert** (the simple `{returnCondition}` DELETE path just flips unit status). Only the bulk End/Remove disposition path spawns a task + alert. An operator reporting a broken tool the natural way produces **zero admin signal**.
- **Silent data loss offline** on start-deployment, transfer create/respond/cancel, and rental-add (they bypass the queue).
- **Session expiry is invisible** — `useAuth` ignores the 401 from `/api/auth/me`, so `user` becomes a truthy `{error:'Unauthorized'}`; the action just fails into the scary "couldn't be applied" banner instead of "please log in again."
- **The dashboard tells them nothing** — greeting + 3 static nav cards, no "you haven't done today's check," no current-rig summary, no pending-sync count. The first screen should answer "what do I need to do right now?"
- **Scan is one-shot and desktop-unusable** (no manual-entry fallback on the scan page); the "Check Out / Check In" card is a stub that just redirects to scan.
- They can still **see VIN/plate/insurance PII** via the vehicle routes (and the pinHash leak, C-1, is exploitable from their session).

### 7.2 The Admin / Operations Manager (office/iPad, online)
The less-finished half:
- **Four of nine nav links are dead ends** (Vehicles, Maintenance, Projects, Reports) — including the Maintenance page the dashboard's "Overdue Maintenance" count points to.
- **The dashboard isn't yet a dashboard** — stat cards + an alert list, only 1 of 7 cards clickable, every alert rendered identical red (severity lost), **resolve has no confirm/feedback/catch**, and **no error state** so a down API reads as "No unresolved alerts" (a dangerous false-negative).
- **The maintenance loop is missing** — no mark-complete → recompute next-due → spawn next task, no mileage trigger. Preventative maintenance (a headline ROI claim) has no mechanism.
- **Feedback is uneven** — silent successes on deployment add/remove; failed PATCH on Users renders in a *green success* alert; per-unit status changes and repair dispatch have no confirm/feedback; a drawer fetch-failure renders blank (dead end).
- **Vehicle disposition vocabulary diverges** — uses equipment's `AVAILABLE` instead of vehicle's `ACTIVE` and omits `OUT_OF_SERVICE`.

### 7.3 External / receiving parties (maintenance shops, hub operators, invoice processors) — the unbuilt output layer
This is the most under-built part of the whole system. Today AHITS *holds* shop data (`shopName`, `shopAddress`, PO, invoice, repair type, hub destinations) and *creates* maintenance tasks, but **nothing leaves the building**:
- **No work order is ever sent to a shop.** A damage report (rich path) makes a task + in-app alert; it does not email the shop, attach the (nonexistent) photo, or produce a printable work order / shipping label. The shop learns by phone — the exact pre-AHITS process the app exists to replace.
- **Hub operators have no notification path at all** — the whole Deployment-Requests "notify the hub's fulfiller" flow (addendum §F) is unbuilt.
- **No invoice ever reaches a processing address** (Phase-3 invoicing — none of the models exist).
- **Only two emails ever send** (invite, daily-check-fail), to a single `ADMIN_EMAIL` env var (silent if unset); the other seven templates are dead code; there is no push, no SMS, no notification center, and triggers are lazy (overdue/not-returned only fire when someone GETs the right endpoint), so the PRD's "notified within 15 min" and time-of-day cutoffs are unmet.

**Recommendation:** treat the outbound layer as a first-class design surface. Define a `MaintenanceWorkOrder` artifact (asset, problem, photos, shop, ship-to hub, requested-by, due) that renders to PDF/email, and make the alert/notification system the **single dispatcher** for *all* outbound comms — admin push/email **and** external shop/processor email — so there is one templating/escaping path and one place to add a recipient. This future-proofs the Phase-3 invoice→processor loop to reuse the same dispatcher.

---

## 8. UX & flow findings (cross-cutting)

The load-bearing operator loop is consistent and polished (toasts + loading + offline everywhere). The deficits cluster in admin surfaces and consistency:

- **Missing error states are pervasive** — most admin list fetches do a raw `await res.json()`, so a failed load masquerades as an empty state across the app ("all clear" / "no items"). This is the most dangerous *category* of UX bug because it hides failures.
- **Confirmation on destructive actions is partial** — present on inventory retire, user deactivate/unlock, settings delete, cancel-transfer; **missing** on resolve-alert, per-unit status change (incl. → RETIRED), PIN reset, force-logout-all-devices, remove-secondary-operator, and operator return-as-INOPERABLE.
- **Three toast mechanisms coexist** (shared `ToastProvider` + two hand-rolled `Alert`/`setTimeout` patterns) despite the provider being mounted in both layouts; the shared one (which lacks a severity channel) shows errors in green.
- **~20 hand-rolled dialogs** across `admin/deployments`, `my-rig`, `scan` instead of the shared `ConfirmDialog`.
- **Date/time rendering is inconsistent** — relative ("3h ago"), `toLocaleDateString`, and `formatDateTime` coexist within single screens; no shared formatter (also the hydration smell, §6.5).
- **Noun drift** — "Rig" and "Deployment" used interchangeably; operator nav says "My Dashboard"/"Scan QR" while cards say "Check Out / Check In."
- **Accessibility basics** — pervasive icon-only `IconButton`s with `Tooltip` but no `aria-label` (one remove-operator button has no accessible name at all); color-only severity on dashboard alerts; otherwise status chips pair color with text (good).
- **Checklist is condensed** — 9 items vs the PRD's ~16; no per-vehicle-type custom items; no per-item photo; failing-item note is optional where the PRD implies a reason per failed item.

---

## 9. The consistency blueprint ("every element speaks to one another")

You asked for the logic to be remarkably consistent and for every element to speak to one another fluidly. The codebase has the ingredients but applies them unevenly — two dialects (clean offline-first operator; hand-rolled admin). Five unifications, in leverage order, mostly *deletion*:

1. **One mutation pipeline.** Every state change — operator *and* admin — flows through a single `mutate()` that stamps an `Idempotency-Key`, queues when offline, handles 401→re-login, and returns a uniform result/error. Today operator pages use it, admin pages hand-roll `fetch`, daily-check and a few operator paths bypass it. One pipeline = one place for auth, offline, and error toasts (fixes the offline-bypass writes, the invisible-session-expiry, and half the toast sprawl at once).
2. **One response contract.** One success-envelope helper (`{data}` / paginated) and one `apiError()` (`{error:string, fieldErrors?}`) across all 49 routes, with published DTOs in `src/types/`. Erases every `d.data ?? d` and `typeof d.error` hedge in the client (§5).
3. **One vocabulary, server and client.** Promote `lib/status.ts` to the single source for *every* enum (status, `itemType`, `VehicleType`, `Condition`, `TransferStatus`, `ProjectStatus`, `MaintenanceStatus`, `Priority`, `AlertType`) as `{label,color}` maps + typed chips, imported everywhere; make `itemType`/disposition/alert real Prisma enums so the DB enforces the vocabulary too. Deletes ~5 duplicate label maps and every raw-enum render.
4. **One set of primitives.** `ConfirmDialog`, `useToast`, `StatusChip`, and a shared `EntityPicker` become the *only* way to confirm, notify, show status, and pick an entity — collapsing the ~20 dialogs and 3 toast systems.
5. **One outbound channel + one noun.** Route all notifications (admin + external) through the alert dispatcher with one escaped template path; pick **Deployment** as the single user-facing noun and align labels/routes.

**Test for "done":** a new feature should be buildable by composing these primitives without inventing a new dialog, fetch wrapper, status map, or email send. When that's true, the app speaks to itself.

---

## 10. What's done well (so it doesn't get "fixed" by mistake)

- **Auth spine:** JWT + DB-backed `tokenVersion` revocation re-checked every request (fail-closed); bcrypt(12); per-account lockout + IP throttle; CSPRNG invite tokens with atomic single-use claim; revocable sessions. This is solid and recently hardened — don't churn it.
- **Defense-in-depth routing:** `proxy.ts` edge gate + per-route guards + layout guards. (Keep `proxy.ts` named `proxy.ts` — §2.2.)
- **Offline engine:** durable IndexedDB queue, idempotency-keyed replay, retry caps, honest indicators, cold-offline shells.
- **Serialized-unit checkout race** handled correctly via conditional compare-and-set.
- **Inventory source-of-truth** for serialized items; `withPositions`/`computeUnitCounts` helpers.
- **Idempotency contract** (`withIdempotency`) now on all 7 inventory-moving routes; TOCTOU-aware.
- **Parameterized SQL throughout** (no `queryRawUnsafe`); `.strict()` zod on edit routes (no mass-assignment); escaped email; non-root Docker user; `.env` never committed.

---

## 11. Consolidated risk register (severity-ranked, with current status)

Severity = exploitability/impact × likelihood. "Status" reflects HEAD `a4c97f8`. Slot = recommended wave.

### 11.1 Security
| ID | Sev | Issue | Evidence | Status | Slot |
|----|-----|-------|----------|--------|------|
| **SEC-1** | 🔴 **Critical** | **`vehicles/[id]` leaks full `User` rows incl. bcrypt `pinHash` + PII to any operator** → offline brute-force of 6-digit PINs → account/admin takeover | `vehicles/[id]/route.ts:36` `include:{operator:true}` | **OPEN — verified** | **Now (1.5)** |
| SEC-2 | 🟡 Med | Vehicle VIN/plate/insurance PII returned to operators (no role strip, unlike cost fields) | `vehicles/route.ts`, `vehicles/[id]` | Open | 2A |
| SEC-3 | 🟡 Med | Uploads trust client `file.type`; public bucket; no magic-byte sniff; no rate limit (SVG-script / storage-DoS) | `uploads/route.ts:26,45` | Open | 2A / with photos |
| SEC-4 | 🟡 Med | No security headers / CSP (clickjacking, sniffing, no HSTS) | `next.config.ts` (no `headers()`) | Open | 2A |
| SEC-5 | 🟡 Med | CSRF surface: `serverActions.allowedOrigins:['*']` + `sameSite:'lax'` | `next.config.ts:13`; `session.ts:90` | Open | 2A |
| SEC-6 | 🟡 Med | Rate-limit reads the wrong (spoofable) end of `X-Forwarded-For` and is per-instance only | `rate-limit.ts:55` | Open | 3 |
| SEC-7 | ⚪ Low | `verifyPin` lockout uses read-modify-write not atomic `{increment}`; secondary emails leak to co-operators; unvalidated FK targets in disposition/transfer; admin can be given a 6-digit "password" | `pin.ts:12-48`; `deployments/[id]/route.ts:34`; `operators/route.ts:33` | Open | 2B/3 |
| — | ✅ | Invite tokens, mass-assignment, session revocation, cost gating, email escaping, transfer idempotency | — | **Fixed (Wave 2A/2A.5)** | done |
| — | ✅ | "proxy.ts is dead" | — | **False positive — do not act** | — |

### 11.2 Data integrity & correctness
| ID | Sev | Issue | Evidence | Slot |
|----|-----|-------|----------|------|
| **DAT-1** | 🔴 **Critical** | **Consumable model broken:** `InventoryItem.quantity` never mutated; consumables reserve nonexistent units → checkout fails or drifts; no UI path to add a consumable to a kit | `inventory.ts:99`; `deployments/[id]/items/route.ts:152-171`; `my-rig:333,1243` | **2B** |
| DAT-2 | 🟠 High | Hard `delete()` vs RESTRICT FKs + unused `deletedAt` → unpredictable 500s; UI claims history preserved | `inventory/[id]/route.ts:127`; `vehicles/[id]/route.ts:65` | 2B |
| DAT-3 | 🟠 High | Non-atomic read-then-`updateMany` (consumable checkout, decline restore, transfer status flip) under READ COMMITTED; no row locks / version column | `items/route.ts:153-163`; `decline/route.ts:77-86`; `accept/route.ts` | 2B |
| DAT-4 | 🟠 High | No constraint stopping a unit in two active kits / duplicate PENDING transfers (runtime guards only) | missing `@@unique` partial indexes | 2B/3 |
| DAT-5 | 🟠 High | Two divergent "needs maintenance" paths; simple/write-off paths create no task/alert; no unit status transition on repair completion; no `resolutionPath`/`locationNote` | `items/route.ts` simple vs rich path; addendum §A | 2B |
| DAT-6 | 🟡 Med | No audit trail for inventory/vehicle/maintenance/project edits or deletes; account audit best-effort/swallowed | `audit.ts:37` | 3 |
| DAT-7 | 🟡 Med | `itemType` free string not enum; `InventoryUnit.serialNumber` not unique; `Alert` no dedup key (duplicate alerts per daily-check) | `schema.prisma:337,375`; `daily-check/route.ts:104-111` | 2B/3 |
| DAT-8 | ⚪ Low | Migration drift (db-push mix, hand-authored SQL); `idempotency_key` no TTL/GC | `prisma/migrations/*` | 3 |

### 11.3 Offline & cross-platform
| ID | Sev | Issue | Slot |
|----|-----|-------|------|
| OFF-1 | 🔴 High | **Photo capture does not exist** (capture/compress/blob-queue/upload-on-sync); damage docs impossible; offline queue can't carry Blobs | 2C |
| OFF-2 | 🟠 High | QR can't resolve offline for an unseen tag → core scan loop dead-ends with no signal | 2C/3 |
| OFF-3 | 🟠 High | Start-deploy / transfer create/respond/cancel / rental bypass the queue → silent loss offline | 2B |
| OFF-4 | 🟠 High | No Background Sync → queue only flushes foregrounded (acute on iOS) | 3 |
| OFF-5 | 🟡 Med | Silent write loss when IndexedDB unavailable (Safari private/eviction); `persist()` best-effort | 2C/3 |
| OFF-6 | 🟡 Med | One-shot scanner, no live preview/torch/manual-entry on scan page; `html5-qrcode` dead dep | 3 |
| OFF-7 | 🟡 Med | Hydration #418 from time/locale renders + `useMediaQuery`; no reconnect refetch; no optimistic rollback | 2D |

### 11.4 UX, admin completeness & recipients
| ID | Sev | Issue | Slot |
|----|-----|-------|------|
| UX-1 | 🔴 High | Notification layer ~80% unbuilt: 5/6 alerts don't email, zero push, no notification center, no scheduled triggers, single env recipient | 3 |
| UX-2 | 🔴 High | External-recipient output entirely greenfield (shops/hubs/invoice processors receive nothing) | 3 |
| UX-3 | 🔴 High | Four admin pages are stubs but linked live (Vehicles, Maintenance, Projects, Reports) | 2D/3 |
| UX-4 | 🟠 High | Missing error states everywhere (failed loads read as empty/"all clear"); dashboard resolve has no feedback/confirm | 2D |
| UX-5 | 🟠 High | `useAuth` ignores 401 → no session-expiry UX | 2A/2D |
| UX-6 | 🟡 Med | Three toast systems; ~20 hand-rolled dialogs; partial `ConfirmDialog`; errors shown in green | 2D |
| UX-7 | 🟡 Med | Vocabulary divergence (raw `POLARIS_UTV`, vehicle vs equipment status, itemType-vs-category chips) | 2D |
| UX-8 | 🟡 Med | Hollow operator dashboard; condensed 9-item checklist; inconsistent dates; noun drift (Rig/Deployment) | 2D/3 |
| UX-9 | ⚪ Low | Icon-only buttons without `aria-label`; color-only alert severity | 2D/3 |

### 11.5 Workflow, deploy & testing
| ID | Sev | Issue | Slot |
|----|-----|-------|------|
| OPS-1 | 🟠 High | Docker build doesn't run migrations; deploy leans on manual `make db-migrate` per PR (drift footgun) | 3 |
| OPS-2 | 🟡 Med | No `/api/health` + Cloud Run startup probe; auth proxy blocks external deploy verification | 3 |
| OPS-3 | 🟡 Med | Thin test coverage on security-critical paths (auth lockout/expiry/invite, transfer, consumable, idempotency) | 3 |
| OPS-4 | ⚪ Low | Overlapping docs at multiple baselines → contradictory status numbers | 1.5 |

---

## 12. Forward roadmap (re-sequenced to what's actually left)

Each block is independently shippable per the `CLAUDE.md` PR→staging flow. Wave 2A *security* from the prior plan has largely merged; what remains is re-scoped below.

### Wave 1.5 — Hotfix (½ day, today)
1. **SEC-1** — strip `operator:true` → `operator:{select:{id,name}}` in `vehicles/[id]`. *(Top priority: credential leak.)*
2. **Consumable transfer banner** shows source qty not transferred qty (display-only).
3. **OPS-4** — archive superseded docs to `docs/archive/`; make this the canonical assessment.
4. Settle **odometer units** (mi vs km) and label explicitly before the mileage trigger is built on it.

*Exit: no credential leak; clean tree; docs reconciled.*

### Wave 2A′ — Finish security hardening (2–3 days)
SEC-2 (operator vehicle-PII strip), SEC-3 (upload sniff + size/rate limit + block SVG / private bucket), SEC-4 (security headers + CSP), SEC-5 (restrict `serverActions.allowedOrigins`, consider `sameSite:'strict'`), UX-5 (`useAuth` 401 → re-login).

*Exit: no PII/credential leak to operators; CSP + headers in place; session expiry visible.*

### Wave 2B — Correctness & the consumable model (~1 week)
DAT-1 (decide consumables = pure counts; apply across checkout/return/transfer/disposition/kit-add + availability guard), DAT-2 (soft-delete consistently + guard FK), DAT-3 (atomic compare-and-set + isolation/locks on the remaining races), DAT-5 (unify the two maintenance paths; transition unit status on repair complete; add `resolutionPath`/`locationNote`), OFF-3 (route the 5 bypass writes through `mutate()`), DAT-7 (enums + dedup index).

*Exit: consumables addable and correctly accounted; one maintenance path; no silent offline loss on those flows.*

### Wave 2C — Photos end-to-end (~1 week)
OFF-1: in-app capture → 1200px/JPEG-85 compress → **offline blob store** (separate from the JSON queue) → signed upload to a **private** bucket on sync → `Photo` rows with validated URLs; enforce damage-photo-required where the spec demands. OFF-2 (cached offline QR lookup) and OFF-5 (hard error when IDB unavailable) fold in naturally here.

*Exit: an operator attaches a damage photo offline; it arrives privately on sync; admins view it.*

### Wave 2D — Consistency unification (3–5 days, overlaps 2B/2C)
Implement §9: one mutation pipeline, one response contract (§5 helpers + DTOs), one vocabulary (promote `lib/status.ts`, add Prisma enums), one primitive set (collapse dialogs/toasts), one noun. Fold in UX-4 (error states everywhere), UX-6/7/8/9, OFF-7 (deterministic dates / hydration).

*Exit: a new feature composes existing primitives; no duplicated status maps or hand-rolled dialogs; failed loads never masquerade as empty.*

### Wave 3 — Close Phase 2 + production hardening (2–3 weeks)
1. **Maintenance loop** (mark-complete → recompute next-due → history → spawn next; daily-check odometer → mileage trigger).
2. **Notification dispatcher** (UX-1/UX-2): all six alert types over email + push **and** the external maintenance-shop work-order email + (Phase-3-ready) invoice loop, through one escaped channel; scheduled triggers (cron) for overdue/not-returned/expiry; per-admin/per-type routing; in-app notification center with a badge.
3. **Admin completeness** (UX-3): build the four stub pages + dashboard feeds/tables/pinned-alert banner; make stat cards navigate; live operator dashboard.
4. **Deploy & infra** (OPS-1/2, SEC-6): migrations in the deploy path; `/api/health` + startup probe; shared-store rate limiting; XFF fix.
5. **Tests** (OPS-3): auth first (lockout, expiry/revocation, invite), then transfer/consumable/idempotency integration, then a real-device offline pass.
6. **Scanner & conflicts** (OFF-4/6): Background Sync; live camera scanner + manual entry; per-item conflict inspector with retry.
7. **Audit** (DAT-6): generalized entity-audit log on mutations/deletes.

*Exit: Phase 2 functionally complete; production-grade auth/deploy/notifications; meaningful coverage on security-critical paths.*

### Phase 3 — Scale capstones (Q4 2026)
Deployment Map first (smallest — GPS on `DailyCheck`, opt-in capture, Mapbox pins; reuses the hardened daily-check write), then Time-Tracking / Invoicing / Availability (new models, PDF generation, invoice→processor email reusing the Wave-3 dispatcher), then advanced cost reporting, the QR-only no-app web form, contractor self-onboarding, and a React Native wrapper for app-store distribution.

### At a glance
| Block | Theme | Effort | Gate |
|---|---|---|---|
| Wave 1.5 | Hotfix (SEC-1 + banner + docs) | ½ day | now |
| Wave 2A′ | Finish security (PII, uploads, CSP, 401) | 2–3 days | now, parallel |
| Wave 2B | Correctness + consumables | ~1 wk | after 2A′ |
| Wave 2C | Photos end-to-end | ~1 wk | after/with 2B |
| Wave 2D | Consistency unification | 3–5 days | overlaps 2B/2C |
| Wave 3 | Close Phase 2 + hardening | 2–3 wk | after Wave 2 |
| Phase 3 | Map, Time/Invoicing | Q4 | after Wave 3 |

---

## 13. Immediate next actions (the patch forward)

If you do nothing else this week, in order:
1. **Ship the SEC-1 hotfix today** — the `vehicles/[id]` `operator:true` → `select:{id,name}` change. It's a credential leak reachable from any operator session; everything else can wait behind it. Bundle the consumable-banner fix and doc archive into the same small PR.
2. **Make the consumable-model decision explicit** (pure counts vs serialize-everything) before starting Wave 2B — it's a one-line decision that determines a week of work and touches five flows.
3. **Run the admin-side staging walkthrough** to exercise the CRUD this review read statically, and confirm the `DAMAGE_REPORTED` alert + consumable decrement live.
4. **Schedule a real-device offline pass** (a phone in airplane mode, one afternoon): SW cold-launch, the terminal-failure path, two-device same-unit conflict, iOS persistence/eviction. These are the things neither code review nor staging can prove.
5. **Mark every "damage"/"photo" workflow as *partial* in the tracker** until Wave 2C lands, so no one assumes documentation is being captured.

The through-line: the foundation is sound and the security spine is freshly hardened. Spend the next month making the app *correct, consistent, and complete* rather than broader — then the Phase-3 capstones land on solid ground.

---

## 14. Roadmap interrogation — features worth considering beyond the PRD

Surfacing additions the current plan doesn't name but the architecture invites:
- **A real notification center + digest** (not just per-event email): an in-app bell with unread state, plus a daily/weekly admin digest, since field events cluster.
- **Operator "home" intelligence:** today-at-a-glance (check due, current rig, items overdue to return, pending-sync count) — turns the hollow dashboard into the answer to "what do I do now?"
- **Bulk operations for admins:** bulk import (exists for users) extended to inventory/vehicles; bulk transfer/return; CSV export on every list (precursor to Reports).
- **Equipment history timeline:** a per-unit/per-vehicle chronological view (checkouts, checks, damage, repairs, transfers) — the `CheckLog` ledger already holds the data; it just isn't surfaced.
- **Hub-level inventory dashboards:** stock-on-hand per hub, low-stock per hub, items in-transit — directly serves hub operators, a named recipient.
- **Self-service maintenance-shop portal (lightweight):** a tokenized, no-login page where a shop can see the work order and mark "received / repaired / shipped back," closing the external loop without building them accounts.
- **Configurable checklists per vehicle type/project** (the PRD's Phase 2/3 item) — pairs with expanding the 9-item list to the spec's ~16.
- **Idempotency/queue observability:** an admin view of stuck/failed queued writes across operators — invaluable during a field pilot.
- **Audit/compliance export:** once the generalized audit log exists, a one-click "who changed what" export.
- **Role granularity:** the binary ADMIN/OPERATOR may need a "hub manager" or "read-only ops" tier as the org grows.

---

*Appendix — primary evidence files:* `src/proxy.ts`, `src/lib/auth/{session,pin}.ts`, `src/lib/{idempotency,inventory,alerts,audit,rate-limit}.ts`, `src/lib/email/templates.ts`, `src/hooks/{useOfflineQueue,useAuth}.ts`, `src/app/sw.ts`, `src/app/api/vehicles/[id]/route.ts`, `src/app/api/deployments/[id]/{items,end}/route.ts`, `src/app/api/transfers/[id]/{accept,decline}/route.ts`, `src/app/api/inventory/route.ts`, `src/app/api/uploads/route.ts`, `src/app/(operator)/operator/{my-rig,daily-check,scan,dashboard}/page.tsx`, `src/app/(admin)/admin/{dashboard,inventory,deployments,users,settings,vehicles,maintenance,projects,reports}/page.tsx`, `src/components/shared/{NotePhotoDialog,DispositionDialog,StatusChip,ConfirmDialog}.tsx`, `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/migrations/*`, `next.config.ts`, `Dockerfile`, `CLAUDE.md`. Next.js version confirmed `16.2.9` with first-class `proxy` convention (`node_modules/next/dist/lib/constants.js:289`).
