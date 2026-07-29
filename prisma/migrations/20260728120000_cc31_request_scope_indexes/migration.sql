-- CC-31 item 7 (review §3.11): index the two operator-scope columns on
-- deployment_requests. They are filtered on every Today load — listRequests' operator
-- scope now ORs in "forOperatorId" (item 4) alongside "requestedById" — and by the
-- hold-TTL sweep, but had no index. Names match Prisma's defaults for the schema
-- @@index([requestedById]) / @@index([forOperatorId]) additions.
--
-- Additive-only: CREATE INDEX adds no column and drops nothing, so it is
-- backward-compatible — the deploy.yml migrate job runs before the new revision
-- serves, and the prior revision is unaffected. Passes scripts/check-migration-safety.sh.
CREATE INDEX IF NOT EXISTS "deployment_requests_requestedById_idx" ON "deployment_requests"("requestedById");
CREATE INDEX IF NOT EXISTS "deployment_requests_forOperatorId_idx" ON "deployment_requests"("forOperatorId");
