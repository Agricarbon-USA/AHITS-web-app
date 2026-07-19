'use client'

import * as React from 'react'
import { Card, CardContent, Typography, Stack, Box, Button } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import { StatusChip } from '@/components/shared/StatusChip'
import type { TodayVehicle } from './types'

// CC-14 (NS-10): per-vehicle daily-check state — done / due, one tap into the check.
// "Access notes" for the day are the read-only Vehicle.location / .notes shown as
// subtext (no such dedicated field exists; these are the operator's context). The
// "Check" button deep-links the daily-check form to that vehicle (?vehicleId=).
interface Props {
  vehicles: TodayVehicle[]
  checkedVehicleIds: string[]
  onCheck: (vehicleId: string) => void
}

export function VehicleChecks({ vehicles, checkedVehicleIds, onCheck }: Props) {
  if (vehicles.length === 0) return null
  const checked = new Set(checkedVehicleIds)

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600} mb={1.5}>Daily checks</Typography>
        <Stack spacing={1}>
          {vehicles.map((rv) => {
            const isDone = checked.has(rv.vehicleId)
            const accessNote = rv.vehicle.location || rv.vehicle.notes
            return (
              <Stack key={rv.id} direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                {isDone
                  ? <CheckCircleIcon fontSize="small" color="success" />
                  : <RadioButtonUncheckedIcon fontSize="small" color="disabled" />}
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{rv.vehicle.name}</Typography>
                  {accessNote && (
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                      {accessNote}
                    </Typography>
                  )}
                </Box>
                {isDone ? (
                  <StatusChip label="Done" color="success" />
                ) : (
                  <Button size="small" variant="outlined" onClick={() => onCheck(rv.vehicleId)}>
                    Check
                  </Button>
                )}
              </Stack>
            )
          })}
        </Stack>
      </CardContent>
    </Card>
  )
}
