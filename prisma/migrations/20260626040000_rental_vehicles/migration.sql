-- NEW-5: rental vehicles. A rental is modeled as a Vehicle with `isRental` + a
-- rental metadata block, so it reuses daily-checks, maintenance, deployment
-- assignment, transfers, and the cost/utilization reports. All additive +
-- nullable (or defaulted) → backward-compatible.
CREATE TYPE "RentalCostPeriod" AS ENUM ('DAY', 'WEEK', 'MONTH', 'FLAT');

ALTER TABLE "vehicles"
  ADD COLUMN "isRental" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rentalCompany" TEXT,
  ADD COLUMN "rentalAgreementNumber" TEXT,
  ADD COLUMN "rentalAgreementUrl" TEXT,
  ADD COLUMN "rentalStartDate" DATE,
  ADD COLUMN "rentalEndDate" DATE,
  ADD COLUMN "rentalLocation" TEXT,
  ADD COLUMN "rentalReturnLocation" TEXT,
  ADD COLUMN "rentalCostAmount" DECIMAL(10,2),
  ADD COLUMN "rentalCostPeriod" "RentalCostPeriod",
  ADD COLUMN "rentalOneWay" BOOLEAN NOT NULL DEFAULT false;
