import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// UXP-6 (6b): `/admin/maintenance?sched=vehicle:<id>` — the vehicle drawer's
// "Service schedules · Add" — opens the CC-34 Add-scheduled-task dialog prefilled
// with that vehicle (same URL grammar as the `?task=` alert deep-link).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/maintenance',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/useHistoryGuard', () => ({ useHistoryGuard: () => {} }))

import AdminMaintenancePage from '@/app/(admin)/admin/maintenance/page'

const jsonRes = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)

function mockFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/vehicles') return jsonRes({ data: [{ id: 'v1', name: 'Truck 1' }, { id: 'v2', name: 'ATV 2' }] })
    if (url.startsWith('/api/hubs')) return jsonRes([])
    if (url.startsWith('/api/deployments')) return jsonRes([])
    return jsonRes({ data: [] })
  })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/maintenance')
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => { vi.unstubAllGlobals() })

describe('UXP-6 (6b): ?sched=vehicle:<id> opens Add scheduled task prefilled', () => {
  it('opens the dialog with Subject = Vehicle and that vehicle picked', async () => {
    window.history.replaceState(null, '', '/admin/maintenance?sched=vehicle:v1')
    render(<ToastProvider><AdminMaintenancePage /></ToastProvider>)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Add scheduled task')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Subject')).toHaveTextContent('Vehicle')
    // The picker shows the prefilled vehicle once the list lands.
    expect(await within(dialog).findByDisplayValue('Truck 1')).toBeInTheDocument()
  })

  it('does nothing without the param', async () => {
    render(<ToastProvider><AdminMaintenancePage /></ToastProvider>)
    await screen.findByText('Maintenance')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
