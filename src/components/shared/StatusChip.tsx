'use client'

import { Chip } from '@mui/material'
import type { ChipProps } from '@mui/material'
import { equipmentStatusMeta, vehicleStatusMeta } from '@/lib/status'

interface StatusChipProps {
  status: string
  kind?: 'equipment' | 'vehicle'
  size?: ChipProps['size']
}

/** Renders a status as a labelled, colour-coded chip from the shared vocabulary. */
export function StatusChip({ status, kind = 'equipment', size = 'small' }: StatusChipProps) {
  const meta = kind === 'vehicle' ? vehicleStatusMeta(status) : equipmentStatusMeta(status)
  return <Chip label={meta.label} color={meta.color} size={size} />
}
