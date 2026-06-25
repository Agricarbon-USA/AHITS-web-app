'use client'

import { Chip } from '@mui/material'
import type { ChipProps } from '@mui/material'
import { equipmentStatusMeta, vehicleStatusMeta, maintenanceStatusMeta, priorityMeta, requestStatusMeta } from '@/lib/status'

interface StatusChipProps {
  status: string
  kind?: 'equipment' | 'vehicle' | 'maintenance' | 'priority' | 'request'
  size?: ChipProps['size']
  variant?: ChipProps['variant']
}

/** Renders a status as a labelled, colour-coded chip from the shared vocabulary. */
export function StatusChip({ status, kind = 'equipment', size = 'small', variant }: StatusChipProps) {
  const meta =
    kind === 'vehicle' ? vehicleStatusMeta(status)
    : kind === 'maintenance' ? maintenanceStatusMeta(status)
    : kind === 'priority' ? priorityMeta(status)
    : kind === 'request' ? requestStatusMeta(status)
    : equipmentStatusMeta(status)
  return <Chip label={meta.label} color={meta.color} size={size} variant={variant} />
}
