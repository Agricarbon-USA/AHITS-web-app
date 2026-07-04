# AHITS — Independent Assessment & Forward Roadmap

**Agricarbon Hardware Inventory & Tracking System**
Independent code-and-staging review · prepared 2026-06-17 · reviewer: fresh-session analysis
Baseline: branch `development`, HEAD `3c7516c` (PR #18 "wave1-offline-real" merged) · staging verified live at `ahits-web-app-staging-vdz5yvke2a-uc.a.run.app`

> **How this document relates to the PRD.** `AHITS_PRD_v2.md` is the product spec and an unusually honest self-assessment. This document is a *separate, independent* pass: I interrogated the actual code and the live staging app rather than trusting the docs, then reconciled the two. Where this review and the PRD disagree, I show the code evidence (file:line). Read this alongside the PRD, not instead of it. Section 3 lists every place the current docs are now **stale or wrong** — start there.

---

## 1. Executive summary

The product is in good shape for its age. The load-bearing architecture — offline-first operator workflows with a durable IndexedDB queue, idempotent replay, single-source-of-truth inventory, and context-aware QR scan routing — is genuinely built and was verified working both in code and on the live staging app. This is the hard part, and it is done. Wave 0 and Wave 1 are real.

The gap between "works in a two-operator demo" and "ready for 90 contractors in the field" is now almost entirely about **correctness consistency, security hardening, and finishing half-built surfaces** — not architecture. There are no foundational rewrites pending. Everything outstanding is additive or corrective.

Three things matter most coming out of this review:

1. **The current docs (including the PRD) overstate remaining work in some places and understate real risks in others.** Two of the three "immediate next" items in the PRD (punch #1 vehicle-remove, #5 refresh-after-mutation) and the "37 uncommitted auth-route transforms" loose end were *already fixed and merged* in commit `0d5591c` via PR #18. Conversely, the PRD's confidence about "transfers verified end-to-end" hides a duplicate-handler hazard and a missing idempotency wrap on exactly the routes that move inventory. Section 3 corrects the record.

2. **Photos do not exist anywhere.** The PRD treats private photo storage as a *hardening* follow-up, implying capture works. It does not. The one photo-related component (`NotePhotoDialog`) always returns an empty array; nothing is ever captured, compressed, uploaded, or stored. Every `photoUrls` in the system is permanently `[]`. Damage documentation — a core reason the app exists ("faster than texting a photo") — is non-functional. This is the single largest hidden gap.

3. **The security debt is real and concentrated in a few high-leverage places:** guessable invite tokens on unthrottled public endpoints that can mint an *admin* account; mass-assignment on three admin edit routes; no session revocation; cost data leaking to operators; and unvalidated photo URLs / unescaped email HTML. None are exotic; all are fixable inside Wave 2/3 without architectural change.

My headline recommendation is unchanged from the PRD's instinct — **consolidate before adding features** — but with a sharper ordering: (a) ship the small confirmed hotfixes and delete the dead transfer handler; (b) do the security hardening pass as its own focused block *before* more feature work, because the invite-token and mass-assignment issues are exploitable today; (c) build photo capture end-to-end, since multiple "done" workflows secretly depend on it; (d) unify the UI primitives and vocabulary so the app "speaks to itself" consistently; then (e) finish the maintenance loop and notifications; then (f) the Phase 3 capstones.

The good news worth stating plainly: the offline engine, the idempotency contract, the inventory source-of-truth, and the edge + route-level auth layering are all solid foundations that the rest of the plan can safely build on.

---

## 2. What I did (methodology)

So you can calibrate confidence in each finding:

- **Read the full codebase**: `prisma/schema.prisma`, all 43 API route files under `src/app/api/**`, all operator and admin pages, every shared component and hook, `src/proxy.ts`, the service worker, `next.config.ts`, the Dockerfile/Makefile/CI, and the seed/import scripts.
- **Verified against the live staging app** in-browser: confirmed the operator dashboard contents, that edge auth redirects an operator away from `/admin/*`, and that the daily-check wizard renders and steps correctly.
- **Reconciled ~22 markdown docs** against the merged code at HEAD, flagging stale and contradictory claims.
- **Independently re-derived severities** rather than inheriting them, and **caught one false positive** in my own first-pass automated review (the "middleware never runs" claim — see §3) by checking the Next.js 16 source conventions directly.

Confidence levels in this doc: "confirmed" = I read the exact code or saw it on staging; "likely" = strong code evidence but not exercised at runtime; "needs device test" = cannot be confirmed without a real phone in airplane mode.

---

## 3. Corrections to the current record (read this first)

The single most valuable output of an independent pass is catching where the existing analysis has drifted from reality. The docs were written against at least three different commit baselines and predate the PR #18 merge.

### 3.1 Things the docs say are open/broken that are actually FIXED

| Claim in docs | Reality at HEAD `3c7516c` | Evidence |
|---|---|---|
| Punch #1 — operator vehicle-remove sends wrong payload (400) | **Fixed.** UI now sends `{vehicles:[{vehicleId,dispositionType:'AVAILABLE'}],note}`, matching the route's `removeSchema`. | `src/app/(operator)/operator/my-rig/page.tsx:803-817` vs `src/app/api/deployments/[id]/vehicles/route.ts:47-50` |
| Punch #5 — UI doesn't auto-refresh after mutations | **Fixed.** `await load()` runs after every operator mutation (action, accept/decline, return, log usage, end, rental add, launch). | `my-rig/page.tsx:711,753,778,843,871,1220,1507` |
| §3.1 — "37 uncommitted auth-route transforms" running old inline checks on staging | **Committed and merged** in `0d5591c`. 39 of 43 routes now use `requireAdmin`/`requireAuth`; the 4 remaining are legitimately non-admin. | `git show 0d5591c`; working tree clean of these |
| §3.1 — idempotency migration "pending" | **Committed.** Migrations `20260617120000_wave1_idempotency` and `…140000_idempotency_nullable_status` are in the repo. | `prisma/migrations/` |

**Net effect:** the PRD's "immediate next actions (1): commit + deploy the auth transforms and fixes #1/#2" is ~2/3 already done. Only #2 (consumable banner) remains of that batch.

### 3.2 A false positive worth flagging (so it doesn't get fixed by mistake)

My first automated backend pass flagged **"Critical: `src/proxy.ts` is misnamed, Next only runs `middleware.ts`, so all edge auth is dead."** **This is wrong.** Next.js 16 *renamed* the middleware convention to `proxy` (`PROXY_FILENAME = 'proxy'` in `node_modules/next/dist/lib/constants.js`; `README.md` documents the migration). I confirmed on staging that an operator navigating to `/admin/vehicles` is **redirected back to `/operator/dashboard`** — edge auth is live and working. Do **not** rename `proxy.ts` to `middleware.ts`. This is actually a *strength*: the app has defense-in-depth (edge gate + per-route `requireAdmin`). It's called out here because it's the kind of plausible-sounding "fix" that would break a working security layer.

### 3.3 Things the docs understate or miss

- **Transfers are not idempotency-wrapped.** `transfers/[id]/accept` and `decline` move vehicles, flip unit statuses, and write CheckLogs but are **not** wrapped in `withIdempotency` — the exact routes the PRD's "exactly one DB record on replay" promise should cover. A double-tap accept on a flaky connection can double-create kit items / CheckLogs. (`src/app/api/transfers/[id]/accept/route.ts` — no `withIdempotency` import.)
- **Photos are 100% absent**, not merely "needs private storage" (see §1, §5).
- **`useAuth` ignores HTTP 401** — `/api/auth/me` returns 401 with `{error}` on an expired session, but the fetcher never checks `r.ok`, so `user` becomes a truthy `{error:'Unauthorized'}` object and the UI shows no session-expiry signal. (`src/hooks/useAuth.ts:7`.)
- **Default seed credentials are well-known** (`ops@agricarbon.com / Admin1234!`, operators `123456`) and live in `prisma/seed.ts` — a real risk if seed is ever run against a shared/prod DB.

### 3.4 Documentation hygiene

There are ~22 overlapping markdown docs written against ≥3 commit baselines, which is itself a source of the drift above. Recommended canonical set: keep `AHITS_PRD_v2.md` (the live tracker — needs a correction pass per §3.1), `AHITS_QA_STAGING_ISSUES.md` (raw QA record), `README.md`, `CLAUDE.md`/`AGENTS.md`, and **this** assessment. Move the rest — `AUDIT_REPORT.md`, `AHITS_REVIEW.md`, `AHITS_REVIEW_V2.md`, all `CLAUDE_SPRINT_*`/`CLAUDE_*_FEATURE` docs, `PRD_ADDITIONS_V2.md`, `AHITS_QA_RESUME_CHECKLIST.md`, and the older `AHITS_STATE_ANALYSIS`/`WAVE1_ANALYSIS`/`SIMPLIFICATION_REVIEW` — into `docs/archive/` with a one-line "snapshot as of commit X" header. This is not busywork: the stale docs are actively producing contradictory status numbers (Phase 1 is variously quoted at 70/80/85%).

---

## 4. State of the app — grounded build status

Reconciled to the merged code. Status key: ✅ built & verified · 🟢 built, light verification · 🟡 partial/defects · ⛔ not started.

**Phase 1 — Foundation (~85%)**
- ✅ PIN + admin login; login rate-limit + PIN lockout (in-memory rate limiter — see §6).
- ✅ Inventory single source of truth; serialized counts derived from `InventoryUnit`, consumables from `quantity`.
- ✅ Edge auth (`proxy.ts`) + per-route `requireAdmin`/`requireAuth` — defense-in-depth, verified on staging.
- 🟡 Vehicle CRUD — works; PATCH is unvalidated mass-assignment (§6).
- ✅ Daily vehicle check — verified online and offline with idempotent upsert.
- ✅ Equipment check in/out — verified via scan and My-Rig; durable offline.
- 🟡 Admin dashboard — stat cards + alerts list; the §11.1 operational feeds/tables are absent.
- ✅ QR association-on-create + context-aware scan routing.
- 🟡 Settings — categories + hubs; alert-threshold/cutoff config not wired.
- 🟡 Rigs/Kits/Deployments + transfers — work, but with the consumable, idempotency, and duplicate-handler issues in §6.

**Phase 2 — Core Operations (~35%)**
- ✅ Offline + background sync (Wave 1) — durable queue, honest indicators, idempotent replay, operator precache, 7-day read cache.
- 🟡 Maintenance — damage-report tasks created; the mark-complete recurrence loop and the mileage trigger are not built.
- ⛔ Photo capture — **nothing exists** (capture, compression, storage, upload-on-sync).
- 🟡 Notifications — daily-check-fail email wired; `DAMAGE_REPORTED` alert rows created; 5 other alert types + all push not built.
- ✅ Item disposition (INOPERABLE via the rich path) — unit status + maintenance task + alert.

**Phase 3 — Scale & Polish (⛔ not started)** — Deployment Map, Time/Invoicing/Availability, advanced reporting. None of the models exist; GPS still lives on `Photo`, not `DailyCheck`.

**Four admin pages are stubs but linked live in the nav** — Vehicles, Maintenance, Projects, Reports are 12-line "implementation in progress" placeholders, yet `AdminNav` links all four as if real (§7). Four of nine admin destinations are dead ends.

---

## 5. Issue & risk register (severity-ranked, grounded)

Severity reflects exploitability/impact × likelihood. Every item cites code. "Slot" is my recommended wave.

### 5.1 Security (do this block first — several are exploitable today)

| ID | Sev | Issue | Evidence | Fix | Slot |
|----|-----|-------|----------|-----|------|
| S1 | 🔴 Critical | **Guessable invite tokens can mint an admin.** `InviteToken.token` defaults to `cuid()` (not a CSPRNG); `invite/validate` and `invite/complete` are public and **unthrottled**; a guessed token for an ADMIN invite creates an admin account. Plus a TOCTOU on `usedAt` and an uncaught error → 500. | `prisma/schema.prisma:582`; `src/app/api/users/invite/{validate,complete}/route.ts`; no `rateLimit` call | `crypto.randomBytes(32)` token; rate-limit both endpoints; conditional `updateMany(where usedAt null)` inside the tx; try/catch | Wave 2 |
| S2 | 🔴 High | **Mass-assignment on admin edit routes.** `PATCH vehicles/[id]`, `maintenance/[id]`, `inventory/[id]` pass raw `req.json()` to Prisma `update` with no zod/whitelist (two with no try/catch). Can set `qrCodeId`, FKs, `deletedAt`, `unitCost`, `createdAt`, etc.; malformed body → unhandled 500 leaking Prisma messages. | `vehicles/[id]/route.ts:21-28`; `maintenance/[id]/route.ts:5-12`; `inventory/[id]/route.ts:73-95` | zod schema + field whitelist + try/catch on all three | Wave 2 |
| S3 | 🟠 High | **No session revocation.** Stateless 24h HS256 JWT embeds name/email/role and is never re-checked against the DB. A deactivated or demoted user keeps full access for up to 24h. The §10.1 "30-day idle / 3 trusted devices" model doesn't exist. | `src/lib/auth/session.ts:21-70` | Add a session/device table or a cheap per-request `isActive`/`role` re-check; shorten/rotate | Wave 3 |
| S4 | 🟠 High | **Default seed credentials are well-known and in-repo.** `ops@agricarbon.com / Admin1234!`, operators `123456`. Dangerous if `make db-seed` ever runs against a shared/prod DB. | `prisma/seed.ts:10,25` | Gate seed to non-prod; randomize admin pw and print once; force change on first login | Wave 2 |
| S5 | 🟡 Med | **Cost/spend leaks to operators** (violates §10.2). `GET /api/inventory(/[id])` returns `unitCost`; `GET /api/maintenance` returns `estimatedCost`/`actualCost` to any authed user. | `inventory/route.ts:50-124`; `inventory/[id]/route.ts:10-70`; `maintenance/route.ts:15-25` | `select` that omits cost for OPERATOR role | Wave 2 |
| S6 | 🟡 Med | **Unvalidated `Photo.url`** accepted as free string → stored-XSS/SSRF if rendered in `<img>`/anchor (raw tags bypass the `next/image` allowlist). | `photoUrls: z.array(z.string())` in deployment routes; `schema.prisma:553` | Validate to your storage origin; never render arbitrary URLs | Wave 2 (with photos) |
| S7 | 🟡 Med | **Email HTML injection.** Operator `issues`/`notes` and invite `name` interpolated unescaped into email HTML. | `src/lib/email/templates.ts:41,50,94` | HTML-escape all interpolated values | Wave 2 |
| S8 | 🟡 Med | **CSRF surface widened.** `experimental.serverActions.allowedOrigins: ['*']` disables the origin check; session cookie is `sameSite:'lax'`. | `next.config.ts` | Restrict to known origins | Wave 3 |
| S9 | 🟡 Med | **In-memory rate limiting only.** Per-instance counters on Cloud Run → effective ceiling scales with instance count; invite endpoints have none. | `src/lib/rate-limit.ts:6-8` | Shared store (DB/Upstash) or platform-level | Wave 3 |
| S10 | ⚪ Low | Unused `SUPABASE_SERVICE_ROLE_KEY` in runtime env (not imported in `src/`, but standing exposure). Unbounded `pageSize` on list routes (cheap DoS). Raw error messages leaked from several routes. | `.env.example`; pagination parsing in list routes | Drop the secret from runtime; cap `pageSize`; generic error bodies | Wave 3 |

### 5.2 Data integrity & correctness

| ID | Sev | Issue | Evidence | Fix | Slot |
|----|-----|-------|----------|-----|------|
| C1 | 🔴 High | **Transfer accept/decline not idempotency-wrapped** — replay can double-create kit items / CheckLogs. The PRD's replay guarantee doesn't cover the routes that actually move inventory. | `transfers/[id]/accept/route.ts`, `decline/route.ts` (no `withIdempotency`) | Wrap both in `withIdempotency`; make the kit-item create idempotent | Wave 2 |
| C2 | 🟠 High | **Duplicate transfer handler.** A third, divergent `[action]` handler exists (no `assignedOperatorId` update, no CheckLogs, no unit restore on decline). Static `accept`/`decline` win by routing precedence so it's dead — but it's a latent regression bomb. | `transfers/[id]/[action]/route.ts` | **Delete it**; add a test asserting which handler runs | Wave 2 |
| C3 | 🟠 High | **Consumables can't be added to a kit via UI** (Punch #3) and the consumable model is half-implemented as serialized. Build Kit / Add Items filter on `unitCounts.available > 0`; pure consumables (no unit rows) are always excluded. Consumable checkout flips `InventoryUnit` rows instead of decrementing `quantity`, so pure consumables fail checkout and `quantity` drifts. | `my-rig/page.tsx:333,1240`; `deployments/[id]/items/route.ts:152-182` | Decide the model (recommend: consumables are pure counts), then apply consistently across checkout/return/transfer/disposition/kit-add | Wave 2 |
| C4 | 🟡 Med | **Consumable transfer banner shows source qty, not transferred qty** (Punch #2, ×83 vs ×10). Data is correct; display is wrong. | `my-rig/page.tsx:908,127` | Carry and render the transfer line's quantity | Wave 2 (hotfix) |
| C5 | 🟡 Med | **Two divergent "needs maintenance" paths** (Punch #6). The per-item quick-return only flips unit status; the rich disposition path also creates a maintenance task + alert. Routine "needs maintenance" silently notifies no one. | `deployments/[id]/items/[kitItemId]/route.ts:52-75` vs `items/route.ts:327-342` | Decide the contract, then unify so both spawn a task/alert | Wave 2 |
| C6 | 🟡 Med | **`Alert` has no dedup constraint** + `createAlert` is `findFirst`-then-`create` with no transaction → duplicate unresolved alerts under concurrency (dashboard loads fire alerts in a loop). | `src/lib/alerts.ts:11-18`; `maintenance/route.ts:29-36` | Unique index on `(type, sourceTable, sourceId, resolved)`; upsert-in-tx | Wave 2/3 |
| C7 | 🟡 Med | **Hard delete + no try/catch on deletes.** `DELETE inventory/[id]` hard-deletes despite a `deletedAt` soft-delete column the rest of the app respects; vehicle/inventory deletes with child rows throw P2003 → 500. | `inventory/[id]/route.ts:101`; `vehicles/[id]/route.ts:34` | Soft-delete consistently; guard FK violations | Wave 2/3 |
| C8 | 🟡 Med | **Arbitrary-unit-flip on consumable return/disposition** — returns pick *any* CHECKED_OUT units of that item, not the ones this rig checked out; risk grows with concurrent rigs. | `items/[kitItemId]/route.ts:87-102`; `items/route.ts:277-292` | Track which units a rig holds; flip those | Wave 2 |
| C9 | 🟡 Med | **`daily-check` has no idempotency wrap and bypasses `mutate()`.** Online submit sends no `Idempotency-Key`; relies on a `(vehicle,date,operator)` upsert (safe for the same triple, but a changed field on retry can overwrite). Offline path queues only in the network `catch`. | `daily-check/page.tsx:95,108` | Route through `mutate()`; the upsert already covers dedup, but make the contract uniform | Wave 2 |
| C10 | ⚪ Low | `itemType` is a free string, not an enum; `Vehicle.assignedOperatorId` has no FK; `RigVehicle` lacks a logical-unique constraint; `idempotency_key` PK is `key` only while reads filter `(key,scope)`. | `schema.prisma` | Enums + constraints | Wave 3 |

### 5.3 Offline & cross-platform

| ID | Sev | Issue | Evidence | Fix | Slot |
|----|-----|-------|----------|-----|------|
| O1 | 🔴 High | **Photo capture does not exist.** `NotePhotoDialog` always returns `onConfirm(note, [])`; no `getUserMedia`, no compression, no `supabase.storage.upload`, no upload-on-sync. Damage photos (required by §11.5/§11.10) cannot be attached anywhere. The offline queue serializes bodies as JSON and **cannot carry a Blob**, so photos need a separate offline-blob path. | `NotePhotoDialog.tsx:33`; no storage calls anywhere | Build capture → 1200px/JPEG-85 compress → offline blob store → signed upload on sync → private bucket | Wave 2 |
| O2 | 🟠 High | **Some operator writes bypass the offline queue** and are silently lost offline: rental-vehicle create and transfer respond/cancel are plain `fetch` that only `setError` on failure. | `my-rig/page.tsx:1199-1210,698,723` | Route all operator mutations through `mutate()` | Wave 2 |
| O3 | 🟠 High | **iOS safe-area not applied to app chrome.** `viewportFit:'cover'` + `black-translucent` status bar are set, but `env(safe-area-inset-*)` is only on the offline page; the fixed `AppBar` and `main` have no inset, so content sits under the notch/home-indicator in standalone PWA. | `layout.tsx:26`; `AppShell.tsx:40,83` | Add safe-area padding to AppShell | Wave 2 |
| O4 | 🟡 Med/High | **No live camera scanner.** Every "scan" is a single still-frame `<input capture>` → `jsqr`. Error-prone in the field (blur/glare) with only a "type the code" fallback; the operator `scan` page lacks even a manual-entry field. | `scan/page.tsx:82-90`; `QrScanField.tsx:46-54` | Continuous `getUserMedia`/`html5-qrcode` decode with live preview; add manual entry to scan page | Wave 2/3 |
| O5 | 🟡 Med | **Conflict resolution is bulk-dismiss only.** Failed items surface as "X couldn't be applied — Dismiss," which discards *all* failed items; no per-item inspector, no `lastError`, no retry. §11.9's "manual-resolution prompt for conflicting status changes" is unbuilt. | `OfflineBanner.tsx:11-14` | Per-item failed-queue inspector with retry/discard and reason | Wave 3 |
| O6 | 🟡 Med | **Locale/timezone date rendering** (`toLocaleDateString()` with no locale; `new Date()` in render) is a React #418 hydration smell and renders differently per device. | `my-rig:943`, `inventory:669,733`, `dashboard:20,64` | Deterministic date formatting (fixed locale/UTC or post-mount) | Wave 2/3 |
| O7 | ⚪ Low | Odometer labeled **"km"** in daily-check UI while PRD §11.3 specifies **"mi"** — unit ambiguity that corrupts the mileage-trigger math if mixed. | staging `/operator/daily-check`; `daily-check/page.tsx` | Pick one unit, label explicitly, store canonical | Wave 2 |

### 5.4 UX consistency & admin completeness

| ID | Sev | Issue | Evidence | Fix | Slot |
|----|-----|-------|----------|-----|------|
| U1 | 🟠 High | **Four admin pages are stubs but linked live** (Vehicles, Maintenance, Projects, Reports). | 12-line placeholders; `AdminNav.tsx:22-26` | Build them, or hide/disable nav links until built | Wave 2/3 |
| U2 | 🟠 High | **`useAuth` ignores 401 → no session-expiry UX.** On expiry, `user` becomes `{error:'Unauthorized'}` (truthy); nav renders blank, actions silently 401 and land in the failed queue. No client 401→`/login` redirect inside an open session. | `hooks/useAuth.ts:7`; `api/auth/me/route.ts:6` | Check `r.ok`; on 401 clear session + redirect | Wave 2 |
| U3 | 🟡 Med | **Three competing toast systems** (shared `useToast`, local `<Alert>`, `setTimeout` closure) despite a `ToastProvider` mounted in both layouts. | `admin/settings:60`, `admin/users:223`, `admin/deployments:1356` | One toast API everywhere | Wave 2 |
| U4 | 🟡 Med | **`ConfirmDialog` adoption is partial;** `admin/deployments`, `my-rig`, `scan` hand-roll ~20 dialogs total. Disposition/status label maps are duplicated in 3+ places (client ×2, server). | per file refs above | Adopt `ConfirmDialog`/`StatusChip`/shared vocab everywhere | Wave 2 |
| U5 | 🟡 Med | **Admin dashboard missing §11.1 feeds/tables** (missed checks, maintenance-due, checked-out, activity log) and the pinned-alert banner; six of seven stat cards aren't clickable though they look identical to the one that is. | `admin/dashboard/page.tsx` | Build the four feeds + pinned banner; make cards navigate | Wave 3 |
| U6 | 🟡 Med | **Operator dashboard is hollow** (greeting + 3 nav cards, no live data) — confirmed on staging. No current-rig summary, no pending-check nudge, no queue status. "Check Out / Check In" just redirects to scan. | staging; `operator/dashboard/page.tsx`; `checkout/page.tsx:4` | Surface today's check status, current rig, pending-sync count | Wave 2/3 |
| U7 | ⚪ Low | Inventory "send for repair" path doesn't refetch (stale until reload); kit list re-sorts after actions; sparse daily-check Pass review; per-item failing notes not required. | `admin/inventory:131`; Punch #11–15 | Refetch; stable ordering; echo values; require notes | Wave 2 |

### 5.5 Workflow, deploy & testing

| ID | Sev | Issue | Evidence | Fix | Slot |
|----|-----|-------|----------|-----|------|
| W1 | 🟠 High | **Docker build doesn't run migrations.** Deploy leans on a manual `make db-migrate` per PR (per `CLAUDE.md`) — a schema-drift footgun. | `Dockerfile`; `CLAUDE.md` | Run `prisma migrate deploy` in the container entrypoint or a gated CI step | Wave 3 |
| W2 | 🟡 Med | **No `/api/health` + Cloud Run startup probe;** auth proxy redirects everything, so external QA can't verify a deploy without logging in. | no health route | Add `/api/health`; wire a startup probe | Wave 3 |
| W3 | 🟡 Med | **Zero auth tests** — PIN lockout, session expiry/revocation, invite flow (the most security-critical code) are untested. Suite needs the isolated test DB (now configured) before expansion. | `tests/`; `vitest.config.ts` | Auth tests first, then transfer/consumable/idempotency integration tests | Wave 3 |
| W4 | ⚪ Low | ~22 overlapping docs at ≥3 baselines producing contradictory status (§3.4). | repo root | Archive to `docs/archive/`; keep canonical set | Wave 2 |

---

## 6. Per-user analysis

The user asked specifically to consider every party. Here is the app from each seat, including the one nobody logs in as.

### 6.1 The Operator (field contractor, phone, often offline)

This is the persona the architecture serves best, and it shows. Daily check, check-in/out, scan routing, and transfers all work offline with honest sync indicators. The remaining friction is concentrated and fixable:

- **They can't attach a damage photo** anywhere (O1). For a persona whose adoption test is literally "faster than texting a photo," this is the biggest single gap. Until photos work, the app is *slower* than texting for the one moment that matters most (documenting damage).
- **Silent data loss on two paths** (rental-vehicle add, transfer respond/cancel) when offline (O2) — the worst failure mode for a trust-sensitive field tool.
- **Session expiry is invisible** (U2): their action just fails into the scary "couldn't be applied" banner instead of "please log in again."
- **The scan experience is a single still photo** (O4) — frustrating in sun/glare, and the scan page offers no manual-code fallback.
- **The dashboard tells them nothing** (U6) — no "you haven't done today's check," no current rig, no pending-sync count. The first screen should answer "what do I need to do right now?"
- **iOS notch overlap** (O3) makes the standalone PWA feel unfinished on exactly the primary device (iPhone).
- They can **see cost data** they shouldn't (S5).

### 6.2 The Admin / Operations Manager (office/iPad, online)

The admin surface is the less-finished half of the app — it's the "broad but shallow" remnant.

- **Four of nine nav links are dead ends** (U1): Vehicles, Maintenance, Projects, Reports are placeholders. An admin clicking "Maintenance" or "Reports" hits "implementation in progress."
- **The dashboard isn't yet a dashboard** (U5): stat cards + an alerts list, but none of the operational feeds (missed checks, maintenance due, checked-out, activity) that make it the "one screen that shows the state of everything." Six of seven cards aren't even clickable.
- **The maintenance loop is missing** (PRD §11.6): no mark-complete → recalc next due → spawn next task, and no mileage trigger. So preventative maintenance — a headline success metric (25% cost reduction) — has no working mechanism yet.
- **Editing is risky** (S2): the admin edit endpoints are mass-assignable and can 500 on bad input.
- **Deactivating a user doesn't take effect for 24h** (S3).
- **No control over who can mint admins** beyond a guessable token (S1).
- Admin mutations bypass the offline queue entirely — fine for a desk, but it means add/remove logic is implemented twice with divergent payloads and error handling (U3/U4), which is where inconsistency creeps in.

### 6.3 External / receiving parties (maintenance shops, invoice processors) — the unbuilt output layer

This is the most under-specified part of the whole system, and worth dwelling on since you raised it. Today the system *holds* shop data (`shopName`, `shopAddress`, repair type, hub destinations) and *creates* maintenance tasks, but **nothing leaves the building**:

- **No work order is ever sent to a shop.** A damage report creates a maintenance task and an in-app alert; it does not email or fax the shop, attach the (nonexistent) photo, or produce a printable work order / shipping label. The shop only finds out by a human picking up the phone — i.e., the exact pre-AHITS process the app is meant to replace, for this leg.
- **No invoice ever reaches a processing address.** The Phase-3 invoicing flow specifies "on approval, auto-email the invoice to pre-configured addresses." None of the seven models exist; there is no PDF generation and no outbound email loop.
- **Email itself is a thin, injectable layer** (S7): the one working email (daily-check fail) interpolates operator text unescaped.

**Recommendation:** treat the external-output layer as a first-class design surface, not an afterthought. Concretely: define a `MaintenanceWorkOrder` artifact (asset, problem, photos, shop, ship-to hub, requested-by, due) that can render to PDF/email; make the `Alert`/notification system the single dispatcher for *all* outbound comms (admin push/email **and** external shop/processor email), so there's one consistent channel with one templating/escaping path rather than ad-hoc sends. This also future-proofs the invoice→processor email (Phase 3) to reuse the same dispatcher.

---

## 7. The consistency blueprint ("every element speaks to one another")

You asked for the logic to be remarkably consistent and for every element to speak to one another fluidly. The codebase has the *ingredients* for this (shared `mutate()`, `ConfirmDialog`, `StatusChip`, `lib/status` vocabulary) but applies them unevenly — there are effectively **two dialects**: a clean offline-first operator dialect and a hand-rolled admin dialect. Unifying them is the highest-leverage "consistency" work. Five concrete unifications:

1. **One mutation pipeline.** Every state change — operator *and* admin — should flow through a single `mutate()` that stamps an `Idempotency-Key`, queues when offline, and returns a uniform result. Today operator pages use it; admin pages hand-roll `fetch`; daily-check and a few operator paths bypass it. One pipeline means one place for auth-401 handling, one place for offline behavior, one place for error toasts. (Fixes C9, O2, U2, and half of U3/U4 at once.)

2. **One vocabulary, server and client.** Status and disposition labels/colors are currently defined in `lib/status.ts`, an admin `ALERT_LABELS` map, `DispositionDialog`, `admin/deployments`, *and* an API route — at least five copies. Promote `lib/status.ts` to the single source, import it everywhere (including server routes that currently hard-code maps), and delete the duplicates. Make `itemType`, disposition, and alert type real enums in Prisma so the DB enforces the vocabulary too.

3. **One set of primitives.** `ConfirmDialog`, `useToast`, `StatusChip`, and a shared `EntityPicker` should be the *only* way to confirm, notify, show status, and pick an entity. The ~20 hand-rolled dialogs and 3 toast systems collapse into these. This is mostly deletion, which is the best kind of consistency work.

4. **One "Deployment" noun.** The app uses Rig and Deployment somewhat interchangeably. Pick **Deployment** as the user-facing noun (the PRD agrees) and align labels, routes, and ideally the model name. Mixed nouns are a quiet but constant source of operator confusion.

5. **One outbound channel.** Per §6.3, route all notifications (admin and external) through the alert/notification dispatcher with one escaped template path.

A useful test for "done": a new feature should be implementable by composing these primitives without inventing a new dialog, fetch wrapper, status map, or email send. When that's true, the app will "speak to itself."

---

## 8. Cross-platform & offline matrix

| Surface | Desktop (admin) | Android Chrome (operator) | iOS Safari/PWA (operator) | Offline |
|---|---|---|---|---|
| Auth/session | ✅ edge+route auth; 🟡 no expiry UX (U2) | 🟡 same | 🟡 same | 🟡 401 on replay reads as terminal-failed, mislabeled |
| Daily check | ✅ | ✅ | 🟡 notch overlap (O3) | ✅ queues (but no idempotency-key online, C9) |
| Check in/out + scan | ✅ (USB/manual) | 🟡 still-frame scan only (O4) | 🟡 still-frame + notch | ✅ durable queue |
| Photos | ⛔ none (O1) | ⛔ none | ⛔ none | ⛔ queue can't carry blobs |
| Transfers | ✅ | 🟡 respond/cancel bypass queue (O2) | 🟡 same | 🟠 partial — some paths lost offline |
| Admin dashboard/CRUD | 🟡 stubs (U1), no feeds (U5), mass-assign (S2) | n/a (desktop/iPad) | n/a | ⛔ admin is online-only by design |
| Conflict handling | ⚪ bulk-dismiss only (O5) | ⚪ same | ⚪ same | 🟠 no per-item resolution |

**Needs a real-device pass** (cannot be confirmed from code/staging): service-worker cold-offline launch, the terminal-failure "needs attention" path end-to-end, and two-device same-unit conflict. These should be a checklist item before any field pilot.

---

## 9. Forward roadmap

Sequenced for dependency and risk, not just feature value. Each block is shippable and independently deployable per the `CLAUDE.md` PR→staging flow. I've split the PRD's Wave 2 into a security-first sub-block because several items are exploitable today and shouldn't wait behind feature work.

### Wave 1.5 — Hotfix & cleanup (≈1 day, do immediately)

The smallest high-confidence batch. All are confirmed and low-risk.

1. **C4** — render the transfer line's quantity in the consumable transfer banner (Punch #2). ~1 line + a type field.
2. **C2** — delete `transfers/[id]/[action]/route.ts` (dead, divergent). Add a one-line test asserting the static handlers run.
3. **W4** — archive the ~13 superseded docs to `docs/archive/`; correct the PRD's stale §3.1/§5 entries (mark #1, #5 fixed).
4. **O7** — settle odometer units (mi vs km) and label explicitly before the mileage trigger is built on top of it.

*Exit:* clean working tree, one transfer handler each, docs reconciled, no known stale "fix me" items left.

### Wave 2A — Security hardening (≈3–5 days, before more features)

These are the items an attacker or a deactivated insider could use today.

1. **S1** — CSPRNG invite tokens + rate-limit `invite/validate|complete` + conditional-update TOCTOU fix. *(Highest priority — admin account minting.)*
2. **S2** — zod + field whitelist + try/catch on `vehicles/[id]`, `maintenance/[id]`, `inventory/[id]` PATCH.
3. **S4** — gate seeding to non-prod; randomize the admin password; force first-login change.
4. **S5** — role-aware `select` so operators never receive cost fields.
5. **S7** — HTML-escape all email template inputs.
6. **C1** — wrap transfer accept/decline in `withIdempotency`.

*Exit:* no public endpoint can mint privilege; no edit route is mass-assignable; cost data is admin-only; replays are deduped on every inventory-moving route.

### Wave 2B — Correctness & the consumable model (≈1 week)

1. **C3** — decide the consumable model (recommend pure counts) and apply it consistently across checkout, return, transfer, disposition, and **kit-add** (unblocks Punch #3). Add an availability guard at kit/deployment creation.
2. **C5/C8** — unify the two "needs maintenance" paths; track which units a rig holds so returns/dispositions flip the right ones.
3. **C9** — route daily-check through the unified `mutate()` pipeline.
4. **C6/C7** — `Alert` dedup index + upsert-in-tx; soft-delete consistently and guard FK violations.
5. **U7** — refetch-after-mutation gaps, stable ordering, richer Pass review, required per-item failing notes.

*Exit:* consumables are addable and correctly accounted with no double-count or arbitrary-unit-flip; one maintenance path; every panel refreshes after every mutation.

### Wave 2C — Photos end-to-end (≈1 week)

The hidden-dependency block; several "done" workflows need it.

1. **O1** — in-app capture → 1200px/JPEG-85 compression → **offline blob store** (separate from the JSON queue) → signed upload to a **private Supabase bucket** on sync → `Photo` rows with validated URLs (**S6**). Enforce damage-photo-required where the spec demands it.

*Exit:* an operator can attach a damage photo offline and have it arrive privately on sync; admins can view it.

### Wave 2D — Consistency unification (≈3–5 days, can overlap)

Implement the §7 blueprint: one mutation pipeline, one vocabulary (promote `lib/status.ts`, add Prisma enums), one set of primitives (collapse the hand-rolled dialogs/toasts), one "Deployment" noun, and **U2** (session-expiry UX) which falls out of the unified pipeline.

*Exit:* a new feature can be built by composing existing primitives; no duplicated status maps; no hand-rolled dialogs.

### Wave 3 — Close Phase 2 + production hardening (≈2–3 weeks)

1. **Maintenance loop** (PRD §11.6): mark-complete → recalc next due → preserve history → spawn next task; daily-check odometer → Due-Soon/Overdue mileage trigger.
2. **Notifications dispatcher** (§6.3): all six alert types over email + push through one escaped channel, *including* the external maintenance-shop work-order email and the (Phase-3-ready) invoice→processor loop.
3. **Admin completeness** (U1, U5): build the four stub pages and the dashboard feeds/tables + pinned-alert banner; make stat cards navigate; build the operator dashboard live data (U6).
4. **Sessions/devices** (S3): trusted-device/session model so deactivate/demote takes effect and sessions can be revoked.
5. **Deploy hardening** (W1, W2, S8, S9): migrations in the deploy path; `/api/health` + startup probe; restrict `serverActions.allowedOrigins`; shared-store rate limiting.
6. **Tests** (W3): auth first (lockout, expiry/revocation, invite), then transfer/consumable/idempotency integration, then a real-device offline pass.
7. **O4/O5/O6**: live camera scanner; per-item conflict-resolution inspector; deterministic dates.

*Exit:* Phase 2 functionally complete; production-grade auth, deploy, and notifications; meaningful test coverage on the security-critical paths.

### Phase 3 — Scale capstones (Q4 2026)

In dependency order: **Deployment Map** first (smallest — three GPS fields on `DailyCheck`, opt-in capture, Mapbox pins) since it reuses the daily-check write you've already hardened; then **Time-Tracking / Invoicing / Availability** (the seven new models, PDF generation, the invoice→processor email reusing the Wave-3 dispatcher); then advanced cost reporting, the QR-only no-app web form, contractor self-onboarding, and the React Native wrapper for app-store distribution.

### Roadmap at a glance

| Block | Theme | Rough effort | Gate to start |
|---|---|---|---|
| Wave 1.5 | Hotfix & cleanup | ~1 day | now |
| Wave 2A | Security hardening | 3–5 days | now (parallel to 1.5) |
| Wave 2B | Correctness + consumables | ~1 week | after 2A |
| Wave 2C | Photos end-to-end | ~1 week | after/with 2B |
| Wave 2D | Consistency unification | 3–5 days | overlaps 2B/2C |
| Wave 3 | Close Phase 2 + hardening | 2–3 weeks | after Wave 2 |
| Phase 3 | Map, Time/Invoicing | Q4 | after Wave 3 |

---

## 10. Recommended immediate next actions (the patch forward)

If you do nothing else this week, do these, in this order:

1. **Ship Wave 1.5** (a single small PR): fix the consumable banner (C4), delete the dead transfer handler (C2), reconcile the docs (W4), settle odometer units (O7). Low risk, closes the last of the PRD's "immediate" batch, and leaves a clean tree.
2. **Start Wave 2A security** as the very next PR — specifically **S1 (invite tokens)** first. This is the one issue with a path to full admin compromise from an unauthenticated endpoint; it should not wait behind feature work.
3. **Run the admin-side staging walkthrough** to close the PRD's two open verifications (consumable decrement 83→73; the `DAMAGE_REPORTED` alert firing) and to exercise the admin CRUD that this review only read statically.
4. **Schedule a real-device offline pass** (one afternoon, a phone in airplane mode) to confirm SW cold-launch, the terminal-failure path, and two-device conflict — the three things neither code review nor staging can prove.
5. **Make the photo decision explicit** (Wave 2C): until photos work, mark every "damage" workflow as *partial* in the tracker so no one assumes documentation is being captured.

Everything else follows the §9 sequence. The through-line: the foundation is sound, so spend the next month making the app *consistent, secure, and complete* rather than broader — then the Phase 3 capstones land on solid ground.

---

*Appendix — primary evidence files:* `src/proxy.ts`, `src/lib/auth/session.ts`, `src/lib/idempotency.ts`, `src/lib/alerts.ts`, `src/lib/inventory.ts`, `src/lib/email/templates.ts`, `src/hooks/{useOfflineQueue,useAuth}.ts`, `src/app/api/transfers/[id]/{accept,decline,[action]}/route.ts`, `src/app/api/deployments/[id]/items/route.ts`, `src/app/api/{vehicles,maintenance,inventory}/[id]/route.ts`, `src/app/api/users/invite/*`, `src/app/(operator)/operator/{my-rig,daily-check,scan,dashboard}/page.tsx`, `src/components/shared/NotePhotoDialog.tsx`, `prisma/schema.prisma`, `prisma/seed.ts`, `next.config.ts`, `Dockerfile`, `CLAUDE.md`.

