# AHITS — State of the App Entering Phase 3
### An independent, code-grounded assessment · 2026-07-10

*Prepared from a full read of the planning corpus (Master Roadmap, Executive Summary, North Star v3, Phase-3 workplans, latest handoff, field-feedback fix plan), a live walkthrough of the staging app as both Admin and all three operator identities, and a six-seat adversarial audit of the codebase at `development` HEAD (post-PR-4a). Every claim below is grounded in a file:line citation or a live observation, not in the documentation's own self-report. Where the documentation and the code disagree, the code wins and the disagreement is named.*

> **This assessment builds on the existing corpus; it does not replace it.** It is a status snapshot that confirms, corrects, or extends the claims already made in the Master Roadmap, Executive Summary, and North Star — carrying their IDs (`FND-#`, `W0-#`, `NS-#`, `CONV-#`) rather than re-deriving them. The plan of record continues to live in those documents plus the companion `AHITS_PHASE3_WORKPLAN_2026-07-10.md`.

---

## 0. The one-paragraph verdict

AHITS is in materially better shape than a first read of its own paperwork suggests, and the hard architecture — production-grade auth, a tokenized external-party portal, a genuinely serious offline engine, a clean migration toolchain, and the FND-23 database invariants — is done and holds up under adversarial probing. Phases 1–2 are functionally complete and a large Wave-0 hardening tranche has landed and verifies in source. **The app is not, however, pilot-ready today**, and the gap is not where the roadmap points. It is in three places the documentation under-weights: (1) a cluster of **data-integrity defects in the transfer / end-of-deployment / hold-claim paths** that can silently lose inventory or corrupt the hub reserve — the exact "phantom stock" class the North Star calls fatal to trust; (2) **the enforcement layer around the irreversible W0-10 database drop is convention, not machinery** — one mis-merge of a patch sitting in the repo root reaches production through the standing promote PR; and (3) **the operator's day still has no front door and no closing ritual**, while the felt friction the field reported (jitter, an awkward scanner, invisible flows) traces to real structural causes in the code. None of this is a crisis; all of it is fixable, most of it cheaply. What follows is the honest map.

---

## 1. What is genuinely solid (verified, not asserted)

These were probed adversarially and held. They are the foundation the rest of Phase 3 can build on without re-litigation:

**The offline engine.** The durable IndexedDB queue (`useOfflineQueue.ts`) has body-hash-bound idempotency keys, a double-tap dedupe window plus in-flight coalescing, placeholder-id remap for dependent offline writes, dependent-chain quarantine (a failed create fails its dependents rather than orphaning them), storage-health probes surfaced as banners, and brutally honest copy when storage fails ("your change was NOT recorded"). The 401-parking that protects a lapsed-JWT operator's un-synced work is in place. The daily-check submit path is the gold standard — queue + idempotency + explicit offline warning + pending-sync count. This is the best-built part of the app.

**Auth and session.** PIN + JWT with `tokenVersion` revocation, `mustChangePin`, DB-revalidated sessions per request (suspend / demote / force-logout / PIN-reset take effect immediately), atomic PIN-lockout, constant-time cron auth that fails closed when unconfigured, and a per-request nonce CSP with `strict-dynamic`. The 47-route hand-rolled auth preamble is a consolidation opportunity (§4), not a hole — the antagonist could not find an unauthenticated route outside the sanctioned public set.

**The tokenized external primitive (`StatusLink`).** 256-bit CSPRNG tokens, sha256-at-rest, a real state machine (ISSUED→VIEWED→ACTED→COMPLETED/EXPIRED/REVOKED), an audit trail, and IP rate limits on every public endpoint. This is the single most leveraged asset in the codebase — QR, invoicing, and every external "conversation" ride it — and it is well-built. (Two specific holes are named in §3; the fundamentals are sound.)

**The database invariants (FND-23).** The partial-unique indexes — one open PRIMARY per operator and per rig, one open RigVehicle per vehicle, one pending handoff per rig — are present, predicate-correct, and backstop the application-level races with clean P2002→409 translation. The antagonist could not double-allocate a unit or double-primary a rig on any active path.

**The alert pipeline's core.** `activeKey` upsert-dedupe plus an atomic `notifiedAt` claim-flip make overlapping cron runs storm-proof; per-(item,hub) low-stock raise/clear is symmetric.

**Verified-landed since the roadmap was written (the good-direction staleness):** the `my-rig → my-deployment` rename and permanent redirect are live (I confirmed the redirect on staging); `EMAIL_SANDBOX=true` is confirmed live on staging (Settings shows "1 skipped (sandbox)"); FND-21 idempotency on the requests POST is closed; the W0-10 **attribution/payroll readers** are migrated onto `deployment_assignments` through PR-4a (with two knowing exceptions retired by the held 4b′, below); request-IDs are live and spoof-proof in `proxy.ts`.

---

## 2. The most important thing the roadmap gets wrong: the invoicing gate is already open

The Master Roadmap (§1.2, dated 07-03) sequences the entire money loop behind W0-10 "legacy-column retirement," and treats that retirement as blocking. **That is now stale in the good direction.** With PR-4a live on staging, the **attribution/payroll readers** are on `deployment_assignments` — which is what the money loop actually reads for who-worked-what — so Time/Invoicing can resolve attribution off the successor table today. Two knowing exceptions remain until the held 4b′ lands: one legacy reader survives on the vehicle-add path (`deployments/[id]/vehicles/route.ts:107` still reads `rig.operatorId`), the legacy writers are still dual-writing (`deployments/route.ts:188`, `deployment-handoffs.ts:42`, `deployments/[id]/operators/route.ts`), and `Rig.operatorId` is still NOT NULL (`schema.prisma:255`); 4b′ retires all three and the irreversible `DROP` (4c) is therefore gated on 4b′, not independently electable. The point that matters for planning stands: **the money loop is not gated on the drop.** The long-pole capstone can begin its design and migration work in parallel with the Wave-A/B fixes and land its attribution on the successor table, rather than waiting behind a database drop that carries real risk and no urgency. (There is a false comment at `lib/deployment-auth.ts:9-10` claiming the columns "were dropped in PR-4" — they were not; it's on the stale-comment cleanup list.) The remaining Phase-0 work is not the retirement — it is Batch 6b (the freshness substrate), the last shard of FND-6, error tracking, and the A6 device pass.

---

## 3. What is actually broken — the defect ledger

The six-seat audit surfaced far more than the three known live bugs. Grouped by blast radius. Every item is code-traced (CONFIRMED) unless marked PLAUSIBLE.

### 3.1 Data-integrity — the trust-critical tier (fix before the money loop multiplies these paths)

The North Star names "zero defects in the money-and-data path" as the multiplier on everything else, and phantom stock as the inventory equivalent of a wrong paycheck. This cluster is exactly that, and it is larger than the field feedback captured:

- **The cancel-vs-fulfill hold race actively corrupts the hub reserve** (`deployment-requests.ts:613-621` and `827-847`). Two independent seats confirmed it. The reserve-release runs before the guarded status flip and returns `STATE_MISMATCH` *without throwing*, so the transaction commits the decrement anyway; and `claimHeldStock` doesn't re-check `releasedAt` under its row lock. A hub-staff cancel racing a fulfill, or the 72h TTL cron racing a checkout, drops `reservedQty` below the outstanding holds → phantom availability → a *different* operator's later checkout 500s with `HOLD_INVARIANT_BREACH`. This is the documented "72h race" but worse: it corrupts, it doesn't just surprise.
- **Ended-deployment transfer decline and cancel both leak inventory.** Declining an end-of-deployment consumable transfer never credits the drawn stock back (`transfers/[id]/decline/route.ts:70-104`) — the goods vanish from the ledger and the drift cron won't flag it because both totals drop consistently. Cancelling one is worse (`transfers/[id]/route.ts:27-61`): it strands the kit items open on an ended rig forever, units stuck CHECKED_OUT, unreachable by any close path.
- **Ended-rig kit items can be transferred repeatedly** (`transfers/[id]/accept/route.ts:100-115`). The accept guard's ended-rig branch matches *any* kit item of that rig, including already-removed ones — so an item dispositioned at end-of-deployment plus a stale pending transfer can land the same item in two active kits, with a serialized unit logged out twice.
- **Removing a vehicle mid-deployment with "Transfer" bricks the transfer** (`deployments/[id]/vehicles/route.ts:160-186`): the RigVehicle row is closed *before* the transfer is created, so the recipient's accept always 409s — a permanent dead PENDING row, the vehicle still attributed to the old operator.
- **The hub "Dismiss" / IN_TRANSIT strand** (field-reported, confirmed and deepened). Dismiss flips only the link state, never the unit; and separately, *no code path anywhere ever writes `IN_TRANSIT`*, so the hub "Received" confirmation is a no-op that changes no ledger state, and a hub reporting a discrepancy does not quarantine the unit — it stays AVAILABLE and re-deployable while physically missing. The whole hub-receipt custody loop is currently theater.
- **End-of-deployment "return to hub, condition: damaged" returns the unit AVAILABLE anyway** (`end/route.ts:118-152`) — the `returnCondition` is written to the log but ignored on the unit flip. Broken gear silently re-enters the pool.
- **Non-atomic quantity decrements** in transfer accept (`:112-114, 156-184`) and a blind total-increment in bulk return (`items/route.ts:374-379`) that can self-inflict the very drift the cron then reports.

None of these are exotic; they are the everyday end-of-day and hub-return motions. The SRE seat produced the exact invariant SQL to detect all of them, and the recommendation is to wire those queries into the existing drift cron so they raise an *alert* instead of a `console.error` nobody reads.

### 3.2 Offline / release-safety — the pilot-protection tier

- **The offline queue's 401-parking never actually triggers** (`proxy.ts:129-131, 188-190`). The middleware redirects expired-session `/api/*` calls to `/login` (a 307) instead of returning a 401 — so the queue, which parks only on a literal 401, never sees one. The exact scenario the parking was built for (a 24h JWT lapsing while an operator is offline all weekend) instead burns the retry budget and marks the field data *failed*. This is a one-line fix (`return NextResponse.json({error:'Unauthorized'},{status:401})` for API paths) and it directly protects the pilot's Monday-morning sync. **This is the single highest-value bug in the report.**
- **The held W0-10 drop patches are guarded only by human memory.** `development` auto-promotes to production; the CI migration-safety gate is *bypassed* by the acknowledged-DROP comment the patch carries; direct pushes and label-triggered staging deploys skip the gate entirely; and the two irreversible patches sit loose in the repo root next to patches meant to be landed casually. One misread in a "land the remaining patches" session reaches prod through the standing promote PR. Cheapest mitigations: quarantine the held patches into a `held/` directory, and add a ~6-line CI rule that hard-fails a production-targeting PR whose migration drops the three columns unless it carries an explicit approval label.
- **PR preview deploys silently disable the email sandbox** (`pr-staging-deploy.yml:84-90` omits `EMAIL_SANDBOX=true`, so the Makefile default `false` bakes in) — staging can email real hubs and operators until the next `development` push. One-line fix.
- **The break-glass recovery script fails in its own disaster** (`prisma/recovery/W0-10_…sql`): its `SET NOT NULL` aborts if any rig was created-and-ended between the drop and the recovery — the longer the incident runs, the more certain the recovery fails. One extra fallback statement fixes it. And backups/PITR — the load-bearing item of the drop's go/no-go gate — exist only as unchecked checklist boxes across four documents, with no restore drill ever run.
- **The migration-safety script is narrower than its reputation:** it misses `ALTER COLUMN … TYPE`, `DROP INDEX`, `DROP CONSTRAINT`, `DELETE FROM` (which has in-tree precedent), and multi-line `ADD COLUMN … NOT NULL`. And the FND-23 partial-unique invariants are absent from the CI test database (built with `prisma db push`, which can't express partial indexes), so every 409-on-conflict branch ships untested.

### 3.3 Dead-end records — the "everything speaks to everything" tier

The fourth original goal — no record terminates where no surface reads it — is violated in several places, and the flagship one is startling:

- **The daily check is write-only for managers.** No admin surface reads any submitted check — not the checklist answers, not the odometer, not the photos. Admin gets a *count* and an alert string. The app's flagship compliance-and-evidence record has no reader. A single admin daily-check viewer is the cheapest highest-leverage stitch in the codebase — it simultaneously unblocks the failed-check loop, the missed-check loop, and the photo timeline.
- **`RequestLineEvent` — the entire hub Confirm/Edit/Deny audit trail — is written and read by nothing.** The demand-signal richness the roadmap wants for CONV-9 is literally unreadable.
- **Resolved transfers and handoffs are unreadable** — every surface fetches `?status=PENDING` only; the history exists solely as one-shot notifications.
- **`StatusLink` EXPIRED is never persisted** (derived at read-time, no cron sweep) so pending counts overstate forever and nobody is ever told a hub never acted; **REVOKED links and their discrepancy notes vanish** from the only view that showed them.
- **Alerts that linger forever:** PIN_LOCKED, MATERIAL_REQUEST, and EQUIPMENT_NOT_RETURNED have no lifecycle event that auto-resolves them; the drift-detection cron dead-ends into `console.error`; EmailLog FAILED rows are visible only to an admin who goes looking (the alert patch is unlanded).

### 3.4 The known live bugs (all confirmed against code, and re-confirmed live)

The dashboard "—" bug is real and I watched it happen as Operator 1: `/api/dashboard` is `requireAdmin` while operators may view the page read-only, and the page has no `res.ok` guard, so every KPI silently renders a dash. It is the only admin-gated read behind an operator-viewable page (the siblings are all `requireAuth`), and the counts are non-sensitive — the fix is exactly the one-route change the field plan prescribes. The other field-reported items — the invisible fulfilled-reservation pickup thread, the absence of any operator field-fix log, the admin-as-operator gaps, the Hubs discrepancy dead-end — are all confirmed at code level and carried into the workplan.

---

## 4. Consistency, tidiness, and dead code

The user's requirement — "tidy, sensible, functional, efficient, without losing an iota of functionality" — is well-served by a specific, bounded cleanup. Nothing here is speculative; each item was verified to have zero importers or to be byte-identical duplication.

**Pattern drift worth consolidating** (not cosmetic — each is a bug-class incubator): the API response envelope has three success dialects across 84 routes (`{data}`, bare, domain-keyed) plus ~34 `{ok}` acks, with the blessed `ok()/fail()` helper used by only 2 routes; ~75 hand-rolled auth preambles vs a `withAuth` wrapper used by 2; the same unguarded `fetch().then(r => r.json())` pattern that causes the dashboard "—" bug recurs across the loaders (a shared `fetchJson` fixes the *class*, not the instance); ~30 raw `toLocaleDateString` date sites that the already-written `batch6a` patch would unify; and 2–3 near-duplicate accept/decline "respond" dialogs. The three page monoliths (`my-deployment` 2,025 lines, `admin/deployments` 1,521, `admin/inventory` 1,355) are the root of the "jittery" re-render complaint and are already tracked as Batch 6b.

**Safe to delete** (verified zero importers, zero functionality loss): seven dead exports in `lib/deployment-assignments.ts` (including the ironic `getActivePrimary`, which the roadmap celebrated as "finally load-bearing" but whose exact export still has zero callers) — with one careful exclusion, `getDeploymentRosters`, which has no *external* importer but is called internally by the live `getDeploymentRoster` and must be kept; the `GET /api/inventory/stock` route (its own comment about being used by checkout dialogs is false); the `GET /api/checkout` handler (keep the POST 410 tombstone for stale PWA clients); and two npm packages (`@emotion/cache`, `@emotion/server`) plus a candidate `@mui/x-date-pickers` (only a `LocalizationProvider` wrapper, no picker rendered anywhere).

**Keep dormant, on purpose** (reserved behind a named trigger — deleting loses real capability): the `Shipment` model (NS-9 Shippo, though the dead `lib/shipments.ts` *should* be deleted per the roadmap's own resolution), `StatusLinkType.INVOICE` (the transition table already defines it; P3-TIME consumes it), `User.hourlyRate` (actively written through admin CRUD; P3-TIME's fallback rate), and the `users/bulk` and `release-hold` routes (functional, audited capabilities with no UI yet).

**Documentation hygiene:** 37 markdown files in the repo root are byte-identical duplicates of copies already in `docs/archive/`; the North Star v1/v2 are superseded by v3; `docs/INDEX.md` is frozen at 07-03 and still lists the v1 North Star as current. A concrete archive/delete list exists. Ten `.patch` files verified as landed can be archived; the two held W0-10 patches and three genuinely-pending patches stay.

**One schema decision to make:** `EquipmentStatus.IN_TRANSIT` has readers but no writer. Given the decision to build crew visibility and check-in route history (§6), the right move is to *add the writer* at hub-return time (making the receive/dismiss custody loop real), not to drop the enum.

---

## 5. Cross-platform, mobile, and offline readiness

The PWA foundation is real: Serwist service worker, a NetworkFirst "field-reads" cache, an `~offline` fallback page, and the durable queue. But three gaps matter for the pilot. First, the field-reads cache **omits transfers, handoffs, notifications, hubs, and deployment-requests** — so an operator offline mid-shift can lose the transfer/handoff views and see blank roster dropdowns while deployments still render; extending the matcher is cheap. Second, the offline durability is *detect-and-warn*, not prevention — iOS eviction of queued checks and photos is the pilot's single biggest field risk and is exactly what the A6 device pass exists to characterize. Third, the admin shell mounts **no offline banner at all**, so an operator browsing the read-only admin pages offline (or an admin on a phone) gets bare spinners.

On mobile ergonomics, the field's "jittery/clunky" complaint has concrete causes I confirmed both in code and live at 390px: the scanner is a photo-capture-then-decode loop with no live viewfinder (the most-repeated hardware gesture in the app); the `my-deployment` monolith re-renders wholesale on every state change; inventory search fetches on every keystroke with no debounce; 13 admin tables have no mobile card fallback and two detail drawers (560px, 540px) clip on a phone; and the Team page renders its project filter twice (a live rendering bug I saw directly). The honest matrix: the middle of the operator's day works well and is offline-tolerant; the two ends of the day don't exist; and the felt friction is real, structural, and mostly addressable in a bounded "Performance & Feel" pass paired with the Batch 6b substrate.

---

## 6. What the app could be — under-considered and worth naming

Holding the codebase against its own ambition, four things are under-weighted relative to their leverage:

**The operator's day still has no shape.** This is the North Star's own headline and it remains unbuilt: the dashboard is a static four-card menu that doesn't know what day it is, whether your check is done, or what's waiting on you. The "Today" front door and the one-tap close-out ritual are not new scope — they are *how* the already-planned work should be built — and they are the difference between an adopted operator and one who reverts to texting.

**The evidence the app already captures is invisible.** GPS rides the daily check, photos ride five contexts, weather can be stamped passively — yet none of it assembles into anything a manager or an auditor can read. The daily-check viewer (§3.3), the photo timeline, and the one-week evidence bundle probe are all read-side work over data that already exists. This is the cheapest way to find out whether the "self-evidencing operations" thesis is real before betting a quarter on it.

**The revenue instruments are invisible to the system of record.** The Giddings and Wintex mounted collection units — the equipment that actually generates sampling revenue — have no representation in the model at all. The executive summary calls AHITS "the system of record for the instruments"; this is a gap in its own thesis. It deserves a design decision (reuse a non-motorized vehicle subtype vs. a new asset class) before it drifts, and the combined "check the rig, then check the collection unit" flow has to be one guided sequence or operators will skip one.

**The crew could coordinate through the app instead of around it.** Per your decision, crew visibility (last-known position, for swapping gear and requesting help) and check-in route history (where a rig has *been*, assembled from the GPS its daily checks already carry — never live tracking) are worth building — and both ride the attestation data the Map capstone already lands, at zero new operator taps. Designed this way they honor the friction budget and the standing "no real-time tracking" line while giving the field a real coordination tool.

---

## 7. Bottom line entering Phase 3

The strategy in the corpus is unusually honest and the tactical engineering is genuinely good. The corrections this assessment makes are three: **the money loop is un-gated now** (build it in parallel, don't wait on the drop); **the real pre-pilot risk is the data-integrity cluster and the release-safety machinery, not the feature backlog** (a quiet inventory leak or a mis-merged drop would do more damage to pilot trust than any missing feature); and **the operator's day needs its front door and closing ritual before the pilot, because adoption is decided in the first two weeks and the app currently competes with a group text it doesn't yet beat.** Finish the integrity fixes and the A6 pass, take the empty production current now while it's a one-hour no-op, give the operator a "Today," and let the money loop proceed on the base that's already clean enough to carry it. The detailed, sequenced plan for all of this is the companion document, `AHITS_PHASE3_WORKPLAN_2026-07-10.md`.
