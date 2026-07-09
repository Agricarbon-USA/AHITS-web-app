-- W0-10 PR-2 · FND-23 assignment invariants — indexes A, B, D (additive; precede PR-4 DROP).
--
-- Three partial UNIQUE indexes that structurally enforce the ownership invariants the
-- deployment_assignments readers (shipped in PR-1) rely on. DB-level only: Prisma cannot
-- model a filtered (WHERE) unique index in schema.prisma, so there is NO schema change in
-- this PR and `prisma migrate dev` must NOT be run to "sync" them (matches the repo's
-- existing raw-SQL partial-index migrations, e.g. deployment_handoffs_one_pending_per_rig).
-- Applied by `prisma migrate deploy` (the CI migrate job) only. IF NOT EXISTS makes the
-- migration safe to re-run after a manual duplicate reconciliation created an index by hand.
--
-- NON-CONCURRENT by design: these tables are small in this workload, so the brief lock is
-- negligible, and non-concurrent CREATE runs safely inside migrate (CREATE INDEX
-- CONCURRENTLY cannot run in a transaction). Each statement FAILS LOUDLY if the data already
-- violates the invariant — intended: a failed migrate blocks the deploy rather than silently
-- corrupting operator attribution. So the pre-flights below MUST return ZERO rows on the
-- TARGET DB, and this is a HARD PROD GATE: the prior parity gate ran on STAGING ONLY — run
-- these on PROD, reconcile any rows BY HAND (operator/payroll attribution decision — never
-- auto-close), and re-run immediately before the production merge (legacy writers still run
-- pre-PR-4, so data can drift between an earlier check and the deploy).
--
-- Pre-flight (Supabase SQL editor; each must return zero rows):
--   -- (A) SELECT "operatorId",COUNT(*) FROM "deployment_assignments" WHERE "role"='PRIMARY' AND "endedAt" IS NULL GROUP BY 1 HAVING COUNT(*)>1;
--   -- (B) SELECT "rigId",COUNT(*)      FROM "deployment_assignments" WHERE "role"='PRIMARY' AND "endedAt" IS NULL GROUP BY 1 HAVING COUNT(*)>1;
--   -- (D) SELECT "rigId","operatorId",COUNT(*) FROM "deployment_assignments" WHERE "role"='SECONDARY' AND "endedAt" IS NULL GROUP BY 1,2 HAVING COUNT(*)>1;
--
-- NOTE — index C (one open RigVehicle per vehicle) is intentionally DEFERRED to PR-2b.
-- `deployments/[id]/end/route.ts` ends a rig without stamping rig_vehicles.removedAt, so
-- ended rigs retain open vehicle rows; `WHERE removedAt IS NULL` is therefore NOT a proxy
-- for "on an active rig". Adding C here would (1) abort the deploy on historical residue
-- and (2) 500 the routine "reuse a vehicle on the next deployment" action. PR-2b fixes the
-- end/transfer close-out + backfills historical rows + adds 23505->409 translation, THEN
-- creates C with the corrected data.

-- (A) One OPEN PRIMARY per operator — "one active deployment per operator" (FND-23 core).
--     The create-deployment / handoff-accept / transfer-accept paths already enforce this
--     with a friendly 409 guard; the index is the structural backstop (a rare concurrent
--     race that slips the guard becomes a unique violation instead of a second open PRIMARY).
CREATE UNIQUE INDEX IF NOT EXISTS "deployment_assignments_one_open_primary_per_operator"
  ON "deployment_assignments" ("operatorId") WHERE "role" = 'PRIMARY' AND "endedAt" IS NULL;

-- (B) One OPEN PRIMARY per rig — makes the missed-check alert path (cron/dispatch,
--     dashboard/feeds) structurally unambiguous: the "roster PRIMARY" the readers resolve is
--     now guaranteed unique per active rig. Safe because reassignPrimary ends the old open
--     PRIMARY BEFORE inserting the new one within one transaction (deployment-handoffs.ts).
--     (B removes the "duplicate PRIMARY" risk; the "missing PRIMARY" risk is still covered by
--     PR-1's `?? rig.operatorId` fallback — correct division of responsibility.)
CREATE UNIQUE INDEX IF NOT EXISTS "deployment_assignments_one_open_primary_per_rig"
  ON "deployment_assignments" ("rigId") WHERE "role" = 'PRIMARY' AND "endedAt" IS NULL;

-- (D) One OPEN SECONDARY per (rig, operator) — mirrors the old rig_operators PK, relaxed to
--     allow many CLOSED secondary rows per pair but one open. ensureOpenAssignment's SECONDARY
--     guard keys on exactly (rigId, operatorId), matching this index.
CREATE UNIQUE INDEX IF NOT EXISTS "deployment_assignments_one_open_secondary_per_rig_op"
  ON "deployment_assignments" ("rigId", "operatorId") WHERE "role" = 'SECONDARY' AND "endedAt" IS NULL;
