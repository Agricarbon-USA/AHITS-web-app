# AHITS — Session Handoff · 2026-07-20 (pilot launch prep)

> STATUS: canonical · UPDATED: 2026-07-20 · READ-WITH: `STATUS.md`, `DECISIONS.md`, `AHITS_PILOT_CHARTER.md`

## Headline: 🟡 PILOT GO PENDING ONE GATE — start Monday 2026-07-27 (contingent on the iOS A6-Lite pass)

No code shipped this session — it closed out the pilot-launch decisions. Charter signed; A6-Lite **Android** green (2026-07-20). **Late in the session D13 was amended: the cohort now includes iOS operators, so A6-Lite extended — rows 2/5/6/19/23 must ALSO pass on one iOS installed-PWA before the 07-27 start.** That iOS pass is the one outstanding pre-start gate.

## What happened (in order)

1. **Pilot charter filled + SIGNED** (`AHITS_PILOT_CHARTER.md`, Max, 2026-07-20): 9 operators, project **CUL005**, second contact **Stewart Arbuckle / +44 7747 738364**, variance-check owner Max (weekly + ~1-month review).
2. **D5/D6/D7 resolved** (flipped PENDING → ACTIVE in `DECISIONS.md`): **D5 = Option A** (hold for Today — condition already met; **CC-28 permanently moot**), **D6** = sandbox-flip rule confirmed (flip `EMAIL_SANDBOX` off on the start date, only after the pilot-hub-address + non-hub-recipient audits — nothing flipped yet), **D7** = Stewart Arbuckle.
3. **D13 — pilot gate narrowed to A6-Lite.** The full A6 matrix (28 rows × 5 targets) was **shelved as a pilot gate**; the pilot gate became **A6-Lite = rows 2, 5, 6, 19, 23 on Android** (data-safety keystones + live scan). Rationale: in-field connectivity, small cohort, watched daily; the offline queue stays active in production — D13 defers *verification*, not the feature. **Full-matrix trigger: before CC-17 (Time/Invoicing) ships** — offline money-writes must not go live on an unverified offline base.
4. **A6-Lite EXECUTED and GREEN** (Max sign-off, 2026-07-20, Android — rows 2/5/6/19/23 all pass). Recorded in D13's "EXECUTED" note and the A6 checklist header.
5. With charter signed + Android A6-Lite passed (both Monday 2026-07-20), the **start date resolved to Monday 2026-07-27** (first Monday *after* the Android pass).
6. **Same-day amendment:** the cohort was confirmed to include **iOS operators**, so D13's A6-Lite was extended to require the same five rows on **one iOS installed-PWA before the 07-27 start**. That iOS pass is now the one outstanding pre-start gate; the 07-27 date is contingent on it.

## Decisions this session

- **D5 / D6 / D7** — RESOLVED 2026-07-20 (see above).
- **D13 (ACTIVE)** — pilot gate = A6-Lite; full A6 matrix parked to pre-CC-17; amends D5's condition ("A6 green" → "A6-Lite green"); EXECUTED note records the pass.
- **Consequence flagged:** CC-25's full live-camera acceptance rode the full A6's iOS columns, so it **defers to the pre-CC-17 run** with the rest of the matrix; the pilot leaned on the Android live-scan row (23), which passed.

## Outstanding before the 07-27 start (ONE item)

- **A6-Lite iOS pass** — rows 2/5/6/19/23 on one iOS installed-PWA (D13 amendment). The sole remaining pre-start *gate*; the start date is contingent on it.

Everything else is filled: D5/D6/D7, 9 operators, CUL005, start date 2026-07-27, §3 Android A6-Lite date, and **Max's escalation phone (+1 419-944-1939, triage card step 7)**. (The D7 number as supplied had a trailing stray "r", recorded as `+44 7747 738364` — Max to confirm the digits.)

## Resume points (next session = the pilot fortnight begins)

1. **Launch prep for Monday 2026-07-27:** **run the A6-Lite iOS pass** (installed PWA, rows 2/5/6/19/23 — the sole outstanding gate), run the **D6 sandbox-flip audits on Day 1** (verify only pilot hubs have contact addresses; audit non-hub recipient paths — shop emails, invites, invoice sends — for real addresses in staging data; then flip `EMAIL_SANDBOX` off), and print the triage card (escalation phone now filled: +1 419-944-1939).
2. **During the fortnight — the three success metrics (charter §2):** adoption ≥ 90% by week 2 (the `/api/admin/pilot-metrics` denominator exists), daily-check time-to-complete trend (`DailyCheck.durationMs`), zero lost writes (offline outbox empty after every reconnect — any failed sync outside a normal 401-park is a P0). Variance check weekly (Max, via the CC-26 viewer).
3. **Packet sequence:** **CC-27 is DONE** (below) → CC-15/16/17/18. **Before CC-17 ships: run the full A6 matrix** (all rows × all targets incl. iOS) — the parked D13 trigger.
4. **Carried non-code items (STATUS §3):** CC-22 live acceptance pass (Sentry capture, healthchecks ping, CRON_SILENT). **D11** glossary sweep still owned by a future session.

---

## Also shipped this session — CC-27 (the pilot-fortnight filler)

**FulfillmentChecklist rebuilt on MUI + tokens (PR #196, merged, live on staging).** It was an entire parallel UNTHEMED design system — raw-HTML inline styles, hardcoded hex, system-font buttons next to MUI buttons on the same screen (the most visible "two apps in one page" spot, in admin/requests). Now on MUI + the tokens-sourced theme (Button/TextField/MenuItem + StatusChip; themed primary/info/error/default — no raw hex, no system-font).

- **Behavior-identical re-skin:** logic/state/handlers/props/exported interface byte-identical; `deltaLine()` + optimistic-update copied verbatim; Select empty-value semantics, the serialized needs-unit gate, the qty clamp, stage-gating, per-form errors, and disabled-during-load all preserved.
- Removed the file's CC-23 no-hex lint-allowlist entry (the hex rule now enforces it); kept `src/app/s/**` (CC-23 item 1 owns the portal re-palette).
- **6 parity component tests** (exact `onLineAction` args per action, serialized gate, deny-requires-reason, stage-gating, read-only mode). `test:ui` 65 → 71.
- **Merge gate met (not CI-green alone):** ran the authenticated **hub-flow staging smoke** (Max signed in; Claude never touched credentials) — created a 2-line RESERVATION on admin/requests and fulfilled it end-to-end through the rebuilt checklist: Edit→"Adjusted"+delta, Deny validation ("Please enter a reason.") + real deny→"Denied", progress→green "✓ Ready to stage", Stage→"Reservation staged". Test data cleaned up (cancelled). All parity behaviours held against the real backend.
- **Correction:** render consumers are **admin/requests + the `s/[token]` portal** (operator/requests only references the component in a code comment — the PR body's "3 consumers" was wrong). The portal (not smoked — needs a live token) shifts system-ui→Inter, a known delta CC-23 item 1 subsumes.
- **Not real-data-smoked (CI-covered):** the serialized unit-gate with live hub stock; the portal render.
