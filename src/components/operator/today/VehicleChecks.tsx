'use client'

import * as React from 'react'
import { Card, CardContent, Typography, Stack, Box, Button } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import { StatusChip } from '@/components/shared/StatusChip'
import type { TodayVehicle, TodayVehicleCheck } from './types'

// CC-14 (NS-10): per-vehicle daily-check state — done / due, one tap into the check.
// "Access notes" for the day are the read-only Vehicle.location / .notes shown as
// subtext (no such dedicated field exists; these are the operator's context). The
// "Check" button deep-links the daily-check form to that vehicle (?vehicleId=).
// UXP-3 (F-08): when `onViewCheck` is provided, the Done state is a tappable 44px
// button that opens today's check (TodayCheckSummary) — the inert chip otherwise.
// PR-5c (L-8): the rig's checks are shared by its crew. `checks` says who did each one
// and when; a check a crewmate filed is shown, not opened — the server lets an operator
// read and redo only their own check, so there is no button that would fail.
interface Props {
  vehicles: TodayVehicle[]
  checkedVehicleIds: string[]
  checks?: TodayVehicleCheck[]
  onCheck: (vehicleId: string) => void
  onViewCheck?: (vehicleId: string) => void
}

export const CREW_CHECK_NOTE = 'Only the person who filed a check can open or redo it.'

export function checkTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function VehicleChecks({ vehicles, checkedVehicleIds, checks, onCheck, onViewCheck }: Props) {
  if (vehicles.length === 0) return null
  const checked = new Set(checkedVehicleIds)
  const byVehicle = new Map((checks ?? []).map((c) => [c.vehicleId, c]))

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600} mb={1.5}>Daily checks</Typography>
        <Stack spacing={1}>
          {vehicles.map((rv) => {
            const isDone = checked.has(rv.vehicleId)
            const who = byVehicle.get(rv.vehicleId)
            // A crewmate's check is shown with its name and time, never opened (own only).
            const canOpen = !!onViewCheck && (!who || who.byMe)
            const accessNote = rv.vehicle.location || rv.vehicle.notes
            return (
              <Stack key={rv.id} direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                {isDone
                  ? <CheckCircleIcon fontSize="small" color="success" />
                  : <RadioButtonUncheckedIcon fontSize="small" color="disabled" />}
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{rv.vehicle.name}</Typography>
                  {isDone && who && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ wordBreak: 'break-word' }}>
                      {`Checked by ${who.byMe ? 'you' : who.operatorName} at ${checkTime(who.submittedAt)}`}
                      {!who.byMe && ` · ${CREW_CHECK_NOTE}`}
                    </Typography>
                  )}
                  {accessNote && (
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                      {accessNote}
                    </Typography>
                  )}
                </Box>
                {isDone ? (
                  canOpen && onViewCheck ? (
                    /* UXP-3 (F-08): StatusChip's badge mode cannot be tapped, so the
                       Done state becomes a 44px text button when there is somewhere
                       to go — today's check summary + Redo. */
                    <Button
                      size="small"
                      variant="text"
                      color="success"
                      onClick={() => onViewCheck(rv.vehicleId)}
                      aria-label={`View today's check for ${rv.vehicle.name}`}
                      sx={{ minHeight: 44, minWidth: 44, fontSize: 16, flexShrink: 0 }}
                    >
                      Done
                    </Button>
                  ) : (
                    <StatusChip label="Done" color="success" />
                  )
                ) : (
                  /* CC-32 (3.2): 44px hit area per the CC-23 daily-check toggle
                     precedent. Visual density stays compact; the target does not. */
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => onCheck(rv.vehicleId)}
                    sx={{ minHeight: 44, minWidth: 44, fontSize: 16, flexShrink: 0 }}
                  >
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
