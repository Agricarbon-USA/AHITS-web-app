-- Audit follow-up: harden alert/notification dedup.
-- Safe to apply with `prisma migrate deploy` (data cleanup + one unique index).

-- 1) Backfill activeKey on pre-CR-5 unresolved alerts so createAlert's upsert
--    recognises them (matching its `${type}:${sourceTable}:${sourceId}` format)
--    instead of creating a duplicate. Only the most-recent unresolved alert per
--    source gets the key (older duplicates keep NULL to avoid a unique clash and
--    age out as they are resolved); only alerts that actually have a source.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "type", "sourceTable", "sourceId"
           ORDER BY "triggeredAt" DESC
         ) AS rn
  FROM "alerts"
  WHERE "resolved" = false
    AND "activeKey" IS NULL
    AND "sourceTable" IS NOT NULL
    AND "sourceId" IS NOT NULL
)
UPDATE "alerts" a
SET "activeKey" = a."type" || ':' || a."sourceTable" || ':' || a."sourceId"
FROM ranked r
WHERE a.id = r.id AND r.rn = 1;

-- 2) De-duplicate existing (alertId, userId) notification pairs (keep the
--    earliest) before adding the unique index, so its creation can't fail.
DELETE FROM "notifications" a
USING "notifications" b
WHERE a."alertId" IS NOT NULL
  AND a."alertId" = b."alertId"
  AND a."userId" = b."userId"
  AND a."createdAt" > b."createdAt";

-- 3) Enforce one notification per alert per user going forward.
CREATE UNIQUE INDEX "notifications_alertId_userId_key" ON "notifications"("alertId", "userId");
