import { render, screen, waitFor, within, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MyRigPage from '@/app/(operator)/operator/my-deployment/page'
import { RefreshOnReconnect } from '@/components/shared/RefreshOnReconnect'
import { ENTITY_KEYS, INVALIDATE_EVENT, type InvalidateDetail } from '@/lib/invalidation'

// Hotfix 2026-10-25 (H2-b): signal returning no longer reloads the page
// (next.config.ts reloadOnOnline: false). RefreshOnReconnect turns `online` into one
// invalidation of every entity, so mounted screens re-read without losing their state;
// an open End Deployment dialog takes in a line the re-read added (2.6).

vi.mock('@/hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => ({ mutate: vi.fn(), pendingDeployCreate: false, refresh: vi.fn() }),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { userId: 'u1', name: 'Op One', role: 'OPERATOR', homeHubId: 'h1' } }) }))
vi.mock('@/components/shared/useToast', () => ({ useToast: () => vi.fn() }))

const jsonRes = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)

const BAGS_LINE = { id: 'ki-bags', quantity: 5, inventoryUnit: null, item: { id: 'i-bags', name: 'Sample bags', itemType: 'CONSUMABLE', categoryRef: null } }
const PROBE_LINE = { id: 'ki-probe', quantity: 2, inventoryUnit: null, item: { id: 'i-probe', name: 'Soil probe tips', itemType: 'CONSUMABLE', categoryRef: null } }
const rig = (lines: unknown[]) => ({
  id: 'rig1', label: 'North block', startedAt: '2026-10-01T12:00:00Z', endedAt: null, notes: null,
  operatorId: 'u1', operator: { id: 'u1', name: 'Op One' }, secondaryOperators: [], project: null,
  vehicles: [], kits: [{ id: 'k1', items: lines }],
})

let mine: unknown = null
function stub() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/deployments/mine')) return jsonRes({ data: mine })
    if (url.startsWith('/api/transfers') || url.startsWith('/api/handoffs')) return jsonRes([])
    if (url.startsWith('/api/hubs')) return jsonRes({ data: [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }] })
    return jsonRes({ data: [] })
  }))
}

const goOnline = () => act(() => { window.dispatchEvent(new Event('online')) })

beforeEach(() => {
  window.history.replaceState(null, '', '/operator/my-deployment')
  mine = null
  stub()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Hotfix 2026-10-25 · screens re-read on reconnect instead of reloading', () => {
  it('My Deployment re-reads when signal returns: no rig → the rig shows', async () => {
    render(<><RefreshOnReconnect /><MyRigPage /></>)
    expect(await screen.findByText('No active deployment')).toBeInTheDocument()

    mine = rig([BAGS_LINE])
    await goOnline()
    await waitFor(() => expect(screen.queryByText('No active deployment')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'End Deployment' })).toBeInTheDocument()
  })

  it('one invalidation of every entity per reconnect, at most once per 10 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const seen: InvalidateDetail[] = []
    const onInvalidate = (e: Event) => seen.push((e as CustomEvent<InvalidateDetail>).detail)
    window.addEventListener(INVALIDATE_EVENT, onInvalidate)
    try {
      render(<RefreshOnReconnect />)
      await goOnline()
      vi.advanceTimersByTime(1_000)
      await goOnline()
      expect(seen).toHaveLength(1)
      expect([...seen[0].keys].sort()).toEqual([...ENTITY_KEYS].sort())

      vi.advanceTimersByTime(11_000)
      await goOnline()
      expect(seen).toHaveLength(2)
    } finally {
      window.removeEventListener(INVALIDATE_EVENT, onInvalidate)
    }
  })

  it('an open End Deployment dialog takes in a line the re-read added, without crashing', async () => {
    mine = rig([BAGS_LINE])
    render(<><RefreshOnReconnect /><MyRigPage /></>)
    fireEvent.click(await screen.findByRole('button', { name: 'End Deployment' }))
    const dlg = await screen.findByRole('dialog', { name: 'End Deployment' })
    expect(within(dlg).getByText('Sample bags')).toBeInTheDocument()
    expect(within(dlg).queryByText('Soil probe tips')).not.toBeInTheDocument()

    mine = rig([BAGS_LINE, PROBE_LINE])
    await goOnline()
    expect(await within(dlg).findByText('Soil probe tips')).toBeInTheDocument()
    expect(within(dlg).getByText('Sample bags')).toBeInTheDocument()
  })
})
