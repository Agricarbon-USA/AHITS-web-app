# AHITS — Phase 3+ North Star v2 · The Field-Operations Ledger

_Prepared 2026-07-03. **Supersedes `AHITS_PHASE3PLUS_NORTH_STAR.md` (v1, same date).** The reason for the rewrite is a product-owner decision, not a change of facts: v1's central thesis — that AHITS should become "the provenance spine of the soil sample" — is **rejected as overreach**. The soil sample's identity and its chemical chain of custody are already owned by a separate, existing system on the science side, and AHITS will not supersede it. Everything in v1 that reached for the sample (N-1 `SampleBatch`, the MID-1 dMRV/registry ambition, X-3's sample-ledger framing) is moved to a shelved register at the end of this document, together with the only hooks worth preserving at ~zero cost. Everything else — the fleet, the people, the operational evidence — is kept and sharpened._

_Companion to `AHITS_PHASE3_WORKPLAN_v2.md`, which remains the canonical plan. **Nothing here jumps the Wave-0 queue or reorders Map → QR → Time/Invoicing.** ID discipline is inherited: near-now bets are `NS-#`, near-tier `N-#`, mid `MID-#`, moonshots `X-#`; v1 IDs are carried where the idea survives and explicitly marked where it is shelved. Every bet names the schema primitive it stands on (re-verified against `prisma/schema.prisma` this session), carries an honest effort range, and states what would falsify it._

---

## 1. The thesis, revised

Agricarbon sells defensible soil-carbon measurement. The *measurement* — the sample, its identity, its lab chemistry, its registry life — lives in a system that already exists and is not this one. v1 argued AHITS should grow toward that record. It should not, and this version stops pretending otherwise.

What AHITS actually holds, and what nothing else in the company holds, is everything **around** the measurement:

- **The instruments.** Which serialized corer and GPS unit, in what condition, maintained and (soon) calibrated when — `InventoryUnit`, `MaintenanceTask` (per-unit via `inventoryUnitId`, with `intervalType`, `actualCost`), `CheckLog` custody events.
- **The people.** Which contractor held which rig, in which role, over which interval, and — after Phase 3 — at what rate, for how many hours, invoiced and paid: `DeploymentAssignment`, the P3-TIME model set.
- **The operational context.** A daily, operator-signed condition attestation per vehicle (`DailyCheck`, 16-item `checklistJson`, `passFail`, odometer), soon georeferenced (P3-MAP), photo-documented (`Photo.gpsLat/gpsLng`), and evented end-to-end (`StatusLinkEvent`, `RequestLineEvent`, `AccountAuditLog`).

**The thesis: AHITS is the system of record for the field operation that produces the measurement — the instruments, the people, and the operational evidence — never for the measurement itself.** It owns everything about the equipment, the labor, and the operational context; it does not own the sample's identity or chemistry. Its relationship to the sample system is corroboration and reference: AHITS can hand that system a dated, placed, attributable record — *we were there, with calibrated working gear, in these hands, on this date, at this site* — and the sample system can attach or cite it. The value proposition is therefore not "provenance spine of the product." It is three humbler, realer things: **field work that runs efficiently** (dispatch, logistics, parts), **money that is accountable** (fleet economics, contractor invoicing), and **operations that are self-evidencing** (the corroboration record above, plus the audit posture the codebase already practices).

One correction to v1's rhetoric before anything else: v1 kept saying what AHITS "is becoming," as if the trajectory were automatic. It is not. The schema contains ready primitives; primitives are not products. Every section below is a **choice** someone must staff, and the distance between "the table exists" and "the feature earns its keep" is the actual work. This document sizes that distance honestly instead of shrinking it.

---

## 2. What is already accruing — and the contingency on all of it

The exhaust streams v1 catalogued are real and verified; reframed around operations rather than samples:

| Exhaust stream | Where it lives (verified) | What it is, if the data is honest |
|---|---|---|
| Equipment custody events | `CheckLog` (action, unit, operator, rig, project, from/to, condition, timestamps) | A gear chain-of-custody ledger — who had what, when, in what shape |
| Daily condition attestations | `DailyCheck.checklistJson` (~16 items × up to 12 vehicles × every working day) | A longitudinal vehicle-health dataset — raw material for reliability signals |
| Odometer stream | `DailyCheck.odometer` → mileage triggers (shipped, Wave G) | Usage intensity per vehicle; the denominator of cost-per-mile |
| Geography | `Photo.gpsLat/gpsLng` today; `DailyCheck` GPS with P3-MAP; `Hub` postal addresses (F2) | Site positions, hub network, implied drive legs |
| Asset economics | `MaintenanceTask.actualCost`, `InventoryItem.unitCost`, the Vehicle rental block (`isRental`, `rentalCostAmount/Period`, agreement fields) | Per-asset TCO, half-assembled |
| Labor graph | `DeploymentAssignment` (PRIMARY/SECONDARY, `startedAt/endedAt`) + the P3 `TimeEntry`/`Availability`/`OperatorRate` set | Who can do what, where, at what cost — the substrate of dispatch and payroll |
| External-party trail | `StatusLinkEvent` (actorLabel, action, note, timestamp) | Third-party attestations with zero account friction |
| Demand signal | `DeploymentRequestLine` + `RequestLineEvent` (requested vs fulfilled vs denied, `denyReason`) | A procurement forecast writing itself |
| Consumable draw-down | `KitItem.drawnQuantity`/`drawnHubId` (post-FND-2 fix) | Materials consumed per deployment |
| Email delivery trail | `EmailLog` (status, attempts, lastError — the FND-8 model, present in schema) | The reliability substrate the invoice email needs |
| Trust posture | sha256-at-rest tokens, body-hash idempotency keys, append-only event tables | The habits of an auditable system |

Two honest amendments to v1's reading of this table.

**First, none of this is "latent gold" by default — it is latent gold *contingent on data quality*, and that contingency is untested.** A 16-item checklist can be pencil-whipped in eleven seconds; an all-yes streak from every operator is a compliance artifact, not a health dataset. The pilot is the experiment that prices this. Every analytics bet below (N-3 especially, MID-2 entirely) is **gated on pilot-proven data quality**, checked cheaply: variance analysis on checklist answers, odometer-delta plausibility, GPS-fix rates. If the data is rote, the correct response is to fix the ergonomics or drop the bet — not to build dashboards over noise.

**Second, the one discipline that is genuinely free stays: never discard exhaust.** Keep raw `checklistJson`, GPS accuracy values, `denyReason`s, `EmailLog` rows. Storage is nil; retroactive reconstruction is impossible. This is the honest core of v1's "compounding asset" claim and it survives the reframe intact.

---

## 3. Constraints this document obeys

v1 systematically understated three things. Stated plainly, because every bet below is sized against them:

**Capacity.** This team is sized to run roughly one deployment of effort at a time. Wave 0 alone is twelve workstreams; the three contracted capstones follow. Realistically the north-star budget is **about one meaningful bet per quarter** after the contracted work — which means the question this document answers is never "which of these are good" (most are) but "**which one, and what are we consciously not doing that quarter**." Every effort figure below assumes it displaces something.

**Effort.** "Days-to-weeks" in v1 was frequently a week-said-for-a-month. Ranges below are honest: a range's top end includes the stakeholder loop, the tests, and the second PR that real features always need. Anything that is actually a multi-quarter arc is called a multi-quarter arc.

**Free vs. design tax.** v1's recurring move — "buy the option now during scheduled work" — is partly right and partly a YAGNI trap. Split explicitly:

- *Genuinely free (adopt now, cost ≈ 0):* keep event tables append-only; never discard exhaust; snapshot rates immutably on `TimeEntry` (the workplan's own one-rate-source rule, enforced in schema); a nullable `region` discriminator on the new P3-TIME money models at creation time.
- *Not free (deliberate future decisions, not conventions):* a unified event envelope across the five existing logs is a real abstraction with real migration cost — see §5; a generalized custody-receipt component beyond what W0-9 needs is a few extra days, not zero — see NS-8; anything multi-tenant beyond the nullable column is a refactor across ~40 models (verified: **no `organizationId`/tenant scoping exists anywhere in the schema**).

---

## 4. The bets

Sequencing rule, inherited: Wave 0, then Map → QR → Time/Invoicing. NS-tier bets interleave after or ride scheduled work; N-tier assumes Phase 3 largely done; MID assumes a season of pilot data *that passed the §2 quality gate*; X assumes deliberate company-level choice.

### 4.1 NS — near-now, cheap, adjacent

#### NS-1 · The Field-Operations Evidence Bundle *(kept from v1, reframed)*
**Idea.** A per-project export assembling what AHITS already knows into one artifact: every daily check (pass/fail, checklist detail, GPS + weather once NS-4/P3-MAP land), rig composition over time with serial numbers (`RigVehicle`, `KitItem` → `InventoryUnit.serialNumber`), operator-assignment history (`DeploymentAssignment`), and the maintenance/calibration state of every instrument used (`MaintenanceTask` by `inventoryUnitId`). One button on the Project page: "Export field-operations evidence (PDF + JSON)."
**What it is and is not.** It is the *corroboration record* — evidence that the operation happened as claimed, which the existing sample system can attach, cite, or ignore. It is **not** a sample record, contains no sample identities, and claims nothing about chemistry.
**Primitive.** Pure read-side assembly; zero new capture, zero migration, zero operator behavior change.
**Effort.** ~1 week for a first honest version; up to 2–3 weeks if the format iterates with the MRV/science side (it should — the app team must not guess the exhibit format).
**Falsifier.** Put the first export in front of whoever at Agricarbon faces auditors and the sample-system owners. If neither wants it, that is decisive, cheap signal — the "self-evidencing operations" leg of the thesis shrinks to internal QA, and nothing further is built here. This stays the cheapest probe in the document.
**Growth path (pull-gated, not planned).** If — only if — the sample system's owners ask for machine-readable form, the bundle grows a versioned JSON feed they can pull, shared via a tokenized link. That is their trigger to pull, not ours to push; the registry-facing ambition beyond it is shelved (§8).

#### NS-2 · Bag-draw as a campaign progress gauge *(kept, honest label sharpened)*
**Idea.** `Project.sampleCount` (target, verified in schema) ÷ sample-bag consumable draw attributed via `KitItem.drawnQuantity` → rig → `DeploymentProject` = a "campaign % complete" gauge. Zero new data entry.
**Primitive.** `KitItem.drawnQuantity`/`drawnHubId` + `DeploymentProject`. **Gated on FND-2** (the stock-leak fix, W0-2) or the proxy double-counts.
**Effort.** 2–4 days once FND-2 lands.
**Honest flag, stronger than v1's.** Bags drawn ≠ samples collected, and the *authoritative* count lives in the sample system. This is a logistics gauge for ops planning, labeled as such. If the sample system exposes its count, prefer displaying that number and retire this proxy — integration beats inference.

#### NS-3 · Calibration as a maintenance kind *(kept — this is squarely AHITS territory)*
**Idea.** Build CARRY-9's parked `MaintenanceTask.kind` enum with `CALIBRATION` as a kind (verified: no `kind` field exists on `MaintenanceTask` today). GPS units and corers get interval-based calibration tasks exactly like oil changes (`IntervalType` DAYS/MONTHS/PER_DEPLOYMENT already supports it); completion records date, cost, notes, receipt photo — all existing machinery.
**Why it survives the reframe untouched.** "Was the instrument in calibration on the day of sampling?" is a question about the *instrument*, not the sample. Instrument QA is AHITS's territory by the clean line in §1, and it feeds NS-1 for free.
**Primitive.** `MaintenanceTask` + recurrence loop (shipped, Wave G) + `inventoryUnitId` linkage.
**Effort.** ~1 week (enum migration, form surface, filters, seed data) — not the afternoon v1 implied.
**Falsifier.** If the science side says instrument calibration is tracked entirely in their system, this collapses to a tag, not a feature. Ask first.

#### NS-4 · Weather-stamp every deployment day *(kept)*
**Idea.** Once daily checks carry GPS (P3-MAP), a nightly job enriches each check with archived weather (precipitation, temperature — Open-Meteo/NOAA) into a side table. Surfaced initially nowhere.
**Why.** (a) Operational context that is cheap to capture now and impossible to reconstruct per-site later; (b) the Phase-3 Weather Delay task type bills at a configurable rate — a weather-stamped record makes those line items self-verifying, **as operator-benefiting corroboration, never an automated rejection gate** (§6).
**Primitive.** P3-MAP's GPS columns; the cron scheduler that already runs the dispatcher.
**Effort.** 3–5 days after P3-MAP. **Falsifier:** if GPS-fix rates from the pilot are poor (data-quality gate), the stamps are too sparse to matter — check fix rates first.

#### NS-5 · Odometer sanity at the point of entry *(kept)*
**Idea.** Client-side in the daily-check form: flag an entry lower than the vehicle's last reading or implausibly higher, before submit.
**Primitive.** The daily-check form + cached last odometer.
**Effort.** Hours to a day. Protects mileage-triggered maintenance (shipped) and mileage reimbursement (P3-TIME) — one fat-fingered digit poisons both. The best effort-to-value ratio in this document; do it whenever the form is next open (FND-35 work is a natural moment).

#### NS-6 · The farm-gate link — StatusLink's next audience *(kept)*
**Idea.** A `SITE_ACCESS` StatusLink type addressed to the landowner/farm contact: crew dates, crew lead, confirm-access/gate-codes/constraints; replies write `StatusLinkEvent`s onto the deployment page.
**Primitive.** The full tokenized-link stack (`StatusLink`/`StatusLinkEvent`, verified with four types today: WORK_ORDER, HUB_RETURN, INVOICE, RESERVATION) — a new enum value, a template, and a page variant, the same extension pattern the QR capstone uses.
**Effort.** 1–2 weeks including the contact-storage question (AHITS holds no farm contacts today — a small model or Project fields).
**Falsifier / what must be true.** Only worth building if site scheduling actually flows through deployments in practice and ops wants it — **interview first.** If landowner coordination stays in the project managers' phones by preference, skip it.

#### NS-7 · Read the demand exhaust *(kept)*
**Idea.** A small admin view over `DeploymentRequestLine`/`RequestLineEvent`: most-requested items, fill rate per hub, top `denyReason`s, substitutions. "What do crews ask for that hubs can't supply?"
**Primitive.** Tables that already accrue; the SQL-side reporting pattern FND-26 establishes.
**Effort.** 3–5 days. Feeds the existing reorder loop (`reorderUrl`, `supplier`, `LOW_INVENTORY` alerts — all verified). The smallest possible version of predictive logistics, and the cheap precursor that MID-2 must justify itself against.

#### NS-8 · Custody receipts, one notch general *(kept, honestly priced, doubles as a shelved-door hook)*
**Idea.** When W0-9 rebuilds the hub Inbound loop (FND-9/FND-10: mark-received, reissue, dismiss), shape it as a reusable "handoff → receipt → event trail" component rather than a hub-return-specific screen.
**Primitive.** `HUB_RETURN` StatusLinks + `StatusLinkEvent` + the Inbound tab being rebuilt anyway.
**Effort — corrected from v1.** Not "same effort, different boundary": the generalization is a real **+2–4 days** over the minimal bug fix, spent on component API instead of feature. It pays for itself the *second* receipt flow (equipment shipping, NS-9; invoicing acknowledgments), and it is also the single cheapest hook that keeps the shelved sample-custody door openable (§8). If W0-9 is under schedule pressure, fix the bugs narrowly and skip the generalization — the door-hook is nice-to-have, not load-bearing.

#### NS-9 · Wire `Shipment` — for equipment *(new; answers CARRY-13)*
**Idea.** The dormant F2 Shippo groundwork (`Shipment` model verified: carrier, tracking, status lifecycle, polymorphic subjects for `maintenanceTaskId`/`inventoryUnitId`/`deploymentRequestLineId`/`hubId`; `lib/shipments.ts` currently dead code per FND-41) gets wired for **equipment logistics**: shipping a unit to a repair shop (attach tracking to the WORK_ORDER flow), hub-to-hub stock transfers, parts inbound. CARRY-13's "wire or delete" gets its answer: **wire it, for gear** — v1's plan to wire it "for samples first" is void.
**Effort.** 2–3 weeks honestly (carrier API, webhook or polling for status, UI on maintenance + hubs; label purchase later if ever). Not before the QR capstone; natural companion to MID-2.
**Falsifier.** Count real shipping events per month first. If gear moves by truck-with-crew and rarely by carrier, delete `lib/shipments.ts` per FND-41 and keep the model dormant — an honest "delete" is a fine answer to CARRY-13.

### 4.2 N — near tier (post-capstone quarters)

#### N-2 · The fleet P&L — buy vs rent vs idle vs retire *(kept; v1 N-1 is shelved, see §8)*
**Idea.** Grow the shipped Cost & Utilization report into per-asset economics: TCO (maintenance `actualCost` + normalized rental cost from `rentalCostAmount`/`rentalCostPeriod` + acquisition `unitCost`), utilization from `RigVehicle` spans and the odometer stream, and three generated recommendations: **idle** (AVAILABLE same-type assets vs concurrent rentals), **rent-vs-buy** (seasonal rental spend vs ownership TCO per `VehicleType`), **retire** (repair-spend trajectory vs replacement — the dashboard's 90-day nudge, given teeth).
**Primitive.** The rental block on `Vehicle` (verified, modeled unusually well — rentals are first-class vehicles), `MaintenanceTask.actualCost`, `RigVehicle`, the FND-26 SQL rebuild.
**Effort, honestly.** The first TCO columns ride the FND-26 pass for ~2–3 extra days. The full recommendation surface is **3–6 weeks** — a real quarter-bet, not a footnote. This is P3-AN-1's natural maturation and moves the 25%-repair-spend KPI.
**Falsifier.** Thin-data spurious precision. Ship with sample-size honesty ("based on 47 deployed days") and let the first season decide whether the recommendations are believed. If admins ignore the nudges for a season, stop at the report.

#### N-3 · Reliability signals from checklist exhaust *(kept, now explicitly quality-gated)*
**Idea.** Queries — not models — over `checklistJson`: per vehicle and item, trend the "no" answers; correlate with subsequent damage reports and unscheduled `MaintenanceTask` creation; surface "Truck 4 failed 'no visible fluid leaks' 3 of 5 recent checks, no open task" as a nudge.
**Primitive.** `DailyCheck.checklistJson`, `ChecklistTemplate` (stable item keys per vehicle type), maintenance/damage events as outcome labels.
**Effort.** 1–2 weeks for the query + nudge layer.
**Hard gate.** §2's data-quality contingency applies in full: run the variance check first. If checklists are pencil-whipped, this bet dies — and knowing that in month one of the pilot is itself the deliverable. The rote-pattern detection must inform *maintenance and form ergonomics*, never operator discipline (§6).

#### N-4 · Dispatch ranking — "who should go," never "who goes" *(kept)*
**Idea.** The P3-TIME-8 availability grid answers "who is free." Two joins make it "who is free, **near** (home hub → site geography), and cost-appropriate (`OperatorRate`, admin-only)" — a ranked suggestion list on deployment creation and request fulfillment. Suggestions only; humans schedule. This respects PRD §14's parking of scheduling/routing.
**Primitive.** `Availability` + `OperatorRate` (P3-TIME), `User.homeHubId` (verified), `Hub` addresses (F2), site GPS (P3-MAP). Straight-line distance is a fine v1; no routing API.
**Effort.** 2–4 weeks after both capstones land. **What must be true:** admins actually staff through AHITS rather than around it — watch the pilot.

### 4.3 MID — with a season of quality-gated data

#### MID-2 · Predictive maintenance & parts-ahead-of-failure *(kept)*
**Idea.** N-3 signals + the mileage stream + failure history mature into per-asset risk flags and, more valuably, **parts logistics**: when Truck 4's belt-adjacent items degrade, verify the belt is stocked at the crew's staging hub (`InventoryStock`, verified multi-hub), and if not, raise a reorder (`reorderUrl`/`supplier`) or a hub transfer (NS-9's wired `Shipment`). The prediction is worthless if the part is 600 miles away; AHITS holds both halves.
**Effort, honestly.** A **multi-quarter arc**, and the honest version is threshold rules with good UX — real ML is unjustified at this fleet size for years. Purchasing stays manual (PRD §14); automate the *noticing*.
**Gate.** N-3 must have survived its data-quality gate, and NS-7 must have shown the demand data is read at all.

#### MID-3 · The operator economy — contractors work out of AHITS *(kept; the highest-conviction bet in this document)*
**Idea.** Phase-3 Time/Invoicing makes AHITS the money pipe to 20–90 contractors. Mature it into the operator economy: an operator-facing earnings dashboard (`TimeEntry` × immutable rate snapshots), instant invoice status (the `INVOICE` StatusLinkType exists; issuer/template/transition branch do not yet — the workplan builds them), tax-season exports, deployment-level profitability for admins (labor + expenses + N-2's TCO share), and evidence-assisted line items (Weather Delay auto-attaches the NS-4 stamp; Travel reconciles against odometer deltas — **always as operator-benefiting corroboration, never automated rejection**).
**Why highest-conviction.** The contractor relationship is the scaling constraint, and an app that gets contractors *paid accurately and fast* is an adoption engine — it moves the 90%-adoption KPI harder than any polish. Every moonshot below rests on this trust, and no competitor can copy accumulated trust.
**Primitive.** The full P3-TIME model set; `DeploymentAssignment` attribution (why W0-10 legacy retirement is non-negotiable before invoicing); `EmailLog` (verified in schema — the FND-8 delivery-trail model exists; runtime wiring not verified here) for the money email.
**Effort.** The capstone itself is the workplan's "large." The economy layer on top is **an additional quarter-plus**, spent in slices (earnings view first — days; profitability join later — weeks).
**Falsifier.** FND-7 (date skew) and FND-14 (queue poisoning) are exactly the bugs that kill payroll trust; the workplan gates on them, and this bet is why those gates deserve zero exceptions. One bad paycheck costs more trust than a season of dashboards earns.

#### MID-4 · Multi-region, honestly priced *(kept)*
**Idea.** The PRD says crews operate in multiple countries; the repo is named Agricarbon **US**. A second region (UK parent, elsewhere) means region-scoped hubs, currency, units (odometer is miles), timezone (`APP_TIMEZONE` is one global env var — a one-region assumption baked in at FND-7's root).
**The honest price, re-verified.** **No `organizationId` or tenant scoping exists on any model.** Multi-org is a refactor across ~40 models, not a column. The only cheap move: when the P3-TIME money models are created, give them a nullable `region` discriminator from day one — defaulted, invisible, additive. That single column is in the genuinely-free bucket (§3); everything beyond it waits for the trigger: **a second real operating region with its own hubs and payroll.** Not before.
**Effort when triggered.** Multi-quarter.

#### MID-5 · The day pack — deliberate offline *(kept, trimmed)*
**Idea.** Invert offline from reactive (cache what was seen) to deliberate: pre-sync the operator's rig, kit, templates, project data, and pending transfers the evening before a no-signal day; grow on-device validation (NS-5 odometer sanity, GPS-vs-site plausibility) locally.
**Primitive.** The Serwist SW + IndexedDB queue + storage-health module (H-OFF1); FND-34's SW cache-list work is the seed.
**Effort.** 2–4 weeks, **only after A6 real-device data exists** — iOS eviction behavior bounds what can be promised, and building this before the overnight watch-item has data is building on guesses.

### 4.4 X — moonshots, named so their prerequisites stay protected

#### X-1 · The field-operations OS — AHITS beyond Agricarbon *(kept, reframed)*
**Idea.** Distributed crews + serialized instruments + offline capture + contractor labor + audit pressure is a general shape: biodiversity sampling, water quality, forestry inventory, environmental consulting. White-label the **field-operations** system — not a provenance platform, an operations one — and sell it to organizations that currently run on texts and spreadsheets.
**What it rests on now.** Not sample provenance — **operations-adoption proof**: contractors who demonstrably work out of the app (the 90% KPI, MID-3), and a fleet ledger a CFO believes (N-2). Those proofs, not features, are the moat.
**Honest status.** A company decision (support, sales, multi-tenancy costs) for a team currently sized to run one deployment. **Pure option value.** The only actions it justifies today: MID-4's nullable discriminator and not signing away the IP.

#### X-2 · The contractor network *(kept)*
**Idea.** After MID-3, AHITS holds each contractor's verifiable work history: deployments, check compliance, damage rates, invoices paid. Made operator-owned and consent-based, that becomes a portable credential, and availability becomes a two-sided market across regions.
**Honest status.** Meaningless before X-1-scale demand, and gig-reputation systems have well-documented failure modes — if ever built: operator-visible, contestable, additive-only (badges, not scores). Named here only because MID-3's schema hygiene (immutable rate snapshots, correct attribution) is what keeps it possible.

*(v1's X-3 — tamper-evident custody ledger — is shelved in its sample framing; the modest residue that survives is a discipline, not a project: keep the event and money tables append-only, and if a counterparty ever asks "how do we know this invoice log wasn't edited," hash-chaining the money/labor ledger is then a bounded quarter of work instead of a rewrite. Zero pull exists today; build nothing.)*

---

## 5. Platform notes — with the costs stated

**The capability-URL pattern is the platform seed, and it is cheap to extend.** `StatusLink` — scoped, expiring, no-account, evented access to one record — already onboards shops, hubs, and (soon) invoice processors with zero identity infrastructure. Landowners (NS-6) and any future external party follow the same pattern at the cost of an enum value and a template. AHITS's external API, if one is ever needed, should grow out of this primitive (signed server-to-server siblings of the same token model), not be bolted on beside it. This conviction survives from v1 at full strength.

**The unified event spine is NOT free, and v1 was wrong to call it a convention.** Five shadow logs exist (`CheckLog`, `StatusLinkEvent`, `RequestLineEvent`, `AccountAuditLog`, `Alert`), each shaped by its consumer. A common envelope across them is a real abstraction: migration or dual-write for old tables, a schema design that fits five shapes without degenerating into a JSON blob, and consumers to justify it. Treat it as a **deliberate future decision** with a trigger (the first feature that must query across ≥3 logs — plausibly the MID-3 profitability join), not a costless discipline to adopt in Phase 3. What *is* free now: keep each log append-only, and don't let new logs (TimeEntry events) invent gratuitously different shapes.

**The integration map, re-triaged** (pull × cheapness; PRD out-of-scope list respected):

| Integration | Status | v2 view |
|---|---|---|
| **Weather (Open-Meteo/NOAA)** | Never considered | NS-4; cheapest capture-now value on the board |
| **Shippo (shipping)** | Groundworked, dormant (`Shipment`, CARRY-13) | Wire for **equipment/parts** (NS-9) — or honestly delete; the sample-logistics framing is void |
| **Sample system / LIMS** | Exists, owned elsewhere | **Reference, never replace.** AHITS attaches/exposes the NS-1 bundle on their pull; no schema coupling, no sample IDs in AHITS |
| **QuickBooks / accounting** | Parked (PRD §14) | Correctly parked until invoicing ships; then CSV/IIF export is 80% of value at 5% of cost |
| **Payroll (Gusto etc.)** | Parked | Stays parked; invoices-as-PDF is the contract-labor reality |
| **Telematics (Samsara/Geotab)** | Never considered | Anti-recommended (§6): cost + surveillance optics vs a daily-check cadence that works |
| **Carbon registries / dMRV** | — | **Shelved** (§8). Not AHITS's counterparty |
| **Airtable / PM tools** | Parked | Leave parked |

**The moat, restated smaller and truer.** (a) The **accumulated operations graph** — seasons of custody, maintenance, attestation, and labor history that no competitor or replacement tool can backfill, with switching costs that rise every time an invoice or an audit cites it; (b) **adoption proof** — contractors who use it because it pays them; (c) the **trust posture** — a team whose bug reports read like affidavits. v1 claimed these added up to a provenance platform; v2 claims they add up to the best field-operations system in a niche that has none — which is enough.

---

## 6. Anti-goals

Unchanged in spirit from v1, tightened by the reframe:

**Do not build the sample system.** Not the batch entity, not the custody state machine, not the lab handoff, not the registry submission. It exists, it is owned elsewhere, and the short-term answer to every "shouldn't AHITS also…" that ends at the sample is no. The long-range door is kept open at ~zero cost (§8) and *only* at ~zero cost.

**Do not build real-time GPS tracking.** PRD §11.11/§14 park it, and the deeper reason stands: continuous location surveillance of contractors is adoption poison for the population whose 90% adoption is a KPI. **GPS-on-attestation, never a track** — location as a property of an event the operator chose to perform.

**Do not let evidence features become surveillance features.** Weather-verified delays and odometer-reconciled travel surface as operator-benefiting corroboration ("your weather-delay claim auto-attached NOAA data — approved same-day"), never as automated rejection. The moment the ledger reads as adversarial, contractors minimize what they enter and the data asset dies at the source. This constraint outranks every analytics bet above.

**Do not build a LIMS, an accounting system, or a routing engine.** Invoicing ends at a PDF and later an export; dispatch ranks and humans schedule. AHITS wins as the spine *between* systems.

**Do not multi-tenant on speculation.** No org scoping exists (verified); retrofitting ~40 models under a live pilot would be the largest refactor in the project's history. The nullable discriminator on new money models is the entire hedge.

**Do not skip the queue, and do not launder this document into it.** Nothing here outranks Wave 0, and several bets are literally downstream of open findings: NS-2 needs FND-2; MID-3 needs FND-7/FND-14 and W0-10; NS-6 and every external link need FND-6. The workplan's gates are this vision's gates.

**Do not treat exhaust as gold before the quality gate.** Pilot first, variance checks second, dashboards third (§2).

---

## 7. If we only did three things

Assume the realistic year: Wave 0 plus the three contracted capstones consume most of it, leaving roughly **one north-star bet per quarter thereafter**. These three are those quarters, in order, and choosing them means *not* doing NS-6, NS-9, N-4, or MID-5 in that window — that is the trade, stated out loud. They are the three ledgers of the operation: **fleet, people, operational evidence.**

### Bet 1 — The operational-evidence ledger (NS-1, + NS-3/NS-4 as they ripen)
The cheapest probe of the reframed thesis: does anyone downstream value a self-evidencing field operation?
**First step (~1 week, zero schema):** the Field-Operations Evidence Bundle — one Project-page export of checks, rig/kit serials, assignment history, and instrument maintenance state — put in front of whoever faces auditors *and* the sample-system owners. Their reaction prices everything else in this lane, including whether the shelved door (§8) ever reopens.

### Bet 2 — The fleet ledger (N-2 → MID-2)
The 25%-repair-spend KPI is bookkeeping; the prize is capital allocation — idle assets, unnecessary rentals, past-salvage repairs, found by queries over data already captured.
**First step (~2–3 days, rides scheduled work):** when FND-26 moves `reports/equipment` into SQL, add the TCO columns in the same pass (normalized rental cost, `actualCost` rollup, `RigVehicle` utilization) and one nudge: *"N rentals ran while same-type assets sat AVAILABLE at a hub ≤50 mi away."* The full recommendation surface is a real 3–6 week quarter-bet only if the nudge gets read.

### Bet 3 — The people ledger (P3-TIME → MID-3)
The time/invoicing capstone, built exactly as the workplan orders, is the highest-stakes artifact on the roadmap: the money pipe to the entire field workforce, and the adoption engine every later ambition needs.
**First step (a design constraint, ~zero marginal cost):** ship P3-TIME with three invisible provisions — **immutable rate snapshots on every `TimeEntry`** (enforced in schema), append-only time/invoice event rows shaped consistently with the existing logs (no premature unification, no gratuitous divergence), and the **nullable region discriminator** on the money models. All three sit in §3's genuinely-free bucket; everything costlier waits for pull.

---

## 8. Shelved — sample territory & long-range optionality

Everything below is **out of the plan**, moved here whole so the reasoning isn't lost and the IDs stay traceable. The common cause: *the sample's identity and chemical chain of custody are owned by an existing system on the science side. AHITS corroborates; it does not compete.* Re-entry to the main body requires an explicit product-owner decision plus pull from that system's owners — not engineering enthusiasm.

| v1 ID | What it was | Why parked | The only near-free hooks worth keeping |
|---|---|---|---|
| **N-1** (v1) | `SampleBatch` entity + custody state machine (IN_FIELD → … → RECEIVED_BY_LAB) + `LAB_RECEIPT` StatusLink + Shippo for sample legs | The sample record exists elsewhere; building a parallel one creates a dual-source-of-truth problem, the exact disease this codebase fights everywhere else | Keep `CheckLog`/`StatusLinkEvent` append-only (already true; free). If W0-9 ships NS-8's generalized receipt component anyway, a future custody flow reuses it — but do **not** spend extra W0-9 days *for this reason alone* |
| **MID-1** (v1) | Signed evidence API; LIMS reconciliation against `SampleBatch`; registry-facing dMRV submissions | The registry/verifier counterparty belongs to the sample system, not AHITS. The reduced survivor — a machine-readable NS-1 bundle the sample system can pull — lives inside NS-1 as a pull-gated growth path, not a bet | None beyond NS-1 itself. Do not design wire formats speculatively |
| **X-3** (v1) | Hash-chained tamper-evident custody ledger, framed around sample provenance | No counterparty demands it; cryptographic ceremony without a verifier is bloat. The sample framing is void with N-1 | Append-only event and money tables (free, already the house style). That alone keeps hash-chaining a bounded future project for the *money/labor* ledger if a counterparty ever asks |
| **v1 thesis** | "AHITS is becoming the provenance spine of the sample" | Rejected by the product owner as overreach; superseded by §1 | The full hook list, exhaustively: (1) append-only event tables, (2) never-discard-exhaust, (3) NS-8's component boundary *if it ships anyway*, (4) the nullable region discriminator on new money models. Nothing else. Each is ~zero design tax today; anything that costs real design effort in the sample's direction is, by this decision, not built |

That table is deliberately short. The test for adding a hook to it: *would we do this anyway for the operations thesis?* If yes, it isn't a sample hook, it's just good practice. If no, it doesn't belong in a system that has decided not to own the sample.

---

_The through-line, restated for v2: the discipline in this codebase — hashed tokens, idempotent replays, append-only events, bug reports with `file:line` evidence — is the raw material of an audit-grade **operations** system. v1 read that discipline as a mandate to own the product's provenance. It isn't. It is a mandate to make the field operation that produces the product efficient, accountable, and self-evidencing — the instruments, the people, and the proof they were there. That is a smaller claim than v1 made, it is entirely buildable by this team at roughly one real bet per quarter, and it is worth more precisely because every sentence of it is true._

_End of north-star v2._
