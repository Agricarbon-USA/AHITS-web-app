'use client'

import * as React from 'react'
import { MenuItem, TextField } from '@mui/material'
import { hubLabel, type HubOption } from '@/lib/hub-label'

/**
 * P1-1b (3.1, D51): the one hub picker every return uses. Tap to pick (no keyboard for a
 * handful of hubs), and nothing is pre-picked: `cameFromHubId` is only a hint.
 */
export function ReturnHubSelect({
  hubs,
  value,
  onChange,
  cameFromHubId,
  label = 'Return hub',
  helperText,
  required = true,
  size,
}: {
  hubs: HubOption[]
  value: string
  onChange: (hubId: string) => void
  cameFromHubId?: string | null
  label?: string
  helperText?: string
  required?: boolean
  size?: 'small' | 'medium'
}) {
  const cameFrom = cameFromHubId ? hubs.find((h) => h.id === cameFromHubId)?.name : undefined
  const error = required && hubs.length > 0 && !value
  const helper = hubs.length === 0
    ? 'No hubs to pick from — connect once, then try again.'
    : helperText
      ?? (error
        ? `Pick a hub${cameFrom ? ` · came from ${cameFrom}` : ''}`
        : cameFrom ? `Came from ${cameFrom}` : undefined)
  return (
    <TextField
      select
      label={label}
      size={size}
      required={required}
      fullWidth
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={hubs.length === 0}
      error={error}
      helperText={helper}
    >
      <MenuItem value="" disabled>Pick a hub</MenuItem>
      {hubs.map((h) => (
        <MenuItem key={h.id} value={h.id}>{hubLabel(h)}</MenuItem>
      ))}
    </TextField>
  )
}
