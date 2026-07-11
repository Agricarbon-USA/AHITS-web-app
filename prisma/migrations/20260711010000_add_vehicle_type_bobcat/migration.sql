-- AddVehicleTypeBobcat: additive enum extension — no table reconstruction needed.
-- migration-safety: acknowledged — ADD VALUE to an existing Postgres enum is
-- non-destructive and backward-compatible. Running before the deploy is safe;
-- old code that doesn't know BOBCAT simply never writes it.
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'BOBCAT';
