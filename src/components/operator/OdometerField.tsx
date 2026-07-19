'use client'

import * as React from 'react'
import { TextField, Alert } from '@mui/material'

// CC-14 (NS-5): the daily-check odometer field with an inline sanity warning. Warns —
// never blocks — when the entered reading is below the vehicle's last-known odometer
// (a likely typo / rollback) or an implausibly large jump above it. Submit is always
// allowed; the server already advances the stored odometer forward-only, so a low value
// here is harmless, and a genuinely large jump is occasionally real.
export const IMPLAUSIBLE_JUMP_MI = 2000

export function computeOdometerWarning(value: string, lastKnown: number | null): string | null {
  if (lastKnown == null) return null
  const entered = parseInt(value, 10)
  if (!value || Number.isNaN(entered)) return null
  if (entered < lastKnown) {
    return `Below the last recorded reading (${lastKnown.toLocaleString()} mi). Double-check the number.`
  }
  if (entered - lastKnown > IMPLAUSIBLE_JUMP_MI) {
    return `That's ${(entered - lastKnown).toLocaleString()} mi more than the last reading (${lastKnown.toLocaleString()} mi). Double-check the number.`
  }
  return null
}

interface Props {
  value: string
  onChange: (v: string) => void
  lastKnown: number | null
}

export function OdometerField({ value, onChange, lastKnown }: Props) {
  const warning = computeOdometerWarning(value, lastKnown)
  return (
    <>
      <TextField
        label="Odometer (mi)"
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        fullWidth
        inputProps={{ min: 0 }}
      />
      {warning && (
        <Alert severity="warning" sx={{ mt: -1 }}>{warning}</Alert>
      )}
    </>
  )
}
