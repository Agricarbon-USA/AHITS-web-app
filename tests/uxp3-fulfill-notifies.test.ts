import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from '../src/app/api/deployment-requests/[id]/route'
import { prisma } from '../src/lib/prisma'
import {
  createOperator, createAdminUser, operatorSession, adminSession,
  createHub, createCategory, createInventoryItem, seedInventoryStock,
} from './helpers/fixtures'
import { createRequest, applyRequestTransition, setLineFulfillment } from '../src/lib/deployment-requests'

// UXP-3 (3c / F-04): admin "Mark Handled" on a REQUESTED MATERIAL request is the
// `fulfill` action. It used to fall through the post-transition chain and notify
// nobody — the requester learned by texting. It now writes the same row the
// FORWARDED→`complete` arm always wrote. The status-guarded UPDATE upstream is what
// keeps it single-fire (a replay is 409 before the notification arm), and the
// RESERVATION `fulfill` (stock-moving, D9) must NOT say "handled".

let mockSession: object | null = null
vi.mock('../src/lib/auth/session', () => ({
  getSession: () => Promise.resolve(mockSession),
  requireAuth: () => Promise.resolve(mockSession),
  requireAdmin: () =>
    Promise.resolve((mockSession as { role?: string } | null)?.role === 'ADMIN' ? mockSession : null),
}))

function patchReq(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/deployment-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const HANDLED_TITLE = 'Your material request was handled'

async function makeMaterialRequest(requestedById: string, label: string | null = 'Sample vials') {
  return createRequest(
    {
      requestType: 'MATERIAL',
      status: 'REQUESTED',
      label,
      lines: [{ lineType: 'NEW_PURCHASE', description: 'Test item', requestedQty: 1 }],
    },
    requestedById,
  )
}

/** The rows the operator's bell would show for this close. */
async function handledRowsFor(userId: string) {
  return prisma.notification.findMany({
    where: { userId, type: 'RESERVATION_UPDATE', title: HANDLED_TITLE },
    orderBy: { createdAt: 'desc' },
  })
}

describe('UXP-3 (3c): MATERIAL fulfill notifies the requester', () => {
  it('admin fulfill on a REQUESTED MATERIAL request → 200 and exactly one "handled" notification', async () => {
    const admin = await createAdminUser()
    const requester = await createOperator()
    const requestId = await makeMaterialRequest(requester.id, 'Sample vials')

    mockSession = adminSession(admin.id)
    const res = await PATCH(patchReq(requestId, { action: 'fulfill' }), {
      params: Promise.resolve({ id: requestId }),
    })
    expect(res.status).toBe(200)

    const rows = await handledRowsFor(requester.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe(HANDLED_TITLE)
    expect(rows[0]!.body).toContain('Sample vials')
    // 3c rider: a handled request lives on the operator's Closed tab.
    expect(rows[0]!.link).toBe('/operator/requests?tab=closed')
  })

  it('a replayed fulfill → 409 (STATE_MISMATCH) and still exactly one notification', async () => {
    const admin = await createAdminUser()
    const requester = await createOperator()
    const requestId = await makeMaterialRequest(requester.id)

    mockSession = adminSession(admin.id)
    const first = await PATCH(patchReq(requestId, { action: 'fulfill' }), {
      params: Promise.resolve({ id: requestId }),
    })
    expect(first.status).toBe(200)

    const replay = await PATCH(patchReq(requestId, { action: 'fulfill' }), {
      params: Promise.resolve({ id: requestId }),
    })
    expect(replay.status).toBe(409)

    expect(await handledRowsFor(requester.id)).toHaveLength(1)
  })

  it('RESERVATION fulfill (STAGED at a hub, stock-moving) never says "handled" (D9)', async () => {
    const admin = await createAdminUser()
    const requester = await createOperator()
    const hub = await createHub()
    const cat = await createCategory()
    const item = await createInventoryItem(cat.id, { itemType: 'CONSUMABLE', quantity: 10 })
    await seedInventoryStock(item.id, hub.id, 10)

    const requestId = await createRequest(
      {
        requestType: 'RESERVATION',
        status: 'REQUESTED',
        fulfillerHubId: hub.id,
        lines: [{ lineType: 'KIT_ITEM', itemType: 'CONSUMABLE', requestedQty: 2, specificInventoryItemId: item.id }],
      },
      requester.id,
    )
    const lineRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "deployment_request_lines" WHERE "requestId" = ${requestId}
    `
    for (const { id } of lineRows) {
      await setLineFulfillment(id, { status: 'CONFIRMED', actor: { label: 'test' } })
    }
    // REQUESTED → STAGED (writes its own "Reservation staged" notification — not counted here).
    expect(await applyRequestTransition(requestId, 'confirm', 'RESERVATION')).toEqual({ ok: true })

    mockSession = adminSession(admin.id)
    const res = await PATCH(patchReq(requestId, { action: 'fulfill' }), {
      params: Promise.resolve({ id: requestId }),
    })
    expect(res.status).toBe(200)

    expect(await handledRowsFor(requester.id)).toHaveLength(0)
  })

  it('an operator cannot fulfill (admin-only) → 403 and no notification', async () => {
    const requester = await createOperator()
    const requestId = await makeMaterialRequest(requester.id)

    mockSession = operatorSession(requester.id)
    const res = await PATCH(patchReq(requestId, { action: 'fulfill' }), {
      params: Promise.resolve({ id: requestId }),
    })
    expect(res.status).toBe(403)

    expect(await handledRowsFor(requester.id)).toHaveLength(0)
  })
})
