# AHITS — Launch Week Handoff · Pilot starts Monday 2026-07-27

> STATUS: canonical (launch week) · UPDATED: 2026-07-21
> SUPERSEDES: — (extends `AHITS_PILOT_CHARTER.md`; charter remains the signed contract)
> READ-WITH: `AHITS_PILOT_CHARTER.md` · `STATUS.md` · `AHITS_A6_DEVICE_CHECKLIST.md`
> Produced by the six-seat session review of 2026-07-21 (Fable, Antagonist, Calibration, Operator-lens, SRE, Integration). Appendix A is the paste-ready Claude Code packet that syncs the corpus to this doc.

## 0 · The launch box

- **GO: Monday 2026-07-27 · project CUL005 · 9 operators.** The app they get includes the Today view, live-camera QR, the daily-check viewer, GPS capture, and the crew map.
- **ONE gate remains: Friday's iOS A6-Lite pass** — rows **2 / 5 / 6 / 19 / 23 / 29** on an installed PWA — plus an Android re-verify of rows 2 / 19 / 29. If Friday fails, Monday slips; nothing else can move the date.
- **Email may still be sandboxed Monday. That gates NOTHING.** Copy-link invites onboard everyone by text; the sandbox flip waits for DNS + the two D6 audits, whenever they land.
- **The P0 tripwire is zero lost writes**: the outbox empties after every reconnect. Everything else is a bruise; a lost check is a broken promise.
- **Print the triage card only after both phone numbers are confirmed** (§1, Wednesday).

## 1 · The week, day by day

**Wednesday 07-22**
1. **Start the Resend/DNS clock — the only item with lead time you don't control.** Create the Resend account, add the sending domain, and send the DNS records to whoever controls the domain (possibly UK-side). If DNS won't clear by Friday, stop pushing — LINK invites carry Monday.
2. ~~Confirm Stewart Arbuckle's digits~~ — **✅ CONFIRMED by Max 2026-07-21: +44 7747 738364** (UK number, correct as written).
3. ~~Confirm the escalation number~~ — **✅ CONFIRMED by Max 2026-07-21: +1 419-944-1939** is his current number. The charter/D7 contradiction is resolved in favor of the charter's value; Appendix A item 2 aligns D7 to it. **Cards may print.**
4. Paste **Appendix A** to Claude Code — it fixes the one dangerous doc defect (row 29 is claimed in STATUS but **absent from the A6 checklist file** the Friday tester will follow), syncs the charter to reality, records the email-timing decision, and tidies the root.
5. ~~Decide docs PR #173~~ — **✅ DECIDED by Max 2026-07-21: CLOSE without merging.** CC's review found it fully superseded (all 7 docs already on `development` with newer content; a real merge-tree test showed 5 add/add conflicts where dev's versions win). CC closes it with the superseded comment — Appendix A item 11.

**Thursday 07-23**
6. If Resend is verified: create `AHITS_RESEND_API_KEY` in Secret Manager (ENABLED, deploy SA accessor — the Mapbox recipe), have CC set `EMAIL_SANDBOX_TO=maxtslater@gmail.com` (the redirect mechanism in `src/lib/email/resend.ts` — sandbox stays on, but every send lands in that inbox tagged `[SANDBOX → real@addr]`), and send yourself a redirected invite to prove the pipeline (key → domain → template → link → EmailLog SENT).
7. Have CC run the **ops preflight** (Appendix A part 2): Cloud Run min-instances=1 for the fortnight, pooled DB connection string confirmed, **CC-22 live acceptance** (heartbeat ping visibly arriving at healthchecks.io, CRON_SILENT raise/resolve, one Sentry test event) — the pilot leans on these alerts and they have never been live-fired.

**Friday 07-24 — THE GATE**
8. **iOS A6-Lite, installed PWA, rows 2 / 5 / 6 / 19 / 23 / 29.** Field notes from the review:
   - Run row 29 **deny-first** (the prompt fires once, then sticks) — verify the check still submits with no coords; then flip Settings → [app] → Location to Allow for the grant leg.
   - **Never reset anything by reinstalling** mid-pass — it wipes the service worker and queue and invalidates rows 2/19.
   - Row 23 runs in the PWA context (expect a fresh camera prompt); the photo-capture fallback must engage if the viewfinder is refused.
9. Android quick re-verify: rows 2 / 19 / 29 (capture touched the check flow the 07-20 pass verified).
10. Piggyback the same phones: the CC-12 PR3 parity list (OUTBOX view, 401-parked banner, kit dialogs) and the CC-23/24 eyeball list from STATUS §3.

**Weekend 07-25/26**
11. Stage **CUL005 for real** (hubs, vehicles, rigs, kit).
12. Have CC run the **test-artifact sweep** — list-then-delete anything smoke-made (test users, reservations, vehicles); seed-cc15 rows are already proven at 0, this is the broader sweep.
13. **Print triage cards** with the two new crew-map lines (§4).
14. **Dry-run one operator end-to-end**: invite link → PIN → install → warm-up → daily check (allow location) → verify the check in the viewer and the pin on the admin map.
15. **Sunday evening: create and text all 9 invite links.** Not Friday (48h expiry — dead by Sunday); not live at the hub Monday. Sunday evening = valid into Tuesday, and Regenerate is the 10-second fix for any that expire or get lost.

**Monday 07-27 — launch morning**
16. If (and only if) DNS + API key landed: run the two **D6 audits** (pilot hubs only carry contact addresses; no stale real addresses anywhere email-reachable — a leftover test shop with a real email means a real work order to a stranger), then flip `EMAIL_SANDBOX` off. If not ready: stay sandboxed — nothing operator-facing degrades. **Audit before flip, always; the rollback is flipping back, but sent email doesn't unsend.**
17. Run the onboarding ritual ×9 (§3).
18. Watch the first checks arrive in the daily-check viewer; glance at the admin map as pins appear.

**Week 1 — the daily 5-minute watch**
Outbox empty across the fleet → today's checks present in the viewer → healthchecks green → alert bell sane → average `durationMs` drifting down. Monday: the variance check via the CC-26 viewer (charter §6), plus one glance at the map — same calendar slot, no new ceremony.

**Week 2 — the readout**
The charter's three metrics, unchanged: **adoption ≥90%, check time-to-complete trending down, zero lost writes.** Add one observational line (not a target): **GPS grant rate** — % of checks carrying coords. Mass denial is a coaching signal and the map's quiet failure mode. The `GET /api/admin/pilot-metrics` API exists with no UI — surfacing it is a good week-2 CC packet.

## 2 · The five loudest rules

1. **One gate.** Friday's device pass is the only thing between here and Monday.
2. **Never clear site data / never reinstall** — the one irreversible operator mistake (it deletes queued work). It's rule 6 on the card; say it out loud at onboarding.
3. **Email is optional this week.** Links onboard everyone; flip the sandbox only after the audits, whenever DNS lands.
4. **Location can always be denied** — a check never blocks or fails on GPS. No one should ever feel their work depends on being on the map.
5. **After any deploy, the crew closes and reopens the app** (the "new version available → Reload" ritual). Batch deploys to evenings this week.

## 3 · Monday onboarding ritual (run 9×, ~6 minutes each)

1. Operator's phone online? (Open any webpage. No signal → hotspot from your phone.)
2. They tap their texted setup link. *Stall — "expired/invalid": Team Management → Pending Invites → Regenerate → re-text. 10 seconds.*
3. *Stall — link opened inside the Messages/Gmail in-app browser (iOS Share menu missing): copy the URL into real Safari (Android: Chrome).*
4. They set their PIN — twice, out loud rule: "a PIN you'd bet lunch on."
5. *Stall — PIN forgotten immediately: admin PIN reset in Team Management; they set a new one at next sign-in. Never re-invite for this.*
6. Install: Android → Chrome's Install app. iOS → Safari → Share → **Add to Home Screen**. *(Greyed out? They're in a Private tab.)*
7. **Open from the icon**, stay online on Today ~10 seconds — the warm-up. Don't skip it on spotty Wi-Fi; hotspot if needed.
8. Say the location script (§4) **before** their first daily check — the prompt fires at check submission, so it can't be dry-run. Coach: "tap Allow." *Denied by reflex: nothing lost; undo later in phone Settings → app → Location.*
9. Show them the crew map; hand over the printed card; point at rule 6 and Stewart's number.
10. Tick the roster. Next operator.

## 4 · Scripts and card additions

**What to tell operators about location (say it like this):**
> "The map only ever shows the spot where your last daily check was submitted — one dot, from a form you sent. It can't follow you around. It's so the crew can see who's working out of where; if you'd rather stay off it, say no to location and your checks count exactly the same."

**Add to the printed triage card (after the sync steps):**
> **"My pin isn't on the crew map" is NOT a sync problem.** Pins come only from your last synced daily check, and only if you allowed location — your checks count either way.
> **Want your pin to show?** Turn location on for the app in your phone's Settings; it appears after your next check syncs.

## 5 · If something breaks (top failure modes, ranked)

| What | You notice | Do | Blast radius |
|---|---|---|---|
| Stale build on a phone | "Feature missing" report | Close + reopen the app (Reload banner) | One phone; queue holds writes |
| iOS storage eviction / cleared data | "My check vanished" | Prevention only: installed PWA + rule 6 + sync before end of shift | One operator's queued day — the P0 |
| 6am cold start / connection burst | "App won't load" texts at 6:05 | Prevented Thursday: min-instances=1 + pooled connections | First impression only; queue protects data |
| Cron goes silent | healthchecks.io emails you directly (works regardless of sandbox) + CRON_SILENT banner | Ask CC to check Cloud Scheduler logs, re-run the job | Admin alerts stall; operators unaffected |
| Sandbox flip surprises | Resend dashboard send log, day 1 | Audit-then-flip; rollback = flip back (sent mail is gone) | External parties |
| Mapbox token/quota dies | Blank admin map | Ignore for the day; GPS capture is Postgres-only and unaffected | Admin visibility only |
| Invite link expired | "Invalid link" at onboarding | Regenerate → re-text | 30 seconds |

## 6 · After the pilot

Build queue (untouched this week): **CC-16 QR daily-check → CC-17 Time/Invoicing → CC-18 week board** — with the **full A6 matrix required before CC-17 ships** (D13), and D3's admin-exclusion a hard acceptance on CC-17. Parked with triggers: CC-19/20 remainder, CC-21 spike, D11 glossary sweep, NS-4 weather stamps (now the live parked-trigger behind the map), pilot-metrics dashboard. Production stays deferred (D1) — when it wakes, it needs `AHITS_PROD_MAPBOX_TOKEN` and (if email is live) `AHITS_PROD_RESEND_API_KEY` alongside the known standup list.

---

## Appendix A — PASTE TO CLAUDE CODE (docs sync + preflight)

```
Launch-week docs sync + preflight. Docs branch for part 1 (single PR); part 2 is read-mostly ops checks — report before changing anything. Review seats: Antagonist + Calibration. Today = Wed 2026-07-22; pilot Monday 07-27.

PART 1 — DOCS (the six-seat review found these; fix all, then verify each with a grep anchor at session close):
1. A6 ROW 29 IS MISSING FROM THE FILE. STATUS.md §1 claims "A6-Lite row 29 added," but AHITS_A6_DEVICE_CHECKLIST.md ends at row 28 with no row 29 and no D13/D14 banner. Add row 29: "Location permission — grant AND deny paths at the daily check; check submits either way (null coords on deny); iOS note: run DENY first (prompt fires once), then flip Settings→Location→Allow for the grant leg; never reinstall mid-pass." Add a header banner pointing at D13 + D14 (A6-Lite = rows 2/5/6/19/23/29 for the pilot; full matrix parked to pre-CC-17). Strike stale "fix in flight" warnings ONLY after a code-grep verifies the fix actually merged (e.g. UR-038).
2. PILOT CHARTER doesn't know CC-15 happened: banner + §3 still gate on rows "2/5/6/19/23". Amend to 2/5/6/19/23/29 + the Android re-verify (rows 2/19/29), note the admin map + crew map launch WITH the pilot (D14), and add one observational line to §6's ritual: glance at the admin map; track GPS grant rate as a coaching signal, never a target. Metrics in §2 unchanged. Reconcile §5's leftover "D5 left uninitialed" paragraph with the signed header (mark the old paragraph as provenance). ESCALATION PHONE — CONFIRMED: Max confirmed 2026-07-21 that +1 419-944-1939 is his current number, and Stewart's +44 7747 738364 is correct as written. Align DECISIONS D7 (which still says "to be filled") to these confirmed values with a dated note; charter step 7 stands as-is.
3. APPEND D15 to DECISIONS.md (supersedes D6's TIMING only): the EMAIL_SANDBOX flip is decoupled from Day 1 — it happens whenever Resend domain DNS is verified AND both D6 audits pass (before or after start). Record the owner-side dependency chain as open items: Resend account + domain DNS (Max + domain owner), AHITS_RESEND_API_KEY secret, EMAIL_SANDBOX_TO pipeline test. Update STATUS §4.2(b) and charter §4 wording to match (audits gate the flip, not the date). D6's audit content is unchanged.
4. D14 correction note (dated): both PRs #197/#198 merged 2026-07-21 inside the freeze, staging smoke passed, AHITS_MAPBOX_TOKEN mounted — D14's "awaiting smoke / draft-held / deploy-hold" bullets describe mid-flight state.
5. AHITS_CC15_PRELAUNCH_RIDER.md: prepend "STATUS: EXECUTED 2026-07-21 — PRs #197/#198 merged, smoke passed; kept for provenance. Do NOT re-run the paste block."
6. AHITS_CLAUDE_CODE_INSTRUCTIONS.md + AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md: refresh status tables — CC-10, CC-11, CC-12, CC-14, CC-15, and CC-22 through CC-27 MERGED (CC-13 stays ⛔ SUPERSEDED — do not mark it merged); live queue = CC-16 → CC-17 (full A6 first) → CC-18; CC-28 moot (D5=A); strike the landing-order's stale "Three pending patches" line (they merged) and fix its CC-26 smoke line to the ?operator= deep-link target (D12). Banner-date both.
7. AHITS_IDEA_COMPENDIUM.md: add a currency note under its banner — Map/route-history/crew-map/GPS SHIPPED (CC-15, D14); copy-link invites SHIPPED (PR #200, was not in the compendium — add a one-line CONSIDERED→SHIPPED entry); NS-4 weather stamps is now the live parked-trigger; STATUS.md wins on currency.
8. 00_START_HERE.md: add AHITS_PILOT_CHARTER.md and AHITS_LAUNCH_HANDOFF_2026-07-27.md (this file — commit it, it's in the repo root) to the routing table; change the 15-minute path's hardcoded handoff filename to "the newest AHITS_LAUNCH_HANDOFF/AHITS_SESSION_HANDOFF_* file".
9. Handoff archival — adopt as session-close step 4b and execute now: keep only the 2 newest handoffs at root; git mv the other dated AHITS_SESSION_HANDOFF_*.md to docs/archive/handoffs/ with a superseded banner prepended. Also archive: AHITS_AMENDMENTS_2026-07-12.md (applied), AHITS_CONSOLIDATED_TRACKER.md (superseded by STATUS), AHITS_FIELD_FEEDBACK_FIX_PLAN_2026-07-10.md (executed). KEEP AHITS_W0-10_MIGRATION_PLAN.md (D4's held patches reference it). For batch6a-date-unify.patch / batch8-urlfilters-rollout.patch / emaillog-failed-alert.patch: verify each landed with a 60-second code grep, then archive to docs/archive/patches/ (or report if any is genuinely still pending). Delete .ahits-snap2.tar.gz and .ahits_write_test_5 (working-tree strays; if the bridge can't delete, git rm works fine natively).
10. Banner pass: add the standard 4-line banner to the docs missing it (both 07-21 handoffs — mark 07-21 SUPERSEDED-BY 07-21b —, AHITS_PILOT_CHARTER.md, both A6 checklists, LANDING_ORDER, IDEA_COMPENDIUM). Add a 5-line LAUNCH BOX at the very top of STATUS.md (GO date, the one gate, email-optional rule, P0 tripwire, pointer to this handoff) and normalize every STATUS row-list mention to 2/5/6/19/23/29.
11. PR #173: Max's go is GIVEN (2026-07-21) — close WITHOUT merging, with your closing comment (superseded: all 7 docs already on development, .gitignore already applied, 5 add/add conflicts against newer versions).

PART 2 — OPS PREFLIGHT (report findings; make no change without my go):
a. Cloud Run staging: current min-instances (propose 1 for the pilot fortnight), and confirm the app + migrate both use the pooled (pgbouncer) connection string.
b. CC-22 live acceptance, never yet fired: confirm a heartbeat ping is actually arriving at healthchecks.io; force/verify one CRON_SILENT raise + resolve; send one Sentry test event and confirm it lands with a request_id.
c. Test-artifact sweep: list every row that looks smoke-made (test users, reservations, vehicles, requests — name/email patterns) across staging; give me the list to approve before any delete. seed-cc15-* is already proven at 0.
d. Report Mapbox token scope/quota headroom for ~9 users of map views.

Session close per the 7-step contract; step-7 grep anchors must include the A6 row-29 line, D15, and the STATUS launch box.
```
