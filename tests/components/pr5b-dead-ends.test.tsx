import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// PR-5b "Screens reconcile" — the dead ends and the point fixes, through the real pages:
//  - vehicles: a refused Delete closes its dialog (red toast names the reason); Delete
//    has Undo; Show deleted → Restore (the twin of PR-3c's items); the dashboard's
//    `?status=IN_MAINTENANCE` deep-link lands filtered (U-14);
//  - hubs: a failed Receive is red, a partly-failed bulk Receive says so, and the
//    Deactivate dialog's button says "Deactivate" (U-6, U-15);
//  - item Delete: the details space is reserved before they load (the button never moves);
//  - ReportProblemDialog: kit-only lines only for a unit in the reporter's own kit (U-15).
// "Pick up" while already deployed is in pr5b-pickup-deployed.test.tsx (U-11).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/useHistoryGuard', () => ({ useHistoryGuard: () => {} }))
vi.mock('@/lib/qr-label', () => ({ downloadQrLabel: vi.fn(async () => {}) }))
vi.mock('@/components/shared/PhotoCapture', () => ({ PhotoCapture: () => null }))

import AdminVehiclesPage from '@/app/(admin)/admin/vehicles/page'
import AdminHubsPage from '@/app/(admin)/admin/hubs/page'
import AdminInventoryPage from '@/app/(admin)/admin/inventory/page'
import { ReportProblemDialog } from '@/components/shared/ReportProblemDialog'

const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response)

type Call = { method: string; url: string }
let calls: Call[] = []
const writes = (method: string, url: string) => calls.filter((c) => c.method === method && c.url === url)
const severityOf = (el: HTMLElement) => el.closest('.MuiAlert-root')?.className ?? ''

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

// ── Vehicles ──────────────────────────────────────────────────────────────
const vehicle = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, type: 'TRUCK', status: 'ACTIVE', year: 2022, makeModel: null, vin: null, licensePlate: null,
  odometer: 1000, location: null, hubId: null, hubName: null, assignedOperatorId: null, assignedOperatorName: null,
  activeProjects: [], insuranceExpires: null, registrationExpires: null, notes: null, isRental: false,
  rentalAgreementUrl: null, qrCodeId: `qr-${id}`, _count: { dailyChecks: 0, maintenanceTasks: 0 }, ...extra,
})
const TRUCK = vehicle('v1', 'Truck-01')
const BROKEN = vehicle('v2', 'Can-Am #1', { status: 'IN_MAINTENANCE' })
const GONE = vehicle('v9', 'Old trailer', { deletedAt: '2026-10-09T17:00:00Z' })
let vehicleDelete: { status: number; body: unknown } = { status: 200, body: { ok: true } }

function stubVehicles() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ method, url })
    if (method === 'DELETE') return jsonRes(vehicleDelete.body, vehicleDelete.status)
    if (method === 'POST' && url.endsWith('/restore')) return jsonRes({ ok: true })
    if (url === '/api/vehicles?deleted=1') return jsonRes({ data: [GONE] })
    if (url === '/api/vehicles') return jsonRes({ data: [TRUCK, BROKEN] })
    return jsonRes({ data: [] })
  }))
}

describe('vehicles — Delete, Undo, Show deleted → Restore, ?status=', () => {
  beforeEach(() => { calls = []; vehicleDelete = { status: 200, body: { ok: true } }; stubVehicles() })

  const rowOf = (name: string) => screen.getByText(name).closest('tr')!
  async function renderPage() {
    render(<ToastProvider><AdminVehiclesPage /></ToastProvider>)
    await screen.findByText('Truck-01')
  }

  it('a refused Delete closes the dialog and the red toast names what is in the way', async () => {
    vehicleDelete = { status: 409, body: { error: "Truck-01 is on Brett Hill's deployment — end or transfer it first." } }
    await renderPage()
    fireEvent.click(within(rowOf('Truck-01')).getByRole('button', { name: 'Delete' }))
    const dlg = await screen.findByRole('dialog', { name: 'Delete vehicle?' })
    expect(dlg).toHaveTextContent('Restorable under Show deleted.')
    expect(dlg).not.toHaveTextContent(/can.t be undone/i)
    fireEvent.click(within(dlg).getByRole('button', { name: 'Delete' }))
    const msg = await screen.findByText("Truck-01 is on Brett Hill's deployment — end or transfer it first.")
    expect(severityOf(msg)).toContain('MuiAlert-colorError')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete vehicle?' })).not.toBeInTheDocument())
  })

  it('Delete → toast with Undo, which posts restore', async () => {
    await renderPage()
    fireEvent.click(within(rowOf('Truck-01')).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Delete vehicle?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(writes('DELETE', '/api/vehicles/v1')).toHaveLength(1))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(writes('POST', '/api/vehicles/v1/restore')).toHaveLength(1))
    expect(await screen.findByText('Truck-01 restored')).toBeInTheDocument()
  })

  it('Show deleted reads deleted=1; a deleted row carries its badge and only Restore', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show deleted' }))
    await screen.findByText('Old trailer')
    expect(calls.some((c) => c.url === '/api/vehicles?deleted=1')).toBe(true)
    const row = rowOf('Old trailer')
    expect(within(row).getByText(/^Deleted \d+ Oct$/)).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(writes('POST', '/api/vehicles/v9/restore')).toHaveLength(1))
    expect(await screen.findByText('Old trailer restored')).toBeInTheDocument()
  })

  it('?status=IN_MAINTENANCE (the dashboard card) lands on the filtered list', async () => {
    window.history.replaceState(null, '', '/admin/vehicles?status=IN_MAINTENANCE')
    render(<ToastProvider><AdminVehiclesPage /></ToastProvider>)
    await screen.findByText('Can-Am #1')
    await waitFor(() => expect(screen.queryByText('Truck-01')).not.toBeInTheDocument())
  })
})

// ── Hubs ─────────────────────────────────────────────────────────────────
const HUB = { id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH', email: null, isActive: true }
const inbound = (id: string, itemName: string) => ({
  statusLinkId: id, unitId: `u-${id}`, itemName, serial: null, state: 'ISSUED',
  issuedAt: '2026-10-08T12:00:00Z', viewedAt: null, expiresAt: '2026-10-20T12:00:00Z', discrepancy: null, allEvents: [],
})
let receiveStatus: Record<string, number> = {}

function stubHubs() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ method, url })
    const m = url.match(/^\/api\/status-links\/([^/]+)\/receive$/)
    if (m) {
      const status = receiveStatus[m[1]!] ?? 200
      return jsonRes(status < 400 ? { ok: true } : { error: 'Already received by the hub.' }, status)
    }
    if (url.startsWith('/api/hubs/inbound')) {
      return jsonRes({
        data: [{ hubId: 'h1', hubName: 'Toledo Hub', location: null, email: null, units: [inbound('sl1', 'GPS rover'), inbound('sl2', 'Corer')] }],
        counts: { totalPending: 2, discrepancies: 0 },
      })
    }
    if (url === '/api/hubs') return jsonRes({ data: [HUB] })
    return jsonRes({ data: [] })
  }))
}

describe('hubs — red failures, honest bulk Receive, Deactivate says Deactivate', () => {
  beforeEach(() => { calls = []; receiveStatus = {}; stubHubs() })

  async function openInbound() {
    render(<ToastProvider><AdminHubsPage /></ToastProvider>)
    fireEvent.click(await screen.findByRole('tab', { name: /Inbound/ }))
    await screen.findByText('GPS rover')
  }

  it('a failed Received is a red toast with the server message', async () => {
    receiveStatus = { sl1: 409 }
    await openInbound()
    fireEvent.click(within(screen.getByText('GPS rover').closest('tr')!).getByRole('button', { name: 'Received' }))
    const msg = await screen.findByText('Already received by the hub.')
    expect(severityOf(msg)).toContain('MuiAlert-colorError')
  })

  it('bulk Receive reads every result — one failure is reported, not counted as received', async () => {
    receiveStatus = { sl2: 500 }
    await openInbound()
    for (const name of ['GPS rover', 'Corer']) {
      fireEvent.click(within(screen.getByText(name).closest('tr')!).getByRole('checkbox'))
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Receive' }))
    const msg = await screen.findByText('1 marked received · 1 could not be received.')
    expect(severityOf(msg)).toContain('MuiAlert-colorWarning')
  })

  it('the deactivate confirm button says "Deactivate"', async () => {
    render(<ToastProvider><AdminHubsPage /></ToastProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }))
    const dlg = await screen.findByRole('dialog', { name: 'Deactivate "Toledo Hub"?' })
    expect(within(dlg).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
    expect(within(dlg).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

// ── Item Delete: reserved details space ─────────────────────────────────────
describe('item Delete — the details space is reserved before they load', () => {
  it('the details block is there (empty, min-height set) before the references read lands', async () => {
    calls = []
    let releaseFacts: () => void = () => {}
    const factsGate = new Promise<void>((r) => { releaseFacts = r })
    const ITEM = {
      id: 'i1', name: 'GPS rover', category: { id: 'c1', name: 'Sampling' }, itemType: 'SERIALIZED', status: 'AVAILABLE',
      qrCodeId: 'qr-i1', activeProjects: [], currentOperator: null, currentProject: null, units: [],
      unitCounts: { totalUnits: 0, available: 0, checkedOut: 0, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 },
      itemCounts: { owned: 3, onHand: 3, available: 3, reserved: 0, out: 0, inMaintenance: 0, inoperable: 0, inTransit: 0, retired: 0 },
    }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/inventory?')) return jsonRes({ data: [ITEM], total: 1 })
      if (url.endsWith('/references')) {
        return factsGate.then(() => jsonRes({ data: { itemType: 'SERIALIZED', units: { AVAILABLE: 3 }, stock: { onHand: 0, hubs: 0 }, history: { deployments: 0, checkLogs: 0, repairs: 0, photos: 0 } } }))
      }
      return jsonRes({ data: [] })
    }))
    render(<ToastProvider><AdminInventoryPage /></ToastProvider>)
    fireEvent.click(within((await screen.findByText('GPS rover')).closest('tr')!).getByRole('button', { name: 'Delete' }))
    const dlg = await screen.findByRole('dialog', { name: 'Delete item?' })
    const details = within(dlg).getByTestId('delete-details')
    expect(details).toBeEmptyDOMElement()
    expect(details).toHaveStyle({ minHeight: '68px' })
    releaseFacts()
    expect(await within(dlg).findByText('Restorable under Show deleted.')).toBeInTheDocument()
    // The same block filled in — nothing was inserted above the buttons.
    expect(within(dlg).getByTestId('delete-details')).toBe(details)
  })
})

// ── ReportProblemDialog: kit-only lines ─────────────────────────────────────
describe('ReportProblemDialog — the kit lines only for a unit in my kit (U-15)', () => {
  const KIT_LINE = 'Reporting keeps it in your kit — use Return to Hub to send it back.'
  const renderFor = (subject: { kind: 'unit' | 'vehicle'; id: string; name: string; inMyKit?: boolean }) =>
    render(<ToastProvider><ReportProblemDialog open subject={subject} onClose={() => {}} /></ToastProvider>)

  it('a vehicle never says "your kit" or "Return to Hub"', () => {
    renderFor({ kind: 'vehicle', id: 'v1', name: 'Truck-01' })
    expect(screen.queryByText(KIT_LINE)).not.toBeInTheDocument()
    expect(screen.getByText('Stays in use. An admin will follow up.')).toBeInTheDocument()
  })

  it("a crewmate's unit (not in my kit) doesn't either", () => {
    renderFor({ kind: 'unit', id: 'u1', name: 'GPS rover', inMyKit: false })
    expect(screen.queryByText(KIT_LINE)).not.toBeInTheDocument()
    expect(screen.queryByText('Stays in your kit. An admin will follow up.')).not.toBeInTheDocument()
  })

  it('a unit in my kit keeps both lines', () => {
    renderFor({ kind: 'unit', id: 'u1', name: 'GPS rover', inMyKit: true })
    expect(screen.getByText(KIT_LINE)).toBeInTheDocument()
    expect(screen.getByText('Stays in your kit. An admin will follow up.')).toBeInTheDocument()
  })
})
