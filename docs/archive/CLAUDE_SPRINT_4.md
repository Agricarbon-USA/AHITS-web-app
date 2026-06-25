# CLAUDE SPRINT 4 — Per-Unit Inventory Tracking & QR Code Scanning

## Context

### Background
This is the AHITS app for Agricarbon. Stack: Next.js (App Router), TypeScript, MUI v6, Prisma, Supabase PostgreSQL. Read `AGENTS.md` before writing any Next.js code.

The PRD (`PRD_ADDITIONS_V2.md`) also describes a Deployment Map feature and a Time Tracking / Invoicing feature — those are future sprints. Do not implement them here.

### Problem Being Solved
`InventoryItem` has a single `status: EquipmentStatus` field and a `quantity: Int`. There is no way to represent "7 available, 1 in maintenance" for the same item. This sprint replaces the single-status model with per-unit tracking via a new `InventoryUnit` model.

### Existing Field to Be Aware Of
`InventoryItem` already has `unitId String?` — this is a **free-text serial/unit label** (e.g. "GPS-003") added in a prior sprint. It is **not** a foreign key. After this sprint it is superseded by `InventoryUnit.serialNumber` for new items, but it should **remain in the schema** for backward compatibility. Do not remove it.

Throughout this doc, the FK from `KitItem` to `InventoryUnit` is named **`inventoryUnitId`** (not `unitId`) specifically to avoid confusion with the existing `InventoryItem.unitId` string field.

---

## Phase 1 — Prisma Schema

### 1.1 Add `InventoryUnit` model

```prisma
model InventoryUnit {
  id              String          @id @default(cuid())
  inventoryItemId String
  inventoryItem   InventoryItem   @relation(fields: [inventoryItemId], references: [id])
  serialNumber    String?
  qrCodeId        String          @unique @default(cuid())
  status          EquipmentStatus @default(AVAILABLE)
  notes           String?
  inoperableNotes         String?
  inoperableReportedAt    DateTime?
  inoperableReportedById  String?
  inoperableReportedBy    User?           @relation("UnitInoperableReports", fields: [inoperableReportedById], references: [id])
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  kitItems  KitItem[]
  checkLogs CheckLog[]

  @@map("inventory_units")
}
```

### 1.2 Modify `InventoryItem`

**Remove** these fields entirely:
```
status                 EquipmentStatus
inoperableNotes        String?
inoperableReportedAt   DateTime?
inoperableReportedById String?
inoperableReportedBy   User? @relation("InoperableReports", ...)
```

**Add** this relation:
```prisma
units InventoryUnit[]
```

Keep all other fields. Do **not** remove `unitId String?` (legacy free-text serial label — kept for backward compatibility).

`quantity Int` now represents the **expected total** count of physical units (what was purchased). Live status counts come from `InventoryUnit` records.

### 1.3 Modify `KitItem`

Add:
```prisma
inventoryUnitId String?
inventoryUnit   InventoryUnit? @relation(fields: [inventoryUnitId], references: [id])
```

- SERIALIZED items: `inventoryUnitId` required (specific physical unit being checked out)
- CONSUMABLE items: `inventoryUnitId` null; `quantity` field drives how many

### 1.4 Modify `CheckLog`

Add:
```prisma
inventoryUnitId String?
inventoryUnit   InventoryUnit? @relation(fields: [inventoryUnitId], references: [id])
```

`itemId` (FK to `InventoryItem`) remains required. Both fields coexist.

### 1.5 Modify `User`

Remove:
```
inoperableReports InventoryItem[] @relation("InoperableReports")
```

Add:
```
unitInoperableReports InventoryUnit[] @relation("UnitInoperableReports")
```

### 1.6 Schema Migration — TWO-STEP PROCESS (read this carefully)

Because `InventoryItem.status` must still exist when the data migration script runs (it reads the current status to seed `InventoryUnit` records), this requires **two separate Prisma migrations**.

**Migration 1 — Add new models, do NOT remove anything yet:**
- Edit `schema.prisma` to add `InventoryUnit`, add `KitItem.inventoryUnitId`, add `CheckLog.inventoryUnitId`, add `InventoryItem.units` relation, and update `User`
- Do **not** remove `InventoryItem.status`, `inoperableNotes`, `inoperableReportedAt`, `inoperableReportedById`, or `inoperableReportedBy` yet

```bash
make db-generate
make db-migrate   # generates migration 1
```

Then run the data migration script (see Section 1.7 below) against the live database.

**Migration 2 — Remove the now-redundant fields:**
- Edit `schema.prisma` to remove `InventoryItem.status`, `inoperableNotes`, `inoperableReportedAt`, `inoperableReportedById`, `inoperableReportedBy`
- Remove `User.inoperableReports InventoryItem[] @relation("InoperableReports")`

```bash
make db-generate
make db-migrate   # generates migration 2
```

Only commit and push after both migrations succeed. Put both migration folders in the same commit.

### 1.7 Data Migration Script

After the schema migration, run this once to seed `InventoryUnit` records from existing items. Create `scripts/migrate-inventory-units.ts`:

```typescript
import { prisma } from '../src/lib/prisma'

async function main() {
  const items = await prisma.inventoryItem.findMany()
  for (const item of items) {
    const existing = await prisma.inventoryUnit.count({ where: { inventoryItemId: item.id } })
    if (existing > 0) continue // already seeded

    const count = Math.max(item.quantity, 1)
    // item.status was removed — cast via any to read it from the raw DB value before migration
    // OR: if migration dropped the column already, default all to AVAILABLE
    await prisma.inventoryUnit.createMany({
      data: Array.from({ length: count }, () => ({
        inventoryItemId: item.id,
        serialNumber: item.unitId ?? undefined, // copy legacy free-text serial to first unit only
        status: 'AVAILABLE' as const,
      })),
    })
  }
  console.log('Done seeding inventory units')
}

main().finally(() => prisma.$disconnect())
```

> Note: because `status` is being removed from `InventoryItem` in the same migration, the data migration script should be run with a **two-step migration** if needed: first add the `InventoryUnit` table without dropping `InventoryItem.status`, seed the data, then drop `status` in a second migration. OR: accept that all seeded units start as AVAILABLE and admins manually adjust in the UI.

Run with:
```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-inventory-units.ts
```

---

## Phase 2 — API Routes

### 2.0 Fix secondary operator authorization in `end` and `vehicles` routes

Sprint 3 added `RigOperator` for multi-operator deployments, but the authorization check in `end/route.ts` and `vehicles/route.ts` still only checks the primary operator. Secondary operators need to manage vehicles and end deployments too.

**`src/app/api/deployments/[id]/end/route.ts`** — replace line ~48:
```typescript
// BEFORE:
if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// AFTER:
if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
  const isSecondary = await prisma.rigOperator.findUnique({
    where: { rigId_operatorId: { rigId: id, operatorId: session.userId } },
  })
  if (!isSecondary) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

Apply the exact same change to **`src/app/api/deployments/[id]/vehicles/route.ts`** — find the equivalent `session.role !== 'ADMIN' && rig.operatorId !== session.userId` check and add the `RigOperator` lookup.

Note: `deployments/[id]/items/route.ts` already has this fix specified in Section 2.8 below.

### 2.1 `GET /api/inventory`

**Current behaviour to preserve:** Returns paginated items with `currentOperator` and `currentProject` (derived from CheckLog). Keep this logic unchanged.

**Changes required:**

1. **Remove `?status=` filter** (the `status` field no longer exists on `InventoryItem`). Replace it with `?unitStatus=` if needed, or remove status filtering from the UI entirely for now.

2. **Include units in each item's response:**
```typescript
include: {
  category: true,
  hub: true,
  units: { select: { id: true, status: true } },
}
```

3. **Add computed `unitCounts` to each item in the response:**
```typescript
function unitCounts(units: { status: string }[]) {
  return {
    totalUnits: units.length,
    available:     units.filter(u => u.status === 'AVAILABLE').length,
    checkedOut:    units.filter(u => u.status === 'CHECKED_OUT').length,
    inMaintenance: units.filter(u => u.status === 'IN_MAINTENANCE').length,
    inoperable:    units.filter(u => u.status === 'INOPERABLE').length,
    retired:       units.filter(u => u.status === 'RETIRED').length,
  }
}

const data = items.map((item) => ({
  ...item,
  unitCounts: unitCounts(item.units),
  currentOperator: activeByItem[item.id]?.operator ?? null,
  currentProject: activeByItem[item.id]?.project ?? null,
}))
```

4. **Low-stock alerting**: anywhere `quantity` was compared against `lowStockThreshold` for a warning, replace with `unitCounts.available < lowStockThreshold`.

5. **`POST /api/inventory`**: After creating the `InventoryItem`, immediately create `quantity` `InventoryUnit` records with `status: AVAILABLE`:
```typescript
const item = await prisma.inventoryItem.create({ data: parsed.data as never, include: { category: true, hub: true } })
if (parsed.data.quantity > 0) {
  await prisma.inventoryUnit.createMany({
    data: Array.from({ length: parsed.data.quantity }, () => ({ inventoryItemId: item.id })),
  })
}
```

### 2.2 `GET /api/inventory/[id]`

Include full unit list with all fields:
```typescript
include: {
  category: true, hub: true,
  checkLogs: { include: { operator: true }, orderBy: { submittedAt: 'desc' }, take: 20 },
  photos: true,
  units: {
    select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, inoperableNotes: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
}
```

Add `unitCounts` to the response (same helper as above).

### 2.3 `PATCH /api/inventory/[id]`

Currently passes `body` directly to Prisma. After this change, `body` must **never** include `status` (field no longer exists). Strip it explicitly:

```typescript
const { status: _removed, inoperableNotes: _a, inoperableReportedAt: _b, inoperableReportedById: _c, ...safeData } = body
const item = await prisma.inventoryItem.update({ where: { id }, data: safeData })
```

### 2.4 New `POST /api/inventory/[id]/units` (admin only)

Add physical units to an item (new stock arrives, replacement units, etc.).

```typescript
body: { count?: number; serialNumbers?: string[] }

// For each unit to add:
await prisma.inventoryUnit.create({
  data: { inventoryItemId: id, serialNumber: serialNumbers?.[i] ?? null }
})
// Also increment InventoryItem.quantity to keep the expected-total in sync:
await prisma.inventoryItem.update({ where: { id }, data: { quantity: { increment: count } } })
```

### 2.5 New `PATCH /api/inventory/units/[unitId]` (admin only)

Manually update a single unit (retire it, fix serial number, add notes, etc.).

```typescript
body: { status?: EquipmentStatus; serialNumber?: string; notes?: string }
await prisma.inventoryUnit.update({ where: { id: unitId }, data: body })
```

### 2.6 New `GET /api/inventory/[id]/units` (admin + operator)

Returns all `InventoryUnit` records for an item. Used by Build Kit unit selector.

```typescript
const units = await prisma.inventoryUnit.findMany({
  where: { inventoryItemId: id },
  orderBy: { createdAt: 'asc' },
  select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, createdAt: true },
})
```

### 2.7 New `GET /api/inventory/units/by-qr/[qrCodeId]` (admin + operator)

QR code lookup — called when an operator scans a physical label.

```typescript
const unit = await prisma.inventoryUnit.findUnique({
  where: { qrCodeId },
  include: { inventoryItem: { select: { id: true, name: true, itemType: true, category: { select: { name: true } } } } },
})
if (!unit) return NextResponse.json({ error: 'QR code not recognised' }, { status: 404 })
return NextResponse.json({ unit, item: unit.inventoryItem })
```

### 2.8 Update `POST /api/deployments/[id]/items` (check-out flow)

**Authorization**: The existing check (`rig.operatorId !== session.userId`) must also allow secondary operators. After loading the rig, check:
```typescript
const isSecondary = await prisma.rigOperator.findUnique({
  where: { rigId_operatorId: { rigId: id, operatorId: session.userId } }
})
if (session.role !== 'ADMIN' && rig.operatorId !== session.userId && !isSecondary) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

**Request body schema** — replace `addSchema` with a discriminated union:

```typescript
const addSchema = z.object({
  items: z.array(z.union([
    z.object({
      itemType: z.literal('CONSUMABLE'),
      inventoryItemId: z.string(),
      quantity: z.number().int().min(1),
    }),
    z.object({
      itemType: z.literal('SERIALIZED'),
      inventoryItemId: z.string(),
      inventoryUnitId: z.string(),
    }),
  ])).min(1),
  note: z.string().min(1),
  photoUrls: z.array(z.string()).default([]),
})
```

**Transaction logic** — replace the existing `updateMany` with per-unit logic:

```typescript
await prisma.$transaction(async (tx) => {
  for (const entry of items) {
    if (entry.itemType === 'SERIALIZED') {
      // Validate the unit is available and belongs to this item
      const unit = await tx.inventoryUnit.findUnique({ where: { id: entry.inventoryUnitId } })
      if (!unit || unit.inventoryItemId !== entry.inventoryItemId || unit.status !== 'AVAILABLE') {
        throw new Error(`Unit ${entry.inventoryUnitId} is not available`)
      }
      await tx.inventoryUnit.update({
        where: { id: entry.inventoryUnitId },
        data: { status: 'CHECKED_OUT' },
      })
      await tx.kitItem.create({
        data: { kitId: kit.id, inventoryItemId: entry.inventoryItemId, quantity: 1, inventoryUnitId: entry.inventoryUnitId },
      })
      await tx.checkLog.create({
        data: { action: 'CHECK_OUT', itemId: entry.inventoryItemId, inventoryUnitId: entry.inventoryUnitId, operatorId: rig.operatorId, projectId: rig.projectId ?? undefined, notes: note },
      })
    } else {
      // CONSUMABLE: find N available units for this item
      const availableUnits = await tx.inventoryUnit.findMany({
        where: { inventoryItemId: entry.inventoryItemId, status: 'AVAILABLE' },
        take: entry.quantity,
      })
      if (availableUnits.length < entry.quantity) {
        throw new Error(`Only ${availableUnits.length} units available for this item`)
      }
      await tx.inventoryUnit.updateMany({
        where: { id: { in: availableUnits.map(u => u.id) } },
        data: { status: 'CHECKED_OUT' },
      })
      await tx.kitItem.create({
        data: { kitId: kit.id, inventoryItemId: entry.inventoryItemId, quantity: entry.quantity, inventoryUnitId: null },
      })
      await tx.checkLog.create({
        data: { action: 'CHECK_OUT', itemId: entry.inventoryItemId, operatorId: rig.operatorId, projectId: rig.projectId ?? undefined, notes: note },
      })
    }
  }
})
```

Wrap the transaction in a try/catch and return 409 on errors (unit no longer available race condition).

### 2.9 Update `DELETE /api/deployments/[id]/items` (disposition / return flow)

Load `KitItem` including `inventoryUnit`:
```typescript
const kitItems = await prisma.kitItem.findMany({
  where: { id: { in: kitItemIds }, removedAt: null },
  include: {
    item: { select: { id: true, name: true, itemType: true } },
    inventoryUnit: true,
  },
})
```

**HUB return:**
- If `kitItem.inventoryUnit` (SERIALIZED): set `inventoryUnit.status = AVAILABLE`
- If no unit (CONSUMABLE): find `kitItem.quantity` units with `status: CHECKED_OUT` for this `inventoryItemId` and set them to `AVAILABLE`
- Remove the `inventoryItem.updateMany` status call — unit status is now the source of truth

**INOPERABLE → can be fixed (maintenance):**
- SERIALIZED: set `inventoryUnit.status = IN_MAINTENANCE`, set `inventoryUnit.inoperableNotes / inoperableReportedAt / inoperableReportedById`
- CONSUMABLE: find 1 unit with `status: CHECKED_OUT` for this item, set it to `IN_MAINTENANCE`
- Create `MaintenanceTask` as before

**INOPERABLE → cannot be fixed:**
- SERIALIZED: set `inventoryUnit.status = INOPERABLE`
- CONSUMABLE: find 1 checked-out unit, set to `INOPERABLE`

**TRANSFER disposition**: KitItems being transferred (with or without `inventoryUnitId`) move to the new rig's kit. The receiving rig's new `KitItem` must copy `inventoryUnitId` from the source `KitItem` so the specific unit stays tracked. In `src/app/api/transfers/[id]/accept/route.ts`, when creating the new KitItem in the recipient's kit:
```typescript
// Copy inventoryUnitId so the physical unit stays linked
await tx.kitItem.create({
  data: {
    kitId: recipientKit.id,
    inventoryItemId: sourceKitItem.inventoryItemId,
    quantity: sourceKitItem.quantity,
    inventoryUnitId: sourceKitItem.inventoryUnitId ?? null,  // preserve unit link
  },
})
```
Unit status stays `CHECKED_OUT` — no change needed; it's just in a different deployment now.

### 2.10 Update `POST /api/inventory/[id]/review-inoperable`

Currently reads `item.status !== 'INOPERABLE'` and sets `item.status`. Both references to `item.status` must be replaced with unit-level logic.

Add `unitId` to the request body (required):

```typescript
const schema = z.object({
  unitId: z.string(),     // <-- NEW: which specific unit is being reviewed
  decision: z.enum(['RETIRE', 'REPAIR']),
  note: z.string().min(1),
  // ... all existing repair fields stay
})
```

Updated handler logic:
```typescript
const unit = await prisma.inventoryUnit.findUnique({ where: { id: parsed.data.unitId } })
if (!unit || unit.inventoryItemId !== id) {
  return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
}
if (unit.status !== 'INOPERABLE') {
  return NextResponse.json({ error: 'Unit is not INOPERABLE' }, { status: 409 })
}

if (decision === 'RETIRE') {
  await prisma.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'RETIRED' } })
} else {
  await prisma.$transaction(async (tx) => {
    await tx.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'IN_MAINTENANCE' } })
    await tx.maintenanceTask.create({
      data: {
        itemId: id,
        taskName: `Admin repair: ${item.name}${unit.serialNumber ? ` #${unit.serialNumber}` : ''}`,
        isDamageReport: true,
        // ... all repair fields from parsed.data ...
        notes: note,
        status: 'IN_PROGRESS',
      },
    })
  })
}
```

The admin `RepairReviewDialog` must be updated to pass the `unitId` of the selected unit when opening.

---

## Phase 3 — Admin Inventory UI

File: `src/app/(admin)/admin/inventory/page.tsx`

### 3.1 Update `InventoryItemRow` type

Remove:
```typescript
status: string
inoperableNotes: string | null
inoperableReportedAt: string | null
inoperableReportedById: string | null
```

Add:
```typescript
unitCounts: {
  totalUnits: number
  available: number
  checkedOut: number
  inMaintenance: number
  inoperable: number
  retired: number
}
units: Array<{
  id: string
  qrCodeId: string
  serialNumber: string | null
  status: string
  notes: string | null
  createdAt: string
}>
```

### 3.2 Replace single status chip with breakdown chips

In the item list table, replace the `<Chip label={STATUS_LABELS[item.status]}>` with:

```tsx
<Stack direction="row" spacing={0.5} flexWrap="wrap">
  {item.unitCounts.available > 0 && (
    <Chip size="small" color="success" label={`${item.unitCounts.available} Available`} />
  )}
  {item.unitCounts.checkedOut > 0 && (
    <Chip size="small" color="primary" label={`${item.unitCounts.checkedOut} Checked Out`} />
  )}
  {item.unitCounts.inMaintenance > 0 && (
    <Chip size="small" color="warning" label={`${item.unitCounts.inMaintenance} In Maintenance`} />
  )}
  {item.unitCounts.inoperable > 0 && (
    <Chip size="small" color="error" label={`${item.unitCounts.inoperable} Inoperable`} />
  )}
  {item.unitCounts.retired > 0 && (
    <Chip size="small" color="default" label={`${item.unitCounts.retired} Retired`} />
  )}
  {item.unitCounts.totalUnits === 0 && (
    <Chip size="small" color="default" label="No units" />
  )}
</Stack>
```

Show `{item.unitCounts.totalUnits}` in the Qty column (total physical units).

### 3.3 Low-stock warning

Change the low-stock warning condition from:
```typescript
item.quantity < (item.lowStockThreshold ?? 0)
```
to:
```typescript
item.unitCounts.available < (item.lowStockThreshold ?? 0)
```

### 3.4 Add "Units" tab to the item detail drawer

When admin opens an item's detail drawer, add a "Units" tab alongside the existing "History" and "Photos" tabs.

The Units tab renders a table with columns: **#** (1-based index), **Serial Number** (editable), **QR Code**, **Status** (editable dropdown), **Notes**, **Actions**.

**Status dropdown**: renders a `<TextField select>` with all `EquipmentStatus` values. On change, calls `PATCH /api/inventory/units/[unitId]` with `{ status }`.

**Serial number**: inline editable text field. On blur, calls `PATCH /api/inventory/units/[unitId]` with `{ serialNumber }`.

**Download QR** button: generates and downloads a PNG QR code for this unit using the existing `qrcode` npm package:
```typescript
import QRCode from 'qrcode'

async function downloadUnitQR(unit: { qrCodeId: string; serialNumber?: string | null }, itemName: string) {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, unit.qrCodeId, { width: 300 })
  const link = document.createElement('a')
  link.download = `qr-${itemName.replace(/\s+/g, '-')}-${unit.qrCodeId.slice(0, 8)}.png`
  link.href = canvas.toDataURL()
  link.click()
}
```

**"+ Add Unit"** button at bottom of table: calls `POST /api/inventory/[id]/units` with `{ count: 1 }`, then refreshes the unit list.

### 3.5 Update Edit Item dialog

Remove `status` field from the edit form (status is now per-unit). Remove any display of `inoperableNotes` / `inoperableReportedAt` from the edit form.

### 3.6 RepairReviewDialog — pass unitId

When opening `RepairReviewDialog`, pass the `unitId` of the inoperable unit (from the Units tab row). The dialog must include this in the `review-inoperable` POST body.

---

## Phase 4 — Operator UI: Build Kit / My Rig Page

File: `src/app/(operator)/operator/my-rig/page.tsx`

### 4.1 Update `InventoryOption` type

The inventory options shown in "Add Items" currently include `status: string`. Replace with:
```typescript
interface InventoryOption {
  id: string
  name: string
  itemType: string
  quantity: number
  lowStockThreshold: number | null
  category: { name: string }
  unitCounts: {
    available: number
    checkedOut: number
    inMaintenance: number
    inoperable: number
    totalUnits: number
  }
  availableUnits: Array<{ id: string; serialNumber: string | null; qrCodeId: string }>
}
```

Filter the "Add Items" list to show only items where `unitCounts.available > 0`.

### 4.2 Update `KitItemRow` type

Add:
```typescript
inventoryUnit: { id: string; qrCodeId: string; serialNumber: string | null; status: string } | null
```

### 4.3 CONSUMABLE checkout — quantity capped at available units

When the quantity input renders, set `inputProps={{ max: item.unitCounts.available }}` and show helper text: `{item.unitCounts.available} available`.

### 4.4 SERIALIZED checkout — unit selector

Replace the quantity field with a unit selection flow. Offer all three methods:

**Method A — Scan QR code** (primary — works on mobile):
```tsx
<Button component="label" startIcon={<QrCodeScannerIcon />}>
  Scan QR Code
  <input
    type="file"
    accept="image/*"
    capture="environment"
    style={{ display: 'none' }}
    onChange={handleQRScan}
  />
</Button>
```
After the user selects/captures an image, decode the QR code from it using the `jsQR` npm package (`npm install jsqr`). Then POST to `GET /api/inventory/units/by-qr/[qrCodeId]` to look up and validate the unit.

**Method B — Manual QR entry** (fallback for desktop):
```tsx
<TextField label="Enter QR code" value={manualQR} onChange={...} />
<Button onClick={() => lookupUnit(manualQR)}>Look Up</Button>
```

**Method C — Pick from list**:
```tsx
<TextField select label="Select unit" value={selectedUnitId} onChange={...}>
  {item.availableUnits.map(u => (
    <MenuItem key={u.id} value={u.id}>
      {u.serialNumber ?? `Unit ${u.qrCodeId.slice(0, 8)}`}
    </MenuItem>
  ))}
</TextField>
```

Validation for all methods:
- Unit exists and `status === AVAILABLE`
- Unit `inventoryItemId` matches the expected item
- On success: show a confirmation chip "✓ Unit: [serial number or QR short ID] selected"

The `inventoryUnitId` of the confirmed unit is sent in the POST body to `POST /api/deployments/[id]/items`.

### 4.5 Update DispositionDialog / KitItemSummary

In `src/components/shared/DispositionDialog.tsx`, the `KitItemSummary` interface must include:
```typescript
inventoryUnit: { id: string; serialNumber: string | null; qrCodeId: string } | null
itemType: string
```

When rendering each item in the disposition list, if `inventoryUnit` is set, show the unit identity below the item name:
```tsx
{item.inventoryUnit && (
  <Typography variant="caption" color="text.secondary">
    Unit: {item.inventoryUnit.serialNumber ?? item.inventoryUnit.qrCodeId.slice(0, 8)}
  </Typography>
)}
```

Pass `inventoryUnitId` through the disposition API call body (it will be on the `KitItem` already, so the server reads it from there — no changes to the client payload needed for disposition).

---

## Phase 5 — Operator Scan Page

File: `src/app/(operator)/operator/scan/page.tsx`

This page is currently stubbed. Implement it as a dedicated QR code scanner:

1. Show a camera capture button (same `<input type="file" accept="image/*" capture="environment">` pattern)
2. After capture, decode with `jsQR`
3. Look up `GET /api/inventory/units/by-qr/[qrCodeId]`
4. Show the unit's name, status, serial number, and which deployment it's currently in (if CHECKED_OUT)
5. This page is read-only — it gives operators a way to identify any piece of equipment by scanning it, useful in the field

---

## Phase 6 — Type Cleanup

After all changes, run:
```bash
npx tsc --noEmit
```

Fix all type errors. Key areas:
- Any reference to `item.status` in admin or operator pages → use `item.unitCounts.*`
- `KitItem` types in operator my-rig page → add `inventoryUnit`
- `DispositionDialog.KitItemSummary` → add `inventoryUnit` and `itemType`
- The `STATUS_CHIP_COLOR` and `STATUS_LABELS` maps in admin inventory → keep for unit-level display, remove from item-level display

---

## Deployment

Follow the standard flow from `CLAUDE.md`:

```bash
# 1. Branch
GH_USER=$(gh api user --jq .login)
git checkout -b "feature/$(date +%Y%m%d)/${GH_USER}-per-unit-inventory-tracking"

# 2. Make all changes above

# 3. Install jsQR for QR decoding
npm install jsqr

# 4a. Migration 1: add InventoryUnit (do NOT remove InventoryItem.status yet)
make db-generate   # after editing schema to ADD only
make db-migrate

# 4b. Seed InventoryUnit records while item.status still exists in DB
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-inventory-units.ts

# 4c. Migration 2: remove InventoryItem.status and inoperable fields
make db-generate   # after editing schema to REMOVE stale fields
make db-migrate

# 6. Type-check
npx tsc --noEmit

# 7. Commit everything including migration files and data script
git add -A
git commit -m "feat: per-unit inventory tracking + QR code scanning for serialized items"
git push -u origin HEAD

# 8. PR + staging deploy
gh pr create \
  --title "Per-unit inventory tracking + QR code scanning" \
  --body "Adds InventoryUnit model. Serialized items require QR scan/selection at checkout, return, inoperable, and repair. Admin inventory shows per-status breakdown. Consumable items tracked as unit pools. Operator scan page implemented." \
  --base main

PR_NUMBER=$(gh pr view --json number --jq .number)
gh workflow run pr-staging-deploy.yml -f pr_number=$PR_NUMBER
gh run watch
```

---

## Verification Checklist

- [ ] **Admin Inventory list**: Christie's Gas Hammer shows "7 Available, 1 In Maintenance" (after seeding + manually setting 1 unit to IN_MAINTENANCE via Units tab)
- [ ] **Admin Inventory — Units tab**: All 8 units shown in table, each with Download QR button
- [ ] **Add Unit**: "+ Add Unit" creates a new AVAILABLE unit, total count increments
- [ ] **Low-stock warning**: triggers when `unitCounts.available < lowStockThreshold`, not when `quantity < lowStockThreshold`
- [ ] **Edit Item dialog**: no `status` field present; no type errors
- [ ] **Repair Review**: opens with a `unitId`, updates unit status (not item status), 409 if unit not INOPERABLE
- [ ] **Build Kit — CONSUMABLE**: quantity input capped at available unit count; checking out N units sets N units to CHECKED_OUT
- [ ] **Build Kit — SERIALIZED**: QR scan / manual / list picker all produce a confirmed `inventoryUnitId`; item added to kit with that unit linked
- [ ] **My Rig — Kit display**: SERIALIZED items show "Unit: [serial]" beneath the item name
- [ ] **Return to Hub**: unit(s) return to AVAILABLE; immediately visible in admin breakdown
- [ ] **Inoperable**: specific unit moves to IN_MAINTENANCE or INOPERABLE; other units unaffected
- [ ] **Transfer accept**: new KitItem in recipient's kit carries the same `inventoryUnitId`; unit stays CHECKED_OUT
- [ ] **Operator Scan page**: scanning a QR label shows unit identity and status
- [ ] **Type-check clean**: `npx tsc --noEmit` returns no errors
