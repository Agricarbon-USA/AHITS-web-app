'use client'

import * as React from 'react'
import { Autocomplete, Box, Button, TextField } from '@mui/material'

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
  /**
   * PR-1b (L-2): server search. Supply this together with `truncated` and the
   * component stops filtering the array it was handed and asks the server
   * instead — because past the options ceiling, type-to-filter over a partial
   * list is exactly the lie this PR removes: the item exists, the picker says
   * "No options".
   *
   * Called debounced on every keystroke. Return the matching options; return the
   * unfiltered set for an empty query.
   */
  loadOptions?: (q: string) => Promise<SelectOption[]>
  /** The option set handed in is incomplete — switch `loadOptions` on. */
  truncated?: boolean
  /**
   * PR-1b (L-16): the option load failed. The picker says so and offers a retry,
   * rather than rendering an empty list that reads as an empty catalog and stays
   * empty for the rest of the session.
   */
  loadFailed?: boolean
  onRetry?: () => void
}

const SEARCH_DEBOUNCE_MS = 300

export function SearchableSelect({
  label, value, onChange, options, required, disabled, fullWidth = true, size, placeholder, helperText, error,
  loadOptions, truncated, loadFailed, onRetry,
}: Props) {
  const asyncMode = !!loadOptions && truncated === true
  const [input, setInput] = React.useState('')
  const [remote, setRemote] = React.useState<SelectOption[] | null>(null)
  const [searching, setSearching] = React.useState(false)

  // Debounced server search. The guard on `seq` drops a slow earlier response
  // that lands after a faster later one — otherwise the list flickers back to a
  // previous query's results.
  const seq = React.useRef(0)
  React.useEffect(() => {
    if (!asyncMode || !loadOptions) return
    const mine = ++seq.current
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const found = await loadOptions(input)
        if (seq.current === mine) setRemote(found)
      } catch {
        if (seq.current === mine) setRemote([])
      } finally {
        if (seq.current === mine) setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [asyncMode, loadOptions, input])

  const shown = asyncMode ? (remote ?? options) : options
  const selected = shown.find((o) => o.value === value) ?? options.find((o) => o.value === value) ?? null

  if (loadFailed) {
    return (
      <Box>
        <TextField
          label={label}
          value=""
          disabled
          required={required}
          fullWidth={fullWidth}
          size={size}
          error
          helperText="Could not load the list."
        />
        {onRetry && (
          <Button size="small" onClick={onRetry} sx={{ mt: 0.5 }}>Try again</Button>
        )}
      </Box>
    )
  }

  return (
    <Autocomplete
      value={selected}
      onChange={(_, opt) => onChange(opt?.value ?? '')}
      // The input stays UNCONTROLLED: `input` only mirrors it to drive the
      // debounce. Controlling `inputValue` here swallowed the change event
      // (the typed text never reached the server query).
      onInputChange={asyncMode ? (_, v, reason) => { if (reason === 'input') setInput(v) } : undefined}
      // In async mode the server already filtered — filtering again client-side
      // would re-apply the cap this mode exists to escape.
      filterOptions={asyncMode ? (x) => x : undefined}
      options={shown}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(o, v) => o.value === v.value}
      disabled={disabled}
      fullWidth={fullWidth}
      size={size}
      loading={asyncMode && searching}
      noOptionsText={asyncMode && searching ? 'Searching…' : 'No options'}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          placeholder={placeholder}
          helperText={
            asyncMode
              ? `Showing the first ${shown.length} — keep typing`
              : helperText
          }
          error={error}
        />
      )}
    />
  )
}
