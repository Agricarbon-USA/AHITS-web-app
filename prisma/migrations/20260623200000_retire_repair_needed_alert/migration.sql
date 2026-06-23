-- Retire REPAIR_NEEDED from the AlertType enum (redundant with DAMAGE_REPORTED).
--
-- SAFETY: this value was only ever written to notifications.type (a plain TEXT
-- column), never to alerts.type (this enum) — nothing calls createAlert() with
-- it. So no row in "alerts" uses REPAIR_NEEDED and the USING cast below cannot
-- fail. Confirm before applying with:
--     SELECT count(*) FROM "alerts" WHERE "type" = 'REPAIR_NEEDED';  -- expect 0
-- Postgres has no ALTER TYPE ... DROP VALUE, so recreate the enum.
ALTER TYPE "AlertType" RENAME TO "AlertType_old";
CREATE TYPE "AlertType" AS ENUM ('MAINTENANCE_OVERDUE', 'EQUIPMENT_NOT_RETURNED', 'DAMAGE_REPORTED', 'LOW_INVENTORY', 'INSURANCE_EXPIRING', 'REGISTRATION_EXPIRING', 'PIN_LOCKED');
ALTER TABLE "alerts" ALTER COLUMN "type" TYPE "AlertType" USING ("type"::text::"AlertType");
DROP TYPE "AlertType_old";
