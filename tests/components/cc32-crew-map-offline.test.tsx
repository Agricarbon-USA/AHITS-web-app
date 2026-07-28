import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SWRConfig } from 'swr'
import { CrewMapView } from '@/components/operator/CrewMapView'

// CC-32 (3.1): the crew map is now one thumb tap from Today, so it has to behave like
// every other cached field surface — last-cached pins under a "Data as of HH:MM" stamp
// when the network is gone, instead of the old red "Failed to load crew map" dead end.
// The service worker half (an EXACT '/api/map/crew' match in sw.ts, deliberately not
// startsWith('/api/map'), which would drag the ADMIN map endpoints into the operator
// cache) is asserted separately in cc32-sw-map-cache.test.ts.
//
// D2/D14: the "last-known, not live" framing is preserved verbatim and is asserted
// here so a future refactor cannot quietly reword it.

vi.mock('@/components/map/DeploymentMap', () => ({
  DeploymentMap: ({ pins, emptyMessage }: { pins: unknown[]; emptyMessage: string }) => (
    <div data-testid="map">{pins.length > 0 ? `${pins.length} pins` : emptyMessage}</div>
  ),
}))

const CREW = [
  { operatorId: 'o1', operatorName: 'Sam', lat: 41.6, lng: -83.5, bucket: 'TODAY', vehicleName: 'Truck 1' },
]

// A fresh SWR cache per test, so one test's data can't leak into the next.
const wrap = (ui: React.ReactElement) =>
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>)

beforeEach(() => { vi.useRealTimers() })
afterEach(() => { vi.unstubAllGlobals() })

describe('CC-32 (3.1) CrewMapView freshness treatment', () => {
  it('renders the crew pins and a "Data as of" stamp on a good read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: CREW }) } as Response)))
    wrap(<CrewMapView token="pk.test" />)

    expect(await screen.findByText('1 pins')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Data as of/)).toBeInTheDocument())
  })

  it('preserves the D2 "last-known, not live" framing verbatim', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: CREW }) } as Response)))
    wrap(<CrewMapView token="pk.test" />)

    expect(await screen.findByText(
      'Where teammates last checked in — handy for coordinating a gear swap or a hand. This is last-known, not live location.',
    )).toBeInTheDocument()
  })

  it('offline with a warm cache: shows the cached pins, NOT a red error', async () => {
    // The service worker answers /api/map/crew from ahits-field-reads while offline, so
    // the fetch still resolves — with yesterday's body. That is the whole point.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: CREW }) } as Response)))
    wrap(<CrewMapView token="pk.test" />)

    expect(await screen.findByText('1 pins')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load crew map')).not.toBeInTheDocument()
    expect(screen.getByText(/Data as of/)).toBeInTheDocument()
  })

  it('offline with NOTHING cached: still says so honestly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    wrap(<CrewMapView token="pk.test" />)

    expect(await screen.findByText('Failed to load crew map')).toBeInTheDocument()
  })
})
