# AHITS — Session 10 Addendum: #29 Outcome, Field Feedback, and Revised Workplan

_Prepared 2026-06-24, appended to `AHITS_SESSION10_ANALYSIS_AND_PLAN.md`. Records what shipped in the #29 deployment-model refactor this session, then folds a round of field feedback (Requests, Inventory, Vehicles, My Rig) into the forward workplan with root-cause + fix + sequencing for each._

---

## 1. What shipped this session — #29 deployment-model refactor

The refactor ran as a disciplined **expand → migrate → contract** sequence, each slice a small PR, verified `tsc`/`lint` clean with a SQL consistency gate, deployed to staging, no regression to existing flows.

| Slice | PR | What landed |
|---|---|---|
| Foundation | #79 | `DeploymentProject` (Rig↔Project M2M) + `DeploymentAssignment` (PRIMARY/SECONDARY history) tables + backfill; raw-SQL data layer. No reader rewired. |
| 1 — dual-write (expand) | #80 | Every writer (create, add/remove operator, end, transfer-accept, **+ the PATCH re-project path caught by a completeness grep**) now writes the new tables transactionally. |
| 2 — reader-migration (migrate) | #81 | `getDeploymentRosters` sources operator/project/secondary from the new tables; API response shape preserved so no page changed. Merge-base hazard (branch cut before #80) caught and resolved as a union merge. |
| 3a — handoff backend | #82 | `DeploymentHandoff` model + endpoints (initiate / accept / decline / cancel / admin-force), `reassignPrimary` keeps assignments + legacy column + vehicle assignment in sync, audit-logged, one-pending-per-rig partial unique index. |
| 3b — handoff UI | #83 | Operator initiate/accept/decline/cancel in My Rig, nav badge, admin force-reassign — mirrors the transfer UI. |

**Still owed on #29:**
- **Real-data smoke** of the `reassignPrimary` transaction (3a couldn't run it — staging had only 2 operators, both with active rigs). Manual on the staging UI: free an operator (end a deployment) → hand off → accept → verify the assignment swap, `rigs.operatorId`, vehicle reassignment, and the `active_rigs = open_primary` gate.
- **Slice 4 — contract** (the only irreversible step): pre-check for any operator with two open PRIMARY assignments, add the one-active-PRIMARY-per-operator partial unique index, then retire the legacy `Rig.operatorId`/`projectId`/`rig_operators` columns. Let 3b soak on staging first; confirm nothing else reads those columns before dropping.

**Operational note:** `DIRECT_URL` is now pinned to the Supabase **session pooler** (the A2 fix), so `make db-migrate` works from the dev machine — partial knock-out of an M0 pilot gate. Persist it in env notes.

---

## 2. Field feedback — root cause, fix, and where it slots

Grounded against the codebase. None of these conflict with the #29 work (that was operator/project assignment — orthogonal to inventory/requests), so there is no backtracking on what shipped today. The rework concentrates in the Requests feature and inventory's single-hub assumption.

### 2.1 Consumable availability — **bug, SHIPPED as PR #84**

> **Shipped 2026-06-24 — PR #84** (`fix-consumable-availability`), `tsc`/`lint` clean, staging-deployed. Touches `src/app/(operator)/operator/my-rig/page.tsx` only:
> - Added `availableQuantity: number` to the inventory-item (`InventoryOption`) interface.
> - Added an `availFor()` helper routing to `unitCounts.available` for SERIALIZED and `availableQuantity` for CONSUMABLE.
> - Replaced the 2 picker filters (`NewDeploymentDialog` + Add-Items) `(i.unitCounts?.available ?? 0) > 0` → `availFor(i) > 0`.
> - Replaced the 6 quantity-input references (3 per dialog) `item.unitCounts?.available ?? 1/0` → `item.availableQuantity ?? 0`. Serialized branch (unit picker) untouched.
>
> ⚠️ **Cross-PR note (merge ordering):** PR **#83** (handoff UI, slice 3b) contains its own copy of this same buggy `my-rig/page.tsx` and has the same bug. Whichever of #83/#84 merges to `development` second must **rebase** to pick up the other's change. CC confirmed the edits are on **different lines**, so it should be a **non-conflicting** merge — but verify after the first of the two lands. (If #83 already merged before #84 was cut, #84 carries the fix forward and #83 needs nothing further.)

**Symptom:** consumables show as limited / capped at 1 in My Rig, and "the list does not show all items."
**Root cause (client-side):** the data model and API are correct — `deriveQuantities()` returns `availableQuantity = InventoryItem.quantity` for consumables, and `GET /api/inventory` exposes it (`route.ts` line 65). But `my-rig/page.tsx` uses `unitCounts.available` (the count of serialized `InventoryUnit` rows, which is 0 for a consumable) in three places: the picker filter (`availableItems`, line 176), the consumable quantity cap/helper (lines 351/355/356), and a second "add items" picker filter (line 1310). So a consumable with 5,000 in stock reads "0 avail.", caps at 1, and is filtered out of the list entirely.
**Fix:** add `availableQuantity` to the item interface; introduce `availFor(item) = itemType === 'SERIALIZED' ? unitCounts.available : availableQuantity`; use it in both filters and the consumable cap/helper. UI-only, no migration.
**Slot:** **hotfix, do first.** Unblocks real field use. Per-operator consumable allocation (op1 has 250, op2 has 30) already works once the cap is removed.

### 2.2 Multi-hub inventory stock — **model change, prerequisite for Reserve**

**Symptom:** the same item can only live at one hub; doesn't match a distributed team.
**Root cause:** `InventoryItem.hubId` is a single FK (one item → one hub).
**Fix:** introduce `InventoryStock(itemId, hubId, quantity)` so one item has per-hub stock rows. Checkout draws from a **chosen** hub's row, returns restore to a hub, low-stock alerts become per-hub. Significant — touches checkout/return/low-stock; run it as its own expand→migrate→contract sequence like #29.
**Decision (confirmed):** operators **pick the hub each checkout** — no defaulting to home hub.
**Slot:** **M2 inventory, before the Requests redesign** (a reservation targets a specific hub's stock, so per-hub stock must exist first).

### 2.3 Requests → "Material Request" page with a Rig Reservation mode — **redesign**

**Symptom / intent:** one surface should capture two situations — (1) **Rig Reservation**: reserve a rig/kit before arriving, routed to the **Hub** to confirm/deny/prepare; (2) **Material request**: in-field request for consumables / replacement gear / new purchased items / shipping labels, routed to the **admin**, who fulfills directly or forwards to a Hub or another operator.
**Root cause / current state:** one `DeploymentRequest` model, **admin-only** at `/admin/requests`, funnels only to admin, never a Hub. Line items reference a **category** dropdown only — the model already has unused `specificInventoryItemId` / `specificVehicleId` columns; `requestedQty` already exists; there is no specific-serialized-unit field yet.
**Fix:**
- Add a `requestType` discriminator (`RESERVATION` | `MATERIAL`) + a routing target (`fulfillerHubId` / `fulfillerOperatorId`) + lifecycle states for forwarded/fulfilled.
- **One operator-facing page titled "Material Request,"** with a **"Rig Reservation" mode** inside it (a toggle at the top selects which situation; the form adapts — Reservation requires a target Hub, Material is free-form and routes to admin). _(Confirmed direction; open to a clearer label if one emerges in build.)_
- Replace the category-only dropdown with a **specific-item picker** (keep category as an optional "any item in this category" fallback), expose **qty** (already present), and add **specific vehicle** (field exists) + **specific serialized unit** (small additive `specificInventoryUnitId` column).
- Route notifications through the existing dispatcher; Reservation → Hub (reuses the tokenized hub-portal primitive), Material → admin with a forward action.
**Slot:** **expanded M6 (Requests)** — this is the convergence of the deferred #31 "staging/reserve" half and the external hub portal. **Depends on 2.2 (multi-hub).**

### 2.4 Vehicles — filters + hub-based location — **M2 build-out**

**Symptom:** no list filters/sorting; location is free-text.
**Root cause:** the Vehicles page has no filter UI; `Vehicle.location` is a plain `TextField` (`vehicles/page.tsx:401`); no `hubId`.
**Fix:** add `Vehicle.hubId` FK with a Hub dropdown (replace free-text location); surface operator (`assignedOperatorId` already exists) and project (now via `deployment_projects`) associations; add list filters/sorting on Location (Hub/Project), Operator, Type, Status.
**Slot:** **M2 #13 (Vehicles admin page)** — fold these in.

### 2.5 My Rig list completeness — resolved by 2.1

The "list does not show all items available" is the same root cause as 2.1 (consumables filtered out by the `unitCounts.available > 0` test). Fixed by the hotfix. Separately, the inventory fetch uses `pageSize=200`; raise or paginate if the catalog exceeds ~200 items (latent, not urgent).

### 2.6 Hand Off vs Transfer (clarification, not a bug)

- **Transfer Equipment** = move specific items/vehicles (partial or full) out of one rig into another operator's rig; each operator keeps their own deployment.
- **Hand Off Deployment** = the same rig (vehicles, kit, identity, history) stays intact and only its **primary operator** changes.
Equipment-level move vs whole-deployment ownership change. In the Requests/UX cleanup, label by intent ("Send equipment to someone" vs "Take over this deployment") to remove ambiguity.

---

## 3. Revised forward workplan (dependency-ordered)

1. ~~**Consumable-availability hotfix** (My Rig)~~ — ✅ **shipped, PR #84.** (Watch the #83/#84 rebase ordering — see §2.1.)
2. **#29 slice 4 — contract** — after 3b soaks + the real-data smoke passes. Irreversible; soak first.
3. **Vehicles build-out** — `hubId` FK + filters/sorting (M2 #13). Self-contained.
4. **Multi-hub inventory stock** (`InventoryStock`) — model change; expand→migrate→contract; prerequisite for Reserve.
5. **Requests → "Material Request" + Rig Reservation redesign** — operator-facing; Hub/admin/operator routing; specific item/unit/vehicle pickers. Depends on #4; converges with #31 + hub portal.
6. **Operator read-only visibility** (Dashboard/Inventory/Deployments/Vehicles/Maintenance/Hubs/Projects) — shared read-only mode; pairs with #5 (operators need to see inventory/hubs to request against them).
7. **Shippo integration** (Phase 3) — independent; track-only first cut.

Standing M0 pilot gates remain (prod DB standup; migrate-on-deploy automation — partially advanced by the pooler `DIRECT_URL` fix; A6 real-device offline pass).

---

## 4. Open questions to resolve before building #5

- Final label/IA for the combined page ("Material Request" tab with a "Rig Reservation" mode confirmed as the working direction).
- For Material requests forwarded to a Hub, do they reuse the same tokenized hub-portal link as reservations, or a lighter admin-internal assignment? (Recommend: same primitive, scoped per request.)
