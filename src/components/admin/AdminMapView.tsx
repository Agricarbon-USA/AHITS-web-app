'use client'

import * as React from 'react'
import { Box, Typography, Stack, Chip, TextField, MenuItem, Alert, CircularProgress } from '@mui/material'
import { DeploymentMap, type MapPin, type MapTrail } from '@/components/map/DeploymentMap'
import {
  RECENCY_COLOR,
  RECENCY_LABEL,
  type RigPosition,
  type TrailPoint,
} from '@/lib/deployment-map'
import { color } from '@/theme/tokens'

// CC-15 (D2): admin Deployment Map. Pins are each active rig's LATEST daily-check position
// ("last checked in"), coloured by recency; the optional trail is a selected rig's route
// history ("where it has been"). Nothing here is live position.

function pinFromRig(rig: RigPosition): MapPin {
  const lines = [
    RECENCY_LABEL[rig.bucket],
    rig.operatorName ? `Operator: ${rig.operatorName}` : null,
  ].filter(Boolean) as string[]
  return {
    id: rig.rigId,
    lng: rig.lng,
    lat: rig.lat,
    color: RECENCY_COLOR[rig.bucket],
    title: rig.vehicleName ?? 'Rig',
    lines,
    // Existing convention: the deployment drawer opens on ?operator=<id> (matches the
    // active rig by operator). Only linkable when the rig has a resolved operator.
    deepLinkHref: rig.operatorId ? `/admin/deployments?operator=${rig.operatorId}` : undefined,
    deepLinkLabel: 'Open deployment',
  }
}

export function AdminMapView({ token }: { token: string | null }) {
  const [pins, setPins] = React.useState<RigPosition[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [selectedRigId, setSelectedRigId] = React.useState('')
  const [trail, setTrail] = React.useState<MapTrail | undefined>(undefined)

  React.useEffect(() => {
    let active = true
    // Deep-link from the deployment drawer: /admin/map?rig=<rigId> pre-selects that rig's
    // route-history trail (the drawer "reaches" the trail transitively, per D12's pattern).
    const rigParam = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('rig')
      : null
    if (rigParam) setSelectedRigId(rigParam)
    fetch('/api/map/pins')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load map'))))
      .then((d) => { if (active) setPins(d.data ?? []) })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // Load the selected rig's route history (historical trail). Cleared when none selected.
  React.useEffect(() => {
    if (!selectedRigId) { setTrail(undefined); return }
    let active = true
    fetch(`/api/map/route-history?rigId=${encodeURIComponent(selectedRigId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load route history'))))
      .then((d) => {
        if (!active) return
        const points = (d.data as TrailPoint[]).map((p) => ({ lng: p.lng, lat: p.lat }))
        setTrail(points.length >= 2 ? { points } : undefined)
      })
      .catch(() => { if (active) setTrail(undefined) })
    return () => { active = false }
  }, [selectedRigId])

  const mapPins = React.useMemo(() => pins.map(pinFromRig), [pins])

  return (
    <Box maxWidth={1100}>
      <Typography variant="h5" mb={0.5}>Deployment Map</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Each pin is a deployed rig at its last daily-check location. Pick a rig to trace where it has been.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} mb={2}>
        <TextField
          select
          size="small"
          label="Route history"
          value={selectedRigId}
          onChange={(e) => setSelectedRigId(e.target.value)}
          sx={{ minWidth: 260 }}
          helperText="Trace one rig's check-in trail"
        >
          <MenuItem value="">None</MenuItem>
          {pins.map((p) => (
            <MenuItem key={p.rigId} value={p.rigId}>
              {p.vehicleName ?? 'Rig'}{p.operatorName ? ` · ${p.operatorName}` : ''}
            </MenuItem>
          ))}
        </TextField>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="caption" color="text.secondary">Recency:</Typography>
          <Chip size="small" label={RECENCY_LABEL.fresh} sx={{ bgcolor: RECENCY_COLOR.fresh, color: color.brandContrast }} />
          <Chip size="small" label={RECENCY_LABEL.aging} sx={{ bgcolor: RECENCY_COLOR.aging, color: color.brandContrast }} />
          <Chip size="small" label={RECENCY_LABEL.stale} sx={{ bgcolor: RECENCY_COLOR.stale, color: color.brandContrast }} />
        </Stack>
      </Stack>

      {loading ? (
        <Box sx={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <DeploymentMap
          token={token}
          pins={mapPins}
          trail={trail}
          height={520}
          emptyMessage="No location-bearing daily checks yet — pins appear as rigs check in with GPS."
        />
      )}
    </Box>
  )
}
