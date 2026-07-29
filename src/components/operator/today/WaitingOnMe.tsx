'use client'

import * as React from 'react'
import { Card, CardContent, Typography, Stack, Box, Button } from '@mui/material'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import type { TodayTransfer, TodayHandoff } from './types'

// CC-14 (NS-10): the "waiting on me" section — incoming pending transfers + handoffs
// that need this operator's Accept/Decline. Renders nothing when both are empty (the
// Today page decides ordering). Tapping routes to My Deployment where the existing
// accept/decline banners live.
interface Props {
  transfers: TodayTransfer[]
  handoffs: TodayHandoff[]
  onReview: () => void
}

export function WaitingOnMe({ transfers, handoffs, onReview }: Props) {
  const total = transfers.length + handoffs.length
  if (total === 0) return null

  return (
    <Card sx={{ border: '1px solid', borderColor: 'info.main' }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={1}>
          <SwapHorizIcon color="info" />
          <Typography variant="subtitle1" fontWeight={600}>
            Waiting on you ({total})
          </Typography>
        </Stack>
        <Stack spacing={0.75}>
          {transfers.map((t) => {
            const from = t.fromRig.operator?.name ?? 'another operator'
            const count = t.vehicles.length + t.items.length
            return (
              <Typography key={t.id} variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                Transfer (selected gear) from <strong>{from}</strong>{/* CC-33 (D22) */}
                {count > 0 ? ` · ${count} item${count === 1 ? '' : 's'}` : ''}
              </Typography>
            )
          })}
          {handoffs.map((h) => (
            <Typography key={h.id} variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
              Transfer (entire rig) from <strong>{h.fromOperatorName ?? 'another operator'}</strong>{/* CC-33 (D22) */}
            </Typography>
          ))}
        </Stack>
        <Box mt={1.5}>
          {/* CC-32 (3.2): 44px hit area (CC-23 precedent). */}
          <Button
            size="small"
            variant="contained"
            color="info"
            onClick={onReview}
            sx={{ minHeight: 44, minWidth: 44, fontSize: 16 }}
          >
            Review
          </Button>
        </Box>
      </CardContent>
    </Card>
  )
}
