# REQ-A1: Docs-only merges stop deploying; risky make commands refuse

Written Nov 11, 2026 against `development` @ `3d87588`; updated the same evening, after #280 merged as `f3a7763`. One PR, no audit.

## Read this first
- Why: 17 of 38 merges since Oct 6 were docs merges (15 touched only files this filter ignores; 2 also changed a PDF then kept at the root). Each rebuilt the live app and showed crews the "new version" prompt. And on a laptop `make setup`, `make db-migrate-dev` and `make deploy-staging` act on whatever `.env` names, unchecked.
- `make deploy-staging` cannot go: `deploy.yml` calls it. It refuses outside GitHub Actions instead.
- Left open: `npx prisma …`, `npm run prisma:*`, `make db-migrate` and `make db-studio` have no guard. `make db-seed` still accepts the staging override.
- The check on data-deleting migrations is REQ-A2. Leave the `migration-safety` job alone.
- New on Nov 11: #280's deploy put P1-1b (#279) live for the first time. #279's own deploys on Nov 1 and Nov 3 had failed because Google Cloud billing was off, and nobody noticed. Change 0 corrects the docs and records three owner answers that missed #280.

## Changes
**0. Doc corrections** (do these first; each quoted line is in the docs as merged in #280).
- `DECISIONS.md`: `- Crews work in several time zones, so a check belongs to the day on the operator's own phone. (Nov 11) — not built yet (today: the US Central day)` → `- Crews work in several time zones, so a check belongs to the day on the operator's own phone. Whether a check was missed is judged by that same clock. (Nov 11) — not built yet (today: the US Central day)`
- `DECISIONS.md`: `- Stewart gets a one-page "roll back and restore" note instead of a backup developer. (Nov 11) — to write` → `- Stewart gets a short "in case of emergency" guide (roll back, restore from a backup, who to call) instead of a backup developer. It also stands in for the admin guide (D20). (Nov 11) — to write`
- `DECISIONS.md`: `wait for the evening or zero active deployments` → `wait until after 6 pm Eastern or zero active deployments`
- `DECISIONS.md`: delete the whole `## Needs the owner` section at the end of the file (the heading and its three numbered lines). The owner answered all three on Nov 11.
- `CLAUDE.md`: `wait for the evening or 0 Active Deployments` → `wait until after 6 pm Eastern or 0 Active Deployments`
- `CLAUDE.md`, Deploy facts: add, before the line that starts `- Rollback: `, the line `- A merge is not live until its Deploy run ends green. Open the run after every merge. #279's deploy failed twice and nobody noticed for 10 days.`
- `STATUS.md`: `Claude drafts the one-page "roll back and restore" note for Stewart from `docs/ROLLBACK.md`; the owner checks it.` → `Claude drafts a short "in case of emergency" guide for Stewart (roll back, restore, who to call) from `docs/ROLLBACK.md`; the owner checks it.`
- `STATUS.md`: `- Last code change: PR #279 (P1-1b), merged Nov 1, 2026.` → `- Last code change: PR #279 (P1-1b), merged Nov 1, 2026. It went live on Nov 11, 2026 with #280's deploy (revision `ahits-web-app-staging-00462-6ns`). Its own deploys on Nov 1 and Nov 3 failed because Google Cloud billing was off.`
- `STATUS.md`: `- 2026-11-01: P1-1b live checks: the six rows in the PR #279 comment (to post), on a throwaway "ZZ" deployment.` → `- 2026-11-11: P1-1b live checks: the six rows in the PR #279 comment, on a throwaway "ZZ" deployment. P1-1b went live this day.` If a comment on #279 or #280 says all six passed, delete the line instead.
- `STATUS.md`, Known hazards: add `- Nobody is told when a deploy fails. After every merge, open the Deploy run and see it end green.`
- `CHANGELOG.md`: add a second new entry, under this PR's own line: `- 2026-11-11 · correction · #280's deploy also put P1-1b (#279) live for the first time, as revision `ahits-web-app-staging-00462-6ns`. #279's own deploys on Nov 1 and Nov 3 failed because Google Cloud billing was off, so the app ran P1-1a code until Nov 11. The #280 line's "No change to the app" and the #279 line's revision are wrong; both lines are left as written`

**1. `.github/workflows/deploy.yml`, the trigger only.** Under `on: push:`, after the `branches:` list:
```yaml
    # A push that changes only documents does not deploy. Never copy this to
    # ci.yml: its checks are required on every PR and would hang as "Pending".
    paths-ignore:
      - '*.md'
      - 'docs/**'
      - 'packets/**'
```
- `'*.md'` is root-level only: in GitHub's filter patterns `*` does not match `/`. A `.md` under `src/`, `public/` or `prisma/` still deploys. So does any push with one file outside the list.
- A docs merge no longer retries a failed deploy. Re-run the failed run instead, unless a later deploy has succeeded: a re-run ships that run's own commit.

**2. `Makefile`.** Add after the `GUARD_LIVE_DB` block (recipe lines start with a tab):
```make
# Local only: both addresses Prisma can use (shell env, then .env) must be on this computer.
define GUARD_LOCAL_DB
	@for V in DIRECT_URL DATABASE_URL; do \
	  U="$$(printenv $$V || true)"; \
	  [ -n "$$U" ] || [ ! -f .env ] || U="$$(grep -E "^$$V=" .env | head -1 | cut -d= -f2- | tr -d '\042\047\r')"; \
	  H="$$(echo "$$U" | sed -E 's|^[A-Za-z0-9+.-]*://||; s|[/?#].*$$||; s|^.*@||; s|:[0-9]*$$||')"; \
	  case "$$H" in localhost|127.0.0.1|"[::1]") ;; *[!A-Za-z0-9.-]*) H="an address it cannot read" ;; esac; \
	  case "$$U" in *[?\&]host=*) H="a host= override" ;; esac; \
	  case "$$H" in localhost|127.0.0.1|"[::1]") ;; \
	    *) echo "✋ REFUSING: $$V points at '$${H:-nothing}'. '$@' runs only against a database on this computer (localhost or 127.0.0.1)."; exit 1 ;; \
	  esac; \
	done
endef

# Deploys and live migrations happen only in GitHub Actions.
define GUARD_ACTIONS_ONLY
	@[ "$$GITHUB_ACTIONS" = "true" ] || { echo "✋ REFUSING: '$@' runs only inside GitHub Actions. To ship: merge a PR into development. To repeat a deploy: re-run the last Deploy run on GitHub."; exit 1; }
endef
```
- `db-migrate-dev`: add `$(GUARD_LOCAL_DB)` as the first recipe line (`setup` runs through it).
- `db-reset`: `$(GUARD_LIVE_DB)` becomes `$(GUARD_LOCAL_DB)`. `db-seed` keeps `GUARD_LIVE_DB`.
- `deploy-staging`, `deploy-prod`, `cloud-run-deploy`, `cloud-run-migrate`: add `$(GUARD_ACTIONS_ONLY)` as the first recipe line.
- Comment "live-database guard for the two destructive DB targets" becomes "live-database guard for `db-seed` (`db-reset` uses GUARD_LOCAL_DB below)".
- `test-prepare` stays: its address is fixed to `localhost:5433`.

**3. Doc lines** (quoted from the Nov 11 drafts; if one is not there word for word, change the line that says the same thing and report it).
- `STATUS.md`, In flight: delete `2. REQ-A1: docs-only merges stop deploying; Makefile guards.` and renumber.
- `STATUS.md`, Known hazards: delete `- Until REQ-A1 lands, a docs-only merge redeploys the live app and phones show the "new version" prompt.`
- `STATUS.md`, Known hazards: `` Only `db-seed` and `db-reset` refuse it. `` → `Some have no guard.`
- `STATUS.md`, Live now: add `- REQ-A1 (#<PR>) is live. One check left: the next docs-only PR deletes this line and, once merged, confirms no Deploy run started for it (comment on #<PR>).`
- `DECISIONS.md`: `- Docs-only merges do not redeploy the live app. (Oct 22) — not built yet, REQ-A1` now ends at `(Oct 22)`.
- `CLAUDE.md`: `` This is the only safe way until REQ-A1 guards `make db-migrate-dev`. `` → `` `make db-migrate-dev` now refuses a database that is not on this computer. ``
- `CLAUDE.md`: `Most have no live-database guard` → `Some have no live-database guard`
- `CLAUDE.md`: `- A docs-only merge deploys too, and every deploy shows crews "A new version of AHITS is available". REQ-A1 ends this. Until then keep docs edits inside the code PR.` → `` - A merge that changes only root `*.md`, `docs/**` or `packets/**` does not deploy. Every other merge does, and crews see "A new version of AHITS is available". ``
- `README.md`: `` Only `make db-seed` and `make db-reset` refuse a live address: `` → `` Most now refuse; `make db-migrate` and the `npm run` / `npx` ones do not: ``
- Then no line in these four files may say REQ-A1 is still to come.

## Tests
After `npm ci`:
```bash
npx js-yaml .github/workflows/deploy.yml >/dev/null && echo yaml-ok
L=postgresql://x:x@localhost:1/x; R=postgresql://x:x@live.example.invalid:5432/x
DIRECT_URL=$R DATABASE_URL=$L make db-migrate-dev
DIRECT_URL=$L DATABASE_URL=$R make db-reset
DIRECT_URL=$L DATABASE_URL=$L make db-migrate-dev
for t in deploy-staging deploy-prod cloud-run-deploy cloud-run-migrate; do env -u GITHUB_ACTIONS make $t GCP_PROJECT=none; done
```
Expect `yaml-ok`, REFUSING twice, a Prisma error that it cannot reach `localhost:1` (no REFUSING), then REFUSING four times. The fake addresses and `GCP_PROJECT=none` keep a missing guard harmless. If a deploy target starts a Docker build, the guard is missing: stop it (Ctrl-C). No PR check can test the filter; live check 1 does.

## Must not change
Nothing under `src/`, `prisma/`, `tests/`, `scripts/`. `ci.yml`, `verify.yml`, `pr-staging-deploy.yml`. In `deploy.yml`, everything but the trigger.

## How to tell it worked
Both checks only read. Nothing needs the owner's phone or PIN.
1. Claude Code, right after the merge: `gh run list --workflow deploy.yml --limit 3` shows a Deploy run for the merge commit, and it ends green. So a code merge still deploys and the guards let GitHub Actions through. If a job is red with REFUSING, nothing was migrated or deployed: tell the owner.
2. Whoever opens the next docs-only PR (the new STATUS line tells them): after its merge, no Deploy run for that commit. Do not make a commit just to test this.

## Merge rule
Not a database or app-update change: any time, on the owner's go. Merging it deploys once.

## CHANGELOG line
New first entry:
`- <date the PR is opened> · #<PR> · Docs-only merges no longer redeploy the app; risky make commands refuse outside a local database or GitHub Actions`

## Prompt for Claude Code
```
The docs clean-up must already be merged: if CLAUDE.md has no "Build and test" section naming "the gate", stop and tell the owner.
Read CLAUDE.md, AGENTS.md, STATUS.md and packets/REQ-A1_docs-dont-deploy-and-guards.md. Build exactly that request, nothing more.
Run git fetch, then branch from the latest origin/development.
Change only: .github/workflows/deploy.yml (the trigger), Makefile, CHANGELOG.md, and the doc lines the request names in STATUS.md, DECISIONS.md, CLAUDE.md, README.md (change 0, the corrections, first; then change 3).
Run the request's tests as written, then the gate: npm run lint, npm run type-check, npm run test:ui, npm run build (after npx prisma generate, with the placeholder env values in .github/workflows/verify.yml). Server tests run in CI.
Open ONE PR into development titled "Docs-only merges stop deploying; risky make commands refuse". It includes the request file itself (untracked in packets/: add it by name), the doc lines, and the CHANGELOG line once the PR has its number.
Wait for CI. Report the PR number, the CI result, the test output and anything that did not match. Then stop and wait for the owner's go.
After the owner's go and the merge, do the live check marked "Claude Code" and post the result as a PR comment.
Safety: stage named files only; never git add -A or git add . ; never git stash, git reset, or git checkout <ref> -- . ; never read .env files; run no make db-* or deploy target except the request's tests; do not merge without the owner's go.
```
