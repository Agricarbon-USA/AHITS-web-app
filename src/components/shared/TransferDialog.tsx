'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stepper, Step, StepLabel,
  TextField, MenuItem, Stack, Box, Typography, Checkbox,
} from '@mui/material'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import TerrainIcon from '@mui/icons-material/Terrain'
import AgricultureIcon from '@mui/icons-material/Agriculture'
import { NotePhotoDialog } from '@/components/shared/NotePhotoDialog'
import { resolvePhotoRefs } from '@/lib/photoStore'

const VEHICLE_ICON: Record<string, React.ElementType> = {
  TRUCK: LocalShippingIcon,
  TRAILER: LocalShippingIcon,
  POLARIS_UTV: TerrainIcon,
  CAN_AM_UTV: TerrainIcon,
  ATV: TerrainIcon,
  CHRISTIE_DRILL: AgricultureIcon,
  OTHER: LocalShippingIcon,
}

// Structural prop types — both the operator (my-rig) and admin (deployments)
// Rig shapes are assignable to these, so the dialog can be shared without
// coupling to either page's local interfaces.
export interface TransferKitItem {
  id: string
  quantity: number
  item: { name: string; itemType: string }
  inventoryUnit: { id: string; serialNumber: string | null; qrCodeId: string } | null
}

export interface TransferDialogRig {
  id: string
  vehicles: { vehicle: { id: string; name: string; type: string } }[]
  kits: { items: TransferKitItem[] }[]
}

export interface TransferOperator {
  id: string
  name: string
}

export type TransferToast = (t: {
  message: string
  severity: 'success' | 'error' | 'warning' | 'info'
}) => void

/**
 * One shared transfer dialog used by both the operator (my-rig) and admin
 * (deployments) screens — collapses two ~140-line near-duplicate copies (UX-5).
 *
 * Behaviour differences are explicit props:
 *  - `blockOffline`     operator: transfers are a live two-party handshake, not
 *                       safe to queue offline; block with a clear message.
 *  - `resolvePhotos`    operator: swap captured offline photo refs for real
 *                       uploaded URLs before POST.
 *  - `excludeOperatorId` admin: drop the source operator from the destination list.
 */
export function TransferDialog({
  rig,
  operators,
  onClose,
  onSuccess,
  showToast,
  blockOffline = false,
  resolvePhotos = false,
  excludeOperatorId,
}: {
  rig: TransferDialogRig
  operators: TransferOperator[]
  onClose: () => void
  onSuccess: () => void
  showToast: TransferToast
  blockOffline?: boolean
  resolvePhotos?: boolean
  excludeOperatorId?: string
}) {
  const kitItems = rig.kits.flatMap((k) => k.items)
  const [step, setStep] = React.useState(0)
  const [toOperatorId, setToOperatorId] = React.useState('')
  const [selVehicles, setSelVehicles] = React.useState<Set<string>>(
    new Set(rig.vehicles.map((rv) => rv.vehicle.id))
  )
  const [selKitItems, setSelKitItems] = React.useState<Set<string>>(
    new Set(kitItems.map((ki) => ki.id))
  )
  const [transferQtys, setTransferQtys] = React.useState<Map<string, number>>(
    new Map(kitItems.map((ki) => [ki.id, ki.quantity]))
  )
  const [loading, setLoading] = React.useState(false)

  const destOperators = excludeOperatorId
    ? operators.filter((o) => o.id !== excludeOperatorId)
    : operators
  const destName = operators.find((o) => o.id === toOperatorId)?.name ?? 'operator'

  const doTransfer = async (note: string, photoUrls: string[]) => {
    // Transfers are a stateful, conflict-prone handshake between two operators,
    // so unlike returns/end-deployment they are NOT safe to queue offline and
    // replay later. Block clearly when offline instead of firing a raw fetch
    // that surfaces a confusing generic "Network error".
    if (blockOffline && typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast({ message: 'Transfers need an internet connection. Try again once you’re back online.', severity: 'warning' })
      return
    }
    setLoading(true)
    try {
      const basePayload = {
        toOperatorId,
        note,
        photoUrls,
        vehicleIds: Array.from(selVehicles),
        items: kitItems
          .filter((ki) => selKitItems.has(ki.id))
          .map((ki) => ({
            kitItemId: ki.id,
            quantity: transferQtys.get(ki.id) ?? ki.quantity,
            inventoryUnitId: ki.inventoryUnit?.id ?? undefined,
          })),
      }
      // Upload any captured photos and swap in real URLs (transfers run online).
      const payload = resolvePhotos ? await resolvePhotoRefs(basePayload) : basePayload
      const res = await fetch(`/api/deployments/${rig.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showToast({ message: typeof d.error === 'string' ? d.error : 'Transfer failed. Please try again.', severity: 'error' })
        return
      }
      showToast({ message: `Transfer request sent — waiting for ${destName} to accept.`, severity: 'success' })
      onSuccess()
      onClose()
    } catch {
      showToast({ message: 'Network error. Please try again.', severity: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (step === 2) {
    return (
      <NotePhotoDialog
        title="Transfer equipment"
        description={`Transferring to ${destName}`}
        open={true}
        loading={loading}
        onClose={onClose}
        onConfirm={doTransfer}
        confirmLabel="Transfer"
      />
    )
  }

  return (
    <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Transfer Equipment</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
          <Step><StepLabel>Destination</StepLabel></Step>
          <Step><StepLabel>Select Items</StepLabel></Step>
          <Step><StepLabel>Note</StepLabel></Step>
        </Stepper>

        {step === 0 && (
          <TextField select label="Destination Operator" value={toOperatorId}
            onChange={(e) => setToOperatorId(e.target.value)} fullWidth>
            {destOperators.map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
            ))}
          </TextField>
        )}

        {step === 1 && (
          <Stack spacing={2}>
            {rig.vehicles.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Vehicles</Typography>
                <Stack spacing={0.5}>
                  {rig.vehicles.map((rv) => {
                    const Icon = VEHICLE_ICON[rv.vehicle.type] ?? LocalShippingIcon
                    return (
                      <Stack key={rv.vehicle.id} direction="row" alignItems="center" spacing={1}>
                        <Checkbox size="small" checked={selVehicles.has(rv.vehicle.id)}
                          onChange={(e) => {
                            const s = new Set(selVehicles)
                            e.target.checked ? s.add(rv.vehicle.id) : s.delete(rv.vehicle.id)
                            setSelVehicles(s)
                          }} />
                        <Icon fontSize="small" color="action" />
                        <Typography variant="body2">{rv.vehicle.name}</Typography>
                      </Stack>
                    )
                  })}
                </Stack>
              </Box>
            )}
            {kitItems.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} mb={1}>Kit Items</Typography>
                <Stack spacing={0.5}>
                  {kitItems.map((ki) => (
                    <Stack key={ki.id} direction="row" alignItems="center" spacing={1}>
                      <Checkbox size="small" checked={selKitItems.has(ki.id)}
                        onChange={(e) => {
                          const s = new Set(selKitItems)
                          e.target.checked ? s.add(ki.id) : s.delete(ki.id)
                          setSelKitItems(s)
                        }} />
                      <Box flexGrow={1}>
                        <Typography variant="body2">{ki.item.name}</Typography>
                        {ki.inventoryUnit && (
                          <Typography variant="caption" color="text.secondary">
                            {ki.inventoryUnit.serialNumber ?? ki.inventoryUnit.qrCodeId.slice(0, 8)}
                          </Typography>
                        )}
                      </Box>
                      {ki.item.itemType === 'CONSUMABLE' && selKitItems.has(ki.id) ? (
                        <TextField
                          type="number"
                          size="small"
                          value={transferQtys.get(ki.id) ?? ki.quantity}
                          onChange={(e) => {
                            const qty = Math.max(1, Math.min(parseInt(e.target.value) || 1, ki.quantity))
                            const m = new Map(transferQtys)
                            m.set(ki.id, qty)
                            setTransferQtys(m)
                          }}
                          inputProps={{ min: 1, max: ki.quantity }}
                          sx={{ width: 70 }}
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary">×{ki.quantity}</Typography>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>Back</Button>}
        <Button variant="contained" onClick={() => setStep((s) => s + 1)}
          disabled={step === 0 && !toOperatorId}>
          {step < 1 ? 'Next' : 'Continue to Note'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
