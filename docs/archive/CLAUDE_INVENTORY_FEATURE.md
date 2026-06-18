# Claude Code Instructions — Inventory Feature

## Context

This is the AHITS (Hardware Inventory & Tracking System) app for Agricarbon, a soil
sampling company with distributed field crews. The stack is Next.js 14 (App Router),
TypeScript, Material UI v6, Prisma ORM, and Supabase PostgreSQL. Path alias `@/` = `src/`.

Agricarbon operates out of two physical hubs: **Piedmont, SC** and **Waterloo, IA**.
Equipment is either sitting at one of those hubs, or it's in the field with an operator.

There are two types of inventory items:
- **Serialized items** — one-of-a-kind units tracked individually (Christie Drill #1,
  GPS Unit #3, Rugged Tablet #2). Each gets a unit ID and its own QR code sticker.
- **Consumables** — bulk items tracked by quantity (Sample Bags, Safety Vests, Zip Ties).

---

## Step 1 — Database migration (do this first)

Run `npx prisma migrate dev --name inventory-v2` after making the following schema
changes to `prisma/schema.prisma`.

### New enums — add these alongside the existing enums

```prisma
enum ItemType {
  SERIALIZED
  CONSUMABLE
}

enum HubLocation {
  PIEDMONT_SC
  WATERLOO_IA
}
```

### Changes to `InventoryItem` model — add these four fields

```prisma
model InventoryItem {
  // ... all existing fields stay unchanged ...

  // ADD these four new fields:
  itemType         ItemType      @default(CONSUMABLE)
  unitId           String?       // For SERIALIZED items: physical unit/serial number (e.g. "GPS-003")
  expectedQuantity Int?          // Total that should exist — compared against quantity for stock health
  hubLocation      HubLocation?  // Where this item lives when not deployed (null = unknown/in field)
}
```

**Do not remove or rename any existing fields.** Only add the four above.

After making these changes, run the migration. Then run `npx prisma generate` to update
the Prisma client types.

---

## Step 2 — Update the inventory API

### `src/app/api/inventory/route.ts` — replace the GET handler

The updated GET must:
1. **Exclude RETIRED items by default.** Only include them when `?includeRetired=true` is passed.
2. Support four new filter params: `operatorId`, `projectId`, `hubLocation`, `itemType`
3. Join with active checkout data so each item in the response includes:
   - `currentOperator`: the User who currently has it checked out (null if available)
   - `currentProject`: the Project it's currently checked out to (null if not on a project)

To determine "current operator" and "current project": find the most recent `CheckLog`
for each item where `action = 'CHECK_OUT'` and there is no subsequent `CHECK_IN` for
the same item. This means the item is currently out.

Here is the full replacement GET handler:

```typescript
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '25')
  const status = searchParams.get('status') as EquipmentStatus | null
  const category = searchParams.get('category') as EquipmentCategory | null
  const itemType = searchParams.get('itemType') as ItemType | null
  const hubLocation = searchParams.get('hubLocation') as HubLocation | null
  const operatorId = searchParams.get('operatorId')
  const projectId = searchParams.get('projectId')
  const includeRetired = searchParams.get('includeRetired') === 'true'
  const q = searchParams.get('q')

  const where: Prisma.InventoryItemWhereInput = {
    ...(status ? { status } : (!includeRetired ? { status: { not: 'RETIRED' } } : {})),
    ...(category && { category }),
    ...(itemType && { itemType }),
    ...(hubLocation && { hubLocation }),
    ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
  }

  // Filter by active operator or project: find items whose most recent checkout
  // is to the specified operator/project and hasn't been returned yet.
  if (operatorId || projectId) {
    const activeCheckouts = await prisma.checkLog.findMany({
      where: {
        action: 'CHECK_OUT',
        ...(operatorId && { operatorId }),
        ...(projectId && { projectId }),
      },
      orderBy: { submittedAt: 'desc' },
      select: { itemId: true, submittedAt: true },
    })
    // For each unique itemId, verify no CHECK_IN happened after the checkout
    const checkedOutItemIds: string[] = []
    for (const log of activeCheckouts) {
      const hasReturn = await prisma.checkLog.findFirst({
        where: { itemId: log.itemId, action: 'CHECK_IN', submittedAt: { gt: log.submittedAt } },
      })
      if (!hasReturn) checkedOutItemIds.push(log.itemId)
    }
    where.id = { in: checkedOutItemIds }
  }

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { name: 'asc' },
    }),
    prisma.inventoryItem.count({ where }),
  ])

  // For each item, find current operator and project from active checkouts
  const itemIds = items.map((i) => i.id)
  const activeCheckoutLogs = await prisma.checkLog.findMany({
    where: { itemId: { in: itemIds }, action: 'CHECK_OUT' },
    orderBy: { submittedAt: 'desc' },
    include: {
      operator: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, location: true } },
    },
  })

  // Build a map of itemId → active checkout (most recent CHECK_OUT with no return)
  const activeByItem: Record<string, typeof activeCheckoutLogs[0]> = {}
  for (const log of activeCheckoutLogs) {
    if (activeByItem[log.itemId]) continue // already found the most recent
    const hasReturn = await prisma.checkLog.findFirst({
      where: { itemId: log.itemId, action: 'CHECK_IN', submittedAt: { gt: log.submittedAt } },
    })
    if (!hasReturn) activeByItem[log.itemId] = log
  }

  const data = items.map((item) => ({
    ...item,
    currentOperator: activeByItem[item.id]?.operator ?? null,
    currentProject: activeByItem[item.id]?.project ?? null,
  }))

  return NextResponse.json({ data, total, page, pageSize })
}
```

Also add `ItemType` and `HubLocation` and `Prisma` to the imports at the top of the file:
```typescript
import type { EquipmentCategory, EquipmentStatus, ItemType, HubLocation, Prisma } from '@prisma/client'
```

### `src/app/api/inventory/route.ts` — update the POST createSchema

Add the four new fields:
```typescript
const createSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  itemType: z.enum(['SERIALIZED', 'CONSUMABLE']).default('CONSUMABLE'),
  unitId: z.string().optional(),
  quantity: z.number().int().min(0).default(1),
  expectedQuantity: z.number().int().min(0).optional(),
  hubLocation: z.enum(['PIEDMONT_SC', 'WATERLOO_IA']).optional(),
  unitCost: z.number().optional(),
  supplier: z.string().optional(),
  reorderUrl: z.string().url().optional().or(z.literal('')),
  location: z.string().optional(),
  notes: z.string().optional(),
  lowStockThreshold: z.number().int().optional(),
})
```

### `src/app/api/inventory/[id]/route.ts` — no changes needed

The existing PATCH and GET handlers will automatically accept the new fields.

---

## Step 3 — Admin inventory page

Replace the stub at `src/app/(admin)/admin/inventory/page.tsx` with a full
`'use client'` implementation. This is the primary management screen for admins.

Follow the exact same code structure as `src/app/(admin)/admin/users/page.tsx`:
- Sub-components (dialogs) defined above the main export in the same file
- `React.useCallback` for `load()`
- `showToast()` pattern with `setTimeout` auto-dismiss
- MUI `Skeleton` rows while loading
- All MUI imports in one destructured block at top

### Header row
- Left: "Inventory" title + subtitle: "X items · Y checked out"  
- Right: "Add Item" button with Add icon

### Filter bar (two rows of controls below header)

**Row 1:**
```
[ Search by name... ] [ All Types ▾ ] [ All Categories ▾ ] [ All Statuses ▾ ] [ All Hubs ▾ ]
```

**Row 2:**
```
[ All Operators ▾ ] [ All Projects ▾ ]  ·········  [ Show retired  ○ ]
```

- **Search**: debounced 300ms text field
- **Type**: All / Serialized / Consumable
- **Category**: All + each `EquipmentCategory` (human-readable, see label map below)
- **Status**: All / Available / Checked Out / In Maintenance (exclude Retired unless toggle on)
- **Hub**: All / Piedmont, SC / Waterloo, IA
- **Operator**: dropdown populated from `GET /api/users` (filter to role=OPERATOR). Selecting
  an operator shows only items currently checked out to them (passes `operatorId` to API).
- **Project**: dropdown populated from `GET /api/projects`. Selecting a project shows only
  items currently checked out to that project (passes `projectId` to API).
- **Show retired**: MUI `Switch` — when toggled on, include `status=RETIRED` items and
  add `includeRetired=true` to API call. Retired rows render greyed-out.

All filter changes re-fetch automatically (no submit button).

### Table columns

| Column | Content |
|--------|---------|
| ITEM | Name in bold. Below it: Category chip (small, grey) + if SERIALIZED and `unitId` set, show unit ID in monospace caption |
| TYPE | Small chip: "Serialized" (outlined, primary) or "Consumable" (outlined, default) |
| QTY | `quantity` / `expectedQuantity` formatted as "14 / 20". If `expectedQuantity` is null, just show `quantity`. If `quantity <= lowStockThreshold`, render the fraction in **error color** (red) with a `WarningAmber` icon |
| STATUS | Colored chip: AVAILABLE=green, CHECKED_OUT=blue, IN_MAINTENANCE=orange, RETIRED=grey |
| LOCATION | If AVAILABLE: show hub label ("Piedmont, SC" / "Waterloo, IA" / "—"). If CHECKED_OUT: show operator name in italic ("With John Smith") |
| PROJECT | `currentProject.name` or "—" |
| ACTIONS | Edit icon · Archive icon (retire) |

Clicking anywhere on a row (except the action icons) opens the detail drawer (see below).

Pagination: MUI `TablePagination`, page sizes 10 / 25 / 50, below the table.

### Add / Edit dialog (`ItemFormDialog`)

Used for both create (no item prop) and edit (item prop provided).

**Section 1 — Basic info**
- Name (required)
- Item Type: radio group or segmented control — "Serialized Item" / "Consumable". When
  Serialized is selected, show the Unit ID field. When Consumable, hide it.
- Unit ID (text, shown only for Serialized): label "Unit / Serial Number" with helper
  text "e.g. GPS-003, DRILL-01 — this will link to a QR sticker"
- Category (select, required)
- Status (select, edit mode only) — values: AVAILABLE, IN_MAINTENANCE, RETIRED
- Hub Location (select): "Piedmont, SC" / "Waterloo, IA" / "Unknown"

**Section 2 — Quantity & stock**
- Current Quantity (number, required, min 0)
- Expected / Total Quantity (number, optional): helper text "How many of this item
  should exist in total? Used to spot shrinkage."
- Low Stock Alert Threshold (number, optional): helper text "Show a warning on the
  dashboard when current quantity falls to or below this number."

**Section 3 — Purchasing info** (collapsible `Accordion`, collapsed by default)
- Unit Cost ($)
- Supplier
- Reorder URL (validated as URL)

**Section 4 — Notes** (always visible)
- Notes (multiline, 3 rows)

### Detail drawer

MUI `Drawer` from the right, width 500px. Opens when a table row is clicked.

Shows:
- Item name as drawer title
- Type chip + status chip in the header
- Two-column detail grid: Category, Hub Location, Unit ID (if serialized), Quantity /
  Expected, Low Stock Threshold, Unit Cost, Supplier, Reorder URL, Notes
- QR Code section: generate using `qrcode` package already installed:
  ```ts
  import QRCode from 'qrcode'
  const dataUrl = await QRCode.toDataURL(item.qrCodeId, { width: 160, margin: 1 })
  ```
  Display the QR image. Below it: "Download QR" button (creates an `<a>` with
  `download` attribute). Note: "QR sticker printing coming soon."
- Current Status section: if CHECKED_OUT, show "Currently with [Operator Name]" and
  "Checked out to [Project Name]" (if set). Show checkout date from the active log.
- Check Log section: last 10 entries from `GET /api/inventory/:id`, displayed as a
  compact timeline list (action chip + operator name + date + condition if check-in)
- Footer: Edit button (opens `ItemFormDialog` in edit mode) + Close button

### Retire confirmation dialog

Reuse the `ConfirmDialog` pattern from the users page.
- Title: "Retire [item name]?"
- Message: "This will mark the item as retired and hide it from active inventory. All
  check-out history is preserved."
- Button: "Retire" (color: error)
- On confirm: `PATCH /api/inventory/:id` with `{ status: 'RETIRED' }`

---

## Step 4 — Operator inventory page (read-only)

Create a new page at `src/app/(operator)/operator/inventory/page.tsx`.

This is a read-only inventory browser for field operators. They cannot create, edit,
or retire items — they can only view and filter.

### Purpose
Operators use this to answer: "Where is the Christie Drill right now?", "How many
sample bags are left?", "What does our Piedmont hub have available?"

### Layout
- Title: "Equipment", subtitle: "X items available"
- Filter bar:
  ```
  [ Search... ] [ All Hubs ▾ ] [ All Categories ▾ ] [ All Statuses ▾ ] [ Operator ▾ ] [ Project ▾ ]
  ```
  - **Operator filter**: dropdown populated from `GET /api/users` (operators only).
    Defaults to "All Operators". Selecting an operator shows only items currently
    checked out to them.
  - **Project filter**: dropdown populated from `GET /api/projects` (if it exists; if
    not, skip this filter for now and add a TODO comment).
  - Remaining filters same as admin but no "type" filter needed.
  - No "Show retired" toggle — retired items never shown to operators.

- Table (simpler than admin, no action column):

| Column | Content |
|--------|---------|
| ITEM | Name bold + category chip below |
| STATUS | Colored chip |
| QTY | quantity (red if at/below threshold) |
| LOCATION / WITH | Hub name, or "With [Operator]" |
| PROJECT | Project name or "—" |

- Clicking a row opens a **read-only** version of the detail drawer (no Edit button,
  no retire button, but still shows QR code and check log).

### Add Inventory to the operator nav

Update `src/components/operator/OperatorNav.tsx` to add an Inventory nav item:

```typescript
import InventoryIcon from '@mui/icons-material/Inventory'
// Add to NAV_ITEMS array:
{ label: 'Equipment', href: '/operator/inventory', icon: InventoryIcon },
```

Add it between "My Dashboard" and "Daily Check".

---

## Helper maps — define at top of each page file (not in utils.ts)

```typescript
const CATEGORY_LABELS: Record<string, string> = {
  SAMPLING_EQUIPMENT: 'Sampling Equipment',
  POWER_TOOLS: 'Power Tools',
  HAND_TOOLS: 'Hand Tools',
  SAFETY_GEAR: 'Safety Gear',
  ELECTRONICS_GPS: 'Electronics & GPS',
  STORAGE: 'Storage',
  OTHER: 'Other',
}

const HUB_LABELS: Record<string, string> = {
  PIEDMONT_SC: 'Piedmont, SC',
  WATERLOO_IA: 'Waterloo, IA',
}

const STATUS_CHIP_COLOR: Record<string, 'success' | 'primary' | 'warning' | 'default' | 'error'> = {
  AVAILABLE: 'success',
  CHECKED_OUT: 'primary',
  IN_MAINTENANCE: 'warning',
  RETIRED: 'default',
}
```

---

## Files to create or modify

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `ItemType` enum, `HubLocation` enum, and 4 new fields to `InventoryItem` |
| `src/app/api/inventory/route.ts` | Replace GET handler, update POST createSchema |
| `src/app/(admin)/admin/inventory/page.tsx` | Replace stub — full admin implementation |
| `src/app/(operator)/operator/inventory/page.tsx` | **Create new** — operator read-only view |
| `src/components/operator/OperatorNav.tsx` | Add Equipment nav item |

**Do not touch any other files.**

---

## What NOT to build in this task

- Photo upload for inventory items (requires Supabase Storage setup — out of scope)
- QR sticker sheet / batch printing
- CSV/bulk import
- The "Rig" filter (vehicle kit association) — this requires a `vehicleId` field on
  `CheckLog` which will be added during the checkout feature. Add a TODO comment in
  the filter bar: `{/* TODO: Rig filter — add after vehicleId added to CheckLog */}`
- GPS-derived operator location — the location shown is the operator's name, not GPS
  coordinates. GPS location will be added when the daily check feature is built.
- Any changes to the checkout API

---

## Definition of done

- [ ] `npx prisma migrate dev` runs without errors
- [ ] `npx prisma generate` succeeds
- [ ] `GET /api/inventory` excludes RETIRED by default, includes with `?includeRetired=true`
- [ ] `GET /api/inventory?operatorId=X` returns only items currently checked out to that operator
- [ ] `GET /api/inventory?projectId=X` returns only items checked out to that project
- [ ] Admin inventory page loads with table, search, all filters, and pagination
- [ ] "Add Item" dialog shows/hides Unit ID field based on Serialized/Consumable toggle
- [ ] Qty column shows "current / expected" and turns red at low stock threshold
- [ ] Checked-out items show "With [Operator Name]" in the Location column
- [ ] Row click opens detail drawer with QR code, current status, and check log
- [ ] Retire flow works (confirm dialog → PATCH → row greyed out or hidden)
- [ ] Show Retired toggle works
- [ ] Operator inventory page loads at `/operator/inventory`
- [ ] Operator page filters by hub, category, status, operator
- [ ] Equipment link appears in operator sidebar nav
- [ ] `npm run type-check` passes with no errors
