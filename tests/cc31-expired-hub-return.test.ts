import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { POST as adminReceive } from '../src/app/api/status-links/[id]/receive/route'
import { applyTransition, resolveStatusLinkById } from '../src/lib/status-links'
import { prisma } from '../src/lib/prisma'
import {
  createAdminUser,
  adminSession,
  createHub,
  createCategory,
  createInventoryItem,
  createInventoryUnit,
} from './helpers/fixtures'

// CC-31 item 3 (review §3.5): an expired HUB_RETURN link jammed both confirm paths —
// the unit sat IN_TRANSIT forever because admin Mark-received reused the recipient's
// expiry gate. Admin authority now supersedes link EXPIRY only (never the REVOKED/
// COMPLETED state gate), while the public /s/[token] path keeps the full gate.

let mockSession: { userId: string; role: string; name?: string; email?: string } | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

describe('CC-31 §3.5: expired HUB_RETURN — admin receive bypasses expiry, public path does not', () => {
  it('public transition 409s on an expired link; admin receive flips the unit AVAILABLE', async () => {
    const admin = await createAdminUser()
    const hub = await createHub()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED' })
    const unit = await createInventoryUnit(item.id, { status: 'IN_TRANSIT' })
    const link = await prisma.statusLink.create({
      data: {
        type: 'HUB_RETURN',
        state: 'ISSUED',
        tokenHash: `test-${randomUUID()}`,
        expiresAt: new Date(Date.now() - 86_400_000), // expired yesterday
        inventoryUnitId: unit.id,
        hubId: hub.id,
        createdById: admin.id,
      },
    })

    // Public path (no bypass): the expired link must still refuse — 409, no state change.
    const resolved = await resolveStatusLinkById(link.id)
    const pub = await applyTransition(resolved!, { action: 'RECEIVED', actorLabel: 'hub' })
    expect(pub.ok).toBe(false)
    if (!pub.ok) expect(pub.status).toBe(409)
    expect((await prisma.inventoryUnit.findUnique({ where: { id: unit.id } }))?.status).toBe('IN_TRANSIT')

    // Admin receive (bypassExpiry): 200, unit IN_TRANSIT → AVAILABLE, link COMPLETED.
    mockSession = adminSession(admin.id)
    const res = await adminReceive(
      new NextRequest(`http://localhost/api/status-links/${link.id}/receive`, { method: 'POST' }),
      { params: Promise.resolve({ id: link.id }) },
    )
    expect(res.status).toBe(200)
    expect((await prisma.inventoryUnit.findUnique({ where: { id: unit.id } }))?.status).toBe('AVAILABLE')
    expect((await prisma.statusLink.findUnique({ where: { id: link.id } }))?.state).toBe('COMPLETED')
  })

  it('admin receive still refuses a REVOKED link (state gate is never bypassed)', async () => {
    const admin = await createAdminUser()
    const hub = await createHub()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'SERIALIZED' })
    const unit = await createInventoryUnit(item.id, { status: 'IN_TRANSIT' })
    const link = await prisma.statusLink.create({
      data: {
        type: 'HUB_RETURN',
        state: 'REVOKED', // e.g. superseded by a reissue
        tokenHash: `test-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
        inventoryUnitId: unit.id,
        hubId: hub.id,
        createdById: admin.id,
      },
    })
    mockSession = adminSession(admin.id)
    const res = await adminReceive(
      new NextRequest(`http://localhost/api/status-links/${link.id}/receive`, { method: 'POST' }),
      { params: Promise.resolve({ id: link.id }) },
    )
    expect(res.status).toBe(409)
    expect((await prisma.inventoryUnit.findUnique({ where: { id: unit.id } }))?.status).toBe('IN_TRANSIT')
  })
})
