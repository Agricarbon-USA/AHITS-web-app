'use client'

import * as React from 'react'
import { Box, Typography, Stack } from '@mui/material'

// CC-14: the EmptyState primitive, built demand-pull for the Today view's "no active
// deployment" case (per the CC-12/CC-14 rule — primitives are pulled by the first
// surface that needs them, never a standalone sweep). Centered icon + title + optional
// body + optional action slot. Presentational; owns no data.
interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  dense?: boolean
}

export function EmptyState({ icon, title, description, action, dense }: EmptyStateProps) {
  return (
    <Box
      role="status"
      sx={{
        textAlign: 'center',
        py: dense ? 3 : 6,
        px: 2,
        color: 'text.secondary',
      }}
    >
      <Stack spacing={1.5} alignItems="center">
        {icon && <Box sx={{ fontSize: 48, lineHeight: 0, color: 'text.disabled' }}>{icon}</Box>}
        <Typography variant="h6" color="text.primary">{title}</Typography>
        {description && (
          <Typography variant="body2" sx={{ maxWidth: 360 }}>{description}</Typography>
        )}
        {action && <Box sx={{ pt: 0.5 }}>{action}</Box>}
      </Stack>
    </Box>
  )
}
