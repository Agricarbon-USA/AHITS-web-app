-- R1 Requests Redesign: enum additions only.
-- Separated from column additions because Postgres forbids referencing a newly
-- added enum value in the same transaction that added it. Prisma migrate deploy
-- wraps each migration file in its own transaction, so the column migration (next)
-- can safely use 'RESERVATION'::"DeploymentRequestType" once this one commits.

-- New discriminator enum for RESERVATION vs MATERIAL request flows
CREATE TYPE "DeploymentRequestType" AS ENUM ('RESERVATION', 'MATERIAL');

-- Extend existing enums (additive)
ALTER TYPE "DeploymentRequestStatus" ADD VALUE IF NOT EXISTS 'FORWARDED';
ALTER TYPE "DeploymentRequestStatus" ADD VALUE IF NOT EXISTS 'DENIED';

ALTER TYPE "RequestLineType" ADD VALUE IF NOT EXISTS 'NEW_PURCHASE';
ALTER TYPE "RequestLineType" ADD VALUE IF NOT EXISTS 'SHIPPING_LABEL';

ALTER TYPE "StatusLinkType" ADD VALUE IF NOT EXISTS 'RESERVATION';

ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'MATERIAL_REQUEST';
