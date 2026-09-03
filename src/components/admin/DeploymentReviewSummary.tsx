'use client'

import * as React from 'react'
import { Box, Paper, Typography } from '@mui/material'

// UXP-3 (3d, builder's review step): a compact read-back at the top of the admin
// builder's final step — what is about to be started, on one card, before "Start
// Deployment". Pure presentation; the dialog derives every value from its own state.

export interface DeploymentReviewSummaryProps {
  operatorName: string | null
  projectName: string | null
  vehicleNames: string[]
  /** Distinct consumable items packed (one entry per item). */
  consumableCount: number
  /** Serialized units packed (one entry per unit). */
  serializedCount: number
  /** Hub the consumables draw from, when one is chosen. */
  sourceHubName: string | null
}

export function kitSummaryLabel(consumableCount: number, serializedCount: number, sourceHubName: string | null): string {
  if (consumableCount === 0 && serializedCount === 0) return 'Empty kit'
  const counts = `${consumableCount} consumable · ${serializedCount} serialized`
  return sourceHubName ? `${counts} · from ${sourceHubName}` : counts
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box component="div" sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline', minWidth: 0 }}>
      <Typography component="dt" variant="caption" color="text.secondary"
        sx={{ flexShrink: 0, width: 72, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  )
}

export function DeploymentReviewSummary({
  operatorName, projectName, vehicleNames, consumableCount, serializedCount, sourceHubName,
}: DeploymentReviewSummaryProps) {
  return (
    <Paper variant="outlined" component="dl" aria-label="Deployment summary"
      sx={{ m: 0, p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75, bgcolor: 'background.default' }}>
      <Row label="Operator" value={operatorName ?? '—'} />
      <Row label="Project" value={projectName ?? 'None'} />
      <Row label="Vehicles" value={vehicleNames.length > 0 ? vehicleNames.join(', ') : 'None'} />
      <Row label="Kit" value={kitSummaryLabel(consumableCount, serializedCount, sourceHubName)} />
    </Paper>
  )
}
