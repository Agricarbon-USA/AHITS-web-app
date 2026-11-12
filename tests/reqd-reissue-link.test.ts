import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { POST as reissue } from '../src/app/api/status-links/[id]/reissue/route'
import { hashToken } from '../src/lib/status-links'
import { prisma } from '../src/lib/prisma'
import {
  createAdminUser,
  adminSession,
  createHub,
  createCategory,
  createInventoryItem,
  createInventoryUnit,
} from './helpers/fixtures'

// REQ-D fix 2: Hubs → Inbound "Copy link" gives the same link a new address. The row,
// its state, its discrepancy flag and its history stay (it used to revoke the link and
// make a new one, so a Discrepancy row fell back to "Awaiting receipt"). A received or
// dismissed link gets no new live address.

let mockSession: { userId: string; role: string; name?: string; email?: string } | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

async function hubReturnLink(state: 'ACTED' | 'REVOKED', expiresAt: Date) {
  const admin = await createAdminUser()
  const hub = await createHub()
  const cat = await createCategory()
  const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED' })
  const unit = await createInventoryUnit(item.id, { status: 'IN_TRANSIT' })
  const link = await prisma.statusLink.create({
    data: {
      type: 'HUB_RETURN',
      state,
      tokenHash: `test-${randomUUID()}`,
      expiresAt,
      inventoryUnitId: unit.id,
      hubId: hub.id,
      createdById: admin.id,
    },
  })
  mockSession = adminSession(admin.id)
  return { link, unit }
}

function post(id: string) {
  return reissue(
    new NextRequest(`http://localhost/api/status-links/${id}/reissue`, { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  )
}

describe('REQ-D fix 2: Copy link keeps the row and its Discrepancy flag', () => {
  it('an expired ACTED link with a DISCREPANCY gets a new address on the same row', async () => {
    const { link, unit } = await hubReturnLink('ACTED', new Date(Date.now() - 86_400_000))
    await prisma.statusLinkEvent.create({
      data: { statusLinkId: link.id, action: 'DISCREPANCY', note: 'One short', actorLabel: 'hub' },
    })

    const res = await post(link.id)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.url).toBe('string')
    const token = body.url.split('/s/').pop() as string

    const after = await prisma.statusLink.findUnique({ where: { id: link.id } })
    expect(after?.state).toBe('ACTED')
    expect(after?.tokenHash).toBe(hashToken(token))
    expect(after!.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(await prisma.statusLink.count({ where: { inventoryUnitId: unit.id } })).toBe(1)
    expect(await prisma.statusLinkEvent.count({ where: { statusLink: { inventoryUnitId: unit.id } } })).toBe(1)
  })

  it('a REVOKED (dismissed) link answers 409 and is left as it was', async () => {
    const { link, unit } = await hubReturnLink('REVOKED', new Date(Date.now() + 86_400_000))

    const res = await post(link.id)
    expect(res.status).toBe(409)
    expect((await prisma.statusLink.findUnique({ where: { id: link.id } }))?.tokenHash).toBe(link.tokenHash)
    expect(await prisma.statusLink.count({ where: { inventoryUnitId: unit.id } })).toBe(1)
  })
})
