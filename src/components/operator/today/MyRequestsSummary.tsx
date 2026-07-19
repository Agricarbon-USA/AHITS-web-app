'use client'

import * as React from 'react'
import { Card, CardContent, Typography, Stack, Box, Button } from '@mui/material'
import AssignmentIcon from '@mui/icons-material/Assignment'
import { StatusChip } from '@/components/shared/StatusChip'
import type { TodayRequest } from './types'

// CC-14 (NS-10): the operator's open requests summary (top 3). Carried over from the
// old dashboard card, now fed from the Today aggregate. TERMINAL requests are filtered
// by the page before this renders.
interface Props {
  requests: TodayRequest[]
  onOpenRequests: () => void
}

export function MyRequestsSummary({ requests, onOpenRequests }: Props) {
  if (requests.length === 0) return null

  return (
    <Card sx={{ cursor: 'pointer' }} onClick={onOpenRequests}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Stack direction="row" alignItems="center" gap={2}>
            <AssignmentIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>My requests</Typography>
              <Typography variant="body2" color="text.secondary">
                {requests.length} open request{requests.length === 1 ? '' : 's'}
              </Typography>
            </Box>
          </Stack>
          <Button size="small" onClick={(e) => { e.stopPropagation(); onOpenRequests() }}>
            View all
          </Button>
        </Stack>
        <Stack spacing={0.5}>
          {requests.slice(0, 3).map((req) => (
            <Stack key={req.id} direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body2" noWrap sx={{ flex: 1, mr: 1 }}>
                {req.label ?? req.requestType.replace(/_/g, ' ')}
              </Typography>
              <StatusChip status={req.status} kind="request" />
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}
