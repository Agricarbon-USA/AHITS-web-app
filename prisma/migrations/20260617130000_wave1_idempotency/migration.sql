-- Wave 1: idempotency store for safe offline replay of non-idempotent writes.
CREATE TABLE "idempotency_key" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "idempotency_key_created_at_idx" ON "idempotency_key"("created_at");
