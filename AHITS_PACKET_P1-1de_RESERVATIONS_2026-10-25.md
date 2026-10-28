# Packet P1-1d + P1-1e · Reservations: staged means ready, expired holds · rev 4.1 · 2026-10-25

> STATUS: runnable packet. Two PRs, in order after P1-1c merges: **P1-1d "Staged means ready"** → **P1-1e "Expired holds"**. One Claude Code session each. It replaces rev 2's P1-1c. · WROTE: rev 4.1, 2026-10-25, after break-it, completeness and dry-run reviews of rev 3 (BRR, CRR, D4r3), the owner's final decisions of 2026-10-25, and a stacked dry-run build of P1-1d → e on top of the hotfix and P1-1a/b/c (S5). · READ-WITH: `AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md` (rev 4.1: its override line, §5 base gate, §7 close and the D48 rules apply here too), `CLAUDE.md`, `DECISIONS.md` D9, D11, D21, D45, D46, D47.
> WHY: the old code announced a staged reservation as ready when it wasn't. An admin had to click Fulfill before the operator could take it. Holds were auto-released with no one deciding. Rev 4 applies three reviews of rev 3 and the owner's decisions: an "Any …" line is done when the owner's deployment has enough of that kind; there is no cron sweep for the deploy window; owner read R6 comes with a one-write fix and its undo. Every finding is applied, merged with another, or rejected with a reason (ledgers at the end).
> SLOT: P1-1d after P1-1c merges. P1-1e after P1-1d merges. Each PR's merge day can run on its own acceptance. P1-1e's can too, if it lands at least 7 days after the "keep" reservations in P1-1d's acceptance. Line numbers are at `dd9f6ac`. P1-1a, P1-1b and P1-1c move the three checkout routes and my-deployment, so re-grep every anchor. D21: `src/app/(operator)/operator/my-deployment/page.tsx` must not grow: its `wc -l` after P1-1d is ≤ its `wc -l` before (1467 at `dd9f6ac`).
> MERGE ORDER: P1-1a lands first. In the Add Items and Add Vehicles POST transactions, P1-1a's first statement is `claimActiveRig(tx, id)` (`src/lib/deployment-auth.ts`); P1-1d's lock goes right after it. Start (`POST /api/deployments`) has no claim; there the lock goes right after `ensureOpenAssignment` (d.5). P1-1a also moves 23505 handling to `isUniqueViolationAnywhere`, outside the transaction. P1-1d's collect step is the **last** statement inside each transaction, after P1-1a's vehicle shortfall check. P1-1d adds no new 23505 path. P1-1b deletes my-deployment's dead `case 'end'` and adds `formatDay`, which P1-1e uses.

**The P1-1 override line applies:** no handoff file unless the session ends mid-work (one `CHANGELOG.md` line plus one STATUS line instead), and stage named files only, never `git add -A`.

---

## 0 · Owner decisions — rows for P1-1d and P1-1e (final; replace rev 2's g, h, i)

| # | Decision | Becomes |
|---|---|---|
| g | **A staged reservation is ready for pickup (P1-1d).** Staging holds the stock at the hub and puts the request on its owner's Today at once (Pick Up). The stock leaves the hub at pickup. The request becomes Fulfilled once everything on it is collected, or Cancelled if nothing was. Admin Fulfill goes away for reservations. | D50 (amends D9's flow; D9's words unchanged) |
| h | **Collecting closes it (P1-1d).** A line that names a unit or vehicle is collected when that unit or vehicle joins the owner's deployment. A line that asks by type, item or category reads on Today as "Any truck", "Any <item>" or "Any <category>". It is collected when the owner's deployment has enough of that kind: at least the line's quantity of vehicles of that type (any vehicle when the type is empty or Other), or of equipment of that item or that category (a unit counts 1; counted equipment counts its quantity). The check runs at every Start Deployment, Add Items, Add Vehicles and Pick Up, so no Pick Up is needed. If the deployment already has one, the next of these completes it. Owner: "Done once his deployment has a truck of that type: at once if he already has one, or after he adds one with Add vehicles. The record matches reality." | D50 |
| i | **Expired holds (P1-1e).** Nothing is released automatically. A hold past its date raises an admin alert, which is not configurable in Settings. The alert also tells the reservation's owner. It links to Admin → Requests, where a "Needs a decision" group sits at the top of Active with **Return to stock** or **Extend…** (the admin picks a date). Both actions are admin-only and both tell the owner. Until P1-1e ships, today's cron auto-release (step 7) runs unchanged. | D50 |
| o | **Reservations already staged by the old code are converted once, at deploy** (P1-1d's migration), into the same hold that Stage now makes. Rows it can't convert are cancelled before merging (owner read R2). No legacy path, legacy flag, legacy Fulfill button or cron sweep remains. | D50 |
| p | **A reservation's owner is `COALESCE(forOperatorId, requestedById)`.** It is used for Today, claiming held stock, closing, and every bell these PRs add or change. The frozen portal's decline bell (D21(b)) and Cancel rights (CC-31 item 4) stay with the requester. | D50 |
| q | **Hold dates.** Extend runs a hold to the end of the picked business day in APP_TIMEZONE (today Central; a later PR moves the app to Eastern). Stage's hold lasts 168 h. Screens show the business day the server computed. No zone is hard-coded. | D50 |
| m (unchanged) | D9's and D11's locked words stay: "Pick Up", "Start Deployment", "Staged at <hub> for pickup" (D11), "Mark Handled" (D9). New strings these two PRs add are sentence case and listed in each section. | — |

---

## P1-1d · Staged means ready (server + UI + one additive migration)

**Goal.** §0-g/h/o/p. Closes AD2-1 and API-7: one operator can no longer release another operator's holds.

### d.0 · One rule each (shared SQL fragments in `src/lib/deployment-requests.ts`)

Write these once, near the other helpers (~`:519`), and use them everywhere below. Aliases: `r` is the request, `l` is a line.

```ts
const OWNER = Prisma.sql`COALESCE(r."forOperatorId", r."requestedById")`
const HOLDING = Prisma.sql`EXISTS (SELECT 1 FROM "deployment_request_lines" hl
  WHERE hl."requestId" = r."id" AND hl."releasedAt" IS NULL AND hl."heldQty" > hl."claimedQty")`
// A reservation its owner can pick up from: staged, or an older fulfilled one still holding stock.
const PICKABLE = Prisma.sql`(r."requestType" = 'RESERVATION'
  AND (r."status" = 'STAGED' OR (r."status" = 'FULFILLED' AND ${HOLDING})))`
// A counted line: Stage reserves and holds it at the hub. Stage's own rule (effectiveReserveLines,
// snapshotHeldLines): the line's item is consumable, and so is its substitute if it has one.
const CONSUMABLE_LINE = Prisma.sql`(l."lineType" = 'KIT_ITEM' AND EXISTS (SELECT 1 FROM "inventory_items" ci
  WHERE ci."id" = l."specificInventoryItemId" AND ci."itemType" = 'CONSUMABLE'
    AND COALESCE((SELECT cs."itemType" FROM "inventory_items" cs WHERE cs."id" = l."substitutedItemId"), ci."itemType") = 'CONSUMABLE'))`
// Still to do: a hold not yet claimed or released, or any other confirmed line not yet collected.
const OPEN_LINE = Prisma.sql`(l."fulfillmentStatus" IN ('CONFIRMED','EDITED') AND l."lineType" IN ('KIT_ITEM','VEHICLE') AND (
  (l."heldHubId" IS NOT NULL AND l."releasedAt" IS NULL AND l."heldQty" > l."claimedQty")
  OR (l."heldHubId" IS NULL AND l."collectedAt" IS NULL)))`
// A unit or vehicle line, named or "Any …", not yet collected. Never a counted line.
const COLLECT_LINE = Prisma.sql`(l."fulfillmentStatus" IN ('CONFIRMED','EDITED') AND l."heldHubId" IS NULL
  AND l."collectedAt" IS NULL AND (l."lineType" = 'VEHICLE' OR (l."lineType" = 'KIT_ITEM' AND NOT ${CONSUMABLE_LINE})))`
const VEHICLE_TARGET = Prisma.sql`COALESCE(l."resolvedVehicleId", l."specificVehicleId")`
const UNIT_TARGET = Prisma.sql`COALESCE(l."resolvedUnitId", l."specificInventoryUnitId")`
const LINE_ITEM = Prisma.sql`COALESCE(l."substitutedItemId", l."specificInventoryItemId")` // the effective item
const LINE_QTY = Prisma.sql`COALESCE(l."fulfilledQty", l."requestedQty")`
// Collected on this deployment: its named unit or vehicle is on it, or (an "Any …" line) it has at
// least the line's quantity of that kind (§0-h). Vehicles of that type, or any vehicle when the type is
// empty or OTHER. Equipment of the line's effective item, else of its category, else any: a unit
// counts 1 and a counted line counts its quantity (a unit line's quantity is 1).
const onDeployment = (rigId: string) => Prisma.sql`(CASE
  WHEN l."lineType" = 'VEHICLE' AND ${VEHICLE_TARGET} IS NOT NULL THEN EXISTS (SELECT 1 FROM "rig_vehicles" rv
    WHERE rv."rigId" = ${rigId} AND rv."removedAt" IS NULL AND rv."vehicleId" = ${VEHICLE_TARGET})
  WHEN l."lineType" = 'VEHICLE' THEN (SELECT count(*) FROM "rig_vehicles" rv JOIN "vehicles" v ON v."id" = rv."vehicleId"
    WHERE rv."rigId" = ${rigId} AND rv."removedAt" IS NULL
      AND (l."vehicleType" IS NULL OR l."vehicleType" = 'OTHER' OR v."type" = l."vehicleType")) >= ${LINE_QTY}
  WHEN ${UNIT_TARGET} IS NOT NULL THEN EXISTS (SELECT 1 FROM "kit_items" ki JOIN "kits" k ON k."id" = ki."kitId"
    WHERE k."rigId" = ${rigId} AND ki."removedAt" IS NULL AND ki."inventoryUnitId" = ${UNIT_TARGET})
  ELSE (SELECT COALESCE(sum(ki."quantity"), 0) FROM "kit_items" ki JOIN "kits" k ON k."id" = ki."kitId"
      JOIN "inventory_items" i ON i."id" = ki."inventoryItemId"
    WHERE k."rigId" = ${rigId} AND ki."removedAt" IS NULL
      AND (CASE WHEN ${LINE_ITEM} IS NOT NULL THEN i."id" = ${LINE_ITEM}
                ELSE (l."categoryId" IS NULL OR i."categoryId" = l."categoryId") END)) >= ${LINE_QTY}
  END)`
// How a reservation closes: Fulfilled if anything went out with the operator, else Cancelled.
const CLOSED_STATUS = Prisma.sql`(CASE WHEN EXISTS (SELECT 1 FROM "deployment_request_lines" x
  WHERE x."requestId" = r."id" AND (x."claimedQty" > 0 OR x."collectedAt" IS NOT NULL))
  THEN 'FULFILLED' ELSE 'CANCELLED' END)::"DeploymentRequestStatus"`
// The one SET list for every close: the collect step (d.5), Cancel (d.3) and Return to stock (e.5).
const CLOSE_SET = Prisma.sql`"status" = ${CLOSED_STATUS},
  "fulfilledAt" = CASE WHEN ${CLOSED_STATUS} = 'FULFILLED' THEN COALESCE(r."fulfilledAt", now()) ELSE r."fulfilledAt" END,
  "updatedAt" = now()`
```

Notes:
- **One counted-line rule.** `CONSUMABLE_LINE` is the rule Stage already uses to reserve and hold, written once. The migration (d.1) and owner reads R1, R2, R4 and R5 use the same text. Every other KIT_ITEM line is a unit line.
- An unconverted counted line (`heldHubId IS NULL`, d.1) is an `OPEN_LINE` but never a `COLLECT_LINE`, so a checkout can't close its request.
- `UNIT_TARGET` reads `specificInventoryUnitId` too. The admin checklist can EDIT a serialized line and leave no `resolvedUnitId` (A5 Q2).
- `Prisma.join([])` throws (Prisma 5.22). Every `IN (${Prisma.join(…)})` below runs only on a non-empty list.

### d.1 · Migration `prisma/migrations/<YYYYMMDDHHMMSS>_p1_1d_staged_ready/migration.sql`

Use a UTC timestamp later than P1-1c's `_p1_1c_unit_location`. Test 15 finds the folder by its `_p1_1d_staged_ready` suffix.


It adds one nullable column and runs a one-off conversion. `scripts/check-migration-safety.sh` allows it: its destructive pattern (`:61`) doesn't match `ADD COLUMN … TIMESTAMP(3)` or `UPDATE`, and no statement has `NOT NULL` without a default. Keep the comments free of `;` and `'` (the script splits on `;` and strips only comments without a `'`). The precedent is `20261010120000_pr3c_item_deleted_by` (column + data UPDATE).

```sql
-- P1-1d (D50): staged means ready. Additive: one nullable column and a one-off data conversion.

-- (1) When a unit, vehicle or Any line of a staged reservation was collected.
ALTER TABLE "deployment_request_lines" ADD COLUMN "collectedAt" TIMESTAMP(3);

-- (2) Reservations staged by the code before P1-1d took their reserve at Stage but never
-- copied it onto the lines. Copy it now, exactly as snapshotHeldLines does at Stage:
-- held = effective qty and item at the request hub, nothing claimed, nothing released.
-- Only rows that really reserved: a hub and a stockReservedAt stamp. Owner read R2 has the
-- others cancelled before merging.
UPDATE "deployment_request_lines" AS l
SET "heldQty"    = COALESCE(l."fulfilledQty", l."requestedQty"),
    "heldItemId" = COALESCE(l."substitutedItemId", l."specificInventoryItemId"),
    "heldHubId"  = r."fulfillerHubId",
    "claimedQty" = 0,
    "releasedAt" = NULL
FROM "deployment_requests" AS r, "inventory_items" AS ii
WHERE r."id" = l."requestId"
  AND ii."id" = l."specificInventoryItemId"
  AND r."requestType" = 'RESERVATION'
  AND r."status" = 'STAGED'
  AND NOT (r."fulfillerHubId" IS NULL)
  AND NOT (r."stockReservedAt" IS NULL)
  AND l."lineType" = 'KIT_ITEM'
  AND l."fulfillmentStatus" IN ('CONFIRMED', 'EDITED')
  AND l."heldHubId" IS NULL
  AND ii."itemType" = 'CONSUMABLE'
  AND COALESCE((SELECT si."itemType" FROM "inventory_items" AS si WHERE si."id" = l."substitutedItemId"), ii."itemType") = 'CONSUMABLE';

-- (3) The hold date Stage gives (the PICKUP_HOLD_TTL_HOURS default: the Makefile sets no value).
UPDATE "deployment_requests" AS r
SET "holdExpiresAt" = now() + interval '168 hours'
WHERE r."requestType" = 'RESERVATION'
  AND r."status" = 'STAGED'
  AND r."holdExpiresAt" IS NULL
  AND EXISTS (SELECT 1 FROM "deployment_request_lines" AS l
              WHERE l."requestId" = r."id" AND NOT (l."heldHubId" IS NULL));
```

- Add `collectedAt DateTime?` to `DeploymentRequestLine` in `prisma/schema.prisma` (~`:1092`). CI builds the test database with `db push`.
- **The deploy window.** The migration runs before the new revision takes traffic, so for a few minutes the old code sees converted rows:
  - It doesn't list or claim them: it only reads FULFILLED holds (`:871`, `:1012`).
  - Its Fulfill re-snapshots the same values. Nothing has been claimed yet, so that is harmless.
  - Its Cancel releases the full reserve, so the stock is right, but it leaves the lines marked as held. Owner read R6 lists them, and §6 gives the one-write fix.
  - If its cron ticks inside the window, it may raise INV-3 and INV-4. The new cron clears them on its next tick (`:323-325`), except INV-4 after an old Cancel (it clears after R6's fix) and INV-3 while an R5 row is open (it clears when that row is cancelled).
  - It ignores `collectedAt`.
- **A row the old code stages after the migration** (before the new revision serves) has a reserve but no held lines. The new code can't close it by collection (`OPEN_LINE`). Owner read R5 lists such rows after the deploy; Cancel each in Admin → Requests (Cancel holds it first, d.3, so the right stock goes back) and ask its requester to send it again. §7 keeps the window empty: no staging or cancelling between the merge and `/api/health` showing the new revision.
- **Rows the migration can't convert** — staged with counted lines but no hub, staged before reserves existed (`stockReservedAt` empty), or with nothing confirmed — are listed by owner read R2 and cancelled before merging. Cancel releases nothing for them, which is correct: they reserved nothing.

### d.2 · Stage = hold (`confirm`, `src/lib/deployment-requests.ts:676-764`)

- **Nothing confirmed → refuse.** **After** the PENDING gate (`:682-689`; `tests/f3-line-checklist.test.ts:56` expects `PENDING_LINES` for a request whose only line is PENDING): if no line is CONFIRMED/EDITED with `lineType IN ('KIT_ITEM','VEHICLE')`, throw a new code `NOTHING_CONFIRMED`. PATCH (`src/app/api/deployment-requests/[id]/route.ts:66-81`) maps it to 409 `Every line is denied — decline the request instead.` (A5-16b). The hub portal's Mark staged gets its generic 409, unchanged (D21(b)).
- **Hub.** `confirm` uses the request's own `fulfillerHubId` only: `:706` becomes `const hubId = fulfillerHubId ?? null`. A hub in the PATCH body is ignored; no screen sends one.
  - With no hub and `(await effectiveReserveLines(id, tx)).length > 0`, throw `NEEDS_HUB`. PATCH maps it to 409 `This reservation has no hub. Decline it and ask for a new one with a hub.` (A5-15). The portal can't hit this: its links exist only for requests with a hub (`deployment-requests/route.ts:111`).
  - Add both new codes, `NOTHING_CONFIRMED` and `NEEDS_HUB`, to `TransitionResult` (`:62-64`).
- **Snapshot at Stage.** After the reserve loop (`:722`), still inside `if (hubId)`, call `snapshotHeldLines(id, hubId, tx)`. That sets `holdExpiresAt` too.
- **`snapshotHeldLines` (`:931-968`):**
  - Add `AND l."heldHubId" IS NULL` to its **SELECT** (`:939-944`). It then never re-snapshots, which would reset `claimedQty` or `holdExpiresAt` (A5-6).
  - Drop the `.catch(() => {})` at `:966`. A swallowed error inside an interactive transaction turns the COMMIT into a silent rollback (B4-12). The column has existed since `20260711020000`.
  - Its header comment says "at FULFILL": make it "at STAGE".
- **Bell** (`:724-752`):
  - Recipient: the owner. Read `"forOperatorId"` in the SELECT at `:702-704` and send to `forOperatorId ?? requestedById`.
  - Read the hub's name in the same SELECT (`LEFT JOIN "hubs"`).
  - Title `Ready for pickup`. Link `/operator/dashboard` (Today, where Pick Up is).
  - Body ``Your reservation is staged at ${hub} for pickup.${parts.length ? ` ${parts.join(', ')} — review.` : ''}``. With no hub (a unit-only request): ``Your reservation is ready for pickup.${…same tail}``. This keeps the adjusted/denied summary (BR-8).
- `src/lib/copy/admin-actions.ts:139` `request.stage` → `Staged — ready for pickup.`

### d.3 · No reservation Fulfill · one close rule · Cancel

- **`fulfill` for RESERVATION (`:786-804`)** becomes `return { ok: false, code: 'STATE_MISMATCH' }` and nothing else. The MATERIAL branch (`:777-785`) is unchanged.
  - An old cached admin tab, or a direct PATCH, now gets 409 `Transition not allowed in the current state.`
  - Update the header comment (`:597`) and the file header (`:12-13`).
- **Delete `releaseReservedStock`** (`:566-578`). It has no caller left. Rewrite the Cancel comment (`:646-654`) too: it names the function twice.
- **Cancel** (`:655-668`), RESERVATION branch. Keep the flip-first guard (`:657-662`). Then:
  1. Read `fulfillerHubId` and `stockReservedAt` (the flip leaves both set). Call `snapshotHeldLines(id, hub, tx)` only when both are set. Only Stage sets `stockReservedAt`, so a DRAFT or REQUESTED row, even with CONFIRMED lines, is never snapshotted and releases nothing (BRR-1). For a converted or new row it is a no-op; it holds a row the old revision staged in the deploy window (d.1).
  2. `releaseAllHeldForRequest(id, tx)`, which releases held − claimed.
  3. `UPDATE "deployment_requests" r SET ${CLOSE_SET} WHERE r."id" = ${id}`.
  4. Keep the `stockReservedAt = NULL` line (`:664-666`).

  Result: Cancel after a partial pickup reads **Fulfilled**, with its date, and only the unclaimed part goes back to stock. Cancel with nothing collected reads Cancelled (A5-11).
- **Lock order** everywhere is the request first, then its lines, then stock (A5-12):
  - Cancel's flip locks the request.
  - The checkout lock (d.5) locks requests in id order.

### d.4 · Claiming held stock (`claimHeldStock`, `:854-916`)

- **Signature:** `claimHeldStock(owners: string | string[], inventoryItemId, hubId, qty, db = prisma, preferRequestId: string | null = null)`. The existing tests' single-id calls keep compiling. First line: `if (qty <= 0 || ownerList.length === 0) return 0`.
- **Candidates query** (`:863-874`):
  - `AND ${PICKABLE} AND ${OWNER} IN (${Prisma.join(ownerList)})` replaces the status match at `:871` and the owner match at `:872` (A5-5).
  - `ORDER BY (r."id" = ${preferRequestId ?? ''}) DESC, COALESCE(r."fulfilledAt", r."decidedAt") ASC NULLS LAST, r."createdAt" ASC`. A Pick Up of B uses B's holds before A's (A5-10, D3-4).
- **No per-call request lock.** The checkout locks the candidate requests once, first (d.5). The per-line `FOR UPDATE` (`:885-890`) and the guarded draws stay.

### d.5 · Collecting at checkout (three routes, one pair of helpers)

New in `deployment-requests.ts`:

1. **`lockReservationsForRig(tx, rigId, fromRequestId?)`** returns `{ owners: string[], stagedIds: string[], pickupId: string | null }`.
   - Read the owners once: `SELECT DISTINCT "operatorId" FROM "deployment_assignments" WHERE "rigId" = ${rigId} AND "endedAt" IS NULL`. With none, return `{ owners: [], stagedIds: [], pickupId: null }`.
   - Then lock their pickable reservations:
     ```sql
     SELECT r."id", r."status"::text AS "status" FROM "deployment_requests" r
     WHERE ${PICKABLE} AND ${OWNER} IN (${Prisma.join(owners)})
     ORDER BY r."id" FOR UPDATE OF r
     ```
   - `stagedIds` are the locked STAGED ids. `pickupId` is `fromRequestId` only when it is one of the locked ids (STAGED, or FULFILLED and holding). Anything else is **ignored, never a 4xx**, because these writes are queued and replayed (API-7). The owners of a crew deployment include the secondaries (A5-4, D3-5, BR-16).
2. **`collectReservations(tx, { rigId, stagedIds, pickupId })`** is the last statement of the transaction:
   - **Mark collected** (only when `stagedIds` is non-empty):
     ```sql
     UPDATE "deployment_request_lines" l SET "collectedAt" = now()
     WHERE l."requestId" IN (${Prisma.join(stagedIds)}) AND ${COLLECT_LINE} AND ${onDeployment(rigId)}
     ```
     The mark is kept for good: a target removed later still counts, and one added in a later write is marked then (A5-3).
   - **Pick Up residual:** `if (pickupId) await releaseAllHeldForRequest(pickupId, tx)`, whether or not `stagedIds` is empty (the pickup can be an older FULFILLED row). This moves into the transaction (API-7).
   - **Close** (only when `stagedIds` is non-empty):
     ```sql
     UPDATE "deployment_requests" r SET ${CLOSE_SET}
     WHERE r."id" IN (${Prisma.join(stagedIds)}) AND r."status" = 'STAGED'
       AND NOT EXISTS (SELECT 1 FROM "deployment_request_lines" l WHERE l."requestId" = r."id" AND ${OPEN_LINE})
     ```

Routes:

- **Start Deployment** (`POST /api/deployments`, `src/app/api/deployments/route.ts`):
  - Right after `ensureOpenAssignment` (`:160`), before any vehicle or stock write: `const res = await lockReservationsForRig(tx, newRig.id, fromRequestId)`. Its owners are just the deployment's operator, never the session admin (BR-31).
  - Kit loop `:271`: `claimHeldStock(res.owners, …, tx, res.pickupId)`.
  - Before `findUniqueOrThrow` (`:301`): if `res.pickupId`, stamp `UPDATE "rigs" SET "fromRequestId" = ${res.pickupId} WHERE "id" = ${newRig.id}`. Then, always, `await collectReservations(tx, { rigId: newRig.id, stagedIds: res.stagedIds, pickupId: res.pickupId })`. The stamp is written for a valid pickup only (A5-14).
  - **Delete** the post-commit block (`:364-373`) and the `releaseAllHeldForRequest` import (`:7`).
  - Rewrite the schema comment `:62-63`.
- **Add Items** (`POST /api/deployments/[id]/items`, `src/app/api/deployments/[id]/items/route.ts`):
  - `addSchema` (`:49-68`): add `fromRequestId: z.string().optional()`. `items` becomes `.default([])` with a `.refine((d) => d.items.length > 0 || !!d.fromRequestId, { message: 'Add at least one item.', path: ['items'] })` in place of `.min(1)` (`:61`). An already-deployed operator can then pick up a reservation with nothing to add (A5-3c, BR-3).
  - Delete P1-1a's `primaryId` read and its 409 (~`:115-120` after P1-1a); `:199` no longer uses it, and `claimActiveRig` already answers 409 for an ended deployment. Keep the import: DELETE uses `getActivePrimaryForRig`.
  - Inside the transaction, right after P1-1a's `claimActiveRig(tx, id)`: `const res = await lockReservationsForRig(tx, id, fromRequestId)`.
  - `:199`: `claimHeldStock(res.owners, …, tx, res.pickupId)`. Any crew member's hold on this deployment can be used, and the pickup's own hold is used first.
  - Last: if `res.pickupId`, stamp `UPDATE "rigs" SET "fromRequestId" = ${res.pickupId} WHERE "id" = ${id} AND "fromRequestId" IS NULL`. Then, always, `collectReservations(tx, { rigId: id, stagedIds: res.stagedIds, pickupId: res.pickupId })`.
  - `refuseDeletedItems` already returns on `[]` (`src/lib/asset-status.ts:437`).
- **Add Vehicles** (`POST /api/deployments/[id]/vehicles`, `src/app/api/deployments/[id]/vehicles/route.ts:105-118`):
  - Right after P1-1a's `claimActiveRig(tx, id)`: `const res = await lockReservationsForRig(tx, id)`, with no pickup.
  - Last statement, after `vehicle.updateMany` and P1-1a's shortfall check: `collectReservations(tx, { rigId: id, stagedIds: res.stagedIds, pickupId: null })`.
  - This route isn't idempotency-wrapped. A replay re-runs the step, which is harmless.
- Every statement uses `tx`. No unit or vehicle status literal is added, so the D42 guard is unchanged.

### d.6 · Today's list (`getAwaitingPickupForOperator`, `:995-1060`; `src/app/api/deployment-requests/awaiting-pickup/route.ts:5-6` comment)

- **Requests** (no `DISTINCT` and no line join: with them, the new `ORDER BY` fails on Postgres):
  ```sql
  SELECT r."id", r."status"::text AS "status", r."label", r."fulfilledAt", r."holdExpiresAt",
         h."id" AS "hubId", h."name" AS "hubName"
  FROM "deployment_requests" r LEFT JOIN "hubs" h ON h."id" = r."fulfillerHubId"
  WHERE ${PICKABLE} AND ${OWNER} = ${operatorId}
  ORDER BY COALESCE(r."fulfilledAt", r."decidedAt") ASC NULLS LAST, r."createdAt" ASC
  ```
  - FULFILLED rows are listed **only** while they still hold stock, so historic reservations never come back (A5-1, D3-2).
  - The match is the owner only: an admin who filed a reservation for O no longer sees it on their own Today (A5-5).
  - No `readyAt` is returned; it has no reader (A7-15). `status` is used below and not returned.
- **`lines`:** the held lines with something left, as today (`:1022-1041`), keeping the PR-3c deleted-item guard. Old phones keep reading `line.heldItemId`.
- **`units`** (new; STAGED requests only; skip the query when there are none): every `COLLECT_LINE`, each as `{ kind: 'UNIT' | 'VEHICLE'; id: string | null; itemId: string | null; name: string }` (A5-8, D3-7), ordered by line `createdAt`.
  - VEHICLE with a target: the vehicle's name; `id` is the vehicle id.
  - VEHICLE without a target: `anyVehicleLabel(vehicleType)`, `id: null`. Add `anyVehicleLabel` to `src/lib/vehicle-types.ts`: `TRUCK` → `Any truck`, `TRAILER` → `Any trailer`, any other type → `Any ${vehicleTypeLabel(type)}` as labelled (Bobcat stays "Bobcat"), `OTHER` or null → `Any vehicle`.
  - KIT_ITEM with a unit: `${item} · #${serial}`, or the item name when the unit has no serial; `id` = the unit, `itemId` = its item.
  - KIT_ITEM with an item but no unit: `Any ${item}` for the effective item (`LINE_ITEM`); `itemId` = that item.
  - KIT_ITEM with a category only: `Any ${category}`, else `Any equipment`; `itemId: null`.
  - When the line's effective qty is > 1, prefix `${qty}× `.
- **Filter:** keep a request when `lines.length > 0 || units.length > 0`.
- Return type: `AwaitingPickupRequest` gains `units` (`:980-988`). `src/components/operator/today/types.ts` imports the card's type and needs no edit (D3-12).

### d.7 · Cron (`src/app/api/cron/dispatch/route.ts`) — in the same commit as d.2

- **INV-3** `:291`: `r."status" IN ('STAGED','FULFILLED')`.
- **INV-4** `:314`: `r."status" NOT IN ('STAGED','FULFILLED')`. Its label at `:319` becomes `INV-4 orphan holds on requests neither staged nor fulfilled`.
- **Step 7 (`:126-181`) stays unchanged** (owner). It only releases **FULFILLED** holds (`:152`), which are older fulfilled reservations. Staged holds are never auto-released before P1-1e, the same as today, where a staged reserve also has no expiry (MAP_A §f).
  - New FULFILLED rows never hold anything: a close requires no open line, and the Pick Up releases its residual.
  - Step 7 takes no request lock and releases a request's lines in no set order. A checkout that claims two held lines of the same older fulfilled request while step 7 releases it can deadlock on those lines. Postgres aborts one: the checkout returns 500 and the queue retries, or step 7's catch logs it. This is unchanged from today and ends when P1-1e deletes step 7.
- No other cron change. There is no sweep for the deploy window (owner decision; R5 and Cancel cover it, d.1).

### d.8 · Operator screens

- **`src/components/shared/AwaitingPickupCard.tsx`:**
  - Delete the duplicate subtitle (`:58-60`). The chip (`:63`) and `Pick Up` (`:118`) keep their D11 text.
  - New line: `To collect: <units' names, comma-joined>` (it lists vehicles too, so not "Units to collect"; A7-20, B6-17).
  - Type: export `AwaitingPickupUnit`, and `units?: AwaitingPickupUnit[]`. It is optional, so a payload cached by an older revision still renders.
- **`src/components/operator/NewDeploymentDialog.tsx`** (shared by both builders, so my-deployment doesn't grow):
  - `PickupPreset` (`:87-92`) gains `units`. `fetchPickupPreset` (`:95-110`) maps them (`Array.isArray(req.units) ? req.units : []`).
  - `presetItems` (`:113-119`):
    - adds up the held lines of each item: `const prev = m.get(line.itemId); m.set(line.itemId, { itemType: 'CONSUMABLE', quantity: (prev?.quantity ?? 0) + line.qty, inventoryUnitId: null, unitLabel: null })`;
    - seeds each unit line with an `id` as `{ itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: id, unitLabel: name }` under its `itemId`;
    - seeds each "Any <item>" line as an unselected serialized entry under its `itemId`, so the operator picks a unit.
    - One entry per item. A second unit of the same item stays "To collect", and the request stays STAGED for it.
  - Export `pickupHeld(preset, itemId, hubId)`: the **sum** of the preset's lines for that item when `preset.hubId === hubId`, else 0. Held quantity counts as available (A5-9): add it to the hub cap in the hub-change effect (`:185-186`) and to `hubAvail` (`:368-369`, which feeds `:393`/`:397`). `availableItems` (`:198`) also includes items already in `kitItems`, so a seeded line with 0 free stock stays visible and editable.
  - `selVehicles` (`:160`) starts from the preset's vehicle ids.
  - **Not pickable now** (derived each render; A5-8, BRR-14): a preset vehicle not in `unassignedVehicles`; a seeded unit not in its item's `availableUnits`; an "Any <item>" entry whose item has no `availableUnits`. An item whose options haven't loaded counts as pickable. These are never sent: `launch` (`:251`) sends only vehicle ids found in `unassignedVehicles` and skips such kit entries, and `hasUnselectedSerialized` ignores them, so they never block Pick Up. Their lines stay To collect.
  - Step 0 shows `<PickupUnitsNote units={preset.units} />` and, when anything is not pickable now, one warning Alert `Not available now: <names>`. That is the one note (CRR-5); there is no separate "Any truck" Alert.
  - Export `PickupUnitsNote({ units })`: an info Alert `To collect: <names, comma-joined>`. When any unit is a VEHICLE, append `. Add vehicles with Add Vehicles.` (e.g. `To collect: Truck 12, Any truck. Add vehicles with Add Vehicles.`). It renders nothing with no units. Title, button and comments at `:288`/`:519-522` are unchanged (D11).
- **`src/app/(operator)/operator/my-deployment/page.tsx`** (D21: edit existing lines only, net 0 lines):
  - `:28` (import) → add `pickupHeld, PickupUnitsNote` on the same line.
  - `:293` → `setPendingItems(presetItems(preset)); setPickupPreset(preset)`.
  - `:445` → `setAddItemOpen(true); setPickupPreset(null)`. Keep `:446` (`void refetchPickers()`).
  - `:551` → append `...(pickupPreset && { fromRequestId: pickupPreset.requestId })`.
  - `:553` → `invalidates: ['deployments', 'inventory', 'today']`.
  - `:571` → `setPendingItems(new Map()); setPickupPreset(null)`.
  - `:1044` (onClose) and `:1173` (Cancel) → also `setPickupPreset(null)`.
  - `:1046` → `<DialogContent>{pickupPreset && <PickupUnitsNote units={pickupPreset.units ?? []} />}`.
  - `:1047`, `:1052` → `availFor(i) > 0 || pendingItems.has(i.id)`.
  - `:1067` → `+ pickupHeld(pickupPreset, item.id, addItemSourceHubId)` on the consumable branch.
  - `:1176` → `(pendingItems.size === 0 && !pickupPreset) ||`.
  - State `wc -l` before and after in the PR body (after ≤ before).
- `src/app/(operator)/operator/requests/page.tsx:285-290` keeps `Staged at <hub> for pickup` (D11). It isn't touched.

### d.9 · Admin screens (`src/app/(admin)/admin/requests/page.tsx`)

- STAGED reservation card:
  - Directly after the label `Typography` (`:338-340`), a caption `Ready for pickup — the operator can collect it now.` (`success.main`).
  - The Fulfill button (`:474-477`) is deleted. Cancel (`:478-481`) stays.
  - MATERIAL `Mark Handled` is unchanged (D9).
- No new `listRequests` fields in P1-1d.
- `tests/components/copy-contract.test.tsx` rows:
  - `request.stage` effect → `action confirm: reservation → STAGED; stock held; on the owner's Today at once.`
  - `request.action` effect → `The generic lifecycle action (cancel).`

**Not touched:** MATERIAL requests; the hub portal (D21(b) — Mark staged inherits d.2 through `confirm`); `src/hooks/useOfflineQueue.ts`; `src/app/sw.ts`; `tests/offline/**`; cron step 7; the `release-hold` route (P1-1e); `src/lib/asset-references.ts` (its "release or fulfil" refusal text is reworded in P1-1e, once Return to stock exists).

### Tests — P1-1d

Node (CI) `tests/p1-1d-staged-ready.test.ts` (harness as `tests/pr5b-dead-ends.test.ts`; scenario steps from D3's `D3_scenario_p11c.test.ts`). CI's `db push` has no FK from lines to requests, so earlier tests' lines linger: scope every line query to the test's own request ids. Use a different operator for each Start (CR-14 refuses a second).
1. **Stage → hold → Pick Up.**
   - Stage 5 of 10 → STAGED, listed with `remainingQty` 5, `quantity` 10 / `reservedQty` 5 / held 5.
   - Start with `fromRequestId` and 5 → claimed once, 5/0/0, FULFILLED with `fulfilledAt`, `rigs.fromRequestId` stamped.
   - The hub portal's Mark staged gives the same STAGED listing.
2. **Partial pickup without naming it** (D3 step 2): Start with 2, no `fromRequestId` → 8/3, held 3, STAGED, listed ×3.
3. **Stage rules.**
   - Consumables and no hub → 409 with the NEEDS_HUB text, still REQUESTED, nothing reserved.
   - Every line DENIED → 409 with the NOTHING_CONFIRMED text.
   - A unit-only reservation with no hub stages, and its bell reads `Your reservation is ready for pickup.` and links to `/operator/dashboard`.
4. **Fulfill is gone:** admin `fulfill` on a staged reservation → 409, no change. MATERIAL fulfill is unchanged.
5. **Cancel.**
   - After a partial claim: only the unclaimed part is released; FULFILLED with `fulfilledAt` set.
   - With nothing collected: CANCELLED, `reservedQty` back.
   - `Promise.all(cancel, Pick Up)` → never 500; the stock equals one of the two serial outcomes.
   - A REQUESTED reservation at a hub whose consumable line is CONFIRMED but not staged → CANCELLED; that item's `reservedQty` at that hub is unchanged (another reservation's hold there stays whole); no line has `heldHubId` (BRR-1).
6. **Named units and vehicles.**
   - A VEHICLE line with `specificVehicleId` and no `resolvedVehicleId` → in `units` with its id. It closes when the vehicle joins through Add Vehicles.
   - A unit line (either `resolvedUnitId`, or EDITED with only `specificInventoryUnitId`) → in `units` with its `itemId`. It closes when started with it.
7. **"Any …" lines** (§0-h).
   - A `vehicleType: 'TRUCK'`-only line → `units: [{ kind: 'VEHICLE', id: null, itemId: null, name: 'Any truck' }]`.
   - Pick Up (Start with `fromRequestId`) with no truck → still STAGED. Then Add Vehicles of a truck, no pickup → FULFILLED.
   - Start with a truck and no `fromRequestId` → FULFILLED.
   - The deployment already has a truck when the reservation is staged → Add Items with `items: []` and `fromRequestId` → FULFILLED.
   - `requestedQty` 2 → one truck leaves it STAGED; a second → FULFILLED.
   - `vehicleType` null or `OTHER` → any vehicle counts. A trailer doesn't count for "Any truck".
   - "Any <item>" (EDITED serialized line, no unit): a unit of that item → FULFILLED; a unit of another item doesn't count. "Any <category>": a unit of an item in that category → FULFILLED; a category line for 3 consumables → FULFILLED once the deployment holds 3 of that category.
   - A consumable line substituted to a serialized item → not held, listed as `Any <substitute>`, FULFILLED once a unit of the substitute joins.
8. **The collected mark persists:** Pick Up without the named unit U (consumables claimed), then a later Add Items of U with no pickup → FULFILLED. A vehicle removed after its line was marked doesn't reopen it.
9. **Target taken by someone else** → still listed. Cancel → FULFILLED when consumables were claimed, CANCELLED when nothing was.
10. **Owner rule:** an admin-filed reservation (`forOperatorId=O`) → listed for O only; the admin's own draw of that item at that hub claims 0; the stage bell goes to O.
11. **Two reservations of the same item** (D3): Pick Up of the newer one → newer FULFILLED, older still STAGED and holding 3.
12. **Crew.**
    - A secondary's Pick Up of their own reservation through Add Items → claimed from their hold, `reservedQty` falls, FULFILLED.
    - A secondary's direct add of their own reserved item claims their hold.
13. **API-7 and empty lists.**
    - Another operator's `fromRequestId` is ignored: 201/200, nothing released, no stamp.
    - An operator with no pickable reservation: Start, Add Items and Add Vehicles succeed (no empty `Prisma.join`).
14. **Old rows.**
    - A historic FULFILLED reservation with a unit or vehicle line not on any deployment is **not** listed (D3).
    - A MATERIAL request with KIT_ITEM lines is never listed.
    - Replay of a pre-change Start body (`fromRequestId` of a FULFILLED holding row): one claim, one residual release; the same key returns the cached 201; a new key hits the CR-14 409 and nothing else changes.
15. **Migration** (pattern `tests/pr3c-delete-items.test.ts:318-338`).
    - Read the migration file and run each `UPDATE` statement on: a STAGED row with its held columns nulled (what the old code left); a hubless STAGED row; a STAGED row with `stockReservedAt` NULL; a STAGED row whose consumable line is substituted to a serialized item; a FULFILLED row.
    - Only the first gets held lines equal to `reservedQty`, plus a `holdExpiresAt`.
    - A second run updates 0 rows.
    - The converted row is listed, and Pick Up claims it.
16. **Stray row** (staged by the old code after the migration): an unrelated checkout leaves it STAGED with `reservedQty` unchanged; Cancel holds it first and releases its reserve.
17. **Next to step 7.**
    - A STAGED hold with an old `decidedAt` and a past `holdExpiresAt` is not released by the cron.
    - An older FULFILLED stale hold still is (P1-1e changes this case; see its Change list).
    - INV-3/INV-4 raise nothing for a fresh staged reservation (D3).
18. **Pick Up that drops everything** (claims 0) → residual released, CANCELLED.

UI `tests/components/p1-1d-staged-ready.test.tsx`:
- The card shows `Ready for Pickup` once, `Pick Up`, and `To collect: Truck 12, Any truck`. A payload with no `units` still renders.
- The builder seeds the held line, the unit (under its item) and the vehicle. Step 0 reads `To collect: GPS · #G1, Truck 12, Truck 7, Any truck. Add vehicles with Add Vehicles.` and `Not available now: Truck 7`.
- Held lines 3 + 1 of one item seed 4.
- Render the builder with `inventoryItems` already loaded (pickup hub `available` 3, held 5): the seed is 5 and the field allows up to 8. Switch to a hub with none of the item and back: still 5 (A5-9).
- Not pickable now: a seeded vehicle on another deployment isn't in the POST body; a seeded unit not in `availableUnits` isn't sent and is named in `Not available now: …`; an "Any <item>" entry whose item has no `availableUnits` is named there and doesn't disable Pick Up.
- Admin: a staged reservation card reads `Ready for pickup — the operator can collect it now.`, has no `Fulfill`, and keeps `Cancel`.

Change (name each in the PR):
- `tests/cc09-awaiting-pickup.test.ts`: helper `reserveAndFulfill` (`:51-65`) drops its `fulfill` line (stage is the hold). The two inline-SQL TTL tests (`:84-148`) seed their row FULFILLED by raw SQL, since step 7 still handles FULFILLED rows. `:178` drops `fulfill`. `:204` is renamed "returns a staged reservation with unclaimed holds".
- `tests/ur010-hold-through-claim.test.ts`: helper `:65` and `:275` drop `fulfill`. `:70` → "stage HOLDS the reserve and snapshots heldQty == reservedQty".
- `tests/step7-stale-hold-release.test.ts`: helper `:81` → stage, then raw `UPDATE … SET status='FULFILLED', "fulfilledAt"=<old>` (step 7 is unchanged).
- `tests/r4-hub-stock-reserve.test.ts`:
  - `:127` → stage snapshots the hold; `fulfill` → STATE_MISMATCH.
  - `:201` "skips reserve when no fulfillerHubId" → NEEDS_HUB, still REQUESTED, nothing reserved.
- `tests/uxp3-fulfill-notifies.test.ts:95`: a RESERVATION fulfill → 409, no notification.
- `tests/f3-line-checklist.test.ts:281-285`: title `Ready for pickup`, link `/operator/dashboard`; `/adjusted/` and `/denied/` kept.
- `tests/components/uxp3-admin-requests-handled.test.tsx:94` (D9 guard): a staged reservation card has **no** `Fulfill`; MATERIAL still shows `Mark Handled`, never `Fulfill`.
- `tests/components/pr5b-pickup-deployed.test.tsx`: extend it. The Add Items body carries `fromRequestId`, `invalidates` includes `today`, and with a preset of only `Any truck` the dialog reads `To collect: Any truck. Add vehicles with Add Vehicles.` and Continue is enabled with zero seeded items.
- `tests/components/copy-contract.test.tsx`: the two rows in d.9.
- Must pass unchanged: `tests/data-integrity.test.ts:55-106`, `tests/pr3c-delete-items.test.ts:98-135`, `tests/new3-request-for-operator.test.ts`, `tests/pr3a-status-writers-guard.test.ts`, `tests/cc31-alert-autoresolve.test.ts`.

### Acceptance — P1-1d (owner, app screens; throwaway data "ZZ P1-1 … (throwaway)")

Precondition: owner reads R1–R4 done, and R2 shows 0 rows (or they were cancelled). State the Active Deployments count. Use a test operator (not you) with no active deployment, logged in on a second browser.

1. Admin → Requests → New request → Reservation for the test operator at a hub: 2 × a throwaway consumable and a Truck by type. Open checklist → confirm → Stage.
   - Toast `Staged — ready for pickup.`
   - The card reads `Ready for pickup — the operator can collect it now.` and has no Fulfill.
2. **Not deployed.** The test operator's Today shows the card at once, chip once, `To collect: Any truck` → Pick Up → step 0 reads `To collect: Any truck. Add vehicles with Add Vehicles.` → tick a throwaway truck → Pick Up.
   - The deployment has the truck and 2 of the item.
   - Inventory → the hub's count dropped by 2, once.
   - Admin → Requests → Closed shows it Fulfilled.
3. **Now deployed.** A reservation naming a specific throwaway vehicle → Today `To collect: <vehicle>` → My Deployment → Add Vehicles → that vehicle → the request reads Fulfilled (no Pick Up needed).
4. **Still deployed.** A reservation for 1 × the consumable and a vehicle of a type the deployment doesn't have (e.g. Trailer) → Pick Up → Add Items opens seeded with 1 and reads `To collect: Any trailer. Add vehicles with Add Vehicles.` → Continue → Add Items → the card stays → Add Vehicles → a throwaway trailer → the request reads Fulfilled.
5. Stage two more throwaway reservations **for the test operator** (a consumable each) and **keep them** (don't pick them up). They are P1-1e's acceptance.
6. After the first cron tick: owner reads R5 and R6 → 0 rows (§6 says what to do otherwise). Any pair R4 listed may have raised INV-3 on that tick.

Clean up through the app, **except the two reservations from step 5** (P1-1e uses them).

### Behaviour changes — P1-1d (PR body)

- Staging makes a reservation pickable at once, including through the hub portal's Mark staged. Admin Fulfill is gone for reservations; an old cached tab's Fulfill gets 409.
- Reservations staged before the deploy were converted to holds (count R1). They are on their owners' Today now, with a fresh 7-day hold date. Older staged unit-, vehicle- or "Any"-only reservations (count R1b) appear on Today too, with no hold date, and close at the owner's next write once the deployment has that kind.
- A reservation closes when everything on it is collected:
  - **Fulfilled** if anything went out, **Cancelled** if nothing did.
  - Named units and vehicles: when they join the owner's deployment.
  - "Any …" lines: when the owner's deployment has enough of that kind, checked at every Start Deployment, Add Items, Add Vehicles and Pick Up. A truck already on the deployment counts.
  - Cancel after a partial pickup records Fulfilled, with its date.
  - A Pick Up that leaves everything behind records Cancelled.
- The Today card and both pickup builders read `To collect: …`; the builders add `Add vehicles with Add Vehicles.` when a vehicle is listed.
- Staging is refused with consumables and no hub, and when every line is denied. The portal shows its generic error for the second case. A hub sent in the PATCH body is ignored.
- The stage bell goes to the owner (`forOperatorId` when set), reads "Ready for pickup" and opens Today.
- An admin who filed a reservation for someone else no longer sees it on their own Today, and their own checkout no longer uses it.
- On a crew deployment, an add can use any crew member's hold at that hub. The Pick Up's own hold is used first.
- Staged holds are not released by the cron (as staged reserves weren't before). Older fulfilled holds still auto-release (step 7) until P1-1e. Until P1-1e, the card's "Held until" date has no effect on a staged hold.
- Items named on a reservation stay blocked for Delete/Retire (D46) until it is picked up or cancelled, not until an admin's Fulfill.
- The delete refusal "held for a reservation — release or fulfil it first" names an action that no longer exists until P1-1e rewords it.
- INV-3/INV-4 cover staged holds. A pair listed by R4 may raise INV-3 on the first tick.
- **Removed (disclosed):** the duplicate "Ready for Pickup" subtitle on the Today card.
- If the old cron ticks between the migration and the new revision, admins may get INV-3 and INV-4 alerts that clear on the next tick. An INV-4 from an old-revision Cancel in that window stays until R6's fix; an INV-3 stays while an R5 row is open.

### Interpretations — P1-1d

- **"Any …" lines** (§0-h): each line is checked on its own, so one truck satisfies two "Any truck" lines; nothing is allocated. The app doesn't check which unit or vehicle was taken for this reservation. A line with neither item nor category ("Any equipment") counts any equipment, counted quantities included. One truck can also close a named line and an "Any" line on two different reservations at once.
- **Category lines count everything of that category:** a unit counts 1, and counted equipment counts its quantity, so a category line asking for consumables completes too.
- **Counted lines** follow Stage's rule: the item is consumable, and so is its substitute if any. Any other KIT_ITEM line is a unit line, and "Any <item>" uses the effective item. So a consumable line substituted to a serialized item reads `Any <substitute>` and is collected by units of the substitute. A serialized line with a consumable substitute (the hub screen doesn't offer one) can't be collected; Cancel closes it.
- **Where a target counts:** on this deployment at a checkout write or Pick Up. A target already on the deployment before staging reads "To collect" until the next write on that deployment, or a Pick Up with nothing to add (A5-16c).
- **Units arriving another way:** a unit that reaches the deployment through a transfer is collected at the next write on that deployment.
- **Add Items builder (my-deployment):** to keep D21, it doesn't get the Not-available check. A seeded unit taken meanwhile gets the existing 409 reselect path; an "Any <item>" entry with no unit to pick can be unticked.
- **Cancel rights:** unchanged. Only the requester can cancel, not the `forOperatorId` (`[id]/route.ts:60-63`, CC-31 item 4).
- **Today's "My requests" summary** still lists the staged request with its Staged chip, next to its pickup card (unchanged).

### Rollback — P1-1d

Add to `PILOT_ROLLBACK.md` **in the code PR** (so the note is on `development` before the deploy runs), under §1, after P1-1c's note, as one **P1-1d (staged means ready, migration `<ts>_p1_1d_staged_ready`)** paragraph with these points and owner read R7 copied in:
- The migration is additive, and the old revision ignores `collectedAt`. Staged holds look to the old code like staged reserves waiting for its Fulfill.
- After rolling back, staged reservations drop off Today again until an admin clicks Fulfill (the old flow).
- While rolled back, the old INV-4 (`status <> 'FULFILLED'`) lists every staged hold as an orphan on every tick, and the old INV-3 may fire for item/hub pairs that mix staged and fulfilled holds. Expected; they clear after rolling forward. An old-revision Cancel while rolled back leaves the R6 state: after rolling forward, run R6 and its fix.
- The old Add Items refuses a queued `items: []` Pick Up (400, which the queue drops). The operator taps Pick Up again after rolling forward.
- **One hazard: a staged reservation that was partly picked up.**
  - Under the old code, Fulfill would reset `claimedQty` to 0, which allows a second claim.
  - Cancel would release the full reserve, an over-release that is floored at 0 and surfaces later as `HOLD_INVARIANT_BREACH`.
- **Before routing traffic back:**
  1. Run owner read R7.
  2. Cancel each row it lists in Admin → Requests **on the new revision** (new Cancel keeps what was taken and records Fulfilled).
  3. Then roll back.

---

## P1-1e · Expired holds (server + UI + one additive migration)

**Goal.** §0-i/q. No auto-release. Admins decide on an expired hold, and the owner is told at each step.

### e.1 · Migration `prisma/migrations/<YYYYMMDDHHMMSS>_p1_1e_reservation_hold_expired/migration.sql`

- `ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'RESERVATION_HOLD_EXPIRED';`, alone in the file (precedent `20260711000000_add_inventory_drift_alert_type`). It passes `check-migration-safety.sh` (A6, verified). Use a timestamp later than P1-1d's.
- `prisma/schema.prisma` `enum AlertType` (~`:157`): add the value.

### e.2 · One hold rule (`src/lib/deployment-requests.ts`, next to d.0)

```ts
// The hold's end: its own date, or 168 h after it became ready (older rows with no date; BR-30).
export const HOLD_ENDS_AT = Prisma.sql`COALESCE(r."holdExpiresAt", COALESCE(r."fulfilledAt", r."decidedAt") + interval '168 hours')`
export const holdExpiredSql = (now: Date) => Prisma.sql`(r."requestType" = 'RESERVATION'
  AND r."status" IN ('STAGED','FULFILLED') AND ${HOLDING} AND ${HOLD_ENDS_AT} < ${now})`
```

Export `HOLDING` too. The evaluator, `listRequests`, Today, the PATCH guards and owner read R8 all use this one rule (A6-2, A7-4, B6-2). The client never compares dates.

### e.3 · Alert: evaluator, registries, owner bell

- **Evaluator** `reservationHoldExpired` in `src/lib/alert-evaluators.ts` (D45: it owns both raise and clear; A6-7):
  - `type 'RESERVATION_HOLD_EXPIRED'`, `sourceTable 'deployment_requests'`, so it matches the action-side resolve.
  - `candidates(ctx)` = rows matching `holdExpiredSql(ctx.now)`. `load(id)` = the same select by id, unfiltered.
  - `live` = RESERVATION, status STAGED/FULFILLED, and `HOLDING`. `evaluate` = `holdEndsAt < ctx.now ? 'RAISE' : 'CLEAR'`.
  - `metadata` = `{ itemName: label ?? 'Reservation', operatorName: <owner's name>, ownerId, hubName, holdUntil: businessDate(holdEndsAt) }`.
  - Append it to `EVALUATORS` (`:276-279`). Add a line to the header comment (`:10-41`) naming the evaluator-owned types, RESERVATION_HOLD_EXPIRED included (Cancel, Return to stock and Extend also clear it at once).
- **`src/lib/alert-display.ts`:**
  - `ALERT_LABELS` (`:8`): `RESERVATION_HOLD_EXPIRED: 'Reservation hold ended'`.
  - `alertLink` (`:58`, next to MATERIAL_REQUEST): `'/admin/requests'` (owner decision: no `?id=`).
  - `SELF_CLEARING_ALERT_TYPES` (`:71-81`): add the type.
- **`presentAlert`** (`src/lib/notifications.ts:54`, after MATERIAL_REQUEST):
  - ``${operatorName}'s reservation at ${hubName ?? 'the hub'}: the hold ended ${formatDay(holdUntil)}. Return it to stock or extend it.``
  - Without `operatorName`: ``A reservation at ${hubName ?? 'the hub'}: the hold ended ${formatDay(holdUntil)}. Return it to stock or extend it.``
  - The dashboard's own context line reads `itemName` / `operatorName`, so it needs no edit (A6-6, B6-6).
- **Not configurable:** don't add it to `CONFIGURABLE_ALERT_TYPES` (`src/app/api/admin/notification-config/route.ts:8-18`). Its PATCH schema (`z.enum(CONFIGURABLE_ALERT_TYPES)`) then can never store it as disabled (A6-3, A7-14; D3-8 moot).
- **The owner is told** (owner decision). In `dispatchPendingAlerts` (`src/lib/notifications.ts:116-131`, the `createMany` at `:117`), in the same claim transaction, add one more row when `alert.type === 'RESERVATION_HOLD_EXPIRED'` and `meta.ownerId` isn't already one of the admins:
  - `{ userId: ownerId, type: alert.type, title: 'Hold ended', body: \`Your reservation at ${hubName ?? 'the hub'}: the hold ended ${formatDay(holdUntil)}. Pick it up, or ask an admin to extend it.\`, link: '/operator/requests', alertId }`.
  - The existing `skipDuplicates` on `(alertId, userId)` keeps it at one row per raise.

### e.4 · Cron: delete step 7 (`src/app/api/cron/dispatch/route.ts`)

- Delete `:126-181` (the whole step 7), the import at `:8`, and `holdsReleased` in the return value (`:516`). `HOLD_TTL_HOURS` becomes dead; it is not set in the Makefile or workflows (A6-8, A7-23).

### e.5 · Return to stock · Extend (`src/lib/deployment-requests.ts`, `src/app/api/deployment-requests/[id]/route.ts`)

- **State machine.**
  - `RequestAction` (`:24`) gains `'release-to-stock' | 'extend-hold'`. `TransitionExtra` (`:56-60`) gains `holdUntil?: string`.
  - `TransitionResult` codes gain `'NOT_HOLDING' | 'SAME_DAY'`.
  - Both cases first lock: `SELECT 1 FROM "deployment_requests" r WHERE r."id" = $1 AND r."requestType"='RESERVATION' FOR UPDATE OF r` (no row → NOT_HOLDING). **Then, in a second statement**, read status, `HOLDING`, owner and hub, and re-check STAGED/FULFILLED and `HOLDING` → else NOT_HOLDING. One statement would read the lines from before a Pick Up that held the lock committed. Lock order is request first (A5-12).
  - `release-to-stock`:
    1. `releaseAllHeldForRequest(id, tx)`.
    2. `UPDATE "deployment_requests" r SET ${CLOSE_SET}, "decisionNote" = CASE WHEN ${HOLD_ENDS_AT} < now() THEN 'Hold expired — returned to stock.' ELSE 'Returned to stock.' END WHERE r."id" = ${id}`. Same close rule as d.3 (A5-11, A6-9).
    3. Bell to the owner: title `Reservation returned to stock`, body ``Your reservation at ${hubName ?? 'the hub'} was returned to stock.``, link `/operator/requests?tab=closed`.
  - `extend-hold`:
    1. `UPDATE "deployment_requests" SET "holdExpiresAt" = ${endOfBusinessDay(holdUntil)} WHERE "id" = $1 AND "holdExpiresAt" IS DISTINCT FROM ${…}`. 0 rows → SAME_DAY, so a replay never re-bells (A6-4).
    2. Bell to the owner: title `Reservation hold extended`, body ``Your reservation at ${hubName ?? 'the hub'} is held until ${formatDay(holdUntil)}.``, link `/operator/requests`.
- **Wrapper** (`applyRequestTransition`, `:617-619`): on `result.ok` for `cancel`, `release-to-stock` or `extend-hold`, run `await resolveActiveAlert('RESERVATION_HOLD_EXPIRED','deployment_requests',id).catch(() => {})`. The alert then clears at once on any of the three (A6-4(5), CR-39). Only use `resolveActiveAlert` (the D45 CHECK). A Pick Up is not a transition: after one, the evaluator clears the alert on the next cron pass.
- **PATCH route:**
  - `ADMIN_ONLY_ACTIONS` (`:13`) and the zod enum (`:16`) gain both actions. Operators get 403, even on their own request (A6-4(1), A6-15a).
  - The schema gains `holdUntil: z.string().optional()`.
  - Before the transition, for `extend-hold`: a missing date, a date that isn't real, or `holdUntil <= businessDate()` (a string compare) → 400 `{ error: 'Pick a date after today.' }`. Real date: ``const t = Date.parse(`${d}T00:00:00Z`); const real = /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d`` (`2026-02-30`, `2026-13-01`, `tomorrow` and `''` all fail with the sentence, never a 500).
  - Map NOT_HOLDING → 409 `This reservation no longer holds any stock.` and SAME_DAY → 409 `The hold already ends on that day.`
- **`src/app/api/deployment-requests/[id]/release-hold/route.ts:17`:** the body becomes `applyRequestTransition(id, 'release-to-stock', 'RESERVATION')`. Return `{ ok: true }`, or 409 with the NOT_HOLDING text. One pipeline, and the URL is kept (A6-10, A7-3, A5-16a).

### e.6 · Time (`src/lib/business-date.ts`)

Add `endOfBusinessDay(day: string, tz: string = appTimezone()): Date`, the last millisecond of that business day in APP_TIMEZONE. It is DST-safe and has no hard-coded zone (§0-q, A6-5). Verified: `2026-11-02` Central → `2026-11-03T05:59:59.999Z`, `2026-10-30` → `2026-10-31T04:59:59.999Z`, `2026-11-01` (DST end) → `2026-11-02T05:59:59.999Z`, `2026-10-30` Eastern → `2026-10-31T03:59:59.999Z`.

```ts
const offsetAt = (t: number, tz: string) => {
  const p = businessDateTime(new Date(t), tz); const [y, m, d] = p.date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!, p.hour, p.minute) - Math.floor(t / 60_000) * 60_000
}
export function endOfBusinessDay(day: string, tz: string = appTimezone()): Date {
  const [y, m, d] = day.split('-').map(Number)
  const next = Date.UTC(y!, m! - 1, d! + 1)                   // next local midnight, read as UTC
  return new Date(next - offsetAt(next - offsetAt(next, tz), tz) - 1) // two passes: DST-safe
}
```

Days shown to people are always `businessDate(instant)` computed **on the server**, then formatted with P1-1b's `formatDay`. That fixes B6-5's next-day display on an Eastern phone.

### e.7 · Admin screen

- **`listRequests`** (`src/lib/deployment-requests.ts`, both branches, `:168-203`): add `${holdExpiredSql(new Date())} AS "holdExpired"` and `CASE WHEN ${HOLDING} THEN ${HOLD_ENDS_AT} END AS "holdEndsAt"`. Map each row to add `holdUntil = holdEndsAt ? businessDate(holdEndsAt) : null`. `RequestRow` (same file, `:113-136`) gains both fields. `getRequest` is unchanged: no screen reads hold fields from it.
- **Page** (`src/app/(admin)/admin/requests/page.tsx`):
  - `ReqRow` (`:35-49`) gains `holdExpired?: boolean; holdUntil?: string | null`.
  - One helper, `isClosed(r) = TERMINAL.has(r.status) && !r.holdExpired`, replaces the TERMINAL checks at `:288` (card) and `:618` (tab filter). An expired FULFILLED row is then on Active and has its buttons (A6-1, BR-4).
  - On Active, the `filtered` rows with `holdExpired` render first under an overline `Needs a decision` (then a Divider, then the rest).
  - Such a card shows:
    - a caption `Hold ended ${formatDay(holdUntil)}` (`error.main`), and not d.9's green `Ready for pickup` caption;
    - actions `Return to stock` (contained, `action('release-to-stock', undefined, copy('request.releaseToStock').success(owner))`) and `Extend…` (outlined);
    - **no Cancel**: one decision, two buttons (A6-9).
  - `owner` = `forOperatorName ?? requestedByName`.
  - `ExtendHoldDialog`:
    - title `Extend the hold`;
    - `TextField type="date"` labelled `Hold until`, empty to start, no new dependency;
    - button `Extend`;
    - server errors shown in the dialog;
    - success toast `copy('request.extendHold').success(formatDay(day), owner)`.
- No `?id=` reader (owner decision; A7-13, B6-16). The alert links to `/admin/requests`, and the group is at the top.

### e.8 · Operator card (`src/components/shared/AwaitingPickupCard.tsx`)

- `getAwaitingPickupForOperator` adds, in its request query, `CASE WHEN ${HOLDING} THEN ${HOLD_ENDS_AT} END AS "holdEndsAt"` and `(${HOLDING} AND ${HOLD_ENDS_AT} < now()) AS "holdEnded"`. It returns `holdUntil` (the server's `businessDate(holdEndsAt)`, or null when nothing is held) and `holdEnded`. Both are optional in the client type.
- `:73-82`:
  - `holdEnded` → `Hold ended ${formatDay(holdUntil)} — pick it up or ask an admin to extend it.`
  - Else, with `holdUntil` → `Held until ${formatDay(holdUntil)}`.
  - `holdUntil: null` (nothing held, e.g. a unit-only reservation) → no hold line.
  - Only a payload without the `holdUntil` key (cached by an older revision) falls back to today's `formatDate(holdExpiresAt)`.
  - The amber "within 24 h" stays, based on the instant.
- Fix the comment at `:8-9`: nothing is lost automatically any more (A6-13, A7-21).

### e.9 · Copy

- **`src/lib/copy/admin-actions.ts`:**
  - `'request.releaseToStock': { success: (name: string | null) => \`Returned to stock — ${name ?? 'the operator'} notified\` }`
  - `'request.extendHold': { success: (day: string, name: string | null) => \`Held until ${day} — ${name ?? 'the operator'} notified\` }`
  - Each gets a `copy-contract` row on `PATCH /api/deployment-requests/[id]`:
    - `action release-to-stock: unclaimed holds released; Fulfilled if anything was collected, else Cancelled; owner notified; alert cleared.`
    - `action extend-hold: hold runs to the end of the picked business day; alert cleared; owner notified.` (A6-14)
- **`src/lib/asset-references.ts`** (an unexpired staged hold has only Cancel; Return to stock shows on expired holds):
  - `:285` and `:298`: `… held for a reservation — cancel it or return it to stock on Requests first.`
  - `:310`: `${name} has ${held} held for reservations — cancel them or return them to stock on Requests first.`
  - Update `tests/pr3c-delete-items.test.ts:126`.

**Not touched:** Settings (the caption `Operator PIN-lock alerts always notify and aren't listed.` is still true); `useOfflineQueue.ts`; the hub portal; P1-1d's collection logic; my-deployment.

### Tests — P1-1e

Node `tests/p1-1e-expired-holds.test.ts` (D3 scenario steps 3–7, then A6-15):
1. **Lifecycle.**
   - Stage 5, partial pickup 2 (8/3), then expire it (raw `holdExpiresAt` in the past). `getAwaitingPickupForOperator` returns it with `holdEnded: true` and `holdUntil`.
   - The real cron → exactly one alert, nothing released (8/3/held 3), no INVENTORY_DRIFT. A second cron pass → still one alert, one bell per admin and one owner bell (A6-15b).
   - `extend-hold` +3 days → 200, the alert clears at once, the date moves, stock is untouched, and the next pass doesn't re-raise.
   - Expire again → a **new** alert.
   - `release-to-stock` → 8/0/held 0, FULFILLED, alert cleared, not listed.
   - Then both actions → 409 (A6-15c).
2. **Older FULFILLED row** (`holdExpiresAt` NULL, fulfilled 10 days ago, holding 4): the cron raises one alert and releases nothing. `listRequests()` returns it with `holdExpired: true` and `holdUntil` = the server's business day of `fulfilledAt + 168 h`. `release-to-stock` → reserved 0, **CANCELLED** (nothing was ever claimed).
3. **The alert clears with no admin action:** at once on an operator or admin Cancel. After a Pick Up it clears on the next cron pass (run the cron in the test).
4. **Who may act:** an operator gets 403 on both actions, even on their own request.
5. **Dates.** `holdUntil` that is today or earlier, or isn't a real date (`2026-02-30`) → 400 `Pick a date after today.` A replayed `extend-hold` → 409 `The hold already ends on that day.` with no second bell (A6-15e).
6. **Bells.** On an admin-filed reservation the owner bell (raise, return, extend) goes to `forOperatorId` (A6-15d). An owner who is an admin gets one row, not two.
7. **`release-to-stock` racing a Pick Up** (`Promise.all`, 20 runs) → no 500, INV-3 clean afterwards, the status is one of the two serial outcomes, and a 409 writes no bell (A6-15i, S5-3). The same for `extend-hold`.
8. **`release-hold` route:** routes through the same transition; 409 when nothing is held.
9. **Nothing held:** a STAGED unit-only reservation 8 days after Stage → `holdUntil: null`, `holdEnded: false`, no alert.

Pure tests:
- In `tests/pr4-evaluators.test.ts`, a `describe('RESERVATION_HOLD_EXPIRED')` (RAISE past the date, CLEAR after an extend, out of the population once nothing is held). The self-clearing test (`:96-104`) also asserts `for (const ev of EVALUATORS) expect(SELF_CLEARING_ALERT_TYPES.has(ev.type)).toBe(true)`.
- `presentAlert` text and `alertLink` → `/admin/requests` (A6-15g).
- `tests/fnd7-business-date.test.ts` gains the four `endOfBusinessDay` instants in e.6, plus one with `APP_TIMEZONE='America/New_York'`, which proves it follows the env (A6-15f).

UI `tests/components/p1-1e-expired-holds.test.tsx`:
- An expired **FULFILLED** row is on Active under `Needs a decision`, with `Hold ended <day>`, `Return to stock`, `Extend…`, and no Cancel (A6-15h).
- An expired **STAGED** card shows `Hold ended <day>` and not `Ready for pickup — the operator can collect it now.`
- `Return to stock` sends `{ action: 'release-to-stock' }`.
- `Extend…` opens with an empty date and sends `{ action: 'extend-hold', holdUntil }`.
- A 400 shows in the dialog.
- The operator card reads `Hold ended … — pick it up or ask an admin to extend it.` when `holdEnded`, and shows no hold line when `holdUntil` is null.

Change:
- `tests/step7-stale-hold-release.test.ts` is rewritten (it already mocks `createAlert`): after the cron, `releasedAt` is NULL, `reservedQty` is unchanged, and `createAlert` was called with `('RESERVATION_HOLD_EXPIRED','deployment_requests', id, objectContaining({ hubName }))`. Its NULL-date fixture uses `fulfilledAt` older than 168 h.
- Delete `tests/cc09-awaiting-pickup.test.ts:84-148` (inline copies of the deleted step-7 query), the two helpers left unused (`setFulfilledAtInPast`, `markFulfilled`), and the header's acceptance #3 line.
- `tests/p1-1d-staged-ready.test.ts` test 17: the cron releases nothing, staged or older fulfilled (6 / held 6); INV-3 and INV-4 stay quiet.
- Also change: `tests/components/copy-contract.test.tsx` (two new rows), `tests/pr3c-delete-items.test.ts:126`, `tests/pr4-evaluators.test.ts:96-104`.

### Acceptance — P1-1e (owner, app screens)

If P1-1e merges ≥ 7 days after P1-1d's acceptance step 5:
1. After the deploy's first cron tick:
   - The admin dashboard shows "Reservation hold ended".
   - The bell → Admin → Requests: the two kept reservations sit at the top of Active under `Needs a decision`, each with `Hold ended <day>`, `Return to stock` and `Extend…`.
   - The test operator's bell (log in as them) reads "Hold ended".
2. First one → `Extend…` → a date next week → toast `Held until <day> — <name> notified`.
   - The card leaves the group, and the alert clears.
   - The test operator's bell reads "Reservation hold extended", and their Today card reads `Held until <day>`.
3. Second one → `Return to stock` → toast `Returned to stock — <name> notified`.
   - Inventory → that hub's available count is back up.
   - The request reads Cancelled on the Closed tab.
   - The test operator's bell reads "Reservation returned to stock".

If it merges sooner: on merge day rely on the node tests, and run the same rows as a dated follow-up once the kept reservations pass 7 days.

Clean up through the app (Return to stock the extended one).

### Behaviour changes — P1-1e (PR body)

- Holds are never released automatically, staged or fulfilled. An expired hold keeps its stock reserved, and keeps its item undeletable and its hub undeactivatable, until an admin returns it to stock or extends it (A6-17).
- Holds with no date of their own now alert 168 h after they became ready. Before, they released at 72 h (A6-8).
- At deploy, every staged hold older than 7 days alerts at once (count R8), because nothing expired staged holds under P1-1d.
- Return to stock on an older fulfilled reservation where nothing was claimed records **Cancelled**. Its history changes from Fulfilled (D3-11).
- The hold-ended alert can't be switched off in Settings.
- The delete refusal now reads "cancel it or return it to stock on Requests first".
- The cron's JSON loses `holdsReleased`.

### Rollback — P1-1e (add to `PILOT_ROLLBACK.md` in the code PR, under §1 after P1-1d's note, as one **P1-1e** paragraph; A6-12 order)

1. `DELETE FROM "alerts" WHERE "type" = 'RESERVATION_HOLD_EXPIRED';` An older revision can't read the value, and both its dispatch and `/api/admin/alerts` fail on the row. Notification rows have no FK to the alert.
2. Roll traffic back.
3. Run the same DELETE again: the new revision's cron may have re-raised one.

The old step 7 then resumes releasing fulfilled holds once they are both 72 h old and past their hold date. It respects extended dates. Staged holds stay held, as under P1-1d. No Settings step is needed: the type was never configurable (D3-8).

---

## 5 · Gate

The P1-1 base gate (`AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md` §5) applies, plus:

- **P1-1d:**
  - `scripts/check-migration-safety.sh "origin/development"` must run **after** the commit. It diffs `BASE...HEAD`, so run before a commit it reports a false "no migrations" (D3).
  - `grep -rn "releaseReservedStock" src` → 0.
  - `grep -c "action('fulfill'" "src/app/(admin)/admin/requests/page.tsx"` → 1 (MATERIAL `Mark Handled` only).
  - `grep -rn "To collect:" src` → ≥ 1.
  - `grep -n 'requestedById" = ${operatorId} OR' src/lib/deployment-requests.ts` → 0.
  - `grep -n "collectedAt" prisma/schema.prisma` → 1.
  - `grep -n "HOLD_TTL_HOURS" src/app/api/cron/dispatch/route.ts` → ≥ 1 (step 7 still there).
  - my-deployment `wc -l` after ≤ before.
- **P1-1e:**
  - Migration safety, after the commit.
  - `grep -n "RESERVATION_HOLD_EXPIRED" prisma/schema.prisma src/lib/alert-display.ts src/lib/notifications.ts src/lib/alert-evaluators.ts` → each ≥ 1.
  - `grep -n "RESERVATION_HOLD_EXPIRED" src/app/api/admin/notification-config/route.ts` → 0.
  - `grep -rnE "(^|[^_])HOLD_TTL_HOURS|holdsReleased" src` → 0 (the `[^_]` keeps `PICKUP_HOLD_TTL_HOURS`, which stays).
  - `grep -rn "release or fulfil" src` → 0.

## 6 · Owner reads (Supabase SQL Editor; read-only except R6-fix)

"Counted line" below is d.0's `CONSUMABLE_LINE`: the item is consumable, and so is its substitute if any.

Before P1-1d:
```sql
-- R1 · staged reservations the migration converts to holds. Every STAGED reservation appears on its owner's Today at deploy.
SELECT count(*) AS converted_at_deploy FROM deployment_requests r
WHERE r."requestType" = 'RESERVATION' AND r.status = 'STAGED'
  AND r."fulfillerHubId" IS NOT NULL AND r."stockReservedAt" IS NOT NULL
  AND EXISTS (SELECT 1 FROM deployment_request_lines l JOIN inventory_items ci ON ci.id = l."specificInventoryItemId"
              WHERE l."requestId" = r.id AND l."lineType" = 'KIT_ITEM' AND l."fulfillmentStatus" IN ('CONFIRMED','EDITED')
                AND l."heldHubId" IS NULL AND ci."itemType" = 'CONSUMABLE'
                AND COALESCE((SELECT cs."itemType" FROM inventory_items cs WHERE cs.id = l."substitutedItemId"), ci."itemType") = 'CONSUMABLE');
-- R1b · staged reservations with no counted line that also appear on Today at deploy (unit, vehicle or "Any" lines only)
SELECT count(*) FROM deployment_requests r
WHERE r."requestType" = 'RESERVATION' AND r.status = 'STAGED'
  AND EXISTS (SELECT 1 FROM deployment_request_lines l WHERE l."requestId" = r.id
              AND l."lineType" IN ('KIT_ITEM','VEHICLE') AND l."fulfillmentStatus" IN ('CONFIRMED','EDITED'))
  AND NOT EXISTS (SELECT 1 FROM deployment_request_lines l JOIN inventory_items ci ON ci.id = l."specificInventoryItemId"
              WHERE l."requestId" = r.id AND l."lineType" = 'KIT_ITEM' AND l."fulfillmentStatus" IN ('CONFIRMED','EDITED')
                AND ci."itemType" = 'CONSUMABLE'
                AND COALESCE((SELECT cs."itemType" FROM inventory_items cs WHERE cs.id = l."substitutedItemId"), ci."itemType") = 'CONSUMABLE');
-- R2 · STAGED reservations to Cancel in Admin → Requests before merging. Expect 0 rows.
--      Counted lines with no hub, or never reserved (staged before reserves existed), or nothing confirmed.
--      Cancel releases nothing for them, which is right: they reserved nothing.
SELECT r.id, r.label, r."fulfillerHubId" IS NULL AS no_hub, r."stockReservedAt" IS NULL AS never_reserved
FROM deployment_requests r
WHERE r."requestType" = 'RESERVATION' AND r.status = 'STAGED' AND (
  ((r."fulfillerHubId" IS NULL OR r."stockReservedAt" IS NULL)
    AND EXISTS (SELECT 1 FROM deployment_request_lines l JOIN inventory_items ci ON ci.id = l."specificInventoryItemId"
                WHERE l."requestId" = r.id AND l."lineType" = 'KIT_ITEM' AND l."fulfillmentStatus" IN ('CONFIRMED','EDITED')
                  AND ci."itemType" = 'CONSUMABLE'
                  AND COALESCE((SELECT cs."itemType" FROM inventory_items cs WHERE cs.id = l."substitutedItemId"), ci."itemType") = 'CONSUMABLE'))
  OR NOT EXISTS (SELECT 1 FROM deployment_request_lines l WHERE l."requestId" = r.id
                 AND l."lineType" IN ('KIT_ITEM','VEHICLE') AND l."fulfillmentStatus" IN ('CONFIRMED','EDITED')));
-- R3 · REQUESTED reservations with consumable lines and no hub (information). Stage will refuse them; decline each when it comes up.
SELECT count(*) FROM deployment_requests r
WHERE r."requestType" = 'RESERVATION' AND r.status = 'REQUESTED' AND r."fulfillerHubId" IS NULL
  AND EXISTS (SELECT 1 FROM deployment_request_lines l JOIN inventory_items ii ON ii.id = l."specificInventoryItemId"
              WHERE l."requestId" = r.id AND l."lineType" = 'KIT_ITEM' AND ii."itemType" = 'CONSUMABLE');
-- R4 · item/hub pairs whose reserve won't equal their holds after the conversion (information). Expect 0;
--      each pair listed may raise INV-3 on the first tick after the deploy.
WITH h AS (
  SELECT COALESCE(l."substitutedItemId", l."specificInventoryItemId") AS "itemId", r."fulfillerHubId" AS "hubId",
         COALESCE(l."fulfilledQty", l."requestedQty") AS q
  FROM deployment_request_lines l JOIN deployment_requests r ON r.id = l."requestId"
  JOIN inventory_items ci ON ci.id = l."specificInventoryItemId"
  WHERE r."requestType" = 'RESERVATION' AND r.status = 'STAGED' AND r."fulfillerHubId" IS NOT NULL
    AND r."stockReservedAt" IS NOT NULL AND l."lineType" = 'KIT_ITEM' AND l."fulfillmentStatus" IN ('CONFIRMED','EDITED')
    AND l."heldHubId" IS NULL AND ci."itemType" = 'CONSUMABLE'
    AND COALESCE((SELECT cs."itemType" FROM inventory_items cs WHERE cs.id = l."substitutedItemId"), ci."itemType") = 'CONSUMABLE'
  UNION ALL
  SELECT l."heldItemId", l."heldHubId", l."heldQty" - l."claimedQty"
  FROM deployment_request_lines l JOIN deployment_requests r ON r.id = l."requestId"
  WHERE l."releasedAt" IS NULL AND l."heldQty" > l."claimedQty" AND r.status IN ('STAGED','FULFILLED'))
SELECT h."itemId", h."hubId", sum(h.q) AS held, COALESCE(max(s."reservedQty"), 0) AS reserved
FROM h LEFT JOIN inventory_stock s ON s."itemId" = h."itemId" AND s."hubId" = h."hubId"
GROUP BY 1, 2 HAVING sum(h.q) <> COALESCE(max(s."reservedQty"), 0);
```
After P1-1d's deploy, after the first cron tick:
```sql
-- R5 · reservations the old revision staged in the deploy window (still unconverted). Expect 0 rows.
SELECT r.id, r.label FROM deployment_requests r
WHERE r."requestType" = 'RESERVATION' AND r.status = 'STAGED'
  AND r."fulfillerHubId" IS NOT NULL AND r."stockReservedAt" IS NOT NULL
  AND EXISTS (SELECT 1 FROM deployment_request_lines l JOIN inventory_items ci ON ci.id = l."specificInventoryItemId"
              WHERE l."requestId" = r.id AND l."lineType" = 'KIT_ITEM' AND l."fulfillmentStatus" IN ('CONFIRMED','EDITED')
                AND l."heldHubId" IS NULL AND ci."itemType" = 'CONSUMABLE'
                AND COALESCE((SELECT cs."itemType" FROM inventory_items cs WHERE cs.id = l."substitutedItemId"), ci."itemType") = 'CONSUMABLE');
-- R6 · held lines left open on a closed reservation (an old-revision Cancel in the deploy window). Expect 0 rows.
--      If it lists rows, keep this output: R6-fix and its undo use these line ids.
SELECT l.id AS line_id, r.id AS request_id, r.status, r."stockReservedAt"
FROM deployment_requests r JOIN deployment_request_lines l ON l."requestId" = r.id
WHERE r."requestType" = 'RESERVATION' AND r.status NOT IN ('STAGED','FULFILLED')
  AND l."releasedAt" IS NULL AND l."heldQty" > l."claimedQty";
```
- **If R5 lists rows:** Cancel each in Admin → Requests (Cancel holds it first, so the right stock goes back) and ask its requester to send it again.
- **If R6 lists rows:** the old Cancel already returned the stock (`stockReservedAt` is empty), so only the line marks are wrong. Run R6-fix once, pasting R6's `line_id` values. If any row shows a `stockReservedAt`, don't run it; ask first. The INV-4 alert clears on the next cron tick.
```sql
-- R6-fix (a write) · mark R6's lines released. Stock is not touched.
UPDATE deployment_request_lines SET "releasedAt" = now()
WHERE id IN ('<line_id>', '<line_id>') AND "releasedAt" IS NULL AND "heldQty" > "claimedQty";
-- R6-fix undo (the same line ids, from R6's saved output):
UPDATE deployment_request_lines SET "releasedAt" = NULL WHERE id IN ('<line_id>', '<line_id>');
```
Before rolling traffic back past P1-1d:
```sql
-- R7 · partly picked-up staged reservations: Cancel each on the NEW revision first
SELECT r.id, r.label FROM deployment_requests r WHERE r."requestType" = 'RESERVATION' AND r.status = 'STAGED'
  AND EXISTS (SELECT 1 FROM deployment_request_lines l WHERE l."requestId" = r.id AND l."claimedQty" > 0);
```
Before P1-1e:
```sql
-- R8 · alerts that appear on deploy (one per row): the e.2 rule
SELECT r.status, count(*) FROM deployment_requests r
WHERE r."requestType" = 'RESERVATION' AND r.status IN ('STAGED','FULFILLED')
  AND EXISTS (SELECT 1 FROM deployment_request_lines l WHERE l."requestId" = r.id AND l."releasedAt" IS NULL AND l."heldQty" > l."claimedQty")
  AND COALESCE(r."holdExpiresAt", COALESCE(r."fulfilledAt", r."decidedAt") + interval '168 hours') < now()
GROUP BY 1;
```

## 7 · Merge and close

As P1-1 §7 (owner's go, D48, deploy watch, smoke, one docs-only commit), plus:
- **P1-1d's deploy window:** between the merge and `/api/health` showing the new revision, don't stage or cancel reservations.
- **Decisions:**
  - P1-1a's branch appends **D50** (PROPOSED) together with D51 and D52 (main §7). Its text is below.
  - P1-1d's docs commit adds, under D50, the dated line `P1-1d #<n> live <date> (revision <rev>): staged = ready; expiry still pending P1-1e.` It adds the D9 qualifier below. (Main §7 already adds this packet's `00_START_HERE.md` row.)
  - P1-1e's docs commit flips D50 to ACTIVE, with a dated line.
- **Owner, optional:** after P1-1e merges, a short note to admins and operators in the style of `AHITS_WHATS_CHANGED_2026-10.md` (admin Fulfill gone, "Any …" lines, Cancel after a partial pickup reads Fulfilled, "Needs a decision", no auto-release). No new repo doc in these PRs.

**D50 text** (house format; P1-1a's branch appends it):

```markdown
### D50 · A staged reservation is ready for pickup; expired holds wait for an admin
- **Date:** decided 2026-10-22/25, recorded <date> · **Owner:** Max · **Status:** PROPOSED (ACTIVE when P1-1e merges) · **Amends:** D9 (the flow, not its words) · **Read-with:** D9, D11, D21, D45, D46, `src/lib/deployment-requests.ts`, `AHITS_PACKET_P1-1de_RESERVATIONS_2026-10-25.md`
- **Decision:** <§0 rows g, h, i, o, p and q of the reservations packet, verbatim, one bullet each>
- **Also decided (2026-10-25):** on a crew deployment, an add may use any crew member's hold at that hub, the Pick Up's own first. Cancel rights stay with the requester (CC-31 item 4).
- **Evaluator-owned (D45):** RESERVATION_HOLD_EXPIRED is raised and cleared by its evaluator and is not configurable. Cancel, Return to stock and Extend also clear it.
- **Revisit triggers:** a staged unit taken by someone else becomes common (then hold units at the hub) · admins ask for auto-release back.
- **Rationale:** staged was announced as ready when it wasn't; an admin had to click Fulfill before the operator could take it; holds were released with no one deciding. On "Any …" lines, the owner: "Done once his deployment has a truck of that type: at once if he already has one, or after he adds one with Add vehicles. The record matches reality."
```

**D9 qualifier** (P1-1d's docs commit, appended to D9):

```markdown
- **D50 qualifier (<date>):** reservations have no Fulfill action now. A reservation's Fulfilled state means its owner picked it up. "Fulfill" stays reserved for the checklist and the Fulfilled state.
```

**For the Eastern-time PR:** a hold extended under Central is stored as the end of a Central day (for example `2026-10-29T04:59:59.999Z` for Oct 28), which reads as the next day once APP_TIMEZONE is Eastern. That PR either re-expresses stored `holdExpiresAt` values or accepts the one-day shift for holds extended before the move.

**Parked:**
- Reservation unit lines aren't held at the hub, so someone else can take a staged unit.
- INV-3 is one-sided, and line edits race with Stage (B4-6).
- A floored over-release surfaces as a raw 500 at pickup (B4-7).
- Low-stock alerts read on-hand stock, not available stock (B6-11, FR Q7).
- The TERMINAL set is copied on the two operator pages (B6-2).
- The `?id=` request deep link (D12).

## 8 · Paste prompts

Build P1-1d (after P1-1c merges):
```
Build P1-1d in AHITS_PACKET_P1-1de_RESERVATIONS_2026-10-25.md (repo root; rev 4.1), exactly as written: §0, the P1-1d section, §5, §6 (R7 goes into PILOT_ROLLBACK.md), §7, plus the override line, §5 base gate and §7 rules of AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md. Follow CLAUDE.md except where the packets override it. Owner reads R1–R4 are done, and R2 shows 0 rows. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-1d-staged-ready from current development. Named files only. Run scripts/check-migration-safety.sh after committing. Open the PR to development titled "P1-1d · Staged means ready" and give me the number when CI is green. Do not merge it. No reverts.
```
Build P1-1e (after P1-1d merges): the same prompt with "P1-1e" / "Expired holds", branch suffix `p1-1e-expired-holds`, "§6 (R8)" in place of "§6 (R7 goes into PILOT_ROLLBACK.md)", and "Owner read R8 is done" in place of the R1–R4 sentence.

Merge: the P1-1 merge prompt, naming this packet's §7.

---

## Appendix · Findings ledgers (for reviewers)

### Rev 4 — break-it (BRR), completeness (CRR) and dry-run (D4r3) reviews of rev 3

Owner decisions of 2026-10-25 settled CRR Q1–Q8: Q1 and Q2 by the "Any …" rule (§0-h; Q2's note is CRR-23); Q3 yes, as written; Q4 no change, §0-p reworded; Q5 Stage keeps 168 h, §0-q reworded; Q6 yes, sweep dropped; Q7 yes, R6-fix with its undo; Q8 yes, §7 owner note. Every finding is applied or merged into the one correction named; none is rejected, and D4r3-21 needs no change. Three are applied in a changed form, and the row says why.

| ID | Verdict | Where |
|---|---|---|
| BRR-1 | Applied | d.3 Cancel step 1 (snapshot only when hub and `stockReservedAt` are set); test 5 |
| BRR-2 | Applied | d.1 `stockReservedAt` guard; R1, R4, R5 guard; such rows are listed in R2 (its R3b folded in) |
| BRR-3 | Applied | d.0 note; d.4 empty owners → 0; d.5 empty owners, mark and close guarded, residual always; test 13 |
| BRR-4 | Applied | d.8 `presetItems` sums per item, `pickupHeld` sums; UI test "3 + 1 seed 4" |
| BRR-5 | Applied, changed | Owner decision 3: R6-fix with its undo (§6), not a cron step |
| BRR-6 | Applied | e.8 `holdUntil`/`holdEnded` guarded by `HOLDING`; e-test 9; UI test |
| BRR-7 | Applied | §5 P1-1e grep with `[^_]`; `holdStrayStaged` token dropped (decision 2) |
| BRR-8 | Applied | d.7 deadlock text |
| BRR-9 | Applied | Banner and d.8: net 0 lines; note on `:1046`; `:445` edited, `:446` kept; import `:28` |
| BRR-10 | Applied | d.6 request query without DISTINCT or line join |
| BRR-11 | Applied | d.5 "Then, always, `collectReservations`" for Start and Add Items |
| BRR-12 | Applied | d.2 NOTHING_CONFIRMED after the PENDING gate |
| BRR-13 | Applied | d.5 Add Items deletes `:114-117`; import trimmed if unused |
| BRR-14 | Applied | d.8 "Not pickable now" for seeded units (with CRR-1) |
| BRR-15 | Merged → CRR-4 | `CLOSE_SET` sets `fulfilledAt` on Cancel |
| BRR-16 | Applied, changed | d.0 one counted-line rule (Stage's: item and substitute consumable), used by d.1, R1, R2, R4, R5 and `COLLECT_LINE`. Interpretation changed: such a line is a unit line, "Any <substitute>", not "open until Cancel" |
| BRR-17 | Merged → CRR-17 | §5 grep |
| BRR-18 | Applied | R4 (its R1c); acceptance 6; behaviour changes |
| BRR-19 | Applied | d.6 `anyVehicleLabel` |
| BRR-20 | Applied | e.5 real-date check; e-test 5 `2026-02-30` |
| BRR-21 | Applied | e.5 wrapper note; e-test 3 |
| BRR-22 | Applied | UI test A5-9 (with D4r3-15) |
| BRR-23 | Applied | e.7 names `deployment-requests.ts`; d.9 caption after `:338-340` |
| BRR-24 | Applied | P1-1d rollback (old INV-4); P1-1e rollback "both … and" |
| CRR-1 | Applied | d.8 "Not pickable now" (units and "Any <item>"); UI test |
| CRR-2 | Applied | Rev-3 ledger header and rows A5-13, A6-11, A7-20 |
| CRR-3 | Applied | Decision 2: no sweep; R9, test 16(b), gate token, prompt condition removed; d.1 R5 remedy; §7 window note; Cancel's snapshot kept with BRR-1's guard |
| CRR-4 | Applied | d.0 `CLOSE_SET`, used by d.3, d.5 and e.5; `stockReservedAt = NULL` dropped from e.5 |
| CRR-5 | Applied | d.8 one note (`PickupUnitsNote`) plus one `Not available now` Alert |
| CRR-6 | Applied | d.5 `{ owners, stagedIds, pickupId }`; owners read once |
| CRR-7 | Applied | d.4 `${PICKABLE}` |
| CRR-8 | Applied | e.7 `listRequests` only |
| CRR-9 | Applied | R3 folded into R2; old R4 deleted; R1 comment |
| CRR-10 | Applied | d.2 body hub ignored; test 3 drops "a body hub is saved" |
| CRR-11 | Merged → BRR-5 | R6-fix |
| CRR-12 | Applied | P1-1d acceptance reordered: not deployed, then deployed |
| CRR-13 | Applied | Test operator in P1-1d acceptance 1 and 5; P1-1e acceptance bells |
| CRR-14 | Applied | P1-1d cleanup line |
| CRR-15 | Applied | §7 D50 house format and D9 qualifier (decision 5) |
| CRR-16 | Applied, changed | Both rollback notes go in the code PR, under `PILOT_ROLLBACK.md` §1 like main rev 4's P1-1c note (not a new section 4); "drop off Today" line |
| CRR-17 | Applied | §5 `grep -c "action('fulfill'"` → 1; `To collect:` ≥ 1 |
| CRR-18 | Applied | §8 names §6 (R7, R8) |
| CRR-19 | Applied | Banner MERGE ORDER |
| CRR-20 | Applied | (a) e-test 2; (b) e-test 1; (c) d-test 3; (d) e-test 1; (e) UI test |
| CRR-21 | Applied (main) | Main rev 4.1 §7 adds the `00_START_HERE.md` row in the P1-1a PR; §7 here notes it |
| CRR-22 | Applied | §0-p (Q4) |
| CRR-23 | Applied | d.8 `PickupUnitsNote` vehicle sentence (decision 1); tests; acceptance 2 and 4 |
| CRR-24 | Applied | e.9 refusal strings; behaviour changes |
| CRR-25 | Applied | e.3 label, alert text, owner bell; P1-1e acceptance |
| CRR-26 | Applied | §0-m; on-screen labels throughout; `Any equipment` |
| CRR-27 | Applied | e.9 `'the operator'` |
| CRR-28 | Applied | e.7 expired card; UI test |
| CRR-29 | Applied | P1-1d behaviour changes (D46 line) |
| CRR-30 | Applied | The Q1 parenthesis is gone (rule is §0-h) |
| CRR-31 | Applied | d.2 stage bell link `/operator/dashboard`; d-test 3 |
| CRR cosmetic | Applied | One "§5 · Gate" heading; one appendix heading |
| D4r3-1 | Merged → BRR-1 | |
| D4r3-2 | Merged → BRR-5 | Owner decision 3; d.1 wording "clears after R6's fix" |
| D4r3-3 | Merged → BRR-3 | |
| D4r3-4 | Applied | Decision 1: a Pick Up no longer closes an "Any truck" line with no truck; CRR-23 note; acceptance 2–4 |
| D4r3-5 | Merged → CRR-17 | |
| D4r3-6 | Merged → BRR-9 | |
| D4r3-7 | Applied | d.3 rewrite the Cancel comment |
| D4r3-8 | Merged → BRR-13 | |
| D4r3-9 | Merged → BRR-11 | |
| D4r3-10 | Applied | d.2 both codes in `TransitionResult` |
| D4r3-11 | Merged → CRR-4 | |
| D4r3-12 | Merged → BRR-16 | The effective-type option, not a 400 on substitutes |
| D4r3-13 | Applied | Tests header: a different operator per Start |
| D4r3-14 | Applied | Tests header: scope line queries to the test's request ids |
| D4r3-15 | Merged → BRR-22 | |
| D4r3-16 | Applied | d.6 item name when no serial |
| D4r3-17 | Merged → CRR-22 | |
| D4r3-18 | Merged → BRR-24, CRR-16 | Old Add Items refusing `items: []` added to the P1-1d rollback |
| D4r3-19 | Applied | d.1 and behaviour changes name INV-3 too |
| D4r3-20 | Merged → BRR-23 | |
| D4r3-21 | Noted, no change | The copy-contract rows are documentation; the test still needs one row per key |

### Rev 3 — A5, A6, D3

Applied: 42. Moot after the owner's decisions: 5 (A5-7, A5-13, A6-11, D3-6, D3-8). Rejected: 1 (A5-16c, a second "collected" rule). Rev 4 changed these rows: A5-2 and D3-1 no longer use a cron sweep (R5 and Cancel instead); A5-3 and D3-3's "Any …" lines are done by what the deployment holds, not by the Pick Up; A5-15 and D3-9's body hub is now ignored (CRR-10); A6-9's close uses `CLOSE_SET`.

| ID | Verdict | Where / why |
|---|---|---|
| A5-1 historic FULFILLED floods Today | Applied | d.6: `units` for STAGED only; FULFILLED listed only while holding; RESERVATION only |
| A5-2 legacy rows leak on close | Applied | d.1 conversion (owner decision 2); d.0 `OPEN_LINE` (an unconverted counted line never closes); d.3 Cancel snapshots first |
| A5-3 untargeted lines invisible / not persisted | Applied | `collectedAt` (d.1); marking (d.5); "Any …" on Today (d.6); Add Items accepts `items: []` with `fromRequestId` (d.5); exit via Cancel's close rule (d.3). The no-migration variant (`claimedQty = 1`) is rejected: it breaks `claimedQty ≤ heldQty` |
| A5-4 `fromRequestId` ownership | Applied, changed | d.5: owners = open assignments; a pickup is valid when its owner is on the deployment. The three-way "pickup owner / session user / primary" claim rule is replaced by "any owner on the deployment, pickup first". One rule, and it fixes BR-16 |
| A5-5 COALESCE in only one place | Applied | d.0 `OWNER` in listing, claiming, lock, close and the stage bell (owner decision 4); e.5 bells |
| A5-6 fulfill has no server rule | Applied (stronger) | d.3: reservation Fulfill removed (409); d.2: `snapshotHeldLines` SELECT guarded |
| A5-7 client can't compute legacy | Moot | No legacy flag remains (owner decision 2) |
| A5-8 units shape / seeding | Applied | d.6 shape `{kind,id,itemId,name}`; d.8 seeding, launch filter, "Not available now", one unit per item |
| A5-9 held stock capped as unavailable | Applied | d.8 `pickupHeld` in both builders; held items stay visible |
| A5-10 Pick Up of B eats A's hold | Applied | d.4 `preferRequestId` |
| A5-11 partial pickup cancelled | Applied | d.0 `CLOSED_STATUS`, used by close, Cancel and Return to stock |
| A5-12 lock order | Applied | d.5 one ordered `FOR UPDATE` of the candidate requests right after P1-1a's rig claim; d.3, e.5 lock the request first |
| A5-13 INV-3 false alarms on legacy | Moot | No legacy reserves after d.1; INV-3/4 include STAGED (d.7) |
| A5-14 keep `rigs.fromRequestId` stamp | Applied | d.5: valid pickups only; Start always, Add Items when NULL |
| A5-15 no-hub 409 points nowhere | Applied | d.2 `NEEDS_HUB`, its text, hubless bell |
| A5-16a `release-hold` on STAGED | Applied | e.5 delegates to Return to stock; meanwhile `CLOSED_STATUS` records a vacuous close as Cancelled |
| A5-16b all-DENIED rows | Applied, changed | d.2 refuses to stage (409), instead of writing DENIED: no new status write and no new bell |
| A5-16c target already on the deployment | Rejected | A display filter is a second "collected" rule. The next write on that deployment (or a Pick Up with nothing to add) collects it (d.5, Interpretations) |
| A5-16d §6 read #1 split | Applied | R1, R2, R3 |
| A6-1 expired FULFILLED has no buttons; `?id=` | Applied, changed | e.7 `isClosed` drives tab and actions; buttons for `holdExpired` whatever the status. The `?id=` half is rejected (owner decision 5; A7-13) |
| A6-2 predicates written four times | Applied | d.0 + e.2 fragments; server-computed `holdExpired` / `holdUntil` |
| A6-3 don't make it configurable | Applied, changed | e.3. The optional Settings caption change is not taken: the caption is still true, and the file is otherwise untouched |
| A6-4 PATCH wiring | Applied, changed | e.5 (1)–(5). A same-day replay returns its own 409 (`The hold already ends on that day.`), because "no longer holds any stock" would be false |
| A6-5 end-of-day helper | Applied, changed | e.6 JS helper in `business-date.ts` that follows APP_TIMEZONE (owner decision 8), in place of the SQL expression; DST instants tested |
| A6-6 who is told; metadata keys | Applied | e.3 metadata `itemName/operatorName/hubName`; e.3/e.5 bells to the owner, with titles and links (`?tab=closed` after Return) |
| A6-7 evaluator registry fields | Applied | e.3; EVALUATORS loop assertion in pr4-evaluators |
| A6-8 step 7 deletion specifics | Applied | e.4; step7 test rewritten; cc09 inline tests deleted; 168 h behaviour change |
| A6-9 Return to stock status; hide Cancel | Applied | d.0 `CLOSED_STATUS` counts `collectedAt`; e.7 expired card shows only Return / Extend |
| A6-10 `release-hold` second path | Applied | e.5 |
| A6-11 INV-3 note for legacy rows | Moot | No legacy rows after d.1, so no note is needed |
| A6-12 rollback order | Applied | P1-1e rollback |
| A6-13 card wording after the hold date | Applied | e.8 |
| A6-14 copy gaps | Applied | e.9 keys, rows and refusal strings; d.9 `request.stage` row |
| A6-15 missing tests a–i | Applied | P1-1e tests; (h)'s `?id=` cases replaced by "expired FULFILLED on Active" |
| A6-16 deploy is quiet; keep COALESCE | Applied | e.2 keeps the COALESCE; R8 counts the staged holds that now alert at deploy |
| A6-17 no auto-release side effects | Applied | P1-1e behaviour changes |
| D3-1 legacy STAGED closed, reserve orphaned | Applied | As A5-2 |
| D3-2 historic units resurface | Applied | As A5-1 |
| D3-3 vehicle-by-type stuck | Applied | §0-h "Any truck"; d.5/d.6; test 7 inverts D3's probe |
| D3-4 claim eats the older hold | Applied | d.4 |
| D3-5 secondary's pickup ignored | Applied | d.5 owners on the deployment |
| D3-6 `legacy` flag for the admin page | Moot | No legacy rows or flag (owner decision 2) |
| D3-7 units shape / one unit per item | Applied | d.6, d.8 |
| D3-8 disabled-type rollback step | Moot | The type is never configurable, and the Settings PATCH's zod enum can't store it (e.3) |
| D3-9 body hub never saved | Applied, changed in rev 4 | d.2: the body hub is ignored (CRR-10) |
| D3-10 owner rule in three places | Applied | As A5-5 |
| D3-11 Cancelled history after Return | Applied | P1-1e behaviour changes |
| D3-12 `today/types.ts` needs no edit | Applied | d.6 |

**Related items from B4, B6 and A7.**
- Taken:
  - B4-12 (d.2);
  - B6-2 server `holdExpired` (e.7);
  - B6-5 server-computed day (e.6, e.8);
  - B6-6 metadata keys (e.3);
  - B6-17 "To collect" (d.8);
  - A7-3 (e.5), A7-4 (e.2), A7-9 (d.5), A7-13 (owner decision), A7-14 (e.3), A7-15 (d.6), A7-20 (d.8, worded as B6-17: `To collect:`), A7-21 (e.8), A7-23 (e.4).
- Parked: B4-6, B4-7, B6-11, B6-16 (moot), and the rest of B6-2.
