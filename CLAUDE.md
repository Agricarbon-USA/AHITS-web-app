@AGENTS.md

# AHITS: how to build, test and ship

What AHITS is and who uses it: `README.md`. One environment, the live one: `ahits-web-app-staging`.

## Read first
1. `STATUS.md`: what is live, in flight, next, and known hazards.
2. Your request in `packets/`. (`packets/paused/` is parked. Do not build from it.)
3. `DECISIONS.md`: the live rules and the words to use. If a request conflicts with one, stop and ask the owner.

## The loop
1. **Request.** A few lines in `packets/`. If it does not match the code you find, say so before you build.
2. **Build.** Fresh branch from the latest `development`: `feature/YYYYMMDD/<github-login>-<short-name>`. One PR at a time; never stack a PR on another branch (CI runs only for PRs into `development`). Everything goes in ONE PR (see PR shape).
3. **CI green.** Run the gate (below) as far as you can. CI decides.
4. **Audit, where it pays.** Write "needs audit" on a PR that touches gear movement or stock, the database, sign-in or permissions, or offline / the service worker. The planning Claude audits those. Others skip it.
5. **Go.** The owner says "go" and it merges, any time. Database migrations and app-update changes (service worker: `src/app/sw.ts`, the Serwist block in `next.config.ts`) wait until after 6 pm Eastern or 0 Active Deployments (admin dashboard), and merge alone. Merge with squash; never use `--admin` to pass a red or pending check.
6. **Check it live.** After a green deploy run, check the 1-3 things the request names, as admin, through the screens, in the browser tab the owner has signed in (never sign in as him or Stewart). The owner checks what needs his phone or PIN. One comment on the PR records the revision and the result of each check.

Live checks: keep the tab visible (a hidden tab looks stuck). Before the first write, read Active Deployments (admin dashboard) and put the number in the PR comment. Make test data through the screens, never raw API calls. Name it "ZZ ...", use no real fleet vehicle, remove it after.

## Safety rules
- Stage files by name. Never `git add -A` / `git add .`, `git stash`, `git reset`, or `git checkout <ref> -- .`.
- Never read `.env` files.
- Nobody types the owner's PINs or passwords. The owner signs in himself.
- Nothing merges without the owner's go, except a PR that changes only `.md` files: it may merge itself on green CI.
- No revert without the owner's go. A revert is a deploy. Before proposing one, see the fault again after the new revision has settled, on a screen the PR touched.
- Live-database SQL runs only in the Supabase SQL Editor, by the owner. Hand him read-only SQL, or SQL with its undo.
- Never deploy or migrate from a terminal (`make deploy-staging`, `deploy-prod`, `cloud-run-deploy`, `cloud-run-migrate`). Never run the preview workflow (`pr-staging-deploy.yml`): it uses the live database and secrets.
- Never push or open a PR to `production`. There is no production, but the branch still starts the pipeline.

## Build and test
Node 24 (`.nvmrc`). `npm ci`, then `npx prisma generate`.

"The gate" is the five checks CI runs (`.github/workflows/verify.yml`): `npm run type-check`, `npm run lint`, `npm run test:ui` (screen tests, no database), `npm run build`, `npm test` (server tests, need Postgres).

- For generate and build, use the placeholder env values in `verify.yml`, never real ones.
- `npm test` needs `DATABASE_URL_TEST`; `make test` supplies a throwaway Postgres in Docker. Without Docker, say so in the PR: CI then checks the server tests.
- `make verify` is not the gate: it skips the screen tests and the build.

The gate also enforces:
- Only `src/lib/asset-status.ts` writes a vehicle or unit `status`. API code never returns a whole user row. (`tests/*-guard.test.ts`.)
- No raw colour hex in `src/`; use `src/theme/tokens.ts` (lint).

## Database & migration rules
- A schema change ships in a PR as a migration file. To create one: change `prisma/schema.prisma` and write the SQL by hand in `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql`. Say so in the PR. `make db-migrate-dev` now refuses a database that is not on this computer. The deploy applies the file before the new code serves.
- Additive first: new tables, nullable columns, columns with a default. Old code is still serving while it lands. Drops and renames come later, in their own PR.
- CI enforces this (`scripts/check-migration-safety.sh`): DROP, TRUNCATE, RENAME, DELETE FROM, SET NOT NULL, a type change, or ADD COLUMN NOT NULL without DEFAULT fails. A needed one takes `-- migration-safety: acknowledged <reason>` on the line before it, plus the PR label `destructive-migration-approved`. Trust CI, not a local run of the script.
- A new enum value passes the check, but an older revision fails when it reads one. Say so in the PR.
- Never run the `make` or `npm run prisma:*` commands on the "never run" list in `README.md`, or a bare `npx prisma migrate …` / `db push`. Some have no live-database guard, and you cannot read `.env` to see where they point.

## Deploy facts
- Merging to `development` deploys the live app (`.github/workflows/deploy.yml`): the gate, the migration check, migrate the live database, build and deploy to Cloud Run, a settings check. A failed step stops the rest.
- A merge that changes only root `*.md`, `docs/**` or `packets/**` does not deploy. Every other merge does, and crews see "A new version of AHITS is available".
- `/api/health` answers 200 `{"status":"ok","db":"up"}` when the app reaches its database. It does not name the revision; the deploy run's log does (to confirm).
- A merge is not live until its Deploy run ends green. Open the run after every merge. #279's deploy failed twice and nobody noticed for 10 days.
- Rollback: `docs/ROLLBACK.md`. Traffic goes back to the previous revision, then a revert PR. Never undo a migration by hand.
- A new secret must exist in Secret Manager before the deploy that mounts it, and be on the `--set-secrets` line in `Makefile`. Console-set settings are wiped by the next deploy. Never give a secret a `NEXT_PUBLIC_` name: browsers receive those values.

## PR shape
- One PR, base `development`, holding the code, its tests and the doc lines. No follow-up docs PR. Title: what changes for users, in plain words.
- Body: what changed for users; how it was tested (gate checks run, and any left to CI); the 1-3 live checks and who does each.
- One `CHANGELOG.md` line, written inside the PR and never edited afterwards: `date · #PR · what changed for users`. Add it in a second commit, once the PR has its number. The live revision and the live-check result go in the PR comment (step 6), not in CHANGELOG.
- `DECISIONS.md` / `STATUS.md` lines only when they change.

## Known traps
1. `src/lib/deployment-auth.ts` says the old holder columns "were dropped". Wrong: `rigs.operatorId`, `vehicles.assignedOperatorId` and `rig_operators` are still in the schema and still written. Trust the code.
2. The operator `my-deployment/page.tsx` is 1,450 lines. New dialogs go in new files; do not grow the page. No test enforces this.
3. Hand-written SQL (`$queryRaw`) is in 39 files and is not type-checked. The test database is built from the schema file, not the migrations, so a query can pass tests and fail live.
4. Two deployment builders: `NewDeploymentDialog.tsx` in `src/components/operator/` and in `src/components/admin/`. They behave differently. A change usually needs both.
5. Return logic is copied in three routes under `src/app/api/deployments/[id]/`: `end`, `items` (DELETE), `items/[kitItemId]`. Change all three or say why not.
6. On the admin Users page, when you change an admin to Field Operator, set a Reset PIN in the same save. The PIN tab does not take the old password.
7. A data-deleting migration deploys only if its merged PR has the `destructive-migration-approved` label. A failed check blocks every deploy until fixed. Unproven on a real drop.
8. After each deploy a check turns the run red unless the live service has `EMAIL_SANDBOX=true`, a non-empty `EMAIL_SANDBOX_TO` and 1 minimum instance. The new revision is already live by then. Change email settings in `Makefile` and that check in `deploy.yml` together.
9. `held/`, `docs/prepared/` and the `.sql` files in `scripts/` are stale. Do not apply or run them. A later PR deletes them.
10. In code, `Rig` (table `rigs`) is the deployment record.
