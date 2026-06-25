-- F2: Hub address fields for Shippo label generation
ALTER TABLE "hubs" ADD COLUMN "street1" TEXT;
ALTER TABLE "hubs" ADD COLUMN "street2" TEXT;
ALTER TABLE "hubs" ADD COLUMN "zip" TEXT;
ALTER TABLE "hubs" ADD COLUMN "country" TEXT DEFAULT 'US';

-- F2: Ship-to fields on SHIPPING_LABEL request lines
ALTER TABLE "deployment_request_lines" ADD COLUMN "shipToHubId" TEXT;
ALTER TABLE "deployment_request_lines" ADD COLUMN "shipToAddress" TEXT;

-- F2: Shipment tracking status enum
CREATE TYPE "ShipmentStatus" AS ENUM ('UNKNOWN', 'PRE_TRANSIT', 'TRANSIT', 'DELIVERED', 'RETURNED', 'FAILURE');

-- F2: Shipments table (polymorphic, dormant — no live Shippo calls in this slice)
CREATE TABLE "shipments" (
  "id"                      TEXT         NOT NULL,
  "carrier"                 TEXT,
  "trackingNumber"          TEXT,
  "status"                  "ShipmentStatus" NOT NULL DEFAULT 'UNKNOWN',
  "labelUrl"                TEXT,
  "estimatedDelivery"       TIMESTAMP(3),
  "maintenanceTaskId"       TEXT,
  "inventoryUnitId"         TEXT,
  "deploymentRequestLineId" TEXT,
  "hubId"                   TEXT,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shipments_status_idx" ON "shipments"("status");
CREATE INDEX "shipments_trackingNumber_idx" ON "shipments"("trackingNumber");
CREATE INDEX "shipments_maintenanceTaskId_idx" ON "shipments"("maintenanceTaskId");
CREATE INDEX "shipments_inventoryUnitId_idx" ON "shipments"("inventoryUnitId");
CREATE INDEX "shipments_deploymentRequestLineId_idx" ON "shipments"("deploymentRequestLineId");
CREATE INDEX "shipments_hubId_idx" ON "shipments"("hubId");
