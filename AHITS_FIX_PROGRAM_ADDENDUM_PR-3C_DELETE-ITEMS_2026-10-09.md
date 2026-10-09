# Program addendum · PR-3c · Delete items (and restore them) · 2026-10-09

> STATUS: runnable addendum to `AHITS_FIX_PROGRAM_2026-10-05_FIVE-PRS.md` (paste both into Claude Code) · WROTE: 2026-10-09 · READ-WITH: the program's §0 decisions, `AHITS_SCREENING_REPORT_2026-10-05_ROOT-CAUSES.md`
> WHY: the owner asked for a way to delete an item from Inventory entirely — "sensible, smooth, simple, without interrupting any other flow". The API has had a soft delete (`DELETE /api/inventory/[id]`, CR-8) since June; no screen exposes it. Two agents designed and then adversarially reviewed this spec against the code; the owner answered the four open questions on 2026-10-09.
> SLOT: a standalone PR **after PR-3b** (it needs 3b's `openReferences` and 3a's `resolveAlertsFor`); it can run before or after PR-4 freely and does not depend on PR-5 (if it lands after PR-5, its strings go into `src/lib/copy/admin-actions.ts`). One additive migration. About 16 files.

---

## 0 · Owner decisions (final — apply, don't re-ask)

| # | Decision |
|---|---|
| D-o | **Delete is allowed even when the item has history** (deployments, check logs, closed repairs). It is a reversible soft delete: the item, its units and its schedules are hidden from every list, count, picker and report; the history rows stay in the database; "Show deleted → Restore" brings everything back exactly. Nothing is ever hard-deleted (D33). |
| D-p | **Bulk delete ships now** (select several → Delete selected), with a per-item result because the guard answers per item. |
| D-q | **Who deleted is recorded and shown** (`deletedById`, one additive nullable column + relation to `users`). Stewart has admin now, so "Deleted 9 Oct · Max" matters. |
| D-r | **A scanned sticker of a deleted unit says so**: "<Item> (serial …) was deleted from inventory — an admin can restore it under Show deleted." — never a generic "not found". |
| D-s | **The rule a user needs** (printed in the dialog): *Retire is for real gear you are done with — it stays in history and reports. Delete is for mistakes, duplicates and test entries — it leaves every list, count and report, and can be restored.* |
| D-t | **Open request lines block both Delete and Retire** (the new `openRequestLines` guard key joins the shared assert). **Open damage tasks block Delete** ("N open repairs — close them first"); only non-damage schedules are hidden with the item. |
| D-u | **QR labels stay bound** on delete (unlike Retire's `::retired::` release) so Restore is exact and Undo is lossless. A new unit registered with a sticker that belongs to a deleted unit gets a message naming the deleted item. |

Vocabulary (D-m): "Delete", "Delete selected", "Show deleted", "Restore", "Undo". Sentence case. Vehicles are out of scope here (they already have Delete; a "Show deleted / Restore" twin for vehicles is parked as a PR-5 point item).

---

## 1 · Data

- Migration (additive, passes the gate): `ALTER TABLE inventory_items ADD COLUMN "deletedById" TEXT;` + FK to `users(id)` with `ON DELETE SET NULL`; Prisma `deletedBy User? @relation("ItemDeletedBy", …)`.
- Backfill in the same migration, for items soft-deleted before this PR whose units were left live: `UPDATE inventory_units u SET "deletedAt" = i."deletedAt" FROM inventory_items i WHERE u."inventoryItemId" = i.id AND i."deletedAt" IS NOT NULL AND u."deletedAt" IS NULL;` — no screen has ever called DELETE, so this is almost certainly 0 rows; say so in the PR body.

## 2 · Module — `deleteItem` / `restoreItem` in `src/lib/asset-status.ts` (beside `retireUnit`; `src/lib/inventory.ts` stays pure derivation)

**`deleteItem(tx, itemId, byUserId)`**, one `now` stamp for every row it touches:
1. Guard — `assertNoOpenReferences('item-delete', refs)` where refs = kit items with `inventoryItemId = id AND removedAt IS NULL` **on any rig, ended or not, consumables included** (a TRANSFER disposition leaves a consumable kit item open on an ended rig) ∪ PENDING `transfer_items` joined through those kit items ∪ held lines (`heldItemId = id AND heldQty > claimedQty AND releasedAt IS NULL` — FULFILLED reservations keep unclaimed holds) ∪ `openRequestLines` (lines on DRAFT/REQUESTED/STAGED/FORWARDED requests naming the item via `specificInventoryItemId`, `substitutedItemId` or `resolvedUnitId`) ∪ open damage tasks on the item or any of its units ∪ units in CHECKED_OUT / IN_TRANSIT / IN_MAINTENANCE. The `stock` key is ignored for delete; instead assert `SUM(reservedQty) = 0` across the item's stock rows, else 409 "N reserved on open requests — release the holds first." Messages name what is in the way ("Named on 2 open requests — edit or cancel them first.", "2 open repairs — close them first.", "3 units are still out or in repair — get them back first."). `openRequestLines` is added to `openReferences` and therefore also guards Retire (D-t).
2. Effect — item `deletedAt = now, deletedById`; every non-deleted unit `deletedAt = now` (status untouched, QR untouched — D-u); non-damage maintenance tasks with `itemId` `deletedAt = now`; `resolveAlertsFor` for `sourceTable = 'inventory_items' AND (sourceId = id OR sourceId LIKE id || ':%')` (the LOW_INVENTORY key is `<itemId>:<hubId>`; the serialized one is `<itemId>:serialized`) and for `('inventory_units', unitId)` per unit (INOPERABLE alerts); `inventory_stock` rows untouched (Restore needs them; `reservedQty` is 0 by the guard).

**`restoreItem(tx, itemId)`** — clears `deletedAt` and `deletedById` on the item, and `deletedAt` on units and schedules whose `deletedAt.getTime()` equals the item's stamp (Prisma cannot express "equals the parent's column" in a nested `where`; include `{ deletedAt: { not: null } }` and compare in JS). A unit tombstoned separately stays deleted. Stock, status and QR were never touched. A LOW_INVENTORY alert may re-raise on the next cron — expected under D-i.

**Writers refuse deleted rows** with 409 "Restore it first": `PATCH /api/inventory/[id]`, `PATCH /api/inventory/units/[unitId]`, `review-inoperable`, `POST /api/inventory/[id]/stock`, `POST /api/inventory/[id]/units`, `POST /api/maintenance` with an `itemId`. **Checkout refuses deleted gear**: `deployments` POST, `deployments/[id]/items` POST and `pickUnit` check item and unit `deletedAt` → 409 "<name> was deleted from inventory". The offline queue already treats 409/410 as terminal and surfaces `body.error` (`useOfflineQueue.ts` is **untouched**). `deployment-requests.ts`: the substitute picker and the staging-unit picker add `"deletedAt" IS NULL`; Awaiting Pickup excludes held lines whose item is deleted (legacy safety; the guard prevents new ones).

## 3 · API

- `DELETE /api/inventory/[id]` → `deleteItem` → `{ ok, deletedAt }`; `POST /api/inventory/[id]/restore` → `restoreItem`; both admin-only.
- `GET /api/inventory/[id]/references` (admin) → `openReferences` + history counts `{ deployments, checkLogs, repairs, photos }` for the dialog.
- `POST /api/inventory/bulk-delete` `{ ids: string[] }` (admin, max 100) → runs `deleteItem` **per item in its own transaction** so one refusal never blocks the rest → `{ results: [{ id, name, ok, error? }] }`.
- `GET /api/inventory?deleted=1` → only deleted items (with `deletedBy { name }` and their same-stamp units), **admin-only**: non-admin → 403; combined with `mode=options` → 400. Every other list stays `deletedAt: null`.
- `GET /api/inventory/units/by-qr/[qrCodeId]`: stop filtering `deletedAt`; a deleted unit answers **410** `{ error: "<Item> (<serial or unit N>) was deleted from inventory — an admin can restore it under Show deleted." }` with N computed among same-stamp siblings (the current position math returns 0 for a deleted unit — don't ship "unit 0"). Vehicles by-qr untouched. The scan page, the operator `NewDeploymentDialog`, and `my-deployment` (one line: `res.status === 410 ? { status: 'error', message } : { status: 'not-found' }` — D21 holds) show the message instead of "isn't registered to any unit".
- Unit creation (`POST /api/inventory/[id]/units`) on a `qrCodeId` collision looks up the owner: if it is a deleted unit, "This QR label is bound to a deleted unit of "<item>" — restore it under Show deleted, or print a new label."

## 4 · UI — `src/app/(admin)/admin/inventory/page.tsx` (+ `ConfirmDialog`, `BulkActionBar`)

1. **Row actions** become Edit · Retire · Delete (trash icon, tooltip "Delete"), and the drawer footer gets a text-variant error **Delete** beside Retire — shown for any non-deleted item, RETIRED included. Not in the edit form (D38).
2. **Confirm** (`ConfirmDialog` gains an optional `details` node): title "Delete item?", confirm "Delete" (error colour). Message: `Delete "<name>"? Use this for mistakes, duplicates and test entries. To retire real gear use Retire instead — it stays in history and reports.` Details from `/references`: `3 units (2 available, 1 inoperable) go with it; their QR labels stay bound.` or `40 on hand at 2 hubs go with it.` · `History kept, hidden: 3 deployments · 12 check-log entries · 1 repair · 2 photos.` (only when any) · `Restorable under Show deleted.` A 409 from the server is toasted verbatim through `apiErrorMessage`.
3. **Toast** `"<name> deleted"` with an **Undo** action (calls restore; the toast `action` slot exists). The "Just added" pin clears if it holds that id.
4. **Bulk** (D-p): a checkbox column through `useMultiSelect` + `BulkActionBar` (the Hubs page pattern) with one action **Delete selected**; "Select all" applies to the current page only ("Select all N on this page" — the table is category-grouped). Confirm lists the count and the first five names ("… and N more") and says refused items will stay. Result toast `"7 deleted · 2 refused"` with an expandable list of each refusal and its reason; refused rows stay selected so they are visible.
5. **Show deleted** switch beside Show retired (admin only; component state like `includeRetired`; the deleted view replaces the normal list rather than mixing). Row badge `Deleted 9 Oct · Max`; **Restore** is the only row and drawer action; the drawer is read-only. Toast `"<name> restored"`.

## 5 · Tests

UI (`tests/components/inventory-delete.test.tsx`, the real-page harness of `uxp6-item-form.test.tsx`): dialog message and details lines; DELETE on confirm; Undo posts restore; 409 text toasted; Show deleted fetches `deleted=1`, rows show the badge and only Restore; bulk: select three with one refused → result toast counts and the refusal listed, refused row still selected; Just added pin cleared; scan page renders the 410 message.
Node (CI): each guard refusal (units out, open repair, `openRequestLines`, held lines, `reservedQty > 0`); cascade with one stamp (units and schedules stamped, status and stock untouched, alerts resolved incl. the `LIKE` key and per-unit keys); restore reverses only same-stamp rows (a separately-deleted unit stays deleted; `deletedById` cleared); `deleted=1` → 403 for an operator, 400 with `mode=options`; by-qr 410 with the right serial/position; both checkout routes and `pickUnit` 409 on deleted gear; substitute and staging pickers exclude deleted; bulk-delete partial results in separate transactions; the backfill statement is 0-row safe; the 3a guard test still passes; Retire now refuses on an open request line.

## 6 · Acceptance (owner smoke after merge)

Delete a test item with units on hand → gone from the list and from every picker, toast with Undo; Undo → back exactly (same units, same labels). Delete again → Show deleted lists it with date and your name; Restore from there. An item named on an open request → refused naming the request. Select twelve test items → Delete selected → "N deleted · M refused" with reasons. Scan a deleted unit's sticker → the "was deleted" message. The Equipment report's asset count drops. Retire still works, and now also refuses on an open request.

## 7 · Session close

`STATUS.md`; `DECISIONS.md` **D46 = D-s + D-o + D-u** (Delete vs Retire); handoff `AHITS_SESSION_HANDOFF_<date>_PR3C-DELETE.md`; `AHITS_PILOT_FLOOR_TODO.md` adds the PR-3c row under the fix program; the program file gets a one-line pointer to this addendum under its PR-3 section; `00_START_HERE.md` routing row.
