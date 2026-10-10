# Addendum · PR-6 · Repair and Retire are for serialized gear · 2026-10-10

> STATUS: runnable addendum to `AHITS_FIX_PROGRAM_2026-10-05_FIVE-PRS.md` (paste both into Claude Code) · WROTE: 2026-10-10 · READ-WITH: the program's §0 decisions, `AHITS_FIX_PROGRAM_ADDENDUM_PR-3C_DELETE-ITEMS_2026-10-09.md` (Delete), DECISIONS D-a/D41/D42/D44/D46
> WHY: two owner rules — only serialized items can be repaired or serviced, and only serialized items can be retired — plus the gap PR-3b left behind: an admin has no way to start a repair on a unit that is sitting at the hub. One agent mapped every path by which a consumable can reach Retire or a maintenance task today (26 files); a second reviewed this spec against the code. The owner answered the three open questions on 2026-10-10.
> SLOT: first PR after PR-5c (#264). Depends on 3a/3b/3c/5b being merged (they are). No migration. About 26 files; split as §8 says if it grows past review size.

---

## 0 · Owner decisions (final — apply, don't re-ask)

| # | Decision |
|---|---|
| D-v | **Repairs and service are for serialized gear and vehicles.** A consumable (`itemType = CONSUMABLE`) never gets a maintenance task — not a damage repair, not a scheduled service. Server refusal, one message: `"<name>" is a consumable — repairs and service are for serialized gear.` |
| D-w | **Retire is for serialized gear.** "Retired" means equipment that has fallen out of repair, not "discontinued". Consumables get used up; one the team stops stocking is liquidated and then **Deleted** (the reversible PR-3c delete) — the UI never offers Retire on a consumable and the server refuses it: `"<name>" is a consumable — consumables are used up or deleted, not retired.` |
| D-x | **A damaged consumable is written off, not repaired.** On return, a consumable line offers Return to hub (stock restored), Transfer to operator, or **Write off** (used up, lost or damaged: stock not restored, recorded against the item as a check-in marked Missing parts with the notes, plus the damage photos). No repair task, no bell; low-stock alerts fire as normal if stock drops. |
| D-y | **A consumable never has units, and an item's type is fixed once it has history.** Adding a unit to a consumable is refused; changing `itemType` is refused once the item has any unit, stock row, kit line, check log or task (`Type is fixed once an item has units or stock — add a new item instead.`). A bare, just-created item can still be corrected. |
| D-z | **Legacy rows stay as history.** Consumables already RETIRED, units already on consumables, and maintenance tasks already on consumables are not migrated or closed by this PR. Unit-level routes keep keying on the unit, so a legacy unit on a consumable still scans, returns and reports exactly as today. The owner can clean them up later with Delete. |
| D-g′ | **Admins start a repair from Inventory.** The Units tab offers **Send for repair** on every AVAILABLE unit, not only INOPERABLE ones — same dialog, same damage task, status still written only by `asset-status.ts`. (Amends PR-3b's D-g, which removed hand-set In Maintenance without adding this.) |

Vocabulary (D-m): "Write off", "Send for repair". Sentence case. Vehicles are out of scope (they already have Report damage and their own Retire).

---

## 1 · Data

- **No migration.** A write-off is a `CHECK_IN` check log with `condition = MISSING_PARTS` (what "No — write off" already writes today) and notes prefixed `Written off` — plus the damage photos the return already stores against the item. Nothing new in the schema; the `canBeFixed` / `returnCondition` wire fields stay so items already queued on phones replay.
- Read-only counts for the owner before merge (Supabase SQL Editor only), so D-z is a known number, not a guess — see §6.

## 2 · Server rules

2.1 **One helper, one error family.** `src/lib/item-rules.ts`: `assertSerialized(db, itemId, verb)` loads `{ id, name, itemType, deletedAt }`, returns it, and throws `ReferenceConflict` (`asset-references.ts`, the class `referenceConflictBody` maps to 409 — precedent: `deletedGear()` in `asset-status.ts`) with the D-v / D-w / D-y message for `verb ∈ 'retire' | 'repair' | 'units'`; a sibling `assertTypeUnlocked(db, itemId)` throws the D-y type-lock message. The consumable-vs-serialized decision is made in exactly one place. **Catch blocks:** only `inventory/[id]` PATCH and `review-inoperable` already map that class to 409. `inventory/[id]/units` POST (today: 500 with the raw message), `maintenance` POST and `field-fix` POST (today: no try/catch), and the three disposition routes (`end` POST, bulk `items` DELETE — whose catch returns 500 for everything — and `items/[kitItemId]` DELETE) each gain the same `catch → referenceConflictBody → 409` block the PATCH route has. This matters beyond tidiness: the offline queue retries 5xx to its limit and treats only 409/410 as terminal with the message shown.

2.2 **Retire — `PATCH /api/inventory/[id]`** (`src/app/api/inventory/[id]/route.ts`; `inventoryUpdateSchema` lives in this file):
- `status` on an item: keep the zod enum, then the same manual check `units/[unitId]` PATCH uses — `status !== current.status && !['AVAILABLE','RETIRED'].includes(status)` → 400 `{ error: 'Only Available and Retired can be set on an item.' }` (today all six enum values are accepted and four of them mean nothing). `current` must also select `itemType`.
- `status: 'RETIRED'` on a CONSUMABLE → 409 D-w, nothing written (checked before `openReferences`, so the message names the real reason, not a reference).
- `itemType` changing (D-y): `assertTypeUnlocked` → 409 when the item has any `inventory_units` row (deleted included), `inventory_stock` row, kit line, check log or maintenance task. Same value re-sent (the edit form always sends it) is not a change. Note a consumable created with a quantity and a hub gets a stock row at birth, so its type locks immediately; "bare" means created without stock.
- Un-retire (RETIRED → AVAILABLE) unchanged and allowed for any item — a legacy retired consumable (D-z) can come back if it was retired by mistake.

2.3 **Units — `POST /api/inventory/[id]/units`**: `assertSerialized(…, 'units')` → 409 D-y for a consumable. Unit creation at item birth is the client's T4 call to this same route (the item POST creates no units server-side), so one guard covers both.

2.4 **Repair and service**:
- `POST /api/maintenance` with `itemId` → `assertSerialized(…, 'repair')` after the existing deleted check.
- `POST /api/maintenance/field-fix` with `itemId` and no `inventoryUnitId` → `assertSerialized(…, 'repair')`. With a unit it stays unit-keyed (D-z).
- `openDamageTask(tx, { kind: 'item', itemId })` in `src/lib/maintenance.ts` → `assertSerialized(tx, itemId, 'repair')` before creating anything. This is the backstop: no disposition, offline replay or future caller can open a task on a consumable, whatever the client sent.

2.5 **Dispositions on a CONSUMABLE kit line** — `deployments/[id]/end` (POST), `deployments/[id]/items` (DELETE, bulk) and `deployments/[id]/items/[kitItemId]` (DELETE, single). The `itemType` branch comes **before** any read of `canBeFixed` or `returnCondition`, so a payload already queued on a phone with `canBeFixed: true` lands as a write-off — never a 409, never a retry loop.
- **end and bulk**, `type: 'INOPERABLE'` (whatever `canBeFixed` or repair fields say) → **write-off**: kit line closed or decremented exactly as today, stock not restored, no task, no alert. The INOPERABLE branch's own `targetUnit` lookup (`kitItem.inventoryUnit ?? first CHECKED_OUT unit`) is **skipped** for a consumable; if the line itself carries an `inventoryUnit` (a legacy unit-keyed line — scan "add to kit" can make one), that unit is first brought home through `returnUnit(…, { condition: 'GOOD', linked: false })` — AVAILABLE, no task — and then the write-off is written. Check log `CHECK_IN`, `condition: MISSING_PARTS`, `notes = ['Written off', disp.inoperableNotes ?? note].filter(Boolean).join(' — ')` (`note` is the rig-level note these routes already write); photos stored against the item exactly as the unit-less INOPERABLE branch does today.
- **end and bulk**, HUB with `returnCondition: 'IN_MAINTENANCE' | 'INOPERABLE'` on a consumable (API-only today; the dialog never sends it) → the same write-off record; stock not restored as today.
- **single route** (`items/[kitItemId]`): its body has no `type`, `canBeFixed` or photos — only `returnCondition`, `quantity`, `hubId`, `notes`, `consumed`. `returnCondition: 'IN_MAINTENANCE' | 'INOPERABLE'` on a consumable → the write-off record with `notes = ['Written off', body.notes].filter(Boolean).join(' — ')` (admin Return Item sends no notes, so usually `Written off` alone); `GOOD` and `consumed` unchanged.
- The "anonymous line" sweep that returns up to N `CHECKED_OUT` units of the item (`end`, bulk and single all have one) **still runs for a consumable on every declared condition, but always passes `condition: 'GOOD'` to `returnUnit`** — a legacy unit comes home AVAILABLE and never gets a task (D-z); skipping the sweep would strand such units CHECKED_OUT with no live kit line and set off INV-5. For serialized items the sweep is unchanged.
- Serialized lines are byte-for-byte unchanged: unit task via `returnUnit` / `openDamageTask({ kind: 'unit' })`, `markInoperable`, bells, pull.

2.6 **Send for repair (D-g′) — `POST /api/inventory/[id]/review-inoperable`**: accepts a unit in `AVAILABLE` as well as `INOPERABLE`, and opens the damage task with `pull: true` through `openDamageTask` exactly as the INOPERABLE path does (source `ADMIN_REVIEW`, no new bell; `resolveActiveAlert` is a no-op when there is nothing to resolve). Refusals: `CHECKED_OUT` → 409 `Out on <rig> — report it from the deployment, or send it for repair when it returns.` where `<rig>` is the rig's `label`, else `<PRIMARY operator>'s deployment` (the `deploymentOf` house pattern), read via `openReferences({ unitId })` → `refs.kitItems[0]`; `IN_TRANSIT` → 409 `Receive it at the hub first (Hubs → Inbound).`; `IN_MAINTENANCE` → 409 `Already in repair.`; `RETIRED` and deleted unchanged. The RETIRE branch of this route is unchanged (INOPERABLE only).

2.7 **Pickers**: `/api/inventory?mode=options` is unchanged (it already returns `itemType`); the two Maintenance pickers filter client-side (§3.2). The `?sched=item:<id>` deep link: when the deep-linked item is not SERIALIZED the dialog opens with no item pre-selected (no client-side copy of the D-v text; the server stays the one place that says it).

2.8 **Not touched**: `asset-references.ts` (the `'item'` guard keys are already right for both types), `populations.ts`, `inventory.ts` counts, the equipment report, the LOW_INVENTORY evaluator, INV-6/8/9, `useOfflineQueue.ts`, `sw.ts`, `tests/offline/**`.

## 3 · UI

3.1 **Inventory page** (`src/app/(admin)/admin/inventory/page.tsx`):
- Row actions and drawer footer: **Retire** only when `itemType === 'SERIALIZED' && status !== 'RETIRED'` (the row and the detail payload both carry `itemType` already). A consumable row is Edit · Delete; its drawer has Delete only. No explanatory caption — the absence is the rule.
- **Units tab and "+ Add Unit"**: hidden for a consumable with no units. A consumable that still has legacy units (D-z) shows the tab read-only with one line, `Legacy units — this item is a consumable, so no more can be added.`, and no Add Unit. The drawer's `Tabs` are index-based today (`activeTab === 1` is Units, `=== 2` History, `openOn === 'units'` → 1); removing a tab would shift History onto the Units panel, so the tabs switch to explicit values `'info' | 'units' | 'history'` first.
- **Send for repair** (D-g′): shown on every AVAILABLE unit as well as INOPERABLE ones, opening the shared `RepairReviewDialog` — its existing "Send for Repair" title and strings unchanged (D-m: existing strings are not recased). Retire-this-unit stays on INOPERABLE only; the unit status select stays AVAILABLE/RETIRED. `UNIT_STATUS_SOURCE.IN_MAINTENANCE` becomes `via Report a problem or Send for repair`.
- **Delete dialog for a consumable**: new copy key `item.deleteConsumable` — title "Delete item?", message `Delete "<name>"? Consumables aren't retired — delete one you've stopped stocking (liquidate the stock first) or added by mistake. It leaves every list, count and alert, and can be restored under Show deleted.`; details line `40 on hand at 2 hubs go with it.` as today. Serialized items keep `item.delete` unchanged. The dialog branches on `deleteTarget.itemType`.
- **Edit form**: the type field is disabled with helper text `Type is fixed once an item has units or stock.` when `unitCounts.totalUnits > 0 || itemCounts.owned > 0` (the detail payload has no stock rows; stock is folded into `itemCounts`). The disabled field **still submits its value** — the form always sends `itemType`, and `uxp6-item-form` asserts it. The server guard (§2.2) is the truth; the UI may lock a legacy item that has a quantity but no stock row where the server would allow the change — acceptable.

3.2 **Maintenance page** (`src/app/(admin)/admin/maintenance/page.tsx`): the "Add scheduled task" and "Log field fix" item pickers list `picker.options.filter(o => o.itemType === 'SERIALIZED')`. Labels unchanged. The "Inoperable units — needs review" panel is unchanged.

3.3 **DispositionDialog** (`src/components/shared/DispositionDialog.tsx`), per line: a CONSUMABLE line's Disposition select offers **Return to Hub · Transfer to Operator · Write off**. Write off shows Notes and "Damage photos — add at least one if you can" only — no "Can it be fixed?", no repair fields — and submits `type: 'INOPERABLE'` with no `canBeFixed` (wire format unchanged, §1). Serialized lines keep "Mark Inoperable / Damaged" and the fixable toggle exactly as today.

3.4 **Admin Deployments → Return Item** (`src/app/(admin)/admin/deployments/page.tsx` + `src/components/shared/ConditionSelect.tsx`): for a CONSUMABLE the Condition select offers **Good · Write off** (`returnCondition: 'GOOD' | 'INOPERABLE'`); `ConditionSelect` gains an optional `options` prop so the scan page and serialized lines are untouched.

3.5 **Operator surfaces**: no change beyond the shared dialog. Log Daily Usage, Scan (unit-only) and `my-deployment/page.tsx` are untouched (D21: 1467 lines, must not grow).

3.6 **Copy** (`src/lib/copy/admin-actions.ts`): add `item.deleteConsumable`; `item.retire` and `item.delete` unchanged. `tests/components/copy-contract.test.tsx` gets the matching `EFFECTS` row (route `DELETE /api/inventory/[id]`, effect "PR-6 D-w: consumable soft delete, same guards as item.delete").

## 4 · Tests

**Node (CI, DB):** `tests/pr6-serialized-only.test.ts`
- Retire: PATCH `RETIRED` on a consumable → 409 with the D-w text and the row unchanged; on a serialized item → unchanged behaviour (units retired, labels released); PATCH `status: 'CHECKED_OUT'` on any item → 400.
- Type lock: `itemType` change refused once the item has a unit / a stock row / a kit line; allowed on a bare item; re-sending the same type is a no-op.
- Units: POST units on a consumable → 409 D-y; on serialized → unchanged.
- Repair/service: POST `/api/maintenance` with a consumable `itemId` → 409 D-v; with a serialized `itemId` → 201. `field-fix` with a consumable `itemId` only → 409; with a unit → unchanged. `openDamageTask({ kind: 'item' })` on a consumable throws; on a serialized item still creates.
- Write-off: on `end` and bulk, a consumable line with `type: 'INOPERABLE', canBeFixed: true` and a photo → no task, no `DAMAGE_REPORTED`, stock not restored, `CHECK_IN` log with `MISSING_PARTS` and the `Written off` note, photo stored against the item; on the single route, `returnCondition: 'INOPERABLE'` → the same record (no photo field there); `GOOD` still restores on all three. A serialized line with the same payload → unit task opened and pulled (unchanged).
- Legacy unit on a consumable (DB-direct fixture): a unit-keyed line written off on `end` → the unit comes home AVAILABLE with no task; an anonymous consumable line returned with `returnCondition: 'INOPERABLE'` on the single route → the sweep brings a CHECKED_OUT legacy unit home AVAILABLE, no task; `report-problem` on such a unit still works (D-z).
- 409 shape: the new refusals on `units`, `maintenance`, `field-fix`, `end`, bulk and single routes return `{ error }` with status 409 (not 500) — one assertion per route.
- Send for repair: `review-inoperable` REPAIR on an AVAILABLE unit → task opened, unit `IN_MAINTENANCE`, no bell; the three refusals with their exact messages; RETIRE on an AVAILABLE unit still 409.
- Existing tests to update, and only these: `tests/pr3b-guards.test.ts` "consumable: stock rows and quantity untouched, LOW_INVENTORY resolved, the scan skips it" → becomes the 409 case (the LOW_INVENTORY clearing on a deleted consumable is already covered by PR-3c's delete tests). `tests/pr2-populations.test.ts` keeps its DB-direct RETIRED consumable (legacy, D-z) and adds a deleted one. `tests/helpers/fixtures.ts` default stays CONSUMABLE; tests that need units pass `itemType: 'SERIALIZED'` only where the route would now refuse. `tests/pr3a-status-writers-guard.test.ts` must still pass unchanged.

**UI (`npm run test:ui`):** `tests/components/pr6-serialized-only.test.tsx` on the real-page harness
- consumable row shows Edit · Delete and no Retire; drawer has no Retire, no Units tab; serialized row still shows Retire and the Units tab;
- Delete dialog on a consumable shows the `item.deleteConsumable` text; on a serialized item the unchanged `item.delete` text;
- Send for repair appears on an AVAILABLE unit and on an INOPERABLE one, not on CHECKED_OUT / IN_TRANSIT / IN_MAINTENANCE; confirming posts to `review-inoperable`;
- type field disabled with the helper when units or stock exist;
- Maintenance: Add scheduled task and Log field fix pickers list only serialized items;
- DispositionDialog: a consumable line offers the three options, Write off hides the fixable toggle and submits `type: 'INOPERABLE'` without `canBeFixed`; a serialized line is unchanged;
- Return Item: consumable Condition offers Good · Write off only;
- copy-contract passes with the new key.

## 5 · Acceptance (owner smoke after merge — test data through the app's screens)

A consumable row shows Edit · Delete only; its drawer has no Retire and no Units tab. Delete on it shows the consumable wording. A serialized item is unchanged: Retire, Units, and **Send for repair** on an available unit → In Maintenance with a repair task; on a unit that is out → refused naming the rig. Maintenance → Add scheduled task lists no consumables. End a test rig with a consumable line marked Write off → stock not restored, the item's History tab shows a check-in marked Missing parts and the photo sits under the Info tab's damage photos, no bell, nothing in Maintenance. Admin Return Item on a consumable offers Good · Write off. Edit a stocked item: the type field is greyed out with the reason. Scan a legacy unit of a consumable (if any) → still works.

## 6 · Legacy data (D-z) — read-only, Supabase SQL Editor only

```sql
SELECT 'retired consumables' AS what, count(*) FROM inventory_items WHERE "itemType"='CONSUMABLE' AND status='RETIRED' AND "deletedAt" IS NULL
UNION ALL SELECT 'units on consumables', count(*) FROM inventory_units u JOIN inventory_items i ON i.id=u."inventoryItemId" WHERE i."itemType"='CONSUMABLE' AND u."deletedAt" IS NULL
UNION ALL SELECT 'tasks on consumables (open)', count(*) FROM maintenance_tasks t JOIN inventory_items i ON i.id=t."itemId" WHERE i."itemType"='CONSUMABLE' AND t."deletedAt" IS NULL AND t.status <> 'COMPLETED'
UNION ALL SELECT 'tasks on consumables (all)', count(*) FROM maintenance_tasks t JOIN inventory_items i ON i.id=t."itemId" WHERE i."itemType"='CONSUMABLE' AND t."deletedAt" IS NULL;
```

Expected small numbers. Whatever they are, nothing in this PR changes them; open tasks on consumables can be closed from the Maintenance page and retired consumables deleted from Show retired, by hand, afterwards.

## 7 · Session close

`STATUS.md` (PR-6 row; the parked items below); `DECISIONS.md` **D49 = D-v … D-z + D-g′**, with one-line qualifiers on D-a ("serialized items"), D41 (money rule: item-level tasks are not in the equipment report today — noted, not fixed), D43 ("a damaged return is never task-less" → for serialized gear; a consumable write-off is task-less by design), D44 ("serialized item"), D46 (add: *Consumables aren't retired — delete one you've stopped stocking*); handoff `AHITS_SESSION_HANDOFF_<date>_PR6-SERIALIZED.md`; `AHITS_PILOT_FLOOR_TODO.md` row; `00_START_HERE.md` routing row; the program file gets a one-line pointer to this addendum under its PR-3 section; `AHITS_WHATS_CHANGED_2026-10.md` under "For admins": `Retire is for serialized gear; a consumable you stop stocking is deleted. Send for repair works on any unit at the hub, from the Inventory drawer. A damaged consumable is written off, not repaired.` (the PDF is regenerated outside the repo).

**Parked** (STATUS, not this PR): admin "Log field fix" on a serialized item should pick a unit — an item-only field fix today writes an audit task that the equipment report never counts; item-level damage tasks on serialized "anonymous" kit lines are second-class everywhere (not in the report, not on the rig drawer, need a return destination on close) — one INV-10 monitor or a unit-resolution step would close that; a retired consumable can still be drawn by the API — moot once no new ones are created, closed for good when the legacy ones are deleted.

## 8 · Size and split

One PR if it stays at review size. If not, split at the module boundary: **6a** server rules + Node tests (§2, §4 Node), **6b** UI + copy + UI tests (§3, §4 UI) — opened together, merged back-to-back inside one D48 window, because between them a consumable row would briefly show a Retire that the server refuses.
