'use client'

import * as React from 'react'
import { Box, Paper, Typography } from '@mui/material'

// UXP-3 (3d, builder's review step): a compact read-back at the top of the admin
// builder's final step — what is about to be started, on one card, before "Start
// Deployment". Pure presentation; the dialog derives every value from its own state.
// UXP-6 (6d): optionally lists the kit picks by name under the count, so after a
// scoped 409 recovery ("Unit 3 of Corer was taken") the admin sees exactly what is
// still packed without going back a step.

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
  /** One line per pick ("Sample bags ×2", "GPS unit · GPS-007"), listed under the count. */
  kitLines?: string[]
}

export function kitSummaryLabel(consumableCount: number, serializedCount: number, sourceHubName: string | null): string {
  if (consumableCount === 0 && serializedCount === 0) return 'Empty kit'
  const counts = `${consumableCount} consumable · ${serializedCount} serialized`
  return sourceHubName ? `${counts} · from ${sourceHubName}` : counts
}

function Row({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Box component="div" sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline', minWidth: 0 }}>
      <Typography component="dt" variant="caption" color="text.secondary"
        sx={{ flexShrink: 0, width: 72, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
        {children}
      </Box>
    </Box>
  )
}

export function DeploymentReviewSummary({
  operatorName, projectName, vehicleNames, consumableCount, serializedCount, sourceHubName, kitLines = [],
}: DeploymentReviewSummaryProps) {
  return (
    <Paper variant="outlined" component="dl" aria-label="Deployment summary"
      sx={{ m: 0, p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75, bgcolor: 'background.default' }}>
      <Row label="Operator" value={operatorName ?? '—'} />
      <Row label="Project" value={projectName ?? 'None'} />
      <Row label="Vehicles" value={vehicleNames.length > 0 ? vehicleNames.join(', ') : 'None'} />
      <Row label="Kit" value={kitSummaryLabel(consumableCount, serializedCount, sourceHubName)}>
        {kitLines.length > 0 && (
          <Box component="ul" aria-label="Kit contents" sx={{ m: 0, mt: 0.25, pl: 2 }}>
            {kitLines.map((line, idx) => (
              <Typography key={`${idx}-${line}`} component="li" variant="caption" color="text.secondary"
                sx={{ overflowWrap: 'anywhere' }}>
                {line}
              </Typography>
            ))}
          </Box>
        )}
      </Row>
    </Paper>
  )
}
