# Claude Code Instructions — Item Disposition Feature

## Context

Currently, when a deployment ends or an item is removed from a kit, items are silently
set back to AVAILABLE. This feature replaces that silent transition with an explicit
**disposition step** — the operator must declare what is happening to every item.

Possible dispositions:
- **Return to Hub** — item goes back to a hub and becomes AVAILABLE
- **Transfer to Operator** — initiates the existing pending transfer flow
- **Inoperable** — item is damaged or broken; triggers a repair/retirement workflow

A new **INOPERABLE** status is introduced. Inoperable items require admin approval
before they can be retired or sent for repair.

Shippo shipping label creation is **out of scope** for this task — add a disabled
placeholder button labelled "Create Shipping Label (coming soon)" wherever it is called
for below, and add a `// TODO: Shippo integration` comment.

---

## Step 1 — Schema changes

### Add `INOPERABLE` to the `EquipmentStatus` enum

```prisma
enum EquipmentStatus {
  AVAILABLE
  CHECKED_OUT
  IN_MAINTENANCE
  INOPERABLE   // ADD THIS — pending admin review before RETIRED
  RETIRED
}
```

### Add `RepairType` enum (new)

```prisma
enum RepairType {
  IN_FIELD       // Fixed on-site by the operator
  AT_SHOP        // Taken to a local shop
  SHIP_TO_HUB    // Shipped back to one of Agricarbon's hubs for repair
  SHIP_FOR_REPAIR // Shipped to an external repair facility
}
```

### Update `MaintenanceTask` model

The existing model is designed for scheduled interval maintenance. For damage-triggered
repairs, intervals don't apply. Make `intervalType` and `intervalValue` nullable and add
repair-specific fields:

```prisma
model MaintenanceTask {
  // Existing fields — change these two from required to optional:
  intervalType   IntervalType?     // was required, now nullable
  intervalValue  Int?              // was required, now nullable

  // ADD these new fields:
  isDamageReport Boolean           @default(false)
  repairType     RepairType?
  shopName       String?
  shopAddress    String?
  dateDelivered  DateTime?         // Date item was delivered to shop or hub
  purchaseOrder  String?
  invoiceNumber  String?
  repairHubId    String?           // Which hub it was shipped to (SHIP_TO_HUB)
  repairHub      Hub?              @relation(fields: [repairHubId], references: [id])

  // All other existing fields remain unchanged
}
```

Add the relation on `Hub` model:
```prisma
// In Hub model, add:
repairTasks  MaintenanceTask[]
```

### Update `InventoryItem` model

Add three fields for tracking the inoperable report:

```prisma
model InventoryItem {
  // ADD:
  inoperableNotes      String?    // Operator's description of what is wrong
  inoperableReportedAt DateTime?  // When it was marked inoperable
  inoperableReportedById String?  // Which operator reported it
  inoperableReportedBy User?      @relation("InoperableReports", fields: [inoperableReportedById], references: [id])
}
```

Add the relation on `User` model:
```prisma
// In User model, add:
inoperableReports  InventoryItem[]  @relation("InoperableReports")
```

### Run migrations

```bash
npx prisma migrate dev --name item-disposition
npx prisma generate
```

---

## Step 2 — Shared `DispositionDialog` component

Create `src/components/shared/DispositionDialog.tsx` as a `'use client'` component.

This dialog is shown whenever items are being removed from a kit — either during
deployment end or mid-deployment item removal. It follows a **bulk-first, exceptions-after**
pattern.

### Props

```typescript
interface KitItemSummary {
  kitItemId: string
  itemId: string
  name: string
  quantity: number
  itemType: 'SERIALIZED' | 'CONSUMABLE'
}

interface DispositionDialogProps {
  open: boolean
  items: KitItemSummary[]
  deploymentId: string        // rigId
  onComplete: () => void      // called after all dispositions submitted
  onClose: () => void
  mode: 'end-deployment' | 'remove-items'
}
```

### Step 1 — Bulk destination

Title: "Where is this equipment going?" (or "Where is this item going?" for single item)

Three large option cards, side by side:

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  🏠 Return to Hub │  │  👤 Transfer to   │  │  ⚠️  Inoperable  │
│                  │  │     Operator      │  │                  │
│  Select a hub    │  │  Initiate a       │  │  Item is damaged  │
│  below           │  │  pending transfer │  │  or broken       │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

- If **Return to Hub** selected: show a hub dropdown below the cards
- If **Transfer to Operator** selected: show operator dropdown (existing transfer UI)
- If **Inoperable** selected: skip to the Inoperable flow (Step 3 below)
- For multiple items: show a "Apply to all items" button for Return to Hub / Transfer

### Step 2 — Review & exceptions (multi-item only)

Shown after bulk selection when there are multiple items. A table:

| Item | Qty | Destination | Change |
|------|-----|-------------|--------|
| Christie Drill | 1 | Piedmont Hub | [Change ▾] |
| Sample Bags | 20 | Piedmont Hub | [Change ▾] |
| GPS Unit | 1 | **⚠️ Inoperable** | [Change ▾] |

Each row's "Change" dropdown lets the operator switch that item's disposition independently.
Items marked Inoperable are highlighted in amber.

"Confirm" button at the bottom proceeds to handle any inoperable items (Step 3), then
submits all dispositions.

### Step 3 — Inoperable item flow (one item at a time)

For each item marked Inoperable, show a dedicated screen:

---
**"[Item Name] — What happened?"**

Required photo upload (at least one photo required):
> "Attach at least one photo showing the damage"
> [📷 Add Photos]  ← uses same upload pattern as NotePhotoDialog

Required description field:
> "Describe the issue" (multiline, required, min 10 characters)

---

**"Can the [Item Name] be repaired?"**

Two buttons: **Yes, it can be repaired** / **No, it needs to be retired**

**If NO:**
> "This item will be marked Inoperable and flagged for admin review. An admin will
> approve retirement."
> [Confirm — Mark as Inoperable]

**If YES:** show repair type selector:

```
How will it be repaired?

○  Fix it in the field
○  Take it to a shop
○  Ship it to a hub
○  Ship it for external repair
```

**If "Fix it in the field":**
- No additional fields — item stays IN_MAINTENANCE, notes captured
- Creates a MaintenanceTask (repairType: IN_FIELD, isDamageReport: true)

**If "Take it to a shop":**
- Shop Name (text, optional for now)
- Shop Address (text, optional)
- Date Delivered (date picker, optional)
- Purchase Order / Invoice # (text, optional)
- [Create Shipping Label — coming soon] ← disabled button with TODO comment
- Creates a MaintenanceTask (repairType: AT_SHOP, isDamageReport: true)

**If "Ship it to a hub":**
- Hub selector (dropdown of active hubs) — required
- Date Shipped (date picker, optional)
- [Create Shipping Label — coming soon] ← disabled button
- Creates a MaintenanceTask (repairType: SHIP_TO_HUB, repairHubId, isDamageReport: true)

**If "Ship for external repair":**
- Shop Name (text, optional)
- Shop Address (text, optional)
- Date Delivered (date, optional)
- Purchase Order / Invoice # (text, optional)
- [Create Shipping Label — coming soon] ← disabled button
- Creates a MaintenanceTask (repairType: SHIP_FOR_REPAIR, isDamageReport: true)

---

### Step 4 — Note & Confirm

Final screen showing a summary of all dispositions:

```
Summary:
• Christie Drill → Piedmont Hub
• Sample Bags (20) → Piedmont Hub
• GPS Unit → Inoperable (pending admin review)
• Handheld Radio → Transfer to Jane Doe (pending acceptance)
```

Required note field: "Describe what happened overall" (applies to the whole action)

"Confirm" → submits everything

---

## Step 3 — API changes

### `POST /api/deployments/[id]/end` — update body schema

New body:

```json
{
  "note": "string (required)",
  "itemDispositions": [
    {
      "kitItemId": "string",
      "type": "HUB | TRANSFER | INOPERABLE",
      "hubId": "string (required if type=HUB)",
      "toOperatorId": "string (required if type=TRANSFER)",
      "canBeFixed": "boolean (required if type=INOPERABLE)",
      "repairType": "IN_FIELD | AT_SHOP | SHIP_TO_HUB | SHIP_FOR_REPAIR (if canBeFixed=true)",
      "shopName": "string?",
      "shopAddress": "string?",
      "dateDelivered": "ISO date?",
      "purchaseOrder": "string?",
      "invoiceNumber": "string?",
      "repairHubId": "string? (if repairType=SHIP_TO_HUB)",
      "inoperableNotes": "string (required if type=INOPERABLE)",
      "photoUrls": ["string (required if type=INOPERABLE, min 1)"]
    }
  ]
}
```

Processing logic (in a transaction):
1. Set `Rig.endedAt = now()`
2. For each `itemDisposition`:
   - **HUB**: set `KitItem.removedAt`, create CHECK_IN CheckLog (notes: body.note),
     set `InventoryItem.status = AVAILABLE`, set `InventoryItem.hubId = disposition.hubId`
   - **TRANSFER**: set `KitItem.removedAt`, create a `TransferRequest` (PENDING) exactly
     as the existing transfer endpoint does — equipment does not move yet
   - **INOPERABLE (canBeFixed=false)**: set `KitItem.removedAt`, create CHECK_IN CheckLog,
     set `InventoryItem.status = INOPERABLE`, set `inoperableNotes`, `inoperableReportedAt = now()`,
     `inoperableReportedById = session.userId`, create Photo records for each photoUrl
     linked to the item
   - **INOPERABLE (canBeFixed=true)**: same as above BUT set status to `IN_MAINTENANCE`
     instead of INOPERABLE, and create a `MaintenanceTask` with `isDamageReport: true`,
     `repairType`, and any shop/hub fields provided
3. For all active `RigVehicle` records: clear `Vehicle.assignedOperatorId`

### `DELETE /api/deployments/[id]/items` — update body schema

Same disposition structure per item as above. If only one item is being removed, the
array has one entry. Processing is identical to the end-deployment handler.

### New: `POST /api/inventory/[id]/review-inoperable` (admin only)

Called when an admin reviews an INOPERABLE item and makes a decision.

Body:
```json
{
  "decision": "RETIRE | REPAIR",
  "note": "string (required)",
  "repairType": "RepairType (required if decision=REPAIR)",
  "shopName": "string?",
  "shopAddress": "string?",
  "dateDelivered": "ISO date?",
  "purchaseOrder": "string?",
  "invoiceNumber": "string?",
  "repairHubId": "string?"
}
```

- **RETIRE**: set `InventoryItem.status = RETIRED`
- **REPAIR**: set `InventoryItem.status = IN_MAINTENANCE`, create a `MaintenanceTask`
  with `isDamageReport: true` and the repair fields

---

## Step 4 — Update UI entry points

### End deployment flow

In both the **admin deployment drawer** and the **operator My Rig page**, replace the
current "End Deployment" → NotePhotoDialog flow with:

End Deployment button → opens `DispositionDialog` in `mode="end-deployment"` with all
active kit items → on complete, calls updated `POST /api/deployments/:id/end` with
dispositions.

The `NotePhotoDialog` is no longer used for ending a deployment. The note is now
collected inside `DispositionDialog` Step 4.

### Remove items flow

In both the admin drawer and operator My Rig page, replace the current "Remove Items"
→ NotePhotoDialog flow with:

"Remove Selected (N)" button → opens `DispositionDialog` in `mode="remove-items"` with
only the selected items → on complete, calls updated `DELETE /api/deployments/:id/items`.

### Admin inventory page — INOPERABLE items

In `src/app/(admin)/admin/inventory/page.tsx`:

1. The status filter already includes all statuses — `INOPERABLE` will appear automatically
   once the enum is added. Add it to the `STATUS_CHIP_COLOR` map:
   ```typescript
   INOPERABLE: 'warning'  // amber chip
   ```

2. In the detail drawer, when `item.status === 'INOPERABLE'`, show a prominent amber
   `Alert` at the top:
   ```
   ⚠️  Inoperable — Pending Admin Review
   Reported by [operator name] on [date]
   "[inoperableNotes]"
   [Photos of damage shown inline using PhotoGallery]
   
   [Approve Retirement]  [Send for Repair]
   ```

3. **Approve Retirement** button → ConfirmDialog ("This will permanently retire this
   item. Are you sure?") → calls `POST /api/inventory/:id/review-inoperable` with
   `{ decision: "RETIRE", note: "..." }`

4. **Send for Repair** button → opens a small dialog with repair type selector + optional
   shop fields (same fields as the DispositionDialog inoperable/yes branch, without
   the Shippo placeholder) → calls `POST /api/inventory/:id/review-inoperable` with
   `{ decision: "REPAIR", repairType, ...shopFields }`

---

## Files to create or modify

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add INOPERABLE status, RepairType enum, repair fields to MaintenanceTask, inoperable fields to InventoryItem |
| `src/components/shared/DispositionDialog.tsx` | **Create new** — multi-step disposition flow |
| `src/app/api/deployments/[id]/end/route.ts` | Update to accept itemDispositions array |
| `src/app/api/deployments/[id]/items/route.ts` | Update DELETE to accept itemDispositions |
| `src/app/api/inventory/[id]/review-inoperable/route.ts` | **Create new** — admin approval |
| `src/app/(admin)/admin/deployments/page.tsx` | Replace end/remove flows with DispositionDialog |
| `src/app/(admin)/admin/inventory/page.tsx` | Add INOPERABLE chip color + admin review UI in drawer |
| `src/app/(operator)/operator/my-rig/page.tsx` | Replace end/remove flows with DispositionDialog |

**Do not touch any other files.**

---

## Definition of done

- [ ] `npx prisma migrate dev` succeeds — INOPERABLE status and RepairType enum exist
- [ ] `npx prisma generate` succeeds
- [ ] Ending a deployment opens DispositionDialog, not a plain note dialog
- [ ] Bulk destination sets all items to same disposition; individual items can be changed
- [ ] Inoperable flow: photo required (min 1), description required
- [ ] "Can it be fixed? No" → item set to INOPERABLE with photos + notes stored
- [ ] "Can it be fixed? Yes" → item set to IN_MAINTENANCE, MaintenanceTask created with isDamageReport=true
- [ ] Each repair type (IN_FIELD, AT_SHOP, SHIP_TO_HUB, SHIP_FOR_REPAIR) shows correct optional fields
- [ ] Disabled "Create Shipping Label (coming soon)" button shown for AT_SHOP, SHIP_TO_HUB, SHIP_FOR_REPAIR
- [ ] Remove items mid-deployment also uses DispositionDialog
- [ ] Admin inventory page shows INOPERABLE chip in amber
- [ ] Admin can see inoperable notes and damage photos in item detail drawer
- [ ] "Approve Retirement" sets status to RETIRED
- [ ] "Send for Repair" sets status to IN_MAINTENANCE and creates MaintenanceTask
- [ ] HUB disposition updates item's hubId to the selected hub
- [ ] TRANSFER disposition creates a pending TransferRequest (same as existing transfer flow)
- [ ] `npm run type-check` passes with no errors
