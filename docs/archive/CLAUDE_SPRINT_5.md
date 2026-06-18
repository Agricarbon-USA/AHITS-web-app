# CLAUDE_SPRINT_5.md — Sprint 4 Refinements

**Scope:** Three UX improvements from Sprint 4 review. No schema changes required.

Stack: Next.js App Router, TypeScript, MUI v6, Prisma, Supabase PostgreSQL. Read `AGENTS.md` before writing any code.

---

## Overview

| # | Area | Change |
|---|------|--------|
| 1 | Serialized unit naming + kit unit selection | Units display as "Unit 1", "Unit 2" until a serial number is set; both the admin New Deployment wizard and the admin Add Items to active rig dialog gain a unit picker for serialized items |
| 2 | Status chip colors | "Checked Out" changes from `primary` (green) to `info` (blue) so every status has a visually distinct color |
| 3 | Per-unit history | Each serialized unit's check log history is viewable inline in the Units tab of the admin inventory detail drawer |

---

## 1 — Serialized Unit Naming + Kit Unit Selection

### 1.1 Unit display label

The label shown for an individual `InventoryUnit` is `unit.serialNumber ?? \`Unit ${unit.position}\`` where `position` is the 1-based index of that unit among its item's units sorted by `createdAt ASC`.

This replaces the current fallback `unit.serialNumber ?? unit.qrCodeId.slice(0, 8)` everywhere.

### 1.2 API — add `orderBy` + `position` to `GET /api/inventory`

**File:** `src/app/api/inventory/route.ts`

The units include currently has no `orderBy`, meaning unit order is non-deterministic and `idx + 1` positions would be unstable. Fix by adding a sort:

```typescript
units: {
  select: { id: true, status: true, qrCodeId: true, serialNumber: true },
  orderBy: { createdAt: 'asc' },   // ADD THIS
},
```

Then, when building `availableUnits`, compute position from the full ordered list:

```typescript
const data = items.map((item) => {
  const allUnits = item.units  // now sorted createdAt ASC
  const unitWithPosition = allUnits.map((u, i) => ({ ...u, position: i + 1 }))
  const counts = computeUnitCounts(allUnits)
  return {
    ...item,
    unitCounts: counts,
    availableUnits: unitWithPosition
      .filter((u) => u.status === 'AVAILABLE')
      .map((u) => ({ id: u.id, serialNumber: u.serialNumber, qrCodeId: u.qrCodeId, position: u.position })),
    currentOperator: activeByItem[item.id]?.operator ?? null,
    currentProject: activeByItem[item.id]?.project ?? null,
  }
})
```

`availableUnits` is already returned by this route and consumed by both the operator Build Kit "pick from list" dropdown and the admin unit pickers below.

### 1.3 API — add `position` to `GET /api/inventory/[id]/units`

**File:** `src/app/api/inventory/[id]/units/route.ts`

The `findMany` already sorts by `createdAt: 'asc'`. After fetching, map in position:

```typescript
const units = await prisma.inventoryUnit.findMany({
  where: { inventoryItemId: id },
  orderBy: { createdAt: 'asc' },
  select: { id: true, qrCodeId: true, serialNumber: true, status: true, notes: true, createdAt: true },
})
const withPosition = units.map((u, i) => ({ ...u, position: i + 1 }))
return NextResponse.json({ data: withPosition })
```

### 1.4 TypeScript interfaces — add `position` to `availableUnits`

Only the `availableUnits` shape needs `position` added (not the full `UnitRow` in the admin inventory drawer, because that tab already uses `idx + 1` from its own `map()` call).

**`src/app/(operator)/operator/my-rig/page.tsx`** — the `InventoryItemRow.availableUnits` field:

```typescript
availableUnits: Array<{ id: string; serialNumber: string | null; qrCodeId: string; position: number }>
```

**`src/app/(admin)/admin/deployments/page.tsx`** — `InventoryOption`:

```typescript
interface InventoryOption {
  id: string
  name: string
  itemType: 'CONSUMABLE' | 'SERIALIZED'
  unitCounts: { available: number; checkedOut: number; inMaintenance: number; inoperable: number; retired: number }
  availableUnits: { id: string; serialNumber: string | null; position: number }[]
  category: { name: string }
}
```

(`qrCodeId` is not needed in the admin picker since admins choose from a dropdown, not scan.)

### 1.5 Operator Build Kit — update unit label

**File:** `src/app/(operator)/operator/my-rig/page.tsx`

Change every occurrence of:
```typescript
unit.serialNumber ?? unit.qrCodeId.slice(0, 8)
```
to:
```typescript
unit.serialNumber ?? `Unit ${unit.position}`
```

This affects:
- The "Pick from list" `<MenuItem>` label (around line 1063)
- The `unitLabel` stored in state when a unit is selected from the list

For units resolved via QR scan (`by-qr` lookup), the unit object returned does not carry `position`. Keep the existing fallback for those:
```typescript
// QR scan result label (no position available):
json.unit.serialNumber ?? result.data.slice(0, 8)
```

Or optionally update `GET /api/inventory/units/by-qr/[qrCodeId]` to include position by fetching the unit's siblings:

```typescript
// In by-qr/[qrCodeId]/route.ts, after finding the unit:
const siblings = await prisma.inventoryUnit.findMany({
  where: { inventoryItemId: unit.inventoryItemId },
  orderBy: { createdAt: 'asc' },
  select: { id: true },
})
const position = siblings.findIndex((s) => s.id === unit.id) + 1
return NextResponse.json({ unit: { ...unit, position }, item: unit.inventoryItem })
```

If this is implemented, update the QR scan label to `json.unit.serialNumber ?? \`Unit ${json.unit.position}\``.

### 1.6 Admin — unit picker in both kit item dialogs

There are **two** places in `src/app/(admin)/admin/deployments/page.tsx` where items are added to a kit, and both need the unit picker for serialized items:

- **A. `NewDeploymentDialog`** — step 3 "Build Kit" (new deployments)
- **B. `DeploymentDrawer` "Add Items" dialog** — adding items to an active rig

Both currently use a quantity-only approach (`Map<string, number>`) and need to be updated.

#### Shared kit entry type

Define this type once at the top of the file (outside the components):

```typescript
type AdminKitEntry =
  | { itemType: 'CONSUMABLE'; quantity: number }
  | { itemType: 'SERIALIZED'; inventoryUnitId: string; unitLabel: string }
```

---

#### A. `NewDeploymentDialog`

**State change** — replace:
```typescript
const [kitItems, setKitItems] = React.useState<Map<string, number>>(new Map())
```
with:
```typescript
const [kitItems, setKitItems] = React.useState<Map<string, AdminKitEntry>>(new Map())
```

**Step 3 Build Kit UI** — replace the current `availableItems.map(...)` block with:

```tsx
{availableItems.map((item) => {
  const entry = kitItems.get(item.id)
  const checked = !!entry
  const isSerialized = item.itemType === 'SERIALIZED'

  return (
    <Stack key={item.id} spacing={0.5}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Checkbox
          size="small"
          checked={checked}
          onChange={(e) => {
            const m = new Map(kitItems)
            if (e.target.checked) {
              m.set(item.id, isSerialized
                ? { itemType: 'SERIALIZED', inventoryUnitId: '', unitLabel: '' }
                : { itemType: 'CONSUMABLE', quantity: 1 })
            } else {
              m.delete(item.id)
            }
            setKitItems(m)
          }}
        />
        <Box flexGrow={1}>
          <Typography variant="body2">{item.name}</Typography>
          <Stack direction="row" spacing={0.5} mt={0.25}>
            <Chip size="small" label={item.category.name} sx={{ height: 16, fontSize: 10 }} />
            {isSerialized && (
              <Chip size="small" label="Serialized" variant="outlined" color="primary" sx={{ height: 16, fontSize: 10 }} />
            )}
          </Stack>
        </Box>

        {/* CONSUMABLE: quantity stepper */}
        {checked && !isSerialized && (
          <TextField
            type="number"
            size="small"
            value={(entry as { itemType: 'CONSUMABLE'; quantity: number }).quantity}
            onChange={(e) => {
              const m = new Map(kitItems)
              m.set(item.id, { itemType: 'CONSUMABLE', quantity: parseInt(e.target.value) || 1 })
              setKitItems(m)
            }}
            inputProps={{ min: 1, style: { MozAppearance: 'textfield', width: 60 } }}
            sx={{ width: 80, '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { display: 'none' } }}
          />
        )}
      </Stack>

      {/* SERIALIZED: unit dropdown */}
      {checked && isSerialized && (
        <Box pl={5}>
          <TextField
            select
            size="small"
            label="Select unit"
            value={(entry as { itemType: 'SERIALIZED'; inventoryUnitId: string }).inventoryUnitId}
            onChange={(e) => {
              const unit = item.availableUnits.find((u) => u.id === e.target.value)
              if (!unit) return
              const m = new Map(kitItems)
              m.set(item.id, {
                itemType: 'SERIALIZED',
                inventoryUnitId: unit.id,
                unitLabel: unit.serialNumber ?? `Unit ${unit.position}`,
              })
              setKitItems(m)
            }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="" disabled>Select a unit…</MenuItem>
            {item.availableUnits.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.serialNumber ?? `Unit ${u.position}`}
              </MenuItem>
            ))}
          </TextField>
          {item.availableUnits.length === 0 && (
            <Typography variant="caption" color="text.secondary">No available units.</Typography>
          )}
        </Box>
      )}
    </Stack>
  )
})}
```

**Disable Next/Launch if a serialized item is checked but has no unit selected:**

```typescript
const hasUnresolved = Array.from(kitItems.values()).some(
  (e) => e.itemType === 'SERIALIZED' && !e.inventoryUnitId
)
// Add `|| hasUnresolved` to the launch button's disabled condition
```

**`launch` function — update payload:**

```typescript
kitItems: Array.from(kitItems.entries()).map(([inventoryItemId, entry]) =>
  entry.itemType === 'SERIALIZED'
    ? { inventoryItemId, inventoryUnitId: entry.inventoryUnitId, itemType: 'SERIALIZED' }
    : { inventoryItemId, quantity: entry.quantity }
),
```

---

#### B. `DeploymentDrawer` — Add Items to active rig

The "Add Items" button on an active rig opens a separate dialog, and `handleAddItems` posts to `POST /api/deployments/[id]/items`, which **already handles the SERIALIZED discriminated union correctly** — no API change needed here.

Only the UI and state need updating.

**State change** — replace the existing:
```typescript
const [pendingItems, setPendingItems] = React.useState<Map<string, number>>(new Map())
```
with:
```typescript
const [pendingItems, setPendingItems] = React.useState<Map<string, AdminKitEntry>>(new Map())
```

**Add Items dialog UI** — same unit picker pattern as `NewDeploymentDialog` section A above. Replace the `availableItems.map(...)` block with the same serialized/consumable branching UI (copy it, it's identical). The "Continue" button should be disabled when a serialized item is checked but has no unit selected.

**`handleAddItems`** — update the payload:

```typescript
const handleAddItems = async (note: string, photoUrls: string[]) => {
  setActionLoading(true)
  await fetch(`/api/deployments/${rig.id}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: Array.from(pendingItems.entries()).map(([inventoryItemId, entry]) =>
        entry.itemType === 'SERIALIZED'
          ? { inventoryItemId, inventoryUnitId: entry.inventoryUnitId, itemType: 'SERIALIZED' }
          : { inventoryItemId, quantity: entry.quantity }
      ),
      note,
      photoUrls,
    }),
  })
  // ...rest unchanged
}
```

### 1.7 API — `POST /api/deployments` — accept `inventoryUnitId` for serialized items

**File:** `src/app/api/deployments/route.ts`

The `createSchema` currently only accepts `{ inventoryItemId, quantity }`. Update it to accept both forms:

```typescript
kitItems: z.array(z.union([
  z.object({
    inventoryItemId: z.string(),
    quantity: z.number().int().min(1),
    inventoryUnitId: z.undefined().optional(),
  }),
  z.object({
    inventoryItemId: z.string(),
    itemType: z.literal('SERIALIZED'),
    inventoryUnitId: z.string(),
  }),
])).default([]),
```

In the transaction loop, discriminate by whether `inventoryUnitId` is present:

```typescript
for (const ki of kitItems) {
  if ('inventoryUnitId' in ki && ki.inventoryUnitId) {
    // SERIALIZED: use the specific unit
    const unit = await tx.inventoryUnit.findUnique({ where: { id: ki.inventoryUnitId } })
    if (!unit || unit.status !== 'AVAILABLE') throw new Error(`Unit ${ki.inventoryUnitId} is not available`)
    await tx.inventoryUnit.update({
      where: { id: ki.inventoryUnitId },
      data: { status: 'CHECKED_OUT' },
    })
    await tx.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: ki.inventoryItemId, quantity: 1, inventoryUnitId: ki.inventoryUnitId },
    })
    await tx.checkLog.create({
      data: {
        action: 'CHECK_OUT',
        itemId: ki.inventoryItemId,
        inventoryUnitId: ki.inventoryUnitId,
        operatorId,
        projectId,
        notes: note,
      },
    })
  } else {
    // CONSUMABLE: pick N arbitrary available units
    const quantity = (ki as { quantity: number }).quantity
    const available = await tx.inventoryUnit.findMany({
      where: { inventoryItemId: ki.inventoryItemId, status: 'AVAILABLE' },
      take: quantity,
    })
    if (available.length > 0) {
      await tx.inventoryUnit.updateMany({
        where: { id: { in: available.map((u) => u.id) } },
        data: { status: 'CHECKED_OUT' },
      })
    }
    await tx.kitItem.create({
      data: { kitId: kit.id, inventoryItemId: ki.inventoryItemId, quantity, inventoryUnitId: null },
    })
    await tx.checkLog.create({
      data: { action: 'CHECK_OUT', itemId: ki.inventoryItemId, operatorId, projectId, notes: note },
    })
  }
}
```

---

## 2 — Distinct Status Chip Colors

Currently "Available" (`success` = green) and "Checked Out" (`primary` = also green in this theme) look the same. Change "Checked Out" to `info` (blue).

| Status | Old | New |
|--------|-----|-----|
| AVAILABLE | `success` | `success` — no change |
| CHECKED_OUT | `primary` | `info` |
| IN_MAINTENANCE | `warning` | `warning` — no change |
| INOPERABLE | `error` | `error` — no change |
| RETIRED | `default` | `default` — no change |

### 2.1 `STATUS_CHIP_COLOR` maps — two files

**`src/app/(admin)/admin/inventory/page.tsx`** (line ~23):
```typescript
const STATUS_CHIP_COLOR: Record<string, 'success' | 'info' | 'primary' | 'warning' | 'default' | 'error'> = {
  AVAILABLE: 'success',
  CHECKED_OUT: 'info',
  IN_MAINTENANCE: 'warning',
  INOPERABLE: 'error',
  RETIRED: 'default',
}
```

**`src/app/(operator)/operator/inventory/page.tsx`** (line ~15):
```typescript
const STATUS_CHIP_COLOR: Record<string, 'success' | 'info' | 'primary' | 'warning' | 'default' | 'error'> = {
  AVAILABLE: 'success',
  CHECKED_OUT: 'info',
  IN_MAINTENANCE: 'warning',
  INOPERABLE: 'error',
  RETIRED: 'default',
}
```

### 2.2 Hardcoded "Checked Out" chip in item detail drawer

**`src/app/(admin)/admin/inventory/page.tsx`** — unitCounts summary chips (around line 465):

```tsx
{detail.unitCounts.checkedOut > 0 && (
  <Chip size="small" color="info" label={`${detail.unitCounts.checkedOut} Checked Out`} />
)}
```

### 2.3 Check log action chips — two locations

**Location A** — existing item-level History tab (tab index 2, around line 663):

```tsx
<Chip
  size="small"
  label={log.action === 'CHECK_OUT' ? 'Out' : 'In'}
  color={log.action === 'CHECK_OUT' ? 'info' : 'success'}
  sx={{ minWidth: 40 }}
/>
```

**Location B** — the new per-unit history inline chips added in Section 3 of this sprint (use `'info'` consistently).

---

## 3 — Per-Unit History in Inventory Detail Drawer

In the admin inventory detail drawer, the Units tab shows each physical unit as a row. Each row should have a toggle to expand that unit's check-log history inline.

### 3.1 API — include `inventoryUnitId` in check log response

**`src/app/api/inventory/[id]/route.ts`**

The `checkLogs` include uses `include: { operator: true }` which returns all scalar fields by default — `inventoryUnitId` is already included in the Prisma response. However, the frontend TypeScript interface doesn't declare it. No API change needed; just update the interface (Section 3.2).

Increase the fetch limit from 20 to 100 to support items with many serialized units:

```typescript
checkLogs: {
  include: { operator: true },
  orderBy: { submittedAt: 'desc' },
  take: 100,   // was 20
},
```

### 3.2 TypeScript — add `inventoryUnitId` to `CheckLogEntry`

**`src/app/(admin)/admin/inventory/page.tsx`** (line ~87):

```typescript
interface CheckLogEntry {
  id: string
  action: string
  condition: string | null
  submittedAt: string
  inventoryUnitId: string | null   // ADD
  operator: { id: string; name: string } | null
}
```

### 3.3 Icon imports

**`src/app/(admin)/admin/inventory/page.tsx`** — add to the MUI icon imports:

```typescript
import HistoryIcon from '@mui/icons-material/History'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
```

Current imports present: `AddIcon`, `EditIcon`, `ArchiveIcon`, `ExpandMoreIcon`, `WarningAmberIcon`, `DownloadIcon`. No duplicates.

### 3.4 State — expandable unit row

Add inside the `DetailDrawer` component (alongside other state declarations):

```typescript
const [expandedUnitId, setExpandedUnitId] = React.useState<string | null>(null)
```

Reset when the drawer changes item:
```typescript
React.useEffect(() => {
  if (!row) setExpandedUnitId(null)
}, [row])
```

### 3.5 Units tab — expandable rows

**`src/app/(admin)/admin/inventory/page.tsx`** — the Units tab `<TableBody>` (around line 583).

The Units tab `<Table>` already has columns: `#`, `Serial Number`, `Status`, `Actions`. Add a 5th column `History` in the header, and add expand/collapse per row.

In `<TableHead>`, add:
```tsx
<TableCell />  {/* history toggle column */}
```

In each `<TableRow key={unit.id} ...>`, add a cell after the Actions cell:

```tsx
<TableCell>
  <IconButton
    size="small"
    onClick={() => setExpandedUnitId((prev) => prev === unit.id ? null : unit.id)}
    title={expandedUnitId === unit.id ? 'Hide history' : 'View history'}
  >
    {expandedUnitId === unit.id ? <ExpandLessIcon fontSize="small" /> : <HistoryIcon fontSize="small" />}
  </IconButton>
</TableCell>
```

After each `<TableRow key={unit.id}>...</TableRow>`, add the expandable history row:

```tsx
{expandedUnitId === unit.id && (() => {
  const unitLogs = detail.checkLogs.filter((l) => l.inventoryUnitId === unit.id)
  return (
    <TableRow>
      <TableCell colSpan={5} sx={{ pt: 0, pb: 1.5, px: 3, bgcolor: 'action.hover' }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.5}>
          {unit.serialNumber ?? `Unit ${idx + 1}`} — history ({unitLogs.length} event{unitLogs.length !== 1 ? 's' : ''})
        </Typography>
        {unitLogs.length === 0 ? (
          <Typography variant="caption" color="text.secondary">No check logs for this unit.</Typography>
        ) : (
          <Stack spacing={0.5}>
            {unitLogs.map((log) => (
              <Stack key={log.id} direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  label={log.action === 'CHECK_OUT' ? 'Out' : 'In'}
                  color={log.action === 'CHECK_OUT' ? 'info' : 'success'}
                  sx={{ minWidth: 40 }}
                />
                <Typography variant="caption">{log.operator?.name ?? 'Unknown'}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto !important' }}>
                  {new Date(log.submittedAt).toLocaleDateString()}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </TableCell>
    </TableRow>
  )
})()}
```

Note: `idx` is already available from the outer `.map((unit, idx) => ...)` call, so `unit.serialNumber ?? \`Unit ${idx + 1}\`` does not require a `position` field on the `UnitRow` interface.

---

## 4 — Partial Kit Management (Remove / Transfer by Unit or Quantity)

Currently the kit remove and transfer flows are all-or-nothing per item. This section adds granular control: operators can remove a partial quantity of a consumable item, or select a specific serialized unit to remove or transfer — without affecting other units of the same item in the kit.

### 4.1 Data model — what a "remove" looks like

`KitItem` already has `removedAt DateTime?` and `quantity Int`. For partial removal of consumables, instead of marking the single `KitItem` as removed, we:
- Decrement its `quantity` by the removed amount
- Create a `CheckLog` with `action: 'CHECK_IN'` covering only the removed units
- Update the `InventoryUnit` records for those units back to `AVAILABLE`

For serialized items, each unit is its own `KitItem` record (quantity = 1), so a partial removal is just removing one specific `KitItem`.

No schema changes are required.

### 4.2 API — `DELETE /api/deployments/[id]/items/[kitItemId]`

**File:** `src/app/api/deployments/[id]/items/[kitItemId]/route.ts` (create if it doesn't exist)

Accept an optional `quantity` body parameter for consumables and an optional `inventoryUnitId` body parameter for serialized items:

```typescript
const bodySchema = z.object({
  quantity: z.number().int().min(1).optional(),        // consumable: how many to return
  inventoryUnitId: z.string().optional(),               // serialized: which unit to return
  condition: z.enum(['GOOD', 'IN_MAINTENANCE', 'INOPERABLE']).optional(),
  notes: z.string().optional(),
})

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kitItemId: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: rigId, kitItemId } = await params
  const body = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 })

  const kitItem = await prisma.kitItem.findUnique({
    where: { id: kitItemId },
    include: { inventoryItem: true },
  })
  if (!kitItem) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isSerialized = kitItem.inventoryItem.itemType === 'SERIALIZED'

  await prisma.$transaction(async (tx) => {
    if (isSerialized) {
      // Soft-remove the single kit item
      await tx.kitItem.update({ where: { id: kitItemId }, data: { removedAt: new Date() } })
      if (kitItem.inventoryUnitId) {
        const newStatus = body.data.condition === 'IN_MAINTENANCE'
          ? 'IN_MAINTENANCE'
          : body.data.condition === 'INOPERABLE'
          ? 'INOPERABLE'
          : 'AVAILABLE'
        await tx.inventoryUnit.update({
          where: { id: kitItem.inventoryUnitId },
          data: { status: newStatus },
        })
        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: kitItem.inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId,
            operatorId: session.userId,
            condition: body.data.condition ?? 'GOOD',
            notes: body.data.notes,
          },
        })
      }
    } else {
      // CONSUMABLE — partial return
      const removeQty = body.data.quantity ?? kitItem.quantity
      if (removeQty >= kitItem.quantity) {
        // Remove entire kit item row
        await tx.kitItem.update({ where: { id: kitItemId }, data: { removedAt: new Date() } })
      } else {
        // Reduce quantity
        await tx.kitItem.update({
          where: { id: kitItemId },
          data: { quantity: kitItem.quantity - removeQty },
        })
      }
      // Return that many units to AVAILABLE (pick any CHECKED_OUT units for this item)
      const units = await tx.inventoryUnit.findMany({
        where: { inventoryItemId: kitItem.inventoryItemId, status: 'CHECKED_OUT' },
        take: removeQty,
        orderBy: { createdAt: 'asc' },
      })
      if (units.length > 0) {
        await tx.inventoryUnit.updateMany({
          where: { id: { in: units.map((u) => u.id) } },
          data: { status: 'AVAILABLE' },
        })
      }
      await tx.checkLog.create({
        data: {
          action: 'CHECK_IN',
          itemId: kitItem.inventoryItemId,
          operatorId: session.userId,
          notes: body.data.notes,
        },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
```

### 4.3 Operator My Rig — per-item remove UI

**File:** `src/app/(operator)/operator/my-rig/page.tsx`

Currently kit items likely show a remove button that removes all. Replace with:

**For consumable items** — show a quantity stepper in the remove dialog (defaults to full quantity, slider/text input from 1 to `kitItem.quantity`).

**For serialized items** — the kit item IS a specific unit (one `KitItem` per unit). The remove button removes that specific unit. Show the unit label (`serialNumber ?? \`Unit ${position}\``) in the remove confirmation.

**Remove confirmation dialog** — add condition selection (Good / Needs Maintenance / Inoperable) before confirming, matching the existing end-of-rig disposition UI:

```tsx
<Dialog open={removeDialog.open} onClose={() => setRemoveDialog({ open: false, kitItem: null })}>
  <DialogTitle>Return Item</DialogTitle>
  <DialogContent>
    <Typography mb={2}>
      How many <strong>{removeDialog.kitItem?.inventoryItem.name}</strong> are you returning?
    </Typography>

    {/* Consumable: quantity selector */}
    {removeDialog.kitItem?.inventoryItem.itemType === 'CONSUMABLE' && (
      <TextField
        type="number"
        label="Quantity to return"
        value={removeQty}
        onChange={(e) => setRemoveQty(Math.max(1, Math.min(parseInt(e.target.value) || 1, removeDialog.kitItem?.quantity ?? 1)))}
        inputProps={{ min: 1, max: removeDialog.kitItem?.quantity ?? 1 }}
        fullWidth
        sx={{ mb: 2 }}
      />
    )}

    {/* Condition */}
    <TextField
      select
      label="Condition"
      value={removeCondition}
      onChange={(e) => setRemoveCondition(e.target.value)}
      fullWidth
    >
      <MenuItem value="GOOD">Good</MenuItem>
      <MenuItem value="IN_MAINTENANCE">Needs Maintenance</MenuItem>
      <MenuItem value="INOPERABLE">Inoperable</MenuItem>
    </TextField>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setRemoveDialog({ open: false, kitItem: null })}>Cancel</Button>
    <Button variant="contained" color="error" onClick={handleRemoveItem}>Return</Button>
  </DialogActions>
</Dialog>
```

State additions:
```typescript
const [removeDialog, setRemoveDialog] = React.useState<{ open: boolean; kitItem: KitItem | null }>({ open: false, kitItem: null })
const [removeQty, setRemoveQty] = React.useState(1)
const [removeCondition, setRemoveCondition] = React.useState('GOOD')
```

Handler:
```typescript
const handleRemoveItem = async () => {
  if (!removeDialog.kitItem) return
  const res = await fetch(`/api/deployments/${rig.id}/items/${removeDialog.kitItem.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity: removeQty, condition: removeCondition }),
  })
  if (res.ok) {
    setRemoveDialog({ open: false, kitItem: null })
    await load()
  }
}
```

### 4.4 Transfer — select specific units/quantities

**File:** wherever the transfer creation dialog lives (likely `src/app/(operator)/operator/transfers/page.tsx` or similar)

When creating a transfer, the "select items to transfer" dialog should mirror the partial-remove logic:

- For consumable items: quantity input (1 to `kitItem.quantity`)
- For serialized items: list available units in the kit; operator picks which specific unit(s) to transfer

The `TransferItem` model likely carries `inventoryItemId` and `quantity`. To support serialized granularity, check if `TransferItem.inventoryUnitId` exists; if not, confirm whether it needs to be added as part of this sprint or deferred to Sprint 7.

**If `TransferItem.inventoryUnitId` doesn't exist in the schema:** Add it as a nullable field and create a migration. This is a schema change and moves this feature's deploy to require a migration step.

**API — `POST /api/transfers`** — update the items array schema to accept either `{ inventoryItemId, quantity }` or `{ inventoryItemId, inventoryUnitId }`.

### 4.5 Admin — partial kit management

The admin deployment drawer's kit view (in `src/app/(admin)/admin/deployments/page.tsx`) should also allow partial removal using the same `DELETE /api/deployments/[id]/items/[kitItemId]` endpoint. Update the remove button in the kit items list to open the same quantity/condition dialog.

---

## 5 — Deploy

No schema or migration changes — this sprint is UI and API logic only, **unless** the transfer flow requires `TransferItem.inventoryUnitId` (Section 4.4). Check the schema before running; if the field is missing, add it and run `make db-migrate`.

```bash
# Commit
git add -A
git commit -m "feat: unit labels, distinct status colors, per-unit history (Sprint 5)"
git push -u origin feature/<branch>

# PR + staging deploy (standard flow from CLAUDE.md)
gh pr create \
  --title "feat: Sprint 5 — unit labels, status colors, per-unit history" \
  --base main
PR_NUMBER=$(gh pr view --json number --jq .number)
gh workflow run pr-staging-deploy.yml -f pr_number=$PR_NUMBER
gh run watch
```

No data migration required. `position` is derived at query time from sort order.

---

## 6 — Implementation Order

1. **API** — add `orderBy: { createdAt: 'asc' }` to inventory list route units include; compute and return `position` on `availableUnits` (Section 1.2)
2. **API** — add `position` to `/api/inventory/[id]/units` response (Section 1.3)
3. **API** — update `by-qr` route to include `position` (Section 1.5, optional but recommended)
4. **API** — update `POST /api/deployments` to accept `inventoryUnitId` for SERIALIZED items (Section 1.7)
5. **TypeScript interfaces** — add `position` to `availableUnits`; add `inventoryUnitId` to `CheckLogEntry`; add `itemType` and `availableUnits` to `InventoryOption`; widen `STATUS_CHIP_COLOR` type to include `'info'` (Sections 1.4, 3.2, 2.1)
6. **Operator Build Kit** — update unit label fallback (Section 1.5)
7. **Admin kit dialogs** — `AdminKitEntry` type; `NewDeploymentDialog` unit picker; `DeploymentDrawer` Add Items unit picker; update both payloads (Section 1.6)
8. **Status colors** — `STATUS_CHIP_COLOR` maps, hardcoded chips, check log action chips (Section 2)
9. **Per-unit history** — icon imports, `expandedUnitId` state, history rows in Units tab (Section 3)
10. **Schema check** — confirm `TransferItem.inventoryUnitId` exists; create migration if missing (Section 4.4)
11. **Partial kit remove API** — `DELETE /api/deployments/[id]/items/[kitItemId]` with quantity + condition (Section 4.2)
12. **Operator My Rig remove UI** — per-item quantity/condition dialog (Section 4.3)
13. **Transfer dialog** — per-unit/quantity selection (Section 4.4)
14. **Admin deployment drawer** — partial remove support (Section 4.5)
15. `npx tsc --noEmit` — confirm clean typecheck before committing
