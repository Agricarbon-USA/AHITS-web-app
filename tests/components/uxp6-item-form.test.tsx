import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider } from '@/components/shared/useToast'

// UXP-6 (6c): the item form on EntityFormDialog (plan §2 "Item → units → hub stock").
//  - T4: a SERIALIZED create posts the item, then `POST /api/inventory/<id>/units`
//    with `count` + positional `serialNumbers`; if that second call fails the drawer
//    opens on the Units tab with the error (and the serials) — nothing is lost.
//  - T5: a CONSUMABLE with initial quantity > 0 and no hub is a field error, no POST.
//  - T6: on edit a cleared nullable field (supplier) is sent as `null`; hub/category
//    are never nulled (the server cannot un-set them).
//  - "Save & add another" keeps type / category / hub; the success toast's Open
//    action opens the drawer.
// Driven through the real page: the toast → drawer wiring is part of what is under test.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/inventory',
  useSearchParams: () => new URLSearchParams(),
}))

import AdminInventoryPage from '@/app/(admin)/admin/inventory/page'

const CATEGORIES = [{ id: 'c1', name: 'Sampling' }, { id: 'c2', name: 'Instruments' }]
const HUBS = [{ id: 'h1', name: 'Toledo Hub', city: 'Toledo', state: 'OH' }]
const UNIT_COUNTS = { totalUnits: 0, available: 0, checkedOut: 0, inMaintenance: 0, inoperable: 0, retired: 0 }

const EXISTING = {
  id: 'i-1', name: 'Sample bags', category: { id: 'c1', name: 'Sampling' }, hub: HUBS[0],
  sku: null, quantity: 40, unitCost: '2.50', reorderUrl: null, supplier: 'Acme', location: null, qrCodeId: 'qr-1',
  notes: null, lowStockThreshold: null, itemType: 'CONSUMABLE', unitId: null, expectedQuantity: null,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  currentOperator: null, currentProject: null, activeProjects: [], unitCounts: UNIT_COUNTS, units: [],
  derivedQuantity: 40, availableQuantity: 40,
}

const detailFor = (id: string, name: string, itemType: string) => ({
  ...EXISTING, id, name, itemType, supplier: null, unitCost: null, quantity: 0, derivedQuantity: 0, availableQuantity: 0,
  checkLogs: [], photos: [],
})

type Call = { method: string; url: string; body: Record<string, unknown> }
const writes: Call[] = []
let listRows: unknown[] = []
let unitsResponse: { ok: boolean; status: number; body: unknown } = { ok: true, status: 201, body: { data: { units: [], unitCounts: UNIT_COUNTS } } }

const jsonRes = (body: unknown, ok = true, status = ok ? 200 : 400) =>
  Promise.resolve({ ok, status, json: async () => body } as Response)

function mockFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      writes.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : {} })
      if (method === 'POST' && url === '/api/inventory') {
        const body = JSON.parse(String(init?.body))
        return jsonRes({ data: { id: 'i-new', name: body.name, itemType: body.itemType } }, true, 201)
      }
      if (method === 'POST' && url === '/api/inventory/i-new/units') {
        return jsonRes(unitsResponse.body, unitsResponse.ok, unitsResponse.status)
      }
      if (method === 'PATCH' && url === '/api/inventory/i-1') return jsonRes({ data: { ...EXISTING, supplier: null } })
      return jsonRes({ data: {} })
    }
    if (url.startsWith('/api/inventory?')) return jsonRes({ data: listRows, total: listRows.length })
    if (url === '/api/inventory/categories') return jsonRes({ data: CATEGORIES })
    if (url === '/api/inventory/hubs') return jsonRes({ data: HUBS })
    if (url === '/api/inventory/i-new') return jsonRes({ data: detailFor('i-new', 'GPS unit', 'SERIALIZED') })
    if (url === '/api/inventory/i-new/stock') return jsonRes({ data: [] })
    if (url === '/api/users') return jsonRes({ data: [] })
    if (url === '/api/projects') return jsonRes({ data: [] })
    return jsonRes({ data: [] })
  })
}

beforeEach(() => {
  writes.length = 0
  listRows = []
  unitsResponse = { ok: true, status: 201, body: { data: { units: [], unitCounts: UNIT_COUNTS } } }
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => { vi.unstubAllGlobals() })

async function renderPage() {
  render(<ToastProvider><AdminInventoryPage /></ToastProvider>)
  // The list and the pickers (categories / hubs) all load on mount.
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/inventory/hubs'))
  await screen.findByText(listRows.length ? (listRows[0] as { name: string }).name : /No items found/)
}

const dialog = (name: string) => screen.getByRole('dialog', { name })

async function openAddItem() {
  fireEvent.click(screen.getByRole('button', { name: 'Add Item' }))
  return await screen.findByRole('dialog', { name: 'Add item' })
}

/** Pick an option in a SearchableSelect (MUI Autocomplete): open on mouseDown, click the option. */
async function pick(label: RegExp, option: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }))
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

const setField = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

const postsTo = (url: string) => writes.filter((w) => w.method === 'POST' && w.url === url)

describe('UXP-6 (6c): item form — grammar', () => {
  it('opens as "Add item" on EntityFormDialog: the Paper is the form, legend + required marks, pinned Cancel / Save & add another / Add item', async () => {
    await renderPage()
    const dlg = await openAddItem()
    expect(dlg.tagName).toBe('FORM')
    expect(within(dlg).getByText('required', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toBeRequired()
    expect(screen.getByRole('combobox', { name: /Category/ })).toBeRequired()
    const buttons = within(dlg).getAllByRole('button').filter((b) => b.closest('.MuiDialogActions-root')).map((b) => b.textContent)
    expect(buttons).toEqual(['Cancel', 'Save & add another', 'Add item'])
    // Every field of the old form is still here (plan §1 is the contract).
    for (const label of [/^Hub Location/, /^Initial Quantity/, /^Expected \/ Total Quantity/, /^Low Stock Alert Threshold/, /^Notes/]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Item Type')).toBeInTheDocument()
    expect(screen.getByLabelText('Consumable')).toBeChecked()
    expect(screen.getByLabelText('Serialized Item')).not.toBeChecked()
    expect(screen.getByText('Purchasing Info')).toBeInTheDocument()
  })

  it('labels hubs "name · city, state"', async () => {
    await renderPage()
    await openAddItem()
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Hub Location/ }))
    expect(await screen.findByRole('option', { name: 'Toledo Hub · Toledo, OH' })).toBeInTheDocument()
  })

  it('shows a server field error on its field (not a JSON blob) and a message for the form', async () => {
    await renderPage()
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST' && String(input) === '/api/inventory') {
        return jsonRes({ error: { fieldErrors: { reorderUrl: ['Invalid url'] }, formErrors: [] } }, false, 400)
      }
      return mockFetch()(input, init)
    })
    await openAddItem()
    setField(/^Name/, 'Sample bags')
    await pick(/Category/, 'Sampling')
    await pick(/Hub Location/, 'Toledo Hub · Toledo, OH')
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))
    // The purchasing accordion opens so the invalid field is visible, and the field carries the message.
    expect(await screen.findByText('Invalid url')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Reorder URL/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/fieldErrors/)).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Add item' })).toBeInTheDocument()
  })
})

describe('UXP-6 (6c): T4 — serialized create makes its units', () => {
  it('posts the item, then POST /api/inventory/<id>/units with count + positional serials', async () => {
    await renderPage()
    await openAddItem()
    setField(/^Name/, 'GPS unit')
    fireEvent.click(screen.getByLabelText('Serialized Item'))
    // "Initial Quantity" becomes "Units to create" + the serials field.
    expect(screen.queryByLabelText(/^Initial Quantity/)).toBeNull()
    setField(/^Units to create/, '3')
    setField(/^Serial numbers/, 'GPS-001\nGPS-002\n\nGPS-003\n')
    await pick(/Category/, 'Instruments')
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))

    await waitFor(() => expect(postsTo('/api/inventory/i-new/units')).toHaveLength(1))
    expect(postsTo('/api/inventory')[0]!.body).toMatchObject({ name: 'GPS unit', itemType: 'SERIALIZED', categoryId: 'c2', quantity: 3 })
    expect(postsTo('/api/inventory/i-new/units')[0]!.body).toEqual({ count: 3, serialNumbers: ['GPS-001', 'GPS-002', 'GPS-003'] })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add item' })).toBeNull())
    expect(await screen.findByText('GPS unit added')).toBeInTheDocument()
  })

  it('omits serialNumbers when none were typed, and skips the units call at 0', async () => {
    await renderPage()
    await openAddItem()
    setField(/^Name/, 'GPS unit')
    fireEvent.click(screen.getByLabelText('Serialized Item'))
    setField(/^Units to create/, '2')
    await pick(/Category/, 'Instruments')
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))
    await waitFor(() => expect(postsTo('/api/inventory/i-new/units')).toHaveLength(1))
    expect(postsTo('/api/inventory/i-new/units')[0]!.body).toEqual({ count: 2 })

    writes.length = 0
    await openAddItem()
    setField(/^Name/, 'Drill')
    fireEvent.click(screen.getByLabelText('Serialized Item'))
    setField(/^Units to create/, '0')
    await pick(/Category/, 'Instruments')
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))
    await waitFor(() => expect(postsTo('/api/inventory')).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add item' })).toBeNull())
    expect(postsTo('/api/inventory/i-new/units')).toHaveLength(0)
  })

  it('refuses more serials than units, and a count outside 0–200, without posting', async () => {
    await renderPage()
    await openAddItem()
    setField(/^Name/, 'GPS unit')
    fireEvent.click(screen.getByLabelText('Serialized Item'))
    await pick(/Category/, 'Instruments')
    setField(/^Units to create/, '1')
    setField(/^Serial numbers/, 'A\nB')
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))
    expect(await screen.findByText(/2 serial numbers listed but only 1 unit to create/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Serial numbers/)).toHaveAttribute('aria-invalid', 'true')

    setField(/^Units to create/, '201')
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))
    expect(await screen.findByText('Enter 0–200 units')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('when the units call fails the item still exists: the drawer opens on the Units tab with the error and the serials', async () => {
    unitsResponse = { ok: false, status: 409, body: { error: 'That QR label code is already assigned to another unit.' } }
    await renderPage()
    await openAddItem()
    setField(/^Name/, 'GPS unit')
    fireEvent.click(screen.getByLabelText('Serialized Item'))
    setField(/^Units to create/, '2')
    setField(/^Serial numbers/, 'GPS-001\nGPS-002')
    await pick(/Category/, 'Instruments')
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))

    await waitFor(() => expect(postsTo('/api/inventory/i-new/units')).toHaveLength(1))
    // The form closes (the item exists — resubmitting would duplicate it) …
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add item' })).toBeNull())
    // … and the new item's drawer opens on Units with a visible, specific error.
    expect(await screen.findByRole('heading', { name: 'GPS unit' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Units/ })).toHaveAttribute('aria-selected', 'true')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('The item was added, but its 2 units could not be created (That QR label code is already assigned to another unit.)')
    expect(alert).toHaveTextContent('serials: GPS-001, GPS-002')
    // No misleading "added" success toast alongside the error.
    expect(screen.queryByText('GPS unit added')).toBeNull()
  })
})

describe('UXP-6 (6c): T5 — consumable stock always lands at a hub', () => {
  it('initial quantity > 0 with no hub is a field error on the hub and nothing is posted', async () => {
    await renderPage()
    await openAddItem()
    setField(/^Name/, 'Sample bags')
    await pick(/Category/, 'Sampling')
    expect(screen.getByLabelText(/^Initial Quantity/)).toHaveValue(1) // the existing default
    // Hub is marked required while the quantity is above 0.
    expect(screen.getByRole('combobox', { name: /Hub Location/ })).toBeRequired()
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))
    expect(await screen.findByText('Pick a hub — stock above 0 has to land at a hub')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Hub Location/ })).toHaveAttribute('aria-invalid', 'true')
    expect(writes).toHaveLength(0)

    // Picking a hub clears the error and the create goes through with the hub.
    await pick(/Hub Location/, 'Toledo Hub · Toledo, OH')
    expect(screen.queryByText('Pick a hub — stock above 0 has to land at a hub')).toBeNull()
    setField(/^Initial Quantity/, '20')
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))
    await waitFor(() => expect(postsTo('/api/inventory')).toHaveLength(1))
    expect(postsTo('/api/inventory')[0]!.body).toMatchObject({ itemType: 'CONSUMABLE', hubId: 'h1', quantity: 20 })
  })

  it('keeps the "Unknown" hub default when the quantity is 0', async () => {
    await renderPage()
    await openAddItem()
    setField(/^Name/, 'Sample bags')
    await pick(/Category/, 'Sampling')
    setField(/^Initial Quantity/, '0')
    expect(screen.getByRole('combobox', { name: /Hub Location/ })).not.toBeRequired()
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))
    await waitFor(() => expect(postsTo('/api/inventory')).toHaveLength(1))
    expect(postsTo('/api/inventory')[0]!.body).toMatchObject({ quantity: 0 })
    expect(postsTo('/api/inventory')[0]!.body).not.toHaveProperty('hubId')
  })
})

describe('UXP-6 (6c): T6 — edit can clear a field', () => {
  it('opens as "Edit item" and sends null for the cleared supplier; hub and category stay set', async () => {
    listRows = [EXISTING]
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const dlg = await screen.findByRole('dialog', { name: 'Edit item' })
    expect(within(dlg).getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(within(dlg).queryByRole('button', { name: 'Save & add another' })).toBeNull()
    expect(screen.getByRole('combobox', { name: /Hub Location/ })).toHaveValue('Toledo Hub · Toledo, OH')
    // No quantity field on edit — totals are managed per hub / in the Units tab.
    expect(screen.queryByLabelText(/^Initial Quantity/)).toBeNull()
    expect(screen.getByText('40 total (managed per hub — use Stock by Hub below)')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Purchasing Info'))
    expect(screen.getByLabelText(/^Supplier/)).toHaveValue('Acme')
    setField(/^Supplier/, '')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes).toHaveLength(1))
    const patch = writes[0]!
    expect(patch.method).toBe('PATCH')
    expect(patch.url).toBe('/api/inventory/i-1')
    expect(patch.body).toMatchObject({ name: 'Sample bags', itemType: 'CONSUMABLE', categoryId: 'c1', hubId: 'h1', supplier: null })
    expect(patch.body.unitCost).toBe(2.5) // untouched fields keep their values
    expect(patch.body).toMatchObject({ expectedQuantity: null, lowStockThreshold: null, reorderUrl: null, notes: null })
    // Nothing the strict PATCH whitelist rejects.
    expect(patch.body).not.toHaveProperty('quantity')
    expect(patch.body).not.toHaveProperty('unitId')
    expect(await screen.findByText('Sample bags updated')).toBeInTheDocument()
  })
})

describe('UXP-6 (6c): Save & add another + the Open action', () => {
  it('Save & add another keeps type / category / hub, clears the rest, and stays open', async () => {
    await renderPage()
    await openAddItem()
    setField(/^Name/, 'Sample bags')
    await pick(/Category/, 'Sampling')
    await pick(/Hub Location/, 'Toledo Hub · Toledo, OH')
    setField(/^Initial Quantity/, '5')
    setField(/^Notes/, 'first batch')
    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }))

    await waitFor(() => expect(postsTo('/api/inventory')).toHaveLength(1))
    expect(postsTo('/api/inventory')[0]!.body).toMatchObject({ name: 'Sample bags', hubId: 'h1', categoryId: 'c1', quantity: 5, notes: 'first batch' })
    expect(await screen.findByText('Sample bags added')).toBeInTheDocument()

    const dlg = screen.getByRole('dialog', { name: 'Add item' })
    expect(dlg).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toHaveValue('')
    expect(screen.getByLabelText(/^Notes/)).toHaveValue('')
    expect(screen.getByLabelText(/^Initial Quantity/)).toHaveValue(1)
    expect(screen.getByLabelText('Consumable')).toBeChecked()
    expect(screen.getByRole('combobox', { name: /Category/ })).toHaveValue('Sampling')
    expect(screen.getByRole('combobox', { name: /Hub Location/ })).toHaveValue('Toledo Hub · Toledo, OH')

    // The re-based form is clean: Cancel closes without "Discard changes?".
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add item' })).toBeNull())
    expect(screen.queryByText('Discard changes?')).toBeNull()
  })

  it('the success toast has an Open action that opens the new item\'s drawer', async () => {
    await renderPage()
    await openAddItem()
    setField(/^Name/, 'GPS unit')
    fireEvent.click(screen.getByLabelText('Serialized Item'))
    setField(/^Units to create/, '1')
    await pick(/Category/, 'Instruments')
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Add item' }))

    const open = await screen.findByRole('button', { name: 'Open' })
    fireEvent.click(open)
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/inventory/i-new'))
    expect(await screen.findByRole('heading', { name: 'GPS unit' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true')
  })

  it('a dirty form asks "Discard changes?" on Cancel', async () => {
    await renderPage()
    await openAddItem()
    setField(/^Name/, 'GPS unit')
    fireEvent.click(within(dialog('Add item')).getByRole('button', { name: 'Cancel' }))
    const confirm = await screen.findByRole('dialog', { name: 'Discard changes?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep editing' }))
    // Still open, nothing lost.
    expect(await screen.findByRole('dialog', { name: 'Add item' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toHaveValue('GPS unit')
  })
})
