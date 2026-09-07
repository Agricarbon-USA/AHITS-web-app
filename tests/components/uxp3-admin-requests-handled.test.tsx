import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// UXP-3 (3c / F-03 + F-04): the admin's close of a MATERIAL request.
//  - The REQUESTED-state button is "Mark Handled" (D9: "Fulfill" is reserved for the
//    stock-moving reservation flow) while the API action key stays `fulfill`.
//  - The success toast names the outcome — the requester is now notified server-side —
//    instead of the generic "Done.". Same toast for the FORWARDED→complete close.
//  - The RESERVATION+STAGED "Fulfill" button is untouched (it moves stock).
// Driven through the real page: the card + toast wiring is the thing under test.

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/admin/requests',
  useSearchParams: () => new URLSearchParams(),
}))

import AdminRequestsPage from '@/app/(admin)/admin/requests/page'

const ROWS = [
  {
    id: 'r-material', status: 'REQUESTED', requestType: 'MATERIAL', label: 'Sample vials',
    neededBy: null, createdAt: '2026-09-01T00:00:00Z', requestedByName: 'Op One', forOperatorName: null,
    projectName: null, lineCount: 1, fulfillerHubId: null, fulfillerOperatorId: null, decisionNote: null,
  },
  {
    id: 'r-reservation', status: 'STAGED', requestType: 'RESERVATION', label: 'Rig for TX',
    neededBy: null, createdAt: '2026-09-01T00:00:00Z', requestedByName: 'Op Two', forOperatorName: null,
    projectName: null, lineCount: 2, fulfillerHubId: 'h1', fulfillerOperatorId: null, decisionNote: null,
  },
  {
    id: 'r-forwarded', status: 'FORWARDED', requestType: 'MATERIAL', label: 'Drill bits',
    neededBy: null, createdAt: '2026-09-01T00:00:00Z', requestedByName: 'Op Three', forOperatorName: null,
    projectName: null, lineCount: 1, fulfillerHubId: 'h1', fulfillerOperatorId: null, decisionNote: null,
  },
]

const jsonRes = (body: unknown, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body } as Response)

const patches: { url: string; body: Record<string, unknown> }[] = []

function mockFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'PATCH') {
      patches.push({ url, body: JSON.parse(String(init.body)) })
      return jsonRes({ ok: true })
    }
    if (url === '/api/deployment-requests') return jsonRes({ data: ROWS })
    if (url.startsWith('/api/hubs')) return jsonRes({ data: [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }] })
    if (url.startsWith('/api/operators')) return jsonRes({ data: [] })
    return jsonRes({ data: [] })
  })
}

beforeEach(() => {
  patches.length = 0
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => { vi.unstubAllGlobals() })

function cardFor(label: string): HTMLElement {
  const el = screen.getByText(label).closest('.MuiCard-root')
  if (!el) throw new Error(`no card for ${label}`)
  return el as HTMLElement
}

async function renderPage() {
  render(<ToastProvider><AdminRequestsPage /></ToastProvider>)
  await screen.findByText('Sample vials')
}

describe('UXP-3 (3c): admin "Mark Handled" on a MATERIAL request', () => {
  it('labels the REQUESTED-state close "Mark Handled" — no "Fulfill" on a material card (F-03 / D9)', async () => {
    await renderPage()
    const card = cardFor('Sample vials')
    expect(within(card).getByRole('button', { name: 'Mark Handled' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Fulfill' })).toBeNull()
  })

  it('sends the unchanged `fulfill` action and toasts "Marked handled — Op One notified"', async () => {
    await renderPage()
    fireEvent.click(within(cardFor('Sample vials')).getByRole('button', { name: 'Mark Handled' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]!.url).toBe('/api/deployment-requests/r-material')
    expect(patches[0]!.body).toEqual({ action: 'fulfill' })
    expect(await screen.findByText('Marked handled — Op One notified')).toBeInTheDocument()
  })

  it('keeps "Fulfill" on the stock-moving RESERVATION+STAGED card (D9 guard)', async () => {
    await renderPage()
    const card = cardFor('Rig for TX')
    expect(within(card).getByRole('button', { name: 'Fulfill' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Mark Handled' })).toBeNull()
  })

  it('the FORWARDED close ("Mark Handled" → complete) gets the same named toast', async () => {
    await renderPage()
    fireEvent.click(within(cardFor('Drill bits')).getByRole('button', { name: 'Mark Handled' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]!.url).toBe('/api/deployment-requests/r-forwarded')
    expect(patches[0]!.body).toEqual({ action: 'complete' })
    expect(await screen.findByText('Marked handled — Op Three notified')).toBeInTheDocument()
  })
})
