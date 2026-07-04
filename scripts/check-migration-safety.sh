#!/usr/bin/env bash
# Migration-safety gate (#107). Turns the "backward-compatible migrations only" rule
# from convention into a CI check.
#
# Why: migrate-on-deploy runs the migration BEFORE the new revision serves traffic, and
# the two are not atomic — so a destructive or NOT-NULL-without-default migration can
# break the STILL-RUNNING old revision (see CLAUDE.md → Database & migration rules).
#
# What: in migrations ADDED on this branch vs the base, flag any of:
#   DROP TABLE / DROP COLUMN / TRUNCATE / RENAME (TO|COLUMN) / SET NOT NULL /
#   ADD COLUMN ... NOT NULL without a DEFAULT
#
# Escape hatch: a genuinely-needed destructive migration that LAGS the code which
# stopped using the object can opt out with a line in the .sql file:
#   -- migration-safety: acknowledged <reason>
set -euo pipefail

BASE="${1:-origin/development}"
git fetch --quiet origin "${BASE#origin/}" 2>/dev/null || true

# Fail CLOSED: if the base ref can't be resolved we can't tell which migrations are new,
# so refuse rather than silently pass (the whole point of this gate is to be trustworthy).
# In CI this means `actions/checkout` must use `fetch-depth: 0`.
if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "::error::migration-safety: base ref '$BASE' could not be resolved — cannot determine which migrations are new. Ensure the checkout uses fetch-depth: 0."
  exit 1
fi

# Added/modified migration SQL files on this branch vs the merge-base with BASE.
mapfile -t FILES < <(git diff --diff-filter=AM --name-only "${BASE}...HEAD" -- 'prisma/migrations/**/*.sql' 2>/dev/null || true)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "✅ migration-safety: no added/changed migrations to check."
  exit 0
fi

DESTRUCTIVE_RE='DROP[[:space:]]+TABLE|DROP[[:space:]]+COLUMN|TRUNCATE|RENAME[[:space:]]+(TO|COLUMN)|SET[[:space:]]+NOT[[:space:]]+NULL'
fail=0

for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  hits="$(grep -inE "$DESTRUCTIVE_RE" "$f" || true)"
  # ADD COLUMN ... NOT NULL on a line without DEFAULT — breaks inserts from the old revision.
  addnn="$(grep -inE 'ADD[[:space:]]+COLUMN' "$f" | grep -iE 'NOT[[:space:]]+NULL' | grep -ivE 'DEFAULT' || true)"

  if [ -n "$hits" ] || [ -n "$addnn" ]; then
    if grep -qiE '^[[:space:]]*--[[:space:]]*migration-safety:[[:space:]]*acknowledged' "$f"; then
      echo "::warning file=$f::Backward-incompatible migration ACKNOWLEDGED — confirm it lags the code that stopped using the object."
    else
      echo "::error file=$f::Backward-incompatible migration. migrate-on-deploy runs BEFORE the new revision serves traffic, so this can break the still-running old revision. Make it additive, or (if the drop legitimately lags the code) add a line: '-- migration-safety: acknowledged <reason>'."
      [ -n "$hits" ] && echo "$hits"
      [ -n "$addnn" ] && echo "$addnn"
      fail=1
    fi
  fi
done

if [ "$fail" -eq 1 ]; then
  echo ""
  echo "❌ migration-safety: one or more migrations are backward-incompatible (see CLAUDE.md → Database & migration rules)."
  exit 1
fi
echo "✅ migration-safety: added migrations are additive / backward-compatible."
