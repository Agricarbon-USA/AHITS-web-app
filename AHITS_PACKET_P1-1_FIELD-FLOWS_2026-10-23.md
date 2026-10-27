# Packet P1-1 · Field flows tell the truth · rev 4.1 · 2026-10-25

> STATUS: runnable packet. Three PRs in order (P1-1a → P1-1b → P1-1c), one Claude Code session each. The reservation PRs P1-1d and P1-1e are in `AHITS_PACKET_P1-1de_RESERVATIONS_2026-10-25.md`. · WROTE: 2026-10-23; rev 4.1 2026-10-25, after two review rounds, two rounds of dry-run builds of every PR, and one stacked dry-run build of P1-1a → b → c on top of the hotfix (§9 lists what was rejected or moved). · READ-WITH: `CLAUDE.md`, `STATUS.md`, `DECISIONS.md` (D9, D10, D11, D16, D21, D22, D26, D38–D49, the 2026-10-22 D48 note), `AHITS_HOTFIX_2026-10-22_VEHICLE-CHECKER-FIELDS.md` (H-a: never return a full user row)
> WHY: Phase 1 of the 2026-10-22 roadmap ("bugs first"). These field flows silently do the wrong thing:
> - A transfer with no note always fails.
> - "Transfer to a person" with nobody picked strands equipment on an ended deployment.
> - An operator can return, write off or transfer another crew's gear, and retire any idle vehicle.
> - Gear waiting on a transfer can be returned or transferred again.
> - A second waiting transfer, a double End or a race gives a 500 or double-counted stock.
> - Returns pre-pick the alphabetically first hub and move the item's home hub there.
> - Serial-numbered units have no location.
> - Date-only values show a day early in US time zones.
> - The daily check doesn't know a crewmate already checked a truck.
> SLOT: after the reconnect hotfix (`AHITS_HOTFIX_2026-10-25_KEEP-WORK-ON-RECONNECT.md`), the CI runner-Postgres PR and the Next.js 16.4.2 PR.
> - Migrations: P1-1a none, P1-1b none, P1-1c one (additive).
> - Line numbers are at `dd9f6ac` and drift (the hotfix also edits `DispositionDialog.tsx`), so re-grep every anchor.
> - D21: `src/app/(operator)/operator/my-deployment/page.tsx` is 1467 lines and must not grow. P1-1b brings it down. State `wc -l` in every PR body.
> - Test baselines: re-count both suites on each PR's base, and state them next to the new counts.
>
> ORDER, and why: P1-1a (server rules) → P1-1b (screens) → P1-1c (where things are). The screens send a hub on every return, and strip stale hubs from the payload, before P1-1c starts using those hubs. That way no Scan return ever falls back to Home Lab, and no pre-picked hub becomes a repair destination.

**This packet overrides SESSION CLOSE steps 4–5 in `CLAUDE.md` and in `STATUS.md` for P1-1.** There is no handoff file unless the session ends mid-work; write one `CHANGELOG.md` line plus the STATUS lines in §7 instead. Stage named files only, never `git add -A` (owner, 2026-10-22). The two packet files sit untracked in the repo root: commit them on the P1-1a branch, never on `development`.

---

## 0 · Owner decisions (final: apply them, don't re-ask)

Rows g, h, i, o, p and q (reservations) are in the reservations packet.

| # | Decision | PR | Becomes |
|---|---|---|---|
| a | **A transfer's note is optional everywhere:** Selected equipment, Entire deployment, "Transfer to a person" lines, admin Reassign. The server stores `''` for a missing note. Screens show a note only when there is one. | a, b | D52 |
| b | **"Transfer to a person" must name a real, active person who isn't the deployment's own operator.** Every transfer path (equipment, entire deployment, Reassign, End and Return lines, vehicles) uses one rule and one set of words. | a, b | D52 |
| c | **An admin Reassign cancels every transfer from that deployment that is still waiting for an answer** (the entire-deployment one and any selected-equipment ones), in the same transaction. The recipients and the old operator are told. | a | D52 |
| s | **Gear waiting on a transfer stays with that transfer.** End deployment leaves it with the transfer, as it already does for vehicles; when only part of a counted line is waiting, the rest ends normally. Screens show it as `Waiting on transfer to <name>`. Returning, removing or transferring the waiting part again is refused until the transfer is answered or cancelled. One legacy exception: a serial-numbered line with no unit named (API-6) that is only partly waiting blocks End until that transfer is answered or cancelled, and the message says so. | a, b | D52 |
| t | **Operators act only on their own deployment's gear.** Every line or vehicle id a request names must be on that deployment. Only an admin can retire a vehicle. | a | — |
| j | A second waiting transfer of the same deployment → 409 naming who it waits on. Two End deployments at once → the second gets 409, and stock is restored once. Every write to a deployment's contents takes the deployment first, so races end in a named 409, never a 500 or a deadlock. | a | D52 |
| d | **Every return names its hub, and none is pre-picked:** operator Return equipment, End deployment, Scan "Return to Hub", admin Return item, admin bulk and End, and damaged equipment that can be fixed (the chosen hub becomes the repair's return destination, D43). A hint `Came from <hub>` shows where the line's drawn hub is known (counted lines); it is never pre-selected. A hub that isn't active is refused. | b (screens), c (server) | D51 |
| e | **Returns never change an item's home hub.** The home hub is "Home Lab" (Piedmont, SC) unless an admin edits it. The Add item form starts with Home Lab. The server keeps a fallback only for requests that name no hub (items queued before this ships; declined or cancelled transfers from an ended deployment, where nobody is there to ask): the hub the line came from, then the home hub. | c | D51 |
| r | **Each serial-numbered unit has a location: the hub where it is.** A return sets it to the hub picked; a repair closed to a hub sets it to that hub; admins can set it by hand ("Where it is") when the unit isn't out. While a unit is on a deployment (any open line, including one waiting on a transfer) the app shows `On <deployment>`. Existing units start at their item's current hub. Owner-confirmed rules (2026-10-25): (1) a returned unit is placed at the picked hub at once, before the hub confirms receipt; (2) a unit in repair stays at the hub it came back to until its repair is closed to a hub; (3) "Can't be fixed" asks no hub, so the unit keeps its last hub until an admin sets it; (4) where one item's units sit at different hubs, the starting locations may be wrong; §6 read C3 lists the likely ones to fix; (5) a hub can't be deactivated while units sit there; (6) a manual move isn't logged in history. | c | D51 |
| f | **The Inventory hub filter means "where it is now":** an item matches a hub when it has stock there (quantity > 0), a unit of it is located there and not out, or that hub is its home hub. | c | D51 |
| k | `POST /api/inventory` requires a category that exists, and a hub when a consumable starts with quantity > 0 (as the form does). | c | — |
| l | The daily check page knows when a crewmate already checked a vehicle today. | b | — |
| u | **End deployment returns whole lines,** so its dialog no longer shows "Quantity to remove". That field shows only when removing items mid-deployment. | b | — |
| m | **Words:** D9's and D11's locked strings stay exactly as they are ("Pick Up", "Return to Hub", "Staged at <hub> for pickup", "Mark Handled"). The sentence-case sweep and its D11 amendment are Phase 2.1, so existing titles such as `Return Item` and `Confirm Remove` keep their case. New strings this packet adds are sentence case. Use "Transfer", never "handoff", in anything a user reads, and "Equipment" in new operator copy. `<hub>` in new copy is the hub's name. | all | — |
| n | **D10:** P1-1's touches on `admin/deployments` and `admin/requests` are point fixes. The page splits happen in Phase 2 with the shared Start deployment builder. Record this as a dated note under D10. | — | D10 note |

---

## P1-1a · Transfers and End are safe (server)

**Goal.** Every deployment write that today silently does the wrong thing, or 500s, either works or returns a named 400/409. Closes OP-2, OP-3, API-2, API-3, API-4, API-5, B3-3, B3-4, B4-2, B4-3, B4-4, B4-13 and B4-16. It doesn't touch hubs, home hubs or unit locations; those are P1-1c.

**One lock rule (§0-j).** Every transaction that changes a deployment's contents, or answers a transfer from it, locks that deployment's `rigs` row **first**, before any other row: `claimActiveRig` (2.5) for writes to a live deployment, and `lockRigs` (2.5) where the deployment may already have ended. Then it locks lines, then stock. No route locks a transfer or a handoff row before its deployment.

2.1 **Transfer note** (`src/app/api/deployments/[id]/transfer/route.ts:12-13`):
- `note: z.string().optional().default('')` (precedent `handoff/route.ts:16-18`; the column stays NOT NULL).
- `toOperatorId: z.string().optional()`. A missing person goes through 2.2's helper, so the body is a plain 400 `{ error: 'Pick a person to transfer to.' }`, not a field error.
- Keep the `flatten()` envelope for everything else, and the 422 for a local photo.
- A line's `quantity` larger than the line → 400 `Only <n> of "<item>" are on this deployment.`

2.2 **One recipient rule.** New `src/lib/dispositions.ts`:
```ts
export async function transferRecipientProblem(
  lines: { toOperatorId?: string | null; name: string | null }[], // TRANSFER lines only
  primaryId: string | null,
): Promise<{ status: 400 | 409; error: string } | null>
```
- It returns null at once when `lines` is empty. Otherwise one `prisma.user.findMany({ where: { id: { in } }, select: { id: true, name: true, isActive: true } })`, then the first problem in line order. A line's name is quoted only when it is a real name.
  - Missing person (400): `Pick a person to transfer "<item>" to.` With no name: `Pick a person to transfer to.`
  - Not found (400): `The person picked to receive "<item>" wasn't found.` With no name: `The person picked to receive this equipment wasn't found.`
  - Deactivated (409): `<name> is deactivated — reactivate them or choose someone else.` (the existing words, `deployments/route.ts:141`).
  - The deployment's own primary (409): `"<item>" is already with <name> — pick someone else.` With no name: `This equipment is already with <name> — pick someone else.`
  - 409 for the two that depend on changing state, so `withIdempotency` doesn't cache them (it caches 2xx and 400).
- `primaryId` comes from `getActivePrimaryForRig(rigId)` (nullable). Every caller below uses it in place of `getRequiredPrimaryForRig`, which throws once a racing End has closed the roster. The helper itself returns 409 `This deployment has already ended.` when `lines` is non-empty and `primaryId` is null.
- Callers, each before any write:
  - `end/route.ts`, after parse: names from the pre-read lines. Read the primary only when a TRANSFER line exists.
  - `items/route.ts` DELETE: names from the lines found (2.6). It replaces `getRequiredPrimaryForRig` (`:307`).
  - `vehicles/route.ts` DELETE (replacing the check at `:156-163`): one `prisma.vehicle.findMany({ where: { id: { in } }, select: { id: true, name: true } })` for names.
  - `transfer/route.ts`: replace `:69-91` with the helper (`name: null`). The role check goes: `UserRole` is only ADMIN or OPERATOR, and both may receive (D3).
  - `handoff/route.ts` (entire deployment and admin Reassign): `toOperatorId: z.string().optional()`; replace `:45-55` with `transferRecipientProblem([{ toOperatorId, name: null }], primaryId)`, and `:37` with `getActivePrimaryForRig`. The PRIMARY-or-admin check (`:39`) is unchanged.
  - `items/route.ts` POST (`:117`): `getActivePrimaryForRig`; null → 409.
- After this, no "Destination operator", "Target must be an active" or "already the primary operator" string is left in `src/app/api`.
- Don't extract the rest of the return logic (Phase 3).

2.3 **Waiting transfers and Reassign** (`src/lib/deployment-handoffs.ts:49-68`; `src/app/api/deployments/[id]/handoff/route.ts`):
- `createHandoff(input, db: Pick<typeof prisma, '$executeRaw'> = prisma)` writes on `db`, and the route passes `tx`. `tests/pr3a-status-owner-routes.test.ts:209` (no client) is unchanged.
- Add to `deployment-handoffs.ts` (with `import type { Prisma } from '@prisma/client'`):
  - `getPendingHandoffForRig(rigId: string, db: Prisma.TransactionClient = prisma): Promise<{ id: string; toOperatorName: string } | null>`. It does a LEFT JOIN on users, earliest first, and uses `someone` when there is no name.
  - `cancelPendingHandoffs(rigId: string, db: Prisma.TransactionClient = prisma): Promise<{ id: string; toOperatorId: string; toOperatorName: string }[]>`:
    `WITH c AS (UPDATE "deployment_handoffs" SET "status"='CANCELLED', "updatedAt"=now() WHERE "rigId"=${rigId} AND "status"='PENDING' RETURNING "id","toOperatorId") SELECT c.*, u."name" AS "toOperatorName" FROM c JOIN "users" u ON u."id" = c."toOperatorId"`, then `resolveAlertsFor('deployment_handoffs', row.id, db)` for each row.
  - Use it in the force path, in place of End's raw cancel (`end/route.ts:368-371`, so End also marks those bells read), and in accept's auto-end (2.5).
- First statement of the handoff transaction: `claimActiveRig(tx, id)`.
- Non-force: inside the transaction, before the insert, `getPendingHandoffForRig(id, tx)` → **409** `{ error: 'This deployment already has a transfer waiting for <name> to answer. Cancel it first.' }`.
- Race backstop (kept, though the claim now makes it rarely reachable): catch the unique violation **outside** `$transaction` with `isUniqueViolationAnywhere(err)` (`src/lib/api-errors.ts:23`), and re-read with `getPendingHandoffForRig(id)` → the same 409; if nothing is found, `Another transfer of this deployment was just started — refresh to see it.` In the force path, map it to `That operator just started another active deployment — refresh and try again.` (precedent `handoffs/[id]/accept/route.ts:70-75`).
- Unexpected errors: 500 `{ error: 'Transfer failed. Try again.' }` plus `console.error`. Never return `err.message` (`:82`).
- Force (admin Reassign, §0-c), in the same transaction, after the claim and before `reassignPrimary`:
  - Re-read `getActivePrimaryForRig(id, tx)` after the claim, and use it for `fromOperatorId`, the audit and the old-operator row (a handoff accept may have committed just before).
  - `cancelPendingHandoffs(id, tx)`.
  - `WITH c AS (UPDATE "transfer_requests" SET "status"='CANCELLED', "updatedAt"=now() WHERE "fromRigId"=${id} AND "status"='PENDING' RETURNING "id","toOperatorId") SELECT c.*, u."name" AS "toOperatorName" FROM c JOIN "users" u ON u."id" = c."toOperatorId"`, then `resolveAlertsFor('transfer_requests', row.id, tx)` for each row. This is raw `RETURNING`, so a transfer accepted in between is never told it was cancelled.
  - No kit, unit or vehicle revert is needed: the deployment is active, and a cancel reverts only on ended deployments. Selected lines stay on the deployment.
  - After commit: `prisma.notification.createMany({ data }).catch(() => {})`, type `TRANSFER_CANCELLED`, link `/operator/my-deployment`, title `Transfer cancelled`. Nothing is sent when nothing was cancelled.
    - Each recipient, once: `<admin> reassigned the deployment, so the transfer waiting for you was cancelled.`
    - The old operator, one row naming each person once: `<admin> reassigned the deployment and cancelled the waiting transfer to <names, joined ", ">.` The old operator is told even when they are the admin doing it. The initiator isn't told separately.
- Words (D22). These user-facing strings say "transfer", not "handoff":
  - `handoff/route.ts` (~`:74`, `:79`, `:92-93`)
  - `src/app/api/handoffs/[id]/route.ts` (~`:14`, `:27`)
  - `handoffs/[id]/accept/route.ts` (~`:27`, `:46`, `:89-90`)
  - `handoffs/[id]/decline/route.ts` (~`:24`, `:43`, `:58-59`)

  Not-pending is exactly `Transfer is no longer pending`, as the equipment routes say. Titles: `Transfer requested` / `Transfer accepted` / `Transfer declined`. Bodies: `<name> wants to transfer a deployment to you.` · `<name> accepted the deployment transfer.` · `<name> declined the deployment transfer[: note].` Internal ids stay: `type: 'HANDOFF_*'`, audit `'DEPLOYMENT_HANDOFF'`, idempotency scopes, the `?handoff=` link param. The equipment transfer's own bell title (`Incoming equipment transfer`) is unchanged.

2.4 **The same raw-insert bug elsewhere:**
- `src/app/api/deployments/route.ts` (~`:350-357`), `src/app/api/deployments/[id]/operators/route.ts` (~`:57-60`) and `vehicles/route.ts` (~`:123-124`): `isUniqueViolationAnywhere(err)` → their existing 409 text, not a 500.
- `vehicles/route.ts` POST (~`:87-130`), inside the transaction: if `count < new Set(vehicleIds).size`, re-query `tx.rigVehicle.findMany({ where: { vehicleId: { in: vehicleIds }, removedAt: null }, select: { vehicleId: true, rigId: true, rig: { select: { endedAt: true } }, vehicle: { select: { name: true } } } })`.
  - A requested id with no open row on **this** deployment → throw `ReferenceConflict` → the whole add rolls back → 409. Open on an active deployment: the existing text (~`:99`). Open on an ended one: `<names> is waiting on transfer from an ended deployment — answer that transfer first.`
  - Ids already open here count as added (200). Set `assignedOperatorId` only for ids open on this deployment.

2.5 **Deployment locks** (`src/lib/deployment-auth.ts`, with `import { Prisma } from '@prisma/client'`, a value import because `lockRigs` uses `Prisma.join`):
```ts
export class DeploymentEnded extends Error { constructor() { super('This deployment has already ended.') } }
/** Take a LIVE deployment for a write. First statement of the transaction. */
export async function claimActiveRig(tx: Prisma.TransactionClient, id: string, data: Prisma.RigUpdateManyMutationInput = { updatedAt: new Date() }) {
  const r = await tx.rig.updateMany({ where: { id, endedAt: null }, data })
  if (r.count === 0) throw new DeploymentEnded()
}
/** Lock deployments that may already have ended (transfer answers). Id order, so two never deadlock. */
export async function lockRigs(tx: Prisma.TransactionClient, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))].sort()
  if (list.length) await tx.$queryRaw`SELECT 1 FROM "rigs" WHERE "id" IN (${Prisma.join(list)}) ORDER BY "id" FOR UPDATE`
}
```
- **`claimActiveRig` is the first statement** of the transaction in:
  - End: `claimActiveRig(tx, id, { endedAt: now, notes: note })`, replacing `tx.rig.update` at `:119`.
  - Items POST and DELETE, and single return (`items/[kitItemId]` DELETE: Scan, Log usage, the ⊖ button).
  - Vehicles POST and DELETE.
  - The transfer route, the handoff route, and handoff accept (`handoffs/[id]/accept/route.ts`: `claimActiveRig(tx, handoff.rigId)` before its claim, replacing the `endedAt` check at `:48-52`).
- **`lockRigs` is the first statement** of transfer accept (source and destination: `lockRigs(tx, [transfer.fromRig.id, await getActiveRigForOperator(toOperatorId, tx)])`), transfer decline and transfer cancel (`transfers/[id]/route.ts` DELETE: `lockRigs(tx, [transfer.fromRigId])`). Each claim of the transfer row comes after it.
  - Accept: after the lock, read the destination again with `endedAt: null`. If it ended in between, create a new deployment as when there is none (`accept/route.ts:117-124`).
  - Decline and cancel: after the lock and the claim, read `endedAt` and each line again **inside** the transaction (`tx.kitItem.findUnique`, selecting `removedAt`, `quantity`, `drawnQuantity`, `drawnHubId`, `inventoryUnitId`, `inventoryItemId`, `item { itemType, hubId }`), and use those values, not the pre-transaction read. On a live deployment nothing changes (the gear stays on it). On an ended one the line is closed, the `drawnQuantity` it has **now** is restored, and units are released, as today.
- **Every catch maps errors the same way**, first: `DeploymentEnded` → 409 `{ error: err.message }`; 2.8's `WaitingConflict` → 409; `ReferenceConflict` → 409 (existing). Then each route's known messages → 409, and anything else → 500 plus `console.error`: `{ error: 'Transfer failed. Try again.' }` in `transfers/[id]/accept`, `transfers/[id]/decline`, `transfers/[id]/route.ts` DELETE, `handoffs/[id]/accept` and the transfer and handoff routes; the existing 500 elsewhere. Those accept, decline and cancel routes today map *every* error to 409 with Prisma's raw text; that stops. `handoffs/[id]/decline` is unchanged. The transfer route has no catch today: give it one.
- **The same pre-check words:** `end/route.ts:82`, `items/[kitItemId]/route.ts:46`, `handoff/route.ts:33`, `transfer/route.ts:57` and `handoffs/[id]/accept/route.ts:52` all say `This deployment has already ended.`
- **End's transaction, in order** (replaces the pre-transaction auto-fill at `end/route.ts:93-109`, and the per-line `tx.kitItem.update` at `:130`):
  1. `claimActiveRig(tx, id, { endedAt: now, notes: note })`.
  2. `const waiting = await waitingTransfersForRig(id, tx)` (2.8).
  3. Read the open lines once: `tx.kitItem.findMany({ where: { kit: { rigId: id }, removedAt: null }, include: { item: { select: { id: true, name: true, itemType: true, hubId: true } }, inventoryUnit: true } })`. Any open line that wasn't in the pre-read and isn't waiting → throw → 409 `Equipment was added to this deployment while it was ending. Open End deployment again.`
  4. Auto-fill: an open line with no disposition that isn't wholly waiting gets `{ type: 'HUB', hubId: ki.item.hubId, returnCondition: 'GOOD', photoUrls: [] }`. With no hub, throw `NoDisposition(name)`; the catch maps it to the existing 400 text, and the transaction rolls back, so the deployment isn't ended (`tests/data-integrity.test.ts:575` stays green). P1-1c changes the fallback hub.
  5. `endAllAssignmentsForRig`, `removeAllProjectLinks`.
  6. Each disposition, against the in-transaction lines (a disposition whose line isn't there is ignored). Declare `let endedQty: number, restoreQty: number` before the branches:
     - `const w = waiting.items.get(disp.kitItemId)`. If `w` and (`w.qty == null || w.qty >= line.quantity`): `continue`. A wholly waiting line is skipped, whatever its disposition (TRANSFER too), and stays open for its transfer.
     - `if (w && w.qty != null)` (partly waiting):
       - `disp.type === 'TRANSFER'` → throw `WaitingConflict` → 409 `"<item>" is partly waiting on transfer to <name>. Return the rest to a hub, or cancel that transfer first.`
       - A serialized line → 409 `"<item>" is partly waiting on transfer to <name>. Cancel that transfer first.`
       - A consumable line:
       ```ts
       const [row] = await tx.$queryRaw<{ quantity: number; drawnQuantity: number }[]>`
         SELECT "quantity", "drawnQuantity" FROM "kit_items" WHERE "id" = ${disp.kitItemId} AND "removedAt" IS NULL FOR UPDATE`
       if (!row) continue
       endedQty = row.quantity - w.qty; restoreQty = Math.min(Math.max(endedQty, 0), row.drawnQuantity)
       if (endedQty <= 0) continue
       await tx.kitItem.update({ where: { id: disp.kitItemId }, data: { quantity: w.qty, drawnQuantity: row.drawnQuantity - restoreQty } })
       ```
     - Otherwise, a not-waiting TRANSFER line `continue`s (step 7 makes its row). Else:
       ```ts
       const [claim] = await tx.$queryRaw<{ quantity: number; drawnQuantity: number }[]>`
         UPDATE "kit_items" SET "removedAt" = ${now} WHERE "id" = ${disp.kitItemId} AND "removedAt" IS NULL
         RETURNING "quantity", "drawnQuantity"`
       if (!claim) continue
       endedQty = claim.quantity; restoreQty = claim.drawnQuantity
       ```
     - Then run the existing branch. Every unit sweep uses `take: endedQty` (`:148`, `:228`). Every restore uses `restoreQty` (`:174-175`; HUB GOOD only, and only when > 0). A write-off restores nothing. A partly waiting line logs one CHECK_IN at End and one more when its transfer is accepted.
  7. TRANSFER rows (2.6) from the in-transaction lines that aren't waiting.
  8. Vehicles: read the open RigVehicle rows inside the transaction. Close those not in `waiting.vehicles` (this replaces the `pendingXfer` read at `:357-361`), and clear `assignedOperatorId` for exactly those.
  9. `cancelPendingHandoffs(id, tx)`.

  The pre-read before the transaction stays for 2.2's names and the after-commit alert resolve.
- **Transfer accept's auto-end** (`transfers/[id]/accept/route.ts:222-231`): `const ended = await tx.rig.updateMany({ where: { id: transfer.fromRig.id, endedAt: null }, data: { endedAt: now } }); if (ended.count === 1) { await endAllAssignmentsForRig(transfer.fromRig.id, tx); await removeAllProjectLinks(transfer.fromRig.id, tx); await cancelPendingHandoffs(transfer.fromRig.id, tx) }`. Keep the "nothing left" condition, and drop the stale `!transfer.fromRig.endedAt`. **Use `transfer.fromRig.id`**: `id` in this route is the transfer.
- These are deployment writes. No unit or vehicle status literal is added, so the D42 guard passes unchanged.

2.6 **Only this deployment's gear** (§0-t):
- `items/route.ts` DELETE (`:317-319`): `kitItem.findMany({ where: { id: { in: kitItemIds }, kit: { rigId: id } } })`, with no `removedAt` filter. An id that isn't found → 400 `Some of this equipment isn't on this deployment any more. Refresh and try again.` A line found with `removedAt` set is skipped, as today (CR-17: a double tap or a crewmate's return stays 200; `tests/ur001-bulk-return-perhub.test.ts` must pass unchanged). Build the TRANSFER rows (`:564-578`) from the open lines found, never from the payload.
- `end/route.ts`: TRANSFER rows come from the in-transaction lines (2.5 step 7).
- `transfers/[id]/accept/route.ts:105` and `:155`: `tx.kitItem.findFirst({ where: { id: ti.kitItemId, removedAt: null, kit: { rigId: transfer.fromRig.id } } })`.

2.7 **Vehicle remove checks the vehicle is here; only admins retire** (`vehicles/route.ts` DELETE; `src/lib/asset-status.ts:269-301`):
- `dispositionType: 'RETIRED'` from a non-admin → 403 `Only an admin can retire a vehicle.` This is checked first. The operator screen never sends it (`my-deployment/page.tsx:530`); the admin screen does.
- Inside the transaction, after the claim: every `vehicleId` must have an open RigVehicle row on this deployment. If any is missing → 409 `<name> isn't on this deployment any more.` (with no name: `This vehicle isn't on this deployment any more.`).
- `removeVehicleFromRig` checks its `rigVehicle.updateMany` count; 0 → throw `ReferenceConflict` with the same text, as a backstop.

2.8 **Gear waiting on a transfer stays with it** (§0-s). "Waiting" means a `TransferItem` or `TransferVehicle` of a PENDING `TransferRequest` from this deployment. In `src/lib/dispositions.ts`:
```ts
export async function waitingTransfersForRig(rigId: string, db: Prisma.TransactionClient = prisma): Promise<{
  items: Map<string, { qty: number | null; toName: string }>   // kitItemId
  vehicles: Map<string, { toName: string }>                    // vehicleId
}>
```
It does one `db.transferRequest.findMany({ where: { fromRigId: rigId, status: 'PENDING' }, select: { toOperator: { select: { name: true } }, items: { select: { kitItemId: true, quantity: true } }, vehicles: { select: { vehicleId: true } } } })`. A line in two waiting transfers (legacy, §6 A3) sums the quantities; null if either is null. Also export `class WaitingConflict extends Error`, the two messages, and `lockKitItems(tx, ids, { skipClosed })`:
`SELECT "id", "quantity" FROM "kit_items" WHERE "id" IN (…) AND "removedAt" IS NULL FOR UPDATE`. It returns the open rows. With `skipClosed` (bulk and single return), a line a racing return just closed is skipped, as today (CR-17). Without it (the selected-equipment transfer), fewer rows than ids → throw `ReferenceConflict` → 409 `Some of this equipment isn't on this deployment any more. Refresh and try again.` This line lock, plus the deployment claim, orders these writes.
- **End:** 2.5 step 6.
- **Bulk return and single return** (inside the transaction, after the claim and `lockKitItems(tx, ids, { skipClosed: true })`):
  - A wholly waiting line → 409 `"<item>" is waiting on transfer to <name>. Cancel that transfer first.`
  - A partly waiting consumable line accepts a quantity up to `quantity − qty` (counted on the locked row). More → 409 `Only <quantity − qty> of "<item>" are free — <qty> are waiting on transfer to <name>.` So Log usage of the free part still works.
  - A serialized line that is waiting at all → 409.
- **A new transfer** (the selected-equipment route; bulk return's TRANSFER lines; vehicles DELETE TRANSFER) of a line or vehicle that is already waiting → 409 with the waiting message.
- **Vehicles DELETE:** **every** disposition of a waiting vehicle (Available, Send to maintenance, Retired, Transfer) → 409 `"<vehicle>" is waiting on transfer to <name>. Cancel that transfer first.` (after 2.7's 403).
- **Outgoing transfers for the whole crew:** `GET /api/transfers?direction=outgoing` lists transfers from every deployment where the user has an open assignment of any role. At `src/app/api/transfers/route.ts:35-39`, drop `AND "role" = 'PRIMARY'` for the outgoing branch only. P1-1b builds the waiting map from it, so a crew member's End shows waiting gear too. Cancel stays initiator-or-admin on the server (`transfers/[id]/route.ts:45`).

**Not touched:** `src/hooks/useOfflineQueue.ts`, `src/app/sw.ts`, `tests/offline/**`, every UI file, every home-hub write (P1-1c), and `openDamageTask` (P1-1c).

**Tests.** Node (CI). Harness as `tests/pr5b-dead-ends.test.ts`.
- `tests/p1-1a-field-writes.test.ts` covers 2.1–2.4 and 2.6–2.8.
- `tests/p1-1a-end-claim.test.ts` holds the deterministic race cases, with its own mock of `deployment-auth`:
```ts
const hook = vi.hoisted(() => ({ auth: null as null | ((rigId: string) => Promise<void>), active: null as null | ((rigId: string) => Promise<void>) }))
vi.mock('@/lib/deployment-auth', async (orig) => {
  const a = await orig<typeof import('@/lib/deployment-auth')>()
  return { ...a,
    isAuthorizedForRig: async (r: Parameters<typeof a.isAuthorizedForRig>[0], s: Parameters<typeof a.isAuthorizedForRig>[1]) => { await hook.auth?.(r.id); return a.isAuthorizedForRig(r, s) },
    getAuthorizedActiveRig: async (id: string, s: Parameters<typeof a.getAuthorizedActiveRig>[1]) => { const r = await a.getAuthorizedActiveRig(id, s); await hook.active?.(id); return r } }
})
```
  Add a third hook, `claim`, to the same mock: `claimActiveRig: async (...a: Parameters<typeof a.claimActiveRig>) => { await hook.claim?.(a[1]); return orig.claimActiveRig(...a) }` (it is how a test reaches the handoff route, which uses neither auth helper). Reset every hook in `afterEach`. A hook either ends the deployment the way End does (`UPDATE "rigs" SET "endedAt" = now() …` and `UPDATE "deployment_assignments" SET "endedAt" = now() WHERE "rigId" = $1`) or, for the "line added" case, runs `prisma.kitItem.create({ data: { kitId, inventoryItemId, quantity: 1 } })`.

Label the rows that also pass on the old code "regression guard" in the PR body.

Cases:
- **2.1:** no `note` → 201, `note === ''`. No person → 400 `{ error: 'Pick a person to transfer to.' }` (a plain string). A local photo ref still 422s (regression guard). Quantity above the line → 400.
- **2.2:** End with a TRANSFER line and no person → 400 naming the item. The deployment is **not** ended, the line is open and the unit is still CHECKED_OUT. Same on bulk return and vehicles DELETE (the vehicle stays; no TransferRequest). Unknown id → 400. Deactivated person and the deployment's own primary → 409 with their messages. A valid person → one PENDING transfer. The selected-equipment route, the entire-deployment transfer and Reassign give the no-name wording.
- **2.3:**
  - `CREATE UNIQUE INDEX IF NOT EXISTS` the pending-handoff index (SQL from `prisma/migrations/20260624010000_deployment_handoffs/migration.sql:14`) in `beforeAll`; drop it in `afterAll` only if this file created it.
  - Sequential A then B → 409 naming A, one PENDING row, no notification for B.
  - `Promise.all` race → one 201 and one 409, never a 500.
  - `createHandoff(input, { $executeRaw: vi.fn() } as never)` calls the fake.
  - Force with a waiting entire-deployment transfer to A and a waiting selected-equipment transfer to B → both CANCELLED; A and B each get one `Transfer cancelled` row; the old operator gets one naming both; their earlier bell rows are read; one ACCEPTED row.
  - End cancels a waiting handoff and marks its bell read.
  - Reassign after the deployment ended → 409.
- **2.4:** `Promise.all` of two Start deployments for one operator → one 201, one 409. Two deployments adding the same vehicle → one 200, one 409; the loser has no open RigVehicle, and `assignedOperatorId` is the winner's operator. A vehicle waiting on transfer from an ended deployment → 409. Re-adding a vehicle already here → 200 (regression guard).
- **2.5** (end-claim file):
  - Two **admin** sessions End together (no Idempotency-Key) → exactly {200, 409}. Stock is restored once, one CHECK_IN per line, transfers created once.
  - The `auth` hook ends the deployment before End's transaction → 409, nothing else changed (stock, open line, no CHECK_IN, no TransferRequest; the assignments as the hook left them).
  - The same-key replay → the cached 200.
  - The `active` hook on add-items → 409, no line, stock unchanged. The `claim` hook on Reassign → 409.
  - A line added between End's read and its claim → 409 `Equipment was added…`, nothing changed.
  - `Promise.all` of Reassign (force) and accept of that deployment's waiting transfer, where the transfer covers the whole deployment, 20 runs → one wins, the other gets a named 409; never a 500, never a deadlock message. Plus one hook-staged run of each order.
  - Reassign and handoff accept together, 20 runs → never a 500 or a deadlock message; any 409 is `Transfer is no longer pending`; exactly one open PRIMARY afterwards.
  - `Promise.all` of End and decline, 20 runs → never an open line on an ended deployment without a PENDING transfer, and stock restored once.
  - The recipient's End and accept together → End answers 409 `Equipment was added…`, or accept puts the gear on a new deployment, or End ends the accepted gear normally. Never an open line or vehicle row on an ended deployment.
  - Accept of everything → the source has `endedAt` set, its assignments ended, its waiting handoff cancelled. If End already ended the source, accept doesn't overwrite `endedAt`.
- **2.6:** an operator on A sends B's line to bulk return → 400, B unchanged. A double return of one line with two keys → both 200 (regression guard). End with a TRANSFER disposition naming B's line → no transfer of it. Accept of a transfer whose line moved to another deployment → 409.
- **2.7:** remove a vehicle that isn't here → 409, the vehicle unchanged (status, `assignedOperatorId`, no task). An operator sends RETIRED → 403. An admin sends RETIRED → retired.
- **2.8:**
  - A line wholly waiting on a transfer to X; End with HUB, and again with TRANSFER → the line stays open, X's transfer is PENDING, and X can accept.
  - A consumable line of 10 with 3 waiting; End to hub H → 7 restored, the line open with 3 (drawn 3). X accepts → X has 3. Or X declines → +3 to H, the line closed.
  - A partly waiting serialized line with no unit (legacy), End → 409 naming the transfer, nothing changed.
  - Bulk or single return of a wholly waiting line → 409 naming X. 10 with 3 waiting: Log usage 2 → 200 (line 8); return 8 → 409.
  - Two returns of one line at once → both 200 (`ur001`, regression guard).
  - A second transfer of a waiting line or vehicle → 409.
  - Remove a waiting vehicle as Available → 409; its row stays open and X can accept.
  - End's auto-fill doesn't touch a waiting line.
  - A SECONDARY's `/api/transfers?direction=outgoing` holds the PRIMARY's waiting transfer.
- **Must pass unchanged:** `tests/pr3a-status-writers-guard.test.ts`, `tests/hotfix-no-full-user-rows-guard.test.ts`, `tests/transfer-handler-uniqueness.test.ts`, `tests/data-integrity.test.ts:536,575`, `tests/pr6-serialized-only.test.ts` (`ReferenceConflict` → 409 still maps), `tests/transfer-lifecycle.test.ts`, `tests/fnd2-transfer-consumable-stock.test.ts`, `tests/pr3a-status-owner-routes.test.ts:205-218`, `tests/cc29-localphoto-rejection.test.ts`, `tests/ur001-bulk-return-perhub.test.ts`, `tests/cc31-alert-autoresolve.test.ts`.

**Behaviour changes (PR body):**
- An End or bulk return that has a "Transfer to a person" line and no person now fails in the Outbox with the named message (it used to "succeed" and strand the line). That includes items queued before this ships. Retry repeats it: Discard it and do the End again from My Deployment.
- Gear waiting on a transfer stays with it at End, and can't be returned, removed or transferred again until the transfer is answered. Until P1-1b ships, End's dialog still lists it as an ordinary line; whatever is picked, the server leaves it with the transfer.
- Operators can no longer act on another deployment's lines or vehicles, or retire a vehicle.
- A Reassign cancels waiting transfers.
- A crew member now sees the crew's outgoing transfers.
- Several 500s become 409s. Accept, decline and cancel no longer show Prisma's raw error text.
- A loser transaction now waits on the deployment's row lock. If the winner takes more than 5 s, the loser can still get a 500 (Prisma P2028); the queue retries it into the 409.

**Acceptance (owner, app screens).** Precondition: test people A and B have no active deployment. State Active Deployments first.
1. My Deployment → Transfer → Selected equipment → leave the note empty → it sends.
2. Transfer the whole test deployment to A, then to B → red `…waiting for A to answer…`.
3. Admin → Reassign that deployment → A's bell and yours show `Transfer cancelled`; the waiting card is gone.
4. Transfer one test item to A (don't answer) → End the deployment → A can still accept that item.

Races, crew scope and the API rules: node tests only.

---

## P1-1b · Screens tell the truth (UI)

**Goal.** Screens stop offering what the server refuses, ask for the hub on every return, show gear that is waiting on a transfer, show the right day, and know a crewmate's check. Closes OP-1, OP-4 (screens), SH-1 and STATUS §4 (b)/(c), plus the UI half of §0-a/b/d/l/s/u.
- No server change. If one turns out to be needed, stop and report it; it belongs in P1-1a or P1-1c.
- Until P1-1c ships: the server still moves the home hub on a return (as today), now to the hub the operator picks; and the hub picked for fixable damage isn't recorded on the repair.

3.1 **Shared pieces:**
- **`src/lib/hub-label.ts` (new).** Move `hubLabel` from `src/components/admin/NewDeploymentDialog.tsx:96`, and the `HubOption` type from `src/components/shared/DispositionDialog.tsx:14-19`.
  - In NewDeploymentDialog, use `import { hubLabel } from '@/lib/hub-label'` (it still calls it at `:418`).
  - Point `admin/deployments/page.tsx:31` and `tests/components/uxp6-admin-deployment.test.tsx:33` at `@/lib/hub-label` (name the test in the PR).
  - DispositionDialog re-exports `HubOption` for its other importers (`RepairReviewDialog.tsx:8`, admin NDD `:19`, `deployments/page.tsx:35`).
  - The label is `name · city, state` (D38). Also replace the inline twin at `admin/vehicles/page.tsx:1262`.
  - Other `name — city, state` twins are parked (§7).
- **`src/components/shared/ReturnHubSelect.tsx` (new).** A `TextField select` (tap to pick, so no keyboard for 2–4 hubs), with `hubLabel` options and a disabled first option `Pick a hub` (value `''`).
  - Props: `{ hubs, value, onChange, cameFromHubId?, label = 'Return hub', helperText?, required = true, size? }`.
  - Helper, first match wins:
    - no hubs → disabled, `No hubs to pick from — connect once, then try again.`;
    - a `helperText` prop;
    - empty and required → `Pick a hub` (red), plus ` · came from <name>` when `cameFromHubId` names a hub in the list;
    - otherwise `Came from <name>` (not red), when known.
  - `error = required && hubs.length > 0 && !value`. The hint never pre-selects.
- **`toDay(v: string | Date | null | undefined): string`** in `src/lib/utils.ts` returns the leading `YYYY-MM-DD`, or `''`. **`formatDay(v)`** is `const d = toDay(v); return d ? dayjs(d).format('MMM D, YYYY') : '—'`.
  - Slice first, and never `new Date('YYYY-MM-DD')`.
  - Both are for `@db.Date` values and `<input type=date>` timestamps only, never for instants.
  - Replace the `dateInput` copies in `admin/vehicles/page.tsx:134` and `admin/projects/page.tsx:54` with `toDay`.
  - `businessDate()` is untouched.
- **`toKitSummary(ki)`**, exported from `DispositionDialog.tsx`.
  - `KitItemSummary` gains `drawnHubId?: string | null`.
  - `toKitSummary(ki: { id: string; quantity: number; item: { id: string; name: string; itemType: string }; inventoryUnit?: KitItemSummary['inventoryUnit']; drawnHubId?: string | null }): KitItemSummary`.
  - Use it for my-deployment's three literals (~`:1261-1270`, `:1289-1297`, `:1314-1322`) and admin's two (`deployments/page.tsx:558-576`).
  - Both pages' `KitItemRow` gain `drawnHubId?: string | null`.
- **`crewCheckLine(c: { operatorName: string; submittedAt: string; byMe?: boolean }): string`**, exported from `src/components/operator/today/VehicleChecks.tsx`, returns `Checked by ${c.byMe ? 'you' : c.operatorName} at ${checkTime(c.submittedAt)}`. Today and the daily check both use it. `CREW_CHECK_NOTE` stays exported there.
- **`WaitingMap`** type, exported from `DispositionDialog.tsx`: `{ items: Record<string, { qty: number | null; toName: string }>; vehicles: Record<string, { toName: string }> }`, built from the outgoing PENDING transfers (`tr.items[].kitItem.id` with `tr.items[].quantity`; `tr.vehicles[].vehicle.id`; `tr.toOperator.name`).

3.2 **NotePhotoDialog keeps the work** (`src/components/shared/NotePhotoDialog.tsx:16,37-41`):
- `onConfirm: (note: string, photoUrls: string[]) => void | boolean | Promise<void | boolean>`.
- `handleConfirm`: `let r; try { r = await onConfirm(note, photos) } catch { return } if (r === false) return; setNote(''); setPhotos([])`.
- **TransferDialog:**
  - `TransferDialog.doTransfer` (~`:101-146`) returns `false` on the offline (`:106-109`), `!res.ok` and catch paths, and `true` after `onClose()`.
  - The error toast is `apiErrorMessage(d, 'Transfer failed. Please try again.')`.
  - The `Destination Operator` label (~`:174`) becomes `Person`.
- **Admin `handleAddVehicles`** (`:401-418`) gets a try/catch, `setActionLoading(false)`, and on failure `showToast(apiErrorMessage(d, 'Failed to add vehicles'), 'error'); return false`. The catch path uses `Network error. Please try again.` (the page's words).
- **Empty notes render nothing.** Edit in place, with no line growth:
  - my-deployment `:605`, `:775`, `:894` → `{h.note && <Typography …>&ldquo;{h.note}&rdquo;</Typography>}`;
  - `:808` → the same, with `tr.note`;
  - `:639` → `{tr.note && <>&ldquo;{tr.note}&rdquo; · </>}Accepting starts a new deployment for you.`;
  - admin `:625` → `{tr.note && <Typography … display="block">{tr.note}</Typography>}`.
- my-deployment's `doAction` note dialogs still close on a server reject (`:580`). This is unchanged; list it under Interpretations.

3.3 **DispositionDialog** (`src/components/shared/DispositionDialog.tsx`). Keep the hotfix's `current` derivation (each line from the current `items`):
- **No pre-pick.** Delete `defaultHub` (~`:108`). A line needs a hub when it is HUB, or a non-consumable INOPERABLE with `canBeFixed === true`. Each starts empty with `ReturnHubSelect`.
- **`Final destination (hub)` → `Return everything to`**, with the helper `Pick the hub this equipment goes back to. Applies to every item below — change any line if needed.`
  - It is a `ReturnHubSelect` with `required={false}`, and never shows an error. It is hidden when `items.length === 1`.
  - Keep a Set of kitItemIds whose hub the person picked on the line itself. "Return everything to" fills every line in `current` that needs a hub and isn't in that Set.
  - A line that newly needs a hub (switched to HUB, or answered "can be fixed") takes the all-lines hub unless it is in the Set.
- **"Came from"** hint: `cameFromHubId` is the line's `drawnHubId`. Counted lines have one; serialized units don't.
- **Person:** the option `Transfer to Operator` becomes `Transfer to a person`. The picker label is `Person`, the placeholder `Pick a person`.
  - Destructure `currentOperatorId` (at `:79-89`) and offer `operators.filter((o) => o.id !== currentOperatorId)`.
  - With no people → helper `People didn't load — you need a connection to pick a person.`
- **Submit** is disabled on a missing hub or person. While blocked, its label reads `Pick a return hub` (hub first) or `Pick a person`. In `remove-items`, it is also disabled when no line can be sent.
- **Payload:** send `hubId` only on lines that show a hub picker; strip it everywhere else, so a stale pick never rides along. P1-1c relies on this.
- **Waiting gear (§0-s).** New optional prop `waiting?: WaitingMap`:
  - A wholly waiting line renders read-only `Waiting on transfer to <name>`, with no picker, and isn't sent.
  - A partly waiting consumable line reads `<qty> waiting on transfer to <name> — the rest:` above its normal picker, without the `Transfer to a person` option. In `remove-items`, its quantity defaults to the free part and always sends `quantity = min(picked, free)`.
  - A partly waiting serialized line with no unit (legacy) is held like a wholly waiting one, and reads `Waiting on transfer to <name> — answer or cancel that transfer before ending.`
  - In `remove-items` mode, a wholly waiting line reads `Waiting on transfer to <name> — cancel that transfer first.` and isn't sent.
- **Quantity (§0-u):** "Quantity to remove" and "N will remain in kit" (`:254-269`) render only when `mode === 'remove-items'`.
- **Callers pass `waiting`.**
  - my-deployment: one `useMemo` from `outgoingTransfers`, plus the prop on its three dialog usages and TransferDialog. My Deployment's outgoing-transfer card shows Cancel only when `tr.initiatedBy.id === user?.userId` (cancel is initiator-or-admin on the server; `TransferRow` already has `initiatedBy`). My Deployment's Remove vehicles doesn't take a waiting vehicle: wrap the page's `setSelVehicles` in a `useCallback` that drops waiting ids (about +2 lines; the card file is untouched).
  - admin deployments: from its pending transfers.
  - TransferDialog drops waiting lines and vehicles from `kitItems` and `rig.vehicles` **before** building `selVehicles`, `selKitItems` and `transferQtys`, so they are neither shown nor sent.

3.4 **Scan** (`src/app/(operator)/operator/scan/page.tsx:168-194, 309-320`):
- Read hubs with `useFreshList<{ data: HubOption[] }>('/api/hubs')`.
- Put a `ReturnHubSelect` between Condition and the button, and send `{ returnCondition, hubId }`.
- The button keeps its D11 text `Return to Hub` and is disabled until a hub is picked. The hub resets with the condition in `resolveScan` (`:97`), so each unit is a fresh pick.
- Toast `<item> returned to <hub>.` The queued toast is unchanged. The Outbox label (`:178`) reads `Return <item> to <hub>`.

3.5 **Admin deployments** (`src/app/(admin)/admin/deployments/page.tsx`):
- **Return item dialog** (~`:1056-1083`, handler `:540-556`):
  - `ReturnHubSelect` with `cameFromHubId` for counted lines. It is hidden on Write off (`itemType === 'CONSUMABLE' && removeCondition === 'INOPERABLE'`).
  - Send `hubId` only when picked. Set `actionLoading` around the DELETE in `handleRemoveItem`; the button is disabled until a hub is picked (unless Write off) and while `actionLoading` (B2-10: no double tap).
  - The title stays `Return Item` (§0-m).
  - Copy key `deployment.returnItem` (`src/lib/copy/admin-actions.ts:30`) → `{ success: (hub: string) => \`Item returned to ${hub}.\`, writtenOff: 'Item written off.' }`. The call (~`:549`) picks `writtenOff` for a write-off, else passes the hub name.
- **Remove vehicles:**
  - The option `Transfer to Another Operator` becomes `Transfer to a person`, with the label `Person` and the placeholder `Pick a person` (was `Select operator…`).
  - `Confirm Remove` keeps its text. It is disabled while any selected vehicle is TRANSFER with no person.
  - A waiting vehicle is listed with no checkbox.
- **Reassign:** the label becomes `Reason (optional)`. Remove both client guards (`:321`, `:1172`).
- **Transfer quantity:** `TransferRow.items` gains `quantity: number | null` (~`:135`). `:617` and `:1395` render `ti.quantity ?? ti.kitItem.quantity`.
- **The comment at `:1250`** reads `…on behalf of the recipient` (it holds the old words, and the §5 grep reads comments).

3.6 **Dates** (`formatDay`):
- `src/components/admin/DailyCheckViewer.tsx:78`.
- `src/app/(admin)/admin/vehicles/page.tsx:736` (rental) and `:856` (recent checks).
- `expiryMeta` (`:124-132`): `label = formatDay(iso)`, `days = businessDayDiff(businessDate(), toDay(iso))` (reuse `src/lib/deployment-map.ts:13-18`); thresholds unchanged.
- `src/app/(admin)/admin/projects/page.tsx:162,197,198` only. Keep `fmt` for `startedAt` at `:215`.
- `src/app/(admin)/admin/requests/page.tsx:346`.
- `src/app/(operator)/operator/requests/page.tsx:277`.
- `src/app/s/[token]/page.tsx:230`: a display-only fix on a D21(b)-frozen page. Say so in Behaviour changes.
- `nextDue` / `dateDelivered` are parked.

3.7 **Crewmate's check** (`src/app/(operator)/operator/daily-check/page.tsx`; no new files):
- **Fetch.** Add `fetchCrewChecksToday()` beside `fetchCheckedToday` (`:109-117`), and await it in the same `Promise.allSettled` (`:312-323`).
  - It reads `/api/operator/today` (SW-cached) and returns `Map<vehicleId, { operatorName, submittedAt }>` from `json.data.vehicleChecks.filter((c) => !c.byMe)`.
  - It trusts the data only when `typeof json.data.asOf === 'string' && !Number.isNaN(Date.parse(json.data.asOf)) && businessDate(new Date(json.data.asOf)) === businessDate()`. Otherwise it returns an empty map and never throws.
- **Definition.** A vehicle is crew-checked when it is in that map and not in your own `checkedToday` (the server rule, `rig-daily-checks.ts:82-95`).
- **Preselect.** `pickPreselect` (`:323`, `:595`) uses own ∪ crew. `checkedToday` stays own-only; the own-check notice reads it.
- **Picker.** A crew-checked vehicle is a disabled option with the secondary line `crewCheckLine(c)`.
- **Selected and crew-checked** (deep link, Scan, restored draft): a `warning` Alert beside the own-check one (`:712-716`) reads `${crewCheckLine(c)}. Only the person who filed a check can open or redo it.` on every step. Next and Submit are disabled.
- **All checked:** `Every vehicle on this deployment is checked today.` (step 0; the deployment's vehicles only).
- **Unchanged:** Today's "Start daily check" (no deep link, so draft restore is unchanged), and D47's server behaviour.

3.8 **Hub Inbound** (`src/app/(admin)/admin/hubs/page.tsx:160-196, 244-257, 837-844`):
- **Received or Dismiss:** drop the row locally on 200, 404 or 409, then refetch as today. 409 toast (red) `Already received or dismissed — removed from the list.`, as `copy('hubReturn.receive').gone` (a field on the existing key, so no new contract row).
- **Bulk Receive** keeps each `r.status` and drops the 200/404/409 rows. If every failure is a 409, show the `gone` toast; otherwise the existing partial toast.
- **Offline load:** `loadInbound`'s `catch` (`:169-170`) keeps the current rows and toasts `Couldn't load inbound — check your connection.` It never sets `[]`, which would read as a false all-clear.
- `src/app/sw.ts` is **not** touched.

**my-deployment budget (D21):** `toKitSummary` −23, the dead `case 'end'` (~`:575-577`) −3, `KitItemRow.drawnHubId` +1, the `waiting` map about +5, props +4, the vehicle setter +2. The stacked dry run ended at 1454. State the final `wc -l` (≤ 1467).

**Lint:** set state only inside fetch callbacks (as `VehicleChecks` does), so touched files gain no `react-hooks/set-state-in-effect` warning. State the warning count.

**Tests.** UI: `tests/components/p1-1b-screens.test.tsx`, plus a pure guard `tests/components/p1-1b-date-only-guard.test.ts`. The 3.8 cases go in `tests/components/pr5b-dead-ends.test.tsx`.
- **3.2:** a failed transfer keeps the note and photos (new). Mock the 400 as `{ error: 'Pick a person to transfer to.' }` → the toast shows those words (regression guard).
- **3.3:**
  - With 2 hubs nothing is selected, and submit reads `Pick a return hub`.
  - Line A picked = Hub 1, then all-lines = Hub 1, then all-lines = Hub 2 → A stays Hub 1, and B and the fixable-damage line C become Hub 2.
  - TRANSFER and Write off need no hub (regression guard: choose the transfer option by `/^Transfer to/`).
  - Fixable damage needs a hub (new).
  - A counted line reads `Pick a hub · came from <name>` with nothing selected; after a pick it reads `Came from <name>`.
  - `Transfer to a person` without a person → `Pick a person`, no mutate. The deployment's own operator isn't offered.
  - `hubId` is absent on a line switched from HUB to TRANSFER.
  - A wholly waiting line reads `Waiting on transfer to X` and isn't in the body. A partly waiting one shows its picker for the rest.
  - In remove-items with only waiting lines selected, submit is disabled.
  - End mode shows no quantity field.
  - TransferDialog with one waiting line: the POST body has no item for it.
- **3.4:** Scan return is disabled until a hub is picked. The DELETE body carries `hubId`, and the toast names the hub.
- **3.5:**
  - Return item is disabled until a hub is picked (enabled for Write off). The body carries `hubId`. The toast reads `Item returned to <hub>.` or `Item written off.`
  - Reassign with an empty Reason posts `expect.objectContaining({ note: '', force: true })`.
  - A pending transfer `{quantity:1, kitItem:{quantity:2}}` reads "×1" on the card and in the drawer.
  - Remove vehicles' transfer needs a person.
- **3.6:**
  - `vi.useFakeTimers({ now: new Date('2026-10-23T01:00:00Z'), toFake: ['Date'] })` with `process.env.TZ = 'America/Chicago'` (restore both in `afterAll`), and `insuranceExpires: '2026-10-23T00:00:00.000Z'` → within the drawer's `Insurance expires` row: `Oct 23, 2026 · 1d`. The old code shows `Oct 22, 2026 · 0d`.
  - `formatDay('2026-10-22T00:00:00.000Z') === 'Oct 22, 2026'`; `formatDay('2026-07-19')` works; `null → '—'`.
  - The guard scans `src/**/*.tsx` for `\b(formatDate|fmt|fmtDate)\(` on `.date`, `rentalStartDate`, `rentalEndDate`, `startDate`, `endDate`, `neededBy`, `insuranceExpires` and `registrationExpires`. Opt-out: `// date-only: ok <reason>`. It includes self-tests.
- **3.7:**
  - A crewmate checked v1 → v2 is preselected.
  - `?vehicleId=v1` shows the notice before any inspection row, and Next is disabled. v1 is a disabled option with `Checked by …`.
  - A Today payload of `{}` changes nothing. The own-check notice is unchanged.
- **3.8:** make the `pr5b-dead-ends` stub stateful (answered links drop out). After a 409 on Received, the row is gone without a reload. Add a 500 case. An offline load keeps the rows.
- **Change** (name each in the PR):
  - `tests/components/DispositionDialog.test.tsx:46,55,62` (`:73` is unchanged: unfixable damage needs no hub).
  - `tests/components/pr3b-guards.test.tsx:237` (both lines need a hub; "Return everything to" fills both).
  - `tests/components/pr6-serialized-only.test.tsx`:
    - `:257` and `:273`: both option lists say `Transfer to a person`;
    - `:262`: pick a hub for the GPS line first;
    - `:304`: `within(dlg).getAllByRole('combobox')[0]`, because the Condition select has no accessible name and the hub picker adds a second combobox.
  - `tests/components/uxp6-admin-deployment.test.tsx:33` (import path).
  - `tests/components/uxp3-daily-check-flow.test.tsx`: its mocks gain an `/api/operator/today` branch; keep every assertion.
  - `tests/components/pr5b-dead-ends.test.tsx:140-165`: a stateful stub and the new toast text.
- **Must pass unchanged:** `tests/components/cc32-daily-check-flow.test.tsx`, `daily-check-gps.test.tsx`, `pr5c-today-crew.test.tsx`, `copy-contract.test.tsx`, and the hotfix's `hotfix-reconnect-reread.test.tsx`.
- Don't copy the 2–3 s `waitFor` debounce pattern (STATUS §6): click static options, or use fake timers.

**Behaviour changes (PR body):**
- Every return asks for its hub, and nothing is pre-picked. Until P1-1c, the picked hub also becomes the item's home hub (as returns do today), and the hub picked for fixable damage isn't recorded on the repair.
- One-item returns lose CC-24's two-tap shortcut (`DispositionDialog.test:46-53`). A unit already in repair starts as fixable damage and now needs a hub.
- Gear waiting on a transfer shows as waiting. Log usage, Scan return and admin Return item of waiting gear show the server's "waiting on transfer" message.
- End no longer shows a quantity.
- The frozen portal page `s/[token]` gets a display-only date fix.

**Acceptance (owner, app screens).** State Active Deployments first.
1. End deployment on a test deployment: no hub is chosen. A line set to "Transfer to a person" reads "Pick a person" until one is picked, and you aren't in the list. No quantity field.
2. Transfer one test item to a test person (don't answer) → End deployment shows `Waiting on transfer to <name>` for it.
3. Scan → Return to Hub asks for a hub.
4. Transfer 1 of a ×2 test consumable → Admin → Deployments: the drawer and the Pending transfers card read ×1.
5. Admin → Vehicles → a vehicle's recent check shows today's date.
6. Reassign with Reason empty works.
7. Hubs → Inbound in two tabs → Received in tab 1, then in tab 2 → red `Already received or dismissed — removed from the list.`, and the row disappears.
8. Two operator logins (owner): a crewmate's checked truck reads `Checked by …` and can't be started.

---

## P1-1c · Where things are (server + admin UI + one additive migration)

**Goal.** §0-d (server half), e, f, k and r:
- Returns stop moving home hubs.
- Each serial-numbered unit gets a location.
- The hub filter means "where it is now".
- A fixable return's hub becomes its repair's return destination.
- Item create checks its inputs.

Closes the rest of OP-4, A2-7, T5, and STATUS §4 point fix (a).

**One location writer.** Every location write goes through `placeUnits` in `src/lib/asset-status.ts` (D42's module), except new units at creation (5.5).

5.1 **Returns don't move home hubs, and name an active hub** (§0-d, e):
- **Delete the home-hub rewrites.** Delete the `InventoryItem.hubId` rewrites in `end/route.ts` (~`:161-163`, `:235-237`), `items/route.ts` (~`:398-400`, `:476-478`) and `items/[kitItemId]/route.ts` (~`:159-164`). Replace the stale comments at `[kitItemId]:151-157` with: `Home hub never moves on a return (D51). The hub filter finds the item through its stock row or its unit's location.`
- **Active hubs only.** End, bulk return and single return check every named `hubId` (not `repairHubId`) before the transaction, with one helper in `src/lib/dispositions.ts`: `prisma.hub.findMany({ where: { id: { in } }, select: { id: true, name: true, isActive: true } })`. An inactive hub → 409 `<hub> isn't an active hub any more — pick another.`; an unknown one → 409 `That hub isn't active any more — pick another.` This also stops a bad hub on fixable damage from becoming an FK 500.
- **No-hub fallback = where it came from, active hubs only:** the drawn hub if active, else the unit's location if active, else the home hub if active. None → End's existing 400 (worded `…has no disposition and no hub to return to…`). Queued items and declines name no hub, and YS Shop is deactivated after P1-1c, so the fallback must never land on an inactive hub.
  - End's auto-fill (P1-1a 2.5 step 4) uses it.
  - Single return, `items/[kitItemId]/route.ts:53`: the include gains `inventoryUnit: { select: { hubId: true } }`, and `resolvedHub` at `:69` is the named hub, else the same fallback.
  - Comments at End's auto-fill, at `[kitItemId]:17-19` and at `:63-66` say: `…default to where the line came from — the hub it was drawn from (a unit: where it is), else the item's home hub (D51).`
  - Decline and cancel from an ended deployment are unchanged.

5.2 **Unit location: schema and migration** (§0-r). Name the migration `prisma/migrations/<YYYYMMDDHHMMSS>_p1_1c_unit_location/migration.sql`, using UTC (`date -u +%Y%m%d%H%M%S`) at build time, later than every migration on development.
- `prisma/schema.prisma`:
  - `Hub` (`:231-256`), after `stock InventoryStock[]`: `units InventoryUnit[]`.
  - `InventoryUnit` (`:455-484`), after `deletedAt`: the comment `// D51: where the unit is now — the hub it was last returned to, closed a repair to, or an admin set ("Where it is"). Not its item's home hub. While it has an open kit line the app shows the deployment instead. Written by asset-status.ts placeUnits and the add-units route.`, the field `hubId String?`, the relation `hub Hub? @relation(fields: [hubId], references: [id], onDelete: SetNull)`, and `@@index([hubId])`.
  - The `InventoryStock` comment (`:495-496`) now says serialized location is `InventoryUnit.hubId` (P1-1c, D51).
- Migration. Keep the comments free of `;` and `'`: the safety script splits on `;` and strips only comments without a `'`.
```sql
-- P1-1c (D51): where each serialized unit is now. Additive: one nullable column, its index
-- and foreign key, and a backfill. This is not the home hub (inventory_items.hubId).
ALTER TABLE "inventory_units" ADD COLUMN "hubId" TEXT;
CREATE INDEX "inventory_units_hubId_idx" ON "inventory_units"("hubId");
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_hubId_fkey"
  FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Backfill: every unit starts at the current hub of its item. Returns used to rewrite that
-- hub, so it is usually the last hub the unit went back to. A second run changes nothing.
UPDATE "inventory_units" u SET "hubId" = i."hubId"
FROM "inventory_items" i
WHERE u."inventoryItemId" = i."id" AND u."hubId" IS NULL AND NOT (i."hubId" IS NULL);
```
- It passes `scripts/check-migration-safety.sh` (checked in two dry runs: 4 statements, 0 flagged). Run the script **after** committing; before a commit it reports a false "no migrations".
- CI builds its test DB with `db push`, so the backfill never runs there. The node test runs the migration's UPDATE itself (as `tests/pr3c-delete-items.test.ts:316-322`).

5.3 **`placeUnits`** (`src/lib/asset-status.ts`), before `export type ReturnCondition` (`:115`):
```ts
/** D51: where a unit is. Set by a return to a hub, a repair closed to a hub, or an admin
 * ("Where it is"). Checkout, transfers, hub receipt, revoke and retire leave it as it is —
 * while a unit has an open kit line, screens show its deployment instead. */
export async function placeUnits(tx: Tx, unitIds: string[], hubId: string): Promise<void> {
  if (unitIds.length === 0) return
  await tx.inventoryUnit.updateMany({ where: { id: { in: unitIds } }, data: { hubId } })
}
```
- Add a line to the module comment (`:8-24`): it also writes a unit's location through `placeUnits`.
- `returnUnit`: new first statement, before the read at `:142`: `if (opts.hubId) await placeUnits(tx, [unitId], opts.hubId)`. Its doc gains "a named hub becomes the unit's location (D51); no hub leaves it where it was".
- Write no status literal, so the D42 guard passes unchanged.

5.4 **Damaged equipment's hub** (§0-d, D43). One place, `src/lib/maintenance.ts` (add `placeUnits` to the asset-status import at `:6`):
- `DamageTaskFields` (`:98`) gains `returnHubId?: string | null`.
- `openDamageTask`, when `returnHubId` is set: on a **new** task it sets `returnDestinationType: 'HUB', returnDestinationId: returnHubId`; on a **joined** open task it `updateMany`s the same two fields.
- `repairHubId` stays `disp.repairHubId ?? null`. No screen sends it; it means "Ship to Hub", not the return destination.
- **Callers:**
  - `returnUnit`'s damaged branch (`asset-status.ts:158-162`) passes `returnHubId: opts.hubId ?? null`.
  - `returnUnit`'s options gain `returnHubId?: string | null` (default `opts.hubId`). The single return route passes `hubId: resolvedHub` (where the unit goes) and `returnHubId: body.data.hubId ?? null` (a repair destination only when someone picked it). That also stops the already-in-repair branch (D-d) recording a destination nobody picked.
  - End (`end/route.ts:255-290`) and bulk return (`items/route.ts:498-533`) pass `returnHubId: disp.hubId ?? null` on an INOPERABLE line with `canBeFixed === true`. Right after `openDamageTask`: `if (kitItem.inventoryUnit && disp.hubId) await placeUnits(tx, [kitItem.inventoryUnit.id], disp.hubId)`. That is the line's own unit only; unit-less lines are API-6, parked.
  - The unfixable branch (`markInoperable`) is unchanged: no hub is asked there.
- **A repair closed to a hub moves the unit.** In `closeDamageTask` (`maintenance.ts:264-311`), after `restoreIfClear` (`:310`): `if (asset?.kind === 'unit' && extra.returnDestinationId && (extra.returnDestinationType === 'HUB' || extra.returnDestinationType === 'OTHER_HUB')) await placeUnits(tx, [asset.id], extra.returnDestinationId)`. Only `/complete` passes a destination. Every other close leaves the location as it is.

5.5 **New units start at the home hub** (`src/app/api/inventory/[id]/units/route.ts:36-56`): select `hubId` on the item, and each created row gets `hubId: item.hubId`, commented `// D51: new units start at the item's home hub; an admin moves them with "Where it is".`

5.6 **Hub filter** (§0-f, `src/app/api/inventory/route.ts:228`; add `ACTIVE_UNIT` to the existing import at `:9`):
```ts
    // D51 · §0-f: "where it is now" — its home hub, consumable stock there, or a serialized
    // unit located there that has no open kit line (out on a deployment, or waiting on a transfer).
    ...(hubId && { OR: [
      { hubId },
      { stock: { some: { hubId, quantity: { gt: 0 } } } },
      { itemType: 'SERIALIZED' as const, units: { some: { ...ACTIVE_UNIT, hubId, kitItems: { none: { removedAt: null } } } } },
    ] }),
```
- `findMany` and `count` share this `where`, so `total` and paging follow. Pickers (`mode=options`) and counts are unchanged.
- The list's hub filter label becomes `Where it is` (`admin/inventory/page.tsx`).

5.7 **"Where it is" API:**
- **`src/app/api/inventory/units/[unitId]/route.ts`:**
  - The schema (`:10-15`) gains `hubId: z.string().min(1).optional()`, read as `const { status, hubId, ...fields } = parsed.data`.
  - An inactive or unknown hub → 400 `Pick an active hub.`
  - When `hubId` is sent: a unit with an open kit line, or Returning (IN_TRANSIT) → 409 `This unit is out or on its way back to a hub. Move it once it's received.` Other PATCH fields are unaffected.
  - Inside the transaction, before the final update: `if (hubId) await placeUnits(tx, [unitId], hubId)`.
  - There is no check log for a move. Don't add `hubId` to the response `select`; the drawer reloads.
- **`src/app/api/inventory/[id]/route.ts` GET:** each unit gains `hub: { select: { id: true, name: true, city: true, state: true } }` and `onDeployment: { rigId, name } | null`.
  - It comes from `kitItems: { where: { removedAt: null }, take: 1, select: { kit: { select: { rigId: true, rig: { select: { label: true } } } } } }`.
  - The name is `deploymentName(rig.label, operatorName)`: export `deploymentName(label: string | null, operatorName: string | null) => label || deploymentOf(operatorName)` from `src/lib/asset-references.ts` (`deploymentOf` is at `:238`), and use it in place of the copy at `src/app/api/inventory/[id]/review-inoperable/route.ts:47`. The operator comes from `getDeploymentRostersForDisplay`, names only, never a user row (H-a).

5.8 **Hub deactivation guard** (`src/lib/asset-references.ts`; add `ACTIVE_UNIT` to the import at `:3`):
- `OpenReferences` gains `unitsAtHub: number` (`empty()` sets 0).
- In the hub branch: `db.inventoryUnit.count({ where: { ...ACTIVE_UNIT, hubId: id, inventoryItem: { deletedAt: null, itemType: 'SERIALIZED' }, kitItems: { none: { removedAt: null } } } })`.
- In `assertNoOpenReferences`, after the `activeLinks` line (`:308`):

  ``const n = refs.unitsAtHub; if (n > 0) refuse(`${name} still has ${plural(n, 'unit', 'units')} — move ${n === 1 ? 'it' : 'them'} first (Inventory → the item → Units → Where it is).`)``

  IN_MAINTENANCE and INOPERABLE units sitting there count.
- The doc line at `:260` gains "units located there (D51)".
- `tests/pr3b-guards.test.ts:67` `NO_REFS` gains `unitsAtHub: 0` (`tsc` checks tests).

5.9 **Item create** (§0-k, `src/app/api/inventory/route.ts:372-415`). The server reuses the form's words (`inventory/page.tsx:306,319`):
- `categoryId: z.string({ required_error: 'Category is required' }).trim().min(1, 'Category is required')`. Then `prisma.category.findUnique` before the transaction; a missing one → 400 `{ error: { formErrors: [], fieldErrors: { categoryId: ["That category doesn't exist."] } } }`. Delete the regex drop (`:402`) and pass `categoryId` through.
- `itemType: z.enum(['SERIALIZED', 'CONSUMABLE']).optional()`. It is imported type-only at `:6`, so it can't be `nativeEnum`.
- `const type = itemType ?? 'CONSUMABLE'`. `type === 'CONSUMABLE' && quantity > 0 && !realHubId` → 400 `fieldErrors.hubId: ['Pick a hub — stock above 0 has to land at a hub']`.
- When `realHubId` is set: `prisma.hub.findFirst({ where: { id: realHubId, isActive: true } })`; missing → 400 `fieldErrors.hubId: ["That hub doesn't exist or isn't active."]`.
- PATCH is unchanged.
- **`CLAUDE.md:116`:** replace "(for example, the item form requires a category; `POST /api/inventory` does not)" with "(for example, until P1-1c `POST /api/inventory` accepted an item with no category)".

5.10 **Admin screens** (`src/app/(admin)/admin/inventory/page.tsx`):
- **Units tab** (`:1250-1356`):
  - `UnitRow` (`:72-79`) gains `hub?` and `onDeployment?`.
  - A `Where it is` column goes after Status, and the history row's `colSpan` becomes 6.
  - The cell shows `On <name>` when the unit has an open line. Otherwise it shows the hub label or `Not set`, plus a `Change where it is` icon button (`SwapHorizIcon`, `MutationIconButton`) when `editable` and the unit isn't Returning.
  - Use a button, not an inline select, so `pr3b-guards.test.tsx:220`'s unnamed combobox query stays unambiguous.
- **`UnitLocationDialog`** (local, modelled on "Add stock at a hub" `:647-720`, D38 EntityFormDialog):
  - title `Edit where it is`;
  - a `ReturnHubSelect` labelled `Where it is`, starting at the unit's hub only when it is in the list, else empty;
  - `Save` is disabled until the hub changes;
  - it sends `PATCH /api/inventory/units/<id> { hubId }`;
  - errors go through `apiErrorMessage(d, 'Could not save where the unit is.')`;
  - success toast `copy('unit.setLocation').success(name)`.
- **Copy:** key `'unit.setLocation': { success: (hub: string) => \`Unit is now at ${hub}.\` }` (after `:104-109`), plus its `copy-contract` row (`PATCH /api/inventory/units/[unitId]`, `D51: { hubId } → placeUnits sets where the unit is. Status and the item's home hub are unchanged.`).
- **Home hub labels:** the list column `Hub` (`:1975`), the drawer `Hub Location` (`:1176`) and the form `Hub Location` (`:477`) become `Home hub`. Update the `/Hub Location/` queries in `tests/components/uxp6-item-form.test.tsx`.
- **Add item form** (`:202`, `:264-266`):
  - The Add item button waits until `/api/inventory/hubs` has answered.
  - `defaultHubId` is computed when the form opens (in the `useState` initializer): the single active hub whose `name.trim().toLowerCase() === 'home lab'`, else `''`. It goes into both `values` and `initial`, so the form isn't dirty.
  - Replace the local `hubOptionLabel` (`:225-229`) with `hubLabel`.
  - Edit is unchanged, and so is the "add another" sticky hub.
  - The empty-category text (`:472-474`) becomes `No categories yet — add one in Settings.` (5.9 makes a category required).

**Not touched:** pickers and reservations (they offer units from any hub, as today), Scan's unit panel, Hub Inbound, the status portal, and the Close repair dialog (the unit's Where it is shows the result). Those wait for the Equipment overview.

**Tests.** Node `tests/p1-1c-where-things-are.test.ts` (harness as `tests/pr5b-dead-ends.test.ts`). Label rows that pass on the old code "regression guard".
- **5.1:**
  - End and bulk return to hub B → stock lands at B, `inventoryItem.hubId` is unchanged, and the unit is at B. A unit-less line's swept units are at B too.
  - A single return with `hubId` → the same.
  - The write-off branch (HUB + `IN_MAINTENANCE` consumable) → the home hub is unchanged, and no stock is restored.
  - A line drawn at B (home Home Lab) with no disposition (End auto-fill) → stock lands at B.
  - A unit line with no disposition, and a single return with no `hubId` → the unit returns to its own location, and its HUB_RETURN link names that hub.
  - A return naming an inactive hub → 409, nothing changed.
- **5.2:** the backfill: each unit takes its item's hub; units of a hub-less item stay empty; a unit already set is untouched; a second run changes 0 rows. Run the UPDATE extracted from the migration file.
- **5.3/5.4:**
  - End with INOPERABLE + `canBeFixed` + `hubId` → the new task's `returnDestinationType/Id` is that hub, `repairHubId` is null, and the unit is at that hub.
  - The same when the unit already had an open task (joined), on bulk return, and on a single return with `IN_MAINTENANCE` + `hubId`.
  - A single return with `IN_MAINTENANCE` and no hub → no return destination is set.
  - Unfixable damage → location unchanged.
  - `/complete` to HUB or OTHER_HUB → location = destination. DEPLOYMENT → unchanged.
  - Nothing else moves a unit: Start, Add items, transfer accept, decline and cancel from an ended deployment, hub Received, Dismiss, the link-issue fallback, field fix, a PATCH close, repair delete, retire and un-retire.
- **5.5:** new units start at the item's home hub. An item with no home hub → no location.
- **5.6:**
  - A serialized item homed at Home Lab with a unit at B is listed under B and counted in `total`.
  - A unit at B with an open line (a live deployment, or an ended deployment's line waiting on a transfer) doesn't list it. Nor does a retired or deleted unit, or a legacy unit on a consumable (stock decides).
  - A consumable with a stock row at B: quantity 0 → not listed; quantity 2 → listed.
  - The home hub still matches.
- **5.7:**
  - PATCH `{ hubId }` sets it and leaves status. An inactive hub → 400 `Pick an active hub.`
  - A unit with an open line, or Returning → 409. A deleted unit → 409 (existing).
  - The item GET carries `hub` and `onDeployment` (the ended-deployment waiting case included) and no user record.
- **5.8:** a hub with a serialized unit sitting there refuses deactivation with the message. A unit with an open line, a retired unit or a legacy consumable unit doesn't block. A Returning unit still gets the "mark them received" message first.
- **5.9:**
  - No category, `''`, `'SAMPLING_EQUIPMENT'` or an unknown id → 400 with `fieldErrors.categoryId`, never a 500.
  - A bad `itemType` → 400.
  - `{ name, categoryId, quantity: 5 }` with no hub → 400 `fieldErrors.hubId`. An unknown or inactive hub → 400.
  - Valid → 201.

UI `tests/components/p1-1c-where-things-are.test.tsx`:
- **Units tab:**
  - A unit with an open line reads `On <name>`, with no Change button. A Returning unit has no Change button either.
  - A unit at a hub reads its label; none reads `Not set`.
  - Change → pick a hub → Save sends the PATCH and toasts `Unit is now at <hub>.` Save is disabled until the hub changes. Cancel sends nothing.
  - A deleted item's drawer has no Change button.
- **Add item:** opens on Home Lab and isn't dirty.

Change:
- `tests/pr3b-guards.test.ts:67` (`unitsAtHub: 0`);
- `tests/components/uxp6-item-form.test.tsx` (the `Home hub` label);
- `tests/components/copy-contract.test.tsx` (the `unit.setLocation` row: rule 1 fails without it).

Must pass unchanged: `tests/pr3a-status-writers-guard.test.ts`, `tests/pr3a-asset-status.test.ts`, `tests/pr3a-status-owner-routes.test.ts`, `tests/pr6-serialized-only.test.ts`, `tests/data-integrity.test.ts:536,575`, `tests/transfer-lifecycle.test.ts`, `tests/ur029-repaired-unit-returns.test.ts`, `tests/cc34-orphan-closure.test.ts`, `tests/cc31-expired-hub-return.test.ts`, `tests/pr3c-delete-items.test.ts`, `tests/hotfix-no-full-user-rows-guard.test.ts`, `tests/components/pr3b-guards.test.tsx`, `tests/components/pr6-serialized-only.test.tsx`.

**Behaviour changes (PR body):**
- Returns no longer move home hubs. A return to an inactive hub is refused.
- Serialized units now have a location, set by returns, fixable damage and repairs closed to a hub. Existing units were backfilled from their item's hub.
- Fixable damage's hub is now the repair's return destination.
- The Inventory hub filter (now labelled `Where it is`) lists an item where it actually is.
- A return that names no hub sends equipment back to where it came from, not to Home Lab.
- A hub can't be deactivated while units sit there.
- `POST /api/inventory` needs a category, a valid type, and a hub for starting stock; `{ name, categoryId }` alone (quantity defaults to 1) needs a hub.
- The list and drawer say `Home hub`. Add item starts on Home Lab.

**Rollback** (add to `PILOT_ROLLBACK.md` in this PR, under §1): `**P1-1c (unit location, migration <ts>_p1_1c_unit_location).** Rolling back past it leaves inventory_units.hubId in place; the old revision ignores it. While the old revision serves, returns don't move units and rewrite item home hubs again. After rolling forward, run reads C2 and C3 in AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md §6 and fix each unit in Inventory → Units → Where it is. Never drop the column.`

**Acceptance (owner, app screens).** State Active Deployments first.
1. Return a test consumable to a hub → the item's home hub is unchanged → Inventory filtered to that hub lists it.
2. Return a test serialized unit to hub B → the item's Units tab reads B → filter = B lists the item.
3. Change where it is → another hub → toast `Unit is now at …`. A unit on a test deployment reads `On <deployment>`, with no Change button.
4. Hubs → Deactivate a test hub with a unit sitting there → red `… still has 1 unit — move it first …`.
5. Add item opens on Home Lab.

Item create rules: node tests only.

---

## 5 · Gate (every PR, before opening it)

`npx prisma generate` · `npx tsc --noEmit` (0) · `npx eslint .` (0 errors; no new warnings in touched files; state the count) · `npm run test:ui` (green) · `npm run build` · `wc -l "src/app/(operator)/operator/my-deployment/page.tsx"` ≤ 1467 · P1-1c: `scripts/check-migration-safety.sh "origin/development"` **after** committing.
- The DB suite runs in CI. State both suites' base and new counts (the `.test.ts` guards under `tests/components` run in both suites). A local Postgres must run in UTC, as CI's does.
- Under heavy machine load the UI suite's 5 s timeouts flake (STATUS §6). Re-run failing untouched files alone before reading anything into them.

Anchor greps:
- **After P1-1a:**
  - `grep -n "Note is required" "src/app/api/deployments/[id]/transfer/route.ts"` → 0
  - `grep -rn "'23505'" src/app` → 0
  - `grep -rn "Destination operator\|Target must be an active\|That operator is already the primary operator" src/app/api` → 0 (the add-crew route's `Operator is already the primary operator` stays)
  - `grep -rn "Deployment already ended\|Deployment has ended" src/app/api` → 0
  - no user-facing "handoff" string in `src/app/api/deployments/[id]/handoff/route.ts` or `src/app/api/handoffs/**`
  - `grep -c claimActiveRig` ≥ 1 in each of the end, items, `items/[kitItemId]`, vehicles, transfer, handoff and `handoffs/[id]/accept` routes
  - `grep -c lockRigs` ≥ 1 in transfer accept, decline and `transfers/[id]/route.ts`
- **After P1-1b:**
  - `grep -rnE "Transfer to (Another )?Operator|Destination [Oo]perator|Select operator" src --include=*.tsx` → 0
  - `grep -n "hubs\[0\]" src/components/shared/DispositionDialog.tsx` → 0
  - `grep -n '×\${ti.kitItem.quantity}' "src/app/(admin)/admin/deployments/page.tsx"` → 0
- **After P1-1c:**
  - `grep -rn -A3 "inventoryItem.update" src/app/api/deployments | grep -c hubId` → 0 (5 at `dd9f6ac`)
  - `grep -rn -A4 "inventoryUnit\.\(update\|updateMany\)(" src | grep hubId` → lines in `src/lib/asset-status.ts` only
  - `grep -c placeUnits src/lib/asset-status.ts src/lib/maintenance.ts "src/app/api/deployments/[id]/end/route.ts" "src/app/api/deployments/[id]/items/route.ts" "src/app/api/inventory/units/[unitId]/route.ts"` → each ≥ 1
  - `grep -n unitsAtHub src/lib/asset-references.ts` → ≥ 3

PR title `P1-1x · <plain outcome>`. Body: what/why, finding IDs, **Behaviour changes**, **Interpretations**, tests changed outside this packet's list, my-deployment line count, lint warning count.

## 6 · Owner steps and reads (Supabase SQL Editor, read-only)

Before P1-1a:
```sql
-- A1 · equipment already stranded on ended deployments. Any row: tell the session; clean up by hand in Admin → Deployments.
SELECT ki.id, r.id AS deployment FROM kit_items ki JOIN kits k ON k.id = ki."kitId" JOIN rigs r ON r.id = k."rigId"
WHERE r."endedAt" IS NOT NULL AND ki."removedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM transfer_items ti JOIN transfer_requests tr ON tr.id = ti."transferRequestId"
                  WHERE ti."kitItemId" = ki.id AND tr.status = 'PENDING');
-- A3 · lines and vehicles in more than one waiting transfer. Any row: cancel the extra transfer in Admin → Deployments → Pending Transfers before P1-1a merges.
SELECT ti."kitItemId", count(*) FROM transfer_items ti JOIN transfer_requests tr ON tr.id = ti."transferRequestId"
WHERE tr.status = 'PENDING' GROUP BY 1 HAVING count(*) > 1;
SELECT tv."vehicleId", count(*) FROM transfer_vehicles tv JOIN transfer_requests tr ON tr.id = tv."transferRequestId"
WHERE tr.status = 'PENDING' GROUP BY 1 HAVING count(*) > 1;
```
Before P1-1c (reads only; **change no serialized item's home hub before P1-1c**, because the backfill copies it into each unit):
```sql
-- C0 · home hubs as they stand (old returns moved them)
SELECT h."name", count(*) FROM inventory_items i LEFT JOIN hubs h ON h.id = i."hubId" WHERE i."deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC;
-- C1 · where the backfill will put units (NULL = no location)
SELECT h."name" AS hub, h."isActive" AS active, count(*) AS units FROM inventory_units u
JOIN inventory_items i ON i."id" = u."inventoryItemId" LEFT JOIN hubs h ON h."id" = i."hubId"
WHERE u."deletedAt" IS NULL AND u."status" <> 'RETIRED' AND i."itemType" = 'SERIALIZED' GROUP BY 1, 2 ORDER BY 3 DESC;
-- for information: existing items without a category are unchanged; only new ones need one
SELECT count(*) FROM inventory_items WHERE "categoryId" IS NULL AND "deletedAt" IS NULL;
```
After P1-1c deploys (in this order: C2 and C3 → fix units in Inventory → Units → Where it is → re-home items to Home Lab where wanted → Hubs → YS Shop → Deactivate):
```sql
-- C2 · units with no location, or at an inactive hub
SELECT i."name", u."serialNumber", h."name" AS hub, h."isActive" FROM inventory_units u
JOIN inventory_items i ON i."id" = u."inventoryItemId" LEFT JOIN hubs h ON h."id" = u."hubId"
WHERE u."deletedAt" IS NULL AND u."status" <> 'RETIRED' AND i."itemType" = 'SERIALIZED' AND i."deletedAt" IS NULL
  AND (u."hubId" IS NULL OR h."isActive" = false);
-- C3 · units whose last hub return names a different hub than their location (likely misplaced by the backfill;
--      required, since Scan returns between P1-1b and P1-1c were backfilled to the home hub)
SELECT i."name", u."serialNumber", hl."name" AS location, hr."name" AS last_returned_to, l."createdAt" FROM inventory_units u
JOIN inventory_items i ON i."id" = u."inventoryItemId"
JOIN LATERAL (SELECT sl."hubId", sl."createdAt" FROM status_links sl WHERE sl."inventoryUnitId" = u."id" AND sl."type" = 'HUB_RETURN'
              ORDER BY sl."createdAt" DESC LIMIT 1) l ON true
LEFT JOIN hubs hl ON hl."id" = u."hubId" LEFT JOIN hubs hr ON hr."id" = l."hubId"
WHERE u."deletedAt" IS NULL AND u."status" <> 'RETIRED' AND l."hubId" IS DISTINCT FROM u."hubId"
  AND NOT EXISTS (SELECT 1 FROM kit_items ki WHERE ki."inventoryUnitId" = u."id" AND ki."removedAt" IS NULL);
SELECT id, name FROM inventory_items WHERE "hubId" IS NULL AND "deletedAt" IS NULL; -- set each to Home Lab in Inventory → edit
```

## 7 · Merge and close (each PR, on the owner's go)

1. Owner's explicit go in chat; CI green.
2. Merge inside D48: after 20:00 Central, or when the admin dashboard shows 0 Active Deployments. Read the count and the time just before merging, and state both.
3. Watch `deploy.yml` through env-drift; `/api/health` 200; record the revision.
4. Smoke with the tab visible. Test data goes in through the app's screens, named "ZZ P1-1 … (throwaway)". State Active Deployments first. Physical and two-login rows are the owner's. Clean up through the app.
5. One docs-only commit (merged by the session on green):
   - **`CHANGELOG.md`:** a line (create it if absent: date · PR · outcome · revision).
   - **`STATUS.md`:** one RESUME BOX bullet (PR, squash, revision, the Active Deployments count and time, smoke result), the `_Last updated_` line, the §2 merged list, and §4 ticks: (b) and (c) at P1-1b, (a) at P1-1c. Step-7 anchors: P1-1a `claimActiveRig` (`src/lib/deployment-auth.ts`), P1-1b `ReturnHubSelect` (`src/components/shared/`), P1-1c `placeUnits` (`src/lib/asset-status.ts`).
   - **Device checklists, at P1-1b:**
     - `AHITS_A6_DEVICE_CHECKLIST.md` row 8 and `AHITS_A6_TESTER_CHECKLIST.md` §2.5 → `End a deployment: every line going to a hub needs one picked (nothing is pre-picked; "Return everything to" fills them all); return a consumable → that hub's stock went up by the returned quantity.`
     - Row 11, add `(a vehicle a crewmate checked today shows "Checked by …" and can't be started)`.
   - **Decisions** (below).

   No handoff file unless the session ends mid-work. Named files only.

**Decisions.** In the P1-1a PR itself (not the post-merge docs commit), commit both packet files, and append **D50, D51 and D52** together (house format, owner Max, PROPOSED), the **D10 note** (§0-n), a **D43 qualifier** and a **D49 qualifier**. Also add `00_START_HERE.md` rows: `build P1-1a/b/c → AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md (rev 4.1)` and `build P1-1d/e → AHITS_PACKET_P1-1de_RESERVATIONS_2026-10-25.md`.
- **D52 · Transfers are safe and say who they wait on.** Text: §0 a, b, c, s, t, j.
  - Rationale: transfers stranded gear, double-counted stock or 500'd (OP-2, OP-3, API-2…5, B4-4).
  - Revisit: a crew that needs one line in two transfers.
  - It flips ACTIVE when P1-1b merges.
- **D51 · Home hub stays put; units have a location.** Text: §0 d, e, f, r, plus: "One location writer, `placeUnits` in `asset-status.ts` (D42's module). New units start at the item's home hub, and existing units were backfilled from their item's hub at P1-1c. A unit with an open kit line is out and shows its deployment. Checkout, transfers, hub receipt, revoke, field fix, retire and un-retire leave its location as it is. The home hub never follows the location."
  - Rationale: returns moved home hubs, so "where it lives" and "where it is" were one field, and both were wrong (OP-4, A2-7).
  - Revisit: per-hub numbers on Inventory rows, or tracking units through repair shops (Equipment overview).
  - It flips ACTIVE when P1-1c merges.
- **D50:** the reservations packet's text (§7 there). It flips ACTIVE when P1-1e merges.
- **D43 qualifier:** `P1-1c (D51): a fixable damaged unit's picked hub is also its repair's return destination and its location; a repair closed to a hub moves the unit there.`
- **D49 qualifier:** `(from P1-1b) "Transfer to Operator" is now "Transfer to a person".`

No reverts without the owner's go.

**Parked (not in P1-1):**
- **Display:**
  - the mixed instant/day display of `nextDue` / `dateDelivered`;
  - the other `name — city, state` hub labels (`RepairReviewDialog.tsx:94`, operator `NewDeploymentDialog.tsx:465`, `my-deployment/page.tsx:1166`, `maintenance/page.tsx:783,1105`, `admin/requests/page.tsx:166`, `RequestComposer.tsx:440,652`).
- **Phase 3, Phase 2.1 and Phase 2.4:**
  - the rest of the shared return module (API-16), and unit-less serialized lines (API-6);
  - the sentence-case sweep and D11 amendment (Phase 2.1);
  - crew write rights (Phase 2.4).
- **Equipment overview:**
  - per-hub numbers on Inventory rows, and per-hub serialized low stock;
  - the hub shown in the Scan panel, pickers and the reservation checklist;
  - by-quantity serialized checkout preferring the source hub;
  - "Came from" for unit lines;
  - "At <shop>" while a unit is out for repair;
  - the Close repair hint.
- `sw.ts` offline cache of Hub Inbound.
- **P1-2:**
  - the post-commit idempotency release (B4-1);
  - B4-5 (a repair closed while its unit waits on an ended deployment's transfer frees it; more common under §0-s);
  - B3-15 (field fix has no custody check);
  - B1-8 (a blank "Can it be fixed?" counts as No);
  - B2-21 (the Return item quantity clamp);
  - B5 §3 (an add after an End answers 404, not "already ended");
  - decline/cancel sweeping a legacy consumable's units without the other-deployment check;
  - a normal deployment-transfer accept leaving waiting selected-equipment transfers waiting;
  - the other integrity, offline and security findings.
- **Owner to know:**
  - A4-18: an admin acting as an operator sees the own-check notice for other people's checks.

## 8 · Paste prompts

Build P1-1a:
```
Build P1-1a in AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md (repo root; rev 4.1), exactly as written: the override line under the banner, §0, the P1-1a section, §5, §7. Follow CLAUDE.md except where the packet overrides it. Both packet files (this one and AHITS_PACKET_P1-1de_RESERVATIONS_2026-10-25.md) are untracked in the repo root: commit them on this branch. Branch feature/<YYYYMMDD>/Agricarbon-USA-p1-1a-transfers-end from current development. Owner reads A1 and A3 are done. Named files only. Open the PR to development titled "P1-1a · Transfers and End are safe" and give me the number when CI is green. Do not merge it. No reverts.
```
Build P1-1b (after P1-1a merges) and P1-1c (after P1-1b merges): the same prompt, with "P1-1b · Screens tell the truth" / "P1-1c · Where things are" and branch suffix `p1-1b-screens` / `p1-1c-where-things-are`. For P1-1c add: "run scripts/check-migration-safety.sh after committing; owner reads C0 and C1 are done (reads only)".

Merge (any of the three, after my go):
```
Go on PR #<n>. Follow §7 of AHITS_PACKET_P1-1_FIELD-FLOWS_2026-10-23.md: merge only inside D48 and state the Active Deployments count and the time read; watch the deploy through env-drift and /api/health; smoke the PR's acceptance rows with the tab visible and test data through the app's screens; clean up; then the one docs-only commit (§7.5) and merge it on green. No reverts. Report back.
```

## 9 · Findings ledger: rejected, moved, superseded (everything else is applied)

| Finding | Verdict | Why |
|---|---|---|
| A4-1 / A7-2 (exclude Hub Inbound from the SW cache) | Rejected, parked | It would ship a new service worker to every phone for an admin-only screen. The local drop plus a refetch already closes STATUS §4(c). |
| A1-10 / A7-16 (plain-string 400 envelope) | Rejected | `flatten()` is kept; every caller reads both. Only the missing person is a plain string (2.1). |
| A7-17 (Prisma `updateMany` for the force cancel) | Rejected | Raw `RETURNING`, so a transfer accepted in between is never told it was cancelled. |
| D1-3 (`repairHubId` fallback) | Rejected | `repairHubId` means "Ship to Hub", not the return destination (A2-1). |
| D1 (handoff index in verify.yml) | Rejected | The test creates and drops it itself (A8-11). |
| A2-4 (Close repair "Returned to <hub>" hint) | Superseded by §0-r | The unit's Where it is shows the same thing. |
| CR3-5 / D1r3-7 (End refuses TRANSFER on any waiting line) | Rejected for the wholly waiting case | End must always be able to finish. A wholly waiting line is skipped whatever its disposition; only a partly waiting line refuses TRANSFER. |
| B4-4 remainder (decline/cancel from a stale read) | Applied (2.5 lockRigs + in-transaction re-read) | It was parked in rev 3; the 2.8 partial path made it reachable. |
| A7-3/4/9/13/14/15/20/21/23, A8-3/6/8, A5, A6, D3 | Moved | They are in the reservations packet. |
