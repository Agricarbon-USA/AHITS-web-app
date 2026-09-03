import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// UXP-6 (6b): the vehicle form on EntityFormDialog + the drawer's Setup block.
//  - Create posts the scanned/typed `qrCodeId` (server accepted it since PRD §7.7; no UI
//    sent it — T9); edit never sends it (PATCH is `.strict()` and excludes it by design).
//  - A server field error lands on the field (aria-invalid + helper text), not a toast.
//  - Duplicate opens create mode prefilled minus the uniques (name "(copy)", VIN/plate
//    /QR/agreement cleared).
//  - The Setup block deep-links the D24 chain: checklist editor (?checklist=<TYPE>),
//    Add-scheduled-task (?sched=vehicle:<id>), and the QR label download.
//  - "<name> added · Open" opens the new vehicle's drawer.
//  - Fit: the drawer and the form never overlap (one armed history guard at a time).
// Driven through the real page — the wiring IS the thing under test.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/vehicles',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/useHistoryGuard', () => ({ useHistoryGuard: () => {} }))
const { downloadQrLabel } = vi.hoisted(() => ({ downloadQrLabel: vi.fn(async () => {}) }))
vi.mock('@/lib/qr-label', () => ({ downloadQrLabel }))

import AdminVehiclesPage from '@/app/(admin)/admin/vehicles/page'

const HUBS = [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }]
const TEMPLATES = [
  { id: 't-truck', name: 'Truck daily', vehicleType: 'TRUCK', isActive: true, items: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] },
  { id: 't-old', name: 'Old truck list', vehicleType: 'TRUCK', isActive: false, items: [{ key: 'a', label: 'A' }] },
]
const baseVehicle = {
  type: 'TRUCK', status: 'ACTIVE', year: 2022, odometer: 12000, location: null, hubId: 'h1', hubName: 'Toledo Hub',
  assignedOperatorName: null, activeProjects: [], insuranceExpires: null, registrationExpires: null, notes: null,
  isRental: false, rentalCompany: null, rentalAgreementNumber: null, rentalAgreementUrl: null, rentalStartDate: null,
  rentalEndDate: null, rentalLocation: null, rentalReturnLocation: null, rentalCostAmount: null, rentalCostPeriod: null,
  rentalOneWay: false, _count: { dailyChecks: 0, maintenanceTasks: 2 },
}
const TRUCK = { ...baseVehicle, id: 'v1', name: 'Truck 1', makeModel: 'Ford F-250', vin: '1FTSW21P', licensePlate: 'ABC-123', qrCodeId: 'qr-truck-1-code' }
const ATV = { ...baseVehicle, id: 'v2', name: 'ATV 2', type: 'ATV', makeModel: null, vin: null, licensePlate: null, qrCodeId: 'qr-atv-2-code' }
const DETAIL = {
  ...TRUCK,
  dailyChecks: [],
  maintenanceTasks: [
    { id: 'm1', taskName: 'Oil change', status: 'UPCOMING', nextDue: null, actualCost: null, isDamageReport: false, intervalValue: 90, deletedAt: null },
    { id: 'm2', taskName: 'Cracked mirror', status: 'IN_PROGRESS', nextDue: null, actualCost: null, isDamageReport: true, intervalValue: 0, deletedAt: null },
  ],
  photos: [],
}

const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response)

const posts: Record<string, unknown>[] = []
const patches: { url: string; body: Record<string, unknown> }[] = []
const detailFetches: string[] = []
let postResponse: () => Promise<Response> = () => jsonRes({ data: { id: 'v-new' } }, 201)

function mockFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/vehicles' && init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)))
      return postResponse()
    }
    if (init?.method === 'PATCH') {
      patches.push({ url, body: JSON.parse(String(init.body)) })
      return jsonRes({ data: { id: url.split('/').pop() } })
    }
    if (url === '/api/vehicles') return jsonRes({ data: [TRUCK, ATV] })
    if (url.startsWith('/api/vehicles/')) {
      detailFetches.push(url)
      const id = url.split('/').pop()
      return jsonRes({ data: id === 'v-new' ? { ...DETAIL, id: 'v-new', name: 'Truck 9', qrCodeId: 'sticker-9' } : DETAIL })
    }
    if (url === '/api/hubs') return jsonRes({ data: HUBS })
    if (url === '/api/checklist-templates') return jsonRes({ data: TEMPLATES })
    return jsonRes({ data: [] })
  })
}

beforeEach(() => {
  posts.length = 0
  patches.length = 0
  detailFetches.length = 0
  downloadQrLabel.mockClear()
  postResponse = () => jsonRes({ data: { id: 'v-new' } }, 201)
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => { vi.unstubAllGlobals() })

async function renderPage() {
  render(<ToastProvider><AdminVehiclesPage /></ToastProvider>)
  await screen.findByText('Truck 1')
}

const dialog = () => screen.getByRole('dialog')
const field = (label: string | RegExp) => within(dialog()).getByLabelText(label) as HTMLInputElement

describe('UXP-6 (6b): vehicle form on EntityFormDialog', () => {
  it('Add vehicle: sentence-case title, required legend, and the create-only QR field posts qrCodeId', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }))
    expect(within(dialog()).getByText('Add vehicle')).toBeInTheDocument()
    expect(within(dialog()).getByText('required')).toBeInTheDocument()
    // The form Paper IS the form (pinned buttons, Enter submits).
    expect(dialog().tagName).toBe('FORM')
    // Labels carry no "(optional)" any more.
    expect(within(dialog()).queryByLabelText(/optional/i)).toBeNull()

    fireEvent.change(field(/^Name/), { target: { value: 'Truck 9' } })
    fireEvent.change(field('Existing QR label'), { target: { value: '  sticker-9 ' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ name: 'Truck 9', type: 'TRUCK', qrCodeId: 'sticker-9' })
    // Blank optional fields are still omitted, not sent as null (POST contract).
    expect(posts[0]).not.toHaveProperty('vin')
    expect(posts[0]).not.toHaveProperty('status')
  })

  it('omits qrCodeId entirely when the QR field is blank', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }))
    fireEvent.change(field(/^Name/), { target: { value: 'Truck 10' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).not.toHaveProperty('qrCodeId')
  })

  it('"<name> added · Open" opens the new vehicle\'s drawer', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }))
    fireEvent.change(field(/^Name/), { target: { value: 'Truck 9' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Truck 9 added')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(detailFetches).toContain('/api/vehicles/v-new'))
    expect(await screen.findByRole('heading', { name: 'Truck 9' })).toBeInTheDocument()
  })

  it('Edit vehicle: no QR field, and the PATCH body never carries qrCodeId', async () => {
    await renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(within(dialog()).getByText('Edit vehicle')).toBeInTheDocument()
    expect(within(dialog()).queryByLabelText('Existing QR label')).toBeNull()
    expect(field(/^Name/).value).toBe('Truck 1')
    expect(within(dialog()).getByLabelText('Status')).toBeInTheDocument()

    fireEvent.change(field(/^Name/), { target: { value: 'Truck 1b' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].url).toBe('/api/vehicles/v1')
    expect(patches[0].body).toMatchObject({ name: 'Truck 1b', status: 'ACTIVE', hubId: 'h1', vin: '1FTSW21P', notes: null })
    expect(patches[0].body).not.toHaveProperty('qrCodeId')
    expect(await screen.findByText('Truck 1b updated')).toBeInTheDocument()
  })

  it('lands a server field error on the field (aria-invalid + message) instead of a "Save failed" toast', async () => {
    postResponse = () => jsonRes({ error: { fieldErrors: { vin: ['VIN must be 17 characters'] }, formErrors: [] } }, 400)
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }))
    fireEvent.change(field(/^Name/), { target: { value: 'Truck 9' } })
    fireEvent.change(field('VIN'), { target: { value: 'short' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }))

    expect(await within(dialog()).findByText('VIN must be 17 characters')).toBeInTheDocument()
    expect(field('VIN')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Save failed')).toBeNull()
    // Still open — nothing lost.
    expect(field(/^Name/).value).toBe('Truck 9')
  })

  it('maps the 409 "same name" clash onto the Name field', async () => {
    postResponse = () => jsonRes({ error: 'A vehicle with the same name already exists.' }, 409)
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }))
    fireEvent.change(field(/^Name/), { target: { value: 'Truck 1' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }))
    expect(await within(dialog()).findByText('A vehicle with the same name already exists.')).toBeInTheDocument()
    expect(field(/^Name/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('blocks an empty name inline (no toast) and marks the field', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }))
    expect(await within(dialog()).findByText('Name is required')).toBeInTheDocument()
    expect(field(/^Name/)).toHaveAttribute('aria-invalid', 'true')
    expect(posts).toHaveLength(0)
  })

  it('Duplicate: create mode prefilled from the vehicle minus the uniques', async () => {
    await renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: 'Duplicate' })[0])
    expect(within(dialog()).getByText('Add vehicle')).toBeInTheDocument()
    expect(field(/^Name/).value).toBe('Truck 1 (copy)')
    expect(field('Make / Model').value).toBe('Ford F-250')
    expect(field('Year').value).toBe('2022')
    expect(field('VIN').value).toBe('')
    expect(field('License plate').value).toBe('')
    expect(field('Odometer').value).toBe('')
    expect(field('Existing QR label').value).toBe('')
    // Home hub carried over (spec, not a unique).
    expect(field('Home hub').value).toBe('Toledo Hub · Toledo, OH')

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ name: 'Truck 1 (copy)', type: 'TRUCK', makeModel: 'Ford F-250', hubId: 'h1' })
    expect(posts[0]).not.toHaveProperty('vin')
    expect(posts[0]).not.toHaveProperty('licensePlate')
    expect(posts[0]).not.toHaveProperty('qrCodeId')
  })
})

describe('UXP-6 (6b): the drawer and the form never overlap (one armed Back guard)', () => {
  it('Edit from the drawer closes the drawer first and brings it back on Cancel', async () => {
    await renderPage()
    fireEvent.click(screen.getByText('Truck 1'))
    await screen.findByRole('heading', { name: 'Truck 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    // The form is open and the drawer is gone.
    expect(await screen.findByText('Edit vehicle')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Truck 1' })).toBeNull())
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    // Drawer re-opens on the same vehicle (a fresh fetch).
    expect(await screen.findByRole('heading', { name: 'Truck 1' })).toBeInTheDocument()
    expect(detailFetches.filter((u) => u === '/api/vehicles/v1').length).toBeGreaterThanOrEqual(2)
  })

  it('Edit from the drawer → Save brings the refreshed drawer back with "<name> updated"', async () => {
    await renderPage()
    fireEvent.click(screen.getByText('Truck 1'))
    await screen.findByRole('heading', { name: 'Truck 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await screen.findByText('Edit vehicle')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(await screen.findByText('Truck 1 updated')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Truck 1' })).toBeInTheDocument()
  })

  it('Duplicate from the drawer opens create mode with the "(copy)" name', async () => {
    await renderPage()
    fireEvent.click(screen.getByText('Truck 1'))
    await screen.findByRole('heading', { name: 'Truck 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(await screen.findByText('Add vehicle')).toBeInTheDocument()
    expect(field(/^Name/).value).toBe('Truck 1 (copy)')
  })
})

// ── SETUP BLOCK (6b, second commit) ──────────────────────────────────────────
describe('UXP-6 (6b): vehicle drawer Setup block', () => {
  it('names the active checklist, counts service schedules, and deep-links both', async () => {
    await renderPage()
    fireEvent.click(screen.getByText('Truck 1'))
    await screen.findByText('Setup')
    // The ACTIVE Truck template (the inactive one is ignored), with its item count.
    expect(screen.getByText('Truck daily (2 items)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/admin/settings?checklist=TRUCK')
    // One recurring schedule; the damage report is not a schedule.
    expect(screen.getByText('Service schedules (1)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add' })).toHaveAttribute('href', '/admin/maintenance?sched=vehicle:v1')
  })

  it('QR label → Download renders the vehicle\'s own qrCodeId via the shared helper', async () => {
    await renderPage()
    fireEvent.click(screen.getByText('Truck 1'))
    await screen.findByText('Setup')
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(downloadQrLabel).toHaveBeenCalledWith('qr-truck-1-code', 'Truck 1')
  })

})
