# Claude Code Instructions — Photo Viewing Feature

## Context

Photos are already uploaded to Supabase Storage and stored in the `Photo` model. The
`Photo` model has direct relations to both `InventoryItem` (via `inventoryItemId`) and
`Vehicle` (via `vehicleId`), and a `context` field (`PhotoContext` enum) that includes
a `DAMAGE` value. Photos can also be linked to a `CheckLog` (via `checkLogId`) which
has a `condition` field indicating damage.

This feature makes those photos visible inside the app — in the inventory item detail
drawer and on the vehicle detail page — with damage photos called out visually.

No schema changes are needed.

---

## Step 1 — Update APIs to include photos

### `src/app/api/inventory/[id]/route.ts`

Verify the GET handler includes photos in its response. If not already present, add
`photos: true` to the `include` block:

```typescript
const item = await prisma.inventoryItem.findUnique({
  where: { id: params.id },
  include: {
    checkLogs: {
      include: { operator: { select: { id: true, name: true } } },
      orderBy: { submittedAt: 'desc' },
      take: 20,
    },
    photos: {
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { takenAt: 'desc' },
    },
    category: true,
    hub: true,
  },
})
```

### `src/app/api/vehicles/[id]/route.ts`

If this endpoint exists, add photos to its include. If no single-vehicle endpoint exists,
create `src/app/api/vehicles/[id]/route.ts` with a GET handler that returns the vehicle
plus its photos:

```typescript
const vehicle = await prisma.vehicle.findUnique({
  where: { id: params.id },
  include: {
    photos: {
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { takenAt: 'desc' },
    },
  },
})
```

---

## Step 2 — Shared `PhotoGallery` component

Create `src/components/shared/PhotoGallery.tsx` as a `'use client'` component.

### Props

```typescript
interface Photo {
  id: string
  url: string
  thumbnailUrl?: string | null
  context: string         // PhotoContext enum value
  takenAt: string
  uploadedBy: { name: string }
  checkLog?: {
    condition?: string | null  // Condition enum value
    action: string
    submittedAt: string
  } | null
}

interface PhotoGalleryProps {
  photos: Photo[]
  emptyMessage?: string   // defaults to "No photos yet"
}
```

### Layout

A responsive grid of photo thumbnails: 3 columns on desktop, 2 on mobile.

Each thumbnail:
- Shows the photo as a 120×120px image (object-fit: cover), rounded corners
- **Damage badge**: if `photo.context === 'DAMAGE'` OR if `photo.checkLog?.condition`
  is `MINOR_DAMAGE`, `NEEDS_REPAIR`, or `MISSING_PARTS` — overlay a small red chip
  in the top-right corner of the thumbnail with a warning icon and the label "Damage"
- On hover: show a subtle overlay with the upload date and uploader name
- Clicking a thumbnail opens a **lightbox** (full-size view)

### Lightbox

A full-screen MUI `Dialog` with `maxWidth="lg"` and `fullWidth`.

Content:
- The full-size image centered
- Below the image: two-column metadata row
  - Left: uploader name + date taken (formatted as "Jun 14, 2026 at 2:34 PM")
  - Right: context label (human-readable, e.g. "Damage Report", "Daily Check",
    "Inventory Reference") + if damage, a red `Chip` saying the condition
    (e.g. "Needs Repair")
- Previous / Next arrow buttons to move between photos in the gallery
- Close button (X) top-right

### Context label map — define inside the component

```typescript
const CONTEXT_LABELS: Record<string, string> = {
  DAMAGE: 'Damage Report',
  DAILY_CHECK: 'Daily Check',
  MAINTENANCE: 'Maintenance',
  INVENTORY_REFERENCE: 'Reference Photo',
  VEHICLE_REFERENCE: 'Reference Photo',
}

const CONDITION_LABELS: Record<string, string> = {
  MINOR_DAMAGE: 'Minor Damage',
  NEEDS_REPAIR: 'Needs Repair',
  MISSING_PARTS: 'Missing Parts',
}
```

### Empty state

If `photos.length === 0`, show a centered camera icon + the `emptyMessage` text in
`text.secondary` color.

---

## Step 3 — Add photo gallery to the inventory item detail drawer

In `src/app/(admin)/admin/inventory/page.tsx`, the detail drawer already shows the
item's check log. Add a **Photos** section below the check log section.

```tsx
{/* Photos section */}
<Box sx={{ mt: 3 }}>
  <Typography variant="subtitle2" fontWeight={600} mb={1}>
    Photos
    {detail.photos.length > 0 && (
      <Typography component="span" variant="caption" color="text.secondary" ml={1}>
        {detail.photos.length} total
        {detail.photos.filter(isDamagePhoto).length > 0 && (
          <Chip
            label={`${detail.photos.filter(isDamagePhoto).length} damage`}
            color="error"
            size="small"
            sx={{ ml: 1 }}
          />
        )}
      </Typography>
    )}
  </Typography>
  <PhotoGallery photos={detail.photos} emptyMessage="No photos attached to this item" />
</Box>
```

Where `isDamagePhoto` is:
```typescript
const isDamagePhoto = (p: Photo) =>
  p.context === 'DAMAGE' ||
  ['MINOR_DAMAGE', 'NEEDS_REPAIR', 'MISSING_PARTS'].includes(p.checkLog?.condition ?? '')
```

The `detail` object already comes from `GET /api/inventory/:id` — after Step 1, it will
include `photos`. No additional fetch needed.

---

## Step 4 — Add photo gallery to the vehicle detail page

In `src/app/(admin)/admin/vehicles/page.tsx` (or wherever the vehicle detail drawer/page
lives), add a Photos section using the same `PhotoGallery` component.

If vehicles are shown in a detail drawer (similar to inventory), add the section below
the vehicle details. If they open a separate page, add it as a section on that page.

Fetch photos via `GET /api/vehicles/:id` from Step 1.

Damage photos are particularly important for vehicles — if any damage photos exist,
show a prominent amber `Alert` at the top of the vehicle detail:

```tsx
{damagPhotos.length > 0 && (
  <Alert severity="warning" sx={{ mb: 2 }}>
    {damagePhotos.length} damage photo{damagePhotos.length > 1 ? 's' : ''} on record
    — scroll down to view
  </Alert>
)}
```

---

## Step 5 — Operator inventory view

In `src/app/(operator)/operator/inventory/page.tsx`, the read-only item detail drawer
should also show the `PhotoGallery` after Step 1 makes photos available.

Add the same Photos section as the admin drawer. Operators can **view** photos but
cannot upload from this screen (uploads happen during check-out, transfers, and edits).

---

## Files to create or modify

| File | Action |
|------|--------|
| `src/app/api/inventory/[id]/route.ts` | Add `photos` to include block |
| `src/app/api/vehicles/[id]/route.ts` | Create or update — include photos |
| `src/components/shared/PhotoGallery.tsx` | **Create new** — reusable gallery + lightbox |
| `src/app/(admin)/admin/inventory/page.tsx` | Add Photos section to detail drawer |
| `src/app/(admin)/admin/vehicles/page.tsx` | Add Photos section to vehicle detail |
| `src/app/(operator)/operator/inventory/page.tsx` | Add Photos section to item drawer |

**Do not touch any other files.**

---

## Definition of done

- [ ] `GET /api/inventory/:id` response includes `photos` array with uploader info
- [ ] `GET /api/vehicles/:id` response includes `photos` array
- [ ] `PhotoGallery` component renders a grid of thumbnails
- [ ] Damage photos show a red "Damage" badge overlay on the thumbnail
- [ ] Clicking a thumbnail opens the lightbox with full-size image and metadata
- [ ] Previous/Next navigation works in the lightbox
- [ ] Admin inventory item drawer shows Photos section with damage chip count
- [ ] Admin vehicle detail shows Photos section with amber damage alert if applicable
- [ ] Operator inventory drawer shows Photos section (view only)
- [ ] Empty state shows when no photos exist
- [ ] `npm run type-check` passes with no errors
