# AHITS — W0-10 Legacy-Column Retirement: Migration Plan
**Fable · 2026-07-07.** The executable recipe for retiring the legacy deployment-ownership columns onto `deployment_assignments` — the single largest data risk in the codebase, and the gate the invoicing capstone (2C) sits behind (attribution must never read a legacy column). Produced by a dedicated Fable data-architecture audit against `development` @ `4a0d67e`. Also carries the two items folded into Batch 5: **FND-23** (partial-unique invariants) and the **EmailLog-FAILED alert** (enum add).

> **The load-bearing safety property (and its two holes).** Dropping `Rig.operatorId`/`Vehicle.assignedOperatorId` removes the Prisma `operator` relation and typed scalar, so **every un-migrated `include:{operator}` or `.operatorId` read *through the Prisma client* becomes a `tsc` compile error** — a strong backstop for the *Prisma-typed* display readers. **But `tsc` does NOT cover two reader classes, so they must be hand-audited, not trusted to the compiler:** (1) **raw-SQL readers** — `Vehicle.assignedOperatorId` is read via `$queryRaw` in `api/vehicles/route.ts:39` and `api/vehicles/[id]/route.ts:67`, each inside an error-swallowing `try/catch`, so on DROP they **silently return null** (no crash, no compile error); (2) **client `.tsx` reads off loosely-typed API payloads** (e.g. `admin/projects/page.tsx:46,212`) — `tsc` checks against the page's local interface, not the response shape, so a field the server stops sending degrades silently. And `tsc` never covers *logic* correctness of the migrated ownership checks. Net: `tsc` is a backstop for one class only; the raw-SQL + client + logic classes are covered by the §6 staging pass and the hand-audit below, not the compiler.
>
> **⚠️ This plan was revised after a four-agent adversarial review (antagonist / Fable / calibration / product-lens) that found the original draft NOT safe to execute as written. See §0 for the corrections; they change the sequencing and retract the "no raw SQL" claim.**

## ⏸ CURRENT STATUS & RESUME POINT (updated 2026-07-09)

**Paused deliberately at the prod cutover.** Everything below is built, six-agent-reviewed, landed on `development`, deployed to **staging**, and smoke-validated there. The **prod promotion is intentionally deferred** (Option B) — there is no cost to pausing; nothing is lost.

**What's live where:**
- **staging** (`development`): PR-1 (readers) + PR-2 (indexes A/B/D) + PR-2b (vehicle close-out) + PR-2c (index C) + **PR-4a** (reader removal) — all merged, deployed, and smoke-clean (operators render from `deployment_assignments`; dashboard/deployments/vehicles all good; zero console errors). Prod drop-safety + index pre-flights (A/B/D, C) were run on **prod** and returned zero.
- **production**: still frozen at the **2026-06-26** promote (`origin/production` @ `039a219`). Behind staging by ~3 months of accumulated work + all of Batch 5.

**Reconcile done:** `development` was reconciled with the diverged `production` (stale promote-merge history only — production had no unique content; development is authoritative). Reconcile merge SHA `ef37a58` (revert with `git revert -m 1 ef37a58`, never force-push). **PR #144** (`production ← development`, "promote: Wave-0 hardening + security batch") is now **conflict-free and mergeable**.

**🔒 THE ONE BLOCKER holding the prod cutover — `AHITS_PROD_MIGRATE_URL` secret does not exist.** This promote is the first time prod runs the branch-aware migrate path (`SECRET_NS=AHITS_PROD` → `make cloud-run-migrate` reads `$(SECRET_NS)_MIGRATE_URL`). The secret was intentionally deferred earlier and must be created (enabled) **before** merging #144, or the prod migrate job hard-fails and wedges the release. This is exactly the "remaining pre-prod operational step" flagged in `CLAUDE.md`.

**RESUME SEQUENCE (when ready to take prod current):**
1. **Create the secret** — Supabase **prod** session pooler URI (port **5432**, IPv4) → GCP Secret Manager secret `AHITS_PROD_MIGRATE_URL` (enabled version). Confirm the **deploy service account** has `roles/secretmanager.secretAccessor` on it (project-level Secret Accessor likely already covers it).
2. **Confirm** `AHITS_PROD_MIGRATE_URL` shows an ENABLED version; capture rollback anchors (`git rev-parse origin/production` = `039a219…`; current prod Cloud Run revision).
3. **Merge PR #144** → prod auto-deploys: runs the 10-migration backlog (all additive — `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`; the one `DROP COLUMN` grep hit is a comment; W0-10 DROP is NOT in the backlog). **Watch the prod `migrate` job log FIRST** — confirm it read `AHITS_PROD_MIGRATE_URL` and applied to the **prod** DB (not staging). Then smoke prod (operators from assignment table, no console errors).
4. **PR-4a is then live on prod** → land **PR-4b′** (`batch5-pr4b-writers-nullable.patch`) to `development`, soak on staging, promote to prod.
5. Then **PR-4c** (`batch5-pr4c-drop.patch`) — the irreversible DROP — against the read+write-free PR-4b′ revision, gated by the §11 go/no-go (prod Q1/Q2 green, archive taken, PITR). Break-glass recovery: `prisma/recovery/W0-10_forward_fix_readd_operator_columns.sql`.

**Nothing else is blocked.** The W0-10 code work (§ below) is complete and delivered as patches; this pause is purely the prod-infra secret + the deliberate choice not to promote tonight.

---

## The three retirement targets (verified in `prisma/schema.prisma`)
1. `Rig.operatorId` — String **NOT NULL** (~L255), legacy PRIMARY operator.
2. `RigOperator` / table `rig_operators` (~L277-287), legacy SECONDARY operators.
3. `Vehicle.assignedOperatorId` — String? nullable (~L521), legacy vehicle→operator.

**Successor (already in schema + backfilled):** `DeploymentAssignment` (`rigId, operatorId, role PRIMARY|SECONDARY, startedAt, endedAt`); helpers in `src/lib/deployment-assignments.ts`. Backfill shipped in migration `20260624000000_deployment_model_foundation` (every rig → a PRIMARY assignment; every `rig_operators` row → a SECONDARY). **The backfill's continued completeness after weeks of live writes is the #1 pre-DROP unknown — §6 proves it.**

Two ground-truth facts that shrink the risk: **(a)** `Rig.operatorId` and `rig_operators` are read **only** through the Prisma client — no raw SQL touches them (verified: the raw-SQL `FROM "rigs"` sites read only `id`/`endedAt`), so `tsc` fully backstops those two targets; **(b)** the ended-deployment attribution successor (`getDeploymentRostersForDisplay`) is **already built and already called** — the legacy fallback just needs deleting. **CORRECTION (review):** the original draft's claim that *all* legacy reads are Prisma-client is FALSE — `Vehicle.assignedOperatorId` is read in raw SQL (see the top callout), so `tsc` does **not** backstop the vehicle column; V1/V2 must be hand-audited + runtime-tested.

---

## 0. Four-agent adversarial review — findings & corrections

The original draft was reviewed by four independent agents. They found **2 HIGH + 4 MED** issues (the antagonist, Fable, and product-lens agents *independently converged* on the sequencing HIGH). Corrections are folded into the sections below; this is the summary.

| # | Sev | Finding | Correction (where) |
|---|---|---|---|
| C1 | **HIGH** | **Verification gate mis-sequenced.** PR-1 swaps ownership resolution to `deployment_assignments` and deploys *before* §6; if the backfill has any gap (a post-backfill secondary with no mirrored assignment — the plan's own Q3/Q4), PR-1 **silently revokes that operator's access** the moment it deploys, with **no `tsc` protection** (it's a logic swap, not a relation removal), during the adoption-critical first two weeks. | **§5/§6 re-sequenced:** Q3/Q4/Q5 (active-rig parity) now gate **PR-1's deploy**, not the DROP; and PR-1's ownership gate ships with a **legacy OR-fallback** (`hasOpenAssignment OR legacyPrimary OR rigOperator`) so it is **strictly non-revoking** — the legacy arm is removed only at PR-4. |
| C2 | **HIGH** | **"No raw SQL / `tsc` catches everything" is FALSE.** `Vehicle.assignedOperatorId` is read via `$queryRaw` (`vehicles/route.ts:39`, `vehicles/[id]/route.ts:67`) inside error-swallowing `try/catch` → on DROP they **silently return null**, not a compile error or crash. | Top callout + §1c corrected; V1/V2 are hand-audited and need a **runtime test**, not `tsc`. |
| C3 | **MED** | **Reader inventory incomplete.** Missed: `dashboard/feeds/route.ts:55` (2nd `Rig.operator` include); `inventory/route.ts:92` + `inventory/[id]/route.ts:56` (nested `kit.rig.operator` — **no roster successor**, so operator silently vanishes from those payloads on DROP); `admin/projects/page.tsx:46,212` (client reads `rig.operator`, `tsc` won't catch; `projects/[id]/route.ts:18` serves it from the legacy include with no roster). R22's "response already sourced from roster" is **false** for the inventory + projects routes. | Added as R23–R26 in §1d; each needs a roster successor **or** an explicit accepted-loss note before PR-4. |
| C4 | **MED** | **Writer inventory incomplete.** `api/vehicles/[id]/route.ts` PATCH writes `assignedOperatorId` directly (admin manual assign) and does **not** dual-write → refutes "every writer dual-writes." Also the un-inventoried one-active-rig writer **guards** (`deployments/route.ts:190`, `handoff:52`, `accept:115`) read `rig.operatorId`/`endedAt` — and `getActivePrimary(operatorId)` is actually the *right* successor for these (its "zero callers" is a symptom of this omission, not proof it's wrong-direction). | Added as W12 + the guard-reads (R27–R29) in §2; product decision needed on the admin manual-assign capability. |
| C5 | **MED** | **Test suite not scoped → PR-4 fails CI.** `tests/fnd1-ended-deployment-operator.test.ts:49-60` asserts the exact `Rig.operatorId` fallback PR-4 deletes; fixtures (`createRig({operatorId})`, `createVehicle({assignedOperatorId})`) + `setup.ts:59` + several tests reference dropped fields. | PR-4 scope now includes the test rewrites (§5). |
| C6 | **MED (payroll)** | **Two attribution decisions left as coder toss-ups.** R12 (`CheckLog.operatorId` ← roster-PRIMARY *or* `session.userId`) and Q5 (legacy-PRIMARY drift — the migration *switches which record is truth*) are pay/evidence decisions. "One wrong paycheck sends a contractor back to texting" (North Star §7.6). | R12 flagged as a **product decision** (§1a); Q5 re-labeled a **payroll incident to reconcile by hand**, not a cleanliness nit (§6). FND-7 (business-date) confirmed a prerequisite for handoff-boundary hours. |
| C7 | **PRODUCT** | **The DROP is NOT on the money-loop critical path.** Invoicing needs the *readers* (PR-1, backward-compatible) — the DROP is elective defense-in-depth. | §5 re-framed: land **PR-1/PR-2 pre-pilot** (soak); hold the **irreversible DROP for a quiet window before A6 or after the pilot's first two weeks — never mid-pilot.** |

**Cleared by the review (no change needed):** the ownership-check collapse is **not** a privilege escalation (secondaries are already granted `end`/`transfer` today; handoff stays PRIMARY-only via roster) — but PR-1 must use roster-PRIMARY, not the any-role helper, for R8/R9/R14. Migration DDL mechanics are clean (no FK into `rig_operators`, no views/triggers on the columns, the enum-add is isolated per the `20260630…` precedent). The FND-23 invariants do **not** fight the handoff transient (`reassignPrimary` ends-before-adds, so a rig never holds two open PRIMARYs — worth a code comment to lock that ordering). The 4-PR spine shape is sound.

---

## 1. Reader inventory (migrate these to `deployment_assignments`)

**Note on helper:** `getActivePrimary(operatorId)` exists but is keyed the wrong direction (by operator, not rig) and has zero callers. Add **`getActivePrimaryForRig(rigId)`** (or reuse `getDeploymentRoster(rigId).operatorId`, which already returns the open PRIMARY) and one **`hasOpenAssignment(rigId, operatorId)`** helper. Every "primary check + secondary check" pair below collapses into ONE open-assignment query (role-agnostic).

### 1a · `Rig.operatorId`
| # | file:line | Kind | Successor |
|---|---|---|---|
| R1 | `api/deployments/[id]/route.ts:81` GET | ownership gate | `hasOpenAssignment(rigId, session.userId)` (any role) |
| R2 | `api/deployments/[id]/route.ts:118` PATCH | ownership gate | same |
| R3 | `api/deployments/[id]/end/route.ts:74` (+sec `:75`) | ownership gate | same |
| R4 | `api/deployments/[id]/transfer/route.ts:50` (+sec `:51`) | ownership gate | same |
| R5 | `api/deployments/[id]/items/route.ts:101,113` (+sec `:102,114`) | ownership gate | same |
| R6 | `api/deployments/[id]/items/[kitItemId]/route.ts:42` (+sec `:43`) | ownership gate | same |
| R7 | `api/deployments/[id]/vehicles/route.ts:57` (+sec `:58`) | ownership gate | same |
| R8 | `api/deployments/[id]/handoff/route.ts:29` | `isPrimary` | `getDeploymentRoster(id).operatorId === userId` |
| R9 | `api/deployments/[id]/operators/route.ts:31` | guard (reject primary as secondary) | roster PRIMARY id |
| R10 | `api/deployments/route.ts:120` GET list | query filter (`operatorId=me OR secondary`) | rigIds via `deployment_assignments WHERE operatorId=me AND endedAt IS NULL`; pass `id:{in:rigIds}` |
| R11 | `api/deployments/[id]/items/route.ts:212` | value: `claimHeldStock(rig.operatorId,…)` | `(await getDeploymentRoster(id)).operatorId` |
| R12 | `api/deployments/[id]/items/route.ts:400,441` | value: `CheckLog.operatorId` | roster PRIMARY id (or `session.userId` — product call) |
| R13 | `api/deployments/[id]/vehicles/route.ts:117` | value→write `assignedOperatorId` | disappears (see W6) |
| R14 | `api/deployments/[id]/transfer/route.ts:68` | self-transfer guard | roster PRIMARY id |
| R15 | `api/deployments/[id]/handoff/route.ts:37,47` | value reads | roster PRIMARY id |
| R16 | `api/transfers/[id]/accept/route.ts:198` | `CheckLog.operatorId: fromRig.operatorId` | roster PRIMARY of `fromRig.id` |
| R17 | `lib/deployment-handoffs.ts:35` | `reassignPrimary` reads to end old PRIMARY | end open PRIMARY by rigId; drop the `operatorId` arg |
| R18 | `api/cron/dispatch/route.ts:133,139,143,145,146` | cron missed-check scan | join active rigs → open PRIMARY (query below) |
| R19 | `api/dashboard/feeds/route.ts:38,85-88` | dashboard missed-check feed | same as R18 |
| R20 | `api/deployments/route.ts:139,153,156` | **FND-1 fallback hydration** | **delete** (roster already returns final attribution — §3) |
| R21 | `api/deployments/[id]/route.ts:97,100,104` | **fallback hydration** | **delete** (§3) |
| R22 | display `include:{operator}` on rig: `deployments/route.ts:11`, `[id]/route.ts:8`, `[id]/items/route.ts:14`, `[id]/vehicles/route.ts:8`, `[id]/history/route.ts:17`, `[id]/transfer/route.ts:20`, `transfers/route.ts:6`, `transfers/[id]/accept/route.ts:31` (fromRig.operator), `checkout/route.ts:46`, `projects/[id]/route.ts:18` | display include | remove include — response already sourced from roster; **`tsc` flags each on drop** |

R18/R19 successor query:
```sql
SELECT a."operatorId", u."name"
FROM "deployment_assignments" a
JOIN "rigs" r ON r.id=a."rigId" AND r."endedAt" IS NULL
JOIN "users" u ON u.id=a."operatorId"
WHERE a.role='PRIMARY' AND a."endedAt" IS NULL;
```

### 1b · `rig_operators` (all fold into the R-row's single open-assignment query)
`deployments/[id]/route.ts:82` · `end:75` · `transfer:51` · `items:102,114` · `items/[kitItemId]:43` · `vehicles:58` · `deployments/route.ts:120` (`secondaryOperators.some`) · display includes `deployments/route.ts:38`, `[id]/route.ts:35` (remove; `tsc` flags on drop).

### 1c · `Vehicle.assignedOperatorId`
| # | file:line | Successor |
|---|---|---|
| V1 | `api/vehicles/route.ts:37-39` (raw SQL join for name) | derive via open RigVehicle→rig open PRIMARY (Q6 shape) |
| V2 | `api/vehicles/[id]/route.ts:63-67` | same |
| V3 | `api/vehicles/by-qr/[qrCodeId]/route.ts:28` | derive, or drop from payload |
| V4 | clients `admin/deployments/page.tsx:158,421`, `operator/my-deployment/page.tsx:221,878` (`!v.assignedOperatorId` = unassigned) | no change **if** the vehicles API keeps returning a derived `assignedOperatorId`-shaped field |

---

## 2. Writer inventory
**Every legacy writer already dual-writes to `deployment_assignments`** — so the successor state is already correct; these edits only *remove the legacy write*.

| # | file:line | Legacy write | Change |
|---|---|---|---|
| W1 | `deployments/route.ts:198-202` | `rig.create({operatorId})` | drop `operatorId` — **blocked until DROP** (NOT NULL) |
| W2 | `transfers/[id]/accept/route.ts:118-122` | dest `rig.create({operatorId})` | same — at DROP |
| W3 | `lib/deployment-handoffs.ts:37` | `rig.update({operatorId})` | remove — at DROP |
| W4 | `deployments/[id]/operators/route.ts:36-42` | `rigOperator.upsert` | drop; keep `ensureOpenAssignment(SECONDARY)` |
| W5 | `deployments/[id]/operators/route.ts:58-59` | `rigOperator.deleteMany` | drop; keep `endAssignmentByRole(SECONDARY)` |
| W6 | `deployments/[id]/vehicles/route.ts:115-118` | `assignedOperatorId=rig.operatorId` | drop (RigVehicle row is the successor) |
| W7 | `deployments/route.ts:228-231` | `assignedOperatorId` on create | drop |
| W8 | `deployments/[id]/end/route.ts:271-274` | `assignedOperatorId=null` | drop |
| W9 | `transfers/[id]/accept/route.ts:145-148` | `assignedOperatorId=toOperatorId` | drop |
| W10 | `lib/deployment-handoffs.ts:40` | `assignedOperatorId=toOperatorId` | drop |
| W11 | `deployments/[id]/vehicles/route.ts:198` | `assignedOperatorId=null` on remove | drop |

**Sequencing constraint:** `Rig.operatorId` is NOT NULL, so W1/W2/W3 **cannot stop writing it before the column is dropped** → the legacy write removal and the `DROP COLUMN` land in the SAME PR (PR-4). `assignedOperatorId` is nullable → W6-W11 could stop earlier, but ship them with the drop for cleanliness.

---

## 3. Ended-deployment attribution
Delete the two mirror fallback branches (R20 `deployments/route.ts:138-153`, R21 `[id]/route.ts:95-101`). `getDeploymentRostersForDisplay` (`lib/deployment-assignments.ts:101-157`) already returns the final roster for an ended rig (the `max_ended` CTE), and both routes already call it. Safe to delete **once §6-Q1/Q2 prove no rig serializes `operator: null`** (i.e., every rig has ≥1 PRIMARY assignment).

---

## 4. FND-23 invariants (partial-unique indexes)
**Built as PR-2 = A, B, D only** (`batch5-pr2-invariants.patch`); **C deferred to PR-2b** (see §8 — the end-of-deployment route never stamps `rig_vehicles.removedAt`, so `WHERE removedAt IS NULL` is not a proxy for "on an active rig"; C needs a code fix + backfill first). Each index **fails to create if data already violates it** — run its pre-flight first; each must return **zero rows**.

```sql
-- (A) one OPEN PRIMARY per operator  [FND-23 core; enforces "one active deployment per operator"]
CREATE UNIQUE INDEX "deployment_assignments_one_open_primary_per_operator"
  ON "deployment_assignments" ("operatorId") WHERE "role"='PRIMARY' AND "endedAt" IS NULL;
-- (B) one OPEN PRIMARY per rig
CREATE UNIQUE INDEX "deployment_assignments_one_open_primary_per_rig"
  ON "deployment_assignments" ("rigId") WHERE "role"='PRIMARY' AND "endedAt" IS NULL;
-- (C) one OPEN RigVehicle per vehicle  [most likely to have real violations — H1 history]
CREATE UNIQUE INDEX "rig_vehicles_one_open_per_vehicle"
  ON "rig_vehicles" ("vehicleId") WHERE "removedAt" IS NULL;
-- (D, optional) one OPEN SECONDARY per (rig, operator)
CREATE UNIQUE INDEX "deployment_assignments_one_open_secondary_per_rig_op"
  ON "deployment_assignments" ("rigId","operatorId") WHERE "role"='SECONDARY' AND "endedAt" IS NULL;
```
Pre-flights (each must be empty):
```sql
SELECT "operatorId",COUNT(*) FROM "deployment_assignments" WHERE "role"='PRIMARY' AND "endedAt" IS NULL GROUP BY 1 HAVING COUNT(*)>1;           -- (A)
SELECT "rigId",COUNT(*)      FROM "deployment_assignments" WHERE "role"='PRIMARY' AND "endedAt" IS NULL GROUP BY 1 HAVING COUNT(*)>1;           -- (B)
SELECT "vehicleId",COUNT(*)  FROM "rig_vehicles"           WHERE "removedAt" IS NULL                    GROUP BY 1 HAVING COUNT(*)>1;           -- (C)
SELECT "rigId","operatorId",COUNT(*) FROM "deployment_assignments" WHERE "role"='SECONDARY' AND "endedAt" IS NULL GROUP BY 1,2 HAVING COUNT(*)>1; -- (D)
```
`ensureOpenAssignment` is a `WHERE NOT EXISTS` guard (not atomic under concurrency), so a race could have created a duplicate that must be closed by hand before the index applies.

---

## 5. Sequenced plan (PR boundaries) — REVISED per the §0 review

**Framing (C7):** the money loop needs the **readers** (PR-1), not the DROP. PR-1 is what satisfies the North Star's "legacy-column retirement → before invoicing attribution" gate; the DROP (PR-4) is elective `tsc`-enforced defense-in-depth. So land the reader/invariant work pre-pilot to soak, and **hold the irreversible DROP for a quiet window before A6 or after the pilot's first two weeks — never mid-pilot.**

- **PR-0 · Active-rig parity gate (ops, no code — BEFORE PR-1).** Run §6 **Q3/Q4/Q5** against staging (and prod before the prod PR-1). All must be zero. These detect the exact gap that would make PR-1 revoke a live operator's access. **Also prove the dual-write is wired at every add-secondary/transfer/handoff path** (don't assume it — a single unwired path is what makes Q3/Q4 non-empty later). Non-zero = remediate before PR-1.
- **PR-1 · Reader migration (code only, strictly NON-revoking).** Add the helpers; migrate R1-R19 + all 1b ownership/filter reads + V1-V3 (hand-audit the two raw-SQL vehicle readers, C2) + the missed readers R23-R26 (C3) + the one-active-rig guard reads R27-R29 (C4). **The ownership gates ship with a legacy OR-fallback:** grant access if the operator has an open assignment **OR** matches `Rig.operatorId` **OR** has a `rig_operators` row — so PR-1 can only *add* the assignment path, never remove access. (The legacy arm is deleted at PR-4, gated by Q1/Q2.) Use roster-**PRIMARY** (not the any-role helper) for R8/R9/R14 (privilege-preservation). **Do NOT** remove the `include:{operator}`/`secondaryOperators` includes (R22) or the R20/R21 fallback yet — schema-coupled, go with the DROP. Reads new tables, columns present, fallback retained → strictly backward-compatible and non-revoking; `tsc` clean + PR-0 green are the gate.
- **PR-2 · Invariant indexes (migration, additive).** Run §4 pre-flights on staging; remediate any duplicate open assignments (the non-atomic `ensureOpenAssignment` race); add indexes A-D. Add a code comment on `reassignPrimary` locking its end-before-add ordering (index B depends on it). Must precede the DROP.
- **PR-3 · Drop-safety gate (ops, no code — BEFORE PR-4).** Run §6 **Q1/Q2** (+ re-run Q5-Q7) against staging AND prod. All zero = the DROP is safe.
- **PR-4 · Writers + DROP (code + destructive migration — must lag PR-1's deploy; hold for a quiet window).** Delete the R20/R21 fallback and the PR-1 legacy OR-arm; remove all `operator`/`secondaryOperators` includes (`tsc` enumerates them) AND wire roster successors for the inventory/projects routes that lack one (R23-R26, C3); remove W1-W12 legacy writes; **rewrite the tests that reference the dropped fields/model, especially `tests/fnd1-ended-deployment-operator.test.ts` (C5)** or CI fails; remove the fields/relations from `schema.prisma`; migration:
  ```sql
  -- migration-safety: acknowledged legacy deployment-ownership retirement; all readers removed
  -- in the prior deployed revision (PR-1); attribution sourced from deployment_assignments.
  DROP TABLE "rig_operators";
  ALTER TABLE "rigs" DROP COLUMN "operatorId";
  ALTER TABLE "vehicles" DROP COLUMN "assignedOperatorId";
  ```
  **Hard ordering:** the `migrate` job drops columns BEFORE the new revision serves and they are not atomic, so **PR-1's reader-free revision must already be the running revision in each environment before PR-4's migrate runs** — else the still-live old revision reads a dropped column and crashes. Ship PR-4 only after PR-1 is fully deployed there and §6 is green.

---

## 6. Verification queries (staging DB — unknowable from source; all must return ZERO)
**Split into two gates (C1):** **Q3, Q4, Q5 gate PR-1's deploy** (active-rig parity — these detect the operator-access-revocation risk, so they run BEFORE the reader swap, per PR-0). **Q1, Q2 gate PR-4's DROP** (drop-safety — every rig has a PRIMARY). **Q5/Q6/Q7 (drift)** run at both gates. A non-zero **Q5** is a **payroll incident to reconcile by hand** (the migration switches which record is attribution-of-truth), not a data-cleanliness nit — reconcile before trusting the money loop.
```sql
-- Q1: rig whose legacy operatorId has NO matching PRIMARY assignment (loses attribution on drop)
SELECT r.id,r."operatorId",r."endedAt" FROM "rigs" r WHERE NOT EXISTS (SELECT 1 FROM "deployment_assignments" a WHERE a."rigId"=r.id AND a.role='PRIMARY' AND a."operatorId"=r."operatorId");
-- Q2: ACTIVE rig with no OPEN PRIMARY (would serialize operator:null after fallback delete — crash risk)
SELECT r.id,r."operatorId" FROM "rigs" r WHERE r."endedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "deployment_assignments" a WHERE a."rigId"=r.id AND a.role='PRIMARY' AND a."endedAt" IS NULL);
-- Q3: rig_operators row not mirrored as a SECONDARY assignment (any state)
SELECT ro."rigId",ro."operatorId" FROM "rig_operators" ro WHERE NOT EXISTS (SELECT 1 FROM "deployment_assignments" a WHERE a."rigId"=ro."rigId" AND a."operatorId"=ro."operatorId" AND a.role='SECONDARY');
-- Q4: ACTIVE-rig secondary with no OPEN SECONDARY assignment (silently loses access after PR-1)
SELECT ro."rigId",ro."operatorId" FROM "rig_operators" ro JOIN "rigs" r ON r.id=ro."rigId" AND r."endedAt" IS NULL WHERE NOT EXISTS (SELECT 1 FROM "deployment_assignments" a WHERE a."rigId"=ro."rigId" AND a."operatorId"=ro."operatorId" AND a.role='SECONDARY' AND a."endedAt" IS NULL);
-- Q5: legacy PRIMARY drift — active rig where rigs.operatorId disagrees with the open PRIMARY
SELECT r.id,r."operatorId" legacy,a."operatorId" assigned FROM "rigs" r JOIN "deployment_assignments" a ON a."rigId"=r.id AND a.role='PRIMARY' AND a."endedAt" IS NULL WHERE r."endedAt" IS NULL AND r."operatorId"<>a."operatorId";
-- Q6: vehicle assignment not derivable from open RigVehicle→PRIMARY (also the V1-V3 successor query)
SELECT v.id,v."assignedOperatorId" FROM "vehicles" v WHERE v."assignedOperatorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "rig_vehicles" rv JOIN "rigs" r ON r.id=rv."rigId" AND r."endedAt" IS NULL JOIN "deployment_assignments" a ON a."rigId"=r.id AND a.role='PRIMARY' AND a."endedAt" IS NULL WHERE rv."vehicleId"=v.id AND rv."removedAt" IS NULL AND a."operatorId"=v."assignedOperatorId");
-- Q7: reverse vehicle drift — vehicle in an open RigVehicle but assignedOperatorId null/wrong
SELECT v.id,v."assignedOperatorId",a."operatorId" should_be FROM "vehicles" v JOIN "rig_vehicles" rv ON rv."vehicleId"=v.id AND rv."removedAt" IS NULL JOIN "rigs" r ON r.id=rv."rigId" AND r."endedAt" IS NULL JOIN "deployment_assignments" a ON a."rigId"=r.id AND a.role='PRIMARY' AND a."endedAt" IS NULL WHERE v."assignedOperatorId" IS DISTINCT FROM a."operatorId";
```
**Biggest risks, ranked:** (1) Q3/Q4 non-empty → a live-added secondary since backfill isn't mirrored; PR-1 silently revokes their rig access. (2) Pre-flight (C) non-empty → real duplicate open RigVehicle rows block the vehicle invariant. (3) Missed display reader → mitigated by `tsc` (drop removes the relation → compile error).

---

## 7. Also in Batch 5 — the EmailLog-FAILED alert (folded from FND-17)
Small, self-contained, independent of W0-10. Surfaces failed invoice/notification emails in the exception feed (CONV-13 "FAILED = interrupt").
- **Migration:** `ALTER TYPE "AlertType" ADD VALUE 'EMAIL_FAILED';` (additive; passes migration-safety; the cron code that uses it deploys after).
- **Cron:** in `api/cron/dispatch/route.ts`, scan `email_logs` for `status='FAILED'` rows not yet alerted and `createAlert('EMAIL_FAILED','email_logs',<id>,{to,subject,attempts})`; resolve when a later attempt for the same target succeeds.
- **Deep-link:** add an `alertLink` entry → the admin email-log surface (`/api/admin/email-log` UI).
Ships independently; no DB-drop gate (only the additive enum).

---

## 8. PR-1 build outcome — four-agent review (antagonist · Fable · calibration · product/operator-lens)

PR-1 is **built, `tsc`-clean, committed, and delivered** as `batch5-pr1-readers.patch` (repo root; verified to apply onto `development`). All R1-R29 readers + V1-V3 migrated behind the helpers (`hasOpenAssignment`, `getActivePrimaryForRig`, `getVehicleOperators`, `getDeploymentRostersForDisplay`, `isAuthorizedForRig`). The four agents ran against the complete diff; findings and dispositions:

- **Fixed in PR-1 (antagonist HIGH):** the transfers-list visibility filter still read `fromRig:{operatorId}` with no assignment path — now a non-revoking union (`fromRigId IN <my open-PRIMARY rigs>` **OR** legacy `fromRig.operatorId`), mirroring the deployments-list pattern.
- **Fixed in PR-1 (all four flagged — the strongest consensus):** the missed-daily-check **alert** path (`cron/dispatch` + `dashboard/feeds`) and `inventory/[id]` had dropped their legacy fallback, so an active rig lacking an open PRIMARY would be **silently dropped from alerting** (fail-closed — the worst failure for an ops tool). Re-typed the cron/feeds scans through Prisma (so the PR-4 drop is a **compile error here, not a silent miss**) with a `roster?.operatorId ?? rig.operatorId` fallback; added the same fallback to inventory detail. This is the one place a raw-SQL fallback was **rejected** (it would be an untyped PR-4 landmine).
- **Fixed in PR-1 (antagonist MED/LOW):** `getVehicleOperators` now has a deterministic `ORDER BY startedAt DESC` (was arbitrary-row on a transient invariant violation); `vehicles/[id]` derives the operator once instead of three round-trips.
- **Resolved, no fix needed (Fable MEDIUM vs product-lens — conflict adjudicated by reading the code):** Fable feared `getVehicleOperators` breaks the "keep `assignedOperatorId` set during a pending transfer" reservation. **False premise** — the source rig's `RigVehicle` row stays **open** (`removedAt` set only on *acceptance*, per the "don't clear yet" comment), so the derivation returns the source PRIMARY = exactly what the legacy column held. Vehicles ship unchanged; the re-add conflict guard still fires. Confirmed via `deployments/[id]/transfer/route.ts` + the add-guard in `.../vehicles/route.ts`.
- **Deferred to PR-4 (tsc-caught writer-adjacent inverse-lookups):** `rig.findFirst({where:{operatorId,endedAt:null}})` in `transfers/[id]/accept`, `deployments/[id]/handoff` (target-active guard), and `handoffs/[id]/accept` read `Rig.operatorId` to *find the rig to write to*. They move with the writers in PR-4; the Prisma relation vanishing on drop makes each a compile error, so none can be silently missed. The R20/R21 display fallback + R22 includes + the two `fromRig:{operatorId}` legacy OR-arms also go with the DROP.
- **Deferred to PR-2 (calibration + antagonist):** no DB constraint enforces "one open PRIMARY per active rig" — the invariant the cron/feeds alert paths and `getActivePrimaryForRig` rely on. PR-2 must add a **partial unique index** `("rigId") WHERE role='PRIMARY' AND "endedAt" IS NULL` (alongside §4 A-D). This is what makes the alert paths structurally safe rather than trust-based; the window between PR-1 and PR-2 is covered by the retained fallbacks.

**Added prod pre-flight (calibration — the single most dangerous assumption is prod backfill completeness, because the alert path has no compile-time backstop):** before PR-1 lands on prod, and again before PR-4's drop, run these on **prod** (not just staging — the PR-0 gate was staging-only) — both must return zero:
```sql
-- A: active rig without exactly one open PRIMARY (the alert-path invariant)
SELECT r.id, count(a.*) FILTER (WHERE a.role='PRIMARY' AND a."endedAt" IS NULL) n
FROM "rigs" r LEFT JOIN "deployment_assignments" a ON a."rigId"=r.id
WHERE r."endedAt" IS NULL GROUP BY r.id
HAVING count(a.*) FILTER (WHERE a.role='PRIMARY' AND a."endedAt" IS NULL) <> 1;
-- E: duplicate open PRIMARY (compensates for the not-yet-added PR-2 unique index)
SELECT "rigId", count(*) FROM "deployment_assignments"
WHERE role='PRIMARY' AND "endedAt" IS NULL GROUP BY "rigId" HAVING count(*) > 1;
```
(These subsume Q2/Q5 for the alert path; keep Q3/Q4 as the PR-1 access-revocation gate.)

---

## 9. PR-2 build outcome + PR-2b (index C) — four-agent review

**PR-2 (`batch5-pr2-invariants.patch`, applies onto `development`) ships indexes A, B, D** — all four agents cleared them. Highlights: index B is what makes PR-1's alert path structurally unambiguous; `reassignPrimary`'s end-before-add ordering (verified to prevent an index-B violation inside its transaction) gained a load-bearing comment; `IF NOT EXISTS` added for re-run safety after manual reconciliation. **Pre-flights A/B/D are a HARD PROD GATE** (the earlier parity gate was staging-only): run on prod, reconcile any duplicates **by hand** (attribution/payroll decision — never auto-close), re-run immediately before the production merge (legacy writers still run pre-PR-4, so data can drift). The calibration pass produced a full remediation runbook (per-index "show me the conflicts with operator names + timestamps, then which row to close") — available on request.

**Index C is a ship-blocker as written → PR-2b.** Two agents (Fable predicate-parity, product/operator-lens) independently found, and the code confirms: `deployments/[id]/end/route.ts` ends a rig's assignments but **never sets `rig_vehicles.removedAt`**, and the only row-closing path (`vehicles` DELETE via `getAuthorizedActiveRig`) returns null for an ended rig — so an ended rig's vehicle rows stay open forever. The add-vehicle conflict guard deliberately filters on `rig.endedAt IS NULL`, i.e. the app's real invariant is "one open RigVehicle **on an active rig** per vehicle," which a partial index can't express (can't reference `rigs.endedAt`). Index C (`WHERE removedAt IS NULL`) would therefore (1) likely **abort the prod deploy** on historical residue (a vehicle reused across past deployments has multiple open rows — the migration's own "most likely to fail" flag) and (2) **re-arm every deployment-end**, throwing a raw 500 on the routine "reuse my truck next deployment" action.

**PR-2b scope (its own build + four-agent review):**
1. In `deployments/[id]/end/route.ts` (and the transfer auto-end in `transfers/[id]/accept`), stamp `rig_vehicles.removedAt = now()` for the rig's open vehicle rows — mirroring `endAllAssignmentsForRig`.
2. A backfill migration closing historical open `rig_vehicles` rows on already-ended rigs (`SET removedAt = rig.endedAt`), so pre-flight C legitimately returns zero.
3. Add `23505`/Prisma `P2002` → friendly 409 translation in the vehicle writers (`vehicles/route.ts`, `deployments/route.ts` POST) and `deployments/[id]/operators` (pattern already exists at `handoff/route.ts:70-72`) — this also cleans up the rare-race raw-500 edges the agents flagged for A and D.
4. **Then** create index C (`one_open_per_vehicle`) with the corrected data.

Deferring C does not weaken PR-1: "one active rig per vehicle" is already app-enforced by the add-vehicle guard, and `getVehicleOperators` joins `rig.endedAt IS NULL` + has a deterministic `ORDER BY`.

---

## 10. PR-2b + PR-2c build outcome — four-agent review

**PR-2b (`batch5-pr2b-vehicle-closeout.patch`, applies onto `development`)** — the code fix + backfill that makes index C creatable. `deployments/[id]/end` now closes the rig's open `rig_vehicles` rows (freeing each vehicle for reuse); a backfill closes historical ended-rig rows. Adds `23505`/`P2002` → 409 translation to the vehicle/deployment/operator writers.

Three agents (antagonist BLOCKER, Fable, product/operator-lens) independently caught a regression in the first cut: unconditionally closing the rows **bricked in-flight vehicle transfers** (accept's `stillPresent` guard needs `removedAt IS NULL`). Fixed by excluding PENDING-outbound-transfer vehicles from both the end close-out and the backfill; a re-verification pass then found the mirror strand on the **decline/cancel** terminal paths (a transfer ended-then-declined left the row open forever) — also closed, mirroring the existing ended-rig kit-item reconciliation. Now all three terminal states (accept / decline / cancel) free the vehicle. The weak deployment-create 409 message was reworded per product-lens. (The calibration pass confirmed the rig-ending enumeration is complete — only `end` and the guarded transfer-auto-end set `endedAt` — and that the 23505 branches are correct but dormant until the indexes ship.)

**PR-2c (`batch5-pr2c-vehicle-index.patch`)** — creates index C (`rig_vehicles_one_open_per_vehicle`, broad "one open per vehicle" — a physical truck is in one place). **Lands only AFTER PR-2b is deployed and live** (writer-before-constraint, mirroring PR-1→PR-4), and only after **both** pre-flights return zero on prod. The second pre-flight catches the residue the backfill can't fix — a vehicle with two open rows on two **different active** rigs (a pre-existing concurrent-add race) — which needs manual reconciliation before the index will create.

### Batch 5 landing order (each its own PR to `development`, four-agent-reviewed)
1. **PR-1** `batch5-pr1-readers.patch` — reader migration (prod gate: §8 queries A/E).
2. **PR-2** `batch5-pr2-invariants.patch` — indexes A/B/D (prod gate: §4 pre-flights A/B/D).
3. **PR-2b** `batch5-pr2b-vehicle-closeout.patch` — vehicle close-out + backfill + 409s.
4. **PR-2c** `batch5-pr2c-vehicle-index.patch` — index C, **after PR-2b is live** + prod pre-flights zero.
5. **PR-4** (not yet built) — legacy writers removal + `DROP`, held for a quiet window after PR-1 soaks and §6 Q1/Q2 are green on prod.

PR-1/PR-2/PR-2b are independent and can land in parallel; PR-2c waits on PR-2b; PR-4 waits on PR-1 (+ its own gates).

---

## 11. PR-4 (the irreversible DROP) — six-agent review: REWORK → SPLIT + GATE

PR-4 was built as a reference and reviewed by SIX agents (the four core + **Reversibility/Recovery (SRE-DBA)** and **Data-retention/Audit historian**). Verdict: **do not land as a single combined PR.** The build sits at `batch5-pr4-REFERENCE-needs-split.patch` with the review fixes applied, but it must be re-cut into two landable units. Note: the sandbox could not regenerate the Prisma client (engine download blocked), so there was **no in-sandbox tsc** — CI tsc (regenerated client) + `npm test` (DB) are the authoritative gate, and the agents hunted for missed readers by hand.

**Real bugs the agents caught (all fixed in the reference build):**

- **Two missed readers** (no tsc net): `daily-check/route.ts` and `inventory/[id]/route.ts` still read `rigs.operatorId` — a guaranteed post-drop 500 on daily-check submit and inventory-detail view. Migrated to `getActiveRigForOperator` / roster.
- **`transfers/accept` threw** on the end-of-deployment transfer flow: `getRequiredPrimaryForRig` on an ended source rig (closed PRIMARY) throws → the recipient can never accept, equipment stranded. Breaks `transfer-lifecycle.test.ts`. Fixed to use the display roster's final-roster (max_ended) operator.
- PATCH + operators used the throwing required-primary on possibly-ended rigs (admin 500 on ended-deployment edit) → nullable. Transfer-create response now hydrated. `operator` sentinel `Unknown operator` restored (clients deref it unconditionally).

**Structural (why it must SPLIT):** PR-1 was **not** reader-free — it kept `?? rig.operatorId` fallbacks as live reads. So the "reader-free revision must be live before the DROP" requirement is satisfied only by PR-4's *reader* removal. But the *writers* can't stop before the drop (`Rig.operatorId` is NOT NULL → `rig.create` must supply it until the column is gone). Therefore:

- **PR-4a — reader removal only** (keep writers, keep `schema.prisma` fields, keep columns, no migration): the `?? rig.operatorId` deletions, includes→`hydrateRigOperator`, inverse-lookups→`getActiveRigForOperator`, `deployment-auth` legacy arm, feeds/cron, plus the new helpers and the two missed-reader fixes. Deployable with columns present → becomes the **reader-free live revision**. Deploy + soak.
- **PR-4b — writers + schema + DROP** (after PR-4a is confirmed live + prod gates green): remove W1–W12, remove the `schema.prisma` fields, run the **archive** migration then the **DROP** (both included in the reference build). Land the DROP **alone**, in a low-traffic window, with the recovery migration pre-staged.

**Pre-DROP GO/NO-GO (Reversibility + Data-retention agents), each blocking:**

1. **Reader-free revision LIVE** — the running prod revision's tree has zero Prisma **and raw-SQL** reads of `rigs.operatorId` / `rig_operators` / `vehicles.assignedOperatorId` (grep the deployed SHA).
2. **Drop-safety gate GREEN on PROD** — §6 Q1/Q2: every active rig has exactly one open PRIMARY; none serialize `operator:null`. (`getRequiredPrimaryForRig`/`hydrateRigOperator` correctness rests on this; it is enforced by the PR-2 index B, which must be landed + live first.)
3. **Archive taken** — the `_archive_legacy_operators_20260708` migration has run. **`vehicles.assignedOperatorId` was never mirrored into `deployment_assignments`** (the historian's headline) — this snapshot is its only retained successor; without it, any vehicle whose stored operator diverged from its active-rig PRIMARY is permanently unrecoverable.
4. **Restore point** — prod PITR / fresh backup confirmed; note the UTC timestamp.
5. **Drift review** — run the historian's two drift queries (legacy PRIMARY vs mirror; vehicles with no successor); both zero, or reconcile first.

### PR-4 SPLIT — produced + six-agent-verified (SPLIT IS SOUND)

The combined PR-4 was split and the full six-agent team re-reviewed the split:

- **PR-4a** (`batch5-pr4a-readers.patch`, 864 lines, code-only) — reader removal, **no migration, no schema change**, writers + columns kept. Applies onto `development` (after PR-1/2/2b). Six agents confirmed: 4a is genuinely reader-free (verified by grep across src + `.tsx`), compiles/runs with the columns present, and is a valid standalone backward-compatible live revision. **Fully reversible** (drops nothing).
- **PR-4b** (`batch5-pr4b-writers-drop.patch`, 307 lines, applies onto 4a) — removes W1–W12 writers, drops the schema fields, runs the archive then the transactional DROP. Its tree is **byte-identical to the reviewed combined build** (Fable: nothing lost or duplicated across the split). Product-lens: the split **ships invisibly** — the display helpers are identical in both halves, so the 4a-live soak window and the 4a→4b transition are user-invisible.

**Gate correction (antagonist):** because 4a removes the last legacy fallback, `getRequiredPrimaryForRig` now throws / lists serialize `operator:null` if the invariant is broken — so the **§6 Q1/Q2 drop-safety gate must be GREEN on the target DB before 4a goes live, not just before 4b.**

**Write-window refinement (calibration + reversibility, converged):** 4b bundles writer-removal *with* the DROP, so during 4b's non-atomic migrate→serve window the still-live 4a revision still *writes* `operatorId`/`assignedOperatorId`/`rig_operators` → create-deployment / add-vehicle / add-secondary / transfer-accept / handoff **500 for the migrate window** (write errors only, no corruption). Two options at 4b-deploy time — **decide before landing 4b:**
  - (a) **Deploy 4b in a low-traffic / maintenance window** and accept the brief write-blip (simplest; fine for this app's scale).
  - (b) **Three-phase** for zero blip: insert a 4b′ that first makes `rigs.operatorId` NULLABLE + removes the writers (columns kept, now neither read nor written), deploy + soak, then 4c = archive + DROP against a revision that neither reads nor writes the columns.

### FINAL sequencing — 3-PHASE (zero read+write blip), six-agent-verified

The write-blip option was replaced by a proper **expand/contract 3-phase** (the agents found that closing writes alone still left a *read* blip, because Prisma implicitly projects declared columns). Final patches:

- **PR-4a** `batch5-pr4a-readers.patch` — reader removal; columns + fields + writers kept. Fully reversible. (Pushing now.)
- **PR-4b′** `batch5-pr4b-writers-nullable.patch` (on 4a) — remove all legacy WRITES **and remove the fields from `schema.prisma`** (so the regenerated client stops both projecting *and* writing the columns) while KEEPING the DB columns (made nullable so inserts omitting `operatorId` succeed). Also migrates the last explicit reader — the admin operator-filter in deployments GET — to the assignment table (via a latest-PRIMARY LATERAL query that covers active **and** ended rigs, so the "show ended + filter by operator" history view still works). After 4b′ is live, the running revision touches the columns in **neither reads nor writes**.
- **PR-4c** `batch5-pr4c-drop.patch` (on 4b′) — pure archive + transactional DROP, no code/schema change; **commits the break-glass recovery SQL** to the branch. Runs against the read+write-free 4b′ revision → **zero read/write blip**.

Six agents on the split + rebuild confirmed: read-window **definitively closed** (client can't project a field the schema lacks), 4c byte-identical to the reviewed drop, irreversibility isolated to 4c alone. The obsolete 2-phase patches (`batch5-pr4b-writers-drop.patch`, `batch5-pr4-REFERENCE-needs-split.patch`) are superseded — delete them.

**Gate correction applies to 4c:** the Q1/Q2 drop-safety gate must be green on prod, 4b′ must be the live revision (grep the deployed SHA for zero reads/writes + schema no longer declares the fields), archive taken, PITR confirmed. Point of no return = the 4c migrate commit.

**Recovery migration STAGED:** `prisma/recovery/W0-10_forward_fix_readd_operator_columns.sql` — the break-glass re-add + backfill (reviewed by the SRE agent), to apply by hand if the DROP must be undone. Keep it out of `prisma/migrations/`.

**Recovery truth (SRE agent):** there is **no app-level rollback** — rolling the app back makes it worse (the old revision also reads the dropped columns). The only forward recovery is a re-add + backfill migration: `rigs.operatorId` ← open PRIMARY (lossless), `rig_operators` ← open SECONDARY with `startedAt` (lossless enough; ids re-minted, nothing FKs them), `vehicles.assignedOperatorId` ← derived from RigVehicle→active-rig→PRIMARY (**lossy** — hence the archive). The recovery migration SQL is staged in the agent output and should be committed alongside PR-4b before it deploys. **Point of no return = the instant the migrate job commits the DROP;** the human abort point is the merge button.

---

_Bottom line: PR-1 (readers) + PR-2 (invariants) are safe to build and ship now; PR-4 (writers + DROP) waits on PR-1's deploy + a green §6. The EmailLog alert is independent and shippable anytime. Nothing here is runtime-verified in the sandbox — the §4 pre-flights and §6 verification against the staging DB are the go/no-go gates before any index or drop._
