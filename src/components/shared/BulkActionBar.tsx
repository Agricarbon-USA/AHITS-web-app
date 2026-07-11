'use client'

import * as React from 'react'
import {
  Paper, Stack, Typography, Button, Slide, IconButton, Tooltip,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { MutationButton } from '@/components/shared/ReadOnly'

export interface BulkAction {
  label: string
  color?: 'primary' | 'error' | 'warning' | 'success' | 'inherit'
  variant?: 'contained' | 'outlined' | 'text'
  onClick: () => void
  disabled?: boolean
}

interface BulkActionBarProps {
  count: number
  actions: BulkAction[]
  onClear: () => void
  noun?: string
}

/**
 * Sticky bottom action bar that slides in when one or more items are selected.
 * First consumer: Hubs Inbound. Designed to be portable — pass in the count,
 * an actions array, and a clear callback. Uses MutationButton so read-only
 * mode is respected.
 */
export function BulkActionBar({ count, actions, onClear, noun = 'item' }: BulkActionBarProps) {
  return (
    <Slide direction="up" in={count > 0} mountOnEnter unmountOnExit>
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1300,
          px: 3,
          py: 1.5,
          borderRadius: 3,
          minWidth: 320,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>
            {count} {noun}{count !== 1 ? 's' : ''} selected
          </Typography>
          <Stack direction="row" spacing={1} flexGrow={1}>
            {actions.map((a) => (
              <MutationButton
                key={a.label}
                size="small"
                variant={a.variant ?? 'contained'}
                color={a.color ?? 'primary'}
                onClick={a.onClick}
                disabled={a.disabled}
              >
                {a.label}
              </MutationButton>
            ))}
          </Stack>
          <Tooltip title="Clear selection">
            <IconButton size="small" onClick={onClear}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>
    </Slide>
  )
}
