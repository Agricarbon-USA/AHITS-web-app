# PIPE-2 — Production Database Standup Runbook

_Goal: stand up a real production database with its own secrets so a prod deploy
never touches staging's data, then promote `development → production` safely.
Status: code parameterization done (Makefile); provisioning steps below are
manual (GCP / Supabase). Author: Session 6._

---

## 1. Why this is a hard pilot gate

The Makefile's `cloud-run-deploy` mounts a **single** set of `AHITS_*` secrets,
and before this change **both** `deploy-staging` and `deploy-prod` used it. So a
first production deploy would have mounted staging's `AHITS_DATABASE_URL` /
`AHITS_DIRECT_URL` and pointed **prod at staging's database** — every prod write
would corrupt staging data, and `NEXT_PUBLIC_APP_URL` would advertise the staging
host (breaking the new Wave F status links, which embed that URL in shop emails).

`make cloud-run-migrate` had the same problem: it always read `AHITS_DIRECT_URL`,
so "migrate the deployed DB" always migrated staging.

## 2. What changed in code (already done)

`Makefile` now has a `SECRET_NS` dimension:
- `deploy-staging` → `SECRET_NS=AHITS` (unchanged — staging keeps its secrets)
- `deploy-prod` → `SECRET_NS=AHITS_PROD`
- `cloud-run-deploy` `--set-secrets` and `cloud-run-migrate` both read
  `$(SECRET_NS)_*`.

So prod now reads `AHITS_PROD_DATABASE_URL`, `AHITS_PROD_DIRECT_URL`, etc. **Those
secrets must exist before the first prod deploy** — Cloud Run validates
`--set-secrets` references at deploy time and fails the release otherwise (the
team has hit this exact gotcha with `AHITS_CRON_SECRET`).

## 3. Step 1 — Provision the production database

Staging uses Supabase (see `NEXT_PUBLIC_SUPABASE_URL`). Create a **separate
Supabase project** for production (not a new DB in the same project — you want
isolated auth keys, connection pooler, and blast radius).

From the new prod Supabase project, collect:
- **Pooled connection** (PgBouncer, port 6543) → `DATABASE_URL`
- **Direct/session-pooler connection** → `DIRECT_URL` (used by Prisma for
  migrations; see §7 on IPv4 reachability)
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

## 4. Step 2 — Create the `AHITS_PROD_*` secrets

Create all eleven in Secret Manager (project `ahits-499421` or your prod project),
**before** deploying. Generate **fresh** values for the two app secrets — do NOT
reuse staging's, or staging-issued session tokens / cron tokens would be valid on
prod:

```bash
PROJ=ahits-499421   # your GCP project
mk() { printf '%s' "$2" | gcloud secrets create "$1" --project="$PROJ" --data-file=- 2>/dev/null \
       || printf '%s' "$2" | gcloud secrets versions add "$1" --project="$PROJ" --data-file=-; }

mk AHITS_PROD_DATABASE_URL              "postgresql://...pooler...:6543/postgres?pgbouncer=true"
mk AHITS_PROD_DIRECT_URL                "postgresql://...session-pooler...:5432/postgres"
mk AHITS_PROD_NEXT_PUBLIC_SUPABASE_URL  "https://<prod-ref>.supabase.co"
mk AHITS_PROD_NEXT_PUBLIC_SUPABASE_ANON_KEY      "<prod anon key>"
mk AHITS_PROD_SUPABASE_SERVICE_ROLE_KEY          "<prod service_role key>"
mk AHITS_PROD_PIN_SESSION_SECRET        "$(openssl rand -base64 48)"   # FRESH — not staging's
mk AHITS_PROD_CRON_SECRET               "$(openssl rand -base64 48)"   # FRESH — not staging's
mk AHITS_PROD_RESEND_API_KEY            "<resend key>"
mk AHITS_PROD_EMAIL_FROM                "AHITS <noreply@agricarbon.com>"
mk AHITS_PROD_ADMIN_EMAIL               "ops@agricarbon.com"
mk AHITS_PROD_NEXT_PUBLIC_APP_URL       "https://<prod-host>"          # the PROD URL — critical for Wave F links
```

Confirm each has an ENABLED version: `gcloud secrets versions list AHITS_PROD_DATABASE_URL --project=$PROJ`.

Grant the deployer service account `roles/secretmanager.secretAccessor` on the new
`AHITS_PROD_*` secrets (the same SA that reads the staging secrets).

## 5. Step 3 — Apply the full migration history to the empty prod DB

The new DB is empty; apply every committed migration **before** any prod code
serves traffic. From a machine that can reach the prod direct connection:

```bash
make cloud-run-migrate SECRET_NS=AHITS_PROD GCP_PROJECT=$PROJ
# (reads AHITS_PROD_DIRECT_URL and runs `prisma migrate deploy`)
```

This applies all migrations including the recent `20260623120000_wave_f_status_links`
and `20260623160000_kititem_drawn_quantity`. Then seed a first admin so you can log
in (the seed wipes/szeds dev data — for prod, create the single admin manually or
via a one-off invite rather than `make db-seed`, which is for dev data).

## 6. Step 4 — First production deploy

Production deploys are triggered by landing on the `production` branch
(`deploy.yml`). Promote staging → prod via PR:

```bash
git checkout production && git pull
git merge --no-ff development          # or: gh pr create --base production --head development
git push origin production
```

`deploy.yml` runs `verify` then `make deploy-prod` (now `SECRET_NS=AHITS_PROD`,
`MIN_INSTANCES=1`). Because the `AHITS_PROD_*` secrets already exist (Step 2), the
`--set-secrets` validation passes.

## 7. Step 5 — Verify isolation

- `make cloud-run-url SERVICE=ahits-web-app GCP_PROJECT=$PROJ` → hit `/api/health`
  → expect `200` (it pings the DB).
- Confirm the prod service's `NEXT_PUBLIC_APP_URL` is the prod host (not staging) —
  check a generated Wave F `/s/<token>` link points at prod.
- Write a row in prod (create an item) and confirm it does **not** appear in
  staging — the core isolation check.
- Confirm the Cloud Scheduler cron (`ahits-dispatch`) for prod targets the prod
  URL with the prod `CRON_SECRET` (create a separate scheduler job for prod).

## 8. A2 — migrate-on-deploy automation (the related infra item)

`deploy.yml` notes that GitHub Actions runners **cannot reach the Supabase direct
connection** (IPv6-only on the current plan), which is why migrations are manual.
Two ways to close A2:
1. **Session-pooler URL (recommended, no infra change):** set `AHITS_PROD_DIRECT_URL`
   to Supabase's **session pooler** endpoint, which is IPv4-reachable. Then a
   `make cloud-run-migrate SECRET_NS=AHITS_PROD` step can run from GHA in the
   release job *before* the deploy step. (Validate the pooler works with
   `prisma migrate deploy` first — session mode supports DDL.)
2. **Self-hosted/IPv4 runner** for the migrate step.

Until A2 lands, keep applying migrations manually with `make cloud-run-migrate`
**before** merging any migration-bearing PR to `production` (per CLAUDE.md §3).

## 9. Cutover checklist

- [ ] Prod Supabase project created; connection strings captured
- [ ] All 11 `AHITS_PROD_*` secrets created + ENABLED; SA granted accessor
- [ ] `PIN_SESSION_SECRET` and `CRON_SECRET` are FRESH (not staging's)
- [ ] `NEXT_PUBLIC_APP_URL` = prod host
- [ ] Migration history applied to prod DB (`make cloud-run-migrate SECRET_NS=AHITS_PROD`)
- [ ] First admin created on prod
- [ ] `production` branch deploy green; `/api/health` 200
- [ ] Isolation verified (prod write absent from staging)
- [ ] Separate prod Cloud Scheduler job for `/api/cron/dispatch`
- [ ] DNS / custom domain pointed at the prod service (if applicable)

## 10. Rollback

Cloud Run keeps prior revisions — `gcloud run services update-traffic ahits-web-app
--to-revisions=<prev>=100` reverts instantly. Because prod has its own DB, a bad
prod migration cannot affect staging. Take a Supabase backup/snapshot before the
first real cutover.

## 11. Gotchas (learned from staging)

- **Never `prisma db push` / `migrate dev` against prod** — committed migrations +
  `migrate deploy` only (this caused a staging outage previously).
- **Secret before deploy** — create `AHITS_PROD_*` first; Cloud Run validates refs.
- **A new env secret also needs its Makefile mapping** — the `--set-secrets` line is
  the single source of truth; adding a secret without a mapping silently drops it.
- **`MIN_INSTANCES=1` on prod** means the in-memory rate limiter (CR-3) and
  per-request session check run on a warm instance — fine, but the public Wave F
  `/s/` endpoints still want the shared-store limiter (WF-1) before heavy use.
