# AHITS — Session Handoff · 2026-07-20 (pilot launch prep)

> STATUS: canonical · UPDATED: 2026-07-20 · READ-WITH: `STATUS.md`, `DECISIONS.md`, `AHITS_PILOT_CHARTER.md`

## Headline: 🟢 THE PILOT IS GO — start Monday 2026-07-27

No code shipped this session — it closed out the pilot-launch decisions. Both pre-start gates are green and the charter is signed.

## What happened (in order)

1. **Pilot charter filled + SIGNED** (`AHITS_PILOT_CHARTER.md`, Max, 2026-07-20): 9 operators, project **CUL005**, second contact **Stewart Arbuckle / +44 7747 738364**, variance-check owner Max (weekly + ~1-month review).
2. **D5/D6/D7 resolved** (flipped PENDING → ACTIVE in `DECISIONS.md`): **D5 = Option A** (hold for Today — condition already met; **CC-28 permanently moot**), **D6** = sandbox-flip rule confirmed (flip `EMAIL_SANDBOX` off on the start date, only after the pilot-hub-address + non-hub-recipient audits — nothing flipped yet), **D7** = Stewart Arbuckle.
3. **D13 — pilot gate narrowed to A6-Lite.** The full A6 matrix (28 rows × 5 targets) was **shelved as a pilot gate**; the pilot gate became **A6-Lite = rows 2, 5, 6, 19, 23 on Android** (data-safety keystones + live scan). Rationale: in-field connectivity, small cohort, watched daily; the offline queue stays active in production — D13 defers *verification*, not the feature. **Full-matrix trigger: before CC-17 (Time/Invoicing) ships** — offline money-writes must not go live on an unverified offline base.
4. **A6-Lite EXECUTED and GREEN** (Max sign-off, 2026-07-20, Android — rows 2/5/6/19/23 all pass). Recorded in D13's "EXECUTED" note and the A6 checklist header.
5. With both gates green (charter signed + A6-Lite passed, both Monday 2026-07-20), the **start date resolved to Monday 2026-07-27** (first Monday *after* A6-Lite passed).

## Decisions this session

- **D5 / D6 / D7** — RESOLVED 2026-07-20 (see above).
- **D13 (ACTIVE)** — pilot gate = A6-Lite; full A6 matrix parked to pre-CC-17; amends D5's condition ("A6 green" → "A6-Lite green"); EXECUTED note records the pass.
- **Consequence flagged:** CC-25's full live-camera acceptance rode the full A6's iOS columns, so it **defers to the pre-CC-17 run** with the rest of the matrix; the pilot leaned on the Android live-scan row (23), which passed.

## The ONE remaining charter blank

Everything else is filled (D5/D6/D7, 9 operators, CUL005, start date 2026-07-27, §3 A6-Lite date). **The only blank left is Max's own escalation phone number** in the OPERATOR CAN'T SYNC triage card (step 7) — needed before that card is printed for operators. (Also: the D7 number as supplied had a trailing stray "r", recorded as `+44 7747 738364` — Max to confirm the digits.)

## Resume points (next session = the pilot fortnight begins)

1. **Launch prep for Monday 2026-07-27:** Max fills his escalation phone (triage card step 7), runs the **D6 sandbox-flip audits on Day 1** (verify only pilot hubs have contact addresses; audit non-hub recipient paths — shop emails, invites, invoice sends — for real addresses in staging data; then flip `EMAIL_SANDBOX` off), and prints the triage card.
2. **During the fortnight — the three success metrics (charter §2):** adoption ≥ 90% by week 2 (the `/api/admin/pilot-metrics` denominator exists), daily-check time-to-complete trend (`DailyCheck.durationMs`), zero lost writes (offline outbox empty after every reconnect — any failed sync outside a normal 401-park is a P0). Variance check weekly (Max, via the CC-26 viewer).
3. **Packet sequence:** CC-27 as scheduled filler during the fortnight → CC-15/16/17/18. **Before CC-17 ships: run the full A6 matrix** (all rows × all targets incl. iOS) — the parked D13 trigger.
4. **Carried non-code items (STATUS §3):** CC-22 live acceptance pass (Sentry capture, healthchecks ping, CRON_SILENT). **D11** glossary sweep still owned by a future session.
