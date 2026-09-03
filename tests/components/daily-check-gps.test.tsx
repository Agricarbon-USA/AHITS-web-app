import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import OperatorDailyCheckPage from '@/app/(operator)/operator/daily-check/page'

// CC-15 (D2): GPS is captured once per daily check at buildPayload time and rides the
// (possibly queued) payload. These tests drive the real page — handleSubmit →
// captureLocation → buildPayload → mutate — and assert on the body handed to the offline
// queue. `useOfflineQueue.enqueue` stores that body VERBATIM (it JSON-serializes `body`
// on replay), so the body at the mutate boundary is the faithful proof the coords ride
// the queue: it covers the "coord dropped before enqueue" risk without needing an IDB
// backend (component tests never touch IndexedDB — see vitest.config.ui.ts).
//
// The non-negotiable behaviour under test: location NEVER blocks or fails a check —
// denied / dismissed / timed-out geolocation submits with no coords.

const { mutate, showToast } = vi.hoisted(() => ({ mutate: vi.fn(), showToast: vi.fn() }))

vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate, pending: 0, isOffline: false }),
}))
vi.mock('@/components/shared/useToast', () => ({ useToast: () => showToast }))

const jsonRes = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response)

// One active rig with one vehicle, so the page auto-selects it on mount.
function mockFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/deployments')) {
      return jsonRes([{ id: 'rig1', vehicles: [{ id: 'rv1', vehicle: { id: 'v1', name: 'Truck 1', type: 'TRUCK' } }] }])
    }
    if (url.startsWith('/api/checklist-templates')) return jsonRes({}) // no template → keep default all-"yes" list (pass)
    if (url.startsWith('/api/vehicles/')) return jsonRes({ data: { id: 'v1', name: 'Truck 1', type: 'TRUCK', odometer: 1000 } })
    return jsonRes({})
  })
}

const getCurrentPosition = vi.fn()

beforeEach(() => {
  mutate.mockReset().mockResolvedValue({ ok: true, queued: false, data: {} })
  showToast.mockReset()
  getCurrentPosition.mockReset()
  vi.stubGlobal('fetch', mockFetch())
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  // UXP-3 (3h): the page persists a draft to localStorage; jsdom's persists across the
  // file, so clear it or a prior test's check is restored into the next mount.
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Walk the 3-step stepper (vehicle auto-selected, all items default "yes" → Pass) and submit.
async function submitCheck() {
  // Wait until the deployments fetch resolves and the vehicle is selected/rendered.
  await screen.findByText('Truck 1')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))          // Vehicle & Date → Inspection
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))          // Inspection → Review
  fireEvent.click(screen.getByRole('button', { name: 'Submit Check' }))  // fires captureLocation()
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
  return mutate.mock.calls[0][0].body as Record<string, unknown>
}

describe('CC-15 daily-check GPS capture', () => {
  it('capture-with-permission: a granted fix rides the submitted payload', async () => {
    getCurrentPosition.mockImplementation((success: PositionCallback) =>
      success({ coords: { latitude: 41.6805, longitude: -83.5379, accuracy: 12 } } as GeolocationPosition))

    render(<OperatorDailyCheckPage />)
    const body = await submitCheck()

    expect(body).toMatchObject({ gpsLat: 41.6805, gpsLng: -83.5379, gpsAccuracy: 12 })
    // Submitted (not blocked): the success view renders.
    expect(await screen.findByRole('button', { name: 'Start New Check' })).toBeInTheDocument()
  })

  it('capture-denied-still-submits: a denied prompt submits with NO coords', async () => {
    getCurrentPosition.mockImplementation((_success: PositionCallback, error?: PositionErrorCallback) =>
      error?.({ code: 1, message: 'User denied Geolocation' } as GeolocationPositionError))

    render(<OperatorDailyCheckPage />)
    const body = await submitCheck()

    // The check submitted regardless, carrying no location fields.
    expect(body.gpsLat).toBeUndefined()
    expect(body.gpsLng).toBeUndefined()
    expect(body.gpsAccuracy).toBeUndefined()
    expect(await screen.findByRole('button', { name: 'Start New Check' })).toBeInTheDocument()
  })

  it('queued-offline-check-carries-coords: an offline (queued) submit still carries the fix', async () => {
    getCurrentPosition.mockImplementation((success: PositionCallback) =>
      success({ coords: { latitude: 41.6805, longitude: -83.5379, accuracy: 8 } } as GeolocationPosition))
    // Offline: mutate durably queues the write instead of reaching the server.
    mutate.mockResolvedValue({ ok: true, queued: true, data: null })

    render(<OperatorDailyCheckPage />)
    const body = await submitCheck()

    // The coords are in the body handed to the queue — they replay with the check.
    expect(body).toMatchObject({ gpsLat: 41.6805, gpsLng: -83.5379, gpsAccuracy: 8 })
    // And the operator sees the queued confirmation, not an error.
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info', message: expect.stringMatching(/queued/i) })))
  })
})

// UXP-3 (3a): GPS can never hold a check hostage. getCurrentPosition's own `timeout`
// bounds the FIX, not the permission UI — while the OS prompt sits unanswered the
// callback never fires at all, and the submit used to await it forever (nothing
// enqueued, "Submitting…" for good). A hard 8s ceiling now runs from the Submit tap.
// Real timers carry the page to the review step (where the warm fix starts); fake
// timers then own the ceiling, as tests/offline/useOfflineQueue.test.tsx does for
// the mutate timeout.
describe('UXP-3 (3a) the GPS ceiling', () => {
  const GPS_CEILING_MS = 8_000

  it('permission-limbo-enqueues-at-ceiling: a prompt that is never answered submits with no coords at 8s', async () => {
    getCurrentPosition.mockImplementation(() => { /* limbo: neither callback ever fires */ })

    render(<OperatorDailyCheckPage />)
    await screen.findByText('Truck 1')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Review: the warm fix starts here…
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1)) // …and will never resolve

    vi.useFakeTimers()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit Check' })) })

    // Inside the ceiling: still waiting on the fix, nothing handed to the queue.
    await act(async () => { await vi.advanceTimersByTimeAsync(GPS_CEILING_MS - 1_000) })
    expect(mutate).not.toHaveBeenCalled()

    // At the ceiling: the check goes out exactly once, with no location fields.
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(mutate).toHaveBeenCalledTimes(1)
    const body = mutate.mock.calls[0][0].body as Record<string, unknown>
    expect(Object.keys(body).filter((k) => k.startsWith('gps'))).toEqual([])
    expect(body).toMatchObject({ vehicleId: 'v1', passFail: true })

    vi.useRealTimers()
    expect(await screen.findByRole('button', { name: 'Start New Check' })).toBeInTheDocument()
    // Still one fix per check (D2) — the ceiling never re-requests.
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('slow-fix-inside-ceiling-still-rides: a fix that lands at 3s is on the body', async () => {
    // The fix takes 3s to arrive — well inside the 8s ceiling.
    getCurrentPosition.mockImplementation((success: PositionCallback) => {
      setTimeout(() => success({ coords: { latitude: 41.6805, longitude: -83.5379, accuracy: 15 } } as GeolocationPosition), 3_000)
    })

    render(<OperatorDailyCheckPage />)
    await screen.findByText('Truck 1')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    // Fake timers BEFORE the review step mounts, so the warm fix's 3s delay is on the
    // fake clock too (not a real 3s wait).
    vi.useFakeTimers()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Next' })) })
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit Check' })) })

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(mutate).not.toHaveBeenCalled() // the fix has not landed yet, the ceiling is far off
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0].body).toMatchObject({ gpsLat: 41.6805, gpsLng: -83.5379, gpsAccuracy: 15 })

    vi.useRealTimers()
    expect(await screen.findByRole('button', { name: 'Start New Check' })).toBeInTheDocument()
  })
})
