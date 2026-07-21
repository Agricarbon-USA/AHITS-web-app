'use client'

import * as React from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Map as MbMap, Marker as MbMarker } from 'mapbox-gl'
import { Box, Typography } from '@mui/material'
import { color } from '@/theme/tokens'

// CC-15 (D2): a presentational map of ATTESTATION points — pins are "where a rig last
// checked in", the trail is "where a rig has been". There is NO live position anywhere in
// here: no watchPosition, no polling, no geolocation. Everything is passed in as props
// derived from submitted daily checks. Keep the copy historical.

export interface MapPin {
  id: string
  lng: number
  lat: number
  color: string
  title: string
  /** Popup detail lines (e.g. "Checked today", operator name). */
  lines?: string[]
  /** Optional in-app deep link rendered in the popup (e.g. the deployment drawer). */
  deepLinkHref?: string
  deepLinkLabel?: string
}

export interface MapTrail {
  points: { lng: number; lat: number }[]
  color?: string
}

interface DeploymentMapProps {
  /** Server-supplied Mapbox token (never NEXT_PUBLIC_ — passed as a prop from a server component). */
  token: string | null | undefined
  pins: MapPin[]
  trail?: MapTrail
  height?: number
  emptyMessage?: string
}

// Popup content is built from DB-derived strings (vehicle/operator names), so every
// interpolated value MUST be escaped before it reaches setHTML — otherwise a crafted name
// is stored XSS in the map popup.
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

function popupHtml(pin: MapPin): string {
  const lines = (pin.lines ?? []).map((l) => `<div style="color:${color.inkSoft};font-size:12px">${esc(l)}</div>`).join('')
  const link = pin.deepLinkHref
    ? `<div style="margin-top:6px"><a href="${esc(pin.deepLinkHref)}" style="color:${color.brand};font-size:12px;font-weight:600;text-decoration:none">${esc(pin.deepLinkLabel ?? 'Open')} →</a></div>`
    : ''
  return `<div style="font-family:system-ui,sans-serif;min-width:140px">`
    + `<div style="font-weight:700;font-size:13px;margin-bottom:2px">${esc(pin.title)}</div>`
    + lines + link + `</div>`
}

/**
 * Renders a Mapbox GL map of the supplied pins (+ optional historical trail). mapbox-gl is
 * dynamically imported inside the effect so its browser-only code never runs during the
 * server prerender of this client component. Degrades to a clear "map unavailable" panel
 * when the token is absent, so a missing MAPBOX_TOKEN secret never blanks the page.
 */
export function DeploymentMap({ token, pins, trail, height = 480, emptyMessage }: DeploymentMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!token || !containerRef.current) return
    let cancelled = false
    let map: MbMap | undefined
    let markers: MbMarker[] = []

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return
      mapboxgl.accessToken = token
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: pins[0] ? [pins[0].lng, pins[0].lat] : [-98.5, 39.8], // continental-US fallback
        zoom: pins[0] ? 9 : 3,
      })
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        if (!map) return
        // Historical trail (per-rig "where has this rig been") — a simple point sequence.
        if (trail && trail.points.length >= 2) {
          map.addSource('rig-trail', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: trail.points.map((p) => [p.lng, p.lat]) },
            },
          })
          map.addLayer({
            id: 'rig-trail-line',
            type: 'line',
            source: 'rig-trail',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': trail.color ?? color.ink, 'line-width': 3, 'line-opacity': 0.8 },
          })
        }

        for (const pin of pins) {
          const el = document.createElement('div')
          el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${pin.color};`
            + `border:2px solid ${color.brandContrast};box-shadow:0 0 0 1px rgba(0,0,0,0.35);cursor:pointer`
          const marker = new mapboxgl.Marker(el)
            .setLngLat([pin.lng, pin.lat])
            .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(popupHtml(pin)))
            .addTo(map)
          markers.push(marker)
        }

        // Frame everything (pins + trail) when there's more than one point.
        const coords: [number, number][] = [
          ...pins.map((p) => [p.lng, p.lat] as [number, number]),
          ...(trail?.points.map((p) => [p.lng, p.lat] as [number, number]) ?? []),
        ]
        if (coords.length >= 2) {
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new mapboxgl.LngLatBounds(coords[0], coords[0]),
          )
          map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 })
        }
      })
    })

    return () => {
      cancelled = true
      markers.forEach((m) => m.remove())
      map?.remove()
    }
  }, [token, pins, trail])

  if (!token) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: 2, p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Map unavailable — the Mapbox token isn’t configured for this environment.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ position: 'relative' }}>
      {pins.length === 0 && (
        <Box sx={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <Typography variant="body2" color="text.secondary" sx={{ bgcolor: 'background.paper', px: 1.5, py: 0.5, borderRadius: 1, boxShadow: 1 }}>
            {emptyMessage ?? 'No location-bearing checks yet.'}
          </Typography>
        </Box>
      )}
      <Box ref={containerRef} sx={{ height, width: '100%', borderRadius: 2, overflow: 'hidden' }} />
    </Box>
  )
}
