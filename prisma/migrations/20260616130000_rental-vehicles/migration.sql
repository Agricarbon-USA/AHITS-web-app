-- Add rental vehicle fields to vehicles table
ALTER TABLE "vehicles" ADD COLUMN "isRental"              BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vehicles" ADD COLUMN "rentalMake"            TEXT;
ALTER TABLE "vehicles" ADD COLUMN "rentalModel"           TEXT;
ALTER TABLE "vehicles" ADD COLUMN "rentalYear"            INTEGER;
ALTER TABLE "vehicles" ADD COLUMN "rentalLength"          TEXT;
ALTER TABLE "vehicles" ADD COLUMN "rentalAgreementUrl"    TEXT;
ALTER TABLE "vehicles" ADD COLUMN "rentalPickupLocation"  TEXT;
ALTER TABLE "vehicles" ADD COLUMN "rentalDropoffLocation" TEXT;
