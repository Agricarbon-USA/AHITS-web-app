-- W0-10 BREAK-GLASS RECOVERY (do NOT place in prisma/migrations/ — apply by hand only if the
-- PR-4b/4c DROP has to be undone). There is NO app-level rollback: rolling the app back reads
-- the dropped columns and crashes harder. The ONLY forward recovery is re-add + backfill.
-- Reconstructs each dropped field from deployment_assignments (+ the _archive table for the
-- one field with no successor: vehicles.assignedOperatorId).

BEGIN;

-- 1. rigs.operatorId ← open PRIMARY assignment (LOSSLESS).
ALTER TABLE "rigs" ADD COLUMN "operatorId" TEXT;
UPDATE "rigs" r SET "operatorId" = da."operatorId"
FROM "deployment_assignments" da
WHERE da."rigId" = r."id" AND da."role" = 'PRIMARY' AND da."endedAt" IS NULL;
-- if any rig is still null (no open PRIMARY), fall back to the pre-drop archive:
UPDATE "rigs" r SET "operatorId" = a."operator_id"
FROM "_archive_legacy_operators_20260708" a
WHERE a."source" = 'rig_primary' AND a."entity_id" = r."id" AND r."operatorId" IS NULL;
-- if still null after the archive (archive predates the current deployment cycle), try
-- the latest-ENDED PRIMARY assignment — loses the "when" but preserves the "who":
UPDATE "rigs" r
SET "operatorId" = (
  SELECT da."operatorId"
  FROM "deployment_assignments" da
  WHERE da."rigId" = r."id" AND da."role" = 'PRIMARY'
  ORDER BY da."endedAt" DESC NULLS FIRST
  LIMIT 1
)
WHERE r."operatorId" IS NULL;
-- Guard: abort rather than silently produce a NOT NULL violation from the ALTER below.
DO $$
DECLARE null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "rigs" WHERE "operatorId" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION
      'operatorId backfill incomplete: % rig(s) still NULL after all three backfill passes '
      '— reconcile manually (check deployment_assignments for missing PRIMARY rows) '
      'then re-run this script before SET NOT NULL.',
      null_count;
  END IF;
END $$;
ALTER TABLE "rigs" ALTER COLUMN "operatorId" SET NOT NULL;
ALTER TABLE "rigs" ADD CONSTRAINT "rigs_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX "rigs_operatorId_idx" ON "rigs"("operatorId");

-- 2. vehicles.assignedOperatorId ← archive (the ONLY persisted copy; derivation is lossy).
ALTER TABLE "vehicles" ADD COLUMN "assignedOperatorId" TEXT;
UPDATE "vehicles" v SET "assignedOperatorId" = a."operator_id"
FROM "_archive_legacy_operators_20260708" a
WHERE a."source" = 'vehicle_assigned' AND a."entity_id" = v."id";

-- 3. rig_operators ← open SECONDARY assignments (addedAt ← startedAt; ids re-minted, nothing FKs them).
CREATE TABLE "rig_operators" (
  "id" TEXT NOT NULL, "rigId" TEXT NOT NULL, "operatorId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rig_operators_pkey" PRIMARY KEY ("id")
);
INSERT INTO "rig_operators" ("id","rigId","operatorId","addedAt")
SELECT DISTINCT ON (da."rigId", da."operatorId")
       gen_random_uuid()::text, da."rigId", da."operatorId", da."startedAt"
FROM "deployment_assignments" da
WHERE da."role" = 'SECONDARY' AND da."endedAt" IS NULL
ORDER BY da."rigId", da."operatorId", da."startedAt";
CREATE UNIQUE INDEX "rig_operators_rigId_operatorId_key" ON "rig_operators"("rigId","operatorId");
ALTER TABLE "rig_operators" ADD CONSTRAINT "rig_operators_rigId_fkey"
  FOREIGN KEY ("rigId") REFERENCES "rigs"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "rig_operators" ADD CONSTRAINT "rig_operators_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

COMMIT;
