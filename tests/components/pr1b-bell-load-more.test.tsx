import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NotificationBell } from '@/components/shared/NotificationBell'

// PR-1b (L-5): the bell badge counted EVERY unread row while the list showed at
// most 30 — so past 30 the two disagreed and nothing explained the gap. PR-1a put
// the honest numbers on the wire (`total`, `truncated`); this is the bell reading
// them: it says what it is showing, and Load more reaches the rest.

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/admin/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))

const TOTAL = 73
const UNREAD = 38
const PAGE = 30

const rows = (page: number) => {
  const start = (page - 1) * PAGE
  const count = Math.max(0, Math.min(PAGE, TOTAL - start))
  return Array.from({ length: count }).map((_, i) => ({
    id: `n-${start + i}`,
    type: 'DAILY_CHECK_MISSED',
    title: `Notification ${start + i}`,
    body: null,
    link: null,
    readAt: start + i < UNREAD ? null : '2026-10-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
  }))
}

const urls: string[] = []
const fetchMock = vi.fn((input: RequestInfo | URL) => {
  const url = String(input)
  urls.push(url)
  const page = Number(new URL(url, 'http://localhost').searchParams.get('page') ?? '1')
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ data: rows(page), total: TOTAL, page, pageSize: PAGE, truncated: page * PAGE < TOTAL, unread: UNREAD }),
  } as Response)
})

beforeEach(() => {
  urls.length = 0
  push.mockClear()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

const openBell = async () => {
  render(<NotificationBell />)
  await waitFor(() => expect(urls.length).toBeGreaterThan(0))
  fireEvent.click(screen.getByRole('button', { name: /Notifications/i }))
}

describe('NotificationBell — badge and list agree (PR-1b)', () => {
  it('shows the unread badge and says exactly what the list holds', async () => {
    await openBell()
    expect(await screen.findByText('38')).toBeInTheDocument()
    // The sentence that closes the gap between "38" and the 30 rows below it.
    expect(await screen.findByText(`${UNREAD} unread · showing ${PAGE} of ${TOTAL}`)).toBeInTheDocument()
  })

  it('offers Load more, naming how many are left', async () => {
    await openBell()
    expect(await screen.findByRole('button', { name: `Load more (${TOTAL - PAGE} left)` })).toBeInTheDocument()
  })

  it('Load more appends the next page rather than replacing the list', async () => {
    await openBell()
    await screen.findByText('Notification 0')
    fireEvent.click(await screen.findByRole('button', { name: /Load more/ }))

    await waitFor(() => expect(urls.some((u) => u.includes('page=2'))).toBe(true))
    // Page 2's rows arrived …
    expect(await screen.findByText('Notification 30')).toBeInTheDocument()
    // … and page 1's are still there.
    expect(screen.getByText('Notification 0')).toBeInTheDocument()
    expect(screen.getByText(`${UNREAD} unread · showing 60 of ${TOTAL}`)).toBeInTheDocument()
  })

  it('stops offering Load more once the list is complete', async () => {
    await openBell()
    fireEvent.click(await screen.findByRole('button', { name: /Load more/ }))
    await screen.findByText('Notification 30')
    fireEvent.click(await screen.findByRole('button', { name: /Load more/ }))
    await screen.findByText('Notification 60')

    // 73 of 73 — nothing is being withheld, so nothing claims to be.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument())
    expect(screen.queryByText(/unread · showing/)).not.toBeInTheDocument()
  })

  it('asks for the page size it renders, so "showing N" is never a guess', async () => {
    await openBell()
    expect(urls[0]).toContain(`pageSize=${PAGE}`)
    expect(urls[0]).toContain('page=1')
  })
})
