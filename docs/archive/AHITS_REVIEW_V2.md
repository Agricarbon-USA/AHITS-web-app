# AHITS Application Review — Post-Sprint 6
**Date:** June 2026  
**Basis:** Full codebase read after Sprints 4, 5, and 6 are staged  
**Prior art:** AHITS_REVIEW.md (pre-Sprint-4 baseline)

---

## Part I — What Sprints 4, 5, and 6 Actually Delivered

Before diagnosing problems, establish exactly what is and isn't done. Every claim below is grounded in code read during this review.

### Confirmed delivered

**Sprint 4 — Per-unit tracking & QR codes**
- `InventoryUnit` model with `status: EquipmentStatus`, `qrCodeId`, `serialNumber`, `deletedAt`, inoperable reporting fields
- `computeUnitCounts()` helper in `GET /api/inventory` — returns `{available, checkedOut, inMaintenance, inoperable, retired, totalUnits}` derived from actual unit statuses
- `availableUnits` array returned per item with `position` (1-based createdAt ASC index), `serialNumber`, `qrCodeId`
- Atomic serialized checkout via `updateMany` + count check in both `POST /api/deployments` and `POST /api/deployments/[id]/items`
- Admin inventory drawer: Units tab with inline serial number editing, per-unit status dropdown, per-unit QR download, per-unit history accordion (checkLogs filtered by inventoryUnitId), "Add Unit" button
- Admin inventory drawer: History tab (all checkLogs for the item)
- STATUS_CHIP_COLOR map in admin inventory correctly uses `CHECKED_OUT: 'info'`
- `GET /api/inventory/units/by-qr/[qrCodeId]` — scan-to-lookup endpoint

**Sprint 5 — Unit selection in kit building, status colors, unit history**
- Admin New Deployment dialog: full `AdminKitEntry` discriminated union — consumable quantity OR serialized unit dropdown per item
- Admin Deployment Drawer: same unit-aware add-items picker with dropdown fallback
- Admin Deployment Drawer: per-item remove dialog with quantity stepper (consumable) and condition select
- Operator My Rig add-items picker: scan QR, manual QR entry, and dropdown unit selection for serialized items; quantity stepper for consumable
- Operator My Rig per-item return dialog: quantity stepper + returnCondition (GOOD / IN_MAINTENANCE / INOPERABLE)
- `DELETE /api/deployments/[id]/items/[kitItemId]` — partial kit management endpoint: serialized sets `removedAt` on kitItem + updates unit status; consumable decrements quantity or removes if all returned

**Sprint 6 — Hardening & Infrastructure**
- Soft deletes: `deletedAt DateTime?` on `InventoryItem` and `InventoryUnit` — confirmed in schema
- Database indexes: `@@index` on Rig (operatorId, endedAt), RigVehicle (rigId/removedAt), KitItem (kitId, inventoryUnitId, removedAt), InventoryItem (categoryId, hubId, deletedAt), InventoryUnit (inventoryItemId, inventoryItemId+status, status), CheckLog (itemId, itemId+action, inventoryUnitId, operatorId, submittedAt), DailyCheck (operatorId, vehicleId)
- N+1 fix in `GET /api/inventory`: both the filter path and the main loop now use two bulk `findMany` queries + in-memory resolution — confirmed, no per-item queries inside loops
- `User.hourlyRate Decimal?` added to schema
- `TransferItem.quantity Int?` and `TransferItem.inventoryUnitId String?` both present in schema (partial transfer support)
- Health endpoint returns HTTP 200 with `status: 'degraded'` when unseeded (not 503), logs a warning to console
- `ToastProvider` + `useToast` hook created in `src/components/shared/useToast.tsx` (MUI Snackbar wrapper)
- `extractApiError()` utility in `src/lib/api-error.ts`
- `api/deployments/[id]/transfer` POST route properly validates vehicleIds and kitItemIds belong to the rig before creating TransferRequest
- Transfer accept route validates source rig still active, vehicles still present, kit items still present and have sufficient quantity

### Confirmed NOT yet implemented

These were planned or implied but the code says otherwise:

- **Vitest** — no `vitest.config.ts`, no `src/**/*.test.*` files. Zero tests exist.
- **Daily check page** — still renders: `"Daily Check — implementation in progress."`
- **Checkout page** — still renders: `"Checkout — implementation in progress."`
- **ToastProvider not mounted** — `ToastProvider` exists in `useToast.tsx` but is not in `src/app/providers.tsx` or any layout. The hook returns a no-op. No page uses it.
- **extractApiError not integrated** — the utility exists but no page imports or calls it. All pages still have inline error handling.
- **`make db-seed-units`** — health endpoint references it but the Makefile does not have this target.
- **Alert creation logic** — `Alert` model and `AlertType` enum exist. Zero code creates alerts anywhere. All 8 alert types are dormant.

---

## Part II — New Issues Found Post-Sprint-6

These are issues that did not exist or were not visible before, or were missed in AHITS_REVIEW.md.

### Critical: Scan page status chip color is wrong

`src/app/(operator)/operator/scan/page.tsx` line 34:

```typescript
const STATUS_COLORS: Record<string, 'success' | 'primary' | 'warning' | 'error' | 'default'> = {
  AVAILABLE: 'success',
  CHECKED_OUT: 'primary',   // ← should be 'info' (blue), primary is green
  IN_MAINTENANCE: 'warning',
  INOPERABLE: 'error',
  RETIRED: 'default',
}
```

Sprint 5 fixed this on the admin inventory page. It was not fixed here. An operator scanning a checked-out item sees a green chip instead of blue — visually identical to "Available." This is the most user-visible color confusion in the app.

### High: Operator "Start Deployment" cannot pack serialized items

The operator's `NewDeploymentDialog` (in `my-rig/page.tsx`) hardcodes all kit items as consumable:

```typescript
kitItems: Array.from(kitItems.entries()).map(([inventoryItemId, quantity]) => ({
  inventoryItemId,
  quantity,   // always consumable form — no inventoryUnitId
}))
```

The kit picker on step 2 has no unit selector for serialized items — just a quantity field. If an operator adds a serialized item and sends quantity=1, the API receives it as a consumable payload and picks an arbitrary available unit. The operator never chose which unit they have in hand.

The **admin** NewDeploymentDialog correctly supports the full AdminKitEntry discriminated union with unit dropdowns. The operator's version does not. Operators who start their own deployments lose the per-unit selection that Sprint 4 was designed to provide.

Fix: operator's Build Kit step needs the same serialized unit selector already present in the Add Items dialog for active rigs.

### High: Bulk "Remove Items" flow in My Rig is orphaned / dead code

In `my-rig/page.tsx`, the `doAction` switch case `'removeItems'` sends:

```typescript
body: JSON.stringify({ kitItemIds: Array.from(selItems), note, photoUrls })
```

But `DELETE /api/deployments/[id]/items` expects `{ note, itemDispositions: [{kitItemId, type, ...}] }`. These shapes don't match — the API would return a 400 validation error.

However, this code is never actually called. When `noteDialog === 'removeItems'`, the page renders a `DispositionDialog` directly, which handles the API call itself. The `doAction('removeItems', ...)` branch is dead code left over from an earlier pattern.

The risk: if a developer removes or refactors the DispositionDialog render condition, the dead `doAction` path would silently become active and fail without warning. The dead code should be removed.

### High: CheckLog never records `condition` on returns

In `DELETE /api/deployments/[id]/items/[kitItemId]`, the CheckLog is created without a condition field:

```typescript
await tx.checkLog.create({
  data: {
    action: 'CHECK_IN',
    itemId: kitItem.inventoryItemId,
    inventoryUnitId: kitItem.inventoryUnitId,
    operatorId: session.userId,
    notes: body.data.notes,
    // condition: ??? — not set
  },
})
```

The `returnCondition` from the request body determines the new **unit status** but is never written to `CheckLog.condition`. The condition enum on CheckLog (`GOOD / MINOR_DAMAGE / NEEDS_REPAIR / MISSING_PARTS`) is supposed to capture the state of the item when returned. The history tab will never show condition data from partial kit returns.

The same omission exists in the INOPERABLE and HUB disposition paths in `items/route.ts` DELETE — they also create CheckLogs without a condition.

### Medium: Admin can accept transfers without destination operator knowing

In the admin deployments page, admin users can click Accept/Decline on any pending transfer. The accept route (`/api/transfers/[id]/accept`) explicitly allows this: `const isAdmin = session.role === 'ADMIN'`. This means an admin can initiate AND accept a transfer, bypassing the destination operator entirely.

If the destination operator has no active rig, one is created silently: `await tx.rig.create({ data: { operatorId: toOperatorId, startedAt: now } })` — no label, no note, no email notification. The operator's My Rig page will suddenly show a rig they didn't start.

This might be intentional for operational control, but it's undocumented and the operator receives no notification.

### Medium: End deployment leaves TRANSFER items in limbo

In `POST /api/deployments/[id]/end`, when an item's disposition is TRANSFER, a TransferRequest is created but the `kitItem.removedAt` is **not** set:

```typescript
// In the TRANSFER grouping at the bottom of end/route.ts:
await tx.transferRequest.create({
  data: {
    fromRigId: id,
    toOperatorId,
    items: { create: disps.map((d) => ({ kitItemId: d.kitItemId })) },
    // ← kitItems themselves never get removedAt set here
  },
})
```

For HUB and INOPERABLE dispositions, `kitItem.removedAt = now` is set on line 75. For TRANSFER, it isn't. The rig is ended (`endedAt` set), but the kit items remain with `removedAt: null`. Any query that filters `removedAt: null` would still return these items as "active" kit items in an ended deployment.

The `DELETE /api/deployments/[id]/items` route has the same gap — TRANSFER dispositions don't set `kitItem.removedAt`.

This is different from a pending transfer during an active rig (where items should stay visible). Here, the rig is ended. Items in a TRANSFER from an ended rig should be marked as removed from that rig immediately.

### Medium: Secondary operators cannot initiate transfers

`POST /api/deployments/[id]/transfer` (transfer/route.ts line 45):

```typescript
if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

Secondary operators (added via `RigOperator`) can add/remove items and end deployments (those routes check for secondary membership), but cannot initiate a transfer. If a secondary operator needs to transfer equipment to another operator, they're blocked.

### Medium: Add-items photos saved with wrong context

In `POST /api/deployments/[id]/items`, when `photoUrls` are provided, they're saved with:

```typescript
context: 'MAINTENANCE' as const,
```

Adding items to a kit is not a maintenance event. This misclassifies photos attached to kit additions. They won't appear in the correct context when queried by `context = 'MAINTENANCE'` for actual maintenance tasks, and they won't appear under `INVENTORY_REFERENCE`. The `PhotoContext` enum has `INVENTORY_REFERENCE` which would be more appropriate, or a new `KIT_ADDITION` context should be added.

### Medium: Destination rig created without active rig check on transfer accept

In `transfers/[id]/accept/route.ts`, when no active rig exists for the destination operator:

```typescript
destRig = await tx.rig.create({ data: { operatorId: toOperatorId, startedAt: now } })
```

There's no check for whether the destination operator is active, invited, or has consented to receive the rig. There's also no uniqueness constraint on `rig WHERE operatorId AND endedAt IS NULL`. If the operator already somehow has two active rigs (from a race or from a bug), this creates a third.

### Low: `useToast` hook is a no-op — sprint 6 didn't wire it up

`ToastProvider` wraps no layout. `useToast()` returns the default context value: `() => {}`. If a developer tries to use `useToast()` in a component, it silently does nothing. No error, no feedback.

This needs to be added to either `src/app/layout.tsx` or the admin and operator `layout.tsx` files.

### Low: `make db-seed-units` target missing from Makefile

The health endpoint warns: `Run: make db-seed-units`. The Makefile has `db-seed` and `db-reset` but no `db-seed-units`. An operator who sees a degraded health check and follows the guidance will get `make: *** No rule to make target 'db-seed-units'. Stop.`

---

## Part III — Persistent Issues From AHITS_REVIEW.md

These were identified in the first review and remain unresolved:

### Still completely unbuilt

**Operator daily check** — page is a stub. The `POST /api/daily-check` API exists (with upsert, email on fail, syncedAt). The `GET /api/daily-check` API exists with operator-scoped filtering. No UI wraps them. An operator cannot submit a daily vehicle inspection. This was flagged as the highest-frequency operator action after My Rig. Every day in the field, the most important safety record goes uncaptured.

**Operator checkout page** — page is a stub. The legacy `POST /api/checkout` route exists (pre-rig-system, doesn't know about kits or rigs). No UI. The intended path for operators — scan QR, check out individual item — is completely absent.

**Alert system** — The schema has 8 AlertType values (`MAINTENANCE_OVERDUE`, `EQUIPMENT_NOT_RETURNED`, `DAMAGE_REPORTED`, `REPAIR_NEEDED`, `LOW_INVENTORY`, `INSURANCE_EXPIRING`, `REGISTRATION_EXPIRING`, `PIN_LOCKED`). Zero triggers exist anywhere. Alerts are never created. The Alert model and table exist but serve no purpose.

**Service worker doesn't cache active rig** — `src/app/sw.ts` caches `/api/dashboard`, `/api/inventory*`, `/api/vehicles*`, `/api/maintenance*`. It does **not** cache `/api/deployments*`. An operator's My Rig page will fail offline. This is the page they need most when they have no signal.

**Offline queue not connected to My Rig** — `useOfflineQueue` (IndexedDB) is only connected to the operator dashboard. My Rig mutations (add item, remove item, return item) are raw `fetch()` calls with no offline handling. If signal drops mid-operation, changes are lost silently.

**DailyCheck has no GPS capture** — `DailyCheck` schema has no lat/lng. The API doesn't accept it. For carbon credit chain of custody, field GPS at time of daily check is a requirement, not a nicety.

**Vehicle odometer dead** — `DailyCheck.odometer` is accepted by the API but never written to `Vehicle.odometer`. The daily check is the natural update vector for vehicle mileage tracking, but the `Vehicle.odometer` field never changes.

**MaintenanceTask has no assignee relation** — `MaintenanceTask.assigneeId` is a bare `String?` with no relation declaration. Any foreign key to User is not enforced by Prisma. Maintenance tasks cannot be reliably queried by assignee.

**CheckLog has no rigId** — `CheckLog` records who checked an item out but not which rig it was on. Historical check logs cannot be associated with a specific deployment. Audit queries like "show all check-outs on rig X" require joining through KitItem, which is only loosely related.

### Still present, degraded behavior

**Consumable return doesn't identify which physical units** — In `DELETE /api/deployments/[id]/items/[kitItemId]` for consumable items, the code does:

```typescript
const units = await tx.inventoryUnit.findMany({
  where: { inventoryItemId: kitItem.inventoryItemId, status: 'CHECKED_OUT' },
  take: removeQty,
  orderBy: { createdAt: 'asc' },
})
```

It finds the oldest checked-out units for that item type — but there could be multiple rigs with the same consumable checked out. This returns units from any rig, not necessarily the ones in this rig's kit. The `inventoryUnitId` on the kitItem is null for consumables, so there's no anchor. Units from another operator's rig could be incorrectly returned to AVAILABLE.

**Inventory "currentOperator" reflects CheckLog, not active kit** — `GET /api/inventory` determines `currentOperator` by finding the most recent un-returned CHECK_OUT in `checkLogs`. But the current truth is in the rig/kit system. An item could be in an active kit but the CheckLog calculation could disagree if check-in/check-out log records are missing or mismatched. These two systems are not reconciled.

**Legacy checkout API should be removed or protected** — `POST /api/checkout` bypasses the rig/kit system entirely. It picks an arbitrary available unit, creates a CheckLog with no rigId, and returns. Nothing prevents an admin or a script from calling this and putting inventory in an inconsistent state (units CHECKED_OUT but not in any active kit).

**Soft delete doesn't block creates** — `InventoryItem` and `InventoryUnit` have `deletedAt` but no unique constraint relaxation. A soft-deleted item with the same name or QR code will cause a unique constraint violation if another item is created with the same identifiers.

**Idempotency gap in offline queue** — If `useOfflineQueue.ts` successfully POSTs to the server but fails to delete the IndexedDB record (e.g., browser crash), the item will be replayed on the next flush. Duplicate check-outs or check-ins could result. No idempotency key is sent with requests.

---

## Part IV — User Persona Deep Dive (Post-Sprint-6)

### Operator

The core operator loop — **start deployment → field work → end deployment** — is now materially complete for the happy path:

- Can start a deployment with vehicles and a kit
- Can add/remove vehicles and items during the deployment
- Can return items partially (per-unit for serialized, per-quantity for consumable)
- Can transfer equipment to another operator
- Can end deployment with full disposition workflow (hub / transfer / inoperable)
- Can scan QR codes to look up item status

**Remaining gaps:**
- Cannot submit a daily vehicle inspection (page is a stub)
- Cannot do the independent "check out an item" flow outside of a deployment (checkout page is a stub, and the legacy API doesn't serve the current architecture anyway)
- Cannot select a serialized unit when starting a **new** deployment (only when adding to an existing one)
- If offline, My Rig is blank (deployments API not cached)
- Transfer dialog shows all operators including those without active rigs — accepting creates a rig silently for them

### Admin

Admin oversight is now well-developed:

- Full inventory CRUD with per-unit management, history, QR download, repair routing
- Can create deployments on behalf of operators with full unit selection
- Can edit active deployments (add/remove vehicles, items, operators)
- Can accept/decline transfers on behalf of operators
- Can view all deployment history

**Remaining gaps:**
- No dashboard aggregation beyond the stat cards
- Reports page likely a stub (not read during this review — should be verified)
- No bulk operations on inventory (bulk retire, bulk hub assignment)
- Alert queue is empty because alerts are never created
- No audit trail — admin status changes to units aren't logged
- Pending transfers section on admin deployments page fetches ALL pending transfers — as the fleet grows, this could become a very long list with no filtering

### Downstream (maintenance shops, project owners)

Nothing has changed for downstream recipients. The application still has no external-facing layer:

- No export of maintenance tasks to external systems
- No read-only portal for project owners to see equipment assigned to their project
- No formal handoff record when equipment goes to a shop
- MaintenanceTask with `repairType: AT_SHOP` creates a record with shopName/shopAddress but no automated communication to the shop
- No carbon credit chain of custody reporting

---

## Part V — Platform & Offline Analysis (Post-Sprint-6)

### iOS and Android

The QR scan flow (jsQR via file input with `capture="environment"`) works on iOS and Android without native permissions prompts. This is a good pragmatic choice.

**New issue confirmed:** The scan result page still shows wrong chip color for CHECKED_OUT on mobile (the scan page bug). On a small screen where color is the primary discriminator, green vs. blue matters more than on desktop.

The operator My Rig page is a very long component (~1,334 lines) with many dialogs stacked inside each other. On a 375px screen this renders adequately because MUI handles responsiveness, but scroll depth for operators with large kits will be extreme. No virtualization exists for the kit list.

### Desktop

Admin workflows are desktop-first and work well — drawers, tables with pagination, multi-column forms.

### Offline

The service worker caches: `/api/dashboard`, `/api/inventory*`, `/api/vehicles*`, `/api/maintenance*`

It does NOT cache: `/api/deployments*`, `/api/transfers*`, `/api/hubs*`, `/api/users*`, `/api/categories*`

An operator going offline in the field will see:
- Operator dashboard: partial (dashboard data is cached)
- My Rig: blank (deployments not cached)
- Inventory: cached stale copy
- Scan: cached if item was scanned before; blank if new item
- Daily check: stub page — doesn't matter yet

The `skipWaiting: true` in the service worker means a new deploy while an operator is mid-form will immediately activate the new worker. If the new worker caches a different API contract, in-flight form data could be corrupted. This remains a risk.

---

## Part VI — Business Logic Gaps (Post-Sprint-6)

### Consumable unit tracking is inaccurate at scale

When multiple operators have the same consumable type checked out simultaneously (e.g., 10 soil sample bags across 3 rigs), the `status: 'CHECKED_OUT'` individual unit records represent physical bags. When one operator returns 3 bags, the system finds the 3 oldest CHECKED_OUT units for that item across ALL rigs and sets them to AVAILABLE. These might belong to a different rig.

The fundamental issue: consumable `KitItem` rows have `inventoryUnitId: null`, so there's no way to know which physical units are in which rig. The only fix is either (a) assign specific unit IDs to consumable kit items, or (b) track consumable "pools" per rig rather than per physical unit. This is a data model decision with downstream migration implications.

### Operator on two active rigs

There's no uniqueness constraint on `rig WHERE operatorId AND endedAt IS NULL`. It's possible (via a race, a bug, or admin action) for an operator to have two active rigs. The My Rig page shows `data[0]` — the first one returned — and silently ignores any others. The operator would have no way to see or close the second rig.

### Vehicle assigned to ended deployment

When a deployment ends, `vehicle.assignedOperatorId` is set to null for all vehicles in the rig. But `RigVehicle.removedAt` is not set for vehicles at end-of-deployment — they just remain with the ended rig. If the vehicle later appears in a new rig query, the `assignedOperatorId` being null is the only signal it's "free". If that update fails (partial transaction failure), vehicles stay assigned indefinitely.

### Project assignment is unconstrained

`rig.projectId` is optional. There's no enforcement that equipment deployed on a project belongs to that project's `ProjectEquipment` list. The PRD implies carbon credit billing requires equipment-to-project attribution, but the schema allows any equipment on any project.

### Transfer creates destination rig without label

When a transfer is accepted and the destination operator has no active rig, one is created with no label, no project assignment, and no notes. The operator sees a rig with a start date but no context. There's no mechanism for them to add a note retroactively.

---

## Part VII — Security (Post-Sprint-6)

No changes from AHITS_REVIEW.md findings:

- PIN brute force ceiling: `failedPinAttempts` and `pinLockedAt` exist in schema. The lock-out logic implementation should be verified in `src/lib/auth/pin.ts`.
- `SUPABASE_SERVICE_ROLE_KEY` (or equivalent) used for server-side uploads — should not be exposed to the client.
- Photo URLs are permanent Supabase storage URLs with no expiry. Knowing a URL gives permanent access with no auth.
- Session JWT is stateless — role changes don't take effect until the token expires (24h). An operator with a compromised session who is deactivated remains "active" until their JWT expires.
- No rate limiting on any API route.
- Transfer accept allows admin to act on behalf of destination operator. Auditing who accepted (admin vs. operator) is not captured anywhere.

---

## Part VIII — Codebase Risks (Post-Sprint-6)

### No tests

Sprint 6 planned Vitest infrastructure. No vitest.config.ts exists. No test files exist in the application source. The only test files in the repository are inside `node_modules/zod`. The CI workflow has no test job.

This is the highest ongoing risk to the codebase. Every sprint adds functionality that cannot be regression-tested. The atomic checkout concurrency fix is correct, but there's no test to verify it stays correct. The soft delete logic is applied inconsistently (to InventoryItem/InventoryUnit but not enforced at the application query layer everywhere).

### Dead code accumulates

The `doAction('removeItems', ...)` case in My Rig is dead code. The legacy `POST /api/checkout` API is dead code (stubs point at nothing). The `AlertType` enum is dead code. As the codebase grows, this becomes harder to identify and remove.

### `InventoryItem.quantity` is permanently out of sync

`InventoryItem.quantity` was the original count before Sprint 4 introduced `InventoryUnit`. Now the true count is `units.filter(deletedAt: null).length`. The `quantity` field is still set on create but never updated when units are added, removed, or soft-deleted. The admin item form still edits it (as "Current Quantity"). This divergence will cause confusing state where item.quantity says 5 but there are 8 units.

### `prisma.inventoryItem.create` uses `as never`

In the POST `/api/inventory` route:
```typescript
const created = await tx.inventoryItem.create({ data: parsed.data as never })
```
`as never` suppresses type checking on the create payload. This means schema changes (new required fields, renamed fields) will cause runtime errors rather than compile errors. Every occurrence of `as never` in the codebase is a future maintenance risk.

### Zod v4 in node_modules but schema may be v3

`package.json` specifies `"zod": "^3"` range. The test files discovered in node_modules are from `zod/src/v4`. If Zod was upgraded to v4 without updating imports, validation behavior may have changed silently. The app uses `z.object`, `safeParse`, `flatten()` — these are compatible, but error format changes in v4 could affect the `extractApiError` utility.

---

## Part IX — UX Consistency (Post-Sprint-6)

### Status chip colors across the application

| Page | AVAILABLE | CHECKED_OUT | IN_MAINTENANCE | INOPERABLE | RETIRED |
|------|-----------|-------------|----------------|------------|---------|
| Admin Inventory (`/admin/inventory`) | success (green) | info (blue) | warning (amber) | error (red) | default (grey) |
| Operator Scan (`/operator/scan`) | success (green) | **primary (green)** | warning (amber) | error (red) | default (grey) |

The scan page is the only page with the wrong color. This is a one-line fix.

### Two distinct "remove item" UX paths in My Rig

**Path 1 — Per-item icon button (RemoveCircleOutlineIcon)**: Opens a simple dialog. Quantity stepper, condition dropdown, no note field beyond body.data.notes. Calls `DELETE /api/deployments/[id]/items/[kitItemId]`.

**Path 2 — "Remove Items" mode + DispositionDialog**: Multi-step disposition workflow. Bulk type selection (Hub / Transfer / Inoperable), per-item override table, photo capture for inoperable items, required overall note. Calls `DELETE /api/deployments/[id]/items`.

These two paths exist side-by-side on the same kit list. An operator has a per-item button AND a "Remove Items" mode button. They lead to fundamentally different workflows with different data captured and different API routes. An operator scanning items in the field won't know which to use or why they differ.

**Recommendation:** The per-item icon path should be reserved for simple quick returns (item in good condition going back to hub). The DispositionDialog path should be the primary path for any remove that involves damage, transfers, or inoperable items. The UI should guide this decision with clearer labels — not two visually equivalent options.

### Confirmation dialog inconsistency

- Transfer cancel: "Are you sure you want to cancel this pending transfer?" — dialog with Cancel/Cancel Transfer buttons. The Cancel and Cancel Transfer labels are confusing (cancel what?).
- Vehicle remove: no confirm dialog — goes directly to NotePhotoDialog
- Item per-unit return: dialog with Cancel/Return (no note field)
- Item bulk remove: DispositionDialog multi-step flow with required note

No consistent pattern for "destructive action = one confirm dialog with required note."

### Empty state guidance

- My Rig with no active deployment: clear empty state with "Start Deployment" button — good
- My Kit with no items: "Empty kit." — no guidance on how to add items
- Admin inventory with no results: "No items found. Click 'Add Item' to add your first one." — good
- Admin deployments with no active: "No active deployments. Click 'New Deployment' to start one." — good

The operator kit empty state is the weakest — an operator with an empty kit during an active deployment should see a clear call-to-action.

### Date formatting inconsistency

- My Rig header: `new Date(rig.startedAt).toLocaleDateString()` — locale-dependent, no time
- Admin deployments drawer: `relativeDate()` — "Today", "Yesterday", "X days ago"
- Admin inventory history tab: `new Date(log.submittedAt).toLocaleDateString()` — no time
- Transfer banners: `new Date(tr.createdAt).toLocaleDateString()` — no time

No consistent date/time display format. CheckLog history shows only the date — for an item checked out and returned same day, this is meaningless (two entries both showing same date with no time).

### Loading state coverage

Pages set `loading = true` during initial data fetch and show skeleton loaders — this is done well in admin pages. The operator My Rig page shows a full-page `CircularProgress` during load. However, during any `doAction` call (add vehicles, add items, etc.), the only loading indicator is the button's `disabled` state and sometimes a spinner in the button. The rest of the page remains interactive. A user could attempt multiple actions simultaneously.

---

## Part X — Data Model Gaps (Post-Sprint-6)

Most gaps identified in AHITS_REVIEW.md remain. New observations:

### TransferItem.quantity has no relationship to KitItem.quantity

`TransferItem.quantity` was added in Sprint 5/6. When a transfer is accepted, the code uses `ti.quantity ?? ti.kitItem.quantity` to determine how much to transfer. But `TransferItem.quantity` could exceed `KitItem.quantity` at acceptance time if the source quantity changed between transfer creation and acceptance. The accept route does check `stillPresent.quantity < ti.quantity` — but only if `ti.quantity != null`. If null (full transfer), no check is done. A race where the source quantity is decremented between transfer creation and accept could result in transferring more items than exist.

### KitItem per consumable unit not tracked

As noted above, consumable `KitItem` rows have `inventoryUnitId: null`. This is a fundamental gap for accurate unit-level tracking of consumables. The implication is that consumable inventory counts are estimated from unit status aggregates, not from definitive kit membership.

### No audit log model

Admin unit status changes (via the Units tab dropdown in admin inventory) call `PATCH /api/inventory/units/[unitId]` which directly updates unit status. No CheckLog or AuditLog is created. The History tab on admin inventory shows CheckLog records — it will not show admin-initiated status changes.

### CheckLog still has no rigId

Already flagged — adding here for completeness since no sprint has addressed it. Associating a CheckLog with a deployment requires traversal: `checkLog → inventoryItem → kitItem (by itemId and time approximation) → kit → rig`. There's no direct FK.

### Photo context 'MAINTENANCE' used for kit additions

Already detailed above. The `PhotoContext` enum should be extended with `KIT_ADDITION` or similar.

---

## Part XI — Sprint Recommendations

### Sprint 7 — Fix now (should block shipping to production users)

These are things that could cause user confusion or data loss in the field. They are all small:

1. **Fix scan page chip color** — one line change in `scan/page.tsx` (`CHECKED_OUT: 'info'`)
2. **Wire up ToastProvider** — add to `src/app/layout.tsx` (or per-layout); replace inline toast states in pages with `useToast()`
3. **Add `db-seed-units` to Makefile** — the health endpoint references it; add a script that creates InventoryUnit rows for any InventoryItem that has none
4. **Fix operator New Deployment kit builder for serialized items** — add the same unit picker already present in the Add Items dialog
5. **Remove dead `doAction('removeItems')` code** and any other dead code identified above
6. **Write the first 3 Vitest tests** — deployment creation, atomic unit conflict, soft delete — to establish the pattern and CI job
7. **Set `condition` on CheckLog in the partial return route** — map `returnCondition` to `CheckLog.condition` when creating the CHECK_IN record
8. **Set `kitItem.removedAt` for TRANSFER dispositions** in both `end/route.ts` and the bulk remove DELETE handler

### Sprint 8 — Operator daily check (highest-impact incomplete feature)

The API already exists. Sprint 8 should build:
- Daily check form UI (vehicle selection, checklist, odometer entry, pass/fail, photo attachment, site entry)
- Auto-save / draft mode with offline queue integration
- On submit: create MaintenanceTask if passFail=false
- Update `Vehicle.odometer` from submitted value
- Offline queue entry for daily checks submitted without signal
- Cache `/api/deployments*` and `/api/daily-check*` in the service worker

### Sprint 9 — Alert system foundation

Without alerts, no one knows when things go wrong unless they look. Build:
- `MAINTENANCE_OVERDUE` — scheduled check (cron or lazy evaluation) creates Alert when `MaintenanceTask.nextDue < now` and `status !== COMPLETED`
- `EQUIPMENT_NOT_RETURNED` — if a deployment has been active longer than a configurable threshold (e.g., 90 days), create alert
- `DAMAGE_REPORTED` — create alert when `MaintenanceTask.isDamageReport = true` is created
- `PIN_LOCKED` — create alert when `pinLockedAt` is set (already in lockout logic)
- Admin alert feed UI with resolve/dismiss workflow
- Email notification via existing Resend integration for ADMIN_EMAIL

### Sprint 10 — Inventory data model reconciliation

Address the fundamental accuracy gaps:
- Deprecate `InventoryItem.quantity` — it's always wrong now; display `unitCounts.totalUnits` everywhere and remove the field from the edit form
- Consumable unit assignment: when a consumable is added to a kit, assign specific unit IDs to the KitItem (or create a `KitItemUnit` join table). This makes return tracking accurate.
- Add `rigId` to `CheckLog` — migration + update all CheckLog create calls
- Add `User` relation to `MaintenanceTask.assigneeId`
- Add `PhotoContext.KIT_ADDITION` and fix the items route

### Sprint 11 — Test coverage to 50% critical paths

Establish Vitest infrastructure, Docker Compose for test DB, and write tests for:
- Atomic checkout concurrency (the race condition Sprint 6 fixed)
- Soft delete prevents re-use
- Transfer accept with various partial quantity scenarios
- End deployment with mixed HUB / TRANSFER / INOPERABLE dispositions
- Daily check upsert behavior
- N+1 regression tests (run EXPLAIN ANALYZE via pg queries in test)

### Sprint 12 — Operator checkout and standalone scan-to-action

The standalone checkout page (currently a stub) should become a functional flow:
- Scan QR → identify item → if AVAILABLE: check out with condition note → create CheckLog + update unit status
- Scan QR → identify item → if CHECKED_OUT + belongs to current operator: check in with condition → create CheckLog + update unit status
- This is distinct from the rig/kit system and should be clearly labeled as "ad-hoc checkout" or removed if the rig system is the only intended checkout path

### Sprint 13 — Downstream / reporting layer

- Carbon credit chain of custody: daily check GPS, equipment-on-project audit trail, operator hours from `hourlyRate × deployment duration`
- Project equipment compliance report: for a given project, which required equipment was present, when, and what was its condition
- Maintenance shop handoff: when `repairType: AT_SHOP`, generate a formal work order PDF
- QR label print workflow: batch print labels for a hub's inventory
- Read-only project owner portal

---

## Part XII — Priority Matrix

Severity classifications for everything identified in this review:

**P0 — Data accuracy / silent corruption**
- Consumable return picking units from other rigs
- TRANSFER disposition not setting `kitItem.removedAt` at end-of-deployment
- `InventoryItem.quantity` permanently diverged from actual unit count
- CheckLog condition never set on returns

**P1 — User-visible bugs / broken features**
- Scan page CHECKED_OUT chip is green (same as available)
- Operator new deployment can't select serialized units
- ToastProvider not mounted — all toast calls are no-ops
- Daily check page is a stub
- Checkout page is a stub

**P2 — Missing behavioral integrity**
- Alerts never fire
- My Rig not cached offline
- CheckLog has no rigId — deployment history not queryable
- Admin can silently accept transfers on behalf of operators
- Secondary operators cannot initiate transfers

**P3 — Code quality / maintainability**
- Zero tests
- Dead code accumulation (`doAction('removeItems')`, legacy checkout API)
- `as never` type suppressions
- Photo context 'MAINTENANCE' on kit additions
- `make db-seed-units` target missing

---

## Part XIII — What's Good

Honest assessment of what is working well and what represents sound engineering:

The **atomic checkout concurrency pattern** — `updateMany` on a where-clause that includes the expected current status, then checking `result.count === 0` — is correct and race-safe. This is exactly the right approach for a multi-operator system without distributed locks.

The **deployment data model** — Rig → Kit → KitItem → InventoryUnit — is well-designed. The separation of the deployment context from the physical inventory is clean. TransferRequest as a first-class entity with PENDING state preserving source inventory until accepted is a solid design choice.

The **DispositionDialog multi-step flow** is thorough and field-appropriate. Walking an operator through "where is this item going?" with a visual choice card UI, followed by per-item override capability, followed by photo capture for damage, followed by a confirm summary — this is exactly the right UX pattern for a high-stakes irreversible action in a mobile-first field tool.

The **per-unit history** in the admin inventory drawer is exactly what was asked for and is implemented correctly — CheckLogs filtered by inventoryUnitId, shown as a collapsible row per unit. An admin can see the full lifecycle of a specific serial number.

The **N+1 query fix** in `GET /api/inventory` is correct. Two bulk queries, in-memory resolution, applied to both the filter path and the main loop. The endpoint now performs O(1) database round trips regardless of result set size.

The **transfer accept route guards** are thorough: source rig still active, vehicles still present, kit items still present, sufficient quantity. These were all added and all correct. A race condition where both sides of a transfer are modified before accept is handled.

The **QR code infrastructure** — every InventoryItem and InventoryUnit gets a `qrCodeId` (cuid) at creation, QR downloadable from admin, scannable via jsQR in both scan page and kit building — is complete, functional, and avoids any dependency on a label vendor's API.

The overall code style is consistent, readable, and idiomatic for Next.js App Router + Prisma. The schema is well-structured with appropriate enums and nullable fields. The foundation is strong. The gaps are in coverage (what's wired up) rather than in architectural direction (what was designed).
