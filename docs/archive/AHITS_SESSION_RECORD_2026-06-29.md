# AHITS — Session Record (2026-06-26 → 06-29)

_What this session set out to do, what shipped, the verified state, and recommended next steps. This record supersedes the pre-merge snapshot in `AHITS_PHASE3_READINESS_2026-06-26.md` (which was written before the closing merges and now reads as stale)._

## 1. Arc of the session

The session began as an ultra-review heading into Phase 3 and turned into a full pre-pilot hardening push. In order:

1. **NEW-5 Rental Vehicles** — shipped end to end: data foundation (Vehicle metadata + `RentalCostPeriod` enum + migration, PDF agreement upload), operator + admin **Add-Rental** flows behind a shared form/mapper, a **"missing agreement"** flag, **Reports** rental-cost analysis (rate × duration, window-clipped), and admin **Vehicles** rental management + Ownership filter. (PRs #114–#116.)
2. **UR-021 — "what is production" decision** — resolved to **Option A (separate prod environment), execution deferred to pre-go-live**; the contradicting Session-11 docs were reconciled to match the roadmap.
3. **UR-005b — private photo bucket** — built an auth-gated `/api/photos/[...path]` proxy (service-role streaming), switched uploads to return proxy refs, routed all render sites through it, and dropped photo exposure from the login-less `/s/` page. (PR #117.) Infra flip done this session (bucket now private).
4. **A6-surfaced field bugs** — a real-device offline pass surfaced four issues, each ground-truthed with parallel investigators and fixed:
   - **G1** — end/return could **lose inventory** (a consumable returned with no resolvable hub credited the cross-hub total but no per-hub row → "disappeared"/"HQ"). Fixed with a required rig-level destination selector + server-required hub + always-credit-a-real-hub, plus a backfill script. (PR #118.)
   - **Offline-auth (UR-036/UR-007/UR-026)** — navigating offline logged operators out because the layouts re-checked the session against the DB and failed closed. Fixed with **Option A**: a verify-only JWT shell gate (no DB) while API routes stay strict; `useAuth` keeps cached identity; the SW caches `/api/auth/me` + `/admin` nav. (PR #119.)
   - **UR-006 / G2** — the Launch button could be silently disabled, and operators couldn't add rentals (admin-only endpoint → 403). Fixed by gating the wizard's "Next" with inline reasons and scoping `POST /api/vehicles` to allow operators to create **only** rentals. (PR #120.)
5. **UR-004 — server-side `mustChangePin` enforcement** — the flag was client-only; now carried in the JWT and enforced in `proxy.ts` (blocks mutations + funnels to change-PIN), with the change-PIN route re-minting the token. (PR #121.)
6. **Phase-2 completion (P2-A…E)** — to take Phase 2 to ~100%: **damage-photo-required** on disposition (client + server), **QR scan opens the daily check** for any vehicle (incl. one not on the rig), a **rental online-guard**, and **UR-008 ergonomics** (iOS safe-area, a SW "update available" prompt, and an operator **bottom tab bar**). The operator notification bell already existed. (PRs #122–#124.)
7. **Infra** — flipped the Supabase `photos` bucket to **private**; diagnosed and fixed the notification dispatcher **cron 401** (a trailing newline in `CRON_SECRET` — resolved via the scheduler header; a code-level `.trim()` hardening is staged but not yet merged, see §4).

## 2. Verified state (independent audit, 2026-06-29)

- **All session work is merged to `development`** (#114–#124), confirmed by git log + file-level grep.
- **tsc: clean. eslint: 0 errors** (33 warnings, all the pre-existing `set-state-in-effect` advisories — untouched by this session). 22 test files; CI's `verify` workflow runs lint/type-check/build/test on the PR path (vitest can't run in the analysis sandbox — Prisma engine — so CI green on `development` is the final confirmation to capture).
- **No regressions** from the risky changes: the `requireAdmin→requireAuth` scope on `/api/vehicles` doesn't open a hole; the disposition hub-required doesn't block legitimate non-hub (TRANSFER/INOPERABLE) returns; the damage-photo gate is correctly scoped to the INOPERABLE damage-report path.

## 3. Where the product stands

- **Phase 1 — Foundation: ~100%.** Dashboard operational feeds and Settings alert-config (the two items the old PRD table marked open) are shipped.
- **Phase 2 — Core Operations: ~100%** under the agreed descopes (Web Push → Phase 3; React-Native wrapper out; per-project checklists optional, per-vehicle-type stays; external non-admin alert recipients deferred). All required code items merged; both infra actions (private bucket, cron) done.
- **Phase 3 — Scale & Polish: ~0%** — net-new feature work, not started. No Phase-3 models exist; daily-check GPS (Deployment Map) is not seeded yet.
- **Pilot line:** every code prerequisite is in. The one remaining gate is the **A6 device-pass sign-off** (checklist: `AHITS_A6_DEVICE_CHECKLIST.md`) — the code is ready; the pass itself hasn't been run on real hardware.
- **Go-live (later):** the separate **prod-DB standup** (UR-021/PIPE-2, deferred) and any production-scale items (UR-009 indexes, UR-032 attribution) remain pre-go-live, not pre-pilot.

## 4. Open loose ends (non-blocking, but tidy before moving on)

1. **Cron `.trim()` hardening — uncommitted.** `src/app/api/cron/dispatch/route.ts` has a local edit that trims `CRON_SECRET`/header so a trailing newline can never cause a 401 again. The live cron already works (fixed via the scheduler header), so this is optional hardening — recommend merging it so the problem can't recur. Hand-off in the chat.
2. **`AHITS_PHASE3_READINESS_2026-06-26.md` is a pre-merge snapshot** — its "four fixes not merged / UR-004 & UR-008 OPEN" core is now false. Superseded by this record.
3. **Repo hygiene** — ~30 untracked `AHITS_*.md` planning docs and a stray `.~lock`/`.git/index.lock` in the root. Add the planning docs to `.gitignore` (or a `/docs` folder) and clear the locks. Close the issue-register `.xlsx` in your spreadsheet app so its `.~lock` releases (and so it reloads with the latest edits).

## 5. A6 pass status — IN PROGRESS (the active pilot gate)

The A6 device pass is underway (`AHITS_A6_DEVICE_CHECKLIST.md`). Steps 1–2 OK; **step 3 (stay logged in while navigating offline) surfaced a real blocker on all five platforms** — Android reverted to `/login`; iOS flashed the offline page then froze (taps dead).

**Root cause (code-certain, UR-038):** App-Router tab taps are **RSC fetches** the service worker wasn't caching (its matcher only caught `mode==='navigate'`), so offline soft-nav stalled; and the SW **precached the dynamic, authed operator pages with `revision:null`**, which captured a `/login` redirect at install time and served it offline (the Android symptom).

**Fix built + handed off — branch `feature/20260629/max-slater-offline-rsc-nav` — PENDING DEVICE RE-TEST:** the SW now caches RSC navigations (`ahits-app-rsc`), no longer precaches authed pages (only `/~offline`), and a new `RoutePrefetcher` warms all operator-reachable routes while online so they're cached before signal drops. tsc/lint green; **cannot be device-verified from the build environment** — offline App-Router PWA nav is the trickiest piece and may need an iteration.

**Re-test procedure (must follow exactly):** after deploy, fully drop the old SW on each device (uninstall + reinstall the PWA, or DevTools → Unregister + Clear storage); open the app **online and wait ~10 s** so the prefetch warms the cache; **then** go offline and run step 3. If it still fails, capture: which screen it lands on, which platforms, and whether the online-warm step was done.

## 6. Recommended next steps

**Track 1 — finish the pilot gate (A6):**
1. Deploy the offline-RSC-nav fix; re-run A6 **step 3** per the procedure above; iterate if needed.
2. Complete the remaining A6 rows on all five platforms; record sign-off. Clean pass = **pilot line reached.**

**Track 2 — parallel build queue (safe to progress while A6 is being verified):**
3. **Phase 3 — Deployment Map** (smallest capstone): add `gpsLat/gpsLng/gpsAccuracy` to `DailyCheck`, capture opt-in on daily-check submit, Mapbox admin map. Lowest-risk Phase-3 entry; de-risks the GPS plumbing.
4. **UR-032** — ended-deployment operator attribution (data correctness; server-side, not platform-dependent).
5. **UR-009** — add the missing FK/status indexes (pre-prod scale).
6. **#29 slice 3c→4** — legacy-column retirement (gated by UR-002; the snapshot-gated irreversible drop — sequence carefully).
7. Low/cleanup tail: UR-010, UR-011, UR-012, UR-013, UR-014, UR-031 + the deferred CR-* tickets.

**Track 3 — pre-go-live (after pilot, not blocking the start of Phase 3):**
8. Prod-DB standup (`AHITS_PROD_STANDUP_CHECKLIST.md`, Option A) + the data-isolation check.

**Parked by decision:** Web Push, RN wrapper, per-project checklists, external non-admin alert recipients.

**Small loose ends:** the cron `.trim()` hardening PR (pushed this session — confirm merged); the repo doc-hygiene PR (commit the `AHITS_*.md` records + the `.gitignore` that ignores the binary `.xlsx` register and office `.~lock` sidecars).

## 7. Key artifacts (next-session pickup)
- `AHITS_SESSION_RECORD_2026-06-29.md` — **this doc; the current-state handoff. Start here.**
- `AHITS_ULTRA_REVIEW_ISSUE_REGISTER.xlsx` — issue register (reconciled to merged state; UR-037 cron + UR-038 offline-nav rows; infra-done summary). Living local file (gitignored).
- `AHITS_A6_DEVICE_CHECKLIST.md` — the device-pass sign-off sheet (step 3 has a known fix in flight — see §5).
- `AHITS_FIELD_BUGS_DIAGNOSIS_2026-06-26.md` — the A6 field-bug root-cause report.
- `src/app/sw.ts` + `src/components/operator/RoutePrefetcher.tsx` — the offline-RSC-nav fix (pending device verify).
- `scripts/g1-backfill-hub-stock.ts` — one-off to resurface any pre-fix lost stock (dry-run default).
- `AHITS_PROD_STANDUP_CHECKLIST.md` — the deferred go-live runbook (Option A).
