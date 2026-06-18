# AHITS PRD v2.1 — Addendum

**Folds three decided concept areas into the product spec and pipeline.**
Prepared 2026-06-17 · merge target: `AHITS_PRD_v2.md` · companion: `AHITS_INDEPENDENT_ASSESSMENT_AND_ROADMAP.md`

This addendum specifies three areas Max asked to formalize: (A) **equipment lifecycle & maintenance states**, (B) **account management**, and (C) **Kit / Rig / Deployment terminology** and its model implications. Each section ends with the **data-model deltas**, **API/UI deltas**, and **pipeline placement** so it can be picked up directly. Decisions already made are marked **[DECIDED]**; items still worth a quick confirmation are marked **[CONFIRM]**.

The throughline: A, B, and C are really one model — *"who is responsible for which equipment, where is it, and what state is it in."* C gives us the nouns, A gives us the state machine, B gives us the controls over the people. Spec'ing them together avoids three half-aligned implementations.

---

## A. Equipment lifecycle & maintenance states

### A.1 Canonical lifecycle

Every serialized unit (and every vehicle) is always in exactly one **status**, and every *change* of status is produced by a named **event**. Today the code has a thin version of this (`AVAILABLE / CHECKED_OUT / IN_MAINTENANCE / RETIRED`) with two divergent "needs maintenance" paths (assessment item **C5 / Punch #6**). This section makes the model comprehensive and collapses those two paths into one.

**Statuses (unchanged set, clarified meaning):**

| Status | Meaning |
|---|---|
| `AVAILABLE` | At a hub, not in any rig, ready to deploy. |
| `CHECKED_OUT` | Assigned to a rig / in an operator's hands as part of a deployment. |
| `IN_MAINTENANCE` | Inoperable or under repair, anywhere in the repair flow (see A.3). Not deployable. |
| `RETIRED` | Written off / out of service permanently (soft-deleted, retained for history). |

**The breakdown event.** When a unit fails, the operator files an **inoperable report** (the existing damage-report flow). This always produces: unit → `IN_MAINTENANCE`, a `MaintenanceTask`, an `Alert` to admin, and (Wave 2C) optional damage photo(s). Critically, **both** the quick per-item "needs maintenance" return *and* the rich disposition path now route through this one event — resolving the C5/Punch #6 divergence. After the report, the operator (or admin) chooses a **resolution path** (A.2).

### A.2 The three resolution paths [DECIDED]

```
                         ┌─────────────────────────────────────────────┐
   Inoperable report ──▶ │  Choose resolution path                     │
   (unit IN_MAINTENANCE) └───────┬───────────────┬───────────────┬─────┘
                                 │               │               │
                          (A) Fix in-field  (B) Fix at hub   (C) Fix at shop
                                 │               │               │
                       lightweight fix log   ship now  ──┐   deliver ──┐
                                 │            carry at     │   ship   ──┤
                          unit ▶ prior        end-of-      │            │
                          status (rejoins     deployment   ▼            ▼
                          rig)                 repair at hub      repair at shop
                                                  │                  │
                                                  └──────┬───────────┘
                                                         ▼
                                          Close repair → choose return
                                          destination [DECIDED: per-case]:
                                          • originating hub (→ AVAILABLE)
                                          • an active deployment (→ CHECKED_OUT)
                                          • a different hub (→ AVAILABLE there)
```

**Path A — Fixed in-field. [DECIDED: lightweight fix log]**
Operator repairs on site and marks the item operable. The app creates a **completed** `MaintenanceTask` of type `IN_FIELD_REPAIR` with a required short note ("what was done"), optional parts cost, optional photo — no full work-order friction. The unit returns to its **prior** status (`CHECKED_OUT`, still in the rig). Nothing ships; the deployment is unaffected. The completed record is what preserves failure-pattern and cost history.

**Path B — Cannot fix in-field; repair at hub.**
Unit stays `IN_MAINTENANCE`. Operator picks how it gets to the hub:
- **B1 — Ship to hub now.** Item leaves the rig mid-deployment; the inventory count for that rig drops accordingly. Location is recorded as a **note** (e.g., "In transit to Piedmont — UPS 1Z…"), per the **[DECIDED: simple status + note]** tracking choice — no formal transit enum.
- **B2 — Carry back at end of deployment.** Item stays physically with the rig (still associated to the deployment) but flagged `IN_MAINTENANCE`; the location note reads "With rig — hub repair at deployment end." It is excluded from "available to use" but counted as "with the operator."

At the hub, the repair is completed (`MaintenanceTask` type `HUB_REPAIR`, actual cost, optional receipt). On close, the **return destination is chosen per-case** (A.4).

**Path C — Cannot fix in-field; repair at shop.**
Unit stays `IN_MAINTENANCE`, tagged with the shop (`shopName` / `shopAddress`). Operator picks delivery method:
- **C1 — Deliver to shop** (operator drops it off).
- **C2 — Ship to shop** (location note records carrier/tracking).

Shop repair is completed (`MaintenanceTask` type `SHOP_REPAIR`, actual cost, receipt photo). **This is the trigger for the external-output layer**: a **work order / repair request** is generated for the shop (problem description, asset, photos, ship-to address, requested-by) and sent via the notifications dispatcher (ties to assessment §6.3). On close, **return destination chosen per-case** (A.4).

### A.3 Tracking granularity [DECIDED: simple status + note]

We are **not** modeling explicit transit states (no `IN_TRANSIT_TO_HUB`, `AT_SHOP`, etc.) for now. An item under repair is simply `IN_MAINTENANCE` plus:
- a structured **`resolutionPath`** (`IN_FIELD` / `HUB` / `SHOP`) so reporting and flow logic work,
- a free-text **`locationNote`** (where it physically is / tracking number),
- the **shop** fields when Path C.

> **Tradeoff flagged for later.** This is the simplest build, but it leaves "where exactly is it right now" as prose rather than a queryable state — a mild tension with the "zero equipment lost > 24h" goal. The `resolutionPath` enum is deliberately kept so we *can* upgrade to full transit tracking later without a migration of historical rows. Recommend revisiting after the first field season.

### A.4 Return destination on repair close [DECIDED: configurable per-case, no default]

Whoever closes a hub/shop repair **must explicitly select** where the item goes — **there is no default destination**, and the repair cannot be closed until a destination is chosen (a deliberate guard so items never silently re-enter inventory in the wrong place):
- **Originating hub** → `AVAILABLE` (re-deployable).
- **An active deployment** → `CHECKED_OUT` to that rig (e.g., the season is on and the crew needs it back).
- **A different hub** → `AVAILABLE` at the chosen hub.

UI: the destination picker opens with **no pre-selected option** and the "Close repair" action is disabled until one is chosen. This reuses the existing transfer/disposition machinery, so it should be built on the same `EntityPicker` + disposition vocabulary the consistency work introduces.

### A.5 Disposition vocabulary (expanded)

The glossary's "Disposition" (Return to Hub / Transfer / Mark Inoperable-Damaged) expands to the full set, used everywhere an item leaves a kit/rig:

`RETURN_TO_HUB` · `TRANSFER` (to another deployment/operator) · `MARK_INOPERABLE` → **resolution path** (A.2) · `RETIRE` (write-off). One shared enum, server and client (consistency item U4).

### A.6 Data-model deltas (A)

- `MaintenanceTask`: add `kind` enum (`IN_FIELD_REPAIR` / `HUB_REPAIR` / `SHOP_REPAIR` / `SCHEDULED`); add `resolutionPath` enum (`IN_FIELD` / `HUB` / `SHOP`); add `repairMethod` (`DELIVER` / `SHIP`, nullable); add `locationNote` (text); ensure `shopName` / `shopAddress` present; add `returnDestinationType` (`HUB` / `DEPLOYMENT` / `OTHER_HUB`, set on close) + `returnDestinationId`.
- `EquipmentStatus`: keep the four-value enum; **do not** add transit states (per A.3).
- `Disposition`: promote to a real Prisma enum (A.5).
- `Alert`/notifications: add a `WORK_ORDER` / shop-repair-requested type for the external output (Path C), routed through the Wave-3 dispatcher.
- Make `MaintenanceTask` the single home for *all* repair history (in-field included) so cost/pattern reporting is complete.

### A.7 Build status & pipeline placement (A)

- **Lifecycle unification + the three resolution paths + per-case return + expanded disposition → Wave 2B (Correctness).** Rationale: it *is* the fix for the divergent needs-maintenance paths (C5/#6) and completes the equipment-flow logic the rest of Wave 2 depends on. It should land right after the consumable-accounting fix in 2B.
- **Damage/repair photos → Wave 2C** (the photo block; in-field and shop records attach photos there).
- **Scheduled-maintenance recurrence loop + mileage trigger → Wave 3** (unchanged; these are the *time/odometer-driven* tasks, distinct from the *breakdown-driven* flow above).
- **Shop work-order output (Path C external email) → Wave 3 notifications dispatcher.**

---

## B. Account management

Today the Admin "Users" page is lean: invite, edit name/active, lock/unlock. Max wants materially more control. **[DECIDED: build all four capability sets.]** Several pieces have hard security dependencies on the assessment's S1 (invite tokens) and S3 (session revocation), so account management is the natural place to land those fixes — they're prerequisites, not separate work.

### B.1 Account lifecycle [DECIDED]

- **Reset PIN** (admin sets a new temporary PIN; operator forced to change on next login) and **clear lockout** (reset `failedPinAttempts`).
- **Suspend / reactivate.** Suspending must take effect **immediately** — i.e., revoke active sessions, not wait up to 24h for the JWT to expire. This **pulls forward a minimal version of assessment S3** (a server-side session/`isActive` re-check or a session table). Reactivation restores access without re-inviting.
- **Force-logout** a user / all devices.

### B.2 Roles & permissions [DECIDED: two roles only]

- **Two roles only — `OPERATOR` and `ADMIN`.** Promote / demote between them. Granular roles (`READONLY_ADMIN`, `MAINTENANCE_ADMIN`, etc.) are **explicitly out of scope** for now; revisit only if a concrete need appears. Keeping the role set binary also keeps the permission checks (and the `proxy` edge guard) simple.
- **Guardrails (must-have):** cannot demote, deactivate, or lock the **last active admin**; cannot deactivate **yourself** into a lockout; role changes are audit-logged (B.4).

### B.3 Invites & onboarding [DECIDED]

- **Resend / revoke** outstanding invites. Invites use **CSPRNG tokens with throttled public endpoints** — this is assessment **S1**, now a prerequisite of this feature, not a separate carryover.
- **Bulk import** operators (CSV: name, email, role, home hub, hourly rate) with a validation/preview step.
- **Per-operator defaults**: home hub, default vehicle(s), and **hourly rate** — the rate field also seeds Phase 3 invoicing, so add it now even though invoicing is later.

### B.4 Account activity log [DECIDED]

- An **audit trail** of account actions: who reset a PIN, who suspended/reactivated whom, role changes, invite send/revoke, last login, and (where available) trusted devices. Append-only; visible to admins.
- This dovetails with the **trusted-device model** (assessment S3): the device list and "last login" surface here.

### B.5 Data-model deltas (B)

- `User`: add `homeHubId` (FK), `hourlyRate` (Decimal, also Phase 3), `mustChangePin` (Bool); keep `isActive`, `failedPinAttempts`. Default-vehicle association via a `UserDefaultVehicle` join (or a JSON list if kept light).
- `Role`: extend the enum only if granular roles are adopted (B.2 CONFIRM).
- `InviteToken`: switch default to a **CSPRNG** token (S1); add `revokedAt`.
- New `Session` / `Device` model (minimal): `userId`, `tokenId`/`jti`, `createdAt`, `lastSeenAt`, `revokedAt`, `deviceLabel` — enough for suspend-revoke (B.1) and the device list (B.4). This is the pulled-forward subset of S3.
- New `AccountAuditLog`: `actorId`, `action`, `targetUserId`, `metadata` (JSON), `createdAt`.

### B.6 Pipeline placement (B)

- **New block: "Wave 2A.5 — Account Management & Auth."** Sits right after the Wave 2A security pass (which it depends on) and bundles: account lifecycle + suspend-with-revoke (minimal `Session` model), roles & permissions with guardrails, invites/bulk-onboard/defaults (consuming the S1 CSPRNG fix), and the audit log.
- **Full trusted-device management + richer audit surfacing → Wave 3** (completes S3).
- Reason to do it here rather than Wave 3: the security items it depends on (S1, partial S3) are already top-priority, and "suspend a contractor and actually log them out" is an operational must-have before a 90-person field season.

---

## C. Kit / Rig / Deployment — canonical terminology & model

**[DECIDED definitions]** (these resolve the long-standing "Rig vs. Deployment" open question — the answer is **they are three distinct, nested layers**, not one noun to collapse):

- **Kit** — a collection of *tools and gear* required to perform a project's sampling work (serialized equipment + consumables). **Does not include vehicles.**
- **Rig** — **Kit + vehicles** (truck, trailer, UTV, ATV, Christie drill, etc.). The complete set of an operator's gear and vehicles. *Rig = Kit ∪ Vehicles.*
- **Deployment** — **Operator(s) + the Rig** they're responsible for. **Spans 1 or more projects** over its lifespan and **may move between operators** (handoff). The unit of field accountability and the thing the operator's home screen represents.

Nesting: **Kit ⊂ Rig ⊂ Deployment.**

### C.1 What changes from today's model

The schema already has `Rig`, `Kit`, `KitItem`, `Deployment`, `RigOperator`, and `TransferRequest`, which maps cleanly onto the definitions with two real corrections:

1. **A Deployment spans multiple projects.** Today `Deployment.projectId` is a single FK. Change to **many-to-many** via a `DeploymentProject` join. A project can also involve multiple deployments (multiple crews), so M2M is correct both directions.
2. **A Deployment can change hands between operators.** Model operator assignment as a first-class, time-bounded history rather than a single `operatorId`. Introduce `DeploymentAssignment` (`deploymentId`, `operatorId`, `role` = `PRIMARY` | `SECONDARY`, `startAt`, `endAt`). The current `RigOperator` (secondary operators) folds into this as `role = SECONDARY`. "Handoff" = close the current PRIMARY assignment and open a new one — an auditable event, distinct from a per-item transfer.

**Handoff permissions [DECIDED: operator-self-service].** An **operator can initiate, confirm, and receive a handoff without admin involvement** — the outgoing operator initiates to a chosen operator, the incoming operator accepts (reusing the existing transfer-accept pattern: pending → accept/decline, durable offline, idempotent). An **admin can initiate or confirm any portion** of the process (assign, force-accept, or reassign) for cases where an operator is unreachable. Every handoff — operator- or admin-driven — writes an `AccountAuditLog` / deployment-history entry (who handed to whom, when), so the chain of custody is always reconstructable. This makes handoff symmetric with item transfers, which operators already do unaided.

### C.2 Naming in the UI [DECIDED: rename, unless you object]

- Rename the operator page **"My Rig" → "My Deployment"** (it shows the whole deployment: rig + current projects + co-operators). The *Rig* and *Kit* remain visible as labeled sub-sections inside it ("Your Rig: vehicles + kit").
- Use **Deployment** consistently for the operator+rig+projects unit across operator and admin UI; keep **Rig** for the gear+vehicles set and **Kit** for the tools-only set. One vocabulary, server and client (consistency item U4 / blueprint §7-2).

### C.3 Data-model deltas (C)

- `Deployment`: drop the single `projectId`; add `DeploymentProject` join (M2M). Keep `rigId`.
- New `DeploymentAssignment` (operator history, PRIMARY/SECONDARY, start/end); migrate existing `RigOperator` rows into it; deprecate `RigOperator`.
- Keep `Rig` = `Kit` + vehicles (`RigVehicle` join already exists); keep `Kit`/`KitItem`.
- Add the logical-unique constraints noted in the assessment (`RigVehicle (rigId, vehicleId, removedAt)`), since the handoff/transfer flows now lean on them harder.

### C.4 Pipeline placement (C)

- **Vocabulary adoption + Deployment↔Project M2M + DeploymentAssignment → front of Wave 2B**, *before* the maintenance state machine (A) — because A's "return to an active deployment" and B-adjacent handoff logic both reference the corrected Deployment model. It's a prerequisite, so it leads Wave 2B.
- **UI renames ("My Rig" → "My Deployment") + one disposition/status vocabulary → Wave 2D (Consistency).**

---

## D. Consolidated pipeline impact

How these fold into the existing wave plan (from `AHITS_INDEPENDENT_ASSESSMENT_AND_ROADMAP.md` §9). New/changed items in **bold**.

| Wave | Existing scope | Folded-in additions |
|---|---|---|
| **Wave 2A — Security** | invite tokens (S1), mass-assign (S2), seed creds (S4), cost leak (S5), email escaping (S7), transfer idempotency (C1) | S1 is now explicitly a **prerequisite for Account Management** |
| **Wave 2A.5 — Account Management & Auth (NEW)** | — | **Account lifecycle + suspend-with-revoke (minimal Session model); roles & permissions + guardrails; invites/bulk-onboard/per-operator defaults; account audit log** |
| **Wave 2B — Correctness** | consumable model (C3), needs-maintenance unify (C5), daily-check pipeline (C9), alert dedup (C6), soft-delete (C7) | **C-model first: Kit/Rig/Deployment vocab + Deployment↔Project M2M + DeploymentAssignment; then A: equipment lifecycle + 3 resolution paths + per-case return + expanded disposition enum** |
| **Wave 2C — Photos** | capture→compress→offline blob→private upload | **In-field & shop repair records attach photos here** |
| **Wave 2D — Consistency** | one pipeline, one vocabulary, one primitive set, session-expiry UX | **Adopt Kit/Rig/Deployment nouns app-wide; "My Rig"→"My Deployment"; one disposition/status enum** |
| **Wave 3 — Close Phase 2 + hardening** | maintenance recurrence loop + mileage trigger, notifications, admin completeness, sessions/devices (S3), tests | **Shop work-order/repair-request external email (Path C); full trusted-device mgmt + richer audit surfacing completes the Account Management story** |

**Net new model objects:** `DeploymentProject`, `DeploymentAssignment`, `Session`/`Device` (minimal), `AccountAuditLog`, plus enum/field additions on `MaintenanceTask`, `User`, `InviteToken`, and a promoted `Disposition` enum. None of these block each other if built in the order above (C-model → A-flow → B-accounts can proceed in parallel with A once the C-model lands).

---

## E. Confirmations — RESOLVED

All four open confirmations are now decided (2026-06-17):

1. **Admin roles (B.2): two roles only.** Ship `OPERATOR` / `ADMIN`; granular roles out of scope for now.
2. **"My Rig" → "My Deployment" rename (C.2): yes.** Adopt in Wave 2D.
3. **Handoff initiation (C.1): operator self-service.** An operator can initiate, confirm, and receive handoffs without admin help (transfer-accept pattern); an admin can initiate or confirm any portion. All handoffs are audit-logged.
4. **Repair-return destination (A.4): no default.** The destination must be explicitly selected; the repair cannot be closed until one is chosen.

No open product questions remain in this addendum. The next decisions are implementation-level and belong to the wave that builds each piece.
