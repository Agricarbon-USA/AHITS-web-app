-- PR-4 · Signals clear themselves (D-i, D-j). Additive, one file, statements in the
-- program's stated order. Steps (0)-(3) normalise existing rows so the CHECK in (4)
-- cannot fail on historic data; (5) is the email-outcome groundwork.
--
-- Every existing writer already keeps the pair consistent (createAlert sets activeKey
-- on an unresolved row; every resolve sets resolved = true AND activeKey = NULL), so
-- the revision still serving while this runs keeps satisfying the constraint.

-- (0) Duplicate unresolved alerts for one (type, sourceTable, sourceId): keep the
--     newest, resolve the rest — two unresolved rows would collide on the unique
--     activeKey once (3) rebuilds it.
UPDATE "alerts" a
SET "resolved" = true, "resolvedAt" = now(), "activeKey" = NULL
WHERE a."resolved" = false
  AND EXISTS (
    SELECT 1 FROM "alerts" b
    WHERE b."resolved" = false
      AND b."type" = a."type"
      AND b."sourceTable" IS NOT DISTINCT FROM a."sourceTable"
      AND b."sourceId" IS NOT DISTINCT FROM a."sourceId"
      AND (b."triggeredAt" > a."triggeredAt" OR (b."triggeredAt" = a."triggeredAt" AND b."id" > a."id"))
  );

-- (1) An unresolved alert with no source can't have a key (the key built from a NULL
--     source is NULL) and would still violate the check — resolve it.
UPDATE "alerts" SET "resolved" = true, "resolvedAt" = now(), "activeKey" = NULL
WHERE "resolved" = false AND ("sourceTable" IS NULL OR "sourceId" IS NULL);

-- (2) A resolved alert holds no key.
UPDATE "alerts" SET "activeKey" = NULL
WHERE "resolved" = true AND "activeKey" IS NOT NULL;

-- (3) Every unresolved alert holds its key.
UPDATE "alerts" SET "activeKey" = "type"::text || ':' || "sourceTable" || ':' || "sourceId"
WHERE "resolved" = false AND "activeKey" IS NULL;

-- (4) The invariant, enforced by the database from now on (D-i).
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_active_key_matches_resolved" CHECK ("resolved" = ("activeKey" IS NULL));

-- (5) Email truth (D-j): a REDIRECTED outcome, and where each message actually went.
ALTER TYPE "EmailStatus" ADD VALUE IF NOT EXISTS 'REDIRECTED';
ALTER TABLE "email_logs" ADD COLUMN "deliveredTo" TEXT;
