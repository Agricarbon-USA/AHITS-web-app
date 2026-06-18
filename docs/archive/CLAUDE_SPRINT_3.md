# Claude Code Instructions — Sprint 3: Empty Deployments, Multi-Operator, Rental Vehicles

## Overview

Three features, two requiring Prisma schema migrations:

1. **Auto-end empty deployments** — when a full kit transfer is accepted and the source
   rig is left with nothing in it, end the rig automatically instead of leaving an empty
   shell. (No schema change.)

2. **Multi-operator deployments** — allow additional operators to be assigned to an
   existing deployment. Requires a new `RigOperator` junction table. Operators see all
   deployments they're part of, not just their own. Admins can manage membership.

3. **Rental vehicles** — when starting a deployment, operators can add a rental vehicle
   (any type: Truck, Trailer, UTV). Rental vehicles have extra fields: make, model, year,
   rental length, rental agreement photo, pickup location, dropoff location. Requires new
   nullable columns on the `Vehicle` model.

---

## Schema changes

### Migration 1 — Rental vehicle fields on `Vehicle`

Add these nullable columns to the `vehicles` table:

```prisma
model Vehicle {
  // ... existing fields unchanged ...

  // Rental-specific (all optional — only populated for rentals)
  isRental              Boolean  @default(false)
  rentalMake            String?
  rentalModel           String?
  rentalYear            Int?
  rentalLength          String?   // free text, e.g. "7 days", "3 weeks"
  rentalAgreementUrl    String?   // uploaded via /api/uploads
  rentalPickupLocation  String?
  rentalDropoffLocation String?   // null means same as pickup
}
```

### Migration 2 — RigOperator junction table

Add secondary-operator support without changing the existing `Rig.operatorId` primary
operator field. All existing queries continue to work unchanged.

```prisma
model RigOperator {
  id         String   @id @default(cuid())
  rigId      String
  operatorId String
  addedAt    DateTime @default(now())

  rig      Rig  @relation(fields: [rigId], references: [id])
  operator User @relation("RigSecondaryOperators", fields: [operatorId], references: [id])

  @@unique([rigId, operatorId])
  @@map("rig_operators")
}
```

Add to `Rig`:
```prisma
secondaryOperators RigOperator[]
```

Add to `User`:
```prisma
rigAssignments RigOperator[] @relation("RigSecondaryOperators")
```

After editing `schema.prisma`, run:
```bash
make db-generate
make db-migrate
```

Commit the generated migration files in `prisma/migrations/` with the branch.

---

## Feature 1 — Auto-end empty deployments after full transfer

### File: `src/app/api/transfers/[id]/accept/route.ts`

At the very end of the `$transaction` block, after all vehicles and kit items have been
moved, check whether the source rig is now empty. If so, set `endedAt`. Add this
immediately before the final `tx.transferRequest.update(...)` call:

```ts
// Auto-end the source deployment if it's now completely empty
const remainingVehicles = await tx.rigVehicle.count({
  where: { rigId: transfer.fromRig.id, removedAt: null },
})
const sourceKits = await tx.kit.findMany({
  where: { rigId: transfer.fromRig.id },
  select: { items: { where: { removedAt: null }, select: { id: true } } },
})
const remainingItems = sourceKits.reduce((sum, k) => sum + k.items.length, 0)

if (remainingVehicles === 0 && remainingItems === 0) {
  await tx.rig.update({
    where: { id: transfer.fromRig.id },
    data: { endedAt: now },
  })
}
```

No API or UI changes needed — the operator's My Rig page already filters
`endedAt: null`, so the empty deployment will simply disappear on next load.

---

## Feature 2 — Multi-operator deployments

### 2a. Update `RIG_INCLUDE` helper (wherever it's defined, likely `src/lib/rig-include.ts` or inline)

Add `secondaryOperators` to the standard rig include so it's always fetched:

```ts
secondaryOperators: {
  include: { operator: { select: { id: true, name: true, email: true } } },
},
```

### 2b. Operator My Rig page — show deployments where operator is secondary

**File: `src/app/api/deployments/route.ts`** (the `GET ?active=true` handler)

The current query fetches `where: { operatorId: session.userId, endedAt: null }`.
Change it so operators also see deployments they're assigned to as secondary:

```ts
// Before:
const rigs = await prisma.rig.findMany({
  where: { operatorId: session.userId, endedAt: null },
  include: RIG_INCLUDE,
})

// After:
const rigs = await prisma.rig.findMany({
  where: {
    endedAt: null,
    OR: [
      { operatorId: session.userId },
      { secondaryOperators: { some: { operatorId: session.userId } } },
    ],
  },
  include: RIG_INCLUDE,
})
```

### 2c. New API routes for managing deployment operators

**`src/app/api/deployments/[id]/operators/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

// GET — list operators on a deployment (admin only)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const rig = await prisma.rig.findUnique({
    where: { id },
    include: {
      operator: { select: { id: true, name: true, email: true } },
      secondaryOperators: {
        include: { operator: { select: { id: true, name: true, email: true } } },
      },
    },
  })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(rig)
}

// POST — add a secondary operator (admin only)
const addSchema = z.object({ operatorId: z.string() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const parsed = addSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { operatorId } = parsed.data

  // Prevent adding the primary operator as secondary
  const rig = await prisma.rig.findUnique({ where: { id }, select: { operatorId: true } })
  if (!rig) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (rig.operatorId === operatorId) {
    return NextResponse.json({ error: 'Operator is already the primary operator' }, { status: 409 })
  }

  const assignment = await prisma.rigOperator.upsert({
    where: { rigId_operatorId: { rigId: id, operatorId } },
    create: { rigId: id, operatorId },
    update: {},
    include: { operator: { select: { id: true, name: true, email: true } } },
  })
  return NextResponse.json(assignment, { status: 201 })
}

// DELETE — remove a secondary operator (admin only)
const removeSchema = z.object({ operatorId: z.string() })

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const parsed = removeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await prisma.rigOperator.deleteMany({
    where: { rigId: id, operatorId: parsed.data.operatorId },
  })
  return NextResponse.json({ ok: true })
}
```

### 2d. Admin Deployments page — manage operators on a deployment

**File: `src/app/(admin)/admin/deployments/page.tsx`**

Inside the per-deployment detail drawer (or as a new "Team" section within it), add a
panel showing the primary operator and any secondary operators, with an "Add Operator"
button and a remove (×) icon per secondary.

Key state to add to the drawer:
```tsx
const [addingOperator, setAddingOperator] = React.useState(false)
const [operatorToAdd, setOperatorToAdd] = React.useState('')
```

Add operator handler:
```tsx
const handleAddOperator = async (rigId: string) => {
  await fetch(`/api/deployments/${rigId}/operators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operatorId: operatorToAdd }),
  })
  setOperatorToAdd('')
  setAddingOperator(false)
  load() // refresh
}

const handleRemoveOperator = async (rigId: string, operatorId: string) => {
  await fetch(`/api/deployments/${rigId}/operators`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operatorId }),
  })
  load()
}
```

UI section to add inside the deployment drawer, after the vehicle/kit lists:

```tsx
<Box mt={2}>
  <Typography variant="subtitle2" fontWeight={600} mb={0.75}>
    Team
  </Typography>
  <Stack spacing={0.5}>
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body2">{rig.operator.name}</Typography>
      <Typography variant="caption" color="text.secondary">Primary</Typography>
    </Stack>
    {rig.secondaryOperators?.map((ro) => (
      <Stack key={ro.id} direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2">{ro.operator.name}</Typography>
        <IconButton size="small" onClick={() => handleRemoveOperator(rig.id, ro.operatorId)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
    ))}
  </Stack>
  {addingOperator ? (
    <Stack direction="row" spacing={1} mt={1}>
      <TextField
        select size="small" label="Add operator" value={operatorToAdd}
        onChange={(e) => setOperatorToAdd(e.target.value)} sx={{ flex: 1 }}
      >
        {/* filter to users who are OPERATOR role and not already on this rig */}
        {allOperators
          .filter((u) => u.id !== rig.operatorId && !rig.secondaryOperators?.some((ro) => ro.operatorId === u.id))
          .map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
      </TextField>
      <Button size="small" variant="contained" disabled={!operatorToAdd}
        onClick={() => handleAddOperator(rig.id)}>Add</Button>
      <Button size="small" onClick={() => { setAddingOperator(false); setOperatorToAdd('') }}>Cancel</Button>
    </Stack>
  ) : (
    <Button size="small" sx={{ mt: 0.5 }} onClick={() => setAddingOperator(true)}>
      + Add Operator
    </Button>
  )}
</Box>
```

`allOperators` should come from the existing users fetch (filter `role === 'OPERATOR'`).

---

## Feature 3 — Rental vehicles

### 3a. Update vehicle creation API

**File: `src/app/api/vehicles/route.ts`**

The `POST` Zod schema needs the new optional rental fields. Add to the schema object:

```ts
isRental: z.boolean().optional().default(false),
rentalMake: z.string().optional(),
rentalModel: z.string().optional(),
rentalYear: z.number().int().optional(),
rentalLength: z.string().optional(),
rentalAgreementUrl: z.string().url().optional(),
rentalPickupLocation: z.string().optional(),
rentalDropoffLocation: z.string().optional(),
```

The `prisma.vehicle.create` call already spreads `parsed.data`, so no other change needed
in the route as long as the Prisma client is regenerated after the migration.

**File: `src/app/api/vehicles/[id]/route.ts`**

Add the same optional fields to the `PATCH` Zod schema so rentals can be edited.

### 3b. Rental vehicle form — new component

Create **`src/components/shared/RentalVehicleForm.tsx`**:

```tsx
'use client'

import * as React from 'react'
import {
  Stack, TextField, MenuItem, Typography, Button, Box,
  CircularProgress, Alert,
} from '@mui/material'
import CameraAltIcon from '@mui/icons-material/CameraAlt'

export interface RentalVehicleFields {
  type: string          // 'TRUCK' | 'TRAILER' | 'POLARIS_UTV' | 'CAN_AM_UTV' | 'ATV' | 'OTHER'
  name: string          // display name / identifier (required for Vehicle.name unique)
  rentalMake: string
  rentalModel: string
  rentalYear: string    // string in the form, convert to int on submit
  rentalLength: string
  rentalAgreementUrl: string
  rentalPickupLocation: string
  rentalDropoffLocation: string
}

interface Props {
  value: Partial<RentalVehicleFields>
  onChange: (v: Partial<RentalVehicleFields>) => void
  disabled?: boolean
}

const VEHICLE_TYPES = [
  { value: 'TRUCK', label: 'Truck' },
  { value: 'TRAILER', label: 'Trailer' },
  { value: 'POLARIS_UTV', label: 'Polaris UTV' },
  { value: 'CAN_AM_UTV', label: 'Can-Am UTV' },
  { value: 'ATV', label: 'ATV' },
  { value: 'OTHER', label: 'Other' },
]

export function RentalVehicleForm({ value, onChange, disabled }: Props) {
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)

  const set = (field: keyof RentalVehicleFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value })

  const handleAgreementFile = async (files: FileList) => {
    setUploadError(null)
    setUploading(true)
    const form = new FormData()
    form.append('file', files[0])
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) { setUploadError(json.error ?? 'Upload failed'); return }
      onChange({ ...value, rentalAgreementUrl: json.url })
    } catch {
      setUploadError('Network error — could not upload agreement')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Stack spacing={2}>
      <TextField select label="Vehicle type" value={value.type ?? ''} onChange={set('type')}
        fullWidth required disabled={disabled}>
        {VEHICLE_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
      </TextField>

      <TextField label="Name / identifier" value={value.name ?? ''} onChange={set('name')}
        fullWidth required placeholder='e.g. "Rented Trailer #1"' disabled={disabled} />

      <Stack direction="row" spacing={2}>
        <TextField label="Make" value={value.rentalMake ?? ''} onChange={set('rentalMake')}
          fullWidth disabled={disabled} />
        <TextField label="Model" value={value.rentalModel ?? ''} onChange={set('rentalModel')}
          fullWidth disabled={disabled} />
        <TextField label="Year" value={value.rentalYear ?? ''} onChange={set('rentalYear')}
          type="number" sx={{ width: 120 }} disabled={disabled} />
      </Stack>

      <TextField label="Rental length" value={value.rentalLength ?? ''} onChange={set('rentalLength')}
        fullWidth placeholder='e.g. "7 days", "2 weeks"' disabled={disabled} />

      <Box>
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          Rental agreement (photo or scan)
        </Typography>
        {uploadError && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setUploadError(null)}>{uploadError}</Alert>
        )}
        {value.rentalAgreementUrl ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              component="img"
              src={value.rentalAgreementUrl}
              alt="Rental agreement"
              sx={{ height: 64, width: 64, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
            />
            <Button size="small" variant="text" color="error"
              onClick={() => onChange({ ...value, rentalAgreementUrl: '' })} disabled={disabled}>
              Remove
            </Button>
          </Stack>
        ) : (
          <Button
            component="label"
            size="small"
            variant="outlined"
            startIcon={uploading ? <CircularProgress size={16} /> : <CameraAltIcon />}
            disabled={disabled || uploading}
          >
            {uploading ? 'Uploading…' : 'Attach agreement'}
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) handleAgreementFile(e.target.files) }}
            />
          </Button>
        )}
      </Box>

      <TextField
        label="Pickup location"
        value={value.rentalPickupLocation ?? ''}
        onChange={set('rentalPickupLocation')}
        fullWidth disabled={disabled}
      />

      <TextField
        label="Dropoff location (if different from pickup)"
        value={value.rentalDropoffLocation ?? ''}
        onChange={set('rentalDropoffLocation')}
        fullWidth disabled={disabled}
        placeholder="Leave blank if same as pickup"
      />
    </Stack>
  )
}
```

### 3c. Operator My Rig page — "Add rental vehicle" option in New Deployment

**File: `src/app/(operator)/operator/my-rig/page.tsx`**

In the "Start New Deployment" or "Add Vehicle" flow, add a toggle: **"This is a rental
vehicle"**. When toggled on, show the `RentalVehicleForm`. On submit, POST to
`/api/vehicles` with `isRental: true` plus all the rental fields, then immediately add
that vehicle to the deployment's rig via the existing vehicle-add flow.

Recommended approach — add a "Rental vehicle" option inside whichever Dialog opens the
vehicle type selector:

```tsx
// State
const [isRental, setIsRental] = React.useState(false)
const [rentalFields, setRentalFields] = React.useState<Partial<RentalVehicleFields>>({})

// On submit (alongside existing vehicle create logic)
const vehiclePayload = isRental
  ? {
      name: rentalFields.name,
      type: rentalFields.type,
      isRental: true,
      rentalMake: rentalFields.rentalMake,
      rentalModel: rentalFields.rentalModel,
      rentalYear: rentalFields.rentalYear ? parseInt(rentalFields.rentalYear) : undefined,
      rentalLength: rentalFields.rentalLength,
      rentalAgreementUrl: rentalFields.rentalAgreementUrl,
      rentalPickupLocation: rentalFields.rentalPickupLocation,
      rentalDropoffLocation: rentalFields.rentalDropoffLocation || undefined,
    }
  : { /* existing fields */ }
```

The rental agreement file upload happens inside `RentalVehicleForm` via `/api/uploads`
before the form is submitted — no extra logic needed in the page.

### 3d. Display rental badge in vehicle lists

Anywhere vehicles are listed (My Rig page, admin Deployments page), show a small
**"Rental"** chip/badge next to the vehicle name when `vehicle.isRental === true`.

```tsx
{vehicle.isRental && (
  <Chip label="Rental" size="small" color="warning" variant="outlined" sx={{ ml: 0.5 }} />
)}
```

---

## Deploy

No special steps beyond the standard workflow. Because there are two migrations, make
sure both run before creating the PR:

```bash
make db-generate
make db-migrate
```

Then the standard deploy:

```bash
GH_USER=$(gh api user --jq .login)
DATE=$(date +%Y%m%d)
git checkout -b "feature/${DATE}/${GH_USER}-empty-deployments-multi-op-rental"
git add -A
git commit -m "Sprint 3: auto-end empty deployments, multi-operator rigs, rental vehicles"
git push -u origin HEAD

gh pr create \
  --title "Sprint 3: auto-end empty deployments, multi-operator rigs, rental vehicles" \
  --body "- Transfer accept: auto-end source rig when fully emptied
- RigOperator junction table: multiple operators per deployment
- Admin UI: add/remove secondary operators from a deployment
- Operator query: show deployments where operator is primary OR secondary
- Vehicle schema: isRental + rental detail fields
- RentalVehicleForm component: type, make/model/year, length, agreement upload, locations
- New Deployment flow: toggle for rental vehicle"

PR_NUMBER=$(gh pr view --json number --jq .number)
gh workflow run pr-staging-deploy.yml -f pr_number=$PR_NUMBER
gh run watch
```

---

## Verification checklist

- [ ] **Auto-end empty deployment**: Create a deployment with one vehicle and one kit item.
  Transfer both to another operator. Source operator's My Rig page shows no active
  deployment (rig was ended).

- [ ] **Partial transfer — rig stays**: Transfer only the vehicle (not the kit item).
  Source operator still sees an active deployment with the kit item. ✓

- [ ] **Multi-operator — add**: Admin opens a deployment → Team section → Add Operator →
  select a second operator → both appear in the team list.

- [ ] **Multi-operator — operator view**: Second operator logs in → My Rig page shows the
  shared deployment alongside their own (if any).

- [ ] **Multi-operator — remove**: Admin removes the secondary operator → operator no
  longer sees that deployment.

- [ ] **Rental vehicle**: Operator clicks "New Deployment" (or "Add Vehicle") → enables
  "Rental vehicle" → fills in all fields, attaches agreement photo → submits → vehicle
  appears in rig with "Rental" badge → all rental fields visible in detail view.

- [ ] **Rental — all vehicle types**: Confirm the type selector in `RentalVehicleForm`
  allows Truck, Trailer, Polaris UTV, Can-Am UTV, ATV, Other.
