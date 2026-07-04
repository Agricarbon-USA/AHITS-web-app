# AHITS — Phase 3+ North Star · What This System Is Actually Becoming

_Prepared 2026-07-03. Companion to `AHITS_PHASE3_WORKPLAN_v2.md` (the canonical Phase-3 entry document). That plan is the ground truth for what exists and what is queued; **nothing in this document jumps the Wave-0 queue or reorders the Map → QR → Time/Invoicing sequence.** This document answers the question the workplan deliberately does not: what is the most advanced version of this system, what latent value is already accruing in its tables, and which forward bets deserve a line in the plan before someone else names them._

_Namespace: forward bets are minted as **`NS-#`** (near/now), **`MID-#`**, and **`X-#`** (moonshot), following the workplan's ID discipline. Every bet names the existing AHITS primitive it stands on. Speculation is flagged as speculation._

---

## 1. The thesis

Everyone involved calls AHITS an inventory and tracking system, because that is what was commissioned: know where the corers, GPS units, trucks, and trailers are; get the daily checks done; stop losing gear. The PRD §7 KPIs are all phrased that way — *100% of equipment has a known location and status at all times.*

But look at what the system actually records, and a different product is assembling itself underneath the inventory tracker:

- **`CheckLog`** is a custody event: who took which serialized unit, from where, to where, in what condition, when.
- **`DeploymentAssignment`** is a labor-history ledger: which operator held which rig, in which role, over which interval.
- **`DailyCheck`** is a daily, operator-signed condition attestation for every vehicle — soon (P3-MAP) georeferenced and timestamped at a farm site.
- **`MaintenanceTask`** (unit-linked, with `resolutionPath`, intervals, and actual costs) is an instrument-fitness record.
- **`StatusLink` / `StatusLinkEvent`** is a mechanism for letting an outside party — a repair shop, a hub, soon an invoice processor — participate in a record's lifecycle with no account, while every action they take is logged with an actor label.
- **`InviteToken`, `AccountAuditLog`, `RequestLineEvent`, `IdempotencyKey`** — everywhere it matters, the system already prefers append-only evidence over mutable state.

Now recall what Agricarbon sells. Not soil. Not sampling hours. Agricarbon sells **defensible measurement** — soil carbon numbers that a registry, a buyer, or an auditor can trust. And the defensibility of every one of those numbers rests on facts that live, or nearly live, in AHITS: *which calibrated instrument, in whose hands, checked and passed that morning, collected material at this coordinate on this date, and how that material and that instrument moved through hubs afterward.*

**The reframe: AHITS is not becoming a better inventory tracker. It is becoming the provenance spine of Agricarbon's product — the system of record for the three factors of production of field carbon measurement: the instruments (fleet and gear), the people (contractor labor), and the measurements themselves (samples and their chain of custody).**

The KPI list is one epistemic step away from this already. "100% of equipment has a known location and status" matures into "**100% of samples have a known provenance**." Same muscles, same offline queue, same QR scans, same tokenized links — pointed at the thing the company actually gets paid for.

Everything below is a consequence of that reframe.

---

## 2. The latent asset — what is already accruing

The pilot hasn't started and the tables are already filling with exhaust that no report reads. This is worth enumerating precisely, because each stream is an asset the moment someone queries it, and the Phase-3 capstones multiply several of them.

| Exhaust stream | Where it lives today | What it silently is |
|---|---|---|
| Custody events | `CheckLog` (action, unit, operator, rig, project, from/to location, condition, timestamps) | An equipment chain-of-custody ledger — the exact event shape sample custody needs |
| Daily condition attestations | `DailyCheck.checklistJson` (~16 yes/no/na items × up to 12 vehicles × every working day) | A labeled, longitudinal vehicle-health dataset; the raw material for failure prediction |
| Odometer stream | `DailyCheck.odometer` → mileage maintenance triggers (shipped, Wave G) | Usage intensity per vehicle per day; the denominator for cost-per-mile economics |
| Geography | `Photo.gpsLat/gpsLng` today; `DailyCheck` GPS in P3-MAP; `Hub` postal addresses (F2) | A geospatial trace of operations: site positions, hub network, implied drive legs |
| Asset economics | `MaintenanceTask.actualCost`, `InventoryItem.unitCost`, the Vehicle rental block (`rentalCostAmount/Period`), the shipped Cost & Utilization report (83 tracked assets on staging) | Per-asset total-cost-of-ownership, half-assembled |
| Labor graph | `DeploymentAssignment` (PRIMARY/SECONDARY, started/ended) + P3 `TimeEntry`/`Availability`/`OperatorRate` | Who can do what, where, when, at what cost — the substrate of dispatch |
| External-party trail | `StatusLinkEvent` (actor label, action, note, timestamp) | Third-party attestations with zero account friction — shops and hubs are already "signing" state changes |
| Demand signal | `DeploymentRequestLine` + `RequestLineEvent` (requested vs fulfilled vs denied, substitutions, `denyReason`) | What crews ask for that hubs can't supply — a procurement forecast writing itself |
| Consumable draw-down | `KitItem.drawnQuantity`/`drawnHubId` per deployment (post-FND-2 fix) | Materials consumed per deployment — including **sample bags**, which is a shadow count of samples collected |
| Trust posture | sha256-at-rest tokens, idempotency keys bound to body hashes, append-only event tables, audit log | The ingredients of an audit-grade ledger, already habitual |

Two observations about this table.

**First: the soil sample — the company's actual product — appears nowhere in the schema except as a consumable called "sample bags" and a scalar `Project.sampleCount`.** The system models the truck, the corer, the bag, the operator, the site visit, the hub, the repair shop, and the invoice — everything that touches the sample except the sample. This is the single largest under-considered opportunity in the product, and it is adjacent to everything already built (§3, §4).

**Second: none of these streams is valuable on day one — all of them are valuable on day 200.** A season of checklist answers is a reliability model's training set. A season of GPS-stamped checks is a logistics baseline. A season of custody events is an auditor's exhibit A. The pilot is not just an adoption test; it is the moment the data asset starts compounding. That argues for one cheap discipline starting now: **never discard exhaust for convenience** (e.g., keep raw checklist JSON, keep GPS accuracy values, keep denied-request reasons), because the marginal storage cost is nil and the retroactive value is unrecoverable.

---

## 3. Under-considered NOW — cheap, adjacent, not on any roadmap

Each of these is buildable in days-to-a-couple-weeks *given what already exists*, sits directly on a named primitive, and is absent from the PRD, the workplan, and the CARRY register (or parked there without anyone noticing what it could be). None of them belongs in front of Wave 0. All of them belong in the Phase-3 conversation.

### NS-1 · The Evidence Bundle — provenance as a report, before provenance is a feature
**Idea.** A per-project export that assembles what AHITS already knows into a single audit artifact: every daily check (with GPS once P3-MAP lands, and pass/fail + checklist detail), the rig composition over time (`RigVehicle`, `KitItem` with serial numbers from `InventoryUnit`), operator assignment history (`DeploymentAssignment`), the maintenance/repair state of every instrument used during the campaign (`MaintenanceTask` by `inventoryUnitId`), and the custody trail (`CheckLog`). One button on the Project page: "Export field-operations evidence (PDF + JSON)."
**Primitive.** Pure read-side assembly. Zero new capture, zero migration, zero operator behavior change. The hardest part is a PDF layout.
**Why it matters.** It converts existing exhaust into something Agricarbon's MRV/science side can hand an auditor or a buyer *this season*, and it road-tests the provenance thesis with no schema commitment. If nobody downstream wants the bundle, that is decisive, cheap signal about §4's bigger bets.
**Honest flag.** What an auditor formally requires is protocol-specific; the bundle's first version should be shaped with whoever at Agricarbon faces verifiers — the app team should not guess the exhibit format.

### NS-2 · Sample-bag draw as a live campaign progress meter
**Idea.** `Project.sampleCount` (the target, already in schema as NEW-2 metadata) ÷ sample-bag consumption attributed to that project's deployments (`KitItem.drawnQuantity` on bag-type consumables, via the rig→project link) = a "campaign % complete" gauge on the Project page and dashboard, with zero new data entry.
**Primitive.** `KitItem.drawnQuantity`/`drawnHubId` + `DeploymentProject`. **Gated on FND-2** (the consumable-stock leak) — which the workplan already fixes in W0-2. This bet is the reason FND-2 matters beyond inventory hygiene: bags are about to become a *measurement proxy*.
**Honest flag.** Bags drawn ≠ samples collected (spoilage, doubles). It's a proxy meter, and should be labeled as one. The exact version is N-1 in §4.

### NS-3 · Calibration as a first-class maintenance kind — CARRY-9 is a sleeping MRV feature
**Idea.** The addendum's parked `MaintenanceTask.kind` enum (CARRY-9, "verify absorbed or build") should be built, with `CALIBRATION` as a kind. GPS units and corers get interval-based calibration tasks exactly like oil changes (`IntervalType` DAYS/MONTHS/PER_DEPLOYMENT already supports it); completing one records date, cost, notes, and a receipt photo — which the photo pipeline already handles.
**Primitive.** `MaintenanceTask` + recurrence loop (shipped, Wave G) + per-unit linkage (`inventoryUnitId`, DAT-5).
**Why it matters.** "Was the instrument in calibration on the day of sampling?" is a standard QA/QC question in any measurement regime. Today AHITS could almost answer it and doesn't know that it's a question. One enum turns the maintenance module into the instrument-QA module, and feeds the Evidence Bundle (NS-1) for free.

### NS-4 · Weather-stamp every deployment day
**Idea.** Once daily checks carry GPS (P3-MAP), a nightly job enriches each check with archived weather (precipitation, temperature) from a free archive API (e.g., Open-Meteo/NOAA). Stored as additive columns or a side table; surfaced initially nowhere.
**Primitive.** The GPS columns P3-MAP adds; the cron scheduler that already runs the dispatcher.
**Why it matters twice.** (a) Soil sampling conditions (moisture especially) are scientifically relevant context for the measurement itself — cheap to capture now, impossible to reconstruct per-site later. (b) The Phase-3 time module bills a **Weather Delay task type at a configurable rate**. A weather-stamped operations record makes those line items self-verifying — see MID-3, and see §6 for why this must be a *supporting-evidence* feature, not a surveillance feature.

### NS-5 · Odometer sanity at the point of entry
**Idea.** Client-side, in the daily-check form: flag an odometer entry lower than the vehicle's last reading, or implausibly higher (e.g., +1,000 mi/day), before submit.
**Primitive.** The daily-check form + the vehicle's cached last odometer.
**Why here.** Mileage now drives maintenance triggers (Wave G) and will drive mileage reimbursement (P3-TIME). One fat-fingered digit poisons `nextOdometer` scheduling and, soon, money. This is a two-hour fix that protects two revenue-relevant loops, and nobody has written it down.

### NS-6 · The farm-gate link — StatusLink's fourth audience
**Idea.** A `SITE_ACCESS` StatusLink type addressed to the landowner/farm contact: "Agricarbon will be on your property Tuesday–Thursday; here's the crew lead; confirm access / note gate codes / flag constraints." Their reply writes a `StatusLinkEvent`; the deployment page shows it.
**Primitive.** The entire tokenized-link stack (`status-links.ts`, `/s/[token]`, the event trail) — this is a new `StatusLinkType` and a template, exactly the extension pattern the QR capstone already uses.
**Why it matters.** Landowner relations are the soft substrate of every sampling campaign, and today they live in texts and phone calls — the same "tracked inconsistently across text messages" disease the PRD §1 was written to cure for equipment. Also the first primitive of the customer-facing portal that PRD §14 parks for V2.
**Honest flag.** Requires storing farm-contact info AHITS doesn't hold today; only worth it if site scheduling actually flows through deployments in practice. Ask the ops team first.

### NS-7 · Read the demand exhaust
**Idea.** A small admin view over `DeploymentRequestLine`/`RequestLineEvent`: most-requested items, fill rate per hub, top `denyReason`s, substitution patterns. "What do crews ask for that we can't supply?"
**Primitive.** Tables that already exist and already accrue; the reporting pattern of `reports/equipment` (post-FND-26, SQL-side).
**Why it matters.** This is procurement forecasting from data nobody is reading, and it feeds the low-stock/reorder loop (`reorderUrl`, `supplier`, `LOW_INVENTORY` alerts all exist). It is the smallest possible version of "predictive logistics."

### NS-8 · Custody receipts as a generalized primitive
**Idea.** The W0-9 hub-Inbound work (FND-9/FND-10: mark-received, reissue, dismiss) should be built one notch more general than the bug fix requires: a "custody handoff + receipt" component (issue link → physical move → receipt confirm → event trail) rather than a hub-return-specific screen.
**Primitive.** `HUB_RETURN` StatusLinks + `StatusLinkEvent` + the Inbound tab being rebuilt anyway.
**Why.** Sample handoffs (crew → hub → courier → lab, §4 N-1) are *structurally identical* to equipment hub-returns. Generalizing the receipt loop now — same effort, different component boundary — means the sample chain in Phase 3+ reuses a hardened primitive instead of forking a new one. This is a free architectural option purchasable during already-scheduled work.

---

## 4. The advanced build-outs — tiered

Sequencing rule inherited from the workplan: Wave 0, then the contracted capstones (Map → QR → Time/Invoicing). The Near tier below interleaves *after* those or rides on their coattails; Mid assumes a completed Phase 3 and a season of pilot data; Moonshots assume deliberate strategic choice, not drift.

### 4.1 Near — next two quarters, high leverage

#### N-1 · Sample chain-of-custody v1 — model the product
**The idea.** A `SampleBatch` entity: project, deployment, collection date, bag/batch QR code, count, collected-by, and a custody state machine (`IN_FIELD → AT_HUB → SHIPPED → RECEIVED_BY_LAB`). Operators register a batch by scanning a bag/box QR at collection (the scan page gains one branch); hub receipt reuses the NS-8 custody component; the lab leg reuses the **dormant `Shipment` model** (F2 Shippo groundwork — CARRY-13's "wire or delete" gets its answer: **wire it, for samples**) plus a new `LAB_RECEIPT` StatusLink so the lab confirms receipt with no account, exactly as repair shops confirm work orders today.
**Why AHITS specifically.** Every hard part is already built: offline capture (the durable queue + `withIdempotency` handle a no-signal field registration exactly like a daily check), QR scanning (context-aware scan routing ships since Wave 1), tokenized external confirmation (`StatusLink`), custody eventing (`CheckLog`/`StatusLinkEvent` shapes), even the shipment tracker. The marginal build is one model, one scan branch, one link type, one screen.
**The leverage.** This is the keystone: it connects the equipment graph (which corer, in what condition, calibrated when — NS-3) and the labor graph (who — `DeploymentAssignment`) to the product. After it, the Evidence Bundle (NS-1) stops being circumstantial ("we were there with working gear") and becomes custodial ("this batch, this chain, these hands").
**The risk.** Field friction — one more scan per batch in the rain. Mitigations: batch-level not core-level granularity in v1; piggyback registration on an existing action (end-of-day check or return flow); make it optional per project until the pilot proves the ergonomics. **This must go through the same A6-grade device honesty as everything else.** Also: get the sampling workflow from the crews, not from this document — the entity design above is a hypothesis to be field-checked.

#### N-2 · The fleet P&L — buy vs rent vs idle
**The idea.** Grow the shipped Cost & Utilization report into per-asset economics: TCO per vehicle (maintenance `actualCost` + rental cost normalized from `rentalCostAmount`/`rentalCostPeriod` + acquisition `unitCost`), utilization from deployment history (`RigVehicle` spans) and the odometer stream, cost-per-deployed-day and cost-per-mile, and three generated recommendations: **idle** (available-at-hub assets that could displace a rental — `InventoryStock`/hub location vs concurrent rentals of the same `VehicleType`), **rent-vs-buy** (seasonal rental spend per type vs ownership TCO), and **retire** (repair-spend trajectory vs replacement — the "90-day maintenance-spend nudge" already on the dashboard, given teeth).
**Why AHITS specifically.** The rental block (NEW-5) was modeled unusually well — rentals are first-class Vehicles with cost period semantics, so the comparison is a query, not a data-collection project. Almost no small field-ops company has this data in one place; Agricarbon will after one season.
**The leverage.** `reports/equipment` (rebuilt SQL-side per FND-26, exactly as the workplan already orders), the rental fields, `MaintenanceTask.actualCost`, `RigVehicle` spans.
**The risk.** Low technical risk; the danger is spurious precision on thin early data. Ship it with explicit sample-size honesty ("based on 47 deployed days"). This is the workplan's P3-AN-1, aimed at the 25%-repair-spend KPI — the extension here is the *decision framing* (buy/rent/idle/retire), which no current document contains.

#### N-3 · Reliability signals from checklist exhaust
**The idea.** Mine `checklistJson`: per vehicle and per checklist item, trend the "no" answers; correlate item-failure patterns with subsequent damage reports and unscheduled `MaintenanceTask` creation; surface "Truck 4 has failed 'no visible fluid leaks' 3 of the last 5 checks and has no open task" as a dashboard nudge. Not a model — a query, at first.
**Why AHITS specifically.** The 16-item daily check at 95% compliance is a *daily labeled inspection* of every vehicle — a dataset trucking fleets pay telematics vendors for a worse version of. AHITS gets it as a byproduct of a safety-compliance KPI.
**The leverage.** `DailyCheck.checklistJson`, `ChecklistTemplate` (stable item keys per vehicle type), `MaintenanceTask`/damage events as outcome labels, the alert/nudge pattern from P3-AN-1.
**The risk.** Checklist answers may be rote ("all yes" pencil-whipping). The counter is that the data itself reveals rote patterns (zero-variance operators), which is *also* operationally useful — but tread carefully: this must inform maintenance, not become operator surveillance (§6).

#### N-4 · Dispatch v1 — from "who's free" to "who should go"
**The idea.** The P3-TIME-8 availability grid answers "who is free next week?" Add two joins and it answers the real question: who is free, **near** (home hub → project geography, drive-time estimated from hub addresses + project/site GPS), and **cost-appropriate** (`OperatorRate`/`hourlyRate`, admin-only). A ranked suggestion list on the deployment-creation and request-fulfillment flows — suggestions, never auto-assignment.
**Why AHITS specifically.** Availability, rates, home hubs (`User.homeHubId`), hub addresses, and (post-Map) site coordinates all exist or arrive with Phase 3. The join is the feature.
**The leverage.** `Availability` + `OperatorRate` (P3-TIME), `User.homeHubId`, `Hub` addresses (F2), `DailyCheck` GPS (P3-MAP).
**The risk.** PRD §14 explicitly parks "employee scheduling/routing" — this respects that boundary by ranking, not scheduling. Drive-time via a routing API adds a dependency; straight-line distance is a fine v1.

### 4.2 Mid — network effects and data compounding (post-pilot, with a season of data)

#### MID-1 · The MRV evidence layer — provenance becomes machine-readable
**The idea.** Evidence Bundles (NS-1) mature from PDF into a **signed, versioned evidence API**: per project, a JSON bundle of custody chains (N-1), instrument QA (NS-3), georeferenced field attestations (daily checks + GPS + weather stamps), and operator certifications-of-work — content-hashed so any later tampering is detectable, fetchable by Agricarbon's MRV pipeline or shared with a verifier via (what else) a tokenized capability link. Integration targets, in order of realism: Agricarbon's own lab/LIMS intake (sample IDs reconciled against `SampleBatch`), then registry-facing digital-MRV submissions.
**Why AHITS specifically.** Registries and buyers are converging on digital MRV expectations — georeferenced sampling, documented custody, instrument QA, auditable protocols (the specifics per protocol are for Agricarbon's science team to pin, and this document flags that as required input, not something to infer from the app side). Agricarbon's differentiation is direct measurement; the marginal cost of making its field operations *self-evidencing* is uniquely low because the field system of record is this disciplined already.
**The leverage.** N-1 + NS-1 + NS-3 + NS-4; the sha256/append-only habits; `StatusLink` for verifier access.
**The risk.** The biggest bet in the Mid tier and the most dependent on non-engineering stakeholders. Do not build past the Bundle (NS-1) until someone who talks to verifiers pulls for more. Speculative flag: **high on format, low on direction** — the direction (measurement operations must prove themselves) is close to certain; the wire format and registry appetite are not.

#### MID-2 · Predictive maintenance & parts logistics — close the loop from signal to shelf
**The idea.** N-3's reliability signals + the mileage stream + failure history mature into per-asset risk scores and, more valuably, **parts-ahead-of-failure logistics**: when Truck 4's belt-adjacent checklist items degrade, verify the belt is stocked at the crew's staging hub (`InventoryStock`), and if not, raise a reorder (via `reorderUrl`/`supplier`, or a Shippo transfer from another hub via the now-wired `Shipment`). The prediction is worthless if the part is 600 miles away; AHITS is unusual in holding both halves.
**The leverage.** N-3, `InventoryStock` (multi-hub), `LOW_INVENTORY` alerts, `reorderUrl`/`supplier`, `Shipment`, the request pipeline (NS-7) as demand history.
**The risk.** Real ML is unjustified at this fleet size for years; the honest version is threshold rules with good UX. PRD §14 parks "automated reorder purchasing" — keep purchasing manual (one-click to the reorder URL), automate only the *noticing*.

#### MID-3 · The operator economy — invoicing grows into a two-sided ledger
**The idea.** Phase-3 Time/Invoicing makes AHITS the money pipe between Agricarbon and 20–90 contractors. Mature that into the **operator economy**: an operator-facing earnings dashboard (season-to-date by project and task type — the data is `TimeEntry` × rate snapshots), instant invoice status (the `INVOICE` StatusLink already contemplated), self-serve tax-season exports, deployment-level profitability for admins (labor + expenses + equipment TCO share per project — joining N-2 and the time ledger), and evidence-assisted line items (a Weather Delay entry auto-attaches the NS-4 weather stamp; a Travel entry reconciles against odometer deltas — **presented as supporting evidence the operator benefits from, never as an automated rejection gate**).
**Why AHITS specifically.** The contractor relationship is the company's scaling constraint (personas: 20–90 operators, "will only adopt if the app is faster than texting"). An app that gets contractors *paid accurately and fast* is an adoption engine — it moves the 90%-adoption KPI harder than any UX polish, and it accumulates the trust that every §4.3 moonshot requires.
**The leverage.** The full P3-TIME model set, `DeploymentAssignment` attribution (this is why the workplan is right to gate invoicing on W0-10 legacy retirement), NS-4, N-2.
**The risk.** Payroll-adjacent trust is fragile: FND-7 (business-date skew) and FND-14 (queue poisoning) are exactly the class of bug that destroys it — the workplan already gates on them; this bet is why those gates deserve zero exceptions.

#### MID-4 · Multi-region, then multi-org — honestly priced
**The idea.** The PRD §1 says field crews operate "in multiple countries"; the codebase is named Agricarbon **US**. A second region (UK parent, other geographies) is the natural first multi-tenancy: region-scoped hubs, currencies, units (`odometer` is miles today, O7), timezones (`APP_TIMEZONE` is a single global env var — a one-region assumption baked in at FND-7). From there, franchise/white-label (X-1) becomes conceivable.
**The honest price.** There is **no `organizationId` anywhere in the schema** (verified) — no tenant scoping on any of ~40 models, a single global `NotificationConfig` row, one timezone, one currency assumption. Multi-org is a real refactor, not a column. Which is why the cheap move is available *now*: when Phase-3 models are created (the 7 time/invoicing models, `SampleBatch`), give the money- and provenance-bearing ones a nullable `region`/`org` discriminator from day one, defaulted and invisible. Additive, costless, and it converts a future rewrite into a future backfill.
**The risk.** Premature multi-tenancy is the classic bloat trap (§6). Trigger condition: a second real operating region with its own hubs and payroll — not before.

#### MID-5 · Offline-edge intelligence — the day pack
**The idea.** Invert the offline posture from *reactive* (cache what was seen, queue what was written) to *deliberate*: the evening before a deployment day, the PWA pre-syncs a **day pack** — the operator's rig, kit, checklist templates, project/site data, pending transfers, and (new) the day's expected tasks — sized for a full no-signal day. On-device validation grows in the same direction: odometer sanity (NS-5), GPS-vs-site plausibility, "you drew 40 bags but registered 0 sample batches" nudges at end-of-day — all computed locally, no round trip.
**Why AHITS specifically.** The Serwist SW + IndexedDB queue + storage-health module (H-OFF1) is already among the most serious offline stacks in this product category; FND-34's SW cache-list work is the seed of the day pack. The differentiator isn't AI at the edge; it's *completeness* at the edge — the A6 checklist culture, productized.
**The risk.** iOS storage eviction (the A6 overnight watch-item) bounds how much can be promised; the day pack must degrade gracefully. Build after A6 data exists, not before.

### 4.3 Moonshots — category-defining, deliberately speculative

#### X-1 · The field-measurement OS — AHITS beyond Agricarbon
**The idea.** Soil carbon is one instance of a general shape: **distributed crews + serialized instruments + offline capture + custody-critical samples + contractor labor + audit pressure.** Biodiversity (eDNA sampling), water quality, forestry inventory, methane/flux measurement, environmental consulting — same shape. White-label AHITS (multi-org from MID-4, configurable vocabulary — `ChecklistTemplate` already proves the config pattern) and sell the operating system to every field-measurement organization that currently runs on texts and spreadsheets, which is, per this very PRD's problem statement, approximately all of them.
**Why AHITS could.** Because it will have done it for real: an offline-honest field app that contractors actually adopt (the 90% KPI), with provenance rails auditors accept (MID-1). Those two proofs are the entire moat in this category — not features, *evidence of adoption and evidence of evidence*.
**The risk.** It's a company decision, not a product decision — support, sales, and multi-tenancy costs land on a team currently sized to run one deployment. Flag: **pure option value.** The only action it justifies today is MID-4's nullable discriminator and not signing away the IP.

#### X-2 · The contractor network — portable reputation for field operators
**The idea.** After MID-3, AHITS holds each contractor's verifiable work history: deployments completed, daily-check compliance, damage rates, custody discipline, invoices paid. Make that (operator-owned, consent-based) a **portable credential**, and the availability calendar becomes a two-sided market: vetted operators discoverable across regions/orgs, staffed into campaigns the way the app already staffs rigs. The "availability economy" the Phase-3 brief gestures at, matured into a network.
**The risk (large, structural).** Reputation systems for gig labor have well-documented failure modes: opacity, power asymmetry, gaming. If ever built, operator-visible, operator-contestable, additive-only (badges, not scores). And it is meaningless before X-1-scale multi-org demand exists. Park it, but *name* it — because MID-3's schema (rate snapshots, attribution correctness) is what keeps it possible.

#### X-3 · Audit-grade custody — the ledger hardens
**The idea.** The provenance spine (N-1 → MID-1) gains cryptographic weight: hash-chained event logs (each custody/attestation event commits to its predecessor), operator device signatures on attestations, third-party timestamps on Evidence Bundles. Not a blockchain; a tamper-evident ledger — the difference between "our database says" and "here is a chain no one could have quietly rewritten," which is the difference an adversarial audit or a carbon-credit dispute cares about.
**Why plausible here.** The system already stores only token hashes, already binds idempotency keys to body hashes, already prefers append-only tables. The team's instincts are 80% of the way to tamper-evidence; this is the last 20%, applied to the tables that will carry legal weight.
**The risk.** Zero pull for it today; cryptographic ceremony without a counterparty who demands it is bloat. Trigger: the first verifier or buyer who asks "how do we know this log wasn't edited?" — at which point this becomes a quarter's work instead of a rewrite, *if* the event tables stay append-only in the meantime (a free discipline, worth adopting now).

---

## 5. What would make it a platform, not a tool

Four moves, in ascending order of commitment:

**1. One event spine.** AHITS already has five shadow event logs (`CheckLog`, `StatusLinkEvent`, `RequestLineEvent`, `AccountAuditLog`, `Alert`). Unify new ones (sample custody, time events) onto a common envelope (actor, subject, action, payload, hash-of-predecessor per X-3) and the platform's nervous system exists. Cheap to start in Phase 3: it's a convention, not a migration.

**2. The capability-URL pattern, promoted to an API philosophy.** The `StatusLink` insight — *scoped, expiring, no-account, evented access to one record* — is more valuable than any of its four current types. Labs (MID-1), landowners (NS-6), verifiers, accountants: every external party AHITS will ever meet can be onboarded this way with zero identity infrastructure. The platform move is generalizing issuance (any record type), management (the W0-9 revoke/reissue UI, generalized), and eventually machine-grade siblings (signed server-to-server tokens for a LIMS that polls instead of clicks). AHITS's external API should *grow out of StatusLink*, not be bolted on beside it.

**3. The integration map, honestly triaged.** Ordered by (pull × cheapness), with the PRD's own out-of-scope list respected:

| Integration | Status in docs | North-star view |
|---|---|---|
| **Shippo (shipping)** | Groundworked, dormant (`Shipment`, CARRY-13) | Wire it — for sample logistics (N-1) first, equipment second |
| **Weather (Open-Meteo/NOAA)** | Never considered | NS-4; trivially cheap, capture-now value |
| **Soil/terrain data (USDA SSURGO etc.)** | Never considered | Enrich site GPS for MRV context (MID-1); read-only, free |
| **LIMS / lab intake** | Never considered — *the* gap | The sample chain's far end (MID-1); start with `LAB_RECEIPT` links, not an integration |
| **QuickBooks / accounting** | Explicitly parked (PRD §14, §11.12) | Correctly parked until invoicing ships; then a CSV/IIF export is 80% of the value at 5% of the cost |
| **Payroll (Gusto etc.)** | Explicitly parked | Stays parked; invoices-as-PDF is the contract-labor reality |
| **Telematics (Samsara/Geotab)** | Never considered | Anti-recommended for now (§6): per-vehicle cost + surveillance optics vs a daily-check cadence that already works |
| **Carbon registries / dMRV** | Never considered | Via MID-1 bundles, only on verifier pull |
| **Airtable / PM tools** | Explicitly parked | Leave parked; the Evidence Bundle and CSV exports outcompete a sync no one asked for |

**4. The moat, named precisely.** Not features — features here are replicable by any competent team with this document. The moat is (a) the **accumulated provenance graph** — seasons of custody, calibration, attestation, and labor history that cannot be backfilled by a competitor or a new tool, and whose value *compounds* while switching costs rise with every audit that cites it; (b) the **adoption proof** — contractors who actually use it because it pays them (MID-3); and (c) the **trust posture** — an audit-grade ledger is believable from a team whose bug reports read like affidavits, and that culture is visible in every doc in this repo. Data network effects (cross-org equipment reliability benchmarks, e.g. failure rates per corer model per 1,000 samples) are real but strictly gated behind X-1 multi-org scale — flagged speculative.

---

## 6. Anti-goals & honest caveats

This team's superpower is descoping (the RN wrapper, §F's redesign, the CARRY register's "decide or descope" discipline). The vision above dies if it becomes an excuse to stop doing that. So, explicitly:

**Do not build real-time GPS tracking.** PRD §11.11 and §14 both park it, and they are right for a deeper reason than scope: continuous location surveillance of contractors is adoption poison for the exact population whose 90% adoption is a KPI. GPS-on-attestation (a check, a sample registration, a clock-in) is the ethically and practically correct cadence — location as a *property of an event the operator chose to perform*, never a track. Every Near/Mid bet above conforms to this.

**Do not let evidence features become surveillance features.** NS-4/MID-3's weather-verified delays and odometer-reconciled travel must surface as *operator-benefiting corroboration* ("your weather-delay claim auto-attached NOAA data — approved same-day") and never as automated rejection. The moment the ledger reads as adversarial, contractors will minimize what they put in it, and the data asset dies at the source. This is the single most important cultural constraint on the entire provenance thesis.

**Do not build a LIMS, an accounting system, or a routing engine.** The sample chain ends at "received by lab" — lab-internal chemistry is someone else's system of record. Invoicing ends at a PDF and (later) an export — reconciliation is QuickBooks's job. Dispatch ranks; humans schedule. AHITS wins by being the *spine between* systems, not by swallowing them.

**Do not multi-tenant on speculation.** Zero org scoping exists today (verified); retrofitting it across ~40 models under a live pilot would be the largest refactor in the project's history. The cheap hedge (nullable discriminators on *new* Phase-3 models, MID-4) is worth taking; anything more waits for a second region with a payroll.

**Do not skip the queue.** Nothing in this document outranks Wave 0. Several bets are *literally downstream of open findings*: NS-2 needs FND-2 (stock leak) or the sample proxy double-counts; MID-3 needs FND-7 (business-date) and FND-14 (queue poisoning) or the first payroll incident ends contractor trust; N-1's external links need FND-6 (link-state gate) or custody confirmations are forgeable via revoked links. The workplan's gates are this vision's gates.

**Pilot signal is the tiebreaker.** The honest dependency chart: **pilot → data → every Mid bet.** If operators pencil-whip checklists, N-3 dies and that's worth knowing in month one. If nobody downstream opens the Evidence Bundle, MID-1 waits and NS-1 cost a week. Each Near bet is deliberately sized to be cheap enough to be falsified by the pilot rather than protected from it.

**And one caveat about this document itself.** The sample-workflow specifics (N-1's states, batch granularity), the MRV format expectations (MID-1), and the landowner flow (NS-6) are hypotheses formed from the codebase and domain reasoning, not from interviews with crews, the lab, or verifiers. The first step on each is a conversation, not a migration.

---

## 7. If we only did three things

Three bets, chosen for leverage per unit of new machinery, each with a first step that reuses what's already built. Together they cover the product (samples), the capital (fleet), and the people (contractors) — the three ledgers of the operating system this is becoming.

### Bet 1 — Own the provenance of the sample (NS-1 → N-1 → MID-1)
The soil sample is the only thing Agricarbon sells and the only thing AHITS doesn't model. Close that, and AHITS graduates from tracking the company's costs to underwriting its revenue.
**First concrete step (≈1 week, zero schema):** build the **Evidence Bundle export** — a Project-page action assembling daily checks, rig/kit composition with serial numbers, `DeploymentAssignment` history, and unit-linked maintenance state into one PDF+JSON artifact, and put it in front of whoever faces auditors. Their reaction prices every subsequent step, from `SampleBatch` to the evidence API.

### Bet 2 — Run the fleet like a portfolio (N-2 → MID-2)
The 25%-repair-spend KPI is a bookkeeping goal; the real prize is capital allocation — every idle asset, unnecessary rental, and past-salvage repair found by a query over data already captured.
**First concrete step (rides scheduled work):** when FND-26 moves `reports/equipment` aggregation into SQL (already ordered by the workplan), add the TCO columns in the same pass — rental cost normalized by `rentalCostPeriod`, maintenance `actualCost` rollup, utilization from `RigVehicle` spans — and one dashboard nudge: *"N rentals ran while same-type assets sat AVAILABLE at a hub ≤50 mi away."*

### Bet 3 — Make AHITS the reason contractors stay (P3-TIME → MID-3)
Phase 3's time/invoicing module, built exactly as planned, is quietly the highest-stakes artifact in the roadmap: the money ledger for the entire field workforce. Treat it not as a feature but as the foundation of the operator economy — earnings transparency, fast approvals, evidence-assisted claims — because contractor trust is the one asset every moonshot requires and no competitor can copy.
**First concrete step (a design constraint, not a project):** ship P3-TIME per the workplan *with three invisible provisions* — immutable rate snapshots on every `TimeEntry` (the plan's own one-rate-source rule, enforced in schema), `TimeEntry` events on the common event envelope (§5.1), and a nullable org/region discriminator on the money models (MID-4's hedge). Cost: near zero now. Value: every operator-economy and multi-org bet stays a backfill instead of a rewrite.

---

_The through-line, one last time: this system's discipline — hashed tokens, idempotent replays, append-only events, evidence-cited bug reports — is not just engineering hygiene. It is the exact raw material of an audit-grade operating system for field measurement. The inventory tracker was the excuse to build it. The provenance spine is what it's for._

_End of north-star document._
