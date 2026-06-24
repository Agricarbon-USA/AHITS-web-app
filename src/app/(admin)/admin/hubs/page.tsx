'use client'

import * as React from 'react'
import {
  Box, Typography, Card, CardContent, Stack, Chip, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Divider,
} from '@mui/material'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import EmailIcon from '@mui/icons-material/Email'

interface InboundUnit {
  statusLinkId: string
  unitId: string | null
  itemName: string
  serial: string | null
  state: 'ISSUED' | 'VIEWED' | 'ACTED'
  issuedAt: string
  viewedAt: string | null
  expiresAt: string
  discrepancy: { note: string | null; actorLabel: string; at: string } | null
}
interface HubGroup {
  hubId: string | null
  hubName: string
  location: string | null
  email: string | null
  units: InboundUnit[]
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

const STATE_CHIP: Record<InboundUnit['state'], { label: string; color: 'warning' | 'info' | 'error' }> = {
  ISSUED: { label: 'Awaiting receipt', color: 'warning' },
  VIEWED: { label: 'Viewed by hub', color: 'info' },
  ACTED: { label: 'Discrepancy', color: 'error' },
}

export default function AdminHubsPage() {
  const [data, setData] = React.useState<HubGroup[] | null>(null)
  const [counts, setCounts] = React.useState<{ totalPending: number; discrepancies: number }>({ totalPending: 0, discrepancies: 0 })

  React.useEffect(() => {
    fetch('/api/hubs/inbound')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setData(d.data ?? []); setCounts(d.counts ?? { totalPending: 0, discrepancies: 0 }) } })
      .catch(() => setData([]))
  }, [])

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h5">Hub Inbound</Typography>
        <Typography variant="body2" color="text.secondary">
          Equipment in transit to each hub awaiting receipt confirmation. Hubs with a contact email receive these links automatically.
        </Typography>
      </Box>

      {data && data.length > 0 && (
        <Stack direction="row" spacing={1} mb={2}>
          <Chip label={`${counts.totalPending} awaiting receipt`} color={counts.totalPending ? 'warning' : 'default'} />
          {counts.discrepancies > 0 && <Chip icon={<WarningAmberIcon />} label={`${counts.discrepancies} discrepancy${counts.discrepancies !== 1 ? '' : ''}`} color="error" />}
        </Stack>
      )}

      {data === null ? (
        <CircularProgress size={24} />
      ) : data.length === 0 ? (
        <Alert severity="success">Nothing inbound right now — every returned unit has been received.</Alert>
      ) : (
        <Stack spacing={3}>
          {data.map((hub) => (
            <Card key={hub.hubId ?? 'unassigned'}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1} flexWrap="wrap" useFlexGap>
                  <Box>
                    <Typography variant="h6" fontWeight={600}>{hub.hubName}</Typography>
                    {hub.location && <Typography variant="body2" color="text.secondary">{hub.location}</Typography>}
                  </Box>
                  {hub.hubId && (
                    hub.email
                      ? <Chip size="small" icon={<EmailIcon sx={{ fontSize: 15 }} />} label={hub.email} variant="outlined" />
                      : <Chip size="small" color="warning" variant="outlined" label="No contact email — share links manually" />
                  )}
                </Stack>
                <Divider sx={{ mb: 1 }} />
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 600, color: 'text.secondary', fontSize: 12 } }}>
                        <TableCell>ITEM</TableCell>
                        <TableCell>SERIAL</TableCell>
                        <TableCell>STATUS</TableCell>
                        <TableCell align="right">SENT</TableCell>
                        <TableCell align="right">EXPIRES</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {hub.units.map((u) => (
                        <TableRow key={u.statusLinkId} sx={{ '&:last-child td': { border: 0 } }}>
                          <TableCell>
                            <Typography variant="body2">{u.itemName}</Typography>
                            {u.discrepancy && (
                              <Typography variant="caption" color="error">
                                {u.discrepancy.actorLabel}: {u.discrepancy.note || 'reported a discrepancy'}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell><Typography variant="body2" color="text.secondary">{u.serial ?? '—'}</Typography></TableCell>
                          <TableCell><Chip size="small" label={STATE_CHIP[u.state].label} color={STATE_CHIP[u.state].color} variant={u.state === 'ACTED' ? 'filled' : 'outlined'} /></TableCell>
                          <TableCell align="right"><Typography variant="body2" color="text.secondary">{fmtDate(u.issuedAt)} · {daysAgo(u.issuedAt)}d ago</Typography></TableCell>
                          <TableCell align="right"><Typography variant="body2" color={new Date(u.expiresAt).getTime() < Date.now() ? 'error' : 'text.secondary'}>{fmtDate(u.expiresAt)}</Typography></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  )
}
