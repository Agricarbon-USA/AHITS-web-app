# AHITS — Session Handoff · 2026-07-29 · CC-34 (maintenance speaks) — SESSION 1 of 2

> Session split (per the packet): **session 1 = PR-1 + PR-2** (this doc); **session 2 = PR-3** (schedules).
> Nothing is merged yet — both PRs are OPEN + green, awaiting **Max's per-PR staging smoke** (evening deploys only).
> Reference decisions by `Dn`; see `DECISIONS.md` (D29 was appended this session).

## What shipped (as OPEN PRs — not merged)

- **PR-1 (#226) — "the deployment drawer tells the truth" (R3 + orphan closure).** Base `development`. **CI fully green**, incl. `verify / Tests` (the node DB suite ran the new orphan-closure test) and the **migration-safety gate, which SCANNED the migration** ("✅ migration-safety: added migrations are additive / backward-compatible" — RIDER C's SRE confirmation, satisfied).
  - **1a:** admin deployment drawer renders vehicle status (only when != ACTIVE) + unit status (!= AVAILABLE/CHECKED_OUT), plus per-row **Damage (red, always) / Service-due (amber, only DUE_SOON/OVERDUE/IN_PROGRESS)** chips deep-linking `/admin/maintenance?task=<id>`. **RIDER C fix applied:** the drawer did NOT actually fetch `vehicle.status` — added `status:true` to the vehicle selects + `status` to `RigVehicleRow`; drawer now fetches full `[id]` detail on open (was list-only, would have shown chips only after an action).
  - **1b:** ONE additive migration `20260729120000_cc34_maintenance_task_rig_reporter` — nullable scalar `rigId` + `reportedById` on `maintenance_tasks` (indexed, no backfill). Populated at every deployment-scoped damage creator; maintenance GET resolves rig label + reporter via batched lookups; table + drawer show reporter · rig.
  - **1c:** orphan closure — serialized scan-return IN_MAINTENANCE → task+bell, INOPERABLE → unit bell (**scoped to a real unit; consumables skipped** — RIDER C activeKey trap); Send-to-Maintenance → vehicle task+bell; `canBeFixed=false` branches raise the missing unit alert; review-inoperable RETIRE/REPAIR resolve that key; **maintenance DELETE resolves any active alert** (RIDER C — no bell ghost). Node test `tests/cc34-orphan-closure.test.ts`.
  - **D29 appended to `DECISIONS.md` in this PR** (per session-split: at PR-1 close for durability).

- **PR-2 (#227) — "one way to report a problem" (R2 + check dead-end).** **Stacked on PR-1** (uses 1b's columns). Retargeted base → `development` so CI runs; its diff therefore currently includes PR-1's commits too — **merge PR-1 (#226) FIRST, then #227 collapses to just its own diff.**
  - **2a:** shared `ReportProblemDialog` (one verb; annotation, not removal). 4 trigger sites: scan unit panel (outside the return/add gate), scan vehicle panel (replaces the bespoke dialog), DeploymentCards vehicle + unit rows (44px `ReportProblemButton`). NEW `api/inventory/units/[unitId]/report-problem` + extended vehicle `report-damage` — both `withIdempotency` + `photoUrlsField()`→**422** backstop. Rig attributed only when the unit is in the **caller's** active rig. Vehicle route default = **flip when the toggle is absent** (so the existing admin caller is unaffected). `my-deployment/page.tsx` net line change **0** (anti-regrowth met).
  - **2b:** field-fix reaches items — unit "Log fixed issue" (sends inventoryUnitId+itemId), scan submit through `mutate()`, `field-fix` route wrapped in `withIdempotency`, admin dialog subject picker (vehicle OR item).
  - **2c:** NEW admin-only `api/daily-check/[id]/open-task` (`withIdempotency`) — notes from issues + failing items, re-links check photos (keeps `dailyCheckId`), `reportedById = check.operatorId`, optional flipVehicle, resolves `DAILY_CHECK_FAILED`, does NOT raise DAMAGE_REPORTED. `DailyCheckViewer` gains the one-click promote button.
  - Node test `tests/cc34-report-and-promote.test.ts` (photo-422, vehicle stillUsable-default-flip, promotion).

## Known v1 (do NOT re-file as breakage)
- **Secondary-operator rig attribution on `report-problem`.** `getActiveRigForOperator` is PRIMARY-only (SQL filters `role = 'PRIMARY'`), so a **secondary** operator reporting a unit problem gets `rigId: null` — the task + bell still fire correctly, only the rig label is absent. Nullable-by-design, consistent with CC-14's documented "secondary sees no active deployment" v1 limitation. Max will smoke as PRIMARY and won't hit it.
- **`reportedById` added to vehicle `report-damage`** — the packet said "keep the task as-is otherwise," but 1b is exactly "the reporter gets a home," so setting it here is additive and correct (rigId stays null — scanning a vehicle has no rig context).

## Owed before merge (Max)
- **Per-PR staging smoke** (evening). PR-1 first (its migration must land before PR-2's routes run).
- **Merge order + re-confirm:** merge **#226 first**, then — because `development` is branch-protected `strict: true` — **update #227 to latest `development`** (its base collapses once #226 lands), let CI re-run in isolation, confirm green, THEN merge #227. Do not merge a stale #227. **Do NOT preview PR-1** — previews apply no migrations, so maintenance surfaces would 500 against the un-migrated pilot DB (actively misleading). PR-2 preview only AFTER PR-1's merge migrates staging.
- PR-2 airplane-mode smoke is the Antagonist gate (both report routes offline-safe): report a unit offline → reconnect → task+photo+bell appear, unit STILL in kit; "Out of service" → In Maintenance on scan.

## Resume points — SESSION 2 (PR-3 "schedules become real", the value center)
- **Do PR-3 as its own session.** Branch off `development` AFTER PR-1 merges (PR-3 needs 1b's `rigId` for 3d's `?rigId=` filter). If PR-1 hasn't merged, stack on it as PR-2 did.
- Droppable order if time runs short: **3e → 3c-chips → 3b** (D29-3: zero current portal traffic).
- **3b PRE-MERGE:** run the staging count SELECT (isDamageReport, not COMPLETED, deletedAt null, updatedAt < now−7d); state the number in the PR body; if >15, Max triages BEFORE deploy. Bound the arm `orderBy updatedAt asc, take 5`.
- **3a:** date inputs are native `TextField type="date"` (`@mui/x-date-pickers` was removed in CC-33). PER_DEPLOYMENT stays in `prisma/schema.prisma:126` + the zod enum but is NOT offered in the new form (D29-4).
- **3c server half (RIDER C stranded-unit):** on complete, if an open kit item references the unit → restore to CHECKED_OUT, not AVAILABLE.
- **3d:** render the human label via `lib/status.ts` map, never raw IN_PROGRESS; don't stack chip + caption for the same state.
- **Session-2 close (FULL 7-step):** reconcile STATUS §1/§2 to MERGED, add the D24 note line ("named Wintex/Giddings schedule rows are enterable via CC-34 PR-3a"), ledger CC-34 row, PER_DEPLOYMENT parked-registry entry, and the step-7 grep anchors for all three PRs.

## Step-7 verify anchors (this session's PRs)
`openTasks` (deployments page + `[id]` route) · `reportedById` (items route + schema) · `resolveActiveAlert` in review-inoperable · `ReportProblemDialog`/`ReportProblemButton` (4 trigger sites) · `withIdempotency` in report-damage + report-problem · `open-task` route present · migration `20260729120000_cc34_maintenance_task_rig_reporter` tracked · PER_DEPLOYMENT still in `schema.prisma` (session 2 confirms it's absent from the new PR-3a form).
