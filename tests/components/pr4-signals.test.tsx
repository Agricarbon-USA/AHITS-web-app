// PR-5: the page's useMutation mounts the real offline queue, which opens IndexedDB.
import 'fake-indexeddb/auto'
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'
import { emailOutcomeToast } from '@/lib/email-outcome'

// PR-4 (D-j · P-9): every "emailed" toast says where the message actually went, and
// the dashboard hides Resolve for alert types that clear themselves.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))

import AdminDashboardPage from '@/app/(admin)/admin/dashboard/page'

describe('email outcome wording (D-j)', () => {
  it('SENT names the recipient; REDIRECTED names the sandbox inbox and says copy the link', () => {
    expect(emailOutcomeToast({ emailed: 'SENT', deliveredTo: 'shop@acme.example' }, 'Work order'))
      .toEqual({ message: 'Work order emailed to shop@acme.example.', severity: 'success' })
    expect(emailOutcomeToast({ emailed: 'REDIRECTED', deliveredTo: 'sandbox@test.example' }, 'Work order'))
      .toEqual({ message: 'Sandbox is on — redirected to sandbox@test.example; copy the link.', severity: 'warning' })
  })

  it('SKIPPED: no address on file vs sandbox with no inbox; FAILED is an error', () => {
    expect(emailOutcomeToast({ emailed: 'SKIPPED', emailSkipReason: 'NO_RECIPIENT' }, 'Hub link').message)
      .toBe('No email on file — copy the link.')
    expect(emailOutcomeToast({ emailed: 'SKIPPED', emailSkipReason: 'SANDBOX' }, 'Hub link').message)
      .toBe('Sandbox is on — not sent; copy the link.')
    expect(emailOutcomeToast({ emailed: 'FAILED' }, 'Hub link').severity).toBe('error')
  })
})

describe('dashboard: Resolve is hidden for alerts that clear themselves (P-9)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('LOW_INVENTORY shows "Clears itself when the condition ends"; DAMAGE_REPORTED keeps Resolve', async () => {
    const alerts = [
      { id: 'a1', type: 'LOW_INVENTORY', sourceTable: 'inventory_items', sourceId: 'i:h', metadata: { itemName: 'Bags' }, triggeredAt: '2026-10-09T10:00:00Z', resolved: false },
      { id: 'a2', type: 'DAMAGE_REPORTED', sourceTable: 'maintenance_tasks', sourceId: 't1', metadata: { itemName: 'Corer' }, triggeredAt: '2026-10-09T09:00:00Z', resolved: false },
    ]
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const body = url === '/api/admin/alerts'
        ? { data: alerts, total: 2, page: 1, pageSize: 50, truncated: false }
        : url === '/api/dashboard'
          ? { data: { activeDeployments: 0, vehiclesActive: 0, vehiclesInMaintenance: 0, itemsCheckedOut: 0, overdueMaintenanceCount: 0, pendingAlertsCount: 2, todayChecksSubmitted: 0 } }
          : { data: { counts: { missedChecks: 0, maintenanceDueSoon: 0, longRunning: 0 }, missedChecks: [], maintenanceDueSoon: [], longRunning: [], recentActivity: [], maintenanceWatch: [] } }
      return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
    }))
    render(<ToastProvider><AdminDashboardPage /></ToastProvider>)

    const low = (await screen.findByText('Bags')).closest('li')!
    expect(within(low).getByText('Clears itself when the condition ends')).toBeInTheDocument()
    expect(within(low).queryByRole('button', { name: 'Resolve' })).toBeNull()

    const damage = screen.getByText('Corer').closest('li')!
    expect(within(damage).getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
  })
})
