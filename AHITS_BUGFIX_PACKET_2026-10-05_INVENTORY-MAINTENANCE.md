# Bug-fix packet · Inventory + Maintenance · 2026-10-05

> STATUS: runnable packet (paste this whole file into Claude Code) · WROTE: 2026-10-05 · READ-WITH: `CLAUDE.md`, `DECISIONS.md` (D16 merge-is-deploy, D38 admin-form standard), `AHITS_UX_PACKETS_2026-07-29.md` (packet style)
> WHY: owner testing on staging (2026-10-05) found four defects in Inventory and Maintenance. Root causes were traced to file:line before this packet was written; the fixes below are the minimal correct ones. Owner decisions are already made (§0) — do not re-ask them.
> SHAPE: **two independent PRs**, both branched from `development`, not stacked: **PR-A** = BF-1 + BF-2 + BF-3 (inventory), **PR-B** = BF-4 (maintenance). Named files only (never `git add -A`). No schema change, no migration. Line numbers are from `development` @ e83fc7e and may drift a few lines.

---

## 0 · Decisions already made by the owner (apply, don't ask)

1. **Retire with units still out → refuse.** If any unit is CHECKED_OUT, IN_TRANSIT or IN_MAINTENANCE, the item-level Retire fails with a plain message naming the count. Nothing is retired silently.
2. **Retired items leave the list by default**, reachable through a "Show retired" switch. Never soft-delete on retire — retired items and their history stay readable.
3. **Totals exclude retired units everywhere** (list, drawer, edit form, equipment report). Retired is shown as its own number where it matters.
4. **"Log fixed issue" closes the open report and puts the asset back in service.** A vehicle or unit that is IN_MAINTENANCE and has no other open damage report returns to service. OUT_OF_SERVICE is an admin decision and is never auto-restored — an explicit admin "Return to service" button covers it.
5. Vocabulary (D9/D11 unchanged): "Retire" / "Retired", "Show retired", "Return to service", "Log fixed issue" (existing). Sentence case for all new copy.

---

## PR-A · Inventory

### BF-1 · Retire leaves the item in the list

**Symptom.** Row Retire (icon) or drawer Retire → confirm → toast "<name> retired" → the row is still there.

**Cause.** `InventoryItem.status` is written but never read. `handleRetire` (`src/app/(admin)/admin/inventory/page.tsx:1405-1415`) PATCHes `{status:'RETIRED'}`; the API (`src/app/api/inventory/[id]/route.ts:107-127`) updates only `item.status` — no units, no stock; the list `where` (`src/app/api/inventory/route.ts:55-57`) applies `status` only when the query sends one, and `load()` (`page.tsx:1380-1386`) never does. The confirm text (`page.tsx:1658`) promises "All available units will be marked retired" — false today. A "retired" item is also still deployable because pickers read unit status only (`route.ts:170-172`).

**Change.**
1. `src/app/api/inventory/route.ts` GET — read `includeRetired = searchParams.get('includeRetired') === '1'`. Replace line 57 with: explicit `status` wins; else `includeRetired` → no status clause; else `status: { not: 'RETIRED' }`. (Every other consumer of this list — deployment pickers, maintenance page, operator my-deployment — then stops offering retired items with no further change. That is intended.)
2. `src/app/api/inventory/[id]/route.ts` PATCH — when `parsed.data.status === 'RETIRED'`, run in one `prisma.$transaction`:
   - count the item's non-deleted units with status in `CHECKED_OUT | IN_TRANSIT | IN_MAINTENANCE`; if > 0 → **409** `{ error: "<n> unit(s) are still out or in repair — get them back first." }` — a plain `error` string and **no `fieldErrors` key** (with `fieldErrors` present `parseApiError` in `src/lib/api-error-shape.ts:83-90` takes the flat path and falls back to the generic message); nothing written.
   - otherwise set every non-deleted `AVAILABLE | INOPERABLE` unit to `status:'RETIRED'` with the QR label released exactly as `review-inoperable/route.ts:43-46` does (`qrCodeId: \`${u.qrCodeId}::retired::${Date.now()}\``, one update per unit — `qrCodeId` is unique), then `item.status = 'RETIRED'`.
   - consumables: item status only; `inventory_stock` rows and `quantity` are left untouched (counts are history; the default list exclusion takes the item out of circulation). In the same transaction resolve any open `LOW_INVENTORY` alert for the item (`type:'LOW_INVENTORY', sourceId startsWith \`${id}:\`` → `resolved:true, resolvedAt: now, activeKey: null`), and add `AND i."status" <> 'RETIRED'` to `allHubStockForScan` (`src/lib/inventory-stock.ts:214-226`) so the nightly scan does not re-raise it.
   - `deletedAt` is never set. `GET /api/inventory/[id]` keeps serving retired items.
   - Out of scope, note in the handoff: the drawer's per-unit status dropdown (`units/[unitId]/route.ts:8-27`) can set RETIRED without releasing the QR label; the review-inoperable path is the one that does it right.
3. `src/app/(admin)/admin/inventory/page.tsx`:
   - a `FormControlLabel` + `Switch` labelled **Show retired** in the filter bar (`Switch`/`FormControlLabel` are already imported). Keep it in plain `React.useState` (not in `INVENTORY_FILTER_DEFAULTS`/`useUrlFilters`): the jsdom harness mocks `next/navigation` statically (`tests/components/uxp6-item-form.test.tsx:16-20`), so a URL-persisted toggle could not be tested. `load()` sends `includeRetired=1` when on; "Clear filters" (`:1519-1524`) turns it off and its visibility condition (`:1519`) includes the toggle; any change resets `page` to 0.
   - add `status` to `InventoryItemRow` (the API already returns it via `...rest`, `route.ts:163`); when `status === 'RETIRED'` render `<StatusChip status="RETIRED" />` (semantic mode, `src/components/shared/StatusChip.tsx:22-27`; label comes from `src/lib/status.ts`) next to the name, hide the row Retire icon, and gate the drawer Retire button on `status !== 'RETIRED'` instead of today's `available > 0` (`:1296`, which never shows it for consumables).
   - confirm dialog text (`:1658`) → "Retire "<name>"? Units on hand will be retired and their QR labels released. Units that are out or in repair block this. History is preserved."
   - on a failed PATCH, toast `apiErrorMessage(d, 'Failed to retire item')` from `src/lib/api-error-shape.ts` so the 409 text reaches the admin.

**Acceptance.** Retire a serialized item with all units on hand → row disappears, toast "<name> retired", "Show retired" brings it back with a "Retired" chip and no Retire control; retired item no longer appears in Start Deployment / Add items pickers. Retire with one unit checked out → 409 message, nothing changed. Consumable retire → row disappears; hub stock unchanged in the DB.

**Tests.** `tests/components/uxp6-item-form.test.tsx` (jsdom; its `mockFetch` at `:50-75` must branch on `includeRetired`): (1) retire → PATCH body `{status:'RETIRED'}`, refetch URL without `includeRetired`, "No items found", toast; (2) toggle Show retired → URL has `includeRetired=1`, "Retired" chip, no Retire button; (3) Clear filters resets the toggle; (4) 409 `{error}` → that text is toasted. Node (CI-only, pattern `tests/ur029-repaired-unit-returns.test.ts`): GET default excludes RETIRED and `total` matches; `includeRetired=1` and `status=RETIRED` include it; PATCH RETIRED flips AVAILABLE+INOPERABLE units with the `::retired::` suffix, 409s with a CHECKED_OUT unit and writes nothing, leaves `deletedAt` null, leaves consumable stock and `quantity` unchanged, resolves the item's open LOW_INVENTORY alert, and the stock scan no longer returns the retired item.

### BF-2 · New items don't show in the full list, only in filtered views

**Symptom.** Add item → it is in Search and in the hub/category views, but not in the plain list.

**Cause.** The list is 25 rows a page (`page.tsx:1354`), sorted by name across all categories (`route.ts:78-80`), then re-grouped under category headers (`:1551-1559`) so page 1 reads like a complete categorized list; a new name that sorts past the first 25 is on page 2. `rowsPerPageOptions={[25]}` (`:1628`) hides MUI's rows-per-page control, so the only hint is a small "1–25 of N" with two arrows under the table. After save, `handleItemSaved` (`:1419`) reloads the current page only. Owner confirmed: >25 items, never noticed the paging.

**Change.**
1. `page.tsx`: `pageSize` becomes state, default **100** (the server clamps at 100, `src/lib/validation.ts:78`); `rowsPerPageOptions={[25, 50, 100]}`; `onRowsPerPageChange` → set size, `setPage(0)`; add `showFirstButton showLastButton`; move the `TablePagination` inside the `Paper` so it sits with the table.
2. `handleItemSaved` (`:1419`), create only (not `isEdit`): `setPage(0)`, then `GET /api/inventory/<id>` (the `[id]` GET at `src/app/api/inventory/[id]/route.ts:90-100` returns the list-row shape — the POST response is the raw Prisma row with no `hub`/`unitCounts`/`derivedQuantity`, and serialized units are created after the POST at `page.tsx:373`, so fetch after `onSaved`) and hold the row in a `justAdded` map. Render that block **before** the `groupBy` output (`groupBy` in `src/lib/utils.ts:33-44` sorts group keys alphabetically, so a "Just added" key would land mid-list) under a **Just added** header with a "New" chip, and filter its ids out of `items` so React keys don't duplicate. Clear the map on the next search/filter/page/rows-per-page change. The toast's "Open" action stays.
3. `src/app/api/inventory/route.ts:80`: `orderBy: [{ name: 'asc' }, { id: 'asc' }]` (stable paging for duplicate names).

**Acceptance.** 100+ items: adding "Tedlar bag" shows it immediately at the top under Just added; the control reads "1–100 of N" with first/last buttons; changing rows-per-page refetches with `pageSize=` and `page=1`.

**Tests.** `tests/components/uxp6-item-form.test.tsx` — make the list mock honor `page`/`pageSize` by slicing `listRows`, then: (1) 30 existing rows, add one → the new row is in the table after save; (2) on page 2, add → list jumps to page 1 with the new row pinned; (3) Save & add another twice → both rows visible; (4) rows-per-page offers 25/50/100 and refetches with `pageSize=50&page=1`; (5) 160 rows → "1–100 of 160", next arrow fetches `page=2`; (6) changing a filter chip resets to `page=1`.

### BF-3 · Total counts retired units

**Symptom.** Manual Corer (Christie): 11 available · 0 out · **15** total after one unit was retired; the retired unit is still inside the 15.

**Cause.** The Total cell (`page.tsx:1597`) renders `unitCounts.totalUnits` = `units.length` (`src/lib/inventory.ts:68`), which includes RETIRED (and IN_TRANSIT). The correct number already exists on the wire — `derivedQuantity` = `totalUnits − retired` (`inventory.ts:95`, `route.ts:176`) — the row simply ignores it for serialized items. Same inflation in the drawer "Total Units" (`:1064`), the edit form count (`:454`), and the equipment report (`src/app/api/reports/equipment/route.ts:121-122` → `assetCount` `:199`, `avgUtilizationPct` `:202`). `item.quantity`/`resyncItemTotal` are consumable-only (`src/lib/inventory-stock.ts:152-160`) — **leave them alone**.

**Change.**
1. `src/lib/inventory.ts`: add `activeUnits: totalUnits − retired` to `computeUnitCounts`; `deriveQuantities` returns it as `effectiveQuantity` for serialized.
2. `page.tsx:1597` → `item.derivedQuantity` for both item types (one expression). Drawer "Total Units" (`:1064`) and the edit-form count (`:454`) → `activeUnits`, with "· N retired" appended when N > 0. Units-tab label (`:1024`) → "<all> units (<retired> retired)" when retired > 0.
3. `handleUnitStatusChange` (`page.tsx:903-916`): after a successful PATCH also call `onUpdated()` so the list row refreshes (today only the drawer reloads).
4. `src/app/api/reports/equipment/route.ts`: **keep the queries as they are** (retired assets' repair spend, events and downtime must stay in the totals and the CSV — that history is real money); only `assetCount` (`:199`) and `avgUtilizationPct` (`:202`) are computed over `rows.filter(r => r.status !== 'RETIRED')`, for units and vehicles alike.

**Acceptance.** The Manual Corer row reads 11 · 0 · **14**, the drawer header shows "14 · 1 retired", the Equipment report's asset count and utilization exclude retired assets while its spend totals do not change; retiring a unit from the drawer dropdown updates the list row without a reload.

**Tests.** UI: a SERIALIZED listRow with `{totalUnits:15, available:11, inoperable:3, retired:1}` → Total cell "14"; drawer "1 Retired" chip and "14" total. Node (CI-only, pattern `tests/inventory-stock-read.test.ts`): 3 units AVAILABLE/INOPERABLE/RETIRED → GET `derivedQuantity 2`, `unitCounts.retired 1`, `availableUnits.length 1`; after `review-inoperable RETIRE` on the INOPERABLE one → `derivedQuantity 1`, `totalUnits 3`, `item.quantity` unchanged; equipment report: `assetCount` excludes the retired unit while a retired unit's `actualCost` still counts in `totalMaintenanceSpend`. Pure: `computeUnitCounts` counts IN_TRANSIT as active.

---

## PR-B · Maintenance

### BF-4 · "Log fixed issue" leaves the vehicle In Maintenance

**Symptom.** Gooseneck Trailer (a Vehicle, `VehicleType.TRAILER`) was reported, fixed in the field, the operator tapped the green **Log fixed issue** button after scanning it — the vehicle still says In Maintenance and the original damage report is still open.

**Cause.** `src/app/api/maintenance/field-fix/route.ts:41-55` only *inserts* a second, already-COMPLETED task (`resolutionPath: 'IN_FIELD'`); by design (CC-10) it never touches the asset's status or the open report. The button is offered directly under the "in maintenance" warning (`src/app/(operator)/operator/scan/page.tsx:378-401`; same on `src/app/(admin)/admin/vehicles/page.tsx:770-777`), so the contract never anticipated fix-after-report. Related gaps found while tracing: `complete/route.ts:78-82` restores a vehicle only from exactly `IN_MAINTENANCE` and never checks for a *second* open report (closing one of two restores too early); `end/route.ts:159-190` can leave a unit IN_MAINTENANCE with no task at all (orphan); DELETE (`[id]/route.ts:61`) never restores.

**Change.**
1. New helper in `src/lib/maintenance.ts`: `restoreAssetIfClear(tx, { vehicleId? , inventoryUnitId? })` — if the asset is `IN_MAINTENANCE` **and** no other open damage task (`isDamageReport: true, status ≠ COMPLETED, deletedAt: null`) references it, restore it: vehicle → `ACTIVE`; unit → `CHECKED_OUT` when an open kit item on an active rig still references it, else `AVAILABLE` (move the existing `restoreStatusFor` logic from `complete/route.ts:89-95` into the helper). Never touches `OUT_OF_SERVICE`, `INOPERABLE` or `RETIRED`. Returns what it did, for logging.
2. `field-fix/route.ts` (keep `withIdempotency` as the outer wrapper; do the work in one `$transaction`): when `vehicleId` or `inventoryUnitId` is given, (a) set every open damage task for that asset to `status:'COMPLETED', completedAt: now, lastCompleted: now, resolutionPath:'IN_FIELD'`, appending `"Fixed in field: <notes>"` to its notes; (b) resolve their alerts (`alert.updateMany where sourceTable:'maintenance_tasks', sourceId in ids, resolved:false → resolved:true, resolvedAt: now, activeKey: null` — mirror `complete/route.ts:71-74`); (c) still create the COMPLETED "Fixed in field" task as today (it is the audit record), linking `inventoryUnitId`/`vehicleId` as now; (d) call `restoreAssetIfClear`. With no prior open report and an ACTIVE asset the behaviour is unchanged (task logged, nothing else moves) — keep that as a regression test. For `itemId`-only calls (no unit, no vehicle) behaviour is unchanged.
3. `complete/route.ts:76-121` and `[id]/route.ts` DELETE → use the helper. **Ordering matters:** today the task flips to COMPLETED at `:121`, *after* the restore block; the helper's "no other open task" check would see the task itself and never restore. Mark the task COMPLETED (or soft-deleted) first, then call the helper — or pass `excludeTaskId`. Keep the UR-029 itemId-only fallback (`:99-112`) by resolving the unit id first and handing it to the helper. Result: closing the last open report restores; closing one of two does not; deleting a mis-filed report restores when nothing else is open.
4. Admin safety valve: on the vehicle drawer (`src/app/(admin)/admin/vehicles/page.tsx` near `:769`) a **Return to service** button, visible when status is `IN_MAINTENANCE` or `OUT_OF_SERVICE`. The Edit form can already set status (`:1176-1178`) — this is the one-tap affordance on top of it, not a new capability. `ConfirmDialog`: "Return <name> to service? <n> open damage report(s) stay open." where `n` counts `detail.maintenanceTasks` that are `isDamageReport`, not COMPLETED and not soft-deleted (the GET at `src/app/api/vehicles/[id]/route.ts:52` does not filter `deletedAt`, so filter client-side) → PATCH `{status:'ACTIVE'}` (whitelisted at `src/app/api/vehicles/[id]/route.ts:21,102`), toast "<name> returned to service", refresh the drawer **and** `load()` the list.
5. Copy and refresh: the Log fixed issue dialog (`scan/page.tsx` ~`:437` and the admin twin at `admin/vehicles/page.tsx` ~`:343`) → "Log the fix. Any open report for this <vehicle|item> is closed and it goes back in service, unless an admin took it out of service." Sentence case. After a non-queued success the scan page must call `refetchScanned()` (today `:114-137` never refreshes after a field fix, so the status on screen would still read In Maintenance until re-scan); the admin twin refreshes the drawer and the list.
6. Rewrite the header comment of `tests/cc10-field-fix.test.ts` (`:8-9` still says "no status change"). Field-fix continues to leave `returnDestinationType` null (intentional A.4 bypass — a field fix never moves gear).

**Acceptance.** Scan a vehicle that is In Maintenance with an open report → Log fixed issue → the screen refreshes to Active, the report is Completed (IN_FIELD), its alert resolved, one extra "Fixed in field" record in Maintenance history. A unit left IN_MAINTENANCE by an end-of-deployment return with no task (`end/route.ts:159-168`) → Log fixed issue → AVAILABLE. Vehicle with two open reports → closing one in Admin → Maintenance leaves it In Maintenance; closing the second restores. OUT_OF_SERVICE vehicle: Log fixed issue does not change status; Return to service does.

**Tests.** `tests/cc10-field-fix.test.ts` (node, CI-only): report-damage (vehicle) → field-fix → vehicle ACTIVE, original task COMPLETED with `resolutionPath IN_FIELD`, alert resolved, new COMPLETED task exists; unit `report-problem stillUsable:false` on an open kit → field-fix → unit CHECKED_OUT, task closed; orphan IN_MAINTENANCE unit with no task → field-fix → AVAILABLE; field-fix on an ACTIVE vehicle with no open report → status untouched, no alert, one COMPLETED task (regression guard); OUT_OF_SERVICE vehicle → untouched. Complete route: two open reports → first close leaves IN_MAINTENANCE, second restores; DELETE of the only open report restores. `tests/components/uxp6-vehicle-form.test.tsx` (jsdom): "Return to service" shown only for IN_MAINTENANCE/OUT_OF_SERVICE, confirm → PATCH `{status:'ACTIVE'}`, toast.

---

## Conventions (unchanged house rules — restated so nothing drifts)

- PRs target `development`; merge is the deploy (D16). CI must be green: `verify` (lint, type-check, build, tests), migration-safety, DROP guard.
- Named files only in every commit. `tests/offline/**` and `src/sw.ts` untouched. No raw hex outside `src/theme/tokens.ts`. Admin forms stay on `EntityFormDialog` (D38); confirmations on `ConfirmDialog`; status on `StatusChip`.
- UI tests: `npm run test:ui`. Node DB tests run in CI (`DATABASE_URL_TEST`); write them even though they only run there.
- D10 (admin/inventory split is demand-pull) is **not** triggered by a bug-fix packet — a structural split does not belong in a fix PR. Say so in the handoff; D10 stays ACTIVE and its owner remains the next feature packet on that surface.
- Session close (CLAUDE.md): `STATUS.md` §1/§3/§4 + date line; `DECISIONS.md` — no new decision is needed (the choices in §0 are owner calls inside existing policy; record them in the handoff, not as a Dn); `AHITS_SESSION_HANDOFF_2026-10-<dd>_BUGFIX-INV-MAINT.md` with the PR numbers; `AHITS_PILOT_FLOOR_TODO.md`: Part 2 item 4 (operator sheet) → DONE; add "fix pass from 2026-10-05 testing: BF-1..4" under Done recently. Also fold in the three corrections to `AHITS_JULY_TRIAL_CLEANUP_2026-09-07.md`: A5 needs `status::text` on **both** UNION arms; C2 must also set `"activeKey" = NULL` (and its undo must rebuild it as `type || ':' || "sourceTable" || ':' || "sourceId"`); C4 says "Decline" (the button's name), not "Deny". Commit + push the docs with the PRs.

## Owner smoke after each merge (plain English)

PR-A: Inventory → Retire an item whose units are all on hand → it vanishes; flip "Show retired" → it's back with a Retired chip. Try to retire one with a unit checked out → refused with the count. Add an item → it appears at the top under "Just added". The Manual Corer row reads 11 · 0 · 14.

PR-B: scan a vehicle that's In Maintenance → Log fixed issue → it's Active and the repair row under Admin → Maintenance → Damage is closed. Admin → Vehicles → a vehicle marked Out of service shows "Return to service".
