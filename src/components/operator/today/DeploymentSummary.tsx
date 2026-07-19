'use client'

import * as React from 'react'
import { Card, CardContent, Typography, Stack, Box, Button } from '@mui/material'
import PlaceIcon from '@mui/icons-material/Place'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import type { TodayDeployment } from './types'

// CC-14 (NS-10): the day's deployment header — project + read-only site, with a
// jump to My Deployment for the full gear detail. Presentational; the site string is
// today's DailyCheck.site (read-only context, no editing here).
interface Props {
  deployment: TodayDeployment
  onOpenDeployment: () => void
}

export function DeploymentSummary({ deployment, onOpenDeployment }: Props) {
  const vehicleCount = deployment.vehicles.length
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">Today&apos;s deployment</Typography>
            <Typography variant="h6" lineHeight={1.2} sx={{ wordBreak: 'break-word' }}>
              {deployment.project?.name ?? deployment.label ?? 'Active deployment'}
            </Typography>
            {deployment.site && (
              <Stack direction="row" alignItems="center" spacing={0.5} mt={0.5} sx={{ color: 'text.secondary' }}>
                <PlaceIcon fontSize="small" />
                <Typography variant="body2">{deployment.site}</Typography>
              </Stack>
            )}
            <Stack direction="row" alignItems="center" spacing={0.5} mt={0.5} sx={{ color: 'text.secondary' }}>
              <LocalShippingIcon fontSize="small" />
              <Typography variant="body2">
                {vehicleCount} vehicle{vehicleCount === 1 ? '' : 's'}
              </Typography>
            </Stack>
          </Box>
          <Button size="small" onClick={onOpenDeployment} sx={{ flexShrink: 0 }}>
            My Deployment
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}
