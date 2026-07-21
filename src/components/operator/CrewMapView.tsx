'use client'

import * as React from 'react'
import { Box, Typography, Alert, CircularProgress } from '@mui/material'
import { DeploymentMap, type MapPin } from '@/components/map/DeploymentMap'
import { RECENCY_COLOR, RECENCY_LABEL, type CrewPosition } from '@/lib/deployment-map'

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

export function CrewMapView({ token }: { token: string | null }) {
  const [positions, setPositions] = React.useState<CrewPosition[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let active = true
    fetch('/api/map/crew')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load crew map'))))
      .then((d) => { if (active) setPositions(d.data ?? []) })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const pins = React.useMemo(() => positions.map(pinFromCrew), [positions])

  return (
    <Box maxWidth={900}>
      <Typography variant="h5" mb={0.5}>Crew Map</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Where teammates last checked in — handy for coordinating a gear swap or a hand. This is last-known, not live location.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
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
