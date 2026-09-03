import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// UXP-6 (6e): the checklist editor on EntityFormDialog, entered FROM the fleet.
//  - `/admin/settings?checklist=<TYPE>` opens the editor on that type's ACTIVE template
//    (T7: the newest-edited active one — the one operators actually get), or on a new
//    template prefilled with the type; a bare `?checklist=` just lands on the card.
//  - Saving a second ACTIVE template for a type warns (T7: "newest edited silently
//    wins") with Continue / Cancel — Cancel sends nothing.
//  - Duplicate → create mode "<name> (copy)" with the items carried over.
//  - Validation is inline (name on the field, items as the form Alert), not a toast.
// Driven through the real Settings page so the URL reader + prop wiring is covered.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/settings',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/useHistoryGuard', () => ({ useHistoryGuard: () => {} }))
// The other Settings cards fetch on mount and are not under test here.
vi.mock('@/components/admin/EmailDeliverySection', () => ({ default: () => null }))
vi.mock('@/components/admin/SentryDiagnosticsSection', () => ({ default: () => null }))

import SettingsPage from '@/app/(admin)/admin/settings/page'

// List order mirrors the API: isActive DESC, vehicleType ASC, updatedAt DESC — so the
// FIRST active Truck row is the winner, and the inactive Truck row sorts last.
const TEMPLATES = [
  { id: 't-truck', name: 'Truck daily', vehicleType: 'TRUCK', isActive: true, items: [{ key: 'tires', label: 'Tires' }, { key: 'lights', label: 'Lights' }] },
  { id: 't-general', name: 'Everything list', vehicleType: null, isActive: true, items: [{ key: 'walk', label: 'Walk-around' }] },
  { id: 't-old', name: 'Old truck list', vehicleType: 'TRUCK', isActive: false, items: [{ key: 'a', label: 'A' }] },
]

const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response)

const writes: { url: string; method: string; body: Record<string, unknown> }[] = []

function mockFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST' || init?.method === 'PUT') {
      writes.push({ url, method: init.method, body: JSON.parse(String(init.body)) })
      return jsonRes(init.method === 'POST' ? { id: 't-new' } : { ok: true }, init.method === 'POST' ? 201 : 200)
    }
    if (url === '/api/checklist-templates') return jsonRes({ data: TEMPLATES })
    if (url === '/api/categories') return jsonRes([])
    if (url === '/api/admin/notification-config') return jsonRes({ data: { dailyCheckCutoff: '18:00', disabledAlertTypes: [], configurableTypes: [] } })
    return jsonRes({ data: [] })
  })
}

beforeEach(() => {
  writes.length = 0
  window.history.replaceState(null, '', '/admin/settings')
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => { vi.unstubAllGlobals() })

async function renderSettings(search = '') {
  window.history.replaceState(null, '', `/admin/settings${search}`)
  render(<ToastProvider><SettingsPage /></ToastProvider>)
  await screen.findByText('Truck daily')
}

const dialog = () => screen.getByRole('dialog')
const nameField = () => within(dialog()).getByLabelText(/^Checklist name/) as HTMLInputElement

function pick(labelText: string | RegExp, option: string) {
  fireEvent.mouseDown(within(dialog()).getByLabelText(labelText))
  fireEvent.click(within(screen.getByRole('listbox')).getByText(option))
}

/** The template row in the card's table (not the dialog). */
function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr')
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

describe('UXP-6 (6e): ?checklist= deep-link from Vehicles', () => {
  it('opens the editor on the ACTIVE template for that type (not the inactive one)', async () => {
    await renderSettings('?checklist=TRUCK')
    expect(await screen.findByText('Edit checklist')).toBeInTheDocument()
    expect(nameField().value).toBe('Truck daily')
    expect(within(dialog()).getByLabelText('Item 1')).toHaveValue('Tires')
    expect(within(dialog()).getByLabelText('Item 2')).toHaveValue('Lights')
  })

  it('opens a NEW template prefilled with the type when none is active for it', async () => {
    await renderSettings('?checklist=ATV')
    expect(await screen.findByText('Add checklist')).toBeInTheDocument()
    expect(nameField().value).toBe('')
    expect(within(dialog()).getByLabelText('Applies to')).toHaveTextContent('ATV')
    // The required legend is there (name + at least one item).
    expect(within(dialog()).getByText('required')).toBeInTheDocument()
  })

  it('a bare ?checklist= (the Vehicles toolbar button) lands on the card without opening a dialog', async () => {
    await renderSettings('?checklist=')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Daily-Check Checklists')).toBeInTheDocument()
  })

  it('ignores an unknown type', async () => {
    await renderSettings('?checklist=SPACESHIP')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('UXP-6 (6e): duplicate-active warning (T7)', () => {
  it('warns before saving a second ACTIVE Truck checklist; Cancel sends nothing, Continue saves', async () => {
    await renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Add Checklist' }))
    expect(within(dialog()).getByText('Add checklist')).toBeInTheDocument()
    fireEvent.change(nameField(), { target: { value: 'Second truck list' } })
    pick('Applies to', 'Truck')
    fireEvent.change(within(dialog()).getByLabelText('New item label'), { target: { value: 'Horn' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add item' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Another checklist is already active')).toBeInTheDocument()
    expect(screen.getByText(/Another active checklist already covers Truck — the most recently edited one wins\. Deactivate the other or continue\./)).toBeInTheDocument()
    expect(screen.getByText(/“Truck daily”/)).toBeInTheDocument()
    expect(writes).toHaveLength(0)

    // Cancel → still editing, nothing sent.
    const warning = screen.getByText('Another checklist is already active').closest('[role="dialog"]') as HTMLElement
    fireEvent.click(within(warning).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Another checklist is already active')).toBeNull())
    expect(writes).toHaveLength(0)
    expect(nameField().value).toBe('Second truck list')

    // Continue → the POST goes out.
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }))
    const warning2 = (await screen.findByText('Another checklist is already active')).closest('[role="dialog"]') as HTMLElement
    fireEvent.click(within(warning2).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ url: '/api/checklist-templates', method: 'POST' })
    expect(writes[0].body).toMatchObject({ name: 'Second truck list', vehicleType: 'TRUCK', items: [{ label: 'Horn' }] })
    expect(await screen.findByText('Second truck list added')).toBeInTheDocument()
  })

  it('does not warn when the type has no other active checklist, or when this one is being deactivated', async () => {
    await renderSettings()
    // Editing the active Truck template itself → no rival (it is excluded by id).
    fireEvent.click(within(rowFor('Truck daily')).getByRole('button', { name: 'Edit' }))
    expect(within(dialog()).getByText('Edit checklist')).toBeInTheDocument()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ url: '/api/checklist-templates/t-truck', method: 'PUT' })
    expect(writes[0].body).toMatchObject({ isActive: true, vehicleType: 'TRUCK' })
    expect(screen.queryByText('Another checklist is already active')).toBeNull()
  })

  it('warns on re-activating the inactive Truck list while the active one stands', async () => {
    await renderSettings()
    fireEvent.click(within(rowFor('Old truck list')).getByRole('button', { name: 'Edit' }))
    pick('Status', 'Active')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Another checklist is already active')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })
})

describe('UXP-6 (6e): Duplicate + inline validation', () => {
  it('Duplicate opens create mode as "<name> (copy)" with the items carried over', async () => {
    await renderSettings()
    fireEvent.click(within(rowFor('Truck daily')).getByRole('button', { name: 'Duplicate' }))
    expect(within(dialog()).getByText('Add checklist')).toBeInTheDocument()
    expect(nameField().value).toBe('Truck daily (copy)')
    expect(within(dialog()).getByLabelText('Item 1')).toHaveValue('Tires')
    expect(within(dialog()).getByLabelText('Item 2')).toHaveValue('Lights')
    // Create mode: no Status field.
    expect(within(dialog()).queryByLabelText('Status')).toBeNull()
  })

  it('blocks an empty name and an empty item list inline — no request, no toast', async () => {
    await renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Add Checklist' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }))
    expect(await within(dialog()).findByText('Name is required')).toBeInTheDocument()
    expect(nameField()).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog()).getByText('Add at least one item, and give every item a label')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('the dialog Paper is a form with pinned Cancel/Add (one grammar)', async () => {
    await renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Add Checklist' }))
    expect(dialog().tagName).toBe('FORM')
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })
})
