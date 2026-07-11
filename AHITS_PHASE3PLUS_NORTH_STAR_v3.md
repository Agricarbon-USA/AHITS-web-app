# AHITS — Phase 3+ North Star v3 · Two Loops and a Friction Budget

_Prepared 2026-07-03. **Supersedes `AHITS_PHASE3PLUS_NORTH_STAR_v2.md` (same date).** v2 corrected v1's thesis — AHITS owns the field **operation** (instruments, people, operational evidence), never the sample — and that correction stands untouched here. What v2 got wrong is subtler and the product owner named it: v2 is a **catalogue of buildable bets**, and a catalogue answers "what could we build on these primitives?" when the question that decides whether any of it matters is "**why would an operator open this app at 6:40 a.m. instead of sending a text?**" v2 is ledger-heavy and UX-light: it designs three ledgers in loving detail and designs the human loop that feeds them not at all. v3 interrogates the scoping itself. It is shorter than v2 in active surface — **four things matter; everything else is parked by name** — and that is the point._

_Companion to `AHITS_PHASE3_WORKPLAN_v2.md`, which remains the canonical plan. **Nothing here jumps the Wave-0 queue or reorders Map → QR → Time/Invoicing.** ID discipline is inherited: v2 IDs are carried and dispositioned in the appendix (§9); new bets continue the same namespaces (`NS-10`+, `N-5`+). Every structural claim below was re-verified against the app this session — `prisma/schema.prisma`, the route tree, and the actual operator dashboard source._

---

## 1. The scoping interrogation — what v2 optimized, and what it skipped

Three verified facts frame everything in this document:

1. **The operator's home screen is a static menu.** `src/app/(operator)/operator/dashboard/page.tsx` is 135 lines: four link cards — Daily Vehicle Check, Check Out / Check In, Scan QR, My Requests — plus a pending-request strip. It does not know what day it is. It does not say where you're going, whether your check is done, whether a transfer is waiting on you, or what's different about today versus yesterday. It is a *directory*, not a *day*.
2. **No calendar or timeline surface exists anywhere in the app.** A grep across both route groups finds no calendar component and no week view; the only match on "schedule" is a text label on the maintenance page. Yet the schema is *full* of time: `Rig.startedAt/endedAt`, `DeploymentRequest.neededBy`, `MaintenanceTask.nextDue`, `Vehicle.rentalStartDate/rentalEndDate`, `Project.startDate/endDate`, `TransferRequest`/`DeploymentHandoff` pending states — all verified, all dated, none of it visible as "what is happening this week."
3. **Nothing in the schema or routes handles the day going wrong.** No incident model, no safety log, no day-level status. Damage reports exist (`MaintenanceTask.isDamageReport`, `resolutionPath`) — that is the *equipment* going wrong. A person getting hurt, a gate that won't open, a weather abort: the app has no noun for any of it, and field ops **is** the exceptions.

Now hold those three facts against v2's own KPI structure. The 90%-operator-adoption KPI is the one every other bet silently depends on — v2 says so itself ("adoption engine," "the moat is adoption proof") — and yet **not one of v2's seventeen bets builds the thing that produces adoption: an operator experience that beats texting.** v2 treats adoption as an outcome of paying people correctly (true, necessary, and not sufficient) and otherwise as a KPI someone else moves. That is the blind spot. **Adoption is a product, not a KPI.** The competition is not another field-ops system; it is a group text, a paper log in the truck, and a phone call to the ops lead — tools with zero taps of friction and zero evidence value. AHITS wins only where it is *faster than the text* or *does something the text can't* (get you paid, prove you were there), and every screen must know which of those two it is doing.

So v3 makes one structural move: **stop organizing the product around ledgers (fleet / people / evidence) and organize it around the two loops that feed the ledgers.** The ledgers are still the value; the loops are how value gets captured at all. Everything in this document — kept, new, or cut — is judged by one test: *which loop does it serve, at which step, and does it remove more friction than it adds?*

---

## 2. The two core loops

### 2.1 Loop 1 — the operator's day (the adoption loop)

Walk the real day against the real app. This table is the honest UX audit v2 never did:

| Step in the day | What the operator needs | What AHITS does today (verified) | Verdict |
|---|---|---|---|
| **Wake / plan** | "Where am I going, with what, with whom, is anything waiting on me?" | Static 4-link menu; pending requests strip; bell notifications | **Missing.** The single biggest gap in the product (→ NS-10) |
| **Drive** | Directions to site, gate/access notes | Nothing (`DailyCheck.site` is a free-text string the operator types) | Partially out of scope (maps app does directions), but site/access notes have no home (→ NS-10 carries them read-only) |
| **Daily check** | Fast, per-vehicle, offline-safe | 16-item stepper; works offline; but a late template response can wipe answers (FND-35) and evening checks date tomorrow (FND-7) | **Exists; must become bulletproof.** Wave 0 owns both bugs |
| **Deploy / transfer gear** | Scan, accept, hand off | Scan + transfer/handoff flows exist and work; queue-poisoning on reconnect (FND-14) | Exists; offline trust is the gap (→ §7.3) |
| **Work** | Nothing. The app should disappear | — | Correct today. Keep it that way |
| **Something goes wrong** | Breakdown, injury, no access, weather abort | Damage report only. No incident log, no day status, no structured "I'm stuck" | **Missing** (→ NS-13, and §3's worked example) |
| **End of day** | Close out in one motion: check done, gear accounted, hours logged | Nothing today; P3-TIME will add clock-out as a separate act | **Missing as a *designed moment*** (→ NS-11, a design constraint on P3-TIME, not a new feature) |
| **Get paid** | Hours → invoice → money, visibly and fast | P3-TIME capstone (models verified absent today — `TimeEntry`, `OperatorRate`, `Invoice`, `Availability` do not exist yet; the workplan builds them) | **The retention engine.** MID-3 stays the highest-conviction bet |

Read the verdict column top to bottom and the scoping conclusion writes itself: the middle of the day is largely built; **the two ends of the day — "here's your day" and "day closed, hours logged" — don't exist**, and those two ends are where the texting habit either dies or wins. An operator who gets their day from the app at 6:40 and closes it in one tap at 17:30 is an adopted operator; everything they do in between lands in the ledgers as a byproduct.

### 2.2 Loop 2 — the ops manager's week (the leverage loop)

The person dispatching 20–90 contractors across sites runs this loop: **plan the week → staff and stage gear → watch it run → absorb exceptions → chase what's missing → close the week (approve hours, pay, reorder).** Today that loop is spread across eleven admin pages (verified route list: dashboard, deployments, hubs, inventory, maintenance, projects, reports, requests, settings, users, vehicles) plus the bell — every page a *noun*, no page the *week*. The workplan flags admin-mobile ergonomics (`P3-MOB-1`) and dead-end links (FND-48), but nobody has designed the manager's Monday morning as a target.

The fix is not a "command center" project — it is one surface: **the week board (N-5)**, a read-only timeline of deployments (rows) against days (columns), with maintenance due-dates, rental windows, request `neededBy` deadlines, and (post-P3) operator availability layered on. Every date it needs already exists in schema (§1 fact 2). It is a **view, not a scheduling engine** — no auto-assignment, no routing, no drag-to-reschedule in v1 — which keeps it honest against PRD §14's parking of scheduling. Field ops is fundamentally "what's happening this week," and this single view is a bigger organizing primitive than any analytics bet in v2: N-4 (dispatch ranking), N-2's nudges, NS-7's demand view, and the missed-check chase all become *annotations on the board* instead of four more pages.

**The manager's other tool is the exception feed** — the bell already exists and Wave 0 is fixing its labeling (FND-50). Resist the urge to build more dashboard; the board plus a trustworthy bell is the manager's product.

### 2.3 The rule that falls out

**Every feature must name its loop and its step.** If it serves neither loop, it is a ledger dream, and it waits. This single rule re-scores all of v2 — which is §5 and the appendix.

---

## 3. The friction budget — resolving evidence vs. adoption head-on

Name the tension v2 papered over: **every feature that wants evidence adds taps, and every tap fights adoption.** The evidence bundle wants richer capture; the adoption KPI wants less. These pull in opposite directions on the same thumb, and a document that champions both without a resolution principle is scoped wrong no matter which bets it picks.

The principle: **capture-as-byproduct, never capture-as-chore.** Ranked concretely:

1. **Passive beats manual, always.** GPS-on-attestation (P3-MAP: coordinates ride the check the operator already submits), the NS-4 weather stamp (a nightly server job — *zero* operator taps), server timestamps, `EmailLog` rows (verified runtime-wired: `sendEmail` writes `email_logs`, an admin surface reads it — upgrade v2's hedge). These cost the operator nothing and are the model for all evidence ambition.
2. **Piggyback beats parallel.** If a datum can ride an action the operator already performs, it must. The worked example, cutting one of this document's own drafts: an "exception day-status" feature (WEATHER / BREAKDOWN / NO_ACCESS flags on a deployment day) was on the v3 candidate list — and it is the wrong shape, because **P3-TIME's `TaskType` already encodes it.** A weather-delay day is a time entry with the Weather Delay task type — a thing the operator logs anyway *because it pays them*. Design the clock's task-type picker so the exception states are one tap, and the exception telemetry falls out of payroll for free. No new model, no new chore. That is the friction budget working.
3. **Every new required tap must remove at least one existing tap — or it doesn't ship.** NS-5 (odometer sanity at entry) *passes*: one inline warning prevents a redo-tomorrow and a phone call. A mandatory end-of-day gear recount *fails* unless it replaces the ad-hoc "where's the corer?" text chase it's meant to prevent — so it ships as a one-tap confirm of what the system already believes, never a re-enumeration.
4. **Evidence must visibly benefit the person providing it.** Carried from v2's anti-goals at full strength: weather-stamps *approve* delay claims faster, odometer reconciliation *defends* mileage claims, photos *settle* damage disputes in the operator's favor. The moment capture reads as surveillance or audit-of-me, operators minimize input and the data asset dies at the source. This outranks every analytics ambition.

Budget mechanics, so this is a practice and not a slogan: any PR that adds a required operator interaction states, in its description, **taps added vs. taps (or texts, or phone calls) removed**. Reviewer enforces. The daily check's time-to-complete gets instrumented in the pilot (client timing, no new capture), because it is the single number the whole evidence thesis rests on: if the check takes four minutes, we have a health dataset; if it takes eleven seconds, we have a compliance artifact (v2 §2's quality gate, now with a measurable leading indicator).

---

## 4. What we are MISSING (Q1) — and which of it matters

New bets, sized honestly, each named to its loop and step. Ordered by conviction, and the tail of the list is explicitly *low*-conviction — finding more ideas was never the constraint.

#### NS-10 · "Today" — the operator's morning view *(Loop 1 / wake; the #1 missing dimension)*
Replace the static dashboard menu with the operator's day: current deployment and project (with `DailyCheck.site` and any access notes read-only), **daily-check state for each of my vehicles** (done / due, one tap in), pending transfers/handoffs waiting on *me*, my open requests, and — post-P3 — today's clock state. One primary action, contextual: before check → "Start daily check"; after → "You're set."
**Primitive.** Pure read-side assembly over `Rig`/`RigVehicle`/`DailyCheck`/`TransferRequest`/`DeploymentHandoff`/`DeploymentRequest` — every query already exists somewhere in the app; zero schema.
**Effort.** 1–2 weeks. Natural moment: W0-11 already splits the my-rig monolith and introduces SWR; build Today as its first consumer.
**Falsifier.** Session analytics: if operators keep deep-linking past Today into the old flows, the view is decoration — redesign or admit the menu was fine.

#### NS-11 · One-tap end-of-day — a design constraint on P3-TIME, not a feature *(Loop 1 / close-out)*
Clock-out **is** the close-out; design it as the day's single closing motion: confirm hours, surface the unfinished (check missing? transfer pending? item flagged?) as *optional* one-tap fixes, never blockers, then "Day closed — you logged 9.5 h." The PRD's clock-out already exists as scope; this bet is the instruction that it be built as the *ritual*, not a button lost in a tab.
**Effort.** ~0 marginal if designed in; a week of retrofit if bolted on later. Write it into the P3-TIME spec now.

#### N-5 · The week board *(Loop 2 / plan + watch; the manager's product)*
As §2.2: read-only timeline over existing dates; deployments × days; maintenance-due, rental windows, `neededBy`, missed-check flags, availability (post-P3) as layers. Click-through to the existing pages — which is exactly what FND-48's URL-param filters unlock; sequence after that lands.
**Not** a scheduling engine, no drag-to-assign in v1 (PRD §14 stays respected).
**Effort.** 2–4 weeks honest (a calendar surface always costs more than it looks).
**Falsifier.** If the ops lead's Monday still starts in a spreadsheet after a month, the board missed; interview and iterate or stop.

#### NS-13 · Incident & safety log *(Loop 1 / something-went-wrong; small, and the one legal-shaped gap)*
Remote crews, heavy equipment, solo days — and the app has no noun for "someone got hurt" (verified: nothing in schema or routes). A minimal `Incident`: type (INJURY / NEAR_MISS / PROPERTY / OTHER), narrative, photos (the `Photo` pattern already does GPS + context), parties, timestamps, admin ack; append-only like the house's other logs. This is liability/insurance posture, not analytics — dead-simple on purpose, used rarely by design.
**Effort.** 1–2 weeks. **Do not grow it** into workflow (OSHA exports etc.) without pull from whoever holds the insurance relationship — ask them first; their answer also prices it.

#### N-7 · Job costing — the quote engine *(Loop 2 / close-the-week; real money, patient timing)*
After a season of P3-TIME actuals, AHITS holds what nothing else in the company holds: real cost-per-deployment-day (labor via rate snapshots + expenses + N-2's TCO share + consumable draw). v1 of this is **one number on the Project page** — "this project is costing $X/sampling-day (n=23 days)" — days of work, riding MID-3's profitability join. The estimator ("quote a 400-sample cropland job in Kansas") is a real 3–6 week bet *only after* the actuals are believed. Squarely within operations, absent from v2, and the most credible new *business-value* bet in this document — but it eats data that doesn't exist yet, so it cannot jump ahead of the loop that generates the data.

#### NS-14 · Photo timeline *(both loops / disputes + training; cheap, do when adjacent)*
Photos are already captured everywhere (`Photo`: five contexts, GPS, thumbnails — verified) and viewable only record-by-record. A filterable timeline per vehicle/unit/deployment (condition-over-time, dispute evidence, "what does a correctly-loaded trailer look like" for onboarding) is 3–5 days of read-side UI. Worth doing; never worth a quarter.

**Named and judged less important — found, weighed, declined.** (a) *Structured operator↔office status comms:* the Today view plus task-typed clock entries plus the bell **is** the structured status channel; building messaging invites the comparison to texting on texting's home turf — skip. (b) *Onboarding/offboarding:* onboarding is `P3-ONB-1` (planned) and NS-14 helps train; offboarding is a checklist view over existing primitives (suspend + force-logout exist on `User`, gear custody via `CheckLog`, HUB_RETURN links) — a few days *when churn actually bites*, not before. (c) *A morning route/navigation feature:* the maps app on the operator's phone is better at it; carry the address, link out, stop. (d) *Crew-to-crew visibility ("where's everyone else").* Cute, surveillance-adjacent, serves neither loop. No.

---

## 5. What we are considering TOO MUCH (Q2) — cuts and hard parks

The v2 catalogue, re-scored by the loop test. Parked here means: out of the active plan, no design work, revisit only on the named trigger. Full disposition table in §9.

- **X-1 / X-2 (field-ops OS, contractor network).** v2 already called them option-value-only, then spent two sections on them. v3 spends one line: *keep the nullable region column, keep the IP, stop writing about them.* A team sized for one deployment should not be maintaining prose about white-labeling.
- **MID-2 (predictive maintenance / parts-ahead-of-failure).** Parked hard. Prediction before the daily loop is proven is dashboards over noise (v2's own quality gate says so); the honest version was already "threshold rules," and the threshold rules that matter are *this quarter's* maintenance-due list — which the week board surfaces. Trigger to revisit: a full season of variance-checked checklist data *and* NS-7 showing anyone reads demand data.
- **N-3 (reliability signals from checklist exhaust).** Stays quality-gated as v2 had it, and demoted below the loops: run the cheap variance check in pilot month one (that part survives — it's days and it prices everything), build the nudge layer only if the data is alive *and* the week board exists to show the nudges on.
- **N-4 (dispatch ranking).** Parked. Ranking "who should go" before the manager can even *see* the week is backwards; N-5 first, then observe whether staffing actually happens through AHITS, then reconsider. (Its ingredients — `Availability`, `User.homeHubId`, hub addresses — all keep accruing regardless.)
- **NS-9 (wire `Shipment`).** Default flips to **delete** (`lib/shipments.ts` is dead code per FND-41). v2's falsifier — count real carrier events per month — hasn't been run and nobody has volunteered a number, which *is* the answer. Trigger to un-delete: a real month with >5 carrier shipments; the migration history keeps the model resurrectable.
- **NS-6 (farm-gate link).** Stays parked behind its interview, and the interview is not scheduled — landowner coordination lives in the PMs' phones until someone in ops asks for this by name.
- **NS-8 (generalized custody receipts).** Cut to the narrow W0-9 bug fix. The +2–4 days of component API was justified by a second receipt flow that §5's other cuts (NS-9 deleted, sample custody shelved) just removed. Generalize on the *second real consumer*, which is how components should be earned anyway.
- **N-2 (fleet P&L) — half kept, half parked.** The 2–3 days of TCO columns riding FND-26 stay (cheap, real). The 3–6 week recommendation surface (rent-vs-buy, retire) is parked until the columns and the one idle-rentals nudge demonstrably get *read*. The fleet ledger serves the manager's week; it does not get a quarter before the week itself has a surface.
- **MID-4 (multi-region).** Unchanged and correct in v2: the free nullable `region` column on new money models, nothing else, trigger = a second real operating region. (Re-verified this session: still no `organizationId` or tenant scoping anywhere in schema.)
- **The unified event spine.** v2's call stands: a triggered future decision, not a convention. No change; listed so nobody re-litigates.
- **The document itself.** v2 carried 17 active bets plus platform notes plus moonshot prose — for a team whose realistic budget is **one meaningful bet per quarter**. Breadth of *written ambition* is a real cost: it diffuses attention in planning, invites cherry-picking of fun bets over loop bets, and makes every quarterly conversation longer. v3's active surface is four items (§6). Everything else in this doc exists to stay parked.

**And the deepest over-scope, named honestly: v2 over-weighted the evidence leg of its own thesis.** "Self-evidencing operations" is one of three value legs, and the *cheapest* to test (NS-1 is a one-week read-side probe) — yet evidence thinking colored half of v2's bets. v3's stance: run the NS-1 probe once, let its reception size the entire evidence lane, and until then the lane gets passive capture (NS-4, GPS, EmailLog) and *nothing* that costs operator taps.

---

## 6. The short list — the four things that matter

One bet per quarter after Wave 0 and the contracted capstones; here is where the quarters go, and everything not on this list is consciously deferred. The first two are not new scope — they are *how the already-scheduled work gets built*. That is what "the scoping was wrong" turns out to mean: less new building than v2 implied, more intent inside the building already planned.

**1. The operator's day.** NS-10 Today view (1–2 weeks, riding W0-11) + NS-11 close-out designed into P3-TIME (~zero marginal) + the offline-trust floor (FND-14/FND-7/A6 — Wave 0 already owns it; MID-5's deliberate pre-sync follows *only after* A6 device data exists). This is the adoption product. It is deliberately small, because most of the operator's day already works — it needs a front door and a closing ritual, not a rebuild.

**2. The money loop.** P3-TIME exactly as the workplan orders (its gates — W0-10 attribution, FND-8 email, FND-7 dates — are this document's gates too), with MID-3's first slice, the **operator earnings view**, treated as part of the capstone's definition of done rather than a later maturation. Getting paid accurately, fast, and *visibly* is the retention engine; task-typed clock entries are the exception telemetry (§3); rate snapshots stay immutable; the region column rides along. One bad paycheck outweighs a season of dashboards — the workplan's zero-exception gates stand.

**3. The manager's week.** N-5 week board (2–4 weeks) after FND-48's URL-param foundation, absorbing the surfaces v2 would have scattered (N-4's question, N-2's nudges, NS-7's demand view all become board annotations *if* they earn it). One surface that makes Monday morning start in AHITS.

**4. The evidence probe — one week, then obey the answer.** NS-1's Field-Operations Evidence Bundle, unchanged from v2 (still the cheapest probe in either document), put in front of whoever faces auditors and the sample-system owners. If they want it, the evidence lane earns a future quarter (formats, feeds, calibration NS-3 — after asking the science side whether they already track it). If they shrug, the lane collapses to internal QA and passive capture, permanently, and this document gets shorter again.

Riding along at near-zero cost, unchanged from v2's genuinely-free bucket: NS-5 odometer sanity (hours, next time the check form is open), NS-4 weather stamps (3–5 days post-MAP, zero taps), never-discard-exhaust, append-only logs, N-2's TCO columns inside FND-26, NS-14 photo timeline when someone has a spare week.

---

## 7. Primary concerns (Q3)

**7.1 Adoption is the whole game, and it is decided in the pilot's first two weeks.** Every ledger, every analytics ambition, every moonshot rests on operators entering true data voluntarily. Habits set fast: an operator whose first week includes one lost daily check or one confusing sync failure reverts to texting and screenshots, and no dashboard wins them back. Treat the pilot fortnight as a *launch*, not a test: someone watches every operator's first close-out, and the time-to-complete instrumentation (§3) is live from day one.

**7.2 Who is AHITS for first? Position: the operator.** The manager is captive — there are one or two of them, they are paid to use admin tools, and they will tolerate friction. Operators are 20–90 semi-voluntary contractors with high churn and a group text that already works. And *every row in every ledger originates on an operator's phone*: the manager's board, the fleet P&L, the evidence bundle are all downstream of operator capture. If operators don't feed it, the command center displays nothing. So: **operator-first for capture, manager-first for consumption — and when the two conflict on the same screen or the same tap, the operator wins.** (This resolves concretely: the friction budget binds operator surfaces hard; manager surfaces may be dense and imperfect for another year.)

**7.3 Offline is the trust bar, not a feature.** A field tool that loses one entry is a tool you screenshot "just in case," and a tool you screenshot is a tool you've stopped trusting. FND-14's two poisoning modes (reconnect, >24h JWT) are field-data loss; FND-7 mis-dates evening work; A6 has never run on hardware. Wave 0 owns all three — this concern exists to say the *order matters to the vision, not just the plan*: offline integrity precedes every operator-facing ambition in §6, and MID-5 stays gated on A6 data as v2 had it.

**7.4 Scope sprawl is a compounding tax on a one-bet-per-quarter team.** Every shipped feature is forever: its bugs, its migrations, its place in the offline matrix, its row in A6. The parked list (§5) is therefore a *deliverable*, not a leftovers pile — v3's most important output may be the permission it grants to not build twelve of v2's bets this year. Kill criteria are attached to what does ship (falsifiers, above) so features can also *exit*.

**7.5 Data quality remains the silent dependency** (carried whole from v2 §2): a pencil-whipped checklist is a compliance artifact, not a dataset. The variance check runs in pilot month one; every analytics ambition stays gated on it; and §3's time-to-complete metric now gives it a leading indicator instead of a post-season autopsy.

**7.6 Payroll trust is concentrated risk.** The money loop is the adoption engine *and* the fastest way to destroy adoption if it's wrong. FND-7/FND-14/W0-10 are exactly the bugs that produce a wrong paycheck. No exceptions to those gates, ever — restated here so the vision document and the workplan agree out loud.

---

## 8. Streamlined, usable, valuable (Q4)

**Value, defined in four numbers** — every active bet must claim at least one, with a believable mechanism:

1. **Operator minutes per day.** Today-view + close-out vs. the morning text thread and the evening "did you do your check?" chase. Target: the app costs an operator <5 minutes/day and visibly saves more.
2. **Manager hours per week.** The board vs. the spreadsheet + eleven tabs + phone tag. Measured by asking the actual ops lead monthly — n=1 or 2, so a conversation beats a metric.
3. **Money made visible or protected.** Idle-rental dollars surfaced (N-2 columns), disputes settled by photo/weather/odometer corroboration, eventually N-7's cost-per-day and quotes. This is the leg that talks to leadership.
4. **Trust, operationalized as zero defects in the money-and-data path.** No lost entries, no wrong paychecks, no phantom stock. Trust is the multiplier on the other three; it is why Wave 0 outranks everything here.

**Usable, defined as the two loops closing without leaving the surface built for them.** Operator: wake → Today → check → work → close-out → paid, on a phone, offline-tolerant, under the friction budget. Manager: Monday → board → exceptions via bell → Friday approve-and-pay. A feature that belongs to neither loop needs an extraordinary argument (NS-1's is that it's one week and prices an entire value leg; NS-13's is liability).

**Streamlined, defined as this document's own shape:** four active things (§6), a friction budget with teeth (§3), a parked list with named triggers (§5, §9), falsifiers on everything active, and a standing rule that the *next* version of this document should again be shorter — scope earns its way in through a loop, or it stays in the appendix.

---

## 9. Appendix — disposition of every v2 bet (nothing lost)

| v2 ID | v2 idea (short) | v3 disposition | Where / trigger |
|---|---|---|---|
| NS-1 | Field-ops evidence bundle | **Kept — elevated to short-list item 4** | §6.4; one-week probe, reception sizes the evidence lane |
| NS-2 | Bag-draw campaign gauge | Kept, minor | Post-FND-2, 2–4 days; retire if the sample system exposes its count |
| NS-3 | Calibration as maintenance kind | Kept, conditional | Inside the evidence lane; **ask the science side first** (their "we track it" collapses it to a tag) |
| NS-4 | Weather-stamp deployment days | **Kept — model passive capture** | 3–5 days post-MAP; zero operator taps (§3.1) |
| NS-5 | Odometer sanity at entry | Kept — do at next form touch | Hours; passes the friction budget with room to spare |
| NS-6 | Farm-gate StatusLink | **Parked** | Trigger: ops asks by name (the interview v2 required never happened) |
| NS-7 | Demand-exhaust admin view | Kept, small | 3–5 days; candidate week-board annotation, not a page |
| NS-8 | Generalized custody receipts | **Cut to narrow bug fix** | Generalize on the second real consumer, which no longer exists on the roadmap |
| NS-9 | Wire `Shipment` for equipment | **Parked, default = delete** (FND-41) | Trigger: a real month with >5 carrier shipments |
| N-2 | Fleet P&L | **Split**: TCO columns kept (ride FND-26); recommendation surface parked | Trigger: the columns + idle-rentals nudge demonstrably get read |
| N-3 | Checklist reliability signals | Parked behind quality gate (variance check itself: kept, pilot month 1) | Trigger: live data + week board to surface nudges on |
| N-4 | Dispatch ranking | **Parked** | Trigger: N-5 shipped *and* staffing observed to flow through AHITS |
| MID-2 | Predictive maintenance + parts | **Parked hard** | Trigger: season of gated data + NS-7 demonstrably read |
| MID-3 | Operator economy | **Kept — core of short-list item 2**; earnings view pulled into P3-TIME's definition of done | §6.2 |
| MID-4 | Multi-region | Unchanged: free `region` column only | Trigger: second real operating region (re-verified: no tenant scoping in schema) |
| MID-5 | Deliberate offline day-pack | Kept, gated on A6 device data | Serves Loop 1; sequenced after the trust floor (§7.3) |
| X-1 | Field-ops OS | **Shelved to one line** | Keep the column, keep the IP, stop writing prose |
| X-2 | Contractor network | **Shelved to one line** | Meaningless before X-1-scale demand; MID-3's schema hygiene is the only live obligation |
| v2 §8 | Sample-territory shelf (v1 N-1, MID-1, X-3) | Unchanged, still shelved | Re-entry rule unchanged: product-owner decision + pull from the sample system's owners |

**New in v3:** NS-10 (Today view), NS-11 (close-out design constraint), NS-13 (incident log), NS-14 (photo timeline), N-5 (week board), N-7 (job costing). New-and-declined in the same breath (§4): structured comms, offboarding tooling, navigation, crew visibility.

**Verification notes from this session, for the record.** Confirmed against `prisma/schema.prisma` and the route tree: no `TimeEntry`/`OperatorRate`/`Invoice`/`Availability`/`Expense`/`TaskType` models yet; no `organizationId`; no `MaintenanceTask.kind`; no GPS columns on `DailyCheck` yet; no incident/safety model; no calendar surface; operator dashboard is a static menu; `EmailLog` **is** runtime-wired (upgrading v2's hedge). Two discrepancies flagged rather than resolved: the workplan's FND-46 says `photos` has zero indexes, but the current schema declares six `@@index` on `Photo` — either fixed since the audit or schema/migration drift; check the migrations before relying on either claim. And the PRD's `Settings.milesReimbursementRate` names a `Settings` model that does not exist in schema (the only settings-shaped model is `NotificationConfig`) — P3-TIME should decide its real home before the migration, not inherit a phantom.

---

_The through-line, restated for v3: v1 claimed the sample and was wrong about **whose** record this is. v2 claimed the operation and was right — but organized the claim around ledgers, as if data assets assemble themselves. They don't. They are assembled twice a day by a contractor with cold hands and one bar of signal, and once a week by an ops lead with eleven tabs open. Build those two people's loops — the day and the week — under a friction budget that makes evidence a byproduct of work instead of a tax on it, get the money loop defect-free, and run the one-week probe that prices the evidence dream. Four things. Everything else in this document is parked on purpose, with its trigger written down — which is not a smaller ambition than v2's. It is the same ambition, minus the parts that were never going to survive contact with 6:40 a.m._

_End of north-star v3._
