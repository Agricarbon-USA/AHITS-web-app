# AHITS — Session 11: #29 Slice 4 (Contract) Readiness & the Missing Slice 3c

_Prepared 2026-06-25. Records a from-source audit of whether the deployment-model legacy columns can be dropped (slice 4), the finding that they cannot yet, the predecessor slice (3c) that must land first, and the prepared — but gated — pre-check + drop migration + smoke checklist._

---

## 1. The headline finding

The Session 10 Addendum (§1) describes slice 4 as "the only irreversible step" remaining on #29 and implies it is close behind a staging soak. **A source audit says otherwise: the legacy columns are still load-bearing for authorization and the secondary-operator path.** Slice 1 added dual-writes and slice 2 migrated the *response-shape* readers (`getDeploymentRosters` feeds `GET /api/deployments` etc.), but the **authorization checks and the add/remove-operator writes still read `rigs.operatorId`, `rigs.projectId`, and the `rig_operators` table directly.**

Dropping those columns now would break the app at runtime — and would not even compile, because `schema.prisma` removing `Rig.operatorId` invalidates ~18 `rig.operatorId` reads at type-check time. So there is a real intermediate slice between 3b and 4, not captured in the addendum. Call it **slice 3c — authorization & writer completion.**

This is exactly the "confirm nothing else reads those columns before dropping" gate the addendum named (§1, slice 4 bullet). The answer, verified: **many things still read them.**

## 2. The 35 remaining legacy-column dependencies (slice 3c scope)

Counts from `grep` over `src/` on 2026-06-25.

### 2a. `rigs.operatorId` — primary-operator authorization reads (18 sites)

The ownership check `rig.operatorId !== session.userId` (and its `=== session.userId` fast-path) appears across the deployment-mutation routes:

- `deployments/[id]/route.ts` (GET shape + PATCH guard, lines 81, 91, 105)
- `deployments/[id]/end/route.ts:62`
- `deployments/[id]/transfer/route.ts:50, 68`
- `deployments/[id]/vehicles/route.ts:57, 117` (and copies vehicle assignment from `rig.operatorId`)
- `deployments/[id]/items/route.ts:87, 99, 338`
- `deployments/[id]/items/[kitItemId]/route.ts:37`
- `deployments/[id]/operators/route.ts:29, 31`
- `deployments/[id]/handoff/route.ts:24, 29, 37, 47, 52`
- `deployments/route.ts:117` (response shape fallback `ro.operatorId ?? r.operatorId`)
- `transfers/[id]/accept/route.ts:182`, `transfers/route.ts:36, 41` (`fromRig.operatorId` filter)

**Migration:** add a single helper `isActiveOperator(rigId, userId)` to `src/lib/deployment-assignments.ts` (one open assignment of any role for that rig+user) and a `getActivePrimaryForRig(rigId)`; replace every `rig.operatorId === session.userId` ownership test with `isActiveOperator(...)`, and every `rig.operatorId` value-read (vehicle assign, transfer source, response fallback) with the PRIMARY assignment lookup.

### 2b. `rig_operators` table — secondary-operator reads/writes (9 `rigOperator.*` + 8 composite-key sites)

- **Writes:** `deployments/[id]/operators/route.ts:36` (`upsert`) and `:58` (`deleteMany`) — already dual-writing `ensureOpenAssignment`/`endAssignmentByRole` next to them.
- **Reads (authz "is this user a secondary?"):** `transfer`, `end`, `route` (PATCH), `vehicles`, `items`, `items/[kitItemId]` — all do `prisma.rigOperator.findUnique({ where: { rigId_operatorId: ... } })`.

**Migration:** the `isActiveOperator` helper from 2a subsumes every secondary read (it already covers SECONDARY assignments). Then the `rigOperator.upsert`/`deleteMany` dual-writes can be dropped — the `ensureOpenAssignment`/`endAssignmentByRole` calls already beside them become the sole writers.

### 2c. `rigs.projectId` — project reads (3 sites)

- `deployment-requests/route.ts:50` (`d.projectId` in a response) — switch to the active `deployment_projects` link.
- `projects/[id]/route.ts:62` (`prisma.rig.count({ where: { projectId } })`) — count via `deployment_projects`.
- `deployments/[id]/items/route.ts:152, 226` (`rig.projectId` stamped onto check-log `projectId`) — read the active project link instead.

### 2d. Writers that still SET the legacy columns (keep until the drop)

`deployments/route.ts:151` and `transfers/[id]/accept/route.ts:119` still `tx.rig.create({ data: { operatorId, projectId } })`. `operatorId` is `NOT NULL`, so rig creation must keep populating it **until** the drop migration removes the column. In 3c these stay; in slice 4 the column goes and these `data` keys are removed in the same change.

## 3. Recommended sequencing (revised)

1. **Slice 3c — authz & writer completion** (above). Medium blast radius: it changes the authorization path on every deployment mutation, so it **must** be verified against the vitest transfer/auth/RBAC specs (which need the Postgres service container — run in CI or locally with Docker, not in the build sandbox). Land as one PR, soak on staging.
2. Run **`slice4_precheck.sql`** against the target DB — all six queries must return zero rows.
3. Run the **reassignPrimary smoke** (§4) on staging.
4. Promote **`slice4_drop_legacy.sql`** into a real migration, edit `schema.prisma`, `make db-generate && db-migrate`, deploy. Irreversible.

Slice 3c was **not** built this session: it is high-blast-radius authorization code and the regression suite that protects it cannot run in this sandbox (no Docker/Postgres). Building it blind would violate the project's own "schema refactor + full regression pass" discipline. It is the recommended **next** #29 step, done where the tests run.

## 4. reassignPrimary real-data smoke checklist (staging)

The 3a backend could not be smoke-tested (staging had only two operators, both with active rigs). To run it now:

1. Free an operator: end one operator's active deployment (My Deployment → End), so they have **no** open PRIMARY assignment.
2. As the holding operator, initiate **Hand Off Deployment** to the freed operator.
3. As the freed operator, **Accept** the handoff.
4. Verify, in the DB or admin views:
   - the prior operator's PRIMARY assignment is `endedAt`-stamped; a new open PRIMARY exists for the receiver;
   - legacy `rigs.operatorId` was updated to the receiver (dual-write still in effect until slice 4);
   - any rig vehicles' `assignedOperatorId` followed to the receiver;
   - the audit log recorded the reassignment;
   - **invariant gate:** `SELECT "operatorId", count(*) FROM "deployment_assignments" WHERE "role"='PRIMARY' AND "endedAt" IS NULL GROUP BY 1 HAVING count(*)>1;` returns nothing (no operator ended up with two active deployments).
5. Repeat the decline and admin-force paths.

## 5. Prepared artifacts (this session)

- `docs/prepared/slice4_precheck.sql` — six read-only consistency gates. Run before the drop.
- `docs/prepared/slice4_drop_legacy.sql` — the gated, transactional drop migration (unique index + drop `rig_operators` + drop `rigs.projectId`/`operatorId`). Stored outside `prisma/migrations/` so it is never auto-applied. Exact FK/index names confirmed against `20260615120000_add_sprint_core_tables`.

Nothing in §5 has been applied, committed, or added to the schema. Slice 4 remains blocked on slice 3c + the soak + a clean precheck.
