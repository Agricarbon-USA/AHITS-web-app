-- CR-2: bind a request-body hash to each idempotency key. A replay of the same
-- Idempotency-Key with a different payload is rejected rather than silently
-- returning the first response. Nullable so existing rows are unaffected.
ALTER TABLE "idempotency_key" ADD COLUMN "body_hash" TEXT;
