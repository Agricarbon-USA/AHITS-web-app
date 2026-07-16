'use client'

import * as React from 'react'
import { Chip } from '@mui/material'
import type { ChipProps } from '@mui/material'
import { equipmentStatusMeta, vehicleStatusMeta, maintenanceStatusMeta, priorityMeta, requestStatusMeta } from '@/lib/status'
import { density } from '@/theme/tokens'

// CC-23: StatusChip v2 — the one dense status/badge chip.
//
// Two modes, one component:
//  • Semantic status (the original API): pass `status` + `kind`; the label and
//    color come from the shared status vocabulary (lib/status).
//  • Free-label badge: pass `label` (+ optional `color`) for an ad-hoc badge like
//    "Rental" or a category name. This replaces the 14 hand-rolled
//    `<Chip sx={{ height: 18, fontSize: 10 }} />` sites that clipped descenders.
//
// The dense dimensions (tokens.density.chipDense, height 20 / fontSize 11) apply
// ONLY to badge mode — those are the hand-rolled 18/10 sites CC-23 is fixing.
// Semantic status chips keep their prior MUI "small" size unchanged, so the 15
// existing `<StatusChip status=… />` usages are not visually altered.
type SemanticProps = {
  status: string
  kind?: 'equipment' | 'vehicle' | 'maintenance' | 'priority' | 'request'
  label?: never
  color?: never
}
type BadgeProps = {
  label: React.ReactNode
  color?: ChipProps['color']
  status?: never
  kind?: never
}
type StatusChipProps = (SemanticProps | BadgeProps) & {
  variant?: ChipProps['variant']
  /** Extra sx merged after the dense dimensions (e.g. ml spacing). */
  sx?: ChipProps['sx']
  icon?: ChipProps['icon']
}

const denseSx = {
  height: density.chipDense.height,
  fontSize: density.chipDense.fontSize,
  '& .MuiChip-label': { px: 0.75 },
} as const

export function StatusChip(props: StatusChipProps) {
  const { variant, sx, icon } = props

  // Free-label badge mode.
  if (props.label !== undefined) {
    return (
      <Chip
        label={props.label}
        color={props.color}
        icon={icon}
        size="small"
        variant={variant}
        sx={{ ...denseSx, ...sx }}
      />
    )
  }

  // Semantic status mode — unchanged from v1 (MUI "small", no dense override).
  // The label branch above has returned, so `props` is SemanticProps here (TS
  // can't narrow the union across the early return on a `?: never` discriminant).
  const { status, kind = 'equipment' } = props as SemanticProps
  const meta =
    kind === 'vehicle' ? vehicleStatusMeta(status)
    : kind === 'maintenance' ? maintenanceStatusMeta(status)
    : kind === 'priority' ? priorityMeta(status)
    : kind === 'request' ? requestStatusMeta(status)
    : equipmentStatusMeta(status)
  return <Chip label={meta.label} color={meta.color} icon={icon} size="small" variant={variant} sx={sx} />
}
