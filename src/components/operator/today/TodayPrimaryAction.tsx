'use client'

import * as React from 'react'
import { Button, Stack, Typography } from '@mui/material'
import ChecklistIcon from '@mui/icons-material/Checklist'
import TaskAltIcon from '@mui/icons-material/TaskAlt'

// CC-14 (NS-10): the ONE contextual primary action. Before the day's checks are done
// → "Start daily check" (the day's first motion). Once every rig vehicle is checked
// → "You're set." Renders nothing when the operator has no vehicles to check (the
// page shows its own state).
interface Props {
  dueCount: number
  hasVehicles: boolean
  onStartCheck: () => void
}

export function TodayPrimaryAction({ dueCount, hasVehicles, onStartCheck }: Props) {
  if (!hasVehicles) return null

  if (dueCount > 0) {
    return (
      <Button
        fullWidth
        size="large"
        variant="contained"
        startIcon={<ChecklistIcon />}
        onClick={onStartCheck}
      >
        Start daily check{dueCount > 1 ? ` (${dueCount})` : ''}
      </Button>
    )
  }

  return (
    <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ py: 1, color: 'success.main' }}>
      <TaskAltIcon />
      <Typography variant="subtitle1" fontWeight={600}>You&apos;re set.</Typography>
    </Stack>
  )
}
