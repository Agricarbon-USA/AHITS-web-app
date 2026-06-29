# AHITS — Production Standup Checklist (executable)

_Distilled from `AHITS_PIPE2_PROD_DB_RUNBOOK.md` into an ordered, copy-paste sheet. All steps are your-hands (they involve credentials). Prepared 2026-06-25._

> ## ⛔ Two gates before you start
> 1. **Separate prod Supabase project — never share staging's DB.** Prod pointed at staging's `DATABASE_URL` corrupts staging on every write. (Runbook §1/§3.) Ignore any "use the same project" shortcut.
> 2. **Don't cut over (Phase 5) until HOTFIX-1 is merged + staging is smoke-clean.** Otherwise prod launches with the F10 P0 (consumable checkout broken). Phases 0–4 (provisioning) are safe to do now in parallel; Phase 5 (the live deploy) waits.

Set these once in your shell:
```bash
export PROJ="<your-prod-gcp-project-id>"     # e.g. ahits-499421 (the deploy showed project number 403941966493 — use the ID)
export SA="<deployer-service-account-email>" # the SA GitHub Actions deploys with (same one that reads staging secrets)
```

---

## Phase 0 — Create the prod database
- [ ] Create a **new Supabase project** named e.g. `ahits-prod` (separate from staging).
- [ ] From it, capture (Settings → Database / API):
  - Pooled (Transaction, port 6543) → use for `DATABASE_URL`
  - **Session pooler (port 5432, IPv4)** → use for `DIRECT_URL` (so CI can migrate — closes A2)
  - Project URL, `anon` key, `service_role` key
- [ ] Take an initial snapshot/backup (so you have a clean restore point).

## Phase 1 — Create the 11 `AHITS_PROD_*` secrets (FRESH session/cron)
```bash
mk() { printf '%s' "$2" | gcloud secrets create "$1" --project="$PROJ" --data-file=- 2>/dev/null \
       || printf '%s' "$2" | gcloud secrets versions add "$1" --project="$PROJ" --data-file=-; }

mk AHITS_PROD_DATABASE_URL                  "postgresql://...pooler...:6543/postgres?pgbouncer=true"
mk AHITS_PROD_DIRECT_URL                    "postgresql://...session-pooler...:5432/postgres"
mk AHITS_PROD_NEXT_PUBLIC_SUPABASE_URL      "https://<prod-ref>.supabase.co"
mk AHITS_PROD_NEXT_PUBLIC_SUPABASE_ANON_KEY "<prod anon key>"
mk AHITS_PROD_SUPABASE_SERVICE_ROLE_KEY     "<prod service_role key>"
mk AHITS_PROD_PIN_SESSION_SECRET            "$(openssl rand -base64 48)"   # FRESH — not staging's
mk AHITS_PROD_CRON_SECRET                   "$(openssl rand -base64 48)"   # FRESH — not staging's
mk AHITS_PROD_RESEND_API_KEY                "<resend key>"
mk AHITS_PROD_EMAIL_FROM                    "AHITS <noreply@agricarbon.com>"
mk AHITS_PROD_ADMIN_EMAIL                   "ops@agricarbon.com"
mk AHITS_PROD_NEXT_PUBLIC_APP_URL           "https://<prod-host>"          # the PROD URL (embedded in /s/ links)
```
Verify + grant access:
```bash
for s in DATABASE_URL DIRECT_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
         SUPABASE_SERVICE_ROLE_KEY PIN_SESSION_SECRET CRON_SECRET RESEND_API_KEY \
         EMAIL_FROM ADMIN_EMAIL NEXT_PUBLIC_APP_URL; do
  gcloud secrets versions list "AHITS_PROD_$s" --project="$PROJ" --filter="state=ENABLED" --format="value(name)" \
    | grep -q . && echo "OK  AHITS_PROD_$s" || echo "MISSING AHITS_PROD_$s"
  gcloud secrets add-iam-policy-binding "AHITS_PROD_$s" --project="$PROJ" \
    --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor" >/dev/null
done
```
- [ ] All 11 print `OK`; the SA has accessor on each.

## Phase 2 — Apply migration history to the empty prod DB
Run from a machine that can reach the prod session-pooler (your laptop):
```bash
make cloud-run-migrate SECRET_NS=AHITS_PROD GCP_PROJECT="$PROJ"   # prisma migrate deploy against AHITS_PROD_DIRECT_URL
```
- [ ] Completes clean (applies every committed migration, incl. the multi-hub + requests ones).
- [ ] Sanity: `_prisma_migrations` row count on prod == number of folders in `prisma/migrations/`.

## Phase 3 — Create the first admin (do NOT run `make db-seed` — it wipes data)
- [ ] Create exactly one admin so you can log in. Safest: a one-off insert of a single ADMIN user with a known PIN/password (use the app's hashing — e.g. a small script that calls the same hash util the invite flow uses), or a temporary invite. **Never** run the dev `make db-seed` against prod.

## Phase 4 — Separate prod cron scheduler
- [ ] Create a **prod** Cloud Scheduler job for `POST https://<prod-host>/api/cron/dispatch` with the prod `CRON_SECRET` (don't reuse the staging `ahits-dispatch` job — it targets staging).

---

## Phase 5 — Cutover (ONLY after HOTFIX-1 merged + staging smoke-clean)
```bash
# Confirm green CI on development, then promote:
git checkout production && git pull
git merge --no-ff development          # or: gh pr create --base production --head development && merge
git push origin production             # deploy.yml runs verify → make deploy-prod (SECRET_NS=AHITS_PROD)
gh run watch
```
Secret validation now passes because Phase 1 created them.

## Phase 6 — Isolation verification (the critical checks — do all)
```bash
# a) health
curl -fsS https://<prod-host>/api/health        # expect 200 (it pings the prod DB)
```
- [ ] **App URL:** generate a `/s/<token>` link in prod and confirm it points at the **prod** host, not staging.
- [ ] **DB isolation (the core check):** create an inventory item in **prod**, then confirm it does **NOT** appear in **staging** (and vice versa). If it does → prod is on staging's DB; STOP and fix `AHITS_PROD_DATABASE_URL`/`DIRECT_URL`.
- [ ] **Cron:** confirm the prod scheduler hits the prod URL with the prod secret and returns `ok:true`; staging's cron is untouched.
- [ ] **Auth isolation:** a staging session cookie does NOT authenticate on prod (proves `PIN_SESSION_SECRET` is fresh/distinct).

## Phase 7 — Finalize
- [ ] DNS / custom domain → prod service (if applicable); re-confirm `NEXT_PUBLIC_APP_URL` matches.
- [ ] Take a post-cutover Supabase snapshot.
- [ ] Note rollback: `gcloud run services update-traffic ahits-web-app --to-revisions=<prev>=100 --project="$PROJ"` (instant; prod has its own DB so a bad prod migration can't touch staging).

---

### Cutover checklist (one-line gate before announcing)
Separate prod project ✓ · 11 secrets ENABLED + SA accessor ✓ · PIN/CRON fresh ✓ · APP_URL=prod ✓ · migrations applied ✓ · first admin ✓ · prod deploy green + /api/health 200 ✓ · **prod write absent from staging** ✓ · separate prod cron ✓ · **HOTFIX-1 in the promoted build** ✓
