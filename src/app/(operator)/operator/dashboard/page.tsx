'use client'

import * as React from 'react'
import { Box, Typography, Card, CardContent, Button, Stack, Alert } from '@mui/material'
import ChecklistIcon from '@mui/icons-material/Checklist'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'

export default function OperatorDashboardPage() {
  const { user } = useAuth()
  const { pending, isOffline } = useOfflineQueue()
  const router = useRouter()
  // Hydration guard: getGreeting(), toLocaleDateString(), and user.name all produce
  // different output on the server (UTC clock, no SWR data) vs the client (local
  // clock, resolved user). Gate behind mounted so the server shell is a stable
  // placeholder — no React #418 mismatch, Sign Out onClick fires reliably (S7/S8).
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <Box>
      <Typography variant="h5" mb={0.5}>
        {mounted ? `Good ${getGreeting()}, ${user?.name?.split(' ')[0] ?? ''}` : ' '}
      </Typography>
      <Typography color="text.secondary" mb={3}>
        {mounted ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ' '}
      </Typography>

      {mounted && isOffline && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          You're offline. {pending > 0 ? `${pending} submission(s) will sync when reconnected.` : 'Submissions will queue until reconnected.'}
        </Alert>
      )}

      <Stack spacing={2}>
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
