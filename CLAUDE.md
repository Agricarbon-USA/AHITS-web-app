@AGENTS.md

# Deployment Workflow

When a user says **"make this change then deploy it to cloud"** (or any variation like "deploy to staging", "push this to staging", "ship it"), follow this exact sequence:

## 1. Create a feature branch

Branch naming convention: `feature/YYYYMMDD/<github-username>-<FEATURE_DESCRIPTION>`

- `YYYYMMDD` = today's date
- `<github-username>` = the authenticated GitHub user (`gh api user --jq .login`)
- `<FEATURE_DESCRIPTION>` = short kebab-case description of the change (3–5 words max)

```bash
GH_USER=$(gh api user --jq .login)
DATE=$(date +%Y%m%d)
BRANCH="feature/${DATE}/${GH_USER}-<feature-description>"
git checkout -b "$BRANCH"
```

## 2. Make the code change

Apply the requested change. Commit when done:

```bash
git add -A
git commit -m "<short description of change>"
git push -u origin "$BRANCH"
```

## 3. Regenerate the Prisma client and commit any new migration

If you changed the schema, regenerate the client and create the migration on a
**disposable local/dev DB** (never a shared one — see the non-negotiable rules below):

```bash
make db-generate       # regenerate the Prisma client if schema changed
make db-migrate-dev    # create the migration against a LOCAL/dev DB only
```

Commit the generated `prisma/migrations/*` files as part of this branch.

> **Migrations against staging/prod are applied by the CI `migrate` job in
> `deploy.yml` (`make cloud-run-migrate`), not by hand.** You do **not** run
> `make db-migrate` against the shared staging/prod database from a laptop — the
> direct URL is IPv6-only from most networks and it duplicates the CI step. Just
> make sure the committed migration is backward-compatible (see rules below), since
> the migrate job runs **before** the new revision serves traffic.

## 4. Open a pull request

```bash
gh pr create \
  --title "<Short description>" \
  --body "<What changed and why>" \
  --base development
```

Capture the PR number from the output. Opening the PR runs the `CI` workflow
(lint, type-check, build, tests via the shared `verify` workflow); it must pass
before the PR is merged. There is **no `main` branch** — the integration branch
is `development` (deploys to staging) and `production` is the release branch
(deploys to prod).

## 5. Trigger the staging deploy

```bash
PR_NUMBER=$(gh pr view --json number --jq .number)
gh workflow run pr-staging-deploy.yml -f pr_number=$PR_NUMBER
```

Then watch it:

```bash
gh run watch
```

The staging URL will be posted as a comment on the PR when the deploy finishes. You can also check it with:

```bash
gh pr view --comments
```

## Notes

- The staging service is `ahits-web-app-staging` on Cloud Run in `us-central1`.
- You can also trigger an on-demand staging preview by adding the `deploy-staging` label to any open PR: `gh pr edit $PR_NUMBER --add-label deploy-staging` (runs `pr-staging-deploy.yml`).
- **Auto-deploys (`deploy.yml`):** landing changes on `development` deploys to **staging**; landing changes on `production` deploys to **prod**. Each run is `verify` (lint, type-check, build, tests) → **`migrate`** (`make cloud-run-migrate`) → `deploy`, and will not deploy if an earlier job fails. Promote staging → prod by merging `development` into `production` (e.g. a PR with `--base production`).
- Migrate-on-deploy **is live** (the `migrate` job in `deploy.yml`), superseding the old manual step. The Docker image itself still does not run migrations.
- ⚠️ **KNOWN BUG (fix before the first prod promote):** `make cloud-run-migrate` hardcodes the **staging** migration secret (`AHITS_MIGRATE_URL`), so a merge to `production` currently migrates **staging** and then serves prod against an unmigrated schema. Before promoting to prod: parameterize the secret to `$(SECRET_NS)_MIGRATE_URL`, create `AHITS_PROD_MIGRATE_URL` (prod session pooler, port 5432, IPv4), and have `deploy.yml` pass `SECRET_NS=AHITS_PROD` on the `production` branch. Tracked as a Wave 0 release-safety item.
- Do **not** deploy directly from a local machine to production; always go through the PR + GitHub Actions flow.

## Database & migration rules (non-negotiable)

These exist because a `db push` against a shared database previously caused a staging
outage, and manual-migration/secret ordering has repeatedly stalled deploys.

- **Never run `prisma db push` or `prisma migrate dev` against a shared database**
  (staging or prod). Those are for a disposable local/dev DB only. Schema changes
  ship as a **committed migration** in `prisma/migrations/` and are applied with
  `prisma migrate deploy` (`make db-migrate` / `make cloud-run-migrate`).
- **Ship migrations backward-compatible.** The `deploy.yml` `migrate` job runs
  **before** the new revision serves traffic, but the two are not atomic: a revision
  that references a table/column the migration hasn't added yet errors at runtime.
  Additive (nullable columns, new tables) is safe; destructive drops must lag the
  code that stopped using them.
- **A new secret must exist in Secret Manager _before_ the deploy that mounts it.**
  Cloud Run validates `--set-secrets` references at deploy time; deploying first
  fails the release. Create the `AHITS_*` secret, confirm an ENABLED version, then
  deploy.
- Adding a new env secret also means adding its `NAME=AHITS_NAME:latest` mapping to
  the `--set-secrets` line in the `Makefile` (`cloud-run-deploy`) — otherwise the
  next deploy silently drops it.
- Migrate-on-deploy automation (the authenticated `migrate` job in `deploy.yml`) has
  **shipped** and retires most of the old manual ceremony — but see the prod-secret
  bug noted in the Deployment Workflow above; that must be fixed before prod relies on it.
