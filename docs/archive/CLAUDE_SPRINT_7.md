# CLAUDE_SPRINT_7.md — Polish, Correctness & Daily Operations

**Purpose:** Eliminate all confirmed data accuracy bugs, complete all stub pages, wire offline support, activate the alert system, and clean up the accumulated technical debt from Sprints 4–6.

Stack: Next.js 16 App Router, TypeScript, Prisma 6, MUI v6, Supabase PostgreSQL, GCP Cloud Run. Read `AGENTS.md` before writing any code.

---

## Corrections to the AHITS_REVIEW_V2.md

The following findings in AHITS_REVIEW_V2.md were wrong. Do NOT implement the "fixes" described there for these items:

1. **"ToastProvider not mounted"** — Both `src/app/(admin)/layout.tsx` and `src/app/(operator)/layout.tsx` already import `ToastProvider` and wrap children with it. Sprint 6 completed this. The pages still have inline `toast` state (an `Alert` component in the JSX), which is redundant, but the provider is present. The cleanup task is replacing the inline per-page Alert with `useToast()` calls — not mounting the provider.

2. **"TRANSFER disposition not setting kitItem.removedAt at end-of-deployment"** — `end/route.ts` line 75 sets `removedAt: now` for **every** disposition in the loop, including TRANSFER. The real bug is different: after setting `removedAt: now` on the kit items, the accept route guard `{ removedAt: null }` will reject them, AND the guard `sourceRig?.endedAt` will also reject them. End-of-deployment TRANSFER requests are created but can **never** be accepted. This is a lifecycle bug, not a missing field.

3. **"db-seed-units target missing from Makefile"** — `make db-seed-units` already exists in the Makefile (line 65–66). Nothing to add.

---

## Overview

| # | Area | Priority | Files Changed |
|---|------|----------|---------------|
| 1 | CheckLog.condition on returns | P0 | `items/[kitItemId]/route.ts`, `items/route.ts` |
| 2 | Consumable return: scope to correct rig | P0 | `items/[kitItemId]/route.ts`, `items/route.ts` |
| 3 | End-of-deployment TRANSFER lifecycle | P0 | `end/route.ts`, `transfers/[id]/accept/route.ts`, `transfers/[id]/decline/route.ts` |
| 4 | Add rigId to CheckLog | P0/P2 | Schema, all CheckLog.create callsites |
| 5 | Inventory quantity display (diverged) | P0 | Admin inventory page |
| 6 | Scan page chip color | P1 | `operator/scan/page.tsx` |
| 7 | Operator new deployment: serialized unit selection | P1 | `operator/my-rig/page.tsx` |
| 8 | Daily check page | P1 | `operator/daily-check/page.tsx` |
| 9 | Scan-to-action page (replace checkout stub) | P1 | `operator/checkout/page.tsx`, `operator/scan/page.tsx` |
| 10 | My Rig offline caching | P2 | `sw.ts`, daily check offline queue |
| 11 | Secondary operators can initiate transfers | P2 | `deployments/[id]/transfer/route.ts` |
| 12 | Transfer accept: admin audit note | P2 | `transfers/[id]/accept/route.ts` |
| 13 | Alert triggers | P2 | New `src/lib/alerts.ts`, multiple routes |
| 14 | Dead code removal | P3 | `my-rig/page.tsx`, legacy `checkout/route.ts` |
| 15 | Photo context for kit additions | P3 | `items/route.ts` |
| 16 | Replace inline page toasts with useToast | P3 | `my-rig/page.tsx`, `scan/page.tsx` |
| 17 | Tests (remaining from Sprint 6) | P3 | New test files |
| 18 | TypeScript check + deploy | — | — |

---

## 1 — CheckLog.condition on Returns (P0)

`CheckLog.condition` is a `Condition?` field in the schema (`GOOD | MINOR_DAMAGE | NEEDS_REPAIR | MISSING_PARTS`). It is never populated. Every CHECK_IN created during a partial return or end-of-deployment omits it.

The `returnCondition` value from the request body (`GOOD | IN_MAINTENANCE | INOPERABLE`) must be mapped to the `Condition` enum before writing.

**Mapping:**
```typescript
function returnConditionToLogCondition(rc: string | undefined): 'GOOD' | 'NEEDS_REPAIR' | 'MISSING_PARTS' | null {
  if (rc === 'IN_MAINTENANCE') return 'NEEDS_REPAIR'
  if (rc === 'INOPERABLE') return 'MISSING_PARTS'
  if (rc === 'GOOD') return 'GOOD'
  return null  // no condition data (e.g. HUB disposition without explicit condition)
}
```

Add this helper to `src/lib/check-log-helpers.ts` (create the file).

### 1.1 `DELETE /api/deployments/[id]/items/[kitItemId]`

**File:** `src/app/api/deployments/[id]/items/[kitItemId]/route.ts`

Import the helper. Add `condition` to each `tx.checkLog.create` call:

For serialized (line 53):
```typescript
await tx.checkLog.create({
  data: {
    action: 'CHECK_IN',
    itemId: kitItem.inventoryItemId,
    inventoryUnitId: kitItem.inventoryUnitId,
    operatorId: session.userId,
    rigId: rigId,                          // ← added in Section 4
    notes: body.data.notes,
    condition: returnConditionToLogCondition(body.data.returnCondition),
  },
})
```

For consumable (line 84):
```typescript
await tx.checkLog.create({
  data: {
    action: 'CHECK_IN',
    itemId: kitItem.inventoryItemId,
    operatorId: session.userId,
    rigId: rigId,                          // ← added in Section 4
    notes: body.data.notes,
    condition: returnConditionToLogCondition(body.data.returnCondition),
  },
})
```

### 1.2 `DELETE /api/deployments/[id]/items` (bulk remove)

**File:** `src/app/api/deployments/[id]/items/route.ts`

In the DELETE handler, the disposition schema should accept an optional `returnCondition` per item:

Add to `dispositionSchema`:
```typescript
returnCondition: z.enum(['GOOD', 'IN_MAINTENANCE', 'INOPERABLE']).optional(),
```

In the HUB path (line ~219) and INOPERABLE path (line ~249), add `condition` to `tx.checkLog.create`:
```typescript
condition: returnConditionToLogCondition(disp.returnCondition),
```

### 1.3 `POST /api/deployments/[id]/end` (end deployment)

**File:** `src/app/api/deployments/[id]/end/route.ts`

Same pattern. The disposition schema already has `canBeFixed` — the disposition type implies the condition:
- HUB → use `disp.returnCondition` if present, else null
- INOPERABLE + canBeFixed → NEEDS_REPAIR
- INOPERABLE + !canBeFixed → MISSING_PARTS

```typescript
const logCondition = 
  disp.type === 'INOPERABLE' && disp.canBeFixed ? 'NEEDS_REPAIR' :
  disp.type === 'INOPERABLE' && !disp.canBeFixed ? 'MISSING_PARTS' :
  returnConditionToLogCondition(disp.returnCondition)
```

Add `condition: logCondition` to all `tx.checkLog.create` calls in this file.

---

## 2 — Consumable Return: Scope Units to Correct Rig (P0)

**Problem:** When returning consumable items in `DELETE /api/deployments/[id]/items/[kitItemId]` (line 73) and `DELETE /api/deployments/[id]/items` (bulk remove), the code finds CHECKED_OUT units with `where: { inventoryItemId, status: 'CHECKED_OUT' }` — this includes units from ALL active rigs, not just the current rig. With multiple operators, units from another operator's rig could be incorrectly set to AVAILABLE.

**Fix:** Exclude units that are assigned to active kit items in other rigs. This is a best-effort scoping without changing the data model.

**Helper function** (add to `src/lib/check-log-helpers.ts`):

```typescript
/**
 * Returns the IDs of CHECKED_OUT inventory units for a given item
 * that are in kit items of OTHER active rigs (not this one).
 * Used to avoid accidentally returning units that belong to someone else's kit.
 */
export async function getUnitsInOtherRigs(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
  excludeRigId: string,
): Promise<string[]> {
  const otherKitItems = await tx.kitItem.findMany({
    where: {
      inventoryItemId,
      removedAt: null,
      inventoryUnitId: { not: null },
      kit: { rig: { endedAt: null, id: { not: excludeRigId } } },
    },
    select: { inventoryUnitId: true },
  })
  return otherKitItems.map((ki) => ki.inventoryUnitId!).filter(Boolean)
}
```

**Apply in `DELETE /api/deployments/[id]/items/[kitItemId]`** (consumable path, line 73):

```typescript
const excludeUnitIds = await getUnitsInOtherRigs(tx, kitItem.inventoryItemId, rigId)
const units = await tx.inventoryUnit.findMany({
  where: {
    inventoryItemId: kitItem.inventoryItemId,
    status: 'CHECKED_OUT',
    ...(excludeUnitIds.length > 0 && { id: { notIn: excludeUnitIds } }),
  },
  take: removeQty,
  orderBy: { createdAt: 'asc' },
})
```

**Apply identically** in `DELETE /api/deployments/[id]/items` (bulk remove) HUB path (line ~235) and `POST /api/deployments/[id]/end` HUB path (line ~93).

---

## 3 — End-of-Deployment TRANSFER Lifecycle (P0)

**Problem:** When a deployment ends with TRANSFER dispositions, `end/route.ts` line 75 sets `removedAt: now` on ALL kit items in the loop — including TRANSFER items. Then it creates a `TransferRequest` with those kit items. When the destination operator tries to accept the transfer, `transfers/[id]/accept/route.ts` throws at two guards:

1. `sourceRig?.endedAt` check → throws "Source deployment has ended"
2. `{ removedAt: null }` guard on kit items → throws "Kit item is no longer in the source deployment"

End-of-deployment TRANSFER dispositions can currently **never** be accepted. The decline route also never returns units to inventory.

### 3.1 Fix `POST /api/deployments/[id]/end`

**File:** `src/app/api/deployments/[id]/end/route.ts`

In the `for (const disp of itemDispositions)` loop, do NOT set `removedAt` for TRANSFER dispositions. Only set it for HUB and INOPERABLE:

```typescript
// Replace line 75:
//   await tx.kitItem.update({ where: { id: disp.kitItemId }, data: { removedAt: now } })
// With:
if (disp.type !== 'TRANSFER') {
  await tx.kitItem.update({ where: { id: disp.kitItemId }, data: { removedAt: now } })
}
```

This keeps TRANSFER kit items "active" (removedAt: null) until the transfer is resolved, even though the rig itself is ended.

### 3.2 Fix `POST /api/transfers/[id]/accept`

**File:** `src/app/api/transfers/[id]/accept/route.ts`

**Change 1:** Replace the `sourceRig.endedAt` guard. The guard should only block if the rig ended WITHOUT a valid pending transfer (i.e., an old stale transfer from an already-fully-cleaned-up rig). Since the transfer itself is PENDING, this is a valid accept:

```typescript
// Remove or soften the sourceRig.endedAt check:
// The source rig may be ended if this transfer was initiated at end-of-deployment.
// The transfer's PENDING status is the authoritative signal. Do NOT block.
// Delete lines ~53-56 (the sourceRig.endedAt check).
```

**Change 2:** Update the kit item guard to allow items that belong to an ended source rig:

```typescript
// Replace the stillPresent guard:
const stillPresent = await tx.kitItem.findFirst({
  where: {
    id: ti.kitItemId,
    // Allow removedAt IS NULL (active rig) or the source rig is ended (end-of-deployment transfer)
    OR: [
      { removedAt: null },
      { kit: { rig: { id: transfer.fromRig.id, endedAt: { not: null } } } },
    ],
  },
})
if (!stillPresent) {
  throw new Error(`Kit item is no longer in the source deployment`)
}
```

**Change 3:** When accepting an end-of-deployment transfer, set `removedAt` on the source kit item (since we intentionally skipped it in end/route.ts):

```typescript
// After creating the destination kit item, mark the source kit item as removed if needed:
if (transferQty >= currentQty) {
  await tx.kitItem.update({
    where: { id: ti.kitItemId },
    data: { removedAt: now },
  })
} else {
  // partial: decrement
}
```

This is already the existing logic at lines 123–133. The only change needed is that it must run even when `currentKitItem.removedAt` is set (i.e., the partial transfer of an already-removed kit item). Replace line 120–121:

```typescript
const currentKitItem = await tx.kitItem.findUnique({ where: { id: ti.kitItemId } })
const currentQty = currentKitItem?.quantity ?? ti.kitItem.quantity
// Proceed even if removedAt is set (end-of-deployment transfer)
```

**Change 4:** Also pass `inventoryUnitId` in CheckLog creates (lines 142–157). Add the unit ID from the transfer item:

```typescript
await tx.checkLog.create({
  data: {
    action: 'CHECK_IN',
    itemId: ti.kitItem.inventoryItemId,
    inventoryUnitId: ti.inventoryUnitId ?? ti.kitItem.inventoryUnitId ?? undefined,
    operatorId: transfer.fromRig.operatorId,
    rigId: transfer.fromRig.id,            // ← Section 4
    notes: transfer.note,
  },
})
await tx.checkLog.create({
  data: {
    action: 'CHECK_OUT',
    itemId: ti.kitItem.inventoryItemId,
    inventoryUnitId: ti.inventoryUnitId ?? ti.kitItem.inventoryUnitId ?? undefined,
    operatorId: toOperatorId,
    rigId: destRig.id,                     // ← Section 4
    notes: 'Accepted transfer',
  },
})
```

### 3.3 Fix `POST /api/transfers/[id]/decline`

**File:** `src/app/api/transfers/[id]/decline/route.ts`

When a transfer is declined, the units remain CHECKED_OUT (or in an ended rig's kit with removedAt: null). The decline route currently just sets status to DECLINED and returns. The units need to be returned to AVAILABLE and kit items marked as removed.

Rewrite the handler to include cleanup:

```typescript
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const transfer = await prisma.transferRequest.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          kitItem: {
            select: { id: true, inventoryItemId: true, inventoryUnitId: true, quantity: true, removedAt: true },
          },
        },
      },
    },
  })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.status !== 'PENDING') {
    return NextResponse.json({ error: 'Transfer is no longer pending' }, { status: 409 })
  }

  const isDestination = transfer.toOperatorId === session.userId
  const isAdmin = session.role === 'ADMIN'
  if (!isDestination && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { responseNote } = parsed.data

  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.transferRequest.update({
      where: { id },
      data: { status: 'DECLINED', respondedAt: now, responseNote: responseNote ?? null },
    })

    // Return inventory units for items that came from an ended rig (end-of-deployment transfers).
    // For active-rig transfers, items stay in the source kit; for ended-rig transfers, items have
    // no rig to return to, so units must be restored to AVAILABLE (they go back to hub).
    const sourceRig = await tx.rig.findUnique({
      where: { id: transfer.fromRigId },
      select: { endedAt: true },
    })
    if (sourceRig?.endedAt) {
      // Source rig is ended — restore units and mark kit items as removed
      for (const ti of transfer.items) {
        const kitItem = ti.kitItem
        if (kitItem.removedAt) continue  // already cleaned up

        await tx.kitItem.update({ where: { id: kitItem.id }, data: { removedAt: now } })

        if (kitItem.inventoryUnitId) {
          await tx.inventoryUnit.update({
            where: { id: kitItem.inventoryUnitId },
            data: { status: 'AVAILABLE' },
          })
        } else {
          // Consumable: return N units
          const units = await tx.inventoryUnit.findMany({
            where: { inventoryItemId: kitItem.inventoryItemId, status: 'CHECKED_OUT' },
            take: kitItem.quantity,
          })
          if (units.length > 0) {
            await tx.inventoryUnit.updateMany({
              where: { id: { in: units.map((u) => u.id) } },
              data: { status: 'AVAILABLE' },
            })
          }
        }
        await tx.checkLog.create({
          data: {
            action: 'CHECK_IN',
            itemId: kitItem.inventoryItemId,
            inventoryUnitId: kitItem.inventoryUnitId ?? undefined,
            operatorId: session.userId,
            notes: `Transfer declined: ${responseNote ?? 'no reason given'}. Units returned to inventory.`,
          },
        })
      }
    }
    // If source rig is still active, items stay in the source kit unchanged. No unit restoration needed.
  })

  return NextResponse.json({ ok: true })
}
```

---

## 4 — Add rigId to CheckLog (P0/P2)

`CheckLog` has no FK to `Rig`, making deployment-level audit queries impossible.

### 4.1 Schema migration

**File:** `prisma/schema.prisma`

In `model CheckLog`, add after `operatorId`:
```prisma
rigId           String?
```

Add relation:
```prisma
rig           Rig?           @relation(fields: [rigId], references: [id])
```

Add index:
```prisma
@@index([rigId])
```

In `model Rig`, add to relations:
```prisma
checkLogs  CheckLog[]
```

Run `make db-migrate-dev` to generate and apply migration.

### 4.2 Update all CheckLog.create callsites

Add `rigId` wherever the rig context is available. All callsites:

**`POST /api/deployments` (initial checkout)**  
File: `src/app/api/deployments/route.ts`  
The `rig.id` is available. Add `rigId: rig.id` to all `checkLog.create` calls.

**`POST /api/deployments/[id]/items` (add items)**  
File: `src/app/api/deployments/[id]/items/route.ts`  
The `id` param (rigId) is available. Add `rigId: id`.

**`DELETE /api/deployments/[id]/items` (bulk remove)**  
Same file. Add `rigId: id`.

**`DELETE /api/deployments/[id]/items/[kitItemId]` (per-item return)**  
File: `src/app/api/deployments/[id]/items/[kitItemId]/route.ts`  
The `id` (rigId) is available as `rigId`. Add `rigId`.

**`POST /api/deployments/[id]/end` (end deployment)**  
File: `src/app/api/deployments/[id]/end/route.ts`  
The `id` (rigId) is available. Add `rigId: id`.

**`POST /api/transfers/[id]/accept`**  
File: `src/app/api/transfers/[id]/accept/route.ts`  
Source rig: `rigId: transfer.fromRig.id` for CHECK_IN logs.  
Destination rig: `rigId: destRig.id` for CHECK_OUT logs.

---

## 5 — InventoryItem.quantity Display (P0)

**Problem:** `InventoryItem.quantity` is set at creation and never updated. The actual quantity is `unitCounts.totalUnits` derived from live `InventoryUnit` records. Showing `quantity` in the admin edit form as editable misleads admins into thinking they're changing the real count.

**Fix:** In the admin inventory edit dialog, replace the editable `quantity` field with a read-only display of the computed unit count. Admins add or retire units through the Units tab, not by editing a number.

**File:** `src/app/(admin)/admin/inventory/page.tsx`

In the item edit form/dialog, find the `quantity` TextField. Replace with a read-only display:

```tsx
{/* Replace editable quantity field with: */}
<Box>
  <Typography variant="caption" color="text.secondary">Total Units</Typography>
  <Typography variant="body2">{editItem?.unitCounts?.totalUnits ?? editItem?.quantity ?? 0} (managed in Units tab)</Typography>
</Box>
```

Remove `quantity` from the PATCH payload sent to `PATCH /api/inventory/[id]`. Do not change the schema or the API (the field stays in the DB for backwards compatibility, just remove the edit pathway).

---

## 6 — Scan Page Chip Color (P1)

**File:** `src/app/(operator)/operator/scan/page.tsx`

Line 33. Change:
```typescript
CHECKED_OUT: 'primary',
```
To:
```typescript
CHECKED_OUT: 'info',
```

The type annotation must also change from `'success' | 'primary' | 'warning' | 'error' | 'default'` to include `'info'`:
```typescript
const STATUS_COLORS: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
```

---

## 7 — Operator New Deployment: Serialized Unit Selection (P1)

**File:** `src/app/(operator)/operator/my-rig/page.tsx`

**Problem:** `NewDeploymentDialog` stores kit items as `Map<string, number>` (just quantity). Serialized items need unit selection before checkout.

### 7.1 Update NewDeploymentDialog state

Replace:
```typescript
const [kitItems, setKitItems] = React.useState<Map<string, number>>(new Map())
```
With (reusing the same `PendingItemEntry` type already defined at the top of the file):
```typescript
const [kitItems, setKitItems] = React.useState<Map<string, PendingItemEntry>>(new Map())
```

Add state for QR scanning within the dialog (reuse the same fields as the Add Items picker):
```typescript
const [unitManualQR, setUnitManualQR] = React.useState<Record<string, string>>({})
const [unitQrLoading, setUnitQrLoading] = React.useState<Record<string, boolean>>({})
```

### 7.2 Update the "Build Kit" step (step 2)

Replace the simple quantity `<TextField>` block with the full serialized unit selector already written in the "Add Items" picker (lines 1073–1154 of the existing file). The only code to copy is inside the `{availableItems.map((item) => { ... })}` render.

The `handleQRScan` and `lookupManualQR` helpers are identical to those in the Add Items picker — extract them into the dialog component (or extract them as a shared `SerializedUnitPicker` component to avoid duplication).

### 7.3 Update the `launch` function

Replace:
```typescript
kitItems: Array.from(kitItems.entries()).map(([inventoryItemId, quantity]) => ({
  inventoryItemId,
  quantity,
})),
```
With:
```typescript
kitItems: Array.from(kitItems.entries()).map(([inventoryItemId, entry]) =>
  entry.itemType === 'SERIALIZED'
    ? { itemType: 'SERIALIZED', inventoryItemId, inventoryUnitId: entry.inventoryUnitId! }
    : { itemType: 'CONSUMABLE', inventoryItemId, quantity: entry.quantity }
),
```

### 7.4 Disable the Launch button if any serialized item has no unit selected

```typescript
const hasUnselectedSerialized = Array.from(kitItems.values()).some(
  (e) => e.itemType === 'SERIALIZED' && !e.inventoryUnitId,
)
// Add to disabled condition:
disabled={!note.trim() || loading || hasUnselectedSerialized}
```

### 7.5 Handle 409 UNIT_CONFLICT on launch

The new deployment route already returns 409 with `error: 'This unit was just checked out...'`. Handle it in `launch`:
```typescript
if (res.status === 409) {
  const d = await res.json()
  // Clear all serialized unit selections so operator must re-pick
  const m = new Map(kitItems)
  m.forEach((entry, itemId) => {
    if (entry.itemType === 'SERIALIZED') {
      m.set(itemId, { itemType: 'SERIALIZED', quantity: 1, inventoryUnitId: null, unitLabel: null })
    }
  })
  setKitItems(m)
  setStep(2) // back to Build Kit step
  setError(d.error ?? 'A unit was just taken. Please reselect.')
  return
}
```

---

## 8 — Daily Check Page (P1)

**File:** `src/app/(operator)/operator/daily-check/page.tsx`

Replace the stub with a full implementation. The API at `POST /api/daily-check` already accepts the full schema.

The checklist items are standardized (these must match what the admin expects to review):

```typescript
const DEFAULT_CHECKLIST = [
  { key: 'tires', label: 'Tires / inflation' },
  { key: 'lights', label: 'Lights / signals' },
  { key: 'fluids', label: 'Fluid levels (oil, coolant, brake)' },
  { key: 'brakes', label: 'Brakes' },
  { key: 'wipers', label: 'Windshield / wipers' },
  { key: 'mirrors', label: 'Mirrors' },
  { key: 'safety_kit', label: 'Safety kit present (first aid, fire ext.)' },
  { key: 'damage', label: 'No new visible damage' },
  { key: 'cleanliness', label: 'Vehicle is clean and secured' },
]
```

### 8.1 Page state

```typescript
interface ChecklistRow {
  key: string
  label: string
  value: 'yes' | 'no' | 'na'
  note: string
}

const [rig, setRig] = React.useState<{ id: string; vehicles: { id: string; vehicle: { id: string; name: string } }[] } | null>(null)
const [vehicleId, setVehicleId] = React.useState('')
const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10))
const [odometer, setOdometer] = React.useState('')
const [site, setSite] = React.useState('')
const [checklist, setChecklist] = React.useState<ChecklistRow[]>(
  DEFAULT_CHECKLIST.map((item) => ({ ...item, value: 'yes', note: '' }))
)
const [issues, setIssues] = React.useState('')
const [submitting, setSubmitting] = React.useState(false)
const [submitted, setSubmitted] = React.useState(false)
const [error, setError] = React.useState('')
const showToast = useToast()
```

### 8.2 Load active rig on mount

```typescript
React.useEffect(() => {
  fetch('/api/deployments')
    .then((r) => r.json())
    .then((json) => {
      const active = json.data?.[0] ?? null
      setRig(active)
      if (active?.vehicles?.[0]) setVehicleId(active.vehicles[0].vehicle.id)
    })
    .catch(() => {})
}, [])
```

### 8.3 passFail derivation

```typescript
const passFail = checklist.every((item) => item.value !== 'no')
```

If ANY checklist item is `'no'`, the check fails. The `issues` field is required when `!passFail`.

### 8.4 Submit handler

```typescript
const handleSubmit = async () => {
  if (!vehicleId) { setError('Select a vehicle'); return }
  if (!passFail && !issues.trim()) { setError('Describe the issue(s) that caused a fail'); return }
  setSubmitting(true)
  setError('')
  try {
    const res = await fetch('/api/daily-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleId,
        date,
        odometer: odometer ? parseInt(odometer) : undefined,
        site: site || undefined,
        checklistJson: checklist.map(({ key, label, value, note }) => ({ key, label, value, note: note || undefined })),
        issues: issues || undefined,
        passFail,
      }),
    })
    if (res.ok) {
      setSubmitted(true)
      showToast({ message: `Daily check submitted — ${passFail ? 'Pass ✓' : 'Fail ✗ — admin notified'}`, severity: passFail ? 'success' : 'warning' })
    } else {
      const d = await res.json()
      setError(d.error?.formErrors?.[0] ?? d.error ?? 'Submission failed')
    }
  } finally {
    setSubmitting(false)
  }
}
```

### 8.5 Offline queue integration

If the submit fails due to a network error, enqueue for later sync:

```typescript
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
// ...
const { enqueue, queueSize, isOffline } = useOfflineQueue()

// In catch block of handleSubmit:
} catch (err) {
  // Network failure — queue for offline sync
  await enqueue({
    endpoint: '/api/daily-check',
    method: 'POST',
    body: {
      vehicleId,
      date,
      odometer: odometer ? parseInt(odometer) : undefined,
      site: site || undefined,
      checklistJson: checklist.map(({ key, label, value, note }) => ({ key, label, value, note: note || undefined })),
      issues: issues || undefined,
      passFail,
    },
  })
  setSubmitted(true)
  showToast({ message: 'No network — check queued, will sync when online', severity: 'info' })
}
```

Show a banner when `queueSize > 0`: `"${queueSize} daily check(s) pending sync"`.

### 8.6 UI layout

Use a stepper with 3 steps: **Vehicle & Date** → **Inspection Checklist** → **Review & Submit**

The checklist step should use a `List` where each item has:
- The label text
- A `ToggleButtonGroup` with Yes / No / N/A
- An inline `TextField` for notes that appears when value is 'no'

Highlight items with `value === 'no'` in red. Show a `Chip` colored `success` (Pass) or `error` (Fail) updating in real-time as the operator fills the form.

When `submitted === true`, show a success/fail summary card with:
- Pass/Fail chip
- Checklist summary (any no items listed)
- A "Start New Check" button that resets state

---

## 9 — Scan Page Becomes Action-Capable (P1)

The existing scan page shows unit info but does nothing with it. The checkout page stub exists but has no architecture. **Solution:** Merge them — keep the scan page as the canonical scan workflow, add check-in/check-out actions, and redirect the checkout stub to the scan page.

### 9.1 Update `src/app/(operator)/operator/scan/page.tsx`

After a successful scan that returns a unit, determine the appropriate action:

```typescript
interface UnitInfo {
  // existing fields...
  activeKitItemId: string | null   // ← add: kitItemId if in operator's active kit
  canReturn: boolean               // ← add: unit is CHECKED_OUT AND in operator's active kit
}
```

**Fetch active rig on mount:**
```typescript
const [activeRigId, setActiveRigId] = React.useState<string | null>(null)
const [activeKitItems, setActiveKitItems] = React.useState<Array<{ id: string; inventoryUnitId: string | null }>>([])

React.useEffect(() => {
  fetch('/api/deployments')
    .then((r) => r.json())
    .then((json) => {
      const active = json.data?.[0]
      if (active) {
        setActiveRigId(active.id)
        const items = active.kits?.flatMap((k: any) => k.items) ?? []
        setActiveKitItems(items)
      }
    })
    .catch(() => {})
}, [])
```

**After scanning, determine actions:**
```typescript
const kitItemForUnit = unit && activeKitItems.find((ki) => ki.inventoryUnitId === unit.id)

const canReturn = !!kitItemForUnit && unit.status === 'CHECKED_OUT'
const canAdd = unit.status === 'AVAILABLE' && !!activeRigId
```

**Show contextual actions below the unit card:**

```tsx
{unit && (
  <Stack spacing={1} mt={2}>
    {canReturn && (
      <Button variant="contained" color="success" onClick={handleReturn}>
        Return to Hub
      </Button>
    )}
    {canAdd && (
      <Button variant="outlined" onClick={handleAddToKit}>
        Add to My Kit
      </Button>
    )}
  </Stack>
)}
```

`handleReturn` calls `DELETE /api/deployments/${activeRigId}/items/${kitItemForUnit!.id}` with `{ returnCondition: 'GOOD' }` (condition pre-set to GOOD; an inline `<Select>` can be shown to change it before confirming).

`handleAddToKit` opens a small confirmation dialog then calls `POST /api/deployments/${activeRigId}/items` with the serialized unit entry.

### 9.2 Update `src/app/(operator)/operator/checkout/page.tsx`

Replace the stub with a redirect to scan:

```typescript
import { redirect } from 'next/navigation'

export default function CheckoutPage() {
  redirect('/operator/scan')
}
```

The checkout nav link should also be updated to point to `/operator/scan` in `OperatorNav`.

### 9.3 Update OperatorNav

**File:** `src/components/operator/OperatorNav.tsx` (verify path)

Change the "Checkout" nav item href from `/operator/checkout` to `/operator/scan`, or rename the label to "Scan" if the nav item currently says "Checkout".

---

## 10 — My Rig Offline Caching (P2)

### 10.1 Add deployments to service worker cache

**File:** `src/app/sw.ts`

Add `/api/deployments` to the NetworkFirst cache list:

```typescript
(pathname === '/api/dashboard' ||
  pathname.startsWith('/api/deployments') ||   // ← add this line
  pathname.startsWith('/api/inventory') ||
  pathname.startsWith('/api/vehicles') ||
  pathname.startsWith('/api/maintenance') ||
  pathname.startsWith('/api/daily-check')),    // ← add this line
```

Adding `daily-check` to the list caches past daily check records so the history tab works offline.

### 10.2 Add an offline badge to the operator layout

**File:** `src/app/(operator)/layout.tsx`

Import `useOfflineQueue`:
```typescript
// The layout is a server component — do NOT import useOfflineQueue here.
// Instead, add a small OfflineBanner client component:
```

Create `src/components/operator/OfflineBanner.tsx`:
```tsx
'use client'
import { Alert } from '@mui/material'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'

export function OfflineBanner() {
  const { isOffline, queueSize } = useOfflineQueue()
  if (!isOffline && queueSize === 0) return null
  return (
    <Alert severity={isOffline ? 'warning' : 'info'} sx={{ mb: 0, borderRadius: 0 }}>
      {isOffline
        ? `You're offline. My Rig is showing cached data.${queueSize > 0 ? ` ${queueSize} item(s) pending sync.` : ''}`
        : `${queueSize} action(s) waiting to sync — go online to complete.`}
    </Alert>
  )
}
```

Add `<OfflineBanner />` inside the operator layout (before `<AppShell>` or as a child).

---

## 11 — Secondary Operators Can Initiate Transfers (P2)

**File:** `src/app/api/deployments/[id]/transfer/route.ts`

Line 45:
```typescript
if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

Replace with the same secondary-operator check used in `end/route.ts`:
```typescript
if (session.role !== 'ADMIN' && rig.operatorId !== session.userId) {
  const isSecondary = await prisma.rigOperator.findUnique({
    where: { rigId_operatorId: { rigId: id, operatorId: session.userId } },
  })
  if (!isSecondary) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

---

## 12 — Transfer Accept: Admin Audit Note (P2)

When an admin accepts a transfer on behalf of the destination operator, there is currently no record of who accepted it. The `respondedAt` and `responseNote` fields capture timing and optional note, but not that it was an admin action.

**File:** `src/app/api/transfers/[id]/accept/route.ts`

In the final `transferRequest.update` call, add a metadata note when `isAdmin && !isDestination`:

```typescript
data: {
  status: 'ACCEPTED',
  respondedAt: now,
  responseNote: isAdmin && !isDestination
    ? `Accepted by admin ${session.name}${responseNote ? `: ${responseNote}` : ''}`
    : responseNote ?? null,
},
```

---

## 13 — Alert Triggers (P2)

The `Alert` model exists with `type`, `sourceTable`, `sourceId`, `metadata`, and `resolved`. Zero alerts are currently created.

### 13.1 Create `src/lib/alerts.ts`

```typescript
import { prisma } from '@/lib/prisma'

type AlertMeta = Record<string, string | number | boolean | null>

export async function createAlert(type: string, sourceTable: string, sourceId: string, metadata?: AlertMeta) {
  // Idempotent: don't create duplicate unresolved alerts for the same source
  const existing = await prisma.alert.findFirst({
    where: { type: type as never, sourceTable, sourceId, resolved: false },
  })
  if (existing) return existing

  return prisma.alert.create({
    data: { type: type as never, sourceTable, sourceId, metadata: metadata ?? {} },
  })
}
```

### 13.2 DAMAGE_REPORTED alert

**File:** `src/app/api/deployments/[id]/end/route.ts` and `src/app/api/deployments/[id]/items/route.ts`

After creating a `MaintenanceTask` with `isDamageReport: true`, create an alert:

```typescript
import { createAlert } from '@/lib/alerts'
// ...
// After tx.maintenanceTask.create:
await createAlert('DAMAGE_REPORTED', 'maintenance_tasks', task.id, {
  itemName: kitItem.item.name,
  operatorId: session.userId,
})
```

**Note:** This must run outside the transaction (or in a separate `prisma.alert.create` inside the tx — be consistent). Use inside the same transaction for atomicity.

### 13.3 EQUIPMENT_NOT_RETURNED alert

**File:** `src/app/api/daily-check/route.ts`

After a daily check is submitted, check if any items in the operator's active kit have been checked out for more than 90 days. If so, create an alert per item:

```typescript
// After the check is saved, async fire-and-forget:
if (session.userId) {
  prisma.rig.findFirst({
    where: { operatorId: session.userId, endedAt: null },
    include: {
      kits: { include: { items: { where: { removedAt: null }, include: { item: { select: { name: true } } } } } },
    },
  }).then(async (rig) => {
    if (!rig) return
    const kitItems = rig.kits.flatMap((k) => k.items)
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const checkoutDate = rig.startedAt // rig start approximates equipment checkout
    if (checkoutDate < cutoff) {
      for (const ki of kitItems) {
        await createAlert('EQUIPMENT_NOT_RETURNED', 'kit_items', ki.id, {
          itemName: ki.item.name,
          rigId: rig.id,
          daysSinceCheckout: Math.floor((Date.now() - checkoutDate.getTime()) / 86400000),
        })
      }
    }
  }).catch(() => {})
}
```

### 13.4 MAINTENANCE_OVERDUE alert

**File:** `src/app/api/maintenance/route.ts` (or a scheduled check)

Add an alert when a `MaintenanceTask` with `status: 'PENDING'` and `nextDue` in the past is queried:

```typescript
// In GET /api/maintenance, after fetching tasks:
const now = new Date()
for (const task of data) {
  if (task.status === 'PENDING' && task.nextDue && task.nextDue < now) {
    await createAlert('MAINTENANCE_OVERDUE', 'maintenance_tasks', task.id, {
      taskName: task.taskName,
      itemId: task.itemId,
      daysPastDue: Math.floor((now.getTime() - task.nextDue.getTime()) / 86400000),
    }).catch(() => {})
  }
}
```

### 13.5 PIN_LOCKED alert

**File:** `src/app/api/auth/login/route.ts` (or wherever `pinLockedAt` is set)

Find where `pinLockedAt` is written. After setting it, create an alert:

```typescript
await createAlert('PIN_LOCKED', 'users', user.id, { name: user.name, email: user.email })
```

### 13.6 Alert feed on admin dashboard

**File:** `src/app/(admin)/admin/dashboard/page.tsx` (or wherever the admin dashboard is rendered)

Add a small alert feed section below the KPI cards:

```typescript
// Fetch unresolved alerts
const { data: alerts } = useSWR('/api/admin/alerts', fetcher)
```

Create `GET /api/admin/alerts/route.ts`:
```typescript
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const alerts = await prisma.alert.findMany({
    where: { resolved: false },
    orderBy: { triggeredAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ data: alerts })
}
```

Create `POST /api/admin/alerts/[id]/resolve/route.ts`:
```typescript
export async function POST(req, { params }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.alert.update({
    where: { id },
    data: { resolved: true, resolvedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
```

Display alerts as a compact list with:
- Alert type label (humanised: `DAMAGE_REPORTED` → "Damage Reported")
- Source context from `metadata` (item name, operator, etc.)
- Relative timestamp
- "Resolve" button

---

## 14 — Dead Code Removal (P3)

### 14.1 Remove dead `doAction('removeItems')` case

**File:** `src/app/(operator)/operator/my-rig/page.tsx`

Remove lines 638–646:
```typescript
case 'removeItems':
  await fetch(`/api/deployments/${rig.id}/items`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kitItemIds: Array.from(selItems), note, photoUrls }),
  })
  setSelItems(new Set())
  setRemovingItems(false)
  break
```

The DispositionDialog at line 1227 handles the `removeItems` path directly. The `doAction` case is unreachable because `noteDialog === 'removeItems'` is caught by the conditional render before it reaches the `NotePhotoDialog` that triggers `doAction`.

Also remove the legacy NotePhotoDialog binding for removeItems if present (it isn't in the existing code — the DispositionDialog handles it directly).

### 14.2 Remove / deprecate legacy checkout API

**File:** `src/app/api/checkout/route.ts`

Add a deprecation redirect at the top:
```typescript
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use POST /api/deployments/[id]/items instead.' },
    { status: 410 }
  )
}
```

Do not delete the file (could break any external callers) — return 410 Gone so it's clearly dead.

---

## 15 — Photo Context for Kit Additions (P3)

**File:** `src/app/api/deployments/[id]/items/route.ts`

Line 165:
```typescript
context: 'MAINTENANCE' as const,
```
Change to:
```typescript
context: 'INVENTORY_REFERENCE' as const,
```

The `PhotoContext` enum has `INVENTORY_REFERENCE` which correctly describes photos taken when adding items to a kit. `MAINTENANCE` is wrong and would confuse the maintenance photo feed.

---

## 16 — Replace Inline Page Toasts with useToast (P3)

Both layouts already mount `ToastProvider`. The pages still use an inline `toast` state variable that renders an `<Alert>` in the JSX. This is redundant — it means two toast systems exist simultaneously.

### 16.1 `src/app/(operator)/operator/my-rig/page.tsx`

Find `const [toast, setToast] = React.useState('')`. Remove this state.

Find `const showToast = (msg: string) => setToast(msg)`. Replace with:
```typescript
const showToast = useToast()
```

Update all `showToast(msg)` calls to:
```typescript
showToast({ message: msg, severity: 'success' })
```

Remove the inline `<Alert>` that renders `{toast}` in the JSX.

### 16.2 `src/app/(operator)/operator/scan/page.tsx`

Same pattern: `const [error, setError] = React.useState('')` can stay (it's a form error, not a toast). But any success state should use `useToast`.

---

## 17 — Test Suite (Sprint 6 Deferred) (P3)

Sprint 6 defined the full test infrastructure but the tests were not written. All the infrastructure (`vitest.config.ts`, `docker-compose.test.yml`, `tests/setup.ts`, `tests/helpers/fixtures.ts`) must be created per `CLAUDE_SPRINT_6.md` Section 1.2–1.5 exactly.

Additionally, write these Sprint 7 specific tests:

### 17.1 `tests/check-log-condition.test.ts`

```typescript
// Tests that returnCondition is written to CheckLog.condition
describe('CheckLog.condition on returns', () => {
  it('sets NEEDS_REPAIR on IN_MAINTENANCE return', async () => {
    // Create rig, kit, serialized kitItem, then DELETE with returnCondition: 'IN_MAINTENANCE'
    // Assert checkLog.condition === 'NEEDS_REPAIR'
  })
  it('sets MISSING_PARTS on INOPERABLE return', async () => { ... })
  it('sets GOOD on GOOD return', async () => { ... })
})
```

### 17.2 `tests/transfer-lifecycle.test.ts`

```typescript
describe('End-of-deployment TRANSFER lifecycle', () => {
  it('end-deployment TRANSFER items are not marked removedAt until accepted', async () => {
    // End deployment with TRANSFER disposition
    // Assert kitItem.removedAt === null
    // Accept the transfer
    // Assert kitItem.removedAt is now set, new kitItem created for dest rig
  })
  it('declining an end-of-deployment transfer restores units to AVAILABLE', async () => {
    // End deployment with TRANSFER disposition
    // Decline the transfer
    // Assert unit.status === 'AVAILABLE'
    // Assert kitItem.removedAt is set
  })
})
```

### 17.3 `tests/consumable-return-scoping.test.ts`

```typescript
describe('Consumable return: unit scoping', () => {
  it('does not return units from other active rigs', async () => {
    // Operator A and B each have the same consumable item in their kit (3 units total)
    // Operator A returns 1 unit
    // Assert returned unit.id is NOT the unit scoped to operator B's kit
  })
})
```

---

## 18 — Schema Notes

These invariants must guide implementation:

- **`Condition` enum:** `GOOD | MINOR_DAMAGE | NEEDS_REPAIR | MISSING_PARTS`. **Not** EquipmentStatus values. Map `IN_MAINTENANCE` → `NEEDS_REPAIR` and `INOPERABLE` → `MISSING_PARTS`.
- **`returnCondition` (request field):** `GOOD | IN_MAINTENANCE | INOPERABLE`. This is a UI-facing string — NOT a Prisma enum value. Map it before writing to CheckLog or InventoryUnit status.
- **`PhotoContext.INVENTORY_REFERENCE`** exists in the schema. Use it for kit-addition photos (Section 15).
- **`CheckLog.rigId`** is new in this sprint. After adding to schema, run `make db-generate` and `make db-migrate-dev`.
- **`Alert.metadata`** is `Json?` — pass any serializable object.
- **Do not add GPS fields to `DailyCheck`** in this sprint. That is Sprint 8.
- **`InventoryItem.quantity`** — leave the DB field; only remove the edit pathway from the admin UI.

---

## 19 — Implementation Order

Run in this sequence to avoid blocking dependencies:

1. **Schema migration first:** Add `rigId` to `CheckLog` → `make db-generate` → `make db-migrate-dev`
2. Create `src/lib/check-log-helpers.ts` (returnConditionToLogCondition, getUnitsInOtherRigs)
3. Fix `[kitItemId]/route.ts` (Section 1.1 + 2 + 4)
4. Fix `items/route.ts` DELETE (Section 1.2 + 2 + 4 + 15)
5. Fix `end/route.ts` (Section 1.3 + 3.1 + 4)
6. Fix `transfers/[id]/accept/route.ts` (Section 3.2 + 4)
7. Rewrite `transfers/[id]/decline/route.ts` (Section 3.3)
8. Fix `deployments/route.ts` (Section 4 — add rigId to CheckLog.create)
9. Fix `deployments/[id]/transfer/route.ts` (Section 11)
10. Fix `transfers/[id]/accept/route.ts` admin note (Section 12)
11. Fix scan page chip color (Section 6) — one line
12. Fix admin inventory quantity display (Section 5)
13. Fix NewDeploymentDialog serialized units (Section 7)
14. Build daily check page (Section 8)
15. Update scan page with actions, redirect checkout stub (Section 9)
16. Update service worker (Section 10.1)
17. Create OfflineBanner component (Section 10.2)
18. Create `src/lib/alerts.ts` (Section 13.1)
19. Add alert triggers in routes (Section 13.2–13.5)
20. Create alert API endpoints (Section 13.6)
21. Add alert feed to admin dashboard
22. Remove dead code (Section 14)
23. Replace inline toasts with useToast (Section 16)
24. Write tests: infrastructure first (Sprint 6 Section 1.2–1.5), then Sprint 7 test files (Section 17)
25. Run `npx tsc --noEmit` — fix all type errors
26. Run `npm test` — all tests must pass

---

## 20 — TypeScript Check + Deploy

```bash
# After all changes:
npx tsc --noEmit

# Fix all errors before proceeding. Common issues:
# - Prisma client not regenerated (run make db-generate)
# - rigId is String? but callsite might not have the id in scope
# - Alert type cast may need `as never` temporarily if enum isn't imported correctly

npm test

git add -A
git commit -m "feat: Sprint 7 — correctness, daily check, alerts, offline, transfer lifecycle"
git push -u origin "$BRANCH"

gh pr create \
  --title "feat: Sprint 7 — Polish, correctness & daily operations" \
  --body "Fixes end-of-deployment transfer lifecycle, CheckLog.condition, consumable return scoping, adds rigId to CheckLog, builds daily check page, scan-to-action, operator new deployment serialized unit selection, alert triggers (DAMAGE_REPORTED, MAINTENANCE_OVERDUE, EQUIPMENT_NOT_RETURNED, PIN_LOCKED), service worker offline caching for deployments, secondary operator transfer initiation, and removes dead code." \
  --base main

PR_NUMBER=$(gh pr view --json number --jq .number)
gh workflow run pr-staging-deploy.yml -f pr_number=$PR_NUMBER
gh run watch

# After deploy:
curl https://<staging-url>/api/health
```

---

## 21 — PRD Sprint 7 Items Reconciliation

From `PRD_ADDITIONS_V2.md` Sprint 7 section — verify all items are covered:

| PRD item | Covered in |
|----------|-----------|
| Transfer requests carry `inventoryUnitId` through accept/reject | Section 3.2, accept route already uses `ti.inventoryUnitId ?? ti.kitItem.inventoryUnitId` |
| Deployment end-of-rig: per-item condition (GOOD / IN_MAINTENANCE / INOPERABLE) | Section 1.3 (condition on CheckLog), Sections 1.1–1.2 (condition on per-item returns) |
| `PATCH /api/inventory/[id]/units/[unitId]` for admin manual status changes | Already exists in `src/app/api/inventory/units/[unitId]/route.ts`. Add a CheckLog entry to the PATCH handler so admin status changes are audited. |
| Admin deployment detail: per-unit history inline | CheckLog.rigId (Section 4) enables this query. The admin deployments page can now query `checkLog.findMany({ where: { rigId } })` for a deployment-level history. Add this to the deployment drawer in `admin/deployments/page.tsx`. |
| Operator daily check: flag individual kit items as damaged | The daily check form (Section 8) + the `issues` free-text field covers the basics. Full per-item flagging (creating a `MaintenanceTask` per flagged item) can be a follow-up in Sprint 8 when the full daily check flow is validated with real users. |

### Patch admin unit status to create a CheckLog

**File:** `src/app/api/inventory/units/[unitId]/route.ts`

After the update, create a CheckLog to audit the status change:

```typescript
if (parsed.data.status) {
  const action = parsed.data.status === 'CHECKED_OUT' ? 'CHECK_OUT' : 'CHECK_IN'
  await prisma.checkLog.create({
    data: {
      action,
      itemId: unit.inventoryItemId,   // need to include in select above
      inventoryUnitId: unitId,
      operatorId: session.userId,
      notes: `Admin status change → ${parsed.data.status}`,
    },
  })
}
```

Add `inventoryItemId: true` to the `PATCH` select to make this possible.

### Add per-deployment CheckLog history to admin deployment drawer

**File:** `src/app/(admin)/admin/deployments/page.tsx`

In the deployment detail drawer, add a "History" tab or section that fetches:
```typescript
GET /api/deployments/${rig.id}/history
```

Create `src/app/api/deployments/[id]/history/route.ts`:
```typescript
export async function GET(req, { params }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const logs = await prisma.checkLog.findMany({
    where: { rigId: id },
    orderBy: { submittedAt: 'desc' },
    include: {
      operator: { select: { id: true, name: true } },
      item: { select: { id: true, name: true } },
      inventoryUnit: { select: { id: true, serialNumber: true, qrCodeId: true } },
    },
  })
  return NextResponse.json({ data: logs })
}
```

Display in the drawer as a timeline list: action (CHECK_IN / CHECK_OUT), item name, unit (if serialized), operator name, relative date, notes.
