# AHITS — Ten-Seat Resume Review · 2026-08-20

> STATUS: review record (evidence base for `AHITS_RESUME_BRIEF_2026-08-20.md`) · WROTE: 2026-08-20
> METHOD: ten parallel review agents ("seats"), each with a focused charter over the full doc corpus (root + `docs/archive/`), git history, and code spot-checks against the working tree — the same seat pattern as the 2026-07-28 six-seat review and the 2026-07-29 UX review. Owner interview (Max) ran before the fleet: pilot attempt 1 started ~07-30, 2–3 operators for ~a week+, then stalled (owner bandwidth + group-text reversion + trust); friction named: daily check "feels like homework," equipment creation/day-to-day clunky; Wave-0 work partially covered informally, nothing recorded; **RL-1 SHELVED by owner decision 2026-08-20**; otherwise the Undisputed Program continues.
> The seats: 1 Chronicler (session chronology) · 2 Ledger Auditor (STATUS.md) · 3 Decisions Keeper (DECISIONS.md) · 4 TODO Consolidator (open-items register) · 5 Adoption Analyst (UX corpus vs the stall) · 6 Strategist (bake-off + program vs RL-1 shelving) · 7 Surveyor (stack/rules/schema operating manual) · 8 Risk Auditor (antagonist) · 9 Cartographer (ID atlas) · 10 Pilot Trustee (charter, metrics, relaunch).

---

## §0 · Editor's corrections (checked against code/tree 2026-08-20 — read before citing a seat)

1. **GAP-4 is FIXED, contra Seats 4/8/9 and their sources.** The 07-30 TODO §3 and Program §1 carried "GAP-4: fix the stale-hold cron bug" forward in error. Verified today: PR **#220** (merged 2026-07-28, pre-pilot) binds the cutoff as a JS Date, un-silences the catch (console.error + Sentry), and ships `tests/step7-stale-hold-release.test.ts` (147 lines, incl. a control case). Code comments at `src/app/api/cron/dispatch/route.ts:261-264` document it. **Residual GAP-4 scope: one test for the advisory-lock connect-error branch** (string exists in the route, referenced by no test). Consequences: Seat 8's R4 downgrades sharply — holds released correctly *throughout* attempt 1; no accumulated-stale-hold "release spam" trap exists; OPS-e's cron watch becomes observation, not a blocker. Seat 8's flagged "doc conflict" resolves the same way: #220 *is* the GAP-4 fix.
2. **Seat 5's "NS-10 unbuilt / dashboard is a static 4-link menu" is STALE** — sourced from the North Star doc, which pre-dates CC-14. The **Today view (NS-10) SHIPPED** as CC-14 (PRs #190–#193, live on staging) with the one-contextual-action pattern and "You're set" payoff. Seat 5's underlying point survives translation: the *homework-feel* is a value-return problem, and the fix is deepening what the Today loop gives back (close-out payoff, NS-11-shaped), not building a Today view that already exists.
3. **Seat 4's CLEAN-3 (`held/*.tar.gz`) is already done** — `held/` contains only the two D4 DROP patches + README (verified today). The worktree cleanups (CLEAN-2) remain unverified from here (outside the connected folder).
4. **Seat 1's flag confirmed:** the UXP1e handoff's "ALL of UXP-1 … NONE merged" is stale; git shows #232/#233/#234 all merged 2026-07-30 (`c0c19f6` closes the train).
5. Seat quotes below are otherwise reproduced as delivered; where a seat marked a claim NEEDS-CHECKING, that marking stands unless §0 resolves it.

---

## Seat 1 — The Chronicler · Final Working Month, 2026-07-10 → 2026-07-30

### 1 · Timeline (one line per session)

- **07-10** — W0-10 legacy-operator retirement built/reviewed; PR-4a live on staging; **4b′/4c HELD** (D4); prod cutover deferred (D1); 3 Wave-0 patches delivered; field-feedback fix plan (AHITS_SESSION_HANDOFF_2026-07-10.md).
- **07-11** — Doc-corpus cleanup PR #175 merged; CC-08 hubs-inbound found already shipped, smoked (…07-11.md).
- **07-11b** — CC-09 Awaiting-Pickup PR #179 merged (…07-11b.md).
- **07-12** — CC-11 admin-as-operator PR #181 merged; 8-agent self-review fixed 6 gaps; D8 flagged; first admin-override merge precedent (…07-12.md).
- **07-15** — CC-22 ops rider (cron heartbeat + Sentry) PR #182; `AHITS_AHITS_` secret-prefix lesson (…07-15.md).
- **07-16** — CC-23 design tokens/primitives PR #183 + CC-24 Android-device addendum PR #184 (…07-16.md).
- **07-17** — CC-24 subtraction + glossary PR #185; D9 naming rules (…07-17.md).
- **07-18** — CC-25 live-camera QR PR #186 — reflection-increment sequence complete (…07-18.md).
- **07-19** — CC-12 perf PRs #187/#188/#189; D10 defers admin monolith splits (…07-19.md).
- **07-19b** — CC-14 Today view PRs #190–#193 + test fix #194; D11 re-defers glossary cluster (…07-19b.md).
- **07-19c** — CC-26 daily-check viewer PR #195; D12; **pre-pilot code gates done** (…07-19c.md).
- **07-20** — Charter signed; D5/D6/D7 resolved; D13 A6-Lite gate, Android pass green; start set Mon 07-27 pending iOS; CC-27 FulfillmentChecklist PR #196 merged (…07-20.md).
- **07-21 / 21b** — CC-15 map PRs #197/#198 merged + smoked (D14); copy-link invites PR #200; iOS A6-Lite the sole gate (…07-21.md, …07-21b.md).
- **07-22** — Launch-week docs sync per launch-handoff Appendix A; D15 decouples EMAIL_SANDBOX flip; PR #173 closed; batch6a found still pending (…07-22.md; AHITS_LAUNCH_HANDOFF_2026-07-27.md is the day-by-day plan).
- **07-28 (review)** — **07-27 launch did not happen** (ops delays → rolling start, D17); six-seat review + owner interview → D16 staging-is-home, D18–D25; packets CC-29–33/CC-16S written; iOS A6 retro-recorded PASSED (…07-28.md).
- **07-28 CC-29** — Offline trust floor PRs #202/#203/#205 merged; D26/D27; **on-device smoke = gate before first operator** (…CC29-BUILD.md).
- **07-28 CC-30** — Pipeline hardening #204 + server-side eyes #206; Max live-fire checklist a–i created (…CC30.md).
- **07-28 CC-32** — Glossary #209 merged (D11 EXECUTED); #210/#211 blocked on red `development`; D28 six-tab nav (…CC32.md).
- **07-28 CC-31** — Accuracy floor + `/admin/pilot`; PR-1 collided onto `development` (parallel-session incident); green-fix #213; #214/#215; shepherded CC-32 to full merge; latent `make_interval` cron bug found (…CC31.md). *[§0-1: fixed same window via #220.]*
- **07-29 CC-33** — #223 dead-code/forward-removal (D21) + #224 unified Transfer (D22) merged; two-phone Transfer smoke owed (…CC33.md).
- **07-29 CC-34 s1/s2** — #226/#227 merged (D29); PR-3 #229 schedules open+green with a pre-merge SELECT gate (…CC34.md, …CC34-session2.md); later merged (STATUS.md).
- **07-29 UXP-1** — #232 (1a·1b·1g) + #233 (1c·1d·1f) open+green; 1e dropped as designated-droppable; D30/D31/D32 held for Max's paste (…UXP1.md).
- **07-30 UXP-1e** — #234 back-button guard built; 14/14 external authed verification (…UXP1e.md). Same day: merge train landed all three; bake-off + Undisputed Program written (STATUS.md; AHITS_UNDISPUTED_PROGRAM_2026-07-30.md).

### 2 · Last known good state (2026-07-30 freeze)

`development`=staging=the fleet's app, through **UXP-1 fully merged**: #232 (tip `3264175`), #233 (`9d0ee18`), #234 (`4e716e8`), sequential merge train, every `deploy.yml` green, no migrations (STATUS.md). **Contradiction flagged:** UXP1e's "ALL of UXP-1 … NONE merged" is **STALE** — written pre-train, superseded same day by STATUS.md and git log. **DECISIONS.md still ends at D29** — D30/D31/D32 exist only in code/PR bodies; D28 still reads ACTIVE, not superseded (verified by grep). Pilot-floor queue CC-29→CC-34 all merged; no operator formally onboarded (rolling start). W0-10 4b′/4c still HELD (D4); prod deferred (D1).

### 3 · Owed items, final three handoffs (owner: Max unless noted)

**CC34-session2:** ⛔ "Run the stale-damage count SELECT read-only against staging… **If > 15 rows, triage the list BEFORE deploy**" — *contradiction:* #229 merged anyway; STATUS carries the SELECT as a residual, so the bounded 5-nags/run cron arm is live un-triaged. Evening staging smoke: 90-day Wintex schedule on a carrier <1 min → Upcoming; back-dated → Overdue + bell; close unit repair to active deployment ≤3 clicks; "Out of service" → "In repair — In Progress", clears on close. Remove worktree `~/Downloads/ahits-cc34-pr3-worktree` after merge.

**UXP1:** "evening staging smoke of both PRs → merge #232 then #233 → **paste D30/D31/D32 into `DECISIONS.md`, mark D28 superseded-by D30**" (merge done; **paste never done**). Per-item smokes owed: 1a five tabs visible 320–430px iOS+Android; 1b no first-install toast / dismissible update toast; 1c landscape keeps bottom-nav shell, no mid-use swap; 1d JS-blocked load, no hydration warning, branded 404/error escapes; 1f all five drawers — header visible, X hits X not the bell; 1g 90s idle, zero phantom-sync flashes. Then: build 1e (done 07-30) → **UXP-2 Sunlight & Touch** (never started).

**UXP1e:** "staging smoke + merge #232, #233, #234; paste D30–D32; then UXP-2" (merges done; paste + smokes not). "Remaining leg (only one left): on-device staging smoke — daily-check step 2 → hardware Back → step 1, answers still populated, page did NOT reload." DetailDrawer #233/#234 conflict: resolved (auto-merged, STATUS.md).

Standing ledger beyond these: CC-29 airplane-mode/overnight-replay smoke (the first-operator gate), CC-33 two-phone Transfer smoke, CC-30 live-fire a/b/c/d/h(+i) (e/f/g done per STATUS.md), CC-31 retroactive cron smoke, preview-service deletion, Stewart admin #2 (D20).

### 4 · Patterns for the owner

- **Packet/rider discipline:** every build ran a numbered CC-##/UXP-## paste packet with pre-flight riders (RIDER B/C, AHITS_PACKET_ERRATA_2026-07-29.md), scope guards, designated-droppable items, step-7 grep anchors.
- **Multi-agent seat reviews** (Antagonist/Calibration/Operator-lens/SRE/Integration/Fable, 07-28 + 07-29 UX) generated the decision queue and caught real bugs pre-merge; riders' blocking fixes were consistently real.
- **Merge-is-deploy + solo-owner admin-override merges** (6+ consecutive since CC-11); M-1 second maintainer is the named keystone gap (AHITS_UNDISPUTED_PROGRAM_2026-07-30.md).
- **The failure mode is visible in the record:** code sessions closed clean, but every one exited by assigning Max physical-phone smokes; the owed-smoke ledger only grew — Wave 0 of the Undisputed Program is literally "clear the ledger." That, plus D30–D32 never pasted, is where the thread dropped when Max's bandwidth went.
- **Parallel-session incidents** (CC-31 direct-to-`development`; CC-32 `git add -A` scooping) produced durable rules: explicit-path staging, isolated worktrees, uniquely-named handoffs.
- RL-1 (Wave 1 of the Undisputed Program) is now owner-shelved; the rest of the program — Wave 0 ledger-clearing first — remains the written resume path.

---

## Seat 2 — Ledger Audit of STATUS.md

### 1. Structure map

STATUS.md (~73KB, 103 physical lines; lines 10/15 are multi-thousand-word monsters): **Launch box** ("pilot start POSTPONED → ROLLING START", D17); **_Last updated_ line** (2026-07-30 UXP-1 merge train; embeds the UXP-1/CC-34/CC-33/CC-31 residuals + "trust code and git log over this file"); DECISIONS guard note; **§1 one-paragraph state** (CC-01→CC-27 + charter, stale "PILOT GO PENDING ONE GATE" tail); **§2 Environments** (staging merged set; production = branch current, NO prod env, D1); **§3 Active work** (rows: UXP-1, CC-34, CC-33, CC-31, CC-32, CC-30 incl. the ☐ live-fire checklist a–i + "findings a future session must not rediscover", CC-29, CC-15, copy-link, CC-26, A6-Lite, CC-22 [superseded], CC-12 PR3, CC-14, CC-23/24 eyeballs); **§4 Next actions** (items -2, -1 "07-28 RE-BASELINE", 0–3); **§5 Open decisions**; **§6 Do-not-touch/deferred**; **§7 doc map**; **SESSION CLOSE — do all 7**. No standalone owed-smoke section — owed items live inline in §1/§3/§4, consolidated in AHITS_PILOT_FLOOR_TODO.md.

### 2. THE LEDGER (deduplicated)

**(a) Phone/device smokes — Max, physical phone, staging** (TODO §1 = "the HARD first-operator gate"):
1. CC-29 trust floor: airplane→reconnect syncs once; photo-wedge + Discard; overnight replay under day performed; forced-expired online submit; session-renewal boundary + force-logout (Launch box; STATUS.md §3).
2. CC-33 two-phone Transfer: entire-rig accept flips holder; selected-gear moves item; no "Handoff" strings (§1/§3; §4 -1).
3. CC-34 3a/3c/3d: real Wintex/Giddings schedules (D24 bridge); close repair to active deployment; "In repair" caption; plus PR-2's airplane-mode report-a-problem smoke (§3; §4 -1).
4. UXP-1 rows: 1a five tabs 320–430px; 1b update toast; 1c landscape keeps shell; 1d cold-load/404, no hydration warning; 1f drawer X hits X not bell (§3 SMOKE-OWED; §4 -2c).
5. UXP-1e on-device Back smoke — only leg left after the 14/14 sandbox pass: Back → step 1, answers intact, no reload (§3; §4 -2b).
6. Standing re-confirms, next device pass: CC-12 PR3 parity; CC-23/24 eyeballs (§3). Portal dead/live-link smoke (TODO §1B only).

**(b) Console/ops one-offs — Max** (§3 CC-30 live-fire checklist "NONE has ever been attempted"; e/f/g ✅):
1. ☐a Supabase backups + ONE restore drill to throwaway; click-path into PILOT_ROLLBACK.md ("last big unprotected risk").
2. ☐b healthchecks.io real ping seen; grace <30 min.
3. ☐c CRON_SILENT live fire (pause >30 min → banner; resume clears).
4. ☐d Sentry test buttons → events with request_id.
5. ☐h Mapbox token pk. + URL-restricted to staging. ☐i optional /api/health uptime check.
6. CC-31 PR-1 retroactive staging smoke (cron force-run + bell — it bypassed the gate via the branch collision) (§3 residual b); TODO §2's "one cron watch" ticks it + CC-16S.
7. Stale-damage count SELECT read-only vs staging (query in #229 body; >15 → triage) (§1/§3 CC-34).
8. GitHub "Include administrators" ON (TODO §2 only — "the last open door").
9. Stewart ADMIN account (D20) + admin-verbs guide (§4 -1; TODO §4).

**(c) Desk pastes & doc chores — Max:**
1. Paste **D30/D31/D32** into DECISIONS.md + mark **D28 `Superseded-by: D30`** — in code/PR bodies only; "Max writes these, not the session" (line 10; §2/§3; §4 -2a).
2. Fill the blank "→ result:" slots as CC-30 checklist items run (§3).
3. Owner baselines BEFORE more operators (§4 -1; TODO §4): Clockify CSV + daily tap count (D19 rider 1); group-text volume baseline (the control arm, review §6.1); Wintex/Giddings checklist-template items; onboarding one-pager (D17); triage card "someone gets hurt" line + print it (§4 item 2c).

**(d) Build-session items:**
1. **GAP-4**: cron step-7 stale-hold release bug + first cron-route test incl. the advisory-lock-connect-error 500 branch (§3; TODO §3). *[§0-1: core bug FIXED via #220 + regression test; residual = the advisory-lock branch test only.]*
2. check-migration-safety.sh macOS false-green — unfixed, "own packet"; trust only CI (§3 CC-30 findings). Watch: migration-safety never ran on a real migration; all-zeros skip never fired.
3. Queue: UXP-2 Sunlight & Touch next (§4 -2), then secondary-operator Today packet pre-CC-17 (§3 CC-31 non-goals; §4 -1).

**(e) Cleanup:**
1. Delete previews `ahits-web-app-preview-cc31-pr3`/`-pr2` (gcloud, us-central1) (§3 residual a; §4 -1).
2. Remove `ahits-cc31-worktree` + `ahits-cc34-pr3-worktree` (TODO §2 only). *[§0-3: the held/ tarballs listed alongside are already gone.]*

### 3. Parked items with named triggers

- Full A6 matrix (edge rows 20–22 + all-column ceremony + CC-25 fuller camera acceptance) — **before CC-17 ships** (§3; §4 item 2).
- CC-16-proper — **D18** (§4 -1). Expired-link persistence sweep — **expired-link volume** (§3 CC-31).
- admin/deployments + admin/inventory splits — **D10 demand-pull, owner CC-18**/first touching packet (§1/§3).
- 4 primitives (MobileCardTable, EntityCard, PageHeader, FilterBar) — **demand-pull, never a standalone sweep** (§4 item 1).
- EMAIL_SANDBOX flip — **Resend domain DNS-verified AND both D6 audits pass** (D15; §4 item 2b).
- CC-15 weather stamps — **post-launch** (§3). CC-20 #6 alertLink branches — PARKED (§1).
- Prod cutover — **D1**; needs `AHITS_PROD_MAPBOX_TOKEN` (§6/§3). W0-10 4b′/4c — **HELD, D4**, in `held/` (§6). Real-time GPS — **anti-goal D2** (§6).
- §5 open: governance sweep (push vs 45s polling; CARRY-*) → workplan §13; CC-21 mounted-units spike (stale — closed by D24, still listed).

### 4. Session-close contract (hold every build session to it)

"Do all 7" + two preamble rules: **§1≡§2 invariant** (§2's code-grounded list wins) and **parallel sessions** (first-started session owns STATUS/DECISIONS; others close handoff-only, uniquely named). Steps: (1) update STATUS §1/§3/§4 + date line; (2) append/supersede Dn in DECISIONS.md; (3) fix 00_START_HERE/INDEX rows; (4) dated handoff referencing Dn; (5) commit+push docs; (6) `git status` clean, docs in `git ls-files '*.md'`; (7) **verify every claimed merge via one grep acceptance anchor per packet** — correct §1/§2 before closing. Note: CLAUDE.md says "do all 6"; STATUS says 7 — align.

### 5. Stale/wrong vs 2026-08-20 reality — a STATUS refresh must change

1. **_Last updated_**: 2026-07-30, three weeks old — its own text mandates updating.
2. **Launch box**: "ROLLING START… REMAINING GATE before first operator" is now false — the pilot **started** (2–3 operators, ~a week+) *without* the recorded gate, then **stalled**; reverted to group texts. Rewrite as started-then-stalled.
3. **§1 tail**: "🟡 PILOT GO PENDING ONE GATE — start Monday 2026-07-27" + "sole outstanding item = iOS A6-Lite" contradict the launch box (iOS passed, retro-recorded 07-28). Purge the pre-start framing. §2 stays (nothing merged since 07-30).
4. **§3**: A6-Lite "iOS ☐ STILL REQUIRED before the 07-27 start" — stale, passed. Wave-0 smokes done "informally, nothing recorded" — record which passed with evidence; unevidenced stays owed. CC-30 checklist mostly untouched — enter any informal results in the "→ result:" slots.
5. **§4**: dead dates (Fri 07-24 target; Monday 07-27 start) and moot pre-start gates in items 0–2 — collapse; re-confirm "NEXT PACKET: UXP-2" against the stall.
6. **RL-1 SHELVED today**: needs a superseding Dn with owner sign-off; TODO §6 Wave-1 items 1/3/5 (RL-1, D33/D34 pastes, 60-day falsifier date) moot/changed.
7. **§5** still lists the CC-21 mounted-units spike as open; it was CLOSED 07-28 (template config, no model) — remove.
8. Group-text baseline (TODO §4) is unrecoverable as a *pre-pilot* control arm — recapture post-stall.

---

## Seat 3 — Decisions Keeper

**File state:** DECISIONS.md ends at **D29**. D30–D32 exist only in code comments/PR bodies/STATUS — the register is 3 entries behind the shipped repo.

### 1 · Register D1→D29 (DECISIONS.md)

- **D1** · Prod cutover · **ACTIVE (DEFERRED)** · no prod standup; pilot lives on staging · trigger: undefined — GAP-6/D34 candidate defines it.
- **D2** · Map scope · **ACTIVE, permanent anti-goal** · attestation-GPS only; last-known positions; **never** real-time tracking.
- **D3** · Admin-as-operator excluded from money loop · **ACTIVE** · cron half shipped (PR #181); resolver half = HARD CC-17 acceptance criterion.
- **D4** · W0-10 retirement 4a→4b′→4c · **ACTIVE** · DROP patches HELD in `held/` · trigger: 4a soaked + §11 go/no-go green.
- **D5** · No launch onto static menu · **RESOLVED (Option A)** · pilot start = charter + A6-Lite (per D13); CC-28 bridge permanently moot.
- **D6** · EMAIL_SANDBOX flip after two audits · **ACTIVE, execution pending** · rule stands; timing superseded by D15.
- **D7** · Second pilot-hours contact · **RESOLVED** · Stewart Arbuckle, numbers confirmed.
- **D8** · CC-11 sequencing note · **RESOLVED / superseded-by D3 note** · provenance only.
- **D9** · Glossary conventions · **ACTIVE** · "Fulfill" = stock-moving only; Dismiss; Staged.
- **D10** · Admin-monolith splits deferred · **ACTIVE** · demand-pull by the first packet touching those surfaces.
- **D11** · Fulfill/Pick-up/Check-out/Claim sweep · **EXECUTED** (CC-32 PR-1 #209) · vocabulary locked verbatim.
- **D12** · CC-26 alert deep-links; deployment-drawer reach transitive **by design** · **ACTIVE** · do not "fix" into a direct open.
- **D13** · Pilot gate = A6-Lite; full 28×5 matrix PARKED · **ACTIVE** · Android+iOS Lite passed · trigger: full matrix **before CC-17 ships**.
- **D14** · CC-15 map pre-pilot under freeze · **EXECUTED** (#197/#198).
- **D15** · Sandbox flip decoupled from Day 1 · **ACTIVE** · gated on DNS-verified Resend domain + both D6 audits.
- **D16** · **STAGING IS HOME** · **ACTIVE** · de-facto-prod posture; merge-is-deploy; does not un-defer D1.
- **D17** · Pilot start → ROLLING · **ACTIVE** · metrics window starts at first-operator-live; iOS A6-Lite retro-recorded PASSED.
- **D18** · CC-16 split · **ACTIVE** · CC-16S shipped; CC-16-proper PARKED · trigger: a named user who can't sustain the installed app, or missed-check chase needs a no-auth path.
- **D19** · CC-17 = FULL Clockify replace · **ACTIVE** · riders: tap-count parity measured first; invoicing-wedge first; MID-3 in DoD; import decision at design meeting; D13/D3/FND-8 gates stand.
- **D20** · Stewart = ADMIN #2 + admin-verbs one-pager · **ACTIVE** (execution owed by Max).
- **D21** · Forward→Operator removed; dead code deleted · **EXECUTED** (#223) · plus my-deployment anti-regrowth rule.
- **D22** · One "Transfer" entry; entire-rig = handoff, **ownership flips** · **EXECUTED** (#224) · owed: Max's two-phone staging smoke.
- **D23** · NS-9 trigger MET (5+/month carrier shipments) · **ACTIVE** · tracking builds fresh **post-CC-17**; Shipment model dormant; SHIP-1 trigger-gated.
- **D24** · Mounted units: NO new model · **ACTIVE** · checklist items + named MaintenanceTasks on carrier · revisit: unit dismounts or CC-17 per-unit cost demand.
- **D25** · Evidence lane = passive capture; NS-1 probe RETIRED · **ACTIVE** · revisit: ops-specific audit request arrives.
- **D26** · Late-synced check keeps original businessDate (3-day past window; 409 collisions, never merged) · **ACTIVE, shipped** (#203).
- **D27** · Sliding session renewal, 14-day authAt cap · **ACTIVE, shipped** (#205).
- **D28** · SIX-tab bottom nav (Map promoted) · **ACTIVE on paper — superseded in fact by D30** (unmarked) · shipped CC-32 PR-3 #211.
- **D29** · Maintenance: one "Report a problem" verb, admin triage, schedules = value center · **ACTIVE, shipped** (CC-34).

### 2 · Pending pastes

D30 (five-tab nav, supersedes D28) · D31 (quiet auto-apply update prompt) · D32 (device-class operator shell) + mark D28 `Superseded-by: D30`. 1e (#234) needs **no** entry (instructed). **D33 candidate (RL-1 no-write-back): RL-1-coupled — do NOT paste as active while shelved**; record the shelving itself instead. **D34 candidate (GAP-6, the D1 prod-cutover trigger): RL-1-INDEPENDENT — still record.** Trigger = earlier of (a) CC-17 code-complete before first real payroll period, (b) >20 operators, (c) UK-parent IT requirement. Full paste-ready text: `AHITS_DECISIONS_PASTE_READY_2026-08-20.md`.

### 3 · Decisions today's reality touches

- **D17 rolling start — RE-CONFIRM.** Pilot started then stalled. Does the metrics clock reset? (Seat 10: attempt-1 window void; relaunch = new first-operator-live.)
- **D18 CC-16-proper trigger — EVALUATE, don't re-litigate.** Adoption friction is exactly its named trigger class.
- **D19 CC-17 — STANDS.** Gates unchanged; the tap-count baseline still unrecorded.
- **D23 Shippo — STANDS.** · **D5/D6+D15/D7 — STAND** (re-confirm execution state only) · **D16 — STANDS, reinforced** · **D22 — two-phone smoke still owed.**

### 4 · Settled — do NOT re-open when re-planning

D2 (no live tracking) · D1 (no reactive prod standup) · D16 mechanics · D4 (held DROPs) · D3 (CC-17 exclusion) · D9+D11 (locked vocabulary) · D12 (transitive drawer reach) · D21 (removal + anti-regrowth) · D22 (rig transfer = ownership flips) · D24 (no MountedUnit model) · D25 (NS-1 retired) · D26/D27 (shipped semantics) · D5's CC-28 (permanently moot) · D10 (demand-pull splits) · five-tab count (D30's snapshot test enforces it once pasted).

---

## Seat 4 — Consolidated Open-Items Register

Sources: **T** = AHITS_PILOT_FLOOR_TODO.md · **U** = AHITS_UNDISPUTED_PROGRAM_2026-07-30.md · **E** = AHITS_PACKET_ERRATA_2026-07-29.md · **S** = STATUS.md. Coverage: **PC** = possibly-covered by the week of real use — needs recording only · **DU** = definitely untouched. CC-15 rider: fully executed, nothing open. Landing-order smoke rows dedupe into §1.

### 1 · Phone-smoke rows (Max phone; one ~60-min sitting + overnight) — (T §1)

| ID | Item | Effort | Coverage |
|---|---|---|---|
| SMOKE-1 | Five tabs visible both platforms; rotate → shell doesn't swap | 3m | PC |
| SMOKE-2 | Fresh install no toast; post-deploy toast w/ X, auto-hides | 5m | Half-PC; post-deploy leg DU — no deploy since freeze |
| SMOKE-3 | Wrong URL in PWA → branded 404 → Home | 2m | DU |
| SMOKE-4 | Back gesture on check step 2 → step 1, answers intact, no reload (closes 1e) | 3m | PC — never recorded |
| SMOKE-5 | Admin drawers on phone: header visible, X closes (not bell) | 3m | PC |
| SMOKE-6 | Today idle 60s → no "Syncing 0…" flicker | 2m | PC |
| SMOKE-7 | Airplane → submit check → reconnect → syncs exactly once | 5m | PC — field weak-signal use almost certainly hit this |
| SMOKE-8 | Weak signal → "saved, will sync" ≤12s, no stuck spinner | 5m | PC |
| SMOKE-9 | Two tabs, 3 queued, reconnect → no false Failed; Outbox Discard | 8m | DU |
| SMOKE-10 | Force-expired session online submit → saved → lands after sign-in | 5m | DU |
| SMOKE-11 | Admin force-logout boots phone next tap | 3m | DU |
| SMOKE-12 | Overnight replay: evening airplane check syncs next AM under day PERFORMED | overnight | PC — plausibly occurred; never verified |
| SMOKE-13 | Two-phone Transfer: entire rig + selected gear; nothing says "Handoff" (CC-33 owed) | 10m | DU |
| SMOKE-14 | Report a problem airplane-mode: scan → photo+note → task+photo+bell; Out-of-service → In Maintenance (CC-34 PR-2) | 10m | DU |
| SMOKE-15 | Drawer truth: damage chip in deployment drawer → exact task (CC-34 1a) | 3m | DU |
| SMOKE-16 | Schedules (D24 bridge): real Wintex-90-day + Giddings rows → due dates; close repair ≤3 clicks; operator sees "In repair" (CC-34 3a/3c/3d) | 10m | Partially PC — creation touched ("clunky"); unrecorded |
| SMOKE-17 | Portal: dead link safe · live link works · double-tap lands once | 5m | DU |

### 2 · Console/ops one-offs (Max console; record in STATUS §3) — (T §2)

| ID | Item | Effort | Coverage |
|---|---|---|---|
| OPS-a | Supabase backups + ONE restore drill; click-path into PILOT_ROLLBACK.md — "the most probable total-loss path" | 15–30m | DU |
| OPS-b | healthchecks.io: real ping seen, grace <30m | 5m | DU |
| OPS-c | CRON_SILENT live fire: pause >30m → banner → clears | ~40m elapsed | DU |
| OPS-d | Sentry: both test buttons → events w/ request_id | 10m | DU |
| OPS-h | Mapbox token pk. + URL-restricted to staging | 10m | DU |
| OPS-e | One cron watch: TTL holds released · INV-5 quiet · PIN lock self-clears | 15m | DU *[§0-1: observation now, not blocked — GAP-4 fixed]* |
| OPS-f | GitHub "Include administrators" ON — last open door | 2m | DU |
| OPS-g | Stale-damage count SELECT from #229's body | 5m | DU |
| OPS-i | (optional) uptime check on /api/health | 10m | DU |

### 3 · Desk pastes & commits — (T §3)

| ID | Item | Effort |
|---|---|---|
| DESK-1 | Paste D30/D31/D32 + mark D28 Superseded-by: D30 (verified absent today) | 10m |
| DESK-2 | Commit the untracked 07-30 files + modified TODO (named files, never `-A`) — untracked docs "do not exist" | 10m |

### 4 · Owner paper items — (T §4)

| ID | Item | Effort |
|---|---|---|
| PAPER-1 | Clockify CSV export + daily tap count (CC-17/D19 baseline) | 20m |
| PAPER-2 | Group-text baseline: week's volume by category — the control arm is LIVE again post-stall | 30–60m |
| PAPER-3 | Checklist-template items: Wintex→Can-Am, Giddings→Bobcat | 30m |
| PAPER-4 | Stewart ADMIN account + admin-verbs guide (D20) | 30m |
| PAPER-5 | Onboarding one-pager (operators onboarded without it; artifact absent) | 1h |
| PAPER-6 | Triage card: the "someone gets hurt" line | 15m |

### 5 · Build items

| ID | Item | Effort |
|---|---|---|
| BUILD-1 | ~~GAP-4 cron fix~~ *[§0-1: FIXED via #220 + regression test]* → residual: advisory-lock connect-error branch test | 1h |
| BUILD-2 | GAP-6/W1-3: write D1 prod-cutover trigger into DECISIONS (D34 candidate) — survives RL-1 shelving | 1h |
| BUILD-3 | UXP-2 Sunlight & Touch (playbook Step 6) — Wave 1 | 1 session |
| BUILD-4 | A6 full matrix — PARKED to Wave 2/GAP-7, trigger pre-CC-17 | 4–6h |
| BUILD-5 | M-1 second-maintainer search opens — hard CC-17 gate | 1–2h to post |
| ~~W1-RL1~~ | RL-1 read layer — **SHELVED 2026-08-20 (owner)**; record as a decision | — |

### 6 · Cleanup — (T §2)

CLEAN-1 delete Cloud Run previews `ahits-web-app-preview-cc31-pr3`/`-pr2` (5m) · CLEAN-2 remove `ahits-cc31-worktree` + `ahits-cc34-pr3-worktree` (5m, unverified from here) · ~~CLEAN-3 held/*.tar.gz~~ *[§0-3: already done]*.

**Gate meta-items (T §5):** GATE-1 §1 checked (hard gate) · GATE-2 onboard operator #1 with one-pager → fortnight clock — both re-opened by the stall.

### Do-first 5, given the stalled pilot

1. **OPS-a backups + restore drill** — real operator data exists and is unprotected; the one irreversible loss path.
2. **PAPER-2 group-text baseline** — the stall put the control arm back in production; capture now or lose it.
3. **DESK-2 + DESK-1 commits/pastes (~20m)** — the program doc, bakeoff, and D30–D32 exist nowhere durable.
4. **Recording sweep of §1** — tick the field-proved rows with dates ("Schrödinger's gate" lesson), then run only the true gaps (~30m).
5. **~~BUILD-1 GAP-4~~** → *[revised per §0-1]* **PAPER-4 Stewart admin** — the bandwidth fix; the named delegation mechanism (D20) that was never executed.

---

## Seat 5 — Adoption Analyst · Friction Map vs. the UX Queue

*[Read with §0-2: NS-10/Today view is SHIPPED (CC-14); this seat's "unbuilt/static menu" lines are stale. Its recommendation is re-based in the Resume Brief: deepen the Today loop's value-return rather than build it.]*

### 1 · UXP queue state

**UXP-1 Nav Trust — SHIPPED.** All three PRs merged 2026-07-30. Closed the four stacked "disappearing nav" mechanisms plus back-button data loss: five-tab bar (1.1/D30), quiet auto-apply update prompt (1.2/D31), mobile-first pre-mount + branded error/404/loading boundaries (1.3), device-class shell (1.4/D32), useHistoryGuard (1.5), drawers below AppBar with real close-X (1.6), phantom "Syncing 0" flash silenced (E1). Residuals owed: D30–D32 paste, on-device smoke rows.

**UXP-2 Sunlight & Touch — pure presentation, lowest regression.** Anchors: tokenize info blue so all eight offline "queued" trust toasts pass AA (D-02); visible daily-check Yes selected state + focus outline (D-04). Riders: operator map legend + shape-redundant recency (D-05), type/label floor (D-06/07/10), honest glyphs incl. labeled "Report a problem" (D-08/F-07), remaining 44px pass incl. the 37px daily-check Back/Next (C6), odometer numeric keypad (C8), stepper jiggle + admin-table scroll cue interim (C13/C5), aria-labels (D-11), portal border/16px fixes (B-5/C14).

**UXP-3 Flow Closers — the loop-closure packet; two server-touching items.** Not droppable: GPS can never hold a check hostage / silent lost submissions (3a/F-02), lockout tells the truth (3b/G-1), MATERIAL direct-Fulfill notifies the operator + admin toast names the outcome (3c/F-04/F-03). Riders: project select + review-summary step in both deployment builders (3d/F-10/§3.5), badge recount + scroll-to-error + tappable Done chip (3e/F-06/F-05/F-08), composer defaults MATERIAL (3f/F-09), photo policy per Max pre-flight (3g), daily-check drafts survive kill/reload (3h/F-11), banner diet (3i/A9), unchecked-vehicle preselect (3j).

**UXP-4 One Design System — paced ride-alongs** (DialogShell, ALL-CAPS drift, EmptyState B-7, admin dialog form-wrapper C7, safe-areas C9, toolbar clearance C12). **UXP-5 Wattmeter — paced** (precache diet E3, Sentry lazy-init E4, merge the two 45s pollers E5, defer My-Deployment's 9 reads E6, single queue provider E7).

### 2 · Friction map (Max's reported frictions vs. existing coverage)

**(a) Daily check "feels like homework."** Mechanics are well covered: legible answered-state (D-04, UXP-2), 44px Back/Next (C6), never-hang submit (F-02, 3a), drafts (F-11, 3h), right-vehicle preselect (3j), tappable proof-of-done (F-08, 3e). **But the review scored the check as already BEATING texting at ~35s (AHITS_UX_SIX_SEAT_REVIEW_2026-07-29.md §3.7) — speed was never the issue; meaning is.** Nothing in UXP-1–5 changes what the check *gives back* to the operator. The doctrine hook is friction-budget rule 4 — "evidence must visibly benefit the person providing it" (AHITS_PHASE3PLUS_NORTH_STAR_v3.md §3). *[§0-2: the Today view exists (CC-14); the gap is deepening its payoff — NS-11-shaped close-out value, streaks/history the operator can point at — not building the surface.]* **GAP.**

**(b) Clunky equipment creation / admin day-to-day.** **The six-seat review never audited creation flows.** Its builder created deployments/transfers/checks/requests via UI, but the fleet itself came from seed (§9) — no finding covers vehicle, unit/inventory-item, kit, or checklist-template create/edit forms. Adjacent coverage only: deployment builder can't set a project + launches blind (§3.4/§3.5 → UXP-3d), five admin dialogs whose Save/Cancel scroll away (C7 → UXP-4), tables showing 42–47% of columns (C5), and — parked unassigned in §7 — the admin builder's 409 recovery silently wiping all serialized kit picks. **GAP: needs a new packet (§4).**

**(c) Group-text reversion.** Root-caused by the review itself: the materials-request reply loop LOSES to texting — direct-Fulfill notifies nobody (§0, F-04) — plus stale badges (F-06) and reservation-default composer (F-09). UXP-3 is squarely the coverage. **Residual gap: reach.** The bell is in-app, 45s-polled (E5) — it only "rings" if the app is open; a text buzzes a pocket. Push (P3-NOTIF) sits undecided in the compendium §7. With operators lapsed, in-app loop-closure alone can't out-notify SMS.

**(d) Trust issues.** Best-covered friction: UXP-1 shipped the "app glitches" cluster; UXP-2 fixes the AA-failing offline trust toasts; UXP-3a/3b fix silently-lost checks and the lying lockout (§3.1/§3.3). Remaining: mid-shift chunk swaps (§7 ops guardrail) and re-onboarding lapsed users — social/ops work, not packetized anywhere.

### 3 · The "faster than a text" test (North Star §3 budget)

Verified winners to protect: transfer accept (3 taps), daily-check happy path (~35s), end-deployment disposition (§3.7). Still losing: **materials request** — loses on reply (fixed by UXP-3c + F-06) and on reach (push undecided); **report-a-problem** — "just texting a photo" beats a flow that hard-requires a live camera shot and won't accept the photo already taken (§7 photo cluster → UXP-3g pre-flight); **daily check** — wins on taps, loses on felt purpose (see 2a). *[§0-2: the "wake/plan loses" line is stale — CC-14's Today view replaced the static menu.]*

### 4 · Ranked recommendation (adoption-first re-sequencing)

1. **Swap the order: UXP-3 before UXP-2.** Max ruled 1→2→3 pre-stall; the stall is loop/trust-shaped, not legibility-shaped. UXP-3's trust core (3a/3b/3c) + 3f/3h/3j directly attacks lost checks, the unanswered-request leg, and check drudgery. Answer the 3g photo pre-flight **YES to library attach** — literally "texting a photo" parity.
2. **New packet — UXP-6 "Admin Setup & Fleet Onboarding" (the uncovered gap).** Sketch: (i) audit-then-fix the create/edit flows for vehicles, units, kits, checklist templates — tap-count "new vehicle ready to deploy" and "new unit labeled and kitted" per the Stopwatch method; (ii) land the known ingredients: C7 pinned dialog actions, §7's 409 kit-pick wipe, 3d's project+review step if UXP-3 dropped it; (iii) clone-from-existing defaults + minimum-required-fields-at-create; (iv) decide the CARRY bulk paths (bulk QR labels, bulk-location — compendium §7); (v) acceptance: an admin stands up a full rig's equipment in one phone sitting.
3. **Deepen the Today loop's value-return** *[re-based per §0-2]* — the anti-homework move: what the operator gets back for the check (close-out payoff, visible history/streak, NS-11-shaped) rather than a new surface.
4. **Then UXP-2** (D-02/D-04 anchors first), with UXP-5 E3/E5 as ride-alongs; UXP-4 stays demand-pull. Decide P3-NOTIF push alongside — loop closure without reach won't beat SMS.

---

## Seat 6 — The Strategist: What RL-1's Shelving Actually Changes

Shorthand: **Bakeoff** = AHITS_VS_AIRTABLE_BAKEOFF_2026-07-30.md · **Program** = AHITS_UNDISPUTED_PROGRAM_2026-07-30.md.

### 1. The bakeoff in 10 lines

1. Question: keep AHITS as system of record, or migrate to Airtable "or similar" — a 10-agent adversarial interrogation against a 35-row register, 28 MUSTs (Bakeoff §1).
2. Contenders: full Airtable on the company plan; AppSheet Enterprise Plus on Cloud SQL; Fulcrum Elite + Airtable + custom glue (Clockify retained); 18 tools swept; full steelman designs in the appendix.
3. Ruling: keep AHITS, ship a one-way Airtable read layer within three weeks, decline all migrations; riding orders — CC-30 live-fire boxes that week, second maintainer before CC-17's first money line (Bakeoff §0, §7).
4. Decisive factor: the offline zero-lost-writes MUSTs are "physics" of this fleet's signal reality that only the incumbent meets. MUSTs held: AHITS ≈27.5/28 · Airtable ≈5 · AppSheet ≈16 · Fulcrum ≈11.5 · hybrid ≈27.5 + both drivers won (Bakeoff §0, §6).
5. Driver #1, reporting appetite: legitimate, and AHITS loses the row on merits — every manager view is a Max code change (Bakeoff §7).
6. Driver #2, Airtable familiarity: real but manager-side capital — the operators' incumbent is a group text; "we already pay for it" escalates into an unpriced Enterprise negotiation (Bakeoff §7).
7. Driver #3, build cost: refuted by the challengers' own documents — 24-month full-cost bands all overlap AHITS-as-is ($82–131k); no challenger deletes the build, they relocate it (Bakeoff §5, §7).
8. Antagonist attacks on AHITS, all off-register: the bus factor compounded by its own unticked ops boxes (no verified backup/restore/dead-man); the manager appetite it starves while CC-18 waits; CC-17 as a concentrated solo money bet on a never-run 28×5 matrix atop n≈7 adoption evidence; plus manageables — one-throat security, staging-is-home governance, cost paid in Max's attention (Bakeoff §4).
9. The hybrid won because it concedes nothing: AHITS keeps every write path; a nightly one-way sync buys drivers #1 and #2 for $0–4k / 40–80 hrs — the integration PRD §9.3 always planned (Bakeoff §6).
10. And it was the cheapest experiment: live evidence of manager Airtable adoption before anyone re-litigates a fuller migration (Bakeoff §5.9).

### 2. The Undisputed Program in 8 lines

1. Goal: make AHITS "the option no honest re-run of the bake-off can dispute," while the rollout continues (Program header).
2. Undisputed test (Program §0), points 1–2: every register MUST ✓ **with evidence** (no "merged, smoke owed"); both named drivers answered by **shipped artifacts**, not arguments.
3. Points 3–4: every antagonist attack retired with a **dated artifact**; every revisit trigger structurally prevented or actively monitored.
4. Points 5–6: **two humans** who have each independently deployed, restored, and triaged; adoption **measured, not asserted** — n>15 vs the group-text baseline, pass bars written first.
5. Components (Program §1): RL-1 read layer (absorbs CC-18) · M-1 second maintainer ("the keystone," hard CC-17 gate) · SEC-1 UK-parent security pack · CC-17 money loop · SHIP-1 (trigger-gated) · GAP-1…11.
6. Wave 0 (this week): the pilot-floor TODO verbatim — phone smokes, CC-30 live-fire boxes, GAP-4, Clockify-tap + group-text baselines **before more operators onboard** (Program §2).
7. Waves 1–2 (weeks 1–8): RL-1 live + 60-day falsifier; M-1 searched, then signed-and-drilled; UXP-2/3; A6 matrix early; SEC-1; GAP-8 adoption instrumentation; monitors live.
8. Waves 3–4: CC-17 off-season behind all-green gates; season-2 scale proof; CC-18 decided by falsifier evidence; annual bakeoff re-run (Program §2, §6).

### 3. RL-1 shelved — the honest consequences

**(a) Drivers #1 and #2 go unanswered.** RL-1 was the only shipped-artifact answer to them; the hybrid's "both drivers won" reverts to plain AHITS's ✗/✗ (Bakeoff §6), and undisputed-test point 2 is unmeetable while the shelf holds. Revived risk: exactly antagonist attack #2 — ad-hoc views route through Max while the org's Airtable muscle memory compounds monthly (Bakeoff §4) — so the stakeholder pressure the bakeoff defused can regenerate as "re-open the migration." Temporary shelf: a delay in retiring the drivers. Long-term: driver #1 needs *some* answer — the corpus's own $0 fallback is the Looker-on-Postgres rung, "the one unambiguously correct idea" in AppSheet's design (Bakeoff §4).

**(b) CC-18.** "CC-18 is absorbed by RL-1's week board and only returns if the falsifier fails — refunding 2–4 weeks" (Program §3). Shelving voids the absorption and cancels the refund. Temporary shelf: CC-18 stays parked pending RL-1's revival — coherent and cheap. Long-term: it reverts to its own roadmap slot (native build, post-CC-17) as live scope. With a stalled 2–3-operator pilot the week board's customer barely exists yet, so parking costs little *now* — but the manager-reporting hole is then unserved by anything.

**(c) 60-day falsifier + no-write-back (D33 candidate).** Neither ever landed — DECISIONS.md ends at D29. Temporary: **deferred, not moot** — the falsifier clock starts only when RL-1 ships; record D33 at build time. Long-term: moot, and two Bakeoff §8 triggers never arm — hazard: the reporting strategy loses its scheduled decision point and *drifts* rather than being decided. Unbundling caution: GAP-6 (the D1 prod-cutover trigger paperwork) merely shared RL-1's Wave-1 paste session; it is RL-1-independent and must not fall off the truck (Program §1).

**(d) Unchanged, RL-1-independent.** M-1 (grounded in the bus factor; hard gate before CC-17 code-start) · SEC-1 · CC-17 and its gates · SHIP-1's trigger · the GAP register · Wave 0 verbatim · UXP-2/3 · all §6 monitors except the sync-age, falsifier, and write-back lines. The program's spine survives intact; what is lost is its cheapest, fastest win.

### 4. What gains urgency given the stall

**GAP-8 + the group-text baseline (Wave 0), first.** Adoption must be "measured, not asserted" vs the group text (Program §0) — and reversion means the control arm is running live right now, observable. Capture it before re-onboarding or the comparison is lost. **M-1, second.** The stall is a bandwidth story; M-1 is "the one gap that regenerates the challenger case forever" (Program §1), and by monitor, under ~2 recorded sessions/month for 3 months escalates to a migration study (Bakeoff §8) — a thin-bandwidth owner is walking toward his own revisit trigger. **CC-30/Wave-0 ops boxes, third.** Trust is the other stall cause; the ruling's 30-day clock on the unchecked boxes (Bakeoff §8) is at day 21, and the operator-trust artifacts (triage card "queued work is SAFE," one-pager, Stewart's admin cover) sit in the same wave. **UXP-3's Fulfill-notify fix**, which "ends the last flow that loses to texting" (Program §2) — the one build item aimed squarely at group-text reversion.

### 5. What "undisputed" means now

With the pilot stalled at 2–3 operators, "undisputed" temporarily stops meaning "beats every challenger on the register" — that argument is won on paper — and means winning the only contest with live users: **beating the group text, measured**. The program already contains the minimal path back: run Wave 0 as written — it *was designed as the first-operator gate work* — closing the live-fire boxes and capturing the group-text and Clockify baselines while reversion makes them cheap to observe; sign M-1 to buy back the bandwidth the stall exposed; ship UXP-3 so no daily flow loses to a text; then re-onboard a small cohort with GAP-8 instrumentation live and pass bars written *before* the data arrives, growing toward n>15 only on evidence, with CC-17 held behind gates it hasn't earned. The shelf needs no re-litigation — it simply means one undisputed-test clause waits on a named owner decision, and that until something answers driver #1, the verdict rests on physics and evidence on the write side, and on goodwill alone on the read side.

---

## Seat 7 — The Surveyor: How This Machine Works

### 1. Stack + environments

**Stack:** Next.js 16 (modified — webpack builds only) · TypeScript · React 19 · MUI 6 · Prisma 5 / Supabase Postgres · Serwist PWA · jose PIN-session JWTs · Resend · Sentry · Mapbox · GCP Cloud Run us-central1 (README.md; package.json).

**Environments — two and a half:**
- **Local dev:** `.env` from example; migrations created only on a disposable local DB; tests on throwaway Docker Postgres :5433 (README.md, Makefile).
- **`development` branch → `ahits-web-app-staging`**, auto-deployed on merge. Under **D16 "staging is home"** the fleet operates here indefinitely — production in all but name: min-instances=1, `EMAIL_SANDBOX=true` (all mail rerouted to maxtslater@gmail.com), env values asserted post-deploy (DECISIONS.md D16; Makefile).
- **`production` branch → NO environment.** Branch is current (PR #144, 2026-07-11) but no prod Supabase project, service, or `AHITS_PROD_*` secrets exist (PROD_CUTOVER_RUNBOOK.md).
- **Plumbing:** Supabase connections — transaction pooler :6543 (runtime), direct :5432, session pooler :5432 IPv4 (`AHITS_MIGRATE_URL`, CI migrate only) (Makefile). Cron = Cloud Scheduler → `/api/cron/dispatch` (bearer `CRON_SECRET`), healthchecks.io dead-man + in-app `CRON_SILENT` fallback (STATUS.md; CC-22).

**PWA/offline in 3 lines:** Serwist service worker via webpack (`next dev/build --webpack`); middleware migrated to `src/proxy.ts` for Next 16 (README.md). Writes queue in an IndexedDB outbox and replay with idempotency keys; expired sessions park the queue on 401; concurrent-flush mutex, photo-wedge, lie-fi timeouts (CC-03/CC-29). Server side: `IdempotencyKey` dedup with body-hash; D26 3-day past-date window for late checks; D27 sliding 24h JWT capped at 14 days since PIN entry (DECISIONS.md).

**Operating model:** work ships as numbered **instruction packets (CC-nn)** — self-contained paste-into-a-session blocks, each naming **review seats** (Calibration, Antagonist, Integration, Operator-lens, SRE, Fable), in a fixed **landing order**; executed packets compress to records ("do not re-run"); stale-snapshot packets open with a **⟲ pre-flight** against current `origin/development`; late corrections ship as **riders** pasted with the packet, superseding it (AHITS_CLAUDE_CODE_INSTRUCTIONS.md; AHITS_PACKET_ERRATA_2026-07-29.md). Every packet assumes CLAUDE.md's rules: feature branch → verify gate → PR to `development`.

### 2. THE RULES — do not break

1. **D16 merge-is-deploy:** the ONLY path onto the fleet's app is a reviewed PR merged to `development`; never hand-deploy onto `ahits-web-app-staging` (CLAUDE.md; D16).
2. **Migration safety:** never `db push`/`migrate dev` on a shared DB; ship committed backward-compatible migrations; `migration-safety` gates both PRs and pushes; destructive SQL needs an acknowledged waiver + label via PR (CLAUDE.md).
3. **Secrets before deploy:** an `AHITS_*` secret must be ENABLED in Secret Manager before the deploy that mounts it, and mapped in the Makefile `--set-secrets` line or it's silently dropped (CLAUDE.md; Makefile).
4. **No-hex lint:** raw color hex is ESLint-forbidden in `src/**` outside `src/theme/tokens.ts` (allowlist: email templates, `s/[token]`) (CC-23).
5. **Test sanctity:** the suite wipes tables, so it requires `DATABASE_URL_TEST` and refuses non-local DBs — Docker :5433 only; don't weaken the `tests/offline` flush-lifecycle harness (README.md; STATUS.md).
6. **Live-DB guard:** `db-seed`/`db-reset` refuse Supabase URLs unless `AHITS_DANGEROUS_TARGET=yes-i-mean-staging` (Makefile).
7. **Session-close contract:** STATUS/DECISIONS/index updates, dated handoff, commit+push, verify tracked; an untracked doc "does not exist" (CLAUDE.md; STATUS close checklist).
8. **NOT the Next.js you know:** breaking changes vs training data — read `node_modules/next/dist/docs/` before writing code (AGENTS.md).
9. **Rollback = traffic, never schema:** roll Cloud Run traffic back, then revert PR; never hand-revert a migration (PILOT_ROLLBACK.md).
10. **Read DECISIONS.md before reopening any settled question**; ACTIVE decisions bind (CLAUDE.md).

### 3. Dev workflow cheat-sheet

- `make setup` (install/generate/migrate/seed); `make dev` (README.md).
- Branch ritual: `feature/YYYYMMDD/<gh-user>-<desc>` → commit → `gh pr create --base development` (CLAUDE.md).
- **`make verify`** = db-generate + typecheck + lint + test — the pre-PR gate (Makefile).
- Schema change: `make db-generate` + `make db-migrate-dev` (local only) → commit `prisma/migrations/*` (CLAUDE.md).
- **`make test`** = Docker PG :5433 → push schema → **node DB suite** (vitest; hard-requires `DATABASE_URL_TEST`); `npm run test:ui` = **jsdom component suite** (`vitest.config.ui.ts`); `make test-db-down` cleans up (Makefile; package.json).
- After merge: `gh run watch`; confirm via `make cloud-run-url SERVICE=ahits-web-app-staging`; `make logs` to tail (CLAUDE.md).
- Throwaway preview: `gh workflow run pr-staging-deploy.yml -f service=ahits-web-app-preview-<topic>` — dispatch-only, hard-fails on live services, applies **no migrations** (CLAUDE.md).
- **CI gates:** PR → `ci.yml`: `verify` (lint, type-check, build, DB tests) + `migration-safety` incl. DROP guard. Merge → `deploy.yml`: `verify` → `migration-safety` → `migrate` → `deploy` → **env-drift check** (asserts EMAIL_SANDBOX/minScale=1); any red job stops the deploy (CLAUDE.md; STATUS.md).

### 4. DB domain map (39 models, prisma/schema.prisma)

- **Identity/auth:** `User` (PIN auth, `tokenVersion` revocation, homeHub, hourlyRate), `InviteToken` (CSPRNG invite links), `AccountAuditLog` (append-only).
- **Org:** `Hub` (physical base; email/address for portal + Shippo), `Category`.
- **Fleet:** `Vehicle` (QR, hub, soft-delete, full rental block), `DailyCheck` (per vehicle/operator/day; checklistJson, GPS attestation, durationMs), `ChecklistTemplate` (per-vehicle-type overrides).
- **Inventory:** `InventoryItem` (SERIALIZED|CONSUMABLE, qty, QR), `InventoryUnit` (serialized unit; IN_TRANSIT custody), `InventoryStock` (per item×hub qty + reservedQty), `CheckLog` (every gear check-out/in).
- **Deployments:** `Rig` (a deployment: operator+vehicles+kits), `RigVehicle`, `RigOperator` (legacy), `Kit`/`KitItem` (drawnQuantity/drawnHubId make returns restore exactly), `DeploymentProject`, `DeploymentAssignment` (assignment history — money-loop attribution basis), `DeploymentHandoff` (PRIMARY handoff lifecycle).
- **Projects:** `Project` (customer/code/sizeHa), `ProjectEquipment`.
- **Requests/fulfillment:** `DeploymentRequest` (RESERVATION|MATERIAL lifecycle; `holdExpiresAt` 168h pickup hold), `DeploymentRequestLine` (per-line confirm/edit/deny, held/claimed qty), `RequestLineEvent` (change log).
- **Transfers:** `TransferRequest` (PENDING→ACCEPTED/DECLINED/CANCELLED), `TransferVehicle`, `TransferItem`.
- **Maintenance:** `MaintenanceTask` (schedules + damage reports; repair routing, return destination, rig/reporter).
- **Alerts:** `Alert` (13 types; `activeKey` = one unresolved per source), `Notification` (per-user bell, idempotent per alert), `NotificationConfig` (global row; `cronLastRunAt` dead-man).
- **StatusLinks/portal:** `StatusLink` (sha256-hashed capability URLs: WORK_ORDER/HUB_RETURN/INVOICE/RESERVATION), `StatusLinkEvent`.
- **Audit/email/infra:** `EmailLog` (every send: SENT/FAILED/SKIPPED), `Photo` (polymorphic, GPS), `IdempotencyKey` (offline-replay dedup; 48h cron reap), `RateLimitHit`, **`Shipment` — deliberately dormant Shippo groundwork, imported by nothing live** (schema.prisma F2 comment).

### 5. Prod cutover & rollback

**Cutover (deferred, D1):** a full from-scratch standup — new Supabase project, 11 `AHITS_PROD_*` secrets, service-account access, namespace check, promote-PR merge driving migrate→deploy, smoke with `EMAIL_SANDBOX=false`. Deferred deliberately since 2026-07-10; the stray `AHITS_PROD_MIGRATE_URL` may point at staging — recreate it at go-live (PROD_CUTOVER_RUNBOOK.md; AHITS_PROD_CUTOVER_DEFERRED.md).

**Rollback:** route 100% traffic to the previous Cloud Run revision (two gcloud commands, seconds, no CI), then a revert PR at leisure — safe because CI-enforced additive migrations let old code run on new schema. Never hand-revert schema or restore a dump over the live DB. Image tag = git SHA; idempotency evidence lives 48h (PILOT_ROLLBACK.md).

### 6. What a 3-week freeze breaks HERE

1. **All sessions dead:** D27 caps tokens at 14 days since PIN entry — 21 days exceeds it; devices must re-auth, and queued offline writes 401-park until PIN re-entry (D27).
2. **Stale outboxes mis-date or bounce:** D26 trusts client dates only 3 days back — a pre-freeze queued check replays clamped to *today* or 409s; idempotency forensics for the window are already reaped (48h) (D26; PILOT_ROLLBACK.md Q2).
3. **Cron kept firing against a quiet DB:** 7-day reservation holds have TTL-expired and released *(§0-1: correctly — the release path was fixed 07-28)*; missed-check/stale-damage scans may have piled sandboxed alert mail into the sandbox inbox (activeKey dedup caps it). The dead-man's "first live fire" was unchecked at freeze — if unarmed, a silently dead cron surfaces only on an admin dashboard load nobody made (STATUS.md checklist c).
4. **Verification debt froze in place:** owed smokes (CC-29 on-device offline cycle, CC-33 two-phone Transfer, CC-34 3a/3c/3d, CC-31 PR-1) and the backup/PITR restore drill (tier never recorded) remain unrun (STATUS.md; PILOT_ROLLBACK.md).
5. **Durability contract violated:** 4 untracked `*.md`/zip + a modified TODO sit uncommitted; per CLAUDE.md an untracked doc "does not exist" — commit first (CLAUDE.md).
6. **Speculation, flagged:** Supabase tier is undocumented — if free-tier, inactivity pause is possible, though cron traffic likely prevents it; caret dep ranges drift on lockfile-less installs (use `npm ci`); Node must stay `>=22 <25` (package.json).

---

## Seat 8 — Risk Auditor · Ranked register as of 2026-08-20

*[Read with §0-1: R4 is downgraded — the GAP-4 fix shipped 07-28, before operator use; no stale-hold accumulation or release-spam trap exists. First-hours order adjusts accordingly.]*

Context: 3-week total freeze, pilot stalled at 2–3 operators who reverted to group texts, Wave-0 console items untouched. Ranking = blast radius × live-today, tie-broken by mitigation cost. **Do R2 first (5 min), then R1 — but R1 is the biggest risk.**

**R1 · Unverified backups / no restore drill — the total-loss path.** Real field data (checks, custody, photo refs) sits in one Supabase DB with retention/PITR never confirmed and a restore never attempted. `PILOT_ROLLBACK.md`'s "Restore drill" is an empty placeholder; TODO §2a unticked; the bakeoff calls this "the most probable total-loss path in any scenario"; the six-seat review flagged "if the tier is free, retention could be ~nothing" (SIX_SEAT §2.3). **Blast radius: everything — unrecoverable.** Mitigation: CC-30 box a verbatim — record plan/retention, enable PITR, restore to a throwaway project, confirm `daily_checks` rows, fill the PILOT_ROLLBACK section. ~30–35 min. Status: drill-never-run CONFIRMED; current retention NEEDS-CHECKING; also confirm the project wasn't paused during 3 idle weeks.

**R2 · Four uncommitted 2026-07-30 strategy docs — single-copy loss.** The bakeoff ruling, appendix, Undisputed Program, and revised TODO exist only in the working tree, and this folder IS the repo. CLAUDE.md: "If a doc you wrote isn't tracked, it does not exist for the next session." Blast radius: strategy amnesia at the trust-rebuild moment. Mitigation: `git add <named files> && git commit && git push`. ~5 min. **Do first.** Status: CONFIRMED.

**R3 · Monitoring dark for 3 weeks — failures invisible.** healthchecks.io ping never observed, CRON_SILENT never live-fired, Sentry test events never sent, no uptime check (CC-30 boxes b/c/d/i "none ever attempted"). Sentry/heartbeat "no-op cleanly when their secret is absent" — mis-wiring is indistinguishable from health. The cron could have been dead for weeks: alerts, TTL reaps, heartbeat silently off. Blast radius: every other risk becomes undetectable; relaunching onto an unwatched system repeats the stall. Mitigation: boxes b+c+d + `curl /api/health` + Cloud Scheduler last-run check. ~40 min. Status: never-verified CONFIRMED; actual cron health NEEDS-CHECKING (healthchecks.io dashboard; Cloud Scheduler job history).

**R4 · ~~GAP-4 stale-hold cron bug~~ → residual test debt.** *[§0-1: the bug was fixed pre-pilot (#220 + regression test); holds released correctly throughout attempt 1. Remaining: the advisory-lock connect-error branch has no test; the cron watch (OPS-e) is worth one observation pass.]* Downgraded from #4 to low.

**R5 · Pilot-week data aging ungoverned for 3 weeks.** If any CUL005 deployments were never ended, every day since accrues MISSED state while alert dedup suppresses re-notify; never-ended rigs "permanently deflate the ≥90% target, invisibly" (SIX_SEAT §4.5). Operator phones may still hold queued July outbox items — replay hits D26's 3-day window (clamp or 409) with Sentry unverified (R3). Blast radius: relaunch day 1 shows a bell/dashboard full of stale red — trust killer; metrics poisoned. Mitigation: ~1 h Supabase SQL triage (end stale deployments, resolve stale alerts) + each attempt-1 phone opens online and clears its Outbox before day 1. Status: NEEDS-CHECKING. No existing checklist item — **gap** (now folded into the refreshed TODO §0).

**R6 · Trust debt — a botched relaunch is unrecoverable.** Operators watched it stall; the review already warned the pilot "measures obedience, not preference" (SIX_SEAT §6.1) and "adoption is decided in the first two weeks" (STATE_OF_APP §7). A second visible failure ends adoption regardless of code quality. Mitigation: relaunch only after R3/R5 are green; use TODO §4's kit (one-pager, triage card, baselines captured *before* re-onboarding). Status: CONFIRMED.

**R7 · GitHub "Include administrators" OFF — the last open door.** Admins can still direct-push onto the fleet's de-facto-production branch. Two clicks. Status: CONFIRMED.

**R8 · Mapbox token restriction unverified.** pk token served to authed clients; "fine only if URL-restricted (unverified)" (SIX_SEAT §2.9). Quota theft → dead maps/bill. ~5 min. Status: NEEDS-CHECKING.

**R9 · Bus factor — M-1 unsigned, no second admin drilled.** M-1 is "the keystone — the one gap that regenerates the challenger case forever" (PROGRAM §1); RL-1's shelving doesn't shelve this. Stewart's admin account was never created — every admin verb still conjugates through Max (SIX_SEAT §6.5). Mitigation today: Stewart's ADMIN account + one-pager (~15 min); post the M-1 retainer role. Status: CONFIRMED.

**R10 · Standing-credential hygiene.** Long-lived `GCP_SERVICE_ACCOUNT_KEY` with no rotation play (SIX_SEAT §2.9; GAP-9); Sentry/heartbeat secrets whose absence no-ops silently (covered by R3). No doc claims imminent expiry. Mitigation: write the rotation play (GAP-9, ~1 h); rotation itself can wait for Wave 2. Status: debt, CONFIRMED-BY-DOCS.

**First-hours order (post-§0 revision):** R2 (5m) → R1 (35m) → R7 (2m) → R8 (5m) → R3 (40m) → R5 SQL triage (~1h) → R9 Stewart account (15m). One sitting; converts every confirmed total-loss-class exposure into a recorded artifact before any relaunch conversation starts.

---

## Seat 9 — The ID Atlas

Ledger of record for CC-##: the packet table in AHITS_CLAUDE_CODE_INSTRUCTIONS.md; program state: AHITS_UNDISPUTED_PROGRAM_2026-07-30.md + AHITS_PILOT_FLOOR_TODO.md; live state: STATUS.md.

### 1 · CC atlas

**SHIPPED roll-up (all merged to `development`/staging):** CC-01 release-safety guards · CC-02 data-integrity/drift cron · CC-03 offline-trust one-liners · CC-06 dashboard-KPI+enum · CC-07 mobile triage · CC-08 hubs discrepancy+bulk verify · CC-09 Awaiting-Pickup · CC-10 field-fix logging #180 · CC-11 admin-as-operator #181 (D3) · CC-12 split/SWR/Outbox #187–189 (admin splits deferred D10) · CC-14 Today view #190–194 (NS-10/NS-5) · CC-15 Map #197/198 (D14; weather stamps OUT) · CC-22 ops rider #182 · CC-23 tokens+primitives #183 · CC-24 subtraction+glossary #184/185 · CC-25 live-camera QR #186 · CC-26 check viewer #195 · CC-27 FulfillmentChecklist #196 · CC-29 offline trust floor #202/203/205 (D26/D27) · CC-30 ops floor #204/206 (D16) · CC-31 accuracy+`/admin/pilot` #213/214/215+PR-1 · CC-32 friction&flow #209–212 (D28) · CC-16S public-surface security #220/221 *(#220 = the stale-hold fix, §0-1)* · CC-33 simplify&unify #223/224 (D21/D22) · CC-34 maintenance-speaks #226/227/229 (D29) · copy-link invites #200 (unnumbered). Owed on several: Max's device smokes — folded into the phone-smoke session.

**Precise (open/parked/dead):**
- **CC-04 / CC-05** · prod standup / held W0-10 4b′→4c DROP · **DEFERRED-D1** — trigger to be written as GAP-6/D34.
- **CC-13** · doc hygiene · **SUPERSEDED** → AHITS_DOC_CLEANUP_INSTRUCTIONS.md.
- **CC-16** · no-app QR check · **SPLIT (D18)**: CC-16S shipped; **CC-16-proper PARKED** — trigger: a named user who won't/can't sustain the installed PWA, or the missed-check chase needs a no-auth path.
- **CC-17 (= "TIME")** · Timesheets/Invoicing/Availability, full Clockify replace (D19) · **OPEN — Wave 3, the quarter's one bet, 6–10 wks**. Gates in §5.
- **CC-18** · N-5 manager week board · was **ABSORBED by RL-1's week board pending a 60-day falsifier**. **RL-1's shelving voids the absorption**: CC-18 reverts to an undecided item needing a fresh owner decision.
- **CC-19** · envelope/fetchJson/withAuth/dead-code · **OPEN, rolling/unscheduled** (batch6a cleared by CC-33).
- **CC-20** · dead-end record readers · **PARKED remainder** — trigger: first pilot dispute needing history. #1 viewer→CC-26; auto-resolves→CC-31; remaining: resolved transfer/handoff history, RequestLineEvent surfacing, StatusLink EXPIRED persistence+sweep, #6 alertLink branches.
- **CC-21** · mounted-units spike · **CLOSED by D24** (no model). Revisit: a unit dismounts or CC-17 demands per-unit cost.
- **CC-28** · Today-lite bridge · **MOOT** (D5=Option A; never built).

### 2 · GAP register (wave per program §1–2)

GAP-1 per-account login rate-limiter keying (CGNAT) — W2 · GAP-2 MATERIAL fulfilled-qty line model — W2 spec, build rides CC-17 · GAP-3 secondary-operator Today packet — W2, pre-CC-17 · **GAP-4 — core bug FIXED (#220, §0-1); residual = advisory-lock branch test** · GAP-5 photo policy (inside UXP-3) — W2 · GAP-6 write D1 cutover trigger into DECISIONS — 1 hr, RL-1-independent · GAP-7 full A6 28×5 matrix run EARLY + recorded — W2 · GAP-8 n>15 adoption instrumentation — W2 · GAP-9 pipeline proofs (additive-migration PR through migrate path; SA-key rotation) — W2 · GAP-10 bell deep-link anchoring + unread-clearing — filler · GAP-11 annual bake-off re-run — W4. Companions: **M-1** (hard CC-17 gate) · **SEC-1** (W2) · **SHIP-1** (W3–4, D23 trigger) · **RL-1 SHELVED 2026-08-20**.

### 3 · UXP

UXP-1 Nav Trust — **SHIPPED 07-30** (D30/D31/D32 paste owed) · UXP-2 Sunlight & Touch — next per written order (order under review, Seat 5) · UXP-3 Flow Closers — two server-touching items; **pre-flight: the two photo YES/NOs** · UXP-4 One Design System — ride-along only · UXP-5 Wattmeter — paced perf items E3–E9.

### 4 · NS / CONV still live

**NS:** NS-10/NS-5 shipped (CC-14) · NS-1 probe RETIRED (D25) · NS-9 trigger MET (D23 → SHIP-1 post-CC-17) · NS-4 weather stamps deferred post-launch · NS-11 = design constraint on CC-17 · NS-13 incident log (small, legal-shaped, open) · NS-14 photo timeline (when adjacent) · NS-6 parked (ops asks by name) · NS-8 cut to bug fix · NS-2/NS-3/NS-7 small/conditional. **NS-12 was never minted.**
**CONV (roadmap §8):** live: CONV-8 time→money (CC-17) · CONV-10 availability→board (CC-17/18) · CONV-1 Shippo vertebra (SHIP-1) · CONV-11 QR fallback (CC-16-proper trigger) · CONV-9 demand exhaust (NS-7) · CONV-16 stock ledger (drift detector shipped). Week-board v1 = layers L1–L5+L8–L9; L6/L7 wait on CC-17 adoption.

### 5 · THE NEXT-UP BOARD (RL-1 shelved; adoption-first)

**Build lane:** ~~GAP-4 session~~ *(fixed)* → UXP-2/UXP-3 in Max's ratified order (+GAP-5 inside UXP-3) → UXP-6 candidate (admin setup, Seat 5) → correctness session (GAP-1 + GAP-2 spec) → GAP-3 secondary-operator packet → **CC-17** (Wave 3, off-season) → post-CC-17: SHIP-1 if triggered, CC-18 decision.
**Owner lane (Max, all pre-more-operators):** phone-smoke §1 + overnight replay · console/ops §2 — **backup restore drill first**, healthchecks, CRON_SILENT fire, Sentry buttons, Mapbox pk-restriction, GitHub include-administrators, delete cc31 previews/worktrees · baselines **before re-onboarding**: Clockify daily tap-count + CSV, group-text volume · Wintex/Giddings template items · Stewart ADMIN + one-pager + triage card.
**Decision lane:** paste **D30/D31/D32** + mark D28 superseded (owed since 07-30) · **GAP-6/D1 trigger** (D34 candidate) · record **RL-1 shelving as a new Dn** (and CC-18's disposition) · governance sweep (push-vs-45s-polling; CARRY-1..14, workplan v2 §9.2/§10).
**Wave-2 lane:** **GAP-7 full A6 28×5 recorded** · **M-1 signed + personally drilled** (restore, deploy, triage, rollback) · SEC-1 pack · GAP-8 instrumentation · GAP-9 pipeline proofs · GAP-1.
**CC-17 preconditions, verbatim (program §2 Wave 3 + D19/D13/D3):** M-1 signed ✓ · A6 matrix recorded ✓ (GAP-7) · Clockify taps measured ✓ · written Clockify-retained fallback ✓ · **D3 admin exclusion in the attribution resolver** · invoice wedge demoed early against manual hours · acceptance = one payroll period clock→PAID with **zero manual corrections** · M-1 reviews every money-path PR · riders: AHITS clock ≤ Clockify's daily taps; MID-3 earnings view in DoD; import-vs-fresh decided at design; FND-8 email verified.

### 6 · Orphans & contradictions

1. **NS-12 never defined** (numbering jumps 11→13).
2. **CC-21 stale rows:** D24 CLOSED the spike, but STATUS §5 still lists it as open and the packet ledger still says "🧪 SPIKE".
3. **Packet-ledger "CC-16 📋 QUEUED — NEXT" is stale** — its own footnote corrects it to split/PARKED (D18).
4. **"Airtable sync" sits on the Idea Compendium's DENIED wall** (07-11) yet the 07-30 bake-off ruled RL-1 in; shelving makes the wall accidentally right — but no Dn records either move.
5. **D33/D34 numbering collision risk** — D30–32 unpasted while the program reserved D33/D34 ("verify numbering", program §5).
6. **A6 sizing drift:** 18 rows (v1) → 22×5 (workplan v2 §3.3) → 28×5 (D13/GAP-7) — GAP-7's figure governs.
7. **W0-# double-mint:** workplan v2's W0-1..12 vs the 07-10 plan's W0-SAFE/W0-INT-# (aliased into CC-01..03); frozen, don't extend either.
8. **Review-ID decoder:** R# = 2026-07-28 six-seat findings (R2/R3 closed by CC-34); the 07-29 UX review mints per-seat A#/B-#/C#/D-0#/E#/F-0#/G# (E1 phantom-sync → UXP-1g); "A6" is the device matrix, not a finding. FND-# = the frozen 2026-07-03 register; SOA-#/P3-*/CARRY-# alias it. D8 folded into D3; CC-12's admin splits are D10, not unfinished work. *(Also: the 07-30 TODO/Program's GAP-4 line contradicted the already-merged #220 — the largest single contradiction this review found; see §0-1.)*

---

## Seat 10 — Pilot Trustee: the stall, formally, and Relaunch v2

### 1 · The charter in 8 lines (AHITS_PILOT_CHARTER.md)

1. **Cohort:** 9 named operators (J. Webb, B. Hill, L. Webb, Chasteen, Slater, Ott, Salinas, Pistek, Arbuckle) on **project CUL005**, on staging (D16).
2. **Metric 1 — "Adoption ≥ 90% by week 2"** — % of eligible daily checks/deployments "actually done in-app vs. worked around (texting)"; denominator instrumentation = CC-14, live day 1.
3. **Metric 2 — "Daily-check time-to-complete"** — client-instrumented from day 1; "Baseline it on day 1; watch the trend, not a single number."
4. **Metric 3 — "Zero lost writes"** — outbox empty after every reconnect; any queued action failing to sync (outside a normal 401-park-then-resume) is a **P0 pilot incident**.
5. **Window:** "one pilot fortnight (2 weeks)"; per **D17** the fixed 07-27 date is void — the fortnight "starts at first-operator-live, not a calendar date."
6. **Roles:** Max = pilot owner + Monday variance-check owner; **Stewart Arbuckle = D7 second human**, upgraded to **ADMIN #2 with an admin-verbs one-pager (D20)**.
7. **Sandbox-flip rule (D6/D15):** `EMAIL_SANDBOX` flips off only after (a) only pilot hubs carry contact addresses, (b) all non-hub recipient paths audited, plus a verified Resend domain — gated on audits, never on the start date.
8. **Observational only:** GPS grant rate — "a coaching signal … this never gates or scores anyone."

### 2 · Formal read on the stall

**Did the clock start? The corpus gives two answers.** By **substance** (D17: window starts at first-operator-live), operators went live ~07-30, so a fortnight would have closed ~08-13 with week-2 adoption ≈ 0% — a scored **fail on Metric 1**. By the **letter of the gate** (AHITS_PILOT_FLOOR_TODO.md §5), the clock starts only after "§1 fully checked — the hard gate," the §2 backups drill, and "Onboard operator #1 **with the one-pager** → first check lands in the viewer + `/admin/pilot`." None of that was ticked; the one-pager doesn't exist; Wave-0 was covered "partially, informally, nothing recorded." **So the clock never validly started.**

**On interruption the charter is silent** — no pause, resume, or void clause; and the §6 "running pilot log (this doc's appendix)" was never created, so nothing about the run is recorded at all. The project's own process rule decides it: *"a gate without a recorded result is Schrödinger's gate — future passes must be ticked the same day they run"* (D17; A6 checklist banner). **Honest interpretation: declare the attempt-1 window VOID and restart clean** — it cannot be scored a pass under either reading, and retro-scoring a fail is equally unsound (gate preconditions unmet, denominator never validated). Record this as a new Dn + a dated pilot-log entry; per D17's rolling start, no charter amendment is needed — a relaunch is just a new first-operator-live.

### 3 · What exists to measure adoption today

- **`/admin/pilot` is built and merged** (CC-31 PR-3, pre-stall): adoption shown as done/eligible "with the raw numbers, never just the percentage"; avg + bucketed `durationMs` distribution; GPS grant rate; `?from/?to` per-day array defaulting to "the pilot fortnight to date"; per-day **operator+vehicle grid** via the cron's primary-operator resolver (D3); a visible **`durationMs < 20s` flag** ("worth a look, not an accusation"); rows deep-link to the CC-26 viewer.
- **Denominator honesty is snapshot-per-day**: eligibility = rigs/vehicles active on the queried day, so "history never shifts retroactively." The durationMs honesty fix (stamp before the GPS wait) shipped pre-stall — attempt-1 durations are clean.
- **The baselines were never captured** (TODO §4: "capture the baselines BEFORE more operators onboard"): Clockify CSV + daily tap count (D19 rider 1) and group-text volume by category ("the adoption control arm"). **Both are still retroactively capturable — and the stall improves them.** Clockify retains history; group-text history persists in the phones; the reversion weeks are a *purer* control arm — coordination volume with AHITS absent. Capture this week, before anyone re-onboards.

### 4 · Pilot Relaunch v2 — minimal checklist

**A. Paper (½ day):** (1) Record attempt-1: new Dn (window void, dates, causes: owner bandwidth · check-feels-like-homework · equipment-creation friction · trust) + create the charter §6 appendix/pilot log. (2) **Capture both baselines now**, while reverted.

**B. Delegation — Max's bandwidth fix, using the corpus's own machinery:** (3) Execute **D20**: Stewart's ADMIN account + the admin-verbs guide; **Stewart takes the daily 5-minute watch**; Max keeps only the Monday variance check — ~15 min/week instead of daily. (4) Write the **onboarding one-pager** (D17 consequence: "no single launch morning with Max present ×9") so Stewart or a lead operator can onboard.

**C. Smokes — field-proved vs still-deliberate.** Field use (~a week of real checks) proved: install/PIN/warm-up, online check → sync → viewer/map, GPS grant/deny. **Write these off as field-proved in the log with dates — don't silently skip.** Still needs deliberate test: expired-session 401-park (D27 renewal makes it rare organically), two-tab queue, **overnight replay under the day PERFORMED (D26)**, **two-phone Transfer (owed per D22)**, offline report-a-problem, portal dead-link, D24 schedules bridge — plus §2(a) **Supabase restore drill**, CRON_SILENT live-fire, GitHub include-administrators. One sitting + one overnight; **tick same-day**.

**D. Friction pass before operator #1-again:** one short packet on the two named killers (daily-check "homework," equipment creation), scoped by the friction budget (every screen must beat a group text); measure before/after with the `/admin/pilot` duration buckets. UXP-2 is queued Wave 1; RL-1 is shelved — the relaunch outranks it.

**E. Returning phones:** each attempt-1 phone opens online and confirms **Outbox EMPTY** before day 1 — anything queued >3 days gets clamped to today by D26's `PAST_WINDOW_DAYS=3` (misfiled) or 409s; resolve deliberately, never reinstall.

**F. Order:** re-onboard the 2–3 attempt-1 operators first (known phones, reload ritual), then rolling per CUL005. **Clock starts at the first check landing in `/admin/pilot` — ticked and dated that day.**

### 5 · The attempt-1 data

Staging holds real DailyCheck rows (businessDate, clean post-fix `durationMs`, GPS fields, pass/fail), rig/vehicle links, alerts, EmailLog — under D16 this is the operation's evidence base; never reset it. **Keep it as attempt-1/cohort-1 data.** Snapshot-per-day eligibility means those days are scored correctly forever and the quiet weeks read as honest zeros; the dashboard's `?from/?to` lets the relaunch fortnight be scored as its own clean window with **zero data surgery**. Annotate the gap in the pilot log, not the DB. Bonus: attempt-1's durations *are* the "day-1 baseline" Metric 2 asked for — already captured.

---

*End of ten-seat review. Companion docs: `AHITS_RESUME_BRIEF_2026-08-20.md` (synthesis) · `AHITS_DECISIONS_PASTE_READY_2026-08-20.md` (paste blocks) · refreshed `AHITS_PILOT_FLOOR_TODO.md` + `STATUS.md` header (canon).*


