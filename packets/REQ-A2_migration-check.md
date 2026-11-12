# REQ-A2: The check on data-deleting migrations holds after a merge

Written Nov 11, 2026 against `development` @ `3d87588`, to be built later: **only after REQ-A1 has merged. Re-read `deploy.yml` as it stands then.** REQ-A1 adds `paths-ignore` to its trigger; that stays. If the `migration-safety` job or the script no longer matches what is quoted here, stop and tell the owner. Needs audit. Merges alone.

## Read this first
- Today the deploy's check sees no labels and looks only at files changed since the previous push. A check that failed, or a run GitHub cancelled in the queue, is forgotten: the next merge finds nothing to check and applies the migration.
- After this it checks everything since the last deploy that succeeded, and reads the labels of the merged PRs in that range that changed migrations. An approved drop passes. An unapproved one fails on every merge until it is fixed, or labelled and re-run. The label rule is enforced on a deploy for the first time.
- To confirm: GitHub's docs say a workflow cannot set `GITHUB_BASE_REF`. If so, until now an acknowledged drop passed the deploy with a warning and no label. If not, an approved drop failed there.
- **Only the first real drop can prove** that an approved drop passes on the real pipeline. A laptop proves the script. Live check 1 proves both GitHub lookups. If that first drop fails, it fails safe: the deploy stops and nothing is applied.
- Known limit: if two PRs in one undeployed range both change migrations and one carries the label, the label covers both. The PR rule on `development` (a PR with green checks) is what stops the other one. Do not merge a migration PR past a red check.
- Wanted side effect: a push to `production` stops at this check for good, as no deploy from it has succeeded (per the reports; to confirm).

## Changes
**1. `scripts/check-migration-safety.sh`.** `BASE_REF="${GITHUB_BASE_REF:-}"` becomes:
```bash
BASE_REF="${TARGET_BRANCH:-${GITHUB_BASE_REF:-}}"
```
Two comments. Above that line: "(injected by ci.yml; …)" becomes "(set by ci.yml on a PR and by deploy.yml on a deploy; …)". In the header: "when GITHUB_BASE_REF is" becomes "when the target branch (TARGET_BRANCH on a deploy, GITHUB_BASE_REF on a PR) is". `ci.yml`, the only other caller, needs no change.

**2. `.github/workflows/deploy.yml`.** Replace the whole job, from the line `migration-safety:` to the line `bash scripts/check-migration-safety.sh "$BEFORE_SHA"`, with this. The comment block above the job stays.
```yaml
  migration-safety:
    name: Backward-compatible migrations
    needs: verify
    runs-on: ubuntu-latest
    permissions:
      contents: read        # checkout
      actions: read         # find the last successful deploy run
      pull-requests: read   # read the labels of merged PRs
    steps:
      - uses: actions/checkout@v5
        with:
          # Full history: the check compares HEAD with the last deployed commit.
          fetch-depth: 0

      - name: Check every migration since the last successful deploy
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          TARGET_BRANCH: ${{ github.ref_name }}
        run: |
          set -euo pipefail
          BASE="$(gh run list --workflow deploy.yml --branch "$TARGET_BRANCH" --status success --limit 1 --json headSha --jq '.[0].headSha // empty')"
          if [ -z "$BASE" ]; then
            echo "::error::migration-safety: no deploy from '$TARGET_BRANCH' has ever succeeded, so there is nothing to compare with. This check stops here on purpose. A first deploy from this branch needs the owner and a change to this step."
            exit 1
          fi
          if ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
            echo "::error::migration-safety: the last deployed commit ${BASE} is not in this checkout. Tell the owner."
            exit 1
          fi
          # A label counts only when its merged PR changed prisma/migrations.
          MIG=" $(git rev-list "${BASE}..HEAD" -- prisma/migrations | tr '\n' ' ')"
          LABELS=""
          for sha in $(git rev-list "${BASE}..HEAD"); do
            FOUND="$(gh api "repos/${GH_REPO}/commits/${sha}/pulls" --jq '[.[] | select(.merged_at != null) | .labels[].name] | join(",")')"
            case "$MIG" in
              *" ${sha} "*) LABELS="${LABELS},${FOUND}"; echo "migration-safety: ${sha} changes migrations; PR labels counted: '${FOUND}'" ;;
              *) echo "migration-safety: ${sha} changes no migration; PR labels not counted: '${FOUND}'" ;;
            esac
          done
          echo "migration-safety: checking ${BASE}..$(git rev-parse HEAD)"
          PR_LABELS="$LABELS" bash scripts/check-migration-safety.sh "$BASE"
```

**3. Doc lines** (quoted from the Nov 11 drafts; if one is not there word for word, change the line that says the same thing and report it).
- `STATUS.md`, In flight: delete `5. REQ-A2: the check on data-deleting migrations; audited; merges alone.` and renumber. Known hazards has no line for this; if one about the destructive-migration label has appeared, delete it.
- `CLAUDE.md`, Known traps: `7. The destructive-migration label is checked on the PR only. The deploy after the merge either fails (the next merge then applies the migration unchecked) or applies it at once: to confirm. Warn the owner before merging any drop. REQ-A2 fixes this.` → `` 7. A data-deleting migration deploys only if its merged PR has the `destructive-migration-approved` label. A failed check blocks every deploy until fixed. Unproven on a real drop. ``

## Tests
After `npm ci`. Expect `1`, `0`, `0` (not approved fails; approved passes; the old base misses the drop), then `step-ok`:
```bash
( S="$PWD/scripts/check-migration-safety.sh"; cd "$(mktemp -d)"
git init -q -b development . && git config user.email t@t && git config user.name t
git commit -q --allow-empty -m "last good deploy" && A=$(git rev-parse HEAD)
mkdir -p prisma/migrations/1_drop
printf -- '-- migration-safety: acknowledged proof\nALTER TABLE "t" DROP COLUMN "c";\n' > prisma/migrations/1_drop/migration.sql
git add prisma/migrations/1_drop/migration.sql && git commit -q -m drop && B=$(git rev-parse HEAD)
git commit -q --allow-empty -m "next merge"
run(){ TARGET_BRANCH=development PR_LABELS="$1" bash "$S" "$2" >/dev/null 2>&1; echo $?; }
run "" "$A"; run ",destructive-migration-approved" "$A"; run "" "$B" )
npx js-yaml .github/workflows/deploy.yml | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).jobs["migration-safety"].steps[1].run))' | bash -n && echo step-ok
```
Any other three numbers: this machine cannot run the script (a Mac usually cannot). Save the `( … )` block as `/tmp/proof.sh` and run it in Linux (not tried; to confirm):
`docker run --rm -v "$PWD/scripts":/w/scripts:ro -v /tmp/proof.sh:/p.sh:ro -w /w node:24 bash /p.sh`
If that fails too, the PR must say: "the script change is not proven before merge; CI does not exercise it."

## Must not change
Nothing under `src/`, `prisma/`, `tests/`. `ci.yml`, `verify.yml`, `pr-staging-deploy.yml`, `Makefile`. In `deploy.yml`, everything outside this job. The job keeps its key, its name, `needs: verify` and `fetch-depth: 0`.

## How to tell it worked
The check only reads; the label is harmless. Nothing needs the owner's phone or PIN.
- Claude Code, before the merge: put the label `documentation` on this PR (any existing label will do; never `destructive-migration-approved`).
1. Claude Code, right after the merge: the Deploy run is green. Its "Backward-compatible migrations" log (`gh run view <id> --log`) shows `migration-safety: checking <sha>..<sha>`, the first sha being the head of the green Deploy run before this one (`gh run list --workflow deploy.yml --branch development --status success --limit 2 --json headSha`, second row), and a line ending `changes no migration; PR labels not counted: 'documentation'`. Empty quotes mean the label lookup does not work: tell the owner before any drop is merged.
- If the job is red, nothing was migrated or deployed. Tell the owner. The way back is a revert PR, on his go.
- Never write a drop just to test this.

## Merge rule
"needs audit" is the first line of the PR body. The planning Claude reads the whole `deploy.yml` diff and the script change before the owner's go. Not a migration, so any time of day, but alone: no other PR merges until live check 1 has passed. It must be live before the PR that drops the old "who holds it" columns.

## CHANGELOG line
New first entry:
`- <date the PR is opened> · #<PR> · The check on data-deleting migrations now holds on the deploy: an approved one passes, an unapproved one blocks every deploy until fixed. No change to the screens`

## Prompt for Claude Code
```
REQ-A1 must already be merged: if .github/workflows/deploy.yml has no paths-ignore block, stop and tell the owner. Re-read deploy.yml as it stands now.
Read CLAUDE.md, AGENTS.md, STATUS.md and packets/REQ-A2_migration-check.md. Build exactly that request, nothing more.
Run git fetch, then branch from the latest origin/development.
Change only: .github/workflows/deploy.yml (the migration-safety job), scripts/check-migration-safety.sh, CHANGELOG.md, and the doc lines the request names in STATUS.md and CLAUDE.md.
Run the request's tests as written, then the gate: npm run lint, npm run type-check, npm run test:ui, npm run build (after npx prisma generate, with the placeholder env values in .github/workflows/verify.yml). Server tests run in CI.
Open ONE PR into development titled "The check on data-deleting migrations holds after a merge", with "needs audit" as the first line of its body, and put the label `documentation` on it. It includes the request file itself (untracked in packets/: add it by name), the doc lines, and the CHANGELOG line once the PR has its number.
Wait for CI. Report the PR number, the CI result, the test output and anything that did not match. Then stop and wait for the audit and the owner's go.
After the owner's go and the merge, do the live check marked "Claude Code" and post the result as a PR comment. Merge nothing else until it has passed.
Safety: stage named files only; never git add -A or git add . ; never git stash, git reset, or git checkout <ref> -- . ; never read .env files; run no make db-* or deploy target; do not merge without the owner's go.
```
