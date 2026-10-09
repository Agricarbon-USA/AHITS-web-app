import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MyRigPage from '@/app/(operator)/operator/my-deployment/page'

// PR-5b (U-11): Today's "Pick Up" on a held reservation navigates to
// /operator/my-deployment?fromRequestId=<id>. That used to open the Start Deployment
// builder — which only renders when the operator has NO rig, so an operator already
// deployed got nothing (a dead end). Now the page waits for its rig read: no rig →
// the builder, pre-seeded (unchanged); a rig → Add items on that rig, seeded with the
// held lines (the add-items route claims the PRIMARY's holds).

vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate: vi.fn(), pendingDeployCreate: false, refresh: vi.fn() }),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { userId: 'u1', name: 'Op One', role: 'OPERATOR', homeHubId: 'h1' } }) }))
vi.mock('@/components/shared/useToast', () => ({ useToast: () => vi.fn() }))

const jsonRes = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)

const RIG = {
  id: 'rig1', label: 'North block', startedAt: '2026-10-01T12:00:00Z', endedAt: null, notes: null,
  operatorId: 'u1', operator: { id: 'u1', name: 'Op One' }, secondaryOperators: [], project: null,
  vehicles: [], kits: [{ id: 'k1', items: [] }],
}
const AWAITING = [{
  id: 'req1', label: 'Week 42 bags', hubId: 'h1',
  lines: [{ heldItemId: 'i-bags', remainingQty: 4 }],
}]
const BAGS = { id: 'i-bags', name: 'Sample bags', itemType: 'CONSUMABLE', categoryName: 'Sampling', availableQuantity: 20, pickableUnits: [], availableByHub: { h1: 20 } }

let mine: unknown = null
function stub() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/deployments/mine')) return jsonRes({ data: mine })
    if (url.startsWith('/api/deployment-requests/awaiting-pickup')) return jsonRes({ data: AWAITING })
    if (url.startsWith('/api/transfers') || url.startsWith('/api/handoffs')) return jsonRes([])
    if (url.startsWith('/api/inventory')) return jsonRes({ data: [BAGS], total: 1, truncated: false })
    if (url.startsWith('/api/hubs')) return jsonRes({ data: [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }] })
    return jsonRes({ data: [] })
  }))
}

beforeEach(() => {
  window.history.replaceState(null, '', '/operator/my-deployment?fromRequestId=req1')
  stub()
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Pick up while already deployed (U-11)', () => {
  it('opens Add items on the current rig, seeded with the held lines — not a builder that never shows', async () => {
    mine = RIG
    render(<MyRigPage />)
    const dlg = await screen.findByRole('dialog', { name: 'Add Items' })
    expect(within(dlg).getByText('Sample bags')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pick Up Reservation' })).not.toBeInTheDocument()
  })

  it('with no rig it is the pre-seeded builder, as before', async () => {
    mine = null
    render(<MyRigPage />)
    expect(await screen.findByRole('heading', { name: 'Pick Up Reservation' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Items' })).not.toBeInTheDocument())
  })
})
