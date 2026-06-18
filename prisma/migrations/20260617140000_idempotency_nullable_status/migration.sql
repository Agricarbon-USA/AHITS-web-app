-- Allow NULL status_code as an in-flight placeholder to prevent TOCTOU races
-- during concurrent offline replay. A NULL status_code means the key has been
-- claimed by a request that is currently executing its handler.
ALTER TABLE "idempotency_key" ALTER COLUMN "status_code" DROP NOT NULL;
