# Claude Code Instructions — Bugfix Sprint 2: Photos, Admin Transfers, Partial Deployments

## Overview

This sprint fixes three production bugs identified in staging, plus hardens two API permission
surfaces that were left open.

**No Prisma schema changes are needed.** All changes are in API routes, one shared component,
and one new lib file.

---

## Bugs being fixed

1. **Photos won't attach** — Client-side Supabase uploads use the anon key, which lacks
   INSERT permission on the `photos` storage bucket. Uploads fail silently (small red `!`
   in the UI) and the form can still be submitted without photos.

2. **Admin cannot approve/decline transfers** — The `/api/transfers/[id]/accept` and
   `decline` routes already authorize ADMINs, but the admin Deployments page had no UI
   to see or act on pending transfers. Operators see incoming transfers on their My Rig
   page; admins had nothing.

3. **Partial transfer ends source deployment** — When a transfer is accepted the source rig
   stays active in the database, but there were no guards preventing double-acceptance
   (two concurrent acceptances of the same items), which would silently corrupt state.

---

## Prerequisites

### Supabase — create the `photos` storage bucket

Before deploying, ensure the Supabase project has a public storage bucket named `photos`.

1. Open the Supabase dashboard → Storage → New bucket
2. Name: `photos`
3. Public bucket: **yes** (files need public URLs for display in the app)
4. The new server-side upload route uses the service role key, so no additional RLS
   policies are required for uploads.

The `SUPABASE_SERVICE_ROLE_KEY` env var must be set in Cloud Run (it is already in
`.env.example`). Confirm it is populated in the GCP secret or Cloud Run environment
before deploying.

---

## Files to create

### 1. `src/lib/supabase/admin.ts` — Supabase admin client

```ts
import { createClient } from '@supabase/supabase-js'

/**
 * Supabase admin client using the service role key.
 * Only for server-side use — never import from client components.
 * Bypasses Row Level Security so storage uploads always succeed
 * regardless of bucket policies.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

### 2. `src/app/api/uploads/route.ts` — Server-side photo upload endpoint

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'photos'
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB per file

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 415 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Unique path: userId/timestamp-filename to avoid collisions
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `rig-events/${session.userId}/${Date.now()}-${safeName}`

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (error) {
    console.error('[uploads] Supabase storage error:', error.message)
    return NextResponse.json({ error: 'Upload failed: ' + error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return NextResponse.json({ url: publicUrl })
}
```

---

## Files to edit

### 3. `src/components/shared/NotePhotoDialog.tsx` — Full replacement

Replace the entire file with the following. Key changes vs. the original:
- Removed client-side Supabase import; uploads now go through `POST /api/uploads`
- Used `component="label"` on the Button so clicking it opens the file picker natively
  (the original `fileInputRef.current?.click()` is blocked on iOS Safari)
- Uploads run in parallel via `Promise.all` instead of a sequential loop
- Photos tracked by stable ID instead of array index (fixes stale-closure bug when
  multiple batches are uploaded)
- Added a visible error Alert when any upload fails
- Submit button is blocked if any photo failed (user must remove the `!` thumbnails first)

```tsx
'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Box, Typography, IconButton,
  CircularProgress, Alert,
} from '@mui/material'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import CloseIcon from '@mui/icons-material/Close'

interface Props {
  title: string
  description?: string
  noteLabel?: string
  open: boolean
  loading: boolean
  onClose: () => void
  onConfirm: (note: string, photoUrls: string[]) => void
  confirmLabel?: string
  confirmColor?: 'error' | 'primary' | 'warning'
}

interface UploadingPhoto {
  id: string
  name: string
  uploading: boolean
  url: string | null
}

export function NotePhotoDialog({
  title,
  description,
  noteLabel = "What's happening? (required)",
  open,
  loading,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  confirmColor = 'primary',
}: Props) {
  const [note, setNote] = React.useState('')
  const [photos, setPhotos] = React.useState<UploadingPhoto[]>([])
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const stillUploading = photos.some((p) => p.uploading)
  const hasFailedUploads = photos.some((p) => !p.uploading && p.url === null)

  React.useEffect(() => {
    if (!open) {
      setNote('')
      setPhotos([])
      setUploadError(null)
    }
  }, [open])

  const handleFiles = async (files: FileList) => {
    setUploadError(null)
    // Assign stable IDs upfront so concurrent uploads don't clobber each other
    const entries = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
    }))
    setPhotos((prev) => [
      ...prev,
      ...entries.map(({ id, file }) => ({ id, name: file.name, uploading: true, url: null })),
    ])

    const errors: string[] = []
    await Promise.all(
      entries.map(async ({ id, file }) => {
        const form = new FormData()
        form.append('file', file)
        try {
          const res = await fetch('/api/uploads', { method: 'POST', body: form })
          const json = await res.json()
          const url: string | null = res.ok ? (json.url ?? null) : null
          if (!res.ok) errors.push(json.error ?? `Upload failed for ${file.name}`)
          setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, uploading: false, url } : p))
        } catch {
          errors.push(`Network error uploading ${file.name}`)
          setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, uploading: false, url: null } : p))
        }
      })
    )
    if (errors.length) setUploadError(errors.join('; '))
  }

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  const handleConfirm = () => {
    const urls = photos.filter((p) => p.url).map((p) => p.url as string)
    onConfirm(note, urls)
  }

  const canSubmit = note.trim().length >= 5 && !stillUploading && !hasFailedUploads && !loading

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} pt={0.5}>
          {description && (
            <Typography variant="body2" color="text.secondary">{description}</Typography>
          )}

          <TextField
            label={noteLabel}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            rows={3}
            required
            fullWidth
            autoFocus
          />

          {uploadError && (
            <Alert severity="error" onClose={() => setUploadError(null)}>
              {uploadError} — remove the failed photos (!) and try again.
            </Alert>
          )}

          <Box>
            {/* component="label" renders a <label> so the browser opens the file picker
                directly on click — programmatic .click() is blocked on iOS Safari */}
            <Button
              component="label"
              size="small"
              variant="outlined"
              startIcon={<CameraAltIcon />}
              disabled={loading || stillUploading}
            >
              Attach photos
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files) }}
              />
            </Button>

            {photos.length > 0 && (
              <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap">
                {photos.map((p) => (
                  <Box key={p.id} sx={{ position: 'relative', width: 48, height: 48 }}>
                    {p.uploading ? (
                      <Box sx={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <CircularProgress size={20} />
                      </Box>
                    ) : p.url ? (
                      <Box
                        component="img"
                        src={p.url}
                        alt={p.name}
                        sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                      />
                    ) : (
                      <Box sx={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'error.main', borderRadius: 1 }}>
                        <Typography variant="caption" color="error">!</Typography>
                      </Box>
                    )}
                    <IconButton
                      size="small"
                      onClick={() => removePhoto(p.id)}
                      sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', p: 0.25 }}
                    >
                      <CloseIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          color={confirmColor}
          onClick={handleConfirm}
          disabled={!canSubmit}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
```

---

### 4. `src/app/(admin)/admin/deployments/page.tsx` — Add pending transfers panel

The admin Deployments page needs a "Pending Transfers" section at the top so admins can
accept or decline transfers system-wide. The `accept` and `decline` API routes already
allow ADMINs; only the UI was missing.

**Add to the `AdminDeploymentsPage` component state block** (alongside existing `rigs`,
`loading`, etc.):

```tsx
// Pending transfers — admin can accept or decline on behalf of the destination operator
const [pendingTransfers, setPendingTransfers] = React.useState<TransferRow[]>([])
const [respondDialog, setRespondDialog] = React.useState<{ transfer: TransferRow; action: 'accept' | 'decline' } | null>(null)
const [responseNote, setResponseNote] = React.useState('')
const [respondLoading, setRespondLoading] = React.useState(false)
```

**Add `loadTransfers` alongside the existing `load` callback:**

```tsx
const loadTransfers = React.useCallback(async () => {
  const res = await fetch('/api/transfers?status=PENDING')
  if (res.ok) setPendingTransfers(await res.json())
}, [])

React.useEffect(() => { loadTransfers() }, [loadTransfers])
```

**Add `handleRespond` handler:**

```tsx
const handleRespond = async () => {
  if (!respondDialog) return
  setRespondLoading(true)
  const { transfer, action } = respondDialog
  await fetch(`/api/transfers/${transfer.id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responseNote: responseNote || undefined }),
  })
  setRespondLoading(false)
  setRespondDialog(null)
  setResponseNote('')
  showToast(action === 'accept' ? 'Transfer accepted' : 'Transfer declined')
  await Promise.all([load(), loadTransfers()])
}
```

**Add the pending transfers panel inside the return JSX, immediately after the toast
`Alert` and before the filter row.** Only renders when there are pending transfers:

```tsx
{pendingTransfers.length > 0 && (
  <Box mb={3}>
    <Typography variant="subtitle2" fontWeight={600} mb={1}>
      Pending Transfers ({pendingTransfers.length})
    </Typography>
    <Stack spacing={1}>
      {pendingTransfers.map((tr) => {
        const vehicleNames = tr.vehicles.map((tv) => tv.vehicle.name).join(', ')
        const itemNames = tr.items.map((ti) => `${ti.kitItem.item.name} ×${ti.kitItem.quantity}`).join(', ')
        const summary = [vehicleNames, itemNames].filter(Boolean).join(', ')
        return (
          <Alert key={tr.id} severity="warning" icon={false}
            action={
              <Stack direction="row" spacing={1} sx={{ mt: -0.5 }}>
                <Button size="small" color="error" variant="outlined"
                  onClick={() => { setRespondDialog({ transfer: tr, action: 'decline' }); setResponseNote('') }}>
                  Decline
                </Button>
                <Button size="small" color="success" variant="contained"
                  onClick={() => { setRespondDialog({ transfer: tr, action: 'accept' }); setResponseNote('') }}>
                  Accept
                </Button>
              </Stack>
            }
          >
            <Typography variant="body2" fontWeight={600}>
              {tr.fromRig.operator.name} → {tr.toOperator.name}
            </Typography>
            <Typography variant="body2">{summary}</Typography>
            {tr.note && <Typography variant="caption" color="text.secondary">&ldquo;{tr.note}&rdquo;</Typography>}
          </Alert>
        )
      })}
    </Stack>
  </Box>
)}
```

**Add the respond Dialog at the bottom of the return JSX (before the closing `</Box>`):**

```tsx
<Dialog open={!!respondDialog} onClose={() => setRespondDialog(null)} maxWidth="xs" fullWidth>
  <DialogTitle>{respondDialog?.action === 'accept' ? 'Accept Transfer' : 'Decline Transfer'}</DialogTitle>
  <DialogContent>
    <Typography variant="body2" color="text.secondary" mb={1.5}>
      {respondDialog?.action === 'accept'
        ? `Accept transfer from ${respondDialog.transfer.fromRig.operator.name} to ${respondDialog.transfer.toOperator.name}?`
        : `Decline transfer from ${respondDialog?.transfer.fromRig.operator.name} to ${respondDialog?.transfer.toOperator.name}?`}
    </Typography>
    <TextField
      label="Response note (optional)"
      value={responseNote}
      onChange={(e) => setResponseNote(e.target.value)}
      multiline rows={2} fullWidth
    />
  </DialogContent>
  <DialogActions sx={{ px: 3, pb: 2 }}>
    <Button onClick={() => setRespondDialog(null)} disabled={respondLoading}>Cancel</Button>
    <Button
      variant="contained"
      color={respondDialog?.action === 'accept' ? 'success' : 'error'}
      onClick={handleRespond}
      disabled={respondLoading}
      startIcon={respondLoading ? <CircularProgress size={16} color="inherit" /> : null}
    >
      {respondLoading ? 'Saving…' : respondDialog?.action === 'accept' ? 'Accept' : 'Decline'}
    </Button>
  </DialogActions>
</Dialog>
```

Make sure `CircularProgress` is in the MUI imports at the top of the file (it already is
in the existing scaffold).

---

### 5. `src/app/api/transfers/[id]/accept/route.ts` — Add integrity guards

Replace the `prisma.$transaction` block with the version below. Key changes:
- Verifies the source rig has not ended since the transfer was created (409 if so)
- Verifies each vehicle and kit item is still present in the source rig (catches
  double-transfer race conditions — if two operators accept the same pending transfer
  concurrently, only the first will succeed)
- Comments clarify that the source rig is intentionally NOT ended; remaining items stay

Wrap the entire transaction in a try/catch so validation errors become clean 409 responses:

```ts
let updatedTransfer
try {
  updatedTransfer = await prisma.$transaction(async (tx) => {
    // Guard: source rig must still be active
    const sourceRig = await tx.rig.findUnique({
      where: { id: transfer.fromRig.id },
      select: { endedAt: true },
    })
    if (sourceRig?.endedAt) {
      throw new Error('Source deployment has ended — transfer is no longer valid')
    }

    // Guard: each vehicle must still be in the source rig (not double-transferred)
    for (const tv of transfer.vehicles) {
      const stillPresent = await tx.rigVehicle.findFirst({
        where: { rigId: transfer.fromRig.id, vehicleId: tv.vehicleId, removedAt: null },
      })
      if (!stillPresent) throw new Error('Vehicle is no longer in the source deployment')
    }

    // Guard: each kit item must still be active (not double-transferred)
    for (const ti of transfer.items) {
      const stillPresent = await tx.kitItem.findFirst({
        where: { id: ti.kitItemId, removedAt: null },
      })
      if (!stillPresent) throw new Error('Kit item is no longer in the source deployment')
    }

    // Find or create destination rig.
    // NOTE: source rig is never ended here — partial transfers leave remaining
    // vehicles/items in the source deployment, which stays active.
    let destRig = await tx.rig.findFirst({
      where: { operatorId: toOperatorId, endedAt: null },
    })
    if (!destRig) {
      destRig = await tx.rig.create({
        data: { operatorId: toOperatorId, startedAt: now },
      })
    }

    let destKit = await tx.kit.findFirst({ where: { rigId: destRig.id } })
    if (!destKit) {
      destKit = await tx.kit.create({ data: { rigId: destRig.id } })
    }

    // Move only the transferred vehicles; untouched vehicles stay in source rig
    for (const tv of transfer.vehicles) {
      await tx.rigVehicle.updateMany({
        where: { rigId: transfer.fromRig.id, vehicleId: tv.vehicleId, removedAt: null },
        data: { removedAt: now, removeNote: transfer.note },
      })
      await tx.rigVehicle.create({
        data: {
          rigId: destRig.id,
          vehicleId: tv.vehicleId,
          addNote: `Accepted transfer from ${sourceName}`,
          photoUrls: transfer.photoUrls,
        },
      })
      await tx.vehicle.update({
        where: { id: tv.vehicleId },
        data: { assignedOperatorId: toOperatorId },
      })
    }

    // Move only the transferred kit items; untouched items stay in source kit
    for (const ti of transfer.items) {
      await tx.kitItem.update({
        where: { id: ti.kitItemId },
        data: { removedAt: now },
      })
      await tx.kitItem.create({
        data: {
          kitId: destKit.id,
          inventoryItemId: ti.kitItem.inventoryItemId,
          quantity: ti.kitItem.quantity,
        },
      })
      await tx.checkLog.create({
        data: {
          action: 'CHECK_IN',
          itemId: ti.kitItem.inventoryItemId,
          operatorId: transfer.fromRig.operatorId,
          notes: transfer.note,
        },
      })
      await tx.checkLog.create({
        data: {
          action: 'CHECK_OUT',
          itemId: ti.kitItem.inventoryItemId,
          operatorId: toOperatorId,
          notes: 'Accepted transfer',
        },
      })
    }

    return tx.transferRequest.update({
      where: { id },
      data: { status: 'ACCEPTED', respondedAt: now, responseNote: responseNote ?? null },
    })
  })
} catch (err) {
  const msg = err instanceof Error ? err.message : 'Transfer failed'
  return NextResponse.json({ error: msg }, { status: 409 })
}

return NextResponse.json({ ok: true, transferRequest: updatedTransfer })
```

---

## Additional API hardening (from earlier in this session)

These were implemented in a prior pass but are included here for completeness and to
ensure they are in place before deploying.

### `src/app/api/vehicles/route.ts`

Operators may only create TRAILER, POLARIS_UTV, or CAN_AM_UTV — not TRUCK. Add above
the `POST` handler:

```ts
const OPERATOR_ALLOWED_VEHICLE_TYPES = ['TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV']
```

Inside `POST`, after parsing and before `prisma.vehicle.create`:

```ts
if (session.role !== 'ADMIN' && !OPERATOR_ALLOWED_VEHICLE_TYPES.includes(parsed.data.type)) {
  return NextResponse.json({ error: 'Operators may only add trailers and UTVs' }, { status: 403 })
}
```

### `src/app/api/vehicles/[id]/route.ts`

Operators may only PATCH trailers and UTVs (same type list). DELETE is admin-only.

In `PATCH`, after confirming the session, before updating:

```ts
const OPERATOR_ALLOWED_VEHICLE_TYPES = ['TRAILER', 'POLARIS_UTV', 'CAN_AM_UTV']

if (session.role !== 'ADMIN') {
  const existing = await prisma.vehicle.findUnique({ where: { id }, select: { type: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!OPERATOR_ALLOWED_VEHICLE_TYPES.includes(existing.type as string)) {
    return NextResponse.json({ error: 'Operators may only edit trailers and UTVs' }, { status: 403 })
  }
}
```

In `DELETE`:

```ts
if (!session || session.role !== 'ADMIN') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

### `src/app/api/maintenance/route.ts` and `[id]/route.ts`

Both ADMINs and OPERATORs may create (`POST`) and update (`PATCH`) maintenance tasks.
Only ADMINs may delete (`DELETE`).

- `POST /api/maintenance` — check `if (!session)` only (no role gate)
- `PATCH /api/maintenance/[id]` — check `if (!session)` only (no role gate)
- `DELETE /api/maintenance/[id]` — check `if (!session || session.role !== 'ADMIN')`

---

## Deploy

No migrations needed. Follow the standard deploy flow from `CLAUDE.md`:

```bash
# 1. Create feature branch
GH_USER=$(gh api user --jq .login)
DATE=$(date +%Y%m%d)
git checkout -b "feature/${DATE}/${GH_USER}-bugfix-photos-transfers"

# 2. Commit
git add -A
git commit -m "Fix photo uploads, add admin transfer approval, harden partial transfer accept"
git push -u origin HEAD

# 3. Open PR
gh pr create \
  --title "Bugfix: photo uploads, admin transfer approval, partial deployment guard" \
  --body "- POST /api/uploads (server-side, service role key — fixes silent Supabase upload failures)
- NotePhotoDialog: component=label, parallel uploads, visible error Alert
- Admin Deployments page: Pending Transfers panel with Accept/Decline
- Transfer accept route: guards against double-transfer and ended-source-rig edge cases
- API hardening: operator vehicle type restrictions, maintenance task permissions"

# 4. Deploy to staging
PR_NUMBER=$(gh pr view --json number --jq .number)
gh workflow run pr-staging-deploy.yml -f pr_number=$PR_NUMBER
gh run watch
```

---

## Verification checklist

After staging deploy and Supabase bucket creation:

- [ ] **Photos (desktop)**: Open any NotePhotoDialog → click "Attach photos" → select
  image → thumbnail appears, no `!` → submit
- [ ] **Photos (mobile/iOS)**: Same flow on iPhone → file picker opens from "Attach
  photos" button → works
- [ ] **Photo error state**: Temporarily rename the bucket and try to attach → red `!`
  appears and a red Alert shows the error message → submit button is disabled
- [ ] **Admin transfers**: Log in as admin → Deployments page → pending transfer should
  appear in the "Pending Transfers" panel with Accept / Decline buttons → accept one →
  panel disappears, deployment list refreshes
- [ ] **Partial transfer**: Operator A has Truck-01, Trailer-01, and 3 kit items.
  Transfer only Trailer-01 + 1 kit item to Operator B. Operator B accepts. Operator A
  still sees an active deployment with Truck-01 and 2 remaining kit items.
- [ ] **Double-transfer guard**: Create two transfers of the same item from different
  sessions. Accept one. The second accept should return a 409 with a clear error message.
