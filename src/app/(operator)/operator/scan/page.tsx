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
  const [scanning, setScanning] = React.useState(false)
  const [unit, setUnit] = React.useState<UnitInfo | null>(null)
  const [vehicle, setVehicle] = React.useState<VehicleInfo | null>(null)
  const [error, setError] = React.useState('')
  const [activeRigId, setActiveRigId] = React.useState<string | null>(null)
  const [activeKitItems, setActiveKitItems] = React.useState<KitItemStub[]>([])
  const [returnCondition, setReturnCondition] = React.useState<ReturnCondition>('GOOD')
  const [actionLoading, setActionLoading] = React.useState(false)
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  // CC-10: field-fix and report-damage dialogs
  const [fieldFixOpen, setFieldFixOpen] = React.useState(false)
  const [fieldFixNotes, setFieldFixNotes] = React.useState('')
  const [fieldFixSaving, setFieldFixSaving] = React.useState(false)
  const [reportDamageOpen, setReportDamageOpen] = React.useState(false)
  const [reportDamageNotes, setReportDamageNotes] = React.useState('')
  const [reportDamageSaving, setReportDamageSaving] = React.useState(false)

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

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    setError('')
    setUnit(null)
    setVehicle(null)
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      const jsQR = (await import('jsqr')).default
      const result = jsQR(imgData.data, bitmap.width, bitmap.height)
      if (!result?.data) {
        setError('No QR code detected in the image. Try again.')
        return
      }
      const code = encodeURIComponent(result.data)
      // Context-aware resolution (PRD §7.7): a label is either an inventory unit
      // or a vehicle. Try the unit first, then fall back to a vehicle.
      const unitRes = await fetch(`/api/inventory/units/by-qr/${code}`)
      if (unitRes.ok) {
        const json = await unitRes.json()
        setUnit({ ...json.unit, inventoryItem: json.item })
        setReturnCondition('GOOD')
        return
      }
      const vehRes = await fetch(`/api/vehicles/by-qr/${code}`)
      if (vehRes.ok) {
        const json = await vehRes.json()
        setVehicle(json.vehicle)
        return
      }
      setError('QR code not recognised — it is not registered to any unit or vehicle.')
    } catch {
      setError('Failed to process image. Please try again.')
    } finally {
      setScanning(false)
      e.target.value = ''
    }
  }

  async function submitVehicleFieldFix() {
    if (!vehicle || !fieldFixNotes.trim()) return
    setFieldFixSaving(true)
    try {
      const res = await fetch('/api/maintenance/field-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: vehicle.id, notes: fieldFixNotes.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not log fix.', severity: 'error' })
        return
      }
      showToast({ message: 'Field fix logged.', severity: 'success' })
      setFieldFixOpen(false)
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setFieldFixSaving(false)
    }
  }

  async function submitVehicleReportDamage() {
    if (!vehicle || !reportDamageNotes.trim()) return
    setReportDamageSaving(true)
    try {
      const res = await fetch(`/api/vehicles/${vehicle.id}/report-damage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: reportDamageNotes.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Could not report damage.', severity: 'error' })
        return
      }
      showToast({ message: 'Damage reported. An admin will manage the repair.', severity: 'success' })
      setReportDamageOpen(false)
      // Refresh vehicle panel so IN_MAINTENANCE status shows immediately.
      const vehRes = await fetch(`/api/vehicles/by-qr/${encodeURIComponent(vehicle.qrCodeId)}`)
      if (vehRes.ok) { const json = await vehRes.json(); setVehicle(json.vehicle) }
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setReportDamageSaving(false)
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
          component="label"
          variant="contained"
          size="large"
          startIcon={scanning ? <CircularProgress size={20} color="inherit" /> : <QrCodeScannerIcon />}
          disabled={scanning}
          sx={{ minWidth: 220 }}
        >
          {scanning ? 'Scanning…' : 'Scan QR Label'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleCapture}
          />
        </Button>

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
              <Button
                variant="outlined"
                color="success"
                size="small"
                onClick={() => { setFieldFixNotes(''); setFieldFixOpen(true) }}
              >
                Log fixed issue
              </Button>
              <Button
                variant="outlined"
                color="warning"
                size="small"
                onClick={() => { setReportDamageNotes(''); setReportDamageOpen(true) }}
              >
                Report damage
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

      {/* CC-10: Log fixed issue on vehicle */}
      <Dialog open={fieldFixOpen} onClose={() => setFieldFixOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Log fixed issue — {vehicle?.name}</DialogTitle>
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
            onClick={submitVehicleFieldFix}
          >
            {fieldFixSaving ? 'Saving…' : 'Log fix'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* CC-10: Report damage on vehicle */}
      <Dialog open={reportDamageOpen} onClose={() => setReportDamageOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Report damage — {vehicle?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              Opens a repair task. An admin will assign a shop and close it out. The vehicle will be marked IN MAINTENANCE.
            </Typography>
            <TextField
              label="What happened"
              value={reportDamageNotes}
              onChange={(e) => setReportDamageNotes(e.target.value)}
              multiline
              rows={3}
              fullWidth
              required
              placeholder="Describe the damage"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportDamageOpen(false)} disabled={reportDamageSaving}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={reportDamageSaving || !reportDamageNotes.trim()}
            onClick={submitVehicleReportDamage}
          >
            {reportDamageSaving ? 'Reporting…' : 'Report damage'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
