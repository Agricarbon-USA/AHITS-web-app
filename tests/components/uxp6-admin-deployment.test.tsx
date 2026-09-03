import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// UXP-6 (6d): the admin deployment builder on the one create/edit grammar, and the
// three data-loss traps around it (plan §1.2):
//  - EntityFormDialog: Enter = Next, "Start Deployment" (D11) on the last step, Back as
//    the secondary action, "* required" legend, no "(optional)" labels, dirty wizard →
//    "Discard changes?" on backdrop / Esc / hardware Back.
//  - T1: a 409 drops ONLY the picks whose unit/vehicle is gone after a refetch — named
//    in the form error; consumables and unaffected units stay. An operator-has-active-
//    rig 409 drops nothing.
//  - T2: pickers refetch after every 409 and every successful create.
//  - Success: "Deployment started for <operator>" with an Open action into the drawer.

// Same spy-mock as EntityFormDialog.test.tsx: the guard's callback IS the hardware Back.
const historyGuard = vi.fn<(active: boolean, onBack: () => void) => void>()
vi.mock('@/hooks/useHistoryGuard', () => ({
  useHistoryGuard: (active: boolean, onBack: () => void) => historyGuard(active, onBack),
}))
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/admin/deployments',
  useSearchParams: () => new URLSearchParams(),
}))

import { NewDeploymentDialog, dropUnavailablePicks, droppedPicksMessage, hubLabel, type PickerData } from '@/components/admin/NewDeploymentDialog'
import AdminDeploymentsPage from '@/app/(admin)/admin/deployments/page'

// ── Fixtures ──────────────────────────────────────────────────────

const OPERATORS = [
  { id: 'u1', name: 'Op One', role: 'OPERATOR', homeHubId: 'h1' },
  { id: 'u2', name: 'Op Two', role: 'OPERATOR', homeHubId: null },
]
const VEHICLES = [
  { id: 'v1', name: 'Truck 1', type: 'TRUCK', status: 'ACTIVE', assignedOperatorId: null },
  { id: 'v2', name: 'ATV 2', type: 'ATV', status: 'ACTIVE', assignedOperatorId: null },
]
const HUBS = [
  { id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' },
  { id: 'h2', name: 'Austin Hub', city: 'Austin', state: 'TX' },
]
const PROJECTS = [{ id: 'p1', name: 'TX Soil' }]
const NO_UNITS = { available: 0, checkedOut: 0, inMaintenance: 0, inoperable: 0, retired: 0, totalUnits: 0 }
const INVENTORY = [
  {
    id: 'i-bags', name: 'Sample bags', itemType: 'CONSUMABLE' as const, quantity: 40,
    unitCounts: NO_UNITS, availableUnits: [], category: { id: 'c1', name: 'Sampling' },
  },
  {
    id: 'i-gps', name: 'GPS unit', itemType: 'SERIALIZED' as const, quantity: 2,
    unitCounts: { ...NO_UNITS, available: 1, checkedOut: 1, totalUnits: 2 },
    availableUnits: [{ id: 'unit-7', serialNumber: 'GPS-007', position: 1 }], category: { id: 'c2', name: 'Instruments' },
  },
  {
    // Units 1–2 are out; the API says the free one is position 3 (T8).
    id: 'i-corer', name: 'Corer', itemType: 'SERIALIZED' as const, quantity: 3,
    unitCounts: { ...NO_UNITS, available: 1, checkedOut: 2, totalUnits: 3 },
    availableUnits: [{ id: 'unit-c3', serialNumber: null, position: 3 }], category: { id: 'c2', name: 'Instruments' },
  },
]
/** Fresh availability after someone else took Corer Unit 3. */
const INVENTORY_WITHOUT_CORER = INVENTORY.map((i) =>
  i.id === 'i-corer' ? { ...i, unitCounts: { ...i.unitCounts, available: 0, checkedOut: 3 }, availableUnits: [] } : i,
)
const CREATED_RIG = {
  id: 'rig-2', label: null, startedAt: '2026-09-03T10:00:00Z', endedAt: null,
  operator: { id: 'u2', name: 'Op Two' }, project: null, vehicles: [], kits: [{ id: 'k2', items: [] }], secondaryOperators: [],
}

const UNIT_409 = 'A selected unit was just checked out by someone else. Please select a different unit and try again.'
const OPERATOR_409 = 'This operator already has an active deployment. End it before starting a new one.'
const VEHICLE_409 = 'One or more vehicles are already assigned to another active deployment. Remove them there first.'

const scrollSpy = vi.fn()
beforeEach(() => {
  historyGuard.mockClear()
  scrollSpy.mockClear()
  Element.prototype.scrollIntoView = scrollSpy
})
afterEach(() => {
  vi.unstubAllGlobals()
  // @ts-expect-error — restore jsdom's "absent" state
  delete Element.prototype.scrollIntoView
})

const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response)

// ── Dialog-level helpers ──────────────────────────────────────────

/** Drives a SearchableSelect (Autocomplete) exactly as SearchableSelect.test.tsx does. */
function pick(labelText: string | RegExp, option: string) {
  fireEvent.mouseDown(screen.getByLabelText(labelText))
  fireEvent.click(within(screen.getByRole('listbox')).getByText(option))
}
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }))
const dialog = () => screen.getByRole('dialog', { name: 'Start Deployment' })
const backdrop = () => document.querySelector('.MuiBackdrop-root') as HTMLElement
function rowFor(text: string): HTMLElement {
  return screen.getByText(text).closest('.MuiStack-root') as HTMLElement
}

function renderDialog(extra: Partial<React.ComponentProps<typeof NewDeploymentDialog>> = {}) {
  const onClose = vi.fn()
  const onSuccess = vi.fn()
  render(
    <NewDeploymentDialog
      operators={OPERATORS} vehicles={VEHICLES} inventoryItems={INVENTORY} hubs={HUBS} projects={PROJECTS}
      onClose={onClose} onSuccess={onSuccess} {...extra}
    />,
  )
  return { onClose, onSuccess }
}

/** Op One + TX Soil → Truck 1 → bags + GPS-007 + Corer Unit 3 from Toledo Hub → Start step. */
async function walkToStart() {
  pick(/^Operator/, 'Op One')
  pick('Project', 'TX Soil')
  next()
  await screen.findByText('Select vehicles for this deployment')
  fireEvent.click(screen.getAllByRole('checkbox')[0]) // Truck 1
  next()
  await screen.findByText('Select items to pack into this kit')
  pick('Source hub for consumables', 'Toledo Hub · Toledo, OH')
  fireEvent.click(within(rowFor('Sample bags')).getByRole('checkbox'))
  fireEvent.click(within(rowFor('GPS-007')).getByRole('checkbox'))
  fireEvent.click(within(rowFor('Unit 3')).getByRole('checkbox'))
  next()
  await screen.findByRole('button', { name: 'Start Deployment' })
}

/** A /api/deployments POST mock whose responses are taken in order (last one repeats). */
function stubCreate(responses: { status: number; body: unknown }[]) {
  const posts: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/deployments' && init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)))
      const r = responses[Math.min(posts.length - 1, responses.length - 1)]!
      return jsonRes(r.body, r.status)
    }
    return jsonRes({ data: [] })
  }))
  return posts
}

const startDeployment = () => fireEvent.click(screen.getByRole('button', { name: 'Start Deployment' }))
const summary = () => screen.getByLabelText('Deployment summary')
const kitLines = () => within(screen.getByLabelText('Kit contents')).getAllByRole('listitem').map((li) => li.textContent)

// ── The grammar ───────────────────────────────────────────────────

describe('UXP-6 (6d): the admin builder speaks the EntityFormDialog grammar', () => {
  beforeEach(() => { stubCreate([{ status: 201, body: CREATED_RIG }]) })

  it('the dialog Paper is the form; Cancel/Next pinned; Back appears as the secondary action; "Start Deployment" on the last step', async () => {
    renderDialog()
    expect(dialog().tagName).toBe('FORM')
    const names = () => within(dialog()).getAllByRole('button').filter((b) => b.getAttribute('type') !== 'hidden')
      .map((b) => b.textContent).filter((t) => t === 'Cancel' || t === 'Back' || t === 'Next' || t === 'Start Deployment')
    expect(names()).toEqual(['Cancel', 'Next'])
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('type', 'submit')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled() // no operator yet

    pick(/^Operator/, 'Op One')
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    next()
    await screen.findByText('Select vehicles for this deployment')
    expect(names()).toEqual(['Cancel', 'Back', 'Next'])
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('type', 'button')
    next(); next()
    const start = await screen.findByRole('button', { name: 'Start Deployment' })
    expect(start).toHaveAttribute('type', 'submit')
    // Back really steps back.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('Select items to pack into this kit')
  })

  it('marks the operator required with the legend, and no label says "(optional)" on any step', async () => {
    renderDialog()
    expect(within(dialog()).getByText('required', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Operator/)).toBeRequired()
    const optionalLabels = () => Array.from(document.querySelectorAll('label')).filter((l) => /\(optional\)/i.test(l.textContent ?? ''))
    expect(optionalLabels()).toHaveLength(0)
    pick(/^Operator/, 'Op One')
    next(); next(); next()
    await screen.findByRole('button', { name: 'Start Deployment' })
    expect(screen.getByLabelText('Deployment note')).toBeInTheDocument()
    expect(optionalLabels()).toHaveLength(0)
  })

  it('Enter = Next (implicit submission advances the wizard); with no operator it marks the field instead', async () => {
    renderDialog()
    ;(dialog() as HTMLFormElement).requestSubmit()
    expect(await screen.findByText('Choose an operator')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Operator/)).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled())
    expect(screen.queryByText('Select vehicles for this deployment')).toBeNull()

    pick(/^Operator/, 'Op One')
    ;(dialog() as HTMLFormElement).requestSubmit()
    await screen.findByText('Select vehicles for this deployment')
  })

  it('offers hubs as "name · city, state" and blocks Next on the kit step until a consumable has a hub', async () => {
    renderDialog()
    pick(/^Operator/, 'Op One')
    next(); next()
    await screen.findByText('Select items to pack into this kit')
    fireEvent.click(within(rowFor('Sample bags')).getByRole('checkbox'))
    const hub = screen.getByLabelText(/^Source hub for consumables/)
    expect(hub).toBeRequired()
    expect(hub).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    fireEvent.mouseDown(hub)
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Toledo Hub · Toledo, OH', 'Austin Hub · Austin, TX'])
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Toledo Hub · Toledo, OH'))
    expect(screen.getByLabelText(/^Source hub for consumables/)).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('the review step lists the picks by name under the kit count, and the project is sent', async () => {
    const posts = stubCreate([{ status: 201, body: CREATED_RIG }])
    const { onSuccess } = renderDialog()
    await walkToStart()
    const s = summary()
    expect(within(s).getByText('Op One')).toBeInTheDocument()
    expect(within(s).getByText('TX Soil')).toBeInTheDocument()
    expect(within(s).getByText('Truck 1')).toBeInTheDocument()
    expect(within(s).getByText('1 consumable · 2 serialized · from Toledo Hub')).toBeInTheDocument()
    expect(kitLines()).toEqual(['Sample bags ×1', 'GPS unit · GPS-007', 'Corer · Unit 3'])

    startDeployment()
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ operatorId: 'u1', projectId: 'p1', vehicleIds: ['v1'], sourceHubId: 'h1' })
    expect(posts[0]!.kitItems).toEqual(expect.arrayContaining([
      { inventoryItemId: 'i-bags', quantity: 1 },
      { inventoryItemId: 'i-gps', inventoryUnitId: 'unit-7', itemType: 'SERIALIZED' },
      { inventoryItemId: 'i-corer', inventoryUnitId: 'unit-c3', itemType: 'SERIALIZED' },
    ]))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(onSuccess.mock.calls[0]![0]).toEqual({ rig: CREATED_RIG, operatorId: 'u1', operatorName: 'Op One' })
  })
})

// ── Dirty guard ───────────────────────────────────────────────────

describe('UXP-6 (6d): a half-built rig asks "Discard changes?"', () => {
  beforeEach(() => { stubCreate([{ status: 201, body: CREATED_RIG }]) })

  it('untouched: backdrop closes straight away', () => {
    const { onClose } = renderDialog()
    fireEvent.click(backdrop())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Discard changes?')).toBeNull()
  })

  it('after a pick: backdrop → confirm; Keep editing keeps the picks; hardware Back → confirm; Discard closes', async () => {
    const { onClose } = renderDialog()
    pick(/^Operator/, 'Op One')

    fireEvent.click(backdrop())
    const confirm = await screen.findByRole('dialog', { name: 'Discard changes?' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).toBeNull())
    expect(screen.getByLabelText(/^Operator/)).toHaveValue('Op One')

    // Hardware Back = the latest callback handed to the (armed) history guard.
    expect(historyGuard.mock.calls.at(-1)![0]).toBe(true)
    historyGuard.mock.calls.at(-1)![1]()
    const confirm2 = await screen.findByRole('dialog', { name: 'Discard changes?' })
    fireEvent.click(within(confirm2).getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc on a wizard with kit picks asks too', async () => {
    const { onClose } = renderDialog()
    pick(/^Operator/, 'Op One')
    next(); next()
    await screen.findByText('Select items to pack into this kit')
    fireEvent.click(within(rowFor('GPS-007')).getByRole('checkbox'))
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ── T1 / T2: scoped 409 recovery + refetch ────────────────────────

describe('UXP-6 (6d, T1/T2): a 409 keeps your picks; pickers refetch', () => {
  it('unit 409: drops ONLY the taken unit (named), keeps the consumable and the other unit, refetches, and resubmits without it', async () => {
    const posts = stubCreate([{ status: 409, body: { error: UNIT_409 } }, { status: 201, body: CREATED_RIG }])
    const onRefetchPickers = vi.fn(async (): Promise<PickerData> => ({ vehicles: VEHICLES, inventoryItems: INVENTORY_WITHOUT_CORER }))
    const { onSuccess } = renderDialog({ onRefetchPickers })
    await walkToStart()

    startDeployment()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Unit 3 of Corer was taken — removed from your kit.')
    expect(onRefetchPickers).toHaveBeenCalledTimes(1)
    expect(within(summary()).getByText('1 consumable · 1 serialized · from Toledo Hub')).toBeInTheDocument()
    expect(kitLines()).toEqual(['Sample bags ×1', 'GPS unit · GPS-007'])
    expect(within(summary()).getByText('Truck 1')).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
    // The server's generic wording is NOT shown — the scoped message replaces it.
    expect(screen.queryByText(UNIT_409)).toBeNull()

    // Straight back to Start: the second POST carries what is left, nothing else.
    startDeployment()
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1]!.kitItems).toEqual(expect.arrayContaining([
      { inventoryItemId: 'i-bags', quantity: 1 },
      { inventoryItemId: 'i-gps', inventoryUnitId: 'unit-7', itemType: 'SERIALIZED' },
    ]))
    expect(posts[1]!.kitItems).toHaveLength(2)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    // T2: refetched after the 409 AND after the successful create.
    expect(onRefetchPickers).toHaveBeenCalledTimes(2)
  })

  it('operator-has-active-rig 409: nothing of ours went away → every pick stays and the server message shows', async () => {
    const posts = stubCreate([{ status: 409, body: { error: OPERATOR_409 } }])
    const onRefetchPickers = vi.fn(async (): Promise<PickerData> => ({ vehicles: VEHICLES, inventoryItems: INVENTORY }))
    renderDialog({ onRefetchPickers })
    await walkToStart()

    startDeployment()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(OPERATOR_409)
    expect(onRefetchPickers).toHaveBeenCalledTimes(1)
    expect(within(summary()).getByText('1 consumable · 2 serialized · from Toledo Hub')).toBeInTheDocument()
    expect(kitLines()).toEqual(['Sample bags ×1', 'GPS unit · GPS-007', 'Corer · Unit 3'])

    startDeployment()
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1]!.kitItems).toHaveLength(3)
    expect(posts[1]!.vehicleIds).toEqual(['v1'])
  })

  it('vehicle 409: the vehicle now on another rig is dropped by name; the kit is untouched', async () => {
    stubCreate([{ status: 409, body: { error: VEHICLE_409 } }])
    const taken = VEHICLES.map((v) => (v.id === 'v1' ? { ...v, assignedOperatorId: 'u9' } : v))
    const onRefetchPickers = vi.fn(async (): Promise<PickerData> => ({ vehicles: taken, inventoryItems: INVENTORY }))
    renderDialog({ onRefetchPickers })
    await walkToStart()

    startDeployment()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Truck 1 is now on another deployment — removed from your rig.')
    expect(within(summary()).queryByText('Truck 1')).toBeNull()
    expect(kitLines()).toHaveLength(3)
  })

  it('when the refetch itself fails, nothing is dropped and the server message shows', async () => {
    stubCreate([{ status: 409, body: { error: UNIT_409 } }])
    const onRefetchPickers = vi.fn(async () => null)
    renderDialog({ onRefetchPickers })
    await walkToStart()
    startDeployment()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(UNIT_409)
    expect(kitLines()).toHaveLength(3)
  })

  it('a 400 reads through parseApiError (zod shape) rather than a generic "failed"', async () => {
    stubCreate([{ status: 400, body: { error: { fieldErrors: {}, formErrors: ['A source hub is required when checking out consumable items.'] } } }])
    renderDialog()
    await walkToStart()
    startDeployment()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('A source hub is required when checking out consumable items.')
  })

  it('dropUnavailablePicks / droppedPicksMessage: pure, scoped, and never drops a consumable', () => {
    const kit = new Map([
      ['i-bags', { inventoryItemId: 'i-bags', itemType: 'CONSUMABLE' as const, quantity: 3, itemName: 'Sample bags' }],
      ['unit-7', { inventoryItemId: 'i-gps', itemType: 'SERIALIZED' as const, inventoryUnitId: 'unit-7', unitLabel: 'GPS-007', itemName: 'GPS unit' }],
      ['unit-c3', { inventoryItemId: 'i-corer', itemType: 'SERIALIZED' as const, inventoryUnitId: 'unit-c3', unitLabel: 'Unit 3', itemName: 'Corer' }],
    ])
    const out = dropUnavailablePicks({ kitItems: kit, vehicleIds: new Set(['v1', 'v2']) }, {
      vehicles: [{ ...VEHICLES[0]!, status: 'RETIRED' }], // v1 retired, v2 gone entirely
      inventoryItems: INVENTORY_WITHOUT_CORER,
    }, VEHICLES)
    expect(Array.from(out.kitItems.keys())).toEqual(['i-bags', 'unit-7'])
    expect(out.vehicleIds.size).toBe(0)
    expect(out.dropped).toEqual({ units: ['Unit 3 of Corer'], vehicles: ['Truck 1', 'ATV 2'] })
    expect(droppedPicksMessage(out.dropped)).toBe(
      'Unit 3 of Corer was taken — removed from your kit. Truck 1 and ATV 2 are now on another deployment — removed from your rig.',
    )
    expect(droppedPicksMessage({ units: [], vehicles: [] })).toBeNull()
    expect(hubLabel({ name: 'Toledo Hub', city: 'Toledo', state: 'OH' })).toBe('Toledo Hub · Toledo, OH')
    expect(hubLabel({ name: 'Yard', city: null, state: null })).toBe('Yard')
  })
})

// ── Page level: success toast + Open, refetch after success ───────

const RIG_ONE = {
  id: 'rig-1', label: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
  operator: { id: 'u1', name: 'Op One' }, project: null, vehicles: [], kits: [{ id: 'k1', items: [] }], secondaryOperators: [],
}

function stubPage() {
  const calls: string[] = []
  const createPosts: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    if (url === '/api/deployments' && init?.method === 'POST') {
      createPosts.push(JSON.parse(String(init.body)))
      return jsonRes(CREATED_RIG, 201)
    }
    if (url === '/api/deployments/rig-1') return jsonRes({ ...RIG_ONE, openTasks: [] })
    if (url === '/api/deployments/rig-2') return jsonRes({ ...CREATED_RIG, openTasks: [] })
    if (url.startsWith('/api/deployments/') && url.endsWith('/history')) return jsonRes({ data: [] })
    if (url.startsWith('/api/deployments?')) return jsonRes([RIG_ONE])
    if (url.startsWith('/api/transfers')) return jsonRes([])
    if (url === '/api/users') return jsonRes({ data: OPERATORS })
    if (url === '/api/projects') return jsonRes({ data: PROJECTS })
    if (url === '/api/vehicles') return jsonRes({ data: VEHICLES })
    if (url.startsWith('/api/inventory')) return jsonRes({ data: INVENTORY })
    if (url === '/api/hubs') return jsonRes(HUBS)
    return jsonRes({ data: [] })
  }))
  return { calls, createPosts }
}

async function renderPage() {
  render(<ToastProvider><AdminDeploymentsPage /></ToastProvider>)
  await screen.findByText('Op One')
}

describe('UXP-6 (6d): page — success toast with Open, refetch after success', () => {
  it('toasts "Deployment started for <operator>" with an Open action that lands in the new rig\'s drawer; pickers refetch after success', async () => {
    const { calls, createPosts } = stubPage()
    await renderPage()
    await waitFor(() => expect(calls.filter((u) => u === '/api/vehicles')).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: 'Start Deployment' })) // toolbar (D11 verb)
    const form = await screen.findByRole('dialog', { name: 'Start Deployment' })
    pick(/^Operator/, 'Op Two')
    next(); next(); next()
    fireEvent.click(await within(form).findByRole('button', { name: 'Start Deployment' }))
    await waitFor(() => expect(createPosts).toHaveLength(1))
    expect(createPosts[0]).toMatchObject({ operatorId: 'u2' })

    expect(await screen.findByText('Deployment started for Op Two')).toBeInTheDocument()
    expect(screen.queryByText('Deployment created')).toBeNull()
    // T2: vehicles + inventory re-read after the create.
    await waitFor(() => expect(calls.filter((u) => u === '/api/vehicles')).toHaveLength(2))
    expect(calls.filter((u) => u.startsWith('/api/inventory'))).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    // The drawer for rig-2 (Op Two, empty kit) — the same drawer a row tap opens.
    expect(await screen.findByText('Empty kit.')).toBeInTheDocument()
    await waitFor(() => expect(calls).toContain('/api/deployments/rig-2'))
  })
})
