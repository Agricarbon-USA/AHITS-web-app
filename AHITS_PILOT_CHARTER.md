# AHITS — Pilot Charter

> STATUS: canonical (the signed pilot contract) · UPDATED: 2026-07-22 · SUPERSEDES: — · READ-WITH: `AHITS_LAUNCH_HANDOFF_2026-07-27.md` · `STATUS.md` · `DECISIONS.md` (D5/D6/D7/D13/D14/D15)
### One page. Fill the placeholders, then this is the plan. · 2026-07-12

> **✅ SIGNED — Maxwell Slater · 2026-07-20. 🟡 PILOT GO — pending ONE gate before the Monday 2026-07-27 start: the iOS A6-Lite pass.** Charter signed (2026-07-20) ✓; A6-Lite **Android** passed (2026-07-20, rows 2/5/6/19/23) ✓ — needs a **quick re-verify of rows 2/19/29** on the post-CC-15 build; **A6-Lite iOS (installed PWA) still REQUIRED before 07-27 — rows 2/5/6/19/23/29** (D13 + D14: the cohort includes iOS operators, and CC-15 added row 29). Placeholders filled: 9 pilot operators (§1), project **CUL005**, D5 = **Option A** (§5), start date **2026-07-27** (contingent on the iOS pass), D7 second contact (Stewart Arbuckle · +44 7747 738364, confirmed), escalation Max · +1 419-944-1939 (confirmed current 2026-07-21), variance-check owner (Max), sandbox-flip rule confirmed (§4/D6, **timing decoupled from Day 1 per D15**). **CC-15 Deployment Map (admin map + crew map + GPS capture) SHIPPED (D14) and launches with the pilot.** The **full A6 matrix stays parked to pre-CC-17** (edge rows 20–22 + all-column ceremony). **ONE thing outstanding before the start: the iOS A6-Lite pass (§3).** This supersedes the "direction, not a plan" framing below.
>
> _(Original framing, kept for provenance:)_ The pilot was a *direction, not a plan*: no document named who pilots, on which project, starting when, with what success criteria — while a de-facto pilot had already begun (field feedback exists) ahead of the A6 gate, on staging where email is sandboxed and both hubs have no contact address. This charter closes that.

---

## 1. Who, what, when

- **Pilot operators (names):** 9 operators —
  - Jacob Webb / jswebb86@gmail.com
  - Brett Hill / brettafhill@gmail.com
  - Lauren Webb / ldwebbusiness@gmail.com
  - Peter Chasteen / peterchasteen@gmail.com
  - Maxwell Slater / maxtslater@gmail.com
  - Zachary Ott / zott1990@gmail.com
  - Angel Salinas / captainsalinas7@gmail.com
  - Lucas Pistek / pisteklucas@gmail.com
  - Stewart Arbuckle / sarbuckle@agricarbon.co.uk
- **Project:** **CUL005** (the single real project the pilot rides on).
- **Start date:** **Monday 2026-07-27** — contingent on the **iOS A6-Lite pass** landing before then (§3). D5 = **Option A** (§5); charter signed + A6-Lite Android green (both 2026-07-20), iOS A6-Lite still to run. The date is the first Monday after the Android pass (20th → 27th); if the iOS pass slips past the 27th, the start slips with it. _(Max: if you meant to start the same week, say so — this reads "first Monday after.")_
- **Duration:** one pilot fortnight (2 weeks), with CC-27 as scheduled filler and CC-26 landed before it starts.
- **Pilot owner (drives sessions, decides):** Max.
- **Second human — pilot-hours contact (D7):** **Stewart Arbuckle · +44 7747 738364** — the person an operator reaches at 6am when Max is unreachable. **A pilot with one human is a single point of failure.** _(Number **CONFIRMED correct as written** — Max, 2026-07-21.)_

## 2. The three success metrics (measured, not vibed)

1. **Adoption ≥ 90% by week 2** — % of eligible daily checks / deployments actually done in-app vs. worked around (texting). Denominator instrumentation is explicitly assigned to **CC-14** (it must exist day 1).
2. **Daily-check time-to-complete** — instrumented client-side from day 1 (CC-14 #5 already lands this). Baseline it on day 1; watch the trend, not a single number.
3. **Zero lost writes** — the offline outbox is empty after every reconnect. Any queued action that fails to sync (outside a normal 401-park-then-resume) is a P0 pilot incident.

## 3. The gates that must be green before start

- **A6-Lite device pass (per D13, D14) — rows 2, 5, 6, 19, 23, **29** on iOS; the cohort includes iOS operators, and CC-15 added row 29 (location grant/deny at the daily check):**
  - [x] **Android — ✅ GREEN (2026-07-20, Max)**, rows 2/5/6/19/23. **Quick re-verify on the post-CC-15 build: rows 2 / 19 / 29** (GPS capture touched the check flow).
  - [ ] **iOS (installed PWA) — ☐ REQUIRED before the 2026-07-27 start — rows 2 / 5 / 6 / 19 / 23 / 29.** ← **the one outstanding pre-start gate** (target Fri 2026-07-24). << Max to run + sign >>.
  - The **full A6 matrix stays PARKED — trigger = before CC-17 (Time/Invoicing) ships** (D13); parked scope = edge rows 20–22 + the all-column ceremony. (`AHITS_A6_DEVICE_CHECKLIST.md`.)
- [x] **CC-15 Deployment Map SHIPPED (D14)** — PRs #197/#198 merged 2026-07-21, staging-smoked. The **admin map (pins + recency + route history) and the operator crew map launch WITH the pilot**; GPS capture is live on the daily check.
- [x] **CC-26 daily-check admin viewer landed** — PR #195, live on staging (2026-07-19).
- [x] **Today view (CC-14) landed** — PRs #190–#194, live on staging (2026-07-19); D5 = Option A (§5).
- [x] **CC-22 cron heartbeat live** — PR #182; `AHITS_CRON_HEARTBEAT_URL` provisioned on staging.
- [x] **Sentry DSN provided** — `AHITS_SENTRY_DSN` provisioned ENABLED on staging (CC-22). (Strongly recommended, met.)

## 4. Sandbox-flip rule (D6)

Email is sandboxed on staging and both hubs currently have **no contact address**. `EMAIL_SANDBOX` is one **global** env var — a per-hub flip is impossible. The rule (D6, timing amended by **D15**): **flip global `EMAIL_SANDBOX` off ONLY AFTER (a) verifying only pilot hubs have contact addresses, and (b) auditing all non-hub recipient paths (shop emails, invites, invoice sends) for real addresses in staging data.** **The flip is gated on the audits (a)+(b) AND a verified Resend sending domain — NOT on the start date (D15):** it happens whenever those land, before or after Monday. Email is optional at launch — copy-link invites onboard everyone by text, so a still-sandboxed Monday gates nothing.
- **Owner:** Max runs (a) and (b) and does the flip. Audit-then-flip, always; the rollback is flipping back, but sent email doesn't unsend.

## 5. D5 decision block — Max initials one

**The pilot must not launch onto the verified static 4-card menu** (that's competing with texting using a directory). Two ways to satisfy that:

- **(✓) Option A — HOLD the pilot fortnight until Today (CC-14) ships. [CHOSEN]** Cleanest; the operator's front door is real. Cost: pilot start slips to the CC-14 landing session — **condition already met, CC-14 is live on staging.**
  - Max initials: **MS · 2026-07-20**
- **( ) Option B — Today-lite bridge (CC-28).** NOT taken. **CC-28 is permanently moot** — the full Today view shipped, so the throwaway bridge will never be built.
  - Max initials: ~~______~~ (n/a)

*(This D5 outcome also feeds the CC-14 packet placeholder — see AMENDMENTS.md.)*

> **Update 2026-07-19 (CC-14 shipped) — provenance, now superseded by the signed header:** Building the full **Today view (CC-14)** landed and deployed to staging (PRs #190–#193), making this **Option A in practice — this packet IS the pilot gate, and no CC-28 bridge was built.** _(This paragraph once flagged D5 as "uninitialed"; that is **RESOLVED** — Max initialed D5 = Option A · MS · 2026-07-20 above, and the charter is signed. Kept for provenance.)_ The remaining pilot-start blocker is now the **iOS A6-Lite pass** only. See `DECISIONS.md` D5 (RESOLVED) and D11 (the deferred CC-14 glossary sweep).

## 6. The variance check — on a calendar, with an owner

Pencil-whipping detection (time-to-complete outliers + a periodic contents spot-check via the CC-26 viewer) is only real if someone actually looks.
- **Cadence:** every Monday, weeks 1–2, plus a summary variance review **~1 month after start**.
- **Owner:** **Maxwell Slater** — opens the CC-26 viewer and eyeballs N checks against the time-to-complete outliers.
- **Also glance at the admin map** in the same slot — pins appear as checks arrive (no new ceremony).
- **Observational only (NOT a target):** **GPS grant rate** — % of checks carrying coords. Mass denial is a coaching signal (say the location script better) and the map's quiet failure mode; a check counts either way, so this never gates or scores anyone.
- **Recorded where:** the running pilot log (this doc's appendix).

---

## OPERATOR CAN'T SYNC — triage card
### Print this. A non-technical person follows it top to bottom. Queued work is SAFE — do not panic, do not reinstall.

1. **Check the phone's connection.** Is Airplane Mode ON? Turn it off. Is Wi-Fi/cell data working (open any web page)? If there's truly no signal, that's fine — the app saves your work and sends it when you're back online. Stop here until you have signal.
2. **Open the AHITS app and look at the top for a colored banner.** Read what it says.
3. **Take a screenshot of the banner** (and the screen) BEFORE trying anything else — evidence first; it helps whoever you contact.
4. **If the banner says "waiting to sync" (or similar) AND you have a working connection:** your session likely expired. **Signing out and back in is SAFE — your queued work survives it** (the app parks unsent actions when a session expires and resends them after you sign in). Sign out, then **sign back in as yourself (the same account)**, and **wait up to a minute** — the queue sends on its own schedule.
5. **Text the second contact:** **Stewart Arbuckle · +44 7747 738364**. Send the screenshot and one line of what happened.
6. **NEVER clear the browser data, clear the site data, or reinstall / delete the app to "fix" it.** That deletes the work waiting to be sent. There is no undo. If someone tells you to reinstall, stop and check with the contact first.
7. **Still stuck after sign-out/in?** Escalation contact: **Maxwell Slater** · **+1 419-944-1939** (maxtslater@gmail.com). Keep the phone as-is (don't clear anything) until you hear back.

*Why sign-out/in is safe: expired sessions return a real 401 and the offline queue parks the items rather than failing them (CC-03). Reinstalling wipes that queue — that's the one irreversible mistake, hence step 6.*
