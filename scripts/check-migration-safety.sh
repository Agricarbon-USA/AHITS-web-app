#!/usr/bin/env bash
# Migration-safety gate (#107). Turns the "backward-compatible migrations only" rule
# from convention into a CI check.
#
# Why: migrate-on-deploy runs the migration BEFORE the new revision serves traffic, and
# the two are not atomic — so a destructive or NOT-NULL-without-default migration can
# break the STILL-RUNNING old revision (see CLAUDE.md → Database & migration rules).
#
# What: in migrations ADDED on this branch vs the base, flag any of:
#   DROP TABLE / DROP COLUMN / DROP INDEX / DROP CONSTRAINT / DROP TYPE /
#   TRUNCATE / RENAME (TO|COLUMN|VALUE) / SET NOT NULL / DELETE FROM /
#   ALTER COLUMN ... TYPE / ADD COLUMN ... NOT NULL without a DEFAULT
#
# Escape hatch: a genuinely-needed destructive migration that LAGS the code which
# stopped using the object can opt out with a line in the .sql file immediately
# BEFORE that statement:
#   -- migration-safety: acknowledged <reason>
#
# Scoping: the waiver applies only to the single SQL statement it immediately precedes
# (i.e. within the same ;-delimited chunk), NOT to the entire file.
#
# Production hard-fail: when GITHUB_BASE_REF=production, an acknowledged destructive
# statement is still a HARD FAIL unless PR_LABELS contains 'destructive-migration-approved'.
# This ensures the W0-10 DROP and any other irreversible production migration requires
# explicit human sign-off via a labelled PR (see held/README.md §11).
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

# Environment context (injected by ci.yml; safe defaults for local runs).
BASE_REF="${GITHUB_BASE_REF:-}"
PR_LABELS="${PR_LABELS:-}"

# Destructive SQL pattern — checked against comment-stripped, whitespace-normalized SQL
# so multi-line statements are caught as a single unit.
DESTRUCTIVE_RE='DROP[[:space:]]+(TABLE|COLUMN|INDEX|CONSTRAINT|TYPE)|TRUNCATE|RENAME[[:space:]]+(TO|COLUMN|VALUE)|SET[[:space:]]+NOT[[:space:]]+NULL|DELETE[[:space:]]+FROM|ALTER[[:space:]]+COLUMN[[:space:]]+[^[:space:]]+[[:space:]]+TYPE[[:space:]]'

fail=0

for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue

  file_fail=0

  # Split the file into ;-delimited statement chunks and process each one.
  # awk splits on ";" (single-char RS), printing each non-empty chunk as a
  # NUL-delimited record so the while-read loop handles embedded newlines safely.
  while IFS= read -r -d '' chunk; do
    # Skip chunks that are entirely whitespace (trailing content after last ;).
    [[ -z "$(printf '%s' "$chunk" | tr -d '[:space:]')" ]] && continue

    # ── Waiver detection (BEFORE comment stripping) ───────────────────────────
    # A waiver comment in the same ;-delimited chunk as the destructive statement
    # opts that statement out. Comments in a different chunk don't carry over.
    waived=false
    if printf '%s' "$chunk" | grep -iqE '^[[:space:]]*--[[:space:]]*migration-safety:[[:space:]]*acknowledged'; then
      waived=true
    fi

    # ── Normalize for destructive-pattern scanning ────────────────────────────
    # Strip -- line comments, then collapse newlines + squeeze spaces so a
    # multi-line statement (e.g. ADD COLUMN\n  bar TEXT\n  NOT NULL) is a single
    # scannable line. We strip AFTER the waiver check so the acknowledged comment
    # isn't lost before we read it.
    normalized=$(printf '%s' "$chunk" | sed "s/--[^']*\$//" | tr '\n' ' ' | tr -s '[:space:]' ' ')

    # ── Pattern checks ────────────────────────────────────────────────────────
    is_destructive=false
    hit_lines=""

    if printf '%s' "$normalized" | grep -iqE "$DESTRUCTIVE_RE"; then
      is_destructive=true
      hit_lines=$(printf '%s' "$normalized" | grep -ioE "$DESTRUCTIVE_RE" || true)
    fi

    # ADD COLUMN ... NOT NULL without DEFAULT: catches inserts from the old
    # revision that would fail because the column has no server-side default.
    if printf '%s' "$normalized" | grep -iqE 'ADD[[:space:]]+COLUMN' && \
       printf '%s' "$normalized" | grep -iqE 'NOT[[:space:]]+NULL' && \
       ! printf '%s' "$normalized" | grep -iqE 'DEFAULT'; then
      is_destructive=true
      hit_lines="${hit_lines:+$hit_lines$'\n'}ADD COLUMN ... NOT NULL (no DEFAULT)"
    fi

    $is_destructive || continue

    # ── Disposition ───────────────────────────────────────────────────────────
    if $waived; then
      if [[ "$BASE_REF" == "production" ]] && ! echo ",$PR_LABELS," | grep -q ",destructive-migration-approved,"; then
        echo "::error file=$f::HARD FAIL — acknowledged destructive migration targeting production requires the 'destructive-migration-approved' PR label. Add it (project lead only) and re-run CI."
        [ -n "$hit_lines" ] && printf '%s\n' "$hit_lines"
        file_fail=1
      else
        echo "::warning file=$f::Backward-incompatible migration ACKNOWLEDGED — confirm it lags the code that stopped using the object."
        [ -n "$hit_lines" ] && printf '%s\n' "$hit_lines"
      fi
    else
      echo "::error file=$f::Backward-incompatible migration. migrate-on-deploy runs BEFORE the new revision serves traffic, so this can break the still-running old revision. Make it additive, or (if the drop legitimately lags the code) add a '-- migration-safety: acknowledged <reason>' line immediately before this statement."
      [ -n "$hit_lines" ] && printf '%s\n' "$hit_lines"
      file_fail=1
    fi

  done < <(awk 'BEGIN{RS=";"; ORS="\0"} {print}' "$f")

  [ "$file_fail" -eq 1 ] && fail=1
done

if [ "$fail" -eq 1 ]; then
  echo ""
  echo "❌ migration-safety: one or more migrations are backward-incompatible (see CLAUDE.md → Database & migration rules)."
  exit 1
fi
echo "✅ migration-safety: added migrations are additive / backward-compatible."
