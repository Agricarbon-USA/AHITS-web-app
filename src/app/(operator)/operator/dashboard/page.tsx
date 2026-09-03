'use client'

import * as React from 'react'
import { Box, Typography, Card, CardContent, Stack, Skeleton, Alert } from '@mui/material'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useFreshList } from '@/hooks/useFreshList'
import { FreshnessIndicator } from '@/components/shared/FreshnessIndicator'
import { EmptyState } from '@/components/ui/EmptyState'
import { AwaitingPickupCard } from '@/components/shared/AwaitingPickupCard'
import { DeploymentSummary } from '@/components/operator/today/DeploymentSummary'
import { VehicleChecks } from '@/components/operator/today/VehicleChecks'
import { TodayCheckSummary } from '@/components/operator/today/TodayCheckSummary' // UXP-3 (F-08)
import { WaitingOnMe } from '@/components/operator/today/WaitingOnMe'
import { MyRequestsSummary } from '@/components/operator/today/MyRequestsSummary'
import { TodayPrimaryAction } from '@/components/operator/today/TodayPrimaryAction'
import type { TodayData } from '@/components/operator/today/types'

const TERMINAL = new Set(['FULFILLED', 'CANCELLED', 'DENIED'])

// CC-14 (NS-10): the operator "Today" view — the wake/plan front door that replaces the
// static card menu. One aggregate read (/api/operator/today via useFreshList, so a
// reconnecting field device refreshes and shows "Data as of HH:MM"), composed into the
// operator's day: the day's one motion (Start daily check → You're set), time-sensitive
// pickups + waiting transfers/handoffs, the current deployment + per-vehicle checks, my
// open requests, and the always-there Scan utility. Renders a clean empty state when the
// operator isn't deployed. Behaviour is preserved: pickup → my-deployment?fromRequestId,
// scan card (CC-24, kept), requests → /operator/requests.
export default function OperatorTodayPage() {
  const { user } = useAuth()
  const router = useRouter()
  // Hydration guard: greeting + date differ server (UTC, no user) vs client (local,
  // resolved). Gate behind mounted so the shell is a stable placeholder (no React #418).
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => { setMounted(true) }, [])
  // UXP-3 (F-08): which checked vehicle's "Done" was tapped — opens today's check summary.
  const [viewCheckVehicleId, setViewCheckVehicleId] = React.useState<string | null>(null)

  const { data, error, isValidating, isLoading, mutate, updatedAt } =
    useFreshList<{ data: TodayData }>('/api/operator/today')
  const today = data?.data ?? null

  const deployment = today?.deployment ?? null
  const checkedVehicleIds = today?.checkedVehicleIds ?? []
  const vehicles = deployment?.vehicles ?? []
  const checked = new Set(checkedVehicleIds)
  const dueCount = vehicles.filter((v) => !checked.has(v.vehicleId)).length

  const openRequests = (today?.requests ?? []).filter((r) => !TERMINAL.has(r.status))
  const pickups = today?.awaitingPickup ?? []
  const transfers = today?.transfers ?? []
  const handoffs = today?.handoffs ?? []

  const nothingToShow =
    !deployment && pickups.length === 0 && transfers.length === 0 &&
    handoffs.length === 0 && openRequests.length === 0

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={2}>
        <Box>
          <Typography variant="h5" mb={0.25}>
            {mounted ? `Good ${getGreeting()}, ${user?.name?.split(' ')[0] ?? ''}` : ' '}
          </Typography>
          <Typography color="text.secondary">
            {mounted ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ' '}
          </Typography>
        </Box>
        <FreshnessIndicator updatedAt={updatedAt} isValidating={isValidating} onRefresh={() => void mutate()} />
      </Stack>

      {error && (
        /* CC-32 (2.9a): the old copy named a pull-down gesture that does not exist on
           an installed iOS PWA. Name the affordance that actually exists on this
           screen instead: the FreshnessIndicator's refresh arrow, directly above. */
        <Alert severity="error" sx={{ mb: 2 }}>
          Couldn&apos;t load your day. Tap the refresh arrow above, or check your connection.
        </Alert>
      )}

      {isLoading && !today ? (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={120} />
        </Stack>
      ) : (
        <Stack spacing={2}>
          {/* The day's one motion. */}
          {deployment && (
            <TodayPrimaryAction
              dueCount={dueCount}
              hasVehicles={vehicles.length > 0}
              onStartCheck={() => router.push('/operator/daily-check')}
            />
          )}

          {/* Time-sensitive: reservation holds ready to pick up. */}
          {pickups.map((req) => (
            <AwaitingPickupCard
              key={req.id}
              request={req}
              onPickUp={(r) => router.push(`/operator/my-deployment?fromRequestId=${r.id}`)}
            />
          ))}

          {/* Anything waiting on my Accept/Decline. */}
          <WaitingOnMe
            transfers={transfers}
            handoffs={handoffs}
            onReview={() => router.push('/operator/my-deployment')}
          />

          {/* The current deployment + per-vehicle checks. */}
          {deployment && (
            <>
              <DeploymentSummary deployment={deployment} onOpenDeployment={() => router.push('/operator/my-deployment')} />
              <VehicleChecks
                vehicles={vehicles}
                checkedVehicleIds={checkedVehicleIds}
                onCheck={(vehicleId) => router.push(`/operator/daily-check?vehicleId=${vehicleId}`)}
                onViewCheck={setViewCheckVehicleId}
              />
            </>
          )}

          {/* UXP-3 (F-08): today's check for a "Done" vehicle + Redo. The redo reuses the
              existing ?vehicleId= deep-link; the same-day upsert replaces today's row. */}
          <TodayCheckSummary
            vehicleId={viewCheckVehicleId}
            open={!!viewCheckVehicleId}
            onClose={() => setViewCheckVehicleId(null)}
            onRedo={(vehicleId) => router.push(`/operator/daily-check?vehicleId=${vehicleId}`)}
          />

          <MyRequestsSummary requests={openRequests} onOpenRequests={() => router.push('/operator/requests')} />

          {nothingToShow && !error && (
            /* CC-32 (2.9b): the old copy ("When you pick up a rig, your day shows up
               here") misdirected a SECOND-SEAT operator into starting a duplicate
               deployment — under the secondary-operator deferral, the crewmate's rig
               legitimately carries the checks. This is the honest reading of that
               state. The MODEL fix (getActiveRigForOperator) is its own pre-CC-17
               packet and is deliberately NOT touched here. */
            <EmptyState
              icon={<EventAvailableIcon fontSize="inherit" />}
              title="No deployment assigned to you yet"
              description="If you're riding with a crew today, your crewmate's rig carries the checks for now — see My Deployment for anything waiting on you. You can still scan equipment below."
            />
          )}

          {/* CC-24: the merged Scan / Check Out · In card — one card, one destination.
              Kept exactly (do NOT delete). The always-available field utility. */}
          <Card sx={{ cursor: 'pointer' }} onClick={() => router.push('/operator/scan')}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <QrCodeScannerIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              <Box>
                <Typography variant="h6">Scan / Check Out · In</Typography>
                <Typography variant="body2" color="text.secondary">Scan an asset tag to check out, check in, or look up equipment</Typography>
              </Box>
            </CardContent>
          </Card>

          {/* CC-14 slot: today's clock state (post-Time/Invoicing, P3-TIME / NS-11).
              Intentionally a code-level seam — no half-built clock UI ships here; the
              Time/Invoicing packet drops the clock-in/out + hours card in at this point. */}
        </Stack>
      )}
    </Box>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
