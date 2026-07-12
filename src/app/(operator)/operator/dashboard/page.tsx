'use client'

import * as React from 'react'
import { Box, Typography, Card, CardContent, Button, Stack, Alert } from '@mui/material'
import ChecklistIcon from '@mui/icons-material/Checklist'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import AssignmentIcon from '@mui/icons-material/Assignment'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { StatusChip } from '@/components/shared/StatusChip'
import { AwaitingPickupCard, AwaitingPickupRequest } from '@/components/shared/AwaitingPickupCard'

const TERMINAL = new Set(['FULFILLED', 'CANCELLED', 'DENIED'])

interface RequestRow {
  id: string
  status: string
  label: string | null
  requestType: string
}

export default function OperatorDashboardPage() {
  const { user } = useAuth()
  const { pending, isOffline } = useOfflineQueue()
  const router = useRouter()
  // Hydration guard: getGreeting(), toLocaleDateString(), and user.name all produce
  // different output on the server (UTC clock, no SWR data) vs the client (local
  // clock, resolved user). Gate behind mounted so the server shell is a stable
  // placeholder — no React #418 mismatch, Sign Out onClick fires reliably (S7/S8).
  const [mounted, setMounted] = React.useState(false)
  const [openRequests, setOpenRequests] = React.useState<RequestRow[]>([])
  const [pickupRequests, setPickupRequests] = React.useState<AwaitingPickupRequest[]>([])

  React.useEffect(() => {
    setMounted(true)
    fetch('/api/deployment-requests')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        const all: RequestRow[] = d.data ?? []
        setOpenRequests(all.filter((r) => !TERMINAL.has(r.status)))
      })
      .catch(() => {})
    // CC-09: load awaiting-pickup reservations
    fetch('/api/deployment-requests/awaiting-pickup')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.data) setPickupRequests(d.data) })
      .catch(() => {})
  }, [])

  return (
    <Box>
      <Typography variant="h5" mb={0.5}>
        {mounted ? `Good ${getGreeting()}, ${user?.name?.split(' ')[0] ?? ''}` : ' '}
      </Typography>
      <Typography color="text.secondary" mb={3}>
        {mounted ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ' '}
      </Typography>

      {mounted && isOffline && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          You&apos;re offline. {pending > 0 ? `${pending} submission(s) will sync when reconnected.` : 'Submissions will queue until reconnected.'}
        </Alert>
      )}

      <Stack spacing={2}>
        {mounted && pickupRequests.map((req) => (
          <AwaitingPickupCard
            key={req.id}
            request={req}
            onPickUp={(r) => router.push(`/operator/my-deployment?fromRequestId=${r.id}`)}
          />
        ))}

        <Card sx={{ cursor: 'pointer' }} onClick={() => router.push('/operator/daily-check')}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ChecklistIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Box>
              <Typography variant="h6">Daily Vehicle Check</Typography>
              <Typography variant="body2" color="text.secondary">Submit your daily inspection form</Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ cursor: 'pointer' }} onClick={() => router.push('/operator/checkout')}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <SwapHorizIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Box>
              <Typography variant="h6">Check Out / Check In</Typography>
              <Typography variant="body2" color="text.secondary">Borrow or return equipment</Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ cursor: 'pointer' }} onClick={() => router.push('/operator/scan')}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <QrCodeScannerIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Box>
              <Typography variant="h6">Scan QR Code</Typography>
              <Typography variant="body2" color="text.secondary">Scan an asset tag to look up or act on equipment</Typography>
            </Box>
          </CardContent>
        </Card>

        {mounted && openRequests.length > 0 && (
          <Card sx={{ cursor: 'pointer' }} onClick={() => router.push('/operator/requests')}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                <Stack direction="row" alignItems="center" gap={2}>
                  <AssignmentIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                  <Box>
                    <Typography variant="h6">My Requests</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {openRequests.length} open request{openRequests.length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                </Stack>
                <Button
                  size="small"
                  onClick={(e) => { e.stopPropagation(); router.push('/operator/requests') }}
                >
                  View all
                </Button>
              </Stack>
              <Stack spacing={0.5}>
                {openRequests.slice(0, 3).map((req) => (
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
        )}
      </Stack>
    </Box>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
