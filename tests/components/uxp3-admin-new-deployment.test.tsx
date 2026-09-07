import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NewDeploymentDialog } from '@/components/admin/NewDeploymentDialog'

// UXP-3 (3d): the admin "New Deployment" builder, extracted to its own file and given
//  - a real optional Project pick on step 0 (the dead `useState('')` is gone),
//  - a review summary (Operator · Project · Vehicles · Kit) at the top of the Start step,
//  - B-14: `alternativeLabel` at xs so the fourth step label stops clipping.
// The 4-step structure and the step labels are unchanged.

const OPERATORS = [{ id: 'u1', name: 'Op One', role: 'OPERATOR' }]
const VEHICLES = [
  { id: 'v1', name: 'Truck 1', type: 'TRUCK', status: 'ACTIVE', assignedOperatorId: null },
  { id: 'v2', name: 'ATV 2', type: 'ATV', status: 'ACTIVE', assignedOperatorId: null },
]
const INVENTORY = [
  {
    id: 'i-bags', name: 'Sample bags', itemType: 'CONSUMABLE' as const, quantity: 40,
    unitCounts: { available: 0, checkedOut: 0, inMaintenance: 0, inoperable: 0, retired: 0, totalUnits: 0 },
    availableUnits: [], category: { id: 'c1', name: 'Sampling' },
  },
  {
    id: 'i-gps', name: 'GPS unit', itemType: 'SERIALIZED' as const, quantity: 2,
    unitCounts: { available: 1, checkedOut: 1, inMaintenance: 0, inoperable: 0, retired: 0, totalUnits: 2 },
    availableUnits: [{ id: 'unit-7', serialNumber: 'GPS-007', position: 1 }], category: { id: 'c2', name: 'Instruments' },
  },
]
const HUBS = [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }]
const PROJECTS = [{ id: 'p1', name: 'TX Soil' }]

const posts: Record<string, unknown>[] = []

beforeEach(() => {
  posts.length = 0
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/deployments' && init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)))
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'rig-1' }) } as Response)
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response)
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

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

function pick(labelText: string | RegExp, option: string) {
  fireEvent.mouseDown(screen.getByLabelText(labelText))
  fireEvent.click(within(screen.getByRole('listbox')).getByText(option))
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }))

/** Fill every step: Op One + TX Soil → Truck 1 → one consumable + one serialized from Toledo Hub → Start step. */
async function walkToStart() {
  pick(/^Operator/, 'Op One') // required → MUI labels it "Operator *"
  pick('Project (optional)', 'TX Soil')
  next()
  await screen.findByText('Select vehicles for this deployment')
  fireEvent.click(screen.getAllByRole('checkbox')[0]) // Truck 1 (sorted into the TRUCK group first)
  next()
  await screen.findByText('Select items to pack into this kit')
  pick('Source hub for consumables', 'Toledo Hub — Toledo, OH')
  const bagsRow = screen.getByText('Sample bags').closest('.MuiStack-root') as HTMLElement
  fireEvent.click(within(bagsRow).getByRole('checkbox'))
  const gpsUnitRow = screen.getByText('GPS-007').closest('.MuiStack-root') as HTMLElement
  fireEvent.click(within(gpsUnitRow).getByRole('checkbox'))
  next()
  await screen.findByRole('button', { name: 'Start Deployment' })
}

describe('UXP-3 (3d): admin New Deployment builder', () => {
  it('keeps the four steps, labelled Assign / Build Rig / Build Kit / Start', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelectorAll('.MuiStep-root')).toHaveLength(4)
    for (const label of ['Assign', 'Build Rig', 'Build Kit', 'Start']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('offers the optional Project pick on step 0, under the label', () => {
    renderDialog()
    expect(screen.getByLabelText(/^Operator/)).toBeInTheDocument()
    expect(screen.getByLabelText('Label (optional)')).toBeInTheDocument()
    expect(screen.getByLabelText('Project (optional)')).toBeInTheDocument()
  })

  it('hides the Project pick when the page has no projects', () => {
    renderDialog({ projects: [] })
    expect(screen.queryByLabelText('Project (optional)')).toBeNull()
  })

  it('reads back operator · project · vehicles · kit counts on the Start step', async () => {
    renderDialog()
    await walkToStart()
    const summary = screen.getByLabelText('Deployment summary')
    expect(summary.tagName).toBe('DL')
    expect(within(summary).getByText('Op One')).toBeInTheDocument()
    expect(within(summary).getByText('TX Soil')).toBeInTheDocument()
    expect(within(summary).getByText('Truck 1')).toBeInTheDocument()
    expect(within(summary).getByText('1 consumable · 1 serialized · from Toledo Hub')).toBeInTheDocument()
    // The note presets still sit below the summary on the same step (CC-24).
    expect(screen.getByLabelText('Deployment note (optional)')).toBeInTheDocument()
  })

  it('says "None" / "Empty kit" when nothing was picked', async () => {
    renderDialog()
    pick(/^Operator/, 'Op One') // required → MUI labels it "Operator *"
    next(); next(); next()
    await screen.findByRole('button', { name: 'Start Deployment' })
    const summary = screen.getByLabelText('Deployment summary')
    expect(within(summary).getByText('Op One')).toBeInTheDocument()
    expect(within(summary).getAllByText('None')).toHaveLength(2) // project + vehicles
    expect(within(summary).getByText('Empty kit')).toBeInTheDocument()
  })

  it('POSTs the picked projectId and vehicleIds on Start Deployment', async () => {
    const { onSuccess } = renderDialog()
    await walkToStart()
    fireEvent.click(screen.getByRole('button', { name: 'Start Deployment' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ operatorId: 'u1', projectId: 'p1', vehicleIds: ['v1'], sourceHubId: 'h1' })
    expect(posts[0]!.kitItems).toEqual(expect.arrayContaining([
      { inventoryItemId: 'i-bags', quantity: 1 },
      { inventoryItemId: 'i-gps', inventoryUnitId: 'unit-7', itemType: 'SERIALIZED' },
    ]))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('omits projectId from the body when no project is picked', async () => {
    renderDialog()
    pick(/^Operator/, 'Op One') // required → MUI labels it "Operator *"
    next(); next(); next()
    fireEvent.click(await screen.findByRole('button', { name: 'Start Deployment' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).not.toHaveProperty('projectId')
  })
})

describe('UXP-3 (3d / B-14): stacked step labels at xs', () => {
  function stubMatchMedia(matches: boolean) {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })))
  }

  it('uses alternativeLabel when the viewport is below sm', () => {
    stubMatchMedia(true)
    renderDialog()
    expect(screen.getByRole('dialog').querySelector('.MuiStepper-alternativeLabel')).not.toBeNull()
  })

  it('keeps the inline labels on wider screens', () => {
    stubMatchMedia(false)
    renderDialog()
    expect(screen.getByRole('dialog').querySelector('.MuiStepper-alternativeLabel')).toBeNull()
  })
})
