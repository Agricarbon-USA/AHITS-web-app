-- CR-3 / CR-4: shared-store (Postgres-backed) rate limiter.
-- Fixed-window counter keyed by "<scope:ip>|<windowStartEpochMs>"; each window
-- is its own row so the per-IP ceiling holds across all Cloud Run instances.
-- Rows expire by reset_at and are reaped opportunistically by the limiter.
-- The previous in-memory limiter is retained in code only as a fallback for
-- when the database is unreachable.
CREATE TABLE "rate_limit_hit" (
    "bucket_key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "reset_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_limit_hit_pkey" PRIMARY KEY ("bucket_key")
);

CREATE INDEX "rate_limit_hit_reset_at_idx" ON "rate_limit_hit"("reset_at");
