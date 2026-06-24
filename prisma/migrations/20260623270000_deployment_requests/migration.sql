-- M6 / Addendum §F: Deployment Requests (create → list → submit → cancel slice).
-- Staging/reserve (RESERVED status + resolved* population) and checkout-conversion
-- pair with the deployment-model refactor (#29).
CREATE TYPE "DeploymentRequestStatus" AS ENUM ('DRAFT', 'REQUESTED', 'STAGED', 'FULFILLED', 'CANCELLED');
CREATE TYPE "RequestLineType" AS ENUM ('KIT_ITEM', 'VEHICLE');

CREATE TABLE "deployment_requests" (
    "id" TEXT NOT NULL,
    "status" "DeploymentRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "label" TEXT,
    "notes" TEXT,
    "neededBy" TIMESTAMP(3),
    "projectId" TEXT,
    "forOperatorId" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deployment_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deployment_requests_status_idx" ON "deployment_requests" ("status");

CREATE TABLE "deployment_request_lines" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "lineType" "RequestLineType" NOT NULL,
    "categoryId" TEXT,
    "itemType" TEXT,
    "vehicleType" "VehicleType",
    "requestedQty" INTEGER NOT NULL DEFAULT 1,
    "specificInventoryItemId" TEXT,
    "specificVehicleId" TEXT,
    "resolvedUnitId" TEXT,
    "resolvedVehicleId" TEXT,
    "stagedCondition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deployment_request_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deployment_request_lines_requestId_idx" ON "deployment_request_lines" ("requestId");
ALTER TABLE "deployment_request_lines"
  ADD CONSTRAINT "deployment_request_lines_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "deployment_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
