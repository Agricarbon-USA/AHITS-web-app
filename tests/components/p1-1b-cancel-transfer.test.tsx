import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MyRigPage from '@/app/(operator)/operator/my-deployment/page'

// P1-1b audit B-1 · My Deployment's waiting-transfer card shows Cancel Transfer only to
// the person who started it. GET /api/transfers returns `initiatedById` (no
// `initiatedBy` relation), so the card must read that — reading `initiatedBy.id`
// threw and put the whole page on the error screen for the sender and every crewmate.

const { me } = vi.hoisted(() => ({ me: { userId: 'u1' } }))
vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate: vi.fn(), pendingDeployCreate: false, refresh: vi.fn() }),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { userId: me.userId, name: 'Someone', role: 'OPERATOR', homeHubId: 'h1' } }) }))
vi.mock('@/components/shared/useToast', () => ({ useToast: () => vi.fn() }))

const jsonRes = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)

const RIG = {
  id: 'rig1', label: 'North block', startedAt: '2026-10-01T12:00:00Z', endedAt: null, notes: null,
  operatorId: 'u1', operator: { id: 'u1', name: 'Op One' }, secondaryOperators: [{ id: 'u2', name: 'Crew Two' }], project: null,
  vehicles: [],
  kits: [{ id: 'k1', items: [{ id: 'ki-gps', quantity: 1, inventoryUnit: null, item: { id: 'i-gps', name: 'GPS rover', itemType: 'SERIALIZED', categoryRef: null } }] }],
}

// Exactly what GET /api/transfers returns: the transfer's own fields, TRANSFER_INCLUDE
// (fromRig: true, toOperator, vehicles.vehicle, items.kitItem.item), and fromRig.operator
// from hydrateTransfersFromRig. No `initiatedBy`.
const WAITING = {
  id: 't1', fromRigId: 'rig1', toOperatorId: 'u9', initiatedById: 'u1', note: '', photoUrls: [],
  status: 'PENDING', responseNote: null, respondedAt: null, createdAt: '2026-10-30T15:00:00.000Z', updatedAt: '2026-10-30T15:00:00.000Z',
  fromRig: { id: 'rig1', label: 'North block', startedAt: '2026-10-01T12:00:00.000Z', endedAt: null, notes: null, projectId: null, createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z', operator: { id: 'u1', name: 'Op One' } },
  toOperator: { id: 'u9', name: 'Xena Recipient' },
  vehicles: [],
  items: [{
    id: 'ti1', transferRequestId: 't1', kitItemId: 'ki-gps', quantity: null, inventoryUnitId: null,
    kitItem: { id: 'ki-gps', kitId: 'k1', inventoryItemId: 'i-gps', quantity: 1, inventoryUnitId: null, drawnQuantity: 0, drawnHubId: null, addedAt: '2026-10-01T12:00:00.000Z', removedAt: null, item: { id: 'i-gps', name: 'GPS rover' } },
  }],
}

beforeEach(() => {
  window.history.replaceState(null, '', '/operator/my-deployment')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/deployments/mine')) return jsonRes({ data: RIG })
    if (url.startsWith('/api/transfers')) return jsonRes(url.includes('direction=outgoing') ? [WAITING] : [])
    if (url.startsWith('/api/handoffs')) return jsonRes([])
    if (url.startsWith('/api/hubs')) return jsonRes({ data: [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }] })
    return jsonRes({ data: [] })
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('P1-1b audit B-1 · Cancel Transfer reads initiatedById', () => {
  it('the sender: the page renders the waiting transfer with Cancel Transfer', async () => {
    me.userId = 'u1'
    render(<MyRigPage />)
    expect(await screen.findByText(/to accept your transfer of GPS rover ×1/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Transfer' })).toBeInTheDocument()
  })

  it('a crewmate: the page renders the waiting transfer, without Cancel Transfer', async () => {
    me.userId = 'u2'
    render(<MyRigPage />)
    expect(await screen.findByText(/to accept your transfer of GPS rover ×1/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel Transfer' })).toBeNull()
  })
})
