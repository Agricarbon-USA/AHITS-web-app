# AHITS — Idea Compendium
### Every open idea, future-state, and concept — compiled, classified, and sortable · 2026-07-11

> **What this is.** One place that scoops together every idea, feature, future-state, and concept floated across the entire AHITS corpus (~120 docs, root + `docs/archive/`), so you can sort through and consider them. It captures **where we've been, what's been considered, what's been denied, and where things are going.** Produced by a six-seat agent pass (extraction · strategy · boundary · dependencies · value · feasibility), grounded in the docs *and* the code/schema.
>
> **What this is NOT.** It's not a commitment or a re-plan — the plan of record stays `AHITS_PHASE3_WORKPLAN_2026-07-10.md` + `STATUS.md`. This is the **backlog of the possible**, for deliberate sorting.
>
> **Currency rule (important):** where this compendium and a strategy doc disagree, `DECISIONS.md` + the code win. Two anti-goals in North Star v3 / the Master Roadmap are **stale** — crew visibility and route history were re-opened (scoped) by decision **D2**; they are ACTIVE here, not denied. Real-time GPS tracking remains denied.
>
> **Currency update (2026-07-22):** several compendium ideas have since **SHIPPED** — the **Deployment Map** (admin pins + per-rig route-history trail + operator crew map) and **GPS-on-daily-check capture** all landed with **CC-15 (D14, PRs #197/#198, 2026-07-21)**; **copy-link invites** (email-independent onboarding, `delivery: EMAIL/LINK`) shipped as **PR #200** — a CONSIDERED→**SHIPPED** entry that predated this compendium. **NS-4 weather stamps** is now the single **live parked-trigger** behind the map (runs post-pilot). `STATUS.md` wins on what's shipped vs. still open.

---

## 1. Where we've been → where we are → where we're going

AHITS has re-answered one question three times: *whose record is this?* **v1** claimed the soil **sample** (the science's provenance spine) — rejected as overreach; that lives in the lab/LIMS system AHITS references but never replaces. **v2** made the right move — AHITS owns the field **operation** (instruments, people, operational evidence) — but organized it around three *ledgers*, as if data assembles itself. **v3** kept the thesis and fixed the structure: organize around the **two loops that feed the ledgers** — the operator's day and the manager's week — under a **friction budget** (every screen must beat a group text or do what a text can't: get you paid, prove you were there). Adoption became a *product*, not a KPI.

That history is the sorting key: **anything that captures data as a byproduct of work is alive; anything that adds operator taps for someone else's dashboard is parked or dead.**

Where it points is a strict sequence, not a menu: **trust floor** (offline integrity + the A6 device pass = the pilot line) → **operator's day** (a "Today" front door + one-tap close-out) → **money loop** (Time/Invoicing, earnings view in "done") → **manager's week** (one read-only board) → **evidence probe** (one week to price the "self-evidencing operations" bet) → **then** the triggered analytics bets. One meaningful bet per quarter; everything else parked by name, trigger written down.

**The one structural fact that makes this compendium easy to sort:** almost nothing here needs a *new primitive*. The schema is already "full of time," full of money-adjacent fields, and full of dormant groundwork. So most ideas are blocked not by "build model X" but by "the loop that generates X's data isn't live yet." **Order matters more than effort.**

---

## 2. Status legend (every idea carries exactly one)

| Status | Meaning |
|---|---|
| **ACTIVE** | In the current build plan (a "four things" bet, a Wave-0 gate, a contracted capstone, or a rider attached to active work). |
| **NEXT-UP** | Phase-3 consolidation basket — committed in principle, lands once the loops close. No trigger needed. |
| **PARKED-TRIGGER** | Out of the active plan, no design work, revisit only when a **named trigger** fires. |
| **CONSIDERED** | Floated, no settled disposition — the live-debate bucket (includes items trending toward active). |
| **DORMANT** | Schema/enum/code already exists in the repo, unwired. Latent, not planned. |
| **DENIED** | Walled off deliberately (anti-goal / declined-by-name). Listed in §8 for boundary clarity — excluded from the "consider" set. |

Feasibility tags (from the code): **CHEAP-NOW** (read-side, no new dep) · **READY-WHEN-TRIGGERED** (dormant primitive, builds fast once its gate clears) · **HEAVY** (net-new schema/new failure modes) · **SPECULATIVE** (needs a design decision first). Value numbers: **①** operator min/day · **②** manager hrs/week · **③** money visible/protected · **④** trust/zero-defects.

---

## 3. The ideas, by theme

### Cluster A — Operator Experience (the adoption loop)
*Beat the group text at the two ends of the day. The middle mostly works.*

| Idea (ID) | Status | One-line | Value | Friction | Size / feasibility | Origin |
|---|---|---|---|---|---|---|
| **"Today" view (NS-10)** | ACTIVE | Live operator day: deployment, per-vehicle check state, what's waiting on me, my requests | ①④ | removes the morning text | M / CHEAP-NOW on data (but bundle Batch 6b substrate — see §5) | NS3 §4/§6 |
| **One-tap close-out (NS-11)** | ACTIVE (DoD of money loop) | Clock-out as the day's closing ritual; unfinished items = optional one-tap fixes | ①④ | ~0 marginal if designed in now | S / CHEAP-NOW | NS3 §4 |
| **Odometer sanity (NS-5)** | ACTIVE | Inline warning on implausible odometer; never blocks | ④③ | friction-negative | S (hours) | NS3 §6 |
| **Offline day-pack (MID-5)** | PARKED-TRIGGER (A6 data exists) | Evening pre-sync of the full day for no-signal | ① | passive | READY-WHEN-TRIGGERED | NS3 §6 |
| **Operator IA fixes** | ACTIVE (in NS-10) | Requests in bottom nav; transfer badge on tab; confirm on Cancel; searchable pickers | ① | friction-negative | S–M | Operator-lens audit |

### Cluster B — Contractor Pay / the Money Loop (the retention engine)
*Get 20–90 contractors paid accurately, fast, and visibly. Exception telemetry is a payroll byproduct.*

| Idea (ID) | Status | One-line | Value | Size / feasibility | Origin |
|---|---|---|---|---|---|
| **Time/Invoicing capstone (P3-TIME / 2C)** | ACTIVE | 7 models (TaskType, OperatorRate, TimeEntry, Expense, Invoice, InvoiceLineItem, Availability) + Settings + clock/invoice flows | ③①④ | **HEAVY / XL (6–10 wks, the long pole)** | PRD §11.12; ROAD 2C |
| **Operator earnings view (MID-3)** | ACTIVE (in 2C DoD) | "You've earned $X this period"; invoice status visible | ③① | M inside capstone | NS3 §6.2 |
| **Exception task-type telemetry (CONV-4)** | ACTIVE (in 2C) | Weather Delay / Breakdown / No Access / Incident as one-tap, payable | ③① | free rider on the picker | ROAD 2C/CONV-4 |
| **Job costing v1 → estimator (N-7)** | PARKED-TRIGGER (a season of *believed* actuals) | One number on the Project page → later a quote estimator | ③② | v1 S (once data exists); estimator L (3–6 wks) | NS3 §4; ROAD §10 |
| **QuickBooks/IIF CSV *export* (post-invoicing)** | CONSIDERED | Export invoices/expenses to accounting — "80% of value at 5% cost" (export, NOT integration) | ③ | S | NS-line reviews |

### Cluster C — Manager Leverage (the week)
*One surface that makes Monday start in AHITS. A view, never a scheduling engine.*

| Idea (ID) | Status | One-line | Value | Size / feasibility | Origin |
|---|---|---|---|---|---|
| **Week board (N-5)** | ACTIVE | Read-only deployments × days timeline; L1–L5+L8–L9 from data that exists; L6/L7 after 2C adopted | ② | **L (2–4 wks) / READY** (after FND-48 filters) | NS3 §2.2; ROAD 2D |
| **Dispatch ranking (N-4)** | PARKED-TRIGGER (N-5 shipped + staffing flows through AHITS) | Ranked staffing *suggestions*, never auto-assign | ② | READY-WHEN-TRIGGERED (ingredients accrue free) | ROAD §10 |
| **Exception feed / bell finish (FND-50)** | ACTIVE | Every alert names who/what; interrupts vs schedule vs aggregates taxonomy | ②④ | S–M | ROAD §8.0 |
| **Rental-ending alert + board L3 (CONV-12)** | CONSIDERED-small | "Rental ends Wed, deployment runs to Fri" | ③② | S (one enum value + cron case) | ROAD CONV-12 |

### Cluster D — Fleet Economics
*Turn the fleet ledger into capital-allocation answers — after the columns get read.*

| Idea (ID) | Status | One-line | Value | Size / feasibility | Origin |
|---|---|---|---|---|---|
| **TCO columns + idle-rental nudge (N-2 kept half)** | NEXT-UP | Per-asset cost/day, utilization, "$665 idle rental this week" | ③② | S (rides FND-26 SQL fix) / CHEAP-NOW | ROAD CONV-2/§9 |
| **Analytics rebuild (P3-AN-1)** | NEXT-UP | Push aggregation into SQL; fix >100% utilization, unweighted avgs, export/view disagreement | ④③ | M (1–2 wks) | ROAD §9 |
| **Rent/buy/idle/retire recommendation (N-2 rec surface)** | PARKED-TRIGGER (columns get read) | Break-even + retire candidates | ③ | L (3–6 wks) / SPECULATIVE | ROAD §10 |
| **Predictive maintenance (MID-2)** | PARKED-HARD (season of variance data + NS-7 read) | Risk flags + parts-ahead-of-failure (threshold rules, never ML) | ② | SPECULATIVE | ROAD §10 |
| **`Vehicle.acquisitionCost/acquiredAt`** | CONSIDERED | Additive columns for honest owned-TCO | ③ | S | CONV-2 |

### Cluster E — Evidence & Compliance
*Corroboration as a byproduct of capture the operator already performs. Cheapest leg to test.*

| Idea (ID) | Status | One-line | Value | Size / feasibility | Origin |
|---|---|---|---|---|---|
| **Evidence bundle probe (NS-1)** | NEXT-UP | One-week export: checks+GPS, custody, photos, weather, time, costs → obey the answer | ③④ | **S (1 wk) — prices a whole value leg** | NS3 §6.4 |
| **Weather stamps (NS-4)** | PARKED-TRIGGER (after Map) | Nightly job stamps deployment-day weather; auto-corroborates delay pay | ③ | S (3–5 days) but needs a paid weather API + nightly job | ROAD 2A rider |
| **Photo timeline (NS-14)** | NEXT-UP | Filterable condition-over-time per vehicle/unit/deployment | ③④ | **S / CHEAP-NOW** (read-side over existing Photo rows) | ROAD CONV-14 |
| **Incident & safety log (NS-13)** | ACTIVE (Phase-3) | Minimal append-only Incident (type/narrative/photos/ack); friction-exempt | ④ | M (1–2 wks) / SPECULATIVE (ask insurance-holder first) — do NOT grow into OSHA workflow | NS3 §4 |
| **Calibration-as-maintenance (NS-3)** | CONSIDERED | GPS/corer calibration as a maintenance `kind` | ④ | S / SPECULATIVE (ask science side — may collapse to a tag) | NS3 §9 |
| **Bag-draw campaign gauge (NS-2)** | NEXT-UP-small | Consumable draw = campaign %-complete | ③ | S (2–4 days); retire if sample system exposes count | NS3 §9 |

### Cluster F — Logistics & Supply
*Read the demand exhaust; move gear/parts to where the work is.*

| Idea (ID) | Status | One-line | Value | Size / feasibility | Origin |
|---|---|---|---|---|---|
| **Demand-exhaust view (NS-7)** | NEXT-UP-small | Reports rollup: most-requested, fill-rate per hub, top deny reasons | ③② | S (3–5 days) — a Reports annotation, not a board layer | ROAD CONV-9 |
| **Shippo / Shipment wiring (NS-9)** | PARKED-TRIGGER (>5 carrier shipments/month) | In-transit lane for repairs/restocks/parts; the CONV-1 vertebra | ②③ | model dormant; **real cost = paid Shippo + webhook + billing** (understated as "1–2 wks") | ROAD §10/CONV-1 |
| **Stock drift report (CONV-16)** | ACTIVE (Phase-3) | Nightly invariant reconciliation → alerts, not console.error | ④ | **S (2–3 days) / CHEAP-NOW** — "would've caught FND-2 in week one" | ROAD §9 |
| **Cycle-count / shrinkage (`StockCount`)** | PARKED (named owner required) | Expected-vs-actual physical counts | ④ | M | CONV-16 |

### Cluster G — Contractor Lifecycle
*Legibility of people as they enter, leave, accumulate history.*

| Idea (ID) | Status | One-line | Value | Size / feasibility | Origin |
|---|---|---|---|---|---|
| **Self-onboarding (P3-ONB-1)** | NEXT-UP | Invite→self-serve funnel + funnel card + invite-expiry sweep | ② | S (~1 wk) | ROAD §9/CONV-3 |
| **Offboarding gear-reclaim checklist** | PARKED-TRIGGER (churn bites) | "2 units still with J. Doe — 1 awaiting hub receipt" (a filtered view of existing records) | ② | S (days) | CONV-3 |
| **`mustChangePin` screen; PIN reset UI; resend-invite** | ACTIVE-small | Finish the onboarding auth surfaces | ④ | S | ADD/reviews |
| **Contractor network / portable reputation (X-2)** | DENIED-adjacent (shelved) | Operator-owned portable work credential; availability marketplace | — | moonshot | NS3 §5 |

### Cluster H — Platform & Scale (option value only — no design work)

| Idea (ID) | Status | One-line | Origin |
|---|---|---|---|
| **Multi-region (MID-4)** | PARKED-TRIGGER (2nd operating region) | Region-scoped hubs/currency/tz; the **free nullable `region` column** rides on the 2C money models now (NOTE: to be *added*, not existing) | ROAD §11 |
| **Field-ops OS / white-label (X-1)** | SHELVED-one-line | White-label to any distributed-crew + serialized-instrument + offline + audit org | ROAD §11 |
| **Unified event spine** | DORMANT/deferred-decision | Common envelope over the 5 shadow logs; "keep logs append-only" is the free discipline | NS3 §5 |
| **StatusLink capability-URL as API philosophy** | CONSIDERED-seed | Grow the external API out of StatusLink (scoped/expiring/evented) | reviews |

### Cluster I — The 16 CONV integration flows (future-gated enhancements only)
*Most are partly live; each carries future riders worth naming.*

- **CONV-1** in-transit lane + delivery-without-receipt interrupt (=NS-9, parked). · **CONV-3** onboarding funnel card, invite-expiry sweep, PIN_LOCKED naming its deployment. · **CONV-5** ship-for-repair leg (post-NS-9), reliability exhaust (N-3). · **CONV-6** projected maintenance-due date annotation on the board (CHEAP read). · **CONV-10** availability→board→dispatch gap-warning. · **CONV-11** missed-check chase carries the QR link (pairs with QR capstone). · **CONV-13** generalize sent/viewed/acted chips + reissue affordance to WORK_ORDER + INVOICE; EXPIRED-link sweep. · **CONV-16** the drift report (Cluster F).

### Cluster J — Consistency, tidiness & dead-end readers (mostly ACTIVE, all CHEAP-NOW read-side)
*The single cheapest high-leverage category in the codebase — data is captured, nothing reads it.*

- **Daily-check admin viewer** — no admin surface reads a submitted check today; unblocks failed/missed-check + photo loops at once. **The cheapest highest-leverage stitch.**
- **RequestLineEvent surfacing** · **resolved transfer/handoff history** · **StatusLink EXPIRED persistence + sweep** · **auto-resolve linger-forever alerts** (PIN_LOCKED / MATERIAL_REQUEST / EQUIPMENT_NOT_RETURNED).
- **Consistency pass** (workplan §9 / T-1…T-7): one status vocabulary, one RespondDialog, `withAuth` wrapper, one response envelope + shared `fetchJson`, date unification (batch6a), centralized `VehicleType` map, dead-code deletion.

### Capstones already contracted (for completeness — these are ACTIVE, sequenced)
**Map (2A)** + route-history + crew-visibility (D2) + weather rider — **L / HEAVY** (net-new GPS columns + paid Mapbox; the old "small, low-risk" framing under-budgets by ~2×). · **QR no-app check (2B)** — **M / READY** once the FND-6 shard closes. · **Mounted collection units (Giddings/Wintex)** — the revenue-instrument gap; **L / SPECULATIVE**, needs a reuse-vs-new-model design spike, and the combined check must be ONE guided sequence.

---

## 4. The buildable order (sort by "what unlocks what")

Reality imposes one order; sort the compendium on this axis when deciding what to touch.

```
TIER 0 · Wave 0 (unblocks everything; parallel streams)
   W0-10 retirement ── gates ──▶ the money loop (2C) ──▶ earnings view, exception telemetry,
                                    N-7 job costing, board L6/L7, N-4, the region column
   FND-48 URL filters ──▶ N-5 week board ──▶ (as annotations) N-4, N-2 nudge, N-3, NS-7
   FND-6 close ──▶ QR (2B) ;  W0-11 rename/SWR ──▶ Today view + Map deep-links
   A6 device pass = THE PILOT LINE
TIER 1 · Operator's day: NS-10 Today, NS-5, pilot variance check (gates the whole reliability branch)
TIER 2 · Capstones in order: Map (2A) → QR (2B) → Money loop (2C, long pole) → Week board (2D)
TIER 3 · Consolidation + evidence probe (NS-1) + the free-rider basket (below)
TIER 4 · Triggered bets — each on its named trigger:
   N-7 (season of believed actuals) · N-4 (board + staffing flows) · N-2 rec (columns get read)
   · N-3 (variance live + board) · MID-2 (season + NS-7 read) · NS-9 (>5 shipments/mo) · MID-5 (A6 data)
TIER X · Parked/moonshot (no design work): X-1, X-2, MID-4 (region column only), sample shelf, event spine
```

**The single highest-leverage unlock is W0-10** — it gates 2C, and 2C gates the earnings view, exception telemetry, N-7, the board's data layers, N-4, and the region column. Everything money-shaped hangs off one retirement. *(Note: `STATE_OF_THE_APP` §2 argues the money loop is already un-gated because PR-4a landed the readers — build 2C in parallel, don't wait on the irreversible DROP.)*

---

## 5. The bargains — "free riders" (cheap only inside their host's window)

| Free rider | Rides on | Cost |
|---|---|---|
| Weather stamps (NS-4) | Map's GPS + businessDate | 3–5 days, 0 taps (+ paid weather API) |
| TCO columns (N-2) | P3-AN-1 SQL rebuild | inside the FND-26 fix |
| Photo timeline (NS-14) | existing Photo model | 3–5 days read-side |
| Close-out ritual (NS-11) | 2C clock-out | ~0 if designed in; a week if bolted on later |
| region column (MID-4) | 2C migration | one nullable column |
| L7 exception telemetry (CONV-4) | 2C TaskType picker | falls out of payroll free |
| Demand view (NS-7) | request/draw exhaust | 3–5 days, a Reports annotation |
| Drift report (CONV-16) | InventoryStock history | 2–3 days |
| Projected due-date (CONV-6) | week-board aggregate | a derived read, no schema |
| Onboarding funnel card (CONV-3) | AccountAuditLog + Users | a card, not a page |
| Rental-ending alert (CONV-12) | existing cron threshold | one enum + one case, ships with 2D's L3 |

**The Tier-1 read-side stitches (Cluster J) are the best value in the whole corpus** — daily-check viewer, RequestLineEvent, resolved-history, drift alerting, photo timeline: each needs *nothing new*, because the data is already written and simply has no reader.

---

## 6. Where to look first (the shortlist)

**★ Top ~8 by value-per-effort (of everything still open):**
1. **NS-10 "Today" view** — the adoption product; friction-negative, zero schema. If one thing ships, this.
2. **NS-11 one-tap close-out** — ~0 marginal as a 2C design constraint; write it into the spec *now* or pay a retrofit week.
3. **Daily-check admin viewer** (Cluster J) — the cheapest highest-leverage stitch; unblocks three loops at once.
4. **NS-5 odometer sanity** — hours, friction-negative, defends mileage claims.
5. **Field-fix log (FF #3)** — direct operator ask, model ~90% ready, replaces the heavy damage path.
6. **Awaiting-Pickup thread (FF #2)** — closes a loop operators hit today + fixes a silent data-loss race.
7. **CONV-16 drift report** — 2–3 days for a permanent phantom-stock tripwire.
8. **N-5 week board** — larger, but it *is* the manager value leg and absorbs four other bets as annotations.

*Honorable mentions:* NS-1 evidence probe (1 wk prices a whole leg), NS-4 weather stamps, NS-14 photo timeline, CONV-12 rental-ending alert.

**✗ ~5 that sound appealing but move no value number today (be honest):**
1. **MID-2 predictive maintenance** — dashboards over unproven data; the board's due-list gives 90% with no model risk.
2. **N-4 dispatch ranking** — ranking "who goes" before the manager can see the week is backwards.
3. **X-1 / X-2 white-label + contractor network** — biggest-sounding, move no number for a one-deployment team.
4. **NS-9 Shippo** — dead code with no shipment volume; default is *delete*, not build.
5. **NS-6 farm-gate link** — plausible, but nobody asked by name and the sizing interview never happened.

---

## 7. Contested / undecided — needs a human call

- **Crew visibility + route history** — was DENIED in North Star, **re-opened (scoped) by D2**: last-known positions + historical check-in trail, attestation-GPS only, no live tracking. **Now ACTIVE** (rides the Map). *Open sub-question:* is the crew view operator-only or also a manager view?
- **Mounted collection units** — reuse-vs-new-model design decision before building (the revenue-instrument gap; a genuine hole in the app's own thesis).
- **Requests page label** ("Requests" vs "Material Request"); **hard-reserve semantics** (decrement vs flag); **forwarded-to-hub link** (reuse RESERVATION StatusLink vs lighter assignment) — REQ open decisions.
- **P3-NOTIF** push-vs-45s-polling; the **CARRY-* build-or-descope batch** (bulk QR labels, per-project checklists, admin bulk-location, PIN length, §F residuals).
- **Settings model** — real single-row `Settings` vs extend `NotificationConfig` (decide before the 2C migration).

---

## 8. ⛔ Expressly DENIED / anti-goals (the wall — excluded from "consider," listed for boundary clarity)

**These are NOT open. Do not present them as freshly buildable.** (Per `DECISIONS.md`, North Star v3 §4–§5, Master Roadmap §3/§11, PRD §14.)

- **The soil-sample / LIMS system** — own the operation, never the sample. (ABSOLUTE; re-entry only by owner + sample-team pull.)
- **Real-time / live / continuous GPS tracking** — GPS rides attestations only. *(Last-known + historical route-history are the permitted, already-decided form — D2.)*
- **Operator↔office messaging / in-app chat** — Today + task-typed clock + the bell is the channel; don't fight texting.
- **In-app navigation / turn-by-turn routing** — link out to the phone's maps app.
- **Auto-scheduling / auto-assignment / drag-to-reschedule** — the board is a read-only view; dispatch *ranks*, humans schedule. (N-4 ranked suggestions are the scoped exception.)
- **Speculative multi-tenancy / `organizationId` scoping** — only the free nullable `region` column.
- **Accounting / general-ledger engine + QuickBooks integration** — link-out / CSV export only.
- **Payroll engine** (payroll runs, automatic overtime) — AHITS issues invoices, full stop.
- **OSHA workflow / exports engine on the incident log** — the minimal append-only log is allowed; the workflow engine is a hard stop.
- **SMS gateway · Airtable sync · two-way calendar sync · multi-language/i18n · customer-facing reporting portal · certification/course tracking · fleet-insurance portal · automated reorder-purchasing** — PRD §14 out-of-scope, no champion since.
- **React Native native wrapper** — descoped in favor of PWA + Web Push.
- **Trusted-device / 30-day-idle session model** — retired (24h JWT + per-request re-check meets the goal).
- **In-app QR *generation/printing*** — labels sourced externally; the app scans, doesn't print. *(Conflicts with the CARRY-3 bulk-print idea — treat printing as descoped.)*

**Do-not-"fix" traps (would break working code):** don't rename `src/proxy.ts` → `middleware.ts` (Next 16 renamed the convention); don't collapse prod+staging into one environment (the current call is prod-deferred-as-separate-standup, `DECISIONS.md` D1).

---

## 9. How to use this to sort

Three sort axes are built in: **by status** (§2 — what's actually open vs parked vs denied), **by cluster** (§3 — pick a theme), and **by buildable order** (§4 — what reality lets you build next). For a working session: start from §6's shortlist, cross-check each against §4 (is its unlock in place?) and §5 (is it cheap only inside a host you're already building?), and confirm nothing you pick is on the §8 wall. When you decide to advance an idea, record it in `DECISIONS.md` and move it into `STATUS.md` §4 — that's how it stops being a compendium row and becomes work.

*Compiled from: North Star v1→v2→v3, Master Roadmap (§8 CONV flows, §10 Phase 4+, §11 Phase X), the 2026-07-10 workplan/state-of-app/field-feedback, the PRD + addendum, the Requests/Multihub design docs, the CARRY register, and the code/schema. Six-seat agent pass, 2026-07-11.*
