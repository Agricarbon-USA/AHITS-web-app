# AHITS — Pilot-Floor To-Do · one page, current as of 2026-07-28 ~3:15pm

> STATUS: working checklist (snapshot — tick freely; `STATUS.md` stays canonical) · UPDATED: 2026-07-28
> Everything below comes from `AHITS_CC29-31_PILOT_FLOOR_PACKETS.md` + the CC-30 Max checklist + the owner riders (workplan §15). When this page and STATUS disagree, STATUS wins.
> **The one rule: no operator onboards until section 1 is fully checked.**

---

## 1 · CC-29 — Offline trust floor (CODE DONE ✅ — phone smokes are the remaining first-operator gate)

- [x] ~~Merge PRs~~ **#202 / #203 / #205 / #207 all MERGED, CI + staging deploys green, session close done (D26/D27 recorded, tree clean)**
- [ ] **YOUR PHONE SMOKES — the one remaining gate** (exact steps: `AHITS_SESSION_HANDOFF_2026-07-28_CC29-BUILD.md` + STATUS §3):
  - [ ] Airplane mode → submit check → reconnect → syncs exactly once
  - [ ] Weak signal → submit → "saved, will sync" within ~12s, never a stuck spinner
  - [ ] Two tabs, 3 queued actions, reconnect → no false "Failed"; photo-wedge Discard works from Outbox
  - [ ] Forced-expired session, ONLINE submit → "check saved, sign in to send" (not "Unauthorized"); after sign-in it lands
  - [ ] **Overnight replay (start TONIGHT):** queue a check in airplane mode this evening → sync tomorrow morning → it shows under TODAY's date; tomorrow's real check untouched
  - [ ] Admin "force logout" still boots a phone on its next tap

## 2 · CC-30 — Ops floor (FULLY LANDED ✅ — all six step-7 anchors green, both deploys green)

- [x] ~~Merge PRs~~ **#204 (pipeline hardening) + #206 (server-side eyes) MERGED**; CC-29 mid-session collision handled (all 6 failed-transitions instrumented, 18 files/84 tests green)
- [x] **First post-#204 deploy.yml run: GREEN end-to-end** — migration-safety wiring confirmed sound (real BEFORE_SHA, diff ran, non-vacuous) AND the env-drift step passed its first execution (= pipeline-verified min-instances/sandbox values; console item e evidenced)
- [x] Clamp shipped on #206 (status-code only; operator-facing strings untouched; terminal-branch errMsg deliberately kept — app-authored diagnostics)
- [x] **#206 MERGED via the new pipeline** — genuinely BLOCKED until all 3 checks green on the updated branch; no override used. The gate works.
- [x] Doc follow-ups LANDED (PR #208, via the new protection): e/f/g ticked with evidence · handoff items folded · parallel-session rule in the close contract · a step-7 anchor bug fixed (session-edge.ts path) · §1≡§2 invariant maintained
- Notes: pr-staging-deploy's migrate step was DROPPED (safer than gated — overridable if you ever want DB-backed previews) · the migration gate is false-green when run locally on macOS (CI is the only authoritative run) · DECISIONS untouched, D16 governs

**Your console checklist — the FINAL SIX, all genuinely yours (record each in STATUS §3):**
- [ ] **(a) Supabase → Backups:** note plan/retention · enable PITR if offered · run ONE restore drill to a throwaway project (~15 min) · write the steps into `PILOT_ROLLBACK.md`  ← *the single biggest unprotected risk*
- [ ] **(b) healthchecks.io:** confirm a real cron ping arrived · set grace period < 30 min
- [ ] **(c) Cloud Scheduler:** pause cron > 30 min → CRON_SILENT banner appears → resume → it clears
- [ ] **(d) Sentry:** fire the two test buttons in /admin/settings → both events arrive with request_id
- [x] **Cloud Run min-instances = 1** — verified by the env-drift step's first green run (glance at the console once if you want the human cross-check)
- [x] **GitHub branch protection: COMPLETE** — approvals 0, all 3 checks required, strict, force-pushes off · **`deploy-staging` label DELETED** (verified 0 hits)
- [ ] **(h) Mapbox:** token is a pk. public token, URL-restricted to the staging domain
- [ ] *(i, optional, 5 min)* uptime check on `/api/health`

## 3 · Your owner items (no code, no session needed — all cheap, two are capture-now-or-lose-it)

- [x] **CC-32 word list CONFIRMED (Max, 2026-07-28)** — confirmation line included in the CC-32 paste ✓
- [ ] **Clockify export + tap count** (capture-now: dies when Clockify is replaced): full CSV history export + count its real daily taps per operator
- [ ] **Mounted-units template bridge** (~30 min, zero code — D24): admin checklist editor → add Wintex items to the Can-Am template, Giddings items to the Bobcat template; add their service schedules as named maintenance tasks on those vehicles
- [ ] **Stewart:** create his ADMIN account (guide gets written with CC-31)
- [ ] **Onboarding one-pager** (rolling start = you won't be present every time)
- [ ] **Group-text baseline** (jot this week's volume — the adoption metric's control arm)
- [ ] **Triage card:** add one "someone gets hurt" line

## 4 · The packet queue

| # | Packet | What it is | State |
|---|--------|-----------|-------|
| ✅ | CC-29 | Offline trust floor | code DONE — your phone smokes remain (§1) |
| ✅ | CC-30 | Ops floor | DONE end-to-end |
| ▶ | **CC-32** | Friction & flow | **IN FLIGHT** (parallel w/ CC-31) — paste includes the word-list confirmation line |
| ▶ | **CC-31** | Accuracy + /admin/pilot dashboard | **IN FLIGHT** (parallel w/ CC-32) |
| then | **CC-16S** | Public-link security | ready anytime — zero collisions with either in-flight packet |
| last | **CC-33** | Simplify & unify | after CC-16S (rebases on CC-32's merged strings) |

**Parallel-run rules for CC-32 ∥ CC-31** (the close contract's new rule, in effect):
- Whichever session you pasted FIRST owns STATUS/DECISIONS at close; tell the second one explicitly: "you are the second-started parallel session — close with a uniquely-named handoff only."
- File overlap is minimal but real at ONE point: both touch `daily-check/page.tsx` (CC-32 items 2.1/2.2/2.5/2.6 vs CC-31 item 5's durationMs stamp). Whoever merges second rebases — expected, small.
- CC-31's index migration will be the migration-safety gate's **first run against a PR that actually contains a migration** — watch that check on its PR; it should pass (additive CREATE INDEX) and seeing it exercise for real is a bonus.
- Merge order between them doesn't matter otherwise; each deploys to staging on merge (no operators live yet).

## 5 · First-operator gate (the finish line of this page)

- [ ] All of §1 checked (CC-29 merged + smoked) — **the hard gate**
- [ ] §2 merges done + backups/restore drill done — strongly recommended before day 1
- [ ] Onboard operator #1 using the one-pager · watch their first check land in the viewer · fortnight clock starts

**Parked / not on this page by decision:** CC-16-proper (D18) · secondary-operator packet (pre-CC-17) · CC-17 Clockify replacement (post-floor; measure taps first, D19) · CC-18 week board · shipment tracking (D23, post-CC-17) · weather stamps (CC-17 rider) · everything in DECISIONS' parked registry.
