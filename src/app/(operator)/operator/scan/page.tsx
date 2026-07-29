'use client'

import * as React from 'react'
import {
  Box, Typography, Button, Stack, Alert, CircularProgress, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/shared/useToast'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { StatusChip } from '@/components/shared/StatusChip'
import { ConditionSelect } from '@/components/shared/ConditionSelect'
import { QrScannerDialog, type QrResolveResult } from '@/components/shared/QrScannerDialog'
import { ReportProblemDialog, type ReportProblemSubject } from '@/components/shared/ReportProblemDialog'
import type { ReturnCondition } from '@/lib/status'

interface UnitInfo {
  id: string
  qrCodeId: string
  serialNumber: string | null
  status: string
  notes: string | null
  inventoryItem: {
    id: string
    name: string
    itemType: string
    category: { name: string }
  }
}

interface KitItemStub {
  id: string
  inventoryUnitId: string | null
  inventoryItemId: string
}

interface VehicleInfo {
  id: string
  name: string
  type: string
  status: string
  qrCodeId: string
  location: string | null
  odometer: number | null
}

export default function OperatorScanPage() {
  const showToast = useToast()
  const router = useRouter()
  const { mutate } = useOfflineQueue()
  const [scannerOpen, setScannerOpen] = React.useState(false)
  const [unit, setUnit] = React.useState<UnitInfo | null>(null)
  const [vehicle, setVehicle] = React.useState<VehicleInfo | null>(null)
  const [error, setError] = React.useState('')
  const [activeRigId, setActiveRigId] = React.useState<string | null>(null)
  const [activeKitItems, setActiveKitItems] = React.useState<KitItemStub[]>([])
  const [returnCondition, setReturnCondition] = React.useState<ReturnCondition>('GOOD')
  const [actionLoading, setActionLoading] = React.useState(false)
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  // CC-10 field-fix dialog (now serves vehicles AND units — CC-34 (2b)).
  const [fieldFixOpen, setFieldFixOpen] = React.useState(false)
  const [fieldFixNotes, setFieldFixNotes] = React.useState('')
  const [fieldFixSaving, setFieldFixSaving] = React.useState(false)
  // CC-34 (2a): the one "Report a problem" verb, shared for units and vehicles.
  const [report, setReport] = React.useState<ReportProblemSubject | null>(null)

  React.useEffect(() => {
    fetch('/api/deployments')
      .then((r) => r.json())
      .then((json) => {
        const active = json[0] ?? null
        if (active) {
          setActiveRigId(active.id)
          const items: KitItemStub[] = active.kits?.flatMap((k: { items: KitItemStub[] }) => k.items) ?? []
          setActiveKitItems(items)
        }
      })
      .catch(() => {})
  }, [])

  // CC-25: the live QrScannerDialog decodes; this only does the lookup. A label is
  // either an inventory unit or a vehicle (PRD §7.7) — try the unit first, then the
  // vehicle. Distinguish the two honest failures: a thrown fetch = offline; both
  // by-qr endpoints returning non-OK = the code isn't registered ("not found").
  const resolveScan = React.useCallback(async (code: string): Promise<QrResolveResult> => {
    setError('')
    setUnit(null)
    setVehicle(null)
    const enc = encodeURIComponent(code)
    try {
      const unitRes = await fetch(`/api/inventory/units/by-qr/${enc}`)
      if (unitRes.ok) {
        const json = await unitRes.json()
        setUnit({ ...json.unit, inventoryItem: json.item })
        setReturnCondition('GOOD')
        return { status: 'ok' }
      }
      const vehRes = await fetch(`/api/vehicles/by-qr/${enc}`)
      if (vehRes.ok) {
        const json = await vehRes.json()
        setVehicle(json.vehicle)
        return { status: 'ok' }
      }
      return { status: 'not-found' }
    } catch {
      return { status: 'offline' }
    }
  }, [])

  // CC-34 (2b): field-fix now serves a scanned unit OR vehicle, routed through the offline
  // queue (was a raw online-only fetch) so a fix logged in the field survives no signal.
  async function submitFieldFix() {
    const subjectName = vehicle?.name ?? unit?.inventoryItem.name
    if (!fieldFixNotes.trim() || (!vehicle && !unit)) return
    setFieldFixSaving(true)
    const body = vehicle
      ? { vehicleId: vehicle.id, notes: fieldFixNotes.trim() }
      : { inventoryUnitId: unit!.id, itemId: unit!.inventoryItem.id, notes: fieldFixNotes.trim() }
    const result = await mutate({
      endpoint: '/api/maintenance/field-fix',
      method: 'POST',
      body,
      label: `Log fixed issue — ${subjectName ?? 'item'}`,
    })
    setFieldFixSaving(false)
    if (!result.ok) {
      showToast({ message: result.error || 'Could not log fix.', severity: 'error' })
      return
    }
    showToast({
      message: result.queued ? 'Fix saved on this phone — will sync when online.' : 'Field fix logged.',
      severity: result.queued ? 'info' : 'success',
    })
    setFieldFixOpen(false)
  }

  // CC-34 (2a): after a report is applied online, refresh the scanned panel so an
  // "Out of service" flip shows immediately. Queued (offline) reports skip this.
  const refetchScanned = async () => {
    if (vehicle) {
      const r = await fetch(`/api/vehicles/by-qr/${encodeURIComponent(vehicle.qrCodeId)}`)
      if (r.ok) { const j = await r.json(); setVehicle(j.vehicle) }
    } else if (unit) {
      const r = await fetch(`/api/inventory/units/by-qr/${encodeURIComponent(unit.qrCodeId)}`)
      if (r.ok) { const j = await r.json(); setUnit({ ...j.unit, inventoryItem: j.item }) }
    }
  }

  const kitItemForUnit = unit ? activeKitItems.find((ki) => ki.inventoryUnitId === unit.id) : undefined
  const canReturn = !!kitItemForUnit && unit?.status === 'CHECKED_OUT' && !String(kitItemForUnit.id).startsWith('pending-')
  const canAdd = unit?.status === 'AVAILABLE' && !!activeRigId && !kitItemForUnit

  const refetchActive = async () => {
    const updated = await fetch('/api/deployments').then((r) => r.json())
    const active = updated[0] ?? null
    if (active) {
      setActiveRigId(active.id)
      setActiveKitItems(active.kits?.flatMap((k: { items: KitItemStub[] }) => k.items) ?? [])
    }
  }

  const handleReturn = async () => {
    if (!activeRigId || !kitItemForUnit || !unit) return
    const itemName = unit.inventoryItem.name
    const kitItemId = kitItemForUnit.id
    setActionLoading(true)
    setError('')
    const result = await mutate({
      endpoint: `/api/deployments/${activeRigId}/items/${kitItemId}`,
      method: 'DELETE',
      body: { returnCondition },
      label: `Return ${itemName} to hub`,
    })
    if (result.ok && result.queued) {
      // Offline: optimistically drop it from the kit so the UI is consistent.
      setActiveKitItems((prev) => prev.filter((ki) => ki.id !== kitItemId))
      setUnit(null)
      showToast({ message: `${itemName} — return queued, will sync when online.`, severity: 'info' })
    } else if (result.ok) {
      setUnit(null)
      showToast({ message: `${itemName} returned to hub.`, severity: 'success' })
      await refetchActive()
    } else {
      setError(result.error || 'Return failed')
    }
    setActionLoading(false)
  }

  const handleAddToKit = async () => {
    if (!activeRigId || !unit) return
    const itemName = unit.inventoryItem.name
    const itemId = unit.inventoryItem.id
    const unitId = unit.id
    setActionLoading(true)
    setAddDialogOpen(false)
    setError('')
    const result = await mutate({
      endpoint: `/api/deployments/${activeRigId}/items`,
      method: 'POST',
      body: {
        items: [{ itemType: 'SERIALIZED', inventoryItemId: itemId, inventoryUnitId: unitId }],
        note: 'Added via scan',
      },
      label: `Add ${itemName} to kit`,
    })
    if (result.ok && result.queued) {
      // Offline: optimistically reflect the unit in the active kit.
      setActiveKitItems((prev) => [
        ...prev,
        { id: `pending-${unitId}`, inventoryUnitId: unitId, inventoryItemId: itemId },
      ])
      setUnit(null)
      showToast({ message: `${itemName} — add queued, will sync when online.`, severity: 'info' })
    } else if (result.ok) {
      setUnit(null)
      showToast({ message: `${itemName} added to your kit.`, severity: 'success' })
      await refetchActive()
    } else {
      setError(result.error || 'Failed to add to kit')
    }
    setActionLoading(false)
  }

  return (
    <Box>
      <Typography variant="h5">Scan</Typography>
      <Stack alignItems="center" spacing={2}>
        <Button
          variant="contained"
          size="large"
          startIcon={<QrCodeScannerIcon />}
          onClick={() => setScannerOpen(true)}
          sx={{ minWidth: 220 }}
        >
          Scan QR Label
        </Button>

        <QrScannerDialog
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          title="Scan QR Label"
          prompt="Point the camera at a unit or vehicle QR label."
          onResolve={resolveScan}
        />

        {error && (
          <Alert severity="error" sx={{ width: '100%', maxWidth: 480 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {unit && (
          <Paper variant="outlined" sx={{ p: 3, width: '100%', maxWidth: 480 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="h6" fontWeight={700}>{unit.inventoryItem.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{unit.inventoryItem.category.name}</Typography>
                </Box>
                <StatusChip status={unit.status} />
              </Stack>

              {unit.serialNumber && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Serial Number</Typography>
                  <Typography variant="body2">{unit.serialNumber}</Typography>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Unit ID</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>{unit.qrCodeId}</Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Item Type</Typography>
                <Typography variant="body2">{unit.inventoryItem.itemType === 'SERIALIZED' ? 'Serialized' : 'Consumable'}</Typography>
              </Box>

              {unit.status === 'CHECKED_OUT' && !canReturn && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  This unit is currently checked out on a deployment.
                </Alert>
              )}

              {unit.status === 'INOPERABLE' && (
                <Alert severity="error" sx={{ py: 0.5 }}>
                  This unit is marked inoperable and is pending admin review.
                </Alert>
              )}

              {unit.notes && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Notes</Typography>
                  <Typography variant="body2">{unit.notes}</Typography>
                </Box>
              )}

              {(canReturn || canAdd) && (
                <Stack spacing={1} mt={1}>
                  {canReturn && (
                    <>
                      <ConditionSelect value={returnCondition} onChange={setReturnCondition} />
                      <Button
                        variant="contained"
                        color="success"
                        onClick={handleReturn}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <CircularProgress size={20} /> : 'Return to Hub'}
                      </Button>
                    </>
                  )}
                  {canAdd && (
                    <Button
                      variant="outlined"
                      onClick={() => setAddDialogOpen(true)}
                      disabled={actionLoading}
                    >
                      Add to My Kit
                    </Button>
                  )}
                </Stack>
              )}

              {/* CC-34 (2a/2b): available on EVERY scanned unit — including gear in a
                  crewmate's kit or already in maintenance (RIDER C 2a-a). Report is
                  annotation, not return; field-fix logs an on-the-spot repair. */}
              <Stack spacing={1} mt={1}>
                <Button
                  variant="outlined" color="warning" size="small"
                  sx={{ minHeight: 44, fontSize: 16 }}
                  onClick={() => setReport({ kind: 'unit', id: unit.id, name: unit.inventoryItem.name })}
                >
                  Report a problem
                </Button>
                <Button
                  variant="outlined" color="success" size="small"
                  sx={{ minHeight: 44, fontSize: 16 }}
                  onClick={() => { setFieldFixNotes(''); setFieldFixOpen(true) }}
                >
                  Log fixed issue
                </Button>
              </Stack>
            </Stack>
          </Paper>
        )}

        {vehicle && (
          <Paper variant="outlined" sx={{ p: 3, width: '100%', maxWidth: 480 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <DirectionsCarIcon color="action" />
                    <Typography variant="h6" fontWeight={700}>{vehicle.name}</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">{vehicle.type}</Typography>
                </Box>
                <StatusChip status={vehicle.status} kind="vehicle" />
              </Stack>

              {vehicle.location && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Location</Typography>
                  <Typography variant="body2">{vehicle.location}</Typography>
                </Box>
              )}
              {vehicle.odometer != null && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Odometer</Typography>
                  <Typography variant="body2">{vehicle.odometer.toLocaleString()} mi</Typography>
                </Box>
              )}

              {vehicle.status === 'IN_MAINTENANCE' && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  This vehicle is in maintenance — contact an admin before operating it.
                </Alert>
              )}

              <Button
                variant="contained"
                startIcon={<DirectionsCarIcon />}
                onClick={() => router.push(`/operator/daily-check?vehicleId=${vehicle.id}`)}
              >
                Start Daily Check
              </Button>
              {/* CC-32 (3.2): 44px hit area — both are primary field actions taken
                  at a vehicle, gloved, and were ~30px targets. */}
              <Button
                variant="outlined"
                color="success"
                size="small"
                sx={{ minHeight: 44, fontSize: 16 }}
                onClick={() => { setFieldFixNotes(''); setFieldFixOpen(true) }}
              >
                Log fixed issue
              </Button>
              {/* CC-34 (2a): the shared one-verb dialog replaces the bespoke online-only
                  report-damage dialog (photo-capable, offline-safe). */}
              <Button
                variant="outlined"
                color="warning"
                size="small"
                sx={{ minHeight: 44, fontSize: 16 }}
                onClick={() => setReport({ kind: 'vehicle', id: vehicle.id, name: vehicle.name })}
              >
                Report a problem
              </Button>
            </Stack>
          </Paper>
        )}
      </Stack>

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add to Kit</DialogTitle>
        <DialogContent>
          <Typography>
            Add <strong>{unit?.inventoryItem.name}</strong> to your active deployment kit?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddToKit}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* CC-10 / CC-34 (2b): Log fixed issue — serves a scanned vehicle OR unit. */}
      <Dialog open={fieldFixOpen} onClose={() => setFieldFixOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Log fixed issue — {vehicle?.name ?? unit?.inventoryItem.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              Use this for issues you noticed and fixed on the spot. No repair task is opened.
            </Typography>
            <TextField
              label="What was fixed"
              value={fieldFixNotes}
              onChange={(e) => setFieldFixNotes(e.target.value)}
              multiline
              rows={3}
              fullWidth
              required
              placeholder="Brief description of the issue and fix"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFieldFixOpen(false)} disabled={fieldFixSaving}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            disabled={fieldFixSaving || !fieldFixNotes.trim()}
            onClick={submitFieldFix}
          >
            {fieldFixSaving ? 'Saving…' : 'Log fix'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* CC-34 (2a): the one shared report verb (units + vehicles), offline-safe + photos. */}
      <ReportProblemDialog
        open={!!report}
        subject={report}
        onClose={() => setReport(null)}
        onReported={({ queued }) => { if (!queued) void refetchScanned() }}
      />
    </Box>
  )
}
