-- F3: mandatory item-by-item hub loading checklist.
-- Adds per-line fulfillment state to deployment_request_lines and a new
-- request_line_events table that logs every Confirm/Edit/Deny with from→to delta.
-- Accessed via raw SQL (same discipline as status_link_events).

-- Per-line fulfillment state ─────────────────────────────────────────────────
ALTER TABLE "deployment_request_lines"
  ADD COLUMN IF NOT EXISTS "fulfillmentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "fulfilledQty"       INTEGER,
  ADD COLUMN IF NOT EXISTS "substitutedItemId"  TEXT,
  ADD COLUMN IF NOT EXISTS "denyReason"         TEXT;

-- Per-line change log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "request_line_events" (
  "id"          TEXT NOT NULL,
  "lineId"      TEXT NOT NULL,
  "requestId"   TEXT NOT NULL,
  "action"      TEXT NOT NULL,     -- 'CONFIRM' | 'EDIT' | 'DENY'
  "fromQty"     INTEGER,
  "toQty"       INTEGER,
  "fromItemId"  TEXT,
  "toItemId"    TEXT,
  "note"        TEXT,
  "actorLabel"  TEXT,              -- portal (no account)
  "actorUserId" TEXT,              -- admin (session user)
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "request_line_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "request_line_events_lineId_idx"    ON "request_line_events"("lineId");
CREATE INDEX IF NOT EXISTS "request_line_events_requestId_idx" ON "request_line_events"("requestId");
