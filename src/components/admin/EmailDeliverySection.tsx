'use client'
import * as React from 'react'
import { formatDateTime } from '@/lib/utils'
import { Card, CardContent, Typography, Stack, Chip, Box, Button, CircularProgress } from '@mui/material'

interface EmailRow {
  id: string
  to: string
  subject: string
  kind: string
  status: string
  attempts: number
  lastError: string | null
  createdAt: string
}
interface Counts { status: string; n: number }

// FND-8: compact admin surface for outbound-email delivery. Defaults to failures
// so a swallowed shop/hub/invite/invoice/alert send is visible instead of vanishing.
export default function EmailDeliverySection() {
  const [rows, setRows] = React.useState<EmailRow[]>([])
  const [counts, setCounts] = React.useState<Counts[]>([])
  const [loading, setLoading] = React.useState(true)
  const [failedOnly, setFailedOnly] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/email-log${failedOnly ? '?status=FAILED' : ''}`)
      if (res.ok) {
        const d = await res.json()
        setRows(d.data ?? [])
        setCounts(d.counts ?? [])
      }
    } catch {
      /* leave the surface empty on failure */
    }
    setLoading(false)
  }, [failedOnly])

  React.useEffect(() => { load() }, [load])

  const countFor = (s: string) => counts.find((c) => c.status === s)?.n ?? 0
  const chipColor = (s: string): 'error' | 'warning' | 'success' =>
    s === 'FAILED' ? 'error' : s === 'SKIPPED' ? 'warning' : 'success'

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
          <Typography variant="h6" fontWeight={600}>Email delivery</Typography>
          <Button size="small" onClick={load}>Refresh</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" mb={1.5}>
          Last 7 days: {countFor('SENT')} sent · {countFor('FAILED')} failed · {countFor('SKIPPED')} skipped (sandbox).
        </Typography>
        <Stack direction="row" spacing={1} mb={1.5}>
          <Chip label="Failed only" size="small" color={failedOnly ? 'primary' : 'default'} onClick={() => setFailedOnly(true)} />
          <Chip label="All recent" size="small" color={!failedOnly ? 'primary' : 'default'} onClick={() => setFailedOnly(false)} />
        </Stack>
        {loading ? (
          <CircularProgress size={22} />
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {failedOnly ? 'No failed sends in the log.' : 'No email activity yet.'}
          </Typography>
        ) : (
          <Stack spacing={1}>
            {rows.map((r) => (
              <Box key={r.id} sx={{ borderLeft: 3, borderColor: `${chipColor(r.status)}.main`, pl: 1.5, py: 0.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip label={r.status} size="small" variant="outlined" color={chipColor(r.status)} />
                  <Typography variant="caption" color="text.secondary">{r.kind}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.subject}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  → {r.to} · {formatDateTime(r.createdAt)}{r.attempts > 1 ? ` · ${r.attempts} attempts` : ''}
                </Typography>
                {r.lastError && (
                  <Typography variant="caption" color="error.main" display="block">{r.lastError}</Typography>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
