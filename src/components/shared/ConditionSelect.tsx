'use client'

import * as React from 'react'
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { RETURN_CONDITION_OPTIONS, type ReturnCondition } from '@/lib/status'

/**
 * One shared control for declaring an equipment item's condition on return —
 * the single source of the GOOD / IN_MAINTENANCE / INOPERABLE vocabulary (M1-8).
 * Used by the scan flow and any other return path so the options never drift.
 * `options` narrows the list for one caller (PR-6: a consumable offers Good · Write off);
 * omitted, every caller gets the full list exactly as before.
 */
export function ConditionSelect({
  value,
  onChange,
  label = 'Return condition',
  size = 'small',
  fullWidth = true,
  options = RETURN_CONDITION_OPTIONS,
}: {
  value: ReturnCondition
  onChange: (value: ReturnCondition) => void
  label?: string
  size?: 'small' | 'medium'
  fullWidth?: boolean
  options?: readonly { value: ReturnCondition; label: string }[]
}) {
  return (
    <FormControl size={size} fullWidth={fullWidth}>
      <InputLabel>{label}</InputLabel>
      <Select
        value={value}
        label={label}
        onChange={(e) => onChange(e.target.value as ReturnCondition)}
      >
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
