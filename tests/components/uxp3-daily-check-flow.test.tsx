import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import OperatorDailyCheckPage from '@/app/(operator)/operator/daily-check/page'
import { businessDate } from '@/lib/business-date'
import { saveDraft, loadDraft, draftKey, type DailyCheckDraftInput } from '@/lib/daily-check-draft'

// UXP-3 PR-A1 — daily-check trust items, driven through the real page (the CC-32
// flow-test mocks, extended with today's-checks list GET and a two-truck rig):
//
//   F-05  a validation reject lands ON the failing field: field-level error text,
//         the wizard jumps to the failing step, the field scrolls into view + focuses.
//   3h    a half-done check survives reload / OS kill / re-login via a localStorage
//         draft keyed operator+vehicle+businessDate, restored at mount with a notice.
//   3j    the preselect skips vehicles already checked today (mount AND "Start New
//         Check"), and an already-checked pick says the submit replaces today's.

const { mutate, showToast } = vi.hoisted(() => ({ mutate: vi.fn(), showToast: vi.fn() }))

vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate, pending: 0, isOffline: false }),
}))
vi.mock('@/components/shared/useToast', () => ({ useToast: () => showToast }))

const jsonRes = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response)

const VEHICLES = [
  { id: 'rv1', vehicle: { id: 'v1', name: 'Truck 1', type: 'TRUCK' } },
  { id: 'rv2', vehicle: { id: 'v2', name: 'Truck 2', type: 'TRUCK' } },
]

const TEMPLATE_ITEMS = [
  { key: 'tpl-brakes', label: 'ADMIN TEMPLATE — Brakes' },
  { key: 'tpl-lights', label: 'ADMIN TEMPLATE — Lights' },
]

interface FetchOpts {
  /** Vehicle ids the daily-check list GET reports as already checked today. */
  checked?: string[]
  /** Make the daily-check list GET reject (offline / 500). */
  checksReject?: boolean
}

let templateFetchCount = 0

function mockFetch({ checked = [], checksReject = false }: FetchOpts = {}) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/deployments')) return jsonRes([{ id: 'rig1', vehicles: VEHICLES }])
    if (url.startsWith('/api/daily-check?')) {
      if (checksReject) return Promise.reject(new Error('offline'))
      return jsonRes({ data: checked.map((vehicleId) => ({ id: `c-${vehicleId}`, vehicleId })), total: checked.length, page: 1, pageSize: 100 })
    }
    if (url.startsWith('/api/checklist-templates')) {
      templateFetchCount += 1
      return jsonRes({ items: TEMPLATE_ITEMS })
    }
    if (url.startsWith('/api/vehicles/')) {
      const id = url.slice('/api/vehicles/'.length)
      const v = VEHICLES.find((rv) => rv.vehicle.id === id)?.vehicle
      return v ? jsonRes({ data: { ...v, odometer: 1000, lastCheckSite: null } }) : Promise.resolve({ ok: false, json: async () => ({}) } as Response)
    }
    return jsonRes({})
  })
}

const getCurrentPosition = vi.fn()
const scrollIntoView = vi.fn()

beforeEach(() => {
  mutate.mockReset().mockResolvedValue({ ok: true, queued: false, data: {} })
  showToast.mockReset()
  getCurrentPosition.mockReset().mockImplementation((success: PositionCallback) =>
    success({ coords: { latitude: 41.68, longitude: -83.53, accuracy: 10 } } as GeolocationPosition))
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  templateFetchCount = 0
  window.localStorage.clear()
  window.history.replaceState({}, '', '/operator/daily-check')
  // jsdom has no scrollIntoView; the page optional-chains it, so stub to observe the call.
  scrollIntoView.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

const today = () => businessDate()
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }))
const combobox = () => screen.getByRole('combobox')

async function pickVehicle(name: string) {
  fireEvent.mouseDown(combobox())
  fireEvent.click(await screen.findByRole('option', { name }))
}

// A draft as the page would have saved it: on the admin template, one row failed
// with a note, on the inspection step.
function draftFor(over: Partial<DailyCheckDraftInput> = {}): DailyCheckDraftInput {
  return {
    vehicleId: 'v1',
    date: today(),
    step: 1,
    odometer: '1200',
    site: 'North 40',
    siteTouched: true,
    issues: '',
    issuesPrefilled: false,
    rowsTouched: true,
    checklist: [
      { key: 'tpl-brakes', label: 'ADMIN TEMPLATE — Brakes', value: 'no', note: 'Cracked lens' },
      { key: 'tpl-lights', label: 'ADMIN TEMPLATE — Lights', value: 'yes', note: '' },
    ],
    elapsedMs: 42_000,
    ...over,
  }
}

// ─── F-05 ────────────────────────────────────────────────────────────────────

describe('UXP-3 (F-05) a validation reject lands on the failing field', () => {
  it('Next on inspection with an unnoted "No": field error + helper, scrolled into view, focused; typing clears it', async () => {
    vi.stubGlobal('fetch', mockFetch())
    render(<OperatorDailyCheckPage />)

    await screen.findByText('Truck 1')
    next() // → Inspection
    await screen.findByText('ADMIN TEMPLATE — Brakes')
    fireEvent.click(screen.getAllByRole('button', { name: 'No' })[0])
    const note = await screen.findByPlaceholderText('Describe the issue…')
    expect(note).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText('Required — describe the issue')).not.toBeInTheDocument()

    next() // rejected — the top Alert string is unchanged…
    expect(await screen.findByText('Add a note for each item marked “No”.')).toBeInTheDocument()
    // …and the failing field itself now says so, is scrolled to, and holds focus.
    expect(note).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Required — describe the issue')).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(note).toHaveFocus()
    // Still on the inspection step (the reject never advanced).
    expect(screen.queryByRole('button', { name: 'Submit Check' })).not.toBeInTheDocument()

    fireEvent.change(note, { target: { value: 'Soft pedal' } })
    expect(note).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText('Required — describe the issue')).not.toBeInTheDocument()

    // The second "No" row, added AFTER the clean Next, is not pre-marked as an error.
    next() // → Review
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'No' })[1])
    const notes = await screen.findAllByPlaceholderText('Describe the issue…')
    expect(notes[1]).toHaveAttribute('aria-invalid', 'false')
  })

  it('Submit with a cleared fail summary: field error state, focused, and typing clears it', async () => {
    vi.stubGlobal('fetch', mockFetch())
    render(<OperatorDailyCheckPage />)

    await screen.findByText('Truck 1')
    next()
    await screen.findByText('ADMIN TEMPLATE — Brakes')
    fireEvent.click(screen.getAllByRole('button', { name: 'No' })[0])
    fireEvent.change(await screen.findByPlaceholderText('Describe the issue…'), { target: { value: 'Soft pedal' } })
    next() // → Review (summary prefilled from the note — CC-32 2.1)

    const summary = await screen.findByLabelText(/Issue summary/i)
    fireEvent.change(summary, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Check' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Describe the issue(s) that caused a fail')
    expect(summary).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(summary).toHaveFocus()
    expect(mutate).not.toHaveBeenCalled()

    fireEvent.change(summary, { target: { value: 'Brakes need a look' } })
    expect(summary).toHaveAttribute('aria-invalid', 'false')
  })

  it('Submit from a restored draft that still has an unnoted "No" jumps back to the row', async () => {
    vi.stubGlobal('fetch', mockFetch())
    // The operator got to review, came back, cleared the note, and the app was
    // killed at the inspection step — restore lands them there; but a draft saved
    // at step 2 with an empty note is the one way Submit can see a missing note.
    saveDraft(draftFor({
      step: 2,
      issues: 'Brakes: something',
      checklist: [
        { key: 'tpl-brakes', label: 'ADMIN TEMPLATE — Brakes', value: 'no', note: '' },
        { key: 'tpl-lights', label: 'ADMIN TEMPLATE — Lights', value: 'yes', note: '' },
      ],
    }))
    render(<OperatorDailyCheckPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Submit Check' }))
    expect(await screen.findByText('Add a note for each item marked “No”.')).toBeInTheDocument()
    const note = await screen.findByPlaceholderText('Describe the issue…')
    expect(note).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(note).toHaveFocus())
    expect(scrollIntoView).toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('a server 400 keeps the server message verbatim and never marks a field the client sees as valid', async () => {
    vi.stubGlobal('fetch', mockFetch())
    // The client mirrors the server's superRefine exactly, so a 400 the client cannot
    // explain (nothing missing here) must not invent a field error.
    mutate.mockResolvedValue({ ok: false, queued: false, error: 'Each item marked “No” must include a note describing the issue.', status: 400 })
    render(<OperatorDailyCheckPage />)

    await screen.findByText('Truck 1')
    next()
    await screen.findByText('ADMIN TEMPLATE — Brakes')
    fireEvent.click(screen.getAllByRole('button', { name: 'No' })[0])
    fireEvent.change(await screen.findByPlaceholderText('Describe the issue…'), { target: { value: 'Soft pedal' } })
    next() // → Review
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Check' }))

    expect(await screen.findByText('Each item marked “No” must include a note describing the issue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit Check' })).toBeInTheDocument() // still on review
    expect(screen.getByLabelText(/Issue summary/i)).toHaveAttribute('aria-invalid', 'false')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

// ─── 3h ──────────────────────────────────────────────────────────────────────

describe('UXP-3 (3h) drafts survive', () => {
  it('restores a same-day draft: notice, step, answers, odometer, site — and NO "newer checklist" notice', async () => {
    vi.stubGlobal('fetch', mockFetch())
    saveDraft(draftFor())
    render(<OperatorDailyCheckPage />)

    expect(await screen.findByText('Restored your in-progress check')).toBeInTheDocument()
    // Landed on the inspection step with the answers intact.
    expect(screen.getByDisplayValue('Cracked lens')).toBeInTheDocument()
    expect(screen.getByText('ADMIN TEMPLATE — Brakes')).toBeInTheDocument()
    expect(screen.getByText('Fail ✗')).toBeInTheDocument()
    // The template resolves for the SAME keys the draft was filled on — no false notice.
    await waitFor(() => expect(templateFetchCount).toBe(1))
    expect(screen.queryByText(/A newer checklist for this vehicle exists/i)).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Cracked lens')).toBeInTheDocument()

    // Back to step 0: odometer and site came back too.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByLabelText('Odometer (mi)')).toHaveValue(1200)
    expect(screen.getByLabelText('Site / location')).toHaveValue('North 40')
    expect(combobox()).toHaveTextContent('Truck 1')

    // Dismissible.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByText('Restored your in-progress check')).not.toBeInTheDocument())
  })

  it('a template that genuinely changed since the draft still raises the notice and keeps the answers', async () => {
    vi.stubGlobal('fetch', mockFetch())
    saveDraft(draftFor({
      checklist: [
        { key: 'old-brakes', label: 'OLD TEMPLATE — Brakes', value: 'no', note: 'Cracked lens' },
        { key: 'old-lights', label: 'OLD TEMPLATE — Lights', value: 'yes', note: '' },
      ],
    }))
    render(<OperatorDailyCheckPage />)

    await screen.findByText('Restored your in-progress check')
    expect(await screen.findByText(/A newer checklist for this vehicle exists/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Cracked lens')).toBeInTheDocument()
    expect(screen.queryByText('ADMIN TEMPLATE — Brakes')).not.toBeInTheDocument()
  })

  it('typing updates the stored draft', async () => {
    vi.stubGlobal('fetch', mockFetch())
    saveDraft(draftFor())
    render(<OperatorDailyCheckPage />)

    const note = await screen.findByDisplayValue('Cracked lens')
    fireEvent.change(note, { target: { value: 'Cracked lens — replaced' } })
    await waitFor(() => expect(loadDraft('v1', today())?.checklist[0].note).toBe('Cracked lens — replaced'))
    expect(loadDraft('v1', today())).toMatchObject({ step: 1, odometer: '1200', site: 'North 40', rowsTouched: true })
  })

  it('a fresh check is saved as the operator works (a pristine form stores nothing)', async () => {
    vi.stubGlobal('fetch', mockFetch())
    render(<OperatorDailyCheckPage />)

    await screen.findByText('Truck 1')
    expect(loadDraft('v1', today())).toBeNull() // pristine → nothing stored
    fireEvent.change(screen.getByLabelText('Odometer (mi)'), { target: { value: '500' } })
    await waitFor(() => expect(loadDraft('v1', today())).toMatchObject({ step: 0, odometer: '500', date: today() }))
    next()
    await waitFor(() => expect(loadDraft('v1', today())?.step).toBe(1))
    // Clearing the odometer on step 0 makes the form pristine again → the draft is dropped.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.change(await screen.findByLabelText('Odometer (mi)'), { target: { value: '' } })
    await waitFor(() => expect(loadDraft('v1', today())).toBeNull())
  })

  it('the time-to-complete counts the active time before the kill, not the interruption', async () => {
    vi.stubGlobal('fetch', mockFetch())
    // 42s of active form time before the kill; the interruption itself is unbounded and
    // must not ride the metric (CC-31 item 5 / charter metric 2 honesty).
    saveDraft(draftFor({ step: 2, issues: 'Brakes: Cracked lens', elapsedMs: 42_000 }))
    render(<OperatorDailyCheckPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Submit Check' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    const body = mutate.mock.calls[0][0].body as { durationMs?: number }
    expect(body.durationMs).toBeGreaterThanOrEqual(42_000)
    expect(body.durationMs).toBeLessThan(42_000 + 30_000)
  })

  it('submitting clears the draft', async () => {
    vi.stubGlobal('fetch', mockFetch())
    saveDraft(draftFor())
    render(<OperatorDailyCheckPage />)

    await screen.findByDisplayValue('Cracked lens')
    next() // → Review
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Check' }))
    expect(await screen.findByRole('button', { name: 'Start New Check' })).toBeInTheDocument()
    expect(loadDraft('v1', today())).toBeNull()
    expect(mutate.mock.calls[0][0].body).toMatchObject({ vehicleId: 'v1', passFail: false, odometer: 1200, site: 'North 40' })
  })

  it('a queued (offline) submit clears the draft too', async () => {
    vi.stubGlobal('fetch', mockFetch())
    mutate.mockResolvedValue({ ok: true, queued: true, data: null })
    saveDraft(draftFor())
    render(<OperatorDailyCheckPage />)

    await screen.findByDisplayValue('Cracked lens')
    next()
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Check' }))
    await screen.findByRole('button', { name: 'Start New Check' })
    expect(loadDraft('v1', today())).toBeNull()
  })

  it("yesterday's draft is purged, not restored", async () => {
    vi.stubGlobal('fetch', mockFetch())
    const yesterday = businessDate(new Date(Date.now() - 86_400_000))
    saveDraft(draftFor({ date: yesterday }))
    render(<OperatorDailyCheckPage />)

    await screen.findByText('Truck 1') // step 0, a fresh check
    expect(screen.queryByText('Restored your in-progress check')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(draftKey('v1', yesterday))).toBeNull()
  })

  it('?vehicleId=v2 (scan / redo deep-link) ignores v1\'s draft', async () => {
    vi.stubGlobal('fetch', mockFetch())
    window.history.replaceState({}, '', '/operator/daily-check?vehicleId=v2')
    saveDraft(draftFor({ vehicleId: 'v1' }))
    render(<OperatorDailyCheckPage />)

    await waitFor(() => expect(combobox()).toHaveTextContent('Truck 2'))
    expect(screen.queryByText('Restored your in-progress check')).not.toBeInTheDocument()
    expect(loadDraft('v1', today())).not.toBeNull() // left alone for a later plain visit
  })

  it('?vehicleId=v1 restores v1\'s own draft', async () => {
    vi.stubGlobal('fetch', mockFetch())
    window.history.replaceState({}, '', '/operator/daily-check?vehicleId=v1')
    saveDraft(draftFor({ vehicleId: 'v1' }))
    render(<OperatorDailyCheckPage />)

    expect(await screen.findByText('Restored your in-progress check')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Cracked lens')).toBeInTheDocument()
  })

  it('a restored draft wins over the checked-today preselect', async () => {
    vi.stubGlobal('fetch', mockFetch({ checked: [] })) // preselect alone would pick Truck 1
    saveDraft(draftFor({ vehicleId: 'v2', step: 0, odometer: '77', rowsTouched: false, siteTouched: false, site: '', checklist: [
      { key: 'tpl-brakes', label: 'ADMIN TEMPLATE — Brakes', value: 'yes', note: '' },
      { key: 'tpl-lights', label: 'ADMIN TEMPLATE — Lights', value: 'yes', note: '' },
    ] }))
    render(<OperatorDailyCheckPage />)

    await screen.findByText('Restored your in-progress check')
    await waitFor(() => expect(combobox()).toHaveTextContent('Truck 2'))
    expect(screen.getByLabelText('Odometer (mi)')).toHaveValue(77)
  })

  it('switching vehicles clears the previous vehicle\'s draft', async () => {
    vi.stubGlobal('fetch', mockFetch())
    render(<OperatorDailyCheckPage />)

    await screen.findByText('Truck 1')
    fireEvent.change(screen.getByLabelText('Odometer (mi)'), { target: { value: '500' } })
    await waitFor(() => expect(loadDraft('v1', today())).not.toBeNull())

    await pickVehicle('Truck 2')
    await waitFor(() => expect(loadDraft('v1', today())).toBeNull())
  })

  it('"Start New Check" clears the draft and the restore notice', async () => {
    vi.stubGlobal('fetch', mockFetch())
    saveDraft(draftFor())
    render(<OperatorDailyCheckPage />)

    await screen.findByDisplayValue('Cracked lens')
    next()
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Check' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start New Check' }))
    await screen.findByText('Complete before operating any vehicle.')
    expect(screen.queryByText('Restored your in-progress check')).not.toBeInTheDocument()
    expect(loadDraft('v1', today())).toBeNull()
    expect(loadDraft('v2', today())).toBeNull()
  })
})

// ─── 3j ──────────────────────────────────────────────────────────────────────

describe('UXP-3 (3j) the wrong-vehicle autopilot guard', () => {
  it('asks the daily-check list for today, and preselects the first vehicle WITHOUT a check', async () => {
    const fetchMock = mockFetch({ checked: ['v1'] })
    vi.stubGlobal('fetch', fetchMock)
    render(<OperatorDailyCheckPage />)

    await waitFor(() => expect(combobox()).toHaveTextContent('Truck 2'))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/daily-check\?date=\d{4}-\d{2}-\d{2}&pageSize=100$/))
    expect(fetchMock).toHaveBeenCalledWith(`/api/daily-check?date=${today()}&pageSize=100`)
    // Truck 2 has no check today — no "already filed" notice.
    expect(screen.queryByText(/You already filed a check/)).not.toBeInTheDocument()
  })

  it('every vehicle checked → no preselect and no error', async () => {
    vi.stubGlobal('fetch', mockFetch({ checked: ['v1', 'v2'] }))
    render(<OperatorDailyCheckPage />)

    // The rig has loaded (its options exist) but nothing is selected.
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    fireEvent.mouseDown(combobox())
    expect(await screen.findByRole('option', { name: 'Truck 2' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Truck 1' })) // choose deliberately…
    expect(combobox()).toHaveTextContent('Truck 1')
    // …and be told what that means.
    expect(await screen.findByText('You already filed a check for Truck 1 today — submitting replaces it.')).toBeInTheDocument()
    expect(screen.queryByRole('alert', { name: /error/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Select a vehicle')).not.toBeInTheDocument()
  })

  it('submit Truck 1, then "Start New Check" lands on Truck 2 (no refetch needed)', async () => {
    const fetchMock = mockFetch({ checked: [] })
    vi.stubGlobal('fetch', fetchMock)
    render(<OperatorDailyCheckPage />)

    await waitFor(() => expect(combobox()).toHaveTextContent('Truck 1'))
    next()
    next()
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Check' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start New Check' }))

    await waitFor(() => expect(combobox()).toHaveTextContent('Truck 2'))
    expect(screen.queryByText(/You already filed a check/)).not.toBeInTheDocument()
    // The checks list was fetched once, at mount — the local set carried the reset.
    expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/daily-check?'))).toHaveLength(1)
  })

  it('?vehicleId=v1 (scan / redo) keeps Truck 1 and shows the replaces-today notice', async () => {
    vi.stubGlobal('fetch', mockFetch({ checked: ['v1'] }))
    window.history.replaceState({}, '', '/operator/daily-check?vehicleId=v1')
    render(<OperatorDailyCheckPage />)

    await waitFor(() => expect(combobox()).toHaveTextContent('Truck 1'))
    expect(await screen.findByText('You already filed a check for Truck 1 today — submitting replaces it.')).toBeInTheDocument()

    // The notice stays off the inspection list and returns on review.
    next()
    await screen.findByText('ADMIN TEMPLATE — Brakes')
    expect(screen.queryByText(/You already filed a check/)).not.toBeInTheDocument()
    next()
    expect(await screen.findByText(/You already filed a check for Truck 1 today/)).toBeInTheDocument()
  })

  it('the checks fetch failing degrades to the old first-in-rig default', async () => {
    vi.stubGlobal('fetch', mockFetch({ checked: ['v1'], checksReject: true }))
    render(<OperatorDailyCheckPage />)

    await waitFor(() => expect(combobox()).toHaveTextContent('Truck 1'))
    expect(screen.queryByText(/You already filed a check/)).not.toBeInTheDocument()
  })

  it('a manual pick of an already-checked vehicle shows the notice; picking an unchecked one hides it', async () => {
    vi.stubGlobal('fetch', mockFetch({ checked: ['v1'] }))
    render(<OperatorDailyCheckPage />)

    await waitFor(() => expect(combobox()).toHaveTextContent('Truck 2'))
    await pickVehicle('Truck 1')
    expect(await screen.findByText(/You already filed a check for Truck 1 today/)).toBeInTheDocument()
    await pickVehicle('Truck 2')
    await waitFor(() => expect(screen.queryByText(/You already filed a check/)).not.toBeInTheDocument())
    expect(within(combobox()).getByText('Truck 2')).toBeInTheDocument()
  })
})
