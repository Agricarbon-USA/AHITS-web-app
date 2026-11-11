# PILOT ROLLBACK

**Scope:** `ahits-web-app-staging` (us-central1) — the service the fleet actually runs on
(D16: staging is home). Read this when the app is broken in the field and you need it
working again in minutes, or when an operator says "I submitted it and it's gone."

---

## 1. The 10-line play — roll back a bad deploy

```bash
# 1. List revisions, newest first. Note the one BEFORE the bad deploy.
gcloud run revisions list \
  --service ahits-web-app-staging \
  --region us-central1

# 2. Send 100% of traffic back to the known-good revision.
gcloud run services update-traffic ahits-web-app-staging \
  --region us-central1 \
  --to-revisions=<prev-revision>=100
```

That is the whole play. It takes effect in seconds and needs no build, no CI, no merge.

**Why this is safe.** Migrations in this repo are additive / backward-compatible *by
CI-enforced rule* — `scripts/check-migration-safety.sh` fails any PR (and, since CC-30,
any push to `development`) whose new migrations drop columns, drop tables, rename, or add
NOT NULL without a default. So the **previous revision runs correctly against the newer
schema**: every column it knows about still exists and still means the same thing.

> ### NEVER hand-revert the schema
>
> Do not `DROP` the new column. Do not restore an old dump over the live DB. Bad *code* is
> rolled back by **traffic** (step 1 above) and **removed** by a revert PR through the
> normal flow (`git revert` → PR → `development` → deploy.yml). **The migration stays.**
> Hand-reverting a schema breaks the forward-fix path and destroys any rows written since
> the deploy — including field data operators believe they submitted.

After the traffic rollback, open a revert PR at your own pace. The fleet is already working.

---

## 2. What is serving right now

```bash
# The revision currently taking traffic:
gcloud run services describe ahits-web-app-staging \
  --region us-central1 \
  --format="value(status.traffic.revisionName)"

# The image (and therefore the exact commit) on that revision:
gcloud run services describe ahits-web-app-staging \
  --region us-central1 \
  --format="value(spec.template.spec.containers[0].image)"
```

**The image tag IS the git SHA.** `deploy.yml` deploys with `TAG=${{ github.sha }}`, so a
tag of `…/ahits-web-app:9f3c1a7…` means commit `9f3c1a7…`. To see what's in it:

```bash
git log --oneline -1 <sha>
git show <sha>
```

---

## 3. Lost-write reconciliation query pack

**"The operator says they submitted X — did the server actually get it?"**

Run these read-only against the pilot database (Supabase → SQL Editor). Table and column
names below are verified against `prisma/schema.prisma`. Postgres is case-sensitive for
quoted identifiers — keep the double quotes exactly as written.

### Q1 — Daily checks for one operator on one day

```sql
SELECT dc."id", dc."date", dc."submittedAt", dc."passFail", dc."odometer", v."name" AS vehicle
FROM "daily_checks" dc
JOIN "users" u ON u."id" = dc."operatorId"
JOIN "vehicles" v ON v."id" = dc."vehicleId"
WHERE u."email" = $1 AND dc."date" = $2::date
ORDER BY dc."submittedAt";
```
`$1` = operator email, `$2` = business date `'YYYY-MM-DD'` (APP_TIMEZONE = America/Chicago).
No rows ⇒ the server never received it; the write is still in the operator's device queue
(or was lost with it). One row ⇒ it landed; the operator is likely looking at a stale view.

### Q2 — Did ANY replay land? Idempotency claims in a window

```sql
SELECT "key", "scope", "status_code", "created_at"
FROM "idempotency_key"
WHERE "created_at" BETWEEN $1 AND $2
ORDER BY "created_at";
```

> ⚠️ **48-hour window.** There is no operator column on this table — you filter by time
> only. And the cron **reaps rows older than 48h**
> (`src/app/api/cron/dispatch/route.ts` — the `DELETE FROM idempotency_key … 48 hours`
> step). **Run this within 48h of the incident or the evidence is gone.** If an incident
> is reported late, go to Q1/Q3 instead.

### Q3 — Gear actions for one operator in a window

```sql
SELECT cl."action", cl."submittedAt", ii."name" AS item, cl."fromLocation", cl."toLocation"
FROM "check_logs" cl
JOIN "users" u ON u."id" = cl."operatorId"
JOIN "inventory_items" ii ON ii."id" = cl."itemId"
WHERE u."email" = $1 AND cl."submittedAt" BETWEEN $2 AND $3
ORDER BY cl."submittedAt";
```

### Q4 — Account-action audit trail (last 7 days)

```sql
SELECT a."action", a."createdAt", actor."email" AS actor, target."email" AS target
FROM "account_audit_log" a
JOIN "users" actor ON actor."id" = a."actorId"
LEFT JOIN "users" target ON target."id" = a."targetUserId"
WHERE a."createdAt" > NOW() - INTERVAL '7 days'
ORDER BY a."createdAt" DESC;
```

> Scope note: this table records **account management** only (invites, role changes,
> deactivations). It is **not** an audit trail of field writes — daily checks and gear
> actions are not in here. Use Q1/Q3 for those.

---

## Restore drill

*(Max fills in after running it — see the CC-30 Max checklist, item a.)*

Record here, from the actual console run:

- **Backup plan + retention actually in effect** (Supabase → Settings → Database → Backups):
- **PITR enabled?** (yes/no; if the tier offers it):
- **Exact click-path to restore a backup into a NEW throwaway project:**
- **Confirmed `daily_checks` rows present in the restored copy?** (yes/no):
- **Wall-clock time the drill took:**
- **Throwaway project deleted?** (yes/no):
- **Date drilled:**
