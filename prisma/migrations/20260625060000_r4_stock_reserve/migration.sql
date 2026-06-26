-- R4 hub-stock hard-reserve: idempotency guard column on deployment_requests.
-- stockReservedAt is set when stock is reserved (REQUESTED→STAGED confirm) and
-- cleared on release (STAGED→CANCELLED, STAGED→FULFILLED). Prevents double-reserve
-- if the same confirm is replayed.

ALTER TABLE "deployment_requests"
  ADD COLUMN IF NOT EXISTS "stockReservedAt" TIMESTAMP(3);
