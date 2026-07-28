import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MyRigPage from '@/app/(operator)/operator/my-deployment/page'

// CC-32 (2.4): the deployment builder went 4 steps → 2.
//
// The old "Details" step carried one OPTIONAL label and the old "Start" step carried
// one OPTIONAL note — neither could block anything, so both were pure "Next" taps on
// the way out of the hub. The label now heads Build Rig; the note + presets close Build
// Kit, below the UR-006 blocker alert (which must stay on the kit step).
//
// Driven through the real page rather than the dialog in isolation: NewDeploymentDialog
// lives inside a Next.js page file, and Next forbids non-default exports there — so
// exporting it purely for a test would have been a source change made to suit the test.
// This also covers the true operator path: no deployment → Start Deployment → builder.

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate, pendingDeployCreate: false, refresh: vi.fn() }),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { userId: 'u1', name: 'Op One', role: 'OPERATOR' } }) }))
vi.mock('@/components/shared/useToast', () => ({ useToast: () => vi.fn() }))

const jsonRes = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response)

const VEHICLES = [
  { id: 'v1', name: 'Truck 1', type: 'TRUCK', status: 'ACTIVE', assignedOperatorId: null },
  { id: 'v2', name: 'ATV 2', type: 'ATV', status: 'ACTIVE', assignedOperatorId: null },
]

function mockFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/deployments?active=true')) return jsonRes([])       // no active rig
    // transfers/handoffs are consumed as bare arrays, not {data}
    if (url.startsWith('/api/transfers') || url.startsWith('/api/handoffs')) return jsonRes([])
    if (url.startsWith('/api/vehicles')) return jsonRes({ data: VEHICLES })
    if (url.startsWith('/api/inventory')) return jsonRes({ data: [] })
    if (url.startsWith('/api/operators')) return jsonRes({ data: [] })
    if (url.startsWith('/api/hubs')) return jsonRes({ data: [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }] })
    return jsonRes({ data: [] })
  })
}

beforeEach(() => {
  mutate.mockReset().mockResolvedValue({ ok: true, queued: false, data: {} })
  vi.stubGlobal('fetch', mockFetch())
})

afterEach(() => { vi.unstubAllGlobals() })

async function openBuilder() {
  render(<MyRigPage />)
  const start = await screen.findByRole('button', { name: /Start Deployment/i })
  fireEvent.click(start)
  await screen.findByRole('heading', { name: 'Start Deployment' })
}

describe('CC-32 (2.4) the deployment builder is 2 steps, not 4', () => {
  it('renders exactly two steps, labelled Build Rig and Build Kit', async () => {
    await openBuilder()

    const dialog = screen.getByRole('dialog')
    // MUI renders one .MuiStep-root per <Step>. Exactly two — the anchor for this item.
    expect(dialog.querySelectorAll('.MuiStep-root')).toHaveLength(2)
    expect(screen.getByText('Build Rig')).toBeInTheDocument()
    expect(screen.getByText('Build Kit')).toBeInTheDocument()
    // The retired steps are gone.
    expect(screen.queryByText('Details')).not.toBeInTheDocument()
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
  })

  it('puts the optional label at the top of Build Rig, with the vehicles', async () => {
    await openBuilder()

    expect(screen.getByLabelText('Label (optional)')).toBeInTheDocument()
    expect(screen.getByText('Select your vehicles')).toBeInTheDocument()
    expect(screen.getByText('Truck 1')).toBeInTheDocument()
  })

  it('puts the optional note + presets at the bottom of Build Kit, and finishes there', async () => {
    await openBuilder()

    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // Build Rig → Build Kit

    expect(await screen.findByText('Pack your kit')).toBeInTheDocument()
    expect(screen.getByLabelText('Deployment note (optional)')).toBeInTheDocument()
    // The CC-24 one-tap presets came along with the note.
    expect(screen.getByText('Picked up from hub')).toBeInTheDocument()
    // Two steps means the second one ends the flow: no further Next, just the verb.
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Deployment' })).toBeInTheDocument()
  })

  it('starts the deployment from the kit step — hub departure is two taps of Next-equivalent', async () => {
    await openBuilder()

    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'TX Summer Run' } })
    fireEvent.click(screen.getAllByRole('checkbox')[0])            // pick Truck 1
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))  // → Build Kit
    await screen.findByText('Pack your kit')
    fireEvent.click(screen.getByRole('button', { name: 'Start Deployment' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    const call = mutate.mock.calls[0][0]
    expect(call.endpoint).toBe('/api/deployments')
    expect(call.label).toBe('Start deployment')
    expect(call.body).toMatchObject({ label: 'TX Summer Run', vehicleIds: ['v1'] })
  })
})
