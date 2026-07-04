# AHITS — Session Record: Phase-3 Review + Wave-0 Execution (2026-06-30)

_Start-here handoff for the next session. This session did two things: (1) a deep pre-Phase-3 review producing `AHITS_PHASE3_DETAILED_WORKPLAN.md`, and (2) executed most of the Wave-0 hardening from that workplan in a parallel Cowork ↔ Claude Code (CC) flow — Cowork as architect/reviewer + live staging verifier, CC as the local executor with the full toolchain (migrations, push, PR, deploy). Nearly the entire Wave-0 safe set is merged to `development`._

---

## 1. What was produced

- **`AHITS_PHASE3_DETAILED_WORKPLAN.md`** (in repo root) — the exhaustive entry doc: reconciled state-of-app, a severity-ranked findings register (8-stream code audit + a first-hand live staging walkthrough as Admin + both Operators + an adversarial verification pass), and the sequenced Phase-3 build plan with model/API/UI specs, KPI mapping, and a risk register. **This is the canonical Phase-3 reference — read it first.**
- **Raw audit set** (scratchpad `outputs/audit/`, referenced in the workplan appendix): `01_prd_phase3_baseline` … `08_notifications_external`, `09_live_walkthrough`, `10_verification`.
- **Merged code** — see the Wave-0 scoreboard below.

## 2. Headline state (entering Phase 3)

- **Pilot doorstep.** Phase 1 & 2 ≈ 100% under agreed descopes; Phase 3 ≈ 0% (net-new). The one gate to a real-operator pilot is the **A6 real-device offline pass** (still to be run/signed off on real iOS + Android).
- The app is **healthier than the old docs implied** — admin Reports/Vehicles/Projects/audit-log, Deployment Requests + hub fulfillment, and the **full 16-item** daily check are all built and were confirmed live (retiring several "stub/future/9-vs-16" doc items).
- Auth/security/API/offline cores are production-grade; the gaps were systemic hygiene, three live bugs, and the offline-storage/attribution edges — most now fixed (below).

## 3. Wave-0 scoreboard

**MERGED to `development` this session:**

| PR | Item |
|---|---|
| #128 | **B1** admin ended-deployments crash fix + **B3** rig-less transfer accept + **H-API1** pagination clamp |
| #129 | **H-NOTIF3** non-prod email **sandbox guard** (dormant until `EMAIL_SANDBOX=true` set on staging) |
| #131 | **H-NOTIF2** `DAILY_CHECK_MISSED` cutoff alert |
| #133 | **timezone fix** — the missed-check cutoff/date now use `APP_TIMEZONE` (Central / `America/Chicago`) via `Intl`, not UTC |
| #130 + #132 | **M-API1** `writeOr404` P2025→404 helper + applied to all remaining unguarded soft-delete/update routes |
| #134 | **H-DB2** 13 query-path indexes across 9 models (TransferRequest, MaintenanceTask, DailyCheck, Alert, Kit, Rig.projectId, DeploymentRequest, …) |
| #135 | **0.9** dropped unused deps (`@mui/x-data-grid`, `html5-qrcode`, `iron-session`) + removed dead `ADMIN_EMAIL` secret mapping |
| #136 | **C1** offline deploy "queued" state on my-rig (scoped honestly — no local-rig model; shows a queued state instead of a dead-end) |
| #140 (b66c1af) | **H-OFF1** holistic offline storage-safety (silent-IDB-drop fixed → honest `mutate` failure, `storage-health` module, 5 new banner warnings, PhotoCapture catch, A6 rows) |

**Built, verified, NOT yet merged (open branches — merge next):**
- `feature/20260630/maxwellslater-csp-nonce` (**#139**, M-SEC1 CSP nonce + the `force-dynamic` login-hydration fix). **Verified good via live staging smoke** — safe to merge.
- `…-pin-hardening` (**M-SEC3** trivial-PIN rejection + atomic attempt counter) — built; confirm CI green + merge.
- `…-rate-limit-uploads-photos` (**M-SEC2** per-user rate-limit on `/api/uploads` + `/api/photos`) — built; confirm CI green + merge.

**Specced this session but NOT yet built** (ready-to-paste CC prompts are in the session chat):
- **M-UX2 rename** — My Rig → My Deployment consistency (centralize the path constant, rename component/comments/labels, keep the URL). 12-file touchpoint list included.
- **M-UX3 SWR + "data as of" freshness** — two incremental PRs (foundation + operator-dashboard pilot; then operator-requests pilot). Monoliths (my-rig/deployments/inventory) explicitly last.

## 4. The CSP smoke — what it caught (why #139 needed a fix)

Ran a live console smoke on the #139 staging preview. All 6 admin surfaces hydrated under the nonce CSP (100% nonce'd scripts, no `unsafe-eval`, only a pre-existing benign React #418). **But `/login` was broken** — statically prerendered, so its inline bootstrap scripts had no nonce (`self.__next_f` empty, 0/6 inline scripts nonce'd, Admin tab didn't switch → no hydration → users couldn't log in). CC's `export const dynamic = 'force-dynamic'` fix (commit 258c8fe) resolved it — re-verified live: **6/6 inline scripts nonce'd, `__next_f` populated, Admin tab switches to Admin Email/Password.** Verdict: **#139 + the fix is good to merge.**

## 5. Decisions locked this session
- **APP_TIMEZONE = `America/Chicago`** (Central) for the daily-check cutoff/date logic (#133).
- **C1 offline add-items = scope honestly** (queued-state UX, no local-rig model) — shipped in #136.
- **RN wrapper = descope** (favor iOS Web Push); **trusted-device model = retire** (revocation already met) — governance calls to formalize.
- **Prod = Option A** (separate env), execution deferred to pre-go-live.

## 6. Still needs YOU (not automatable here)
1. **Merge the 3 open security branches** — #139 (CSP, verified), pin-hardening, rate-limit-uploads (confirm CI green).
2. **After #139 merges → auto-deploys to the main staging URL:** quick re-verify `/login` hydrates there, and **spot-check the public `/s/[token]` page** (the other static page CC set `force-dynamic`) with a real hub/shop link.
3. **Flip `EMAIL_SANDBOX=true`** (+ optional `EMAIL_SANDBOX_TO`) on `ahits-web-app-staging` to activate the guard (it's dormant until set). Not urgent — both staging hubs still have no email.
4. **A6 real-device offline pass** — THE pilot gate. Now that offline-RSC-nav (#127), C1 queued-state (#136), and IDB-eviction warnings (#140) are all merged, run the full 18-row matrix on real iOS + Android (SW-drop+warm ritual; add-items-to-offline-rig; overnight iOS storage-eviction).
5. **Legacy-column DROP (0.7) — still HELD.** Irreversible. Do NOT run without a DB snapshot + explicit sign-off. It's the prerequisite before the Phase-3 Invoicing capstone builds on operator attribution.

## 7. Next-session queue (prioritized)

1. **Close out the security batch** — merge #139 + pin-hardening + rate-limit-uploads; post-merge `/login` + `/s/[token]` staging re-check; flip `EMAIL_SANDBOX` on staging.
2. **Finish the Wave-0 tail** — hand CC the two specs already written: **rename (M-UX2)** first (mechanical), then **SWR/freshness (M-UX3) PR-1** (foundation + operator-dashboard pilot), then PR-2 (operator-requests pilot). Monoliths last.
3. **B2** — transfer-accept read-after-write (server-side/connection-pool consistency; return updated state or pin the post-accept read to primary). Add a regression test.
4. **Run + sign off A6** on real hardware → **declare the pilot line reached.**
5. **Begin Phase 3 capstones** (per the workplan, smallest→largest): **Deployment Map** (3 GPS fields on DailyCheck + Mapbox admin card; needs `AHITS_MAPBOX_TOKEN` in Secret Manager first) → **No-app QR daily-check** (reuse the StatusLink primitive; the CSP nonce + upload rate-limit groundwork is now in place) → **Time/Invoicing/Availability** (7 models — gated on the legacy-column retirement 0.7).
6. **Pre-go-live tail** — prod-DB standup (Option A) + isolation check; prod cron scheduler; backups/retention; duplicate-timestamp migration rename; email retry/delivery-log (hard prereq for the invoice→processor email).

## 8. Loose ends / low-priority (from the review, not yet ticketed)
- Deployment Requests: 4-of-6 lines render a bare **"Item"** with no name (freeform/unlinked lines) — clarify the label.
- Hubs Inbound: a **duplicate HUB_RETURN "awaiting receipt" row** (resend may leave stale rows); no admin-side "mark received" fallback for email-less hubs.
- `FulfillmentChecklist` is a parallel (non-MUI) design system used in admin Requests + `/s/` — decide unify-vs-document-as-intentional.
- Admin audit-log ("Activity") only surfaces handoff events — narrow coverage.
- **Admin-mobile** (raw tables clip on phones; operators reach them via read-only Browse) — a Phase-3 polish item.
- **QA test data on staging** to clean up: the "QA Test - Claude" (Op1) + "QA Op2 receive test" (Op2) deployments + one daily check, created while exercising flows.

## 9. Key artifacts (next-session pickup order)
1. `AHITS_PHASE3_DETAILED_WORKPLAN.md` — the plan. **Start here.**
2. This record — Wave-0 execution status + the queue.
3. `outputs/audit/*` — the raw audit + live-walkthrough + verification detail.
4. `AHITS_A6_DEVICE_CHECKLIST.md` — the pilot-gate sign-off sheet (now with the new IDB-eviction rows).

_End of record._
