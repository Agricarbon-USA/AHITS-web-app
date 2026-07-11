# AHITS — Multi-Hub Inventory: MIGRATE Slice (Design + CC Script)

_Prepared 2026-06-25. The MIGRATE half of workplan §2.2, building on the `InventoryStock` EXPAND foundation shipped in Session 11 (`src/lib/inventory-stock.ts`, migration `…_inventory_stock`). Wires checkout / return / low-stock onto per-hub stock with the operator picking the source hub, while keeping `InventoryItem.quantity` correct as the cross-hub total. Also lands the `reservedQty` column that Requests slice R4 (hub-stock hard-reserve) depends on. Grounded in the live consumable-accounting paths (verified from source 2026-06-25)._

---

## 1. The live paths this slice rewires (from source)

Consumable stock today is a single `InventoryItem.quantity`, drawn/restored in four places, scanned in one:

- **Checkout draw (×2):** `deployments/route.ts` (~L237–265, new-deployment) and `deployments/[id]/items/route.ts` (~L189–215, add-items). Both atomically draw `InventoryItem.quantity` (guarded `updateMany quantity >= n`, with a stale-stock partial-draw fallback) and record the actual `drawnQuantity` on the `KitItem`.
- **Restore (×2):** `deployments/[id]/end/route.ts` (~L97–100, HUB disposition → `increment: drawnQuantity`) and `deployments/[id]/items/[kitItemId]/route.ts` (~L89–118, partial/full good return → decrement `drawnQuantity`, increment `quantity` by `restoreQty`).
- **Low-stock scan (×1):** `cron/dispatch/route.ts` (~L57–75) — item-level `quantity <= lowStockThreshold` → `LOW_INVENTORY` alert.

`KitItem` already carries `drawnQuantity` (restore-exactly-what-was-drawn, CR-1a). It does **not** record *which hub* the stock came from — the one missing piece for a correct per-hub return.

## 2. Strategy: dual-write, keep the item total authoritative-as-sum

Expand→migrate→contract, mirroring #29 so correctness never regresses:

- **EXPAND (done):** `InventoryStock(itemId, hubId, quantity)` + backfill from each consumable's `(hubId, quantity)`; no reader rewired.
- **MIGRATE (this slice):** the per-hub `InventoryStock` row becomes authoritative for *where* stock lives; **`InventoryItem.quantity` is kept in sync as the sum across hubs** (dual-write). So every existing reader of `InventoryItem.quantity` — the inventory list's "N available", `deriveQuantities`, the item detail — stays correct as the **total**, while draws/returns become hub-scoped. A checkout decrements *both* the chosen hub's row *and* the item total; a return increments *both* the recorded source-hub row *and* the item total.
- **CONTRACT (later, small):** once nothing treats `InventoryItem.quantity` as a single-hub bucket (already true after migrate), it is simply the denormalized cross-hub total — keep it as a cache or derive it. A periodic reconciliation (`SUM(inventory_stock.quantity) == inventory_items.quantity`) guards drift. No destructive change required.

This dual-write keeps the blast radius near zero: no existing list/detail surface changes behaviour, only the *source* of a draw becomes a specific hub.

## 3. Model changes (additive)

```prisma
// KitItem — remember which hub a consumable draw came from, so the return
// restores to the SAME hub (not just the right quantity).
model KitItem {
  …
  drawnHubId String?   // hub the drawnQuantity came from; null for serialized / legacy
}

// InventoryStock — add the reserve counter Requests R4 needs. availableAtHub =
// quantity - reservedQty. Unused until R4 wires staging/release; additive now so
// R4 is pure logic.
model InventoryStock {
  …
  reservedQty Int @default(0)
}
```

Migration `…_multihub_migrate`: `ALTER TABLE "kit_items" ADD COLUMN "drawnHubId" TEXT;` (+ index), `ALTER TABLE "inventory_stock" ADD COLUMN "reservedQty" INTEGER NOT NULL DEFAULT 0;`. No backfill needed (legacy `drawnHubId` null is handled by the restore fallback in §5).

## 4. Decisions (locked unless you say otherwise)

1. **One source hub per checkout** (per new-deployment and per add-items batch), selected by the operator — *not* per line. Matches the reservation-targets-one-hub model and keeps the picker simple. Per-line hubs are a future refinement. _(Addendum §2.2: "operators pick the hub each checkout — no defaulting to home hub.")_
2. **Insufficient hub stock → hard fail** with a clear message ("Only N of <item> at <hub>"), rather than the legacy silent partial-draw. The operator chose a hub; if it's short they pick another or lower the qty. This is a deliberate, correct behaviour change for the multi-hub world.
3. **`reservedQty` ships now** (additive, default 0), wired by R4 — not this slice.
4. **Legacy `drawnHubId` null** on return → restore to the item's `InventoryItem.hubId` if set, else create/raise the item-total only (never lose stock). Keeps in-flight deployments from before this slice safe.

## 5. Behaviour after this slice

- **Checkout (both sites):** the request carries `sourceHubId`. For each CONSUMABLE line, draw via `drawFromHub(itemId, sourceHubId, qty)` (guarded; returns amount drawn). If it returns < qty → throw `INSUFFICIENT_HUB_STOCK` (hard fail, §4.2). On success, **also** decrement `InventoryItem.quantity` by the same amount (dual-write the total) and record `drawnQuantity` + `drawnHubId` on the `KitItem`. Serialized path unchanged.
- **Return / end (both sites):** restore via `restoreToHub(itemId, kitItem.drawnHubId ?? item.hubId, restoreQty)` **and** increment `InventoryItem.quantity` by `restoreQty` (dual-write). Exactly the existing `drawnQuantity`/`restoreQty` arithmetic (CR-1a invariants preserved), now hub-aware.
- **Low-stock:** the cron scan moves to per-hub via `lowStockByHub()` (already in the data layer) — one `LOW_INVENTORY` alert per (item, hub) below threshold, with the hub in the alert meta/message. The item-level scan is retired in the same change (per-hub supersedes it).
- **Operator UI:** the my-rig **New Deployment** and **Add Items** dialogs gain a required **Source hub** `<Select>` whenever the kit includes a consumable, showing per-hub availability beside each consumable line (`listItemStock`). Routed through the offline queue like the rest of the operator loop.

## 6. Build sequence

- **MH-1 (backend + operator picker):** §3 model + the four draw/restore rewires + per-hub low-stock + the operator source-hub picker. The complete functional loop. Correctness-critical → must pass the vitest consumable-scoping/transfer specs (Postgres service container, CI).
- **MH-2 (admin per-hub stock):** inventory item detail shows the per-hub breakdown and lets an admin set/move stock between hubs (`setStockAtHub`). Follow-on; makes distributing stock self-serve. Until it lands, the backfill (each item's stock at its home hub) + `setStockAtHub` via a quick admin action covers it.

After MH-1 lands, **Requests R4** is unblocked.

---

## 7. CC script — MH-1 (paste after the R1–R3 staging verification passes)

```
Build the multi-hub MIGRATE slice (MH-1) on AHITS. Spec: AHITS_MULTIHUB_MIGRATE_DESIGN.md — read §1–§5 before coding. Builds on the InventoryStock EXPAND foundation (src/lib/inventory-stock.ts). Correctness-critical: it changes consumable accounting, so it MUST pass the vitest consumable/transfer specs in CI. tsc/lint clean.

Branch: git checkout development && git pull; git checkout -b "feature/$(date +%Y%m%d)/$(gh api user --jq .login)-multihub-migrate"

1. Schema + migration (additive):
   - prisma/schema.prisma: add KitItem.drawnHubId (String?, + @@index), InventoryStock.reservedQty (Int @default(0)).
   - prisma/migrations/<UTC-ts>_multihub_migrate/migration.sql: ALTER TABLE "kit_items" ADD COLUMN "drawnHubId" TEXT; CREATE INDEX … ON "kit_items"("drawnHubId"); ALTER TABLE "inventory_stock" ADD COLUMN "reservedQty" INTEGER NOT NULL DEFAULT 0;
2. Extend src/lib/inventory-stock.ts: add availableAtHub(itemId,hubId) = quantity - reservedQty (raw SQL); keep drawFromHub guarded on (quantity - reservedQty) >= qty. Do NOT wire reservedQty changes anywhere (that's R4).
3. Rewire the two checkout draws — deployments/route.ts (~L237–265) and deployments/[id]/items/route.ts (~L189–215):
   - Accept sourceHubId on the request body (zod). Required when any line is CONSUMABLE; 400 if missing.
   - For each CONSUMABLE line: drawFromHub(itemId, sourceHubId, qty) inside the txn. If drawn < qty, throw INSUFFICIENT_HUB_STOCK → 409 with "Only <n> of <item> at <hub>". On success ALSO decrement InventoryItem.quantity by the drawn amount (dual-write the cross-hub total), and write drawnQuantity + drawnHubId on the KitItem.
   - Serialized path unchanged. Use the same raw-SQL helpers from inventory-stock.ts (the generated client lacks these columns until db-generate).
4. Rewire the two restores — deployments/[id]/end/route.ts (~L97–100) and deployments/[id]/items/[kitItemId]/route.ts (~L89–118):
   - restoreToHub(itemId, kitItem.drawnHubId ?? item.hubId, restoreQty) AND increment InventoryItem.quantity by restoreQty. Preserve the existing drawnQuantity/restoreQty arithmetic and the concurrent-return guard exactly.
5. Low-stock scan — cron/dispatch/route.ts (~L57–75): replace the item-level scan with lowStockByHub(); raise/clear LOW_INVENTORY per (item,hub), hub in the alert meta + presentAlert message. createAlert source stays 'inventory_items' but include hubId in the activeKey/meta so per-hub alerts dedupe independently.
6. Operator UI — my-rig New Deployment + Add Items dialogs: add a required "Source hub" Select (GET /api/hubs) shown whenever the kit has a consumable; show per-hub availability beside each consumable line (GET /api/inventory exposes stock, or add it). Send sourceHubId in the checkout body through useOfflineQueue().mutate.

Then per CLAUDE.md, BEFORE committing: make db-generate; make db-migrate. Verify npx tsc --noEmit (0); npx eslint . (0 errors); and that the vitest suite passes in CI (it gates the PR). Commit, push, PR to development, run pr-staging-deploy.yml, gh run watch. Report the PR number and call out anything in the consumable-accounting specs that needed adjusting.
```

### MH-2 (after MH-1 merges)
"Build MH-2 per AHITS_MULTIHUB_MIGRATE_DESIGN.md §6 — the admin inventory item detail per-hub stock breakdown + set/move stock between hubs via setStockAtHub (a small POST/PATCH on /api/inventory/[id] or a new /stock route, requireAdmin). Branch off development; migration only if a move-ledger is added; tsc/lint clean; PR + staging deploy."
```
