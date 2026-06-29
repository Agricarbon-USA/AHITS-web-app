# AHITS — #29 finale: slice 3c (authz/writer completion) → slice 4 (drop legacy columns)

_Prepared 2026-06-25. The plan to retire the legacy `Rig.operatorId` / `Rig.projectId` / `rig_operators` columns — the last of the #29 deployment-model refactor. Grounded in a fresh source audit (post F8/S-items/F2). This is a **plan**, not a one-shot script: slice 3c changes authorization on every deployment-mutation route, so it must land where the vitest suite runs and soak on staging before the irreversible slice 4. Prepared artifacts from the earlier readiness pass (`docs/prepared/slice4_precheck.sql`, `docs/prepared/slice4_drop_legacy.sql`) remain valid and are reused._

> **⚠️ READ §6 AND §7 FIRST — review corrections (2026-06-25). They supersede §1–§5.**
> - **§6** — the §1 grep UNDERCOUNTED: it missed Prisma *relation* reads (`RIG_INCLUDE`'s `operator`/`project` includes in 4 files; the `secondaryOperators` relation in 5 files incl. `daily-check`; the list `OR` filter). Replaces the exit criterion with a compile-against-pruned-schema gate. Fixes a bug: do NOT drop the `rig_operators` dual-writes in 3c.
> - **§7** — ENDED/historical regressions: the `?? rig.operatorId` fallback is load-bearing for ended deployments (don't just drop it); the operator LIST scope must match ANY assignment (not just open) or operators lose their history; the project delete-guard count must be all-time. **§7.F is the crux: two read shapes — open-assignment for authz, latest-regardless-of-endedAt for display/history.**
> - **§8** — repo-wide audit: slice 4 must ALSO remove schema back-relations (`User.rigs`, `User.secondaryRigs`, `Project.rigs`), update the **test fixtures/setup/queries**, and the **seed** — or the build fails after the drop. §8.E corrects the compile-gate to include these.
> - **§9 (decisive)** — the §8.F sweep was RUN and found 5 more reads outside the deployment routes (`dashboard/feeds`, `handoffs/[id]/accept`, `daily-check` find, `inventory` operator-filter, `transfers` list). **Conclusion (§9.A): the file lists here are a MAP, not a checklist — the §8.E compile-against-pruned-schema gate is the authoritative completeness check. Build 3c, then fix EVERY error the pruned-schema `tsc` surfaces; do not assume the enumerated sites are exhaustive.**

---

## 1. Current legacy-column footprint (audited 2026-06-25)

> ⚠️ These counts are an INITIAL audit and are KNOWN to undercount — §9 found 5 more routes the grep missed. Treat the table as a starting map; the §8.E compile gate is the real completeness check.

| Legacy read | Count | Files |
|---|---|---|
| `rig.operatorId` (authz ownership + value reads) | **22** | `transfers/[id]/accept`, `deployments/[id]/{operators,handoff,transfer,end,route,vehicles,items,items/[kitItemId]}`, `lib/deployment-handoffs.ts` |
| `rig_operators` (`prisma.rigOperator.*`, `rigId_operatorId`) | **17** | `deployments/[id]/{operators,transfer,end,route,vehicles,items,items/[kitItemId]}` |
| `rig.projectId` (functional reads) | **3** | `projects/[id]/route.ts:62` (rig count), `deployments/[id]/items/route.ts:155,230` (check-log project stamp) |

Plus the **writers** that still SET the legacy columns: `tx.rig.create({ data: { operatorId, projectId } })` in `deployments/route.ts` + `transfers/[id]/accept/route.ts` (operatorId is `NOT NULL` — must keep populating until slice 4 drops the column), and `rigOperator.upsert`/`deleteMany` in `deployments/[id]/operators/route.ts` (already dual-writing `ensureOpenAssignment`/`endAssignmentByRole` beside them).

All reads have a working `deployment_assignments` / `deployment_projects` equivalent (slices 1–3 keep them in sync via dual-write), so the migration is a mechanical swap — but it is **authorization** code, so correctness is paramount.

---

## 2. Slice 3c — authorization & writer completion (the predecessor to the drop)

**Goal:** every read of `rig.operatorId` / `rig_operators` / `rig.projectId` sources from `deployment_assignments` / `deployment_projects` instead. After 3c, nothing but the rig-create writers references the legacy columns, so slice 4 can drop them.

### 2.1 New helpers (add to `src/lib/deployment-assignments.ts`, raw SQL)
- `isActiveOperator(rigId, userId): Promise<boolean>` — EXISTS any open assignment (`endedAt IS NULL`) for `(rigId, userId)` **of any role**. This single helper replaces BOTH the primary check (`rig.operatorId === session.userId`) AND the secondary check (`rigOperator.findUnique(...)`) — the ownership question "may this user act on this rig?" is now "is this user an active operator on it?".
- `getActivePrimaryForRig(rigId): Promise<{ operatorId: string } | null>` — the open PRIMARY assignment, for **active-rig value** reads (vehicle `assignedOperatorId`, transfer-source operator). ⚠️ NOT for the response-shape "operator" display — that needs the DISPLAY roster (§7.A), since ended rigs have no open assignment.
- `getActiveProjectIdForRig(rigId): Promise<string | null>` — the first active `deployment_projects` link, for the check-log project stamp.
- ⚠️ `countActiveRigsForProject` was RENAMED/RESEMANTICIZED to **`countRigsEverLinkedToProject(projectId)`** (all-time, NO `removedAt` filter) — see §7.C. Use that.
- ⚠️ ALSO add **`getDeploymentRosterForDisplay(rigId)` + batch** (latest assignment per role regardless of `endedAt`) for response/display/history reads — see §7.A/§7.F.

### 2.2 The swaps (per file) — ⚠️ §6.1–§6.4, §7, §9 CORRECT THIS LIST; use the §5 handoff as the executable version
- **Ownership checks (the `!== session.userId` / `=== session.userId` pattern)** in `deployments/[id]/{end,transfer,route,vehicles,items,items/[kitItemId]}` and `transfers/[id]/accept` → `await isActiveOperator(rigId, session.userId)`, **preserving the admin short-circuit first (§6.3)**. Drop the adjacent `prisma.rigOperator.findUnique` secondary-check (subsumed).
- **Value reads of `rig.operatorId`** (vehicle assign in `deployments/[id]/vehicles`, transfer source in `transfers/[id]/accept`, handoff read in `lib/deployment-handoffs.ts`) → `getActivePrimaryForRig(rigId)`. ⚠️ The **response/display fallback** (`deployments/route.ts:130`, `[id]/route.ts:91`) is DIFFERENT — use the DISPLAY roster, NOT `getActivePrimaryForRig` (§7.A); and it's load-bearing for ended rigs, so don't just drop it.
- **`deployments/[id]/operators/route.ts`** — ⚠️ **SUPERSEDED by §6.2: do NOT drop the `rigOperator.upsert`/`deleteMany` dual-writes in 3c** (dropping them breaks the slice-4 precheck §4). KEEP the dual-writes; stop only the READS (the `findUnique`/`rig.operatorId===operatorId` guard → assignments).
- **`rig.projectId` reads** → `getActiveProjectIdForRig` (check-log stamp) and **`countRigsEverLinkedToProject`** (projects delete-guard — §7.C, all-time count).
- **Writers** `tx.rig.create({ data: { operatorId, projectId } })`, the `operators/route` rigOperator dual-writes, and the handoff `rig.update` — LEAVE all of them (operatorId is `NOT NULL`); removed together in slice 4.
- ⚠️ **The list above is NOT exhaustive (§9):** also dashboard/feeds, handoffs/[id]/accept, daily-check (find + secondaryOperators), inventory operator-filter, transfers list. The §8.E compile gate is the authoritative completeness check.

### 2.3 Why this needs the test suite (do it in Claude Code, not blind)
This rewrites the authorization gate on **every deployment mutation**. The vitest specs that protect it — transfers, auth/PIN/invite-RBAC, consumable scoping — need the Postgres service container (CI / local Docker), which the analysis sandbox can't run. **Land 3c as its own PR, get the full vitest suite green, and soak it on staging** (exercise: operator acts on own rig, secondary operator acts, non-operator is 403'd, transfer accept, handoff accept, end deployment) before going near slice 4.

### 2.4 Slice 3c exit criteria — ⚠️ SUPERSEDED by §6.6 → §8.E (grep is NOT the gate)
~~grep returns only the two `tx.rig.create` writers~~ — wrong on both counts: (1) grep missed the relation reads (§6.1) and 5 routes (§9), so it's not a completeness check; (2) more than "two writers" stay (rig.create ×2, the `operators/route` rigOperator dual-writes, the handoff `rig.update`). **The real gate is §8.E: the pruned-schema `prisma generate` + `tsc` (incl. tests) shows ONLY the known writers + slice-4 test/seed lines.** Plus: vitest green, staging soak clean.

---

## 3. Slice 4 — drop the legacy columns (irreversible; gated on 3c + soak)

Only after 3c is merged, vitest-green, and soaked:

1. **Pre-check:** run `docs/prepared/slice4_precheck.sql` against the DB — all six consistency queries must return **zero rows** (no operator with two open PRIMARY assignments; active rigs map 1:1 to an open PRIMARY; legacy vs assignment consistency; no orphans).
2. **reassignPrimary smoke** (`AHITS_SESSION11_SLICE4_READINESS.md` §4) on staging — free an operator, hand off, accept, verify the assignment swap + vehicle reassignment + the one-active-PRIMARY invariant.
3. **Promote `docs/prepared/slice4_drop_legacy.sql`** into a real timestamped migration. It: (a) adds the partial unique index `deployment_assignments (operatorId) WHERE role='PRIMARY' AND endedAt IS NULL` — the real one-active-PRIMARY-per-operator invariant (closes CR-14); (b) `DROP TABLE rig_operators`; (c) `ALTER TABLE rigs DROP COLUMN projectId`; (d) `ALTER TABLE rigs DROP COLUMN operatorId`.
4. **Edit `schema.prisma`** — remove `operatorId`/`projectId`/`operator`/`project` from `model Rig`, delete `model RigOperator`, **AND remove the opposite relations `User.rigs`, `User.secondaryRigs`, `Project.rigs` (§8.A — else `prisma generate` fails)**. Then remove the legacy-column WRITERS: the `tx.rig.create` `operatorId`/`projectId` data, the `rigOperator.upsert`/`deleteMany` in `operators/route.ts`, and the handoff `rig.update({ data:{ operatorId } })`. **Also update the test suite (§8.B: `tests/helpers/fixtures.ts` createRig → PRIMARY assignment, `tests/setup.ts` remove `rigOperator.deleteMany`, `tests/transfer-lifecycle.test.ts:76` query via assignments) and the seed (§8.C: `prisma/seed.ts` + `prisma/import-field-inventory.ts`).** (None of this compiles until 3c removed every READ — the §6.6/§8.E gate.)
5. `make db-generate`; the A2 pipeline auto-applies the migration on merge. **Irreversible** — take a DB snapshot first; Cloud Run revision rollback can revert code but not a dropped column.

> Note (one-environment): with A2, the drop migration auto-applies on merge to `development`. Because it's irreversible, treat this PR with extra care — snapshot the DB immediately before merging, and confirm the precheck + soak are green on the *same* commit.

---

## 4. Sequencing summary
**3c (PR, vitest-green, soak)** → precheck zero rows + reassignPrimary smoke → **slice 4 (snapshot → drop migration + schema edit → merge)**. 3c is medium-blast-radius but reversible; slice 4 is small but irreversible. The gap between them (a staging soak) is the safety margin.

## 5. CC handoff for slice 3c (corrected per §6 + §7; slice 4 held until 3c soaks)
```
Build #29 slice 3c (authz/writer completion) on AHITS. Read AHITS_29_SLICE3C_4_PLAN.md §6 + §7 + §9 FIRST — they correct earlier sections. This rewrites authorization on every deployment-mutation route; vitest MUST be green. tsc/lint clean. Drop NO legacy column/table in this PR (that's slice 4). Branch off development.

AUTHORITATIVE COMPLETENESS CHECK (§9.A): the file/site lists below are a MAP, not an exhaustive checklist — 4 review passes each found more reads. The real gate is §8.E: prune the columns+relations in a scratch schema, prisma generate, tsc over the whole project incl tests, and FIX EVERY read/include/relation error it surfaces (only the known writers + test/seed lines may remain). Reads NOT listed below (e.g. dashboard/feeds, handoffs/[id]/accept, daily-check find, inventory operator-filter, transfers list — §9) MUST also be migrated; the gate catches them.

KEY MENTAL MODEL (§7.F): there are TWO read shapes — (a) AUTHZ "can act now" → OPEN assignment only; (b) DISPLAY/HISTORY/SCOPE → latest assignment REGARDLESS of endedAt (works for ended deployments). Classify every read into one.

1. Helpers in lib/deployment-assignments.ts (raw SQL over deployment_assignments / deployment_projects):
   - isActiveOperator(rigId,userId): EXISTS open (endedAt IS NULL) assignment, any role. [authz]
   - getActivePrimaryForRig(rigId): open PRIMARY. [authz/current value]
   - getDeploymentRosterForDisplay(rigId) + batch (rigIds): latest assignment per role REGARDLESS of endedAt (open if present else last ended), for response operator/secondaryOperators. [display — §7.A]
   - getActiveProjectIdForRig(rigId): first active deployment_projects link. [check-log stamp]
   - countRigsEverLinkedToProject(projectId): COUNT(DISTINCT rigId) in deployment_projects, NO removedAt filter. [delete-guard — §7.C]
2. Ownership checks (=== / !== session.userId) in deployments/[id]/{end,transfer,route,vehicles,items,items/[kitItemId]} + transfers/[id]/accept → isActiveOperator(...), PRESERVING the admin short-circuit FIRST (if role!=='ADMIN' && !await isActiveOperator). Drop the adjacent rigOperator.findUnique secondary checks (subsumed). [§6.3]
3. VALUE reads of rig.operatorId (vehicles assignedOperatorId, transfer source, lib/deployment-handoffs.ts read) → getActivePrimaryForRig(...). Handoff: migrate the READ, KEEP the rig.update operatorId WRITE. [§6.4]
4. RELATION reads (the part the first grep missed — §6.1): rewrite all 4 RIG_INCLUDE defs + ~6 include-response sites to NOT include operator/project; rebuild those response fields from getDeploymentRosterForDisplay + deployment_projects. Replace secondaryOperators relation reads in 5 files (incl. daily-check) with roster reads.
5. Deployments LIST operator scope (deployments/route.ts:118): rewrite to ANY assignment (NO endedAt filter): rig.id IN (SELECT rigId FROM deployment_assignments WHERE operatorId=me). So operators still see ENDED deployments. [§7.B]
6. Response fallbacks operatorId: ro.operatorId ?? rig.operatorId (route.ts:130, [id]/route.ts:91): switch ro to the DISPLAY roster, then remove the ?? fallback (display roster covers ended rigs). [§7.A]
7. rig.projectId: projects/[id] count → countRigsEverLinkedToProject; deployments/[id]/items check-log stamp → getActiveProjectIdForRig.
8. KEEP all writers: tx.rig.create operatorId/projectId, the operators/route rigOperator.upsert/deleteMany dual-writes (do NOT drop — §6.2), and the handoff rig.update. operators/route POST guard rig.operatorId===operatorId → getActivePrimaryForRig. Don't touch checkLog/dailyCheck .operator includes (NOT rig relations — §7.D).

EXIT GATE (§6.6, replaces grep): in a scratch schema.prisma, remove operatorId/projectId/operator/project from model Rig + delete model RigOperator, prisma generate, tsc — the ONLY errors may be the known WRITER lines (kept intentionally). Zero read/include errors = done. (Revert the scratch schema; it's slice 4's job.)

Tests (§6.5 + §7.E): add (a) secondary operator acts; (b) non-operator 403; (c) admin bypass; (d) list returns a secondary's rig; (f) GET an ENDED deployment shows operator+secondary; (g) operator "Show ended" returns their past deployments; (h) deleting a project with an ended deployment is blocked.

Verify: tsc 0, eslint 0, vitest GREEN. PR to development, run pr-staging-deploy.yml, gh run watch. Soak on staging: operator acts on own rig; secondary acts; non-operator 403'd; transfer accept; handoff accept; end a deployment then view it (operator still shown) and view it in the operator's "Show ended" list. Report PR # + soak. Do NOT proceed to slice 4 until green + soaked.
```

---

## 6. Detailed review — corrections (2026-06-25; supersedes §1–§5 where they conflict)

A second-pass review against source found the §1 grep-based footprint **undercounted**, plus a real bug in §2.2. Corrections:

### 6.1 The footprint was incomplete — Prisma RELATION reads were missed
The §1 grep matched scalar reads (`rig.operatorId`, `rigOperator.`, `rig.projectId`) but missed the typed-client **relation** reads, which also break when slice 4 drops the columns/table:
- **`RIG_INCLUDE` (defined in 4 files** — `deployments/route.ts`, `[id]/route.ts`, `[id]/vehicles/route.ts`, `[id]/items/route.ts`) includes `operator: { select … }` (Rig→User via `operatorId`) and `project: { select … }` (Rig→Project via `projectId`). These `include`s reference relations that **vanish** when slice 4 drops `operatorId`/`projectId` → **tsc fails to compile + runtime errors.** Each must be removed from `RIG_INCLUDE`, and the response's `operator`/`project` fields reconstructed from `getDeploymentRoster()` (assignments) + `deployment_projects` — exactly as `deployments/[id]/route.ts` GET (line 88) already does. Audit every `findUniqueOrThrow({ include: RIG_INCLUDE })` / `update({ include: RIG_INCLUDE })` response (≈6 call sites) and rebuild the shape from the roster.
- **`secondaryOperators` relation (the `rig_operators` relation) read in 5 files** — `deployments/route.ts`, `[id]/route.ts`, `[id]/operators/route.ts`, `lib/deployment-assignments.ts`, **and `daily-check/route.ts`** (a route §1 never inspected). All break when `RigOperator` is deleted. Replace with assignment reads (`getDeploymentRoster().secondaryOperators` / `isActiveOperator`).
- **Deployments LIST filter** (`deployments/route.ts:118`): `OR: [{ operatorId: session.userId }, { secondaryOperators: { some: { operatorId: session.userId } } }]` — both legacy reads. Rewrite to filter rigs by an open `deployment_assignments` row for the user (a `rig.id IN (SELECT rigId FROM deployment_assignments WHERE operatorId = me AND endedAt IS NULL)` subquery, or compute the id set first like the `projectRigIds` pattern already in that file).

**Net:** 3c is materially larger than "22+17+3 scalar reads" — it must also rewire 4 `RIG_INCLUDE`s + ≈6 include-response sites, the `secondaryOperators` relation in 5 files (incl. daily-check), and the list filter.

### 6.2 BUG in §2.2 — do NOT drop the `rig_operators` dual-writes in 3c
§2.2 said to drop `rigOperator.upsert`/`deleteMany` in `operators/route.ts`. **Don't.** If writes stop while assignments keep updating, `rig_operators` goes stale → `slice4_precheck.sql` §4 (rig_operators ↔ SECONDARY-assignment consistency) flags *expected* divergence and the gate becomes useless. **Keep the dual-writes through 3c** (stop only the READS), mirroring how `tx.rig.create` keeps writing `operatorId`/`projectId`. Slice 4 drops the table **and** these writes together. Also: `operators/route.ts` POST has a `rig.operatorId === operatorId` guard (a read) → migrate to `getActivePrimaryForRig(id)?.operatorId === operatorId`.

### 6.3 Preserve the admin bypass (confirmed both styles exist)
Every ownership check short-circuits admins — two forms: `if (role !== 'ADMIN' && rig.operatorId !== me) 403` and `if (role === 'ADMIN') return rig; if (rig.operatorId === me) return rig`. The swap must keep the admin check FIRST (so admins never hit the extra `isActiveOperator` query): `if (role !== 'ADMIN' && !(await isActiveOperator(rigId, me))) 403`.

### 6.4 Handoff path reads AND writes operatorId
`lib/deployment-handoffs.ts reassignPrimary` reads `rig.operatorId` (to end the old PRIMARY, line 35) and **writes** it (`tx.rig.update({ data: { operatorId } })`, line 37). Migrate the READ (end the current open PRIMARY via `getActivePrimaryForRig`/`endAssignmentByRole`, and have the caller pass that instead of `rig.operatorId`); **keep the WRITE** until slice 4. Same keep-the-writer discipline.

### 6.5 Minor
- **Response fallback** `operatorId: ro.operatorId ?? rig.operatorId` (`[id]/route.ts:91`, `deployments/route.ts:130`) — **DO NOT simply drop this; it is load-bearing for ENDED deployments. See §7.A** (the roster filters `endedAt IS NULL`, so for ended rigs `ro.operatorId` is null and the fallback fires).
- **Multi-project check-log stamp:** a rig can now have multiple `deployment_projects`; `getActiveProjectIdForRig` picks the first — lossy but no worse than the old single `projectId`. Acceptable; note it.
- **Perf:** `isActiveOperator` adds one indexed query per mutation where the rig was already loaded; admin short-circuit avoids it for admins; don't call it twice in one handler (compute once).
- **Test coverage:** don't rely on existing specs alone — ADD tests for (a) a SECONDARY operator acting (isActiveOperator via SECONDARY), (b) a non-operator 403, (c) admin bypass, (d) the deployments LIST returns a secondary operator's rig. These exercise the exact paths the relation-read rewrite touches.

### 6.6 Stronger exit criterion (replaces §2.4's grep) — ⚠️ itself superseded by §8.E (which adds the back-relation removal + tests to the prune); use §8.E as the final gate
Grep is necessary but **not sufficient** (it missed the relations). The real gate: **temporarily remove `operatorId`/`projectId`/`operator`/`project` from `model Rig` and delete `model RigOperator` in a scratch `schema.prisma`, `prisma generate`, and run `tsc` — it must compile with zero errors.** That proves every read (scalar AND relation) is migrated. This is exactly slice 4's schema edit, so 3c is "done" precisely when slice 4's schema change compiles. Keep the writers (they reference columns that still exist until the migration runs, so guard the scratch-compile by also stubbing the create-data — or simpler: 3c is done when the only build errors from pruning the schema are the known writer lines).

### 6.7 Slice 4 timing under A2 (auto-migrate)
Because A2 auto-applies the migration on merge, there's no manual "apply → verify → deploy" gate for the irreversible drop. So: run `slice4_precheck.sql` + the reassignPrimary smoke on the EXACT commit being merged, take a Supabase snapshot immediately before merge, and merge only then. The drop SQL is wrapped in BEGIN/COMMIT (atomic). Rollback = restore snapshot (a reverted Cloud Run revision can't bring back a dropped column).

---

## 7. FINAL review (2026-06-25) — ENDED/historical-deployment regressions (highest-priority corrections)

The §6 pass fixed the *active*-path reads. This pass checked the **ended/historical** paths — where "migrate to open-assignment reads" silently regresses, because the legacy columns persist after a deployment ends but `deployment_assignments` are all `endedAt`-stamped. Two are production-data regressions; treat them as must-fix in 3c.

### 7.A (CRITICAL) The `?? rig.operatorId` fallback is load-bearing for ENDED deployments — don't just drop it
`getDeploymentRosters` filters `a.endedAt IS NULL` (deployment-assignments.ts:55). So for an **ended** rig (its assignments are all ended), `ro.operator`/`ro.secondaryOperators` come back **empty**, and the response only shows the operator because of `?? rig.operatorId` (`deployments/route.ts:130`, `[id]/route.ts:91`). If 3c drops the fallback and slice 4 drops `rig.operatorId`, **every ended/historical deployment loses its operator + secondary names** in the list ("Show ended") and the detail view.
**Fix:** add a **display roster** that returns the most-recent assignment per role **regardless of `endedAt`** — e.g. `getDeploymentRosterForDisplay(rigId)` (and a batch `…ForDisplay(rigIds)`): for each rig+role, pick the latest by `startedAt` (open if present, else the last ended one). Source the response `operator`/`secondaryOperators`/`project` from THIS for both active and ended rigs. Only after that is the `?? rig.operatorId` fallback safe to remove. The `RIG_INCLUDE` `operator`/`project` rebuild (§6.1) must use the display roster too, or ended deployments render blank.

### 7.B (CRITICAL) Operator LIST scope must match ANY assignment, not just open ones
The deployments list shows active AND ended deployments (`endedAt: null` vs `{not:null}`), and operators are scoped via `OR:[{operatorId},{secondaryOperators:{some…}}]` — which matches ended deployments too (legacy columns persist). If §6.1's rewrite scopes operators to rigs with an **open** assignment, then toggling **"Show ended" returns nothing** for operators — they lose their entire deployment history.
**Fix:** the operator-membership subquery must match **any** `deployment_assignments` row for the user (NO `endedAt IS NULL` predicate): `rig.id IN (SELECT "rigId" FROM "deployment_assignments" WHERE "operatorId" = me)`. The rig's own active/ended is filtered separately by `rig.endedAt`. (Active-rig authz checks in §6.3 DO use the open-assignment `isActiveOperator`; only the LIST *scope* uses any-assignment. Keep the two distinct.)

### 7.C (MEDIUM) Project delete-guard count must be all-time, not active-only
`projects/[id]/route.ts:62` `prisma.rig.count({ where:{ projectId } })` counts **all** rigs ever linked (active + ended) — it's a delete-guard that blocks deleting a project whose deployments (incl. historical) would be orphaned. A helper named `countActiveRigsForProject` (§2.1) would **undercount** and let a project with historical deployments be deleted, orphaning check-log history. **Rename/define it `countRigsEverLinkedToProject(projectId)` = COUNT(DISTINCT rigId) FROM `deployment_projects` WHERE projectId = id (NO `removedAt` filter).**

### 7.D (no-op — do NOT "fix") `daily-check` / `history` `operator` includes are NOT rig relations
`deployments/[id]/history/route.ts` includes `operator: {…}` on **`checkLog`** (CheckLog→User via `checkLog.operatorId`) — unrelated to `Rig.operatorId`. Likewise `daily-check`'s `operator` is the DailyCheck author. These survive the column drop untouched. Only the `secondaryOperators` read in `daily-check` (§6.1) needs migrating. Flag so CC doesn't over-reach and rewrite working code.

### 7.E Add these to the 3c regression tests
Beyond §6.5's list: (f) GET an **ended** deployment → operator + secondary names still present; (g) the list with "Show ended" as an OPERATOR → returns that operator's past deployments; (h) deleting a project that has an **ended** deployment is still blocked (delete-guard). These three guard exactly the §7 paths and would otherwise pass silently while broken.

### 7.F Two-roster mental model (the crux)
3c has **two** read shapes, and conflating them is the trap:
- **Authz / "can act now"** → open assignment only (`isActiveOperator`, `getActivePrimaryForRig`). Active rigs.
- **Display / history / scope** → latest assignment regardless of `endedAt` (`…ForDisplay`, any-assignment list scope). Active AND ended rigs.
Every read migrated in 3c must be classified into one of these. The compile-against-pruned-schema gate (§6.6) proves the *columns* are gone; the §7.E tests prove the *historical semantics* survived.

---

## 8. EXHAUSTIVE final audit (2026-06-25) — repo-wide (schema back-relations, tests, seed)

A whole-repo sweep (not just app routes) found three more **slice-4** must-fixes. None affect 3c's *runtime* reads, but all break the **build/CI after the column drop** — so they belong in the slice-4 PR and in the §6.6 gate. Without them, slice 4 looks done, auto-deploys via A2, and fails.

### 8.A (CRITICAL — schema) Opposite relation fields on User & Project must be removed in slice 4
Dropping `Rig.operator`/`project` and `model RigOperator` leaves **dangling opposite relations** — `prisma validate`/`generate` fails *before* tsc even runs. Slice 4's schema edit must ALSO delete:
- `User.rigs Rig[] @relation("OperatorRigs")` (schema ~L32) — opposite of `Rig.operator`.
- `User.secondaryRigs RigOperator[] @relation("RigSecondaryOperators")` (schema ~L33) — opposite of `RigOperator`.
- `Project.rigs Rig[]` (schema ~L17) — opposite of `Rig.project`.
Audit after removal: `grep -nE "OperatorRigs|RigSecondaryOperators|RigOperator" prisma/schema.prisma` returns nothing.

### 8.B (CRITICAL — tests) Fixtures/setup/queries use the legacy columns; the suite won't compile after the drop
The vitest suite — the safety net — itself uses them:
- `tests/helpers/fixtures.ts:91-93` `createRig(operatorId)` → `data: { operatorId }`. After slice 4, `createRig` must create a **PRIMARY `deployment_assignment`** instead (and not set `operatorId`). Every test calling `createRig` depends on this.
- `tests/setup.ts:59` `prisma.rigOperator.deleteMany()` (teardown) — remove (table gone; assignments cleared via their own deleteMany).
- `tests/transfer-lifecycle.test.ts:76` `prisma.rig.findFirst({ where: { operatorId: op2.id, endedAt: null } })` — rewrite to find via `deployment_assignments` (open PRIMARY for op2).
- NON-issue (do NOT touch): `tests/wave-a-correctness.test.ts:180` `dailyCheck.count({ where:{ operatorId } })` is `DailyCheck.operatorId`, not Rig.

### 8.C (CRITICAL — seed) `prisma/seed.ts` + `prisma/import-field-inventory.ts` create rigs with `operatorId`/`rig_operators`/`projectId`
Slice 4 must update both to create `deployment_assignments` (PRIMARY/SECONDARY) + `deployment_projects` instead of the legacy columns, or `make db-seed` and the import break. Dev-only (not a prod runtime risk), but it breaks local setup + any CI seed step.

### 8.D (confirmed NON-issues — do NOT "fix")
- Raw-SQL `JOIN "rigs"` in `inventory/route.ts:37` and `lib/project-associations.ts:16,62` use only `r.id`/`r.endedAt`/`rigId` — they do NOT read `operatorId`/`projectId`. Safe.
- `checkLog.operator` / `dailyCheck.operator` includes (§7.D) — author relations, not `Rig`. Safe.

### 8.E Gate correction (supersedes §6.6) — the scratch-prune must include back-relations + tests
The §6.6 compile-gate, done fully:
1. Scratch `schema.prisma`: remove `operatorId`/`projectId`/`operator`/`project` from `model Rig`, delete `model RigOperator`, AND remove `User.rigs`, `User.secondaryRigs`, `Project.rigs` (8.A) — else `prisma generate` fails first.
2. `prisma generate` → must succeed (proves no dangling relations).
3. `npx tsc --noEmit` over the **whole project incl. `tests/`**.
4. **Expected remaining errors = ONLY**: the kept writer lines (`tx.rig.create` data, `rigOperator.upsert`/`deleteMany`, handoff `rig.update`) + the test fixture/setup/query lines (8.B) + the seed (8.C). All deleted/rewritten in slice 4. **Zero unexpected read/include/relation errors = 3c done.** Revert the scratch schema — the real edit is slice 4's.

### 8.F Honest status: this pass was NOT clean
This 4th pass found 8.A/8.B/8.C — now folded in. Per the "100% clean pass before we proceed" bar, **run one more confirming sweep that finds nothing new** before executing 3c:
```
grep -rnE "operatorId|projectId|rigOperator|secondaryOperators|OperatorRigs|RigSecondaryOperators" src tests prisma --include=*.ts --include=*.prisma \
 | grep -viE "deployment_|[aA]ssignment|hubId|assignedOperator|forOperator|fulfillerOperator|homeHub|checkLog|check_log|dailyCheck|daily_check|shipTo|InventoryItem|operatorRate|TimeEntry"
```
Every remaining hit must be either a known WRITER (kept through 3c) or a listed slice-4 schema/test/seed edit — nothing unclassified. When that sweep is clean, the plan is at the 100% bar.

---

## 9. The §8.F sweep was run — 5 MORE routes found (the decisive meta-finding)

Running the §8.F sweep surfaced **five more legacy `Rig.operatorId` reads outside the deployment-mutation routes** that §1/§6/§7 enumerated — proving the per-file lists are **non-exhaustive guides, not the gate**:
- `dashboard/feeds/route.ts:36,83-85` — `prisma.rig.findMany({ select: { …, operatorId, operator } })` for the "missed checks today" feed (DISPLAY read → use display roster / select the open PRIMARY per active rig).
- `handoffs/[id]/accept/route.ts:47,52` — `rig.findUnique select operatorId` + `rig.findFirst where { operatorId: toOperator, endedAt: null }` (the target-has-active-rig guard → `getActivePrimaryForRig`/an "operator has an open PRIMARY" check).
- `daily-check/route.ts:155` — `rig.findFirst where { operatorId: me, endedAt: null }` to prefill the active rig (AUTHZ/current → "my open assignment's rig"). _(daily-check also has the `secondaryOperators` OR-filter at :94-95 — §6.1.)_
- `inventory/route.ts:54-58` — the `?operatorId=` filter `kit: { rig: { endedAt: null, operatorId } }` (rewrite via `deployment_assignments`, like F8 did the project filter).
- `transfers/route.ts:36,41` — list scope `fromRig = { operatorId: me }` (SCOPE → any/open assignment).
- **False alarm (do NOT touch):** `checkout/route.ts:35` `{ operatorId }` is `CheckLog.findMany` (`CheckLog.operatorId`), not Rig.

### 9.A Decisive conclusion — TRUST THE COMPILE-GATE, not the enumeration
Four review passes each found more reads (deployment routes → relations → ended-paths → schema/tests/seed → feed/list/filter routes). The enumeration is converging but has repeatedly been incomplete. **Therefore: the §8.E compile-against-pruned-schema gate is the authoritative completeness check, and the file lists in this plan are an onboarding guide, NOT a checklist to tick off.** CC must run the gate and fix EVERY error it surfaces — not assume the listed sites are exhaustive. A read missed by every list (like these five) is still caught the instant the pruned schema fails to compile. The gate is what makes "100% clean" achievable; the enumeration alone never will be.

### 9.B Honest status
Still not enumeration-clean (found 5 more, now listed). But that's expected and acceptable **because the gate, not the list, is the bar.** The plan is execution-ready when: 3c is built, then the §8.E pruned-schema compile shows ONLY known writers + test/seed lines (every other error fixed), vitest is green (incl. §7.E historical tests), and the §8.F grep returns only classified hits. Run 3c against the GATE; treat §1/§6/§7/§9 as the map, not the territory.
