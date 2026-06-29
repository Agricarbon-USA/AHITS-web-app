# AHITS — Phase 3 Readiness Assessment

> ⚠️ **SUPERSEDED (2026-06-29).** This is a PRE-MERGE snapshot. Its "four fixes built but not merged" and "UR-004 / UR-008 OPEN" framing is now false — all of it is merged to `development`. See `AHITS_SESSION_RECORD_2026-06-29.md` for the current state. Kept for history only.

_Prepared 2026-06-26 from a four-agent sweep (Phase-3 scope/gates · code health · full open-issue inventory · offline/PWA), reconciled against the actual git history and the issue register. Every status is ground-truthed; where a planning doc was stale, git wins and the drift is flagged._

## Bottom line

AHITS is **at the pilot doorstep, not blocked by a long build.** What stands between today and launching Phase 3 is a **short, specific list**: merge the four field-bug fixes that are already built (they're on branches, not yet in `development`), close one genuinely-open security gate (UR-004), finish one ergonomics item (iOS safe-area), and run the final A6 device pass. Production cutover (separate prod DB, private photo bucket) is real but **explicitly deferred to go-live** and does **not** block starting Phase 3.

Phase 3 itself is **~0% started** — it's a feature program, not hardening (see scope below).

## What "Phase 3" is

Phase 3 = **"Scale & Polish"** (PRD §, target Q4 2026). Three capstones, smallest→largest:
1. **Deployment Map** — admin map (Mapbox), GPS captured opt-in on daily-check submit (3 new `DailyCheck` fields). Smallest; do first.
2. **Time Tracking, Invoicing & Availability** — the heavy one: **7 new models** (TaskType, OperatorRate, TimeEntry, Expense, Invoice, InvoiceLineItem, Availability), clock in/out, expenses+receipts, invoice PDF lifecycle with auto-email.
3. **No-app QR web form** — daily check via any phone camera through a tokenized web form, no install (reuses the existing StatusLink primitive).
Plus advanced cost analytics, admin-mobile optimization, contractor self-onboarding. **None started** (no Phase-3 models exist yet; GPS still lives on `Photo`, not `DailyCheck`).

## Three readiness lines (and where each stands)

The docs conflate "launch Phase 3 (start the capstones)" with "launch to production." They're different lines.

### Line 1 — M1 consistency sweep (gate on *building* Phase-3 screens)
The roadmap's "one rule": unify the presentation layer before building new screens. **Essentially done.**
- UR-017 toast unification — **DONE** (merged)
- UR-018 "My Rig → My Deployment" rename — **DONE** (merged #110)
- UR-019 shared ConditionSelect — **DONE** (merged #110)
- UR-008 ergonomics (bottom-nav / iOS safe-area / SW update prompt) — **OPEN** (see Line 2; safe-area is the pilot-relevant piece)

### Line 2 — Pilot line (put it in front of real operators)
The single named gate is **A6 (real-device offline pass)**. Status of everything feeding it:

| Item | Status | Note |
|---|---|---|
| UR-001 critical stock bug | ✅ merged | |
| UR-029 repaired-unit return | ✅ merged | |
| UR-034 failed-check alert | ✅ merged | |
| UR-006 offline deploy-create (queue) | ✅ merged (#113) | field-bug **Launch-button** fix still on branch |
| UR-007 daily-check durable queue | ✅ merged (#113) | |
| UR-003 shared-device identity cache | ✅ merged (#107) | |
| **G1 end/return data-loss** | 🟠 **built, NOT merged** (PR-1 / `10b54d5`) | Critical; live on staging until merged |
| **Offline-auth keystone** (UR-007/026 logout) | 🟠 **built, NOT merged** (PR-2 / `ce1eea4`) | **A6 PWA cold-launch fails without this** |
| **UR-006 Launch button** | 🟠 **built, NOT merged** (PR-4) | |
| **Rental create + G2 parity** | 🟠 **built, NOT merged** (PR-3) | |
| **UR-004 mustChangePin server gate** | 🔴 **OPEN** | flag is set/read but **not** gated in `proxy.ts`; a reset operator can still hit other write endpoints. Genuine pilot-grade security gap. |
| **UR-008 iOS safe-area** | 🔴 **OPEN (partial)** | `viewport-fit=cover` + `black-translucent` set, but `AppShell` AppBar/main have no `env(safe-area-inset-*)` padding → notch/home-indicator clipping in the iOS PWA |
| Add-Rental offline | 🟡 minor gap | the new rental write is a bare `fetch`, not queued — offline it just errors |
| A6 final pass on real iOS+Android | 🔴 **OPEN** | the gate itself; needs the merges first |

### Line 3 — Production / go-live line (deferred, after pilot)
| Item | Status |
|---|---|
| UR-021 "what is production" decision | ✅ **decided** — Option A (separate prod env), execution **deferred to cutover** |
| PIPE-2 prod DB standup (`AHITS_PROD_*`) | ⏸️ **deferred** to pre-go-live; runbook ready |
| UR-005b private photo bucket | 🟠 **code built**, pending your Supabase bucket-flip + verify |
| A2 migrate-on-deploy | ✅ merged (#36) |
| CR-3/CR-4 shared-store rate limiting | ✅ done |
| UR-009 indexes (scale) · UR-032 ended-deployment attribution | 🔴 open (pre-prod) |

## The single most important fact

**Four fixes are built and pushed but not merged.** They sit on three disjoint-file branches off `development` (so they merge cleanly in any order):
- `10b54d5` — G1 return-destination (DispositionDialog + 3 routes + backfill)
- `ce1eea4` — offline-auth keystone (session/layouts/useAuth/sw)
- `e6e51e1` — rental create + G2 + UR-006 Launch (vehicles route + my-rig)

Until they merge, **staging still has the G1 data-loss path and the offline-logout bug live**, and **A6 cannot pass** (the iOS/Android installed-PWA offline cold-launch needs `ce1eea4`). Merging them is the highest-leverage next action.

## Genuine open blockers to the pilot line (ordered)

1. **Merge the 4 field-bug PRs** to `development` (mechanical; unblocks the data-loss fix, offline auth, and A6).
2. **UR-004 — enforce `mustChangePin` server-side** (gate write routes / proxy for a flagged operator). Only genuinely-unbuilt security item.
3. **UR-008 — iOS safe-area padding** on `AppShell` (the one ergonomics item that materially affects the iOS-PWA A6 cell). Bottom-nav + SW-update-prompt are product decisions and arguably pilot-acceptable.
4. **(Optional, narrow)** route Add-Rental through the offline queue or add an online guard.
5. **Run + sign off A6** on real iOS + Android, after 1–3.

Everything else — prod DB standup, private bucket, indexes, attribution, the long Low/cleanup tail — is **post-pilot / go-live or polish**, not a blocker to starting Phase 3.

## Code health (from the audit)

Clean: **0** TODO/FIXME/HACK, **0** `@ts-ignore`, **0** stray `console.log`; only 3 justified `eslint-disable`. tsc strict; CI runs lint/type-check/build/test. The session's PR-3/PR-4 are sound (operator vehicle-create scoping is airtight; Launch can't reach a stuck state). Gaps worth noting: **no test coverage** yet for the vehicles-scoping (operator-rental→201, operator-fleet→403) or the Launch step-gate; an operator can create **orphan rental Vehicle rows** if the attach step is abandoned (low); and repo hygiene (a stray `.~lock` file, many untracked `AHITS_*.md` planning docs).

## Tracking gaps to fix in the register

G1 and G2 (and the offline-auth keystone) were tracked only in the field-bugs doc + task list — **not** as register rows. G1 is Critical data-loss and must be in the register. This update adds them.

## Recommended path to "Phase 3 open"

1. Merge PR-1→PR-4 (any order; they're disjoint). Run the existing test suite + a staging smoke.
2. Build UR-004 (server-side PIN gate) and UR-008 safe-area; optionally the Add-Rental online guard.
3. Run the A6 device matrix (Desktop / iOS web / Android web / iOS PWA / Android PWA) and record sign-off.
4. Declare the **pilot line** reached → begin Phase 3 with the **Deployment Map** capstone (smallest, and it only adds 3 `DailyCheck` GPS fields).
5. In parallel / before real go-live: flip the photos bucket (UR-005b), then execute the prod-DB standup (PIPE-2) with the isolation check.
