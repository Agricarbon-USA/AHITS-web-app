import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { toPickerOptions } from '@/lib/inventory-options'

// PR-1b (L-2 / L-16): what a picker does once the catalog outgrows one read.
//
// The bug: every picker fetched `/api/inventory?pageSize=100|200`, which
// `parsePagination` clamps to 100. Item 101 onward could not be packed,
// reserved, scheduled or field-fixed — and typing its name said "No options",
// because the filtering was client-side over a list that never contained it.
//
// So: when the server says the option set is `truncated`, the picker stops
// filtering the array it was handed and asks the server instead; and when the
// read FAILS it says so with a retry, rather than rendering an empty list that
// reads as an empty catalog and stays empty for the rest of the session.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/deployments',
  useSearchParams: () => new URLSearchParams(),
}))

const LOCAL = [
  { value: 'a', label: 'Auger' },
  { value: 'b', label: 'Bag' },
]
/** The item past the old 100-cap: present on the server, absent from `options`. */
const REMOTE_ONLY = { value: 'z', label: 'Zinc probe' }

function Harness({ truncated, loadFailed, load }: {
  truncated?: boolean
  loadFailed?: boolean
  load?: (q: string) => Promise<{ value: string; label: string }[]>
}) {
  const [value, setValue] = React.useState('')
  const [retries, setRetries] = React.useState(0)
  return (
    <div>
      <span data-testid="value">{value}</span>
      <span data-testid="retries">{retries}</span>
      <SearchableSelect
        label="Item"
        value={value}
        onChange={setValue}
        options={LOCAL}
        truncated={truncated}
        loadFailed={loadFailed}
        onRetry={() => setRetries((n) => n + 1)}
        loadOptions={load}
      />
    </div>
  )
}

const openAndType = async (text: string) => {
  const input = screen.getByRole('combobox', { name: /Item/ })
  fireEvent.mouseDown(input)
  fireEvent.change(input, { target: { value: text } })
}

beforeEach(() => { vi.useRealTimers() })
afterEach(() => { vi.restoreAllMocks() })

describe('SearchableSelect — server search past the cap (PR-1b)', () => {
  it('stays a plain client-filtered picker when the set is complete', async () => {
    const load = vi.fn(async () => [REMOTE_ONLY])
    render(<Harness truncated={false} load={load} />)
    await openAndType('Zinc')
    // No server call, and no "keep typing" promise it is not keeping.
    await waitFor(() => expect(screen.queryByText(/keep typing/)).not.toBeInTheDocument())
    expect(load).not.toHaveBeenCalled()
  })

  it('searches the SERVER when the set is truncated, and finds an item not in `options`', async () => {
    const load = vi.fn(async (q: string) =>
      q ? [REMOTE_ONLY].filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : LOCAL)
    render(<Harness truncated load={load} />)

    await openAndType('Zinc')
    await waitFor(() => expect(load).toHaveBeenCalledWith('Zinc'), { timeout: 3000 })
    // "Zinc probe" was never in `options` — under the old client filter this was
    // the "No options" dead end.
    expect(await screen.findByRole('option', { name: 'Zinc probe' })).toBeInTheDocument()
  })

  it('tells the reader the list is partial — "Showing the first N — keep typing"', async () => {
    const load = vi.fn(async () => LOCAL)
    render(<Harness truncated load={load} />)
    expect(await screen.findByText(/Showing the first \d+ — keep typing/)).toBeInTheDocument()
  })

  it('debounces: a burst of keystrokes is one server call, for the final query', async () => {
    const queries: string[] = []
    const load = vi.fn(async (q: string) => { queries.push(q); return [REMOTE_ONLY] })
    render(<Harness truncated load={load} />)
    const input = screen.getByRole('combobox', { name: /Item/ })
    fireEvent.mouseDown(input)
    for (const v of ['Z', 'Zi', 'Zin', 'Zinc']) fireEvent.change(input, { target: { value: v } })
    await waitFor(() => expect(queries).toContain('Zinc'), { timeout: 3000 })
    // The intermediate keystrokes never reached the server.
    expect(queries).not.toContain('Zi')
    expect(queries).not.toContain('Zin')
  })

  it('a failed load offers a retry instead of an empty list (L-16)', async () => {
    render(<Harness loadFailed />)
    expect(screen.getByText('Could not load the list.')).toBeInTheDocument()
    // Not an empty picker that looks like an empty catalog.
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByTestId('retries')).toHaveTextContent('1')
  })
})

describe('toPickerOptions — the wire-to-picker adapter (PR-1b)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'i1', name: 'Manual Corer', itemType: 'SERIALIZED',
    categoryId: 'c1', categoryName: 'Sampling',
    pickableUnits: [{ id: 'u3', serialNumber: null, qrCodeId: 'q3', status: 'AVAILABLE', position: 3 }],
    availableQuantity: 0, availableByHub: [], ...over,
  })

  it('keeps the SERVER position — the picker never renumbers (UXP-6 T8)', () => {
    const { options } = toPickerOptions({ data: [row()] })
    // Units 1-2 are out; the free one is still "Unit 3". The old client-side
    // recount over AVAILABLE units alone relabelled it "Unit 1".
    expect(options[0]!.availableUnits[0]!.position).toBe(3)
  })

  it('derives unitCounts.available from the pickable set, so the two cannot drift', () => {
    const { options } = toPickerOptions({ data: [row()] })
    expect(options[0]!.unitCounts.available).toBe(1)
    expect(options[0]!.quantity).toBe(1)
  })

  it('carries a consumable’s available quantity and per-hub stock through', () => {
    const { options } = toPickerOptions({
      data: [row({
        itemType: 'CONSUMABLE', pickableUnits: [], availableQuantity: 40,
        availableByHub: [{ hubId: 'h1', hubName: 'Toledo', quantity: 42, reservedQty: 2, available: 40 }],
      })],
    })
    expect(options[0]!.availableQuantity).toBe(40)
    expect(options[0]!.quantity).toBe(40)
    expect(options[0]!.hubStock[0]!.available).toBe(40)
  })

  it('reports a non-envelope body as FAILED, not as an empty catalog (L-16)', () => {
    expect(toPickerOptions(null).failed).toBe(true)
    expect(toPickerOptions({ error: 'Unauthorized' }).failed).toBe(true)
    // …and a real, genuinely empty response is NOT a failure.
    expect(toPickerOptions({ data: [] })).toEqual({ options: [], truncated: false, failed: false })
  })

  it('passes the server’s `truncated` flag through to the picker', () => {
    expect(toPickerOptions({ data: [row()], truncated: true }).truncated).toBe(true)
    expect(toPickerOptions({ data: [row()] }).truncated).toBe(false)
  })
})
