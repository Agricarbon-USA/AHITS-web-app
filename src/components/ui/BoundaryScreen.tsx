'use client'

import * as React from 'react'
import { Box, Typography, Button, Stack } from '@mui/material'
import AgricultureIcon from '@mui/icons-material/Agriculture'

// UXP-1d: the shared look for the app's failure/empty boundaries (error + 404).
// Branded (the AHITS green tractor mark + theme colors — no raw hex, so it passes
// the CC-23 no-hex lint), offline-tolerant (no external fonts/images), and every
// escape is a ≥48px touch target. Renders inside <Providers> (root layout), so it
// has the MUI theme. global-error.tsx does NOT use this — it replaces the root
// layout and must be self-contained (inline styles), so it inlines its own copy.
export interface BoundaryAction {
  label: string
  onClick: () => void
  primary?: boolean
}

export function BoundaryScreen({
  title,
  message,
  actions,
}: {
  title: string
  message: string
  actions: BoundaryAction[]
}) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        px: 3,
        py: 6,
        gap: 2,
        bgcolor: 'background.default',
      }}
    >
      <AgricultureIcon color="primary" sx={{ fontSize: 48 }} />
      <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 420 }}>
        {message}
      </Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mt: 2, width: '100%', maxWidth: 340 }}
      >
        {actions.map((a) => (
          <Button
            key={a.label}
            onClick={a.onClick}
            variant={a.primary ? 'contained' : 'outlined'}
            fullWidth
            sx={{ minHeight: 48 }}
          >
            {a.label}
          </Button>
        ))}
      </Stack>
    </Box>
  )
}
