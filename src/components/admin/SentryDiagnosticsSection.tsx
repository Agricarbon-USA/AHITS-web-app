'use client'
import * as React from 'react'
import * as Sentry from '@sentry/nextjs'
import { Card, CardContent, Typography, Stack, Button, Alert } from '@mui/material'

// CC-22: admin-only, manual verification that Sentry capture is wired end to
// end (no automated test exercises "an event actually reaches Sentry" — that's
// inherently an external-service check). Both buttons throw for real; this page
// is admin-gated (layout + requireAdmin/requireAuth on every underlying route),
// so it's not a public attack surface.
export default function SentryDiagnosticsSection() {
  const [error, setError] = React.useState<string | null>(null)

  const triggerServerError = async () => {
    setError(null)
    try {
      const res = await fetch('/api/debug/sentry-test')
      if (!res.ok) {
        setError(`Server route threw as expected (status ${res.status}). Check Sentry for the captured event.`)
      }
    } catch {
      setError('Request failed (network-level) — check Sentry for the captured event.')
    }
  }

  const triggerClientError = () => {
    // Deliberate uncaught throw — Sentry's browser SDK default integrations
    // (installed by SentryProvider.tsx's Sentry.init) capture this via the
    // window error listener. Not wrapped in try/catch on purpose.
    throw new Error('CC-22 Sentry test — deliberate uncaught client error')
  }

  const triggerClientCapture = () => {
    // Fallback path that doesn't rely on an actual uncaught throw reaching the
    // window error listener (React's dev overlay can intercept those) — proves
    // the SDK is initialized and able to send regardless.
    Sentry.captureException(new Error('CC-22 Sentry test — explicit captureException'))
    setError('Sent via Sentry.captureException — check Sentry for the captured event.')
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" fontWeight={600} mb={1}>Sentry diagnostics</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Manual verification only — these buttons throw real errors to confirm capture reaches
          Sentry. With no SENTRY_DSN configured, the errors still throw but nothing is sent.
        </Typography>
        <Stack direction="row" spacing={2} mb={2}>
          <Button variant="outlined" onClick={triggerServerError}>Trigger server error</Button>
          <Button variant="outlined" onClick={triggerClientError}>Trigger client error (throw)</Button>
          <Button variant="outlined" onClick={triggerClientCapture}>Trigger client error (captureException)</Button>
        </Stack>
        {error && <Alert severity="info">{error}</Alert>}
      </CardContent>
    </Card>
  )
}
