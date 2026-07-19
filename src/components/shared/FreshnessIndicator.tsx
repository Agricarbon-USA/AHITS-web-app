'use client'

import * as React from 'react'
import { Stack, Typography, IconButton, Tooltip } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'

// CC-12 PR2: "Data as of HH:MM" for cached list views, with an optional manual
// refresh. Fed the `updatedAt` timestamp from useFreshList. Purely presentational
// so it's the same across every cached surface.
interface FreshnessIndicatorProps {
  updatedAt: number | null
  isValidating?: boolean
  onRefresh?: () => void
}

export function FreshnessIndicator({ updatedAt, isValidating, onRefresh }: FreshnessIndicatorProps) {
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null
  const label = isValidating ? 'Refreshing…' : time ? `Data as of ${time}` : 'Loading…'

  return (
    <Stack direction="row" alignItems="center" spacing={0.25}>
      <Typography variant="caption" color="text.secondary" aria-live="polite">{label}</Typography>
      {onRefresh && (
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" aria-label="Refresh" onClick={onRefresh} disabled={isValidating}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Stack>
  )
}
