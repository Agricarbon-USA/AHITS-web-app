'use client'

import * as React from 'react'
import {
  Card, CardContent, Typography, Stack, Box, Button, Checkbox, Chip, IconButton, Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import TerrainIcon from '@mui/icons-material/Terrain'
import AgricultureIcon from '@mui/icons-material/Agriculture'
import { StatusChip } from '@/components/shared/StatusChip'

// CC-12 PR3: the two heavy presentational cards of My Deployment, extracted off
// the ~2000-line container and wrapped in React.memo. With stable props, opening a
// dialog (or any unrelated state change on the container) no longer re-renders
// these lists — the perf goal of the split. Behavior is identical to the inline
// versions; the container is now the thin stateful shell.

export const VEHICLE_ICON: Record<string, React.ElementType> = {
  TRUCK: LocalShippingIcon,
  TRAILER: LocalShippingIcon,
  POLARIS_UTV: TerrainIcon,
  CAN_AM_UTV: TerrainIcon,
  ATV: TerrainIcon,
  CHRISTIE_DRILL: AgricultureIcon,
  OTHER: LocalShippingIcon,
}

export interface VehicleRow {
  id: string
  vehicle: { id: string; name: string; type: string; isRental: boolean; rentalAgreementUrl?: string | null }
}

export interface KitRow {
  id: string
  quantity: number
  item: { id: string; name: string; itemType: string; lowStockThreshold?: number | null }
  inventoryUnit: { id: string; qrCodeId: string; serialNumber: string | null; status: string } | null
}

interface VehiclesCardProps {
  vehicles: VehicleRow[]
  removingVehicles: boolean
  selVehicles: Set<string>
  setSelVehicles: (s: Set<string>) => void
  setRemovingVehicles: (v: boolean) => void
  onAddVehicles: () => void
  onRemoveSelected: () => void
}

export const DeploymentVehiclesCard = React.memo(function DeploymentVehiclesCard({
  vehicles, removingVehicles, selVehicles, setSelVehicles, setRemovingVehicles, onAddVehicles, onRemoveSelected,
}: VehiclesCardProps) {
  return (
    <Card sx={{ flex: 1 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600} mb={1.5}>Vehicles</Typography>
        {vehicles.length === 0 ? (
          <Typography variant="body2" color="text.secondary" mb={1}>No vehicles.</Typography>
        ) : (
          <Stack spacing={0.5} mb={1}>
            {vehicles.map((rv) => {
              const Icon = VEHICLE_ICON[rv.vehicle.type] ?? LocalShippingIcon
              return (
                <Stack key={rv.id} direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ minWidth: 0 }}>
                  {removingVehicles && (
                    <Checkbox size="small" checked={selVehicles.has(rv.vehicle.id)}
                      onChange={(e) => {
                        const s = new Set(selVehicles)
                        e.target.checked ? s.add(rv.vehicle.id) : s.delete(rv.vehicle.id)
                        setSelVehicles(s)
                      }} />
                  )}
                  <Icon fontSize="small" color="action" />
                  <Typography variant="body2" sx={{ minWidth: 0, wordBreak: 'break-word' }}>{rv.vehicle.name}</Typography>
                  {rv.vehicle.isRental && (
                    <StatusChip label="Rental" color="warning" variant="outlined" sx={{ ml: 0.5 }} />
                  )}
                  {rv.vehicle.isRental && !rv.vehicle.rentalAgreementUrl && (
                    <StatusChip label="Agreement needed" color="error" variant="outlined" />
                  )}
                </Stack>
              )
            })}
          </Stack>
        )}
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onAddVehicles}>
            Add Vehicles
          </Button>
          {vehicles.length > 0 && !removingVehicles && (
            <Button size="small" variant="outlined" color="error" onClick={() => setRemovingVehicles(true)}>
              Remove Vehicles
            </Button>
          )}
          {removingVehicles && selVehicles.size > 0 && (
            <Button size="small" variant="contained" color="error" onClick={onRemoveSelected}>
              Remove Selected ({selVehicles.size})
            </Button>
          )}
          {removingVehicles && (
            <Button size="small" onClick={() => { setRemovingVehicles(false); setSelVehicles(new Set()) }}>
              Cancel
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
})

interface KitCardProps {
  kitItems: KitRow[]
  removingItems: boolean
  selItems: Set<string>
  setSelItems: (s: Set<string>) => void
  setRemovingItems: (v: boolean) => void
  onAddItems: () => void
  onRemoveSelected: () => void
  onLogUsage: (ki: KitRow) => void
  onReturnItem: (ki: KitRow) => void
}

export const DeploymentKitCard = React.memo(function DeploymentKitCard({
  kitItems, removingItems, selItems, setSelItems, setRemovingItems, onAddItems, onRemoveSelected, onLogUsage, onReturnItem,
}: KitCardProps) {
  return (
    <Card sx={{ flex: 1 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600} mb={1.5}>My Kit</Typography>
        {kitItems.length === 0 ? (
          <Typography variant="body2" color="text.secondary" mb={1}>Empty kit.</Typography>
        ) : (
          <Stack spacing={0.5} mb={1}>
            {kitItems.map((ki) => {
              const isLow = ki.item.lowStockThreshold != null && ki.quantity <= ki.item.lowStockThreshold
              return (
                <Stack key={ki.id} direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                  {removingItems && (
                    <Checkbox size="small" checked={selItems.has(ki.id)}
                      onChange={(e) => {
                        const s = new Set(selItems)
                        e.target.checked ? s.add(ki.id) : s.delete(ki.id)
                        setSelItems(s)
                      }} />
                  )}
                  <Box flexGrow={1} sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{ki.item.name}</Typography>
                    {ki.inventoryUnit && (
                      <Typography variant="caption" color="text.secondary">
                        Unit: {ki.inventoryUnit.serialNumber ?? ki.inventoryUnit.qrCodeId.slice(0, 8)}
                      </Typography>
                    )}
                  </Box>
                  <StatusChip label={ki.item.itemType.charAt(0) + ki.item.itemType.slice(1).toLowerCase()} />
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    {isLow && <WarningAmberIcon fontSize="small" color="warning" />}
                    <Chip size="small" label={`×${ki.quantity}`} color={isLow ? 'warning' : 'default'} />
                  </Stack>
                  {!removingItems && ki.item.itemType === 'CONSUMABLE' && (
                    <Tooltip title="Log daily usage">
                      <IconButton size="small" color="warning" sx={{ width: 44, height: 44 }} onClick={() => onLogUsage(ki)}>
                        <RemoveCircleOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {!removingItems && ki.item.itemType !== 'CONSUMABLE' && (
                    <Tooltip title="Return item">
                      <IconButton size="small" color="error" sx={{ width: 44, height: 44 }} onClick={() => onReturnItem(ki)}>
                        <RemoveCircleOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              )
            })}
          </Stack>
        )}
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onAddItems}>
            Add Items
          </Button>
          {kitItems.length > 0 && !removingItems && (
            <Button size="small" variant="outlined" color="error" onClick={() => setRemovingItems(true)}>
              Remove Items
            </Button>
          )}
          {removingItems && selItems.size > 0 && (
            <Button size="small" variant="contained" color="error" onClick={onRemoveSelected}>
              Remove Selected ({selItems.size})
            </Button>
          )}
          {removingItems && (
            <Button size="small" onClick={() => { setRemovingItems(false); setSelItems(new Set()) }}>
              Cancel
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
})
