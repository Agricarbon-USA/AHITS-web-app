import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { TableCell, TableRow } from '@mui/material'
import { useListQuery } from '@/hooks/useListQuery'
import { PagedTable } from '@/components/ui/PagedTable'

// PR-1a (RC-2 / D-h): the two primitives that make a list tell the truth.
//
//  useListQuery — the page index is the hook's, and it is RESET the moment the
//  filter set changes (showing page 4 of a freshly-filtered list is how a
//  non-empty result renders as "nothing here"); a page-size change goes back to
//  page 1 rather than to an index that may no longer exist; and
//  `reload({ bypassCache: true })` goes out as `cache: 'reload'` so the service
//  worker's NetworkFirst cache cannot hand an admin back the pre-mutation page.
//
//  PagedTable — the caption and the rows-per-page options, both read from the
//  server's numbers rather than from however many rows happened to arrive.

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/admin/inventory',
  useSearchParams: () => new URLSearchParams(),
}))

type Row = { id: string; name: string }

let body: Record<string, unknown> = { data: [], total: 0 }
const calls: { url: string; init?: RequestInit }[] = []
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ url: String(input), init })
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
})

function Harness({ category }: { category: string }) {
  const q = useListQuery<Row>({
    endpoint: '/api/inventory',
    params: { categoryId: category || undefined },
  })
  return (
    <div>
      <span data-testid="page">{q.page}</span>
      <span data-testid="pageSize">{q.pageSize}</span>
      <span data-testid="total">{q.total}</span>
      <span data-testid="truncated">{String(q.truncated)}</span>
      <span data-testid="facet">{String((q.extra.facets as { damage?: number } | undefined)?.damage ?? '-')}</span>
      <button onClick={() => q.setPage(2)}>go page 3</button>
      <button onClick={() => q.setPageSize(25)}>25 per page</button>
      <button onClick={() => void q.reload({ bypassCache: true })}>reload hard</button>
      <button onClick={() => void q.reload()}>reload soft</button>
    </div>
  )
}

const lastUrl = () => calls[calls.length - 1]!.url
const urlsFor = (needle: string) => calls.filter((c) => c.url.includes(needle)).map((c) => c.url)

beforeEach(() => {
  calls.length = 0
  replace.mockClear()
  body = { data: [{ id: 'i1', name: 'Manual Corer' }], total: 160 }
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useListQuery (PR-1a)', () => {
  it('asks for page 1 at pageSize 100 by default, and exposes the server total', async () => {
    render(<Harness category="" />)
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('160'))
    expect(lastUrl()).toBe('/api/inventory?page=1&pageSize=100')
    expect(screen.getByTestId('pageSize')).toHaveTextContent('100')
  })

  it('a page change refetches that page and mirrors it into the URL (1-based)', async () => {
    render(<Harness category="" />)
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('160'))
    fireEvent.click(screen.getByText('go page 3'))
    await waitFor(() => expect(lastUrl()).toBe('/api/inventory?page=3&pageSize=100'))
    expect(screen.getByTestId('page')).toHaveTextContent('2')
    expect(replace).toHaveBeenCalledWith('/admin/inventory?page=3', { scroll: false })
  })

  it('resets to page 1 when the filter set changes — and never fetches the old page under the new filter', async () => {
    const { rerender } = render(<Harness category="" />)
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('160'))
    fireEvent.click(screen.getByText('go page 3'))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('2'))

    rerender(<Harness category="c1" />)
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('0'))
    const filtered = urlsFor('categoryId=c1')
    expect(filtered.length).toBeGreaterThan(0)
    // Every read under the new filter is page 1 — not page 3 of a list that no
    // longer has one. (L-4: the regrouped page that looked like the whole thing.)
    for (const url of filtered) expect(url).toContain('page=1')
  })

  it('a page-size change refetches with page=1', async () => {
    render(<Harness category="" />)
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('160'))
    fireEvent.click(screen.getByText('go page 3'))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('2'))

    fireEvent.click(screen.getByText('25 per page'))
    await waitFor(() => expect(lastUrl()).toBe('/api/inventory?page=1&pageSize=25'))
    expect(screen.getByTestId('page')).toHaveTextContent('0')
  })

  it("reload({ bypassCache: true }) fetches with cache: 'reload'; a plain reload does not (L-11)", async () => {
    render(<Harness category="" />)
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('160'))

    fireEvent.click(screen.getByText('reload hard'))
    await waitFor(() => expect(calls[calls.length - 1]!.init).toEqual({ cache: 'reload' }))

    fireEvent.click(screen.getByText('reload soft'))
    await waitFor(() => expect(calls.length).toBeGreaterThan(2))
    expect(calls[calls.length - 1]!.init).toBeUndefined()
  })

  it('carries `truncated` and any extra envelope keys (facets) through untouched', async () => {
    body = { data: [], total: 40, truncated: true, facets: { damage: 7 } }
    render(<Harness category="" />)
    await waitFor(() => expect(screen.getByTestId('truncated')).toHaveTextContent('true'))
    expect(screen.getByTestId('facet')).toHaveTextContent('7')
  })

  it('falls back to the row count when a response carries no total (bare-array routes)', async () => {
    body = { data: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }
    render(<Harness category="" />)
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'))
    expect(screen.getByTestId('truncated')).toHaveTextContent('false')
  })
})

describe('PagedTable (PR-1a)', () => {
  const head = <TableRow><TableCell>Name</TableCell></TableRow>
  const rows = (n: number, from = 0) =>
    Array.from({ length: n }).map((_, i) => (
      <TableRow key={from + i}><TableCell>{`row ${from + i}`}</TableCell></TableRow>
    ))

  const renderTable = (props: Partial<React.ComponentProps<typeof PagedTable>> = {}, n = 3) =>
    render(
      <PagedTable
        head={head}
        colSpan={1}
        total={160}
        page={0}
        pageSize={100}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        itemNoun="items"
        {...props}
      >
        {rows(n)}
      </PagedTable>,
    )

  it('captions the real range against the real total', () => {
    renderTable()
    expect(screen.getByText('Showing 1–100 of 160 items')).toBeInTheDocument()
  })

  it('captions the last page by the total, not by the page size', () => {
    renderTable({ page: 1, total: 160 })
    expect(screen.getByText('Showing 101–160 of 160 items')).toBeInTheDocument()
  })

  it('offers 25 / 50 / 100 rows per page', () => {
    renderTable()
    fireEvent.mouseDown(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['25', '50', '100'])
  })

  it('offers first- and last-page jumps, so page 1 of 160 is one tap from the end', () => {
    renderTable()
    expect(screen.getByLabelText(/first page/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last page/i)).toBeInTheDocument()
  })

  it('says so when the list is truncated and there is no further page', () => {
    renderTable({ total: 50, truncated: true, pageSize: 50 })
    expect(screen.getByText(/This list is capped/)).toBeInTheDocument()
  })

  it('stays quiet about truncation while there are more pages to turn', () => {
    renderTable({ total: 160, truncated: true, pageSize: 100, page: 0 })
    expect(screen.queryByText(/This list is capped/)).not.toBeInTheDocument()
  })

  it('shows the empty message only when there are genuinely no rows', () => {
    const { container } = render(
      <PagedTable
        head={head}
        colSpan={1}
        total={0}
        page={0}
        pageSize={100}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        emptyMessage="No items found."
      >
        {false}
        {[]}
      </PagedTable>,
    )
    expect(screen.getByText('No items found.')).toBeInTheDocument()
    expect(screen.getByText('No rows to show')).toBeInTheDocument()
    expect(within(container).queryByText(/^row /)).not.toBeInTheDocument()
  })
})
