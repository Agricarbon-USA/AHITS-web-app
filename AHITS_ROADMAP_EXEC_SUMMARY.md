# AHITS — Roadmap Executive Summary & Cheat Sheet

_2026-07-03. A one-page distillation of `AHITS_MASTER_ROADMAP.md` (the executable plan), `AHITS_PHASE3PLUS_NORTH_STAR_v3.md` (the strategy), and `AHITS_PHASE3_WORKPLAN_v2.md` (the findings register). For stakeholders; the linked docs hold the detail._

---

## Executive summary

**What AHITS is.** The system of record for Agricarbon's **field operation** — the instruments (fleet & gear), the people (contractor crews), and the operational evidence that the work was done right. It is deliberately **not** the soil-sample record; that lives in the existing science/lab system, which AHITS references and corroborates but never replaces.

**Where it stands.** The product is at the pilot doorstep and in better shape than its paperwork implied. The hard architecture is done — production-grade auth, a tokenized external-party portal, a serious offline engine, a clean toolchain. Phases 1–2 are functionally complete; a multi-batch hardening pass (correctness, security, release-safety, email reliability, the hub loop, API hygiene) has been written, verified, and largely merged. **One thing stands between today and a real pilot: the A6 offline device pass on real iOS + Android hardware.**

**The strategy, in one line.** Win **adoption** by building the two loops that feed everything — the **operator's day** and the **manager's week** — under a **friction budget** (every screen must be faster than a text or do something a text can't), so the three value ledgers (fleet economics, contractor pay, operational evidence) accrue as a *byproduct of work*, not a tax on it. Adoption is a product, not a KPI: if the 20–90 contractors don't use it, nothing downstream exists.

**The four things that matter** (everything else is parked with a written trigger): **(1)** the operator's day — a "Today" front door + a one-tap close-out; **(2)** the money loop — Time/Invoicing built with the operator earnings view as part of "done," because getting paid accurately and fast is the retention engine; **(3)** the manager's week — one read-only week board that absorbs a dozen scattered pages; **(4)** the evidence probe — a one-week export that prices whether the "self-evidencing operations" bet is real.

**How value shows up** — four numbers every feature must move at least one of: operator **minutes/day** saved, manager **hours/week** saved, **money made visible or protected** (idle rentals, settled disputes, job costing), and **trust** — operationalized as *zero defects in the money-and-data path*, the multiplier on the other three and the reason hardening outranks features.

**The primary risk, and the discipline that answers it.** Adoption is decided in the pilot's first two weeks, and a single lost entry or wrong paycheck sends a contractor back to texting for good. So the plan is comprehensive in *ambition* but ruthless in *build*: roughly **one meaningful bet per quarter** for a small team, the offline/payroll gates carry zero exceptions, and every other opportunity is named and parked rather than half-built. Production is a deliberate later step — the pilot runs on staging.

**Bottom line.** Finish the device pass, ship the two loops and the money capstone on a hardened base, run the one-week evidence probe, and let the pilot decide the rest. The scope is disciplined, the integrations are designed (not accidental), and every claim in the plan is grounded in the actual code.

---

## Cheat sheet

### The phases (in order)

| Phase | Focus | Exit gate / outcome |
|---|---|---|
| **0 · Harden** | Finish Wave 0 (close FND-6; API-hygiene remainder; **legacy-column retirement**; rename/SWR/monolith split; error tracking) | **A6 device pass on real hardware = the pilot line** |
| **1 · Pilot as launch** | Operator front door (**NS-10 "Today"**), odometer sanity, instrument the daily-check time + checklist variance | Real operators on staging; adoption + data-quality signal in week 1 |
| **2 · Capstones × loops** | **2A** Map (+weather stamp) · **2B** QR check + missed-check chase · **2C** Time/Invoicing = **money loop** (close-out ritual, earnings view, availability, region column) · **2D** week board | The two loops close; contractors get paid visibly |
| **3 · Consolidate** | Evidence-bundle probe (1 wk), cost analytics + fleet TCO columns, admin-mobile, contractor onboarding, incident log, photo timeline; **prod-cutover track** | Probes price the next quarters; prod stood up when ready |
| **4+ · Triggered** | Job costing, fleet buy/rent/idle/retire, dispatch ranking, reliability signals, predictive maintenance, day-pack, Shippo — **each built only when its trigger fires** | Capital allocation + logistics maturity |
| **X · Parked** | Field-ops OS white-label, contractor network, multi-region, sample territory | No design work; one-line-with-trigger only |

### The non-negotiable gates (sequence that cannot be reordered)
- **W0-10 readers (PR-4a, landed)** gate invoicing attribution; the **DROP** (4b′/4c) is elective and does NOT gate the money loop
- **Email reliability (FND-8)** → *before* the invoice email
- **Business-date + offline-queue fixes (FND-7 / FND-14)** → *before* any offline-first money write
- **Public-link state gate (FND-6)** → *before* the public QR form
- **A6 device pass** → *before* the pilot · **prod environment standup** → *before* prod (see `PROD_CUTOVER_RUNBOOK.md` + `DECISIONS.md` D1; **PR #144 was merged 2026-07-11** — `production` branch is current, but the environment is still deferred)

### Anti-goals (deliberately NOT built)
Sample/LIMS system · real-time GPS tracking (GPS only on an attestation the operator chose to perform) · accounting or routing engine · speculative multi-tenancy · a scheduling engine (dispatch **ranks**, humans schedule; the week board is a **view**).

### The "conversations" — how subsystems talk (all converge on the manager's week board + exception feed + reports)
Shippo ↔ material requests · rentals ↔ fleet P&L · onboarding/offboarding ↔ legibility · **rain delay → pay + evidence + reporting** · **equipment failure → repair → cost → reliability** · odometer → maintenance → parts · deployment lifecycle → evidence bundle · time → earnings → profitability · demand exhaust → procurement · availability → board → dispatch · missed-check → chase → QR fallback · compliance/expiry edges · external-party (StatusLink + email) "received / seen / acted" · photos → disputes/training · incident → pay + liability · one inventory truth (ledger reconciliation).

### Original goals, held throughout
**Simplicity** (friction budget, park don't bloat) · **Functionality** (it works, offline-tolerant) · **Transferability** (PWA across desktop / Android / iOS, offline-first) · **Everything speaks to everything else** (shared components, one inventory truth, no orphaned data or dead-end features).

### One-line status
_Pilot-ready pending the A6 device pass; strategy locked (two loops + friction budget); build sequenced and integration-designed; production deferred by choice._
