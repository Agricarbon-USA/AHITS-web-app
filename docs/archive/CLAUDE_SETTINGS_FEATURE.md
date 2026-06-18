# Claude Code Instructions — Settings Feature (Editable Dropdowns)

## Context

AHITS uses two hardcoded database enums — `EquipmentCategory` and `HubLocation` — whose
values are fixed at the schema level and can only be changed by a developer. This feature
converts both enums into real database tables so that admins can add, rename, and remove
options directly from the app.

After this change:
- Admins can add a new equipment category like "Vehicles" without a developer touching code.
- If Agricarbon opens a new hub (e.g., Denver, CO), an admin can add it from a Settings page.

---

## Step 1 — Schema migration (do this first, it's the most complex part)

This migration replaces two enum columns with foreign-key relationships. It must be done
carefully to preserve any existing data.

### 1a — Add the two new models to `prisma/schema.prisma`

Add these models **before** the `InventoryItem` model:

```prisma
model Category {
  id        String          @id @default(cuid())
  name      String
  sortOrder Int             @default(0)
  createdAt DateTime        @default(now())
  items     InventoryItem[]

  @@map("categories")
}

model Hub {
  id        String          @id @default(cuid())
  name      String
  city      String
  state     String
  isActive  Boolean         @default(true)
  createdAt DateTime        @default(now())
  items     InventoryItem[]

  @@map("hubs")
}
```

### 1b — Update `InventoryItem` model

Replace these two existing fields:
```prisma
// REMOVE:
category    EquipmentCategory
hubLocation HubLocation?
```

With these:
```prisma
// ADD:
categoryId  String
category    Category   @relation(fields: [categoryId], references: [id])
hubId       String?
hub         Hub?       @relation(fields: [hubId], references: [id])
```

### 1c — Delete the two enums from `prisma/schema.prisma`

Remove the entire `EquipmentCategory` enum block and the entire `HubLocation` enum block.
Leave all other enums (`EquipmentStatus`, `ItemType`, `CheckAction`, etc.) untouched.

### 1d — Create the migration with custom SQL

Run:
```bash
npx prisma migrate dev --name editable-dropdowns --create-only
```

This creates the migration SQL file without running it yet. Open the generated file in
`prisma/migrations/` and **replace its entire contents** with this SQL:

```sql
-- Create categories table with seed data matching previous enum values
CREATE TABLE "categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

INSERT INTO "categories" ("id", "name", "sortOrder") VALUES
  ('cat_sampling',    'Sampling Equipment', 1),
  ('cat_power',       'Power Tools',        2),
  ('cat_hand',        'Hand Tools',         3),
  ('cat_safety',      'Safety Gear',        4),
  ('cat_electronics', 'Electronics & GPS',  5),
  ('cat_storage',     'Storage',            6),
  ('cat_other',       'Other',              7);

-- Create hubs table with seed data matching previous enum values
CREATE TABLE "hubs" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hubs_pkey" PRIMARY KEY ("id")
);

INSERT INTO "hubs" ("id", "name", "city", "state") VALUES
  ('hub_piedmont', 'Piedmont Hub', 'Piedmont', 'SC'),
  ('hub_waterloo',  'Waterloo Hub',  'Waterloo',  'IA');

-- Add new foreign key columns to inventory_items (nullable first for backfill)
ALTER TABLE "inventory_items" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "hubId" TEXT;

-- Backfill categoryId from old enum value
UPDATE "inventory_items" SET "categoryId" = CASE "category"::text
  WHEN 'SAMPLING_EQUIPMENT' THEN 'cat_sampling'
  WHEN 'POWER_TOOLS'        THEN 'cat_power'
  WHEN 'HAND_TOOLS'         THEN 'cat_hand'
  WHEN 'SAFETY_GEAR'        THEN 'cat_safety'
  WHEN 'ELECTRONICS_GPS'    THEN 'cat_electronics'
  WHEN 'STORAGE'            THEN 'cat_storage'
  ELSE 'cat_other'
END;

-- Backfill hubId from old enum value
UPDATE "inventory_items" SET "hubId" = CASE "hubLocation"::text
  WHEN 'PIEDMONT_SC' THEN 'hub_piedmont'
  WHEN 'WATERLOO_IA' THEN 'hub_waterloo'
  ELSE NULL
END;

-- Now make categoryId required (non-nullable)
ALTER TABLE "inventory_items" ALTER COLUMN "categoryId" SET NOT NULL;

-- Add foreign key constraints
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_hubId_fkey"
  FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old enum columns
ALTER TABLE "inventory_items" DROP COLUMN "category";
ALTER TABLE "inventory_items" DROP COLUMN "hubLocation";

-- Drop the enum types
DROP TYPE IF EXISTS "EquipmentCategory";
DROP TYPE IF EXISTS "HubLocation";
```

Then apply it:
```bash
npx prisma migrate dev
npx prisma generate
```

---

## Step 2 — New API routes

### `src/app/api/categories/route.ts` (new file)

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(50),
  sortOrder: z.number().int().optional(),
})

export async function GET() {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } })
  return NextResponse.json(categories)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const maxOrder = await prisma.category.aggregate({ _max: { sortOrder: true } })
  const category = await prisma.category.create({
    data: {
      name: parsed.data.name,
      sortOrder: parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  })
  return NextResponse.json(category, { status: 201 })
}
```

### `src/app/api/categories/[id]/route.ts` (new file)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { z } from 'zod'

const schema = z.object({ name: z.string().min(1).max(50) })

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const category = await prisma.category.update({
    where: { id: params.id },
    data: { name: parsed.data.name },
  })
  return NextResponse.json(category)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Prevent deletion if any items still use this category
  const count = await prisma.inventoryItem.count({ where: { categoryId: params.id } })
  if (count > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${count} item(s) still use this category. Reassign them first.` },
      { status: 409 }
    )
  }
  await prisma.category.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
```

### `src/app/api/hubs/route.ts` (new file)

Same pattern as categories, but the create/update schema includes `city` and `state`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2), // Two-letter state code
})

export async function GET() {
  const hubs = await prisma.hub.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(hubs)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const hub = await prisma.hub.create({ data: parsed.data })
  return NextResponse.json(hub, { status: 201 })
}
```

### `src/app/api/hubs/[id]/route.ts` (new file)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(100).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(2).max(2).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const hub = await prisma.hub.update({ where: { id: params.id }, data: parsed.data })
  return NextResponse.json(hub)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const count = await prisma.inventoryItem.count({ where: { hubId: params.id } })
  if (count > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${count} item(s) are assigned to this hub. Reassign them first.` },
      { status: 409 }
    )
  }
  // Soft-delete: mark inactive rather than hard delete
  await prisma.hub.update({ where: { id: params.id }, data: { isActive: false } })
  return NextResponse.json({ ok: true })
}
```

---

## Step 3 — Update the inventory API and pages

### `src/app/api/inventory/route.ts`

**GET handler** — replace `category` and `hubLocation` filter logic:

```typescript
// REPLACE:
const category = searchParams.get('category') as EquipmentCategory | null
const hubLocation = searchParams.get('hubLocation') as HubLocation | null
// ...
...(category && { category }),
...(hubLocation && { hubLocation }),

// WITH:
const categoryId = searchParams.get('categoryId')
const hubId = searchParams.get('hubId')
// ...
...(categoryId && { categoryId }),
...(hubId && { hubId }),
```

Also update the `findMany` call to include relations:
```typescript
prisma.inventoryItem.findMany({
  where,
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { name: 'asc' },
  include: { category: true, hub: true },
})
```

Remove `EquipmentCategory` and `HubLocation` from the imports at the top.

**POST createSchema** — replace `category` and `hubLocation` fields:
```typescript
// REPLACE:
category: z.string(),
hubLocation: z.enum(['PIEDMONT_SC', 'WATERLOO_IA']).optional(),

// WITH:
categoryId: z.string().min(1),
hubId: z.string().optional(),
```

### `src/app/(admin)/admin/inventory/page.tsx`

1. **Add a data-fetch effect** at the top of the page component that loads categories and
   hubs from the API on mount:
   ```typescript
   const [categories, setCategories] = React.useState<{ id: string; name: string }[]>([])
   const [hubs, setHubs] = React.useState<{ id: string; name: string; city: string; state: string }[]>([])

   React.useEffect(() => {
     Promise.all([
       fetch('/api/categories').then(r => r.json()),
       fetch('/api/hubs').then(r => r.json()),
     ]).then(([cats, hs]) => { setCategories(cats); setHubs(hs) })
   }, [])
   ```

2. **Filter bar** — replace the hardcoded category and hub `MenuItem` lists with dynamic
   ones from the `categories` and `hubs` state arrays.

3. **ItemFormDialog** — replace hardcoded `<MenuItem>` options for category and hub with
   dynamic ones from the `categories`/`hubs` arrays passed as props. Store `categoryId`
   and `hubId` (not display names) in form state.

4. **Table and detail drawer** — replace `CATEGORY_LABELS[item.category]` references with
   `item.category?.name` (since category is now a relation). Same for hub: replace
   `HUB_LABELS[item.hubLocation]` with `item.hub ? \`${item.hub.city}, ${item.hub.state}\` : '—'`.

5. **Remove** the hardcoded `CATEGORY_LABELS` and `HUB_LABELS` constant maps — they're no
   longer needed.

### `src/app/(operator)/operator/inventory/page.tsx`

Apply the same fetch-from-API approach for categories and hubs, and the same
relation-based display changes (`item.category?.name`, `item.hub?.city`).

---

## Step 4 — Admin settings page

Create `src/app/(admin)/admin/settings/page.tsx` as a `'use client'` component.

Follow the canonical admin page pattern (same structure as `admin/users/page.tsx`).

### Layout

- Page title: "Settings", subtitle: "Manage dropdown lists used across the application"
- Two `Card` components stacked vertically with `mb: 3` between them

### Card 1 — Equipment Categories

Header row: "Equipment Categories" title + "Add Category" button (with Add icon).

Table with three columns:
- **NAME** — the category name, editable inline (see below)
- **ITEMS** — count of inventory items using this category (fetch from the category list
  response if you add a `_count` include, or just show the error when deletion is blocked)
- **ACTIONS** — Edit icon + Delete icon

**Inline rename flow**: clicking the Edit icon on a row replaces the name cell with a
`TextField` (pre-filled with current name) + a Save icon button + a Cancel icon button.
Pressing Save calls `PATCH /api/categories/:id`. No separate dialog needed.

**Add Category dialog**: simple dialog with one field (Category Name). On save calls
`POST /api/categories`.

**Delete**: show the standard `ConfirmDialog`. If the API returns a 409 (items still
using it), dismiss the confirm dialog and show a toast with the error message instead.

### Card 2 — Hub Locations

Header row: "Hub Locations" title + "Add Hub" button.

Table with four columns:
- **HUB NAME**
- **CITY**
- **STATE**
- **ACTIONS** — Edit icon + Delete icon (soft-delete: marks `isActive: false`)

**Edit Hub dialog** (not inline — three fields warrant a dialog): Name, City, State (2-letter).
Calls `PATCH /api/hubs/:id`.

**Add Hub dialog**: Name, City, State fields. Calls `POST /api/hubs`.

**Delete**: same ConfirmDialog + toast-on-409 pattern as categories.

### Add Settings to admin nav

Update `src/components/admin/AdminNav.tsx`:

```typescript
import SettingsIcon from '@mui/icons-material/Settings'

// Add to NAV_ITEMS array, at the end before Reports:
{ label: 'Settings', href: '/admin/settings', icon: SettingsIcon },
```

---

## Files to create or modify

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `Category` + `Hub` models; update `InventoryItem`; remove two enums |
| `prisma/migrations/<timestamp>_editable-dropdowns/migration.sql` | Replace with custom SQL above |
| `src/app/api/categories/route.ts` | **Create new** |
| `src/app/api/categories/[id]/route.ts` | **Create new** |
| `src/app/api/hubs/route.ts` | **Create new** |
| `src/app/api/hubs/[id]/route.ts` | **Create new** |
| `src/app/api/inventory/route.ts` | Update GET filters + POST schema |
| `src/app/(admin)/admin/inventory/page.tsx` | Fetch categories/hubs from API; update display |
| `src/app/(operator)/operator/inventory/page.tsx` | Same updates as admin inventory page |
| `src/app/(admin)/admin/settings/page.tsx` | **Create new** |
| `src/components/admin/AdminNav.tsx` | Add Settings nav item |

**Do not touch any other files.**

---

## Definition of done

- [ ] `npx prisma migrate dev` runs without errors
- [ ] `npx prisma generate` succeeds
- [ ] All existing inventory items are preserved after migration (data not lost)
- [ ] `GET /api/categories` returns the 7 seeded categories
- [ ] `GET /api/hubs` returns the 2 seeded hubs
- [ ] Admin inventory page category and hub dropdowns load from the API (not hardcoded)
- [ ] Operator inventory page also loads categories and hubs from API
- [ ] Settings page loads at `/admin/settings`
- [ ] Admin can add, rename, and delete equipment categories
- [ ] Deleting a category used by items shows an error toast instead of deleting
- [ ] Admin can add, edit, and deactivate hub locations
- [ ] "Settings" link appears in the admin sidebar
- [ ] `npm run type-check` passes with no errors
