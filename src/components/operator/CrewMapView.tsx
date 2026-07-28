'use client'

import * as React from 'react'
import { Box, Stack, Typography, Alert, CircularProgress } from '@mui/material'
import { DeploymentMap, type MapPin } from '@/components/map/DeploymentMap'
import { RECENCY_COLOR, RECENCY_LABEL, type CrewPosition } from '@/lib/deployment-map'
import { useFreshList } from '@/hooks/useFreshList'
import { FreshnessIndicator } from '@/components/shared/FreshnessIndicator'

// CC-15 (D2): the operator crew map. Shows OTHER deployed operators' LAST-KNOWN positions
// (their most recent daily check) so the field can coordinate a gear swap or ask for help.
// Deliberately NOT live: these are attestation points, "last seen", never "where they are
// now". Zero new taps — it reads the checks operators already submit.

function pinFromCrew(pos: CrewPosition): MapPin {
  const lines = [
    RECENCY_LABEL[pos.bucket],
    pos.vehicleName ? `Rig: ${pos.vehicleName}` : null,
  ].filter(Boolean) as string[]
  return {
    id: pos.operatorId,
    lng: pos.lng,
    lat: pos.lat,
    color: RECENCY_COLOR[pos.bucket],
    title: pos.operatorName ?? 'Teammate',
    lines,
  }
}

// CC-32 (3.1): the plain fetch became useFreshList + FreshnessIndicator, matching every
// other cached field surface. With /api/map/crew now in the service worker's field-reads
// cache (sw.ts), an offline operator sees the LAST-CACHED pins under a "Data as of HH:MM"
// stamp instead of the old red "Failed to load crew map" dead end — which is the whole
// point of putting the map one thumb-tap away. The error alert is kept for the case where
// there is nothing cached at all, so a genuine first-run failure is still honest.
export function CrewMapView({ token }: { token: string | null }) {
  const { data, error, isValidating, isLoading, mutate, updatedAt } =
    useFreshList<{ data: CrewPosition[] }>('/api/map/crew')
  const hasCached = data != null

  // The `?? []` lives INSIDE the memo: as a separate binding it is a fresh array every
  // render, which would make the memo's dependency change every render (and defeat it).
  const pins = React.useMemo(() => (data?.data ?? []).map(pinFromCrew), [data])

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={0.5}>
        <Typography variant="h5">Crew Map</Typography>
        <FreshnessIndicator updatedAt={updatedAt} isValidating={isValidating} onRefresh={() => void mutate()} />
      </Stack>
      {/* D2/D14: this framing is PRESERVED VERBATIM — last-known, never live. */}
      <Typography variant="body2" color="text.secondary" mb={2}>
        Where teammates last checked in — handy for coordinating a gear swap or a hand. This is last-known, not live location.
      </Typography>

      {error && !hasCached && (
        <Alert severity="error" sx={{ mb: 2 }}>Failed to load crew map</Alert>
      )}

      {isLoading && !hasCached ? (
        <Box sx={{ height: 480, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <DeploymentMap
          token={token}
          pins={pins}
          height={480}
          emptyMessage="No teammates have checked in with location yet."
        />
      )}
    </Box>
  )
}
