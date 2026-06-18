# AHITS — Product Requirements Document, v2 (Comprehensive)

**Agricarbon Hardware Inventory & Tracking System**
Version 2.3 · prepared 2026‑06‑18 · supersedes `AHITS_PRD_v1`, the June "Post Wave 0" status update, and PRD v2.0/v2.1/v2.2

---

## 0. Document control

**Revision history.**
- **v2.0** — comprehensive merge of v1 spec + the Wave 0/Wave 1 implementation-and-QA cycle (build-status matrix, changelog, QA results, punch list).
- **v2.1** — companion `AHITS_PRD_v2.1_ADDENDUM.md` folded in: equipment lifecycle & maintenance states (§A), account management (§B), Kit/Rig/Deployment terminology (§C), and Deployment Requests (§F). Glossary, open-questions, and roadmap updated.
- **v2.2** — brought the document current through a second build session that shipped **Wave 1.5 (hotfixes)**, **Wave 2A (security hardening)**, **Wave 2A.5 (account management)**, a **CI test-gating** change, and **four forward-ported API gaps** (deployment GET/PATCH, secondary-operator management, review-inoperable, and a Supabase Storage photo-upload endpoint). Added **§21 Workflow recommendations** and **§22 Forward recommendations & concerns**.
- **v2.3 (this revision)** — brings the document current through a **third build session** (assessment-driven Wave 2 completion). Shipped, as a stack of reviewable PRs: a **Critical credential-leak hotfix (SEC-1)**, the **consumable inventory-model rebuild (DAT-1)**, the **tail of security hardening (Wave 2A′** — vehicle-PII minimization, upload magic-byte validation, security headers + Report-Only CSP, CSRF removal, session-expiry UX), the **no-migration correctness cluster (Wave 2B-A** — offline-bypass writes through the queue, soft-deletes, atomic transfer flips), the **maintenance lifecycle (DAT-5** — unified damage path + repair-completion unit recovery + resolution tracking, *additive migration*), and **schema hardening (DAT-7** — itemType enum, serial uniqueness, atomic alert dedup, *migration*). The freshest current-state material is now **§3.4** (session-3 changelog) and the updated **§2** matrix; read those first. Companions: `AHITS_Comprehensive_Assessment_2026-06-18.md` (the assessment that drove this session) and `WAVE2_COMPLETE.md` (the session record).

**v2 is a superset of v1 — nothing has been dropped.** This document preserves every product specification from v1 in full (problem statement, goals, personas, platform, authentication, all feature specifications 7.1–7.12 including the Deployment Map and the Time‑Tracking/Invoicing/Availability module, the data model, non‑functional requirements, out‑of‑scope list, phases, open questions, and glossary). On top of that enduring spec, v2 folds in everything learned and shipped during the latest implementation‑and‑QA cycle: a build‑status matrix, a session changelog, the deploy/commit state and loose ends, hands‑on QA verification results, a **severity‑ranked operator defect punch list slotted into the wave/phase where each item should be fixed**, an updated forward work plan, and a sweep of gaps in the PRD, codebase, and workflow. **Where v2 differs from v1, v2 takes precedence.**

**How to read this document.** Sections 1–5 are the *current state* (status, changelog, QA, punch list) — the freshest material. Sections 6–20 are the *enduring product specification* carried forward from v1, annotated with a short **Build status** line per feature so the spec doubles as a live tracker. Status key used throughout: ✅ built & verified · 🟢 built, light verification · 🟡 partial / has defects · ⛔ not started.

**Companion repo documents** (current; in the repo root):
`AHITS_PRD_v2.1_ADDENDUM.md` (maintenance states · account management · Kit/Rig/Deployment — folds into this PRD) · `AHITS_Comprehensive_Assessment_2026-06-18.md` (the Session-3 independent assessment — issue/risk register, per-user analysis, consistency blueprint, cross-platform/offline matrix; supersedes the earlier `AHITS_INDEPENDENT_ASSESSMENT_AND_ROADMAP.md`) · `WAVE2_COMPLETE.md` (the Session-3 build record — every change, PR/branch/migration map, verification status, caveats, workflow recommendations, forward backlog) · `AHITS_QA_STAGING_ISSUES.md` (raw QA record).

**Historical / superseded docs** have been moved to `docs/archive/` (see `docs/archive/README.md`): the earlier `AHITS_WAVE1_ANALYSIS_AND_ROADMAP.md`, `AHITS_STATE_ANALYSIS.md`, `AHITS_SIMPLIFICATION_REVIEW.md`, `AUDIT_REPORT.md`, `AHITS_REVIEW(_V2).md`, `PRD_ADDITIONS_V2.md`, `AHITS_QA_RESUME_CHECKLIST.md`, and the `CLAUDE_SPRINT_*` / `CLAUDE_*_FEATURE.md` build logs. They remain available for engineering detail but are pinned to older baselines.

**Stack (all decisions RESOLVED).** Next.js 16 (App Router) · TypeScript · Prisma 5 · Supabase (Auth/Storage/Realtime) · Material UI · Serwist PWA · GCP Cloud Run (us‑central1) via GitHub Actions. Mobile is web‑first PWA; a React Native wrapper is deferred to Phase 3.

---

## 1. Executive summary

Agricarbon is a distributed field organization performing soil sampling across cropland, rangeland, and forestry projects in multiple countries. Field crews operate across multiple regions simultaneously, deploying a fleet of trucks, UTVs, ATVs, trailers, and supporting equipment. Today, equipment location, maintenance status, and daily vehicle safety checks are tracked inconsistently — across text messages, paper forms, and ad‑hoc spreadsheets — causing lost equipment, deferred maintenance and expensive breakdowns, and no centralized visibility for operations management.

AHITS is a purpose‑built, full‑service application that gives every field operator and administrator a single, always‑available system for tracking equipment, logging vehicle checks, managing maintenance schedules, and coordinating gear across projects. It is designed to work in low‑connectivity field environments and scale from a small core team to a full contractor network of 100+ users.

**Target outcome:** 95% of daily vehicle checks submitted on time, zero equipment "lost" for more than 24 hours, and a 25%+ reduction in equipment costs through preventative maintenance — within 6 months of full deployment.

**Where the build stands now (as of v2.3).** The product has moved from "broad but shallow" to a genuinely working, increasingly hardened core. Wave 0 (inventory source‑of‑truth, login hardening), **Wave 1** (the offline‑first promise — durable queue, idempotent replay, QR scan‑routing), the Wave 1.5/2A/2A.5 security-and-accounts work, and now (Session 3) the **entire assessment-identified Wave 2 plan** — the consumable-model rebuild, the security-hardening tail, the no-migration correctness cluster, the maintenance lifecycle, and schema hardening — are done and verified (see §3.4). Since the first cycle, a second build session shipped:

- **Wave 1.5 — hotfixes (merged, PR #19):** consumable‑transfer banner quantity (Punch #2); a `?direction=` filter so the pending‑transfer banner no longer leaks between sender and recipient (Punch #4); deleted the divergent dynamic transfer handler + added a guard test (C2); odometer units settled to miles (O7).
- **Wave 2A — security hardening (merged, PR #23):** CSPRNG invite tokens + throttling + a TOCTOU fix (S1); zod field‑whitelists on the mass‑assignment PATCH routes (S2); cost/spend fields hidden from operators (S5); HTML‑escaped email templates (S7); seed hardened against production + randomized admin password (S4); transfer accept/decline wrapped in idempotency (C1).
- **Wave 2A.5 — account management (built, branch pending merge):** revocable sessions (suspend / force‑logout / demote take effect immediately via a DB re‑check + `tokenVersion`); a full account‑lifecycle/roles/defaults API with a last‑active‑admin guardrail; invite revoke/resend + bulk onboarding; an `AccountAuditLog`; and the matching admin UI.
- **CI hardening:** the vitest suite now runs on every PR against a Postgres service container (previously CI ran only lint + type‑check).
- **Four forward‑ported API gaps:** `GET/PATCH /api/deployments/[id]`, `GET/POST/DELETE /api/deployments/[id]/operators` (secondary operators — closes Punch #8), `POST /api/inventory/[id]/review-inoperable` (admin RETIRE/REPAIR decision), and **`POST /api/uploads` — a Supabase Storage photo‑upload endpoint** (the first real piece of the long‑absent photo pipeline).

The load‑bearing flows work and are verified on staging. **Session 3 then completed the entire Wave 2 consolidation plan** (§3.4): the consumable accounting model is rebuilt, the security‑hardening tail is done, the no‑migration correctness cluster (offline writes, soft‑deletes, atomic transfers) shipped, the **maintenance/breakdown lifecycle** is built (unified damage path + repair‑completion unit recovery), and the schema is hardened (itemType enum, serial uniqueness, atomic alert dedup). The next move is the remaining Phase‑2 close‑out: **Wave 2C** (photos end‑to‑end + private storage), **Wave 2D** (consistency unification), then **Wave 3** (the notification dispatcher + external‑recipient delivery, the four stub admin pages, sessions/devices, deploy hardening, tests) — with the Phase‑3 capstones (Deployment Map; Time‑Tracking/Invoicing/Availability; **Deployment Requests**, Addendum §F / §11.13) after. A detailed forward plan and risk list is in §21–§22; the full session record (with caveats) is in `WAVE2_COMPLETE.md`.

---

## 2. Build status — phases × waves (current, v2.3)

**Phase 1 — Foundation** (v1 target "50% by end of June") ≈ **95%**
- ✅ PIN + admin login, with login rate limiting + admin lockout (Wave 0). **Sessions are revocable** (Wave 2A.5). Session‑expiry is now visible client‑side — `useAuth` redirects on 401 (Session 3, UX‑5).
- ✅ Inventory single source of truth — serialized counts `InventoryUnit`‑derived; **consumables rebuilt onto a total‑owned / derived‑availability model** and addable to kits (Session 3, DAT‑1). `itemType` is now a DB enum (DAT‑7).
- ✅ Vehicle CRUD — PATCH zod‑validated/whitelisted (Wave 2A, S2). **VIN/plate/insurance PII withheld from operators** (Session 3, SEC‑2). DELETE is now a soft‑retire with an in‑use guard (DAT‑2).
- ✅ Daily vehicle check — verified online **and** offline with idempotent sync; odometer in miles.
- ✅ Equipment check in/out — verified via scan and My‑Rig; durable offline.
- 🟡 Admin dashboard — stat cards + Active Deployments tile; §11.1 operational feeds/tables still not built (Wave 3).
- ✅ QR association/lookup — association‑on‑create (vehicles + units) shipped.
- 🟡 Settings — categories + hubs management; alert‑threshold/cutoff config not wired.
- ✅ Rigs/Kits/Deployments + transfers — verified end‑to‑end; `GET/PATCH /api/deployments/[id]` + secondary‑operator management. **Transfer status flips are now atomic** (DAT‑3); **start‑deploy + transfer create/respond/cancel are offline‑safe** through the queue (OFF‑3).
- ✅ **Team / account management** — invite, lifecycle, roles with last‑admin guardrail, per‑operator defaults, audit log (Wave 2A.5).
- ✅ **App‑wide security headers** (HSTS/nosniff/frame‑options/referrer/permissions) + **CSP (Report‑Only)** with a violation sink; CSRF footgun removed (Session 3, SEC‑4/SEC‑5).

**Phase 2 — Core Operations** (v1 target "95% by end of July") ≈ **60%**
- ✅ **Offline + background sync — Wave 1** (queue, honest indicators, idempotent replay); **all operator writes now route through the queue** (Session 3, OFF‑3).
- 🟢 **Maintenance lifecycle — built (Session 3, DAT‑5).** One unified damage path (`lib/maintenance.createDamageReport`): every return/disposition that flags damage now flips the unit, opens a **unit‑linked** `MaintenanceTask`, and raises one `DAMAGE_REPORTED` alert (the quick per‑item "Needs maintenance" return previously notified no one). Completing a task returns that exact unit to `AVAILABLE`. `resolutionPath` (IN_FIELD/HUB/SHOP) + `locationNote` answer "where is it?" *Still Wave 3:* the recurrence/mileage trigger and the admin Maintenance **page** (the backend now exists to drive it).
- 🟡 Photo capture — `POST /api/uploads` exists and is now **hardened** (magic‑byte validation, SVG blocked, per‑user rate limit; Session 3, SEC‑3). Still missing: in‑app capture UI, client‑side compression, offline blob queueing, the **private bucket + signed URLs**, and damage‑photo‑required enforcement (**Wave 2C**).
- 🟡 Notifications — daily‑check‑fail email wired; `DAMAGE_REPORTED` alerts created and **now de‑duplicated atomically** (DAT‑7, `activeKey`); the other five alert types, push, scheduled triggers, a notification center, and **external‑recipient delivery** are **Wave 3** (the dispatcher).
- ✅ Item disposition (INOPERABLE / damage) — verified; unified under DAT‑5.
- ✅ **Security hardening — Wave 2A + Wave 2A′ (Session 3)** — invite tokens, mass‑assignment validation, cost‑field gating, email escaping, seed, transfer idempotency, **plus** vehicle‑PII minimization, upload hardening, security headers/CSP, CSRF removal, session‑expiry UX.

**Phase 3 — Scale & Polish** (v1 target Q4 2026): ⛔ **not started.** Deployment Map, time/invoicing/availability, advanced reporting, **Deployment Requests** (§11.13). None of the new Phase‑3 models exist; GPS is still on `Photo`, not `DailyCheck`.

"95% by end of July" still requires descoping; the remaining Phase‑2 prerequisites are now **Wave 2C** (photos) and **Wave 3** (notifications + admin pages).

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

### 3.2 Session‑2 changelog — Wave 1.5, 2A, 2A.5, CI, forward‑ports

A second build session (independent code+staging review → fixes → security → account management) shipped the following. Items are grouped by the wave that produced them; each was eslint‑clean and (where the sandbox allowed) type‑checked, with the remainder type‑checked in CI.

**Independent assessment (no code).** A fresh, code‑and‑staging review produced `AHITS_INDEPENDENT_ASSESSMENT_AND_ROADMAP.md` (severity‑ranked issue/risk register, per‑user analysis, consistency blueprint, cross‑platform/offline matrix). It corrected several stale claims in the docs (e.g., Punch #1/#5 and the "37 uncommitted auth transforms" were already merged in `0d5591c`) and caught a false positive in its own first pass — `src/proxy.ts` is **not** dead code; Next.js 16 renamed the middleware convention to `proxy`, verified live on staging.

**Wave 1.5 — hotfixes (merged, PR #19).**
- **C4 / Punch #2:** transfer banners render the per‑line quantity (`TransferItem.quantity`).
- **Punch #4 (bonus):** `GET /api/transfers` now honors `?direction=incoming|outgoing`; the param was previously ignored, so the sender's "Waiting/Cancel" banner leaked to the recipient.
- **C2:** deleted the divergent dynamic `transfers/[id]/[action]` handler (static `accept`/`decline` win by routing precedence) + a DB‑free guard test that prevents its reintroduction.
- **O7:** odometer labeled in **miles** across daily‑check + scan, matching the PRD canonical unit.

**Wave 2A — security hardening (merged, PR #23).**
- **S1:** invite tokens use `crypto.randomBytes(32)` (not `cuid()`); `invite/validate` + `invite/complete` are rate‑limited; the account‑minting TOCTOU is closed with an atomic `updateMany(usedAt: null)` claim; a failed invite email rolls back the token.
- **S2:** zod field‑whitelist + `.strict()` + try/catch on `PATCH vehicles/[id]`, `maintenance/[id]`, `inventory/[id]`; no more raw Prisma error leakage.
- **S5:** `unitCost` (inventory) and `estimatedCost`/`actualCost` (maintenance) omitted from responses for operator sessions.
- **S7:** all user‑supplied values HTML‑escaped in email templates.
- **S4:** seed refuses `NODE_ENV=production` and generates/prints a random admin password instead of `Admin1234!`.
- **C1:** `transfers/[id]/accept` + `decline` wrapped in `withIdempotency`.

**Wave 2A.5 — account management (built; branch `feature/20260618/maxwellslater-wave2a5-account-mgmt`, pending merge).**
- **Revocable sessions:** `getSession` re‑validates the JWT against the DB (`isActive` + `tokenVersion`) and returns fresh role/name/email; suspend, force‑logout (tokenVersion bump), and demotion are immediate. Login stamps `tokenVersion` + records `lastLoginAt`. *(Adds one DB read per authenticated request — a deliberate tradeoff; cacheable later.)*
- **Lifecycle/roles/defaults API** (`users/[id]` PATCH): reset PIN (+`mustChangePin`), unlock, suspend/reactivate, force‑logout, role change **with a last‑active‑admin guardrail**, home‑hub + hourly‑rate defaults — all written to a new **`AccountAuditLog`**.
- **Invites:** pending‑list GET, `invite/[id]` revoke (DELETE) + resend (POST), `validate`/`complete` reject revoked tokens, and a `users/bulk` onboarding endpoint.
- **Schema:** `User.tokenVersion/mustChangePin/homeHubId`, `InviteToken.revokedAt`, `AccountAuditLog` model (migration `20260618180000_wave2a5_account_management` provided — verify with `make db-migrate-dev`).
- **Admin UI:** the Team page Manage dialog (role, home hub, hourly rate, reset PIN, log‑out‑all‑devices), a home‑hub column, and an Account Activity dialog.
- **Known follow‑up:** `mustChangePin` is set and returned at login, but the operator‑facing "change your PIN now" screen is not yet built.

**CI hardening.** `ci.yml` gained a `test` job: a `postgres:16` service on `:5433`, `prisma generate` + `db push`, then `npm test`. The vitest suite now gates every PR (it previously ran only locally).

**Forward‑ported API gaps (`032d1f7`).** Four endpoints recovered from superseded sprint branches: `GET/PATCH /api/deployments/[id]`; `GET/POST/DELETE /api/deployments/[id]/operators` (secondary operators — **closes Punch #8**); `POST /api/inventory/[id]/review-inoperable` (admin RETIRE/REPAIR on an INOPERABLE unit); and **`POST /api/uploads`** (Supabase Storage, 10 MB, images only, via a new `src/lib/supabase/admin.ts` service‑role client) — the first concrete step toward the photo pipeline (§11.10).

**Documentation.** Folded the v2.1 Addendum (maintenance states, account management, Kit/Rig/Deployment, Deployment Requests) into this PRD; archived ~20 superseded docs to `docs/archive/`; consolidated all doc work onto a single `docs/` branch.

### 3.3 Branch & integration state (RECONCILED)

The session's many branches have now been **reconciled into a single integration branch: `staging/20260618-reconciled`**, which contains everything:
- Wave 1 (PR #18) + **Wave 1.5** (PR #19) + docs/archive (PR #20) + **Wave 2A** security (PR #23) + **Wave 2A.5** account management + the **four forward‑ported API gaps** + the **CI test‑gating** change + the canonical **v2.2 docs** (this PRD, the §F addendum, the assessment).
- The reconciliation merge was **clean** — the two work lines were almost entirely disjoint (the only overlapping code file, `README.md`, auto‑merged). A **security‑regression check confirmed no regression**: the Wave‑2A validated `vehicles/maintenance/inventory [id]` PATCH routes, escaped email templates, session revocation, and the last‑admin guardrail are all present; the forward‑ported endpoints are in; the dead `[action]` route stayed removed; the schema carries both `AccountAuditLog` and the `linux-musl` binary target. `eslint` is clean.
- **Remaining for the maintainer:** run `make db-migrate-dev` + a full `make verify` (the type‑check needs a freshly generated Prisma client — the build sandbox can't regenerate it; **CI is the validation source of truth**), then push `staging/20260618-reconciled`, let CI gate it, and **retire the superseded `staging/20260618-post-merge` and `staging/20260618-wave2a` branches**.

### 3.4 Session‑3 changelog — assessment, SEC‑1, DAT‑1, Wave 2A′, Wave 2B‑A, DAT‑5, DAT‑7

A third build session opened with a **fresh independent assessment** (`AHITS_Comprehensive_Assessment_2026-06-18.md`) and then executed the assessment's Wave 2 plan in full. Everything was `tsc`/ESLint‑clean; the migration‑bearing work was applied to the dev DB, the client regenerated, `make verify` run green, and `prisma migrate status` confirmed in sync (11 migrations total). Shipped as a **stack of PRs** off `main` (branches under `feature/20260618/maxwellslater-*`): `sec1-consumables` → `wave2b-correctness` → `dat5-maintenance-lifecycle` (**PR #31**) → `dat7-schema-hardening` (**PR #32**). The full record — files, commits, verification, caveats — is in `WAVE2_COMPLETE.md`.

**Independent assessment (no code).** A code‑and‑staging re‑review confirmed the foundation is sound and reframed remaining work as consolidation. It superseded the earlier independent assessment, systematized the API‑consistency drift, and — importantly — **found one new Critical** (the `vehicles/[id]` credential leak, below). It also re‑confirmed the `proxy.ts` "dead middleware" claim is a **false positive** (Next 16's first‑class `proxy` convention; verified against `node_modules`), so that must not be "fixed."

**SEC‑1 — Critical credential leak (hotfix).** `GET /api/vehicles/[id]` used `include: { dailyChecks: { include: { operator: true } } }`, serializing full `User` rows — incl. bcrypt `pinHash`, email, `hourlyRate` — to any authenticated operator. With 6‑digit PINs, a leaked hash is trivially brute‑forced → account/admin takeover. Scoped to `operator: { select: { id, name } }` (the only `operator: true` in the codebase). *No migration.*

**DAT‑1 — consumable inventory model rebuild.** Consumables were declared "pure counts" but implemented as anonymous serialized units, so they failed checkout ("Only 0 units available"), `InventoryItem.quantity` was never mutated, and the kit‑add UI filtered them out — there was **no working path to put a consumable in a kit**. Rebuilt onto the product‑owner‑chosen model: **`quantity` = total owned, mutated only on permanent loss; availability = `quantity − Σ(open consumable reservations)`, derived on read; consumables never touch `InventoryUnit` rows.** New `src/lib/consumables.ts` centralizes the reserved‑sum, a **row‑locked availability guard** (`SELECT … FOR UPDATE`), and the guarded consume; a new **`RETURN` vs `CONSUME`** mode on per‑item return distinguishes "back to the shelf" from "used in the field." Applied across build‑kit, add‑items, return, end‑deployment, transfer‑decline, and both UI builders. New `tests/consumable-model.test.ts` covers the lifecycle. *No migration.*

**Wave 2A′ — finish security hardening.** (a) **SEC‑2:** operators no longer receive vehicle VIN/plate/insurance/registration/notes (role‑aware `select` + field‑strip). (b) **SEC‑3:** uploads validated by **magic bytes** (new `src/lib/image-validation.ts`), **SVG blocked**, sniffed Content‑Type stored, per‑user **rate limit** (private bucket + signed URLs deferred to Wave 2C). (c) **SEC‑4:** enforced **HSTS / nosniff / X‑Frame‑Options DENY / Referrer‑Policy / Permissions‑Policy**, plus a **Report‑Only CSP** tuned for Emotion/MUI/Serwist/Supabase with an `/api/csp-report` sink. (d) **SEC‑5:** removed `serverActions.allowedOrigins: ['*']` (no Server Actions exist); cookie stays `sameSite: 'lax'`. (e) **UX‑5:** `useAuth` treats 401 as logged‑out and redirects to `/login`. *No migration.* *Follow‑up: flip CSP to enforcing after observing `/api/csp-report` on staging.*

**Wave 2B‑A — no‑migration correctness cluster.** (a) **OFF‑3:** start‑deploy and transfer create/accept/decline/cancel now route through the durable offline `mutate()` queue (no more hard‑fail/data‑loss on a flaky connection); `POST /api/deployments` and `DELETE /api/transfers/[id]` wrapped in `withIdempotency` so a queued replay applies once. (b) **DAT‑2:** inventory/vehicle DELETE → **soft‑delete** (`deletedAt` / `status RETIRED`) with an "in active deployment" guard, replacing hard‑deletes that threw RESTRICT‑FK 500s. (c) **DAT‑3:** transfer accept/decline/cancel flip status via conditional `updateMany(where status PENDING)` (compare‑and‑set). *No migration. Caveat: OFF‑3 needs a real‑device offline pass — see §4.*

**DAT‑5 — maintenance lifecycle (migration `20260618190000_maintenance_lifecycle`, additive).** New `src/lib/maintenance.createDamageReport()` is the single damage path; the quick per‑item return now spawns a task + alert like the rich path. `MaintenanceTask` gains `inventoryUnitId` (FK), `resolutionPath` (enum IN_FIELD/HUB/SHOP, derived from `RepairType`), and `locationNote`; **completing a task** (`PATCH /api/maintenance/[id]`) returns the linked `IN_MAINTENANCE` unit to `AVAILABLE` (and auto‑stamps `completedAt`). Closes the Addendum §A breakdown/resolution‑path gap at the model + API level; the admin Maintenance **page** to drive it is Wave 3.

**DAT‑7 — schema hardening (migration `20260618200000_dat7_schema_hardening`).** Pre‑flight data checks confirmed clean data, then: **`itemType` String→enum `ItemType`** (DB enforces SERIALIZED/CONSUMABLE); **`@@unique([inventoryItemId, serialNumber])`** on `InventoryUnit` (NULLs distinct); and **atomic alert dedup** via a nullable‑unique **`Alert.activeKey`** (`${type}:${sourceTable}:${sourceId}` while unresolved, NULL once resolved) — enforcing "one unresolved alert per source" and replacing the race‑prone findFirst‑then‑create in `createAlert`. The migration backfills existing unresolved alerts.

**Net effect on the security‑outstanding list (§16):** SEC‑1, vehicle‑PII, upload hardening, security‑headers/CSP, CSRF, and the session‑expiry UX are now **resolved**; the alert‑dedup and the consumable/maintenance correctness items are resolved. Remaining security items are the **private photo bucket + signed URLs** (Wave 2C) and the **shared‑store rate limiting + XFF parsing** (Wave 3), plus the **CSP enforce‑flip**.

---

## 4. QA verification results — proven working on staging

Driven hands‑on through the live app as **Field Op 1 and Field Op 2** (and via direct API/IndexedDB inspection). Everything below is confirmed working:

- **Daily check:** pass; fail + required summary + admin email; fail‑validation; **offline submit → durable queue (with idempotency key) → auto‑sync on reconnect and on app reload → exactly one DB record (no duplicate).**
- **Kit:** Build Kit + Launch deployment; Add Items (serialized, with unit picker); Log Daily Usage (consumable qty); per‑item Return; bulk Remove Items; **damage disposition** (Inoperable → unit `IN_MAINTENANCE` + maintenance task `"Damage repair: …"` created).
- **Transfer (two operators):** create → **accept** (item moves, unit status correct) → and **decline** (item correctly stays with the sender; unit status verified consistent via API). The duplicate `accept`/`decline`/`[action]` handler concern **did not manifest** — the safe static handlers run.
- **Consumable transfer:** create + accept; **Field Op 1 received the correct quantity (10)** — verified in `/api/deployments`.
- **End Deployment:** rich per‑item disposition flow; all items returned to hub.
- **Scan QR routing (Wave 1):** vehicle → Start Daily Check **with the vehicle pre‑selected**; available unit → Add to Kit; checked‑out unit → Return to Hub; unregistered code → clear error.

**⏸ Open verifications (do on the admin/staging walkthrough):**
- **(Session 3, DAT‑1)** Confirm a consumable can be **added to a kit through the UI** end‑to‑end (the unit suite proves the API; the picker is the last mile) and that owned `quantity` derives availability correctly (checkout reserves, return releases, log‑usage decrements).
- **(Session 3, DAT‑5)** Confirm the quick **"Needs maintenance" per‑item return now raises a `DAMAGE_REPORTED` alert** and opens a unit‑linked task, and that **completing a maintenance task returns its unit to `AVAILABLE`**.
- **(Session 3, SEC‑4)** Watch `/api/csp-report` on staging for genuine CSP violations before flipping the policy to enforcing.

**🧪 Test gaps (need a real device / dedicated harness, not blockers):**
- **OFF‑3 real‑device offline pass (highest value):** submit each converted write (start‑deploy, transfer create/accept/decline/cancel) **offline** on a phone, reconnect, and confirm a **single clean sync, no duplicates** — neither static analysis nor the unit suite can prove this runtime path.
- Service‑worker **cold‑offline launch**; **terminal‑failure "needs attention"** queue path; **conflict resolution** (two devices, same unit, offline).
- **auth tests** remain at **zero** (PIN lockout, session expiry/revocation, invite flow are the most security‑critical untested code) — Wave 3 starts here. *(The consumable model and the maintenance‑return path now have integration coverage; broaden from there.)*

---

## 5. Operator defect punch list — ranked & slotted

Every item traces to `AHITS_QA_STAGING_ISSUES.md`. **Slot** = where it should be fixed. Severity: 🔴 High · 🟡 Med · ⚪ Polish.

| # | Sev | Defect | Root cause | Fix | Slot |
|---|-----|--------|------------|-----|------|
| 1 | ✅ | **Operator vehicle remove fails** ("Request failed", 400) — **FIXED (`0d5591c`)** | `DELETE /api/deployments/[id]/vehicles` expected `{vehicles:[{vehicleId,dispositionType}],note}`; UI sent `{vehicleIds,…}` | UI now sends `vehicles:[{vehicleId,dispositionType:'AVAILABLE'}]` | ~~Wave 2~~ **Done** |
| 2 | ✅ | **Consumable‑transfer banner shows wrong qty** (×83 not ×10) — **FIXED (Wave 1.5)** | Banner read source `kitItem.quantity`, not the transfer line's qty | Banners render `ti.quantity ?? ti.kitItem.quantity` | ~~Wave 2~~ **Done** |
| 3 | ✅ | **Consumables can't be added to a kit via UI** — **FIXED (Session 3, DAT‑1)** | Add‑Items/Build‑Kit filtered on `unitCounts.available > 0`; consumables have no unit rows → excluded. Whole consumable model was broken (couldn't check out at all). | Rebuilt onto total‑owned / derived‑availability; pickers gate on `availableQuantity`; full lifecycle (reserve/return/consume) correct | ~~Wave 2~~ **Done** |
| 4 | ✅ | **Pending‑transfer "Waiting…/Cancel" banner leaks to recipient** — **FIXED (Wave 1.5)** | UI passed `?direction=incoming/outgoing` but `GET /api/transfers` **ignored** the param, so both banners got identical data | API now filters by `direction` relative to the current user | ~~Wave 2~~ **Done** |
| 5 | ✅ | **UI doesn't auto‑refresh** after mutations — **FIXED (`0d5591c`)** | Handlers didn't re‑run `load()` on success | `await load()` after every operator mutation | ~~Wave 2~~ **Done** |
| 6 | ✅ | **"Needs maintenance" quick return creates no task/alert** — **FIXED (Session 3, DAT‑5)** | Per‑item `kitItem` DELETE only flipped status; no task/`createAlert` | Unified all damage paths behind `lib/maintenance.createDamageReport` — the quick return now opens a unit‑linked task + one `DAMAGE_REPORTED` alert | ~~Wave 2~~ **Done** |
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

**✅ Fixed in the prior cycle (closed):** kit‑builder crash (React #31), empty unit pickers (`availableUnits`), operator transfer roster (`/api/operators`). See §3.

**✅ Fixed in Session 3 (closed):** #3 consumables‑in‑kit (DAT‑1), #6 silent needs‑maintenance return (DAT‑5). Remaining open punch items are UI‑polish (#9 consumable chip, #10 pending badge, #11 hydration dates, #12 empty‑state, #13 stable ordering, #14 Pass review, #15 per‑item note) — fold into **Wave 2D UI unification** — plus #7 photos (**Wave 2C**), #8 secondary‑operator UI and #16 expanded/per‑type checklists (**Wave 3 / Phase 2‑3**). See §3.4.

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
- **Session:** persistent on trusted devices; expires after 30 days idle or explicit logout. *(v2.2: sessions are now **revocable** — `getSession` re‑checks `isActive` + `tokenVersion` per request, so suspend/force‑logout/demote are immediate (Wave 2A.5). The current TTL is 24h; the full **trusted‑device / per‑device** model and the 30‑day idle policy are still Wave 3.)*
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

**Build status:** 🟢 **the breakdown/repair lifecycle is built (Session 3, DAT‑5).** A single unified damage path (`lib/maintenance.createDamageReport`) now backs *every* return/disposition that flags damage — including the quick per‑item "Needs maintenance" return, which previously flipped the unit silently with no task or alert (Punch #6 closed). The `MaintenanceTask` is **linked to the specific unit** (`inventoryUnitId`), carries a **`resolutionPath`** (IN_FIELD/HUB/SHOP, derived from `RepairType`) and a free‑text **`locationNote`**, and **completing the task returns that exact unit to `AVAILABLE`** (`PATCH /api/maintenance/[id]`, conditional on `IN_MAINTENANCE`). Still **not built (Wave 3):** the mark‑complete **recurrence** loop (auto‑create the next scheduled task) and the **mileage trigger**; and the admin **Maintenance page** UI to drive this lifecycle (the backend + API now exist for it). Hub/shop return‑destination selection on close and the in‑field lightweight‑repair record are partially expressed via the disposition options + `resolutionPath`/`locationNote`; finish in the Wave 3 Maintenance page.

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

**Build status:** 🟡 daily‑check‑fail email is wired and `DAMAGE_REPORTED` alert rows are created — and, as of Session 3 (DAT‑7), **de‑duplicated atomically** (the `Alert.activeKey` nullable‑unique constraint enforces one unresolved alert per source, replacing the race‑prone findFirst‑then‑create; the key is cleared on resolve). DAT‑5 also made the alert stream cleaner (unit‑linked, single‑path). **Still Wave 3 — the notification dispatcher:** the other five alert types, **push**, **scheduled triggers** (overdue/not‑returned/expiry on a cron, not lazily on a GET), the **in‑app notification center**, per‑admin/per‑type routing, and — the biggest product gap — **external‑recipient delivery** (the maintenance‑shop work order; the Phase‑3 invoice→processor loop). Design it as **one escaped channel** that serves admin push/email *and* external email. Resend is already a dependency.

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

**Build status:** 🟡 **partial (v2.3).** The `POST /api/uploads` Supabase Storage endpoint is now **hardened (Session 3, SEC‑3):** uploads are validated by **magic bytes** (real JPEG/PNG/WebP/GIF/HEIC only), **SVG is blocked** (script vector), the sniffed type is stored as the Content‑Type, and a **per‑user rate limit** caps abuse. Still missing (**Wave 2C**): **in‑app camera capture, 1200px/JPEG‑85 compression, offline blob queueing** (the JSON queue can't carry Blobs — needs a separate blob store), the **private bucket + signed‑download URLs** (deliberately deferred from SEC‑3 since capture isn't built yet), **damage‑photo‑required enforcement**, and **`Photo.url` validation** to the storage origin. Finish in **Wave 2C** (Punch #7).

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
| InventoryItem | name, category, **itemType (enum SERIALIZED/CONSUMABLE — DB‑enforced, DAT‑7)**, SKU, qty, cost, status, location, QR code ID | Many check‑out logs; many photos; many units. **Consumables (DAT‑1): `quantity` = total owned; availability = `quantity − Σ(open consumable reservations)`, derived; mutated only on consumption/write‑off.** |
| InventoryUnit | itemId, status, **serialNumber (unique within item, DAT‑7)**, QR code ID | One item (serialized count source of truth); many maintenance tasks (DAT‑5) |
| Vehicle | name, type, VIN, plate, odometer, status, location | Many daily checks; many maintenance tasks; many photos |
| CheckOutLog | timestamp, action (in/out), item, operator, project, location, condition, photos | One item; one user; one project |
| DailyVehicleCheck | date, vehicle, operator, site, odometer, checklist responses, issues, photos, pass/fail, (future: gpsLat/gpsLng/gpsAccuracy) | One vehicle; one user |
| MaintenanceTask | asset, task, interval, priority, last done, next due, status, cost, **inventoryUnitId (FK), resolutionPath (IN_FIELD/HUB/SHOP), locationNote (DAT‑5)** | One vehicle or item; **one unit (DAT‑5 — completing the task returns that unit to AVAILABLE)**; many history records |
| Project | name, type, location, start/end, status, lead, equipment list | Many users; many inventory items |
| Alert | type, trigger time, target (admin), resolved, **activeKey (nullable‑unique dedup — one unresolved alert per source; cleared on resolve, DAT‑7)**, link to triggering record | One admin user; one source record |
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

> **Status update (v2.3):** Waves **0, 1, 1.5, 2A, 2A.5** are ✅ **done**. **Session 3** then shipped, as stacked PRs (§3.4): **SEC‑1** (Critical hotfix), **DAT‑1** (the consumable accounting rebuild — item 2 below), **Wave 2A′** (the security carryovers — item 8, plus vehicle‑PII/uploads/headers‑CSP/CSRF/session‑UX), **Wave 2B‑A** (offline‑safe writes, soft‑deletes, **atomic transfer handlers** — item 3), and **DAT‑5** (the breakdown/resolution‑path lifecycle — item 2b) and **DAT‑7** (schema hardening). **Remaining of Wave 2:** **2C photos** (item 7), **2D UI unification** (item 6), and the **2a Deployment‑model M2M/assignment refactor** (sequenced with Wave 3). The scheduled maintenance loop + mileage trigger (item 5) moves to Wave 3 with notifications. The list below is annotated accordingly.

**Wave 0 — ✅ done.** Single source of truth for inventory; restored unit/QR sub‑system; corrected dashboard "checked out"; removed dead/mislabeled controls; success messages only on real success; login rate‑limit + admin lockout; automated linting.

**Wave 1 — ✅ done & verified.** Durable offline queue + honest indicators + idempotent sync (on reconnect and on mount); QR association‑on‑create + context‑aware scan routing. *(Caveat: SW cold‑launch + conflict paths await a real‑device pass.)*

**Wave 1.5 — ✅ done (merged, PR #19).** Transfer banner qty (#2), direction‑filter banner leak (#4), dead `[action]` handler removed + guard test (C2), odometer units (O7).

**Wave 2A — ✅ done (merged, PR #23).** Security hardening: S1 invite tokens, S2 mass‑assignment validation, S5 cost gating, S7 email escaping, S4 seed, C1 transfer idempotency.

**Wave 2A.5 — ✅ built (pending merge).** Account management: revocable sessions, lifecycle/roles/defaults with last‑admin guardrail, invite revoke/resend/bulk, audit log, admin UI.

**Wave 2B — Correctness & consolidation (CURRENT next block).** Fold the §5 punch list into the Wave‑2 scope. *(Items 1 and 4 below are ✅ done in Wave 1.5/2A.)*
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

**Gaps in the codebase (beyond the punch list) — with v2.2 status:**
- ✅ **Sessions can't be revoked** — **FIXED (Wave 2A.5):** `getSession` re‑checks `isActive` + `tokenVersion` and returns fresh role; suspend/force‑logout/demote are immediate. (Full trusted‑device/per‑device model still deferred to Wave 3.)
- ✅ **Invite tokens use `cuid()` not a CSPRNG** — **FIXED (Wave 2A, S1):** CSPRNG tokens + throttling + TOCTOU fix.
- 🟡 **Photos not wired to Supabase Storage** — **PARTIAL:** `POST /api/uploads` now **hardened (Session 3, SEC‑3)** — magic‑byte validation, SVG blocked, per‑user rate limit. Still missing: in‑app capture, compression, offline blob queue, **private bucket + signed URLs**, and `Photo.url` validation. (Wave 2C.)
- ✅ **Operators can read cost/spend fields** — **FIXED (Wave 2A, S5).** Plus **vehicle VIN/plate/insurance PII** now withheld from operators (Session 3, SEC‑2).
- ✅ **Mass‑assignment PATCH routes** — **FIXED (Wave 2A, S2)** for vehicles/maintenance/inventory.
- ✅ **Consumable model broken** — **FIXED (Session 3, DAT‑1):** total‑owned / derived‑availability; consumables now addable to kits and correctly accounted (no double‑count, no phantom units).
- ✅ **`vehicles/[id]` leaked `pinHash`/PII** — **FIXED (Session 3, SEC‑1).**
- ✅ **Two divergent "needs maintenance" paths / units stranded in maintenance** — **FIXED (Session 3, DAT‑5):** one unified, unit‑linked damage path; repair completion returns the unit to service.
- ✅ **Hard deletes threw RESTRICT‑FK 500s; non‑atomic transfer flips; offline‑bypass writes lost data** — **FIXED (Session 3, Wave 2B‑A):** soft‑deletes + in‑use guards (DAT‑2), atomic compare‑and‑set (DAT‑3), queue‑routed writes (OFF‑3).
- ✅ **`itemType` free string; no serial uniqueness; duplicate unresolved alerts** — **FIXED (Session 3, DAT‑7):** DB enum, `@@unique` serials, atomic `activeKey` alert dedup.
- ✅ **No security headers / CSP; `serverActions` CSRF footgun; invisible session expiry** — **FIXED (Session 3, SEC‑4/5, UX‑5).** *(CSP is Report‑Only — flip to enforcing after observing `/api/csp-report` on staging.)*
- 🟢 **Maintenance lifecycle** — **built (Session 3, DAT‑5)**; the scheduled complete‑loop + mileage trigger and the admin Maintenance **page** remain Wave 3.
- 🟡 **Admin dashboard feeds/tables + four stub pages** — still not built (Wave 3).
- 🟡 **Zero auth tests** — the isolated test DB + **CI test gating** are in place; the consumable model + maintenance‑return path now have integration coverage; auth‑specific tests still to be written (Wave 3, test expansion).
- 🟡 **In‑memory rate limiting + spoofable `X-Forwarded-For` parsing** — login/invite/upload throttles are per‑instance and read the wrong XFF end; move to a shared store + fix XFF (Wave 3, SEC‑6).

**Gaps in the workflow / process (updated through Session 3):**
- **Docker build doesn't run migrations.** The `CLAUDE.md` flow leans on a manual `make db-migrate` per PR — a schema‑drift footgun, and the most important remaining workflow fix. Session 3 added two migrations (`maintenance_lifecycle`, `dat7_schema_hardening`) and confirmed `migrate status` in sync each time, but production still depends on a human running the migrate step. **Move `prisma migrate deploy` into the container entrypoint or a gated CI step before any further migration‑bearing work ships.**
- **No `/api/health` + Cloud Run startup probe** — external QA can't cleanly verify a deploy without logging in (the auth proxy redirects everything).
- **CI branch‑name gating** — confirm prod PRs actually run lint/type‑check + the vitest suite; branch names have drifted historically.
- **`tsc` + ESLint is not a sufficient gate on its own.** Session 3 confirmed the lesson twice: two existing tests (`consumable-return-scoping`, the `ItemType` fixtures) only failed when `make verify` actually ran them against a database — because the authoring environment had no DB. **`make verify` (which runs the Postgres‑backed vitest suite) is the real definition‑of‑done**, and it must stay the CI merge gate. The DB‑backed suite catches contract drift that types can't.
- **Migration discipline (new, from Session 3).** For any schema change: (1) **pre‑check the data** for any uniqueness/enum/NOT‑NULL constraint (a quick read‑only `SELECT … HAVING COUNT(*)>1` / `DISTINCT` — DAT‑7 would have failed the migration on dup serials otherwise); (2) order is **schema → migrate/generate → `make verify` → commit** (the client must regenerate before the typecheck can pass); (3) after a **hand‑written** migration (needed when Prisma can't express a partial index or a data backfill, as in DAT‑5/DAT‑7), always run **`prisma migrate status`** to confirm it's recorded and in sync, or `migrate deploy` in CI/prod can try to re‑run it; (4) **one migration per PR**, never bundled with unrelated code.
- **Stacked, single‑concern PRs work well** — Session 3 shipped as a clean stack (security/consumables → correctness → DAT‑5 → DAT‑7), each retargeting as its base merged. Keep this; it kept reviews legible and let staging validate increments.
- **Real‑device offline testing** still isn't in the loop — and Session 3's OFF‑3 (routing all operator writes through the queue) **raises the stakes**: the SW cold‑launch, the converted writes, and conflict paths can only be confirmed on a phone in airplane mode. Make a real‑device pass a release‑gate checklist item before any field pilot.
- **Track the CSP enforce‑flip.** The Report‑Only CSP provides no protection until enforced; it's a one‑line change behind a short observation window — keep it on the board so it doesn't linger.

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

- ✅ **`idempotency_key`** (raw‑SQL/Prisma model) — dedup store for offline replay.
- ✅ **`ItemType` enum** + **`InventoryUnit @@unique([inventoryItemId, serialNumber])`** (Session 3, DAT‑7).
- ✅ **`MaintenanceTask.inventoryUnitId` (FK) + `resolutionPath` + `locationNote`**, `ResolutionPath` enum (Session 3, DAT‑5).
- ✅ **`Alert.activeKey` nullable‑unique** (Session 3, DAT‑7) — replaces the earlier proposed `(type, sourceTable, sourceId, resolved)` constraint; enforces one unresolved alert per source atomically, cleared on resolve. *(This supersedes the v2.2 proposal below.)*
- **`DailyCheck.gpsLat/gpsLng/gpsAccuracy`** (Phase 3 map) — GPS currently lives on `Photo`.
- **Trusted‑device / session model** (Wave 3) — for the "3 trusted devices", 30‑day idle, and revocation.
- **Phase‑3 module** (§11.12): `TaskType`, `OperatorRate`, `TimeEntry`, `Expense`, `Invoice`, `InvoiceLineItem`, `Availability`; `User.hourlyRate`; `Settings.milesReimbursementRate`.

---

## 19. Exit criteria by wave (scorecard)

- **Wave 0 — ✅ done.** Inventory truth, login hardening, dead‑control fixes.
- **Wave 1 — ✅ done & verified.** Offline durable queue + honest indicators + idempotent sync; QR association‑on‑create + context‑aware scan routing. *(Caveat: SW cold‑launch + conflict paths await a real‑device pass.)*
- **Wave 2 — mostly done (Session 3).** ✅ Punch‑list blockers fixed; ✅ consumables addable & correctly accounted (DAT‑1); ✅ one transfer handler each + atomic flips (DAT‑3); ✅ all edit endpoints validated; ✅ the breakdown/maintenance **lifecycle** works (DAT‑5); ✅ security hardening complete (Wave 2A′); ✅ offline‑safe writes + soft‑deletes (Wave 2B‑A). **Remaining for Wave 2 exit:** **2C** photos captured & stored privately; **2D** UI unification (one contract/vocabulary/primitives, post‑mutation refresh polish); and the **Deployment‑model M2M/assignment** refactor. The *scheduled* maintenance loop + mileage trigger moved to Wave 3.
- **Wave 3 — not started.** The **notification dispatcher** (all six alert types + push + scheduled triggers + notification center + shop/invoice external outputs), admin completeness (four stub pages incl. the Maintenance UI), the scheduled maintenance loop + mileage trigger, deploy hardening (migrations in deploy path; `/api/health`; CSP enforce‑flip; shared‑store rate limiting), sessions/devices, test expansion (auth first), and Deployment Requests.
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

**Immediate next actions (recommended order, v2.2):** (1) **Reconcile the branch/integration state** — merge Wave 2A.5 + the forward‑ported gaps + the docs branch, and collapse the two staging branches into one integration line (§21). (2) **Confirm no security regressions from the forward‑port** — the forward‑port baseline carries an older *unvalidated* `inventory/[id]`/`vehicles/[id]`/`maintenance/[id]` PATCH; ensure the Wave‑2A (S2) validated versions are what survive the merge. (3) **Begin Wave 2B** with the Deployment model (Addendum §C) → consumable accounting (#3) → the breakdown/resolution‑path state machine (Addendum §A / #6). (4) Run `make db-migrate-dev` to finalize the Wave 2A.5 migration; build the `mustChangePin` operator screen. (5) Schedule a real‑device offline pass before any field pilot.

---

## 21. Workflow recommendations (from the v2.2 build session; extended through Session 3 in §21.7)

This session moved fast across many branches with two builders (an in‑session agent and the maintainer's local machine) committing to the same repo. That produced real velocity but also avoidable friction. These recommendations are concrete and grounded in what happened.

**21.1 Branch & integration strategy — the top priority.**
The session ended with **two parallel staging branches** (`staging/20260618-post-merge` *without* Wave 2A, `staging/20260618-wave2a` *with* it) plus several unmerged feature branches (Wave 2A.5, the `docs/` branch holding the §F/§11.13 spec, and the forward‑ported gaps). This is the single biggest source of risk right now. Recommended:
- **Pick one integration branch** (e.g., `development` → deploys to staging; `main`/`production` → prod) and retire the duplicate staging branch by fast‑forwarding/merging so nothing is stranded.
- **Short‑lived feature branches** off the integration branch; **squash‑merge** and **delete after merge**. Avoid long stacks of branches‑on‑branches (this session had 4‑deep stacks that were painful to reason about).
- **One concern per PR.** Keep code, docs, and migrations in coherent PRs (this session initially mixed docs into the Wave 1.5 code branch, then had to consolidate onto a `docs/` branch — avoidable).
- **Protect the integration branch:** require green CI + one review before merge.

**21.2 Migrations discipline.**
- The Docker build **does not run migrations** (already flagged in §16) — this remains a schema‑drift footgun. Move `prisma migrate deploy` into the container entrypoint or a gated CI/deploy step so the DB schema can never lag the deployed code.
- **Generate migrations with `prisma migrate dev`, never hand‑edit.** Wave 2A.5 shipped with a hand‑authored migration (because the build sandbox couldn't run Prisma) — it must be verified with `make db-migrate-dev` before deploy; if Prisma reports drift, use its canonical SQL.
- **Commit the migration in the same PR as the schema change**, per `CLAUDE.md`.
- Add a **CI drift check** (`prisma migrate diff` between schema and migrations) so a schema edit without a migration fails the PR.

**21.3 CI hardening (partly done this session).**
- ✅ The vitest suite now runs on every PR (Postgres service container). Keep it.
- **Add `next build` to CI** — type‑check + lint don't catch build‑only failures (e.g., server/client boundary, `useSearchParams` Suspense issues — one of which was hotfixed this session).
- **Confirm CI trigger branches match reality.** `ci.yml` triggers on `pull_request: [production, develop]`, but the repo also uses `development`, `staging/*`, and `main`. This **branch‑name drift** means some PRs may not be gated — align the names.
- Add the **drift check** (21.2) and consider a coverage floor once tests are expanded.

**21.4 Local pre‑PR verification.**
Adopt a single `make verify` target = `db-generate && type-check && lint && test`, run before every PR. Two lessons:
- **`prisma generate` must precede `type-check`.** Schema‑dependent type errors (new models/fields) are invisible to `tsc` until the client is regenerated — this bit the session (the sandbox couldn't regenerate the client, so the new account‑management types could only be validated in CI).
- **Treat CI as the source of truth** for schema/test‑dependent changes when local/sandbox tooling can't run Prisma engines or the DB.

**21.5 Concurrent‑work coordination.**
Two builders editing the **same repo folder** concurrently caused branch‑switch surprises (working‑tree files reverting under the other party's `git checkout`). Recommended:
- **Use the branch as the ownership boundary** — agree who owns which branch for a given task; don't edit the same files on the same branch simultaneously.
- **Communicate merges/branch switches** so the other party isn't surprised by a working‑tree change.
- Prefer **read‑only inspection** (`git show`, `git log`) over checkouts when you only need to read another branch's content.

**21.6 Deploy & observability.**
- Add **`/api/health`** + a Cloud Run startup probe so deploys can be smoke‑verified without logging in (the auth proxy currently redirects everything).
- Keep a **deploy marker commit** convention (the session used `chore: staging deploy marker …`) — useful, but pair it with the health endpoint for real verification.
- Watch the **session‑revocation DB read** (Wave 2A.5) in Cloud Run latency dashboards; cache if needed (§22).

**21.7 Session‑3 workflow learnings (what worked, what to codify).** Session 3 ran clean — four stacked, single‑concern PRs, two in‑sync migrations, no orphaned working tree — and confirmed a handful of practices that should become standing policy:
- **`make verify` is the definition‑of‑done, not `tsc` + ESLint.** Two existing tests failed only when the DB‑backed suite actually executed them (the consumable‑return‑scoping test and the `ItemType` fixtures), because the authoring environment had no database. Run `make verify` (db‑generate + typecheck + lint + Postgres vitest) before every PR; keep it the CI merge gate. Types are necessary but not sufficient — the suite catches contract drift types can't.
- **Migration‑bearing work has a fixed order: pre‑check data → schema → migrate/generate → `make verify` → commit.** The client must regenerate before the typecheck can pass, so a schema change can't be verified until the migration is applied. Codify this in `CLAUDE.md`'s deploy section.
- **Pre‑check data before any uniqueness/enum/NOT‑NULL constraint.** DAT‑7's serial‑uniqueness and itemType‑enum migrations would have failed against dirty data; three read‑only `SELECT … HAVING COUNT(*)>1` / `DISTINCT` checks confirmed they were safe. Keep a `scripts/` helper for this and make it a standard pre‑flight.
- **After a hand‑written migration, always `prisma migrate status`.** When Prisma can't express a change in the schema (a partial index, or a data backfill — both needed in DAT‑5/DAT‑7), the migration is hand‑authored; confirm it's recorded in `_prisma_migrations` and the DB is "in sync," or `migrate deploy` can try to re‑run it in CI/prod. (Both Session‑3 migrations were confirmed in sync.)
- **Stacked, single‑concern PRs are the right shape.** Security/consumables → correctness → DAT‑5 → DAT‑7, each retargeting as its base merges, kept reviews legible and let staging validate increments. One migration per PR; never bundle a data migration with unrelated code.
- **Schedule the deferred one‑liners.** The **CSP Report‑Only → enforce** flip and the **`mustChangePin` operator screen** are small, security‑relevant follow‑ups that will linger unless tracked on the board.

---

## 22. Forward recommendations & concerns

Ranked roughly by urgency. The rest is product/engineering sequencing.

**22.0 Session‑3 status & the new critical path.** Session 3 completed the assessment's Wave 2 plan (§3.4): the consumable accounting, the security‑hardening tail, the correctness cluster, the maintenance/breakdown lifecycle, and schema hardening are all done. Several items below are now partly or fully addressed — annotated inline. **The single highest‑leverage next investment is the notification dispatcher (22.10):** everything *inbound* (operator capture, inventory truth, the now‑clean maintenance event stream) is solid, but the system still mostly *holds* information rather than *delivering* it — nothing reaches external recipients (shops, hubs). After that, **Wave 2C photos** (22.4) is the next hidden dependency, then **Wave 2D consistency unification** (new — see 22.11). And before any field pilot, do the **real‑device offline pass** (22.8), whose stakes rose now that all operator writes route through the queue (OFF‑3).

**22.1 ✅ DONE — Branches reconciled.** All work lines were integrated into **`staging/20260618-reconciled`** (see §3.3). The maintainer still needs to `make verify` + push + let CI gate it, and retire the two superseded staging branches — but the divergence risk is resolved.

**22.2 ✅ VERIFIED — No security regression from the forward‑port.** The reconciliation merge was three‑way (common ancestor `3c7516c`), so the Wave‑2A (S2) validated PATCH routes — which only the Wave‑2A line modified — won automatically over the forward‑port baseline's untouched originals. Confirmed by direct check: `vehicles/maintenance/inventory [id]` PATCH all carry their zod whitelists, emails are escaped, and cost gating is intact. **General rule retained for future forward‑ports:** always merge three‑way (or diff against the latest hardened code) rather than cherry‑pick‑overwriting, so hardening can't be silently reverted.

**22.3 Wave 2B — mostly done (Session 3); the model refactor remains.** ✅ Consumable accounting (DAT‑1) and ✅ the breakdown/resolution‑path lifecycle (DAT‑5) shipped, plus the correctness cluster (DAT‑2/3, OFF‑3). **Still open:** the Kit ⊂ Rig ⊂ Deployment **model refactor** (Addendum §C: `Deployment↔Project` M2M, a `DeploymentAssignment` operator‑handoff history folding in `RigOperator`) and the **UI vocabulary rename** ("My Rig"→"My Deployment"). These remain a prerequisite for **Deployment Requests** (§F, Wave 3), so sequence the model refactor early in the Wave 3 run (or as a small Wave 2D.5). It is no longer blocking consumables or maintenance, which are done.

**22.4 Finish the photo pipeline.** The `POST /api/uploads` endpoint is the foundation; now build **in‑app capture → 1200px/JPEG‑85 compression → offline blob queue → signed‑download URLs → damage‑photo‑required enforcement**, and **validate `Photo.url`** (currently a free string — stored‑XSS/SSRF surface). Until then, damage documentation — a core "faster than texting a photo" promise — is only half‑built.

**22.5 Test the security‑critical new code.** Account management + session revocation remain the most powerful, least‑tested code in the app. Session 3 added integration coverage for the **consumable model** and the **maintenance‑return path**; prioritize next: PIN lockout, session expiry/revocation (`tokenVersion`), the invite flow (CSPRNG + TOCTOU), the last‑admin guardrail, transfer accept/decline idempotency + the new atomic status flips (DAT‑3), and the alert‑dedup constraint (DAT‑7).

**22.6 Build the operator `mustChangePin` screen.** Reset‑PIN sets the flag and login returns it, but nothing forces the change — so admin‑reset PINs aren't actually rotated by the operator. Small, security‑relevant follow‑up.

**22.7 Session‑revocation performance.** The per‑request DB re‑check is correct and fine at current scale, but it's on every authenticated request. If p95 latency rises, cache the `{isActive, tokenVersion, role}` tuple per user with a short TTL (30–60s) — a bump still propagates within the TTL, preserving "near‑immediate" revocation.

**22.8 Conflict resolution & a real‑device offline pass.** The offline failed‑queue is still bulk‑dismiss (lossy); the §11.9 manual conflict prompt is unbuilt. Before a field pilot, build a per‑item conflict/retry UI **and** run a real‑device pass (SW cold‑launch, two‑device conflict, terminal‑failure path) — these can only be confirmed on a phone in airplane mode.

**22.9 Admin completeness.** Four admin pages (Vehicles, Maintenance, Projects, Reports) are still stubs but linked live, and the §11.1 dashboard feeds/tables are unbuilt — admins hit dead ends. Schedule for Wave 3 alongside the maintenance loop + notifications.

**22.10 Build one notifications dispatcher (the new critical path).** Five missing alert types, **push**, **scheduled triggers** (overdue/not‑returned/expiry on a cron, not lazily on a GET), an **in‑app notification center**, per‑admin/per‑type routing, the **maintenance‑shop work order**, Deployment‑Request notifications, and (Phase 3) invoice emails all want a **single, escaped outbound channel** that serves admin push/email *and* external email. DAT‑5/DAT‑7 left a clean, unit‑linked, de‑duplicated alert/maintenance event stream to build on. This is the highest‑leverage next investment — build it once in Wave 3 rather than scattering `sendEmail` calls, and treat the **external‑recipient experience (shops, hubs) as a first‑class design surface**, not an afterthought.

**22.11 Consolidate before adding breadth — Wave 2D consistency unification (new).** The app still has two dialects (a clean offline‑first operator dialect; a hand‑rolled admin dialect). Before Wave 3, spend ~3–5 days unifying: **one response contract** (the declared `{data}` envelope + a single `apiError()` helper + published DTOs — erases the defensive `?? d` / `typeof d.error` hedges in the client), **one vocabulary** (extend `lib/status.ts` to *every* enum — `VehicleType`, `TransferStatus`, `Condition`, `Priority`, `AlertType` — and route all rendering through typed chips), **one set of primitives** (collapse the ~20 hand‑rolled dialogs and 3 toast systems into `ConfirmDialog`/`useToast`/`StatusChip`), and **one "Deployment" noun**. It's mostly deletion, and it compounds: every subsequent feature (notifications, admin pages, reporting) gets cheaper and less bug‑prone once it lands. A useful "done" test: a new feature should be buildable by composing existing primitives without inventing a new dialog, fetch wrapper, status map, or email send.

**22.12 Watch the migration discipline (process).** The codebase carries some historical drift (mixed `db push` / `migrate dev`, hand‑authored SQL). Session 3 added two clean, in‑sync migrations and confirmed status each time — keep that bar: data pre‑checks for constraints, `migrate status` after hand‑written SQL, one migration per PR, and — the most important remaining infra fix — **migrations in the automated deploy path** (Docker entrypoint or gated CI step) so production never depends on a human remembering to run `make db-migrate` (§16, §21.2).

**22.11 Settings & configurability.** Alert‑threshold/cutoff config, per‑item low‑stock thresholds, per‑operator rates/defaults, and (later) per‑project/per‑vehicle‑type checklists all converge on the Settings surface — plan it as a coherent admin config area rather than piecemeal.

**Bottom line.** The foundation is now not just working but meaningfully hardened (offline engine, idempotency, revocable sessions, security pass, CI test‑gating). The two things that most protect momentum are **(1) reconciling the branch state** and **(2) doing the Wave 2B Deployment model before anything that depends on it.** Everything else is well‑sequenced in §15 and the Addendum.
