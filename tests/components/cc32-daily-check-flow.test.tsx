import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import OperatorDailyCheckPage from '@/app/(operator)/operator/daily-check/page'

// CC-32 PR-2 — the daily-check flow items, driven through the real page.
//
//   (2.5) is the ANTAGONIST-SEAT item and gets the two races it demands:
//         (a) reset-then-same-vehicle — handleReset re-seeds DEFAULT_CHECKLIST and
//             re-selects the same vehicle, so [vehicleId, selectedVehicleType] were
//             both unchanged and the template effect never re-fired. Check #2 of the
//             day silently ran the built-in 16 items instead of the admin template.
//             Fixed with a FETCH-NONCE in the effect key (bumped by handleReset).
//         (b) late-resolve-after-touch — a template arriving after the operator has
//             started answering must NOT wipe their answers (the FND-35 family; the
//             scan path's ?vehicleId= race is the reproducible case). Guarded by a
//             pristine predicate; touched → answers kept + a dismissible notice.
//   (2.1) the issue summary is seeded from the per-item notes, once, never over a
//         summary the operator typed.
//   (2.2) the site is pre-filled from the vehicle GET's additive lastCheckSite.
//   (2.6) the GPS fix is warmed when the review step mounts, not at submit.

const { mutate, showToast } = vi.hoisted(() => ({ mutate: vi.fn(), showToast: vi.fn() }))

vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate, pending: 0, isOffline: false }),
}))
vi.mock('@/components/shared/useToast', () => ({ useToast: () => showToast }))

const jsonRes = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response)

const RIG = [{ id: 'rig1', vehicles: [{ id: 'rv1', vehicle: { id: 'v1', name: 'Truck 1', type: 'TRUCK' } }] }]

// The admin-configured template — deliberately NOT the built-in 16 items, so
// "did the template win?" is a single unambiguous assertion.
const TEMPLATE_ITEMS = [
  { key: 'tpl-brakes', label: 'ADMIN TEMPLATE — Brakes' },
  { key: 'tpl-lights', label: 'ADMIN TEMPLATE — Lights' },
]

interface FetchOpts {
  /** Resolve the checklist-template GET only when this is released (the late-resolve race). */
  deferTemplate?: boolean
  lastCheckSite?: string | null
}

let releaseTemplate: (() => void) | null = null
let templateFetchCount = 0

function mockFetch({ deferTemplate = false, lastCheckSite = null }: FetchOpts = {}) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/deployments')) return jsonRes(RIG)
    if (url.startsWith('/api/checklist-templates')) {
      templateFetchCount += 1
      const payload = { items: TEMPLATE_ITEMS }
      if (!deferTemplate) return jsonRes(payload)
      return new Promise<Response>((resolve) => {
        releaseTemplate = () => resolve({ ok: true, json: async () => payload } as Response)
      })
    }
    if (url.startsWith('/api/vehicles/')) {
      return jsonRes({ data: { id: 'v1', name: 'Truck 1', type: 'TRUCK', odometer: 1000, lastCheckSite } })
    }
    return jsonRes({})
  })
}

const getCurrentPosition = vi.fn()

beforeEach(() => {
  mutate.mockReset().mockResolvedValue({ ok: true, queued: false, data: {} })
  showToast.mockReset()
  getCurrentPosition.mockReset().mockImplementation((success: PositionCallback) =>
    success({ coords: { latitude: 41.68, longitude: -83.53, accuracy: 10 } } as GeolocationPosition))
  releaseTemplate = null
  templateFetchCount = 0
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
})

afterEach(() => { vi.unstubAllGlobals() })

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }))

// The checklist rows only render on the Inspection step, so every "which template
// won?" assertion has to get there first. Waits for the vehicle to be auto-selected.
async function gotoInspection() {
  await screen.findByText('Truck 1')
  next()
}

describe('CC-32 (2.5a) reset-then-same-vehicle re-resolves the admin template', () => {
  it('check #2 of the day runs the ADMIN TEMPLATE, not the built-in default list', async () => {
    vi.stubGlobal('fetch', mockFetch())
    render(<OperatorDailyCheckPage />)

    // Check #1 — the template resolves and its items render on the inspection step.
    await gotoInspection()
    await screen.findByText('ADMIN TEMPLATE — Brakes')
    next() // Inspection → Review
    fireEvent.click(screen.getByRole('button', { name: 'Submit Check' }))

    // "Start New Check" on the SAME vehicle — the pre-CC-32 bug: vehicleId and the
    // vehicle type are both unchanged, so without the nonce the effect never re-fires
    // and the operator silently gets DEFAULT_DAILY_CHECKLIST for the rest of the day.
    const restart = await screen.findByRole('button', { name: 'Start New Check' })
    const fetchesBefore = templateFetchCount
    fireEvent.click(restart)

    await waitFor(() => expect(templateFetchCount).toBeGreaterThan(fetchesBefore))
    next() // → Inspection
    expect(await screen.findByText('ADMIN TEMPLATE — Brakes')).toBeInTheDocument()
    expect(screen.getByText('ADMIN TEMPLATE — Lights')).toBeInTheDocument()
  })
})

describe('CC-32 (2.5b) a LATE template never wipes answers already given', () => {
  it('keeps the touched answers and shows the dismissible notice instead', async () => {
    vi.stubGlobal('fetch', mockFetch({ deferTemplate: true }))
    render(<OperatorDailyCheckPage />)

    // The template is still in flight, so the built-in default list is on screen.
    await gotoInspection() // → Inspection (default items)
    const noButtons = await screen.findAllByRole('button', { name: 'No' })
    fireEvent.click(noButtons[0]) // ← the operator answers. The form is no longer pristine.

    const noteField = await screen.findByPlaceholderText('Describe the issue…')
    fireEvent.change(noteField, { target: { value: 'Cracked lens' } })

    // NOW the template lands. Pre-CC-32 this replaced the whole checklist and the
    // answer + note vanished with it.
    await waitFor(() => expect(releaseTemplate).not.toBeNull())
    releaseTemplate!()

    expect(await screen.findByText(/A newer checklist for this vehicle exists/i)).toBeInTheDocument()
    // Their work survived: the note is still there, and the template did NOT take over.
    expect(screen.getByDisplayValue('Cracked lens')).toBeInTheDocument()
    expect(screen.queryByText('ADMIN TEMPLATE — Brakes')).not.toBeInTheDocument()
  })

  it('applies the template silently when the form is still pristine', async () => {
    vi.stubGlobal('fetch', mockFetch({ deferTemplate: true }))
    render(<OperatorDailyCheckPage />)

    await screen.findByText('Truck 1') // still on step 0, nothing touched
    await waitFor(() => expect(releaseTemplate).not.toBeNull())
    // Let the resolve settle BEFORE tapping Next: `next()` marks the form past step 0,
    // and the predicate is deliberately read inside the fetch callback.
    await act(async () => { releaseTemplate!() })

    next()
    expect(await screen.findByText('ADMIN TEMPLATE — Brakes')).toBeInTheDocument()
    expect(screen.queryByText(/A newer checklist for this vehicle exists/i)).not.toBeInTheDocument()
  })
})

describe('CC-32 (2.1) the issue summary is seeded from the per-item notes', () => {
  it('prefills "<item label>: <note>" per line, and stays editable', async () => {
    vi.stubGlobal('fetch', mockFetch())
    render(<OperatorDailyCheckPage />)

    await gotoInspection()
    await screen.findByText('ADMIN TEMPLATE — Brakes')
    fireEvent.click(screen.getAllByRole('button', { name: 'No' })[0])
    fireEvent.change(await screen.findByPlaceholderText('Describe the issue…'),
      { target: { value: 'Soft pedal' } })
    next() // → Review

    const summary = await screen.findByLabelText(/Issue summary/i)
    expect(summary).toHaveValue('ADMIN TEMPLATE — Brakes: Soft pedal')

    // Editable after prefill.
    fireEvent.change(summary, { target: { value: 'Soft pedal — topped up fluid' } })
    expect(summary).toHaveValue('Soft pedal — topped up fluid')
  })

  it('never overwrites a summary the operator typed, even after Back → Next', async () => {
    vi.stubGlobal('fetch', mockFetch())
    render(<OperatorDailyCheckPage />)

    await gotoInspection()
    await screen.findByText('ADMIN TEMPLATE — Brakes')
    fireEvent.click(screen.getAllByRole('button', { name: 'No' })[0])
    fireEvent.change(await screen.findByPlaceholderText('Describe the issue…'),
      { target: { value: 'Soft pedal' } })
    next()

    const summary = await screen.findByLabelText(/Issue summary/i)
    fireEvent.change(summary, { target: { value: 'MY OWN WORDS' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    next()

    expect(await screen.findByLabelText(/Issue summary/i)).toHaveValue('MY OWN WORDS')
  })
})

describe('CC-32 (2.2) the site is pre-filled from the last check on this vehicle', () => {
  it('seeds the empty site field with lastCheckSite', async () => {
    vi.stubGlobal('fetch', mockFetch({ lastCheckSite: 'North 40 — Gate B' }))
    render(<OperatorDailyCheckPage />)

    const site = await screen.findByLabelText('Site / location')
    await waitFor(() => expect(site).toHaveValue('North 40 — Gate B'))
  })

  it('leaves the field empty when the vehicle has no prior site', async () => {
    vi.stubGlobal('fetch', mockFetch({ lastCheckSite: null }))
    render(<OperatorDailyCheckPage />)

    await screen.findByText('Truck 1')
    expect(await screen.findByLabelText('Site / location')).toHaveValue('')
  })

  // The trap this one guards: the fetch only seeds an EMPTY field, so an untyped
  // prefill left in place across a vehicle switch would file vehicle B's check under
  // vehicle A's site — wrong data that nobody typed and no cue to notice it.
  it('does NOT carry one vehicle\'s prefilled site into another vehicle\'s check', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/deployments')) {
        return jsonRes([{ id: 'rig1', vehicles: [
          { id: 'rv1', vehicle: { id: 'v1', name: 'Truck 1', type: 'TRUCK' } },
          { id: 'rv2', vehicle: { id: 'v2', name: 'Truck 2', type: 'TRUCK' } },
        ] }])
      }
      if (url.startsWith('/api/checklist-templates')) return jsonRes({ items: TEMPLATE_ITEMS })
      if (url.startsWith('/api/vehicles/v2')) return jsonRes({ data: { id: 'v2', lastCheckSite: 'South Pivot' } })
      if (url.startsWith('/api/vehicles/')) return jsonRes({ data: { id: 'v1', lastCheckSite: 'North 40 — Gate B' } })
      return jsonRes({})
    }))
    render(<OperatorDailyCheckPage />)

    const site = await screen.findByLabelText('Site / location')
    await waitFor(() => expect(site).toHaveValue('North 40 — Gate B')) // vehicle 1's site

    // Switch to vehicle 2 — its own last site must win, not vehicle 1's leftover.
    fireEvent.mouseDown(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByRole('option', { name: 'Truck 2' }))
    await waitFor(() => expect(site).toHaveValue('South Pivot'))
  })

  it('never overwrites a site the operator typed', async () => {
    vi.stubGlobal('fetch', mockFetch({ lastCheckSite: 'North 40 — Gate B' }))
    render(<OperatorDailyCheckPage />)

    const site = await screen.findByLabelText('Site / location')
    fireEvent.change(site, { target: { value: 'South Pivot' } })
    await waitFor(() => expect(site).toHaveValue('South Pivot'))
  })
})

describe('CC-32 (2.6) the GPS fix is warmed on the review step, not at submit', () => {
  it('captures once when review mounts, and the submit still carries the coords', async () => {
    vi.stubGlobal('fetch', mockFetch())
    render(<OperatorDailyCheckPage />)

    await gotoInspection()
    await screen.findByText('ADMIN TEMPLATE — Brakes')
    expect(getCurrentPosition).not.toHaveBeenCalled() // not yet — the prompt has not fired
    next() // → Review: this is where the OS prompt now fires

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Submit Check' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))

    // Still exactly ONE fix per check (D2), and it rides the payload.
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0].body).toMatchObject({ gpsLat: 41.68, gpsLng: -83.53 })
  })
})
