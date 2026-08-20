# AHITS — The Undisputed Build Program · 2026-07-30

> STATUS: canonical plan (integrates the pilot-floor TODO, the UXP queue, the roadmap, and the 2026-07-30 build-vs-buy interrogation) · UPDATED: 2026-07-30
> READ-WITH: `AHITS_PILOT_FLOOR_TODO.md` (the live checklist — Wave 0/1 of this program) · `AHITS_VS_AIRTABLE_BAKEOFF_2026-07-30.md` (why this program exists) · `AHITS_UX_PACKETS_2026-07-29.md` + `AHITS_UX_PLAYBOOK_COPY_PASTE.md` (build mechanics) · `DECISIONS.md`
> **The goal, in one sentence:** make AHITS the option no honest re-run of the bake-off can dispute — every MUST *verified not asserted*, both stakeholder drivers answered with shipped artifacts, the bus factor covered by a second pair of drilled hands, and adoption proven against the group text at n>15 — **while the in-field rollout continues uninterrupted.**
> **Operating rules (unchanged):** one bet per quarter · evening deploys, merge-is-deploy (D16) · packet discipline with pre-flight riders · demand-pull for primitives · verified-✓ requires a dated artifact in STATUS or a checklist file.

---

## 0 · What "undisputed" requires (the test this program passes)

1. Every register MUST **✓ with evidence** — no "merged, smoke owed," no unticked ops boxes, no never-run gates.
2. The three named stakeholder drivers (reporting appetite · Airtable familiarity · build cost) each answered by a **shipped artifact**, not an argument.
3. Every antagonist attack on AHITS **retired with a dated artifact** (backup drill record, maintainer agreement, questionnaire pack, falsifier readout).
4. Every bake-off revisit trigger **structurally prevented or actively monitored** (§6).
5. **Two humans** who have each independently deployed, restored, and triaged the live system.
6. Adoption **measured, not asserted**: n>15 independent operators vs the group-text baseline, pass bars written before data collection.

---

## 1 · New components entering the plan (the "noted items")

| ID | Component | What it is | Grounding | Wave |
|---|---|---|---|---|
| **RL-1** | **Airtable read layer (Airtable API)** | One-way nightly sync, AHITS Postgres → one "AHITS Reporting" base (~12 denormalized read tables) + the CC-18-shaped week-board timeline interface. Retires drivers #1 and #2; absorbs CC-18 this quarter. Paste-ready packet in §5. | Bake-off ruling; PRD §9.3 (always the plan); $0–4k / 40–80 hrs | **1** |
| **M-1** | **Second maintainer** | Named contract engineer on small retainer (~4–8 hrs/mo). Validated by *personally* running: one restore drill, one full deploy, one Sentry triage, one rollback. Own credentials everywhere. Reviews money-path PRs from CC-17's first line; branch-protection approvals go 0→1. 72-hour break-glass runbook. | The keystone — the one gap that regenerates the challenger case forever if left undone | **1–2 (signed before CC-17 code-start — hard gate)** |
| **SEC-1** | **UK-parent security pack** | Architecture/data-flow one-pager, subprocessor list, backup attestation w/ drill date + RPO/RTO, PIN-auth rationale + compensating controls, patch cadence w/ named owner + backstop, incident response, secrets inventory. Converts a future IT-questionnaire ambush into a handed-over document. | Antagonist attack #4 (security one throat deep) | **2** |
| **TIME (CC-17)** | **Timesheets / money loop** | Full Clockify replacement per D19: in-app clock riding existing actions, task-type rates, rate snapshots, earnings view (MID-3), invoice pipeline (INVOICE StatusLinks as the delivery channel). Already roadmapped — now sequenced behind its gates (§3 Wave 3). | D19 ACTIVE; the adoption engine (North Star money loop) | **3 (off-season)** |
| **SHIP-1** | **Shippo API activation** | Turn the F2 groundwork (hub address columns + `20260625080000_f2_shippo_groundwork` migration, already live) into real label generation + tracking for HUB_RETURN and SHIP_FOR_REPAIR flows; tracking status feeds the IN_TRANSIT visibility the drift detector already watches. | F2 groundwork laid; **D23 keeps its trigger** — activates when return/repair shipping becomes routine (≥~2 shipments/week sustained) or CC-17 invoicing needs freight lines | **3–4 (trigger-gated)** |
| **GAP-*** | **The gap register** | Everything real found across the two interrogations that isn't yet queued — itemized in §2. | UX review parking lot + bake-off attacks | **1–4** |

**GAP register (each becomes a rider or small packet; none is a new "bet"):**
- GAP-1 Per-account login rate-limiter keying (CGNAT crew-lockout seam) — correctness session, Wave 2.
- GAP-2 MATERIAL fulfilled-qty line-level model — spec only in Wave 2; build rides CC-17-adjacent.
- GAP-3 Secondary-operator Today packet (review §3.2) — pre-CC-17, Wave 2.
- GAP-4 Stale-hold cron bug fix + first cron-route tests (incl. the advisory-lock connect-error branch) — Wave 0.
- GAP-5 Photo policy execution (library-vs-camera; no-camera submit path) per UXP-3 pre-flight answers — Wave 2 (inside UXP-3).
- GAP-6 D1 prod-cutover **trigger written into DECISIONS** (earlier of: CC-17 code-complete before first real payroll period · >20 operators · parent-IT requirement) — Wave 1, one hour.
- GAP-7 Full A6 offline matrix (28×5) run EARLY, in-season, recorded same-day — so a failure freezes CC-17 cheaply — Wave 2.
- GAP-8 n>15 adoption instrumentation (design §6) — Wave 2 design, runs continuously.
- GAP-9 Pipeline proofs: one trivially-additive migration PR through the full migrate path; SA-key rotation play + first rotation — Wave 2.
- GAP-10 Bell deep-link anchoring + notification unread-clearing (UX parking lot) — ride-along filler, any wave.
- GAP-11 Annual bake-off re-run as a standing audit — Wave 4, ~8 hrs/yr.

---

## 2 · The integrated wave plan

**Wave 0 — THIS WEEK (the unfinished batch; kicks off immediately, nothing new invented).**
Exactly the current `AHITS_PILOT_FLOOR_TODO.md` §1–§4 plus the UXP-1 residuals, executed as written: the phone-smoke session (now including the UXP-1 rows and the 1e Back-gesture check) + overnight replay · CC-30 boxes a–d + h (+i optional) · paste D30/D31/D32 + D28 supersession · GAP-4 stale-hold fix + cron test (one short session) · Clockify tap-count + group-text baselines captured **before more operators onboard** · Stewart admin + one-pager + triage card · worktree/preview cleanup. **Rollout impact: none — this IS the first-operator gate work.** Exit criteria: TODO §1–§4 fully ticked, results recorded in STATUS §3, owed-smoke ledger ~zero.

**Wave 1 — WEEKS 1–3 (the read layer + the paperwork that changes the risk math).**
RL-1 built and live (packet §5; one session + a follow-up) · GAP-6 D1 trigger + the **no-write-back decision** recorded in DECISIONS (one hour, same paste session as D30–32 if convenient) · M-1 search opens (post the retainer role; candidates exist in any TS/Next contractor pool) · UXP-2 Sunlight & Touch ships (playbook Step 6 — pure presentation, zero rollout risk) · 60-day RL-1 falsifier date in the calendar. **Rollout impact: operators see UXP-2's legibility wins; managers get self-serve reporting for the first time.**

**Wave 2 — WEEKS 3–8 (verification depth + the flow closers + the people layer).**
UXP-3 Flow Closers (playbook Step 7 — answer the two photo YES/NOs first; includes GAP-5; the Fulfill-notify fix ends the last flow that loses to texting) · correctness session: GAP-1 + GAP-2 spec (playbook Step 9) · GAP-3 secondary-operator packet · GAP-7 **full A6 matrix run + recorded** · GAP-9 pipeline proofs · M-1 **signed and drilled** (restore drill + one deploy, personally) · SEC-1 pack assembled from Wave-0/1 artifacts · GAP-8 adoption instrumentation live · standing monitors added to STATUS header (§6) · day-60 falsifier readout. **Rollout impact: crews scale onto a system whose gates are now run, not asserted.**

**Wave 3 — OFF-SEASON / Q4 (the money loop, behind its gates).**
**CC-17 Timesheets** — preconditions all green before code-start: M-1 signed ✓ · A6 matrix recorded ✓ (GAP-7) · Clockify taps measured ✓ (Wave 0) · written Clockify-retained fallback ✓ · D3 exclusion in the resolver · invoice wedge demoed early against manual hours · acceptance = one payroll period clock→PAID with **zero manual corrections** · M-1 reviews every money-path PR. 6–10 weeks, the quarter's one bet. **SHIP-1 decision point rides here**: if the D23 trigger has fired (shipping volume) or invoicing needs freight lines, activate Shippo as a small CC-17-adjacent packet (S–M effort — groundwork exists); otherwise it stays parked with its trigger restated. **D1 prod cutover executes if its trigger fires** (it will, if CC-17 completes before the first real payroll period — money does not live on staging).

**Wave 4 — SEASON 2 / 12 MONTHS (proof at scale).**
CC-18 decided by evidence: if the RL-1 week board won its falsifier, native CC-18 stays dead; else build 2–4 weeks · n 20–40 scale proof published (churn throughput, support-load curve) · GAP-11 annual bake-off re-run · UXP-4/5 continue as ride-alongs (never standalone sweeps) · SHIP-1 if newly triggered · parked registry reviewed once.

---

## 3 · How this maps onto what already existed (nothing lost, three things moved)

The pilot-floor TODO §1–§4 = Wave 0 verbatim. The UXP queue keeps its order (UXP-1 ✅ done → UXP-2 Wave 1 → UXP-3 Wave 2 → 4/5 ride-alongs). The roadmap's spine (secondary-operator → CC-17 → CC-18) is intact with three changes, each evidence-backed: **(1) CC-18 is absorbed by RL-1's week board** and only returns if the falsifier fails — refunding 2–4 weeks; **(2) the full A6 matrix moves EARLY** (Wave 2, in-season) instead of sitting just-before-CC-17 — a failure discovered early freezes CC-17 cheaply instead of in crisis; **(3) M-1 becomes a hard CC-17 precondition** — money-grade code does not ship one-person-deep. Everything in the parked registry stays parked with its trigger (CC-16-proper/D18 · weather stamps · native wrapper · MobileCardTable-as-sweep); SHIP-1 is the one parked item promoted to a named, trigger-gated slot because its groundwork is already in the schema and CC-17 touches its seam.

---

## 4 · Owners

**Max:** Wave 0 checklists, merges, falsifier readouts, decisions. **Stewart (admin #2):** RL-1 base ownership candidate on the Airtable side; second pair of eyes on the one-pager + onboarding. **M-1 maintainer (once signed):** drills, money-path reviews, break-glass. **Build sessions:** everything with a packet/paste block. **The read layer, deliberately, has no operator-facing surface — no operator's day changes in any wave except for the better (UXP-2/3).**

---

## 5 · RL-1 — the read-layer packet (paste into a fresh session after Wave 0's boxes are done)

```
Read 00_START_HERE.md, STATUS.md, DECISIONS.md, CLAUDE.md first, as always.

This session builds RL-1: the one-way Airtable read layer from the 2026-07-30 bake-off ruling (AHITS_VS_AIRTABLE_BAKEOFF_2026-07-30.md §6-7 — read the "hybrid, one level deeper" section; this packet implements it exactly).

Scope:
1. A read-only Postgres role for the sync (SELECT only — the no-write-back guarantee is structural, not policy).
2. A sync job on the existing Cloud Run (scheduled like the cron dispatcher): upserts ~12 denormalized read-model tables into ONE Airtable base ("AHITS Reporting") via the Airtable Web API, keyed on a locked ahits_id field per table: checks_flat, custody_ledger, deployments, fleet_status (vehicles + maintenance nextDue + insurance/registration), inventory_positions, requests_lines, alerts_open, alerts_resolved, maintenance_tasks, operators_roster (no PII beyond name/hub), pilot_metrics_daily, sync_meta. pilot_metrics_daily is PRE-AGGREGATED IN SQL so metric logic never forks — Airtable renders, never computes.
3. Cost/rate columns land ONLY in a manager-restricted table. Photos sync as thumbnail URLs or link-outs to AHITS's signed viewer — never attachments.
4. Freshness: per-table lastSyncedAt stamps into sync_meta + a sync-age > 26h alert raised through AHITS's EXISTING alert engine (new sourceId on an existing type if possible — no enum change without a decision).
5. The week board: a timeline interface in the base over deployments × days (maintenance nextDue, request neededBy, rental windows, missed-check flags) — this absorbs CC-18 pending its falsifier.
6. Guardrails shipped WITH the packet: a CI check that fails when a Prisma migration touches a synced column without a mapping update; Airtable-side edits live only in designated annotation fields the sync never reads; sync a rolling window (current + prior season) so Airtable record caps never bite — 3-year retention stays in Postgres.
7. Docs: append the no-write-back decision (D33 candidate) + the D1 cutover trigger (D34 candidate — verify numbering) to DECISIONS.md wording per the program doc; put the 60-day falsifier in STATUS §4 with its date.

Hard rules: NO operator-facing changes, NO write path anywhere near Airtable, NO schema changes to operational tables (sync_meta and the read role are additive), mapper gets unit tests, tests/offline untouched and green. PR(s) to development, evening merge on my go. Session-close contract applies.

Pre-flight (Max, 5 min): create/confirm an Airtable base + base-scoped personal access token with access ONLY to "AHITS Reporting", and tell the session the workspace/base ID + which 2-3 managers get editor seats.
```

---

## 6 · Standing monitors & triggers (added to the STATUS header, reviewed monthly)

Recorded build sessions/month ≥2 · operator support ≤2 hrs/week · owed-smoke ledger ≤5 items, all dated · RL-1 sync-age alert quiet · falsifier: by day 60 a manager has built and shared a view Max never saw (else revisit reporting strategy + native CC-18) · no write-back ever granted (first grant = stop, re-run the bake-off) · quarterly: check Airtable's docs for a true offline story (if it ships, re-run from the register's offline rows) · fleet size vs plan (≤15 through 2027 → re-price everything simpler) · M-1 drill log current (a lapsed drill = uninsured) · CC-17 slip >2× ceiling or any manual payroll correction → fallback plan activates.

---

*One sentence to keep on the wall: the field runs on AHITS because nothing else survives the field — and this program's whole job is to make every other sentence in that argument as verified as that one.*
