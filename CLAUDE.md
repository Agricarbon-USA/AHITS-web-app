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

## 3. Run Prisma locally before opening the PR

Always run these on the local machine before creating the PR. The Docker build does not run migrations, and a missing Prisma client or unapplied migration will fail the build.

```bash
# Regenerate the Prisma client if schema changed
make db-generate

# Apply any pending migrations against the real database
make db-migrate
```

If you created a new migration during this change, also commit the generated files in `prisma/migrations/` as part of the same branch.

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
- **Auto-deploys (`deploy.yml`):** landing changes on `development` deploys to **staging**; landing changes on `production` deploys to **prod**. Both first run the shared `verify` workflow (lint, type-check, build, tests) and will not deploy if it fails. Promote staging → prod by merging `development` into `production` (e.g. a PR with `--base production`).
- Migrations are **not** applied by `deploy.yml` or the Docker image. Apply them with `make db-migrate` against the target database **before** the code that needs them lands (see step 3). Automating this in the release path is a tracked Wave A item.
- Do **not** deploy directly from a local machine to production; always go through the PR + GitHub Actions flow.

## Database & migration rules (non-negotiable)

These exist because a `db push` against a shared database previously caused a staging
outage, and manual-migration/secret ordering has repeatedly stalled deploys.

- **Never run `prisma db push` or `prisma migrate dev` against a shared database**
  (staging or prod). Those are for a disposable local/dev DB only. Schema changes
  ship as a **committed migration** in `prisma/migrations/` and are applied with
  `prisma migrate deploy` (`make db-migrate` / `make cloud-run-migrate`).
- **Apply the migration before the code that needs it lands.** `deploy.yml` and the
  Docker image do **not** run migrations. A revision that references a table/column
  that isn't in the DB yet will error at runtime.
- **A new secret must exist in Secret Manager _before_ the deploy that mounts it.**
  Cloud Run validates `--set-secrets` references at deploy time; deploying first
  fails the release. Create the `AHITS_*` secret, confirm an ENABLED version, then
  deploy.
- Adding a new env secret also means adding its `NAME=AHITS_NAME:latest` mapping to
  the `--set-secrets` line in the `Makefile` (`cloud-run-deploy`) — otherwise the
  next deploy silently drops it.
- Migrate-on-deploy automation (an authenticated migrate step in the release path)
  is the tracked Wave A item that would retire most of this manual ceremony.
