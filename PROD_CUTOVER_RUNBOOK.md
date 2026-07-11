# AHITS — Production Cutover Runbook

> # ⛔ DO NOT MERGE PR #144 YET
> PR #144 promotes `development` → `production`, which **deploys to prod**. Merging it
> before this runbook is complete will try to migrate + deploy against a production
> environment that **does not exist yet**, and the release will fail. **Keep #144 open
> (mark it a Draft — see Step 1) until every box below is checked.**

---

## When to do this
**Not for the pilot.** The pilot runs on **staging** (`ahits-web-app-staging`). Production is a
separate, real environment you stand up only when you're ready to go live for real. Until
then, ignore this file — keep working and piloting on staging. Come back here at go-live.

## What a cutover is
Staging = a full running copy of the app on a **test** database (safe to break). Production =
a **second, separate** environment — its own database with real data, its own keys, its own
Cloud Run service — that real users depend on. This runbook stands that up, once.

## Prerequisites
- `gcloud` CLI installed and authenticated (`gcloud auth login`), project `ahits-499421`.
- Access to create a Supabase project.
- The deploy service account email (the one behind `GCP_SERVICE_ACCOUNT_KEY`). Find it with:
  ```bash
  gcloud iam service-accounts list --project=ahits-499421
  ```
  Call it `$SA` below (e.g. `deployer@ahits-499421.iam.gserviceaccount.com`).

---

## Step 1 — Safeguard: make #144 un-mergeable until you're ready
Convert #144 to a **Draft** PR — GitHub blocks merging drafts, so you can't do it by accident:
```bash
gh pr ready 144 --undo        # marks #144 as Draft
```
When you finish this runbook and truly want to ship prod: `gh pr ready 144`, then merge.

## Step 2 — Provision a production Supabase project
Create a **new** Supabase project (separate from the staging project). Choose a region near
your users. Wait for it to finish provisioning. **Do not reuse the staging database.**

## Step 3 — Collect the values
From the new prod project's dashboard, gather these (Project Settings → Database, and → API):

| Secret name (`AHITS_PROD_*`) | Where it comes from |
|---|---|
| `AHITS_PROD_DATABASE_URL` | Database → Connection string → **Transaction pooler** (port **6543**), append `?pgbouncer=true` |
| `AHITS_PROD_DIRECT_URL` | Database → Connection string → **Direct** (port **5432**) |
| `AHITS_PROD_MIGRATE_URL` | Database → Connection string → **Session pooler** (port **5432**, IPv4) — used by the CI migrate job |
| `AHITS_PROD_NEXT_PUBLIC_SUPABASE_URL` | API → Project URL (`https://<ref>.supabase.co`) |
| `AHITS_PROD_NEXT_PUBLIC_SUPABASE_ANON_KEY` | API → Project API keys → `anon` / public |
| `AHITS_PROD_SUPABASE_SERVICE_ROLE_KEY` | API → Project API keys → `service_role` (secret) |
| `AHITS_PROD_RESEND_API_KEY` | Your Resend dashboard (reuse staging's, or mint a prod key) |
| `AHITS_PROD_EMAIL_FROM` | e.g. `AHITS <noreply@agricarbon.com>` |
| `AHITS_PROD_NEXT_PUBLIC_APP_URL` | Your intended prod URL (custom domain, or the Cloud Run URL — see note in Step 9) |
| `AHITS_PROD_PIN_SESSION_SECRET` | **Generate fresh** (Step 4) — do NOT reuse staging |
| `AHITS_PROD_CRON_SECRET` | **Generate fresh** (Step 4) — do NOT reuse staging |

> The three connection strings are different ports/modes of the **same** prod DB. Getting
> `MIGRATE_URL` right (session pooler, 5432, IPv4) matters — the CI runners are IPv4-only and
> `prisma migrate deploy` needs session mode; the 6543 transaction pooler will not work for it.

## Step 4 — Generate the two fresh secrets
```bash
openssl rand -hex 32   # → use as AHITS_PROD_PIN_SESSION_SECRET
openssl rand -hex 32   # → use as AHITS_PROD_CRON_SECRET
```

## Step 5 — Create all 11 secrets in Secret Manager
Run one per value. `printf '%s'` (not `echo`) avoids a trailing newline, which can corrupt a
connection string or a bearer secret. Replace each `<...>` with the real value from Step 3/4.

```bash
PROJECT=ahits-499421
mk() { printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic --project="$PROJECT"; }

mk AHITS_PROD_DATABASE_URL                 '<transaction-pooler URL, port 6543, ?pgbouncer=true>'
mk AHITS_PROD_DIRECT_URL                   '<direct URL, port 5432>'
mk AHITS_PROD_MIGRATE_URL                  '<session-pooler URL, port 5432>'
mk AHITS_PROD_NEXT_PUBLIC_SUPABASE_URL     '<https://<ref>.supabase.co>'
mk AHITS_PROD_NEXT_PUBLIC_SUPABASE_ANON_KEY '<anon key>'
mk AHITS_PROD_SUPABASE_SERVICE_ROLE_KEY    '<service_role key>'
mk AHITS_PROD_RESEND_API_KEY               '<re_...>'
mk AHITS_PROD_EMAIL_FROM                   'AHITS <noreply@agricarbon.com>'
mk AHITS_PROD_NEXT_PUBLIC_APP_URL          '<https://your-prod-domain>'
mk AHITS_PROD_PIN_SESSION_SECRET           '<openssl output #1>'
mk AHITS_PROD_CRON_SECRET                  '<openssl output #2>'
```
_If a secret already exists, add a new version instead of creating:_
`printf '%s' '<value>' | gcloud secrets versions add <NAME> --data-file=- --project=ahits-499421`

## Step 6 — Grant the deploy service account read access
Simplest (project-level, one command):
```bash
gcloud projects add-iam-policy-binding ahits-499421 \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor"
```
_(For least privilege you can instead grant `secretAccessor` per-secret with
`gcloud secrets add-iam-policy-binding <NAME> --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor`.)_

## Step 7 — Verify all 11 exist and are ENABLED
```bash
PROJECT=ahits-499421
for s in DATABASE_URL DIRECT_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
         SUPABASE_SERVICE_ROLE_KEY PIN_SESSION_SECRET RESEND_API_KEY EMAIL_FROM \
         NEXT_PUBLIC_APP_URL CRON_SECRET MIGRATE_URL; do
  gcloud secrets versions list "AHITS_PROD_$s" --project="$PROJECT" \
    --filter="state=ENABLED" --format="value(name)" >/dev/null 2>&1 \
    && echo "OK   AHITS_PROD_$s" || echo "MISS AHITS_PROD_$s"
done
```
Every line must read `OK`. Do not proceed while any say `MISS`.

## Step 8 — Confirm the Makefile maps prod secrets
The deploy already parameterizes by namespace: `cloud-run-deploy` uses `$(SECRET_NS)_*` in its
`--set-secrets`, and `deploy-prod` sets `SECRET_NS=AHITS_PROD` — so once the `AHITS_PROD_*`
secrets exist, they map automatically. **Open the Makefile and confirm** the `--set-secrets`
line uses `$(SECRET_NS)_` (not a hardcoded `AHITS_`). If it's hardcoded, parameterize it first.
Also confirm the migrate job resolves `$(SECRET_NS)_MIGRATE_URL` (the FND-15 fix) so a prod
release migrates the **prod** DB, not staging.

## Step 9 — Merge #144 (the actual cutover)
```bash
gh pr ready 144        # take it out of Draft
# merge #144 in the GitHub UI (base: production)
gh run watch           # watch the deploy: verify → migrate (prod) → deploy
```
The pipeline runs `verify` → `migrate` (against `AHITS_PROD_MIGRATE_URL`) → `deploy` (mounts the
`AHITS_PROD_*` set). It will not deploy if an earlier job fails.

> **`NEXT_PUBLIC_APP_URL` chicken-and-egg:** if you're using the Cloud Run default URL (not a
> custom domain), you won't know it until the service exists. Options: (a) set a custom domain
> up front and use that; or (b) create the secret with a placeholder, do the first deploy, read
> the real URL from `make cloud-run-url SERVICE=ahits-web-app`, then
> `gcloud secrets versions add AHITS_PROD_NEXT_PUBLIC_APP_URL --data-file=-` with the real value
> and re-deploy so emailed links are correct.

## Step 10 — Post-cutover smoke test (prod)
- Prod URL loads; `/login` hydrates (6/6 inline scripts nonce'd, like the staging check).
- Log in as the seeded admin; confirm the dashboard reads from the **prod** DB (empty/seeded, not staging data).
- **Heads-up:** prod runs `EMAIL_SANDBOX=false`, so it will email **real** recipients — verify your seed/test data has no real external addresses before exercising send flows.
- Seed the prod admin + operators as needed (`make db-seed` targets the DB in the mounted secrets — run against prod deliberately, once).

## Rollback
Cloud Run keeps prior revisions — if the new prod revision misbehaves, route traffic back to the
previous revision in the Cloud Run console. Migrations are backward-compatible (additive), so a
revision rollback is safe without a DB rollback. Never hand-run destructive SQL against prod.

---

_Reference for the numbers here: `AHITS_PHASE3_WORKPLAN_v2.md` (FND-15 migrate-secret, governance §Prod = Option A) and the Wave-0 batch execution logs._
