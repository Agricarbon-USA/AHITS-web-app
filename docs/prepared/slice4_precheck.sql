-- =============================================================================
-- #29 SLICE 4 (CONTRACT) — PRE-CHECK
-- Run these READ-ONLY queries against the TARGET database BEFORE applying the
-- drop-legacy-columns migration (docs/prepared/slice4_drop_legacy.sql).
-- EVERY query below must return ZERO rows. Any row = do NOT proceed.
-- Prepared Session 11 (2026-06-25). Safe to run anytime; mutates nothing.
-- =============================================================================

-- 1. Operators with two or more OPEN PRIMARY assignments.
--    These would violate the one-active-PRIMARY-per-operator unique index that
--    slice 4 adds, and indicate a dual-write bug. Must be empty.
SELECT "operatorId", count(*) AS open_primary_count
FROM "deployment_assignments"
WHERE "role" = 'PRIMARY' AND "endedAt" IS NULL
GROUP BY "operatorId"
HAVING count(*) > 1;

-- 2. Active rigs (endedAt IS NULL) that do NOT have exactly one open PRIMARY
--    assignment. An active deployment must map to exactly one open primary.
SELECT r."id" AS rig_id,
       (SELECT count(*) FROM "deployment_assignments" a
        WHERE a."rigId" = r."id" AND a."role" = 'PRIMARY' AND a."endedAt" IS NULL) AS open_primary
FROM "rigs" r
WHERE r."endedAt" IS NULL
  AND (SELECT count(*) FROM "deployment_assignments" a
       WHERE a."rigId" = r."id" AND a."role" = 'PRIMARY' AND a."endedAt" IS NULL) <> 1;

-- 3. Legacy vs new PRIMARY mismatch: the legacy rigs.operatorId must equal the
--    open PRIMARY assignment operator for every active rig. Any mismatch means
--    a writer updated one source but not the other.
SELECT r."id" AS rig_id, r."operatorId" AS legacy_operator, a."operatorId" AS assignment_operator
FROM "rigs" r
LEFT JOIN "deployment_assignments" a
  ON a."rigId" = r."id" AND a."role" = 'PRIMARY' AND a."endedAt" IS NULL
WHERE r."endedAt" IS NULL
  AND (a."operatorId" IS NULL OR a."operatorId" <> r."operatorId");

-- 4. Legacy vs new SECONDARY mismatch: every active rig_operators row must have a
--    matching open SECONDARY assignment, and vice versa.
--    4a. rig_operators rows with no matching open SECONDARY assignment:
SELECT ro."rigId", ro."operatorId"
FROM "rig_operators" ro
JOIN "rigs" r ON r."id" = ro."rigId" AND r."endedAt" IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "deployment_assignments" a
  WHERE a."rigId" = ro."rigId" AND a."operatorId" = ro."operatorId"
    AND a."role" = 'SECONDARY' AND a."endedAt" IS NULL);
--    4b. open SECONDARY assignments with no matching rig_operators row:
SELECT a."rigId", a."operatorId"
FROM "deployment_assignments" a
JOIN "rigs" r ON r."id" = a."rigId" AND r."endedAt" IS NULL
WHERE a."role" = 'SECONDARY' AND a."endedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "rig_operators" ro
    WHERE ro."rigId" = a."rigId" AND ro."operatorId" = a."operatorId");

-- 5. Legacy vs new PROJECT mismatch: every active rig with a non-null projectId
--    must have a matching active deployment_projects link, and vice versa.
--    5a. rigs.projectId set but no active deployment_projects link:
SELECT r."id" AS rig_id, r."projectId"
FROM "rigs" r
WHERE r."endedAt" IS NULL AND r."projectId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "deployment_projects" dp
    WHERE dp."rigId" = r."id" AND dp."projectId" = r."projectId" AND dp."removedAt" IS NULL);
--    5b. active deployment_projects link with no matching rigs.projectId
--        (acceptable once M2M is truly many; informational — review, don't block):
SELECT dp."rigId", dp."projectId"
FROM "deployment_projects" dp
JOIN "rigs" r ON r."id" = dp."rigId" AND r."endedAt" IS NULL
WHERE dp."removedAt" IS NULL
  AND (r."projectId" IS NULL OR r."projectId" <> dp."projectId");

-- 6. Orphaned assignments: assignment rows pointing at a non-existent rig or user.
SELECT a."id", a."rigId", a."operatorId"
FROM "deployment_assignments" a
WHERE NOT EXISTS (SELECT 1 FROM "rigs" r WHERE r."id" = a."rigId")
   OR NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = a."operatorId");
