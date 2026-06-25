-- M5 item 26 / PRD v2.1 addendum A.4 + A.6: complete the maintenance resolution
-- state machine. A repaired unit's return destination is chosen per-case when the
-- repair is closed (no default); repairMethod records how it gets there.
CREATE TYPE "RepairMethod" AS ENUM ('DELIVER', 'SHIP');
CREATE TYPE "ReturnDestinationType" AS ENUM ('HUB', 'DEPLOYMENT', 'OTHER_HUB');

ALTER TABLE "maintenance_tasks" ADD COLUMN "repairMethod" "RepairMethod";
ALTER TABLE "maintenance_tasks" ADD COLUMN "returnDestinationType" "ReturnDestinationType";
ALTER TABLE "maintenance_tasks" ADD COLUMN "returnDestinationId" TEXT;
