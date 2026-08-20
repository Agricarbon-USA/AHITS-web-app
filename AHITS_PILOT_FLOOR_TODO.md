# AHITS — Road to Relaunch → Road to Undisputed · 2026-08-20

> STATUS: working checklist (snapshot — tick freely; `STATUS.md` stays canonical) · UPDATED: 2026-08-20 by the ten-seat resume review
> READ-WITH: `AHITS_RESUME_BRIEF_2026-08-20.md` (where-are-we/so-what/what's-next) · `AHITS_TEN_SEAT_RESUME_REVIEW_2026-08-20.md` (evidence) · `AHITS_DECISIONS_PASTE_READY_2026-08-20.md` (paste blocks) · `AHITS_UNDISPUTED_PROGRAM_2026-07-30.md` (waves — RL-1 now shelved)
> **What changed since 2026-07-30:** pilot attempt 1 ran (~2–3 operators, ~a week) and STALLED — reverted to group texts (owner bandwidth + homework-feel + clunky setup + trust). Window ruled VOID (D33 candidate). **RL-1 SHELVED** (D34 candidate). Code frozen since `c0c19f6` 07-30 — still green. **GAP-4 was found ALREADY FIXED** (PR #220, 07-28, + regression test) — the old §3 build item is closed; only its advisory-lock-branch test survives as filler. `held/*.tar.gz` cleanup: already done.
> **Green-light session (2026-08-20, same day):** Max ratified the brief's full decision queue — **D30–D36 recorded in `DECISIONS.md`** (D28 marked superseded) · attempt-1 VOID (D33) · RL-1 shelf + revisit triggers (D34) · D1 trigger (D35) · photo policy **YES/YES** (D36) · **UXP-3 before UXP-2** · M-1 search opens now (posting: `AHITS_M1_RETAINER_POSTING_2026-08-20.md`).
> **The one rule, restated for round 2: no operator re-onboards until §0–§3 are ticked.**

---

## 0 · Stabilize & record (FIRST — one desk sitting, ~30 min; no phone, no build session)

- [x] **Strategy corpus COMMITTED** — `b950351` (2026-08-20): the four stranded 07-30 docs + briefing set + refreshed TODO/STATUS. A same-day second commit carries the decision pastes + green-light updates. **[ ] PUSH still owed** — the session bridge has no network: run `git push origin development` from your own terminal.
- [x] **Decisions RECORDED (2026-08-20, green-lit by Max):** D30–D36 appended to `DECISIONS.md` + D28 marked `Superseded-by: D30` + registry rows for RL-1/CC-18/D35. Paste file archived to `docs/archive/`.
- [ ] **Stale-data triage** (so relaunch day 1 doesn't open on a wall of red): in Supabase SQL — end any attempt-1 deployment that's actually over; resolve stale MISSED/damage alerts; run the #229-body stale-damage count SELECT (was OPS-g; >15 → triage).

## 1 · The recording smoke session (~60 min + one overnight — the relaunch's hard gate)

**Part A — write off as FIELD-PROVED, tick with the date you're confident of** (attempt-1's real week covered these; recording them beats re-running them — Schrödinger's-gate rule):
- [ ] Fresh install shows NO false "new version" toast (1b first-install guard — attempt-1's real installs covered this) · [ ] Five tabs visible, rotate ≠ shell swap (1a) · [ ] Back on check step 2 → step 1, answers intact (1e) · [ ] Admin drawers: X closes, not the bell (1f) · [ ] No "Syncing 0…" idle flicker (1g) · [ ] Airplane submit → syncs exactly once (CC-29) · [ ] Weak-signal "saved, will sync" ≤12s (CC-29) · [ ] Overnight replay under day PERFORMED (D26) — *only if you actually saw one; else move to Part B*

**Part B — run DELIBERATELY on staging (field use can't have hit these):**
- [ ] Post-deploy update toast: above the bar, X, auto-hides (1b — needs the next deploy) · [ ] Wrong URL in PWA → branded 404 → Home (1d)
- [ ] Two tabs, 3 queued actions, reconnect → no false "Failed"; Outbox Discard works (CC-29)
- [ ] Force-expired session, ONLINE submit → "check saved, sign in to send" → lands after sign-in (CC-29/D27)
- [ ] Admin "force logout" boots the phone on its next tap
- [ ] **Two-phone Transfer** (owed since CC-33/D22): entire rig → ownership flips · selected gear → item moves · nothing says "Handoff"
- [ ] **Report a problem, airplane mode** (CC-34): scan → photo + note → reconnect → task + photo + bell; unit STILL in kit; "Out of service" → In Maintenance
- [ ] Drawer truth: damaged unit's chip in the deployment drawer → the exact task (CC-34 3a)
- [ ] **Schedules / D24 bridge** (CC-34 3a/3c/3d): create the real Wintex-90-day + Giddings rows → real due dates; close a repair to a deployment ≤3 clicks; operator sees "In repair"
- [ ] Portal: dead link → nothing sensitive · live link works · double-tap lands once
- [ ] Overnight replay (if not written off in Part A): evening airplane-mode check → syncs next morning under the day PERFORMED

## 2 · Console/ops (no code — record each result in STATUS §3)

- [ ] **(a) Supabase backups + ONE restore drill** (~35 min, throwaway project; click-path into `PILOT_ROLLBACK.md`) ← **do before anything else here — real field data now exists and this is still "the most probable total-loss path in any scenario."** Also confirm the project didn't pause during the idle weeks.
- [ ] **GitHub "Include administrators" ON** — 2 clicks, the last open door
- [ ] **(h) Mapbox token:** pk. + URL-restricted to staging — 5 min
- [ ] **(b) healthchecks.io:** a real ping arrived during the freeze? grace < 30 min
- [ ] **(c) CRON_SILENT live fire:** pause cron >30 min → banner → resume → clears
- [ ] **(d) Sentry:** both test buttons in /admin/settings → events arrive with request_id
- [ ] **One cron watch** (now observation, not a bug hunt — GAP-4 verified fixed): TTL holds released · INV-5 quiet on a normal end · PIN lock self-clears (ticks the CC-16S + CC-31 retro smokes)
- [ ] Cloud Run: delete `ahits-web-app-preview-cc31-pr3` + `-pr2`
- [ ] Remove `ahits-cc31-worktree` + `ahits-cc34-pr3-worktree` if still present (~/Downloads) · ~~held/*.tar.gz~~ ✅ already gone
- [ ] *(optional)* uptime check on `/api/health`

## 3 · Owner items — **capture the baselines THIS WEEK, while the crew is still reverted** (the stall re-opened the control arm; it dies the day re-onboarding starts)

- [ ] **Group-text baseline:** this week's volume by category — the adoption control arm, now purer than the original plan (coordination volume with AHITS absent)
- [ ] **Clockify CSV export + daily tap count** (the CC-17/D19 baseline)
- [ ] **Stewart: ADMIN account + the one-page admin-verbs guide (D20)** — he takes the daily 5-minute watch; you keep the Monday variance check
- [ ] **Onboarding one-pager** ("Transfer" is the word · reload-after-deploy ritual · never reinstall) — attempt 1 ran without it; attempt 2 must not
- [ ] **Checklist-template items** for Wintex (Can-Am) + Giddings (Bobcat) — pairs with the §1 schedules smoke
- [ ] **Triage card:** the "someone gets hurt" line
- [ ] **Pilot log:** create the charter §6 appendix; first entry = the attempt-1 record (dates, causes, VOID ruling per D33)

## 4 · Relaunch gate (v2 — replaces the old §5; all four boxes, then go)

- [ ] §0–§3 fully ticked (§1 Part B green; Part A recorded with dates)
- [ ] **Returning phones ritual:** each attempt-1 phone opens online → Outbox confirmed EMPTY (D26 clamps >3-day items to today or 409s — resolve deliberately, never reinstall)
- [ ] Re-onboard the 2–3 attempt-1 operators FIRST (known phones), one-pager in hand, Stewart watching daily → then rolling per CUL005
- [ ] First check lands in the viewer + `/admin/pilot` → **tick it that day — the fortnight clock starts, for real this time**

## 5 · Build queue (sessions resume here; RL-1 shelved per D34)

1. [x] **Order DECIDED (Max, 2026-08-20): UXP-3 Flow Closers FIRST, then UXP-2.** The stall is loop/trust-shaped: 3a silent-loss, 3b honest lockout, 3c Fulfill-notify "ends the last flow that loses to texting", 3h drafts, 3j preselect. **Pre-flight satisfied: photo YES/YES recorded as D36** (library-attach allowed; no-camera never blocks). → [ ] **Next build session = UXP-3**: paste the UXP-3 packet/playbook step WITH `AHITS_UXP3_RIDER_2026-08-20.md`.
2. [ ] **Draft UXP-6 — Admin Setup & Fleet Onboarding** (the un-audited gap behind "equipment creation feels clunky"; scope sketch in the ten-seat review, Seat 5 §4; acceptance: a full rig's equipment stood up in one phone sitting)
3. [ ] The other of UXP-2/UXP-3 · ride-alongs: GAP-4's residual advisory-lock-branch test · GAP-10 bell deep-links · UXP-5 E3/E5 (install weight, poller consolidation)
4. [ ] **P3-NOTIF push decision** rides with UXP-3 (loop closure without pocket-buzz reach still loses to SMS)
5. [ ] **M-1 search OPEN (green-lit 2026-08-20)** — posting drafted: `AHITS_M1_RETAINER_POSTING_2026-08-20.md`; Max posts it to a TS/Next contractor pool (signed + drilled before CC-17 code-start is a hard gate)

## 6 · The horizon (pointers only — do not work ahead of the wave)

**Wave 2 (post-relaunch, weeks 3–8):** correctness session (GAP-1 rate-limiter keying + GAP-2 spec) · GAP-3 secondary-operator packet · **GAP-7 full A6 matrix run EARLY + recorded** · GAP-9 pipeline proofs · M-1 signed + drilled · SEC-1 pack · GAP-8 adoption instrumentation (pass bars written BEFORE data) · day-60 readouts. **Wave 3 (off-season):** **CC-17 Timesheets** behind its all-green gates (M-1 ✓ · A6 matrix ✓ · Clockify taps ✓ · written fallback ✓ · D3 in the resolver · invoice wedge demoed · zero-manual-corrections acceptance) · SHIP-1 if D23's trigger fires · D1 cutover per D35's trigger. **Wave 4 (season 2):** CC-18 decision (no longer RL-1-absorbed — needs its own call) · n 20–40 scale proof · GAP-11 bake-off re-run. Parked with triggers, unchanged: CC-16-proper (D18) · weather stamps · native wrapper · primitives demand-pull only. **Shelved: RL-1 (D34 — revisit triggers in the decision).**

---

*Recently completed: CC-29→CC-34 + CC-16S (07-28/29) · UXP-1 #232/#233/#234 merged + verified (07-30) · bake-off ruling + Undisputed Program (07-30) · pilot attempt-1 run + recorded (07-30→08-20, VOID per D33) · GAP-4 confirmed fixed by #220 (verified 08-20) · ten-seat resume review (08-20).*
