# AHITS — Resume Brief · Where we are / So what / What's next · 2026-08-20

> STATUS: current snapshot (written by the 2026-08-20 ten-seat resume review; `STATUS.md` stays canonical) · UPDATED: 2026-08-20
> READ-WITH: `AHITS_TEN_SEAT_RESUME_REVIEW_2026-08-20.md` (full evidence, Seats 1–10) · `AHITS_PILOT_FLOOR_TODO.md` (refreshed live checklist) · `AHITS_DECISIONS_PASTE_READY_2026-08-20.md` (D30–D32 + candidates, ready to paste)
> Method: ten parallel review agents ("seats") over the full doc corpus + git history + code spot-checks on the working tree, then owner interview (Max, 2026-08-20). Where a dated doc disagreed with the code, the code won (per `00_START_HERE.md` rule 3).

---

## 1 · Where we are

**The code is done and idle; the operation stalled.** Last commit `c0c19f6`, 2026-07-30 — the UXP-1 nav-trust merge train. Nothing has changed in the tree for three weeks. Branch `development` = staging = the fleet's app.

- **Every planned build packet is merged and green:** CC-29 (offline trust floor) → CC-30 (ops floor) → CC-31 (accuracy + `/admin/pilot`) → CC-32 (friction & flow) → CC-16S (public-link security) → CC-33 (simplify & unify) → CC-34 (maintenance speaks) → UXP-1 (nav trust, #232/#233/#234). All deploys green end-to-end. **No code gates block operator #1** (Seat 1, Seat 2).
- **Pilot attempt 1 happened — and stalled.** 2–3 operators (of the charter's 9, project CUL005) used it for roughly a week starting ~07-30, then everyone reverted to group texts/emails. Causes, in Max's words: his bandwidth went to other projects; the daily check "feels like homework"; equipment creation and day-to-day use still feel clunky; general trust issues (owner interview).
- **The Wave-0 gate work never got recorded.** Phone smokes were partially *covered by real field use* but nothing was ticked; the console one-offs (Supabase backup/restore drill, healthchecks.io, CRON_SILENT live-fire, Sentry test events, Mapbox restriction, GitHub include-administrators) are untouched (owner interview; Seat 2, Seat 4).
- **Four strategy docs from 07-30 are still uncommitted** — the bake-off ruling, its appendix, the Undisputed Program, the UX evidence zip — plus the modified TODO. Per `CLAUDE.md`, an untracked doc "does not exist" for the next session (Seat 8 R2).
- **DECISIONS.md is three entries behind the shipped code:** D30/D31/D32 exist only in PR bodies/code comments; D28 is unmarked. Paste block is ready (Seat 3).
- **Good news the docs didn't know:** GAP-4 (the stale-hold cron bug) **is already fixed** — PR #220 (07-28) landed the JS-Date cutoff, un-silenced the catch, and shipped a regression test (`tests/step7-stale-hold-release.test.ts`). The 07-30 TODO/Program carried it forward in error; verified against the code today. Residual: one test for the advisory-lock connect-error branch. Also: the `held/*.tar.gz` cleanup already happened (this review, code check).
- **New owner decision (2026-08-20): RL-1 (Airtable read layer) is SHELVED.** The rest of the Undisputed Program continues.

## 2 · So what

**1. What failed was not the software.** The build program completed on schedule and to spec; the offline architecture demonstrably worked in the field (checks synced from weak-signal use all week). What broke was the operational layer around it — the exact layer Wave 0 was designed to close *before* onboarding: no recorded gate, no onboarding one-pager, no baselines, no delegated support, no monitoring verified. The pilot ran on an unwatched, un-drilled system with a single stretched owner — and lost to the group text, the incumbent the North Star always named as the real competitor (Seats 1, 5, 6, 10).

**2. The attempt-1 pilot window is formally VOID — and that's a clean outcome, not a failure to hide.** By the TODO §5 gate's own letter, the fortnight clock never validly started (gate unticked, one-pager nonexistent, nothing recorded). Don't retro-score it. Keep every row of attempt-1 data (the snapshot-per-day metrics design scores those days correctly forever); annotate the gap in the pilot log; relaunch as a fresh first-operator-live under D17's rolling rule — zero data surgery needed (Seat 10).

**3. Adoption is now the contest, and it's a meaning problem more than a speed problem.** The daily check already beats texting on taps (~35s happy path, verified in the UX review) — yet it *feels* like homework. Speed polish alone won't fix that; what the operator gets back will (the friction-budget's own rule 4: evidence must visibly benefit the person providing it). Meanwhile the materials-request loop genuinely loses to texting (direct-Fulfill notifies nobody — UXP-3c's fix), and the app can't buzz a pocket (push is undecided, P3-NOTIF). And the sharpest *new* intel — **admin-side equipment/fleet setup friction — was never UX-audited at all**; the six-seat review built its fleet from seed data (Seat 5).
**Direct answers to Max's two named frictions:** *homework-feel* → UXP-3's trust/payoff items + a value-return pass on the Today loop (already shipped as CC-14 — the vehicle exists, the payoff needs deepening); *clunky equipment creation* → a new packet (working name **UXP-6, Admin Setup & Fleet Onboarding**) — scope sketch in the ten-seat review, Seat 5 §4.

**4. Trust debt makes sequencing matter.** Operators watched it stall once. A second visible failure — a bell full of stale nags, phantom stock, a botched re-onboard — likely ends adoption regardless of code quality. So: stabilize, verify, *then* re-onboard, with Stewart carrying the daily watch (D20 finally executed) so it doesn't ride on Max's bandwidth again (Seats 8, 10).

**5. RL-1's shelving is coherent — with one hole to mind.** Everything load-bearing survives: M-1, SEC-1, the GAP register, CC-17 and its gates, all monitors except sync-age/falsifier/write-back. What's lost: the shipped-artifact answer to stakeholder drivers #1 (manager reporting) and #2 (Airtable familiarity), and CC-18's "absorbed pending falsifier" logic — CC-18 reverts to parked-undecided. While the pilot is small this costs little; if the shelf turns long-term, driver #1 needs *some* answer (cheapest named fallback: the Looker-on-Postgres rung from the bake-off). Record the shelving as a decision so the register doesn't drift (Seat 6).

**6. The risk board is concentrated and cheap to clear.** One sitting (~2.5h) converts every confirmed total-loss-class exposure into a recorded artifact: commit the docs (5m) → backups + restore drill (35m — the bake-off's "most probable total-loss path," still unprotected while real field data sits in one DB) → GitHub include-administrators (2m) → Mapbox restriction (5m) → monitoring live-fires (40m) → stale-data SQL triage (~1h) → Stewart's account (15m) (Seat 8, order corrected for the GAP-4 finding).

## 3 · What's next

**Phase A — Stabilize & record (one sitting, ~2.5–3h, all Max, no build session).**
1. `git add` the five stranded files plus this review's four, commit + push (exact named-files command in the TODO §0 — never `-A`) — R2, do first.
2. Supabase backups: note plan/retention, enable PITR, one restore drill to a throwaway project, click-path into `PILOT_ROLLBACK.md`.
3. GitHub "Include administrators" ON · Mapbox token URL-restriction · healthchecks.io ping check · CRON_SILENT live-fire · Sentry test buttons · cron-watch (INV-5 quiet, PIN self-clear, TTL releases — observation only; the GAP-4 bug itself is fixed).
4. Paste D30/D31/D32 + mark D28 superseded, then initial-and-paste the three candidates — D33 (attempt-1 void), D34 (RL-1 shelved), D35 (D1 prod-cutover trigger) — all drafted to house format in `AHITS_DECISIONS_PASTE_READY_2026-08-20.md` (numbering verified: DECISIONS.md ends at D29 today).
5. Stale-data triage SQL (end dead deployments, resolve stale alerts) so relaunch day 1 doesn't open on a wall of red.

**Phase B — Relaunch prep (this week, mostly paper).**
1. **Capture both baselines while the crew is still reverted** — the stall made the control arm observable again: group-text volume by category this week; Clockify CSV export + daily tap count. These die the moment re-onboarding starts.
2. Stewart: ADMIN account + one-page admin-verbs guide; he takes the daily 5-minute watch, Max keeps the Monday variance check.
3. Onboarding one-pager ("Transfer" is the word · reload-after-deploy ritual · never reinstall) + triage card line.
4. **The recording smoke session** (~60 min + one overnight): write off the field-proved rows with dates; deliberately run only the true gaps — two-phone Transfer, overnight replay, expired-session park, two-tab queue, report-a-problem offline, portal links, D24 schedules bridge. List in TODO §1, each row pre-marked field-proved vs needs-run.
5. Returning phones ritual: each attempt-1 phone opens online, Outbox confirmed EMPTY before day 1.

**Phase C — Adoption-first build queue (sessions resume here).**
- **Recommended order change, needs Max's ratification: UXP-3 (Flow Closers) before UXP-2 (Sunlight & Touch).** The stall is loop/trust-shaped, not legibility-shaped: UXP-3 fixes silent lost checks (3a), the lying lockout (3b), and the Fulfill-notify hole — "the last flow that loses to texting" (3c) — plus drafts surviving kill (3h) and right-vehicle preselect (3j). Answer the 3g photo pre-flight **YES to library-attach** — that is literally texting-a-photo parity. UXP-2 follows (its AA trust-toast + 44px + Yes-state anchors still matter). If Max prefers the written order (2 then 3), nothing else changes.
- **New packet to draft: UXP-6 Admin Setup & Fleet Onboarding** — the uncovered gap Max named. Acceptance: an admin stands up a full rig's equipment in one phone sitting. Scope sketch: Seat 5 §4 in the ten-seat review.
- Ride-alongs/fillers: GAP-4's residual advisory-lock test · GAP-10 bell deep-links · UXP-5 items E3/E5 (install weight, poller consolidation). Then Wave 2 as written: GAP-1, GAP-3, GAP-7 (full A6 matrix, early), GAP-8 adoption instrumentation, GAP-9, SEC-1, M-1 signed+drilled.
- **P3-NOTIF (push notifications) gets a real decision** during UXP-3: loop closure without pocket-buzz reach may still lose to SMS.

**Phase D — Relaunch (when A+B done; B4's true-gap smokes green).**
Re-onboard the 2–3 attempt-1 operators first (known phones), then rolling per CUL005, one-pager in hand, Stewart watching daily, `/admin/pilot` scoring a clean window from the new first-operator-live. Tick the gate the same day it runs. The fortnight clock starts when the first check lands — and this time it's real.

**Horizon (unchanged from the program):** Wave 2 verification depth → **CC-17 Timesheets off-season behind its all-green gates** (M-1 signed · A6 matrix recorded · Clockify taps measured · written fallback · D3 in the resolver · invoice wedge demoed · zero-manual-corrections acceptance) → D1 prod cutover when its trigger fires → season-2 scale proof. CC-18 and RL-1 wait on their owner decisions.

---

## 4 · Decision queue for Max (everything that needs only your say-so)

| # | Decision | Default if you just nod |
|---|----------|------------------------|
| 1 | Commit the stranded + new docs (Phase A1) — want the exact command run for you? | You run it from TODO §0 |
| 2 | Paste D30–D32 + D33/D34 candidates | Paste-ready file, ~5 min |
| 3 | Ratify: attempt-1 window VOID, data kept, relaunch = new first-operator-live | Yes (Seat 10's reasoning) |
| 4 | Ratify: UXP-3 before UXP-2 + draft UXP-6 next session | Yes (Seat 5's reasoning) |
| 5 | 3g photo pre-flight: library-attach allowed? no-camera submit path? | YES / YES |
| 6 | M-1 retainer search: open now or after relaunch? | Open now (it's a posting, not a hire) |
| 7 | RL-1 shelf: revisit trigger? | Re-decide when a manager asks for a view twice in one month |

*Sources: Seats 1–10 in `AHITS_TEN_SEAT_RESUME_REVIEW_2026-08-20.md`; owner interview 2026-08-20; git log + working-tree checks 2026-08-20. Corrections this review made to its own seats' claims are logged in that file's §0.*
