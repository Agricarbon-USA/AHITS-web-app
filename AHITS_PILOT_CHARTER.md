# AHITS — Pilot Charter
### One page. Fill the placeholders, then this is the plan. · 2026-07-12

> The pilot is currently a *direction, not a plan*: no document names who pilots, on which project, starting when, with what success criteria — while a de-facto pilot has already begun (field feedback exists) ahead of the A6 gate, on staging where email is sandboxed and both hubs have no contact address. This charter closes that. **Max fills every `<< >>` placeholder; the seat recommendations are defaults, not decisions.**

---

## 1. Who, what, when

- **Pilot operators (names):** << names — the real people whose phones this runs on >>
- **Project:** << the single real project the pilot rides on >>
- **Start date:** contingent on the §5 D5 choice — Option A: **the session CC-14 (Today view) lands** [recommended]; Option B: the session the Today-lite bridge (CC-28) lands. << confirm date after initialing D5 >>
- **Duration:** one pilot fortnight (2 weeks), with CC-27 as scheduled filler and CC-26 landed before it starts.
- **Pilot owner (drives sessions, decides):** Max.
- **Second human — pilot-hours contact (D7):** << name + phone/text >> — the person an operator reaches at 6am when Max is unreachable. **A pilot with one human is a single point of failure.**

## 2. The three success metrics (measured, not vibed)

1. **Adoption ≥ 90% by week 2** — % of eligible daily checks / deployments actually done in-app vs. worked around (texting). Denominator instrumentation is explicitly assigned to **CC-14** (it must exist day 1).
2. **Daily-check time-to-complete** — instrumented client-side from day 1 (CC-14 #5 already lands this). Baseline it on day 1; watch the trend, not a single number.
3. **Zero lost writes** — the offline outbox is empty after every reconnect. Any queued action that fails to sync (outside a normal 401-park-then-resume) is a P0 pilot incident.

## 3. The gates that must be green before start

- [ ] **A6 device pass — clean, signed. Hard date THIS WEEK: << date, this week >>.** This is the pilot line; a failure redirects Wave-B work, so run it early. (`AHITS_A6_DEVICE_CHECKLIST.md`.)
- [ ] **CC-26 daily-check admin viewer landed** — without it, diligent and pencil-whipped checks are indistinguishable and the data-quality metric is unfalsifiable.
- [ ] **Today view (CC-14) landed** (see §5 D5) — or the D5 Today-lite bridge chosen.
- [ ] **CC-22 cron heartbeat live** — the pilot's production heartbeat now has a silence alarm.
- [ ] **Sentry DSN provided** (`AHITS_SENTRY_DSN` created ENABLED + the CC-22 activation deploy) — **strongly recommended before pilot**, not a hard gate unless Max declares it one.

## 4. Sandbox-flip rule (D6)

Email is sandboxed on staging and both hubs currently have **no contact address**. `EMAIL_SANDBOX` is one **global** env var — a per-hub flip is impossible. The rule (D6): **on the charter start date, flip global `EMAIL_SANDBOX` off, AFTER (a) verifying only pilot hubs have contact addresses, (b) auditing all non-hub recipient paths (shop emails, invites, invoice sends) for real addresses in staging data.**
- **Owner:** Max runs (a) and (b) and does the flip. Not before the start date.

## 5. D5 decision block — Max initials one

**The pilot must not launch onto the verified static 4-card menu** (that's competing with texting using a directory). Two ways to satisfy that:

- **( ) Option A — HOLD the pilot fortnight until Today (CC-14) ships. [RECOMMENDED]** Cleanest; the operator's front door is real. Cost: pilot start slips to the CC-14 landing session.
  - Max initials: ______
- **( ) Option B — Today-lite bridge.** Ship a minimal bridge on the existing dashboard — check-done chip + transfers-waiting-on-me row + Awaiting-Pickup cards — as packet **CC-28 (number reserved)**, inserted after CC-26, and start the pilot on that. Cost: a throwaway surface; risk of anchoring on it.
  - Max initials: ______

*(This D5 outcome also feeds the CC-14 packet placeholder — see AMENDMENTS.md.)*

> **Update 2026-07-19 (CC-14 shipped):** Building the full **Today view (CC-14)** landed and deployed to staging (PRs #190–#193), which makes this **Option A in practice — this packet IS the pilot gate, and no CC-28 bridge was built.** D5 is left **uninitialed above** (Max's signature still needed to close it formally). Max's stated operative gate for pilot start: **CC-14 on staging (done) AND this charter signed AND the A6 device pass green.** So the remaining pilot-start blockers are the charter signature and the A6 pass — not the Today view. See `DECISIONS.md` D5 (status) and D11 (the deferred CC-14 glossary sweep).

## 6. The variance check — on a calendar, with an owner

Pencil-whipping detection (time-to-complete outliers + a periodic contents spot-check via the CC-26 viewer) is only real if someone actually looks.
- **Cadence:** << e.g. every Monday, weeks 1–2 >>
- **Owner:** << name — the human who opens the viewer and eyeballs N checks >>
- **Recorded where:** << the running pilot log / this doc's appendix >>

---

## OPERATOR CAN'T SYNC — triage card
### Print this. A non-technical person follows it top to bottom. Queued work is SAFE — do not panic, do not reinstall.

1. **Check the phone's connection.** Is Airplane Mode ON? Turn it off. Is Wi-Fi/cell data working (open any web page)? If there's truly no signal, that's fine — the app saves your work and sends it when you're back online. Stop here until you have signal.
2. **Open the AHITS app and look at the top for a colored banner.** Read what it says.
3. **Take a screenshot of the banner** (and the screen) BEFORE trying anything else — evidence first; it helps whoever you contact.
4. **If the banner says "waiting to sync" (or similar) AND you have a working connection:** your session likely expired. **Signing out and back in is SAFE — your queued work survives it** (the app parks unsent actions when a session expires and resends them after you sign in). Sign out, then **sign back in as yourself (the same account)**, and **wait up to a minute** — the queue sends on its own schedule.
5. **Text the second contact:** << name + number from §1 >>. Send the screenshot and one line of what happened.
6. **NEVER clear the browser data, clear the site data, or reinstall / delete the app to "fix" it.** That deletes the work waiting to be sent. There is no undo. If someone tells you to reinstall, stop and check with the contact first.
7. **Still stuck after sign-out/in?** Escalation contact: << Max — name + number >>. Keep the phone as-is (don't clear anything) until you hear back.

*Why sign-out/in is safe: expired sessions return a real 401 and the offline queue parks the items rather than failing them (CC-03). Reinstalling wipes that queue — that's the one irreversible mistake, hence step 6.*
