# AHITS — Pre-Phase-3 Workplan & Defect-Fix PR

_Prepared 2026-06-25 (Session 12). Adjusts the workplan to resolve the defects found by the ultra-review + live functional stress-test **before** entering Phase 3, and documents the fix PR that is staged on a feature branch ready to push. Also folds in the new feedback (Projects fields, Hubs address, daily-check on any vehicle)._

---

## 1. What's on the branch right now

Branch: **`feature/20260626/max-slater-prephase3-defect-fixes`** (created off `development`; all changes applied to the working tree, type-check + lint green). The commit itself must be finalized on your machine — the sandbox can't write to this repo's `.git` (see §5).

**14 files changed (+320 / −52):**

| Area | Files |
|---|---|
| UR-001 fix | `src/app/api/deployments/[id]/items/route.ts` |
| UR-029 fix | `…/end/route.ts`, `…/inventory/[id]/review-inoperable/route.ts`, `…/items/route.ts`, `…/maintenance/[id]/complete/route.ts` |
| UR-030 fix | `…/deployment-requests/[id]/resend-link/route.ts` |
| UR-034 + UR-033 | `…/daily-check/route.ts`, `prisma/schema.prisma`, `…/migrations/20260626020000_add_daily_check_failed_alert/migration.sql`, `…/admin/notification-config/route.ts`, `src/lib/alert-display.ts`, `src/lib/notifications.ts` |
| Tests | `tests/ur001-bulk-return-perhub.test.ts`, `tests/ur029-repaired-unit-returns.test.ts`, `tests/ur034-daily-check-failed-alert.test.ts` |

---

## 2. PR description (ready to paste)

**Title:** `fix(prephase3): per-hub return, repaired-unit return-to-service, failed-check alert, hub link URL, any-vehicle daily check`

**Base:** `development`

**Body:**

> Resolves the four carry-forward defects from the ultra-review + functional stress-test, plus the daily-check behavior change.
>
> **UR-001 (Critical) — bulk consumable return now restores per-hub stock.** The bulk "Return items" path restored only the cross-hub total (`inventory_items.quantity`) and never the per-hub `inventory_stock` row, so per-hub stock silently drifted down on every bulk return (reproduced live: total 72→75 while per-hub stayed 72). Now dual-writes via `restoreToHub` + total increment, exactly like the end-of-deployment and single-item return paths. Widened the `kitItem.item` select to include `hubId` for the legacy fallback.
>
> **UR-029 (High) — repaired units now return to service.** No `maintenanceTask.create` site set `inventoryUnitId`, but the repair-complete route returns a unit only via `task.unit` — so every unit sent to repair was stranded IN_MAINTENANCE even after "Complete repair." Now links `inventoryUnitId` at all three inoperable task-create sites (end-deployment, in-deployment items, admin inoperable-review), plus a conservative fallback in the complete route that returns the unit for legacy tasks when exactly one unit of the item is in maintenance (unambiguous).
>
> **UR-034 (Med-High) — failed daily checks raise an in-app alert.** A failing check only emailed `ADMIN_EMAIL` — no alert row, no bell — so a failed safety check was invisible in-app when email was unconfigured. Adds a `DAILY_CHECK_FAILED` alert type (committed migration), raises a deduped alert on fail (dashboard list + dispatcher bell/email via the standard path), self-clears on a later passing check, and adds the Settings toggle + dispatcher message + deep link.
>
> **UR-030 (Med) — `resend-link` returns the URL.** It returned only `{ok}`, so when a hub had no email on file the reservation link was created but unobtainable. Now returns `{ok, emailed, url}` like `send-to-shop`, so the admin can copy/deliver it. (Copyable link in the admin Requests UI is the tracked follow-up.)
>
> **UR-033 (product) — daily checks allowed on ANY vehicle.** Per product direction, operators can inspect any vehicle (manual select or QR scan), not only ones in their active deployment. Replaces the ownership gate with a vehicle-exists check.
>
> **Tests:** three regression specs pinning the exact gaps the old tests missed — per-hub stock after a bulk return, unit→AVAILABLE on repair completion, and the in-app alert on a failed check (+ any-vehicle allowance).
>
> **Migration:** `20260626020000_add_daily_check_failed_alert` — additive enum value only (`ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'DAILY_CHECK_FAILED'`). Applied by the A2 auto-migrate step on deploy; must land before/with this code.

**Verification done locally:** `tsc --noEmit` ✅ (exit 0), `eslint` ✅ (0 issues) on all changed files + new tests. DB-backed vitest specs run in CI (no Postgres in the authoring sandbox).

---

## 3. Verification status

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx eslint` (changed files + tests) | ✅ exit 0 |
| `prisma generate` | ⚠️ engine download blocked in sandbox (network) — CI/`make db-generate` regenerates; `tsc` already green |
| vitest (DB-backed) | ▶️ runs in CI `verify` workflow (no Postgres locally) |

---

## 4. Migration & deploy notes (per CLAUDE.md)

- The migration is a **committed** file (not a `db push`). It is **additive** (enum value), safe and reversible-by-non-use.
- Enum `ADD VALUE` can't be referenced in the same transaction that adds it; Prisma `migrate deploy` wraps each migration in its own transaction, and the code using `'DAILY_CHECK_FAILED'` only runs after the migration commits — so the A2 auto-migrate-on-deploy ordering is correct.
- No new secret, no `--set-secrets` change.

---

## 5. Hand-off — run these on your machine

The sandbox left the branch checked out with all changes applied but **could not finalize the commit** (it can't write this repo's `.git`; there may be a stale `.git/index.lock`). On your Mac:

```bash
cd "/path/to/Agricarbon US Codebase"
rm -f .git/index.lock                      # clear the sandbox's stale lock if present
git status                                  # confirm branch + the 14 changed files

# stage + commit the fix set
git add src prisma tests
git commit -m "fix(prephase3): UR-001 per-hub return, UR-029 unit return-to-service, UR-034 failed-check alert, UR-030 hub link URL, UR-033 any-vehicle daily check"

# regenerate the Prisma client locally (CLAUDE.md step 3)
make db-generate

# push + open the PR
git push -u origin feature/20260626/max-slater-prephase3-defect-fixes
gh pr create --base development \
  --title "fix(prephase3): per-hub return, repaired-unit return-to-service, failed-check alert, hub link URL, any-vehicle daily check" \
  --body-file <(sed -n '/^> Resolves the four/,/must land before/p' AHITS_PREPHASE3_WORKPLAN.md)

# trigger the staging deploy once CI is green
PR_NUMBER=$(gh pr view --json number --jq .number)
gh workflow run pr-staging-deploy.yml -f pr_number=$PR_NUMBER
gh run watch
```

A2 auto-migrate applies `20260626020000_add_daily_check_failed_alert` as part of the deploy; no manual `make db-migrate` needed.

**Post-deploy smoke (5 min):** end a deployment returning a consumable to a hub and confirm per-hub + total match (UR-001); mark a unit inoperable→repair→complete and confirm it returns to AVAILABLE (UR-029); submit a failing daily check and confirm a "Daily check failed" alert appears in Active Alerts + the bell (UR-034); resend a reservation hub link and confirm the response includes a `url` (UR-030); submit a daily check for a vehicle not in your deployment and confirm it's accepted (UR-033).

---

## 6. Adjusted pre-Phase-3 sequence

### Done in this PR
- **UR-001** (Critical), **UR-029** (High), **UR-034** (Med-High), **UR-030** (Med), **UR-033** (product) — code + tests + migration.

### Next — finish before Phase 3 (recommended order)
1. **UR-021 (decision) — settle "what is production."** One environment vs separate prod DB. Blocks the cutover; a human call. _(register UR-021)_
2. **UR-003 (High) — clear the auth SWR cache on login/logout** (shared-device identity). Small. _(register UR-003)_
3. **UR-006 / UR-007 (High/Med) — route offline deploy-create + daily-check through the durable queue with idempotency**, then run the **A6 real-device offline pass** (the last pilot gate). _(register UR-006/007/008/026)_
4. **UR-005 (Med-High) — private photo bucket + signed URLs + magic-byte validation.** _(register UR-005)_
5. **UR-016 (Med) — align Node runtime (CI 22 vs Docker 24) + pin `engines`.** _(register UR-016)_
6. **UR-030 follow-up + UR-031/UR-032 — copyable hub link in the admin Requests UI; make `send-to-shop`/`resend-link` consistent; ended-deployment operator attribution.** _(register)_
7. **M1 consistency sweep** — toast unification (UR-017), "My Rig→My Deployment" (UR-018), the third condition picker (UR-019), bottom-nav + safe-area + SW-update prompt (UR-008). Do before building Phase-3 screens.
8. **Hygiene** — dead-code/dep cleanup (UR-022), tokenized-link/proxy/rate-limit tests (UR-023), doc archive + `CLAUDE.md §3` (UR-024), keep slice-4 gated (UR-002).

### New feedback — mapped (this session)

| Item | Status / plan |
|---|---|
| **Daily checks on ANY vehicle/equipment** (manual or QR scan) | ✅ **Done in this PR** (UR-033 resolution). |
| **Hubs — add address** | The hub **address fields already exist** in the schema (`street1`, `street2`, `city`, `state`, `zip`, `country` — added in F2). What's missing is **surfacing them in the Add/Edit Hub form** in `/admin/hubs`. UI-only change, no migration. → **NEW-1**, next PR. |
| **Projects — add Customer, Code, Size (ha), # Samples** | New columns on `Project` (`customer` text, `code` text, `sizeHa` decimal/float, `sampleCount` int) → **committed migration** + the Add/Edit Project form + the Projects table columns. → **NEW-2**, next PR. |

**Recommendation:** bundle **NEW-1 (Hubs address UI)** and **NEW-2 (Projects fields)** into a single small "admin metadata" PR right after this one — both are additive, low-risk, and don't touch the defect surface. I can take them next.

---

## 7. The shortest honest path

This PR clears the **Critical + the two Highs that block the pilot** (UR-001, UR-029, UR-034) and the daily-check behavior you asked for. After it merges and the A6 device pass + the UR-021 production decision are done, AHITS is at the pilot line. The M1 consistency sweep + the new admin-metadata fields are the clean runway into Phase 3.
