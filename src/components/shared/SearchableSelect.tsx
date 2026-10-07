'use client'

import * as React from 'react'
import { Autocomplete, TextField } from '@mui/material'

// CC-14: the one searchable single-select, replacing the flat MUI `TextField select`
// roster/item pickers (a long operator roster or inventory list is unusable as a plain
// scroll). Drop-in shape: string `value` (the option id, '' = none), `onChange(value)`,
// and `{ value, label }[]` options. Type-to-filter is Autocomplete's default.
export interface SelectOption {
  value: string
  label: string
}

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  required?: boolean
  disabled?: boolean
  fullWidth?: boolean
  size?: 'small' | 'medium'
  placeholder?: string
  helperText?: string
  /** UXP-6 6a: inline field error — sets `aria-invalid` on the input so
   *  `scrollToFirstInvalid` (EntityFormDialog) can find and focus it. */
  error?: boolean
}

export function SearchableSelect({
  label, value, onChange, options, required, disabled, fullWidth = true, size, placeholder, helperText, error,
}: Props) {
  const selected = options.find((o) => o.value === value) ?? null

  return (
    <Autocomplete
      value={selected}
      onChange={(_, opt) => onChange(opt?.value ?? '')}
      options={options}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(o, v) => o.value === v.value}
      disabled={disabled}
      fullWidth={fullWidth}
      size={size}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          placeholder={placeholder}
          helperText={helperText}
          error={error}
        />
      )}
    />
  )
}
