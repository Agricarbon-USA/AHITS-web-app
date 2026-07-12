# 00 · START HERE — the AHITS documentation map

**New session or new person? Read this page, then the 15-minute path below. It gets you fully current without reading 60 files.**

> **The two docs that are always current:** `STATUS.md` (where we are right now) and `DECISIONS.md` (what's already settled — read before re-opening anything). Everything else is reference. **If a dated doc disagrees with `STATUS.md` or the code, `STATUS.md` and the code win.**

---

## The through-line (the whole story in 200 words)

**AHITS is the system of record for Agricarbon's field operation** — the instruments (fleet and gear), the people (contractor crews), and the operational evidence that the work was done right. It is deliberately *not* the soil-sample/LIMS record; it references that science system but never replaces it.

**Where it stands:** the hard architecture is done and holds up under adversarial audit — production-grade auth, a tokenized external-party portal (StatusLink), a serious offline engine, database invariants. Phases 1–2 are functionally complete and most of a Wave-0 hardening pass has landed on staging.

**The plan:** finish the trust floor (a data-integrity defect cluster + release-safety machinery), give the operator a "Today" front door and a one-tap close-out, then ship the two capstone loops — **the operator's day** and **the manager's week** — culminating in the money loop (Time / Invoicing).

**The North Star:** win *adoption* by making every screen faster than a text or able to do what a text can't, under a **friction budget**, so three value ledgers (fleet economics, contractor pay, operational evidence) accrue as a byproduct of work.

**What's next:** the A6 device pass on real hardware is the pilot gate. The pilot runs on staging by design; production is deliberately deferred until go-live. One meaningful bet per quarter; everything else parked by name.

---

## The 15-minute path to "current" (read in this order)

| # | Doc | ~min | What it gives you |
|---|-----|------|-------------------|
| 1 | `STATUS.md` | 2 | Where we are *right now*: branches, what's merged, what's deferred, next actions. |
| 2 | `AHITS_ROADMAP_EXEC_SUMMARY.md` | 3 | The spine: what AHITS is, where it stands, the strategy in one line, the gates, the anti-goals. |
| 3 | `AHITS_STATE_OF_THE_APP_2026-07-10.md` | 4 | The honest, code-grounded snapshot: what's solid, what's broken, the corrections to the roadmap. |
| 4 | `DECISIONS.md` | 1 | The settled questions (prod deferred, Map scope, admin exclusion, W0-10). Don't re-open these. |
| 5 | `AHITS_PHASE3_WORKPLAN_2026-07-10.md` (§0–§2) | 3 | The current executable sequence + the three locked decisions. |
| 6 | `AHITS_SESSION_HANDOFF_2026-07-12.md` | 2 | What last shipped + exact resume points. |
| 7 | `AHITS_PHASE3PLUS_NORTH_STAR_v3.md` (§1–§2) | 4 | *Why* the plan is shaped this way: the two loops, the friction budget. |

Before writing code, also read `CLAUDE.md` + `AGENTS.md` (deploy flow + the DB/migration non-negotiables + this Next.js is not the one you know).

---

## "I want to ___" — routing

| If you want to… | Go to |
|---|---|
| know where we are **right now** | `STATUS.md` |
| know **what's already been decided** (before re-arguing it) | `DECISIONS.md` |
| understand **why** we build what we build | `AHITS_PHASE3PLUS_NORTH_STAR_v3.md` |
| see the **plan / what's next** | `AHITS_PHASE3_WORKPLAN_2026-07-10.md` |
| **write code** this session | `CLAUDE.md` + `AHITS_CLAUDE_CODE_INSTRUCTIONS.md` (canonical packet doc) |
| know the **landing order + how to smoke** each packet | `AHITS_LANDING_ORDER_AND_SMOKE_CHECKLIST.md` |
| see the **full phased sequence + integration matrix** | `AHITS_MASTER_ROADMAP.md` (§8 = the CONV-# flows) |
| look up a finding/bug/feature **ID** (`FND-12`, `NS-10`, `CONV-4`, `CC-08`) | `AHITS_PHASE3_WORKPLAN_v2.md` (the register) |
| ask **"what about production?"** | `AHITS_PROD_CUTOVER_DEFERRED.md` — short answer: deferred, not a gate |
| read the **product spec** | `AHITS_PRD_v2.md` + `AHITS_PRD_v2.1_ADDENDUM.md` |
| run the **pilot device gate** | `AHITS_A6_TESTER_CHECKLIST.md` |

---

## The tiers (what to trust)

- **Always-current (root):** `STATUS.md`, `DECISIONS.md`, `00_START_HERE.md` — maintained every session.
- **Canonical strategy & plan (root):** the exec summary, North Star v3, Master Roadmap, the 2026-07-10 workplan / state-of-app / CC-instructions / landing-checklist / prod-cutover-deferred, the field-feedback fix plan, the W0-10 migration plan, `AHITS_PHASE3_WORKPLAN_v2.md` (the ID register). Each carries a status banner.
- **Reference (root):** PRD v2 + addendum, `CLAUDE.md`, `AGENTS.md`, `README.md`, the A6 checklists, `PROD_CUTOVER_RUNBOOK.md` (deferred).
- **History (`docs/archive/`):** dated session records, execution logs, superseded North Stars (v1/v2), old workplans, one-off scripts, feature/sprint notes. Provenance only — **never act on an archived doc.**

---

## Document-lifecycle rules (why the corpus stopped losing work)

1. **Canonical docs have stable names**; dated docs are archived snapshots. Version/date live in the doc's header banner, not the filename.
2. **Every canonical doc opens with a status banner** (`STATUS: canonical | current | reference | superseded` · `UPDATED` · `SUPERSEDED-BY` · `READ-WITH`). Trust or discard any doc in five seconds.
3. **`STATUS.md` and the code are the tiebreakers** when docs disagree.
4. **Maintenance is part of "done":** the session-close checklist at the bottom of `STATUS.md` keeps this map from going stale the way the old `docs/INDEX.md` did.
